import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { isStoryCategory, type StoryMode } from '@engine/index';
import { AajiIllustration, AppText, BigButton, Screen } from '@/components';
import { useStoryGeneration } from '@/hooks/useStoryGeneration';
import { uiSoundService } from '@/services';
import { colors } from '@/theme';
import { sceneFor } from '@/utils/scene';

/** 5. Generating */
export default function GeneratingScreen() {
  const params = useLocalSearchParams<{ category: string; mode: string; idea?: string }>();

  const input = useMemo(() => {
    if (!isStoryCategory(params.category)) return null;
    const mode: StoryMode = params.mode === 'CUSTOM' ? 'CUSTOM' : 'RANDOM';
    return { category: params.category, mode, userIdea: mode === 'CUSTOM' ? params.idea : undefined };
  }, [params.category, params.mode, params.idea]);

  const { state, progressLabel, retry, playLibrary } = useStoryGeneration(input);
  const openLibraryStory = async () => {
    const id = await playLibrary();
    router.replace({ pathname: '/story/[id]', params: { id } });
  };
  const [slow, setSlow] = useState(false);

  // Real stories are planned, written and reviewed — this can take a minute or two.
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 15_000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state.status === 'done') {
      uiSoundService.play('STORY_READY');
      router.replace({ pathname: '/story/[id]', params: { id: state.storyId } });
    }
  }, [state]);

  // Child-facing: a calm message only, never an upgrade prompt.
  if (state.status === 'limit') {
    return (
      <Screen
        footer={
          <>
            <BigButton label="आजीची आवडती गोष्ट ऐका" onPress={openLibraryStory} />
            <BigButton variant="secondary" label="माझ्या गोष्टी ऐका" onPress={() => router.replace('/stories')} />
          </>
        }
      >
        <View style={styles.center}>
          <AajiIllustration size={200} />
          <AppText variant="heading" center>
            या महिन्याच्या नव्या गोष्टी ऐकून झाल्या! चल, आवडती गोष्ट पुन्हा ऐकूया.
          </AppText>
        </View>
      </Screen>
    );
  }

  // The child's idea wasn't a story request: a fixed, friendly message — never an AI reply.
  if (state.status === 'declined') {
    return (
      <Screen
        footer={
          <>
            <BigButton
              label="दुसरी कल्पना सांगा"
              onPress={() =>
                router.replace({ pathname: '/idea', params: { category: params.category } })
              }
            />
            <BigButton variant="secondary" label="आजीने गोष्ट निवडावी" onPress={() => router.replace({ pathname: '/generating', params: { category: params.category, mode: 'RANDOM' } })} />
          </>
        }
      >
        <View style={styles.center}>
          <AajiIllustration size={200} />
          <AppText variant="heading" center>
            {state.message}
          </AppText>
        </View>
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen
        footer={
          <>
            <BigButton label="आजीची आवडती गोष्ट ऐका" onPress={openLibraryStory} />
            <BigButton variant="secondary" label="पुन्हा प्रयत्न करा" onPress={retry} />
            <BigButton variant="secondary" label="मागे जा" onPress={() => router.dismissTo('/home')} />
          </>
        }
      >
        <View style={styles.center}>
          <AajiIllustration size={200} />
          <AppText variant="heading" center>
            अरेच्चा! आजीला गोष्ट आठवली नाही. पुन्हा प्रयत्न करूया?
          </AppText>
          {/* Developers only: the technical reason (never shown in production builds). */}
          {__DEV__ && state.reason ? (
            <AppText variant="caption" muted center selectable>
              {state.reason}
            </AppText>
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.center}>
        <AajiIllustration size={220} scene={sceneFor(isStoryCategory(params.category) ? params.category : undefined)} />
        <AppText variant="heading" center>
          आजी तुमची गोष्ट तयार करतेय...
        </AppText>
        <ActivityIndicator size="large" color={colors.primary} />
        {progressLabel ? (
          <AppText center muted>
            {progressLabel}
          </AppText>
        ) : null}
        {slow ? (
          <AppText center muted variant="caption">
            छान गोष्ट तयार व्हायला थोडा वेळ लागतो...
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 32 },
});
