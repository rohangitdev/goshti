import { describe, expect, it } from 'vitest';

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
