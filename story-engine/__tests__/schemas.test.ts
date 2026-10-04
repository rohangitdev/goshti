import { describe, expect, it } from 'vitest';

import {
  RawAudioScriptSchema,
  StoryEvaluationSchema,
  StoryPlanSchema,
  toModelJsonSchema,
  WrittenStorySchema,
} from '../schemas';
import { evaluation, samplePlan } from './fixtures';

describe('structured schemas', () => {
  it('accepts a valid StoryPlan', () => {
    expect(StoryPlanSchema.safeParse(samplePlan).success).toBe(true);
  });

  it('rejects a StoryPlan missing required fields', () => {
    const { goal: _goal, ...rest } = samplePlan;
    expect(StoryPlanSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an invalid voice style', () => {
    const bad = { ...samplePlan, mainCharacter: { ...samplePlan.mainCharacter, voiceStyle: 'BARITONE' } };
    expect(StoryPlanSchema.safeParse(bad).success).toBe(false);
  });

  it('validates evaluations: scores must be 0–10, all checks present', () => {
    expect(StoryEvaluationSchema.safeParse(evaluation(9)).success).toBe(true);
    const tooHigh = evaluation(9);
    tooHigh.scores.engagement = 11;
    expect(StoryEvaluationSchema.safeParse(tooHigh).success).toBe(false);
    const missing = evaluation(9) as { checks: Record<string, boolean> };
    delete missing.checks.tooScary;
    expect(StoryEvaluationSchema.safeParse(missing).success).toBe(false);
  });

  it('validates written stories and audio scripts', () => {
    expect(WrittenStorySchema.safeParse({ title: 'अ', storyText: 'ब' }).success).toBe(true);
    expect(WrittenStorySchema.safeParse({ title: 'अ' }).success).toBe(false);
    expect(RawAudioScriptSchema.safeParse({ segments: [{ type: 'PAUSE', durationMs: 500 }] }).success).toBe(true);
    expect(RawAudioScriptSchema.safeParse({ segments: [{ type: 'SING' }] }).success).toBe(false);
  });

  it('produces a model JSON schema without unsupported keywords', () => {
    for (const schema of [StoryPlanSchema, StoryEvaluationSchema, WrittenStorySchema, RawAudioScriptSchema]) {
      const text = JSON.stringify(toModelJsonSchema(schema));
      expect(text).not.toContain('$schema');
      expect(text).not.toContain('oneOf');
      expect(text).not.toContain('minLength');
      expect(text).toContain('"properties"');
    }
  });
});
