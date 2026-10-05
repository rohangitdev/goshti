#!/usr/bin/env node
/**
 * Copies the app's PUBLIC settings from .env into EAS (Expo's cloud build service), so test and
 * store builds talk to your Supabase backend. Only an explicit allow-list of EXPO_PUBLIC_* values
 * is sent — never GEMINI_API_KEY or any other secret.
 *
 *   npm run eas:env
 */
import { execFileSync } from 'node:child_process';

process.loadEnvFile?.('.env');
const ALLOWED = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_PREFETCH_STORIES'];
const missing = ALLOWED.slice(0, 2).filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(', ')}`);
  process.exit(1);
}
for (const environment of ['preview', 'production']) {
  for (const name of ALLOWED) {
    const value = process.env[name];
    if (!value) continue;
    execFileSync(
      'npx',
      ['eas-cli', 'env:create', '--environment', environment, '--name', name, '--value', value,
        '--visibility', name.includes('KEY') ? 'sensitive' : 'plaintext', '--scope', 'project', '--force', '--non-interactive'],
      { stdio: 'inherit' },
    );
  }
}
console.log('\nDone. Public app settings are in EAS for the preview and production builds.');
