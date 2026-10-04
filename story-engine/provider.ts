import type { DevelopmentalProfile } from './profiles';
import type { AudioDirection, IntentResult, StoryEvaluation, StoryPlan, StoryRequest, WrittenStory } from './schemas';
import type { VarietyIngredients } from './variety';

export interface PlanInput {
  request: StoryRequest;
  profile: DevelopmentalProfile;
  /** RANDOM: full ingredient set. CUSTOM: only value/humour suggestions. */
  ingredients: Partial<VarietyIngredients>;
}

export interface WriteInput {
  request: StoryRequest;
  profile: DevelopmentalProfile;
  plan: StoryPlan;
}

export interface EvaluateInput {
  request: StoryRequest;
  profile: DevelopmentalProfile;
  plan: StoryPlan;
  story: WrittenStory;
}

export interface RewriteInput extends EvaluateInput {
  evaluation: StoryEvaluation;
  /** Failed thresholds / flags / local checks, so the rewriter knows what blocked approval. */
  failures: string[];
}

export interface AudioScriptInput {
  profile: DevelopmentalProfile;
  plan: StoryPlan;
  story: WrittenStory;
}

/**
 * Provider-neutral AI operations. Business logic depends only on this interface,
 * never on a vendor SDK. Gemini today; anything else later.
 */
/** Token counts as reported by the provider, per model call (no prices — those change). */
export interface TokenUsage {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  /** Writer/critic attempt number, when relevant. */
  attempt?: number;
}

export interface StoryAIProvider {
  readonly name: string;
  /** Model used per operation, for the developer trace. */
  readonly models: Record<string, string>;
  /** Model that actually served a stage (after any fallback). Optional. */
  modelUsedFor?(stage: string): string | undefined;
  /** Token usage reported by the model since the last call (diagnostics only). Optional. */
  takeUsage?(): TokenUsage[];
  classifyIntent(input: { idea: string; request: StoryRequest }): Promise<IntentResult>;
  createPlan(input: PlanInput): Promise<StoryPlan>;
  generateStory(input: WriteInput): Promise<WrittenStory>;
  evaluateStory(input: EvaluateInput): Promise<StoryEvaluation>;
  rewriteStory(input: RewriteInput): Promise<WrittenStory>;
  /** Returns DIRECTIONS only (speakers, emotions, cues) — the text comes from the approved story. */
  createAudioScript(input: AudioScriptInput): Promise<AudioDirection>;
}

export type ProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'OVERLOADED'
  /** Daily/plan quota used up on every configured model — retrying won't help today. */
  | 'QUOTA_EXHAUSTED'
  | 'BLOCKED'
  | 'MALFORMED_OUTPUT'
  | 'HTTP_ERROR'
  | 'NETWORK'
  | 'TIMEOUT';

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly stage?: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
