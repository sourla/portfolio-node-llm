import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? '라이트 모드' : '다크 모드';
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={next} title={next} className={className}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}
