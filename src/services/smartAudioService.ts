/**
 * Chooses the narrator per story: Aaji's rendered voice when it exists (or is rendering),
 * otherwise the phone's built-in voice. If Aaji's voice fails mid-way, it switches to the
 * phone voice so the child still hears the story.
 */
import type { GoshtiStory } from '@/types/models';

import type { AudioService, PlaybackListener, PlaybackStatus, SoundCue } from './audioService';
import type { ClipAudioService } from './clipAudioService';
import type { VoiceService } from './voiceService';

export class SmartAudioService implements AudioService {
  private active: AudioService;
  private unsubscribe: (() => void) | null = null;
  private listeners = new Set<PlaybackListener>();
  private status: PlaybackStatus;
  private story: GoshtiStory | null = null;

  /** Sound instructions from whichever narrator is active. */
  onCue: ((cue: SoundCue) => void) | null = null;

  constructor(
    private readonly clip: ClipAudioService | null,
    private readonly speech: AudioService,
    private readonly voice: VoiceService | null,
  ) {
    this.active = speech;
    this.status = speech.getStatus();
    if (clip) clip.onUnavailable = () => void this.switchToSpeech(true);
    for (const service of [clip, speech]) {
      if (service) service.onCue = (cue) => service === this.active && this.onCue?.(cue);
    }
  }

  async load(story: GoshtiStory) {
    this.story = story;
    const state = this.voice ? await this.voice.get(story.id) : null;
    const useAaji = !!(this.clip && state && (state.status !== 'failed' || state.parts.some(Boolean)));
    if (state?.status === 'failed' && this.voice) void this.voice.render(story.id); // retry for next time
    await this.use(useAaji ? this.clip! : this.speech);
    await this.active.load(story);
  }

  play() {
    return this.active.play();
  }

  pause() {
    return this.active.pause();
  }

  async unload() {
    await this.active.unload();
    this.story = null;
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

  private async use(service: AudioService) {
    if (service !== this.active) await this.active.unload();
    this.unsubscribe?.();
    this.active = service;
    const voice = service === this.speech ? 'phone' : 'aaji';
    this.unsubscribe = service.subscribe((s) => {
      this.status = { ...s, voice };
      this.listeners.forEach((l) => l(this.status));
    });
  }

  private async switchToSpeech(autoplay: boolean) {
    if (!this.story) return;
    const story = this.story;
    await this.use(this.speech);
    await this.speech.load(story);
    if (autoplay) await this.speech.play();
  }
}
