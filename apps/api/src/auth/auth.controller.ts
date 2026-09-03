import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthMeResponse, UserDto } from '@portfolio/shared';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { LoginDto, RegisterDto } from './auth.dto';
import { AUTH_COOKIE, COOKIE_MAX_AGE_MS } from './auth.constants';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false,
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthMeResponse> {
    const user = await this.auth.register(dto.email, dto.password);
    this.setCookie(res, user);
    return { user };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthMeResponse> {
    const user = await this.auth.validate(dto.email, dto.password);
    this.setCookie(res, user);
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(AUTH_COOKIE, cookieOptions);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: UserDto): AuthMeResponse {
    return { user };
  }

  private setCookie(res: Response, user: UserDto): void {
    res.cookie(AUTH_COOKIE, this.auth.signToken(user), {
      ...cookieOptions,
      maxAge: COOKIE_MAX_AGE_MS,
    });
  }
}
