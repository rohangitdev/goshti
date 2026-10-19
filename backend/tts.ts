/**
 * Text-to-speech actions (shared by local dev server and Supabase Edge Function).
 *
 *   { action: "tts-voices" }                       → audition voices
 *   { action: "tts-audition", voice }              → fixed sample paragraph in that voice
 *   { action: "tts-render", audioToken, chunk }    → one chunk of an APPROVED story
 *   { action: "library-voice", id, age }           → audio token for a built-in library story
 *
 * tts-render only accepts an audioToken that this backend issued when it approved a story,
 * so Aaji can never be made to say arbitrary text.
 *
 * This is GOSHTI's audio story service: app → backend → here → TTSProvider (Gemini on Vertex AI).
 * Aaji is always a prebuilt synthetic voice (see resolveAajiVoice) — no voice cloning.
 */
import { ProviderError } from '../story-engine/provider';
import { googleAccessFromEnv, hasGoogleAccess, type GoogleEnv } from '../story-engine/providers/googleAccess';
import { DEFAULT_TTS_VOICE, GeminiSpeechSynthesizer } from '../story-engine/providers/geminiTts';
import { GeminiSpeechListener } from '../story-engine/providers/geminiListen';
import { CheckedSpeechSynthesizer } from '../story-engine/speechCheck';
import { AUDITION_CHUNK, AUDITION_VOICES, buildTtsChunks, DEFAULT_AAJI_STYLE } from '../story-engine/tts';
import { resolveAajiVoice, SynthesizerTTSProvider, type TTSProvider } from '../story-engine/ttsProvider';
import { findLibraryStory, libraryAudioScript } from '../story-engine/library';
import type { AudioScript } from '../story-engine/types';
import { openJson, sealJson } from './continuation';

export interface TtsEnv extends GoogleEnv {
  TTS_MODEL?: string;
  TTS_FALLBACK_MODEL?: string;
  /** Aaji's prebuilt voice (default Aoede). Must be a prebuilt voice name. */
  TTS_VOICE?: string;
  /** Override Aaji's base voice direction. */
  TTS_STYLE?: string;
  /**
   * Listening check on every rendered part (see story-engine/speechCheck.ts). On by default;
   * "off" keeps only the length check — for diagnosis, never for the children's app.
   */
  TTS_CHECK?: string;
  /** Model that listens to the audio (default gemini-3.5-flash-lite). */
  TTS_CHECK_MODEL?: string;
  STORY_STATE_SECRET?: string;
}

interface AudioTokenPayload {
  v: 1;
  title: string;
  script: AudioScript;
  /** Child's age — younger listeners get extra pauses between sentences. */
  age?: number;
}

const PURPOSE = 'audio';

/**
 * Secret for sealed tokens (story continuations, audio tokens). Set STORY_STATE_SECRET in
 * production; otherwise it's derived from whichever Google credential is configured.
 */
export function backendSecret(env: TtsEnv): string {
  return (
    env.STORY_STATE_SECRET ||
    env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    env.VERTEX_API_KEY ||
    env.GEMINI_API_KEY ||
    'goshti-mock-provider'
  );
}
const secretOf = backendSecret;

export function chunksFor(script: AudioScript, env: TtsEnv, age?: number) {
  return buildTtsChunks(script, {
    baseStyle: env.TTS_STYLE || DEFAULT_AAJI_STYLE,
    sentencePauses: age !== undefined && age <= 5,
  });
}

/** Issued with every APPROVED story. */
export async function issueAudioToken(title: string, script: AudioScript, env: TtsEnv, age?: number) {
  const token = await sealJson({ v: 1, title, script, age } satisfies AudioTokenPayload, secretOf(env), PURPOSE);
  return { audioToken: token, audioChunks: chunksFor(script, env, age).length, ttsAvailable: hasGoogleAccess(env) };
}

/**
 * The TTS provider behind Aaji's voice. Swap providers here (the app is unaffected).
 * Every part is checked (length + listening) before it leaves the backend.
 */
export function createTtsProvider(env: TtsEnv, log: (line: string) => void = console.log): TTSProvider {
  const access = googleAccessFromEnv(env);
  if (!access) throw new ProviderError('NOT_CONFIGURED', 'text-to-speech is not configured (set up Vertex AI)');
  const listener = env.TTS_CHECK === 'off' ? null : new GeminiSpeechListener({ access, model: env.TTS_CHECK_MODEL });
  return new SynthesizerTTSProvider(
    new CheckedSpeechSynthesizer(
      new GeminiSpeechSynthesizer({ access, model: env.TTS_MODEL, fallbackModels: env.TTS_FALLBACK_MODEL }),
      listener,
      { log },
    ),
    env.TTS_STYLE || DEFAULT_AAJI_STYLE,
  );
}

export function isTtsAction(body: unknown): boolean {
  const a = (body as { action?: unknown } | null)?.action;
  return a === 'tts-voices' || a === 'tts-audition' || a === 'tts-render' || a === 'library-voice';
}

export async function handleTts(
  body: unknown,
  env: TtsEnv,
  log?: (line: string) => void,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const b = (body ?? {}) as { action?: string; voice?: unknown; audioToken?: unknown; chunk?: unknown; id?: unknown; age?: unknown };
  const voice = resolveAajiVoice(b.voice, env.TTS_VOICE || DEFAULT_TTS_VOICE);

  if (b.action === 'library-voice') {
    // Library stories are known to the server, so only an id is accepted — never text.
    const story = typeof b.id === 'string' ? findLibraryStory(b.id) : undefined;
    if (!story) return { status: 404, body: { status: 'INVALID_REQUEST', errors: ['unknown library story'] } };
    const age = Number(b.age);
    return { status: 200, body: await issueAudioToken(story.title, libraryAudioScript(story, Number.isFinite(age) ? age : undefined), env, Number.isFinite(age) ? age : undefined) };
  }

  if (b.action === 'tts-voices') {
    return { status: 200, body: { voices: AUDITION_VOICES, current: env.TTS_VOICE || DEFAULT_TTS_VOICE } };
  }
  if (!hasGoogleAccess(env)) {
    return { status: 503, body: { status: 'FAILED', reason: 'text-to-speech is not configured (set up Vertex AI)' } };
  }

  try {
    const tts = createTtsProvider(env, log);
    if (b.action === 'tts-audition') {
      const t0 = Date.now();
      const audio = await tts.synthesizeScene(AUDITION_CHUNK, voice);
      return { status: 200, body: { voice, ...audio, ms: Date.now() - t0 } };
    }

    // tts-render
    const payload = await openJson<AudioTokenPayload>(b.audioToken, secretOf(env), PURPOSE);
    if (!payload || payload.v !== 1) return { status: 400, body: { status: 'INVALID_REQUEST', errors: ['invalid audioToken'] } };
    const chunks = chunksFor(payload.script, env, payload.age);
    const index = Number(b.chunk);
    if (!Number.isInteger(index) || index < 0 || index >= chunks.length) {
      return { status: 400, body: { status: 'INVALID_REQUEST', errors: [`chunk must be 0–${chunks.length - 1}`] } };
    }
    const chunk = chunks[index];
    const t0 = Date.now();
    const audio = await tts.synthesizeScene(chunk, voice);
    return {
      status: 200,
      body: {
        chunk: index,
        totalChunks: chunks.length,
        voice,
        ...audio,
        pauseAfterMs: chunk.pauseAfterMs,
        cues: chunk.cues,
        cueAt: chunk.cueAt,
        ms: Date.now() - t0,
      },
    };
  } catch (e) {
    const reason = e instanceof ProviderError ? `${e.code}: ${e.message}` : (e as Error).message;
    return { status: 503, body: { status: 'FAILED', reason } };
  }
}
