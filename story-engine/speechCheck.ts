/**
 * Listening check for Aaji's voice — BACKEND ONLY.
 *
 * A speech model can misbehave: read its directions out loud ("a warm grandmother…"),
 * say a pause tag as words, skip half the text, or stop early. None of that may ever reach
 * a child. So every rendered part is checked before it is returned:
 *
 *   1. Length: the audio must be a believable length for the text (free, instant).
 *   2. Listening: a fast Gemini model writes down what it hears; the transcript is compared
 *      with the story text — no English directions, no tag words, nothing big added or missing.
 *
 * A part that fails is rendered again; if it still fails, the request fails and the app
 * switches to a ready-made story instead. Only numbers are logged, never the story text.
 */
import { ProviderError } from './provider';
import type { SpeechSynthesizer, TtsChunk } from './tts';

/** Writes down what is said in a piece of audio. */
export interface SpeechListener {
  readonly name: string;
  transcribe(audio: { base64: string; mimeType: string }): Promise<string>;
}

/** The words Aaji should actually say for a chunk (tags removed). */
export function spokenText(chunk: TtsChunk): string {
  return chunk.parts
    .map((p) => p.text)
    .join(' ')
    .replace(/<[^>]*>|\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Letters and vowel signs only — what speech length depends on. */
export function letterCount(text: string): number {
  return (text.match(/[\p{L}\p{M}]/gu) ?? []).length;
}

/** Seconds of audio in a base64 WAV (16-bit; reads the header). */
export function wavSeconds(base64: string): number {
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  let byteRate = 48000;
  try {
    const head = atob(base64.slice(0, 64));
    if (head.startsWith('RIFF')) {
      const b = (i: number) => head.charCodeAt(i);
      const rate = b(28) | (b(29) << 8) | (b(30) << 16) | (b(31) << 24);
      if (rate > 0) byteRate = rate;
    }
  } catch {
    // keep default
  }
  return Math.max(0, (bytes - 44) / byteRate);
}

/**
 * Believable length for spoken Marathi: never faster than ~20 letters a second, never slower
 * than ~2.5 a second (plus the pauses asked for). Deliberately wide — it only catches audio
 * that stopped early or ran on with something else.
 */
export function judgeDuration(chunk: TtsChunk, seconds: number): string[] {
  const text = chunk.parts.map((p) => p.text).join(' ');
  const letters = letterCount(spokenText(chunk));
  const pauses = (text.match(/short pause/g) ?? []).length * 0.5 + (text.match(/long pause/g) ?? []).length * 1.5;
  const min = letters / 20;
  const max = letters / 2.5 + pauses + 5;
  if (seconds < min) return [`audio too short (${seconds.toFixed(1)}s for ${letters} letters)`];
  if (seconds > max) return [`audio too long (${seconds.toFixed(1)}s for ${letters} letters)`];
  return [];
}

/** English words that only turn up when a speech model reads its directions or tags aloud. */
const DIRECTION_WORDS = new Set([
  'pause', 'short', 'long', 'medium', 'grandmother', 'granny', 'storyteller', 'story', 'slowly', 'slow',
  'warm', 'warmly', 'read', 'aloud', 'voice', 'style', 'tone', 'marathi', 'child', 'performing', 'doing',
  'gentle', 'playful', 'whisper', 'whispering', 'affectionate', 'expressive', 'pronunciation', 'speaking',
  'narrator', 'narration', 'say', 'said', 'aaji', 'loving', 'calm', 'excited', 'sleepy', 'cheerful',
]);
/** The same directions as a Marathi transcript might spell them. */
const DIRECTION_WORDS_DEVANAGARI = ['पॉज', 'पॉझ', 'ग्रँडमदर', 'ग्रॅंडमदर', 'ग्रँडमा', 'स्टोरीटेलर', 'स्लोली', 'व्हॉईस', 'व्हॉइस'];

export interface TranscriptVerdict {
  problems: string[];
  /** Transcript letters ÷ story letters (≈1 when the text was read as written). */
  ratio: number;
  /** English words heard that aren't in the story text. */
  englishWords: number;
}

/** Compares what was heard with what should have been said. */
export function judgeTranscript(expected: string, transcript: string): TranscriptVerdict {
  const expectedLatin = new Set((expected.match(/[A-Za-z]+/g) ?? []).map((w) => w.toLowerCase()));
  const heardLatin = (transcript.match(/[A-Za-z]{2,}/g) ?? []).map((w) => w.toLowerCase()).filter((w) => !expectedLatin.has(w));
  const directions = [...new Set(heardLatin.filter((w) => DIRECTION_WORDS.has(w)))];
  const devanagariDirections = DIRECTION_WORDS_DEVANAGARI.filter((w) => transcript.includes(w) && !expected.includes(w));
  const ratio = letterCount(transcript) / Math.max(1, letterCount(expected));

  const problems: string[] = [];
  if (directions.length || devanagariDirections.length) {
    problems.push(`read directions aloud (${[...directions, ...devanagariDirections].slice(0, 5).join(', ')})`);
  } else if (heardLatin.length >= 3) {
    problems.push(`spoke English words (${heardLatin.slice(0, 5).join(', ')})`);
  }
  if (ratio > 1.5) problems.push(`extra speech (heard ${ratio.toFixed(2)}× the text)`);
  if (ratio < 0.5) problems.push(`text missing (heard ${ratio.toFixed(2)}× the text)`);
  return { problems, ratio, englishWords: heardLatin.length };
}

export interface CheckedSpeechOptions {
  /** Renders per request (first try + re-renders). Default 2. */
  attempts?: number;
  /** Don't start another render after this much time (the app gives a request ~2 minutes). */
  budgetMs?: number;
  log?: (line: string) => void;
  now?: () => number;
}

export interface SpeechCheckReport {
  checked: 'listened' | 'length-only';
  seconds: number;
  ratio?: number;
  englishWords?: number;
  attempts: number;
}

/**
 * Wraps any SpeechSynthesizer: every part is length-checked and, with a listener, listened to
 * before it is returned. Bad parts are rendered again; if they keep failing, it throws.
 */
export class CheckedSpeechSynthesizer implements SpeechSynthesizer {
  readonly name: string;
  private readonly now: () => number;

  constructor(
    private readonly inner: SpeechSynthesizer,
    private readonly listener: SpeechListener | null,
    private readonly options: CheckedSpeechOptions = {},
  ) {
    this.name = inner.name;
    this.now = options.now ?? Date.now;
  }

  async synthesize(chunk: TtsChunk, voice: string): Promise<{ mimeType: string; base64: string; model: string; check: SpeechCheckReport }> {
    const started = this.now();
    const attempts = Math.max(1, this.options.attempts ?? 2);
    const budget = this.options.budgetMs ?? 55_000;
    const expected = spokenText(chunk);
    const failures: string[] = [];

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const audio = await this.inner.synthesize(chunk, voice);
      const seconds = wavSeconds(audio.base64);
      const problems = judgeDuration(chunk, seconds);
      let verdict: TranscriptVerdict | null = null;
      if (!problems.length && this.listener) {
        verdict = judgeTranscript(expected, await this.listen(audio));
        problems.push(...verdict.problems);
      }
      const numbers = `${seconds.toFixed(1)}s${verdict ? `, heard ${verdict.ratio.toFixed(2)}×, ${verdict.englishWords} English word(s)` : ''}`;
      if (!problems.length) {
        this.options.log?.(`[speech-check] part ${chunk.index} ok (${audio.model}, ${numbers}, try ${attempt})`);
        return {
          ...audio,
          check: {
            checked: verdict ? 'listened' : 'length-only',
            seconds,
            ratio: verdict?.ratio,
            englishWords: verdict?.englishWords,
            attempts: attempt,
          },
        };
      }
      this.options.log?.(`[speech-check] part ${chunk.index} FAILED (${audio.model}, ${numbers}): ${problems.join('; ')}`);
      failures.push(`try ${attempt} (${audio.model}): ${problems.join('; ')}`);
      if (this.now() - started > budget) break;
    }
    throw new ProviderError('MALFORMED_OUTPUT', `Aaji's voice failed the listening check — ${failures.join(' | ')}`, 'tts');
  }

  /** One retry if the listener itself fails; then the part is not trusted. */
  private async listen(audio: { base64: string; mimeType: string }): Promise<string> {
    try {
      return await this.listener!.transcribe(audio);
    } catch {
      try {
        return await this.listener!.transcribe(audio);
      } catch (e) {
        throw new ProviderError('HTTP_ERROR', `listening check unavailable: ${(e as Error).message}`, 'tts');
      }
    }
  }
}
