import { describe, expect, it } from 'vitest';

import { ProviderError } from '../provider';
import { pcmToWav } from '../providers/geminiTts';
import { GeminiSpeechListener } from '../providers/geminiListen';
import { vertexAccess } from '../providers/googleAccess';
import {
  CheckedSpeechSynthesizer,
  judgeDuration,
  judgeTranscript,
  spokenText,
  wavSeconds,
  type SpeechListener,
} from '../speechCheck';
import type { SpeechSynthesizer, TtsChunk } from '../tts';

const TEXT = 'एक होता हत्ती. त्याला चंद्रावर जायचं होतं. एके दिवशी त्याने एक मोठी शिडी बनवली आणि तो वर वर चढू लागला.';
const chunk: TtsChunk = {
  index: 0,
  parts: [{ text: `${TEXT} <short pause>`, style: 'a warm, affectionate Marathi grandmother; now warm and loving' }],
  cues: [],
  cueAt: [],
  pauseAfterMs: 0,
};

/** WAV whose header says 100 Hz mono 16-bit: `seconds` long with only 200 bytes a second. */
const wavOf = (seconds: number) => btoa(String.fromCharCode(...pcmToWav(new Uint8Array(Math.round(seconds * 200)), 100)));

describe('listening check — judging what was heard', () => {
  it('passes a faithful reading, and ignores pause tags in the text', () => {
    expect(spokenText(chunk)).toBe(TEXT);
    const v = judgeTranscript(TEXT, 'एक होता हत्ती त्याला चंद्रावर जायचं होतं एके दिवशी त्यानं एक मोठी शिडी बनवली आणि तो वर वर चढू लागला');
    expect(v.problems).toEqual([]);
    expect(v.ratio).toBeGreaterThan(0.9);
  });

  it('fails when the model reads its directions aloud', () => {
    const v = judgeTranscript(TEXT, `A warm, affectionate Marathi grandmother telling a story: ${TEXT}`);
    expect(v.problems.join()).toMatch(/read directions aloud/);
  });

  it('fails when a pause tag is spoken as words', () => {
    expect(judgeTranscript(TEXT, `${TEXT} short pause`).problems.join()).toMatch(/read directions aloud \(short, pause\)/);
    expect(judgeTranscript(TEXT, `${TEXT} शॉर्ट पॉज`).problems.join()).toMatch(/read directions aloud/);
  });

  it('fails on other English, on extra speech, and on missing text', () => {
    expect(judgeTranscript(TEXT, `${TEXT} okay here we go now`).problems.join()).toMatch(/spoke English words/);
    expect(judgeTranscript(TEXT, `${TEXT} ${TEXT}`).problems.join()).toMatch(/extra speech/);
    expect(judgeTranscript(TEXT, 'एक होता हत्ती').problems.join()).toMatch(/text missing/);
  });

  it("doesn't count English that is really in the story (a child's name typed in English)", () => {
    expect(judgeTranscript(`Rohan म्हणाला, ${TEXT}`, `Rohan म्हणाला ${TEXT}`).problems).toEqual([]);
  });

  it('checks that the audio is a believable length', () => {
    expect(judgeDuration(chunk, 1)).toEqual([expect.stringMatching(/audio too short/)]);
    expect(judgeDuration(chunk, 12)).toEqual([]);
    expect(judgeDuration(chunk, 200)).toEqual([expect.stringMatching(/audio too long/)]);
    expect(wavSeconds(wavOf(12))).toBeCloseTo(12, 1);
  });
});

function fakeSynth(outputs: string[]): SpeechSynthesizer & { calls: number } {
  const synth = {
    name: 'fake',
    calls: 0,
    async synthesize() {
      const base64 = outputs[Math.min(synth.calls, outputs.length - 1)];
      synth.calls += 1;
      return { mimeType: 'audio/wav', base64, model: 'gemini-3.8-flash-tts' };
    },
  };
  return synth;
}

function fakeListener(transcripts: (string | Error)[]): SpeechListener & { calls: number } {
  const listener = {
    name: 'fake-listener',
    calls: 0,
    async transcribe() {
      const t = transcripts[Math.min(listener.calls, transcripts.length - 1)];
      listener.calls += 1;
      if (t instanceof Error) throw t;
      return t;
    },
  };
  return listener;
}

describe('listening check — before a part leaves the backend', () => {
  it('renders again when the first try read its directions, and returns the clean one', async () => {
    const synth = fakeSynth([wavOf(14), wavOf(12)]);
    const listener = fakeListener([`A warm Marathi grandmother: ${TEXT}`, TEXT]);
    const lines: string[] = [];
    const checked = new CheckedSpeechSynthesizer(synth, listener, { log: (l) => lines.push(l) });
    const out = await checked.synthesize(chunk, 'Aoede');
    expect(synth.calls).toBe(2);
    expect(out.check).toMatchObject({ checked: 'listened', attempts: 2 });
    expect(out.base64).toBe(wavOf(12));
    expect(lines[0]).toMatch(/FAILED .*read directions aloud/);
    // Logs carry numbers, never the story text.
    expect(lines.join('\n')).not.toContain('हत्ती');
  });

  it('fails the part (never returns bad audio) when every try is bad', async () => {
    const checked = new CheckedSpeechSynthesizer(fakeSynth([wavOf(14)]), fakeListener([`Say warmly: ${TEXT}`]));
    const err = await checked.synthesize(chunk, 'Aoede').catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('MALFORMED_OUTPUT');
    expect(err.message).toMatch(/failed the listening check/);
  });

  it("doesn't trust a part it couldn't listen to", async () => {
    const listener = fakeListener([new Error('busy'), new Error('busy')]);
    const err = await new CheckedSpeechSynthesizer(fakeSynth([wavOf(12)]), listener).synthesize(chunk, 'Aoede').catch((e) => e);
    expect(err.message).toMatch(/listening check unavailable/);
    expect(listener.calls).toBe(2);
  });

  it('catches audio that stopped early without needing to listen', async () => {
    const listener = fakeListener([TEXT]);
    const err = await new CheckedSpeechSynthesizer(fakeSynth([wavOf(0.5)]), listener).synthesize(chunk, 'Aoede').catch((e) => e);
    expect(err.message).toMatch(/audio too short/);
    expect(listener.calls).toBe(0);
  });

  it('length-only when listening is switched off', async () => {
    const out = await new CheckedSpeechSynthesizer(fakeSynth([wavOf(12)]), null).synthesize(chunk, 'Aoede');
    expect(out.check.checked).toBe('length-only');
  });
});

describe('Gemini listener', () => {
  it('sends only the audio and a fixed instruction (never the expected text) and reads the transcript', async () => {
    const bodies: string[] = [];
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1) return new Response(JSON.stringify({ error: { message: 'thinking_level is not supported' } }), { status: 400 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: `{"transcript": "${TEXT}"}` }] } }] }));
    }) as typeof fetch;
    const listener = new GeminiSpeechListener({ access: vertexAccess({ project: 'p', apiKey: 'v' }), fetchImpl });
    expect(await listener.transcribe({ base64: wavOf(1), mimeType: 'audio/wav' })).toBe(TEXT);
    const body = JSON.parse(bodies[1]);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('audio/wav');
    expect(body.contents[0].parts[1].text).toMatch(/Transcribe this audio word for word/);
    expect(bodies[1]).not.toContain('हत्ती');
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });
});
