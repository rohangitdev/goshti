import { describe, expect, it } from 'vitest';

import { judgeEvaluation, localStoryChecks } from '../evaluation';
import { findHindiWords } from '../hindiWords';
import { resolveProfile } from '../profiles';
import { CHECK_KEYS } from '../schemas';
import { findHardWords, isEasyName } from '../simpleWords';
import { addSentencePauses } from '../tts';
import { pickIngredients } from '../variety';
import { evaluation } from './fixtures';

const profile = resolveProfile(3);

describe('Hindi words', () => {
  it('finds Hindi words but not Marathi look-alikes', () => {
    expect(findHindiWords('सईने बाल्टी पाहिली. लेकिन चंद्र बहुत दूर होता.')).toEqual(['बाल्टी', 'लेकिन', 'बहुत']);
    // आई (mother), का (why), की (that), तो (he), दोस्त, साथ are normal Marathi.
    expect(findHindiWords('आई म्हणाली, "तो का आला की नाही?" दोस्त साथ देतो.')).toEqual([]);
    // substrings of Marathi words are not matched
    expect(findHindiWords('बहुतेक मुलं आतमध्ये होती')).toEqual([]);
    expect(findHindiWords('त्याला सजा झाली')).toEqual(['सजा']);
    expect(findHindiWords('घर सजावट करून सजवलं')).toEqual([]);
  });

  it('fails a story with Hindi and names the replacements', () => {
    const f = localStoryChecks({ title: 'सई आणि पाण्याची बाल्टी', storyText: '"चला!" सई म्हणाली.' }, profile, { enforceLength: false });
    expect(f.join()).toContain('बाल्टी → बादली');
  });

  it('allows everyday English words in Devanagari', () => {
    const f = localStoryChecks({ title: 'अ', storyText: '"बाय बाय!" सई म्हणाली. ती टीव्ही बघत होती.' }, profile, { enforceLength: false });
    expect(f).toEqual([]);
  });
});

describe('quoted dialogue', () => {
  it('fails when speech is not in quotes', () => {
    const f = localStoryChecks({ title: 'अ', storyText: 'ती म्हणाली, चला चंद्रावर जाऊया!' }, profile, { enforceLength: false });
    expect(f.join()).toContain('double quotes');
  });
});

describe('blocking critic flags', () => {
  it.each(['imitableDanger', 'looseThreads', 'hindiWords'] as const)('%s fails even with perfect scores', (flag) => {
    expect(CHECK_KEYS).toContain(flag);
    expect(judgeEvaluation(evaluation(10, { [flag]: true })).passed).toBe(false);
  });
});


describe('simple words and easy names', () => {
  it('flags bookish words for ages 2–7 but not 8–9', () => {
    const story = { title: 'अ', storyText: '"अरे!" ती म्हणाली. अनपेक्षितपणे पाऊस आला.' };
    expect(localStoryChecks(story, resolveProfile(4), { enforceLength: false, age: 4 }).join()).toContain('अनपेक्षितपणे → अचानक');
    expect(localStoryChecks(story, resolveProfile(9), { enforceLength: false, age: 9 })).toEqual([]);
    expect(findHardWords('आश्चर्यचकित झाला')).toEqual(['आश्चर्यचकित']);
  });

  it('flags names with joined consonants for ages 2–5 only', () => {
    expect(isEasyName('चिनू')).toBe(true);
    expect(isEasyName('चंदा')).toBe(true);
    expect(isEasyName('चंद्रू')).toBe(false);
    const story = { title: 'अ', storyText: '"चल!" चंद्रू म्हणाला.' };
    expect(localStoryChecks(story, resolveProfile(3), { enforceLength: false, age: 3, characterNames: ['चंद्रू'] }).join()).toContain('चंद्रू');
    expect(localStoryChecks(story, resolveProfile(7), { enforceLength: false, age: 7, characterNames: ['चंद्रू'] })).toEqual([]);
  });

  it('youngest listeners only get familiar settings', () => {
    for (let i = 0; i < 30; i++) {
      const ing = pickIngredients({ age: 2, category: 'adventure', mode: 'RANDOM' }, resolveProfile(2));
      expect(['museum', 'science fair', 'dinosaur world', 'imaginary kingdom', 'space']).not.toContain(ing.setting);
    }
  });

  it('adds short pauses between sentences for slow listening', () => {
    expect(addSentencePauses('चिनू आली. ती हसली! मग?')).toBe('चिनू आली. <short pause> ती हसली! <short pause> मग?');
  });
});
