import type { AgeBand, ChildAge } from './types';

export const CHILD_AGES: readonly ChildAge[] = [4, 5, 6, 7, 8, 9];

export interface AgeBandGuidance {
  band: AgeBand;
  /** Target listening time. */
  targetDurationSeconds: number;
  maxCharacters: number;
  attempts: number;
  /** Plain-language writing guidance passed to the writer stage. */
  languageNotes: string;
}

const GUIDANCE: Record<AgeBand, AgeBandGuidance> = {
  '4-5': {
    band: '4-5',
    targetDurationSeconds: 180,
    maxCharacters: 3,
    attempts: 2,
    languageNotes: 'Very short sentences, everyday words, lots of repetition and sounds.',
  },
  '6-7': {
    band: '6-7',
    targetDurationSeconds: 300,
    maxCharacters: 4,
    attempts: 3,
    languageNotes: 'Short sentences, some new words explained by context, a small surprise.',
  },
  '8-9': {
    band: '8-9',
    targetDurationSeconds: 420,
    maxCharacters: 5,
    attempts: 3,
    languageNotes: 'Richer vocabulary, a real twist, light suspense, idioms where natural.',
  },
};

export function ageToBand(age: ChildAge): AgeBand {
  if (age <= 5) return '4-5';
  if (age <= 7) return '6-7';
  return '8-9';
}

export function getAgeGuidance(age: ChildAge): AgeBandGuidance {
  return GUIDANCE[ageToBand(age)];
}

export function isChildAge(value: unknown): value is ChildAge {
  return typeof value === 'number' && (CHILD_AGES as readonly number[]).includes(value);
}
