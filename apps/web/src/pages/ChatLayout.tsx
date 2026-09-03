import { NavLink, Outlet, redirect, useLoaderData, useNavigate, useRevalidator } from 'react-router-dom';
import type { ConversationDto, UserDto } from '@portfolio/shared';
import { api, ApiError } from '../api/client';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';

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
    <div className="grid h-svh grid-cols-[260px_1fr]">
      <aside className="flex flex-col gap-3 border-r bg-muted/40 p-3">
        <header className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate" title={user.email}>
            {user.email}
          </span>
          <div className="flex shrink-0 items-center">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={logout}>
              로그아웃
            </Button>
          </div>
        </header>
        <Button onClick={newChat}>+ 새 대화</Button>
        <Separator />
        <nav aria-label="conversations" className="flex flex-col gap-1 overflow-y-auto">
          {conversations.length === 0 && <p className="px-2 text-sm text-muted-foreground">대화가 없습니다</p>}
          {conversations.map((c) => (
            <NavLink
              key={c.id}
              to={`/chat/${c.id}`}
              className={({ isActive }) =>
                cn(
                  'truncate rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
            >
              {c.title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="flex min-w-0 flex-col">
        <Outlet context={{ revalidate: revalidator.revalidate }} />
      </section>
    </div>
  );
}

export function ChatIndex() {
  return (
    <div className="m-auto text-center text-muted-foreground">
      <p>왼쪽에서 대화를 고르거나 새 대화를 시작하세요.</p>
    </div>
  );
}
