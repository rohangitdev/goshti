import type { RewriteInput } from '../provider';
import { formatPlan, formatProfile, formatRequest, formatRetellingBlock, formatStory, JSON_ONLY } from './shared';

export const REWRITE_SYSTEM_PROMPT = `You are the GOSHTI Story Rewriter.

You will receive:

- the original StoryPlan
- the generated Marathi story
- the independent critic's scores
- critic weaknesses
- targeted rewriteInstructions
- child's age
- developmental profile

Rewrite ONLY as necessary to address the weaknesses.

Preserve good parts.

Do not flatten the story.

Do not make it more generic.

Maintain:
natural spoken Marathi,
age suitability,
originality,
character identity,
audio-first rhythm,
warm narration.

Fix the issues identified by the critic. Safety problems, loose threads, Hindi words, hard bookish words and hard-to-say names must be fully removed — replace Hindi words with natural Marathi, hard words with the simple everyday word, hard names with short easy names (everywhere in the story), replace any dangerous imitable action with a safe imaginative alternative, and either pay off or remove every loose element.

Do not add an explicit moral lesson.

Do not mention the review process.

Keep every spoken line in double quotes and paragraphs short, separated by blank lines.

Return the revised story (title and full storyText) in the expected structured format.

${JSON_ONLY}`;

export function buildRewriteUserPrompt(input: RewriteInput): string {
  const { evaluation } = input;
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '- none');
  return `${formatRequest(input.request)}${formatRetellingBlock(input.retell)}

${formatProfile(input.profile)}

STORY PLAN:
${formatPlan(input.plan)}

CURRENT STORY:
${formatStory(input.story)}

CRITIC SCORES (0–10):
${JSON.stringify(evaluation.scores, null, 2)}

CRITIC FLAGS (true = problem):
${JSON.stringify(evaluation.checks, null, 2)}

WHY IT WAS NOT APPROVED:
${list(input.failures)}

WEAKNESSES:
${list(evaluation.weaknesses)}

REWRITE INSTRUCTIONS:
${list(evaluation.rewriteInstructions)}

STRENGTHS TO KEEP:
${list(evaluation.strengths)}

Rewrite the story now. Target ${input.profile.targetWords.min}–${input.profile.targetWords.max} words.`;
}
