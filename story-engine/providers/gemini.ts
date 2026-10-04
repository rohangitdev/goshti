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
  RawAudioScriptSchema,
  StoryEvaluationSchema,
  StoryPlanSchema,
  toModelJsonSchema,
  WrittenStorySchema,
  type IntentResult,
  type StoryRequest,
} from '../schemas';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
/** Used when the main model is overloaded. Set GEMINI_FALLBACK_MODEL=none to disable. */
export const DEFAULT_FALLBACK_MODEL = 'gemini-3.5-flash';
/** Waits between retries when Google reports high demand / rate limits. */
export const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 10000];
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
  /** Delays between retries on overload / rate limit. */
  retryDelaysMs?: number[];
  /** Per-call timeout. */
  requestTimeoutMs?: number;
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

  private get fallbackModel(): string | null {
    const f = this.config.fallbackModel ?? DEFAULT_FALLBACK_MODEL;
    return !f || f === 'none' ? null : f;
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
      schema: RawAudioScriptSchema,
      temperature: 0.3,
      maxOutputTokens: 32768,
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

    const body = {
      systemInstruction: { parts: [{ text: spec.system }] },
      contents,
      generationConfig,
      safetySettings: SAFETY_SETTINGS,
    };

    const delays = this.config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    let model = spec.model;
    let retry = 0;
    let switched = false;

    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs ?? 120_000);
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
        if (res.status === 400 && this.schemaSupported && /schema/i.test(message)) {
          this.schemaSupported = false;
          delete generationConfig.responseJsonSchema;
          continue;
        }
        const overloaded = res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504;
        if (overloaded) {
          if (retry < delays.length) {
            await sleep(delays[retry]);
            retry += 1;
            continue;
          }
          // Still busy: try the fallback model once (with a fresh, shorter retry budget).
          const fallback = this.fallbackModel;
          if (!switched && fallback && fallback !== model) {
            model = fallback;
            switched = true;
            retry = Math.max(0, delays.length - 1);
            continue;
          }
          throw new ProviderError(
            res.status === 429 ? 'RATE_LIMITED' : 'OVERLOADED',
            `${message} (model ${model}, after ${retry} retries${switched ? ' incl. fallback' : ''})`,
            spec.stage,
          );
        }
        throw new ProviderError('HTTP_ERROR', message, spec.stage);
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
