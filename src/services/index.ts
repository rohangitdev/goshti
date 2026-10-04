/**
 * Service composition root — the single place where implementations are chosen.
 * Replace a Mock or Local class here (cloud TTS, expo-audio, Supabase data, RevenueCat)
 * without touching any screen.
 */
import { Platform } from 'react-native';

import { config } from '@/config';

import type { AudioService } from './audioService';
import { ClipAudioService } from './clipAudioService';
import { ExpoVoiceFileStore } from './expoVoiceFiles';
import { SmartAudioService } from './smartAudioService';
import { ChildProfileService } from './childProfileService';
import { SpeechAudioService } from './speechAudioService';
import { AsyncStorageService, type StorageService } from './storageService';
import { BackendStoryGenerator, LocalMockGenerator, type StoryGenerator } from './storyGenerator';
import { RandomStoryPrefetcher } from './storyPrefetcher';
import { DefaultStoryService, type StoryService } from './storyService';
import { LocalSubscriptionService, type SubscriptionService } from './subscriptionService';
import { MockTtsService, type TtsService } from './ttsService';
import { BackendVoiceClient, VoiceService } from './voiceService';

const backend = config.storyBackend;
const storyGenerator: StoryGenerator =
  backend.kind === 'http'
    ? new BackendStoryGenerator(backend.url, backend.headers, config.storyRequestTimeoutMs)
    : new LocalMockGenerator();

export const storageService: StorageService = new AsyncStorageService();
export const subscriptionService: SubscriptionService = new LocalSubscriptionService(storageService);
export const ttsService: TtsService = new MockTtsService();

// Aaji's real voice (rendered on the backend, saved on the phone). Native only; needs a backend.
const voiceClient =
  backend.kind === 'http' && Platform.OS !== 'web' ? new BackendVoiceClient(backend.url, backend.headers) : null;
export const voiceService: VoiceService | null =
  voiceClient
    ? new VoiceService({
        client: voiceClient,
        files: new ExpoVoiceFileStore(),
        store: storageService,
      })
    : null;

// Plays Aaji's voice when available, otherwise the phone's built-in voice.
export const audioService: AudioService = new SmartAudioService(
  voiceService ? new ClipAudioService(voiceService) : null,
  new SpeechAudioService(),
  voiceService,
);
export const childProfileService = new ChildProfileService(storageService);
export const storyService: StoryService = new DefaultStoryService({
  generator: storyGenerator,
  // Prepares the next "आजीने गोष्ट निवडावी" story in the background (backend only).
  prefetcher: config.prefetchRandomStories
    ? new RandomStoryPrefetcher({
        generator: storyGenerator,
        storage: storageService,
        subscription: subscriptionService,
        voice: voiceService ?? undefined,
      })
    : undefined,
  seedGenerator: new LocalMockGenerator(),
  voice: voiceService ?? undefined,
  libraryVoiceTicket: voiceClient ? (id, age) => voiceClient.libraryTicket(id, age) : undefined,
  tts: ttsService,
  storage: storageService,
  subscription: subscriptionService,
  minimumLatencyMs: 2500,
});

export { StoryGenerationError, StoryLimitReachedError } from './storyService';
export { PLANS, PurchasesNotAvailableError } from './subscriptionService';
export type { PlaybackStatus } from './audioService';
export type { PlanDefinition, PlanPrice } from './subscriptionService';
