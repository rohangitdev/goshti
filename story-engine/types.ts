/**
 * GOSHTI story engine — core contracts that are not model-facing.
 * Model-facing shapes (StoryPlan, StoryEvaluation, …) live in ./schemas.ts.
 */
import type { StoryCategory } from './categories';
import type { AgeBand, ChildAge, DevelopmentalProfile, DevelopmentalProfileId } from './profiles';
import type {
  IntentResult,
  NarratorEmotion,
  StoryEvaluation,
  StoryPlan,
  StoryRequest,
  VoiceStyle,
  WrittenStory,
} from './schemas';
import type { TokenUsage } from './provider';
import type { MusicMood, SfxId } from './sfx';


// ---------------------------------------------------------------------------
// Audio script (normalised, strict)
// ---------------------------------------------------------------------------

export interface NarrationSegment {
  type: 'NARRATION';
  speaker: 'AAJI';
  text: string;
  emotion?: NarratorEmotion;
}

export interface DialogueSegment {
  type: 'DIALOGUE';
  character: string;
  text: string;
  emotion?: NarratorEmotion;
  voiceStyle?: VoiceStyle;
}

export interface PauseSegment {
  type: 'PAUSE';
  durationMs: number;
}

export interface SfxSegment {
  type: 'SFX';
  soundId: SfxId;
}

export interface AmbienceSegment {
  type: 'AMBIENCE';
  soundId: SfxId;
  action: 'START' | 'STOP';
}

export interface MusicCueSegment {
  type: 'MUSIC_CUE';
  mood: MusicMood;
  action: 'START' | 'STOP';
}

export type AudioSegment =
  | NarrationSegment
  | DialogueSegment
  | PauseSegment
  | SfxSegment
  | AmbienceSegment
  | MusicCueSegment;

export interface AudioScript {
  version: 2;
  narrator: 'AAJI';
  language: 'mr-IN';
  /** Played strictly in array order. */
  segments: AudioSegment[];
}

// ---------------------------------------------------------------------------
// Pipeline results
// ---------------------------------------------------------------------------

export interface CriticResult {
  attempt: number;
  evaluation: StoryEvaluation;
  passed: boolean;
  /** Human-readable reasons when not passed (failed thresholds / flags / local checks). */
  failures: string[];
}

export interface ApprovedStory {
  title: string;
  storyText: string;
  age: ChildAge;
  ageBand: AgeBand;
  profileId: DevelopmentalProfileId;
  category: StoryCategory;
  mode: StoryRequest['mode'];
  userIdea: string | null;
  positiveValue: string;
  plan: StoryPlan;
  evaluation: StoryEvaluation;
  audioScript: AudioScript;
  estimatedDurationSeconds: number;
  attempts: number;
  /** Set when this is a retelling of a traditional story (its catalogue id). */
  sourceId?: string;
}

export type StageName =
  | 'validate'
  | 'classifyIntent'
  | 'createPlan'
  | 'generateStory'
  | 'evaluateStory'
  | 'rewriteStory'
  | 'createAudioScript';

export interface StageTiming {
  stage: StageName;
  attempt?: number;
  ms: number;
  model?: string;
}

export interface StoryDraft {
  attempt: number;
  kind: 'DRAFT' | 'REWRITE';
  story: WrittenStory;
  wordCount: number;
}

/** Everything the developer tester shows. Contains no secrets. */
export interface StoryTrace {
  startedAt: string;
  request: unknown;
  normalizedRequest?: StoryRequest;
  intent?: IntentResult & { skipped?: boolean };
  safety?: { allowed: boolean; reason: string };
  profile?: DevelopmentalProfile;
  varietyIngredients?: Record<string, string>;
  /** Catalogue id when this run retells a traditional story. */
  retellingId?: string;
  plan?: StoryPlan;
  drafts: StoryDraft[];
  critiques: CriticResult[];
  finalStory?: WrittenStory;
  audioScript?: AudioScript;
  audioScriptWarnings: string[];
  provider: { name: string; models: Record<string, string> };
  timings: StageTiming[];
  totalMs: number;
  attemptCount: number;
  errors: string[];
  /** Token usage per model call, when the provider reports it (diagnostics). */
  usage?: TokenUsage[];
  outcome?: PipelineResult['status'];
}

export type PipelineResult =
  | { status: 'APPROVED'; story: ApprovedStory; trace: StoryTrace }
  | { status: 'NOT_A_STORY'; message: string; trace: StoryTrace }
  | { status: 'UNSAFE'; message: string; trace: StoryTrace }
  | { status: 'INVALID_REQUEST'; errors: string[]; trace: StoryTrace }
  | { status: 'FAILED'; reason: string; trace: StoryTrace };

/** Fixed child-facing messages (never model-generated). */
export const MESSAGES = {
  NOT_A_STORY: 'गोष्टी आजी फक्त गोष्टी सांगते. 😊 मला सांग, आज कोणाची गोष्ट ऐकायची?',
  UNSAFE: 'अशी गोष्ट आजी नाही सांगणार बाळा. 😊 चल, दुसरी छान कल्पना सांग!',
} as const;
