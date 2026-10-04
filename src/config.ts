/**
 * Public app configuration (inlined by Expo from EXPO_PUBLIC_* variables in .env).
 * Only PUBLIC values live here — the Gemini key is never available to the app.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const explicitStoryApi = process.env.EXPO_PUBLIC_STORY_API_URL?.trim() || '';

export type StoryBackendConfig =
  | { kind: 'mock' }
  | { kind: 'http'; url: string; headers: Record<string, string> };

function resolveStoryBackend(): StoryBackendConfig {
  if (explicitStoryApi === 'mock') return { kind: 'mock' };
  if (explicitStoryApi) {
    const isSupabase = supabaseUrl && explicitStoryApi.startsWith(supabaseUrl);
    return {
      kind: 'http',
      url: explicitStoryApi,
      headers: isSupabase && supabaseAnonKey ? { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` } : {},
    };
  }
  if (supabaseUrl && supabaseAnonKey) {
    return {
      kind: 'http',
      url: `${supabaseUrl}/functions/v1/generate-story`,
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    };
  }
  return { kind: 'mock' };
}

export const config = {
  storyBackend: resolveStoryBackend(),
  /** Whole story across all backend steps (real Gemini stories can take a few minutes). */
  storyRequestTimeoutMs: 400_000,
  /**
   * Prepare the next random story in the background so it plays instantly.
   * Costs extra AI calls (on Gemini's free tier the daily quota is small) —
   * set EXPO_PUBLIC_PREFETCH_STORIES=false to turn off.
   */
  prefetchRandomStories: process.env.EXPO_PUBLIC_PREFETCH_STORIES !== 'false',
};
