/**
 * Audio script assembly.
 *
 * The approved story is split into paragraphs, narration and quoted dialogue BY CODE
 * (`segmentStory`). The audio director model only returns directions keyed by paragraph /
 * quote number (`AudioDirection`). `buildAudioScript` merges them — so the spoken text is
 * always exactly the approved text, and unapproved sounds can never get through.
 */
import { NARRATOR_EMOTIONS, VOICE_STYLES, type AudioDirection, type NarratorEmotion } from './schemas';
import { isAllowedMusicMood, isAllowedSfx, type SfxId } from './sfx';
import { AAJI_INTRO_LINE, AAJI_INTRO_PAUSE_MS, isAmbienceId, soundPolicyFor } from './soundDesign';
import type { AudioScript, AudioSegment } from './types';

export const PAUSE_LIMITS = { min: 200, max: 4000 };
/** Sound design restraint: max SFX per minute of story (default; see soundDesign for per-age policy). */
export const MAX_SFX_PER_MINUTE = 3;
/** Default max music cues per story. */
export const MAX_MUSIC_CUES = 2;
/** Default gap between paragraphs when the director adds none. */
export const PARAGRAPH_GAP_MS = 600;

const emotionSet = new Set<string>(NARRATOR_EMOTIONS);
const voiceSet = new Set<string>(VOICE_STYLES);

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

export type StoryPart = { kind: 'narration'; text: string } | { kind: 'quote'; quote: number; text: string };
export interface StoryParagraph {
  paragraph: number;
  parts: StoryPart[];
}

const QUOTE_RE = /["“”„«»]([^"“”„«»]+)["“”„«»]/g;

/** Paragraphs are numbered from 1, quotes from 1 across the whole story. */
export function segmentStory(storyText: string): StoryParagraph[] {
  const paragraphs = storyText.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  let quote = 0;
  return paragraphs.map((para, i) => {
    const parts: StoryPart[] = [];
    let last = 0;
    for (const match of para.matchAll(QUOTE_RE)) {
      const before = para.slice(last, match.index).trim();
      if (before) parts.push({ kind: 'narration', text: before });
      quote += 1;
      parts.push({ kind: 'quote', quote, text: match[1].trim() });
      last = (match.index ?? 0) + match[0].length;
    }
    const rest = para.slice(last).trim();
    if (rest) parts.push({ kind: 'narration', text: rest });
    return { paragraph: i + 1, parts };
  });
}

/** The story as the audio director sees it: [P1] … «Q1: "…"» … */
export function markedStory(storyText: string): string {
  return segmentStory(storyText)
    .map((p) => `[P${p.paragraph}] ` + p.parts.map((x) => (x.kind === 'quote' ? `«Q${x.quote}: "${x.text}"»` : x.text)).join(' '))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface BuildOptions {
  estimatedMinutes?: number;
  /** Used only when the direction has no ambience at all (mock / fallback). */
  ambience?: SfxId;
  closingEmotion?: NarratorEmotion;
  /** Listener's age — picks the age-adaptive sound policy (SFX density, music cues). */
  age?: number;
  /** Start with Aaji's fixed intro line ("चला मग... गोष्ट सुरू करूया!"). */
  intro?: boolean;
}

const EMPTY_DIRECTION: AudioDirection = { speakers: [], narration: [], cues: [] };

export function buildAudioScript(
  storyText: string,
  direction: AudioDirection | null,
  options: BuildOptions = {},
): { script: AudioScript; warnings: string[] } {
  const d = direction ?? EMPTY_DIRECTION;
  const warnings: string[] = [];
  const paragraphs = segmentStory(storyText);
  const policy = options.age !== undefined ? soundPolicyFor(options.age) : null;
  const maxSfx = Math.max(2, Math.round((options.estimatedMinutes ?? 3) * (policy?.sfxPerMinute ?? MAX_SFX_PER_MINUTE)));
  const maxMusic = policy?.maxMusicCues ?? MAX_MUSIC_CUES;
  let sfxCount = 0;
  let musicCount = 0;

  const speakers = new Map(d.speakers.map((s) => [s.quote, s]));
  const narrationEmotion = new Map(
    d.narration.filter((n) => emotionSet.has(n.emotion)).map((n) => [n.paragraph, n.emotion as NarratorEmotion]),
  );

  // Validate cues once; unknown sounds/moods are dropped, never passed through.
  const cuesAfter = new Map<number, AudioSegment[]>();
  d.cues.forEach((c, i) => {
    let seg: AudioSegment | null = null;
    if (c.type === 'PAUSE') {
      const ms = Math.round(Math.min(PAUSE_LIMITS.max, Math.max(PAUSE_LIMITS.min, Number(c.durationMs) || 800)));
      seg = { type: 'PAUSE', durationMs: ms };
    } else if (c.type === 'SFX') {
      if (!isAllowedSfx(c.soundId)) warnings.push(`cue ${i}: SFX "${c.soundId}" not approved — dropped`);
      else if (sfxCount >= maxSfx) warnings.push(`cue ${i}: too many SFX — dropped`);
      else {
        sfxCount += 1;
        seg = { type: 'SFX', soundId: c.soundId };
      }
    } else if (c.type === 'AMBIENCE') {
      const action = c.action ?? 'START';
      if (!isAllowedSfx(c.soundId)) warnings.push(`cue ${i}: ambience "${c.soundId}" not approved — dropped`);
      else if (isAmbienceId(c.soundId)) seg = { type: 'AMBIENCE', soundId: c.soundId, action };
      else if (action === 'START' && sfxCount < maxSfx) {
        // Not a background bed (e.g. BIRDS): play it once as a one-shot instead.
        sfxCount += 1;
        warnings.push(`cue ${i}: "${c.soundId}" is not an ambience bed — played once as SFX`);
        seg = { type: 'SFX', soundId: c.soundId };
      }
    } else if (c.type === 'MUSIC_CUE') {
      const action = c.action ?? 'START';
      if (!isAllowedMusicMood(c.mood)) warnings.push(`cue ${i}: music mood "${c.mood}" not approved — dropped`);
      else if (action === 'START' && musicCount >= maxMusic) warnings.push(`cue ${i}: too many music cues — dropped`);
      else {
        if (action === 'START') musicCount += 1;
        seg = { type: 'MUSIC_CUE', mood: c.mood, action };
      }
    }
    if (!seg) return;
    const at = Math.max(0, Math.min(paragraphs.length, Math.round(c.afterParagraph)));
    cuesAfter.set(at, [...(cuesAfter.get(at) ?? []), seg]);
  });

  const segments: AudioSegment[] = [];
  if (options.intro) {
    segments.push({ type: 'NARRATION', speaker: 'AAJI', text: AAJI_INTRO_LINE, emotion: 'warm' });
    segments.push({ type: 'PAUSE', durationMs: AAJI_INTRO_PAUSE_MS });
  }
  const hasAmbience = [...cuesAfter.values()].flat().some((s) => s.type === 'AMBIENCE');
  const fallbackBed = options.ambience && isAmbienceId(options.ambience) ? options.ambience : undefined;
  if (fallbackBed && !hasAmbience) segments.push({ type: 'AMBIENCE', soundId: fallbackBed, action: 'START' });
  segments.push(...(cuesAfter.get(0) ?? []));

  let emotion: NarratorEmotion | undefined;
  for (const p of paragraphs) {
    emotion = narrationEmotion.get(p.paragraph) ?? emotion;
    if (p.paragraph === paragraphs.length && options.closingEmotion && !narrationEmotion.has(p.paragraph)) {
      emotion = options.closingEmotion;
    }
    for (const part of p.parts) {
      if (part.kind === 'narration') {
        segments.push({ type: 'NARRATION', speaker: 'AAJI', text: part.text, ...(emotion && { emotion }) });
      } else {
        const sp = speakers.get(part.quote);
        const voiceStyle = sp && voiceSet.has(sp.voiceStyle) ? sp.voiceStyle : undefined;
        const qEmotion = sp?.emotion && emotionSet.has(sp.emotion) ? sp.emotion : undefined;
        segments.push({
          type: 'DIALOGUE',
          character: sp?.character?.trim() || 'पात्र',
          text: part.text,
          ...(qEmotion && { emotion: qEmotion }),
          ...(voiceStyle && { voiceStyle }),
        });
      }
    }
    const cues = cuesAfter.get(p.paragraph) ?? [];
    segments.push(...cues);
    const last = p.paragraph === paragraphs.length;
    if (!last && !cues.some((s) => s.type === 'PAUSE')) segments.push({ type: 'PAUSE', durationMs: PARAGRAPH_GAP_MS });
  }
  if (fallbackBed && !hasAmbience) segments.push({ type: 'AMBIENCE', soundId: fallbackBed, action: 'STOP' });

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

  const quotes = paragraphs.flatMap((p) => p.parts).filter((x) => x.kind === 'quote').length;
  if (direction && d.speakers.length < quotes) warnings.push(`${quotes - d.speakers.length} quote(s) without a speaker`);

  return { script: { version: 2, narrator: 'AAJI', language: 'mr-IN', segments }, warnings };
}

/** Deterministic script with no AI direction (fallback and mock). */
export function buildFallbackAudioScript(
  storyText: string,
  options: { ambience?: SfxId; closingEmotion?: NarratorEmotion; age?: number; intro?: boolean } = {},
): AudioScript {
  return buildAudioScript(storyText, null, options).script;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function letters(text: string): number {
  return (text.match(/\p{L}|\p{M}/gu) ?? []).length;
}

/** The spoken story text (Aaji's fixed intro line is not part of the story). */
export function audioScriptToText(script: AudioScript): string {
  return script.segments
    .map((s) => (s.type === 'NARRATION' || s.type === 'DIALOGUE' ? s.text : null))
    .filter((t) => t !== AAJI_INTRO_LINE)
    .filter((t): t is string => !!t)
    .join('\n');
}

export function coverageRatio(script: AudioScript, storyText: string): number {
  const storyLetters = letters(storyText);
  return storyLetters === 0 ? 0 : letters(audioScriptToText(script)) / storyLetters;
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
