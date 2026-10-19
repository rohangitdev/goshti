import type { StoryTrace } from './types';

/**
 * Development logging. Never receives secrets (the trace has no API keys).
 * `anonymiseTrace` removes the child's name and idea before logging anywhere shared.
 */
export interface StoryLogger {
  log(trace: StoryTrace): void;
}

export type LogLevel = 'off' | 'summary' | 'full';

/** The child's name as typed, and as the hero is called in the story (Devanagari). */
function childNames(trace: StoryTrace): string[] {
  const name = trace.normalizedRequest?.childName;
  if (!name) return [];
  const hero = trace.plan?.mainCharacter?.name;
  return hero && hero !== name ? [name, hero] : [name];
}

/** Replaces the child's name (typed, or as the story's hero) with [child]. */
function hideChild(text: string, trace: StoryTrace): string {
  return childNames(trace).reduce((t, n) => (n.length >= 2 ? t.split(n).join('[child]') : t), text);
}

export function anonymiseTrace(trace: StoryTrace): StoryTrace {
  const [name, hero] = childNames(trace);
  const idea = trace.normalizedRequest?.userIdea;
  const rawIdea = (trace.request as { userIdea?: unknown } | null)?.userIdea;
  let json = JSON.stringify(trace);
  // Longest first, so a name inside the idea is still caught.
  for (const [text, label] of [
    [typeof rawIdea === 'string' ? rawIdea : undefined, '[idea]'],
    [idea, '[idea]'],
    [name, '[child]'],
    [hero, '[child]'],
  ] as const) {
    if (text && text.length >= 2) json = json.split(JSON.stringify(text).slice(1, -1)).join(label);
  }
  return JSON.parse(json) as StoryTrace;
}

export function summariseTrace(trace: StoryTrace): string {
  const req = trace.normalizedRequest;
  const last = trace.critiques[trace.critiques.length - 1];
  return [
    `[goshti] ${trace.outcome}`,
    req ? `age=${req.age} ${req.category} ${req.mode}` : 'invalid request',
    `attempts=${trace.attemptCount}`,
    last ? `lastPass=${last.passed}` : '',
    `title="${hideChild(trace.finalStory?.title ?? '', trace)}"`,
    `provider=${trace.provider.name}`,
    `${trace.totalMs}ms`,
    trace.errors.length ? `errors=${trace.errors.join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function createConsoleLogger(level: LogLevel): StoryLogger {
  return {
    log(trace) {
      if (level === 'off') return;
      if (level === 'summary') console.log(summariseTrace(trace));
      else console.log(JSON.stringify(anonymiseTrace(trace), null, 2));
    },
  };
}
