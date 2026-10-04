/**
 * Turning an approved AudioScript into text-to-speech requests (provider-neutral).
 *
 * The script is split into scene-sized CHUNKS (roughly 30–60 s of audio each) at paragraph
 * pauses, so each chunk is one short TTS request and the app can start playing chunk 1
 * while the rest are still rendering. Every line carries a performance STYLE: Aaji's
 * narration emotion, or Aaji performing a character's voice. Pauses become inline tags.
 * Sound effects / ambience / music are not spoken — they are kept as cues for the player.
 */
import type { NarratorEmotion, VoiceStyle } from './schemas';
import type { AudioScript, AudioSegment } from './types';

export interface TtsPart {
  text: string;
  style: string;
}

export interface TtsChunk {
  index: number;
  parts: TtsPart[];
  /** Non-spoken cues (SFX / ambience / music) that fall inside this chunk, in order. */
  cues: Exclude<AudioSegment, { type: 'NARRATION' | 'DIALOGUE' | 'PAUSE' }>[];
  /** Silence the player adds after this chunk. */
  pauseAfterMs: number;
}

/** Aaji's base voice direction. Override with TTS_STYLE. */
export const DEFAULT_AAJI_STYLE =
  'a warm, affectionate Marathi grandmother (आजी) telling a story to a small child at home; ' +
  'slow, clear and expressive, natural Marathi pronunciation, a gentle smile in the voice, never rushed';

const EMOTION_STYLE: Record<NarratorEmotion, string> = {
  warm: 'warm and loving',
  playful: 'playful, with a twinkle',
  curious: 'curious and wondering',
  excited: 'excited but still gentle',
  mysterious: 'hushed and mysterious, drawing the child in',
  gentle: 'soft and gentle',
  surprised: 'pleasantly surprised',
  concerned: 'a little worried, reassuring',
  proud: 'proud and happy',
  relieved: 'relieved, letting out a breath',
  sleepy: 'slow, soft and sleepy, almost a lullaby',
  whispered: 'whispering softly',
  energetic: 'lively and bright',
};

const VOICE_STYLE: Record<VoiceStyle, string> = {
  AAJI: 'in her own voice',
  SMALL_CHILD: 'doing a small child’s voice — higher, eager',
  OLDER_CHILD: 'doing an older child’s voice — bright and confident',
  GENTLE_GIANT: 'doing a big, slow, deep, kind voice',
  SQUEAKY: 'doing a tiny squeaky voice',
  WISE_OLD: 'doing a wise, slow, old voice',
  PLAYFUL: 'doing a cheeky, playful voice',
  GRUFF_KIND: 'doing a gruff but kind voice',
};

export function narrationStyle(base: string, emotion?: NarratorEmotion): string {
  return emotion ? `${base}; now ${EMOTION_STYLE[emotion] ?? emotion}` : base;
}

export function dialogueStyle(base: string, character: string, voiceStyle?: VoiceStyle, emotion?: NarratorEmotion): string {
  const voice = voiceStyle ? VOICE_STYLE[voiceStyle] : 'giving this character their own distinct voice';
  return `${base}; performing ${character}, ${voice}${emotion ? `, ${EMOTION_STYLE[emotion] ?? emotion}` : ''}`;
}

export interface ChunkOptions {
  baseStyle?: string;
  /** Close a chunk at the next paragraph pause once it has this many characters. */
  targetChars?: number;
  /** Force a chunk boundary after this many characters. */
  maxChars?: number;
}

export function buildTtsChunks(script: AudioScript, options: ChunkOptions = {}): TtsChunk[] {
  const base = options.baseStyle || DEFAULT_AAJI_STYLE;
  const target = options.targetChars ?? 650;
  const max = options.maxChars ?? 1100;
  const chunks: TtsChunk[] = [];
  let current: TtsChunk = { index: 0, parts: [], cues: [], pauseAfterMs: 0 };
  let chars = 0;

  const close = (pauseAfterMs: number) => {
    if (current.parts.length === 0) return;
    current.pauseAfterMs = pauseAfterMs;
    chunks.push(current);
    current = { index: chunks.length, parts: [], cues: [], pauseAfterMs: 0 };
    chars = 0;
  };

  const add = (text: string, style: string) => {
    const last = current.parts[current.parts.length - 1];
    if (last && last.style === style) last.text = `${last.text} ${text}`;
    else current.parts.push({ text, style });
    chars += text.length;
  };

  for (const seg of script.segments) {
    switch (seg.type) {
      case 'NARRATION':
        if (chars >= max) close(300);
        add(seg.text, narrationStyle(base, seg.emotion));
        break;
      case 'DIALOGUE':
        if (chars >= max) close(300);
        add(seg.text, dialogueStyle(base, seg.character, seg.voiceStyle, seg.emotion));
        break;
      case 'PAUSE': {
        if (chars >= target) {
          close(seg.durationMs);
        } else {
          const last = current.parts[current.parts.length - 1];
          if (last) last.text += seg.durationMs >= 1500 ? ' <long pause>' : ' <short pause>';
        }
        break;
      }
      default:
        current.cues.push(seg);
    }
  }
  close(0);
  return chunks;
}

/** A provider that turns one chunk into audio. */
export interface SpeechSynthesizer {
  readonly name: string;
  synthesize(chunk: TtsChunk, voice: string): Promise<{ mimeType: string; base64: string; model: string }>;
}

/** Fixed, harmless sample for the voice audition — never user text. */
export const AUDITION_CHUNK: TtsChunk = {
  index: 0,
  cues: [],
  pauseAfterMs: 0,
  parts: [
    { text: 'चला, आज मी तुम्हाला एक गंमत सांगते. <short pause>', style: narrationStyle(DEFAULT_AAJI_STYLE, 'warm') },
    {
      text: 'आमच्या अंगणात चिनू नावाची एक छोटीशी खारूताई राहायची. एका सकाळी तिला गवतात एक चमचमणारं बटण सापडलं!',
      style: narrationStyle(DEFAULT_AAJI_STYLE, 'curious'),
    },
    { text: 'हे कुणाचं असेल बरं?', style: dialogueStyle(DEFAULT_AAJI_STYLE, 'चिनू', 'SQUEAKY', 'curious') },
    { text: 'तुम्हाला काय वाटतं? <long pause> चला, पुढे ऐकूया!', style: narrationStyle(DEFAULT_AAJI_STYLE, 'playful') },
  ],
};

/** Suggested Aaji voices to audition (Gemini prebuilt voices). */
export const AUDITION_VOICES = ['Sulafat', 'Vindemiatrix', 'Gacrux', 'Achernar', 'Aoede'] as const;
