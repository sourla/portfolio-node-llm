import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import type { Db } from './db.module';
import { users } from './schema';

export interface SeedOptions {
  email?: string;
  password?: string;
}

/** 시드 계정이 없으면 생성. 이미 있으면 아무것도 하지 않음(idempotent). */
export async function seedDemoUser(db: Db, opts: SeedOptions): Promise<void> {
  const { email, password } = opts;
  if (!email || !password) return;

  const exists = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (exists) return;

  await db.insert(users).values({
    email,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
  });
  console.log(`[seed] demo user created: ${email}`);
}
