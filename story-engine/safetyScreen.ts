/**
 * Deterministic safety screen for a child's idea — defence in depth BEFORE any AI call.
 *
 * The Gemini intent classifier (with strict safety settings) is the main gate. This screen
 * catches unmistakable requests (gore, killing, weapons, self-harm, adult content, swearing,
 * abduction) even if the model misjudges, and costs nothing. It is deliberately narrow so
 * ordinary story ideas are never blocked; anything subtle is left to the classifier.
 */

export type ScreenCategory =
  | 'violence'
  | 'weapons'
  | 'self_harm'
  | 'adult'
  | 'abuse_language'
  | 'abduction'
  | 'drugs'
  /** "Say this sentence exactly" — Aaji never repeats dictated text (not unsafe, just not a story). */
  | 'verbatim';

const PATTERNS: Record<ScreenCategory, readonly string[]> = {
  violence: ['रक्त', 'रक्ताची', 'खून', 'मारायच', 'मारून टाक', 'ठार', 'blood', 'gore', 'kill', 'murder'],
  weapons: ['bomb', 'बॉम्ब', 'बंदूक', 'पिस्तूल', 'स्फोटक', 'explosive', 'gun', 'weapon'],
  self_harm: ['स्वतःला दुखापत', 'स्वतःला इजा', 'स्वतःला मार', 'आत्महत्या', 'suicide', 'self harm', 'self-harm', 'hurt himself', 'hurt herself'],
  adult: ['adult', 'sex', 'सेक्स', 'porn', 'नग्न', 'nude'],
  abuse_language: ['शिवी', 'शिव्या', 'swear', 'gaali', 'गाली'],
  abduction: ['कायमचं नेलं', 'कायमचा नेला', 'पळवून नेलं', 'पळवून नेला', 'अपहरण', 'kidnap'],
  drugs: ['drugs', 'ड्रग्ज', 'दारू', 'cigarette', 'सिगारेट'],
  verbatim: ['तसंच बोल', 'तसेच बोल', 'जसंच्या तसं', 'जसेच्या तसे', 'हे वाक्य बोल', 'हे वाक्य म्हण', 'repeat after me', 'say exactly', 'say this'],
};

function normalise(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u200B-\u200F]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Latin terms must match as whole words ("gun" must not match "begun"). */
function matches(text: string, term: string): boolean {
  if (/^[a-z -]+$/.test(term)) return new RegExp(`(^|[^a-z])${term}($|[^a-z])`).test(text);
  return text.includes(term);
}

/** Which fixed answer a screened idea gets. */
export function screenOutcome(category: ScreenCategory): 'UNSAFE' | 'NOT_A_STORY' {
  return category === 'verbatim' ? 'NOT_A_STORY' : 'UNSAFE';
}

export function screenIdea(idea: string | undefined): { blocked: false } | { blocked: true; category: ScreenCategory } {
  if (!idea) return { blocked: false };
  const text = normalise(idea);
  for (const [category, terms] of Object.entries(PATTERNS) as [ScreenCategory, readonly string[]][]) {
    if (terms.some((t) => matches(text, t))) return { blocked: true, category };
  }
  return { blocked: false };
}
