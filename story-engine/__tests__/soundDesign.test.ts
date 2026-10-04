import { describe, expect, it } from 'vitest';

import { audioScriptToText, buildAudioScript, coverageRatio } from '../audio';
import { libraryAudioScript, LIBRARY } from '../library';
import { CHILD_AGES } from '../profiles';
import { SFX_IDS } from '../sfx';
import {
  AAJI_INTRO_LINE,
  AMBIENCE_IDS,
  isAmbienceId,
  ONE_SHOT_SFX_IDS,
  SOUND_POLICIES,
  soundPolicyFor,
} from '../soundDesign';
import { buildTtsChunks } from '../tts';
import { PREBUILT_VOICES, resolveAajiVoice, SynthesizerTTSProvider } from '../ttsProvider';
import type { AudioDirection } from '../schemas';

const story = 'पहिला परिच्छेद.\n\nदुसरा परिच्छेद. "नमस्कार!" ससा म्हणाला.\n\nतिसरा परिच्छेद.';

describe('sound design policy', () => {
  it('splits approved ids into ambience beds and one-shots', () => {
    expect(AMBIENCE_IDS).toHaveLength(7);
    expect(ONE_SHOT_SFX_IDS.length + AMBIENCE_IDS.length).toBe(SFX_IDS.length);
    expect(isAmbienceId('WAVES')).toBe(true);
    expect(isAmbienceId('BIRDS')).toBe(false);
  });

  it('always keeps narration > SFX > ambience > music', () => {
    for (const p of Object.values(SOUND_POLICIES)) {
      const { narration, sfx, ambience, music } = p.levels;
      expect(narration).toBe(1);
      expect(sfx).toBeLessThan(narration);
      expect(ambience).toBeLessThan(sfx);
      expect(music).toBeLessThan(ambience);
    }
  });

  it('gets more restrained with age', () => {
    expect(soundPolicyFor(2).sfxPerMinute).toBeGreaterThan(soundPolicyFor(9).sfxPerMinute);
    expect(soundPolicyFor(9).levels.sfx).toBeLessThan(soundPolicyFor(3).levels.sfx);
    for (const age of CHILD_AGES) expect(soundPolicyFor(age)).toBeDefined();
  });
});

describe('audio script sound rules', () => {
  const sfxEverywhere = (id: string, n: number): AudioDirection => ({
    speakers: [{ quote: 1, character: 'ससा', voiceStyle: 'SMALL_CHILD' }],
    narration: [],
    cues: Array.from({ length: n }, () => ({ afterParagraph: 1, type: 'SFX' as const, soundId: id })),
  });

  it('caps SFX by the age policy', () => {
    const young = buildAudioScript(story, sfxEverywhere('BELL', 20), { estimatedMinutes: 1, age: 3 }).script;
    const old = buildAudioScript(story, sfxEverywhere('BELL', 20), { estimatedMinutes: 1, age: 9 }).script;
    const count = (s: typeof young) => s.segments.filter((x) => x.type === 'SFX').length;
    expect(count(young)).toBe(4);
    expect(count(old)).toBe(2);
  });

  it('plays a non-bed "ambience" once as SFX and limits music cues', () => {
    const { script, warnings } = buildAudioScript(
      story,
      {
        speakers: [],
        narration: [],
        cues: [
          { afterParagraph: 0, type: 'AMBIENCE', soundId: 'BIRDS', action: 'START' },
          { afterParagraph: 1, type: 'MUSIC_CUE', mood: 'GENTLE', action: 'START' },
          { afterParagraph: 2, type: 'MUSIC_CUE', mood: 'MAGICAL', action: 'START' },
          { afterParagraph: 3, type: 'MUSIC_CUE', mood: 'VICTORY', action: 'START' },
        ],
      },
      { age: 9 },
    );
    expect(script.segments.some((s) => s.type === 'AMBIENCE')).toBe(false);
    expect(script.segments.some((s) => s.type === 'SFX' && s.soundId === 'BIRDS')).toBe(true);
    expect(script.segments.filter((s) => s.type === 'MUSIC_CUE' && s.action === 'START')).toHaveLength(1);
    expect(warnings.join(' ')).toContain('too many music cues');
  });

  it('starts with Aaji’s intro line when asked, without counting it as story text', () => {
    const { script } = buildAudioScript(story, null, { intro: true });
    expect(script.segments[0]).toMatchObject({ type: 'NARRATION', text: AAJI_INTRO_LINE });
    expect(script.segments[1].type).toBe('PAUSE');
    expect(audioScriptToText(script)).not.toContain(AAJI_INTRO_LINE);
    expect(coverageRatio(script, story)).toBeCloseTo(1, 1);
  });

  it('library stories open with the intro and use real ambience beds', () => {
    for (const s of LIBRARY) {
      const script = libraryAudioScript(s, 4);
      expect(script.segments[0]).toMatchObject({ type: 'NARRATION', text: AAJI_INTRO_LINE });
      for (const seg of script.segments) if (seg.type === 'AMBIENCE') expect(isAmbienceId(seg.soundId)).toBe(true);
    }
  });
});

describe('TTS chunks place cues inside the chunk', () => {
  it('records each cue position as a fraction of the chunk', () => {
    const direction: AudioDirection = {
      speakers: [],
      narration: [],
      cues: [
        { afterParagraph: 0, type: 'AMBIENCE', soundId: 'FOREST_AMBIENCE', action: 'START' },
        { afterParagraph: 1, type: 'SFX', soundId: 'BELL' },
      ],
    };
    const { script } = buildAudioScript(story, direction, { intro: true });
    const [chunk] = buildTtsChunks(script);
    expect(chunk.cues.map((c) => c.type)).toEqual(['AMBIENCE', 'SFX', 'AMBIENCE']);
    expect(chunk.cueAt).toHaveLength(3);
    expect(chunk.cueAt[0]).toBeGreaterThan(0); // after the intro line
    expect(chunk.cueAt[1]).toBeGreaterThan(chunk.cueAt[0]);
    expect(chunk.cueAt[1]).toBeLessThan(1);
    expect(chunk.cueAt[2]).toBe(1);
  });
});

describe('TTS provider abstraction', () => {
  it('only allows prebuilt synthetic voices', () => {
    expect(resolveAajiVoice('aoede', 'Sulafat')).toBe('Aoede');
    expect(resolveAajiVoice('my-cloned-voice', 'Aoede')).toBe('Aoede');
    expect(resolveAajiVoice('https://example.com/voice.wav', 'nope')).toBe('Aoede');
    expect(PREBUILT_VOICES).toContain('Aoede');
  });

  it('turns narration and dialogue into styled single-line requests', async () => {
    const seen: string[] = [];
    const provider = new SynthesizerTTSProvider(
      {
        name: 'fake',
        async synthesize(chunk, voice) {
          seen.push(`${voice}|${chunk.parts[0].text}|${chunk.parts[0].style}`);
          return { mimeType: 'audio/wav', base64: 'AAAA', model: 'fake' };
        },
      },
      'BASE',
    );
    await provider.synthesizeNarration({ text: 'एक होती चिऊ.', emotion: 'gentle', voice: 'Aoede' });
    await provider.synthesizeDialogue({ text: 'नमस्कार!', character: 'ससा', voiceStyle: 'SQUEAKY', voice: 'Aoede' });
    expect(seen[0]).toMatch(/^Aoede\|एक होती चिऊ\.\|BASE; now soft and gentle$/);
    expect(seen[1]).toContain('performing ससा');
  });
});
