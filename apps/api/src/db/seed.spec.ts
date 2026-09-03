import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { join } from 'path';
import * as schema from './schema';
import { seedDemoUser } from './seed';

describe('seedDemoUser', () => {
  async function freshDb() {
    const db = drizzle(createClient({ url: 'file::memory:' }), { schema });
    await migrate(db, { migrationsFolder: join(__dirname, '..', '..', 'drizzle') });
    return db;
  }

  it('creates the user once and is idempotent on second run', async () => {
    const db = await freshDb();
    await seedDemoUser(db, { email: 'seed@x.io', password: 'pw123456' });
    await seedDemoUser(db, { email: 'seed@x.io', password: 'pw123456' });
    const rows = await db.query.users.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash).not.toBe('pw123456');
  });

  it('does nothing when email/password are not configured', async () => {
    const db = await freshDb();
    await seedDemoUser(db, {});
    expect(await db.query.users.findMany()).toHaveLength(0);
  });
});
