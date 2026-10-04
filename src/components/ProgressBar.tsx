import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

interface Props {
  /** 0–1 */
  progress: number;
}

export function ProgressBar({ progress }: Props) {
  const pct = Math.min(1, Math.max(0, progress)) * 100;
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceWarm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
});
