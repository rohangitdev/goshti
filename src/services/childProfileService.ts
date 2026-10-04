import { isChildAge } from '@engine/index';

import { createId } from '@/utils/id';
import type { ChildAge, ChildProfile } from '@/types/models';

import type { StorageService } from './storageService';

export const MAX_CHILD_NAME_LENGTH = 30;

/** Thin domain layer over storage so screens don't validate or build profiles themselves. */
export class ChildProfileService {
  constructor(private readonly storage: StorageService) {}

  getProfile(): Promise<ChildProfile | null> {
    return this.storage.getChildProfile();
  }

  async saveProfile(input: { name: string; age: ChildAge }): Promise<ChildProfile> {
    const name = input.name.trim().slice(0, MAX_CHILD_NAME_LENGTH);
    if (!name) throw new Error('Name is required.');
    if (!isChildAge(input.age)) throw new Error('Age must be between 4 and 9.');
    const existing = await this.storage.getChildProfile();
    const profile: ChildProfile = { id: existing?.id ?? createId(), name, age: input.age };
    await this.storage.saveChildProfile(profile);
    return profile;
  }
}
