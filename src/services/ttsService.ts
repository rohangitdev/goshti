import { estimateDurationSeconds, type AudioScript } from '@engine/index';

export interface TtsResult {
  /** Playable URL of the rendered narration; null while TTS is mocked. */
  audioUrl: string | null;
  durationSeconds: number;
}

/**
 * Renders an AudioScript (narration, dialogue, pauses, SFX, ambience) into one audio file
 * in the Aaji voice. The real implementation will run server-side.
 */
export interface TtsService {
  synthesize(script: AudioScript): Promise<TtsResult>;
}

export class MockTtsService implements TtsService {
  async synthesize(script: AudioScript): Promise<TtsResult> {
    return { audioUrl: null, durationSeconds: estimateDurationSeconds(script) };
  }
}
