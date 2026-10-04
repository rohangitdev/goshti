import type { AudioDirection, IntentResult, StoryEvaluation, StoryPlan, WrittenStory } from '../schemas';
import { CHECK_KEYS, SCORE_KEYS } from '../schemas';
import type { StoryAIProvider } from '../provider';

export const samplePlan: StoryPlan = {
  age: 6,
  developmentalProfile: 'STORY_EXPLORER',
  category: 'adventure',
  estimatedDurationMinutes: 6,
  workingTitle: 'टिंकूची उलटी घड्याळं',
  mainCharacter: { name: 'टिंकू', description: 'a curious inventor girl', voiceStyle: 'SMALL_CHILD' },
  mainCharacterTraits: ['curious', 'impatient'],
  supportingCharacters: [
    { name: 'बोल्टू', description: 'a small robot', voiceStyle: 'SQUEAKY', role: 'friend', traits: ['literal-minded'] },
  ],
  setting: 'science fair',
  openingHook: 'All the clocks start ticking backwards',
  goal: 'fix the clocks before the fair opens',
  incitingEvent: 'the clocks reverse',
  problem: 'nobody knows why',
  attempts: ['shake the clock', 'ask Boltu'],
  setback: 'Boltu makes it worse',
  discoveryOrInsight: 'a magnet in her pocket',
  twist: 'Tinku caused it herself',
  resolution: 'she removes the magnet',
  positiveValue: 'चूक मान्य करणे',
  emotionalArc: ['curiosity', 'frustration', 'surprise', 'pride'],
  humourStyle: 'misunderstandings',
  repetitionPattern: 'टिक-टॉक, उलटं टॉक!',
  predictionOpportunity: 'before the twist',
  endingTone: 'proud',
  originalityNotes: 'magnet-based mystery',
  audioOpportunities: ['CLOCK_TICK at the start'],
};

/** ~520 Devanagari words: inside the 6–7 profile budget. */
export function storyOfWords(n: number, title = 'टिंकूची उलटी घड्याळं'): WrittenStory {
  const sentence = 'टिंकूने घड्याळाकडे पाहिलं आणि "अरेच्चा" म्हणाली.';
  const words = sentence.split(' ').length;
  const paras: string[] = [];
  for (let i = 0; i < Math.ceil(n / words); i++) paras.push(sentence);
  return { title, storyText: paras.join('\n\n') };
}

export function evaluation(score = 9, flags: Partial<Record<(typeof CHECK_KEYS)[number], boolean>> = {}): StoryEvaluation {
  return {
    scores: Object.fromEntries(SCORE_KEYS.map((k) => [k, score])) as StoryEvaluation['scores'],
    checks: Object.fromEntries(CHECK_KEYS.map((k) => [k, flags[k] ?? false])) as StoryEvaluation['checks'],
    listenerVerdict: 'yes',
    strengths: ['hook'],
    weaknesses: score < 8 ? ['flat middle'] : [],
    rewriteInstructions: score < 8 ? ['add a setback in paragraph 4'] : [],
  };
}

export interface FakeOptions {
  intent?: IntentResult['intent'];
  evaluations?: StoryEvaluation[];
  story?: WrittenStory;
  audio?: AudioDirection | Error;
}

export function fakeProvider(opts: FakeOptions = {}) {
  const calls: string[] = [];
  const rewriteInputs: unknown[] = [];
  const evals = [...(opts.evaluations ?? [evaluation(9)])];
  const story = opts.story ?? storyOfWords(520);
  const provider: StoryAIProvider = {
    name: 'fake',
    models: { generateStory: 'fake-model' },
    async classifyIntent() {
      calls.push('classifyIntent');
      return { intent: opts.intent ?? 'STORY_REQUEST', reason: 'fake' };
    },
    async createPlan() {
      calls.push('createPlan');
      // Deliberately wrong age/category: the pipeline must overwrite them from the request.
      return { ...samplePlan, age: 99 as number, category: 'magic' };
    },
    async generateStory() {
      calls.push('generateStory');
      return story;
    },
    async evaluateStory() {
      calls.push('evaluateStory');
      return evals.length > 1 ? evals.shift()! : evals[0];
    },
    async rewriteStory(input) {
      calls.push('rewriteStory');
      rewriteInputs.push(input);
      return { ...story, title: story.title + ' (rewritten)' };
    },
    async createAudioScript() {
      calls.push('createAudioScript');
      if (opts.audio instanceof Error) throw opts.audio;
      return (
        opts.audio ?? {
          speakers: [{ quote: 1, character: 'टिंकू', voiceStyle: 'SMALL_CHILD' }],
          narration: [{ paragraph: 1, emotion: 'curious' }],
          cues: [
            { afterParagraph: 0, type: 'AMBIENCE', soundId: 'CITY_AMBIENCE', action: 'START' },
            { afterParagraph: 1, type: 'SFX', soundId: 'CLOCK_TICK' },
          ],
        }
      );
    },
  };
  return { provider, calls, rewriteInputs };
}
