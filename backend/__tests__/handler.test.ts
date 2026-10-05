import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleGenerateStory } from '../handler';

const quiet = { logger: { log() {} } };

describe('backend handler', () => {
  it('uses the mock provider when GEMINI_API_KEY is missing', async () => {
    const r = await handleGenerateStory({ request: { age: 5, category: 'bedtime', mode: 'RANDOM' } }, {}, quiet);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('APPROVED');
    expect((r.body.provider as { name: string; note?: string }).name).toBe('mock');
    expect((r.body.provider as { note?: string }).note).toContain('GEMINI_API_KEY');
  });

  it('returns the trace only when debug is requested and allowed', async () => {
    const req = { request: { age: 5, category: 'bedtime', mode: 'RANDOM' } };
    expect((await handleGenerateStory(req, {}, quiet)).body.trace).toBeUndefined();
    expect((await handleGenerateStory({ ...req, debug: true }, {}, quiet)).body.trace).toBeDefined();
    expect((await handleGenerateStory({ ...req, debug: true }, { STORY_DEBUG: 'false' }, quiet)).body.trace).toBeUndefined();
  });

  it('with STORY_DEBUG_TOKEN set, only callers sending the token get the trace (the app never does)', async () => {
    const request = { age: 5, category: 'animals', mode: 'RANDOM' };
    const env = { STORY_DEBUG_TOKEN: 'qa-secret' };
    const quiet = { logger: { log: () => {} } };
    const app = await handleGenerateStory({ request, debug: true }, env, quiet);
    const qa = await handleGenerateStory({ request, debug: true, debugToken: 'qa-secret' }, env, quiet);
    expect('trace' in app.body).toBe(false);
    expect('trace' in qa.body).toBe(true);
  });

  it('rejects invalid requests with 400', async () => {
    const r = await handleGenerateStory({ request: { age: 1, category: 'bedtime', mode: 'RANDOM' } }, {}, quiet);
    expect(r.status).toBe(400);
    expect(r.body.status).toBe('INVALID_REQUEST');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses Gemini when a key is set, and never echoes the key (even on errors)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 403 })),
    );
    const r = await handleGenerateStory(
      { request: { age: 5, category: 'bedtime', mode: 'RANDOM' }, debug: true },
      { GEMINI_API_KEY: 'top-secret-key', GEMINI_MODEL: 'gemini-test' },
      quiet,
    );
    expect(r.status).toBe(503);
    expect(r.body.status).toBe('FAILED');
    expect((r.body.provider as { name: string }).name).toBe('gemini');
    expect(JSON.stringify(r.body)).not.toContain('top-secret-key');
  });

  it('splits a real-AI story into short steps and finishes with continuations', async () => {
    const { samplePlan, storyOfWords, evaluation } = await import('../../story-engine/__tests__/fixtures');
    const story = storyOfWords(520);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const system: string = body.systemInstruction.parts[0].text;
        const reply = system.includes('hidden children') ? samplePlan
          : system.includes('principal story writer') ? story
          : system.includes('Story Critic') ? evaluation(9)
          : system.includes('Audio Story Director') ? { segments: story.storyText.split('\n\n').map((t) => ({ type: 'NARRATION', text: t })) }
          : { intent: 'STORY_REQUEST', reason: 'idea' };
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] }));
      }),
    );
    const env = { GEMINI_API_KEY: 'k', STORY_SLICE_MS: '0' };
    let r = await handleGenerateStory({ request: { age: 6, category: 'adventure', mode: 'CUSTOM', userIdea: 'एक मांजर क्रिकेट खेळतं' } }, env, quiet);
    const phases: string[] = [];
    while (r.status === 202) {
      phases.push(String(r.body.phase));
      expect(typeof r.body.progressLabel).toBe('string');
      r = await handleGenerateStory({ continuation: r.body.continuation }, env, quiet);
    }
    expect(phases).toEqual(['PLAN', 'WRITE', 'EVALUATE', 'AUDIO']);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('APPROVED');
  });

  it('rejects a forged continuation', async () => {
    const r = await handleGenerateStory({ continuation: 'v1.AAAA' }, { GEMINI_API_KEY: 'k' }, quiet);
    expect(r.status).toBe(400);
  });
});
