import { describe, expect, it } from 'vitest';

import { ProviderError } from '../provider';
import { GeminiProvider } from '../providers/gemini';
import { GeminiSpeechSynthesizer, PREFIX_PROMPT, readsTextVerbatim } from '../providers/geminiTts';
import {
  aiStudioAccess,
  explainGoogleError,
  googleAccessFromEnv,
  hasGoogleAccess,
  parseServiceAccount,
  vertexAccess,
  type ServiceAccountKey,
} from '../providers/googleAccess';
import type { TtsChunk } from '../tts';

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

async function makeKey(): Promise<{ key: ServiceAccountKey; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64(der).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  return { key: { client_email: 'goshti@test-project.iam.gserviceaccount.com', private_key: pem }, publicKey: pair.publicKey };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const gemini = (text: string) => json({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });

/** A fake Google: token endpoint + scripted model responses. Records every call. */
function fakeGoogle(modelReplies: ((url: string) => Response)[], tokens = ['tok-1', 'tok-2', 'tok-3']) {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  let t = 0;
  let m = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body ?? '') });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: tokens[t++], expires_in: 3600 });
    return modelReplies[Math.min(m++, modelReplies.length - 1)](url);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('Google access — Vertex AI', () => {
  it('reads a service-account key as JSON or base64, and never echoes it in errors', () => {
    const raw = JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----\n' });
    expect(parseServiceAccount(raw).client_email).toBe('a@b.iam.gserviceaccount.com');
    expect(parseServiceAccount(btoa(raw)).client_email).toBe('a@b.iam.gserviceaccount.com');
    try {
      parseServiceAccount('secret-looking-garbage-123');
      expect.unreachable();
    } catch (e) {
      expect((e as ProviderError).code).toBe('NOT_CONFIGURED');
      expect((e as Error).message).not.toContain('secret-looking-garbage');
    }
  });

  it('builds global and regional Vertex URLs (v1beta1 for speech)', () => {
    const g = vertexAccess({ project: 'goshti-prod', apiKey: 'k' });
    expect(g.generateContentUrl('gemini-3.8-flash')).toBe(
      'https://aiplatform.googleapis.com/v1/projects/goshti-prod/locations/global/publishers/google/models/gemini-3.8-flash:generateContent?key=k',
    );
    const r = vertexAccess({ project: 'goshti-prod', location: 'asia-south1', apiKey: 'k' });
    expect(r.generateContentUrl('gemini-2.5-flash-tts', { beta: true })).toBe(
      'https://asia-south1-aiplatform.googleapis.com/v1beta1/projects/goshti-prod/locations/asia-south1/publishers/google/models/gemini-2.5-flash-tts:generateContent?key=k',
    );
  });

  it('signs in with the service account (signed JWT), caches the token and refreshes it before expiry', async () => {
    const { key, publicKey } = await makeKey();
    let now = 1_800_000_000_000;
    const { fetchImpl, calls } = fakeGoogle([() => json({})]);
    const access = vertexAccess({ project: 'p', serviceAccount: key, fetchImpl, now: () => now });

    const [a, b] = await Promise.all([access.headers(), access.headers()]);
    expect(a.Authorization).toBe('Bearer tok-1');
    expect(b.Authorization).toBe('Bearer tok-1');
    expect(calls).toHaveLength(1); // one sign-in for both

    const form = new URLSearchParams(calls[0].body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h, c, sig] = form.get('assertion')!.split('.');
    expect(JSON.parse(fromB64url(h).toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(fromB64url(c).toString());
    expect(claims).toMatchObject({
      iss: key.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    });
    expect(claims.exp - claims.iat).toBe(3600);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, fromB64url(sig), new TextEncoder().encode(`${h}.${c}`));
    expect(valid).toBe(true);

    expect((await access.headers()).Authorization).toBe('Bearer tok-1'); // cached
    now += 3_590_000; // inside the last minute → refresh
    expect((await access.headers()).Authorization).toBe('Bearer tok-2');
  });

  it('reports a failed sign-in clearly without leaking the key', async () => {
    const { key } = await makeKey();
    const fetchImpl = (async () => json({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }, 400)) as typeof fetch;
    const access = vertexAccess({ project: 'p', serviceAccount: key, fetchImpl });
    await expect(access.headers()).rejects.toMatchObject({ code: 'NOT_CONFIGURED', message: 'Google sign-in failed: Invalid JWT Signature.' });
  });

  it('picks Vertex AI from the environment, and never silently falls back when half-configured', () => {
    expect(googleAccessFromEnv({})).toBeNull();
    expect(googleAccessFromEnv({ GEMINI_API_KEY: 'k' })?.kind).toBe('ai-studio');
    const v = googleAccessFromEnv({ GOOGLE_CLOUD_PROJECT: 'goshti-prod', VERTEX_API_KEY: 'v', GEMINI_API_KEY: 'k' });
    expect(v?.kind).toBe('vertex');
    expect(v?.label).toBe('Vertex AI (goshti-prod, global)');
    expect(() => googleAccessFromEnv({ GOOGLE_CLOUD_PROJECT: 'goshti-prod', GEMINI_API_KEY: 'k' })).toThrow(/GOOGLE_SERVICE_ACCOUNT_JSON or VERTEX_API_KEY/);
    expect(hasGoogleAccess({ GOOGLE_CLOUD_PROJECT: 'p' })).toBe(false);
    expect(hasGoogleAccess({ GOOGLE_CLOUD_PROJECT: 'p', VERTEX_API_KEY: 'v' })).toBe(true);
  });

  it('sends a Vertex API key in the query (as Google documents for Vertex), the AI Studio key as a header', async () => {
    const vertex = vertexAccess({ project: 'p', apiKey: 'vertex key' });
    expect(await vertex.headers()).toEqual({});
    expect(vertex.generateContentUrl('m')).toBe(
      'https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/m:generateContent?key=vertex%20key',
    );
    expect(await aiStudioAccess('ai-key').headers()).toEqual({ 'x-goog-api-key': 'ai-key' });
  });
});

describe('Google error hints', () => {
  it('explains the common Vertex sign-in mistakes in plain English', () => {
    expect(explainGoogleError('API keys are not supported by this API. Expected OAuth2 access token')).toMatch(/Authenticate API calls through a service account/);
    expect(explainGoogleError("Permission 'aiplatform.endpoints.predict' denied")).toMatch(/Vertex AI User/);
    expect(explainGoogleError('Vertex AI API has not been used in project goshti-prod before or it is disabled')).toMatch(/enable the Vertex AI API/);
    expect(explainGoogleError('something else')).toBe('something else');
  });
});

describe('story writing through Vertex AI', () => {
  const request = { age: 6 as const, category: 'animals' as const, mode: 'CUSTOM' as const, userIdea: 'हत्ती' };
  const intent = JSON.stringify({ intent: 'STORY_REQUEST', reason: 'ok' });

  it('calls the Vertex endpoint with the service-account token', async () => {
    const { key } = await makeKey();
    const { fetchImpl, calls } = fakeGoogle([() => gemini(intent)]);
    const provider = new GeminiProvider({ access: vertexAccess({ project: 'goshti-prod', serviceAccount: key, fetchImpl }), fetchImpl });
    expect(provider.name).toBe('gemini-vertex');
    expect((await provider.classifyIntent({ idea: 'हत्ती', request })).intent).toBe('STORY_REQUEST');
    const call = calls.find((c) => c.url.includes('aiplatform'))!;
    expect(call.url).toContain('/projects/goshti-prod/locations/global/publishers/google/models/gemini-3.5-flash-lite:generateContent');
    expect(call.headers.Authorization).toBe('Bearer tok-1');
    expect(call.headers['x-goog-api-key']).toBeUndefined();
  });

  it('moves to the next model when one is not offered on Vertex, and signs in again after a 401', async () => {
    const { key } = await makeKey();
    const { fetchImpl, calls } = fakeGoogle([
      () => json({ error: { message: 'Token expired' } }, 401),
      () => json({ error: { message: 'Publisher model not found' } }, 404),
      () => gemini(intent),
    ]);
    const provider = new GeminiProvider({ access: vertexAccess({ project: 'p', serviceAccount: key, fetchImpl }), fetchImpl, retryDelaysMs: [] });
    await provider.classifyIntent({ idea: 'हत्ती', request });
    const modelCalls = calls.filter((c) => c.url.includes('aiplatform'));
    expect(modelCalls.map((c) => c.headers.Authorization)).toEqual(['Bearer tok-1', 'Bearer tok-2', 'Bearer tok-2']);
    expect(modelCalls[1].url).toContain('gemini-3.5-flash-lite');
    expect(modelCalls[2].url).toContain('gemini-3.8-flash:generateContent');
  });
});

describe("Aaji's voice through Vertex AI", () => {
  const chunk: TtsChunk = {
    index: 0,
    parts: [
      { text: 'एक होता हत्ती.', style: 'Warm, slow grandmother storyteller' },
      { text: '"मला चंद्रावर जायचंय!"', style: 'Excited little elephant' },
    ],
    pauseAfterMs: 0,
    cues: [],
    cueAt: [],
  } as unknown as TtsChunk;
  const pcm = btoa(String.fromCharCode(...new Uint8Array(4800)));

  it('gives Gemini 3.8 the story text alone, with directions in speechMetadata (never read aloud)', async () => {
    const { fetchImpl, calls } = fakeGoogle([
      () => json({ error: { message: 'not found' } }, 404),
      () => json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm } }] } }] }),
    ]);
    const tts = new GeminiSpeechSynthesizer({ access: vertexAccess({ project: 'p', apiKey: 'v' }), fetchImpl });
    const out = await tts.synthesize(chunk, 'Aoede');
    expect(out.mimeType).toBe('audio/wav');
    expect(out.base64.startsWith('UklGR')).toBe(true);
    expect(out.model).toBe('gemini-3.8-flash-lite-tts');
    expect(calls[0].url).toContain('/v1beta1/projects/p/locations/global/publishers/google/models/gemini-3.8-flash-tts:generateContent');
    const body = JSON.parse(calls[1].body);
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
    expect(body.contents[0].parts).toEqual([
      { text: 'एक होता हत्ती.', speechMetadata: { style: 'Warm, slow grandmother storyteller' } },
      { text: '"मला चंद्रावर जायचंय!"', speechMetadata: { style: 'Excited little elephant' } },
    ]);
    // Nothing but the story goes in the spoken text.
    for (const part of body.contents[0].parts) expect(part.text).not.toMatch(/grandmother|elephant/i);
  });

  it('older speech models get the short documented prompt, Marathi language code and [pause] tags', async () => {
    const { fetchImpl, calls } = fakeGoogle([
      () => json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm } }] } }] }),
    ]);
    const tts = new GeminiSpeechSynthesizer({ access: vertexAccess({ project: 'p', apiKey: 'v' }), model: 'gemini-2.5-flash-tts', fetchImpl });
    await tts.synthesize({ ...chunk, parts: [{ text: 'एक होता हत्ती. <short pause> तो मोठा होता.', style: 'x' }] }, 'Aoede');
    const body = JSON.parse(calls[0].body);
    expect(body.contents[0].parts[0].text).toBe(`${PREFIX_PROMPT}: एक होता हत्ती. [short pause] तो मोठा होता.`);
    expect(body.generationConfig.speechConfig.languageCode).toBe('mr-IN');
  });

  it('never falls back to putting directions in a 3.8 model\'s text — it moves to the next model', async () => {
    const { fetchImpl, calls } = fakeGoogle([
      () => json({ error: { message: 'Invalid JSON payload received. Unknown name "speechMetadata"' } }, 400),
      () => json({ error: { message: 'Invalid JSON payload received. Unknown name "speechMetadata"' } }, 400),
      () => json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm } }] } }] }),
    ]);
    const tts = new GeminiSpeechSynthesizer({ access: vertexAccess({ project: 'p', apiKey: 'v' }), fetchImpl });
    const out = await tts.synthesize(chunk, 'Aoede');
    expect(out.model).toBe('gemini-2.5-flash-tts');
    expect(calls).toHaveLength(3);
    for (const c of calls.slice(0, 2)) expect(JSON.parse(c.body).contents[0].parts[0].text).toBe('एक होता हत्ती.');
  });

  it('knows which speech models read their text verbatim', () => {
    expect(readsTextVerbatim('gemini-3.8-flash-tts')).toBe(true);
    expect(readsTextVerbatim('gemini-3.8-flash-lite-tts')).toBe(true);
    expect(readsTextVerbatim('gemini-4-flash-tts')).toBe(true);
    expect(readsTextVerbatim('gemini-3.1-flash-tts-preview')).toBe(false);
    expect(readsTextVerbatim('gemini-2.5-pro-tts')).toBe(false);
  });

  it('says clearly when no speech model is available', async () => {
    const { fetchImpl } = fakeGoogle([() => json({ error: { message: 'not found' } }, 404)]);
    const tts = new GeminiSpeechSynthesizer({ access: vertexAccess({ project: 'p', apiKey: 'v' }), fetchImpl });
    await expect(tts.synthesize(chunk, 'Aoede')).rejects.toThrow(/No speech model available here/);
  });
});
