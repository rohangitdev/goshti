import { buildAudioScript, estimateDurationSeconds, segmentStory } from '../audio';
import { PROFILES, type ChildAge } from '../profiles';
import type { AudioDirection } from '../schemas';
import type { ApprovedStory, AudioScript } from '../types';
import { LIBRARY, type LibraryStory } from './stories';

export { findLibraryStory, LIBRARY, type LibraryStory } from './stories';

/**
 * Deterministic audio script for a library story (speakers from the story's metadata).
 * Pass the listener's age so the app and the backend build exactly the same script.
 */
export function libraryAudioScript(story: LibraryStory, age?: number): AudioScript {
  const quotes = segmentStory(story.storyText).flatMap((p) => p.parts).filter((x) => x.kind === 'quote');
  const fallback = Object.keys(story.voices)[0] ?? 'आजी';
  const direction: AudioDirection = {
    speakers: quotes.map((q, i) => {
      const character = story.quoteSpeakers[i] ?? fallback;
      return { quote: (q as { quote: number }).quote, character, voiceStyle: story.voices[character] ?? 'AAJI' };
    }),
    narration: [{ paragraph: 1, emotion: 'warm' }],
    cues: story.ambience
      ? [
          { afterParagraph: 0, type: 'AMBIENCE', soundId: story.ambience, action: 'START' },
          { afterParagraph: segmentStory(story.storyText).length, type: 'AMBIENCE', soundId: story.ambience, action: 'STOP' },
        ]
      : [],
  };
  return buildAudioScript(story.storyText, direction, {
    closingEmotion: story.category === 'bedtime' ? 'sleepy' : undefined,
    age,
    intro: true,
  }).script;
}

const BAND_ORDER = ['2-3', '4-5', '6-7', '8-9'] as const;

/**
 * Picks a library story for a child: same age band and category if possible, then same band,
 * then the nearest band; skipping ids already heard when there is any alternative.
 */
export function pickLibraryStory(
  input: { age: ChildAge; category?: string; avoidIds?: string[] },
  rng: () => number = Math.random,
): LibraryStory {
  const band = Object.values(PROFILES).find((p) => (p.ages as readonly number[]).includes(input.age))!.ageBand;
  const bandIndex = BAND_ORDER.indexOf(band);
  const avoid = new Set(input.avoidIds ?? []);
  const byDistance = [...LIBRARY].sort(
    (a, b) => Math.abs(BAND_ORDER.indexOf(a.ageBand) - bandIndex) - Math.abs(BAND_ORDER.indexOf(b.ageBand) - bandIndex),
  );
  const tiers: ((s: LibraryStory) => boolean)[] = [
    (s) => s.ageBand === band && s.category === input.category,
    (s) => s.ageBand === band,
    () => true,
  ];
  for (const fresh of [true, false]) {
    for (const tier of tiers) {
      const options = byDistance.filter((s) => tier(s) && (!fresh || !avoid.has(s.id)));
      if (options.length) {
        const nearest = options.filter((s) => s.ageBand === options[0].ageBand);
        return nearest[Math.floor(rng() * nearest.length) % nearest.length];
      }
    }
  }
  return LIBRARY[0];
}

/** Library story in the same shape the app gets from the engine. */
export function libraryToApproved(story: LibraryStory, age: ChildAge): ApprovedStory {
  const audioScript = libraryAudioScript(story, age);
  const profile = Object.values(PROFILES).find((p) => p.ageBand === story.ageBand)!;
  return {
    title: story.title,
    storyText: story.storyText,
    age,
    ageBand: story.ageBand,
    profileId: profile.id,
    category: story.category,
    mode: 'RANDOM',
    userIdea: null,
    positiveValue: story.positiveValue,
    // Library stories are human-approved; plan/evaluation are not applicable.
    plan: null as unknown as ApprovedStory['plan'],
    evaluation: null as unknown as ApprovedStory['evaluation'],
    audioScript,
    estimatedDurationSeconds: estimateDurationSeconds(audioScript),
    attempts: 0,
  };
}
