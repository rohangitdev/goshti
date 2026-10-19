import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getCategory } from '@engine/index';
import {
  AajiIllustration,
  AppText,
  BackButton,
  BigButton,
  ProgressBar,
  RoundButton,
  Screen,
  StoryFeedback,
} from '@/components';
import { useStoryPlayer } from '@/hooks/useStoryPlayer';
import { colors, spacing } from '@/theme';
import { formatDuration } from '@/utils/format';
import { sceneFor } from '@/utils/scene';

/** 6. Story Player — audio first; the story text is intentionally not shown. */
export default function StoryPlayerScreen() {
  const { id, autoplay } = useLocalSearchParams<{ id: string; autoplay?: string }>();
  // Chosen when the story opens, so the picture never changes mid-story.
  const [openedAt] = useState(() => new Date());
  const { story, notFound, status, progress, isFavourite, togglePlay, toggleFavourite, reaction, setReaction, replacementId } =
    useStoryPlayer(id, { autoplay: autoplay === '1' });

  // Aaji's voice couldn't be made for this story: play one of her ready-made stories instead.
  useEffect(() => {
    if (replacementId) router.replace({ pathname: '/story/[id]', params: { id: replacementId, autoplay: '1' } });
  }, [replacementId]);

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
  const scene = sceneFor(story.category, openedAt);

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
        <AajiIllustration size={status.didFinish ? 150 : 230} scene={scene} />
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

        {status.didFinish ? <StoryFeedback value={reaction} onChange={setReaction} /> : null}

        {status.waiting ? (
          <AppText variant="caption" muted center>
            आजी लवकरच गोष्ट सुरू करतेय...
          </AppText>
        ) : null}

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
