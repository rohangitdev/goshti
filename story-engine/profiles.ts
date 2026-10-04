/**
 * Developmental storytelling profiles. Ages 2–9 resolve into four profiles.
 * These are evidence-informed storytelling guides, not clinical categories.
 * Tune freely — every prompt receives the resolved profile.
 */

export const CHILD_AGES = [2, 3, 4, 5, 6, 7, 8, 9] as const;
export type ChildAge = (typeof CHILD_AGES)[number];

export const PROFILE_IDS = [
  'EARLY_LISTENER',
  'IMAGINATIVE_LISTENER',
  'STORY_EXPLORER',
  'INDEPENDENT_IMAGINER',
] as const;
export type DevelopmentalProfileId = (typeof PROFILE_IDS)[number];

export type AgeBand = '2-3' | '4-5' | '6-7' | '8-9';

/** Spoken Marathi pace used to turn minutes into a word budget (Aaji narrates slowly). */
export const NARRATION_WORDS_PER_MINUTE = 85;

export interface DevelopmentalProfile {
  id: DevelopmentalProfileId;
  ageBand: AgeBand;
  /** Marathi name, for display. */
  label: string;
  ages: readonly ChildAge[];
  durationMinutes: { min: number; max: number };
  targetWords: { min: number; max: number };
  mainCharacters: string;
  objective: string;
  characteristics: string[];
  techniques: string[];
  humour: string[];
  avoid: string[];
  /** How cautious to be with fear, loss, danger. */
  safetyNotes: string[];
  audioNotes: string;
}

function words(min: number, max: number) {
  return {
    min: Math.round(min * NARRATION_WORDS_PER_MINUTE),
    max: Math.round(max * NARRATION_WORDS_PER_MINUTE),
  };
}

export const PROFILES: Record<DevelopmentalProfileId, DevelopmentalProfile> = {
  EARLY_LISTENER: {
    id: 'EARLY_LISTENER',
    ageBand: '2-3',
    label: 'छोटा श्रोता',
    ages: [2, 3],
    durationMinutes: { min: 2, max: 4 },
    targetWords: words(2, 4),
    mainCharacters: '1–2 main characters',
    objective: 'The child should easily understand and enjoy the whole story purely by listening.',
    characteristics: [
      'one simple central idea',
      'familiar animals, people, family objects or situations',
      'very short spoken sentences, concrete vocabulary',
      'strong intentional repetition, rhythm and playful sounds',
      'predictable patterns with tiny surprises',
      'simple cause and effect',
      'a very small problem with a quickly understandable resolution',
      'reassuring tone and a warm ending',
    ],
    techniques: [
      'a repeated phrase returning 2–3 times',
      'animal noises and onomatopoeia',
      'hide-and-reveal and simple anticipation',
      'naming familiar objects; occasional simple counting',
      'repeated actions with small variation',
      'one or two participation questions such as "माऊ कुठे लपली असेल?" followed by a pause',
    ],
    humour: ['sounds', 'silly repetition', 'physical silliness', 'unexpected animal behaviour'],
    avoid: [
      'intense danger',
      'prolonged sadness',
      'complex mysteries',
      'many characters',
      'complicated motives',
      'long explanations',
    ],
    safetyNotes: [
      'Be very conservative with being lost, separation from caregivers, monsters, injury, death, abandonment and threatening adults.',
      'Any tiny worry must resolve almost immediately.',
    ],
    audioNotes: 'Sounds, repetition and pauses can be prominent. Slow, warm, playful delivery.',
  },
  IMAGINATIVE_LISTENER: {
    id: 'IMAGINATIVE_LISTENER',
    ageBand: '4-5',
    label: 'कल्पक श्रोता',
    ages: [4, 5],
    durationMinutes: { min: 4, max: 6 },
    targetWords: words(4, 6),
    mainCharacters: 'usually 2–3 important characters',
    objective: 'A simple genuine adventure the child can follow and feel part of.',
    characteristics: [
      'clear protagonist goal and clear cause and effect',
      'imagination, humour and dialogue',
      'repetition when useful',
      'a small challenge the protagonist actively tries to solve',
      'manageable suspense and one meaningful surprise',
      'emotional safety and a clear satisfying resolution',
    ],
    techniques: [
      'three attempts with variation',
      'a familiar phrase that returns at the end',
      'at most one or two prediction moments ("तुला काय वाटतं, आता काय होईल?")',
    ],
    humour: ['funny mistakes', 'repetition', 'silly situations', 'playful dialogue'],
    avoid: ['complex plot structures', 'subplots', 'heavy explanations', 'adult-style motivations'],
    safetyNotes: [
      'Be conservative with being lost, separation from caregivers, monsters, injury, death and threatening adults.',
      'A small fear may appear only if clearly fictional, manageable and quickly resolved.',
    ],
    audioNotes: 'Expressive but not hyper; sound effects support key moments only.',
  },
  STORY_EXPLORER: {
    id: 'STORY_EXPLORER',
    ageBand: '6-7',
    label: 'गोष्टींचा शोधक',
    ages: [6, 7],
    durationMinutes: { min: 5, max: 7 },
    targetWords: words(5, 7),
    mainCharacters: 'a protagonist plus 1–3 distinctive supporting characters',
    objective: 'A real story with a stronger arc that does NOT feel babyish.',
    characteristics: [
      'stronger narrative arc with distinctive characters and clear motivations',
      'richer dialogue and problem solving',
      'friendship or social dynamics',
      'exploration, or a mystery when appropriate',
      'multiple attempts with at least one setback before success',
      'mild suspense and a meaningful twist that makes sense afterwards',
      'emotional development; the positive value shown through actions',
    ],
    techniques: [
      'an intriguing opening within the first 10–15%',
      'a setback that forces the hero to think differently',
      'at most one prediction moment',
    ],
    humour: ['character personality', 'misunderstandings', 'witty situations', 'dialogue'],
    avoid: ['babyish language', 'adults solving the problem', 'unexplained magic solutions', 'lectures'],
    safetyNotes: ['Mild tension is fine; danger must never stay unresolved.'],
    audioNotes: 'Use sound design with restraint; let dialogue carry energy.',
  },
  INDEPENDENT_IMAGINER: {
    id: 'INDEPENDENT_IMAGINER',
    ageBand: '8-9',
    label: 'स्वतंत्र कल्पक',
    ages: [8, 9],
    durationMinutes: { min: 6, max: 9 },
    targetWords: words(6, 9),
    mainCharacters: 'a protagonist with strong agency plus a small, distinctive supporting cast',
    objective: 'A rich, clever story that respects the listener’s intelligence.',
    characteristics: [
      'richer plot with stronger motivations and genuine obstacles',
      'logical problem solving with real consequences and setbacks',
      'adventure, mystery or exploration',
      'age-appropriate emotional complexity',
      'clever humour and strong character agency',
      'a sophisticated but understandable surprise and a less predictable ending',
      'subtler positive values',
    ],
    techniques: [
      'set up clues early that pay off later',
      'let the protagonist be wrong once and learn from it',
      'prediction questions are optional and rare',
    ],
    humour: ['clever dialogue', 'situational humour', 'personality humour', 'gentle age-appropriate irony'],
    avoid: ['patronising or oversimplified language', 'predictable formula endings', 'preaching'],
    safetyNotes: ['More tension and emotional nuance are fine, but the ending must restore security.'],
    audioNotes: 'Subtle sound design; vary pacing; silence before reveals.',
  },
};

export function isChildAge(value: unknown): value is ChildAge {
  return typeof value === 'number' && (CHILD_AGES as readonly number[]).includes(value);
}

export function resolveProfile(age: number): DevelopmentalProfile {
  if (!isChildAge(age)) throw new RangeError(`Age must be an integer from 2 to 9, got ${age}`);
  if (age <= 3) return PROFILES.EARLY_LISTENER;
  if (age <= 5) return PROFILES.IMAGINATIVE_LISTENER;
  if (age <= 7) return PROFILES.STORY_EXPLORER;
  return PROFILES.INDEPENDENT_IMAGINER;
}

export function ageToBand(age: ChildAge): AgeBand {
  return resolveProfile(age).ageBand;
}
