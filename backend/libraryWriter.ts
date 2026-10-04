/**
 * Dev-only: appends a reviewer-approved story to story-engine/library/added.ts.
 * Rebuild/redeploy afterwards so the app and backend include it.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { CATEGORY_IDS } from '../story-engine/categories';
import { findHindiWords } from '../story-engine/hindiWords';
import type { LibraryStory } from '../story-engine/library/stories';
import { VOICE_STYLES, type VoiceStyle } from '../story-engine/schemas';
import type { AudioScript } from '../story-engine/types';

interface AddInput {
  story?: {
    title?: string;
    storyText?: string;
    ageBand?: string;
    category?: string;
    positiveValue?: string;
    audioScript?: AudioScript;
  };
}

const BANDS = ['2-3', '4-5', '6-7', '8-9'];

export function addToLibrary(body: unknown, file: string): { ok: boolean; id?: string; error?: string } {
  const s = (body as AddInput)?.story;
  if (!s?.title || !s.storyText || !s.audioScript) return { ok: false, error: 'missing story' };
  if (!BANDS.includes(String(s.ageBand)) || !(CATEGORY_IDS as readonly string[]).includes(String(s.category))) {
    return { ok: false, error: 'bad ageBand or category' };
  }
  if (findHindiWords(s.title + ' ' + s.storyText).length) return { ok: false, error: 'contains Hindi words' };

  const voices: Record<string, VoiceStyle> = {};
  const quoteSpeakers: string[] = [];
  for (const seg of s.audioScript.segments) {
    if (seg.type !== 'DIALOGUE') continue;
    quoteSpeakers.push(seg.character);
    if (!voices[seg.character]) {
      voices[seg.character] = (VOICE_STYLES as readonly string[]).includes(seg.voiceStyle ?? '') ? seg.voiceStyle! : 'AAJI';
    }
  }
  const ambience = s.audioScript.segments.find((x) => x.type === 'AMBIENCE')?.soundId;

  const id = `reviewed-${Date.now().toString(36)}`;
  const entry: LibraryStory = {
    id,
    title: s.title,
    ageBand: s.ageBand as LibraryStory['ageBand'],
    category: s.category as LibraryStory['category'],
    positiveValue: s.positiveValue ?? '',
    voices: Object.keys(voices).length ? voices : { आजी: 'AAJI' },
    quoteSpeakers,
    ...(ambience && { ambience }),
    storyText: s.storyText,
  };

  const source = readFileSync(file, 'utf8');
  const marker = 'export const ADDED: LibraryStory[] = [';
  const at = source.indexOf(marker);
  if (at < 0) return { ok: false, error: 'added.ts has an unexpected format' };
  const insertAt = at + marker.length;
  const updated = `${source.slice(0, insertAt)}\n  ${JSON.stringify(entry, null, 2).replace(/\n/g, '\n  ')},${source.slice(insertAt)}`;
  writeFileSync(file, updated);
  return { ok: true, id };
}
