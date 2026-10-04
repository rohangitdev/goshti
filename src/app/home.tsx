import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CATEGORIES, type StoryCategory } from '@engine/index';
import { AppText, BigButton, CategoryTile, Screen } from '@/components';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useStoryWarmUp } from '@/hooks/useStoryWarmUp';
import { colors, spacing } from '@/theme';

/** 3. Home — pick a category, then who chooses the story. */
export default function HomeScreen() {
  const { profile } = useChildProfile();
  useStoryWarmUp();
  const [category, setCategory] = useState<StoryCategory | null>(null);

  const footer = category ? (
    <>
      <BigButton
        icon="👵🏽"
        label="आजीने गोष्ट निवडावी"
        onPress={() => router.push({ pathname: '/generating', params: { category, mode: 'RANDOM' } })}
      />
      <BigButton
        icon="💭"
        variant="secondary"
        label="माझ्या कल्पनेची गोष्ट"
        onPress={() => router.push({ pathname: '/idea', params: { category } })}
      />
    </>
  ) : null;

  return (
    <Screen scroll footer={footer}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="माझ्या गोष्टी"
          onPress={() => router.push('/stories')}
          style={styles.topLink}
        >
          <AppText variant="label" color={colors.primary}>
            📚 माझ्या गोष्टी
          </AppText>
        </Pressable>
        {/* Parent mode: long-press so a quick tap from a child doesn't open it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="पालकांसाठी, दाबून ठेवा"
          accessibilityHint="पालक विभाग उघडण्यासाठी दाबून ठेवा"
          onLongPress={() => router.push('/parent')}
          delayLongPress={1200}
          style={styles.topLink}
        >
          <AppText variant="caption" muted>
            पालक ⚙︎
          </AppText>
        </Pressable>
      </View>

      <View style={styles.heading}>
        {profile ? (
          <AppText variant="label" muted>
            नमस्कार {profile.name}!
          </AppText>
        ) : null}
        <AppText variant="title">आज कोणती गोष्ट ऐकायची?</AppText>
      </View>

      <View style={styles.grid}>
        {CATEGORIES.map((c) => (
          <CategoryTile key={c.id} category={c} selected={category === c.id} onPress={() => setCategory(c.id)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topLink: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.xs },
  heading: { gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
