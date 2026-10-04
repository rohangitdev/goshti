import { describe, expect, it } from 'vitest';

import { buildAudioScript, buildFallbackAudioScript, coverageRatio, markedStory, segmentStory } from '../audio';
import { isAllowedMusicMood, isAllowedSfx, MUSIC_MOODS, SFX_IDS } from '../sfx';

const story = 'चिऊ उडालं. "झूम!" ते म्हणालं.\n\nतारा हसला. "धन्यवाद," तो म्हणाला.';

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

describe('story segmentation', () => {
  it('numbers paragraphs and quotes', () => {
    const p = segmentStory(story);
    expect(p).toHaveLength(2);
    expect(p[0].parts).toEqual([
      { kind: 'narration', text: 'चिऊ उडालं.' },
      { kind: 'quote', quote: 1, text: 'झूम!' },
      { kind: 'narration', text: 'ते म्हणालं.' },
    ]);
    expect(p[1].parts.find((x) => x.kind === 'quote')).toEqual({ kind: 'quote', quote: 2, text: 'धन्यवाद,' });
    expect(markedStory(story)).toContain('[P2]');
    expect(markedStory(story)).toContain('«Q2: "धन्यवाद,"»');
  });
});

describe('audio script assembly', () => {
  it('keeps the approved text exactly, whatever the director returns', () => {
    const { script } = buildAudioScript(story, { speakers: [], narration: [], cues: [] });
    expect(coverageRatio(script, story)).toBeCloseTo(1, 1);
  });

  it('applies speakers, carries narration emotion forward, places cues', () => {
    const { script } = buildAudioScript(story, {
      speakers: [
        { quote: 1, character: 'चिऊ', voiceStyle: 'SMALL_CHILD', emotion: 'excited' },
        { quote: 2, character: 'तारा', voiceStyle: 'SQUEAKY' },
      ],
      narration: [{ paragraph: 1, emotion: 'playful' }],
      cues: [
        { afterParagraph: 0, type: 'AMBIENCE', soundId: 'FOREST_AMBIENCE', action: 'START' },
        { afterParagraph: 1, type: 'SFX', soundId: 'WHOOSH_SOFT' },
        { afterParagraph: 1, type: 'PAUSE', durationMs: 1500 },
      ],
    });
    const s = script.segments;
    expect(s[0]).toEqual({ type: 'AMBIENCE', soundId: 'FOREST_AMBIENCE', action: 'START' });
    expect(s).toContainEqual({ type: 'DIALOGUE', character: 'चिऊ', text: 'झूम!', emotion: 'excited', voiceStyle: 'SMALL_CHILD' });
    const narr = s.filter((x) => x.type === 'NARRATION');
    expect(narr.every((x) => x.type === 'NARRATION' && x.emotion === 'playful')).toBe(true);
    expect(s).toContainEqual({ type: 'SFX', soundId: 'WHOOSH_SOFT' });
    expect(s[s.length - 1]).toEqual({ type: 'AMBIENCE', soundId: 'FOREST_AMBIENCE', action: 'STOP' });
  });

  it('drops unapproved sounds and URLs, clamps pauses', () => {
    const { script, warnings } = buildAudioScript(story, {
      speakers: [],
      narration: [],
      cues: [
        { afterParagraph: 1, type: 'SFX', soundId: 'https://evil.example/x.mp3' },
        { afterParagraph: 1, type: 'SFX', soundId: 'EXPLOSION' },
        { afterParagraph: 1, type: 'MUSIC_CUE', mood: 'DUBSTEP', action: 'START' },
        { afterParagraph: 1, type: 'PAUSE', durationMs: 60000 },
      ],
    });
    expect(script.segments.some((x) => x.type === 'SFX' || x.type === 'MUSIC_CUE')).toBe(false);
    expect(script.segments).toContainEqual({ type: 'PAUSE', durationMs: 4000 });
    expect(warnings.filter((w) => w.includes('not approved'))).toHaveLength(3);
    expect(JSON.stringify(script)).not.toContain('http');
  });

  it('limits sound effect density', () => {
    const cues = Array.from({ length: 20 }, () => ({ afterParagraph: 1, type: 'SFX' as const, soundId: 'CLAP' }));
    const { script } = buildAudioScript(story, { speakers: [], narration: [], cues }, { estimatedMinutes: 1 });
    expect(script.segments.filter((x) => x.type === 'SFX').length).toBeLessThanOrEqual(3);
  });

  it('fallback adds ambience and keeps all text', () => {
    const script = buildFallbackAudioScript(story, { ambience: 'NIGHT_AMBIENCE', closingEmotion: 'sleepy' });
    expect(script.segments[0]).toEqual({ type: 'AMBIENCE', soundId: 'NIGHT_AMBIENCE', action: 'START' });
    expect(coverageRatio(script, story)).toBeCloseTo(1, 1);
    const lastNarration = [...script.segments].reverse().find((x) => x.type === 'NARRATION');
    expect(lastNarration).toMatchObject({ emotion: 'sleepy' });
  });
});
