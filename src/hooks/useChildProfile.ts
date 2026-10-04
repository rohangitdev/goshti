import { useCallback, useEffect, useState } from 'react';

import { childProfileService } from '@/services';
import type { ChildAge, ChildProfile } from '@/types/models';

export function useChildProfile() {
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    childProfileService.getProfile().then((p) => {
      if (active) {
        setProfile(p);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(async (input: { name: string; age: ChildAge }) => {
    const saved = await childProfileService.saveProfile(input);
    setProfile(saved);
    return saved;
  }, []);

  return { profile, loading, save };
}
