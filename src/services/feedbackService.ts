/**
 * Optional story feedback (😍 / 🙂 / 😐), stored on the device only.
 * Never required, never used to nudge the child — it is for tuning story quality,
 * age matching and categories later. No behavioural tracking beyond this explicit tap.
 */
import type { GoshtiStory } from '@/types/models';

export type StoryReaction = 'LOVED' | 'LIKED' | 'NOT_FOR_ME';

export const REACTIONS: { id: StoryReaction; emoji: string; label: string }[] = [
  { id: 'LOVED', emoji: '😍', label: 'खूप आवडली' },
  { id: 'LIKED', emoji: '🙂', label: 'छान होती' },
  { id: 'NOT_FOR_ME', emoji: '😐', label: 'नाही आवडली' },
];

export interface StoryFeedback {
  storyId: string;
  reaction: StoryReaction;
  /** ISO 8601 */
  at: string;
  age: number;
  category: string;
  source: 'library' | 'generated';
}

export type FeedbackRecords = Record<string, StoryFeedback>;

export interface FeedbackStore {
  getFeedback(): Promise<FeedbackRecords>;
  saveFeedback(records: FeedbackRecords): Promise<void>;
}

export interface FeedbackService {
  getReaction(storyId: string): Promise<StoryReaction | null>;
  setReaction(story: GoshtiStory, reaction: StoryReaction): Promise<void>;
  summary(): Promise<Record<StoryReaction, number>>;
}

export class LocalFeedbackService implements FeedbackService {
  constructor(
    private readonly store: FeedbackStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getReaction(storyId: string) {
    return (await this.store.getFeedback())[storyId]?.reaction ?? null;
  }

  async setReaction(story: GoshtiStory, reaction: StoryReaction) {
    const records = await this.store.getFeedback();
    records[story.id] = {
      storyId: story.id,
      reaction,
      at: this.now().toISOString(),
      age: story.age,
      category: story.category,
      source: story.id.startsWith('lib-') ? 'library' : 'generated',
    };
    await this.store.saveFeedback(records);
  }

  async summary() {
    const counts: Record<StoryReaction, number> = { LOVED: 0, LIKED: 0, NOT_FOR_ME: 0 };
    for (const r of Object.values(await this.store.getFeedback())) counts[r.reaction] += 1;
    return counts;
  }
}
