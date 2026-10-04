import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { AppText } from './AppText';

interface Props {
  /** "scene" = Aaji in her chair with children (Welcome). "portrait" = Aaji alone. */
  variant?: 'scene' | 'portrait';
  size?: number;
}

/**
 * PLACEHOLDER ARTWORK. Replace the inner content with the real illustration
 * (e.g. an <Image>) — keep the frame dimensions so layouts don't shift.
 */
export function AajiIllustration({ variant = 'portrait', size = 220 }: Props) {
  const scene = variant === 'scene';
  return (
    <View
      accessible
      accessibilityLabel={scene ? 'आजी खुर्चीत बसून मुलांना गोष्ट सांगते आहे' : 'आजी'}
      style={[styles.frame, { width: scene ? size * 1.3 : size, height: size }]}
    >
      <View style={styles.lamp} />
      <AppText style={{ fontSize: size * 0.38, lineHeight: size * 0.48 }}>👵🏽</AppText>
      <AppText style={{ fontSize: size * 0.12, lineHeight: size * 0.16 }}>🪑</AppText>
      {scene ? (
        <View style={styles.children}>
          <AppText style={{ fontSize: size * 0.16, lineHeight: size * 0.22 }}>🧒🏽</AppText>
          <AppText style={{ fontSize: size * 0.16, lineHeight: size * 0.22 }}>👧🏽</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    overflow: 'hidden',
  },
  lamp: {
    position: 'absolute',
    top: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.accent,
    opacity: 0.18,
  },
  children: { flexDirection: 'row', gap: 24, marginTop: 4 },
});
