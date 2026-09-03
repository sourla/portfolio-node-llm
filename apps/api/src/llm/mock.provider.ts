import type { LlmMessage, LlmProvider } from './llm.provider';

export interface MockProviderOptions {
  /** chunk 사이 지연(ms). 테스트에서는 0~1로 둔다. */
  delayMs?: number;
}

/**
 * 키 없이 동작하는 mock. 마지막 사용자 메시지를 단어 단위 chunk로 되돌려준다.
 * 응답이 입력에 따라 달라지므로 동시 스트림이 섞이지 않는지 검증할 수 있다.
 */
export class MockLlmProvider implements LlmProvider {
  private readonly delayMs: number;

  constructor(opts: MockProviderOptions = {}) {
    this.delayMs = opts.delayMs ?? 40;
  }

  static reply(messages: LlmMessage[]): string {
    const last = [...messages].reverse().find((m) => m.role === 'user');
    return `(mock) You said: ${last?.content ?? ''}`;
  }

  async *stream(messages: LlmMessage[], signal: AbortSignal): AsyncIterable<string> {
    const tokens = MockLlmProvider.reply(messages).split(/(?<=\s)/);
    for (const token of tokens) {
      if (signal.aborted) return;
      await sleep(this.delayMs, signal);
      if (signal.aborted) return;
      yield token;
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      signal.removeEventListener('abort', done);
      clearTimeout(t);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}
