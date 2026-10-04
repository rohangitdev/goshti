// GOSHTI story generation — Supabase Edge Function (Deno).
//
// The story engine is bundled into ./_bundle/handler.mjs by `npm run build:function`
// (same code as the local dev server). Deploy with: npm run deploy:function
//
// Secrets (set with `npx supabase secrets set ...`, never in the app):
//   GEMINI_API_KEY   required for real stories (mock stories without it)
//   GEMINI_MODEL     optional, default gemini-3.8-flash
//   GEMINI_WRITER_MODEL / GEMINI_CRITIC_MODEL   optional per-role overrides
//   STORY_DEBUG=false   stop returning the developer trace
//   STORY_LOG=off|summary|full
import { CORS_HEADERS, handleGenerateStory } from './_bundle/handler.mjs';

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_WRITER_MODEL',
  'GEMINI_CRITIC_MODEL',
  'STORY_DEBUG',
  'STORY_LOG',
  'STORY_TIME_BUDGET_MS',
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
