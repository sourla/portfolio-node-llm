import '@testing-library/jest-dom/vitest';

/**
 * jsdom은 자체 AbortController/AbortSignal을 전역에 올리는데, Node(undici)의 Request는
 * 모듈 로드 시점의 Node AbortSignal만 인정한다. react-router의 data router가 loader용 Request를
 * 만들 때 이 조합으로 TypeError가 나므로 테스트에서는 signal을 버린다. loader 취소는 테스트 대상이 아니다.
 */
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init ? { ...init, signal: undefined } : init);
  }
} as typeof Request;
