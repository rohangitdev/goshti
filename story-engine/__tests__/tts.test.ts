import { describe, expect, it } from 'vitest';

import { buildAudioScript } from '../audio';
import { ensureWav, findAudio, GeminiSpeechSynthesizer, pcmToWav } from '../providers/geminiTts';
import { AUDITION_CHUNK, buildTtsChunks } from '../tts';

const story = Array.from({ length: 12 }, (_, i) => `परिच्छेद ${i + 1}: चिनू खारूताई पळत पळत गेली. "थांब!" आजी म्हणाली.`).join('\n\n');

describe('TTS chunking', () => {
  const { script } = buildAudioScript(story, {
    speakers: [{ quote: 1, character: 'आजी', voiceStyle: 'AAJI' }],
    narration: [{ paragraph: 1, emotion: 'curious' }],
    cues: [{ afterParagraph: 2, type: 'SFX', soundId: 'BIRDS' }, { afterParagraph: 3, type: 'PAUSE', durationMs: 2000 }],
  });
  const chunks = buildTtsChunks(script, { targetChars: 200 });

  it('splits at paragraph pauses into several short chunks, keeping every word', () => {
    expect(chunks.length).toBeGreaterThan(2);
    const spoken = chunks.flatMap((c) => c.parts.map((p) => p.text)).join(' ').replace(/<[^>]+>/g, '');
    for (let i = 1; i <= 12; i++) expect(spoken).toContain(`परिच्छेद ${i}`);
  });

  it('styles narration and dialogue differently and turns long pauses into tags', () => {
    const styles = chunks.flatMap((c) => c.parts.map((p) => p.style));
    expect(styles.some((s) => s.includes('curious'))).toBe(true);
    expect(styles.some((s) => s.includes('performing आजी'))).toBe(true);
    expect(chunks.flatMap((c) => c.parts.map((p) => p.text)).join(' ')).toMatch(/<(short|long) pause>/);
  });

  it('keeps sound effects as cues, never as spoken text', () => {
    expect(chunks.flatMap((c) => c.cues).some((c) => c.type === 'SFX')).toBe(true);
    expect(JSON.stringify(chunks.map((c) => c.parts))).not.toContain('BIRDS');
  });

  it('audition uses a fixed sample, not user text', () => {
    expect(AUDITION_CHUNK.parts.length).toBeGreaterThan(1);
  });
});

describe('Gemini TTS response handling', () => {
  it('finds base64 audio anywhere in the response', () => {
    const data = 'A'.repeat(200);
    expect(findAudio({ steps: [{ content: [{ type: 'audio', data, mime_type: 'audio/wav' }] }] })).toEqual({ base64: data, mimeType: 'audio/wav' });
    expect(findAudio({ outputs: [{ text: 'hi' }] })).toBeNull();
  });

  it('wraps raw PCM in a WAV header', () => {
    const wav = pcmToWav(new Uint8Array(480), 24000);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    const pcmB64 = btoa(String.fromCharCode(...new Uint8Array(300).fill(1)));
    expect(ensureWav(pcmB64, 'audio/l16;rate=24000').base64.startsWith('UklGR')).toBe(true);
  });

  it('sends per-line styles, voice, store:false and falls back to the next model on quota', async () => {
    const bodies: Record<string, unknown>[] = [];
    const wav = btoa(String.fromCharCode(...pcmToWav(new Uint8Array(400))));
    const responses = [
      new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 }),
      new Response(JSON.stringify({ steps: [{ content: [{ type: 'audio', data: wav, mime_type: 'audio/wav' }] }] })),
    ];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return responses.shift()!;
    }) as unknown as typeof fetch;
    const tts = new GeminiSpeechSynthesizer({ apiKey: 'k', model: 'tts-a', fallbackModels: 'tts-b', fetchImpl });
    const out = await tts.synthesize(AUDITION_CHUNK, 'Sulafat');
    expect(out.model).toBe('tts-b');
    expect(out.base64.startsWith('UklGR')).toBe(true);
    const b = bodies[0] as { store: boolean; generation_config: unknown; input: { content: { annotations: { style: string }[] }[] }[] };
    expect(b.store).toBe(false);
    expect(b.generation_config).toEqual({ speech_config: [{ voice: 'Sulafat' }] });
    expect(b.input[0].content).toHaveLength(AUDITION_CHUNK.parts.length);
    expect(b.input[0].content[0].annotations[0].style).toContain('grandmother');
  });
});
