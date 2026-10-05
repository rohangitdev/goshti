/**
 * One audio-session setup for story playback: plays with the iPhone silent switch on, keeps going
 * when the screen locks or the app goes to the background (needs an installed build — not Expo Go),
 * and asks other apps' music to pause while Aaji tells the story.
 */
import { setAudioModeAsync } from 'expo-audio';

export function prepareStoryAudio(): Promise<void> {
  return setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  }).catch(() => {});
}
