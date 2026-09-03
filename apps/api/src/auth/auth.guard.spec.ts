import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { AUTH_COOKIE } from './auth.constants';

function ctxWithCookies(cookies: Record<string, string>): ExecutionContext {
  const req: any = { cookies };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    _req: req,
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const guard = new AuthGuard(jwt);

  it('passes with a valid cookie token and attaches user', () => {
    const token = jwt.sign({ sub: 7, email: 'a@b.c' });
    const ctx = ctxWithCookies({ [AUTH_COOKIE]: token });
    expect(guard.canActivate(ctx)).toBe(true);
    expect((ctx as any)._req.user).toEqual({ id: 7, email: 'a@b.c' });
  });

  it('blocks when cookie is missing', () => {
    expect(() => guard.canActivate(ctxWithCookies({}))).toThrow(UnauthorizedException);
  });

  it('blocks when token is signed with another secret', () => {
    const other = new JwtService({ secret: 'wrong' });
    const token = other.sign({ sub: 1, email: 'x@y.z' });
    expect(() => guard.canActivate(ctxWithCookies({ [AUTH_COOKIE]: token }))).toThrow(
      UnauthorizedException,
    );
  });

  it('blocks when token is expired', () => {
    const token = jwt.sign({ sub: 1, email: 'x@y.z' }, { expiresIn: -1 });
    expect(() => guard.canActivate(ctxWithCookies({ [AUTH_COOKIE]: token }))).toThrow(
      UnauthorizedException,
    );
  });
});
