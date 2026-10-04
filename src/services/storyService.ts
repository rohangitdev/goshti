import { runStoryPipeline, type StoryEngine, type StoryRequest } from '@engine/index';

import { createId } from '@/utils/id';
import type { GoshtiStory, StoryRating } from '@/types/models';

import type { StorageService } from './storageService';
import type { SubscriptionService } from './subscriptionService';
import type { TtsService } from './ttsService';

/**
 * The only way the UI gets stories. Screens never talk to the engine, a model or TTS.
 */
export interface StoryService {
  createStory(request: StoryRequest): Promise<GoshtiStory>;
  listStories(): Promise<GoshtiStory[]>;
  getStory(id: string): Promise<GoshtiStory | null>;
  rateStory(id: string, rating: StoryRating): Promise<void>;
  isFavourite(id: string): Promise<boolean>;
  toggleFavourite(id: string): Promise<boolean>;
}

export class StoryLimitReachedError extends Error {
  constructor() {
    super('Monthly story limit reached.');
    this.name = 'StoryLimitReachedError';
  }
}

interface Deps {
  engine: StoryEngine;
  tts: TtsService;
  storage: StorageService;
  subscription: SubscriptionService;
  /** Artificial delay so the "Aaji is preparing" screen is visible with the mock engine. */
  simulatedLatencyMs?: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A few stories so "My Stories" isn't empty on first launch. */
const SEED_REQUESTS: { request: StoryRequest; daysAgo: number }[] = [
  { request: { age: 6, category: 'animals', mode: 'RANDOM' }, daysAgo: 3 },
  { request: { age: 6, category: 'bedtime', mode: 'RANDOM' }, daysAgo: 2 },
  { request: { age: 6, category: 'magic', mode: 'CUSTOM', userIdea: 'एका तांब्यात जादू आहे' }, daysAgo: 1 },
];

export class DefaultStoryService implements StoryService {
  constructor(private readonly deps: Deps) {}

  async createStory(request: StoryRequest): Promise<GoshtiStory> {
    if (!(await this.deps.subscription.canGenerateStory())) {
      throw new StoryLimitReachedError();
    }
    const [story] = await Promise.all([this.build(request, new Date()), wait(this.deps.simulatedLatencyMs ?? 0)]);
    await this.deps.storage.saveStory(story);
    await this.deps.subscription.recordStoryGenerated();
    return story;
  }

  async listStories(): Promise<GoshtiStory[]> {
    let stories = await this.deps.storage.getStories();
    if (stories.length === 0) {
      stories = await Promise.all(
        SEED_REQUESTS.map(({ request, daysAgo }) => this.build(request, new Date(Date.now() - daysAgo * 86_400_000))),
      );
      stories.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      await this.deps.storage.saveStories(stories);
    }
    return stories;
  }

  async getStory(id: string): Promise<GoshtiStory | null> {
    const stories = await this.listStories();
    return stories.find((s) => s.id === id) ?? null;
  }

  async rateStory(id: string, rating: StoryRating): Promise<void> {
    const story = await this.getStory(id);
    if (story) await this.deps.storage.saveStory({ ...story, rating });
  }

  async isFavourite(id: string): Promise<boolean> {
    return (await this.deps.storage.getFavouriteIds()).includes(id);
  }

  async toggleFavourite(id: string): Promise<boolean> {
    const ids = await this.deps.storage.getFavouriteIds();
    const isFav = ids.includes(id);
    await this.deps.storage.saveFavouriteIds(isFav ? ids.filter((x) => x !== id) : [id, ...ids]);
    return !isFav;
  }

  private async build(request: StoryRequest, createdAt: Date): Promise<GoshtiStory> {
    const { story } = await runStoryPipeline(this.deps.engine, request);
    const audio = await this.deps.tts.synthesize(story.audioScript);
    return {
      id: createId(),
      title: story.title,
      age: story.plan.request.age,
      ageBand: story.plan.ageBand,
      category: story.plan.request.category,
      userIdea: story.plan.request.userIdea ?? null,
      value: story.plan.positiveValue,
      durationSeconds: audio.durationSeconds,
      storyText: story.storyText,
      audioScript: story.audioScript,
      audioUrl: audio.audioUrl,
      createdAt: createdAt.toISOString(),
      rating: null,
    };
  }
}
