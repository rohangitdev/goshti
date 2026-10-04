import { describe, expect, it } from 'vitest';

import { startPipeline } from '../../story-engine/pipeline';
import { MockStoryAIProvider } from '../../story-engine/providers/mock';
import { openState, sealState } from '../continuation';

const started = startPipeline({ age: 4, category: 'magic', mode: 'RANDOM', childName: 'आर्या' }, new MockStoryAIProvider());
const state = 'state' in started ? started.state : null!;

describe('continuation tokens', () => {
  it('round-trips the state', async () => {
    const token = await sealState(state, 's3cret');
    expect(await openState(token, 's3cret')).toEqual(state);
  });

  it('is encrypted (internals not readable by the client)', async () => {
    const token = await sealState(state, 's3cret');
    expect(token).not.toContain('magic');
    expect(atob(token.slice(3).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil((token.length - 3) / 4) * 4, '='))).not.toContain('magic');
  });

  it('rejects tampered tokens and wrong secrets', async () => {
    const token = await sealState(state, 's3cret');
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(await openState(tampered, 's3cret')).toBeNull();
    expect(await openState(token, 'other')).toBeNull();
    expect(await openState('garbage', 's3cret')).toBeNull();
    expect(await openState(42, 's3cret')).toBeNull();
  });
});
