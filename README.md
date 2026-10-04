# गोष्टी — GOSHTI (POC)

Marathi audio stories for children aged 4–9, told by Aaji. **Not a chatbot**: the child's idea is a seed for one story, nothing more.

## Run

```bash
npm install
npx expo start          # press i / a / w, or scan the QR code with Expo Go
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint
```

## Layout

```
src/app/                 Expo Router screens (UI only)
  index.tsx              1. Welcome
  setup.tsx              2. Child setup (also "edit" from Parent mode)
  home.tsx               3. Home: categories → आजीने निवडावी / माझ्या कल्पनेची
  idea.tsx               4. Story idea (text + non-functional mic)
  generating.tsx         5. Generating (+ calm limit/error states, no upsell)
  story/[id].tsx         6. Player: audio-first, story text not shown
  stories.tsx            7. My Stories
  parent.tsx             8. Parent / Upgrade (long-press "पालक" on Home)
src/components/          Reusable UI (Screen, BigButton, AajiIllustration placeholder, …)
src/hooks/               Bridge between screens and services
src/services/            storyService, ttsService, audioService, storageService,
                         subscriptionService, childProfileService
  index.ts               Composition root: the ONLY place implementations are chosen
src/types/models.ts      GoshtiStory, ChildProfile, Subscription
src/theme/               Colours, spacing, type scale, touch sizes
story-engine/            Framework-free story pipeline
  types.ts               StoryRequest, StoryPlan, GeneratedStory, AudioScript, StoryEvaluation
  sfx.ts                 Predefined SFX + ambience IDs (only these are allowed)
  engine.ts              StoryEngine interface + runStoryPipeline (plan → write → evaluate, retry)
  validation.ts          Idea sanitising, audio-script validation, duration estimate
  mock/                  MockStoryEngine + one hand-written template per category
```

## Data flow

Screen → hook → `storyService` → `story-engine` (plan → write → evaluate) → `ttsService` → `storageService`.
Screens never import the engine's generation code, a model SDK or TTS.

## Where real integrations plug in (later)

| Concern       | Today                         | Swap in `src/services/index.ts` for            |
|---------------|-------------------------------|------------------------------------------------|
| Story writing | `MockStoryEngine`             | Server-side Gemini engine (same interface)     |
| Voice         | `MockTtsService` (no audio)   | Server-side TTS rendering the AudioScript      |
| Playback      | `MockAudioService` (timer)    | expo-audio playing `audioUrl`                  |
| Storage       | `AsyncStorageService`         | Supabase                                       |
| Plans         | `LocalSubscriptionService`    | RevenueCat (`purchase()` currently throws)     |
