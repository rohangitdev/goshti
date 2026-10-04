/**
 * Prepares "आजीने गोष्ट निवडावी" (RANDOM) stories in the background, so the next one
 * plays almost instantly instead of waiting for the full plan → write → review pipeline.
 *
 * - At most one waiting story per category, MAX_READY in total.
 * - A prepared story counts towards the monthly allowance only when it is used.
 * - Stories prepared for a different age are discarded.
 * - Only RANDOM stories: a child's own idea must always be generated live.
 */
import type { ApprovedStory, ChildAge, StoryCategory } from '@engine/index';

import { createId } from '@/utils/id';

import type { StorageService } from './storageService';
import type { StoryGenerator, VoiceTicket } from './storyGenerator';
import type { SubscriptionService } from './subscriptionService';
import type { VoiceService } from './voiceService';

export const MAX_READY = 3;
/** Prepared stories older than this are discarded (keeps the pool fresh). */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PreparedStory {
  /** Becomes the story id when used (its voice is rendered under this id). */
  id: string;
  voice?: VoiceTicket;
  age: ChildAge;
  category: StoryCategory;
  story: ApprovedStory;
  preparedAt: string;
}

export type PreparedPool = Partial<Record<StoryCategory, PreparedStory>>;

export class RandomStoryPrefetcher {
  private readonly inFlight = new Set<StoryCategory>();

  constructor(
    private readonly deps: {
      generator: StoryGenerator;
      storage: StorageService;
      subscription: SubscriptionService;
      /** Also render Aaji's voice in advance, so prepared stories play instantly in her voice. */
      voice?: VoiceService;
      now?: () => number;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  private async pool(age: ChildAge): Promise<PreparedPool> {
    const pool = await this.deps.storage.getPreparedStories();
    const fresh: PreparedPool = {};
    for (const p of Object.values(pool)) {
      if (p && p.age === age && this.now() - Date.parse(p.preparedAt) < MAX_AGE_MS) fresh[p.category] = p;
    }
    return fresh;
  }

  /** Removes and returns a ready story for this category and age, if any. */
  async take(category: StoryCategory, age: ChildAge): Promise<PreparedStory | null> {
    const pool = await this.pool(age);
    const ready = pool[category];
    if (!ready) return null;
    delete pool[category];
    await this.deps.storage.savePreparedStories(pool);
    return ready;
  }

  /** Fire-and-forget: prepare one story for this category if there's room. Never throws. */
  prepare(input: { category: StoryCategory; age: ChildAge; childName?: string; avoidTitles?: string[] }): void {
    if (this.deps.generator.kind !== 'backend') return; // mock stories are instant anyway
    if (this.inFlight.has(input.category)) return;
    this.inFlight.add(input.category);
    void this.run(input).finally(() => this.inFlight.delete(input.category));
  }

  private async run(input: { category: StoryCategory; age: ChildAge; childName?: string; avoidTitles?: string[] }) {
    try {
      const pool = await this.pool(input.age);
      if (pool[input.category] || Object.keys(pool).length >= MAX_READY) return;
      if (!(await this.deps.subscription.canGenerateStory())) return;

      const avoid = [...(input.avoidTitles ?? []), ...Object.values(pool).map((p) => p!.story.title)];
      const result = await this.deps.generator.generate({
        age: input.age,
        category: input.category,
        mode: 'RANDOM',
        childName: input.childName,
        avoidTitles: avoid.slice(0, 12),
      });
      if (result.status !== 'APPROVED') return;

      const id = createId();
      if (result.voice && this.deps.voice) await this.deps.voice.start(id, result.voice).catch(() => {});
      const latest = await this.pool(input.age);
      latest[input.category] = {
        id,
        voice: result.voice,
        age: input.age,
        category: input.category,
        story: result.story,
        preparedAt: new Date(this.now()).toISOString(),
      };
      await this.deps.storage.savePreparedStories(latest);
    } catch {
      // Background work: a failure just means the next story is generated live.
    }
  }
}
