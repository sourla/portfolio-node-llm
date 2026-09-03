import { MockLlmProvider } from './mock.provider';

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe('MockLlmProvider', () => {
  const messages = [{ role: 'user' as const, content: 'hello there world' }];

  it('streams chunks whose concatenation is the full reply, in order', async () => {
    const chunks = await collect(new MockLlmProvider({ delayMs: 0 }).stream(messages, new AbortController().signal));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe('(mock) You said: hello there world');
  });

  it('stops promptly after abort', async () => {
    const ac = new AbortController();
    const chunks: string[] = [];
    for await (const c of new MockLlmProvider({ delayMs: 5 }).stream(messages, ac.signal)) {
      chunks.push(c);
      if (chunks.length === 2) ac.abort();
    }
    expect(chunks).toHaveLength(2);
  });
});
