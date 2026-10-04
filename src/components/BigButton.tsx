import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { colors, radius, shadow, spacing, touch } from '@/theme';

import { AppText } from './AppText';

interface Props extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary';
}

export function BigButton({ label, icon, variant = 'primary', disabled, ...rest }: Props) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        disabled && styles.disabled,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {icon ? <AppText variant="heading">{icon}</AppText> : null}
        <AppText variant="label" color={primary ? colors.onPrimary : colors.text}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.min,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primary: { backgroundColor: colors.primary, ...shadow },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border },
  secondaryPressed: { backgroundColor: colors.surfaceWarm },
  disabled: { opacity: 0.5 },
});
