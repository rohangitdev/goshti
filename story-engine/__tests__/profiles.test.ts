import { describe, expect, it } from 'vitest';

import { CHILD_AGES, PROFILES, resolveProfile } from '../profiles';

describe('development profile resolver', () => {
  it('supports exactly ages 2–9', () => {
    expect([...CHILD_AGES]).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it.each([
    [2, 'EARLY_LISTENER'],
    [3, 'EARLY_LISTENER'],
    [4, 'IMAGINATIVE_LISTENER'],
    [5, 'IMAGINATIVE_LISTENER'],
    [6, 'STORY_EXPLORER'],
    [7, 'STORY_EXPLORER'],
    [8, 'INDEPENDENT_IMAGINER'],
    [9, 'INDEPENDENT_IMAGINER'],
  ])('age %i → %s', (age, id) => {
    expect(resolveProfile(age).id).toBe(id);
  });

  it.each([0, 1, 10, 4.5, -3, NaN])('rejects invalid age %s', (age) => {
    expect(() => resolveProfile(age)).toThrow(RangeError);
  });

  it('has growing durations matching the spec', () => {
    expect(PROFILES.EARLY_LISTENER.durationMinutes).toEqual({ min: 2, max: 4 });
    expect(PROFILES.IMAGINATIVE_LISTENER.durationMinutes).toEqual({ min: 4, max: 6 });
    expect(PROFILES.STORY_EXPLORER.durationMinutes).toEqual({ min: 5, max: 7 });
    expect(PROFILES.INDEPENDENT_IMAGINER.durationMinutes).toEqual({ min: 6, max: 9 });
  });
});
