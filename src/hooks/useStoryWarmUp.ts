import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { storyService } from '@/services';

/** When Home is shown, quietly prepare the next random story (if enabled). */
export function useStoryWarmUp() {
  useFocusEffect(
    useCallback(() => {
      storyService.warmUp().catch(() => {});
    }, []),
  );
}
