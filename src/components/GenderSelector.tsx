import { Pressable, StyleSheet, View } from 'react-native';

import type { ChildGender } from '@/types/models';
import { colors, radius, spacing, touch } from '@/theme';

import { AppText } from './AppText';

interface Props {
  value: ChildGender | null;
  onChange: (gender: ChildGender) => void;
}

const OPTIONS: { value: ChildGender; label: string; emoji: string }[] = [
  { value: 'BOY', label: 'मुलगा', emoji: '👦' },
  { value: 'GIRL', label: 'मुलगी', emoji: '👧' },
];

/** Boy or girl — so the stories that star the child use the right Marathi words (गेला / गेली). */
export function GenderSelector({ value, onChange }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected && styles.selected]}
          >
            <AppText variant="title" color={selected ? colors.onPrimary : colors.text}>
              {o.emoji} {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  chip: {
    flex: 1,
    minHeight: touch.min + 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
});
