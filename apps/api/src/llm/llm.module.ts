import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER, type LlmProvider } from './llm.provider';
import { MockLlmProvider } from './mock.provider';

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const kind = config.get<string>('LLM_PROVIDER') ?? 'mock';
        if (kind === 'mock') return new MockLlmProvider();
        throw new Error(`unsupported LLM_PROVIDER: ${kind}`);
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
