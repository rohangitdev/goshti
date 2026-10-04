/**
 * GOSHTI sound design rules (provider- and player-neutral).
 *
 * The Story Engine only outputs INSTRUCTIONS (an AudioScript with approved sound ids).
 * The app's audio system performs them, using the levels and policies defined here.
 * Narration is always the most important layer: Aaji must stay easy to understand.
 */
import { resolveProfile, type DevelopmentalProfileId } from './profiles';
import { SFX_IDS, type SfxId } from './sfx';

/** What Aaji says right after the GOSHTI signature, before every story. */
export const AAJI_INTRO_LINE = 'चला मग... गोष्ट सुरू करूया!';
/** Silence after the intro line before the story starts. */
export const AAJI_INTRO_PAUSE_MS = 700;

/** Approved background beds. Low, looping, and kept separate from one-shot sound effects. */
export const AMBIENCE_IDS = [
  'FOREST_AMBIENCE',
  'NIGHT_AMBIENCE',
  'VILLAGE_AMBIENCE',
  'CITY_AMBIENCE',
  'RAIN_LIGHT',
  'WAVES',
  'WATER_STREAM',
] as const satisfies readonly SfxId[];

export type AmbienceId = (typeof AMBIENCE_IDS)[number];

const ambienceSet = new Set<string>(AMBIENCE_IDS);
export function isAmbienceId(id: unknown): id is AmbienceId {
  return typeof id === 'string' && ambienceSet.has(id);
}

/** Short one-shot effects: every approved id that is not an ambience bed. */
export const ONE_SHOT_SFX_IDS = SFX_IDS.filter((id) => !ambienceSet.has(id));

/**
 * Mix levels (0–1). Priority: narration > SFX > ambience > music.
 * Ambience and music sit far below narration so spoken Marathi is never masked.
 */
export interface MixLevels {
  narration: number;
  sfx: number;
  ambience: number;
  music: number;
}

export interface SoundPolicy {
  profileId: DevelopmentalProfileId;
  /** Hard cap on one-shot effects per minute of story (enforced when the script is built). */
  sfxPerMinute: number;
  /** Max music cues per story. */
  maxMusicCues: number;
  levels: MixLevels;
  /** Guidance for the audio director. */
  direction: string;
}

export const SOUND_POLICIES: Record<DevelopmentalProfileId, SoundPolicy> = {
  EARLY_LISTENER: {
    profileId: 'EARLY_LISTENER',
    sfxPerMinute: 4,
    maxMusicCues: 2,
    levels: { narration: 1, sfx: 0.55, ambience: 0.12, music: 0.08 },
    direction:
      'Ages 2–3: more animal and playful sounds, simple rhythm and repetition. Put a sound right AFTER the word that names it (e.g. after "मांजर म्हणाली" → CAT_MEOW), never on top of Aaji’s words.',
  },
  IMAGINATIVE_LISTENER: {
    profileId: 'IMAGINATIVE_LISTENER',
    sfxPerMinute: 3,
    maxMusicCues: 2,
    levels: { narration: 1, sfx: 0.5, ambience: 0.13, music: 0.08 },
    direction:
      'Ages 4–5: playful sounds, a gentle ambience bed, clear event sounds (knock, splash, bell) and gentle magic (MAGIC_SPARKLE) at key moments.',
  },
  STORY_EXPLORER: {
    profileId: 'STORY_EXPLORER',
    sfxPerMinute: 3,
    maxMusicCues: 2,
    levels: { narration: 1, sfx: 0.45, ambience: 0.12, music: 0.07 },
    direction:
      'Ages 6–7: narrative sounds that build the scene (footsteps before a reveal, rain as the mood changes). Fewer, better-placed effects.',
  },
  INDEPENDENT_IMAGINER: {
    profileId: 'INDEPENDENT_IMAGINER',
    sfxPerMinute: 2,
    maxMusicCues: 1,
    levels: { narration: 1, sfx: 0.4, ambience: 0.11, music: 0.06 },
    direction:
      'Ages 8–9: subtle sound design. Let words and silence carry the story; an ambience bed and one or two meaningful effects are enough.',
  },
};

export function soundPolicyFor(age: number): SoundPolicy {
  try {
    return SOUND_POLICIES[resolveProfile(age).id];
  } catch {
    return SOUND_POLICIES.STORY_EXPLORER;
  }
}

/** Default level for the GOSHTI signature and UI sounds (soft, never startling). */
export const SIGNATURE_LEVEL = 0.6;
export const UI_SOUND_LEVEL = 0.35;
