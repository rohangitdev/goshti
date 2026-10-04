/**
 * Minimal sound-playing primitive used by the UI sounds and the story soundscape.
 * Kept behind an interface so the mixing logic is testable without a device.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

/** A bundled asset (require(...) result) or a local file uri. */
export type SoundSource = number | { uri: string };

export interface SoundHandle {
  play(): void;
  pause(): void;
  setVolume(volume: number): void;
  /** Called once when a non-looping sound reaches its end. */
  onEnd(callback: () => void): void;
  release(): void;
}

export interface SoundPlayerFactory {
  create(source: SoundSource, options: { volume: number; loop?: boolean }): SoundHandle;
}

export class ExpoSoundPlayerFactory implements SoundPlayerFactory {
  create(source: SoundSource, options: { volume: number; loop?: boolean }): SoundHandle {
    const player: AudioPlayer = createAudioPlayer(source);
    player.volume = options.volume;
    player.loop = !!options.loop;
    let released = false;
    let ended: (() => void) | null = null;
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish && ended) {
        const cb = ended;
        ended = null;
        cb();
      }
    });
    return {
      play: () => !released && player.play(),
      pause: () => !released && player.pause(),
      setVolume: (v) => {
        if (!released) player.volume = Math.max(0, Math.min(1, v));
      },
      onEnd: (cb) => {
        ended = cb;
      },
      release: () => {
        if (released) return;
        released = true;
        sub.remove();
        player.remove();
      },
    };
  }
}

/** Plays nothing — tests, web previews without audio, or sounds switched off. */
export class SilentSoundPlayerFactory implements SoundPlayerFactory {
  create(): SoundHandle {
    let ended: (() => void) | null = null;
    return {
      play: () => setTimeout(() => ended?.(), 0),
      pause: () => {},
      setVolume: () => {},
      onEnd: (cb) => {
        ended = cb;
      },
      release: () => {
        ended = null;
      },
    };
  }
}
