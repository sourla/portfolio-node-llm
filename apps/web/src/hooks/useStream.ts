import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamEvent } from '@portfolio/shared';
import { openStream } from '../api/client';

export interface StreamState {
  /** 지금까지 누적된 assistant 텍스트. 스트림 중이 아니면 '' */
  text: string;
  streaming: boolean;
  error: string | null;
}

export type StreamFinished = (messageId: number, finalText: string, aborted: boolean) => void;

/**
 * messageId의 SSE 스트림을 열어 chunk를 누적한다.
 * stop()은 EventSource를 닫는다. 서버는 그 시점까지 받은 내용을 partial로 저장한다.
 *
 * 렌더 중에 바뀌는 값을 ref로 들고 있다가 콜백에서 읽지 않는다. StrictMode가 updater를
 * 두 번 호출하면 두 번째 호출 때 ref가 이미 바뀌어 있을 수 있다. 그래서 messageId를 콜백 인자로 넘긴다.
 */
export function useStream(onFinished: StreamFinished) {
  const [state, setState] = useState<StreamState>({ text: '', streaming: false, error: null });
  const sourceRef = useRef<EventSource | null>(null);
  const messageIdRef = useRef<number | null>(null);
  const textRef = useRef('');
  const finishRef = useRef(onFinished);
  finishRef.current = onFinished;

  const close = useCallback((aborted: boolean) => {
    const source = sourceRef.current;
    const messageId = messageIdRef.current;
    if (!source || messageId === null) return;
    source.close();
    sourceRef.current = null;
    messageIdRef.current = null;
    setState((s) => ({ ...s, streaming: false }));
    finishRef.current(messageId, textRef.current, aborted);
  }, []);

  const start = useCallback(
    (messageId: number) => {
      close(true);
      textRef.current = '';
      messageIdRef.current = messageId;
      setState({ text: '', streaming: true, error: null });
      const source = openStream(messageId);
      sourceRef.current = source;
      source.onmessage = (ev: MessageEvent<string>) => {
        const event = JSON.parse(ev.data) as StreamEvent;
        if (event.type === 'chunk') {
          textRef.current += event.text;
          setState((s) => ({ ...s, text: textRef.current }));
        } else if (event.type === 'done') {
          close(false);
        } else {
          setState((s) => ({ ...s, error: event.message }));
          close(false);
        }
      };
      source.onerror = () => {
        setState((s) => ({ ...s, error: s.error ?? 'connection lost' }));
        close(true);
      };
    },
    [close],
  );

  const stop = useCallback(() => close(true), [close]);

  useEffect(() => () => sourceRef.current?.close(), []);

  return { ...state, start, stop };
}
