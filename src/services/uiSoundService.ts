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
/** During a long wait: a sung line over the loop, first after this long… */
const FIRST_LINE_AFTER_MS = 8000;
/** …then this long after each line ends (so roughly every 20 s). */
const LINE_GAP_MS = 12000;
/** Each line carries its own music (in its own key), so the loop steps aside while it plays. */
const LOOP_UNDER_LINE_LEVEL = 0;

/** Ignore a repeat of the same sound within this window (double taps, re-renders). */
const REPEAT_GUARD_MS = 400;

export class DefaultUiSoundService implements UiSoundService {
  private enabled: boolean | null = null;
  private readonly lastPlayed = new Map<UiSoundId, number>();
  private current: SoundHandle | null = null;
  private song: { handle: SoundHandle; fade: ReturnType<typeof setInterval> | null; level: number } | null = null;
  /** Bumped by stopWaitingSong so a start still awaiting settings never begins late. */
  private songToken = 0;
  private line: { handle: SoundHandle; fade: ReturnType<typeof setInterval> | null; level: number } | null = null;
  private lineTimer: ReturnType<typeof setTimeout> | null = null;
  /** Rotates across waits too, so the child hears different lines each time. */
  private nextLine = 0;

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
      this.scheduleLine(token, FIRST_LINE_AFTER_MS);
    } catch {
      this.song = null;
    }
  }

  private scheduleLine(token: number, delayMs: number) {
    const lines = this.deps.catalog.waitingLines();
    if (!lines.length) return;
    this.lineTimer = setTimeout(() => {
      this.lineTimer = null;
      const loop = this.song;
      if (token !== this.songToken || !loop || loop.fade) return;
      try {
        const source = lines[this.nextLine % lines.length];
        this.nextLine += 1;
        const handle = this.deps.players.create(source, { volume: WAITING_SONG_LEVEL });
        const line = { handle, fade: null as ReturnType<typeof setInterval> | null, level: WAITING_SONG_LEVEL };
        this.line = line;
        this.rampLoop(loop, LOOP_UNDER_LINE_LEVEL, 400);
        handle.onEnd(() => {
          handle.release();
          if (this.line === line) this.line = null;
          if (token !== this.songToken || this.song !== loop || loop.fade) return;
          this.rampLoop(loop, WAITING_LOOP_LEVEL, 1200);
          this.scheduleLine(token, LINE_GAP_MS);
        });
        handle.play();
      } catch {
        this.line = null;
      }
    }, delayMs);
  }

  private loopRamp: ReturnType<typeof setInterval> | null = null;

  /** Smoothly moves the loop's volume (it is the "song" slot while it plays). */
  private rampLoop(loop: NonNullable<DefaultUiSoundService['song']>, to: number, ms: number) {
    if (this.loopRamp) clearInterval(this.loopRamp);
    const from = loop.level;
    const steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    this.loopRamp = setInterval(() => {
      i += 1;
      if (this.song !== loop || loop.fade) {
        if (this.loopRamp) clearInterval(this.loopRamp);
        this.loopRamp = null;
        return;
      }
      loop.level = from + ((to - from) * i) / steps;
      loop.handle.setVolume(loop.level);
      if (i >= steps && this.loopRamp) {
        clearInterval(this.loopRamp);
        this.loopRamp = null;
      }
    }, 50);
  }

  stopWaitingSong(fadeMs = 800): boolean {
    this.songToken += 1;
    if (this.lineTimer) clearTimeout(this.lineTimer);
    this.lineTimer = null;
    const line = this.line;
    if (line && !line.fade) {
      const steps = Math.max(1, Math.round(fadeMs / 50));
      let j = 0;
      line.fade = setInterval(() => {
        j += 1;
        line.handle.setVolume(line.level * (1 - j / steps));
        if (j >= steps) {
          if (line.fade) clearInterval(line.fade);
          line.handle.release();
          if (this.line === line) this.line = null;
        }
      }, 50);
    }
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
