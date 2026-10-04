/**
 * How the app obtains an approved story. The app NEVER talks to Gemini:
 *   - BackendStoryGenerator → GOSHTI backend (Supabase Edge Function or local dev server)
 *   - LocalMockGenerator    → offline template stories (no backend configured, seeds)
 */
import {
  generateStory,
  MockStoryAIProvider,
  type ApprovedStory,
  type StoryRequest,
} from '@engine/index';

export type GenerationResult =
  | { status: 'APPROVED'; story: ApprovedStory }
  | { status: 'NOT_A_STORY' | 'UNSAFE'; message: string }
  | { status: 'FAILED'; reason: string };

export interface StoryGenerator {
  readonly kind: 'backend' | 'mock';
  generate(request: StoryRequest): Promise<GenerationResult>;
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

export class BackendStoryGenerator implements StoryGenerator {
  readonly kind = 'backend' as const;

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string>,
    private readonly timeoutMs: number,
  ) {}

  async generate(request: StoryRequest): Promise<GenerationResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body: JSON.stringify({ request }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body.status !== 'string') {
        return { status: 'FAILED', reason: `backend returned HTTP ${res.status}` };
      }
      if (body.status === 'APPROVED' && body.story && typeof body.story === 'object') {
        return { status: 'APPROVED', story: body.story as ApprovedStory };
      }
      if ((body.status === 'NOT_A_STORY' || body.status === 'UNSAFE') && typeof body.message === 'string') {
        return { status: body.status, message: body.message };
      }
      const reason = typeof body.reason === 'string' ? body.reason : `backend status ${body.status}`;
      return { status: 'FAILED', reason };
    } catch (e) {
      return { status: 'FAILED', reason: (e as Error).name === 'AbortError' ? 'timed out' : (e as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }
}
