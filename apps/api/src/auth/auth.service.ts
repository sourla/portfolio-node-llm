import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { UserDto } from '@portfolio/shared';
import { UsersService } from '../users/users.service';
import type { JwtPayload } from './auth.constants';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<UserDto> {
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('email already registered');
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const row = await this.users.create(email, passwordHash);
    return { id: row.id, email: row.email };
  }

  async validate(email: string, password: string): Promise<UserDto> {
    const row = await this.users.findByEmail(email);
    if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
      throw new UnauthorizedException('invalid credentials');
    }
    return { id: row.id, email: row.email };
  }

  signToken(user: UserDto): string {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwt.sign(payload);
  }
}
