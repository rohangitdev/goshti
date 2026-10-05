import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';
import type { SceneId } from '@/utils/scene';

import { AajiScene } from './AajiScene';

interface Props {
  /** "scene" = Aaji with two children listening (Welcome). "portrait" = Aaji alone. */
  variant?: 'scene' | 'portrait';
  /** Height of the picture; width follows the scene's 13:10 shape (and never overflows). */
  size?: number;
  /** Where Aaji is telling the story (defaults to her room). */
  scene?: SceneId;
}

/** Aaji telling a story, in one of her scenes. Same frame everywhere so layouts stay stable. */
export function AajiIllustration({ variant = 'portrait', size = 220, scene = 'room' }: Props) {
  return (
    <View style={[styles.frame, { width: size * 1.3, maxWidth: '100%' }]}>
      <AajiScene scene={scene} withChildren={variant === 'scene'} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    aspectRatio: 1.3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceWarm,
  },
});
