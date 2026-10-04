import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getCategory } from '@engine/index';
import { AajiIllustration, AppText, BackButton, BigButton, ProgressBar, RoundButton, Screen } from '@/components';
import { useStoryPlayer } from '@/hooks/useStoryPlayer';
import { colors, spacing } from '@/theme';
import { formatDuration } from '@/utils/format';

/** 6. Story Player — audio first; the story text is intentionally not shown. */
export default function StoryPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { story, notFound, status, progress, isFavourite, togglePlay, toggleFavourite } = useStoryPlayer(id);

  if (notFound) {
    return (
      <Screen footer={<BigButton label="घरी जा" onPress={() => router.dismissTo('/home')} />}>
        <View style={styles.center}>
          <AppText variant="heading" center>
            ही गोष्ट सापडली नाही.
          </AppText>
        </View>
      </Screen>
    );
  }

  if (!story) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const category = getCategory(story.category);

  return (
    <Screen footer={<BigButton label="अजून एक गोष्ट" variant="secondary" onPress={() => router.dismissTo('/home')} />}>
      <View style={styles.topRow}>
        <BackButton />
        <RoundButton
          icon={isFavourite ? '♥' : '♡'}
          accessibilityLabel={isFavourite ? 'आवडत्या गोष्टींतून काढा' : 'आवडती गोष्ट'}
          size={56}
          iconColor={isFavourite ? colors.favourite : undefined}
          onPress={toggleFavourite}
        />
      </View>

      <View style={styles.center}>
        <AajiIllustration size={220} />
        <View style={styles.titleBlock}>
          <AppText variant="caption" muted center>
            {category.emoji} {category.label}
          </AppText>
          <AppText variant="title" center>
            {story.title}
          </AppText>
        </View>

        <View style={styles.progress}>
          <ProgressBar progress={progress} />
          <View style={styles.times}>
            <AppText variant="caption" muted>
              {formatDuration(status.positionSeconds)}
            </AppText>
            <AppText variant="caption" muted>
              {formatDuration(status.durationSeconds || story.durationSeconds)}
            </AppText>
          </View>
        </View>

        <View style={styles.controls}>
          <RoundButton
            icon={status.isPlaying ? '❚❚' : '▶'}
            accessibilityLabel={status.isPlaying ? 'थांबवा' : 'ऐका'}
            size={96}
            filled
            onPress={togglePlay}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  titleBlock: { gap: spacing.xs },
  progress: { gap: spacing.xs },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { alignItems: 'center' },
});
