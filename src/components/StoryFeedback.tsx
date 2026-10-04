import { Pressable, StyleSheet, View } from 'react-native';

import { REACTIONS, type StoryReaction } from '@/services';
import { colors, radius, spacing, touch } from '@/theme';

import { AppText } from './AppText';

interface Props {
  value: StoryReaction | null;
  onChange: (reaction: StoryReaction) => void;
}

/** Optional "how was it?" — three big faces, no pressure, no reward. */
export function StoryFeedback({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <AppText variant="label" center muted>
        गोष्ट कशी वाटली?
      </AppText>
      <View style={styles.row}>
        {REACTIONS.map((r) => {
          const selected = value === r.id;
          return (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(r.id)}
              style={({ pressed }) => [styles.face, selected && styles.selected, pressed && { opacity: 0.8 }]}
            >
              <AppText style={styles.emoji}>{r.emoji}</AppText>
              <AppText variant="caption" center>
                {r.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  face: {
    flex: 1,
    minHeight: touch.large,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xs,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.surfaceWarm },
  emoji: { fontSize: 32, lineHeight: 42 },
});
