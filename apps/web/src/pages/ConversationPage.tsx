import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLoaderData, useOutletContext, useParams } from 'react-router-dom';
import type { MessageDto } from '@portfolio/shared';
import { api } from '../api/client';
import { useStream } from '../hooks/useStream';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export async function conversationLoader({ params }: { params: { conversationId?: string } }): Promise<MessageDto[]> {
  return api.listMessages(Number(params.conversationId));
}

export function ConversationPage() {
  const conversationId = Number(useParams().conversationId);
  const initial = useLoaderData() as MessageDto[];
  const { revalidate } = useOutletContext<{ revalidate: () => void }>();
  const [messages, setMessages] = useState<MessageDto[]>(initial);
  const [draft, setDraft] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const stream = useStream((messageId, finalText, aborted) => {
    // 스트림이 끝나면 임시 assistant 항목을 확정 상태로 바꾼다
    setMessages((ms) =>
      ms.map((m) => (m.id === messageId ? { ...m, content: finalText, status: aborted ? 'partial' : 'complete' } : m)),
    );
    setPendingId(null);
    revalidate(); // 첫 메시지 뒤 제목이 바뀌었을 수 있음
  });

  // 대화가 바뀔 때만 loader 결과로 리셋한다. 같은 대화에서의 revalidate(제목 갱신)는 로컬 상태를 덮지 않는다.
  useEffect(() => {
    setMessages(initial);
    setPendingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, stream.text]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || stream.streaming) return;
    setDraft('');
    const now = new Date().toISOString();
    const { messageId } = await api.sendMessage(conversationId, { content });
    setMessages((ms) => [
      ...ms,
      { id: messageId - 1, conversationId, role: 'user', content, status: 'complete', createdAt: now },
      { id: messageId, conversationId, role: 'assistant', content: '', status: 'partial', createdAt: now },
    ]);
    setPendingId(messageId);
    stream.start(messageId);
  }

  return (
    <>
      <ol aria-label="messages" className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map((m) => {
          const isUser = m.role === 'user';
          const interrupted = m.status === 'partial' && m.id !== pendingId;
          return (
            <li key={m.id} data-status={m.status} className={cn('flex max-w-[70ch] flex-col gap-1', isUser ? 'self-end items-end' : 'items-start')}>
              <span className="text-xs text-muted-foreground">{isUser ? '나' : 'AI'}</span>
              <p
                className={cn(
                  'whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                  isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
                  m.status === 'partial' && 'border border-dashed border-muted-foreground/50',
                )}
              >
                {m.id === pendingId ? stream.text : m.content}
              </p>
              {interrupted && <small className="text-xs text-muted-foreground">(중단됨)</small>}
            </li>
          );
        })}
        <div ref={bottomRef} />
      </ol>
      {stream.error && (
        <p role="alert" className="px-4 text-sm text-destructive">
          {stream.error}
        </p>
      )}
      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="메시지를 입력하세요"
          aria-label="message"
          disabled={stream.streaming}
        />
        {stream.streaming ? (
          <Button type="button" variant="outline" onClick={stream.stop}>
            중단
          </Button>
        ) : (
          <Button type="submit" disabled={!draft.trim()}>
            전송
          </Button>
        )}
      </form>
    </>
  );
}
