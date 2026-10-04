/**
 * StoryRequest → IntentClassifier → SafetyGate → DevelopmentProfileResolver → StoryPlanner
 *   → StoryGenerator → StoryCritic → (TargetedRewrite → Critic)* → ApprovedStory → AudioScriptGenerator
 *
 * A story that never passes the critic is NEVER returned — the result is FAILED.
 */
import { buildFallbackAudioScript, estimateDurationSeconds, isCoverageAcceptable, normalizeAudioScript } from './audio';
import { countWords, judgeEvaluation, localStoryChecks } from './evaluation';
import type { StoryLogger } from './logging';
import { resolveProfile, type ChildAge } from './profiles';
import { ProviderError, type StoryAIProvider } from './provider';
import { validateStoryRequest } from './request';
import { StoryPlanSchema, type StoryEvaluation, type StoryPlan, type WrittenStory } from './schemas';
import { MESSAGES, type CriticResult, type PipelineResult, type StageName, type StoryTrace } from './types';
import { pickIngredients, type Rng, type VarietyIngredients } from './variety';

export interface PipelineOptions {
  /** Total versions the critic may judge (first draft + rewrites). Spec: 3. */
  maxAttempts?: number;
  /** Stop before starting a new AI call once this much time has passed. */
  timeBudgetMs?: number;
  logger?: StoryLogger;
  /** Word-count limits per profile. Disable only for the short mock templates. */
  enforceLength?: boolean;
  rng?: Rng;
  now?: () => number;
}

class BudgetExceeded extends Error {}

export async function generateStory(
  rawRequest: unknown,
  provider: StoryAIProvider,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const now = options.now ?? Date.now;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const budget = options.timeBudgetMs ?? Number.POSITIVE_INFINITY;
  const started = now();

  const trace: StoryTrace = {
    startedAt: new Date(started).toISOString(),
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

  const finish = (result: PipelineResult): PipelineResult => {
    trace.totalMs = now() - started;
    trace.outcome = result.status;
    options.logger?.log(trace);
    return result;
  };

  async function stage<T>(name: StageName, fn: () => Promise<T>, attempt?: number): Promise<T> {
    if (now() - started > budget) throw new BudgetExceeded(`time budget exceeded before ${name}`);
    const t0 = now();
    try {
      return await fn();
    } finally {
      trace.timings.push({ stage: name, attempt, ms: now() - t0, model: provider.modelUsedFor?.(name) ?? provider.models[name] });
    }
  }

  // 1. Validate
  const validation = validateStoryRequest(rawRequest);
  if (!validation.ok) {
    trace.errors.push(...validation.errors);
    return finish({ status: 'INVALID_REQUEST', errors: validation.errors, trace });
  }
  const request = validation.value;
  trace.normalizedRequest = request;

  try {
    // 2. Intent — only user-supplied text needs classifying.
    if (request.mode === 'CUSTOM' && request.userIdea) {
      const idea = request.userIdea;
      trace.intent = await stage('classifyIntent', () => provider.classifyIntent({ idea, request }));
    } else {
      trace.intent = { intent: 'STORY_REQUEST', reason: 'RANDOM mode — no user text to classify.', skipped: true };
    }

    // 3. Safety gate
    if (trace.intent.intent === 'UNSAFE') {
      trace.safety = { allowed: false, reason: trace.intent.reason };
      return finish({ status: 'UNSAFE', message: MESSAGES.UNSAFE, trace });
    }
    if (trace.intent.intent === 'OTHER') {
      trace.safety = { allowed: false, reason: 'Not a story request.' };
      return finish({ status: 'NOT_A_STORY', message: MESSAGES.NOT_A_STORY, trace });
    }
    trace.safety = { allowed: true, reason: 'Story request.' };

    // 4. Developmental profile
    const profile = resolveProfile(request.age);
    trace.profile = profile;

    // 5. Plan
    const all = pickIngredients(request, profile, options.rng);
    const ingredients: Partial<VarietyIngredients> =
      request.mode === 'RANDOM' ? all : { humourStyle: all.humourStyle, positiveValue: all.positiveValue };
    trace.varietyIngredients = ingredients as Record<string, string>;

    const rawPlan = await stage('createPlan', () => provider.createPlan({ request, profile, ingredients }));
    // The request — not the model — is the source of truth for these fields.
    const plan: StoryPlan = StoryPlanSchema.parse({
      ...rawPlan,
      age: request.age,
      developmentalProfile: profile.id,
      category: request.category,
    });
    trace.plan = plan;

    // 6. Write → critique → targeted rewrite loop
    let story = null as WrittenStory | null;
    let lastEval = null as CriticResult | null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      trace.attemptCount = attempt;
      const previousStory: WrittenStory | null = story;
      const previousEval: CriticResult | null = lastEval;
      const current: WrittenStory =
        previousStory && previousEval
          ? await stage(
              'rewriteStory',
              () =>
                provider.rewriteStory({
                  request,
                  profile,
                  plan,
                  story: previousStory,
                  evaluation: previousEval.evaluation,
                  failures: previousEval.failures,
                }),
              attempt,
            )
          : await stage('generateStory', () => provider.generateStory({ request, profile, plan }), attempt);
      story = current;
      trace.drafts.push({
        attempt,
        kind: previousStory ? 'REWRITE' : 'DRAFT',
        story: current,
        wordCount: countWords(current.storyText),
      });

      const evaluation: StoryEvaluation = await stage(
        'evaluateStory',
        () => provider.evaluateStory({ request, profile, plan, story: current }),
        attempt,
      );
      const local = localStoryChecks(current, profile, {
        enforceLength: options.enforceLength ?? true,
        ignoreWords: request.childName ? [request.childName] : [],
      });
      const verdict = judgeEvaluation(evaluation, local);
      lastEval = { attempt, evaluation, passed: verdict.passed, failures: verdict.failures };
      trace.critiques.push(lastEval);

      if (verdict.passed) break;
    }

    if (!story || !lastEval?.passed) {
      const reason = `Story did not pass the critic after ${trace.attemptCount} attempt(s): ${lastEval?.failures.join('; ')}`;
      trace.errors.push(reason);
      return finish({ status: 'FAILED', reason, trace });
    }
    trace.finalStory = story;

    // 7. Audio script — only for the approved story. Falls back to a deterministic
    //    conversion so an approved story is never lost to a bad audio script.
    const approved = story;
    let audioScript;
    try {
      const raw = await stage('createAudioScript', () => provider.createAudioScript({ profile, plan, story: approved }));
      const normalized = normalizeAudioScript(raw, approved.storyText, plan.estimatedDurationMinutes);
      trace.audioScriptWarnings.push(...normalized.warnings);
      if (isCoverageAcceptable(normalized.script, approved.storyText)) {
        audioScript = normalized.script;
      } else {
        trace.audioScriptWarnings.push('audio script did not preserve the approved text — used deterministic fallback');
      }
    } catch (e) {
      if (e instanceof BudgetExceeded) throw e;
      trace.audioScriptWarnings.push(`audio director failed (${(e as Error).message}) — used deterministic fallback`);
    }
    audioScript ??= buildFallbackAudioScript(approved.storyText, {
      closingEmotion: request.category === 'bedtime' ? 'sleepy' : 'warm',
    });
    trace.audioScript = audioScript;

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
        evaluation: lastEval.evaluation,
        audioScript,
        estimatedDurationSeconds: estimateDurationSeconds(audioScript),
        attempts: trace.attemptCount,
      },
    });
  } catch (e) {
    const message =
      e instanceof ProviderError ? `${e.code}${e.stage ? ` at ${e.stage}` : ''}: ${e.message}` : (e as Error).message;
    trace.errors.push(message);
    return finish({ status: 'FAILED', reason: message, trace });
  }
}
