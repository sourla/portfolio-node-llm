import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login({ email, password });
      const from = params.get('from');
      navigate(from && from.startsWith('/chat') ? from : '/chat', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? '이메일 또는 비밀번호가 틀렸습니다' : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-svh grid place-items-center bg-muted/40 p-4">
      <ThemeToggle className="absolute right-4 top-4" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>로그인</CardTitle>
          <CardDescription>데모 계정으로 채팅을 시작하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} aria-label="login form" className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? '로그인 중…' : '로그인'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
