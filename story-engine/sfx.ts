/**
 * Approved sound vocabulary. The AI may ONLY pick from these lists — anything else
 * is dropped during audio-script validation. No URLs, no invented assets.
 */

export const SFX_IDS = [
  'BIRDS',
  'RAIN_LIGHT',
  'RAIN_HEAVY',
  'WIND',
  'FOOTSTEPS',
  'FOOTSTEPS_RUNNING',
  'DOOR_KNOCK',
  'DOOR_OPEN',
  'CAT_MEOW',
  'DOG_BARK',
  'ELEPHANT',
  'LION',
  'OWL',
  'TRAIN',
  'BELL',
  'THUNDER_GENTLE',
  'MAGIC_SPARKLE',
  'SPLASH',
  'BRANCH_SNAP',
  'CLAP',
  'LAUGHTER',
  'FOREST_AMBIENCE',
  'NIGHT_AMBIENCE',
  'VILLAGE_AMBIENCE',
  'CITY_AMBIENCE',
  'WATER_STREAM',
  'WAVES',
  'CLOCK_TICK',
  'OBJECT_DROP',
  'WHOOSH_SOFT',
] as const;

export type SfxId = (typeof SFX_IDS)[number];

/** Conceptual music moods for future, restrained music cues. */
export const MUSIC_MOODS = [
  'GENTLE',
  'PLAYFUL',
  'ADVENTURE',
  'MYSTERY',
  'MAGICAL',
  'EMOTIONAL',
  'VICTORY',
  'BEDTIME',
] as const;

export type MusicMood = (typeof MUSIC_MOODS)[number];

const sfxSet = new Set<string>(SFX_IDS);
const moodSet = new Set<string>(MUSIC_MOODS);

export function isAllowedSfx(id: unknown): id is SfxId {
  return typeof id === 'string' && sfxSet.has(id);
}

export function isAllowedMusicMood(mood: unknown): mood is MusicMood {
  return typeof mood === 'string' && moodSet.has(mood);
}
