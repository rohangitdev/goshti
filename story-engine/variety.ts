/**
 * Variety matrix for RANDOM stories. Instead of asking the model for "something random"
 * (which collapses to lion + forest + friendship), we pick a concrete combination of
 * ingredients and ask the planner to build a coherent story around it.
 * Edit these lists freely.
 */
import type { StoryCategory } from './categories';
import type { DevelopmentalProfile, DevelopmentalProfileId } from './profiles';
import type { StoryRequest } from './schemas';

export type Rng = () => number;

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length) % list.length];

export const PROTAGONISTS = [
  'a curious small animal',
  'a child at home',
  'a child inventor',
  'an everyday object that can talk',
  'a small robot',
  'a baby dinosaur',
  'a sea creature',
  'a bird',
  'a toy that comes alive',
  'a cloud, raindrop or other bit of nature',
  'a farm animal',
  'an insect',
  'a vehicle with a personality (bus, train, rickshaw, boat)',
  'a grandparent and grandchild pair',
  'a group of friends with different personalities',
] as const;

export const SETTINGS = [
  'home',
  'school',
  'garden',
  'village',
  'city',
  'farm',
  'forest',
  'beach',
  'mountain',
  'train',
  'bus',
  'market',
  'science fair',
  'library',
  'museum',
  'underwater world',
  'space',
  'moon',
  'imaginary kingdom',
  'magical workshop',
  'dinosaur world',
  'festival',
  'rainy day',
] as const;

export const PLOT_PATTERNS = [
  'search and find',
  'journey to reach a special place',
  'build or fix something',
  'solve a small mystery',
  'help someone with their problem',
  'a misunderstanding that gets sorted out',
  'overcoming a small fear',
  'a friendly contest or challenge',
  'an unexpected visitor',
  'a plan that keeps going wrong in funny ways',
  'learning a new skill',
  'swapping roles for a day',
] as const;

export const RELATIONSHIPS = [
  'brand-new friends',
  'siblings',
  'grandparent and child',
  'rivals who become teammates',
  'pet and owner',
  'neighbours',
  'classmates',
  'an unlikely pair (very big and very small)',
] as const;

export const OBJECTS_AND_DISCOVERIES = [
  'a strange map',
  'a single lost button',
  'a shiny shell',
  'a broken umbrella',
  'a clock that ticks backwards',
  'a seed that won’t sprout',
  'a kite stuck somewhere odd',
  'mysterious footprints',
  'a tiny door',
  'a half-finished recipe',
  'a music box',
  'a telescope',
  'a paper boat',
  'a box of colours missing one colour',
  'a note in an unknown handwriting',
  'an egg nobody recognises',
] as const;

export const POSITIVE_VALUES = [
  'मैत्री',
  'दयाळूपणा',
  'धैर्य',
  'प्रामाणिकपणा',
  'जिज्ञासा',
  'आत्मविश्वास',
  'सहकार्य',
  'निसर्गप्रेम',
  'चूक मान्य करणे',
  'संयम',
  'इतरांना समजून घेणे',
  'प्रयत्न करत राहणे',
  'जबाबदारी',
  'सर्जनशीलता',
] as const;

const HUMOUR_BY_PROFILE: Record<DevelopmentalProfileId, readonly string[]> = {
  EARLY_LISTENER: ['funny sounds', 'silly repetition', 'physical silliness', 'unexpected animal behaviour'],
  IMAGINATIVE_LISTENER: ['funny mistakes', 'repetition', 'silly situations', 'playful dialogue'],
  STORY_EXPLORER: ['character personality', 'misunderstandings', 'witty situations', 'funny dialogue'],
  INDEPENDENT_IMAGINER: ['clever dialogue', 'situational humour', 'personality humour', 'gentle irony'],
};

/** Category-appropriate settings, so e.g. a space story doesn't land in a market. */
const CATEGORY_SETTINGS: Partial<Record<StoryCategory, readonly string[]>> = {
  space: ['space', 'moon', 'a space station', 'a small unknown planet', 'an observatory on a hill'],
  bedtime: ['home', 'garden', 'village', 'a quiet night sky', 'rainy day', 'a sleepy forest at dusk'],
  festivals: ['festival', 'village', 'city', 'home', 'market', 'school'],
  mystery: ['library', 'museum', 'school', 'village', 'train', 'garden', 'a building society'],
  magic: ['magical workshop', 'imaginary kingdom', 'home', 'garden', 'library', 'forest'],
  animals: ['forest', 'farm', 'beach', 'garden', 'village', 'underwater world', 'mountain', 'city'],
};

const CATEGORY_PLOTS: Partial<Record<StoryCategory, readonly string[]>> = {
  mystery: ['solve a small mystery', 'search and find', 'an unexpected visitor', 'a misunderstanding that gets sorted out'],
  bedtime: ['search and find', 'help someone with their problem', 'journey to reach a special place', 'overcoming a small fear'],
  funny: ['a plan that keeps going wrong in funny ways', 'a misunderstanding that gets sorted out', 'swapping roles for a day', 'a friendly contest or challenge'],
};

const EARLY_PROTAGONISTS = [
  'a curious small animal',
  'a child at home',
  'a farm animal',
  'a bird',
  'a toy that comes alive',
  'a grandparent and grandchild pair',
  'a vehicle with a personality (bus, train, rickshaw, boat)',
] as const;

export interface VarietyIngredients {
  protagonist: string;
  setting: string;
  plotPattern: string;
  relationship: string;
  objectOrDiscovery: string;
  humourStyle: string;
  positiveValue: string;
}

export function pickIngredients(
  request: StoryRequest,
  profile: DevelopmentalProfile,
  rng: Rng = Math.random,
): VarietyIngredients {
  const early = profile.id === 'EARLY_LISTENER';
  return {
    protagonist: pick(early ? EARLY_PROTAGONISTS : PROTAGONISTS, rng),
    setting: pick(CATEGORY_SETTINGS[request.category] ?? SETTINGS, rng),
    plotPattern: pick(CATEGORY_PLOTS[request.category] ?? PLOT_PATTERNS, rng),
    relationship: pick(RELATIONSHIPS, rng),
    objectOrDiscovery: pick(OBJECTS_AND_DISCOVERIES, rng),
    humourStyle: pick(HUMOUR_BY_PROFILE[profile.id], rng),
    positiveValue: pick(POSITIVE_VALUES, rng),
  };
}
