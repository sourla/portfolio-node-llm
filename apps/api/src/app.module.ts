import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, AuthModule, ChatModule],
  controllers: [AppController],
})
export class AppModule {}
