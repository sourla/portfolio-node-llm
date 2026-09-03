export type MessageRole = 'user' | 'assistant';
export type MessageStatus = 'complete' | 'partial';

export interface UserDto {
  id: number;
  email: string;
}

export interface ConversationDto {
  id: number;
  title: string;
  createdAt: string;
}

export interface MessageDto {
  id: number;
  conversationId: number;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  messageId: number;
}

export type StreamEvent =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthMeResponse {
  user: UserDto;
}

export interface CreateConversationRequest {
  title?: string;
}
