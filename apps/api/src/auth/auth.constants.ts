export const AUTH_COOKIE = 'token';
export const JWT_EXPIRES_IN = '7d';
export const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface JwtPayload {
  sub: number;
  email: string;
}
