import type { UserDto } from '@portfolio/shared';

const demo: UserDto = { id: 1, email: 'demo@example.com' };

export function App() {
  return <h1>portfolio-node-llm — {demo.email}</h1>;
}
