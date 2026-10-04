import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, BackButton, Screen, StoryListItem } from '@/components';
import { useStories } from '@/hooks/useStories';
import { colors, spacing } from '@/theme';

/** 7. My Stories */
export default function MyStoriesScreen() {
  const { stories, favouriteIds, loading } = useStories();

  return (
    <Screen scroll>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">माझ्या गोष्टी</AppText>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : stories.length === 0 ? (
        <AppText center muted>
          अजून एकही गोष्ट नाही.
        </AppText>
      ) : (
        <View style={styles.list}>
          {stories.map((s) => (
            <StoryListItem
              key={s.id}
              story={s}
              isFavourite={favouriteIds.has(s.id)}
              onPress={() => router.push({ pathname: '/story/[id]', params: { id: s.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  list: { gap: spacing.md },
});
