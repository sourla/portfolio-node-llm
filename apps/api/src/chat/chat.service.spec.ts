import { ConflictException, NotFoundException } from '@nestjs/common';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { join } from 'path';
import type { StreamEvent } from '@portfolio/shared';
import * as schema from '../db/schema';
import { users } from '../db/schema';
import { MockLlmProvider } from '../llm/mock.provider';
import { ChatService } from './chat.service';

async function setup() {
  const db = drizzle(createClient({ url: 'file::memory:' }), { schema });
  await migrate(db, { migrationsFolder: join(__dirname, '..', '..', 'drizzle') });
  const [alice] = await db.insert(users).values({ email: 'a@x.io', passwordHash: 'h', createdAt: 't' }).returning();
  const [bob] = await db.insert(users).values({ email: 'b@x.io', passwordHash: 'h', createdAt: 't' }).returning();
  const service = new ChatService(db, new MockLlmProvider({ delayMs: 1 }));
  return { db, service, alice, bob };
}

/** 스트림을 구독해 이벤트를 모은다. stopAfterChunks가 있으면 그만큼 받고 구독을 끊는다(클라이언트 disconnect 흉내). */
function subscribe(service: ChatService, msg: Parameters<ChatService['stream']>[0], stopAfterChunks?: number) {
  return new Promise<StreamEvent[]>((resolve, reject) => {
    const events: StreamEvent[] = [];
    const sub = service.stream(msg).subscribe({
      next: (e) => {
        events.push(e);
        if (stopAfterChunks && events.filter((x) => x.type === 'chunk').length >= stopAfterChunks) {
          sub.unsubscribe();
          resolve(events);
        }
      },
      error: reject,
      complete: () => resolve(events),
    });
  });
}

describe('ChatService', () => {
  it('sendMessage stores the user message, creates a partial assistant row, and titles the conversation', async () => {
    const { service, alice } = await setup();
    const conv = await service.createConversation(alice.id);
    expect(conv.title).toBe('New chat');

    const { messageId } = await service.sendMessage(alice.id, conv.id, 'What is SSE?');
    const list = await service.listMessages(alice.id, conv.id);
    expect(list.map((m) => [m.role, m.status])).toEqual([
      ['user', 'complete'],
      ['assistant', 'partial'],
    ]);
    expect(list[1].id).toBe(messageId);
    expect((await service.listConversations(alice.id))[0].title).toBe('What is SSE?');
  });

  it('streams chunks in order and persists the assistant message as complete', async () => {
    const { service, alice } = await setup();
    const conv = await service.createConversation(alice.id);
    const { messageId } = await service.sendMessage(alice.id, conv.id, 'one two three');
    const msg = await service.assertStreamable(alice.id, messageId);

    const events = await subscribe(service, msg);
    const chunks = events.filter((e): e is { type: 'chunk'; text: string } => e.type === 'chunk');
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(chunks.map((c) => c.text).join('')).toBe('(mock) You said: one two three');

    await service.settled(messageId);
    const saved = (await service.listMessages(alice.id, conv.id))[1];
    expect(saved).toMatchObject({ status: 'complete', content: '(mock) You said: one two three' });
  });

  it('on client disconnect aborts the LLM and saves what was received as partial', async () => {
    const { service, alice } = await setup();
    const conv = await service.createConversation(alice.id);
    const { messageId } = await service.sendMessage(alice.id, conv.id, 'alpha beta gamma delta epsilon');
    const msg = await service.assertStreamable(alice.id, messageId);

    const events = await subscribe(service, msg, 2);
    expect(events).toHaveLength(2);
    await service.settled(messageId);

    const saved = (await service.listMessages(alice.id, conv.id))[1];
    expect(saved.status).toBe('partial');
    expect(saved.content).toBe('(mock) You ');
    expect(saved.content.length).toBeLessThan('(mock) You said: alpha beta gamma delta epsilon'.length);
  });

  it('two concurrent streams do not leak chunks into each other', async () => {
    const { service, alice } = await setup();
    const c1 = await service.createConversation(alice.id);
    const c2 = await service.createConversation(alice.id);
    const m1 = await service.assertStreamable(alice.id, (await service.sendMessage(alice.id, c1.id, 'apple apple apple')).messageId);
    const m2 = await service.assertStreamable(alice.id, (await service.sendMessage(alice.id, c2.id, 'kiwi kiwi kiwi kiwi')).messageId);

    const [e1, e2] = await Promise.all([subscribe(service, m1), subscribe(service, m2)]);
    const text = (es: StreamEvent[]) => es.map((e) => (e.type === 'chunk' ? e.text : '')).join('');
    expect(text(e1)).toBe('(mock) You said: apple apple apple');
    expect(text(e2)).toBe('(mock) You said: kiwi kiwi kiwi kiwi');

    await Promise.all([service.settled(m1.id), service.settled(m2.id)]);
    expect((await service.listMessages(alice.id, c1.id))[1].content).toBe('(mock) You said: apple apple apple');
    expect((await service.listMessages(alice.id, c2.id))[1].content).toBe('(mock) You said: kiwi kiwi kiwi kiwi');
  });

  it('feeds prior completed messages as history to the LLM', async () => {
    const { service, alice } = await setup();
    const conv = await service.createConversation(alice.id);
    const first = await service.sendMessage(alice.id, conv.id, 'first');
    await subscribe(service, await service.assertStreamable(alice.id, first.messageId));
    await service.settled(first.messageId);

    const second = await service.sendMessage(alice.id, conv.id, 'second');
    const events = await subscribe(service, await service.assertStreamable(alice.id, second.messageId));
    expect(events.map((e) => (e.type === 'chunk' ? e.text : '')).join('')).toBe('(mock) You said: second');
    expect(await service.listMessages(alice.id, conv.id)).toHaveLength(4);
  });

  it('assertStreamable rejects foreign, non-pending, and in-progress messages', async () => {
    const { service, alice, bob } = await setup();
    const conv = await service.createConversation(alice.id);
    const { messageId } = await service.sendMessage(alice.id, conv.id, 'hi');

    await expect(service.assertStreamable(bob.id, messageId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assertStreamable(alice.id, messageId - 1)).rejects.toBeInstanceOf(ConflictException); // user row
    await expect(service.assertStreamable(alice.id, 9999)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listMessages(bob.id, conv.id)).rejects.toBeInstanceOf(NotFoundException);

    const msg = await service.assertStreamable(alice.id, messageId);
    const done = subscribe(service, msg);
    await expect(service.assertStreamable(alice.id, messageId)).rejects.toBeInstanceOf(ConflictException);
    await done;
    await service.settled(messageId);
    await expect(service.assertStreamable(alice.id, messageId)).rejects.toBeInstanceOf(ConflictException); // now complete
  });
});
