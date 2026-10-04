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
});
