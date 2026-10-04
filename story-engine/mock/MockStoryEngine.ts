import { ageToBand, getAgeGuidance } from '../ageBands';
import type { StoryEngine } from '../engine';
import { audioScriptToText, estimateDurationSeconds, validateAudioScript } from '../validation';
import type {
  AudioSegment,
  GeneratedStory,
  StoryEvaluation,
  StoryPlan,
  StoryRequest,
} from '../types';
import { MOCK_TEMPLATES } from './templates';

type SegmentInput = AudioSegment extends infer S ? (S extends AudioSegment ? Omit<S, 'order'> : never) : never;

/**
 * Deterministic, offline engine. Produces structurally real plans, audio scripts and
 * evaluations from hand-written templates. Swap for a server-side Gemini engine later.
 */
export class MockStoryEngine implements StoryEngine {
  async planStory(request: StoryRequest): Promise<StoryPlan> {
    const t = MOCK_TEMPLATES[request.category];
    const guidance = getAgeGuidance(request.age);
    return {
      request,
      ageBand: ageToBand(request.age),
      title: t.title,
      characters: t.characters.slice(0, guidance.maxCharacters),
      setting: t.setting,
      goal: t.goal,
      problem: t.problem,
      attempts: t.attempts.slice(0, guidance.attempts).map((a) => a.text),
      twist: t.twist,
      resolution: t.resolution,
      positiveValue: t.positiveValue,
      emotionalArc: t.emotionalArc,
      humourStyle: t.humourStyle,
      targetDurationSeconds: guidance.targetDurationSeconds,
    };
  }

  async writeStory(plan: StoryPlan): Promise<GeneratedStory> {
    const t = MOCK_TEMPLATES[plan.request.category];
    const hero = plan.characters.find((c) => c.role === 'HERO') ?? plan.characters[0];
    const { childName, userIdea } = plan.request;

    const segments: SegmentInput[] = [];
    segments.push({ type: 'AMBIENCE', ambienceId: t.ambience, action: 'START', volume: 0.25 });
    segments.push({
      type: 'NARRATION',
      text: childName ? `${childName}, ऐक बरं. आज आजी तुला एक छान गोष्ट सांगते.` : 'ऐका बरं. आज आजी एक छान गोष्ट सांगते.',
      emotion: 'CALM',
    });
    if (userIdea) {
      segments.push({ type: 'NARRATION', text: `तू आजीला सांगितलंस, "${userIdea}". वा! किती छान कल्पना.`, emotion: 'HAPPY' });
    }
    segments.push({ type: 'PAUSE', durationMs: 800 });
    segments.push({ type: 'NARRATION', text: t.opening, emotion: plan.emotionalArc[0] });
    if (t.heroSfx) segments.push({ type: 'SFX', sfxId: t.heroSfx });
    segments.push({ type: 'NARRATION', text: plan.goal, emotion: 'CURIOUS' });
    segments.push({ type: 'DIALOGUE', characterId: hero.id, voiceStyle: hero.voiceStyle, text: t.heroLine, emotion: 'EXCITED' });
    segments.push({ type: 'NARRATION', text: plan.problem, emotion: 'WORRIED' });
    segments.push({ type: 'PAUSE', durationMs: 600 });

    plan.attempts.forEach((text, i) => {
      segments.push({ type: 'NARRATION', text });
      const sfx = t.attempts[i]?.sfx;
      if (sfx) segments.push({ type: 'SFX', sfxId: sfx });
      segments.push({ type: 'PAUSE', durationMs: 500 });
    });

    segments.push({ type: 'NARRATION', text: plan.twist, emotion: 'SURPRISED' });
    if (t.twistSfx) segments.push({ type: 'SFX', sfxId: t.twistSfx });
    segments.push({ type: 'NARRATION', text: plan.resolution, emotion: 'HAPPY' });
    segments.push({ type: 'PAUSE', durationMs: 900 });
    segments.push({ type: 'NARRATION', text: t.closing, emotion: plan.emotionalArc[plan.emotionalArc.length - 1] });
    segments.push({ type: 'AMBIENCE', ambienceId: t.ambience, action: 'STOP' });

    const audioScript = {
      version: 1 as const,
      narratorVoice: 'AAJI' as const,
      language: 'mr-IN' as const,
      segments: segments.map((s, order) => ({ ...s, order }) as AudioSegment),
    };
    const storyText = audioScriptToText(audioScript);

    return {
      plan,
      title: plan.title,
      storyText,
      audioScript,
      summary: t.summary,
      wordCount: storyText.split(/\s+/).length,
      estimatedDurationSeconds: estimateDurationSeconds(audioScript),
    };
  }

  async evaluateStory(story: GeneratedStory): Promise<StoryEvaluation> {
    const issues = validateAudioScript(story.audioScript);

    const arc = story.plan.emotionalArc;
    if (story.plan.request.category === 'bedtime' && !['CALM', 'SLEEPY'].includes(arc[arc.length - 1])) {
      issues.push({ check: 'AGE_FIT', severity: 'BLOCKER', message: 'Bedtime story must end calm or sleepy.' });
    }
    if (story.plan.attempts.length < 2) {
      issues.push({ check: 'STRUCTURE', severity: 'WARNING', message: 'Fewer than two attempts weakens the story.' });
    }

    const blockers = issues.filter((i) => i.severity === 'BLOCKER').length;
    const warnings = issues.length - blockers;
    const overallScore = Math.max(0, 100 - blockers * 40 - warnings * 10);

    return {
      passed: blockers === 0,
      scores: {
        SAFETY: 100,
        AGE_FIT: blockers ? 50 : 90,
        STRUCTURE: warnings ? 70 : 90,
        AUDIO_SCRIPT_VALID: blockers ? 0 : 100,
      },
      overallScore,
      issues,
    };
  }
}
