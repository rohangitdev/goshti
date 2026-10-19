import type { AgeBand, AudioScript, ChildAge, ChildGender, StoryCategory } from '@engine/index';

export type { AgeBand, ChildAge, ChildGender, StoryCategory };

/** 1–5 parent rating; null until rated. */
export type StoryRating = 1 | 2 | 3 | 4 | 5;

export interface GoshtiStory {
  id: string;
  title: string;
  /** 2–9 */
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
  /** 2–9 */
  age: ChildAge;
  /** The child is the hero of their AI stories — Marathi grammar needs boy or girl. */
  gender?: ChildGender;
}

export type PlanId = 'FREE' | 'PLUS';

export interface Subscription {
  plan: PlanId;
  monthlyLimit: number;
  storiesGeneratedThisMonth: number;
}
