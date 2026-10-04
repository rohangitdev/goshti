import { describe, expect, it } from 'vitest';

import { generateStory, MockStoryAIProvider, type ApprovedStory, type StoryRequest } from '@engine/index';
import type { ChildProfile, GoshtiStory, Subscription } from '@/types/models';

import type { StorageService } from '../storageService';
import type { GenerationResult, StoryGenerator } from '../storyGenerator';
import { RandomStoryPrefetcher, type PreparedPool } from '../storyPrefetcher';
import { DefaultStoryService } from '../storyService';
import { LocalSubscriptionService } from '../subscriptionService';
import { MockTtsService } from '../ttsService';

function memoryStorage(): StorageService {
  let profile: ChildProfile | null = { id: 'c', name: 'आर्या', age: 6 };
  let stories: GoshtiStory[] = [];
  let favs: string[] = [];
  let sub: Subscription | null = null;
  let month: string | null = null;
  let pool: PreparedPool = {};
  return {
    getChildProfile: async () => profile,
    saveChildProfile: async (p) => void (profile = p),
    getStories: async () => stories,
    saveStory: async (s) => void (stories = [s, ...stories.filter((x) => x.id !== s.id)]),
    saveStories: async (s) => void (stories = s),
    getFavouriteIds: async () => favs,
    saveFavouriteIds: async (f) => void (favs = f),
    getSubscription: async () => sub,
    saveSubscription: async (s) => void (sub = s),
    getUsageMonth: async () => month,
    saveUsageMonth: async (m) => void (month = m),
    getPreparedStories: async () => pool,
    savePreparedStories: async (p) => void (pool = JSON.parse(JSON.stringify(p))),
  };
}

/** Pretends to be the backend; counts calls. */
class CountingGenerator implements StoryGenerator {
  readonly kind = 'backend' as const;
  calls: StoryRequest[] = [];
  async generate(request: StoryRequest): Promise<GenerationResult> {
    this.calls.push(request);
    const r = await generateStory(request, new MockStoryAIProvider(), { enforceLength: false });
    return r.status === 'APPROVED'
      ? { status: 'APPROVED', story: { ...r.story, title: `${r.story.title} #${this.calls.length}` } as ApprovedStory }
      : { status: 'FAILED', reason: 'x' };
  }
}

const settle = () => new Promise((r) => setTimeout(r, 20));

function setup() {
  const storage = memoryStorage();
  const generator = new CountingGenerator();
  const subscription = new LocalSubscriptionService(storage);
  const prefetcher = new RandomStoryPrefetcher({ generator, storage, subscription });
  const service = new DefaultStoryService({
    generator,
    seedGenerator: generator,
    prefetcher,
    tts: new MockTtsService(),
    storage,
    subscription,
    minimumLatencyMs: 0,
  });
  return { storage, generator, subscription, prefetcher, service };
}

describe('random story prefetching', () => {
  it('prepares the next random story after one is played, and serves it instantly', async () => {
    const { service, generator, storage, subscription } = setup();
    const first = await service.createStory({ age: 6, category: 'animals', mode: 'RANDOM' });
    expect(first.status).toBe('CREATED');
    await settle();
    expect(generator.calls).toHaveLength(2); // live + prepared
    expect(Object.keys(await storage.getPreparedStories())).toEqual(['animals']);
    expect((await subscription.getSubscription()).storiesGeneratedThisMonth).toBe(1); // prepared not counted yet

    const second = await service.createStory({ age: 6, category: 'animals', mode: 'RANDOM' });
    expect(second.status === 'CREATED' && second.story.title).toContain('#2'); // the prepared one
    expect((await subscription.getSubscription()).storiesGeneratedThisMonth).toBe(2);
  });

  it('never uses prepared stories for a child’s own idea', async () => {
    const { service, generator } = setup();
    await service.createStory({ age: 6, category: 'animals', mode: 'RANDOM' });
    await settle();
    const before = generator.calls.length;
    await service.createStory({ age: 6, category: 'animals', mode: 'CUSTOM', userIdea: 'एक मांजर क्रिकेट खेळतं' });
    expect(generator.calls[before].mode).toBe('CUSTOM');
  });

  it('discards prepared stories for a different age', async () => {
    const { prefetcher, storage } = setup();
    prefetcher.prepare({ category: 'space', age: 6 });
    await settle();
    expect(await prefetcher.take('space', 8)).toBeNull();
    expect(await prefetcher.take('space', 6)).not.toBeNull();
    expect(await storage.getPreparedStories()).toEqual({});
  });

  it('keeps at most 3 ready and does not prepare when the monthly limit is used up', async () => {
    const { prefetcher, generator, storage, subscription } = setup();
    for (const c of ['animals', 'space', 'magic', 'funny'] as const) {
      prefetcher.prepare({ category: c, age: 6 });
      await settle();
    }
    expect(Object.keys(await storage.getPreparedStories())).toHaveLength(3);

    for (let i = 0; i < 5; i++) await subscription.recordStoryGenerated();
    const calls = generator.calls.length;
    await prefetcher.take('animals', 6);
    prefetcher.prepare({ category: 'bedtime', age: 6 });
    await settle();
    expect(generator.calls.length).toBe(calls);
  });

  it('warmUp prepares for the most recent category', async () => {
    const { service, storage } = setup();
    await service.createStory({ age: 6, category: 'mystery', mode: 'CUSTOM', userIdea: 'घड्याळ उलटं चालतं' });
    await settle();
    expect(await storage.getPreparedStories()).toEqual({});
    await service.warmUp();
    await settle();
    expect(Object.keys(await storage.getPreparedStories())).toEqual(['mystery']);
  });
});
