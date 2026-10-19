/**
 * Gemini text-to-speech — BACKEND ONLY. One request per TtsChunk.
 * - Vertex AI (the app): generateContent on a speech model.
 *   Gemini 3.8+ speech models read the text field VERBATIM, so Aaji's directions go in each
 *   part's `speechMetadata.style` — never in the text (or she reads them out loud).
 *   Older speech models (3.1 / 2.5) take Google's documented "{prompt}: {text}" form instead.
 * - AI Studio (experiments): the Interactions API; each line carries its own style.
 */
import { ProviderError } from '../provider';
import type { SpeechSynthesizer, TtsChunk } from '../tts';
import { aiStudioAccess, explainGoogleError, type GoogleAccess } from './googleAccess';

export const DEFAULT_TTS_MODEL = 'gemini-3.8-flash-tts';
export const DEFAULT_TTS_FALLBACKS = ['gemini-3.8-flash-lite-tts'];
/** On Vertex AI: the same model as AI Studio first, then the older speech models Google Cloud lists. */
export const VERTEX_TTS_FALLBACKS = ['gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-tts'];

/** Short direction for older speech models, which take "{prompt}: {text}" (Google's documented form). */
export const PREFIX_PROMPT = 'Read this Marathi story aloud slowly and warmly, like a loving grandmother telling it to a small child';

/** Gemini 3.8 and newer read `text` verbatim and take directions in speechMetadata. */
export function readsTextVerbatim(model: string): boolean {
  const m = /^gemini-(\d+)(?:\.(\d+))?/.exec(model);
  if (!m) return false;
  return Number(m[1]) * 100 + Number(m[2] ?? 0) >= 308;
}

/** Older models use [square-bracket] pause tags; 3.8+ use <angle-bracket> tags. */
export function toBracketTags(text: string): string {
  return text.replace(/<(short pause|medium pause|long pause)>/g, '[$1]');
}
export const DEFAULT_TTS_VOICE = 'Aoede';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export interface GeminiTtsConfig {
  /** AI Studio key (experiments). Ignored when `access` is given. */
  apiKey?: string;
  /** How to reach Gemini — Vertex AI for the app. */
  access?: GoogleAccess;
  model?: string;
  /** Comma-separated fallback models, or "none". */
  fallbackModels?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Finds the first base64 audio payload anywhere in the response. */
export function findAudio(node: unknown): { base64: string; mimeType: string } | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findAudio(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const mime = (obj.mime_type ?? obj.mimeType) as string | undefined;
  const data = obj.data;
  if (typeof data === 'string' && data.length > 100 && (!mime || mime.startsWith('audio') || obj.type === 'audio')) {
    return { base64: data, mimeType: mime ?? 'audio/wav' };
  }
  for (const value of Object.values(obj)) {
    const found = findAudio(value);
    if (found) return found;
  }
  return null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Wraps raw 16-bit mono PCM in a WAV header so any player can play it. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

/** Always returns WAV (converts raw L16 PCM if that is what came back). */
export function ensureWav(base64: string, mimeType: string): { base64: string; mimeType: string } {
  if (base64.startsWith('UklGR')) return { base64, mimeType: 'audio/wav' }; // "RIFF"
  const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1]) || 24000;
  return { base64: bytesToBase64(pcmToWav(base64ToBytes(base64), rate)), mimeType: 'audio/wav' };
}

export class GeminiSpeechSynthesizer implements SpeechSynthesizer {
  readonly name = 'gemini-tts';
  private readonly fetchImpl: typeof fetch;
  private readonly access: GoogleAccess;
  private perLineStyles = true;

  constructor(private readonly config: GeminiTtsConfig) {
    this.access = config.access ?? aiStudioAccess(config.apiKey ?? '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private models(): string[] {
    const primary = this.config.model || DEFAULT_TTS_MODEL;
    const f = this.config.fallbackModels;
    const defaults = this.access.kind === 'vertex' ? VERTEX_TTS_FALLBACKS : DEFAULT_TTS_FALLBACKS;
    const fallbacks = f === 'none' ? [] : f ? f.split(',').map((m) => m.trim()).filter(Boolean) : defaults;
    return [primary, ...fallbacks.filter((m) => m !== primary)];
  }

  /**
   * Vertex AI request with Aaji's prebuilt voice.
   * - 3.8+: the story text alone in `text`, each line's direction in `speechMetadata.style`.
   * - older: Google's documented "{short prompt}: {text}", Marathi language code, [pause] tags.
   */
  vertexBody(model: string, chunk: TtsChunk, voice: string) {
    const voiceConfig = { prebuiltVoiceConfig: { voiceName: voice } };
    if (readsTextVerbatim(model)) {
      return {
        contents: [{ role: 'user', parts: chunk.parts.map((p) => ({ text: p.text, speechMetadata: { style: p.style } })) }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig } },
      };
    }
    const text = toBracketTags(chunk.parts.map((p) => p.text).join(' '));
    return {
      contents: [{ role: 'user', parts: [{ text: `${PREFIX_PROMPT}: ${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'mr-IN', voiceConfig } },
    };
  }

  private body(model: string, chunk: TtsChunk, voice: string) {
    const content = this.perLineStyles
      ? chunk.parts.map((p) => ({ type: 'text', text: p.text, annotations: [{ type: 'speech_metadata', style: p.style }] }))
      : [
          {
            type: 'text',
            text: chunk.parts.map((p) => p.text).join(' '),
            annotations: [{ type: 'speech_metadata', style: chunk.parts[0]?.style ?? '' }],
          },
        ];
    return {
      model,
      input: [{ type: 'user_input', content }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
      // Don't keep children's stories on Google's side.
      store: false,
    };
  }

  async synthesize(chunk: TtsChunk, voice: string) {
    const tried: string[] = [];
    const vertex = this.access.kind === 'vertex';
    let reauthed = false;
    for (const model of this.models()) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const auth = await this.access.headers();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs ?? 110_000);
        let res: Response;
        try {
          res = await this.fetchImpl(vertex ? this.access.generateContentUrl(model, { beta: true }) : ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...auth },
            body: JSON.stringify(vertex ? this.vertexBody(model, chunk, voice) : this.body(model, chunk, voice)),
            signal: controller.signal,
          });
        } catch (e) {
          const aborted = (e as Error).name === 'AbortError';
          throw new ProviderError(aborted ? 'TIMEOUT' : 'NETWORK', (e as Error).message, 'tts');
        } finally {
          clearTimeout(timer);
        }
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        if (res.ok) {
          const audio = findAudio(json);
          if (!audio) throw new ProviderError('MALFORMED_OUTPUT', 'no audio in TTS response', 'tts');
          return { ...ensureWav(audio.base64, audio.mimeType), model };
        }
        const message = json.error?.message ?? `HTTP ${res.status}`;
        // An expired Google Cloud token: sign in again once.
        if (res.status === 401 && !reauthed) {
          reauthed = true;
          this.access.invalidate();
          attempt -= 1;
          continue;
        }
        // Model not offered here: try the next one.
        if (res.status === 404) {
          tried.push(`${model}: not available`);
          break;
        }
        // A verbatim model that won't take speechMetadata here: never fall back to putting directions
        // in its text (it would read them out) — move on to the next model instead.
        if (vertex && res.status === 400 && readsTextVerbatim(model) && /speech_?metadata|unknown name|invalid json payload/i.test(message)) {
          tried.push(`${model}: no speechMetadata`);
          break;
        }
        // If per-line styles aren't accepted, retry once with a single styled text.
        if (!vertex && res.status === 400 && this.perLineStyles && attempt === 0) {
          this.perLineStyles = false;
          continue;
        }
        if (res.status === 429 || res.status >= 500) {
          tried.push(`${model}: ${res.status === 429 ? 'quota / rate limit' : 'busy'}`);
          break; // next model
        }
        throw new ProviderError('HTTP_ERROR', `${explainGoogleError(message)} (model ${model})`, 'tts');
      }
    }
    if (tried.length && tried.every((t) => t.endsWith('not available') || t.endsWith('no speechMetadata'))) {
      throw new ProviderError('HTTP_ERROR', `No speech model available here (${tried.join('; ')}) — set TTS_MODEL`, 'tts');
    }
    throw new ProviderError('QUOTA_EXHAUSTED', `Text-to-speech unavailable (${tried.join('; ')})`, 'tts');
  }
}
