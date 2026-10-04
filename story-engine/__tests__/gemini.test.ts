import { describe, expect, it } from 'vitest';

import { ProviderError } from '../provider';
import { extractJson, GeminiProvider, isQuotaExhausted, parseRetryDelayMs } from '../providers/gemini';
import { resolveProfile } from '../profiles';
import type { StoryRequest } from '../schemas';
import { samplePlan } from './fixtures';

const request: StoryRequest = { age: 6, category: 'animals', mode: 'CUSTOM', userIdea: 'एक मांजर क्रिकेट खेळतं' };

function geminiResponse(text: string, extra: Record<string, unknown> = {}) {
  return { candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text }] }, finishReason: 'STOP' }], ...extra };
}

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const requests: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    requests.push({ url, init, body: JSON.parse(String(init.body)) });
    const r = responses.shift();
    if (!r) throw new Error('no more fake responses');
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, requests };
}

describe('extractJson', () => {
  it('handles fences and stray prose', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":2} thanks')).toEqual({ a: 2 });
    expect(() => extractJson('no json')).toThrow();
  });
});

describe('GeminiProvider', () => {
  it('refuses to start without an API key', () => {
    expect(() => new GeminiProvider({ apiKey: '' })).toThrow(ProviderError);
  });

  it('sends the key as a header (never in the URL), strict safety settings and a JSON schema', async () => {
    const { impl, requests } = fakeFetch([{ body: geminiResponse('{"intent":"STORY_REQUEST","reason":"idea"}') }]);
    const p = new GeminiProvider({ apiKey: 'secret-key', fastModel: 'gemini-test', fetchImpl: impl });
    const r = await p.classifyIntent({ idea: request.userIdea!, request });
    expect(r.intent).toBe('STORY_REQUEST');
    const req = requests[0];
    expect(req.url).toContain('/models/gemini-test:generateContent');
    expect(req.url).not.toContain('secret-key');
    expect((req.init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    expect(req.body.safetySettings).toBeDefined();
    const config = req.body.generationConfig as Record<string, unknown>;
    expect(config.responseMimeType).toBe('application/json');
    expect(config.responseJsonSchema).toBeDefined();
  });

  it('repairs malformed output once, then succeeds', async () => {
    const { impl, requests } = fakeFetch([
      { body: geminiResponse('{"title": "अ"}') },
      { body: geminiResponse('{"title":"अ","storyText":"ब"}') },
    ]);
    const p = new GeminiProvider({ apiKey: 'k', fetchImpl: impl });
    const story = await p.generateStory({ request, profile: resolveProfile(6), plan: samplePlan });
    expect(story).toEqual({ title: 'अ', storyText: 'ब' });
    const contents = requests[1].body.contents as unknown[];
    expect(contents).toHaveLength(3); // user, model (bad output), user (repair request)
  });

  it('reports token usage per call (for cost diagnostics), including repair calls', async () => {
    const usage = { usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, thoughtsTokenCount: 50 } };
    const { impl } = fakeFetch([
      { body: geminiResponse('{"title": "अ"}', usage) },
      { body: geminiResponse('{"title":"अ","storyText":"ब"}', usage) },
    ]);
    const p = new GeminiProvider({ apiKey: 'k', fetchImpl: impl });
    await p.generateStory({ request, profile: resolveProfile(6), plan: samplePlan });
    const taken = p.takeUsage();
    expect(taken).toHaveLength(2);
    expect(taken[0]).toMatchObject({ stage: 'generateStory', inputTokens: 1200, outputTokens: 300, thinkingTokens: 50 });
    expect(p.takeUsage()).toEqual([]);
  });

  it('fails with MALFORMED_OUTPUT after two bad responses', async () => {
    const { impl } = fakeFetch([{ body: geminiResponse('not json') }, { body: geminiResponse('{"x":1}') }]);
    const p = new GeminiProvider({ apiKey: 'k', fetchImpl: impl });
    await expect(p.generateStory({ request, profile: resolveProfile(6), plan: samplePlan })).rejects.toMatchObject({
      code: 'MALFORMED_OUTPUT',
    });
  });

  it('treats a safety-blocked classification as UNSAFE', async () => {
    const { impl } = fakeFetch([{ body: { promptFeedback: { blockReason: 'SAFETY' } } }]);
    const p = new GeminiProvider({ apiKey: 'k', fetchImpl: impl });
    const r = await p.classifyIntent({ idea: 'x', request });
    expect(r.intent).toBe('UNSAFE');
  });

  it('retries without responseJsonSchema if the model rejects the schema', async () => {
    const { impl, requests } = fakeFetch([
      { status: 400, body: { error: { message: 'Invalid JSON schema: unsupported keyword' } } },
      { body: geminiResponse('{"intent":"OTHER","reason":"question"}') },
    ]);
    const p = new GeminiProvider({ apiKey: 'k', fetchImpl: impl });
    expect((await p.classifyIntent({ idea: 'x', request })).intent).toBe('OTHER');
    expect((requests[1].body.generationConfig as Record<string, unknown>).responseJsonSchema).toBeUndefined();
  });

  it('reports other HTTP errors without leaking the key', async () => {
    const { impl } = fakeFetch([{ status: 403, body: { error: { message: 'API key not valid' } } }]);
    const p = new GeminiProvider({ apiKey: 'super-secret', fetchImpl: impl });
    const err = await p.createPlan({ request, profile: resolveProfile(6), ingredients: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('HTTP_ERROR');
    expect(String(err.message)).not.toContain('super-secret');
  });

  it('retries when Google reports high demand, then switches to the fallback model', async () => {
    const busy = { status: 503, body: { error: { message: 'This model is currently experiencing high demand.' } } };
    const { impl, requests } = fakeFetch([busy, busy, busy, busy, { body: geminiResponse('{"title":"अ","storyText":"ब"}') }]);
    const p = new GeminiProvider({ apiKey: 'k', model: 'main', fallbackModel: 'backup', retryDelaysMs: [0, 0, 0], fetchImpl: impl });
    const story = await p.generateStory({ request, profile: resolveProfile(6), plan: samplePlan });
    expect(story.title).toBe('अ');
    expect(requests.slice(0, 4).every((r) => r.url.includes('/models/main:'))).toBe(true);
    expect(requests[4].url).toContain('/models/backup:');
    expect(p.modelUsedFor('generateStory')).toBe('backup');
  });

  it('gives up with OVERLOADED when the fallback is busy too', async () => {
    const busy = { status: 503, body: { error: { message: 'high demand' } } };
    const { impl } = fakeFetch(Array.from({ length: 10 }, () => busy));
    const p = new GeminiProvider({ apiKey: 'k', model: 'main', fallbackModel: 'backup', retryDelaysMs: [0, 0], fetchImpl: impl });
    await expect(p.generateStory({ request, profile: resolveProfile(6), plan: samplePlan })).rejects.toMatchObject({
      code: 'OVERLOADED',
    });
  });

  it('can disable the fallback model', async () => {
    const busy = { status: 503, body: { error: { message: 'high demand' } } };
    const { impl, requests } = fakeFetch(Array.from({ length: 10 }, () => busy));
    const p = new GeminiProvider({ apiKey: 'k', model: 'main', fallbackModel: 'none', retryDelaysMs: [0], fetchImpl: impl });
    await expect(p.generateStory({ request, profile: resolveProfile(6), plan: samplePlan })).rejects.toBeInstanceOf(ProviderError);
    expect(requests.every((r) => r.url.includes('/models/main:'))).toBe(true);
  });

  it('recognises daily quota errors', () => {
    const daily = 'You exceeded your current quota ... metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20 Please retry in 13h52m16.019s.';
    expect(parseRetryDelayMs(daily)).toBe(((13 * 60 + 52) * 60 + 16.019) * 1000);
    expect(isQuotaExhausted(daily)).toBe(true);
    expect(isQuotaExhausted('Resource exhausted. Please retry in 12s.')).toBe(false);
  });

  it('skips a model with exhausted daily quota immediately (no retries) and uses the next one', async () => {
    const quota = { status: 429, body: { error: { message: 'You exceeded your current quota. Quota exceeded for metric: free_tier_requests. Please retry in 13h1m2s.' } } };
    const { impl, requests } = fakeFetch([quota, { body: geminiResponse('{"title":"अ","storyText":"ब"}') }]);
    const p = new GeminiProvider({ apiKey: 'k', model: 'quota-model-a', fallbackModel: 'next-model-a', retryDelaysMs: [5000, 5000], fetchImpl: impl });
    const t0 = Date.now();
    await p.generateStory({ request, profile: resolveProfile(6), plan: samplePlan });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(requests.map((r) => r.url.split('/models/')[1].split(':')[0])).toEqual(['quota-model-a', 'next-model-a']);

    // A later call goes straight to the next model (quota remembered).
    const second = fakeFetch([{ body: geminiResponse('{"title":"क","storyText":"ख"}') }]);
    const p2 = new GeminiProvider({ apiKey: 'k', model: 'quota-model-a', fallbackModel: 'next-model-a', fetchImpl: second.impl });
    await p2.generateStory({ request, profile: resolveProfile(6), plan: samplePlan });
    expect(second.requests[0].url).toContain('/models/next-model-a:');
  });

  it('reports QUOTA_EXHAUSTED when every model is out of quota', async () => {
    const quota = { status: 429, body: { error: { message: 'Quota exceeded for metric: free_tier_requests. Please retry in 5h.' } } };
    const { impl } = fakeFetch([quota, quota, quota]);
    const p = new GeminiProvider({ apiKey: 'k', model: 'quota-model-b', fallbackModel: 'quota-model-c', fetchImpl: impl });
    await expect(p.generateStory({ request, profile: resolveProfile(6), plan: samplePlan })).rejects.toMatchObject({
      code: 'QUOTA_EXHAUSTED',
    });
  });

  it('sends per-stage thinking levels and drops them if the model rejects them', async () => {
    const { impl, requests } = fakeFetch([
      { status: 400, body: { error: { message: 'thinking_level is not supported for this model' } } },
      { body: geminiResponse('{"intent":"STORY_REQUEST","reason":"x"}') },
    ]);
    const p = new GeminiProvider({ apiKey: 'k', fetchImpl: impl });
    await p.classifyIntent({ idea: 'x', request });
    expect((requests[0].body.generationConfig as Record<string, unknown>).thinkingConfig).toEqual({ thinkingLevel: 'low' });
    expect((requests[1].body.generationConfig as Record<string, unknown>).thinkingConfig).toBeUndefined();
  });

  it('allows per-role model overrides', () => {
    const p = new GeminiProvider({ apiKey: 'k', model: 'base', writerModel: 'writer', criticModel: 'critic' });
    expect(p.models.generateStory).toBe('writer');
    expect(p.models.evaluateStory).toBe('critic');
    expect(p.models.classifyIntent).toBe('gemini-3.5-flash-lite'); // fast model for mechanical stages
    expect(p.models.createAudioScript).toBe('gemini-3.5-flash-lite');
  });

  it('never lets writer or critic fall back to a lite model', async () => {
    const busy = { status: 503, body: { error: { message: 'high demand' } } };
    const { impl, requests } = fakeFetch(Array.from({ length: 10 }, () => busy));
    const p = new GeminiProvider({
      apiKey: 'k',
      model: 'strong-x',
      fallbackModel: 'tiny-lite-x,strong-y',
      retryDelaysMs: [0],
      fetchImpl: impl,
    });
    await expect(p.evaluateStory({ request, profile: resolveProfile(6), plan: samplePlan, story: { title: 'अ', storyText: 'ब' } })).rejects.toBeInstanceOf(ProviderError);
    const used = new Set(requests.map((r) => r.url.split('/models/')[1].split(':')[0]));
    expect([...used]).toEqual(['strong-x', 'strong-y']);
  });
});
