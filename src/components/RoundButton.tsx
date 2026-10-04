import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, shadow } from '@/theme';

import { AppText } from './AppText';

interface Props {
  icon: string;
  accessibilityLabel: string;
  onPress: () => void;
  size?: number;
  filled?: boolean;
  disabled?: boolean;
  iconColor?: string;
}

export function RoundButton({ icon, accessibilityLabel, onPress, size = 64, filled = false, disabled, iconColor }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size },
        filled ? styles.filled : styles.outline,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <AppText style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }} color={iconColor ?? (filled ? colors.onPrimary : colors.text)}>
        {icon}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  filled: { backgroundColor: colors.primary, ...shadow },
  outline: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border },
});
