import { isAllowedAmbience, isAllowedSfx } from './sfx';
import type { AudioScript, EvaluationIssue, StoryRequest } from './types';

export const MAX_IDEA_LENGTH = 200;

/**
 * The child's idea is a story *seed*, not a prompt. It is trimmed, length-capped and
 * stripped of control characters before it goes anywhere near a model.
 * Content safety of the idea itself is the evaluator's / model provider's job later.
 */
export function sanitizeUserIdea(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_IDEA_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function normalizeRequest(request: StoryRequest): StoryRequest {
  const userIdea = request.mode === 'CUSTOM' ? sanitizeUserIdea(request.userIdea) : undefined;
  return { ...request, userIdea };
}

/** Structural validation of an audio script: ordering and allowed sound IDs only. */
export function validateAudioScript(script: AudioScript): EvaluationIssue[] {
  const issues: EvaluationIssue[] = [];

  if (script.segments.length === 0) {
    issues.push({ check: 'AUDIO_SCRIPT_VALID', severity: 'BLOCKER', message: 'Audio script has no segments.' });
  }

  script.segments.forEach((segment, index) => {
    if (segment.order !== index) {
      issues.push({
        check: 'AUDIO_SCRIPT_VALID',
        severity: 'BLOCKER',
        message: `Segment at position ${index} has order ${segment.order}.`,
      });
    }
    if (segment.type === 'SFX' && !isAllowedSfx(segment.sfxId)) {
      issues.push({
        check: 'AUDIO_SCRIPT_VALID',
        severity: 'BLOCKER',
        message: `SFX "${segment.sfxId}" is not in the predefined library.`,
      });
    }
    if (segment.type === 'AMBIENCE' && !isAllowedAmbience(segment.ambienceId)) {
      issues.push({
        check: 'AUDIO_SCRIPT_VALID',
        severity: 'BLOCKER',
        message: `Ambience "${segment.ambienceId}" is not in the predefined library.`,
      });
    }
    if ((segment.type === 'NARRATION' || segment.type === 'DIALOGUE') && segment.text.trim() === '') {
      issues.push({ check: 'AUDIO_SCRIPT_VALID', severity: 'BLOCKER', message: `Empty text at segment ${index}.` });
    }
    if (segment.type === 'PAUSE' && (segment.durationMs <= 0 || segment.durationMs > 5000)) {
      issues.push({
        check: 'AUDIO_SCRIPT_VALID',
        severity: 'WARNING',
        message: `Pause at segment ${index} should be between 1 and 5000 ms.`,
      });
    }
  });

  return issues;
}

/** Rough listening time for an audio script (Aaji speaks slowly). */
export function estimateDurationSeconds(script: AudioScript, wordsPerMinute = 95): number {
  let ms = 0;
  for (const segment of script.segments) {
    switch (segment.type) {
      case 'NARRATION':
      case 'DIALOGUE': {
        const words = segment.text.trim().split(/\s+/).length;
        ms += (words / wordsPerMinute) * 60_000;
        break;
      }
      case 'PAUSE':
        ms += segment.durationMs;
        break;
      case 'SFX':
        ms += 1200;
        break;
      case 'AMBIENCE':
        break;
    }
  }
  return Math.max(1, Math.round(ms / 1000));
}

/** Plain text of everything Aaji says, in order. */
export function audioScriptToText(script: AudioScript): string {
  return script.segments
    .filter((s): s is Extract<typeof s, { text: string }> => s.type === 'NARRATION' || s.type === 'DIALOGUE')
    .map((s) => s.text)
    .join('\n');
}
