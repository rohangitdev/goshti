import { Pressable, StyleSheet, View } from 'react-native';

import { CHILD_AGES } from '@engine/index';
import type { ChildAge } from '@/types/models';
import { colors, radius, spacing, touch } from '@/theme';
import { toMarathiDigits } from '@/utils/format';

import { AppText } from './AppText';

interface Props {
  value: ChildAge | null;
  onChange: (age: ChildAge) => void;
}

export function AgeSelector({ value, onChange }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {CHILD_AGES.map((age) => {
        const selected = value === age;
        return (
          <Pressable
            key={age}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${age} वर्षं`}
            onPress={() => onChange(age)}
            style={[styles.chip, selected && styles.selected]}
          >
            <AppText variant="title" color={selected ? colors.onPrimary : colors.text}>
              {toMarathiDigits(age)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  chip: {
    width: touch.min + 8,
    height: touch.min + 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
});
