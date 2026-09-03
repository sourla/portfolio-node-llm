import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserDto } from '@portfolio/shared';
import type { AuthedRequest } from './auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserDto =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
