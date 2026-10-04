import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, BackButton, BigButton, PlanCard, Screen } from '@/components';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useSubscription } from '@/hooks/useSubscription';
import { PLANS, subscriptionService } from '@/services';
import { colors, radius, spacing } from '@/theme';
import { toMarathiDigits } from '@/utils/format';

/** 8. Parent / Upgrade — the only place plans and prices appear. */
export default function ParentScreen() {
  const { profile } = useChildProfile();
  const subscription = useSubscription();
  const [notice, setNotice] = useState<string | null>(null);

  const upgrade = async (period: 'month' | 'year') => {
    try {
      await subscriptionService.purchase('PLUS', period);
    } catch {
      setNotice('GOSHTI Plus लवकरच उपलब्ध होईल.');
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">पालकांसाठी</AppText>
      </View>

      {profile ? (
        <View style={styles.card}>
          <AppText variant="label">
            {profile.name} · {toMarathiDigits(profile.age)} वर्षं
          </AppText>
          <BigButton variant="secondary" label="माहिती बदला" onPress={() => router.push('/setup')} />
        </View>
      ) : null}

      {subscription ? (
        <View style={styles.card}>
          <AppText variant="label">या महिन्यातल्या नव्या गोष्टी</AppText>
          <AppText variant="title" color={colors.primary}>
            {toMarathiDigits(subscription.storiesGeneratedThisMonth)} / {toMarathiDigits(subscription.monthlyLimit)}
          </AppText>
        </View>
      ) : null}

      <PlanCard plan={PLANS.FREE} current={subscription?.plan === 'FREE'} />
      <PlanCard plan={PLANS.PLUS} current={subscription?.plan === 'PLUS'} highlight />

      {subscription?.plan !== 'PLUS' ? (
        <View style={styles.actions}>
          <BigButton label="₹99 / महिना" onPress={() => upgrade('month')} />
          <BigButton variant="secondary" label="₹799 / वर्ष" onPress={() => upgrade('year')} />
          {notice ? (
            <AppText center muted>
              {notice}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  actions: { gap: spacing.md },
});
