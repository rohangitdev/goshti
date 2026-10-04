import { describe, expect, it } from 'vitest';

import { CATEGORY_IDS } from '../categories';
import { generateStory } from '../pipeline';
import { MockStoryAIProvider } from '../providers/mock';
import { MESSAGES } from '../types';
import { evaluation, fakeProvider, storyOfWords } from './fixtures';

const random = { age: 6, category: 'adventure', mode: 'RANDOM' } as const;
const custom = { age: 6, category: 'adventure', mode: 'CUSTOM', userIdea: 'एका हत्तीला चंद्रावर जायचं आहे' } as const;

describe('story pipeline', () => {
  it('approves a story that passes the critic first time', async () => {
    const { provider, calls } = fakeProvider();
    const r = await generateStory(random, provider);
    expect(r.status).toBe('APPROVED');
    expect(calls).toEqual(['createPlan', 'generateStory', 'evaluateStory', 'createAudioScript']);
    if (r.status === 'APPROVED') {
      expect(r.story.attempts).toBe(1);
      expect(r.story.profileId).toBe('STORY_EXPLORER');
      expect(r.story.audioScript.segments.length).toBeGreaterThan(0);
      // Request is the source of truth, not the model.
      expect(r.story.plan.age).toBe(6);
      expect(r.story.plan.category).toBe('adventure');
    }
  });

  it('skips the classifier in RANDOM mode but runs it for CUSTOM ideas', async () => {
    const a = fakeProvider();
    await generateStory(random, a.provider);
    expect(a.calls).not.toContain('classifyIntent');
    const b = fakeProvider();
    await generateStory(custom, b.provider);
    expect(b.calls[0]).toBe('classifyIntent');
  });

  it('does a targeted rewrite with the critic feedback, then approves', async () => {
    const { provider, calls, rewriteInputs } = fakeProvider({ evaluations: [evaluation(6), evaluation(9)] });
    const r = await generateStory(random, provider);
    expect(r.status).toBe('APPROVED');
    expect(calls.filter((c) => c === 'rewriteStory')).toHaveLength(1);
    const input = rewriteInputs[0] as { failures: string[]; evaluation: { rewriteInstructions: string[] } };
    expect(input.failures.join()).toContain('engagement 6 < 8');
    expect(input.evaluation.rewriteInstructions).toContain('add a setback in paragraph 4');
    if (r.status === 'APPROVED') {
      expect(r.story.attempts).toBe(2);
      expect(r.story.title).toContain('(rewritten)');
      expect(r.trace.drafts.map((d) => d.kind)).toEqual(['DRAFT', 'REWRITE']);
    }
  });

  it('never serves a story that fails three times', async () => {
    const { provider, calls } = fakeProvider({ evaluations: [evaluation(5)] });
    const r = await generateStory(random, provider);
    expect(r.status).toBe('FAILED');
    expect(calls.filter((c) => c === 'evaluateStory')).toHaveLength(3);
    expect(calls).not.toContain('createAudioScript');
    expect('story' in r).toBe(false);
  });

  it('fails a story with any blocking flag even if scores are high', async () => {
    const { provider } = fakeProvider({ evaluations: [evaluation(10, { tooScary: true })] });
    const r = await generateStory(random, provider, { maxAttempts: 1 });
    expect(r.status).toBe('FAILED');
  });

  it('fails a story far too short for the profile', async () => {
    const { provider } = fakeProvider({ story: storyOfWords(40) });
    const r = await generateStory(random, provider, { maxAttempts: 1 });
    expect(r.status).toBe('FAILED');
    expect(r.trace.critiques[0].failures.join()).toContain('too short');
  });

  it('returns the fixed message for OTHER, without planning', async () => {
    const { provider, calls } = fakeProvider({ intent: 'OTHER' });
    const r = await generateStory(custom, provider);
    expect(r).toMatchObject({ status: 'NOT_A_STORY', message: MESSAGES.NOT_A_STORY });
    expect(calls).toEqual(['classifyIntent']);
  });

  it('never turns an UNSAFE request into a story', async () => {
    const { provider, calls } = fakeProvider({ intent: 'UNSAFE' });
    const r = await generateStory(custom, provider);
    expect(r.status).toBe('UNSAFE');
    expect(calls).not.toContain('generateStory');
  });

  it('rejects invalid requests before any AI call', async () => {
    const { provider, calls } = fakeProvider();
    const r = await generateStory({ age: 12, category: 'adventure', mode: 'RANDOM' }, provider);
    expect(r.status).toBe('INVALID_REQUEST');
    expect(calls).toEqual([]);
  });

  it('falls back to a deterministic audio script if the director drops text', async () => {
    const { provider } = fakeProvider({ audio: { segments: [{ type: 'NARRATION', text: 'फक्त एक ओळ.' }] } });
    const r = await generateStory(random, provider);
    expect(r.status).toBe('APPROVED');
    expect(r.trace.audioScriptWarnings.join()).toContain('fallback');
  });

  it('keeps an approved story even if the audio director errors', async () => {
    const { provider } = fakeProvider({ audio: new Error('boom') });
    const r = await generateStory(random, provider);
    expect(r.status).toBe('APPROVED');
  });

  it('stops cleanly when the time budget runs out', async () => {
    let t = 0;
    const { provider } = fakeProvider({ evaluations: [evaluation(5)] });
    const r = await generateStory(random, provider, { timeBudgetMs: 100, now: () => (t += 30) });
    expect(r.status).toBe('FAILED');
    expect(r.trace.errors.join()).toContain('time budget');
  });

  it('records a full trace for the developer tester', async () => {
    const { provider } = fakeProvider({ evaluations: [evaluation(6), evaluation(9)] });
    const r = await generateStory(custom, provider);
    const t = r.trace;
    expect(t.intent?.intent).toBe('STORY_REQUEST');
    expect(t.profile?.id).toBe('STORY_EXPLORER');
    expect(t.plan).toBeDefined();
    expect(t.critiques).toHaveLength(2);
    expect(t.finalStory).toBeDefined();
    expect(t.audioScript).toBeDefined();
    expect(t.timings.map((x) => x.stage)).toContain('rewriteStory');
    expect(t.attemptCount).toBe(2);
    expect(JSON.stringify(t)).not.toMatch(/api[_-]?key/i);
  });

  it('mock provider approves every category at every age', async () => {
    const provider = new MockStoryAIProvider();
    for (const category of CATEGORY_IDS) {
      for (let age = 2; age <= 9; age++) {
        const r = await generateStory({ age, category, mode: 'RANDOM', childName: 'Riya' }, provider, { enforceLength: false });
        expect(r.status, `${category} age ${age}: ${'reason' in r ? r.reason : ''}`).toBe('APPROVED');
      }
    }
  });

  it('mock provider declines questions', async () => {
    const r = await generateStory(
      { age: 7, category: 'adventure', mode: 'CUSTOM', userIdea: 'भारताची राजधानी कोणती?' },
      new MockStoryAIProvider(),
      { enforceLength: false },
    );
    expect(r.status).toBe('NOT_A_STORY');
  });
});
