/**
 * How the backend reaches Google's Gemini models — BACKEND ONLY (never import from the app).
 *
 * - Vertex AI (Google Cloud): a service-account login, or a Vertex API key. Google Cloud terms.
 *   This is the route for GOSHTI: the Gemini API (AI Studio) terms don't allow services aimed
 *   at under-18s.
 * - AI Studio (GEMINI_API_KEY): kept for developer experiments only.
 *
 * Uses only fetch + WebCrypto, so it runs in Node and in Supabase Edge Functions (Deno).
 * Credentials and tokens are never logged or put in error messages.
 */
import { ProviderError } from '../provider';

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
}

export interface GoogleAccess {
  readonly kind: 'vertex' | 'ai-studio';
  /** Human-readable, no secrets (e.g. "Vertex AI (goshti-prod, global)"). */
  readonly label: string;
  /** URL for {model}:generateContent. `beta` uses Vertex's v1beta1 API (needed for speech models). */
  generateContentUrl(model: string, options?: { beta?: boolean }): string;
  /** Auth headers for one request — fetches or refreshes an OAuth token when needed. */
  headers(): Promise<Record<string, string>>;
  /** Forget a cached token (after Google answers 401). */
  invalidate(): void;
}

/** The env values that decide how we reach Gemini. */
export interface GoogleEnv {
  /** Google Cloud project id → use Vertex AI. */
  GOOGLE_CLOUD_PROJECT?: string;
  /** Vertex location; "global" (default) has the newest models. */
  GOOGLE_CLOUD_LOCATION?: string;
  /** Service-account key: the JSON itself, or the JSON base64-encoded (one line — easiest for secrets). */
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  /**
   * Alternative to a key file: a Google Cloud API key created with "Authenticate API calls through a
   * service account" ticked (an unbound key is refused: "API keys are not supported by this API").
   */
  VERTEX_API_KEY?: string;
  /** AI Studio key — developer experiments only (not for the children's app). */
  GEMINI_API_KEY?: string;
}

const AI_STUDIO_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

export function aiStudioAccess(apiKey: string): GoogleAccess {
  if (!apiKey) throw new ProviderError('NOT_CONFIGURED', 'GEMINI_API_KEY is not set');
  return {
    kind: 'ai-studio',
    label: 'Gemini API (AI Studio)',
    generateContentUrl: (model) => `${AI_STUDIO_BASE}/models/${encodeURIComponent(model)}:generateContent`,
    headers: async () => ({ 'x-goog-api-key': apiKey }),
    invalidate: () => {},
  };
}

export function vertexHost(location: string): string {
  return location === 'global' ? 'https://aiplatform.googleapis.com' : `https://${location}-aiplatform.googleapis.com`;
}

export interface VertexConfig {
  project: string;
  location?: string;
  serviceAccount?: ServiceAccountKey;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function vertexAccess(config: VertexConfig): GoogleAccess {
  const location = (config.location || 'global').trim();
  if (!config.project) throw new ProviderError('NOT_CONFIGURED', 'GOOGLE_CLOUD_PROJECT is not set');
  if (!/^[a-z0-9-]+$/.test(location)) throw new ProviderError('NOT_CONFIGURED', 'GOOGLE_CLOUD_LOCATION is not a valid location');
  if (!config.serviceAccount && !config.apiKey) {
    throw new ProviderError('NOT_CONFIGURED', 'Vertex AI needs GOOGLE_SERVICE_ACCOUNT_JSON or VERTEX_API_KEY');
  }
  const tokens = config.serviceAccount ? new ServiceAccountTokens(config.serviceAccount, config.fetchImpl, config.now) : null;
  const project = encodeURIComponent(config.project);
  return {
    kind: 'vertex',
    label: `Vertex AI (${config.project}, ${location})`,
    generateContentUrl: (model, options) =>
      `${vertexHost(location)}/${options?.beta ? 'v1beta1' : 'v1'}/projects/${project}/locations/${location}` +
      `/publishers/google/models/${encodeURIComponent(model)}:generateContent` +
      // A Vertex API key (bound to a service account) goes in the query, as in Google's Vertex examples.
      (tokens ? '' : `?key=${encodeURIComponent(config.apiKey!)}`),
    headers: async (): Promise<Record<string, string>> => (tokens ? { Authorization: `Bearer ${await tokens.get()}` } : {}),
    invalidate: () => tokens?.invalidate(),
  };
}

/** Accepts the key file's JSON, or that JSON base64-encoded. Never echoes the key in errors. */
export function parseServiceAccount(raw: string): ServiceAccountKey {
  const text = raw.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.startsWith('{') ? text : atob(text.replace(/\s+/g, '')));
  } catch {
    throw new ProviderError('NOT_CONFIGURED', 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (or base64 of JSON)');
  }
  const key = parsed as Partial<ServiceAccountKey>;
  if (typeof key.client_email !== 'string' || typeof key.private_key !== 'string' || !key.private_key.includes('PRIVATE KEY')) {
    throw new ProviderError('NOT_CONFIGURED', 'GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  }
  return { client_email: key.client_email, private_key: key.private_key, token_uri: key.token_uri, project_id: key.project_id };
}

/**
 * Picks how to reach Gemini from the environment. Vertex AI wins whenever a Google Cloud
 * project is set; a half-configured Vertex setup is an error (never a silent fallback).
 */
export function googleAccessFromEnv(env: GoogleEnv, fetchImpl?: typeof fetch): GoogleAccess | null {
  if (env.GOOGLE_CLOUD_PROJECT) {
    return vertexAccess({
      project: env.GOOGLE_CLOUD_PROJECT.trim(),
      location: env.GOOGLE_CLOUD_LOCATION,
      serviceAccount: env.GOOGLE_SERVICE_ACCOUNT_JSON ? parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON) : undefined,
      apiKey: env.VERTEX_API_KEY || undefined,
      fetchImpl,
    });
  }
  if (env.GEMINI_API_KEY) return aiStudioAccess(env.GEMINI_API_KEY);
  return null;
}

/** Adds a plain-English fix to Google's common sign-in errors (shown to the developer, never to children). */
export function explainGoogleError(message: string): string {
  if (/API keys are not supported by this API/i.test(message)) {
    return `${message} — this Vertex API key isn't linked to a service account: create a new key with "Authenticate API calls through a service account" ticked (choose goshti-backend), or use the key file instead.`;
  }
  if (/aiplatform\.endpoints\.predict|PERMISSION_DENIED|permission denied/i.test(message)) {
    return `${message} — give the service account the "Vertex AI User" role and make sure the Vertex AI API is enabled (new permissions can take 5–10 minutes).`;
  }
  if (/has not been used in project|SERVICE_DISABLED|is disabled/i.test(message)) {
    return `${message} — enable the Vertex AI API for this project in Google Cloud Console.`;
  }
  return message;
}

/** True when stories and Aaji's voice can reach Gemini (Vertex or AI Studio). */
export function hasGoogleAccess(env: GoogleEnv): boolean {
  return !!((env.GOOGLE_CLOUD_PROJECT && (env.GOOGLE_SERVICE_ACCOUNT_JSON || env.VERTEX_API_KEY)) || env.GEMINI_API_KEY);
}

// ---------------------------------------------------------------------------
// Service-account OAuth (JWT bearer grant), signed with WebCrypto.

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Builds and signs the RS256 JWT Google's token endpoint expects. Exported for tests. */
export async function signServiceAccountJwt(key: ServiceAccountKey, issuedAtSeconds: number): Promise<string> {
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToDer(key.private_key) as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    throw new ProviderError('NOT_CONFIGURED', 'the service-account private_key could not be read');
  }
  const header = base64url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(
    utf8(
      JSON.stringify({
        iss: key.client_email,
        scope: SCOPE,
        aud: key.token_uri || DEFAULT_TOKEN_URI,
        iat: issuedAtSeconds,
        exp: issuedAtSeconds + 3600,
      }),
    ),
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, utf8(`${header}.${claims}`) as BufferSource);
  return `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
}

class ServiceAccountTokens {
  private cached: { token: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(
    private readonly key: ServiceAccountKey,
    fetchImpl?: typeof fetch,
    now?: () => number,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
    this.now = now ?? Date.now;
  }

  invalidate() {
    this.cached = null;
  }

  async get(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAt - 60_000) return this.cached.token;
    this.pending ??= this.fetchToken().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async fetchToken(): Promise<string> {
    const assertion = await signServiceAccountJwt(this.key, Math.floor(this.now() / 1000));
    let res: Response;
    try {
      res = await this.fetchImpl(this.key.token_uri || DEFAULT_TOKEN_URI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      });
    } catch (e) {
      throw new ProviderError('NETWORK', `Google sign-in failed: ${(e as Error).message}`);
    }
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !json.access_token) {
      const why = json.error_description || json.error || `HTTP ${res.status}`;
      throw new ProviderError(res.status >= 500 ? 'NETWORK' : 'NOT_CONFIGURED', `Google sign-in failed: ${why}`);
    }
    this.cached = { token: json.access_token, expiresAt: this.now() + (json.expires_in ?? 3600) * 1000 };
    return json.access_token;
  }
}
