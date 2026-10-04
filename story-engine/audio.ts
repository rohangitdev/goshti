import { NARRATOR_EMOTIONS, VOICE_STYLES, type NarratorEmotion, type RawAudioScript, type VoiceStyle } from './schemas';
import { isAllowedMusicMood, isAllowedSfx, type SfxId } from './sfx';
import type { AudioScript, AudioSegment } from './types';

export const PAUSE_LIMITS = { min: 200, max: 4000 };
/** The audio script must carry (almost) all of the approved story's words. */
export const COVERAGE_LIMITS = { min: 0.85, max: 1.25 };
/** Sound design restraint: max SFX per minute of story. */
export const MAX_SFX_PER_MINUTE = 3;

const emotionSet = new Set<string>(NARRATOR_EMOTIONS);
const voiceSet = new Set<string>(VOICE_STYLES);

function letters(text: string): number {
  return (text.match(/\p{L}|\p{M}/gu) ?? []).length;
}

export function audioScriptToText(script: AudioScript): string {
  return script.segments
    .map((s) => (s.type === 'NARRATION' || s.type === 'DIALOGUE' ? s.text : null))
    .filter((t): t is string => !!t)
    .join('\n');
}

export function coverageRatio(script: AudioScript, storyText: string): number {
  const storyLetters = letters(storyText);
  return storyLetters === 0 ? 0 : letters(audioScriptToText(script)) / storyLetters;
}

/**
 * Turns untrusted model output into a strict AudioScript.
 * Unknown sounds/moods are DROPPED (never passed through), pauses are clamped,
 * empty speech removed, SFX density limited.
 */
export function normalizeAudioScript(
  raw: RawAudioScript,
  storyText: string,
  estimatedMinutes: number,
): { script: AudioScript; warnings: string[] } {
  const warnings: string[] = [];
  const segments: AudioSegment[] = [];
  let sfxCount = 0;
  const maxSfx = Math.max(2, Math.round(estimatedMinutes * MAX_SFX_PER_MINUTE));

  raw.segments.forEach((s, i) => {
    const emotion = s.emotion && emotionSet.has(s.emotion) ? (s.emotion as NarratorEmotion) : undefined;
    switch (s.type) {
      case 'NARRATION': {
        const text = s.text?.trim();
        if (!text) return void warnings.push(`segment ${i}: empty narration dropped`);
        segments.push({ type: 'NARRATION', speaker: 'AAJI', text, ...(emotion && { emotion }) });
        return;
      }
      case 'DIALOGUE': {
        const text = s.text?.trim();
        if (!text) return void warnings.push(`segment ${i}: empty dialogue dropped`);
        const voiceStyle = s.voiceStyle && voiceSet.has(s.voiceStyle) ? (s.voiceStyle as VoiceStyle) : undefined;
        segments.push({
          type: 'DIALOGUE',
          character: s.character?.trim() || 'पात्र',
          text,
          ...(emotion && { emotion }),
          ...(voiceStyle && { voiceStyle }),
        });
        return;
      }
      case 'PAUSE': {
        const ms = Math.round(Math.min(PAUSE_LIMITS.max, Math.max(PAUSE_LIMITS.min, Number(s.durationMs) || 800)));
        segments.push({ type: 'PAUSE', durationMs: ms });
        return;
      }
      case 'SFX': {
        if (!isAllowedSfx(s.soundId)) return void warnings.push(`segment ${i}: SFX "${s.soundId}" not approved — dropped`);
        if (sfxCount >= maxSfx) return void warnings.push(`segment ${i}: too many SFX — dropped`);
        sfxCount += 1;
        segments.push({ type: 'SFX', soundId: s.soundId });
        return;
      }
      case 'AMBIENCE': {
        if (!isAllowedSfx(s.soundId)) {
          return void warnings.push(`segment ${i}: ambience "${s.soundId}" not approved — dropped`);
        }
        segments.push({ type: 'AMBIENCE', soundId: s.soundId, action: s.action ?? 'START' });
        return;
      }
      case 'MUSIC_CUE': {
        if (!isAllowedMusicMood(s.mood)) return void warnings.push(`segment ${i}: music mood "${s.mood}" not approved — dropped`);
        segments.push({ type: 'MUSIC_CUE', mood: s.mood, action: s.action ?? 'START' });
        return;
      }
    }
  });

  // Never leave ambience or music running at the end.
  const open = new Map<string, AudioSegment>();
  for (const seg of segments) {
    if (seg.type === 'AMBIENCE') {
      if (seg.action === 'START') open.set(`A:${seg.soundId}`, seg);
      else open.delete(`A:${seg.soundId}`);
    }
    if (seg.type === 'MUSIC_CUE') {
      if (seg.action === 'START') open.set(`M:${seg.mood}`, seg);
      else open.delete(`M:${seg.mood}`);
    }
  }
  for (const seg of open.values()) {
    if (seg.type === 'AMBIENCE') segments.push({ type: 'AMBIENCE', soundId: seg.soundId, action: 'STOP' });
    if (seg.type === 'MUSIC_CUE') segments.push({ type: 'MUSIC_CUE', mood: seg.mood, action: 'STOP' });
  }

  const script: AudioScript = { version: 2, narrator: 'AAJI', language: 'mr-IN', segments };
  const ratio = coverageRatio(script, storyText);
  if (ratio < COVERAGE_LIMITS.min || ratio > COVERAGE_LIMITS.max) {
    warnings.push(`coverage ${(ratio * 100).toFixed(0)}% of story text`);
  }
  return { script, warnings };
}

export function isCoverageAcceptable(script: AudioScript, storyText: string): boolean {
  const r = coverageRatio(script, storyText);
  return r >= COVERAGE_LIMITS.min && r <= COVERAGE_LIMITS.max;
}

const QUOTE_RE = /(["“”„«»])([^"“”„«»]+)(["“”„«»])/g;

/**
 * Deterministic conversion used when the audio director's output is unusable
 * (and by the mock provider). Paragraph → narration; quoted speech → dialogue.
 */
export function buildFallbackAudioScript(
  storyText: string,
  options: { ambience?: SfxId; closingEmotion?: NarratorEmotion } = {},
): AudioScript {
  const segments: AudioSegment[] = [];
  if (options.ambience) segments.push({ type: 'AMBIENCE', soundId: options.ambience, action: 'START' });

  const paragraphs = storyText.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  paragraphs.forEach((para, pi) => {
    let last = 0;
    for (const match of para.matchAll(QUOTE_RE)) {
      const before = para.slice(last, match.index).trim();
      if (before) segments.push({ type: 'NARRATION', speaker: 'AAJI', text: before });
      segments.push({ type: 'DIALOGUE', character: 'पात्र', text: match[2].trim() });
      last = (match.index ?? 0) + match[0].length;
    }
    const rest = para.slice(last).trim();
    if (rest) segments.push({ type: 'NARRATION', speaker: 'AAJI', text: rest });
    if (pi < paragraphs.length - 1) segments.push({ type: 'PAUSE', durationMs: 700 });
  });

  if (options.closingEmotion) {
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      if (s.type === 'NARRATION') {
        segments[i] = { ...s, emotion: options.closingEmotion };
        break;
      }
    }
  }
  if (options.ambience) segments.push({ type: 'AMBIENCE', soundId: options.ambience, action: 'STOP' });
  return { version: 2, narrator: 'AAJI', language: 'mr-IN', segments };
}

/** Rough listening time (Aaji narrates slowly). */
export function estimateDurationSeconds(script: { segments: readonly unknown[] }, wordsPerMinute = 85): number {
  let ms = 0;
  for (const raw of script.segments) {
    const s = raw as { type?: string; text?: string; durationMs?: number };
    if ((s.type === 'NARRATION' || s.type === 'DIALOGUE') && s.text) {
      ms += (s.text.trim().split(/\s+/).length / wordsPerMinute) * 60_000;
    } else if (s.type === 'PAUSE') {
      ms += s.durationMs ?? 0;
    } else if (s.type === 'SFX') {
      ms += 1200;
    }
  }
  return Math.max(1, Math.round(ms / 1000));
}
