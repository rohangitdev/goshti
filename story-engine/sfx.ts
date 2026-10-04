/**
 * Predefined sound libraries. The story engine (and any future LLM output)
 * may only reference these identifiers. Anything else fails validation.
 */

export const SFX_IDS = [
  'ANIMAL_ELEPHANT',
  'ANIMAL_COW',
  'ANIMAL_DOG',
  'ANIMAL_CAT',
  'ANIMAL_BIRD_CHIRP',
  'ANIMAL_ROOSTER',
  'ANIMAL_MONKEY',
  'ANIMAL_FROG',
  'DOOR_KNOCK',
  'DOOR_CREAK',
  'FOOTSTEPS',
  'BELL_TEMPLE',
  'BELL_SMALL',
  'MAGIC_SPARKLE',
  'WHOOSH',
  'SPLASH',
  'DRUM_DHOL',
  'CLAP',
  'GIGGLE',
  'YAWN',
  'THUNDER_SOFT',
  'POP',
  'BOING',
] as const;

export type SfxId = (typeof SFX_IDS)[number];

export const AMBIENCE_IDS = [
  'VILLAGE_MORNING',
  'FOREST_DAY',
  'NIGHT_CRICKETS',
  'RAIN_GENTLE',
  'RIVER',
  'FESTIVAL_CROWD',
  'SKY_WIND',
  'HOME_EVENING',
] as const;

export type AmbienceId = (typeof AMBIENCE_IDS)[number];

const sfxSet = new Set<string>(SFX_IDS);
const ambienceSet = new Set<string>(AMBIENCE_IDS);

export function isAllowedSfx(id: string): id is SfxId {
  return sfxSet.has(id);
}

export function isAllowedAmbience(id: string): id is AmbienceId {
  return ambienceSet.has(id);
}
