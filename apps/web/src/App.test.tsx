import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter } from './router';
import { FakeEventSource, stubEventSource, stubFetch } from './test/fakes';

const user = { id: 1, email: 'demo@example.com' };
const unauth = { status: 401, body: { message: 'missing token' } };

/** 개발 모드와 같은 조건(StrictMode 이중 호출)으로 렌더한다 */
function renderAt(path: string) {
  return render(
    <StrictMode>
      <RouterProvider router={createTestRouter([path])} />
    </StrictMode>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('auth routing', () => {
  it('redirects unauthenticated users from /chat to /login', async () => {
    stubFetch({ 'GET /auth/me': unauth, 'GET /conversations': unauth });
    renderAt('/chat/3');
    expect(await screen.findByRole('form', { name: 'login form' })).toBeInTheDocument();
  });

  it('logs in and enters /chat', async () => {
    let authed = false;
    stubFetch({
      'POST /auth/login': (init) => {
        const body = JSON.parse(init.body as string);
        if (body.password !== 'demo1234') return { status: 401, body: { message: 'invalid credentials' } };
        authed = true;
        return { status: 200, body: { user } };
      },
      'GET /auth/me': () => (authed ? { status: 200, body: { user } } : unauth),
      'GET /conversations': () => (authed ? { status: 200, body: [{ id: 9, title: 'earlier', createdAt: 't' }] } : unauth),
    });
    renderAt('/login');
    const u = userEvent.setup();

    await u.type(screen.getByLabelText('비밀번호'), 'wrong-pass');
    await u.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('이메일 또는 비밀번호가 틀렸습니다');

    await u.clear(screen.getByLabelText('비밀번호'));
    await u.type(screen.getByLabelText('비밀번호'), 'demo1234');
    await u.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByRole('navigation', { name: 'conversations' })).toBeInTheDocument();
    expect(screen.getByText('earlier')).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
  });
});

describe('conversation streaming', () => {
  function setupChat() {
    stubEventSource();
    return stubFetch({
      'GET /auth/me': { status: 200, body: { user } },
      'GET /conversations': { status: 200, body: [{ id: 3, title: 'New chat', createdAt: 't' }] },
      'GET /conversations/3/messages': { status: 200, body: [] },
      'POST /conversations/3/messages': { status: 201, body: { messageId: 42 } },
    });
  }

  it('accumulates streamed chunks into the assistant message and finalizes on done', async () => {
    const { calls } = setupChat();
    renderAt('/chat/3');
    const u = userEvent.setup();

    await u.type(await screen.findByLabelText('message'), 'hello');
    await u.click(screen.getByRole('button', { name: '전송' }));

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ content: 'hello' });
    const es = FakeEventSource.last;
    expect(es.url).toMatch(/\/messages\/42\/stream$/);
    expect(es.init?.withCredentials).toBe(true);

    act(() => es.emit({ type: 'chunk', text: 'Hel' }));
    act(() => es.emit({ type: 'chunk', text: 'lo ' }));
    act(() => es.emit({ type: 'chunk', text: 'there' }));
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('hello');
    expect(items[1]).toHaveTextContent('Hello there');
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();

    act(() => es.emit({ type: 'done' }));
    expect(es.closed).toBe(true);
    expect(items[1]).toHaveAttribute('data-status', 'complete');
    expect(items[1]).toHaveTextContent('Hello there');
    expect(screen.getByLabelText('message')).toBeEnabled();
  });

  it('stop closes the EventSource and keeps the partial text', async () => {
    setupChat();
    renderAt('/chat/3');
    const u = userEvent.setup();

    await u.type(await screen.findByLabelText('message'), 'long question');
    await u.click(screen.getByRole('button', { name: '전송' }));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const es = FakeEventSource.last;

    act(() => es.emit({ type: 'chunk', text: 'partial ' }));
    await u.click(screen.getByRole('button', { name: '중단' }));

    expect(es.closed).toBe(true);
    const assistant = screen.getAllByRole('listitem')[1];
    expect(assistant).toHaveAttribute('data-status', 'partial');
    expect(assistant).toHaveTextContent('partial');
    expect(assistant).toHaveTextContent('(중단됨)');
    expect(screen.getByRole('button', { name: '전송' })).toBeInTheDocument();

    // 닫힌 뒤 도착한 이벤트는 무시된다
    act(() => es.emit({ type: 'chunk', text: 'late' }));
    expect(assistant).not.toHaveTextContent('late');
  });
});
