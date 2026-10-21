#!/usr/bin/env node
/**
 * Voice test against the LIVE story backend (used by the "Voice test" GitHub workflow, so it
 * runs without Rohan's Mac and without any Google key outside Supabase).
 *
 *   STORY_API_URL=… SUPABASE_ANON_KEY=… MODELS=a,b VOICE=Aoede node scripts/voice-test-remote.mjs OUT_DIR
 *
 * For each model it renders the two fixed samples (audition + the start of a library story) and
 * writes OUT_DIR/<model>-<voice>-<sample>.wav, OUT_DIR/summary.md and OUT_DIR/results.json.
 * Never prints the key.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.STORY_API_URL;
const key = process.env.SUPABASE_ANON_KEY;
const out = process.argv[2] ?? 'voice-tests';
const voice = process.env.VOICE || 'Aoede';
const models = (process.env.MODELS || 'gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-2.5-flash-tts,gemini-2.5-pro-tts')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
if (!url || !key) {
  console.error('STORY_API_URL and SUPABASE_ANON_KEY are required');
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const results = [];
for (const model of models) {
  for (const sample of ['audition', 'story']) {
    const started = Date.now();
    let row = { model, voice, sample };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ action: 'tts-voice-test', model, voice, sample }),
        signal: AbortSignal.timeout(170_000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.base64) {
        row = { ...row, error: body.reason || (body.errors || []).join('; ') || `HTTP ${res.status}` };
      } else {
        const file = `${model}-${voice}-${sample}.wav`;
        writeFileSync(join(out, file), Buffer.from(body.base64, 'base64'));
        row = {
          ...row,
          file,
          seconds: body.seconds,
          renderMs: body.renderMs,
          ratio: body.heard?.ratio,
          wouldReachChild: body.wouldReachChild,
          problems: body.problems,
          transcript: body.transcript,
        };
      }
    } catch (e) {
      row = { ...row, error: e.message };
    }
    row.totalMs = Date.now() - started;
    results.push(row);
    console.log(
      row.error
        ? `✗ ${model} · ${sample}: ${row.error}`
        : `${row.wouldReachChild ? '✓' : '✗'} ${model} · ${sample}: ${row.seconds?.toFixed(1)}s audio, made in ${(row.renderMs / 1000).toFixed(1)}s` +
            (row.problems?.length ? ` — ${row.problems.join('; ')}` : ''),
    );
  }
}

const lines = [
  `# Aaji voice test (${voice})`,
  '',
  '| Model | Sample | Would reach a child | Length | Made in | Notes |',
  '|---|---|---|---|---|---|',
  ...results.map((r) =>
    r.error
      ? `| ${r.model} | ${r.sample} | ✗ | – | – | ${r.error} |`
      : `| ${r.model} | ${r.sample} | ${r.wouldReachChild ? '✓' : '✗'} | ${r.seconds.toFixed(1)} s | ${(r.renderMs / 1000).toFixed(1)} s | ${(r.problems || []).join('; ') || 'clean'} |`,
  ),
  '',
  '## What the listening check heard',
  ...results.filter((r) => r.transcript).map((r) => `- **${r.model} · ${r.sample}:** ${r.transcript}`),
  '',
];
writeFileSync(join(out, 'summary.md'), lines.join('\n'));
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2));
