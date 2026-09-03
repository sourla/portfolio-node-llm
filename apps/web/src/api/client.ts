import type {
  AuthMeResponse,
  ConversationDto,
  CreateConversationRequest,
  LoginRequest,
  MessageDto,
  SendMessageRequest,
  SendMessageResponse,
} from '@portfolio/shared';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      /* body가 JSON이 아니면 statusText 유지 */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

export const api = {
  me: () => apiFetch<AuthMeResponse>('/auth/me'),
  login: (body: LoginRequest) => post<AuthMeResponse>('/auth/login', body),
  logout: () => post<void>('/auth/logout'),
  listConversations: () => apiFetch<ConversationDto[]>('/conversations'),
  createConversation: (body: CreateConversationRequest = {}) => post<ConversationDto>('/conversations', body),
  listMessages: (conversationId: number) => apiFetch<MessageDto[]>(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: number, body: SendMessageRequest) =>
    post<SendMessageResponse>(`/conversations/${conversationId}/messages`, body),
};

export function openStream(messageId: number): EventSource {
  return new EventSource(`${API_URL}/messages/${messageId}/stream`, { withCredentials: true });
}
