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
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

/** Ignore a repeat of the same sound within this window (double taps, re-renders). */
const REPEAT_GUARD_MS = 400;

export class DefaultUiSoundService implements UiSoundService {
  private enabled: boolean | null = null;
  private readonly lastPlayed = new Map<UiSoundId, number>();
  private current: SoundHandle | null = null;

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
