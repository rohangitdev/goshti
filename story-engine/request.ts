import { MAX_IDEA_LENGTH, MAX_NAME_LENGTH, StoryRequestSchema, type StoryRequest } from './schemas';

// Control characters, zero-width characters and unicode line/paragraph separators.
const CONTROL_CHARS = /[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202F]/g;

/** Strip control characters, collapse whitespace, trim and cap length. */
export function sanitizeText(raw: unknown, maxLength: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** First name only: letters (any script), combining marks, spaces, hyphen, apostrophe. */
function sanitizeName(raw: unknown): string | undefined {
  const text = sanitizeText(raw, MAX_NAME_LENGTH);
  if (!text) return undefined;
  const cleaned = text.replace(/[^\p{L}\p{M}\s'-]/gu, '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeList(raw: unknown, max: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw.map((v) => sanitizeText(v, maxLen)).filter((v): v is string => !!v).slice(0, max);
  return items.length ? items : undefined;
}

export type RequestValidation = { ok: true; value: StoryRequest } | { ok: false; errors: string[] };

/**
 * Validates an untrusted request (from the app or HTTP).
 * The child's idea is a story seed only — it is sanitised here and later classified.
 */
export function validateStoryRequest(input: unknown): RequestValidation {
  if (!input || typeof input !== 'object') return { ok: false, errors: ['request must be an object'] };
  const raw = input as Record<string, unknown>;
  const mode = raw.mode;

  const candidate = {
    age: typeof raw.age === 'string' && /^\d+$/.test(raw.age) ? Number(raw.age) : raw.age,
    category: raw.category,
    mode,
    userIdea: mode === 'CUSTOM' ? sanitizeText(raw.userIdea, MAX_IDEA_LENGTH) : undefined,
    childName: sanitizeName(raw.childName),
    interests: sanitizeList(raw.interests, 5, 40),
    favouriteAnimals: sanitizeList(raw.favouriteAnimals, 5, 40),
    avoidTitles: sanitizeList(raw.avoidTitles, 12, 120),
  };

  const parsed = StoryRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`) };
  }
  return { ok: true, value: parsed.data };
}
