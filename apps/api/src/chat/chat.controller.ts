import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseIntPipe,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { ConversationDto, MessageDto, SendMessageResponse, UserDto } from '@portfolio/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChatService } from './chat.service';
import { CreateConversationDto, SendMessageDto } from './chat.dto';

@Controller()
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  list(@CurrentUser() user: UserDto): Promise<ConversationDto[]> {
    return this.chat.listConversations(user.id);
  }

  @Post('conversations')
  create(@CurrentUser() user: UserDto, @Body() dto: CreateConversationDto): Promise<ConversationDto> {
    return this.chat.createConversation(user.id, dto.title);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<MessageDto[]> {
    return this.chat.listMessages(user.id, id);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
  ): Promise<SendMessageResponse> {
    return this.chat.sendMessage(user.id, id, dto.content);
  }

  @Sse('messages/:id/stream')
  async stream(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Observable<MessageEvent>> {
    const msg = await this.chat.assertStreamable(user.id, id);
    return this.chat.stream(msg).pipe(map((data) => ({ data })));
  }
}
