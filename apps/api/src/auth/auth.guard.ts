import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { UserDto } from '@portfolio/shared';
import { AUTH_COOKIE, type JwtPayload } from './auth.constants';

export type AuthedRequest = Request & { user: UserDto };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) throw new UnauthorizedException('missing token');
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      req.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('invalid token');
    }
  }
}
