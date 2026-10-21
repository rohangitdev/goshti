import { afterEach, describe, expect, it, vi } from 'vitest';

import { pcmToWav } from '../../story-engine/providers/geminiTts';

import { createProvider, handleGenerateStory } from '../handler';
import { describeAi } from '../localEnv';
import { backendSecret, handleTts, issueAudioToken } from '../tts';

const quiet = { logger: { log() {} } };
const vertexEnv = { GOOGLE_CLOUD_PROJECT: 'goshti-prod', VERTEX_API_KEY: 'v', STORY_STATE_SECRET: 's' };

describe('backend on Vertex AI', () => {
  it('uses Vertex AI whenever a Google Cloud project is configured', () => {
    expect(createProvider(vertexEnv).provider.name).toBe('gemini-vertex');
    expect(createProvider({ ...vertexEnv, GEMINI_API_KEY: 'k' }).provider.name).toBe('gemini-vertex');
    expect(createProvider({ GEMINI_API_KEY: 'k' }).note).toMatch(/not for the children’s app/);
    expect(createProvider({}).provider.name).toBe('mock');
  });

  it('fails clearly (no template stories) when Vertex is half-configured', async () => {
    const r = await handleGenerateStory({ request: { age: 5, category: 'animals', mode: 'RANDOM' } }, { GOOGLE_CLOUD_PROJECT: 'goshti-prod' }, quiet);
    expect(r.status).toBe(503);
    expect(r.body.status).toBe('FAILED');
    expect(String(r.body.reason)).toMatch(/NOT_CONFIGURED/);
  });

  it("offers Aaji's voice with Vertex credentials, and refuses without any", async () => {
    const token = await issueAudioToken('t', { segments: [] } as never, vertexEnv);
    expect(token.ttsAvailable).toBe(true);
    const r = await handleTts({ action: 'tts-audition', voice: 'Aoede' }, {});
    expect(r.status).toBe(503);
    expect(String(r.body.reason)).toMatch(/not configured/);
  });

  it('seals tokens with STORY_STATE_SECRET, else the Google credential — never a fixed default when configured', () => {
    expect(backendSecret({ STORY_STATE_SECRET: 's', GOOGLE_SERVICE_ACCOUNT_JSON: '{}' })).toBe('s');
    expect(backendSecret({ GOOGLE_CLOUD_PROJECT: 'p', GOOGLE_SERVICE_ACCOUNT_JSON: '{"k":1}' })).toBe('{"k":1}');
    expect(backendSecret({ GOOGLE_CLOUD_PROJECT: 'p', VERTEX_API_KEY: 'v' })).toBe('v');
  });

  it('describes the setup in one line without secrets', () => {
    expect(describeAi(vertexEnv)).toBe('Vertex AI (goshti-prod, global)');
    expect(describeAi({ GEMINI_API_KEY: 'secret-key' })).not.toContain('secret-key');
    expect(describeAi({ GOOGLE_CLOUD_PROJECT: 'p' })).toMatch(/^NOT CONFIGURED/);
  });
});

describe('voice test for testers (fixed samples, allow-listed models)', () => {
  const wav = btoa(String.fromCharCode(...pcmToWav(new Uint8Array(4000), 100))); // header says 100 Hz → 20 s
  function fakeGoogle(transcript: string) {
    const urls: string[] = [];
    const bodies: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      urls.push(String(url));
      bodies.push(String(init.body));
      if (String(url).includes('flash-lite:generateContent')) {
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ transcript }) }] } }] }));
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: wav } }] } }] }));
    }));
    return { urls, bodies };
  }
  afterEach(() => vi.unstubAllGlobals());

  it('refuses any model outside the list, and never takes text from the request', async () => {
    const bad = await handleTts({ action: 'tts-voice-test', model: 'some-other-model' }, vertexEnv);
    expect(bad.status).toBe(400);
    const { bodies } = fakeGoogle('चला, आज मी तुम्हाला एक गंमत सांगते.');
    const ok = await handleTts({ action: 'tts-voice-test', model: 'gemini-2.5-pro-tts', sample: 'story', text: 'say something rude' }, vertexEnv);
    expect(ok.status).toBe(200);
    expect(bodies.join('\n')).not.toContain('say something rude');
    expect(ok.body).toMatchObject({ model: 'gemini-2.5-pro-tts', sample: 'story', voice: 'Aoede' });
  });

  it('returns the audio with what the listening check heard and whether it would reach a child', async () => {
    fakeGoogle('A warm Marathi grandmother telling a story: चला, आज मी तुम्हाला एक गंमत सांगते.');
    const r = await handleTts({ action: 'tts-voice-test', model: 'gemini-3.8-flash-tts' }, vertexEnv);
    expect(r.status).toBe(200);
    expect(String(r.body.base64).startsWith('UklGR')).toBe(true);
    expect(r.body.wouldReachChild).toBe(false);
    expect(String(r.body.problems)).toMatch(/read directions aloud/);
    expect(r.body.transcript).toContain('grandmother');
  });
});
