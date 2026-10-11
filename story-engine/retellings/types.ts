/**
 * Traditional stories GOSHTI retells (Panchatantra, Birbal, Tenali, mythology, saints,
 * great Indians). Only the traditional PLOT is used — Aaji tells it in her own words; no text
 * from any modern book, comic, album or app. Each outline is written and approved by a human.
 */
import type { StoryCategory } from '../categories';
import type { AgeBand } from '../profiles';

export type RetellingCollection =
  | 'PANCHATANTRA'
  | 'JATAKA'
  | 'BIRBAL'
  | 'TENALI'
  | 'MYTHOLOGY'
  | 'SAINTS'
  | 'GREAT_INDIANS';

/**
 * How Aaji frames the story:
 * - FOLK: a traditional fable — told freely as Aaji's tale.
 * - MYTH: from the Puranas/epics — told with respect; never a joke about a god.
 * - LEGEND: a popular anecdote about a real person whose details are uncertain — Aaji says
 *   "असं सांगतात" once, and adds no new facts about the person.
 * - TRUE: documented — only the events in the outline; no new events, dates or numbers.
 */
export type RetellingFraming = 'FOLK' | 'MYTH' | 'LEGEND' | 'TRUE';

export interface RetellingSource {
  id: string;
  /** Working Marathi title (the writer may improve it). */
  title: string;
  collection: RetellingCollection;
  /** Existing app category — sets the scene, sounds and the shelf for now. */
  category: StoryCategory;
  /** Age bands this story suits (after softening). */
  ageBands: AgeBand[];
  framing: RetellingFraming;
  /** Names that must appear exactly like this (they may be hard to say — that's fine here). */
  keepNames: string[];
  /** The plot, in order. Editor-facing English; the story is written in Marathi. */
  beats: string[];
  /** The value the events show (never stated as a lesson). */
  moral: string;
  /** Facts or lines that must stay as given. */
  mustKeep?: string[];
  /** How to soften harsh parts of the traditional version, by age. */
  soften?: string;
  /** DRAFT until a human has checked the outline (facts, tone, sensitivity). */
  status: 'DRAFT' | 'APPROVED';
}
