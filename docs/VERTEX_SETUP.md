# Moving GOSHTI to Vertex AI (Google Cloud)

**Why:** the Gemini API (AI Studio) terms say it must not be used in a service "directed towards or
likely to be accessed by" people under 18. GOSHTI is for 2–9 year olds. Vertex AI offers the same
Gemini models under Google Cloud's terms, and your data isn't used for training.

**The code is ready.** The backend uses Vertex AI whenever `GOOGLE_CLOUD_PROJECT` is set. The app
itself doesn't change.

> Before launch, ask Google Cloud (sales or support) **in writing** to confirm that a children's
> storytelling app may use Gemini and Gemini text-to-speech on Vertex AI. Keep the reply.

---

## 1. Google Cloud project and billing (once)

1. Go to **console.cloud.google.com** and create a project, e.g. `goshti-prod`. Note its **Project ID**.
2. Under **Billing**, link a billing account to the project.
3. Set a budget alert (Billing → Budgets & alerts). Unlike AI Studio, Vertex AI has no automatic
   spend cap, so the alert matters.
4. Enable the API: **APIs & Services → Library → "Vertex AI API" → Enable**.

## 2. A service account for the backend (once)

1. **IAM & Admin → Service Accounts → Create service account**, name it `goshti-backend`.
2. Give it the role **Vertex AI User**. That is all it needs.
3. Open it, go to the **Keys** tab, choose **Add key → Create new key → JSON**. A `.json` file downloads.
4. Move it **outside the project folder**:
   ```
   mkdir -p ~/.config/goshti && mv ~/Downloads/goshti-prod-*.json ~/.config/goshti/vertex-key.json
   ```
   Never commit it, never put it in the app, never paste it into chat.

## 3. Local `.env` (for `npm run retell`, `npm run backend`)

```
GOOGLE_CLOUD_PROJECT=goshti-prod
GOOGLE_CLOUD_LOCATION=global
GOOGLE_APPLICATION_CREDENTIALS=/Users/YOUR-NAME/.config/goshti/vertex-key.json
STORY_STATE_SECRET=   ← paste the output of: openssl rand -hex 32
TTS_FALLBACK_MODEL=
```

You can delete `GEMINI_API_KEY`. It's ignored once `GOOGLE_CLOUD_PROJECT` is set.

Check it:
```
npm run retell -- --id birbal-resha --age 6
```
The first line must say **`AI: Vertex AI (goshti-prod, global)`**.

## 4. Supabase (the app's backend)

```
npx supabase secrets set --project-ref okcoskjdspwqnvcilbsf \
  GOOGLE_CLOUD_PROJECT=goshti-prod \
  GOOGLE_CLOUD_LOCATION=global \
  GOOGLE_SERVICE_ACCOUNT_JSON="$(base64 -i ~/.config/goshti/vertex-key.json)" \
  STORY_STATE_SECRET="$(openssl rand -hex 32)" \
  TTS_FALLBACK_MODEL=
npx supabase secrets unset GEMINI_API_KEY --project-ref okcoskjdspwqnvcilbsf
npm run deploy:function
```

The key goes in as one line of base64; the backend decodes it. Changing `STORY_STATE_SECRET`
only cancels stories that were mid-generation at that moment.

## 5. Check

- `npm run qa -- --suite edge --limit 3`: stories should come back APPROVED.
- **Listen to Aaji:** `npm run voice-test`. It makes Aaji's voice with each speech model, saves the
  samples in `voice-tests/` (open that folder and play them) and prints what the listening check
  heard. Pick the one you like and set `TTS_MODEL` (and the same Supabase secret).

## How Aaji's voice is kept clean

- **Gemini 3.8 speech models read the text field word for word.** So the story text goes in alone,
  and each line's direction (Aaji's warmth, a character's voice) goes in that part's
  `speechMetadata.style`. Directions are never put in the text of a 3.8 model — if Google rejects
  `speechMetadata`, the next model is tried instead.
- Older speech models (2.5) use Google's documented `"{short prompt}: {text}"` form with the
  Marathi language code (`mr-IN`) and `[short pause]` tags.
- **Listening check.** Every part is listened to by `gemini-3.5-flash-lite` before it is sent to the
  phone: English directions, spoken tags, extra or missing speech, or audio that stops early → the
  part is made again; if it fails again the request fails. The app then plays one of Aaji's
  ready-made stories instead (if the story had already started, the phone voice finishes it).
  The Supabase logs show one `[speech-check]` line per part, with numbers only.

## How it works (for reference)

- `story-engine/providers/googleAccess.ts`: Vertex URLs, and a service-account sign-in (a signed
  token, refreshed hourly) that runs in Node and in the Supabase Edge Function.
- Story writing and Aaji's voice both go through it. If a model name isn't offered on Vertex, the
  next one in the list is tried.
- If Vertex is half-configured (project set, no key), stories **fail clearly**. They never quietly
  fall back to template stories.
- `VERTEX_API_KEY` works instead of a service account, if Google Cloud gives you an API key that
  is allowed to call Vertex AI.
