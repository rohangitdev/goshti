/**
 * Service composition root — the single place where implementations are chosen.
 * Replace a Mock or Local class here (cloud TTS, expo-audio, Supabase data, RevenueCat)
 * without touching any screen.
 */
import { config } from '@/config';

import type { AudioService } from './audioService';
import { ChildProfileService } from './childProfileService';
import { SpeechAudioService } from './speechAudioService';
import { AsyncStorageService, type StorageService } from './storageService';
import { BackendStoryGenerator, LocalMockGenerator, type StoryGenerator } from './storyGenerator';
import { RandomStoryPrefetcher } from './storyPrefetcher';
import { DefaultStoryService, type StoryService } from './storyService';
import { LocalSubscriptionService, type SubscriptionService } from './subscriptionService';
import { MockTtsService, type TtsService } from './ttsService';

const backend = config.storyBackend;
const storyGenerator: StoryGenerator =
  backend.kind === 'http'
    ? new BackendStoryGenerator(backend.url, backend.headers, config.storyRequestTimeoutMs)
    : new LocalMockGenerator();

export const storageService: StorageService = new AsyncStorageService();
export const subscriptionService: SubscriptionService = new LocalSubscriptionService(storageService);
export const ttsService: TtsService = new MockTtsService();
// Phone's built-in voice until server-side Aaji TTS exists. MockAudioService = silent timer.
export const audioService: AudioService = new SpeechAudioService();
export const childProfileService = new ChildProfileService(storageService);
export const storyService: StoryService = new DefaultStoryService({
  generator: storyGenerator,
  // Prepares the next "आजीने गोष्ट निवडावी" story in the background (backend only).
  prefetcher: config.prefetchRandomStories
    ? new RandomStoryPrefetcher({ generator: storyGenerator, storage: storageService, subscription: subscriptionService })
    : undefined,
  seedGenerator: new LocalMockGenerator(),
  tts: ttsService,
  storage: storageService,
  subscription: subscriptionService,
  minimumLatencyMs: 2500,
});

export { StoryGenerationError, StoryLimitReachedError } from './storyService';
export { PLANS, PurchasesNotAvailableError } from './subscriptionService';
export type { PlaybackStatus } from './audioService';
export type { PlanDefinition, PlanPrice } from './subscriptionService';
