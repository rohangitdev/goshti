import { StyleSheet, View } from 'react-native';

import type { PlanDefinition } from '@/services';
import { colors, radius, shadow, spacing } from '@/theme';
import { toMarathiDigits } from '@/utils/format';

import { AppText } from './AppText';

interface Props {
  plan: PlanDefinition;
  current: boolean;
  highlight?: boolean;
}

const PERIOD_LABEL = { month: '/महिना', year: '/वर्ष' } as const;

export function PlanCard({ plan, current, highlight }: Props) {
  return (
    <View style={[styles.card, highlight && styles.highlight]}>
      <View style={styles.header}>
        <AppText variant="heading">{plan.id === 'FREE' ? 'मोफत' : plan.name}</AppText>
        {current ? (
          <View style={styles.tag}>
            <AppText variant="caption" color={colors.onPrimary}>
              सध्याचा प्लॅन
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText>दर महिन्याला {toMarathiDigits(plan.monthlyLimit)} नव्या गोष्टी</AppText>
      {plan.prices.length > 0 ? (
        <View style={styles.prices}>
          {plan.prices.map((p) => (
            <AppText key={p.period} variant="title" color={colors.primary}>
              {p.label}
              <AppText variant="body" muted>
                {PERIOD_LABEL[p.period]}
              </AppText>
            </AppText>
          ))}
        </View>
      ) : (
        <AppText muted>₹० </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm, ...shadow },
  highlight: { borderWidth: 2, borderColor: colors.accent },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tag: { backgroundColor: colors.leaf, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  prices: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
});
