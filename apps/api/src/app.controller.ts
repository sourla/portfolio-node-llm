import { Controller, Get } from '@nestjs/common';
import type { UserDto } from '@portfolio/shared';

@Controller()
export class AppController {
  @Get('health')
  health(): { ok: boolean; sample: UserDto } {
    return { ok: true, sample: { id: 1, email: 'demo@example.com' } };
  }
}
