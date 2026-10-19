/**
 * The listening half of the speech check — BACKEND ONLY. A fast Gemini model writes down
 * exactly what Aaji's rendered audio says, so it can be compared with the story text.
 * It is never told what the text should be (so it can't "hear" what it expects).
 */
import { ProviderError } from '../provider';
import type { SpeechListener } from '../speechCheck';
import { extractJson } from './gemini';
import { explainGoogleError, type GoogleAccess } from './googleAccess';

export const DEFAULT_LISTEN_MODEL = 'gemini-3.5-flash-lite';

const PROMPT =
  'Transcribe this audio word for word, exactly as it is spoken. ' +
  'Write Marathi in Devanagari. If any English is spoken, write those words in English (Latin letters) exactly as heard. ' +
  'Do not translate, correct, summarise or leave anything out. ' +
  'Return JSON only: {"transcript": "..."}';

export interface GeminiListenerConfig {
  access: GoogleAccess;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiSpeechListener implements SpeechListener {
  readonly name: string;
  private readonly fetchImpl: typeof fetch;
  private thinkingSupported = true;

  constructor(private readonly config: GeminiListenerConfig) {
    this.name = `gemini-listen:${config.model || DEFAULT_LISTEN_MODEL}`;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async transcribe(audio: { base64: string; mimeType: string }): Promise<string> {
    const model = this.config.model || DEFAULT_LISTEN_MODEL;
    for (let attempt = 0; attempt < 2; attempt++) {
      const generationConfig: Record<string, unknown> = { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 4096 };
      if (this.thinkingSupported) generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 40_000);
      let res: Response;
      try {
        res = await this.fetchImpl(this.config.access.generateContentUrl(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await this.config.access.headers()) },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType: audio.mimeType || 'audio/wav', data: audio.base64 } }, { text: PROMPT }] }],
            generationConfig,
          }),
          signal: controller.signal,
        });
      } catch (e) {
        throw new ProviderError((e as Error).name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', (e as Error).message, 'listen');
      } finally {
        clearTimeout(timer);
      }
      const json = (await res.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        const message = json.error?.message ?? `HTTP ${res.status}`;
        // Models without thinking levels reject thinkingConfig — drop it and ask again.
        if (res.status === 400 && this.thinkingSupported && /thinking/i.test(message)) {
          this.thinkingSupported = false;
          continue;
        }
        if (res.status === 401) this.config.access.invalidate();
        throw new ProviderError('HTTP_ERROR', `${explainGoogleError(message)} (model ${model})`, 'listen');
      }
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
      try {
        const parsed = extractJson(text) as { transcript?: unknown };
        if (typeof parsed.transcript === 'string') return parsed.transcript;
      } catch {
        // fall through
      }
      throw new ProviderError('MALFORMED_OUTPUT', 'listening check returned no transcript', 'listen');
    }
    throw new ProviderError('HTTP_ERROR', 'listening check unavailable', 'listen');
  }
}
