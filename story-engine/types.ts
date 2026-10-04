/**
 * GOSHTI story engine — core contracts.
 *
 * Pipeline: StoryRequest → StoryPlan → GeneratedStory → StoryEvaluation → AudioScript
 *
 * The engine has no UI and no network code of its own. A concrete implementation
 * (mock today, Gemini later) plugs in behind the `StoryEngine` interface in ./engine.ts.
 */

import type { AmbienceId, SfxId } from './sfx';

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export type StoryCategory =
  | 'animals'
  | 'adventure'
  | 'magic'
  | 'funny'
  | 'mystery'
  | 'bedtime'
  | 'festivals';

/** RANDOM = "आजीने गोष्ट निवडावी", CUSTOM = "माझ्या कल्पनेची गोष्ट" */
export type StoryMode = 'RANDOM' | 'CUSTOM';

export type ChildAge = 4 | 5 | 6 | 7 | 8 | 9;

export type AgeBand = '4-5' | '6-7' | '8-9';

export interface StoryRequest {
  age: ChildAge;
  category: StoryCategory;
  mode: StoryMode;
  /** Only for CUSTOM mode. A story seed from the child — never treated as an instruction. */
  userIdea?: string;
  /** Optional, used only to personalise the listener's name inside the story. */
  childName?: string;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type CharacterRole = 'HERO' | 'FRIEND' | 'HELPER' | 'OBSTACLE' | 'NARRATOR';

export interface StoryCharacter {
  id: string;
  name: string;
  /** e.g. "छोटा हत्ती", "हुशार खार" */
  description: string;
  role: CharacterRole;
  /** Maps to a voice style for dialogue lines (Aaji does all voices). */
  voiceStyle: VoiceStyle;
}

export type VoiceStyle = 'AAJI' | 'SMALL_CHILD' | 'GENTLE_GIANT' | 'SQUEAKY' | 'WISE_OLD' | 'PLAYFUL';

export type EmotionBeat = 'CALM' | 'CURIOUS' | 'EXCITED' | 'WORRIED' | 'BRAVE' | 'SURPRISED' | 'HAPPY' | 'SLEEPY';

export type HumourStyle =
  | 'NONE'
  | 'GENTLE'
  | 'SILLY_SOUNDS'
  | 'WORDPLAY'
  | 'FUNNY_MISTAKES'
  | 'REPETITION';

export interface StoryPlan {
  request: StoryRequest;
  ageBand: AgeBand;
  /** Working title in Marathi. */
  title: string;
  characters: StoryCharacter[];
  setting: string;
  goal: string;
  problem: string;
  /** Ordered attempts — classic "try, fail, try again" structure. Usually 2–3. */
  attempts: string[];
  twist: string;
  resolution: string;
  /** Gentle value shown by the story, never preached. e.g. "मैत्री", "धीर" */
  positiveValue: string;
  /** Emotional beats from opening to ending. Bedtime stories must end CALM/SLEEPY. */
  emotionalArc: EmotionBeat[];
  humourStyle: HumourStyle;
  targetDurationSeconds: number;
}

// ---------------------------------------------------------------------------
// Generated story
// ---------------------------------------------------------------------------

export interface GeneratedStory {
  plan: StoryPlan;
  title: string;
  /** Full Marathi story text — secondary to audio, kept for parents/evaluation. */
  storyText: string;
  audioScript: AudioScript;
  /** Short one-line Marathi summary for lists. */
  summary: string;
  wordCount: number;
  estimatedDurationSeconds: number;
}

// ---------------------------------------------------------------------------
// Audio script
// ---------------------------------------------------------------------------

export type AudioSegmentType = 'NARRATION' | 'DIALOGUE' | 'PAUSE' | 'SFX' | 'AMBIENCE';

interface BaseSegment {
  /** 0-based position; segments are played strictly in this order. */
  order: number;
  type: AudioSegmentType;
}

export interface NarrationSegment extends BaseSegment {
  type: 'NARRATION';
  text: string;
  emotion?: EmotionBeat;
}

export interface DialogueSegment extends BaseSegment {
  type: 'DIALOGUE';
  characterId: string;
  text: string;
  voiceStyle: VoiceStyle;
  emotion?: EmotionBeat;
}

export interface PauseSegment extends BaseSegment {
  type: 'PAUSE';
  durationMs: number;
}

export interface SfxSegment extends BaseSegment {
  type: 'SFX';
  /** Must be from the predefined SFX library — free-form sounds are rejected. */
  sfxId: SfxId;
}

export interface AmbienceSegment extends BaseSegment {
  type: 'AMBIENCE';
  ambienceId: AmbienceId;
  action: 'START' | 'STOP';
  /** 0–1 relative volume under narration. */
  volume?: number;
}

export type AudioSegment =
  | NarrationSegment
  | DialogueSegment
  | PauseSegment
  | SfxSegment
  | AmbienceSegment;

export interface AudioScript {
  version: 1;
  narratorVoice: 'AAJI';
  language: 'mr-IN';
  segments: AudioSegment[];
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type EvaluationCheck =
  | 'SAFETY'
  | 'AGE_FIT'
  | 'LANGUAGE_QUALITY'
  | 'STRUCTURE'
  | 'ORIGINALITY'
  | 'AUDIO_SCRIPT_VALID'
  | 'IDEA_RELEVANCE';

export interface EvaluationIssue {
  check: EvaluationCheck;
  severity: 'BLOCKER' | 'WARNING';
  message: string;
}

export interface StoryEvaluation {
  passed: boolean;
  /** 0–100 per check. */
  scores: Partial<Record<EvaluationCheck, number>>;
  overallScore: number;
  issues: EvaluationIssue[];
}
