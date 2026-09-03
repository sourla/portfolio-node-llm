import { NavLink, Outlet, redirect, useLoaderData, useNavigate, useRevalidator } from 'react-router-dom';
import type { ConversationDto, UserDto } from '@portfolio/shared';
import { api, ApiError } from '../api/client';

export interface ChatLayoutData {
  user: UserDto;
  conversations: ConversationDto[];
}

/** 미인증이면 /login으로. 인증되면 사용자와 대화 목록을 함께 로드. */
export async function chatLayoutLoader({ request }: { request: Request }): Promise<ChatLayoutData | Response> {
  try {
    const [{ user }, conversations] = await Promise.all([api.me(), api.listConversations()]);
    return { user, conversations };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const from = new URL(request.url).pathname;
      return redirect(`/login?from=${encodeURIComponent(from)}`);
    }
    throw err;
  }
}

export function ChatLayout() {
  const { user, conversations } = useLoaderData() as ChatLayoutData;
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  async function newChat() {
    const conv = await api.createConversation();
    revalidator.revalidate();
    navigate(`/chat/${conv.id}`);
  }

  async function logout() {
    await api.logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="chat-layout">
      <aside>
        <header>
          <span title={user.email}>{user.email}</span>
          <button onClick={logout}>로그아웃</button>
        </header>
        <button className="new-chat" onClick={newChat}>
          + 새 대화
        </button>
        <nav aria-label="conversations">
          {conversations.length === 0 && <p className="muted">대화가 없습니다</p>}
          {conversations.map((c) => (
            <NavLink key={c.id} to={`/chat/${c.id}`}>
              {c.title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="chat-main">
        <Outlet context={{ revalidate: revalidator.revalidate }} />
      </section>
    </div>
  );
}

export function ChatIndex() {
  return (
    <div className="empty">
      <p>왼쪽에서 대화를 고르거나 새 대화를 시작하세요.</p>
    </div>
  );
}
