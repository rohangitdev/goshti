import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { isStoryCategory, type StoryMode } from '@engine/index';
import { AajiIllustration, AppText, BigButton, Screen } from '@/components';
import { useStoryGeneration } from '@/hooks/useStoryGeneration';
import { colors } from '@/theme';

/** 5. Generating */
export default function GeneratingScreen() {
  const params = useLocalSearchParams<{ category: string; mode: string; idea?: string }>();

  const input = useMemo(() => {
    if (!isStoryCategory(params.category)) return null;
    const mode: StoryMode = params.mode === 'CUSTOM' ? 'CUSTOM' : 'RANDOM';
    return { category: params.category, mode, userIdea: mode === 'CUSTOM' ? params.idea : undefined };
  }, [params.category, params.mode, params.idea]);

  const { state, retry } = useStoryGeneration(input);

  useEffect(() => {
    if (state.status === 'done') {
      router.replace({ pathname: '/story/[id]', params: { id: state.storyId } });
    }
  }, [state]);

  // Child-facing: a calm message only, never an upgrade prompt.
  if (state.status === 'limit') {
    return (
      <Screen footer={<BigButton label="माझ्या गोष्टी ऐका" onPress={() => router.replace('/stories')} />}>
        <View style={styles.center}>
          <AajiIllustration size={200} />
          <AppText variant="heading" center>
            या महिन्यातल्या नव्या गोष्टी संपल्या. चल, आवडती जुनी गोष्ट पुन्हा ऐकूया!
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
            <BigButton label="पुन्हा प्रयत्न करा" onPress={retry} />
            <BigButton variant="secondary" label="मागे जा" onPress={() => router.dismissTo('/home')} />
          </>
        }
      >
        <View style={styles.center}>
          <AajiIllustration size={200} />
          <AppText variant="heading" center>
            अरेच्चा! आजीला गोष्ट आठवली नाही. पुन्हा प्रयत्न करूया?
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.center}>
        <AajiIllustration size={240} />
        <AppText variant="heading" center>
          आजी तुमची गोष्ट तयार करतेय...
        </AppText>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 32 },
});
