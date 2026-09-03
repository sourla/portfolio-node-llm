import { GeminiLlmProvider } from './gemini.provider';

function sseResponse(events: unknown[], status = 200, eol = '\n'): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // 일부러 이벤트 경계와 어긋나게 잘라 보내서 버퍼링을 검증한다
      const raw = events.map((e) => `data: ${JSON.stringify(e)}${eol}${eol}`).join('');
      for (let i = 0; i < raw.length; i += 7) controller.enqueue(encoder.encode(raw.slice(i, i + 7)));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const chunk = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe('GeminiLlmProvider', () => {
  const messages = [
    { role: 'user' as const, content: 'hi' },
    { role: 'assistant' as const, content: 'hello' },
    { role: 'user' as const, content: 'again' },
  ];

  it('maps roles, sends the api key header, and yields text parts in order', async () => {
    const fetchImpl = jest.fn(async () => sseResponse([chunk('Hel'), chunk('lo'), { candidates: [{ finishReason: 'STOP' }] }]));
    const provider = new GeminiLlmProvider({ apiKey: 'k', model: 'm', fetchImpl: fetchImpl as unknown as typeof fetch });

    const chunks = await collect(provider.stream(messages, new AbortController().signal));
    expect(chunks).toEqual(['Hel', 'lo']);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m:streamGenerateContent?alt=sse');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    expect(JSON.parse(init.body as string).contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
  });

  it('accepts CRLF framing (what Gemini actually sends) and a trailing event without blank line', async () => {
    const encoder = new TextEncoder();
    const raw = `data: ${JSON.stringify(chunk('A'))}\r\n\r\ndata: ${JSON.stringify(chunk('B'))}\r\n`;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode(raw));
        c.close();
      },
    });
    const fetchImpl = async () => new Response(body, { status: 200 });
    const provider = new GeminiLlmProvider({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await collect(provider.stream(messages, new AbortController().signal))).toEqual(['A', 'B']);
  });

  it('throws with the API error message on non-2xx', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 });
    const provider = new GeminiLlmProvider({ apiKey: 'bad', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(collect(provider.stream(messages, new AbortController().signal))).rejects.toThrow(
      'gemini 400: API key not valid',
    );
  });

  it('throws when the prompt is blocked', async () => {
    const fetchImpl = async () => sseResponse([{ promptFeedback: { blockReason: 'SAFETY' } }]);
    const provider = new GeminiLlmProvider({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(collect(provider.stream(messages, new AbortController().signal))).rejects.toThrow('gemini blocked: SAFETY');
  });

  it('passes the abort signal to fetch', async () => {
    const fetchImpl = jest.fn(async () => sseResponse([chunk('x')]));
    const provider = new GeminiLlmProvider({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    const ac = new AbortController();
    await collect(provider.stream(messages, ac.signal));
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(ac.signal);
  });
});
