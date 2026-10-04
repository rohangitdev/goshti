import { Pressable, StyleSheet, View } from 'react-native';

import { getCategory } from '@engine/index';
import type { GoshtiStory } from '@/types/models';
import { colors, radius, shadow, spacing, touch } from '@/theme';
import { formatMinutes } from '@/utils/format';

import { AppText } from './AppText';

interface Props {
  story: GoshtiStory;
  isFavourite: boolean;
  onPress: () => void;
}

export function StoryListItem({ story, isFavourite, onPress }: Props) {
  const category = getCategory(story.category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${story.title}, ऐका`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.badge}>
        <AppText style={styles.emoji}>{category.emoji}</AppText>
      </View>
      <View style={styles.body}>
        <AppText variant="label" numberOfLines={2}>
          {story.title}
        </AppText>
        <AppText variant="caption" muted>
          {category.label} · {formatMinutes(story.durationSeconds)}
        </AppText>
      </View>
      {isFavourite ? <AppText variant="heading" color={colors.favourite}>♥</AppText> : null}
      <AppText variant="heading" color={colors.primary}>
        ▶
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: touch.large,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...shadow,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 28, lineHeight: 36 },
  body: { flex: 1, gap: 2 },
});
