import { IsEmail, IsString, MinLength } from 'class-validator';
import type { LoginRequest, RegisterRequest } from '@portfolio/shared';

export class RegisterDto implements RegisterRequest {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class LoginDto implements LoginRequest {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
