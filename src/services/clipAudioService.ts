/**
 * Plays Aaji's rendered voice: the story's audio parts in order, with the pauses between
 * them, waiting for parts that are still being rendered. Uses expo-audio (works in Expo Go).
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { buildTtsChunks } from '@engine/index';
import type { GoshtiStory } from '@/types/models';

import type { AudioService, PlaybackListener, PlaybackStatus, SoundCue } from './audioService';
import { prepareStoryAudio } from './audioSession';
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
  /** Per audio part: the sound cues inside it and where they fall (0–1 of the part). */
  private partCues: { cue: SoundCue; at: number }[][] | null = null;
  private firedCues = new Set<number>();
  private cueTimers: ReturnType<typeof setTimeout>[] = [];

  /** Sound instructions (SFX / ambience / music), timed to Aaji's voice. */
  onCue: ((cue: SoundCue) => void) | null = null;

  /** Called when Aaji's voice can't be played (render failed) — the caller switches to the phone voice. */
  onUnavailable: (() => void) | null = null;

  private title = '';

  constructor(
    private readonly voice: VoiceService,
    /** Android: show lock-screen controls, which keeps playback alive in the background. */
    private readonly options: { lockScreen?: boolean } = {},
  ) {}

  async load(story: GoshtiStory) {
    await this.unload();
    this.state = await this.voice.get(story.id);
    this.fallbackDuration = story.durationSeconds;
    this.title = story.title;
    this.index = 0;
    this.retried = false;
    this.partCues = cuePlan(story, this.state?.totalChunks);
    this.firedCues.clear();
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
      await prepareStoryAudio();
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
      this.scheduleCues(this.player.currentTime || 0);
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
    this.clearCueTimers();
    this.emit({ isPlaying: false, waiting: false });
  }

  async unload() {
    this.wantPlaying = false;
    if (this.gapTimer) clearTimeout(this.gapTimer);
    this.gapTimer = null;
    this.stopTicker();
    this.clearCueTimers();
    this.partCues = null;
    this.unsubscribeVoice?.();
    this.unsubscribeVoice = null;
    if (this.options.lockScreen) this.player?.setActiveForLockScreen?.(false);
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
      this.player = createAudioPlayer({ uri: part.uri }, { keepAudioSessionActive: true });
      if (this.options.lockScreen) this.player.setActiveForLockScreen?.(true, { title: this.title, artist: 'गोष्टी' });
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
    this.firedCues.clear();
    this.scheduleCues(0);
  }

  private onPartEnded() {
    this.flushCues();
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

  /** Schedules the current part's not-yet-played cues, relative to `fromSeconds` into the part. */
  private scheduleCues(fromSeconds: number) {
    this.clearCueTimers();
    const cues = this.partCues?.[this.index];
    const part = this.state?.parts[this.index];
    if (!cues?.length || !part) return;
    cues.forEach((c, i) => {
      if (this.firedCues.has(i)) return;
      const delayMs = Math.max(0, c.at * part.seconds - fromSeconds) * 1000;
      this.cueTimers.push(setTimeout(() => this.fireCue(i), delayMs));
    });
  }

  private fireCue(i: number) {
    const c = this.partCues?.[this.index]?.[i];
    if (!c || this.firedCues.has(i)) return;
    this.firedCues.add(i);
    this.onCue?.(c.cue);
  }

  /** A part ended: any cue still pending (e.g. "stop ambience" at its very end) plays now. */
  private flushCues() {
    this.clearCueTimers();
    this.partCues?.[this.index]?.forEach((_, i) => this.fireCue(i));
  }

  private clearCueTimers() {
    this.cueTimers.forEach(clearTimeout);
    this.cueTimers = [];
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

/**
 * Rebuilds the backend's chunking of the story (deterministic: same script, same age) to know
 * which sound cues fall inside each audio part. If it doesn't match the rendered parts, sounds
 * are skipped rather than played at the wrong moment.
 */
export function cuePlan(story: GoshtiStory, totalChunks: number | undefined): { cue: SoundCue; at: number }[][] | null {
  try {
    if (!totalChunks || story.audioScript?.version !== 2) return null;
    const chunks = buildTtsChunks(story.audioScript, { sentencePauses: story.age <= 5 });
    if (chunks.length !== totalChunks) return null;
    return chunks.map((c) => c.cues.map((cue, i) => ({ cue, at: c.cueAt[i] ?? 0 })));
  } catch {
    return null;
  }
}
