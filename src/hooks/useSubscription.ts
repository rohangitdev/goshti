import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { subscriptionService } from '@/services';
import type { Subscription } from '@/types/models';

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      subscriptionService.getSubscription().then((s) => active && setSubscription(s));
      return () => {
        active = false;
      };
    }, []),
  );

  return subscription;
}
