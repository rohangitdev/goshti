import type { StoryCategory } from './types';

export interface CategoryInfo {
  id: StoryCategory;
  /** Marathi label shown to the child. */
  label: string;
  /** Placeholder icon until artwork exists. */
  emoji: string;
}

export const CATEGORIES: readonly CategoryInfo[] = [
  { id: 'animals', label: 'प्राण्यांची', emoji: '🐘' },
  { id: 'adventure', label: 'साहस', emoji: '🧭' },
  { id: 'magic', label: 'जादूची', emoji: '✨' },
  { id: 'funny', label: 'मजेदार', emoji: '😄' },
  { id: 'mystery', label: 'रहस्य', emoji: '🔍' },
  { id: 'bedtime', label: 'झोपतानाची', emoji: '🌙' },
  { id: 'festivals', label: 'सण आणि संस्कृती', emoji: '🪔' },
];

export function getCategory(id: StoryCategory): CategoryInfo {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown category: ${id}`);
  return found;
}

export function isStoryCategory(value: unknown): value is StoryCategory {
  return typeof value === 'string' && CATEGORIES.some((c) => c.id === value);
}
