/**
 * Aaji's voice — provider abstraction (BACKEND side; the app never calls a TTS provider).
 *
 *   Expo app → backend → audio story service (backend/tts.ts) → TTSProvider → (Gemini today)
 *
 * Aaji is a GENERIC synthetic Marathi female voice chosen from a provider's prebuilt voices.
 * This layer deliberately has no way to accept reference audio: GOSHTI does NOT support
 * voice cloning and never imitates a real person's or an existing narrator's voice.
 * A different provider (Google Cloud, Azure, …) can be added by implementing TTSProvider.
 */
import type { NarratorEmotion, VoiceStyle } from './schemas';
import type { SpeechCheckReport } from './speechCheck';
import {
  DEFAULT_AAJI_STYLE,
  dialogueStyle,
  narrationStyle,
  type SpeechSynthesizer,
  type TtsChunk,
} from './tts';

export interface SynthesizedAudio {
  mimeType: string;
  base64: string;
  model: string;
  /** How the part was checked before it was returned (numbers only). */
  check?: SpeechCheckReport;
}

export interface NarrationRequest {
  text: string;
  emotion?: NarratorEmotion;
  voice: string;
}

export interface DialogueRequest {
  text: string;
  /** Character name — Aaji performs the line (V1: one voice for everyone). */
  character: string;
  voiceStyle?: VoiceStyle;
  emotion?: NarratorEmotion;
  voice: string;
}

export interface TTSProvider {
  readonly name: string;
  /** One line of Aaji's narration. */
  synthesizeNarration(request: NarrationRequest): Promise<SynthesizedAudio>;
  /** One line of dialogue, performed by Aaji. */
  synthesizeDialogue(request: DialogueRequest): Promise<SynthesizedAudio>;
  /**
   * A scene: several narration/dialogue lines in ONE request. Fewer requests and smoother
   * delivery than line-by-line; this is what story rendering uses today.
   */
  synthesizeScene(chunk: TtsChunk, voice: string): Promise<SynthesizedAudio>;
}

/** Adapts any chunk-level SpeechSynthesizer (e.g. Gemini) to the TTSProvider contract. */
export class SynthesizerTTSProvider implements TTSProvider {
  readonly name: string;

  constructor(
    private readonly synth: SpeechSynthesizer,
    private readonly baseStyle: string = DEFAULT_AAJI_STYLE,
  ) {
    this.name = synth.name;
  }

  synthesizeNarration({ text, emotion, voice }: NarrationRequest) {
    return this.synth.synthesize(single(text, narrationStyle(this.baseStyle, emotion)), voice);
  }

  synthesizeDialogue({ text, character, voiceStyle, emotion, voice }: DialogueRequest) {
    return this.synth.synthesize(single(text, dialogueStyle(this.baseStyle, character, voiceStyle, emotion)), voice);
  }

  synthesizeScene(chunk: TtsChunk, voice: string) {
    return this.synth.synthesize(chunk, voice);
  }
}

function single(text: string, style: string): TtsChunk {
  return { index: 0, parts: [{ text, style }], cues: [], cueAt: [], pauseAfterMs: 0 };
}

/**
 * Prebuilt (synthetic) Gemini voices. Aaji's voice must be one of these — anything else
 * (a custom/cloned voice id, a URL, reference audio) is refused.
 */
export const PREBUILT_VOICES = [
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe', 'Callirrhoe',
  'Charon', 'Despina', 'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iapetus', 'Kore',
  'Laomedeia', 'Leda', 'Orus', 'Pulcherrima', 'Puck', 'Rasalgethi', 'Sadachbia',
  'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi',
] as const;

const prebuilt = new Map<string, string>(PREBUILT_VOICES.map((v) => [v.toLowerCase(), v]));

/** The requested voice if it is a known prebuilt voice, otherwise the fallback (also checked). */
export function resolveAajiVoice(requested: unknown, fallback: string): string {
  const pick = (v: unknown) => (typeof v === 'string' ? prebuilt.get(v.trim().toLowerCase()) : undefined);
  return pick(requested) ?? pick(fallback) ?? 'Aoede';
}
