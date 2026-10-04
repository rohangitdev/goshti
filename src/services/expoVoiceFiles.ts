import { Directory, File, Paths } from 'expo-file-system';

import type { VoiceFileStore } from './voiceService';

/** Audio parts are kept in the app's document folder (not cache), so stories replay offline. */
export class ExpoVoiceFileStore implements VoiceFileStore {
  private dir(storyId: string) {
    const dir = new Directory(Paths.document, 'goshti-voice', storyId);
    dir.create({ intermediates: true, idempotent: true });
    return dir;
  }

  async save(storyId: string, index: number, base64: string): Promise<string> {
    const file = new File(this.dir(storyId), `part-${index}.wav`);
    file.write(base64, { encoding: 'base64' });
    return file.uri;
  }

  async remove(storyId: string): Promise<void> {
    const dir = new Directory(Paths.document, 'goshti-voice', storyId);
    if (dir.exists) dir.delete();
  }
}
