import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { join } from 'path';
import * as schema from './schema';
import { seedDemoUser } from './seed';

export const DB = Symbol('DB');
export type Db = ReturnType<typeof drizzle<typeof schema>>;

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<Db> => {
        const path = config.get<string>('DATABASE_PATH', './data.db');
        const client = createClient({ url: `file:${path}` });
        await client.execute('PRAGMA journal_mode = WAL');
        await client.execute('PRAGMA foreign_keys = ON');
        const db = drizzle(client, { schema });
        await migrate(db, { migrationsFolder: join(__dirname, '..', '..', 'drizzle') });
        await seedDemoUser(db, {
          email: config.get<string>('SEED_EMAIL'),
          password: config.get<string>('SEED_PASSWORD'),
        });
        return db;
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
