/**
 * Aaji's real voice for approved stories.
 *
 * The backend returns a sealed voice ticket with every approved story. This service renders
 * the story's audio PART BY PART (in order) in the background, saves each part on the phone,
 * and notifies listeners — so the player can start with part 1 while later parts are still
 * being made. State is persisted, so saved stories replay offline and interrupted renders
 * resume. If rendering fails, the player falls back to the phone's built-in voice.
 */
import type { VoiceTicket } from './storyGenerator';

export interface VoicePart {
  uri: string;
  seconds: number;
  pauseAfterMs: number;
}

export interface VoiceState {
  token: string;
  totalChunks: number;
  parts: (VoicePart | null)[];
  status: 'rendering' | 'ready' | 'failed';
  error?: string;
}

export type VoiceStates = Record<string, VoiceState>;

/** Talks to the backend's tts-render action. */
export interface VoiceClient {
  renderChunk(token: string, chunk: number): Promise<{ base64: string; pauseAfterMs: number }>;
  /** Voice ticket for a built-in library story (null if the backend has no voice). */
  libraryTicket?(libraryId: string, age: number): Promise<VoiceTicket | null>;
}

/** Where audio parts live on the device. */
export interface VoiceFileStore {
  save(storyId: string, index: number, base64: string): Promise<string>;
  remove(storyId: string): Promise<void>;
}

export interface VoiceStateStore {
  getVoiceStates(): Promise<VoiceStates>;
  saveVoiceStates(states: VoiceStates): Promise<void>;
}

/** Seconds of audio in a base64 WAV (reads the header; falls back to 24 kHz mono 16-bit). */
export function wavSeconds(base64: string): number {
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  let byteRate = 48000;
  try {
    const head = atob(base64.slice(0, 64));
    if (head.startsWith('RIFF')) {
      const b = (i: number) => head.charCodeAt(i);
      const rate = b(28) | (b(29) << 8) | (b(30) << 16) | (b(31) << 24);
      if (rate > 0) byteRate = rate;
    }
  } catch {
    // keep default
  }
  return Math.max(0, (bytes - 44) / byteRate);
}

type Listener = (state: VoiceState) => void;

export class VoiceService {
  private states: VoiceStates | null = null;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly running = new Set<string>();

  constructor(
    private readonly deps: { client: VoiceClient; files: VoiceFileStore; store: VoiceStateStore; retries?: number },
  ) {}

  private async all(): Promise<VoiceStates> {
    this.states ??= await this.deps.store.getVoiceStates();
    return this.states;
  }

  private async put(storyId: string, state: VoiceState) {
    const all = await this.all();
    all[storyId] = state;
    await this.deps.store.saveVoiceStates(all);
    this.listeners.get(storyId)?.forEach((l) => l(state));
  }

  async get(storyId: string): Promise<VoiceState | null> {
    return (await this.all())[storyId] ?? null;
  }

  subscribe(storyId: string, listener: Listener): () => void {
    const set = this.listeners.get(storyId) ?? new Set();
    set.add(listener);
    this.listeners.set(storyId, set);
    return () => set.delete(listener);
  }

  /** Remember a ticket for a story and start rendering (idempotent). */
  async start(storyId: string, ticket: VoiceTicket): Promise<void> {
    const existing = await this.get(storyId);
    if (!existing) {
      await this.put(storyId, {
        token: ticket.token,
        totalChunks: ticket.totalChunks,
        parts: Array.from({ length: ticket.totalChunks }, () => null),
        status: 'rendering',
      });
    }
    void this.render(storyId);
  }

  /** Renders missing parts in order. Safe to call repeatedly; resumes after interruptions. */
  async render(storyId: string): Promise<void> {
    if (this.running.has(storyId)) return;
    this.running.add(storyId);
    try {
      const state = await this.get(storyId);
      if (!state || state.status === 'ready') return;
      for (let i = 0; i < state.totalChunks; i++) {
        if (state.parts[i]) continue;
        let lastError: unknown;
        for (let attempt = 0; attempt <= (this.deps.retries ?? 1); attempt++) {
          try {
            const { base64, pauseAfterMs } = await this.deps.client.renderChunk(state.token, i);
            const uri = await this.deps.files.save(storyId, i, base64);
            state.parts[i] = { uri, seconds: wavSeconds(base64), pauseAfterMs };
            lastError = undefined;
            break;
          } catch (e) {
            lastError = e;
          }
        }
        if (lastError) {
          await this.put(storyId, { ...state, status: 'failed', error: String((lastError as Error).message ?? lastError) });
          return;
        }
        await this.put(storyId, { ...state, status: i === state.totalChunks - 1 ? 'ready' : 'rendering' });
      }
    } finally {
      this.running.delete(storyId);
    }
  }
}

/** Backend client: same endpoint and headers as story generation. */
export class BackendVoiceClient implements VoiceClient {
  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string>,
    private readonly timeoutMs = 120_000,
  ) {}

  async libraryTicket(libraryId: string, age: number): Promise<VoiceTicket | null> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers },
      body: JSON.stringify({ action: 'library-voice', id: libraryId, age }),
    });
    const body = (await res.json().catch(() => null)) as { audioToken?: string; audioChunks?: number; ttsAvailable?: boolean } | null;
    if (!res.ok || !body?.ttsAvailable || !body.audioToken || !body.audioChunks) return null;
    return { token: body.audioToken, totalChunks: body.audioChunks };
  }

  async renderChunk(token: string, chunk: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body: JSON.stringify({ action: 'tts-render', audioToken: token, chunk }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as { base64?: string; pauseAfterMs?: number; reason?: string } | null;
      if (!res.ok || !body?.base64) throw new Error(body?.reason ?? `voice render failed (HTTP ${res.status})`);
      return { base64: body.base64, pauseAfterMs: Number(body.pauseAfterMs) || 0 };
    } finally {
      clearTimeout(timer);
    }
  }
}
