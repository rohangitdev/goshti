import { useCallback, useEffect, useRef, useState } from 'react';

import {
  audioService,
  feedbackService,
  storyService,
  uiSoundService,
  type PlaybackStatus,
  type StoryReaction,
} from '@/services';
import type { GoshtiStory } from '@/types/models';

export function useStoryPlayer(storyId: string | undefined) {
  const [loaded, setLoaded] = useState<{ id: string; story: GoshtiStory | null } | null>(null);
  const [isFavourite, setIsFavourite] = useState(false);
  const [reaction, setReactionState] = useState<StoryReaction | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>(audioService.getStatus());
  const wasFinished = useRef(audioService.getStatus().didFinish);

  useEffect(
    () =>
      audioService.subscribe((s) => {
        // A short, warm ending sound once Aaji finishes — not on every pause.
        if (s.didFinish && !wasFinished.current && s.storyId) uiSoundService.play('STORY_COMPLETE');
        wasFinished.current = s.didFinish;
        setStatus(s);
      }),
    [],
  );

  useEffect(() => {
    if (!storyId) return;
    let active = true;
    (async () => {
      const found = await storyService.getStory(storyId);
      if (!active) return;
      if (found) {
        setIsFavourite(await storyService.isFavourite(found.id));
        setReactionState(await feedbackService.getReaction(found.id));
        await storyService.prepareVoice(found);
        await audioService.load(found);
      }
      if (active) setLoaded({ id: storyId, story: found });
    })();
    return () => {
      active = false;
      audioService.unload();
    };
  }, [storyId]);

  const story = loaded && loaded.id === storyId ? loaded.story : null;
  const notFound = !storyId || (loaded?.id === storyId && loaded.story === null);

  const togglePlay = useCallback(() => {
    if (status.isPlaying) audioService.pause();
    else audioService.play();
  }, [status.isPlaying]);

  const toggleFavourite = useCallback(async () => {
    if (!story) return;
    const now = await storyService.toggleFavourite(story.id);
    if (now) uiSoundService.play('FAVOURITE_SAVED');
    setIsFavourite(now);
  }, [story]);

  /** Optional 😍/🙂/😐 feedback, saved on the device. */
  const setReaction = useCallback(
    async (r: StoryReaction) => {
      if (!story) return;
      setReactionState(r);
      await feedbackService.setReaction(story, r);
    },
    [story],
  );

  const progress = status.durationSeconds > 0 ? status.positionSeconds / status.durationSeconds : 0;

  return { story, notFound, status, progress, isFavourite, togglePlay, toggleFavourite, reaction, setReaction };
}
