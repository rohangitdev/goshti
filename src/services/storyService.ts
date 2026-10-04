import { estimateDurationSeconds, type ApprovedStory, type ChildAge, type StoryRequest } from '@engine/index';

import { createId } from '@/utils/id';
import type { GoshtiStory, StoryRating } from '@/types/models';

import type { StorageService } from './storageService';
import type { ProgressListener, StoryGenerator, VoiceTicket } from './storyGenerator';
import type { RandomStoryPrefetcher } from './storyPrefetcher';
import type { VoiceService } from './voiceService';
import type { SubscriptionService } from './subscriptionService';
import type { TtsService } from './ttsService';

export type CreateStoryOutcome =
  | { status: 'CREATED'; story: GoshtiStory }
  /** The child's text wasn't a story idea (or wasn't suitable): show the fixed message. */
  | { status: 'DECLINED'; message: string };

/**
 * The only way the UI gets stories. Screens never talk to the engine, a model or TTS.
 */
export interface StoryService {
  createStory(request: Omit<StoryRequest, 'avoidTitles'>, onProgress?: ProgressListener): Promise<CreateStoryOutcome>;
  listStories(): Promise<GoshtiStory[]>;
  getStory(id: string): Promise<GoshtiStory | null>;
  rateStory(id: string, rating: StoryRating): Promise<void>;
  isFavourite(id: string): Promise<boolean>;
  toggleFavourite(id: string): Promise<boolean>;
  /** Quietly prepare the next random story for the child's most recent category. */
  warmUp(): Promise<void>;
}

export class StoryLimitReachedError extends Error {
  constructor() {
    super('Monthly story limit reached.');
    this.name = 'StoryLimitReachedError';
  }
}

/** Generation failed after retries — never shown as a story. */
export class StoryGenerationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'StoryGenerationError';
  }
}

interface Deps {
  generator: StoryGenerator;
  /** Always offline — seeds must never spend real AI calls. */
  seedGenerator: StoryGenerator;
  tts: TtsService;
  storage: StorageService;
  subscription: SubscriptionService;
  /** Prepares RANDOM stories ahead of time. Optional. */
  prefetcher?: RandomStoryPrefetcher;
  /** Renders Aaji's real voice for approved stories. Optional (absent = phone voice only). */
  voice?: VoiceService;
  /** Artificial delay so the "Aaji is preparing" screen is visible with instant mock stories. */
  minimumLatencyMs?: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A few stories so "My Stories" isn't empty on first launch. */
const SEED_REQUESTS: { request: StoryRequest; daysAgo: number }[] = [
  { request: { age: 6, category: 'animals', mode: 'RANDOM' }, daysAgo: 3 },
  { request: { age: 6, category: 'bedtime', mode: 'RANDOM' }, daysAgo: 2 },
  { request: { age: 6, category: 'magic', mode: 'RANDOM' }, daysAgo: 1 },
];

export class DefaultStoryService implements StoryService {
  constructor(private readonly deps: Deps) {}

  async createStory(input: Omit<StoryRequest, 'avoidTitles'>, onProgress?: ProgressListener): Promise<CreateStoryOutcome> {
    if (!(await this.deps.subscription.canGenerateStory())) {
      throw new StoryLimitReachedError();
    }
    const recent = (await this.deps.storage.getStories()).slice(0, 8).map((s) => s.title);
    const request: StoryRequest = { ...input, avoidTitles: recent };

    // A story prepared in advance plays (almost) instantly.
    const prepared =
      request.mode === 'RANDOM' ? await this.deps.prefetcher?.take(request.category, request.age as ChildAge) : null;

    const instant = prepared || this.deps.generator.kind === 'mock';
    const minimum = instant ? (this.deps.minimumLatencyMs ?? 0) : 0;
    const [outcome] = await Promise.all([
      prepared
        ? this.fromApproved(prepared.story, new Date(), prepared.id, prepared.voice)
        : this.build(this.deps.generator, request, new Date(), onProgress),
      wait(minimum),
    ]);
    if (outcome.status === 'DECLINED') return outcome;

    await this.deps.storage.saveStory(outcome.story);
    // Only approved, delivered stories count towards the monthly allowance.
    await this.deps.subscription.recordStoryGenerated();

    if (request.mode === 'RANDOM') {
      this.deps.prefetcher?.prepare({
        category: request.category,
        age: request.age as ChildAge,
        childName: request.childName,
        avoidTitles: [outcome.story.title, ...recent],
      });
    }
    return outcome;
  }

  async warmUp(): Promise<void> {
    if (!this.deps.prefetcher) return;
    const [profile, stories] = await Promise.all([this.deps.storage.getChildProfile(), this.deps.storage.getStories()]);
    if (!profile) return;
    const category = stories[0]?.category;
    if (!category) return;
    this.deps.prefetcher.prepare({
      category,
      age: profile.age,
      childName: profile.name,
      avoidTitles: stories.slice(0, 8).map((s) => s.title),
    });
  }

  async listStories(): Promise<GoshtiStory[]> {
    let stories = await this.deps.storage.getStories();
    if (stories.length === 0) {
      const built = await Promise.all(
        SEED_REQUESTS.map(({ request, daysAgo }) =>
          this.build(this.deps.seedGenerator, request, new Date(Date.now() - daysAgo * 86_400_000)),
        ),
      );
      stories = built.flatMap((b) => (b.status === 'CREATED' ? [b.story] : []));
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

  private async build(
    generator: StoryGenerator,
    request: StoryRequest,
    createdAt: Date,
    onProgress?: ProgressListener,
  ): Promise<CreateStoryOutcome> {
    const result = await generator.generate(request, onProgress);
    if (result.status === 'FAILED') throw new StoryGenerationError(result.reason);
    if (result.status !== 'APPROVED') return { status: 'DECLINED', message: result.message };

    return this.fromApproved(result.story, createdAt, undefined, result.voice);
  }

  private async fromApproved(
    approved: ApprovedStory,
    createdAt: Date,
    id = createId(),
    voice?: VoiceTicket,
  ): Promise<CreateStoryOutcome> {
    const audio = await this.deps.tts.synthesize(approved.audioScript);
    // Start rendering Aaji's voice right away (a prepared story may already be rendered).
    if (voice && this.deps.voice) await this.deps.voice.start(id, voice).catch(() => {});
    return {
      status: 'CREATED',
      story: {
        id,
        title: approved.title,
        age: approved.age,
        ageBand: approved.ageBand,
        category: approved.category,
        userIdea: approved.userIdea,
        value: approved.positiveValue,
        durationSeconds: audio.durationSeconds || estimateDurationSeconds(approved.audioScript),
        storyText: approved.storyText,
        audioScript: approved.audioScript,
        audioUrl: audio.audioUrl,
        createdAt: createdAt.toISOString(),
        rating: null,
      },
    };
  }
}
