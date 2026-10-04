/**
 * Runtime schemas (zod). Every structured AI stage output is validated against these
 * before the pipeline trusts it. The same schemas are converted to JSON Schema and
 * sent to the model as the required response format.
 *
 * Model-facing schemas are deliberately FLAT and simple: LLMs follow flat schemas far
 * more reliably than deep unions. Code then normalises into the strict TS types.
 */
import { z } from 'zod';

import { CATEGORY_IDS } from './categories';
import { CHILD_AGES, PROFILE_IDS } from './profiles';

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const VOICE_STYLES = [
  'AAJI',
  'SMALL_CHILD',
  'OLDER_CHILD',
  'GENTLE_GIANT',
  'SQUEAKY',
  'WISE_OLD',
  'PLAYFUL',
  'GRUFF_KIND',
] as const;
export type VoiceStyle = (typeof VOICE_STYLES)[number];

export const NARRATOR_EMOTIONS = [
  'warm',
  'playful',
  'curious',
  'excited',
  'mysterious',
  'gentle',
  'surprised',
  'concerned',
  'proud',
  'relieved',
  'sleepy',
  'whispered',
  'energetic',
] as const;
export type NarratorEmotion = (typeof NARRATOR_EMOTIONS)[number];

export const INTENTS = ['STORY_REQUEST', 'OTHER', 'UNSAFE'] as const;
export type Intent = (typeof INTENTS)[number];

export const STORY_MODES = ['RANDOM', 'CUSTOM'] as const;
export type StoryMode = (typeof STORY_MODES)[number];

// ---------------------------------------------------------------------------
// StoryRequest (from the app — validated, never trusted)
// ---------------------------------------------------------------------------

export const MAX_IDEA_LENGTH = 200;
export const MAX_NAME_LENGTH = 30;

export const StoryRequestSchema = z
  .object({
    age: z
      .number()
      .int()
      .refine((n) => (CHILD_AGES as readonly number[]).includes(n), { message: 'age must be an integer from 2 to 9' }),
    category: z.enum(CATEGORY_IDS),
    mode: z.enum(STORY_MODES),
    userIdea: z.string().max(MAX_IDEA_LENGTH).optional(),
    childName: z.string().max(MAX_NAME_LENGTH).optional(),
    /** Light personalisation; optional. */
    interests: z.array(z.string().max(40)).max(5).optional(),
    favouriteAnimals: z.array(z.string().max(40)).max(5).optional(),
    /** Recent titles for this child, so RANDOM stories don't repeat. */
    avoidTitles: z.array(z.string().max(120)).max(12).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.mode === 'CUSTOM' && !r.userIdea) {
      ctx.addIssue({ code: 'custom', path: ['userIdea'], message: 'userIdea is required for CUSTOM mode' });
    }
  });
export type StoryRequest = z.infer<typeof StoryRequestSchema>;

// ---------------------------------------------------------------------------
// Intent classifier output
// ---------------------------------------------------------------------------

export const IntentResultSchema = z.object({
  intent: z.enum(INTENTS),
  reason: z.string().describe('One short English sentence explaining the classification.'),
});
export type IntentResult = z.infer<typeof IntentResultSchema>;

// ---------------------------------------------------------------------------
// StoryPlan (planner output)
// ---------------------------------------------------------------------------

const PlanCharacterSchema = z.object({
  name: z.string().describe('Marathi (Devanagari) name.'),
  description: z.string(),
  voiceStyle: z.enum(VOICE_STYLES),
});

const SupportingCharacterSchema = PlanCharacterSchema.extend({
  role: z.string().describe('e.g. friend, helper, rival, sibling, grandparent'),
  traits: z.array(z.string()),
});

export const StoryPlanSchema = z.object({
  age: z.number().int(),
  developmentalProfile: z.enum(PROFILE_IDS),
  category: z.enum(CATEGORY_IDS),
  estimatedDurationMinutes: z.number().min(1).max(12),
  workingTitle: z.string().describe('Concrete, intriguing Marathi title — character + unusual object/goal/event.'),
  mainCharacter: PlanCharacterSchema,
  mainCharacterTraits: z.array(z.string()),
  supportingCharacters: z.array(SupportingCharacterSchema),
  setting: z.string(),
  openingHook: z.string(),
  goal: z.string(),
  incitingEvent: z.string(),
  problem: z.string(),
  attempts: z.array(z.string()),
  setback: z.string(),
  discoveryOrInsight: z.string(),
  twist: z.string(),
  resolution: z.string(),
  positiveValue: z.string().describe('ONE main value, in Marathi, e.g. मैत्री, धैर्य, संयम'),
  emotionalArc: z.array(z.string()),
  humourStyle: z.string(),
  repetitionPattern: z.string().describe('Intentional repeated phrase/sound/pattern (Marathi phrase if any), or "none".'),
  predictionOpportunity: z.string().describe('Where Aaji may ask the listener to predict, or "none".'),
  endingTone: z.string(),
  originalityNotes: z.string().describe('What makes this combination fresh and not derivative.'),
  audioOpportunities: z.array(z.string()),
});
export type StoryPlan = z.infer<typeof StoryPlanSchema>;

// ---------------------------------------------------------------------------
// Written story (writer / rewriter output)
// ---------------------------------------------------------------------------

export const WrittenStorySchema = z.object({
  title: z.string(),
  storyText: z.string().describe('The complete Marathi story. Paragraphs separated by blank lines.'),
});
export type WrittenStory = z.infer<typeof WrittenStorySchema>;

// ---------------------------------------------------------------------------
// Critic output
// ---------------------------------------------------------------------------

export const SCORE_KEYS = [
  'marathiNaturalness',
  'ageAppropriateness',
  'hookStrength',
  'curiosity',
  'engagement',
  'characterAgency',
  'emotionalArc',
  'humour',
  'dialogueQuality',
  'coherence',
  'originality',
  'resolutionQuality',
  'positiveValueIntegration',
  'audioSuitability',
  'pacing',
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const CHECK_KEYS = [
  'unsafeContent',
  'tooScary',
  'tooPreachy',
  'englishLeakage',
  'confusingPlot',
  'abruptEnding',
  'overstimulating',
  'ageMismatch',
  'repetitiveAIPhrasing',
  'copyrightSimilarityConcern',
  /** A child could copy something dangerous (climbing balconies, fire, water, medicines, strangers…). */
  'imitableDanger',
  /** Objects, characters or events introduced and never used / resolved; story feels disconnected. */
  'looseThreads',
  /** Any Hindi word or Hindi-style construction instead of Marathi. */
  'hindiWords',
  /** Bookish words the child can't understand by ear, or hard-to-say names. */
  'hardWords',
] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];

const score = z.number().min(0).max(10);

export const StoryEvaluationSchema = z.object({
  scores: z.object(Object.fromEntries(SCORE_KEYS.map((k) => [k, score])) as Record<ScoreKey, typeof score>),
  checks: z.object(
    Object.fromEntries(CHECK_KEYS.map((k) => [k, z.boolean()])) as Record<CheckKey, z.ZodBoolean>,
  ),
  listenerVerdict: z
    .string()
    .describe('Would a Marathi-speaking child of THIS age listen to the end and want another story? Why / why not?'),
  // Short lists keep the critic fast (output length dominates its latency).
  strengths: z.array(z.string()).max(6),
  weaknesses: z.array(z.string()).max(6),
  rewriteInstructions: z.array(z.string()).max(6),
});
export type StoryEvaluation = z.infer<typeof StoryEvaluationSchema>;

// ---------------------------------------------------------------------------
// Audio direction (audio director output)
//
// The approved story text is split into paragraphs and quotes BY CODE. The model only
// returns small directions keyed by paragraph / quote number, so it cannot alter the
// story text and its output stays tiny (fast).
// ---------------------------------------------------------------------------

export const SEGMENT_TYPES = ['NARRATION', 'DIALOGUE', 'PAUSE', 'SFX', 'AMBIENCE', 'MUSIC_CUE'] as const;
export type SegmentType = (typeof SEGMENT_TYPES)[number];

export const CUE_TYPES = ['PAUSE', 'SFX', 'AMBIENCE', 'MUSIC_CUE'] as const;

export const AudioDirectionSchema = z.object({
  speakers: z
    .array(
      z.object({
        quote: z.number().int().describe('Quote number Qn as marked in the story.'),
        character: z.string().describe('Who says it (name as in the story). Use "आजी" if Aaji speaks to the listener.'),
        voiceStyle: z.enum(VOICE_STYLES),
        emotion: z.enum(NARRATOR_EMOTIONS).optional(),
      }),
    )
    .describe('One entry per marked quote.'),
  narration: z
    .array(
      z.object({
        paragraph: z.number().int().describe('Paragraph number Pn.'),
        emotion: z.enum(NARRATOR_EMOTIONS),
      }),
    )
    .describe('Aaji\'s narration emotion — ONLY where it changes; it carries forward.'),
  cues: z
    .array(
      z.object({
        afterParagraph: z.number().int().describe('Insert after paragraph Pn. 0 = before the story starts.'),
        type: z.enum(CUE_TYPES),
        durationMs: z.number().optional().describe('PAUSE only: 300–4000.'),
        soundId: z.string().optional().describe('SFX / AMBIENCE only: an approved sound ID.'),
        mood: z.string().optional().describe('MUSIC_CUE only: an approved music mood.'),
        action: z.enum(['START', 'STOP']).optional().describe('AMBIENCE / MUSIC_CUE only.'),
      }),
    )
    .describe('Pauses and sound — sparingly.'),
});
export type AudioDirection = z.infer<typeof AudioDirectionSchema>;

// ---------------------------------------------------------------------------
// JSON Schema for the model
// ---------------------------------------------------------------------------

const UNSUPPORTED_KEYWORDS = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'pattern',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'default',
  'const',
]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (UNSUPPORTED_KEYWORDS.has(key)) continue;
      out[key === 'oneOf' ? 'anyOf' : key] = clean(value);
    }
    return out;
  }
  return node;
}

/** Converts a zod schema to the JSON Schema subset Gemini accepts. */
export function toModelJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return clean(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })) as Record<string, unknown>;
}
