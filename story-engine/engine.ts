import { normalizeRequest } from './validation';
import type { GeneratedStory, StoryEvaluation, StoryPlan, StoryRequest } from './types';

/**
 * A story engine implementation. Today: MockStoryEngine. Later: a Gemini-backed engine
 * that runs on a server (never in the app) and returns the same shapes.
 */
export interface StoryEngine {
  /** Stage 1 — decide characters, structure and arc before any prose is written. */
  planStory(request: StoryRequest): Promise<StoryPlan>;
  /** Stage 2 — write the Marathi story and its ordered audio script from the plan. */
  writeStory(plan: StoryPlan): Promise<GeneratedStory>;
  /** Stage 3 — quality and safety gate. A story that fails is never shown to a child. */
  evaluateStory(story: GeneratedStory): Promise<StoryEvaluation>;
}

export class StoryRejectedError extends Error {
  constructor(public readonly evaluation: StoryEvaluation) {
    super('Story did not pass evaluation.');
    this.name = 'StoryRejectedError';
  }
}

export interface PipelineResult {
  story: GeneratedStory;
  evaluation: StoryEvaluation;
  attempts: number;
}

/** Runs plan → write → evaluate, retrying from a fresh plan if evaluation fails. */
export async function runStoryPipeline(
  engine: StoryEngine,
  request: StoryRequest,
  options: { maxAttempts?: number } = {},
): Promise<PipelineResult> {
  const maxAttempts = options.maxAttempts ?? 2;
  const normalized = normalizeRequest(request);
  let lastEvaluation: StoryEvaluation | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const plan = await engine.planStory(normalized);
    const story = await engine.writeStory(plan);
    const evaluation = await engine.evaluateStory(story);
    if (evaluation.passed) {
      return { story, evaluation, attempts: attempt };
    }
    lastEvaluation = evaluation;
  }

  throw new StoryRejectedError(lastEvaluation!);
}
