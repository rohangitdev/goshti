import { describe, expect, it } from 'vitest';

import { validateStoryRequest } from '../request';

describe('StoryRequest validation', () => {
  it('accepts a RANDOM request and drops any idea', () => {
    const r = validateStoryRequest({ age: 4, category: 'magic', mode: 'RANDOM', userIdea: 'ignored' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.userIdea).toBeUndefined();
  });

  it('accepts every age 2–9', () => {
    for (let age = 2; age <= 9; age++) {
      expect(validateStoryRequest({ age, category: 'animals', mode: 'RANDOM' }).ok).toBe(true);
    }
  });

  it.each([1, 10, 0, 5.5, -2, null, 'five'])('rejects invalid age %s', (age) => {
    expect(validateStoryRequest({ age, category: 'animals', mode: 'RANDOM' }).ok).toBe(false);
  });

  it('accepts numeric strings for age', () => {
    const r = validateStoryRequest({ age: '7', category: 'space', mode: 'RANDOM' });
    expect(r.ok && r.value.age).toBe(7);
  });

  it('requires an idea for CUSTOM mode', () => {
    expect(validateStoryRequest({ age: 6, category: 'animals', mode: 'CUSTOM' }).ok).toBe(false);
    expect(validateStoryRequest({ age: 6, category: 'animals', mode: 'CUSTOM', userIdea: '   ' }).ok).toBe(false);
  });

  it('rejects unknown categories and modes', () => {
    expect(validateStoryRequest({ age: 6, category: 'horror', mode: 'RANDOM' }).ok).toBe(false);
    expect(validateStoryRequest({ age: 6, category: 'animals', mode: 'CHAT' }).ok).toBe(false);
    expect(validateStoryRequest(null).ok).toBe(false);
  });

  it('sanitises the idea: control characters, whitespace, length cap', () => {
    const r = validateStoryRequest({
      age: 6,
      category: 'animals',
      mode: 'CUSTOM',
      userIdea: `  एक\u0000 मांजर\n\n क्रिकेट​ खेळतं ${'अ'.repeat(500)}`,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.userIdea!.startsWith('एक मांजर क्रिकेट खेळतं')).toBe(true);
      expect(r.value.userIdea!.length).toBeLessThanOrEqual(200);
    }
  });

  it('keeps only letters in the child name', () => {
    const r = validateStoryRequest({ age: 6, category: 'animals', mode: 'RANDOM', childName: 'आर्या<script>123' });
    expect(r.ok && r.value.childName).toBe('आर्याscript');
  });
});
