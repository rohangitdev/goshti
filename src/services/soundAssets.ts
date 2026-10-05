/**
 * The ONLY place audio files are referenced. Sounds are looked up by approved id; an id with
 * no file (null) is skipped silently. Nothing is ever fetched from a URL chosen by the AI.
 * Files live in assets/audio/ (see its README for licensing and what is a placeholder).
 */
import type { MusicMood, SfxId } from '@engine/index';

import type { SoundSource } from './soundPlayer';

export type UiSoundId =
  | 'CATEGORY_SELECTED'
  | 'AAJI_CHOOSES_STORY'
  | 'STORY_READY'
  | 'FAVOURITE_SAVED'
  | 'STORY_COMPLETE'
  | 'BUTTON_ERROR';

export interface SoundCatalog {
  ui(id: UiSoundId): SoundSource | null;
  signature(): SoundSource | null;
  /** GOSHTI's waiting song (sung by the founder, child-voice processed) while a story is prepared. */
  waitingSong(): SoundSource | null;
  /** Quiet instrumental loop that follows the song if the story still isn't ready. */
  waitingLoop(): SoundSource | null;
  /** Short sung lines (same voice) heard over the loop during a long wait, in rotation. */
  waitingLines(): SoundSource[];
  /** One-shot effect or ambience bed for an approved id. */
  sfx(id: SfxId): SoundSource | null;
  music(mood: MusicMood): SoundSource | null;
}

const UI: Record<UiSoundId, SoundSource> = {
  CATEGORY_SELECTED: require('../../assets/audio/ui/category-selected.wav'),
  AAJI_CHOOSES_STORY: require('../../assets/audio/ui/aaji-chooses-story.wav'),
  STORY_READY: require('../../assets/audio/ui/story-ready.wav'),
  FAVOURITE_SAVED: require('../../assets/audio/ui/favourite-saved.wav'),
  STORY_COMPLETE: require('../../assets/audio/ui/story-complete.wav'),
  BUTTON_ERROR: require('../../assets/audio/ui/button-error.wav'),
};

const SIGNATURE: SoundSource = require('../../assets/audio/signature/goshti-signature.wav');
const WAITING_SONG: SoundSource = require('../../assets/audio/signature/goshti-waiting-song.m4a');
const WAITING_LOOP: SoundSource = require('../../assets/audio/signature/goshti-waiting-loop.wav');
const WAITING_LINES: SoundSource[] = [
  require('../../assets/audio/signature/goshti-waiting-line-1.m4a'),
  require('../../assets/audio/signature/goshti-waiting-line-2.m4a'),
  require('../../assets/audio/signature/goshti-waiting-line-3.m4a'),
  require('../../assets/audio/signature/goshti-waiting-line-4.m4a'),
];

const SFX: Record<SfxId, SoundSource | null> = {
  BIRDS: require('../../assets/audio/sfx/birds.wav'),
  RAIN_LIGHT: null, // synthesized water sounded artificial — needs a real recording
  RAIN_HEAVY: null,
  WIND: require('../../assets/audio/sfx/wind.wav'),
  FOOTSTEPS: require('../../assets/audio/sfx/footsteps.wav'),
  FOOTSTEPS_RUNNING: require('../../assets/audio/sfx/footsteps_running.wav'),
  DOOR_KNOCK: require('../../assets/audio/sfx/door_knock.wav'),
  DOOR_OPEN: require('../../assets/audio/sfx/door_open.wav'),
  CAT_MEOW: null,
  DOG_BARK: null,
  ELEPHANT: null,
  LION: null,
  OWL: require('../../assets/audio/sfx/owl.wav'),
  TRAIN: require('../../assets/audio/sfx/train.wav'),
  BELL: require('../../assets/audio/sfx/bell.wav'),
  THUNDER_GENTLE: require('../../assets/audio/sfx/thunder_gentle.wav'),
  MAGIC_SPARKLE: require('../../assets/audio/sfx/magic_sparkle.wav'),
  SPLASH: null, // synthesized water sounded artificial — needs a real recording
  BRANCH_SNAP: require('../../assets/audio/sfx/branch_snap.wav'),
  CLAP: require('../../assets/audio/sfx/clap.wav'),
  LAUGHTER: null,
  FOREST_AMBIENCE: require('../../assets/audio/ambience/forest_ambience.wav'),
  NIGHT_AMBIENCE: require('../../assets/audio/ambience/night_ambience.wav'),
  VILLAGE_AMBIENCE: require('../../assets/audio/ambience/village_ambience.wav'),
  CITY_AMBIENCE: require('../../assets/audio/ambience/city_ambience.wav'),
  WATER_STREAM: null, // synthesized water sounded artificial — needs a real recording
  WAVES: null, // synthesized water sounded artificial — needs a real recording
  CLOCK_TICK: require('../../assets/audio/sfx/clock_tick.wav'),
  OBJECT_DROP: require('../../assets/audio/sfx/object_drop.wav'),
  WHOOSH_SOFT: require('../../assets/audio/sfx/whoosh_soft.wav'),
};

const MUSIC: Record<MusicMood, SoundSource | null> = {
  GENTLE: require('../../assets/audio/music/gentle.wav'),
  PLAYFUL: require('../../assets/audio/music/playful.wav'),
  ADVENTURE: require('../../assets/audio/music/adventure.wav'),
  MYSTERY: require('../../assets/audio/music/mystery.wav'),
  MAGICAL: require('../../assets/audio/music/magical.wav'),
  EMOTIONAL: require('../../assets/audio/music/emotional.wav'),
  VICTORY: require('../../assets/audio/music/victory.wav'),
  BEDTIME: require('../../assets/audio/music/bedtime.wav'),
};

export const bundledSounds: SoundCatalog = {
  ui: (id) => UI[id] ?? null,
  signature: () => SIGNATURE,
  waitingSong: () => WAITING_SONG,
  waitingLoop: () => WAITING_LOOP,
  waitingLines: () => WAITING_LINES,
  sfx: (id) => SFX[id] ?? null,
  music: (mood) => MUSIC[mood] ?? null,
};
