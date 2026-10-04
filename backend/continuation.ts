/**
 * Continuation tokens: the pipeline state handed to the client between requests.
 * AES-GCM encrypted + authenticated with a server-only secret, so the client can neither
 * read the internals (plan, critic notes) nor forge a state (e.g. skip the classifier
 * or mark a story approved). Web Crypto only — works in Node and Deno.
 */
import type { PipelineState } from '../story-engine/pipeline';

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function keyFrom(secret: string, purpose = 'continuation'): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`goshti-${purpose}:${secret}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealState(state: PipelineState, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(secret), enc.encode(JSON.stringify(state)));
  const out = new Uint8Array(iv.length + data.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(data), iv.length);
  return `v1.${toBase64Url(out)}`;
}

export async function openState(token: unknown, secret: string): Promise<PipelineState | null> {
  if (typeof token !== 'string' || !token.startsWith('v1.') || token.length > 2_000_000) return null;
  try {
    const bytes = fromBase64Url(token.slice(3));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await keyFrom(secret),
      bytes.slice(12),
    );
    const state = JSON.parse(dec.decode(plain)) as PipelineState;
    return state && state.v === 1 && state.trace?.normalizedRequest ? state : null;
  } catch {
    return null;
  }
}

/** Generic sealed token (encrypted + authenticated) for other server-issued data. */
export async function sealJson(value: unknown, secret: string, purpose: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(secret, purpose), enc.encode(JSON.stringify(value)));
  const out = new Uint8Array(iv.length + data.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(data), iv.length);
  return `v1.${toBase64Url(out)}`;
}

export async function openJson<T>(token: unknown, secret: string, purpose: string): Promise<T | null> {
  if (typeof token !== 'string' || !token.startsWith('v1.') || token.length > 2_000_000) return null;
  try {
    const bytes = fromBase64Url(token.slice(3));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      await keyFrom(secret, purpose),
      bytes.slice(12),
    );
    return JSON.parse(dec.decode(plain)) as T;
  } catch {
    return null;
  }
}
