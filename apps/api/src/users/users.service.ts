import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module';
import { users } from '../db/schema';

export type UserRow = typeof users.$inferSelect;

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findByEmail(email: string): Promise<UserRow | undefined> {
    return this.db.query.users.findFirst({ where: eq(users.email, email) });
  }

  findById(id: number): Promise<UserRow | undefined> {
    return this.db.query.users.findFirst({ where: eq(users.id, id) });
  }

  async create(email: string, passwordHash: string): Promise<UserRow> {
    const [row] = await this.db
      .insert(users)
      .values({ email, passwordHash, createdAt: new Date().toISOString() })
      .returning();
    return row;
  }
}
