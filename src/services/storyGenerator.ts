/**
 * How the app obtains an approved story. The app NEVER talks to Gemini:
 *   - BackendStoryGenerator → GOSHTI backend (Supabase Edge Function or local dev server)
 *   - LocalMockGenerator    → offline template stories (no backend configured, seeds)
 */
import {
  generateStory,
  MESSAGES,
  MockStoryAIProvider,
  type ApprovedStory,
  type StoryRequest,
} from '@engine/index';

/** Server-issued handle for rendering Aaji's voice for an approved story. */
export interface VoiceTicket {
  token: string;
  totalChunks: number;
}

export type GenerationResult =
  | { status: 'APPROVED'; story: ApprovedStory; voice?: VoiceTicket }
  | { status: 'NOT_A_STORY' | 'UNSAFE'; message: string }
  | { status: 'FAILED'; reason: string };

/** Fixed child-friendly progress text from the backend (never model output). */
export type ProgressListener = (label: string) => void;

export interface StoryGenerator {
  readonly kind: 'backend' | 'mock';
  generate(request: StoryRequest, onProgress?: ProgressListener): Promise<GenerationResult>;
}

export class LocalMockGenerator implements StoryGenerator {
  readonly kind = 'mock' as const;
  private readonly provider = new MockStoryAIProvider();

  async generate(request: StoryRequest): Promise<GenerationResult> {
    const result = await generateStory(request, this.provider, { enforceLength: false });
    switch (result.status) {
      case 'APPROVED':
        return { status: 'APPROVED', story: result.story };
      case 'NOT_A_STORY':
      case 'UNSAFE':
        return { status: result.status, message: result.message };
      case 'INVALID_REQUEST':
        return { status: 'FAILED', reason: result.errors.join('; ') };
      default:
        return { status: 'FAILED', reason: result.reason };
    }
  }
}

/** Minimal shape check so a malformed server answer can never be saved as a story. */
function isApprovedStoryShape(story: unknown): story is ApprovedStory {
  const s = story as Partial<ApprovedStory> | null;
  return (
    !!s &&
    typeof s.title === 'string' &&
    s.title.length > 0 &&
    typeof s.storyText === 'string' &&
    s.storyText.length > 0 &&
    !!s.audioScript &&
    Array.isArray(s.audioScript.segments) &&
    s.audioScript.segments.length > 0
  );
}

export class BackendStoryGenerator implements StoryGenerator {
  readonly kind = 'backend' as const;

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string>,
    private readonly timeoutMs: number,
  ) {}

  /**
   * One story = a few short backend requests. The backend answers IN_PROGRESS with a
   * continuation token until the story is finished (keeps each request under the
   * Edge Function time limit and lets us show real progress).
   */
  async generate(request: StoryRequest, onProgress?: ProgressListener): Promise<GenerationResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let payload: Record<string, unknown> = { request };
    try {
      for (let step = 0; step < 20; step++) {
        const res = await fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.headers },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || typeof body.status !== 'string') {
          return { status: 'FAILED', reason: `backend returned HTTP ${res.status}` };
        }
        if (body.status === 'IN_PROGRESS' && typeof body.continuation === 'string') {
          if (typeof body.progressLabel === 'string') onProgress?.(body.progressLabel);
          payload = { continuation: body.continuation };
          continue;
        }
        if (body.status === 'APPROVED' && isApprovedStoryShape(body.story)) {
          const voice =
            body.ttsAvailable === true && typeof body.audioToken === 'string' && typeof body.audioChunks === 'number'
              ? { token: body.audioToken, totalChunks: body.audioChunks }
              : undefined;
          return { status: 'APPROVED', story: body.story as ApprovedStory, voice };
        }
        if (body.status === 'NOT_A_STORY' || body.status === 'UNSAFE') {
          // Always the app's own fixed wording — never text from the server or a model.
          return { status: body.status, message: MESSAGES[body.status] };
        }
        const reason = typeof body.reason === 'string' ? body.reason : `backend status ${body.status}`;
        return { status: 'FAILED', reason };
      }
      return { status: 'FAILED', reason: 'too many steps' };
    } catch (e) {
      return { status: 'FAILED', reason: (e as Error).name === 'AbortError' ? 'timed out' : (e as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }
}
