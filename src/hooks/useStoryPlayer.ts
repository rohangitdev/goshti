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

/**
 * @param autoplay start playing as soon as the story is loaded (used when the player switches
 *   to a ready-made story after the child already pressed play).
 */
export function useStoryPlayer(storyId: string | undefined, options: { autoplay?: boolean } = {}) {
  const [loaded, setLoaded] = useState<{ id: string; story: GoshtiStory | null } | null>(null);
  /** A ready-made story to switch to when Aaji's voice couldn't be made for this one. */
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const autoplay = !!options.autoplay;
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
      if (active && found && autoplay) await audioService.play();
    })();
    return () => {
      active = false;
      audioService.unload();
    };
  }, [storyId, autoplay]);

  const story = loaded && loaded.id === storyId ? loaded.story : null;

  // Aaji's voice couldn't be made (cleanly) for this new story: never read it in another
  // voice or play anything odd — switch to one of Aaji's ready-made stories instead.
  const unavailable = !!(story && status.voiceUnavailable && status.storyId === story.id);
  useEffect(() => {
    if (!unavailable || !story) return;
    let active = true;
    storyService
      .playFromLibrary({ age: story.age, category: story.category })
      .then((lib) => active && setReplacementId(lib.id))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [unavailable, story]);
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

  return {
    story,
    notFound,
    status,
    progress,
    isFavourite,
    togglePlay,
    toggleFavourite,
    reaction,
    setReaction,
    /** Set when the player should switch to this ready-made story. */
    replacementId: replacementId && replacementId !== storyId ? replacementId : null,
  };
}
