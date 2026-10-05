# GOSHTI — test builds for other families

Builds are made by **EAS** (Expo's cloud build service) under your Expo account. Testers install a
real app — no Expo Go, no laptop needed.

## Before the first build (once)

1. **Backend**
   - Gemini billing on, with a budget alert in Google Cloud (testers will use far more than the free tier).
   - `npm run deploy:function`
   - Keep developer traces private — pick any random value, put it in `.env` as `STORY_DEBUG_TOKEN=…`
     and set the same in Supabase:
     `npx supabase secrets set STORY_DEBUG_TOKEN=<same value> --project-ref okcoskjdspwqnvcilbsf`
     (the QA runner sends it; the app never does, so testers never receive traces).
2. **Expo / EAS**
   - `npx eas-cli login` (your Expo account), then `npx eas-cli init` once (links the project).
   - `npm run eas:env` — copies the public Supabase URL/key from `.env` to EAS. Gemini keys are never sent.
3. **App id** is `com.rohanshukla.goshti` (in `app.json`). Change it now if you want a different one —
   it cannot change after the first store upload.

## Android test build (no store account needed)

```
npm run build:android-test
```
When it finishes, EAS gives a link/QR to an `.apk`. Send that link to testers; on their phone they
open it and allow "install from this source". Test builds start everyone on the PLUS allowance
(30 new stories a month) so testers don't hit the FREE limit.

## iPhone

Needs an Apple Developer account (US$99/year). Then:
```
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios
```
and invite testers in App Store Connect → TestFlight. (Note: the production profile uses the FREE
allowance; for a TestFlight round ask and we'll switch it.)

## What's different from Expo Go

- Stories keep playing when the screen locks or the app goes to the background
  (iPhone: background audio; Android: a "गोष्टी" playback notification with play/pause).
- The app asks for **no microphone permission** (the mic button is a placeholder).
- The developer test buttons in Parent mode are hidden.

## Before inviting families

- Run the live QA first: `npm run qa -- --suite redteam`, then `--suite age` — read `qa-results/*/report.md`.
- Tell parents (one line is enough): the child's first name and story idea are sent to Google's AI
  to write the story; nothing else leaves the phone.
- Hand out `docs/qa/CHILD_OBSERVATION_SHEET.md`.
