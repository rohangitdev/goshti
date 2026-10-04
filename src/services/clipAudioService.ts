/**
 * Plays Aaji's rendered voice: the story's audio parts in order, with the pauses between
 * them, waiting for parts that are still being rendered. Uses expo-audio (works in Expo Go).
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import type { GoshtiStory } from '@/types/models';

import type { AudioService, PlaybackListener, PlaybackStatus } from './audioService';
import type { VoiceService, VoiceState } from './voiceService';

const IDLE: PlaybackStatus = { storyId: null, isPlaying: false, positionSeconds: 0, durationSeconds: 0, didFinish: false };

export class ClipAudioService implements AudioService {
  private status: PlaybackStatus = IDLE;
  private listeners = new Set<PlaybackListener>();
  private player: AudioPlayer | null = null;
  private playerPart = -1;
  private state: VoiceState | null = null;
  private index = 0;
  private wantPlaying = false;
  private fallbackDuration = 0;
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private unsubscribeVoice: (() => void) | null = null;
  private audioModeSet = false;
  private retried = false;

  /** Called when Aaji's voice can't be played (render failed) — the caller switches to the phone voice. */
  onUnavailable: (() => void) | null = null;

  constructor(private readonly voice: VoiceService) {}

  async load(story: GoshtiStory) {
    await this.unload();
    this.state = await this.voice.get(story.id);
    this.fallbackDuration = story.durationSeconds;
    this.index = 0;
    this.retried = false;
    this.unsubscribeVoice = this.voice.subscribe(story.id, (s) => {
      this.state = s;
      this.emit({ durationSeconds: this.totalSeconds() });
      if (this.wantPlaying && this.status.waiting) this.startCurrent();
    });
    if (this.state?.status === 'rendering') void this.voice.render(story.id); // resume if interrupted
    this.setStatus({ ...IDLE, storyId: story.id, durationSeconds: this.totalSeconds(), voice: 'aaji' });
  }

  async play() {
    if (!this.status.storyId) return;
    if (!this.audioModeSet) {
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      this.audioModeSet = true;
    }
    this.wantPlaying = true;
    if (this.status.didFinish) {
      this.index = 0;
      this.emit({ didFinish: false, positionSeconds: 0 });
    }
    if (this.player && this.playerPart === this.index && !this.gapTimer) {
      this.player.play();
      this.emit({ isPlaying: true, waiting: false });
      this.startTicker();
    } else if (!this.gapTimer) {
      this.startCurrent();
    }
  }

  async pause() {
    this.wantPlaying = false;
    this.player?.pause();
    if (this.gapTimer) clearTimeout(this.gapTimer);
    this.gapTimer = null;
    this.stopTicker();
    this.emit({ isPlaying: false, waiting: false });
  }

  async unload() {
    this.wantPlaying = false;
    if (this.gapTimer) clearTimeout(this.gapTimer);
    this.gapTimer = null;
    this.stopTicker();
    this.unsubscribeVoice?.();
    this.unsubscribeVoice = null;
    this.player?.remove();
    this.player = null;
    this.playerPart = -1;
    this.state = null;
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

  // -------------------------------------------------------------------------

  private startCurrent() {
    const state = this.state;
    if (!state || !this.wantPlaying) return;
    const part = state.parts[this.index];
    if (!part) {
      if (state.status === 'failed') {
        const storyId = this.status.storyId;
        if (!this.retried && storyId) {
          // One retry (e.g. after a network blip), once the failed attempt has fully finished.
          this.retried = true;
          this.emit({ isPlaying: false, waiting: true });
          setTimeout(async () => {
            await this.voice.render(storyId);
            if (this.status.storyId !== storyId) return;
            this.state = await this.voice.get(storyId);
            if (this.wantPlaying) this.startCurrent();
          }, 0);
          return;
        }
        this.onUnavailable?.();
        return;
      }
      this.emit({ isPlaying: false, waiting: true });
      return;
    }
    if (!this.player) {
      this.player = createAudioPlayer({ uri: part.uri });
      this.player.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish) this.onPartEnded();
      });
    } else {
      this.player.replace({ uri: part.uri });
    }
    this.playerPart = this.index;
    this.player.play();
    this.emit({ isPlaying: true, waiting: false });
    this.startTicker();
  }

  private onPartEnded() {
    const finished = this.state?.parts[this.index];
    this.index += 1;
    if (!this.state || this.index >= this.state.totalChunks) {
      this.stopTicker();
      this.wantPlaying = false;
      this.index = 0;
      this.emit({ isPlaying: false, didFinish: true, positionSeconds: this.totalSeconds(), waiting: false });
      return;
    }
    this.gapTimer = setTimeout(() => {
      this.gapTimer = null;
      this.startCurrent();
    }, finished?.pauseAfterMs ?? 0);
  }

  private totalSeconds(): number {
    const parts = this.state?.parts ?? [];
    if (parts.length && parts.every(Boolean)) {
      return Math.round(parts.reduce((sum, p) => sum + p!.seconds + p!.pauseAfterMs / 1000, 0));
    }
    return this.fallbackDuration;
  }

  private position(): number {
    const parts = this.state?.parts ?? [];
    let seconds = 0;
    for (let i = 0; i < this.index; i++) seconds += (parts[i]?.seconds ?? 0) + (parts[i]?.pauseAfterMs ?? 0) / 1000;
    if (this.player && this.playerPart === this.index) seconds += this.player.currentTime || 0;
    return Math.min(seconds, this.totalSeconds());
  }

  private startTicker() {
    this.stopTicker();
    this.ticker = setInterval(() => this.emit({ positionSeconds: this.position() }), 500);
  }

  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private emit(patch: Partial<PlaybackStatus>) {
    this.setStatus({ ...this.status, ...patch });
  }

  private setStatus(next: PlaybackStatus) {
    this.status = next;
    this.listeners.forEach((l) => l(next));
  }
}
