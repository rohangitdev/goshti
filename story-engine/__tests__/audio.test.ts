import { describe, expect, it } from 'vitest';

import { buildFallbackAudioScript, coverageRatio, normalizeAudioScript } from '../audio';
import { isAllowedMusicMood, isAllowedSfx, MUSIC_MOODS, SFX_IDS } from '../sfx';

const story = 'चिऊ उडालं. "झूम!" ते म्हणालं.\n\nतारा हसला.';

describe('SFX whitelist', () => {
  it('contains the 30 approved IDs and 8 moods', () => {
    expect(SFX_IDS).toHaveLength(30);
    expect(MUSIC_MOODS).toHaveLength(8);
    expect(isAllowedSfx('CAT_MEOW')).toBe(true);
    expect(isAllowedSfx('cat_meow')).toBe(false);
    expect(isAllowedSfx('https://example.com/boom.mp3')).toBe(false);
    expect(isAllowedMusicMood('BEDTIME')).toBe(true);
    expect(isAllowedMusicMood('EPIC_TRAILER')).toBe(false);
  });
});

describe('audio script normalisation', () => {
  it('drops unapproved sounds and URLs, clamps pauses, closes open ambience', () => {
    const { script, warnings } = normalizeAudioScript(
      {
        segments: [
          { type: 'AMBIENCE', soundId: 'FOREST_AMBIENCE', action: 'START' },
          { type: 'NARRATION', text: 'चिऊ उडालं.', emotion: 'excited' },
          { type: 'SFX', soundId: 'https://evil.example/x.mp3' },
          { type: 'SFX', soundId: 'EXPLOSION' },
          { type: 'DIALOGUE', character: 'चिऊ', text: 'झूम!', voiceStyle: 'SMALL_CHILD' },
          { type: 'PAUSE', durationMs: 60000 },
          { type: 'MUSIC_CUE', mood: 'DUBSTEP', action: 'START' },
          { type: 'NARRATION', text: 'ते म्हणालं. तारा हसला.' },
        ],
      },
      story,
      3,
    );
    const types = script.segments.map((s) => s.type);
    expect(types).not.toContain('MUSIC_CUE');
    expect(script.segments.filter((s) => s.type === 'SFX')).toHaveLength(0);
    expect(script.segments.find((s) => s.type === 'PAUSE')).toEqual({ type: 'PAUSE', durationMs: 4000 });
    expect(script.segments[script.segments.length - 1]).toEqual({ type: 'AMBIENCE', soundId: 'FOREST_AMBIENCE', action: 'STOP' });
    expect(warnings.some((w) => w.includes('not approved'))).toBe(true);
    expect(JSON.stringify(script)).not.toContain('http');
  });

  it('limits sound effect density', () => {
    const many = Array.from({ length: 20 }, () => ({ type: 'SFX' as const, soundId: 'CLAP' }));
    const { script } = normalizeAudioScript({ segments: [{ type: 'NARRATION', text: story }, ...many] }, story, 1);
    expect(script.segments.filter((s) => s.type === 'SFX').length).toBeLessThanOrEqual(3);
  });

  it('fallback converter keeps all story text and splits quoted dialogue', () => {
    const script = buildFallbackAudioScript(story);
    expect(coverageRatio(script, story)).toBeGreaterThan(0.95);
    expect(script.segments.some((s) => s.type === 'DIALOGUE' && s.text === 'झूम!')).toBe(true);
  });
});
