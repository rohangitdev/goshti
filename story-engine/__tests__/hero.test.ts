import { describe, expect, it } from 'vitest';

import { formatHero, heroChecks, isHeroRequest } from '../hero';
import { anonymiseTrace, summariseTrace } from '../logging';
import { generateRetelling, generateStory } from '../pipeline';
import { buildCriticUserPrompt } from '../prompts/criticPrompt';
import { buildPlannerUserPrompt } from '../prompts/plannerPrompt';
import { formatRequest } from '../prompts/shared';
import { buildStoryWriterUserPrompt } from '../prompts/storyWriterPrompt';
import { resolveProfile } from '../profiles';
import { validateStoryRequest } from '../request';
import { findRetelling } from '../retellings';
import type { StoryRequest } from '../schemas';
import { evaluation, fakeProvider, samplePlan, storyOfWords } from './fixtures';

const aarya: StoryRequest = { age: 6, category: 'adventure', mode: 'RANDOM', childName: 'आर्या', childGender: 'GIRL' };

/** A story that names the hero `times` times. */
function storyNaming(name: string, times: number) {
  const base = storyOfWords(500);
  return { ...base, storyText: `${Array.from({ length: times }, () => `${name}ने वर पाहिलं.`).join(' ')}\n\n${base.storyText}` };
}

describe('the child as the hero', () => {
  it('tells every stage that the child is the hero, with Marathi grammar for a girl or a boy', () => {
    const girl = formatHero(aarya);
    expect(girl).toMatch(/आर्या \(a 6-year-old girl\), is the hero/);
    expect(girl).toContain('गेली, म्हणाली');
    expect(formatHero({ ...aarya, childName: 'रोहन', childGender: 'BOY' })).toContain('गेला, म्हणाला');
    expect(formatHero({ ...aarya, childName: 'Rohan', childGender: 'BOY' })).toMatch(/write it in Devanagari .*"Rohan"/);
    expect(girl).toMatch(/third person/);
    expect(girl).toMatch(/never scolded, punished or shamed/);

    const profile = resolveProfile(6);
    for (const prompt of [
      buildPlannerUserPrompt({ request: aarya, profile, ingredients: {} }),
      buildStoryWriterUserPrompt({ request: aarya, profile, plan: samplePlan }),
      buildCriticUserPrompt({ request: aarya, profile, plan: samplePlan, story: storyOfWords(50) }),
    ]) {
      expect(prompt).toContain('THE HERO');
    }
    expect(formatRequest({ ...aarya, childName: undefined })).not.toContain('THE HERO');
    expect(isHeroRequest({ childName: '  ' })).toBe(false);
  });

  it('checks the story really stars the child', () => {
    const plan = { mainCharacter: { ...samplePlan.mainCharacter, name: 'आर्या' } };
    expect(heroChecks(aarya, plan, storyNaming('आर्या', 4).storyText)).toEqual([]);
    expect(heroChecks(aarya, plan, storyNaming('आर्या', 1).storyText)[0]).toMatch(/must be the hero .*named only 1×/);
    // Typed in English: the planner's Devanagari spelling is what the story uses.
    const rohan = { ...aarya, childName: 'Rohan' };
    expect(heroChecks(rohan, { mainCharacter: { ...plan.mainCharacter, name: 'रोहन' } }, storyNaming('रोहन', 3).storyText)).toEqual([]);
    expect(heroChecks(rohan, { mainCharacter: { ...plan.mainCharacter, name: 'Rohan' } }, 'Rohan Rohan Rohan')[0]).toMatch(/Devanagari/);
  });

  it('sends a story back when the child is not its hero, and approves one that stars them', async () => {
    const off = fakeProvider({ story: storyNaming('आर्या', 1), evaluations: [evaluation(9)] });
    off.provider.createPlan = async () => ({ ...samplePlan, mainCharacter: { ...samplePlan.mainCharacter, name: 'आर्या' } });
    const r1 = await generateStory(aarya, off.provider);
    expect(off.calls).toContain('rewriteStory');
    expect(r1.status).toBe('FAILED');
    if (r1.status === 'FAILED') expect(r1.reason).toMatch(/must be the hero/);

    const on = fakeProvider({ story: storyNaming('आर्या', 5) });
    on.provider.createPlan = async () => ({ ...samplePlan, mainCharacter: { ...samplePlan.mainCharacter, name: 'आर्या' } });
    const r2 = await generateStory(aarya, on.provider);
    expect(r2.status).toBe('APPROVED');
    // The suggested protagonist becomes the child's companion.
    if (r2.status === 'APPROVED') {
      expect(r2.trace.varietyIngredients).toHaveProperty('companion');
      expect(r2.trace.varietyIngredients).not.toHaveProperty('protagonist');
    }
  });

  it("never puts the child into a traditional retelling", async () => {
    const { provider } = fakeProvider();
    const r = await generateRetelling(findRetelling('ekiche-bal-kabutare')!, 5, provider, {});
    expect(r.trace.normalizedRequest?.childName).toBeUndefined();
  });

  it("keeps the child's name out of logs, typed or as the story's hero", async () => {
    const on = fakeProvider({ story: { ...storyNaming('रोहन', 5), title: 'रोहनचा चंद्र' } });
    on.provider.createPlan = async () => ({ ...samplePlan, mainCharacter: { ...samplePlan.mainCharacter, name: 'रोहन' } });
    const r = await generateStory({ ...aarya, childName: 'Rohan', childGender: 'BOY' }, on.provider);
    expect(r.status).toBe('APPROVED');
    expect(summariseTrace(r.trace)).toContain('title="[child]चा चंद्र"');
    const json = JSON.stringify(anonymiseTrace(r.trace));
    expect(json).not.toContain('रोहन');
    expect(json).not.toContain('Rohan');
  });

  it('accepts only BOY or GIRL for gender', () => {
    const ok = validateStoryRequest({ age: 6, category: 'animals', mode: 'RANDOM', childName: 'सई', childGender: 'GIRL' });
    expect(ok.ok && ok.value.childGender).toBe('GIRL');
    const odd = validateStoryRequest({ age: 6, category: 'animals', mode: 'RANDOM', childGender: 'ROBOT' });
    expect(odd.ok && odd.value.childGender).toBeUndefined();
  });
});
