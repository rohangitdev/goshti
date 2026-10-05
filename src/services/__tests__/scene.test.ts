import { describe, expect, it } from 'vitest';

import { CATEGORY_IDS } from '@engine/index';
import { sceneFor } from '@/utils/scene';

const at = (h: number) => new Date(2026, 9, 6, h, 0);

describe('story scenes', () => {
  it('bedtime, space and magic are told under the stars', () => {
    for (const c of ['bedtime', 'space', 'magic'] as const) expect(sceneFor(c, at(10))).toBe('night');
  });
  it('the courtyard becomes the starry night after dark', () => {
    expect(sceneFor('animals', at(16))).toBe('courtyard');
    expect(sceneFor('animals', at(20))).toBe('night');
    expect(sceneFor('festivals', at(5))).toBe('night');
  });
  it('every category has a scene; unknown → Aaji’s room', () => {
    for (const c of CATEGORY_IDS) expect(['room', 'night', 'courtyard']).toContain(sceneFor(c, at(12)));
    expect(sceneFor(undefined)).toBe('room');
  });
});
