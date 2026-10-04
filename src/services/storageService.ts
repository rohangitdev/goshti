import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ChildProfile, GoshtiStory, Subscription } from '@/types/models';

import type { PreparedPool } from './storyPrefetcher';
import type { VoiceStates } from './voiceService';

/**
 * Local persistence. Today: AsyncStorage on device.
 * Later: a Supabase-backed implementation of the same interface.
 */
export interface StorageService {
  getChildProfile(): Promise<ChildProfile | null>;
  saveChildProfile(profile: ChildProfile): Promise<void>;

  getStories(): Promise<GoshtiStory[]>;
  saveStory(story: GoshtiStory): Promise<void>;
  saveStories(stories: GoshtiStory[]): Promise<void>;

  getFavouriteIds(): Promise<string[]>;
  saveFavouriteIds(ids: string[]): Promise<void>;

  getSubscription(): Promise<Subscription | null>;
  saveSubscription(subscription: Subscription): Promise<void>;
  /** "YYYY-MM" the usage counter belongs to. */
  getUsageMonth(): Promise<string | null>;
  saveUsageMonth(month: string): Promise<void>;

  /** Random stories prepared in advance (see storyPrefetcher). */
  getPreparedStories(): Promise<PreparedPool>;
  savePreparedStories(pool: PreparedPool): Promise<void>;

  /** Aaji-voice rendering state per story id (see voiceService). */
  getVoiceStates(): Promise<VoiceStates>;
  saveVoiceStates(states: VoiceStates): Promise<void>;
}

const KEYS = {
  profile: 'goshti.childProfile.v1',
  stories: 'goshti.stories.v1',
  favourites: 'goshti.favourites.v1',
  subscription: 'goshti.subscription.v1',
  usageMonth: 'goshti.usageMonth.v1',
  prepared: 'goshti.preparedStories.v1',
  voice: 'goshti.voice.v1',
} as const;

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): Promise<void> {
  return AsyncStorage.setItem(key, JSON.stringify(value));
}

export class AsyncStorageService implements StorageService {
  getChildProfile() {
    return readJson<ChildProfile>(KEYS.profile);
  }
  saveChildProfile(profile: ChildProfile) {
    return writeJson(KEYS.profile, profile);
  }

  async getStories() {
    return (await readJson<GoshtiStory[]>(KEYS.stories)) ?? [];
  }
  async saveStory(story: GoshtiStory) {
    const stories = await this.getStories();
    await this.saveStories([story, ...stories.filter((s) => s.id !== story.id)]);
  }
  saveStories(stories: GoshtiStory[]) {
    return writeJson(KEYS.stories, stories);
  }

  async getFavouriteIds() {
    return (await readJson<string[]>(KEYS.favourites)) ?? [];
  }
  saveFavouriteIds(ids: string[]) {
    return writeJson(KEYS.favourites, ids);
  }

  getSubscription() {
    return readJson<Subscription>(KEYS.subscription);
  }
  saveSubscription(subscription: Subscription) {
    return writeJson(KEYS.subscription, subscription);
  }
  getUsageMonth() {
    return AsyncStorage.getItem(KEYS.usageMonth);
  }
  saveUsageMonth(month: string) {
    return AsyncStorage.setItem(KEYS.usageMonth, month);
  }

  async getPreparedStories() {
    return (await readJson<PreparedPool>(KEYS.prepared)) ?? {};
  }
  savePreparedStories(pool: PreparedPool) {
    return writeJson(KEYS.prepared, pool);
  }

  async getVoiceStates() {
    return (await readJson<VoiceStates>(KEYS.voice)) ?? {};
  }
  saveVoiceStates(states: VoiceStates) {
    return writeJson(KEYS.voice, states);
  }
}
