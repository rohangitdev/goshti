import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8'));

describe('test versions published to the phone (Expo Go)', () => {
  it("marks updates for the Expo Go of this SDK (Expo Go only opens updates made for its own SDK)", () => {
    const sdkMajor = String(read('node_modules/expo/package.json').version).split('.')[0];
    expect(read('app.json').expo.runtimeVersion).toBe(`exposdk:${sdkMajor}.0.0`);
  });

  it('points updates at the linked Expo project (once it is linked)', () => {
    const expo = read('app.json').expo;
    const id = expo.extra?.eas?.projectId;
    if (id) expect(expo.updates?.url).toBe(`https://u.expo.dev/${id}`);
  });
});
