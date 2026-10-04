import type { GoshtiStory } from '@/types/models';

export interface PlaybackStatus {
  storyId: string | null;
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  didFinish: boolean;
  /** Which voice is narrating: Aaji's recorded voice, or the phone's built-in voice. */
  voice?: 'aaji' | 'phone';
  /** Playing was requested but the next audio part isn't ready yet. */
  waiting?: boolean;
}

export type PlaybackListener = (status: PlaybackStatus) => void;

/**
 * Plays a story's narration. The mock simulates a playhead with a timer so the player
 * UI behaves realistically; a real implementation (expo-audio) will play `audioUrl`.
 */
export interface AudioService {
  load(story: GoshtiStory): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  unload(): Promise<void>;
  getStatus(): PlaybackStatus;
  subscribe(listener: PlaybackListener): () => void;
}

const IDLE: PlaybackStatus = {
  storyId: null,
  isPlaying: false,
  positionSeconds: 0,
  durationSeconds: 0,
  didFinish: false,
};

export class MockAudioService implements AudioService {
  private status: PlaybackStatus = IDLE;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<PlaybackListener>();

  async load(story: GoshtiStory) {
    this.stopTimer();
    this.setStatus({ ...IDLE, storyId: story.id, durationSeconds: story.durationSeconds });
  }

  async play() {
    if (!this.status.storyId || this.status.isPlaying) return;
    const restart = this.status.didFinish;
    this.setStatus({
      ...this.status,
      isPlaying: true,
      didFinish: false,
      positionSeconds: restart ? 0 : this.status.positionSeconds,
    });
    this.timer = setInterval(() => this.tick(), 1000);
  }

  async pause() {
    this.stopTimer();
    this.setStatus({ ...this.status, isPlaying: false });
  }

  async unload() {
    this.stopTimer();
    this.setStatus(IDLE);
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

  private tick() {
    const position = this.status.positionSeconds + 1;
    if (position >= this.status.durationSeconds) {
      this.stopTimer();
      this.setStatus({ ...this.status, positionSeconds: this.status.durationSeconds, isPlaying: false, didFinish: true });
    } else {
      this.setStatus({ ...this.status, positionSeconds: position });
    }
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private setStatus(next: PlaybackStatus) {
    this.status = next;
    this.listeners.forEach((l) => l(next));
  }
}
