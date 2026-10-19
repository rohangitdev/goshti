/**
 * The listening child as the HERO of their AI-made stories.
 *
 * Every story the AI writes for a child with a name on their profile stars that child (in the
 * third person, with Marathi grammar for a boy or a girl). Traditional retellings and Aaji's
 * ready-made library stories are never changed. The child's name is a story ingredient only —
 * it is never logged (see logging.ts).
 */
import type { StoryPlan, StoryRequest } from './schemas';

const LATIN = /[A-Za-z]/;

/** True when this request's story should star the child. */
export function isHeroRequest(request: Pick<StoryRequest, 'childName'>): boolean {
  return !!request.childName?.trim();
}

/** Prompt block (planner, writer, critic, rewriter) that makes the child the hero. */
export function formatHero(request: Pick<StoryRequest, 'childName' | 'childGender' | 'age'>): string {
  const name = request.childName!.trim();
  const who = request.childGender === 'GIRL' ? 'girl' : request.childGender === 'BOY' ? 'boy' : 'child';
  const grammar =
    request.childGender === 'GIRL'
      ? `${name} is a girl: always feminine forms for her (गेली, म्हणाली, आली, ती).`
      : request.childGender === 'BOY'
        ? `${name} is a boy: always masculine forms for him (गेला, म्हणाला, आला, तो).`
        : `Choose ${name}'s gender from how the name is used in Maharashtra and keep the verb forms consistent.`;
  const script = LATIN.test(name)
    ? `The name is typed in English letters — write it in Devanagari the way a Marathi family would spell "${name}", the same way every time.`
    : `Write the name exactly as given: ${name}.`;
  return [
    `THE HERO: the child listening, ${name} (a ${request.age}-year-old ${who}), is the hero of this story.`,
    `- The main character (plan.mainCharacter) IS ${name}, a real child — not an animal or a grown-up. ${script}`,
    `- Grammar: ${grammar}`,
    `- ${name} makes the important choices and solves the problem (help from friends is fine). Use the name naturally all through the story — not in every sentence.`,
    `- If the child's idea is about someone else (an elephant who wants to go to the moon…), keep the idea whole: that character is ${name}'s companion, and ${name} is at the heart of the adventure with them.`,
    `- ${name} is kind, brave and capable. ${name} may make a small everyday mistake and learn from it, but is never mean, never scolded, punished or shamed, never hurt, lost alone or truly frightened.`,
    `- Tell it in the third person (${name}ने…, ${name}ला…), never as "तू".`,
    `- Invent nothing about ${name}'s real life (family names, school, home town) beyond what the story needs.`,
  ].join('\n');
}

/** The name as it should appear in the Marathi story text. */
export function heroNameInStory(request: Pick<StoryRequest, 'childName'>, plan: Pick<StoryPlan, 'mainCharacter'>): string {
  const name = request.childName!.trim();
  return LATIN.test(name) ? plan.mainCharacter.name.trim() : name;
}

/** Deterministic checks that the child really is the hero (added to the critic's failures). */
export function heroChecks(request: Pick<StoryRequest, 'childName'>, plan: Pick<StoryPlan, 'mainCharacter'>, storyText: string): string[] {
  const name = heroNameInStory(request, plan);
  if (LATIN.test(name)) return [`write the hero's name in Devanagari, not English letters (${name})`];
  const mentions = name ? storyText.split(name).length - 1 : 0;
  if (mentions < 3) {
    return [`the child, ${name}, must be the hero — the main character, named all through the story (named only ${mentions}×)`];
  }
  return [];
}
