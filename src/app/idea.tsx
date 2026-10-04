import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { isStoryCategory, MAX_IDEA_LENGTH } from '@engine/index';
import { AajiIllustration, AppText, BackButton, BigButton, RoundButton, Screen } from '@/components';
import { colors, radius, spacing, type as typography } from '@/theme';

/** 4. Story Idea — the child's idea is a seed for one story, not a chat message. */
export default function IdeaScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const [idea, setIdea] = useState('');
  const valid = isStoryCategory(category) && idea.trim().length > 0;

  const create = () => {
    if (!valid) return;
    router.replace({ pathname: '/generating', params: { category, mode: 'CUSTOM', idea: idea.trim() } });
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll footer={<BigButton label="गोष्ट तयार करा" onPress={create} disabled={!valid} />}>
        <BackButton />
        <AajiIllustration size={140} />
        <AppText variant="heading" center>
          काय गोष्ट ऐकायची ते आजीला सांगा...
        </AppText>
        <View style={styles.inputRow}>
          <TextInput
            value={idea}
            onChangeText={setIdea}
            placeholder="एका हत्तीला चंद्रावर जायचं आहे..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MAX_IDEA_LENGTH}
            style={styles.input}
            accessibilityLabel="गोष्टीची कल्पना"
          />
          {/* Voice input — visual only for now. */}
          <RoundButton icon="🎤" accessibilityLabel="बोलून सांगा (लवकरच)" size={72} onPress={() => {}} disabled />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  input: {
    ...typography.heading,
    flex: 1,
    minHeight: 140,
    textAlignVertical: 'top',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text,
  },
});
