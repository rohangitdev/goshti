import { router } from 'expo-router';

import { RoundButton } from './RoundButton';

/** Back to the previous screen, or Home if there is no history (e.g. deep link). */
export function BackButton() {
  return (
    <RoundButton
      icon="←"
      accessibilityLabel="मागे"
      size={56}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
    />
  );
}
