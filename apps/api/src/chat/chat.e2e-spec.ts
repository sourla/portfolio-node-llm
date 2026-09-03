import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import http from 'http';
import request from 'supertest';
import type { StreamEvent } from '@portfolio/shared';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { ChatModule } from './chat.module';
import { ChatService } from './chat.service';

/** SSE 응답을 이벤트 배열로 파싱. stopAfterChunks가 있으면 그만큼 받고 소켓을 끊는다. */
function readSse(port: number, path: string, cookie: string, stopAfterChunks?: number) {
  return new Promise<{ status: number; events: StreamEvent[] }>((resolve, reject) => {
    const req = http.get({ port, path, headers: { Cookie: cookie, Accept: 'text/event-stream' } }, (res) => {
      const events: StreamEvent[] = [];
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d: string) => {
        buf += d;
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const data = block.split('\n').find((l) => l.startsWith('data:'));
          if (data) events.push(JSON.parse(data.slice(5).trim()));
        }
        if (stopAfterChunks && events.filter((e) => e.type === 'chunk').length >= stopAfterChunks) {
          req.destroy();
          resolve({ status: res.statusCode ?? 0, events });
        }
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, events }));
      res.on('error', reject);
    });
    req.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code !== 'ECONNRESET') reject(e);
    });
  });
}

describe('chat flow (e2e, in-memory sqlite, mock llm)', () => {
  let app: INestApplication;
  let port: number;
  let cookie: string;
  let chat: ChatService;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.JWT_SECRET = 'e2e-secret';
    process.env.LLM_PROVIDER = 'mock';
    delete process.env.SEED_EMAIL;
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), DbModule, AuthModule, ChatModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
    chat = app.get(ChatService);

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'c@example.com', password: 'password123' })
      .expect(201);
    cookie = res.headers['set-cookie'][0].split(';')[0];
  });

  afterAll(() => app.close());

  it('chat routes are guarded', async () => {
    const http = app.getHttpServer();
    await request(http).get('/conversations').expect(401);
    await request(http).post('/conversations').send({}).expect(401);
    await request(http).get('/messages/1/stream').expect(401);
  });

  it('create conversation → send → stream chunks in order → message persisted complete', async () => {
    const http = app.getHttpServer();
    const conv = (await request(http).post('/conversations').set('Cookie', cookie).send({}).expect(201)).body;
    const { messageId } = (
      await request(http).post(`/conversations/${conv.id}/messages`).set('Cookie', cookie).send({ content: 'ping pong' }).expect(201)
    ).body;

    const { status, events } = await readSse(port, `/messages/${messageId}/stream`, cookie);
    expect(status).toBe(200);
    expect(events.at(-1)).toEqual({ type: 'done' });
    const text = events.map((e) => (e.type === 'chunk' ? e.text : '')).join('');
    expect(text).toBe('(mock) You said: ping pong');

    const list = (await request(http).get(`/conversations/${conv.id}/messages`).set('Cookie', cookie).expect(200)).body;
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ role: 'assistant', status: 'complete', content: text });
    expect((await request(http).get('/conversations').set('Cookie', cookie).expect(200)).body[0].title).toBe('ping pong');

    await request(http).get(`/messages/${messageId}/stream`).set('Cookie', cookie).expect(409);
  });

  it('client disconnect mid-stream saves a partial message', async () => {
    const http = app.getHttpServer();
    const conv = (await request(http).post('/conversations').set('Cookie', cookie).send({ title: 'abort me' }).expect(201)).body;
    const { messageId } = (
      await request(http)
        .post(`/conversations/${conv.id}/messages`)
        .set('Cookie', cookie)
        .send({ content: 'a b c d e f g h i j k l m n o p' })
        .expect(201)
    ).body;

    const { events } = await readSse(port, `/messages/${messageId}/stream`, cookie, 3);
    expect(events).toHaveLength(3);
    await chat.settled(messageId);

    const list = (await request(http).get(`/conversations/${conv.id}/messages`).set('Cookie', cookie).expect(200)).body;
    expect(list[1].status).toBe('partial');
    expect(list[1].content.length).toBeGreaterThan(0);
    expect(list[1].content.length).toBeLessThan('(mock) You said: a b c d e f g h i j k l m n o p'.length);
  });

  it('rejects bad bodies and foreign/unknown conversations', async () => {
    const http = app.getHttpServer();
    await request(http).post('/conversations/1/messages').set('Cookie', cookie).send({ content: '' }).expect(400);
    await request(http).get('/conversations/9999/messages').set('Cookie', cookie).expect(404);
    await request(http).get('/messages/9999/stream').set('Cookie', cookie).expect(404);
  });
});
