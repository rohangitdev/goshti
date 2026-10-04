/**
 * Service composition root — the single place where implementations are chosen.
 * Replace a Mock or Local class here (Gemini, cloud TTS, expo-audio, Supabase, RevenueCat)
 * without touching any screen.
 */
import { MockStoryEngine } from '@engine/index';

import type { AudioService } from './audioService';
import { ChildProfileService } from './childProfileService';
import { AsyncStorageService, type StorageService } from './storageService';
import { SpeechAudioService } from './speechAudioService';
import { DefaultStoryService, type StoryService } from './storyService';
import { LocalSubscriptionService, type SubscriptionService } from './subscriptionService';
import { MockTtsService, type TtsService } from './ttsService';

export const storageService: StorageService = new AsyncStorageService();
export const subscriptionService: SubscriptionService = new LocalSubscriptionService(storageService);
export const ttsService: TtsService = new MockTtsService();
// Phone's built-in voice until server-side Aaji TTS exists. MockAudioService = silent timer.
export const audioService: AudioService = new SpeechAudioService();
export const childProfileService = new ChildProfileService(storageService);
export const storyService: StoryService = new DefaultStoryService({
  engine: new MockStoryEngine(),
  tts: ttsService,
  storage: storageService,
  subscription: subscriptionService,
  simulatedLatencyMs: 2500,
});

export { StoryLimitReachedError } from './storyService';
export { PLANS, PurchasesNotAvailableError } from './subscriptionService';
export type { PlaybackStatus } from './audioService';
export type { PlanDefinition, PlanPrice } from './subscriptionService';
