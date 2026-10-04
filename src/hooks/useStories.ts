import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { storageService, storyService } from '@/services';
import type { GoshtiStory } from '@/types/models';

/** Story library, refreshed whenever the screen regains focus. */
export function useStories() {
  const [stories, setStories] = useState<GoshtiStory[]>([]);
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([storyService.listStories(), storageService.getFavouriteIds()]).then(([list, favs]) => {
        if (!active) return;
        setStories(list);
        setFavouriteIds(new Set(favs));
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return { stories, favouriteIds, loading };
}
