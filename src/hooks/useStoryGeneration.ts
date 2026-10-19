import { useEffect, useState } from 'react';

import type { StoryRequest } from '@engine/index';
import { childProfileService, StoryLimitReachedError, storyService } from '@/services';

export type GenerationState =
  /** Checking the monthly allowance first — nothing plays yet. */
  | { status: 'checking' }
  | { status: 'working' }
  | { status: 'done'; storyId: string }
  | { status: 'limit' }
  /** The idea wasn't a story request / wasn't suitable — show Aaji's fixed message. */
  | { status: 'declined'; message: string }
  /** reason is technical — shown only in development builds. */
  | { status: 'error'; reason?: string };

type Input = Pick<StoryRequest, 'category' | 'mode' | 'userIdea'>;

/** Builds the full StoryRequest from the child profile and asks storyService for a story. */
export function useStoryGeneration(input: Input | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; state: GenerationState } | null>(null);
  const [progress, setProgress] = useState<{ key: string; label: string } | null>(null);
  const { category, mode, userIdea } = input ?? {};
  const key = category && mode ? `${category}|${mode}|${userIdea ?? ''}|${attempt}` : null;

  useEffect(() => {
    if (!key || !category || !mode) return;
    let active = true;

    (async () => {
      // Out of new stories this month: say so straight away (no waiting song, no "preparing").
      if (!(await storyService.canCreateStory())) {
        if (active) setResult({ key, state: { status: 'limit' } });
        return;
      }
      if (active) setResult({ key, state: { status: 'working' } });
      let state: GenerationState;
      try {
        const profile = await childProfileService.getProfile();
        const outcome = await storyService.createStory({
          category,
          mode,
          userIdea,
          age: profile?.age ?? 6,
          childName: profile?.name,
          childGender: profile?.gender,
        }, (label) => {
          if (active) setProgress({ key, label });
        });
        state =
          outcome.status === 'CREATED'
            ? { status: 'done', storyId: outcome.story.id }
            : { status: 'declined', message: outcome.message };
      } catch (e) {
        state = e instanceof StoryLimitReachedError ? { status: 'limit' } : { status: 'error', reason: (e as Error).message };
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
      : { status: 'checking' };

  const progressLabel = progress?.key === key ? progress.label : null;
  /** Always-available fallback: one of Aaji's hand-written library stories. */
  const playLibrary = async (): Promise<string> => {
    const profile = await childProfileService.getProfile();
    const story = await storyService.playFromLibrary({ age: profile?.age ?? 4, category });
    return story.id;
  };

  return { state, progressLabel, retry: () => setAttempt((n) => n + 1), playLibrary };
}
