import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER, type LlmProvider } from './llm.provider';
import { MockLlmProvider } from './mock.provider';
import { GeminiLlmProvider } from './gemini.provider';

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const kind = config.get<string>('LLM_PROVIDER') ?? 'mock';
        if (kind === 'mock') return new MockLlmProvider();
        if (kind === 'gemini') {
          const apiKey = config.get<string>('GEMINI_API_KEY');
          if (!apiKey) throw new Error('LLM_PROVIDER=gemini requires GEMINI_API_KEY');
          return new GeminiLlmProvider({ apiKey, model: config.get<string>('GEMINI_MODEL') });
        }
        throw new Error(`unsupported LLM_PROVIDER: ${kind}`);
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
