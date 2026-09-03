import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { Observable } from 'rxjs';
import type { ConversationDto, MessageDto, SendMessageResponse, StreamEvent } from '@portfolio/shared';
import { DB, type Db } from '../db/db.module';
import { conversations, messages } from '../db/schema';
import { LLM_PROVIDER, type LlmMessage, type LlmProvider } from '../llm/llm.provider';

const DEFAULT_TITLE = 'New chat';
const TITLE_MAX = 40;

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

@Injectable()
export class ChatService {
  /** 진행 중인 스트림. messageId → 영속화까지 끝나면 resolve되는 Promise */
  private readonly inflight = new Map<number, Promise<void>>();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async listConversations(userId: number): Promise<ConversationDto[]> {
    const rows = await this.db.query.conversations.findMany({
      where: eq(conversations.userId, userId),
      orderBy: desc(conversations.id),
    });
    return rows.map(toConversationDto);
  }

  async createConversation(userId: number, title?: string): Promise<ConversationDto> {
    const [row] = await this.db
      .insert(conversations)
      .values({ userId, title: title?.trim() || DEFAULT_TITLE, createdAt: now() })
      .returning();
    return toConversationDto(row);
  }

  async listMessages(userId: number, conversationId: number): Promise<MessageDto[]> {
    await this.ownedConversation(userId, conversationId);
    const rows = await this.db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: asc(messages.id),
    });
    return rows.map(toMessageDto);
  }

  /** 사용자 메시지 저장 + assistant partial row 생성. 스트림은 별도 GET으로 연다. */
  async sendMessage(userId: number, conversationId: number, content: string): Promise<SendMessageResponse> {
    const conv = await this.ownedConversation(userId, conversationId);

    const first = await this.db.query.messages.findFirst({
      where: eq(messages.conversationId, conversationId),
    });
    if (!first && conv.title === DEFAULT_TITLE) {
      await this.db
        .update(conversations)
        .set({ title: content.trim().slice(0, TITLE_MAX) })
        .where(eq(conversations.id, conversationId));
    }

    await this.db
      .insert(messages)
      .values({ conversationId, role: 'user', content, status: 'complete', createdAt: now() });
    const [assistant] = await this.db
      .insert(messages)
      .values({ conversationId, role: 'assistant', content: '', status: 'partial', createdAt: now() })
      .returning();
    return { messageId: assistant.id };
  }

  /**
   * 스트림을 열 수 있는지 검사(소유권·상태·중복). 컨트롤러가 SSE 헤더를 보내기 전에 호출해서
   * 실패를 일반 HTTP 에러로 돌려줄 수 있게 한다.
   */
  async assertStreamable(userId: number, messageId: number): Promise<MessageRow> {
    const msg = await this.db.query.messages.findFirst({ where: eq(messages.id, messageId) });
    if (!msg) throw new NotFoundException('message not found');
    await this.ownedConversation(userId, msg.conversationId);
    if (msg.role !== 'assistant' || msg.status !== 'partial' || msg.content !== '') {
      throw new ConflictException('message is not awaiting a stream');
    }
    if (this.inflight.has(messageId)) throw new ConflictException('stream already in progress');
    return msg;
  }

  /**
   * LLM chunk를 이벤트로 흘린다. 구독이 끊기면(클라이언트 연결 종료) LLM 호출을 abort하고
   * 그때까지 받은 내용을 partial로 저장한다. 끝까지 가면 complete로 확정한다.
   */
  stream(msg: MessageRow): Observable<StreamEvent> {
    return new Observable<StreamEvent>((subscriber) => {
      const ac = new AbortController();
      const run = this.run(msg, ac.signal, (e) => subscriber.next(e))
        .then(() => subscriber.complete())
        .catch((err) => subscriber.error(err))
        .finally(() => this.inflight.delete(msg.id));
      this.inflight.set(msg.id, run);
      return () => ac.abort();
    });
  }

  /** 테스트·종료 훅용: 해당 메시지의 스트림과 영속화가 끝날 때까지 대기 */
  settled(messageId: number): Promise<void> {
    return this.inflight.get(messageId) ?? Promise.resolve();
  }

  private async run(msg: MessageRow, signal: AbortSignal, emit: (e: StreamEvent) => void): Promise<void> {
    const history = await this.history(msg);
    let acc = '';
    try {
      for await (const chunk of this.llm.stream(history, signal)) {
        if (signal.aborted) break;
        acc += chunk;
        emit({ type: 'chunk', text: chunk });
      }
    } catch (err) {
      if (!signal.aborted) {
        await this.persist(msg.id, acc, 'partial');
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        return;
      }
    }
    if (signal.aborted) {
      await this.persist(msg.id, acc, 'partial');
      return;
    }
    await this.persist(msg.id, acc, 'complete');
    emit({ type: 'done' });
  }

  private async history(msg: MessageRow): Promise<LlmMessage[]> {
    const rows = await this.db.query.messages.findMany({
      where: and(
        eq(messages.conversationId, msg.conversationId),
        lt(messages.id, msg.id),
        eq(messages.status, 'complete'),
      ),
      orderBy: asc(messages.id),
    });
    return rows.map((r) => ({ role: r.role, content: r.content }));
  }

  private persist(messageId: number, content: string, status: 'complete' | 'partial'): Promise<unknown> {
    return this.db.update(messages).set({ content, status }).where(eq(messages.id, messageId));
  }

  private async ownedConversation(userId: number, conversationId: number): Promise<ConversationRow> {
    const row = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
    });
    if (!row) throw new NotFoundException('conversation not found');
    return row;
  }
}

function now(): string {
  return new Date().toISOString();
}

function toConversationDto(r: ConversationRow): ConversationDto {
  return { id: r.id, title: r.title, createdAt: r.createdAt };
}

function toMessageDto(r: MessageRow): MessageDto {
  return {
    id: r.id,
    conversationId: r.conversationId,
    role: r.role,
    content: r.content,
    status: r.status,
    createdAt: r.createdAt,
  };
}
