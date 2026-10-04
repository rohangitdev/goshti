import { describe, expect, it, vi } from 'vitest';
import * as expoAudio from 'expo-audio';

import type { GoshtiStory } from '@/types/models';

import type { AudioService, PlaybackStatus } from '../audioService';
import { ClipAudioService } from '../clipAudioService';
import { SmartAudioService } from '../smartAudioService';
import { VoiceService, wavSeconds, type VoiceClient, type VoiceStates } from '../voiceService';

// vi.mock is hoisted above the imports by vitest.

vi.mock('expo-audio', () => {
  class FakePlayer {
    static instances: FakePlayer[] = [];
    source: { uri: string };
    playing = false;
    currentTime = 0;
    listeners: ((s: { didJustFinish: boolean }) => void)[] = [];
    played: string[] = [];
    constructor(source: { uri: string }) {
      this.source = source;
      FakePlayer.instances.push(this);
    }
    addListener(_e: string, l: (s: { didJustFinish: boolean }) => void) {
      this.listeners.push(l);
    }
    play() {
      this.playing = true;
      this.played.push(this.source.uri);
    }
    pause() {
      this.playing = false;
    }
    replace(source: { uri: string }) {
      this.source = source;
    }
    remove() {}
    finish() {
      this.playing = false;
      this.listeners.forEach((l) => l({ didJustFinish: true }));
    }
  }
  return {
    createAudioPlayer: (source: { uri: string }) => new FakePlayer(source),
    setAudioModeAsync: async () => {},
    __FakePlayer: FakePlayer,
  };
});

type Fake = { instances: { played: string[]; finish(): void }[] };
const FakePlayer = (expoAudio as unknown as { __FakePlayer: Fake }).__FakePlayer;

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
// 1 second of 24 kHz mono 16-bit audio, as a WAV in base64
const header = new Uint8Array(44);
const view = new DataView(header.buffer);
'RIFF'.split('').forEach((c, i) => view.setUint8(i, c.charCodeAt(0)));
'WAVE'.split('').forEach((c, i) => view.setUint8(8 + i, c.charCodeAt(0)));
view.setUint32(28, 48000, true);
const wav1s = btoa(String.fromCharCode(...header) + '\0'.repeat(48000));

function setup(client: VoiceClient) {
  let states: VoiceStates = {};
  const saved: string[] = [];
  const voice = new VoiceService({
    client,
    files: {
      save: async (id, i) => {
        saved.push(`${id}/${i}`);
        return `file:///${id}/part-${i}.wav`;
      },
      remove: async () => {},
    },
    store: { getVoiceStates: async () => states, saveVoiceStates: async (s) => void (states = JSON.parse(JSON.stringify(s))) },
    retries: 0,
  });
  return { voice, saved, states: () => states };
}

const story = { id: 's1', durationSeconds: 120 } as GoshtiStory;

describe('wavSeconds', () => {
  it('reads duration from the WAV header', () => {
    expect(wavSeconds(wav1s)).toBeCloseTo(1, 1);
  });
});

describe('VoiceService', () => {
  it('renders parts in order, saves them and becomes ready', async () => {
    const calls: number[] = [];
    const { voice, saved, states } = setup({ renderChunk: async (_t, i) => (calls.push(i), { base64: wav1s, pauseAfterMs: 500 }) });
    const seen: string[] = [];
    voice.subscribe('s1', (s) => seen.push(s.status));
    await voice.start('s1', { token: 't', totalChunks: 3 });
    await tick(30);
    expect(calls).toEqual([0, 1, 2]);
    expect(saved).toEqual(['s1/0', 's1/1', 's1/2']);
    expect(states().s1.status).toBe('ready');
    expect(states().s1.parts[0]).toMatchObject({ uri: 'file:///s1/part-0.wav', pauseAfterMs: 500 });
    expect(seen.at(-1)).toBe('ready');
  });

  it('marks failure and resumes from the missing part on retry', async () => {
    let fail = true;
    const calls: number[] = [];
    const { voice, states } = setup({
      renderChunk: async (_t, i) => {
        calls.push(i);
        if (i === 1 && fail) throw new Error('quota');
        return { base64: wav1s, pauseAfterMs: 0 };
      },
    });
    await voice.start('s1', { token: 't', totalChunks: 3 });
    await tick(30);
    expect(states().s1.status).toBe('failed');
    fail = false;
    await voice.render('s1');
    expect(states().s1.status).toBe('ready');
    expect(calls).toEqual([0, 1, 1, 2]);
  });
});

describe('ClipAudioService', () => {
  it('plays parts in sequence, waiting for parts still rendering', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { voice } = setup({
      renderChunk: async (_t, i) => {
        if (i === 1) await gate;
        return { base64: wav1s, pauseAfterMs: 0 };
      },
    });
    await voice.start('s1', { token: 't', totalChunks: 2 });
    await tick();
    const clip = new ClipAudioService(voice);
    const statuses: PlaybackStatus[] = [];
    clip.subscribe((s) => statuses.push(s));
    await clip.load(story);
    await clip.play();
    const player = FakePlayer.instances.at(-1)!;
    expect(player.played).toEqual(['file:///s1/part-0.wav']);
    player.finish();
    await tick();
    expect(clip.getStatus().waiting).toBe(true); // part 2 not ready yet
    release();
    await tick(30);
    expect(player.played).toEqual(['file:///s1/part-0.wav', 'file:///s1/part-1.wav']);
    player.finish();
    await tick();
    expect(clip.getStatus().didFinish).toBe(true);
  });
});

describe('SmartAudioService', () => {
  function fakeSpeech(): AudioService & { loaded: string[]; plays: number } {
    let status: PlaybackStatus = { storyId: null, isPlaying: false, positionSeconds: 0, durationSeconds: 0, didFinish: false };
    const listeners = new Set<(s: PlaybackStatus) => void>();
    return {
      loaded: [],
      plays: 0,
      async load(s) {
        this.loaded.push(s.id);
        status = { ...status, storyId: s.id };
        listeners.forEach((l) => l(status));
      },
      async play() {
        this.plays += 1;
      },
      async pause() {},
      async unload() {},
      getStatus: () => status,
      subscribe(l) {
        listeners.add(l);
        l(status);
        return () => listeners.delete(l);
      },
    };
  }

  it('uses the phone voice when there is no Aaji voice for the story', async () => {
    const { voice } = setup({ renderChunk: async () => ({ base64: wav1s, pauseAfterMs: 0 }) });
    const speech = fakeSpeech();
    const smart = new SmartAudioService(new ClipAudioService(voice), speech, voice);
    await smart.load(story);
    expect(speech.loaded).toEqual(['s1']);
    expect(smart.getStatus().voice).toBe('phone');
  });

  it('uses Aaji’s voice when available, and falls back to the phone voice if it fails', async () => {
    const { voice } = setup({ renderChunk: async () => { throw new Error('no quota'); } });
    await voice.start('s1', { token: 't', totalChunks: 2 });
    await tick(20);
    // state failed with no parts → phone voice straight away
    const speech = fakeSpeech();
    const smart = new SmartAudioService(new ClipAudioService(voice), speech, voice);
    await smart.load(story);
    expect(smart.getStatus().voice).toBe('phone');

    // a story that is still rendering uses Aaji, then switches when rendering fails
    const ok = setup({ renderChunk: async () => { await tick(5); throw new Error('quota'); } });
    await ok.voice.start('s2', { token: 't', totalChunks: 2 });
    const speech2 = fakeSpeech();
    const smart2 = new SmartAudioService(new ClipAudioService(ok.voice), speech2, ok.voice);
    await smart2.load({ ...story, id: 's2' });
    expect(smart2.getStatus().voice).toBe('aaji');
    await smart2.play();
    await tick(60);
    expect(smart2.getStatus().voice).toBe('phone');
    expect(speech2.plays).toBe(1);
  });
});
