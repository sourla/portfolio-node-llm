# portfolio-node-llm

LLM 스트리밍 채팅 미니 서비스. 포트폴리오용으로 GitHub 공개, 로컬 실행 데모.

심사 포인트: SSE 스트리밍, 인증 가드, 대화 영속화, 동시 접속 안정성, 양쪽 테스트.

## 구조

pnpm workspace. 그 이상의 모노레포 도구는 쓰지 않는다.

| 경로 | 스택 | 상태 |
|---|---|---|
| `apps/api` | NestJS + TypeScript, SQLite(libsql) + Drizzle | 인증·채팅·SSE·mock LLM 완료 |
| `apps/web` | React + React Router + TypeScript + Vite | 스캐폴드만 |
| `packages/shared` | API DTO/타입만 공유 | 완료 |

## 실행

요구사항: Node 22 이상, pnpm 8. 그 외 설치할 것 없음. SQLite는 파일 DB라 별도 서버가 없고, 네이티브 빌드도 없다(`@libsql/client`가 prebuilt 바이너리를 가져온다).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # 키 없이 mock LLM으로 동작
pnpm --filter @portfolio/api dev          # http://localhost:3000
```

첫 기동 때 `DATABASE_PATH` 위치에 `data.db`가 생기고 `apps/api/drizzle/`의 마이그레이션이 자동 적용된다. `SEED_EMAIL`/`SEED_PASSWORD`가 설정돼 있으면 시드 계정을 한 번만 만든다(기본 `demo@example.com` / `demo1234`).

```bash
pnpm test        # 전체 워크스페이스
pnpm typecheck
pnpm build
```

## apps/api

### 환경 변수 (`apps/api/.env.example`)

| 키 | 기본 | 설명 |
|---|---|---|
| `PORT` | 3000 | |
| `WEB_ORIGIN` | http://localhost:5173 | CORS 허용 origin, credentials 포함 |
| `JWT_SECRET` | | 필수 |
| `DATABASE_PATH` | ./data.db | `:memory:` 가능 (테스트에서 사용) |
| `LLM_PROVIDER` | mock | `mock`만 구현. gemini는 예정 |
| `GEMINI_API_KEY` | | 예정 |
| `SEED_EMAIL`, `SEED_PASSWORD` | | 둘 다 있을 때만 시드 계정 생성 |

### 인증

- 이메일/비밀번호. bcrypt 해시, JWT를 `token` httpOnly 쿠키(SameSite=Lax, 7일)로 발급.
- `AuthGuard`가 쿠키의 JWT를 검증해 `req.user`에 붙이고, `@CurrentUser()`로 꺼낸다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/auth/register` | `{ email, password }` → 201, 쿠키 발급 |
| POST | `/auth/login` | 200, 쿠키 발급. 실패 401 |
| POST | `/auth/logout` | 204, 쿠키 제거 |
| GET | `/auth/me` | 가드. `{ user }` |

### DB

SQLite(WAL) + Drizzle. 스키마는 `src/db/schema.ts`, 마이그레이션은 `drizzle/`.

- `users`: id, email(unique), password_hash, created_at
- `conversations`: id, user_id → users, title, created_at
- `messages`: id, conversation_id → conversations, role(`user`|`assistant`), content, status(`complete`|`partial`), created_at

스키마를 바꾸면 `npx drizzle-kit generate`로 마이그레이션을 새로 만든다.

### 채팅 (모두 가드)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/conversations` | 내 대화 목록, 최신순 |
| POST | `/conversations` | `{ title? }`. 생략하면 "New chat", 첫 메시지 앞 40자로 자동 교체 |
| GET | `/conversations/:id/messages` | 메시지 목록. 남의 대화는 404 |
| POST | `/conversations/:id/messages` | `{ content }`. 사용자 메시지 저장 + assistant `partial` row 생성 → `{ messageId }` |
| GET | `/messages/:id/stream` | SSE. 아래 참고 |

스트림 흐름:

1. `POST .../messages`로 `messageId`를 받는다.
2. `GET /messages/:id/stream`을 EventSource로 연다. 이벤트 `data`는 JSON:
   `{ type: "chunk", text }` 반복 → `{ type: "done" }`. 실패 시 `{ type: "error", message }`.
3. 끝까지 받으면 서버가 content를 확정하고 `status=complete`.
4. 클라이언트가 연결을 끊으면 서버는 AbortController로 LLM 호출을 중단하고, 그때까지 받은 내용을 `status=partial`로 저장한다.
5. 같은 메시지를 다시 스트림하면 409. 남의 메시지는 404.

소유권·상태 검사는 SSE 헤더를 보내기 전에 끝내므로 실패는 일반 HTTP 에러로 온다.

### LLM provider

`src/llm/llm.provider.ts`의 `LlmProvider` 인터페이스 하나. 구현체는 chunk를 순서대로 yield하고 `AbortSignal`에 반응해야 한다.

- `MockLlmProvider`: 키 없이 동작. 마지막 사용자 메시지를 단어 단위 chunk로 되돌려 준다. 응답이 입력에 따라 달라지므로 동시 스트림이 섞이지 않는지 검증할 수 있다.
- Gemini: 예정. `LLM_PROVIDER=gemini` + `GEMINI_API_KEY`.

### 테스트

`pnpm --filter @portfolio/api test` (Jest, in-memory SQLite).

- `*.spec.ts`: 단위. `*.e2e-spec.ts`: supertest/실제 HTTP 통합. 둘 다 소스 옆에 둔다.
- 커버: AuthGuard 통과/차단/만료, 시드 idempotent, mock chunk 순서, 클라이언트 disconnect → partial 저장, 동시 스트림 2개 격리, 이전 메시지가 LLM history로 전달, 소유권/상태 검사, e2e 전체 흐름.

`tsconfig.json`은 spec을 포함(IDE·typecheck용), `tsconfig.build.json`은 spec 제외(`nest build`가 기본으로 사용).

## 범위 밖

RAG/검색, 배포, CI, 소셜 로그인, 마크다운 렌더링, 대화 공유.

## 진행

- [x] shared 타입
- [x] api 인증
- [x] api 채팅 + mock 스트림
- [x] api 테스트
- [ ] web 로그인
- [ ] web 채팅
- [ ] web 테스트
- [ ] Gemini 연결
- [ ] 브라우저 3개 동시 수동 확인
