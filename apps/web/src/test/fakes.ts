import { vi } from 'vitest';

type Handler = (init: RequestInit, url: URL) => { status: number; body?: unknown };

/** 경로별 응답 테이블로 fetch를 대체한다. 키: "METHOD /path" */
export function stubFetch(routes: Record<string, Handler | { status: number; body?: unknown }>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname}`;
    calls.push({ method, path: url.pathname, body: init.body ? JSON.parse(init.body as string) : undefined });
    const route = routes[key];
    if (!route) throw new Error(`unstubbed fetch: ${key}`);
    const { status, body } = typeof route === 'function' ? route(init, url) : route;
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

/** EventSource 대체. 테스트가 emit()으로 서버 이벤트를 흘리고 close 여부를 확인한다. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static get last() {
    return FakeEventSource.instances.at(-1)!;
  }
  static reset() {
    FakeEventSource.instances = [];
  }

  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;

  constructor(
    public readonly url: string,
    public readonly init?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this);
  }

  emit(event: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
  }

  close() {
    this.closed = true;
  }
}

export function stubEventSource() {
  FakeEventSource.reset();
  vi.stubGlobal('EventSource', FakeEventSource);
}
