/**
 * StoryRequest → IntentClassifier → SafetyGate → DevelopmentProfileResolver → StoryPlanner
 *   → StoryGenerator → StoryCritic → (TargetedRewrite → Critic)* → ApprovedStory → AudioScriptGenerator
 *
 * A story that never passes the critic is NEVER returned — the result is FAILED.
 *
 * The pipeline is a resumable state machine. Each phase is one AI call. A backend with a
 * per-request time limit (Supabase Edge Functions: 150 s) runs a few phases, returns
 * IN_PROGRESS with the state, and the client calls again to continue. `generateStory`
 * runs everything in one go (tests, mock, local use).
 */
import { buildAudioScript, estimateDurationSeconds } from './audio';
import { countWords, judgeEvaluation, localStoryChecks } from './evaluation';
import type { StoryLogger } from './logging';
import { resolveProfile, type ChildAge } from './profiles';
import { ProviderError, type ProviderErrorCode, type StoryAIProvider } from './provider';
import { validateStoryRequest } from './request';
import { StoryPlanSchema, type StoryRequest } from './schemas';
import { MESSAGES, type PipelineResult, type StageName, type StoryTrace } from './types';
import { pickIngredients, type Rng, type VarietyIngredients } from './variety';

export type PipelinePhase = 'CLASSIFY' | 'PLAN' | 'WRITE' | 'EVALUATE' | 'REWRITE' | 'AUDIO';

/** Serializable progress of one story. Contains no secrets. */
export interface PipelineState {
  v: 1;
  phase: PipelinePhase;
  /** How many times the current phase was retried after a transient provider error. */
  phaseRetries: number;
  ingredients: Partial<VarietyIngredients>;
  trace: StoryTrace;
}

export type StepResult =
  | PipelineResult
  | { status: 'IN_PROGRESS'; phase: PipelinePhase; state: PipelineState; trace: StoryTrace };

export interface PipelineOptions {
  /** Total versions the critic may judge (first draft + rewrites). Spec: 3. */
  maxAttempts?: number;
  /** Give up (FAILED) once the whole story has taken this long across all requests. */
  totalBudgetMs?: number;
  /** Within one call to advancePipeline: don't START a new phase after this long. */
  sliceBudgetMs?: number;
  /** Transient provider errors (overload, timeout) retried per phase before failing. */
  maxPhaseRetries?: number;
  logger?: StoryLogger;
  /** Word-count limits per profile. Disable only for the short mock templates. */
  enforceLength?: boolean;
  rng?: Rng;
  now?: () => number;
}

const PHASE_STAGE: Record<PipelinePhase, StageName> = {
  CLASSIFY: 'classifyIntent',
  PLAN: 'createPlan',
  WRITE: 'generateStory',
  EVALUATE: 'evaluateStory',
  REWRITE: 'rewriteStory',
  AUDIO: 'createAudioScript',
};

const TRANSIENT: ProviderErrorCode[] = ['OVERLOADED', 'RATE_LIMITED', 'TIMEOUT', 'NETWORK'];

/** Validate + set up. Returns a state ready to advance, or a terminal result. */
export function startPipeline(
  rawRequest: unknown,
  provider: StoryAIProvider,
  options: Pick<PipelineOptions, 'rng' | 'now' | 'logger'> = {},
): { state: PipelineState } | { result: PipelineResult } {
  const now = options.now ?? Date.now;
  const trace: StoryTrace = {
    startedAt: new Date(now()).toISOString(),
    request: rawRequest,
    drafts: [],
    critiques: [],
    audioScriptWarnings: [],
    provider: { name: provider.name, models: provider.models },
    timings: [],
    totalMs: 0,
    attemptCount: 0,
    errors: [],
  };

  const validation = validateStoryRequest(rawRequest);
  if (!validation.ok) {
    trace.errors.push(...validation.errors);
    trace.outcome = 'INVALID_REQUEST';
    options.logger?.log(trace);
    return { result: { status: 'INVALID_REQUEST', errors: validation.errors, trace } };
  }
  const request = validation.value;
  trace.normalizedRequest = request;
  const profile = resolveProfile(request.age);
  trace.profile = profile;

  const all = pickIngredients(request, profile, options.rng);
  const ingredients: Partial<VarietyIngredients> =
    request.mode === 'RANDOM' ? all : { humourStyle: all.humourStyle, positiveValue: all.positiveValue };
  trace.varietyIngredients = ingredients as Record<string, string>;

  let phase: PipelinePhase = 'CLASSIFY';
  if (!(request.mode === 'CUSTOM' && request.userIdea)) {
    trace.intent = { intent: 'STORY_REQUEST', reason: 'RANDOM mode — no user text to classify.', skipped: true };
    trace.safety = { allowed: true, reason: 'Story request.' };
    phase = 'PLAN';
  }
  return { state: { v: 1, phase, phaseRetries: 0, ingredients, trace } };
}

/** Runs phases until done, or until the slice budget says to hand back IN_PROGRESS. */
export async function advancePipeline(
  input: PipelineState,
  provider: StoryAIProvider,
  options: PipelineOptions = {},
): Promise<StepResult> {
  const now = options.now ?? Date.now;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const maxPhaseRetries = options.maxPhaseRetries ?? 2;
  const sliceStart = now();
  const state: PipelineState = JSON.parse(JSON.stringify(input)) as PipelineState;
  const trace = state.trace;
  const startedAt = Date.parse(trace.startedAt);
  const request = trace.normalizedRequest as StoryRequest;
  const profile = resolveProfile(request.age);
  trace.profile = profile;
  trace.provider = { name: provider.name, models: provider.models };

  const finish = (result: PipelineResult): PipelineResult => {
    trace.totalMs = now() - startedAt;
    trace.outcome = result.status;
    options.logger?.log(trace);
    return result;
  };
  const fail = (reason: string) => {
    trace.errors.push(reason);
    return finish({ status: 'FAILED', reason, trace });
  };

  let phasesRun = 0;
  for (;;) {
    if (now() - startedAt > (options.totalBudgetMs ?? Number.POSITIVE_INFINITY)) {
      return fail(`time budget exceeded before ${state.phase}`);
    }
    if (phasesRun > 0 && now() - sliceStart >= (options.sliceBudgetMs ?? Number.POSITIVE_INFINITY)) {
      trace.totalMs = now() - startedAt;
      return { status: 'IN_PROGRESS', phase: state.phase, state, trace };
    }

    const stage = PHASE_STAGE[state.phase];
    const attempt = state.phase === 'WRITE' || state.phase === 'EVALUATE' || state.phase === 'REWRITE' ? trace.attemptCount || 1 : undefined;
    const t0 = now();
    const timed = async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } finally {
        trace.timings.push({ stage, attempt, ms: now() - t0, model: provider.modelUsedFor?.(stage) ?? provider.models[stage] });
      }
    };

    try {
      phasesRun += 1;
      switch (state.phase) {
        case 'CLASSIFY': {
          const idea = request.userIdea ?? '';
          trace.intent = await timed(() => provider.classifyIntent({ idea, request }));
          if (trace.intent.intent === 'UNSAFE') {
            trace.safety = { allowed: false, reason: trace.intent.reason };
            return finish({ status: 'UNSAFE', message: MESSAGES.UNSAFE, trace });
          }
          if (trace.intent.intent === 'OTHER') {
            trace.safety = { allowed: false, reason: 'Not a story request.' };
            return finish({ status: 'NOT_A_STORY', message: MESSAGES.NOT_A_STORY, trace });
          }
          trace.safety = { allowed: true, reason: 'Story request.' };
          state.phase = 'PLAN';
          break;
        }

        case 'PLAN': {
          const raw = await timed(() => provider.createPlan({ request, profile, ingredients: state.ingredients }));
          // The request — not the model — is the source of truth for these fields.
          trace.plan = StoryPlanSchema.parse({ ...raw, age: request.age, developmentalProfile: profile.id, category: request.category });
          state.phase = 'WRITE';
          break;
        }

        case 'WRITE': {
          const plan = trace.plan!;
          trace.attemptCount = 1;
          const story = await timed(() => provider.generateStory({ request, profile, plan }));
          trace.drafts.push({ attempt: 1, kind: 'DRAFT', story, wordCount: countWords(story.storyText) });
          state.phase = 'EVALUATE';
          break;
        }

        case 'EVALUATE': {
          const plan = trace.plan!;
          const story = trace.drafts[trace.drafts.length - 1].story;
          const evaluation = await timed(() => provider.evaluateStory({ request, profile, plan, story }));
          const local = localStoryChecks(story, profile, {
            enforceLength: options.enforceLength ?? true,
            ignoreWords: request.childName ? [request.childName] : [],
          });
          const verdict = judgeEvaluation(evaluation, local);
          trace.critiques.push({ attempt: trace.attemptCount, evaluation, passed: verdict.passed, failures: verdict.failures });
          if (verdict.passed) {
            trace.finalStory = story;
            state.phase = 'AUDIO';
          } else if (trace.attemptCount < maxAttempts) {
            state.phase = 'REWRITE';
          } else {
            return fail(`Story did not pass the critic after ${trace.attemptCount} attempt(s): ${verdict.failures.join('; ')}`);
          }
          break;
        }

        case 'REWRITE': {
          const plan = trace.plan!;
          const previous = trace.drafts[trace.drafts.length - 1].story;
          const critique = trace.critiques[trace.critiques.length - 1];
          const story = await timed(() =>
            provider.rewriteStory({ request, profile, plan, story: previous, evaluation: critique.evaluation, failures: critique.failures }),
          );
          trace.attemptCount += 1;
          trace.drafts.push({ attempt: trace.attemptCount, kind: 'REWRITE', story, wordCount: countWords(story.storyText) });
          state.phase = 'EVALUATE';
          break;
        }

        case 'AUDIO': {
          const plan = trace.plan!;
          const approved = trace.finalStory!;
          // Text always comes from the approved story; the model only directs.
          // If direction fails, the story still gets a plain script — never lost.
          let direction = null;
          try {
            direction = await timed(() => provider.createAudioScript({ profile, plan, story: approved }));
          } catch (e) {
            trace.audioScriptWarnings.push(`audio director failed (${(e as Error).message}) — plain narration used`);
          }
          const built = buildAudioScript(approved.storyText, direction, {
            estimatedMinutes: plan.estimatedDurationMinutes,
            closingEmotion: request.category === 'bedtime' ? 'sleepy' : direction ? undefined : 'warm',
          });
          trace.audioScriptWarnings.push(...built.warnings);
          const audioScript = built.script;
          trace.audioScript = audioScript;
          const evaluation = trace.critiques[trace.critiques.length - 1].evaluation;
          return finish({
            status: 'APPROVED',
            trace,
            story: {
              title: approved.title,
              storyText: approved.storyText,
              age: request.age as ChildAge,
              ageBand: profile.ageBand,
              profileId: profile.id,
              category: request.category,
              mode: request.mode,
              userIdea: request.userIdea ?? null,
              positiveValue: plan.positiveValue,
              plan,
              evaluation,
              audioScript,
              estimatedDurationSeconds: estimateDurationSeconds(audioScript),
              attempts: trace.attemptCount,
            },
          });
        }
      }
      state.phaseRetries = 0;
    } catch (e) {
      const transient = e instanceof ProviderError && TRANSIENT.includes(e.code);
      const message =
        e instanceof ProviderError ? `${e.code}${e.stage ? ` at ${e.stage}` : ''}: ${e.message}` : (e as Error).message;
      if (transient && state.phaseRetries < maxPhaseRetries) {
        // Hand back so the next request (fresh time limit) retries this phase.
        state.phaseRetries += 1;
        trace.errors.push(`${message} — will retry (${state.phaseRetries}/${maxPhaseRetries})`);
        trace.totalMs = now() - startedAt;
        return { status: 'IN_PROGRESS', phase: state.phase, state, trace };
      }
      return fail(message);
    }
  }
}

/** Runs the whole pipeline in one go (no slicing). Transient errors are retried in place. */
export async function generateStory(
  rawRequest: unknown,
  provider: StoryAIProvider,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const started = startPipeline(rawRequest, provider, options);
  if ('result' in started) return started.result;
  let state = started.state;
  for (;;) {
    const r = await advancePipeline(state, provider, options);
    if (r.status !== 'IN_PROGRESS') return r;
    state = r.state;
  }
}
