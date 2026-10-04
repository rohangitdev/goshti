import {
  estimateDurationSeconds,
  findLibraryStory,
  LIBRARY,
  libraryToApproved,
  pickLibraryStory,
  type ApprovedStory,
  type ChildAge,
  type StoryCategory,
  type StoryRequest,
} from '@engine/index';

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
  /** A hand-written library story (always available, free, offline). */
  playFromLibrary(input: { age: ChildAge; category?: StoryCategory }): Promise<GoshtiStory>;
  /** Before playing: make sure Aaji's voice is (being) prepared if it can be. */
  prepareVoice(story: GoshtiStory): Promise<void>;
}

/** Library stories use a stable id, so replays reuse the saved voice. */
export const LIBRARY_ID_PREFIX = 'lib-';

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
  /** Gets a voice ticket for a library story (backend). Optional. */
  libraryVoiceTicket?: (libraryId: string, age: number) => Promise<VoiceTicket | null>;
  /** Prepares RANDOM stories ahead of time. Optional. */
  prefetcher?: RandomStoryPrefetcher;
  /** Renders Aaji's real voice for approved stories. Optional (absent = phone voice only). */
  voice?: VoiceService;
  /** Artificial delay so the "Aaji is preparing" screen is visible with instant mock stories. */
  minimumLatencyMs?: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** First-launch "My Stories": hand-written library stories for the child's age. */
const SEED_COUNT = 3;

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
    let outcome: CreateStoryOutcome;
    try {
      [outcome] = await Promise.all([
        prepared
          ? this.fromApproved(prepared.story, new Date(), prepared.id, prepared.voice)
          : this.build(this.deps.generator, request, new Date(), onProgress),
        wait(minimum),
      ]);
    } catch (e) {
      // "Aaji chooses" must never leave a child with nothing: fall back to a library story.
      if (request.mode === 'RANDOM' && e instanceof StoryGenerationError) {
        const story = await this.playFromLibrary({ age: request.age as ChildAge, category: request.category });
        return { status: 'CREATED', story };
      }
      throw e;
    }
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

  async playFromLibrary(input: { age: ChildAge; category?: StoryCategory }): Promise<GoshtiStory> {
    const stories = await this.deps.storage.getStories();
    const heard = stories.filter((s) => s.id.startsWith(LIBRARY_ID_PREFIX)).map((s) => s.id.slice(LIBRARY_ID_PREFIX.length));
    const pick = pickLibraryStory({ age: input.age, category: input.category, avoidIds: heard });
    const existing = stories.find((s) => s.id === LIBRARY_ID_PREFIX + pick.id);
    const story = existing ?? this.libraryStory(pick.id, input.age, new Date());
    if (!existing) await this.deps.storage.saveStory(story);
    // Library stories are free: they don't count towards the monthly allowance.
    await this.ensureLibraryVoice(story.id, pick.id, input.age);
    return story;
  }

  async prepareVoice(story: GoshtiStory): Promise<void> {
    if (!story.id.startsWith(LIBRARY_ID_PREFIX)) return;
    await this.ensureLibraryVoice(story.id, story.id.slice(LIBRARY_ID_PREFIX.length), story.age).catch(() => {});
  }

  private libraryStory(libraryId: string, age: ChildAge, createdAt: Date): GoshtiStory {
    const lib = findLibraryStory(libraryId)!;
    const approved = libraryToApproved(lib, age);
    return {
      id: LIBRARY_ID_PREFIX + lib.id,
      title: approved.title,
      age,
      ageBand: approved.ageBand,
      category: approved.category,
      userIdea: null,
      value: approved.positiveValue,
      durationSeconds: approved.estimatedDurationSeconds,
      storyText: approved.storyText,
      audioScript: approved.audioScript,
      audioUrl: null,
      createdAt: createdAt.toISOString(),
      rating: null,
    };
  }

  /** Ask the backend for Aaji's voice for a library story (once; saved on the phone after). */
  private async ensureLibraryVoice(storyId: string, libraryId: string, age: ChildAge) {
    if (!this.deps.voice || !this.deps.libraryVoiceTicket) return;
    if (await this.deps.voice.get(storyId)) {
      void this.deps.voice.render(storyId);
      return;
    }
    const ticket = await this.deps.libraryVoiceTicket(libraryId, age).catch(() => null);
    if (ticket) await this.deps.voice.start(storyId, ticket);
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
      const age = ((await this.deps.storage.getChildProfile())?.age ?? 4) as ChildAge;
      const picked: string[] = [];
      for (let i = 0; i < Math.min(SEED_COUNT, LIBRARY.length); i++) {
        picked.push(pickLibraryStory({ age, avoidIds: picked }, () => 0).id);
      }
      stories = picked.map((id, i) =>
        this.libraryStory(findLibraryStory(id)!.id, age, new Date(Date.now() - (i + 1) * 86_400_000)),
      );
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
