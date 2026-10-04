/**
 * Offline provider. Runs the full pipeline with hand-written templates so the app,
 * the backend (without GEMINI_API_KEY) and tests all work without a model.
 * It does NOT write new stories — every category always returns the same template.
 */
import { buildFallbackAudioScript } from '../audio';
import type {
  AudioScriptInput,
  EvaluateInput,
  PlanInput,
  RewriteInput,
  StoryAIProvider,
  WriteInput,
} from '../provider';
import {
  CHECK_KEYS,
  SCORE_KEYS,
  type IntentResult,
  type RawAudioScript,
  type StoryEvaluation,
  type StoryPlan,
  type StoryRequest,
  type WrittenStory,
} from '../schemas';
import { MOCK_TEMPLATES } from '../mock/templates';

const UNSAFE_PATTERN =
  /\b(kill|blood|gun|knife|murder|suicide|sex|drugs?)\b|मारून टाक|खून|रक्त|बंदूक|सुरा|आत्महत्या/i;
const OTHER_PATTERN =
  /\b(what is|who is|how (do|to)|homework|capital of|solve|calculate|tell me about|translate)\b|म्हणजे काय|कसं करायचं|गृहपाठ|उत्तर सांग|किती आहे|\?\s*$/i;

export class MockStoryAIProvider implements StoryAIProvider {
  readonly name = 'mock';
  readonly models: Record<string, string> = {
    classifyIntent: 'mock-heuristic',
    createPlan: 'mock-template',
    generateStory: 'mock-template',
    rewriteStory: 'mock-template',
    evaluateStory: 'mock-fixed-scores',
    createAudioScript: 'mock-deterministic',
  };

  async classifyIntent({ idea }: { idea: string; request: StoryRequest }): Promise<IntentResult> {
    if (UNSAFE_PATTERN.test(idea)) return { intent: 'UNSAFE', reason: 'mock heuristic: unsafe keyword' };
    if (OTHER_PATTERN.test(idea)) return { intent: 'OTHER', reason: 'mock heuristic: looks like a question' };
    return { intent: 'STORY_REQUEST', reason: 'mock heuristic: default' };
  }

  async createPlan({ request, profile, ingredients }: PlanInput): Promise<StoryPlan> {
    const t = MOCK_TEMPLATES[request.category];
    const [hero, ...others] = t.characters;
    return {
      age: request.age,
      developmentalProfile: profile.id,
      category: request.category,
      estimatedDurationMinutes: 2,
      workingTitle: t.title,
      mainCharacter: { name: hero.name, description: hero.description, voiceStyle: hero.voiceStyle },
      mainCharacterTraits: ['curious'],
      supportingCharacters: others.map((c) => ({
        name: c.name,
        description: c.description,
        voiceStyle: c.voiceStyle,
        role: c.role.toLowerCase(),
        traits: [],
      })),
      setting: t.setting,
      openingHook: t.opening,
      goal: t.goal,
      incitingEvent: t.goal,
      problem: t.problem,
      attempts: t.attempts.map((a) => a.text),
      setback: t.attempts[t.attempts.length - 1]?.text ?? 'none',
      discoveryOrInsight: t.twist,
      twist: t.twist,
      resolution: t.resolution,
      positiveValue: t.positiveValue,
      emotionalArc: t.emotionalArc,
      humourStyle: ingredients.humourStyle ?? t.humourStyle,
      repetitionPattern: 'none',
      predictionOpportunity: 'none',
      endingTone: request.category === 'bedtime' ? 'sleepy' : 'warm',
      originalityNotes: 'mock template',
      audioOpportunities: [],
    };
  }

  async generateStory({ request }: WriteInput): Promise<WrittenStory> {
    const t = MOCK_TEMPLATES[request.category];
    const paragraphs = [
      request.childName ? `${request.childName}, ऐक बरं...` : 'ऐका बरं...',
      request.userIdea ? `तू आजीला सांगितलंस, "${request.userIdea}". वा! मग ऐक.` : null,
      t.opening,
      `${t.goal} "${t.heroLine}"`,
      t.problem,
      ...t.attempts.map((a) => a.text),
      t.twist,
      t.resolution,
      t.closing,
    ].filter((p): p is string => !!p);
    return { title: t.title, storyText: paragraphs.join('\n\n') };
  }

  async evaluateStory(_input: EvaluateInput): Promise<StoryEvaluation> {
    return {
      scores: Object.fromEntries(SCORE_KEYS.map((k) => [k, 8])) as StoryEvaluation['scores'],
      checks: Object.fromEntries(CHECK_KEYS.map((k) => [k, false])) as StoryEvaluation['checks'],
      listenerVerdict: 'Mock evaluation — not a real review.',
      strengths: ['mock'],
      weaknesses: [],
      rewriteInstructions: [],
    };
  }

  async rewriteStory({ story }: RewriteInput): Promise<WrittenStory> {
    return story;
  }

  async createAudioScript({ plan, story }: AudioScriptInput): Promise<RawAudioScript> {
    const t = MOCK_TEMPLATES[plan.category];
    const script = buildFallbackAudioScript(story.storyText, {
      ambience: t.ambience,
      closingEmotion: plan.category === 'bedtime' ? 'sleepy' : 'warm',
    });
    return { segments: script.segments.map((s) => ({ ...s })) as RawAudioScript['segments'] };
  }
}
