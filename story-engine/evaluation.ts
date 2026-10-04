import { findHindiWords, HINDI_WORDS } from './hindiWords';
import type { DevelopmentalProfile } from './profiles';
import { CHECK_KEYS, type CheckKey, type ScoreKey, type StoryEvaluation, type WrittenStory } from './schemas';

/** Initial PASS thresholds (0–10). Tune after human review. */
export const PASS_THRESHOLDS: Partial<Record<ScoreKey, number>> = {
  marathiNaturalness: 8,
  ageAppropriateness: 8,
  engagement: 8,
  coherence: 8,
  originality: 8,
  resolutionQuality: 8,
  audioSuitability: 8,
};

/** Any of these flags set to true fails the story. */
export const BLOCKING_CHECKS: readonly CheckKey[] = CHECK_KEYS;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Share of letters that are Latin script — a cheap English-leakage signal. */
export function latinLetterRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const latin = letters.filter((ch) => /[A-Za-z]/.test(ch)).length;
  return latin / letters.length;
}

export const LOCAL_LIMITS = {
  maxLatinRatio: 0.03,
  /** Fail when a story is far shorter / longer than the profile's word budget. */
  minLengthFactor: 0.5,
  maxLengthFactor: 1.8,
};

/** Deterministic checks that don't need the model. */
export function localStoryChecks(
  story: WrittenStory,
  profile: DevelopmentalProfile,
  options: { enforceLength?: boolean; ignoreWords?: string[] } = {},
): string[] {
  const failures: string[] = [];
  const words = countWords(story.storyText);
  const enforceLength = options.enforceLength ?? true;
  if (enforceLength && words < profile.targetWords.min * LOCAL_LIMITS.minLengthFactor) {
    failures.push(`too short: ${words} words (target ${profile.targetWords.min}–${profile.targetWords.max})`);
  }
  if (enforceLength && words > profile.targetWords.max * LOCAL_LIMITS.maxLengthFactor) {
    failures.push(`too long: ${words} words (target ${profile.targetWords.min}–${profile.targetWords.max})`);
  }
  // The child's own name may be typed in English letters — don't count it as leakage.
  let checked = story.storyText + ' ' + story.title;
  for (const w of options.ignoreWords ?? []) checked = checked.split(w).join(' ');
  const latin = latinLetterRatio(checked);
  if (latin > LOCAL_LIMITS.maxLatinRatio) {
    failures.push(`English leakage: ${(latin * 100).toFixed(1)}% Latin letters`);
  }
  if (/बोध\s*मिळतो|तात्पर्य/.test(story.storyText)) {
    failures.push('explicit moral summary detected');
  }
  const hindi = findHindiWords(story.title + ' ' + story.storyText);
  if (hindi.length) {
    failures.push(`Hindi words — replace with Marathi: ${hindi.map((w) => `${w} → ${HINDI_WORDS[w]}`).join(', ')}`);
  }
  // Spoken lines must be quoted so the narrator can switch voices.
  const hasQuotes = /["“”]/.test(story.storyText);
  const speechVerbs = (story.storyText.match(/म्हणाल[ाीे]|म्हणतो|म्हणते|ओरडल[ाीे]|विचारल[ंे]/g) ?? []).length;
  if (!hasQuotes && speechVerbs >= 1) {
    failures.push('spoken lines are not in double quotes');
  }
  return failures;
}

export function judgeEvaluation(
  evaluation: StoryEvaluation,
  localFailures: string[] = [],
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const [key, min] of Object.entries(PASS_THRESHOLDS) as [ScoreKey, number][]) {
    const value = evaluation.scores[key];
    if (value < min) failures.push(`${key} ${value} < ${min}`);
  }
  for (const key of BLOCKING_CHECKS) {
    if (evaluation.checks[key]) failures.push(`flag: ${key}`);
  }
  failures.push(...localFailures);
  return { passed: failures.length === 0, failures };
}
