/**
 * Restrained interface sounds. Screens ask for a sound by MEANING (UiSoundId) — they never
 * touch audio files. Not every tap makes a sound: only the moments listed in UiSoundId.
 * Parents can switch app sounds off in Parent mode; this never affects story audio.
 */
import { UI_SOUND_LEVEL } from '@engine/index';

import type { SoundCatalog, UiSoundId } from './soundAssets';
import type { SoundHandle, SoundPlayerFactory } from './soundPlayer';

export type { UiSoundId } from './soundAssets';

export interface AppSettings {
  /** Interface sounds (category click, sparkle, ting…). Default on. */
  appSounds: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = { appSounds: true };

export interface SettingsStore {
  getSettings(): Promise<AppSettings | null>;
  saveSettings(settings: AppSettings): Promise<void>;
}

export interface UiSoundService {
  play(id: UiSoundId): void;
  /** The GOSHTI waiting song once, then a quiet instrumental loop, while a story is prepared. */
  startWaitingSong(): Promise<void>;
  /** Fades the waiting song out. Returns true if it was still playing. */
  stopWaitingSong(fadeMs?: number): boolean;
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

/** The waiting song is softer than Aaji but clearly audible. */
const WAITING_SONG_LEVEL = 0.45;
/** After the song: a quiet instrumental loop until the story is ready. */
const WAITING_LOOP_LEVEL = 0.22;
const LOOP_FADE_IN_MS = 1500;

/** Ignore a repeat of the same sound within this window (double taps, re-renders). */
const REPEAT_GUARD_MS = 400;

export class DefaultUiSoundService implements UiSoundService {
  private enabled: boolean | null = null;
  private readonly lastPlayed = new Map<UiSoundId, number>();
  private current: SoundHandle | null = null;
  private song: { handle: SoundHandle; fade: ReturnType<typeof setInterval> | null; level: number } | null = null;
  /** Bumped by stopWaitingSong so a start still awaiting settings never begins late. */
  private songToken = 0;

  constructor(
    private readonly deps: {
      catalog: SoundCatalog;
      players: SoundPlayerFactory;
      settings: SettingsStore;
      volume?: number;
      now?: () => number;
    },
  ) {}

  play(id: UiSoundId): void {
    void this.playAsync(id);
  }

  /** Exposed for tests; resolves once the sound has been started (or skipped). */
  async playAsync(id: UiSoundId): Promise<boolean> {
    if (!(await this.isEnabled())) return false;
    const now = (this.deps.now ?? Date.now)();
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < REPEAT_GUARD_MS) return false;
    const source = this.deps.catalog.ui(id);
    if (!source) return false;
    this.lastPlayed.set(id, now);
    try {
      // One UI sound at a time — a new one replaces the previous, never stacks.
      this.current?.release();
      const handle = this.deps.players.create(source, { volume: this.deps.volume ?? UI_SOUND_LEVEL });
      this.current = handle;
      handle.onEnd(() => {
        handle.release();
        if (this.current === handle) this.current = null;
      });
      handle.play();
      return true;
    } catch {
      return false; // a UI sound must never break the app
    }
  }

  async startWaitingSong(): Promise<void> {
    if (this.song) return;
    const token = ++this.songToken;
    if (!(await this.isEnabled()) || token !== this.songToken) return;
    const source = this.deps.catalog.waitingSong();
    if (!source) return;
    try {
      const handle = this.deps.players.create(source, { volume: WAITING_SONG_LEVEL });
      const song = { handle, fade: null as ReturnType<typeof setInterval> | null, level: WAITING_SONG_LEVEL };
      this.song = song;
      // The song plays once; if the story still isn't ready, a quiet instrumental loop takes over.
      handle.onEnd(() => {
        const stillWaiting = this.song === song && !song.fade && token === this.songToken;
        this.releaseSong(song);
        if (stillWaiting) this.startLoop(token);
      });
      handle.play();
    } catch {
      this.song = null;
    }
  }

  private startLoop(token: number) {
    const source = this.deps.catalog.waitingLoop();
    if (!source || token !== this.songToken) return;
    try {
      const handle = this.deps.players.create(source, { volume: 0, loop: true });
      const loop = { handle, fade: null as ReturnType<typeof setInterval> | null, level: WAITING_LOOP_LEVEL };
      this.song = loop;
      handle.play();
      const steps = Math.round(LOOP_FADE_IN_MS / 50);
      let i = 0;
      const rise = setInterval(() => {
        i += 1;
        if (this.song !== loop || loop.fade) return clearInterval(rise);
        handle.setVolume(WAITING_LOOP_LEVEL * Math.min(1, i / steps));
        if (i >= steps) clearInterval(rise);
      }, 50);
    } catch {
      this.song = null;
    }
  }

  stopWaitingSong(fadeMs = 800): boolean {
    this.songToken += 1;
    const song = this.song;
    if (!song) return false;
    if (song.fade) return true; // already fading out
    const steps = Math.max(1, Math.round(fadeMs / 50));
    let i = 0;
    song.fade = setInterval(() => {
      i += 1;
      song.handle.setVolume(song.level * (1 - i / steps));
      if (i >= steps) this.releaseSong(song);
    }, 50);
    return true;
  }

  private releaseSong(song: NonNullable<DefaultUiSoundService['song']>) {
    if (song.fade) clearInterval(song.fade);
    song.handle.release();
    if (this.song === song) this.song = null;
  }

  async isEnabled(): Promise<boolean> {
    if (this.enabled === null) {
      const s = await this.deps.settings.getSettings().catch(() => null);
      this.enabled = (s ?? DEFAULT_SETTINGS).appSounds;
    }
    return this.enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    const s = (await this.deps.settings.getSettings().catch(() => null)) ?? DEFAULT_SETTINGS;
    await this.deps.settings.saveSettings({ ...s, appSounds: enabled });
  }
}
