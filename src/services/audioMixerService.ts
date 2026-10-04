/**
 * GOSHTI audio mixer — performs the Story Engine's sound instructions on the device.
 *
 *   approved story → AudioScript (engine) → Aaji TTS parts (backend, cached on the phone)
 *        → THIS: narration + SFX + ambience + music, layered with fixed priorities → speaker
 *
 * The engine only says WHAT should happen (approved ids, in order); this file decides HOW it
 * sounds. Narration is the primary layer and always plays at full level; SFX, ambience and
 * music sit underneath at the age policy's levels (soundDesign.ts). Missing assets are skipped.
 *
 * Today the mix happens live, in sync with the narration. A future server-side renderer can
 * produce one pre-mixed file per story from the same AudioScript; the app would then simply
 * play that file (the AudioService interface stays the same).
 */
import { isAmbienceId, SIGNATURE_LEVEL, soundPolicyFor, type MixLevels, type MusicMood, type SfxId } from '@engine/index';
import type { GoshtiStory } from '@/types/models';

import type { AudioService, PlaybackListener, PlaybackStatus, SoundCue } from './audioService';
import type { SoundCatalog } from './soundAssets';
import type { SoundHandle, SoundPlayerFactory } from './soundPlayer';

const BED_FADE_MS = 1200;
const MUSIC_FADE_IN_MS = 800;
const MUSIC_FADE_OUT_MS = 1500;
const FADE_STEP_MS = 60;
/** Never stack more than this many one-shot effects. */
const MAX_ONE_SHOTS = 2;
/** Safety net if a sound never reports its end. */
const ONE_SHOT_MAX_MS = 10_000;
const SIGNATURE_MAX_MS = 3500;

interface Layer {
  handle: SoundHandle;
  kind: 'sfx' | 'ambience' | 'music';
  id: string;
  level: number;
  fadeTimer: ReturnType<typeof setInterval> | null;
  stopping: boolean;
}

/** The non-narration layers of a story: ambience bed, one-shot SFX, occasional music, signature. */
export class StorySoundscape {
  private levels: MixLevels = soundPolicyFor(6).levels;
  private readonly layers = new Set<Layer>();
  private paused = false;
  private signature: { handle: SoundHandle; done: (ok: boolean) => void } | null = null;

  constructor(private readonly deps: { catalog: SoundCatalog; players: SoundPlayerFactory }) {}

  /** Age-adaptive mix levels for the next story. */
  setAge(age: number) {
    this.levels = soundPolicyFor(age).levels;
  }

  getLevels(): MixLevels {
    return this.levels;
  }

  /** Performs one AudioScript sound instruction. Unknown or missing sounds are ignored. */
  cue(cue: SoundCue) {
    try {
      if (cue.type === 'SFX') this.oneShot(cue.soundId);
      else if (cue.type === 'AMBIENCE') {
        if (cue.action === 'START') this.startBed(cue.soundId);
        else this.stopLayers((l) => l.kind === 'ambience' && l.id === cue.soundId, BED_FADE_MS);
      } else if (cue.type === 'MUSIC_CUE') {
        if (cue.action === 'START') this.startMusic(cue.mood);
        else this.stopLayers((l) => l.kind === 'music' && l.id === cue.mood, MUSIC_FADE_OUT_MS);
      }
    } catch {
      // sound design must never interrupt the story
    }
  }

  /** Plays the GOSHTI signature; resolves true when it ends, false if cancelled/unavailable. */
  playSignature(): Promise<boolean> {
    this.cancelSignature();
    const source = this.deps.catalog.signature();
    if (!source) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const handle = this.deps.players.create(source, { volume: SIGNATURE_LEVEL });
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        handle.release();
        if (this.signature?.handle === handle) this.signature = null;
        resolve(ok);
      };
      const timer = setTimeout(() => done(true), SIGNATURE_MAX_MS);
      this.signature = { handle, done };
      handle.onEnd(() => done(true));
      handle.play();
    });
  }

  cancelSignature() {
    this.signature?.done(false);
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    for (const l of this.layers) l.handle.pause();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    for (const l of this.layers) l.handle.play();
  }

  /** Fades everything out (end of story) or cuts it immediately. */
  stop(immediately = false) {
    this.cancelSignature();
    this.stopLayers(() => true, immediately ? 0 : BED_FADE_MS);
    this.paused = false;
  }

  /** For tests and debugging. */
  activeLayers(): { kind: Layer['kind']; id: string }[] {
    return [...this.layers].filter((l) => !l.stopping).map((l) => ({ kind: l.kind, id: l.id }));
  }

  // -------------------------------------------------------------------------

  private oneShot(id: SfxId) {
    const source = this.deps.catalog.sfx(id);
    if (!source) return;
    const live = [...this.layers].filter((l) => l.kind === 'sfx' && !l.stopping);
    if (live.length >= MAX_ONE_SHOTS) return;
    const level = isAmbienceId(id) ? this.levels.ambience : this.levels.sfx;
    const layer = this.add('sfx', id, source, level, false);
    const safety = setTimeout(() => this.remove(layer), ONE_SHOT_MAX_MS);
    layer.handle.onEnd(() => {
      clearTimeout(safety);
      this.remove(layer);
    });
  }

  private startBed(id: SfxId) {
    if ([...this.layers].some((l) => l.kind === 'ambience' && l.id === id && !l.stopping)) return;
    const source = this.deps.catalog.sfx(id);
    if (!source) return;
    // One bed at a time.
    this.stopLayers((l) => l.kind === 'ambience', BED_FADE_MS);
    const layer = this.add('ambience', id, source, 0, true);
    this.fade(layer, this.levels.ambience, BED_FADE_MS);
  }

  private startMusic(mood: MusicMood) {
    const source = this.deps.catalog.music(mood);
    if (!source) return;
    this.stopLayers((l) => l.kind === 'music', MUSIC_FADE_IN_MS);
    const layer = this.add('music', mood, source, 0, false);
    layer.handle.onEnd(() => this.remove(layer));
    this.fade(layer, this.levels.music, MUSIC_FADE_IN_MS);
  }

  private add(kind: Layer['kind'], id: string, source: Parameters<SoundPlayerFactory['create']>[0], volume: number, loop: boolean): Layer {
    const handle = this.deps.players.create(source, { volume, loop });
    const layer: Layer = { handle, kind, id, level: volume, fadeTimer: null, stopping: false };
    this.layers.add(layer);
    if (!this.paused) handle.play();
    return layer;
  }

  private stopLayers(match: (l: Layer) => boolean, fadeMs: number) {
    for (const l of [...this.layers]) {
      if (!match(l) || l.stopping) continue;
      l.stopping = true;
      if (fadeMs <= 0 || this.paused) this.remove(l);
      else this.fade(l, 0, fadeMs, () => this.remove(l));
    }
  }

  private fade(layer: Layer, to: number, ms: number, done?: () => void) {
    if (layer.fadeTimer) clearInterval(layer.fadeTimer);
    const from = layer.level;
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    let i = 0;
    layer.fadeTimer = setInterval(() => {
      i += 1;
      layer.level = from + ((to - from) * i) / steps;
      layer.handle.setVolume(layer.level);
      if (i >= steps) {
        if (layer.fadeTimer) clearInterval(layer.fadeTimer);
        layer.fadeTimer = null;
        done?.();
      }
    }, FADE_STEP_MS);
  }

  private remove(layer: Layer) {
    if (layer.fadeTimer) clearInterval(layer.fadeTimer);
    layer.fadeTimer = null;
    layer.handle.release();
    this.layers.delete(layer);
  }
}

/**
 * The story player's AudioService: GOSHTI signature → Aaji's narration (her intro line is the
 * first line of the script) with the soundscape layered underneath, following the narration's
 * play / pause / waiting / finished state.
 */
export class LayeredStoryAudioService implements AudioService {
  private status: PlaybackStatus;
  private readonly listeners = new Set<PlaybackListener>();
  private startedOnce = false;
  private intro = false;
  private token = 0;

  onCue: ((cue: SoundCue) => void) | null = null;

  constructor(
    private readonly narration: AudioService,
    private readonly soundscape: StorySoundscape,
    private readonly options: { signature: boolean } = { signature: true },
  ) {
    this.status = narration.getStatus();
    narration.onCue = (cue) => {
      this.soundscape.cue(cue);
      this.onCue?.(cue);
    };
    narration.subscribe((s) => this.onNarration(s));
  }

  async load(story: GoshtiStory) {
    this.token += 1;
    this.intro = false;
    this.startedOnce = false;
    this.soundscape.stop(true);
    this.soundscape.setAge(story.age);
    await this.narration.load(story);
  }

  async play() {
    if (this.intro) return;
    const s = this.narration.getStatus();
    if (!s.storyId) return;
    const fromStart = s.didFinish || (!this.startedOnce && s.positionSeconds === 0);
    if (fromStart && this.options.signature) {
      const token = ++this.token;
      this.soundscape.stop(true);
      this.intro = true;
      this.emit();
      const ok = await this.soundscape.playSignature();
      this.intro = false;
      if (token !== this.token) return; // paused / unloaded meanwhile
      if (!ok) this.emit();
    }
    this.startedOnce = true;
    await this.narration.play();
  }

  async pause() {
    this.token += 1;
    if (this.intro) {
      this.intro = false;
      this.soundscape.cancelSignature();
      this.emit();
      return;
    }
    await this.narration.pause();
  }

  async unload() {
    this.token += 1;
    this.intro = false;
    this.soundscape.stop(true);
    await this.narration.unload();
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

  private onNarration(s: PlaybackStatus) {
    if (s.didFinish) {
      this.startedOnce = false;
      this.soundscape.stop();
    } else if (s.isPlaying && !s.waiting) this.soundscape.resume();
    else this.soundscape.pause();
    this.emit(s);
  }

  private emit(s: PlaybackStatus = this.narration.getStatus()) {
    this.status = this.intro ? { ...s, isPlaying: true, intro: true } : { ...s, intro: false };
    this.listeners.forEach((l) => l(this.status));
  }
}
