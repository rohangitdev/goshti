import { describe, expect, it } from 'vitest';

import { judgeEvaluation, localStoryChecks } from '../evaluation';
import { findHindiWords } from '../hindiWords';
import { resolveProfile } from '../profiles';
import { CHECK_KEYS } from '../schemas';
import { evaluation } from './fixtures';

const profile = resolveProfile(3);

describe('Hindi words', () => {
  it('finds Hindi words but not Marathi look-alikes', () => {
    expect(findHindiWords('सईने बाल्टी पाहिली. लेकिन चंद्र बहुत दूर होता.')).toEqual(['बाल्टी', 'लेकिन', 'बहुत']);
    // आई (mother), का (why), की (that), तो (he), दोस्त, साथ are normal Marathi.
    expect(findHindiWords('आई म्हणाली, "तो का आला की नाही?" दोस्त साथ देतो.')).toEqual([]);
    // substrings of Marathi words are not matched
    expect(findHindiWords('बहुतेक मुलं आतमध्ये होती')).toEqual([]);
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
