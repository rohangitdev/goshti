import type { AgeBand } from '../profiles';
import { RETELLINGS } from './catalogue';
import type { RetellingFraming, RetellingSource } from './types';

export { findRetelling, RETELLINGS } from './catalogue';
export type { RetellingCollection, RetellingFraming, RetellingSource } from './types';

export function retellingsFor(ageBand: AgeBand, options: { approvedOnly?: boolean } = {}): RetellingSource[] {
  return RETELLINGS.filter((r) => r.ageBands.includes(ageBand) && (!options.approvedOnly || r.status === 'APPROVED'));
}

/** Shared by LEGEND and TRUE: stories about real people. */
const REAL_PERSON_RULES =
  'Do not invent NAMED characters: anyone not in the outline stays unnamed (एक मित्र, वर्गातली मुलं, गुरुजी) — in the plan, give them their role as the name (मित्र, गुरुजी, हत्ती). End with at most two short sentences about who the child grew up to be — no lecture about their greatness.';

/** Words that describe an unnamed person or animal — fine in a real-person story. */
const ROLE_WORDS = new Set([
  'गुरुजी', 'गुरूजी', 'शिक्षक', 'शिक्षिका', 'बाई', 'मास्तर', 'इन्स्पेक्टर', 'निरीक्षक', 'साहेब',
  'आई', 'बाबा', 'वडील', 'आजी', 'आजोबा', 'काका', 'काकू', 'मामा', 'मावशी', 'दादा', 'ताई', 'भाऊ', 'बहीण',
  'मित्र', 'मैत्रीण', 'मित्रमंडळी', 'वर्गमित्र', 'सवंगडी', 'मुलं', 'मुलगा', 'मुलगी', 'मुली', 'मुले',
  'शेजारी', 'शेजारीण', 'म्हातारा', 'म्हातारी', 'गावकरी', 'लोक', 'माणूस', 'नावाडी', 'शिपाई',
  'राजा', 'राणी', 'मावळे', 'मावळा', 'सैनिक', 'पुजारी', 'साधू', 'भक्त',
  'हत्ती', 'घोडा', 'वाघ', 'साप', 'पक्षी', 'गाय', 'कुत्रा', 'मांजर',
]);

/**
 * Real-person stories (LEGEND/TRUE) must not invent named characters. Returns single-word
 * character names from the plan that are neither kept names nor roles but appear in the story.
 */
export function inventedNames(source: RetellingSource, characterNames: string[], storyText: string): string[] {
  if (source.framing !== 'LEGEND' && source.framing !== 'TRUE') return [];
  return characterNames
    .map((n) => n.trim())
    .filter((name) => {
      if (!name || /\s/.test(name) || ROLE_WORDS.has(name)) return false;
      if (source.keepNames.some((k) => k.includes(name) || name.includes(k))) return false;
      return storyText.includes(name);
    });
}

const FRAMING_RULES: Record<RetellingFraming, string> = {
  FOLK: 'A traditional fable. Tell it freely as Aaji\'s own telling; the outline\'s events and moral stay.',
  MYTH: 'From the Puranas/epics. Tell it with warmth and respect. Never make a god look silly or the butt of a joke.',
  LEGEND:
    'A popular anecdote about a REAL person; its details are not certain. Aaji says "असं सांगतात" once. Do NOT add any new fact about the real person (no dates, places, numbers, relatives, events) beyond the outline. ' +
    REAL_PERSON_RULES,
  TRUE:
    'A documented event about a REAL person. Use ONLY the events in the outline. You may add sensory detail and simple dialogue, but no new events, dates, places or numbers. ' +
    REAL_PERSON_RULES,
};

/** The block every stage sees when a story is a retelling (planner, writer, critic, rewriter). */
export function formatRetelling(source: RetellingSource): string {
  const list = (items: string[]) => items.map((b, i) => `${i + 1}. ${b}`).join('\n');
  const lines = [
    'RETELLING SOURCE — this is a deliberate retelling of a traditional, public-domain story chosen by GOSHTI\'s editors.',
    'The ORIGINALITY rules apply to the WORDING (Aaji\'s own fresh telling — never text from any modern book, comic, album or app), not to the plot: keep this plot.',
    `Working title: ${source.title}`,
    `Framing: ${source.framing} — ${FRAMING_RULES[source.framing]}`,
    `Names to keep exactly: ${source.keepNames.length ? source.keepNames.join(', ') : 'none (you may name the animals simply or not at all)'}`,
    `Plot, in order (keep every beat; do not add new major events):\n${list(source.beats)}`,
    `Value shown through events (never state it as a lesson, and never explain it in the narration — no "he did X, but he also didn't do Y" commentary): ${source.moral}`,
  ];
  if (source.mustKeep?.length) lines.push(`Must keep:\n${source.mustKeep.map((m) => `- ${m}`).join('\n')}`);
  if (source.soften) lines.push(`Softening for children (follow this over the traditional version): ${source.soften}`);
  lines.push(
    'The age profile, safety, language and audio rules still apply in full. The category above only sets the mood and sounds — follow this source for the story.',
  );
  return lines.join('\n');
}
