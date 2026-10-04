export const CATEGORY_IDS = [
  'animals',
  'adventure',
  'magic',
  'funny',
  'mystery',
  'bedtime',
  'festivals',
  'space',
] as const;

export type StoryCategory = (typeof CATEGORY_IDS)[number];

export interface CategoryInfo {
  id: StoryCategory;
  /** Marathi label shown to the child. */
  label: string;
  /** Placeholder icon until artwork exists. */
  emoji: string;
  /** Short English brief given to the planner. */
  brief: string;
}

export const CATEGORIES: readonly CategoryInfo[] = [
  { id: 'animals', label: 'प्राण्यांची', emoji: '🐘', brief: 'Animal story — animals are the main characters.' },
  { id: 'adventure', label: 'साहस', emoji: '🧭', brief: 'Adventure — a journey, challenge or exploration with real agency.' },
  { id: 'magic', label: 'जादूची', emoji: '✨', brief: 'Magic / fantasy — magic exists but must not solve everything; the hero still acts.' },
  { id: 'funny', label: 'मजेदार', emoji: '😄', brief: 'Funny story — humour drives the plot.' },
  { id: 'mystery', label: 'रहस्य', emoji: '🔍', brief: 'Mystery — a small puzzle solved through noticing and thinking; never frightening.' },
  { id: 'bedtime', label: 'झोपतानाची', emoji: '🌙', brief: 'Bedtime — calm, slow, cosy; low stimulation; ends sleepy and safe.' },
  { id: 'festivals', label: 'सण आणि संस्कृती', emoji: '🪔', brief: 'Festivals and culture — respectful, accurate, no stereotypes, not preachy.' },
  { id: 'space', label: 'अंतराळ', emoji: '🚀', brief: 'Space — planets, stars, the moon, rockets; wonder plus light, accurate science.' },
];

export function getCategory(id: StoryCategory): CategoryInfo {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown category: ${id}`);
  return found;
}

export function isStoryCategory(value: unknown): value is StoryCategory {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value);
}
