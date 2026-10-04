/**
 * Text-to-speech actions (shared by local dev server and Supabase Edge Function).
 *
 *   { action: "tts-voices" }                       → audition voices
 *   { action: "tts-audition", voice }              → fixed sample paragraph in that voice
 *   { action: "tts-render", audioToken, chunk }    → one chunk of an APPROVED story
 *
 * tts-render only accepts an audioToken that this backend issued when it approved a story,
 * so Aaji can never be made to say arbitrary text.
 */
import { ProviderError } from '../story-engine/provider';
import { DEFAULT_TTS_VOICE, GeminiSpeechSynthesizer } from '../story-engine/providers/geminiTts';
import { AUDITION_CHUNK, AUDITION_VOICES, buildTtsChunks, DEFAULT_AAJI_STYLE } from '../story-engine/tts';
import type { AudioScript } from '../story-engine/types';
import { openJson, sealJson } from './continuation';

export interface TtsEnv {
  GEMINI_API_KEY?: string;
  TTS_MODEL?: string;
  TTS_FALLBACK_MODEL?: string;
  /** Aaji's prebuilt voice (default Sulafat). */
  TTS_VOICE?: string;
  /** Override Aaji's base voice direction. */
  TTS_STYLE?: string;
  STORY_STATE_SECRET?: string;
}

interface AudioTokenPayload {
  v: 1;
  title: string;
  script: AudioScript;
}

const PURPOSE = 'audio';
const secretOf = (env: TtsEnv) => env.STORY_STATE_SECRET || env.GEMINI_API_KEY || 'goshti-mock-provider';
const VOICE_RE = /^[A-Za-z]{2,24}$/;

export function chunksFor(script: AudioScript, env: TtsEnv) {
  return buildTtsChunks(script, { baseStyle: env.TTS_STYLE || DEFAULT_AAJI_STYLE });
}

/** Issued with every APPROVED story. */
export async function issueAudioToken(title: string, script: AudioScript, env: TtsEnv) {
  const token = await sealJson({ v: 1, title, script } satisfies AudioTokenPayload, secretOf(env), PURPOSE);
  return { audioToken: token, audioChunks: chunksFor(script, env).length, ttsAvailable: !!env.GEMINI_API_KEY };
}

export function isTtsAction(body: unknown): boolean {
  const a = (body as { action?: unknown } | null)?.action;
  return a === 'tts-voices' || a === 'tts-audition' || a === 'tts-render';
}

export async function handleTts(
  body: unknown,
  env: TtsEnv,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const b = (body ?? {}) as { action?: string; voice?: unknown; audioToken?: unknown; chunk?: unknown };
  const voice = typeof b.voice === 'string' && VOICE_RE.test(b.voice) ? b.voice : env.TTS_VOICE || DEFAULT_TTS_VOICE;

  if (b.action === 'tts-voices') {
    return { status: 200, body: { voices: AUDITION_VOICES, current: env.TTS_VOICE || DEFAULT_TTS_VOICE } };
  }
  if (!env.GEMINI_API_KEY) {
    return { status: 503, body: { status: 'FAILED', reason: 'GEMINI_API_KEY is not set — text-to-speech unavailable' } };
  }
  const tts = new GeminiSpeechSynthesizer({
    apiKey: env.GEMINI_API_KEY,
    model: env.TTS_MODEL,
    fallbackModels: env.TTS_FALLBACK_MODEL,
  });

  try {
    if (b.action === 'tts-audition') {
      const t0 = Date.now();
      const audio = await tts.synthesize(AUDITION_CHUNK, voice);
      return { status: 200, body: { voice, ...audio, ms: Date.now() - t0 } };
    }

    // tts-render
    const payload = await openJson<AudioTokenPayload>(b.audioToken, secretOf(env), PURPOSE);
    if (!payload || payload.v !== 1) return { status: 400, body: { status: 'INVALID_REQUEST', errors: ['invalid audioToken'] } };
    const chunks = chunksFor(payload.script, env);
    const index = Number(b.chunk);
    if (!Number.isInteger(index) || index < 0 || index >= chunks.length) {
      return { status: 400, body: { status: 'INVALID_REQUEST', errors: [`chunk must be 0–${chunks.length - 1}`] } };
    }
    const chunk = chunks[index];
    const t0 = Date.now();
    const audio = await tts.synthesize(chunk, voice);
    return {
      status: 200,
      body: {
        chunk: index,
        totalChunks: chunks.length,
        voice,
        ...audio,
        pauseAfterMs: chunk.pauseAfterMs,
        cues: chunk.cues,
        ms: Date.now() - t0,
      },
    };
  } catch (e) {
    const reason = e instanceof ProviderError ? `${e.code}: ${e.message}` : (e as Error).message;
    return { status: 503, body: { status: 'FAILED', reason } };
  }
}
