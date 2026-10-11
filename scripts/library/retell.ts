/**
 * Retell one traditional story with the real story engine, so you can read it before it goes
 * into the library. Runs on YOUR computer with GEMINI_API_KEY from .env (never in the app).
 *
 *   npm run retell -- --list
 *   npm run retell -- --id tilak-shengachi-tarphale --age 6
 *
 * Writes library-drafts/<id>-age<N>.json (git-ignored) and prints the story and critic notes.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createProvider, type BackendEnv } from '../../backend/handler';
import { findRetelling, generateRetelling, RETELLINGS, resolveProfile, type ChildAge } from '../../story-engine';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');

  if (process.argv.includes('--list')) {
    for (const r of RETELLINGS) console.log(`${r.status.padEnd(8)} ${r.id.padEnd(30)} ${r.ageBands.join(',').padEnd(16)} ${r.title}`);
    return;
  }

  const id = arg('id');
  const source = id ? findRetelling(id) : undefined;
  if (!source) {
    console.error(id ? `No retelling with id "${id}". Try --list.` : 'Usage: npm run retell -- --id <id> [--age 6]   (or --list)');
    process.exitCode = 1;
    return;
  }
  const firstAge = { '2-3': 3, '4-5': 5, '6-7': 6, '8-9': 8 }[source.ageBands[0]];
  const age = Number(arg('age') ?? firstAge) as ChildAge;
  if (source.status !== 'APPROVED') console.log(`Note: "${source.id}" is still a DRAFT outline — fine for a test read.`);

  const { provider, note } = createProvider(process.env as BackendEnv);
  if (note) console.log(note);
  console.log(`Retelling "${source.title}" for age ${age} (${resolveProfile(age).ageBand})…`);

  const started = Date.now();
  const result = await generateRetelling(source, age, provider);
  const seconds = Math.round((Date.now() - started) / 1000);

  mkdirSync('library-drafts', { recursive: true });
  const file = join('library-drafts', `${source.id}-age${age}.json`);
  writeFileSync(file, JSON.stringify({ sourceId: source.id, age, status: result.status, result }, null, 2));

  if (result.status !== 'APPROVED') {
    console.log(`\n${result.status} after ${seconds}s`);
    if ('reason' in result) console.log(result.reason);
    if ('errors' in result) console.log(result.errors.join('\n'));
    console.log(`Details: ${file}`);
    process.exitCode = 1;
    return;
  }
  const ev = result.story.evaluation;
  console.log(`\nAPPROVED in ${seconds}s, ${result.story.attempts} attempt(s)\n`);
  console.log(`# ${result.story.title}\n\n${result.story.storyText}\n`);
  console.log(`Critic: ${ev.listenerVerdict}`);
  if (ev.weaknesses.length) console.log(`Weaknesses:\n${ev.weaknesses.map((w) => `- ${w}`).join('\n')}`);
  console.log(`\nSaved: ${file}`);
}

void main();
