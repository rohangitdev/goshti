/**
 * Node-only helpers for local runs (dev server, scripts). Never bundled into the Edge Function.
 */
import { existsSync, readFileSync } from 'node:fs';

import { googleAccessFromEnv, type GoogleEnv } from '../story-engine/providers/googleAccess';

/**
 * Loads .env, then — if GOOGLE_APPLICATION_CREDENTIALS points to a service-account key file and
 * GOOGLE_SERVICE_ACCOUNT_JSON isn't set — reads that file. Keep the key file OUTSIDE the repo.
 */
export function loadLocalEnv(envPath: string): void {
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && file && existsSync(file)) {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = readFileSync(file, 'utf8');
  }
}

/** One line saying how stories reach Gemini — never includes a secret. */
export function describeAi(env: GoogleEnv): string {
  try {
    const access = googleAccessFromEnv(env);
    if (!access) return 'MOCK (template stories) — set up Vertex AI in .env, see docs/VERTEX_SETUP.md';
    return access.kind === 'vertex' ? access.label : `${access.label} — developer experiments only`;
  } catch (e) {
    return `NOT CONFIGURED: ${(e as Error).message}`;
  }
}
