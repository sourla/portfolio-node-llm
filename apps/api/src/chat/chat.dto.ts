import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { CreateConversationRequest, SendMessageRequest } from '@portfolio/shared';

export class CreateConversationDto implements CreateConversationRequest {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;
}

export class SendMessageDto implements SendMessageRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content: string;
}
