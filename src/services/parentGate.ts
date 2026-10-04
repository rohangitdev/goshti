/**
 * A simple parent gate for the POC: a multiplication question with four choices, so a young
 * child can't wander into settings or plans by tapping. Not authentication — just a gate.
 */
export interface ParentChallenge {
  a: number;
  b: number;
  answer: number;
  choices: number[];
}

export function createParentChallenge(rng: () => number = Math.random): ParentChallenge {
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const a = int(6, 9);
  const b = int(11, 19);
  const answer = a * b;
  const choices = new Set<number>([answer]);
  const offsets = [-a, a, -10, 10, -b, b, 2 * a];
  let i = 0;
  while (choices.size < 4) {
    const candidate = answer + offsets[int(0, offsets.length - 1)] + (i++ > 20 ? i : 0);
    if (candidate > 0) choices.add(candidate);
  }
  const list = [...choices];
  for (let k = list.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [list[k], list[j]] = [list[j], list[k]];
  }
  return { a, b, answer, choices: list };
}

export function checkParentAnswer(challenge: ParentChallenge, choice: number): boolean {
  return choice === challenge.answer;
}
