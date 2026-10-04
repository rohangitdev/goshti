import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { uiSoundService } from '@/services';
import { checkParentAnswer, createParentChallenge } from '@/services/parentGate';
import { colors, radius, spacing, touch } from '@/theme';

import { AppText } from './AppText';

interface Props {
  onPass: () => void;
}

/** "For grown-ups": answer a sum to continue. A wrong answer just shows a new question. */
export function ParentGate({ onPass }: Props) {
  const [challenge, setChallenge] = useState(() => createParentChallenge());
  const [wrong, setWrong] = useState(false);

  const choose = (choice: number) => {
    if (checkParentAnswer(challenge, choice)) {
      onPass();
      return;
    }
    uiSoundService.play('BUTTON_ERROR');
    setWrong(true);
    setChallenge(createParentChallenge());
  };

  return (
    <View style={styles.wrap}>
      <AppText variant="heading" center>
        पालकांसाठी
      </AppText>
      <AppText center muted>
        पुढे जाण्यासाठी उत्तर निवडा
      </AppText>
      <AppText variant="title" center>
        {challenge.a} × {challenge.b} = ?
      </AppText>
      <View style={styles.grid}>
        {challenge.choices.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityLabel={String(c)}
            onPress={() => choose(c)}
            style={({ pressed }) => [styles.choice, pressed && { opacity: 0.8 }]}
          >
            <AppText variant="label">{c}</AppText>
          </Pressable>
        ))}
      </View>
      {wrong ? (
        <AppText variant="caption" center muted>
          हं, पुन्हा प्रयत्न करा.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  choice: {
    width: '45%',
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
