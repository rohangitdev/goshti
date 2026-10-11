/**
 * Local development backend + Story Engine developer tester.
 *
 *   npm run backend          → http://localhost:8787
 *
 * Reads .env from the project root. Runs exactly the same handler as the
 * Supabase Edge Function.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { anonymiseTrace, createConsoleLogger, type LogLevel } from '../story-engine/logging';
import type { StoryTrace } from '../story-engine/types';
import { CORS_HEADERS, handleGenerateStory, type BackendEnv } from './handler';
import { PRESETS } from './presets';
import { addToLibrary } from './libraryWriter';
import { describeAi, loadLocalEnv } from './localEnv';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

loadLocalEnv(join(root, '.env')); // no .env is fine — the mock provider is used

const PORT = Number(process.env.PORT) || 8787;
const env = process.env as BackendEnv;
const level = (env.STORY_LOG as LogLevel) || 'summary';
const consoleLogger = createConsoleLogger(level === 'full' ? 'summary' : level);
const logDir = join(root, '.story-logs');

/** Console summary always; full anonymised JSON files when STORY_LOG=full. */
const logger = {
  log(trace: StoryTrace) {
    consoleLogger.log(trace);
    if (level !== 'full') return;
    mkdirSync(logDir, { recursive: true });
    const file = join(logDir, `${trace.startedAt.replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, JSON.stringify(anonymiseTrace(trace), null, 2));
  },
};

function send(res: ServerResponse, status: number, body: string, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, ...CORS_HEADERS });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/tester')) {
      return send(res, 200, readFileSync(join(here, 'tester.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/presets') return send(res, 200, JSON.stringify(PRESETS));
    if (req.method === 'GET' && url.pathname === '/config') {
      // Public values only (the same ones shipped in the app) — never the Gemini key.
      return send(
        res,
        200,
        JSON.stringify({
          supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
          supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        }),
      );
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, JSON.stringify({ ok: true, ai: describeAi(env), model: env.GEMINI_MODEL ?? null }));
    }
    if (req.method === 'POST' && url.pathname === '/library/add') {
      const result = addToLibrary(await readBody(req), join(root, 'story-engine', 'library', 'added.ts'));
      return send(res, result.ok ? 200 : 400, JSON.stringify(result));
    }
    if (req.method === 'POST' && url.pathname === '/generate-story') {
      const result = await handleGenerateStory(await readBody(req), env, { logger });
      return send(res, result.status, JSON.stringify(result.body));
    }
    send(res, 404, JSON.stringify({ error: 'not found' }));
  } catch (e) {
    send(res, 500, JSON.stringify({ status: 'FAILED', reason: (e as Error).message }));
  }
});

server.requestTimeout = 0; // stories can take a couple of minutes
server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log(`\nGOSHTI story backend running`);
  console.log(`  Tester:   http://localhost:${PORT}/`);
  console.log(`  API:      POST http://localhost:${PORT}/generate-story`);
  if (lan) console.log(`  Phone:    EXPO_PUBLIC_STORY_API_URL=http://${lan}:${PORT}/generate-story`);
  console.log(`  AI:       ${describeAi(env)}`);
  console.log('');
});
