import { Pressable, StyleSheet } from 'react-native';

import type { CategoryInfo } from '@engine/index';
import { colors, radius, shadow, spacing, touch } from '@/theme';

import { AppText } from './AppText';

interface Props {
  category: CategoryInfo;
  selected: boolean;
  onPress: () => void;
}

export function CategoryTile({ category, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={category.label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, selected && styles.selected, pressed && styles.pressed]}
    >
      <AppText style={styles.emoji}>{category.emoji}</AppText>
      <AppText variant="label" center>
        {category.label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: touch.large + 32,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.xs,
    ...shadow,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.surfaceWarm },
  pressed: { opacity: 0.85 },
  emoji: { fontSize: 40, lineHeight: 52 },
});
