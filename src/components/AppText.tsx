import { Text, type TextProps } from 'react-native';

import { colors, type as typography } from '@/theme';

type Variant = keyof typeof typography;

interface Props extends TextProps {
  variant?: Variant;
  muted?: boolean;
  center?: boolean;
  color?: string;
}

export function AppText({ variant = 'body', muted, center, color, style, ...rest }: Props) {
  return (
    <Text
      style={[
        typography[variant],
        { color: color ?? (muted ? colors.textMuted : colors.text) },
        center && { textAlign: 'center' },
        style,
      ]}
      {...rest}
    />
  );
}
