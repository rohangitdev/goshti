import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { BRAND } from '@/brand';
import { AppText, BackButton, BigButton, ParentGate, PlanCard, Screen } from '@/components';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useSubscription } from '@/hooks/useSubscription';
import { feedbackService, PLANS, REACTIONS, subscriptionService, uiSoundService, type StoryReaction } from '@/services';
import { colors, radius, spacing } from '@/theme';
import type { Subscription } from '@/types/models';
import { toMarathiDigits } from '@/utils/format';

/** 8. Parent mode — behind a simple parent gate; the only place plans and prices appear. */
export default function ParentScreen() {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return (
      <Screen>
        <View style={styles.header}>
          <BackButton />
        </View>
        <View style={styles.gate}>
          <ParentGate onPass={() => setUnlocked(true)} />
        </View>
      </Screen>
    );
  }
  return <ParentSettings />;
}

function ParentSettings() {
  const { profile } = useChildProfile();
  const loadedSubscription = useSubscription();
  // Dev tools below can change the plan/usage; show their result immediately.
  const [devSubscription, setDevSubscription] = useState<Subscription | null>(null);
  const subscription = devSubscription ?? loadedSubscription;
  const [notice, setNotice] = useState<string | null>(null);
  const [appSounds, setAppSounds] = useState(true);
  const [feedback, setFeedback] = useState<Record<StoryReaction, number> | null>(null);

  useEffect(() => {
    let active = true;
    uiSoundService.isEnabled().then((on) => active && setAppSounds(on));
    feedbackService.summary().then((s) => active && setFeedback(s));
    return () => {
      active = false;
    };
  }, []);

  const toggleSounds = (on: boolean) => {
    setAppSounds(on);
    void uiSoundService.setEnabled(on);
  };

  const upgrade = async (period: 'month' | 'year') => {
    try {
      await subscriptionService.purchase('PLUS', period);
    } catch {
      setNotice(`${BRAND.plusName} लवकरच उपलब्ध होईल.`);
    }
  };

  const atLimit = !!subscription && subscription.storiesGeneratedThisMonth >= subscription.monthlyLimit;
  const feedbackTotal = feedback ? Object.values(feedback).reduce((a, b) => a + b, 0) : 0;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <BackButton />
        <View>
          <AppText variant="title">पालकांसाठी</AppText>
          <AppText variant="caption" muted>
            {BRAND.name} · {BRAND.warmName}
          </AppText>
        </View>
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
          <AppText variant="caption" muted>
            आधी ऐकलेल्या गोष्टी पुन्हा ऐकणं नेहमी मोफत आहे.
          </AppText>
          {atLimit ? (
            <AppText muted>
              या महिन्याच्या नव्या गोष्टी पूर्ण झाल्या. मुलं आवडत्या गोष्टी पुन्हा ऐकू शकतात; पुढच्या महिन्यात नव्या गोष्टी
              परत मिळतील. अधिक नव्या गोष्टी हव्या असल्यास खाली {BRAND.plusName} पाहू शकता.
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.card, styles.row]}>
        <View style={styles.rowText}>
          <AppText variant="label">ॲपमधले छोटे आवाज</AppText>
          <AppText variant="caption" muted>
            निवड, आवडती गोष्ट, गोष्ट संपल्यावरचा हलका आवाज. गोष्टीच्या आवाजावर परिणाम होत नाही.
          </AppText>
        </View>
        <Switch
          value={appSounds}
          onValueChange={toggleSounds}
          trackColor={{ true: colors.leaf, false: colors.border }}
          thumbColor={colors.surface}
          accessibilityLabel="ॲपमधले छोटे आवाज"
        />
      </View>

      {feedback && feedbackTotal > 0 ? (
        <View style={styles.card}>
          <AppText variant="label">मुलांना गोष्टी कशा वाटल्या</AppText>
          <View style={styles.feedbackRow}>
            {REACTIONS.map((r) => (
              <AppText key={r.id}>
                {r.emoji} {toMarathiDigits(feedback[r.id])}
              </AppText>
            ))}
          </View>
        </View>
      ) : null}

      <PlanCard plan={PLANS.FREE} current={subscription?.plan === 'FREE'} />
      <PlanCard plan={PLANS.PLUS} current={subscription?.plan === 'PLUS'} highlight />
      <AppText variant="caption" muted center>
        दोन्ही प्लॅनमध्ये गोष्टींचा दर्जा आणि आजीचा आवाज सारखाच आहे; {BRAND.plusName} मध्ये फक्त नव्या गोष्टी जास्त मिळतात.
      </AppText>

      {/* Developers only — never in a production build. For testing limits and plans. */}
      {__DEV__ && subscription ? (
        <View style={[styles.card, styles.devCard]}>
          <AppText variant="caption" muted>
            DEV ONLY (not in the real app)
          </AppText>
          <BigButton
            variant="secondary"
            label="Reset this month's count"
            onPress={async () => setDevSubscription(await subscriptionService.devResetUsage())}
          />
          <BigButton
            variant="secondary"
            label={subscription.plan === 'PLUS' ? 'Switch to FREE (5)' : 'Switch to PLUS (30)'}
            onPress={async () => setDevSubscription(await subscriptionService.devSetPlan(subscription.plan === 'PLUS' ? 'FREE' : 'PLUS'))}
          />
        </View>
      ) : null}

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
  gate: { flex: 1, justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  feedbackRow: { flexDirection: 'row', gap: spacing.lg },
  devCard: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  actions: { gap: spacing.md },
});
