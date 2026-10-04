/**
 * Platform-neutral HTTP handler for story generation.
 * Used by BOTH the local dev server (Node) and the Supabase Edge Function (Deno),
 * so they behave identically. GEMINI_API_KEY only ever lives on this side.
 */
import { createConsoleLogger, type LogLevel, type StoryLogger } from '../story-engine/logging';
import { generateStory } from '../story-engine/pipeline';
import type { StoryAIProvider } from '../story-engine/provider';
import { GeminiProvider } from '../story-engine/providers/gemini';
import { MockStoryAIProvider } from '../story-engine/providers/mock';
import type { PipelineResult } from '../story-engine/types';

export interface BackendEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_WRITER_MODEL?: string;
  GEMINI_CRITIC_MODEL?: string;
  /** Used when the main model is overloaded. "none" disables. */
  GEMINI_FALLBACK_MODEL?: string;
  /** "false" stops the backend returning the developer trace. */
  STORY_DEBUG?: string;
  /** off | summary | full */
  STORY_LOG?: string;
  /** Stop starting new AI calls after this long (Edge Functions have a wall-clock limit). */
  STORY_TIME_BUDGET_MS?: string;
}

export interface HandlerResponse {
  status: number;
  body: Record<string, unknown>;
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function createProvider(env: BackendEnv): { provider: StoryAIProvider; note?: string } {
  if (env.GEMINI_API_KEY) {
    return {
      provider: new GeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
        writerModel: env.GEMINI_WRITER_MODEL,
        criticModel: env.GEMINI_CRITIC_MODEL,
        fallbackModel: env.GEMINI_FALLBACK_MODEL,
      }),
    };
  }
  return {
    provider: new MockStoryAIProvider(),
    note: 'GEMINI_API_KEY is not set — using the mock provider (template stories).',
  };
}

const STATUS_CODE: Record<PipelineResult['status'], number> = {
  APPROVED: 200,
  NOT_A_STORY: 200,
  UNSAFE: 200,
  INVALID_REQUEST: 400,
  FAILED: 503,
};

export async function handleGenerateStory(
  body: unknown,
  env: BackendEnv,
  options: { logger?: StoryLogger } = {},
): Promise<HandlerResponse> {
  const payload = (body && typeof body === 'object' ? body : {}) as { request?: unknown; debug?: unknown };
  const { provider, note } = createProvider(env);
  const logger = options.logger ?? createConsoleLogger((env.STORY_LOG as LogLevel) || 'summary');

  const result = await generateStory(payload.request, provider, {
    maxAttempts: 3,
    timeBudgetMs: Number(env.STORY_TIME_BUDGET_MS) || 140_000,
    enforceLength: provider.name !== 'mock',
    logger,
  });

  const includeTrace = payload.debug === true && env.STORY_DEBUG !== 'false';
  const { trace, ...rest } = result;
  return {
    status: STATUS_CODE[result.status],
    body: {
      ...rest,
      provider: { name: provider.name, models: provider.models, ...(note && { note }) },
      ...(includeTrace && { trace }),
    },
  };
}
