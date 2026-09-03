import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { DbModule } from '../db/db.module';
import { AuthModule } from './auth.module';

describe('auth flow (e2e, in-memory sqlite)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.JWT_SECRET = 'e2e-secret';
    process.env.SEED_EMAIL = 'demo@example.com';
    process.env.SEED_PASSWORD = 'demo1234';
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), DbModule, AuthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('seed account exists on boot and can log in', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'demo@example.com', password: 'demo1234' }).expect(200);
    await agent.get('/auth/me').expect(200).expect((res) => {
      expect(res.body.user.email).toBe('demo@example.com');
    });
  });

  it('register → me works with cookie; me without cookie is 401', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/register')
      .send({ email: 'u@example.com', password: 'password123' })
      .expect(201)
      .expect((res) => {
        expect(res.headers['set-cookie'][0]).toMatch(/^token=.*HttpOnly/);
        expect(res.body.user.email).toBe('u@example.com');
      });

    await agent.get('/auth/me').expect(200).expect((res) => {
      expect(res.body.user.email).toBe('u@example.com');
    });

    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('login rejects wrong password, accepts right one, logout clears cookie', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'u@example.com', password: 'nope-nope' }).expect(401);
    await agent.post('/auth/login').send({ email: 'u@example.com', password: 'password123' }).expect(200);
    await agent.get('/auth/me').expect(200);
    await agent.post('/auth/logout').expect(204);
    await agent.get('/auth/me').expect(401);
  });

  it('rejects duplicate email and invalid body', async () => {
    const http = app.getHttpServer();
    await request(http).post('/auth/register').send({ email: 'u@example.com', password: 'password123' }).expect(409);
    await request(http).post('/auth/register').send({ email: 'not-an-email', password: 'short' }).expect(400);
  });
});
