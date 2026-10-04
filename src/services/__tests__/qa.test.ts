/**
 * QA pass (app side): replay never re-generates, Free/Plus allowance, TTS failure handling,
 * backend error handling. Provider calls are counted explicitly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateStory, MESSAGES, MockStoryAIProvider, type ApprovedStory, type StoryRequest } from '@engine/index';
import type { ChildProfile, GoshtiStory, Subscription } from '@/types/models';

import type { StorageService } from '../storageService';
import { BackendStoryGenerator, type GenerationResult, type StoryGenerator } from '../storyGenerator';
import { DefaultStoryService, StoryLimitReachedError } from '../storyService';
import { LocalSubscriptionService } from '../subscriptionService';
import { MockTtsService } from '../ttsService';
import { checkPlayableWav, VoiceService, type VoiceClient, type VoiceStates } from '../voiceService';

vi.mock('expo-audio', () => ({ createAudioPlayer: vi.fn(), setAudioModeAsync: vi.fn(async () => {}) }));

function memoryStorage(initialSub: Subscription | null = null, month: string | null = null): StorageService {
  let profile: ChildProfile | null = { id: 'c', name: 'आर्या', age: 5 };
  let stories: GoshtiStory[] = [];
  let favs: string[] = [];
  let sub = initialSub;
  let usageMonth = month;
  let pool = {};
  let voice = {};
  let settings = null;
  let feedback = {};
  return {
    getChildProfile: async () => profile,
    saveChildProfile: async (p) => void (profile = p),
    getStories: async () => stories,
    saveStory: async (s) => void (stories = [s, ...stories.filter((x) => x.id !== s.id)]),
    saveStories: async (s) => void (stories = s),
    getFavouriteIds: async () => favs,
    saveFavouriteIds: async (f) => void (favs = f),
    getSubscription: async () => sub,
    saveSubscription: async (s) => void (sub = s),
    getUsageMonth: async () => usageMonth,
    saveUsageMonth: async (m) => void (usageMonth = m),
    getPreparedStories: async () => pool,
    savePreparedStories: async (p) => void (pool = p),
    getVoiceStates: async () => voice,
    saveVoiceStates: async (v) => void (voice = v),
    getSettings: async () => settings,
    saveSettings: async (s) => void (settings = s as never),
    getFeedback: async () => feedback,
    saveFeedback: async (f) => void (feedback = f),
  };
}

class CountingGenerator implements StoryGenerator {
  readonly kind = 'backend' as const;
  calls = 0;
  fail = false;
  async generate(request: StoryRequest): Promise<GenerationResult> {
    this.calls += 1;
    if (this.fail) return { status: 'FAILED', reason: 'HTTP_ERROR: 500' };
    const r = await generateStory(request, new MockStoryAIProvider(), { enforceLength: false });
    if (r.status !== 'APPROVED') return { status: 'FAILED', reason: r.status };
    return { status: 'APPROVED', story: { ...r.story, title: `${r.story.title} ${this.calls}` } as ApprovedStory };
  }
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function setup(sub: Subscription | null = null, month: string | null = thisMonth()) {
  const storage = memoryStorage(sub, month);
  const generator = new CountingGenerator();
  const subscription = new LocalSubscriptionService(storage);
  const service = new DefaultStoryService({
    generator,
    seedGenerator: generator,
    tts: new MockTtsService(),
    storage,
    subscription,
    minimumLatencyMs: 0,
  });
  return { storage, generator, subscription, service };
}

const random = { age: 5, category: 'animals', mode: 'RANDOM' } as const;

// ---------------------------------------------------------------------------

describe('cache / replay', () => {
  it('replaying a story never calls the story generator again', async () => {
    const { service, generator } = setup();
    const r = await service.createStory(random);
    expect(r.status).toBe('CREATED');
    if (r.status !== 'CREATED') return;
    expect(generator.calls).toBe(1);
    for (let i = 0; i < 3; i++) expect((await service.getStory(r.story.id))?.title).toBe(r.story.title);
    expect(generator.calls).toBe(1);
  });

  it('Aaji’s voice is rendered once; replay and app restart reuse the saved parts (no TTS calls)', async () => {
    let states: VoiceStates = {};
    const store = { getVoiceStates: async () => states, saveVoiceStates: async (s: VoiceStates) => void (states = JSON.parse(JSON.stringify(s))) };
    const files = { save: async (id: string, i: number) => `file:///${id}/${i}.wav`, remove: async () => {} };
    let ttsCalls = 0;
    const client: VoiceClient = { renderChunk: async () => (ttsCalls++, { base64: wav(1), pauseAfterMs: 0 }) };

    const first = new VoiceService({ client, files, store, retries: 0 });
    await first.start('s1', { token: 't', totalChunks: 3 });
    await settle();
    expect(ttsCalls).toBe(3);
    expect((await first.get('s1'))?.status).toBe('ready');

    await first.render('s1'); // replay
    const restarted = new VoiceService({ client, files, store, retries: 0 }); // app restart
    await restarted.start('s1', { token: 't', totalChunks: 3 });
    await settle();
    expect(ttsCalls).toBe(3);
  });
});

describe('Free / Plus allowance', () => {
  it('FREE: 5 new stories, then a calm limit (no generator call)', async () => {
    const { service, generator, subscription } = setup();
    for (let i = 0; i < 5; i++) expect((await service.createStory(random)).status).toBe('CREATED');
    expect((await subscription.getSubscription()).storiesGeneratedThisMonth).toBe(5);
    await expect(service.createStory(random)).rejects.toBeInstanceOf(StoryLimitReachedError);
    expect(generator.calls).toBe(5);
  });

  it('at the limit the child can still replay saved stories and hear library stories', async () => {
    const { service } = setup({ plan: 'FREE', monthlyLimit: 5, storiesGeneratedThisMonth: 5 });
    const lib = await service.playFromLibrary({ age: 5, category: 'animals' });
    expect(await service.getStory(lib.id)).not.toBeNull();
    expect((await service.listStories()).length).toBeGreaterThan(0);
  });

  it('replays and failed generations do not use the allowance', async () => {
    const { service, generator, subscription } = setup();
    const r = await service.createStory(random);
    if (r.status === 'CREATED') await service.getStory(r.story.id);
    generator.fail = true;
    await expect(service.createStory({ age: 5, category: 'magic', mode: 'CUSTOM', userIdea: 'एक मांजर क्रिकेट खेळतं' })).rejects.toThrow();
    expect((await subscription.getSubscription()).storiesGeneratedThisMonth).toBe(1);
  });

  it('PLUS: 30 a month; downgrade to FREE applies the FREE limit to what is already used', async () => {
    const plus = setup({ plan: 'PLUS', monthlyLimit: 30, storiesGeneratedThisMonth: 29 });
    expect((await plus.subscription.getSubscription()).monthlyLimit).toBe(30);
    expect(await plus.subscription.canGenerateStory()).toBe(true);
    await plus.subscription.recordStoryGenerated();
    expect(await plus.subscription.canGenerateStory()).toBe(false);

    const down = setup({ plan: 'FREE', monthlyLimit: 30, storiesGeneratedThisMonth: 12 });
    const s = await down.subscription.getSubscription();
    expect(s.monthlyLimit).toBe(5);
    expect(await down.subscription.canGenerateStory()).toBe(false);
  });

  it('a new month resets the counter', async () => {
    const { subscription } = setup({ plan: 'FREE', monthlyLimit: 5, storiesGeneratedThisMonth: 5 }, '2020-01');
    expect((await subscription.getSubscription()).storiesGeneratedThisMonth).toBe(0);
  });

  it('purchases are not possible yet', async () => {
    const { subscription } = setup();
    await expect(subscription.purchase('PLUS', 'month')).rejects.toThrow();
  });
});

describe('TTS failures', () => {
  const setupVoice = (renderChunk: VoiceClient['renderChunk']) => {
    let states: VoiceStates = {};
    const saved: string[] = [];
    const voice = new VoiceService({
      client: { renderChunk },
      files: { save: async (id, i) => (saved.push(`${id}/${i}`), `file:///${id}/${i}.wav`), remove: async () => {} },
      store: { getVoiceStates: async () => states, saveVoiceStates: async (s) => void (states = JSON.parse(JSON.stringify(s))) },
      retries: 1,
    });
    return { voice, saved };
  };

  it.each([
    ['empty audio', ''],
    ['corrupted audio', btoa('this is not audio at all, just text pretending')],
    ['header-only WAV', wav(0)],
  ])('%s is never saved as a playable part; the story falls back to the phone voice', async (_n, base64) => {
    const { voice, saved } = setupVoice(async () => ({ base64, pauseAfterMs: 0 }));
    await voice.start('s', { token: 't', totalChunks: 2 });
    await settle();
    const state = await voice.get('s');
    expect(state?.status).toBe('failed');
    expect(saved).toEqual([]);
    expect(() => checkPlayableWav(base64)).toThrow();
  });

  it('timeout / provider failure → failed (not hanging), and retry resumes only the missing parts', async () => {
    let calls = 0;
    let broken = true;
    const { voice } = setupVoice(async (_t, i) => {
      calls += 1;
      if (i === 1 && broken) throw new Error('voice render failed (timed out)');
      return { base64: wav(1), pauseAfterMs: 0 };
    });
    await voice.start('s', { token: 't', totalChunks: 3 });
    await settle();
    const failed = await voice.get('s');
    expect(failed?.status).toBe('failed');
    expect(failed?.parts.map(Boolean)).toEqual([true, false, false]); // partially completed, not "ready"
    broken = false;
    calls = 0;
    await voice.render('s');
    expect(calls).toBe(2); // parts 1 and 2 only
    expect((await voice.get('s'))?.status).toBe('ready');
  });
});

describe('backend errors reach the child only as friendly states', () => {
  afterEach(() => vi.unstubAllGlobals());

  const gen = () => new BackendStoryGenerator('https://example.test/fn', {}, 5_000);
  const reply = (status: number, body: unknown, raw = false) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(raw ? String(body) : JSON.stringify(body), { status })));

  it.each([
    ['HTTP 500 with HTML', () => reply(500, '<html>Internal Server Error</html>', true)],
    ['HTTP 429 JSON', () => reply(429, { status: 'FAILED', reason: 'RATE_LIMITED: quota' })],
    ['network error', () => vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Network request failed'))))],
    ['APPROVED with a malformed story', () => reply(200, { status: 'APPROVED', story: { title: '' } })],
  ])('%s → FAILED (the screen shows a fixed Marathi message + library option)', async (_n, arrange) => {
    arrange();
    const r = await gen().generate({ age: 5, category: 'animals', mode: 'RANDOM' });
    expect(r.status).toBe('FAILED');
  });

  it('declines always use the app’s own fixed wording, never server text', async () => {
    reply(200, { status: 'NOT_A_STORY', message: 'Here is the weather in Melbourne: 21°C' });
    const r = await gen().generate({ age: 5, category: 'animals', mode: 'CUSTOM', userIdea: 'weather?' });
    expect(r).toEqual({ status: 'NOT_A_STORY', message: MESSAGES.NOT_A_STORY });
  });

  it('a request that never answers is aborted by the timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
      ),
    );
    const r = await new BackendStoryGenerator('https://example.test/fn', {}, 50).generate({ age: 5, category: 'animals', mode: 'RANDOM' });
    expect(r).toEqual({ status: 'FAILED', reason: 'timed out' });
  });
});

const settle = () => new Promise((r) => setTimeout(r, 30));

// A WAV of `seconds` of silence (24 kHz mono 16-bit), base64.
function wav(seconds: number): string {
  const header = new Uint8Array(44);
  const v = new DataView(header.buffer);
  'RIFF'.split('').forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
  'WAVE'.split('').forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
  v.setUint32(28, 48000, true);
  return btoa(String.fromCharCode(...header) + '\0'.repeat(Math.round(48000 * seconds)));
}
