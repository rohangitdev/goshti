import { isChildAge } from '@engine/index';

import { createId } from '@/utils/id';
import type { ChildAge, ChildGender, ChildProfile } from '@/types/models';

import type { StorageService } from './storageService';

export const MAX_CHILD_NAME_LENGTH = 30;

/** Thin domain layer over storage so screens don't validate or build profiles themselves. */
export class ChildProfileService {
  constructor(private readonly storage: StorageService) {}

  getProfile(): Promise<ChildProfile | null> {
    return this.storage.getChildProfile();
  }

  async saveProfile(input: { name: string; age: ChildAge; gender?: ChildGender }): Promise<ChildProfile> {
    const name = input.name.trim().slice(0, MAX_CHILD_NAME_LENGTH);
    if (!name) throw new Error('Name is required.');
    if (!isChildAge(input.age)) throw new Error('Age must be between 2 and 9.');
    const existing = await this.storage.getChildProfile();
    const gender = input.gender === 'BOY' || input.gender === 'GIRL' ? input.gender : existing?.gender;
    const profile: ChildProfile = { id: existing?.id ?? createId(), name, age: input.age, ...(gender ? { gender } : {}) };
    await this.storage.saveChildProfile(profile);
    // Stories prepared in advance star the child — drop them if the name or boy/girl changed.
    if (existing && (existing.name !== profile.name || existing.gender !== profile.gender)) {
      await this.storage.savePreparedStories({});
    }
    return profile;
  }
}
