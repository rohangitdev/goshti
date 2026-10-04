import { useEffect, useState } from 'react';

import type { StoryRequest } from '@engine/index';
import { childProfileService, StoryLimitReachedError, storyService } from '@/services';

export type GenerationState =
  | { status: 'working' }
  | { status: 'done'; storyId: string }
  | { status: 'limit' }
  | { status: 'error' };

type Input = Pick<StoryRequest, 'category' | 'mode' | 'userIdea'>;

/** Builds the full StoryRequest from the child profile and asks storyService for a story. */
export function useStoryGeneration(input: Input | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; state: GenerationState } | null>(null);
  const { category, mode, userIdea } = input ?? {};
  const key = category && mode ? `${category}|${mode}|${userIdea ?? ''}|${attempt}` : null;

  useEffect(() => {
    if (!key || !category || !mode) return;
    let active = true;

    (async () => {
      let state: GenerationState;
      try {
        const profile = await childProfileService.getProfile();
        const story = await storyService.createStory({
          category,
          mode,
          userIdea,
          age: profile?.age ?? 6,
          childName: profile?.name,
        });
        state = { status: 'done', storyId: story.id };
      } catch (e) {
        state = { status: e instanceof StoryLimitReachedError ? 'limit' : 'error' };
      }
      if (active) setResult({ key, state });
    })();

    return () => {
      active = false;
    };
  }, [key, category, mode, userIdea]);

  const state: GenerationState = !key
    ? { status: 'error' }
    : result?.key === key
      ? result.state
      : { status: 'working' };

  return { state, retry: () => setAttempt((n) => n + 1) };
}
