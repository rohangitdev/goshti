import { useCallback, useEffect, useState } from 'react';

import { audioService, storyService, type PlaybackStatus } from '@/services';
import type { GoshtiStory } from '@/types/models';

export function useStoryPlayer(storyId: string | undefined) {
  const [loaded, setLoaded] = useState<{ id: string; story: GoshtiStory | null } | null>(null);
  const [isFavourite, setIsFavourite] = useState(false);
  const [status, setStatus] = useState<PlaybackStatus>(audioService.getStatus());

  useEffect(() => audioService.subscribe(setStatus), []);

  useEffect(() => {
    if (!storyId) return;
    let active = true;
    (async () => {
      const found = await storyService.getStory(storyId);
      if (!active) return;
      if (found) {
        setIsFavourite(await storyService.isFavourite(found.id));
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
    if (story) setIsFavourite(await storyService.toggleFavourite(story.id));
  }, [story]);

  const progress = status.durationSeconds > 0 ? status.positionSeconds / status.durationSeconds : 0;

  return { story, notFound, status, progress, isFavourite, togglePlay, toggleFavourite };
}
