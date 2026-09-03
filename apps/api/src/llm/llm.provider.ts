import type { MessageRole } from '@portfolio/shared';

export interface LlmMessage {
  role: MessageRole;
  content: string;
}

/**
 * LLM 스트리밍 추상화. 구현체는 텍스트 chunk를 순서대로 yield하고,
 * signal이 abort되면 가능한 한 빨리 종료해야 한다.
 */
export interface LlmProvider {
  stream(messages: LlmMessage[], signal: AbortSignal): AsyncIterable<string>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
