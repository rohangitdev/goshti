import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CATEGORIES, type StoryCategory } from '@engine/index';
import { BRAND } from '@/brand';
import { AppText, BigButton, CategoryTile, Screen } from '@/components';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useStoryWarmUp } from '@/hooks/useStoryWarmUp';
import { uiSoundService } from '@/services';
import { colors, spacing } from '@/theme';

/** 3. Home — pick a category, then who chooses the story. */
export default function HomeScreen() {
  const { profile } = useChildProfile();
  useStoryWarmUp();
  const [category, setCategory] = useState<StoryCategory | null>(null);
  // A quick tap on "पालक" only shows how to open it (press and hold) — a child's tap never opens it.
  const [parentHint, setParentHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);
  const showParentHint = () => {
    setParentHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setParentHint(false), 3500);
  };
  const chooseCategory = (id: StoryCategory) => {
    if (id !== category) uiSoundService.play('CATEGORY_SELECTED');
    setCategory(id);
  };

  const footer = category ? (
    <>
      <BigButton
        icon="👵🏽"
        label="आजीने गोष्ट निवडावी"
        onPress={() => {
          uiSoundService.play('AAJI_CHOOSES_STORY');
          router.push({ pathname: '/generating', params: { category, mode: 'RANDOM' } });
        }}
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
        {/* Parent mode: press and hold, so a quick tap from a child doesn't open it (a tap shows how). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="पालकांसाठी, दाबून ठेवा"
          accessibilityHint="पालक विभाग उघडण्यासाठी दाबून ठेवा"
          onPress={showParentHint}
          onLongPress={() => {
            setParentHint(false);
            router.push('/parent');
          }}
          delayLongPress={700}
          hitSlop={8}
          style={({ pressed }) => [styles.topLink, pressed && styles.pressed]}
        >
          <AppText variant="caption" muted>
            पालक ⚙︎
          </AppText>
        </Pressable>
      </View>
      {parentHint ? (
        <AppText variant="caption" muted style={styles.hint}>
          पालकांसाठी: ⚙︎ बटण थोडा वेळ दाबून ठेवा
        </AppText>
      ) : null}

      <View style={styles.heading}>
        <AppText variant="caption" color={colors.primary}>
          {BRAND.warmName}
        </AppText>
        {profile ? (
          <AppText variant="label" muted>
            नमस्कार {profile.name}!
          </AppText>
        ) : null}
        <AppText variant="title">आज कोणती गोष्ट ऐकायची?</AppText>
      </View>

      <View style={styles.grid}>
        {CATEGORIES.map((c) => (
          <CategoryTile key={c.id} category={c} selected={category === c.id} onPress={() => chooseCategory(c.id)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topLink: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.xs },
  pressed: { opacity: 0.5 },
  hint: { textAlign: 'right' },
  heading: { gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
