# गोष्टी — GOSHTI (POC)

Marathi audio stories for children aged 2–9, told by Aaji. **Not a chatbot**: the child's idea is a seed for one story, nothing more.

## Run

```bash
npm install
npm run backend           # local story backend + developer tester → http://localhost:8787
npx expo start            # the app
npm test                  # unit tests (vitest)
npm run typecheck         # app + backend
npm run lint
npm run deploy:function   # build + deploy the Supabase Edge Function
```

## Architecture

```
SCREEN → hook → StoryService → StoryGenerator ──HTTP──▶ GOSHTI backend ──▶ Story engine ──▶ StoryAIProvider ──▶ Gemini
                                     │                 (Supabase Edge Function            (Gemini or Mock)
                                     │                  or local dev server — same code)
                                     └─ LocalMockGenerator (no backend configured / seed stories)
```

The app never calls Gemini. `GEMINI_API_KEY` exists only in Supabase secrets / the local `.env` read by the backend.

### Story engine pipeline (`story-engine/pipeline.ts`)

StoryRequest → IntentClassifier (CUSTOM only) → SafetyGate → DevelopmentProfileResolver → StoryPlanner →
StoryGenerator → StoryCritic → (TargetedRewrite → Critic, up to 3 versions) → ApprovedStory → AudioScriptGenerator.
A story that never passes the critic is not returned.

```
story-engine/
  prompts/            ← EDIT THESE to tune the Story Bible (one file per AI role)
  profiles.ts         ← age profiles 2–3 / 4–5 / 6–7 / 8–9 (durations, word budgets, guidance)
  evaluation.ts       ← critic pass thresholds + local checks
  variety.ts          ← RANDOM ingredient matrix
  sfx.ts              ← approved SFX + music moods
  schemas.ts          ← zod schemas (validation + JSON schema sent to the model)
  pipeline.ts         ← orchestration, rewrite loop, trace
  providers/gemini.ts ← Gemini REST provider (backend only)
  providers/mock.ts   ← offline template provider
backend/
  handler.ts          ← shared HTTP handler (Node + Deno)
  dev-server.ts       ← local backend + tester page
  tester.html         ← Story Engine developer tester
supabase/functions/generate-story/  ← Edge Function (imports the esbuild bundle in _bundle/)
src/                  ← Expo app (screens, hooks, services)
```

## Configuration

See `.env.example`. Backend: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.5-flash`), `GEMINI_FALLBACK_MODEL` (comma list),
`GEMINI_THINKING`,
optional `GEMINI_WRITER_MODEL`, `GEMINI_CRITIC_MODEL`, `STORY_LOG`, `STORY_DEBUG`.
App (public): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, optional `EXPO_PUBLIC_STORY_API_URL`.
