/**
 * Listen to Aaji with different speech models — runs on YOUR computer with the Vertex AI
 * settings from .env (never in the app). Fixed sample text only.
 *
 *   npm run voice-test
 *   npm run voice-test -- --models gemini-3.8-flash-tts,gemini-2.5-pro-tts --voice Sulafat
 *
 * For each model it makes two samples (the short audition and the first part of a library
 * story), saves them in voice-tests/ (git-ignored) so you can play them, and prints what the
 * listening check heard and whether that part would reach a child.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chunksFor } from '../backend/tts';
import { describeAi, loadLocalEnv } from '../backend/localEnv';
import { GeminiSpeechListener } from '../story-engine/providers/geminiListen';
import { GeminiSpeechSynthesizer } from '../story-engine/providers/geminiTts';
import { googleAccessFromEnv, type GoogleEnv } from '../story-engine/providers/googleAccess';
import { findLibraryStory, libraryAudioScript } from '../story-engine/library';
import { judgeDuration, judgeTranscript, spokenText, wavSeconds } from '../story-engine/speechCheck';
import { AUDITION_CHUNK, type TtsChunk } from '../story-engine/tts';

const DEFAULT_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-tts', 'gemini-2.5-pro-tts'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadLocalEnv('.env');
  const env = process.env as GoogleEnv & { TTS_VOICE?: string; TTS_CHECK_MODEL?: string };
  console.log(`AI: ${describeAi(env)}`);
  const access = googleAccessFromEnv(env);
  if (!access || access.kind !== 'vertex') {
    console.error('Vertex AI is not set up in .env — see docs/VERTEX_SETUP.md');
    process.exitCode = 1;
    return;
  }
  const models = (arg('models') ?? DEFAULT_MODELS.join(',')).split(',').map((m) => m.trim()).filter(Boolean);
  const voice = arg('voice') ?? env.TTS_VOICE ?? 'Aoede';
  const story = findLibraryStory('manu-red-ball');
  const samples: { name: string; chunk: TtsChunk }[] = [{ name: 'audition', chunk: AUDITION_CHUNK }];
  if (story) samples.push({ name: 'story', chunk: chunksFor(libraryAudioScript(story, 6), env, 6)[0] });

  const listener = new GeminiSpeechListener({ access, model: env.TTS_CHECK_MODEL });
  mkdirSync('voice-tests', { recursive: true });
  console.log(`Voice: ${voice}. Samples are saved in voice-tests/ — open that folder to listen.\n`);

  for (const model of models) {
    const tts = new GeminiSpeechSynthesizer({ access, model, fallbackModels: 'none' });
    for (const { name, chunk } of samples) {
      const label = `${model} · ${name}`;
      const t0 = Date.now();
      try {
        const audio = await tts.synthesize(chunk, voice);
        const ms = Date.now() - t0;
        const file = join('voice-tests', `${model}-${voice}-${name}.wav`);
        writeFileSync(file, Buffer.from(audio.base64, 'base64'));
        const seconds = wavSeconds(audio.base64);
        const problems = judgeDuration(chunk, seconds);
        const transcript = await listener.transcribe(audio).catch((e: Error) => `(could not listen: ${e.message})`);
        const verdict = judgeTranscript(spokenText(chunk), transcript);
        problems.push(...verdict.problems);
        console.log(`${problems.length ? '✗' : '✓'} ${label}: ${seconds.toFixed(1)}s audio in ${(ms / 1000).toFixed(1)}s, heard ${verdict.ratio.toFixed(2)}× the text`);
        if (problems.length) console.log(`   would NOT reach a child: ${problems.join('; ')}`);
        console.log(`   heard: ${transcript.slice(0, 220)}${transcript.length > 220 ? '…' : ''}`);
        console.log(`   file:  ${file}`);
      } catch (e) {
        console.log(`✗ ${label}: ${(e as Error).message}`);
      }
    }
  }
}

void main();
