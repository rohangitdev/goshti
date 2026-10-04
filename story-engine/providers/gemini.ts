/**
 * Gemini implementation of StoryAIProvider — BACKEND ONLY.
 * Never import this from the Expo app. Uses the public REST API with fetch, so the
 * same code runs in Node (local dev server) and Deno (Supabase Edge Function).
 */
import type { z } from 'zod';

import {
  AUDIO_SCRIPT_SYSTEM_PROMPT,
  buildAudioScriptUserPrompt,
  buildCriticUserPrompt,
  buildIntentUserPrompt,
  buildPlannerUserPrompt,
  buildRewriteUserPrompt,
  buildStoryWriterUserPrompt,
  CRITIC_SYSTEM_PROMPT,
  INTENT_SYSTEM_PROMPT,
  PLANNER_SYSTEM_PROMPT,
  REWRITE_SYSTEM_PROMPT,
  STORY_WRITER_SYSTEM_PROMPT,
} from '../prompts';
import {
  ProviderError,
  type AudioScriptInput,
  type EvaluateInput,
  type PlanInput,
  type RewriteInput,
  type StoryAIProvider,
  type WriteInput,
} from '../provider';
import {
  IntentResultSchema,
  AudioDirectionSchema,
  StoryEvaluationSchema,
  StoryPlanSchema,
  toModelJsonSchema,
  WrittenStorySchema,
  type IntentResult,
  type StoryRequest,
} from '../schemas';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
/**
 * Tried in order when the main model is overloaded or its quota is used up
 * (free tier: each model has its own small daily request allowance).
 * GEMINI_FALLBACK_MODEL accepts a comma-separated list; "none" disables.
 */
export const DEFAULT_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

/**
 * Models whose DAILY quota is used up, until when. Module-level, so a warm Edge Function
 * worker skips them on later requests instead of wasting a call.
 */
const exhaustedUntil = new Map<string, number>();

/** "Please retry in 13h52m16s" / "retry in 42.5s" → milliseconds. */
export function parseRetryDelayMs(message: string): number | null {
  const m = /retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(message);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000;
}

/** A 429 that won't clear within this request: daily/plan quota rather than a burst limit. */
export function isQuotaExhausted(message: string): boolean {
  const delay = parseRetryDelayMs(message);
  return /quota/i.test(message) && (delay === null || delay > 60_000 || /per[_ ]?day|free_tier_requests/i.test(message));
}
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

/**
 * Hidden "thinking" before answering costs a lot of time. Structured, mechanical stages
 * think little; the writer and critic — where quality is decided — think more.
 */
export const DEFAULT_THINKING: Record<string, ThinkingLevel> = {
  classifyIntent: 'low',
  createPlan: 'low',
  generateStory: 'medium',
  evaluateStory: 'medium',
  rewriteStory: 'medium',
  createAudioScript: 'low',
};

/** Waits between retries when Google reports high demand / rate limits. */
export const DEFAULT_RETRY_DELAYS_MS = [1500, 4000];
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiConfig {
  apiKey: string;
  /** Default model for every stage (GEMINI_MODEL). */
  model?: string;
  /** Optional per-role overrides (GEMINI_WRITER_MODEL, GEMINI_CRITIC_MODEL). */
  writerModel?: string;
  criticModel?: string;
  /** Model to switch to when the configured one is overloaded (GEMINI_FALLBACK_MODEL). "none" disables. */
  fallbackModel?: string;
  /**
   * GEMINI_THINKING: one level for every stage ("low", "medium", …), or "auto" to let the
   * model decide (slowest). Unset = DEFAULT_THINKING per stage.
   */
  thinking?: ThinkingLevel | 'auto';
  /** Delays between retries on overload / rate limit. */
  retryDelaysMs?: number[];
  /** Per-call timeout. */
  requestTimeoutMs?: number;
  /**
   * Epoch ms by which this provider must have stopped working (the hosting request's limit).
   * Calls are shortened to fit and retries skipped if they would cross it — the pipeline then
   * hands back IN_PROGRESS and the next request retries with a fresh limit.
   */
  deadlineAt?: number;
  fetchImpl?: typeof fetch;
}

interface CallSpec<T> {
  stage: string;
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  temperature: number;
  maxOutputTokens: number;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

/** Strict child-safety thresholds on every call. */
const SAFETY_SETTINGS = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_LOW_AND_ABOVE' }));

/** Pull a JSON object out of a model response, tolerating code fences or stray prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new SyntaxError('no JSON object found');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GeminiProvider implements StoryAIProvider {
  readonly name = 'gemini';
  readonly models: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private schemaSupported = true;
  private thinkingSupported = true;
  /** Model that actually answered each stage last (differs from `models` after a fallback). */
  private readonly lastUsed: Record<string, string> = {};

  constructor(private readonly config: GeminiConfig) {
    if (!config.apiKey) throw new ProviderError('NOT_CONFIGURED', 'GEMINI_API_KEY is not set');
    const base = config.model || DEFAULT_GEMINI_MODEL;
    const writer = config.writerModel || base;
    const critic = config.criticModel || base;
    this.models = {
      classifyIntent: base,
      createPlan: writer,
      generateStory: writer,
      rewriteStory: writer,
      evaluateStory: critic,
      createAudioScript: base,
    };
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  modelUsedFor(stage: string): string | undefined {
    return this.lastUsed[stage] ?? this.models[stage];
  }

  private get fallbackModels(): string[] {
    const f = this.config.fallbackModel;
    if (f === 'none') return [];
    if (!f) return DEFAULT_FALLBACK_MODELS;
    return f.split(',').map((m) => m.trim()).filter(Boolean);
  }

  /** Main model first, then fallbacks; models with exhausted quota are skipped. */
  private candidates(primary: string): string[] {
    const now = Date.now();
    const list = [primary, ...this.fallbackModels.filter((m) => m !== primary)];
    const usable = list.filter((m) => (exhaustedUntil.get(m) ?? 0) <= now);
    return usable.length ? usable : [primary];
  }

  async classifyIntent(input: { idea: string; request: StoryRequest }): Promise<IntentResult> {
    try {
      return await this.call({
        stage: 'classifyIntent',
        model: this.models.classifyIntent,
        system: INTENT_SYSTEM_PROMPT,
        user: buildIntentUserPrompt(input),
        schema: IntentResultSchema,
        temperature: 0,
        maxOutputTokens: 2048,
      });
    } catch (e) {
      // If Gemini's own safety filters block the child's text, treat it as UNSAFE.
      if (e instanceof ProviderError && e.code === 'BLOCKED') {
        return { intent: 'UNSAFE', reason: `Blocked by model safety filter: ${e.message}` };
      }
      throw e;
    }
  }

  createPlan(input: PlanInput) {
    return this.call({
      stage: 'createPlan',
      model: this.models.createPlan,
      system: PLANNER_SYSTEM_PROMPT,
      user: buildPlannerUserPrompt(input),
      schema: StoryPlanSchema,
      temperature: 1.0,
      maxOutputTokens: 8192,
    });
  }

  generateStory(input: WriteInput) {
    return this.call({
      stage: 'generateStory',
      model: this.models.generateStory,
      system: STORY_WRITER_SYSTEM_PROMPT,
      user: buildStoryWriterUserPrompt(input),
      schema: WrittenStorySchema,
      temperature: 0.9,
      maxOutputTokens: 16384,
    });
  }

  evaluateStory(input: EvaluateInput) {
    return this.call({
      stage: 'evaluateStory',
      model: this.models.evaluateStory,
      system: CRITIC_SYSTEM_PROMPT,
      user: buildCriticUserPrompt(input),
      schema: StoryEvaluationSchema,
      temperature: 0.2,
      maxOutputTokens: 8192,
    });
  }

  rewriteStory(input: RewriteInput) {
    return this.call({
      stage: 'rewriteStory',
      model: this.models.rewriteStory,
      system: REWRITE_SYSTEM_PROMPT,
      user: buildRewriteUserPrompt(input),
      schema: WrittenStorySchema,
      temperature: 0.7,
      maxOutputTokens: 16384,
    });
  }

  createAudioScript(input: AudioScriptInput) {
    return this.call({
      stage: 'createAudioScript',
      model: this.models.createAudioScript,
      system: AUDIO_SCRIPT_SYSTEM_PROMPT,
      user: buildAudioScriptUserPrompt(input),
      schema: AudioDirectionSchema,
      temperature: 0.3,
      maxOutputTokens: 8192,
    });
  }

  // -------------------------------------------------------------------------

  /** One structured call with validation and a single repair retry for malformed output. */
  private async call<T>(spec: CallSpec<T>): Promise<T> {
    const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [
      { role: 'user', parts: [{ text: spec.user }] },
    ];

    for (let repair = 0; repair < 2; repair++) {
      const text = await this.request(spec, contents);
      let problem: string;
      try {
        const parsed = spec.schema.safeParse(extractJson(text));
        if (parsed.success) return parsed.data;
        problem = parsed.error.issues
          .slice(0, 8)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
      } catch (e) {
        problem = `invalid JSON (${(e as Error).message})`;
      }
      contents.push(
        { role: 'model', parts: [{ text: text.slice(0, 20000) }] },
        {
          role: 'user',
          parts: [{ text: `Your previous output did not match the required JSON schema: ${problem}. Return the complete corrected JSON only.` }],
        },
      );
    }
    throw new ProviderError('MALFORMED_OUTPUT', 'model output failed schema validation twice', spec.stage);
  }

  private async request<T>(spec: CallSpec<T>, contents: unknown[]): Promise<string> {
    const generationConfig: Record<string, unknown> = {
      temperature: spec.temperature,
      maxOutputTokens: spec.maxOutputTokens,
      responseMimeType: 'application/json',
    };
    if (this.schemaSupported) generationConfig.responseJsonSchema = toModelJsonSchema(spec.schema);
    const thinking = this.config.thinking ?? DEFAULT_THINKING[spec.stage];
    if (this.thinkingSupported && thinking && thinking !== 'auto') {
      generationConfig.thinkingConfig = { thinkingLevel: thinking };
    }

    const body = {
      systemInstruction: { parts: [{ text: spec.system }] },
      contents,
      generationConfig,
      safetySettings: SAFETY_SETTINGS,
    };

    const delays = this.config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    const models = this.candidates(spec.model);
    let index = 0;
    let model = models[0];
    let retry = 0;
    const tried: string[] = [];

    for (;;) {
      const remaining = (this.config.deadlineAt ?? Number.POSITIVE_INFINITY) - Date.now() - 2000;
      if (remaining < 5000) throw new ProviderError('TIMEOUT', 'not enough time left in this request', spec.stage);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(this.config.requestTimeoutMs ?? 120_000, remaining));
      let res: Response;
      try {
        res = await this.fetchImpl(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (e) {
        const aborted = (e as Error).name === 'AbortError';
        throw new ProviderError(aborted ? 'TIMEOUT' : 'NETWORK', (e as Error).message, spec.stage);
      } finally {
        clearTimeout(timer);
      }

      const json = (await res.json().catch(() => ({}))) as GeminiResponse;

      if (!res.ok) {
        const message = json.error?.message ?? `HTTP ${res.status}`;
        // Older/other models may reject responseJsonSchema — fall back to prompt-only JSON.
        if (res.status === 400 && this.schemaSupported && /schema/i.test(message) && !/thinking/i.test(message)) {
          this.schemaSupported = false;
          delete generationConfig.responseJsonSchema;
          continue;
        }
        // Models without thinking levels reject thinkingConfig — drop it and continue.
        if (res.status === 400 && this.thinkingSupported && /thinking/i.test(message)) {
          this.thinkingSupported = false;
          delete generationConfig.thinkingConfig;
          continue;
        }

        const quotaGone = res.status === 429 && isQuotaExhausted(message);
        const busy = !quotaGone && [429, 500, 502, 503, 504].includes(res.status);
        if (!quotaGone && !busy) throw new ProviderError('HTTP_ERROR', message, spec.stage);

        if (quotaGone) {
          // Retrying is pointless for hours — remember it and move to the next model now.
          exhaustedUntil.set(model, Date.now() + (parseRetryDelayMs(message) ?? 60 * 60 * 1000));
          tried.push(`${model}: daily quota used up`);
        } else {
          const fits = Date.now() + (delays[retry] ?? 0) + 20_000 < (this.config.deadlineAt ?? Number.POSITIVE_INFINITY);
          if (retry < delays.length && fits) {
            await sleep(delays[retry]);
            retry += 1;
            continue;
          }
          tried.push(`${model}: busy`);
        }

        if (index + 1 < models.length) {
          index += 1;
          model = models[index];
          retry = Math.max(0, delays.length - 1); // one quick retry on the next model
          continue;
        }
        const allQuota = tried.every((t) => t.endsWith('quota used up'));
        throw new ProviderError(
          allQuota ? 'QUOTA_EXHAUSTED' : res.status === 429 ? 'RATE_LIMITED' : 'OVERLOADED',
          `${allQuota ? 'Gemini daily quota used up for all configured models' : 'Gemini is busy'} (${tried.join('; ')}). ${message.slice(0, 300)}`,
          spec.stage,
        );
      }
      this.lastUsed[spec.stage] = model;

      if (json.promptFeedback?.blockReason) {
        throw new ProviderError('BLOCKED', json.promptFeedback.blockReason, spec.stage);
      }
      const candidate = json.candidates?.[0];
      if (!candidate) throw new ProviderError('BLOCKED', 'no candidates returned', spec.stage);
      if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
        throw new ProviderError('BLOCKED', candidate.finishReason, spec.stage);
      }
      const text = (candidate.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
      if (!text) {
        throw new ProviderError('MALFORMED_OUTPUT', `empty response (finishReason=${candidate.finishReason})`, spec.stage);
      }
      return text;
    }
  }
}
