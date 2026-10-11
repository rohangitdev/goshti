import { describe, expect, it } from 'vitest';

import { isStoryCategory } from '../categories';
import { findHindiWords } from '../hindiWords';
import { generateRetelling, generateStory } from '../pipeline';
import { buildCriticUserPrompt, buildPlannerUserPrompt, buildRewriteUserPrompt, buildStoryWriterUserPrompt } from '../prompts';
import { resolveProfile } from '../profiles';
import { validateStoryRequest } from '../request';
import { findRetelling, formatRetelling, RETELLINGS, retellingsFor } from '../retellings';
import { CHECK_KEYS } from '../schemas';
import { evaluation, fakeProvider, samplePlan, storyOfWords } from './fixtures';

const DEVANAGARI = /[ऀ-ॿ]/;

describe('retelling catalogue', () => {
  it('has unique ids and complete, valid outlines', () => {
    const ids = RETELLINGS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(RETELLINGS.length).toBeGreaterThanOrEqual(30);
    for (const r of RETELLINGS) {
      expect(isStoryCategory(r.category), r.id).toBe(true);
      expect(r.ageBands.length, r.id).toBeGreaterThan(0);
      expect(r.beats.length, r.id).toBeGreaterThanOrEqual(3);
      expect(r.title, r.id).toMatch(DEVANAGARI);
      expect(r.moral.length, r.id).toBeGreaterThan(5);
      for (const n of r.keepNames) expect(n, r.id).toMatch(DEVANAGARI);
    }
  });

  it('names the real person in every true story or legend about one', () => {
    for (const r of RETELLINGS.filter((x) => x.collection === 'GREAT_INDIANS' || x.collection === 'SAINTS')) {
      expect(['LEGEND', 'TRUE'], r.id).toContain(r.framing);
      expect(r.keepNames.length, r.id).toBeGreaterThan(0);
    }
  });

  it('contains no Hindi words the checker would fail (e.g. a jackal\'s "हुआ")', () => {
    for (const r of RETELLINGS) {
      const text = [r.title, ...r.keepNames, ...r.beats, ...(r.mustKeep ?? []), r.soften ?? ''].join(' ');
      expect(findHindiWords(text), r.id).toEqual([]);
    }
  });

  it('keeps real-person stories free of invented named characters and lectures', () => {
    const legend = formatRetelling(findRetelling('tilak-shengachi-tarphale')!);
    const truth = formatRetelling(findRetelling('gadge-baba-kharata')!);
    for (const t of [legend, truth]) {
      expect(t).toContain('Do not invent NAMED characters');
      expect(t).toContain('no lecture');
    }
    expect(formatRetelling(findRetelling('bolka-kasav')!)).not.toContain('Do not invent NAMED characters');
    // बाळ is Tilak's name, not "a baby".
    expect(findRetelling('tilak-shengachi-tarphale')!.title).not.toContain('लहान बाळ');
    expect(legend).toContain('never use बाळ to mean a baby');
  });

  it('starts as DRAFT — nothing is approved until a human checks it', () => {
    expect(RETELLINGS.every((r) => r.status === 'DRAFT')).toBe(true);
    expect(retellingsFor('6-7', { approvedOnly: true })).toEqual([]);
    expect(retellingsFor('6-7').length).toBeGreaterThan(10);
  });

  it('tells the model to say "असं सांगतात" for legends and to invent nothing about real people', () => {
    const legend = formatRetelling(findRetelling('tilak-shengachi-tarphale')!);
    expect(legend).toContain('असं सांगतात');
    expect(legend).toContain('Do NOT add any new fact');
    expect(legend).toContain('मी शेंगा खाल्ल्या नाहीत');
    const fable = formatRetelling(findRetelling('bolka-kasav')!);
    expect(fable).toContain('soft muddy pond');
    expect(fable).not.toContain('असं सांगतात');
  });
});

describe('retelling prompts', () => {
  const source = findRetelling('ekiche-bal-kabutare')!;
  const request = { age: 5 as const, category: source.category, mode: 'RANDOM' as const };
  const profile = resolveProfile(5);
  const story = storyOfWords(300);
  const ev = evaluation(9);

  it('reaches the planner, writer, critic and rewriter — and only for retellings', () => {
    const prompts = [
      buildPlannerUserPrompt({ request, profile, ingredients: {}, retell: source }),
      buildStoryWriterUserPrompt({ request, profile, plan: samplePlan, retell: source }),
      buildCriticUserPrompt({ request, profile, plan: samplePlan, story, retell: source }),
      buildRewriteUserPrompt({ request, profile, plan: samplePlan, story, evaluation: ev, failures: [], retell: source }),
    ];
    for (const p of prompts) {
      expect(p).toContain('RETELLING SOURCE');
      expect(p).toContain('चित्रग्रीव');
    }
    expect(buildPlannerUserPrompt({ request, profile, ingredients: {} })).not.toContain('RETELLING SOURCE');
  });

  it('gives the critic a drift check', () => {
    expect(CHECK_KEYS).toContain('retellingDrift');
  });
});

describe('retelling pipeline', () => {
  function capturing() {
    const fake = fakeProvider();
    const seen: Record<string, string | undefined> = {};
    const p = fake.provider;
    const wrap = <K extends 'createPlan' | 'generateStory' | 'evaluateStory'>(k: K) => {
      const original = p[k].bind(p) as (input: { retell?: { id: string } }) => Promise<never>;
      (p as unknown as Record<string, unknown>)[k] = (input: { retell?: { id: string } }) => {
        seen[k] = input.retell?.id;
        return original(input);
      };
    };
    wrap('createPlan');
    wrap('generateStory');
    wrap('evaluateStory');
    return { ...fake, seen };
  }

  it('retells with the source at every stage and marks the approved story', async () => {
    const { provider, calls, seen } = capturing();
    const r = await generateRetelling(findRetelling('ekiche-bal-kabutare')!, 5, provider);
    expect(r.status).toBe('APPROVED');
    expect(calls).not.toContain('classifyIntent');
    expect(seen).toEqual({ createPlan: 'ekiche-bal-kabutare', generateStory: 'ekiche-bal-kabutare', evaluateStory: 'ekiche-bal-kabutare' });
    if (r.status === 'APPROVED') {
      expect(r.story.sourceId).toBe('ekiche-bal-kabutare');
      expect(r.story.category).toBe('animals');
      expect(r.trace.retellingId).toBe('ekiche-bal-kabutare');
      // A retelling keeps its own characters: no invented protagonist/setting ingredients.
      expect(Object.keys(r.trace.varietyIngredients ?? {})).toEqual(['humourStyle']);
    }
  });

  it('refuses an age the outline is not meant for', async () => {
    const { provider, calls } = capturing();
    const r = await generateRetelling(findRetelling('tukaram-gatha')!, 4, provider);
    expect(r.status).toBe('INVALID_REQUEST');
    expect(calls).toEqual([]);
  });

  it('ordinary stories are unchanged and carry no source', async () => {
    const { provider, seen } = capturing();
    const r = await generateStory({ age: 6, category: 'adventure', mode: 'RANDOM' }, provider);
    expect(r.status).toBe('APPROVED');
    expect(seen.createPlan).toBeUndefined();
    if (r.status === 'APPROVED') expect(r.story.sourceId).toBeUndefined();
  });

  it('cannot be requested by the app', () => {
    expect(validateStoryRequest({ age: 6, category: 'animals', mode: 'RETELL', sourceId: 'bolka-kasav' }).ok).toBe(false);
    const ok = validateStoryRequest({ age: 6, category: 'animals', mode: 'RANDOM', retell: findRetelling('bolka-kasav') });
    expect(ok.ok && 'retell' in ok.value).toBe(false);
  });
});
