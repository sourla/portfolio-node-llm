import type { LlmMessage, LlmProvider } from './llm.provider';

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

/**
 * Google Gemini REST 스트리밍(`streamGenerateContent?alt=sse`). SDK 없이 fetch로 붙인다.
 * 응답은 SSE이고 각 `data:` 줄이 JSON chunk다. signal이 abort되면 fetch가 끊기고 반복이 끝난다.
 */
export class GeminiLlmProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GeminiProviderOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model || DEFAULT_GEMINI_MODEL;
    this.baseUrl = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async *stream(messages: LlmMessage[], signal: AbortSignal): AsyncIterable<string> {
    const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?alt=sse`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`gemini ${res.status}: ${await safeErrorMessage(res)}`);
    }

    for await (const data of sseData(res.body, signal)) {
      const chunk = JSON.parse(data) as GeminiChunk;
      if (chunk.error?.message) throw new Error(`gemini: ${chunk.error.message}`);
      if (chunk.promptFeedback?.blockReason) throw new Error(`gemini blocked: ${chunk.promptFeedback.blockReason}`);
      const text = chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (text) yield text;
    }
  }
}

/** SSE 바디에서 `data:` 페이로드만 순서대로 뽑는다. 빈 줄이 이벤트 경계. CRLF도 받는다. */
async function* sseData(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const drain = function* (flushTail: boolean) {
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = dataOf(block);
      if (data) yield data;
    }
    if (flushTail && buf.trim()) {
      const data = dataOf(buf);
      buf = '';
      if (data) yield data;
    }
  };
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      yield* drain(false);
    }
    if (!signal.aborted) {
      buf += decoder.decode().replace(/\r\n/g, '\n');
      yield* drain(true);
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

function dataOf(block: string): string {
  return block
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .join('\n');
}

async function safeErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
