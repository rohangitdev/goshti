/**
 * Platform-neutral HTTP handler for story generation.
 * Used by BOTH the local dev server (Node) and the Supabase Edge Function (Deno),
 * so they behave identically. GEMINI_API_KEY only ever lives on this side.
 *
 * Protocol (one story = a few short requests, each well inside the 150 s limit):
 *   POST { request, debug? }        → 202 IN_PROGRESS { phase, continuation } | final result
 *   POST { continuation, debug? }   → 202 IN_PROGRESS … | final result
 * The client repeats with the returned continuation until the status is not IN_PROGRESS.
 */
import { createConsoleLogger, type LogLevel, type StoryLogger } from '../story-engine/logging';
import { advancePipeline, startPipeline, type PipelinePhase, type StepResult } from '../story-engine/pipeline';
import type { StoryAIProvider } from '../story-engine/provider';
import { GeminiProvider } from '../story-engine/providers/gemini';
import { MockStoryAIProvider } from '../story-engine/providers/mock';
import { openState, sealState } from './continuation';
import { handleTts, isTtsAction, issueAudioToken, type TtsEnv } from './tts';

export interface BackendEnv extends TtsEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_WRITER_MODEL?: string;
  GEMINI_CRITIC_MODEL?: string;
  /** Fast model for classifier + audio direction (default gemini-3.5-flash-lite). */
  GEMINI_FAST_MODEL?: string;
  /** Used when the main model is overloaded. "none" disables. */
  GEMINI_FALLBACK_MODEL?: string;
  /** minimal | low | medium | high | auto — one thinking level for all stages (default: per stage). */
  GEMINI_THINKING?: string;
  /** When set, the developer trace is only returned to requests carrying this token. */
  STORY_DEBUG_TOKEN?: string;
  /** "false" stops the backend returning the developer trace. */
  STORY_DEBUG?: string;
  /** off | summary | full */
  STORY_LOG?: string;
  /** Whole-story limit across all requests (default 6 min). */
  STORY_TIME_BUDGET_MS?: string;
  /** Hard limit for one HTTP request (default 135 s — Supabase kills requests at 150 s). */
  STORY_REQUEST_DEADLINE_MS?: string;
  /** Don't start another AI step in the same request after this long (default 20 s). */
  STORY_SLICE_MS?: string;
  /** Optional secret for continuation tokens; derived from GEMINI_API_KEY if not set. */
  STORY_STATE_SECRET?: string;
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

/** Child-friendly progress labels the app can show (fixed text, never model output). */
export const PHASE_LABELS: Record<PipelinePhase, string> = {
  CLASSIFY: 'आजी तुमची कल्पना ऐकतेय...',
  PLAN: 'आजी गोष्टीचा विचार करतेय...',
  WRITE: 'आजी गोष्ट लिहितेय...',
  EVALUATE: 'आजी गोष्ट तपासतेय...',
  REWRITE: 'आजी गोष्ट अजून छान करतेय...',
  AUDIO: 'आजी गोष्ट सांगायला तयार होतेय...',
};

export function createProvider(env: BackendEnv, deadlineAt?: number): { provider: StoryAIProvider; note?: string } {
  if (env.GEMINI_API_KEY) {
    return {
      provider: new GeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
        writerModel: env.GEMINI_WRITER_MODEL,
        criticModel: env.GEMINI_CRITIC_MODEL,
        fastModel: env.GEMINI_FAST_MODEL,
        fallbackModel: env.GEMINI_FALLBACK_MODEL,
        thinking: (['minimal', 'low', 'medium', 'high', 'auto'] as const).find((l) => l === env.GEMINI_THINKING),
        deadlineAt,
      }),
    };
  }
  return {
    provider: new MockStoryAIProvider(),
    note: 'GEMINI_API_KEY is not set — using the mock provider (template stories).',
  };
}

/** Numeric env value; empty/invalid → default (but an explicit "0" is respected). */
function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const STATUS_CODE: Record<StepResult['status'], number> = {
  IN_PROGRESS: 202,
  APPROVED: 200,
  NOT_A_STORY: 200,
  UNSAFE: 200,
  INVALID_REQUEST: 400,
  FAILED: 503,
};

export async function handleGenerateStory(
  body: unknown,
  env: BackendEnv,
  options: { logger?: StoryLogger; now?: () => number } = {},
): Promise<HandlerResponse> {
  const now = options.now ?? Date.now;
  if (isTtsAction(body)) return handleTts(body, env);

  const payload = (body && typeof body === 'object' ? body : {}) as {
    request?: unknown;
    continuation?: unknown;
    debug?: unknown;
    debugToken?: unknown;
  };
  const deadlineAt = now() + (num(env.STORY_REQUEST_DEADLINE_MS, 135_000));
  const { provider, note } = createProvider(env, deadlineAt);
  const logger = options.logger ?? createConsoleLogger((env.STORY_LOG as LogLevel) || 'summary');
  const secret = env.STORY_STATE_SECRET || env.GEMINI_API_KEY || 'goshti-mock-provider';
  const isMock = provider.name === 'mock';

  let result: StepResult;
  if (payload.continuation !== undefined) {
    const state = await openState(payload.continuation, secret);
    if (!state) {
      return { status: 400, body: { status: 'INVALID_REQUEST', errors: ['invalid or expired continuation'] } };
    }
    result = await advance(state);
  } else {
    const started = startPipeline(payload.request, provider, { logger });
    result = 'result' in started ? started.result : await advance(started.state);
  }

  async function advance(state: Parameters<typeof advancePipeline>[0]) {
    return advancePipeline(state, provider, {
      maxAttempts: 3,
      totalBudgetMs: num(env.STORY_TIME_BUDGET_MS, 360_000),
      // The instant mock provider finishes in one request; real AI is sliced.
      sliceBudgetMs: isMock ? Number.POSITIVE_INFINITY : num(env.STORY_SLICE_MS, 20_000),
      enforceLength: !isMock,
      logger,
      now,
    });
  }

  // Developer trace: only on request, never when STORY_DEBUG=false, and — when a STORY_DEBUG_TOKEN
  // is configured (Supabase) — only for callers that send it (the QA runner), never for the app.
  const includeTrace =
    payload.debug === true &&
    env.STORY_DEBUG !== 'false' &&
    (!env.STORY_DEBUG_TOKEN || payload.debugToken === env.STORY_DEBUG_TOKEN);
  const providerInfo = { name: provider.name, models: provider.models, ...(note && { note }) };

  if (result.status === 'IN_PROGRESS') {
    return {
      status: STATUS_CODE.IN_PROGRESS,
      body: {
        status: 'IN_PROGRESS',
        phase: result.phase,
        progressLabel: PHASE_LABELS[result.phase],
        continuation: await sealState(result.state, secret),
        provider: providerInfo,
        ...(includeTrace && { trace: result.trace }),
      },
    };
  }

  const { trace, ...rest } = result;
  // Approved stories get a sealed token the client can use to request Aaji's voice.
  const audio = result.status === 'APPROVED' ? await issueAudioToken(result.story.title, result.story.audioScript, env, result.story.age) : {};
  return {
    status: STATUS_CODE[result.status],
    body: { ...rest, ...audio, provider: providerInfo, ...(includeTrace && { trace }) },
  };
}
