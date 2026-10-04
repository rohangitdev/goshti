import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AMBIENCE_HOLD_MS,
  buildAudioScript,
  buildTtsChunks,
  MIN_SFX_GAP_MS,
  soundPolicyFor,
  type AudioScript,
} from '@engine/index';
import type { GoshtiStory } from '@/types/models';

import { LayeredStoryAudioService, StorySoundscape } from '../audioMixerService';
import type { AudioService, PlaybackListener, PlaybackStatus, SoundCue } from '../audioService';
import { LocalFeedbackService, type FeedbackRecords } from '../feedbackService';
import { checkParentAnswer, createParentChallenge } from '../parentGate';
import type { SoundCatalog } from '../soundAssets';
import type { SoundHandle, SoundPlayerFactory, SoundSource } from '../soundPlayer';
import { DefaultUiSoundService, type AppSettings } from '../uiSoundService';

vi.mock('expo-audio', () => ({ createAudioPlayer: vi.fn(), setAudioModeAsync: vi.fn(async () => {}) }));

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface FakeHandle extends SoundHandle {
  source: SoundSource;
  volume: number;
  loop: boolean;
  playing: boolean;
  released: boolean;
  end(): void;
}

class FakePlayers implements SoundPlayerFactory {
  created: FakeHandle[] = [];
  create(source: SoundSource, options: { volume: number; loop?: boolean }): SoundHandle {
    let onEnd: (() => void) | null = null;
    const h: FakeHandle = {
      source,
      volume: options.volume,
      loop: !!options.loop,
      playing: false,
      released: false,
      play: () => void (h.playing = true),
      pause: () => void (h.playing = false),
      setVolume: (v) => void (h.volume = v),
      onEnd: (cb) => void (onEnd = cb),
      release: () => void ((h.released = true), (h.playing = false)),
      end: () => onEnd?.(),
    };
    this.created.push(h);
    return h;
  }
  live(name: string) {
    return this.created.filter((h) => !h.released && (h.source as { uri: string }).uri === name);
  }
}

const src = (name: string): SoundSource => ({ uri: name });
const catalog: SoundCatalog = {
  ui: (id) => src(`ui:${id}`),
  signature: () => src('signature'),
  sfx: (id) => (id === 'LION' ? null : src(`sfx:${id}`)),
  music: (mood) => src(`music:${mood}`),
};

const IDLE: PlaybackStatus = { storyId: null, isPlaying: false, positionSeconds: 0, durationSeconds: 0, didFinish: false };

class FakeNarration implements AudioService {
  status: PlaybackStatus = IDLE;
  listeners = new Set<PlaybackListener>();
  onCue: ((cue: SoundCue) => void) | null = null;
  played = 0;
  async load(story: GoshtiStory) {
    this.set({ ...IDLE, storyId: story.id, durationSeconds: 60 });
  }
  async play() {
    this.played += 1;
    this.set({ ...this.status, isPlaying: true, didFinish: false });
  }
  async pause() {
    this.set({ ...this.status, isPlaying: false });
  }
  async unload() {
    this.set(IDLE);
  }
  getStatus() {
    return this.status;
  }
  subscribe(l: PlaybackListener) {
    this.listeners.add(l);
    l(this.status);
    return () => void this.listeners.delete(l);
  }
  set(s: PlaybackStatus) {
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }
}

const story = (age: number, script?: AudioScript): GoshtiStory => ({
  id: 's1',
  title: 'चाचणी',
  age: age as GoshtiStory['age'],
  ageBand: '4-5',
  category: 'animals',
  userIdea: null,
  value: 'मैत्री',
  durationSeconds: 60,
  storyText: 'एक.',
  audioScript: script ?? buildAudioScript('एक.', null).script,
  audioUrl: null,
  createdAt: new Date().toISOString(),
  rating: null,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------

describe('StorySoundscape (mixer layers)', () => {
  it('fades an ambience bed in to the low ambience level and keeps one bed at a time', () => {
    const players = new FakePlayers();
    const scape = new StorySoundscape({ catalog, players });
    scape.setAge(4);
    scape.cue({ type: 'AMBIENCE', soundId: 'FOREST_AMBIENCE', action: 'START' });
    const [bed] = players.live('sfx:FOREST_AMBIENCE');
    expect(bed.loop).toBe(true);
    expect(bed.volume).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(bed.volume).toBeCloseTo(soundPolicyFor(4).levels.ambience);

    scape.cue({ type: 'AMBIENCE', soundId: 'NIGHT_AMBIENCE', action: 'START' });
    vi.advanceTimersByTime(2000);
    expect(bed.released).toBe(true);
    expect(scape.activeLayers()).toEqual([{ kind: 'ambience', id: 'NIGHT_AMBIENCE' }]);
  });

  it('keeps narration > sfx > ambience > music in the actual volumes', () => {
    const players = new FakePlayers();
    const scape = new StorySoundscape({ catalog, players });
    scape.setAge(9);
    scape.cue({ type: 'AMBIENCE', soundId: 'WAVES', action: 'START' });
    scape.cue({ type: 'MUSIC_CUE', mood: 'GENTLE', action: 'START' });
    scape.cue({ type: 'SFX', soundId: 'BELL' });
    vi.advanceTimersByTime(2000);
    const v = (n: string) => players.live(n)[0].volume;
    expect(v('sfx:BELL')).toBeLessThan(1);
    expect(v('sfx:WAVES')).toBeLessThan(v('sfx:BELL'));
    expect(v('music:GENTLE')).toBeLessThan(v('sfx:WAVES'));
  });

  it('skips sounds without an asset and keeps effects occasional (min gap)', () => {
    const players = new FakePlayers();
    const scape = new StorySoundscape({ catalog, players });
    scape.cue({ type: 'SFX', soundId: 'LION' });
    expect(players.created).toHaveLength(0);
    for (let i = 0; i < 5; i++) scape.cue({ type: 'SFX', soundId: 'CLAP' });
    expect(players.live('sfx:CLAP')).toHaveLength(1);
    players.live('sfx:CLAP')[0].end();
    vi.advanceTimersByTime(MIN_SFX_GAP_MS);
    scape.cue({ type: 'SFX', soundId: 'BELL' });
    expect(players.live('sfx:BELL')).toHaveLength(1);
  });

  it('ambience sets the scene, then fades away (paused time does not count)', () => {
    const players = new FakePlayers();
    const scape = new StorySoundscape({ catalog, players });
    scape.cue({ type: 'AMBIENCE', soundId: 'FOREST_AMBIENCE', action: 'START' });
    const [bed] = players.live('sfx:FOREST_AMBIENCE');
    vi.advanceTimersByTime(AMBIENCE_HOLD_MS / 2);
    scape.pause();
    vi.advanceTimersByTime(AMBIENCE_HOLD_MS * 2);
    expect(bed.released).toBe(false);
    scape.resume();
    vi.advanceTimersByTime(AMBIENCE_HOLD_MS / 2 + 5000);
    expect(bed.released).toBe(true);
  });

  it('pauses and resumes beds, and stop() fades everything out', () => {
    const players = new FakePlayers();
    const scape = new StorySoundscape({ catalog, players });
    scape.cue({ type: 'AMBIENCE', soundId: 'RAIN_LIGHT', action: 'START' });
    const [bed] = players.live('sfx:RAIN_LIGHT');
    scape.pause();
    expect(bed.playing).toBe(false);
    scape.resume();
    expect(bed.playing).toBe(true);
    scape.stop();
    vi.advanceTimersByTime(2000);
    expect(bed.released).toBe(true);
  });
});

describe('LayeredStoryAudioService (story playback)', () => {
  it('plays the GOSHTI signature first, then Aaji; sounds follow the narration', async () => {
    const players = new FakePlayers();
    const narration = new FakeNarration();
    const service = new LayeredStoryAudioService(narration, new StorySoundscape({ catalog, players }));
    await service.load(story(5));

    const playing = service.play();
    expect(service.getStatus().intro).toBe(true);
    expect(narration.played).toBe(0);
    players.live('signature')[0].end();
    await playing;
    expect(narration.played).toBe(1);
    expect(service.getStatus().intro).toBe(false);

    narration.onCue?.({ type: 'AMBIENCE', soundId: 'VILLAGE_AMBIENCE', action: 'START' });
    const [bed] = players.live('sfx:VILLAGE_AMBIENCE');
    expect(bed.playing).toBe(true);

    await service.pause();
    expect(bed.playing).toBe(false);
    await service.play(); // resume: no signature again
    expect(players.created.filter((h) => (h.source as { uri: string }).uri === 'signature')).toHaveLength(1);
    expect(bed.playing).toBe(true);

    narration.set({ ...narration.status, isPlaying: false, didFinish: true });
    vi.advanceTimersByTime(2000);
    expect(bed.released).toBe(true);
  });

  it('pausing during the signature cancels it without starting the story', async () => {
    const players = new FakePlayers();
    const narration = new FakeNarration();
    const service = new LayeredStoryAudioService(narration, new StorySoundscape({ catalog, players }));
    await service.load(story(7));
    const playing = service.play();
    await service.pause();
    await playing;
    expect(narration.played).toBe(0);
    expect(players.live('signature')).toHaveLength(0);
  });
});

describe('cue timing for Aaji’s voice parts', () => {
  it('rebuilds the backend chunking and only trusts it when the part count matches', async () => {
    const { cuePlan } = await import('../clipAudioService');
    const script = buildAudioScript(
      'पहिला.\n\nदुसरा.',
      { speakers: [], narration: [], cues: [{ afterParagraph: 1, type: 'SFX', soundId: 'BELL' }] },
      { intro: true },
    ).script;
    const total = buildTtsChunks(script, { sentencePauses: true }).length;
    const plan = cuePlan(story(4, script), total);
    expect(plan?.flat().map((c) => c.cue.type)).toEqual(['SFX']);
    expect(plan?.flat()[0].at).toBeGreaterThan(0);
    expect(cuePlan(story(4, script), total + 1)).toBeNull();
  });
});

describe('UI sounds', () => {
  const settingsStore = (initial: AppSettings | null = null) => {
    let saved = initial;
    return { getSettings: async () => saved, saveSettings: async (s: AppSettings) => void (saved = s) };
  };

  it('plays by meaning, softly, one at a time, and ignores rapid repeats', async () => {
    const players = new FakePlayers();
    let now = 0;
    const ui = new DefaultUiSoundService({ catalog, players, settings: settingsStore(), now: () => now });
    expect(await ui.playAsync('CATEGORY_SELECTED')).toBe(true);
    expect(players.created[0].volume).toBeLessThan(0.5);
    expect(await ui.playAsync('CATEGORY_SELECTED')).toBe(false);
    now = 1000;
    expect(await ui.playAsync('FAVOURITE_SAVED')).toBe(true);
    expect(players.created[0].released).toBe(true); // replaced, not stacked
  });

  it('can be switched off by a parent', async () => {
    const players = new FakePlayers();
    const store = settingsStore();
    const ui = new DefaultUiSoundService({ catalog, players, settings: store });
    await ui.setEnabled(false);
    expect(await ui.playAsync('STORY_READY')).toBe(false);
    expect(await store.getSettings()).toEqual({ appSounds: false });
    const fresh = new DefaultUiSoundService({ catalog, players, settings: store });
    expect(await fresh.isEnabled()).toBe(false);
  });
});

describe('story feedback', () => {
  it('stores one optional reaction per story locally', async () => {
    let records: FeedbackRecords = {};
    const fb = new LocalFeedbackService({ getFeedback: async () => ({ ...records }), saveFeedback: async (r) => void (records = r) });
    expect(await fb.getReaction('s1')).toBeNull();
    await fb.setReaction(story(4), 'LOVED');
    await fb.setReaction(story(4), 'LIKED');
    expect(await fb.getReaction('s1')).toBe('LIKED');
    expect(await fb.summary()).toEqual({ LOVED: 0, LIKED: 1, NOT_FOR_ME: 0 });
    expect(records.s1).toMatchObject({ age: 4, category: 'animals', source: 'generated' });
  });
});

describe('parent gate', () => {
  it('asks a multiplication with four distinct choices including the answer', () => {
    for (let i = 0; i < 50; i++) {
      const c = createParentChallenge();
      expect(new Set(c.choices).size).toBe(4);
      expect(c.choices).toContain(c.answer);
      expect(checkParentAnswer(c, c.a * c.b)).toBe(true);
      expect(checkParentAnswer(c, c.choices.find((x) => x !== c.answer)!)).toBe(false);
    }
  });
});
