// GOSHTI story generation — Supabase Edge Function (Deno).
//
// The story engine is bundled into ./_bundle/handler.mjs by `npm run build:function`
// (same code as the local dev server). Deploy with: npm run deploy:function
//
// Secrets (set with `npx supabase secrets set ...`, never in the app):
//   GEMINI_API_KEY   required for real stories (mock stories without it)
//   GEMINI_MODEL     optional, default gemini-3.5-flash
//   GEMINI_WRITER_MODEL / GEMINI_CRITIC_MODEL   optional per-role overrides
//   GEMINI_FAST_MODEL  classifier + audio direction (default gemini-3.5-flash-lite)
//   GEMINI_FALLBACK_MODEL   used when the main model is overloaded (default gemini-3.5-flash-lite, "none" = off)
//   GEMINI_THINKING  minimal|low|medium|high|auto for all stages (default: per stage)
//   STORY_DEBUG=false   stop returning the developer trace
//   STORY_LOG=off|summary|full
//
// One story = several short requests (each well inside Supabase's 150 s limit):
// the response is 202 IN_PROGRESS with a `continuation` token until the story is done.
import { CORS_HEADERS, handleGenerateStory } from './_bundle/handler.mjs';

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_WRITER_MODEL',
  'GEMINI_CRITIC_MODEL',
  'GEMINI_FAST_MODEL',
  'GEMINI_FALLBACK_MODEL',
  'GEMINI_THINKING',
  'STORY_DEBUG',
  'STORY_LOG',
  'STORY_TIME_BUDGET_MS',
  'STORY_REQUEST_DEADLINE_MS',
  'STORY_SLICE_MS',
  'STORY_STATE_SECRET',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const env = Object.fromEntries(ENV_KEYS.map((k) => [k, Deno.env.get(k) ?? undefined]));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const result = await handleGenerateStory(body, env);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: 'FAILED', reason: (e as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
