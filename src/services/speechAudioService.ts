import * as Speech from 'expo-speech';

import type { AudioScript, VoiceStyle } from '@engine/index';
import type { GoshtiStory } from '@/types/models';

import type { AudioService, PlaybackListener, PlaybackStatus, SoundCue } from './audioService';

/**
 * TEMPORARY stand-in until server-side Aaji TTS exists: reads the story's AudioScript
 * aloud with the phone's built-in voice. Narration and dialogue are spoken (dialogue
 * with a different pitch per character, nudged by emotion tags), pauses are respected,
 * and SFX/ambience/music instructions are handed to the mixer (onCue) at the right moment.
 *
 * Android cannot pause speech mid-sentence, so pause stops the current line and
 * play resumes from the start of that line, on every platform.
 */

type Item =
  | { kind: 'speak'; text: string; pitch: number; rate: number; estMs: number }
  | { kind: 'wait'; estMs: number }
  | { kind: 'cue'; cue: SoundCue; estMs: number };

const VOICE: Record<VoiceStyle, { pitch: number; rate: number }> = {
  AAJI: { pitch: 0.95, rate: 0.85 },
  SMALL_CHILD: { pitch: 1.3, rate: 0.95 },
  OLDER_CHILD: { pitch: 1.15, rate: 0.95 },
  GENTLE_GIANT: { pitch: 0.75, rate: 0.8 },
  SQUEAKY: { pitch: 1.5, rate: 1.0 },
  WISE_OLD: { pitch: 0.85, rate: 0.8 },
  PLAYFUL: { pitch: 1.2, rate: 1.0 },
  GRUFF_KIND: { pitch: 0.8, rate: 0.9 },
};

/** Characters without a voice style still get a consistent, distinct voice. */
const FALLBACK_STYLES: VoiceStyle[] = ['SMALL_CHILD', 'PLAYFUL', 'WISE_OLD', 'GENTLE_GIANT', 'SQUEAKY', 'OLDER_CHILD'];
function styleFor(character: string | undefined): VoiceStyle {
  if (!character) return 'SMALL_CHILD';
  let h = 0;
  for (const ch of character) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_STYLES[h % FALLBACK_STYLES.length];
}

/** Gentle performance hints from the audio script's emotion tags. */
function adjustForEmotion(v: { pitch: number; rate: number }, emotion: string | undefined) {
  switch (emotion) {
    case 'sleepy':
    case 'whispered':
    case 'gentle':
      return { pitch: v.pitch * 0.97, rate: v.rate * 0.88 };
    case 'excited':
    case 'energetic':
    case 'surprised':
      return { pitch: v.pitch * 1.04, rate: v.rate * 1.08 };
    case 'mysterious':
    case 'concerned':
      return { pitch: v.pitch * 0.96, rate: v.rate * 0.92 };
    default:
      return v;
  }
}

const WORDS_PER_MINUTE_AT_RATE_1 = 110;
const SFX_GAP_MS = 600;

function estimateSpeechMs(text: string, rate: number): number {
  const words = text.trim().split(/\s+/).length;
  return (words / (WORDS_PER_MINUTE_AT_RATE_1 * rate)) * 60_000 + 300;
}

/**
 * Accepts both the current AudioScript (v2) and stories saved by older app versions.
 * Narration/dialogue are spoken, pauses kept, sound instructions become cues (an SFX also
 * leaves a short gap so it isn't spoken over).
 */
function toItems(script: AudioScript | { segments: readonly unknown[] }): Item[] {
  const items: Item[] = [];
  for (const raw of script.segments) {
    const s = raw as { type?: string; text?: string; character?: string; voiceStyle?: VoiceStyle; emotion?: string; durationMs?: number };
    if ((s.type === 'NARRATION' || s.type === 'DIALOGUE') && s.text) {
      const style: VoiceStyle =
        s.type === 'NARRATION' ? 'AAJI' : s.voiceStyle && VOICE[s.voiceStyle] ? s.voiceStyle : styleFor(s.character);
      const v = adjustForEmotion(VOICE[style], s.emotion);
      items.push({ kind: 'speak', text: s.text, ...v, estMs: estimateSpeechMs(s.text, v.rate) });
    } else if (s.type === 'PAUSE') {
      items.push({ kind: 'wait', estMs: Math.min(4000, Math.max(200, Number(s.durationMs) || 600)) });
    } else if (s.type === 'SFX' || s.type === 'AMBIENCE' || s.type === 'MUSIC_CUE') {
      items.push({ kind: 'cue', cue: raw as SoundCue, estMs: s.type === 'SFX' ? SFX_GAP_MS : 0 });
    }
  }
  return items;
}

/** Prefer a Marathi voice, then Hindi (same script), else the device default. */
async function pickLanguage(): Promise<string> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (voices.some((v) => v.language.toLowerCase().startsWith('mr'))) return 'mr-IN';
    if (voices.some((v) => v.language.toLowerCase().startsWith('hi'))) return 'hi-IN';
  } catch {
    // fall through
  }
  return 'mr-IN';
}

const IDLE: PlaybackStatus = { storyId: null, isPlaying: false, positionSeconds: 0, durationSeconds: 0, didFinish: false };

export class SpeechAudioService implements AudioService {
  private status: PlaybackStatus = IDLE;
  private listeners = new Set<PlaybackListener>();
  private items: Item[] = [];
  private startsMs: number[] = [];
  private index = 0;
  private itemStartedAt = 0;
  /** Incremented on every stop so callbacks from a stopped utterance are ignored. */
  private token = 0;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private language: Promise<string> | null = null;

  onCue: ((cue: SoundCue) => void) | null = null;

  async load(story: GoshtiStory) {
    this.halt();
    this.language ??= pickLanguage();
    this.items = toItems(story.audioScript);
    let acc = 0;
    this.startsMs = this.items.map((it) => {
      const start = acc;
      acc += it.estMs;
      return start;
    });
    this.index = 0;
    this.setStatus({ ...IDLE, storyId: story.id, durationSeconds: Math.max(1, Math.round(acc / 1000)) });
  }

  async play() {
    if (!this.status.storyId || this.status.isPlaying) return;
    if (this.status.didFinish) this.index = 0;
    this.setStatus({ ...this.status, isPlaying: true, didFinish: false });
    this.ticker = setInterval(() => this.tick(), 250);
    await this.runCurrent();
  }

  async pause() {
    this.halt();
    this.setStatus({ ...this.status, isPlaying: false, positionSeconds: this.startsMs[this.index] / 1000 || 0 });
  }

  async unload() {
    this.halt();
    this.items = [];
    this.setStatus(IDLE);
  }

  getStatus() {
    return this.status;
  }

  subscribe(listener: PlaybackListener) {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async runCurrent() {
    const token = this.token;
    const item = this.items[this.index];
    if (!item) {
      this.finish();
      return;
    }
    this.itemStartedAt = Date.now();
    const next = () => {
      if (token !== this.token) return;
      this.index += 1;
      this.runCurrent();
    };

    if (item.kind === 'cue') {
      this.onCue?.(item.cue);
      this.waitTimer = setTimeout(next, item.estMs);
      return;
    }
    if (item.kind === 'wait') {
      this.waitTimer = setTimeout(next, item.estMs);
      return;
    }
    const language = await (this.language ?? pickLanguage());
    if (token !== this.token) return;
    Speech.speak(item.text, { language, pitch: item.pitch, rate: item.rate, onDone: next, onError: next });
  }

  private tick() {
    const start = this.startsMs[this.index] ?? 0;
    const est = this.items[this.index]?.estMs ?? 0;
    const elapsed = Math.min(Date.now() - this.itemStartedAt, est * 0.98);
    const positionSeconds = Math.min(this.status.durationSeconds, (start + elapsed) / 1000);
    if (Math.abs(positionSeconds - this.status.positionSeconds) >= 0.25) {
      this.setStatus({ ...this.status, positionSeconds });
    }
  }

  private finish() {
    this.halt();
    this.index = 0;
    this.setStatus({ ...this.status, isPlaying: false, didFinish: true, positionSeconds: this.status.durationSeconds });
  }

  private halt() {
    this.token += 1;
    if (this.waitTimer) clearTimeout(this.waitTimer);
    if (this.ticker) clearInterval(this.ticker);
    this.waitTimer = null;
    this.ticker = null;
    Speech.stop();
  }

  private setStatus(next: PlaybackStatus) {
    this.status = next;
    this.listeners.forEach((l) => l(next));
  }
}
