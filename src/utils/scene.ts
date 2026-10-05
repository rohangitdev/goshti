import type { StoryCategory } from '@engine/index';

/**
 * Where Aaji tells the story. Chosen from the story's category (and the time of day for the
 * courtyard), so the picture matches the mood without anything being generated.
 */
export type SceneId = 'room' | 'night' | 'courtyard';

const BY_CATEGORY: Record<StoryCategory, SceneId> = {
  bedtime: 'night',
  space: 'night',
  magic: 'night',
  animals: 'courtyard',
  festivals: 'courtyard',
  adventure: 'courtyard',
  funny: 'courtyard',
  mystery: 'room',
};

export function sceneFor(category: StoryCategory | undefined, now: Date = new Date()): SceneId {
  const scene = category ? (BY_CATEGORY[category] ?? 'room') : 'room';
  // After dark the courtyard becomes the starry night under the tree.
  const hour = now.getHours();
  if (scene === 'courtyard' && (hour >= 19 || hour < 6)) return 'night';
  return scene;
}

export const SCENE_LABEL: Record<SceneId, string> = {
  room: 'आजी आपल्या खोलीत दिव्याजवळ खुर्चीत बसून गोष्ट सांगते आहे',
  night: 'चांदण्या रात्री झाडाखाली आजी गोष्ट सांगते आहे',
  courtyard: 'संध्याकाळी अंगणात तुळशीजवळ आजी गोष्ट सांगते आहे',
};
