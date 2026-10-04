import { describe, expect, it } from 'vitest';

import { ProviderError } from '../provider';
import { extractJson, GeminiProvider } from '../providers/gemini';
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
    const p = new GeminiProvider({ apiKey: 'secret-key', model: 'gemini-test', fetchImpl: impl });
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

  it('allows per-role model overrides', () => {
    const p = new GeminiProvider({ apiKey: 'k', model: 'base', writerModel: 'writer', criticModel: 'critic' });
    expect(p.models.generateStory).toBe('writer');
    expect(p.models.evaluateStory).toBe('critic');
    expect(p.models.classifyIntent).toBe('base');
  });
});
