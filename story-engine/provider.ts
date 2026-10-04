import type { DevelopmentalProfile } from './profiles';
import type { IntentResult, RawAudioScript, StoryEvaluation, StoryPlan, StoryRequest, WrittenStory } from './schemas';
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
export interface StoryAIProvider {
  readonly name: string;
  /** Model used per operation, for the developer trace. */
  readonly models: Record<string, string>;
  /** Model that actually served a stage (after any fallback). Optional. */
  modelUsedFor?(stage: string): string | undefined;
  classifyIntent(input: { idea: string; request: StoryRequest }): Promise<IntentResult>;
  createPlan(input: PlanInput): Promise<StoryPlan>;
  generateStory(input: WriteInput): Promise<WrittenStory>;
  evaluateStory(input: EvaluateInput): Promise<StoryEvaluation>;
  rewriteStory(input: RewriteInput): Promise<WrittenStory>;
  createAudioScript(input: AudioScriptInput): Promise<RawAudioScript>;
}

export type ProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'OVERLOADED'
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
