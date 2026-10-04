import type { AgeBand, AudioScript, ChildAge, StoryCategory } from '@engine/index';

export type { AgeBand, ChildAge, StoryCategory };

/** 1–5 parent rating; null until rated. */
export type StoryRating = 1 | 2 | 3 | 4 | 5;

export interface GoshtiStory {
  id: string;
  title: string;
  age: ChildAge;
  ageBand: AgeBand;
  category: StoryCategory;
  /** The child's idea for CUSTOM stories; null when Aaji chose the story. */
  userIdea: string | null;
  /** The gentle value the story carries, e.g. "मैत्री". */
  value: string;
  durationSeconds: number;
  storyText: string;
  audioScript: AudioScript;
  /** Rendered narration; null until real TTS exists. */
  audioUrl: string | null;
  /** ISO 8601 */
  createdAt: string;
  rating: StoryRating | null;
}

export interface ChildProfile {
  id: string;
  name: string;
  age: ChildAge;
}

export type PlanId = 'FREE' | 'PLUS';

export interface Subscription {
  plan: PlanId;
  monthlyLimit: number;
  storiesGeneratedThisMonth: number;
}
