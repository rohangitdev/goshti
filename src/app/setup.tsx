import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { AgeSelector, AppText, BackButton, BigButton, GenderSelector, Screen } from '@/components';
import { useChildProfile } from '@/hooks/useChildProfile';
import { MAX_CHILD_NAME_LENGTH } from '@/services/childProfileService';
import type { ChildAge, ChildGender, ChildProfile } from '@/types/models';
import { colors, radius, spacing, touch, type as typography } from '@/theme';

/** 2. Child Setup — also used from Parent mode to edit the profile. */
export default function SetupScreen() {
  const { profile, loading, save } = useChildProfile();
  if (loading) return <View style={styles.flex} />;
  return <SetupForm initial={profile} onSave={save} />;
}

interface FormProps {
  initial: ChildProfile | null;
  onSave: (input: { name: string; age: ChildAge; gender: ChildGender }) => Promise<unknown>;
}

function SetupForm({ initial, onSave: save }: FormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [age, setAge] = useState<ChildAge | null>(initial?.age ?? null);
  const [gender, setGender] = useState<ChildGender | null>(initial?.gender ?? null);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && age !== null && gender !== null && !saving;

  const onSave = async () => {
    if (!canSave || age === null || gender === null) return;
    setSaving(true);
    await save({ name, age, gender });
    router.dismissTo('/home');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll footer={<BigButton label="पुढे चला" onPress={onSave} disabled={!canSave} />}>
        <BackButton />
        <View style={styles.section}>
          <AppText variant="title">तुझं नाव काय?</AppText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="नाव"
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_CHILD_NAME_LENGTH}
            autoCorrect={false}
            returnKeyType="done"
            style={styles.input}
            accessibilityLabel="मुलाचं नाव"
          />
        </View>
        <View style={styles.section}>
          <AppText variant="title">तू मुलगा आहेस की मुलगी?</AppText>
          <GenderSelector value={gender} onChange={setGender} />
        </View>
        <View style={styles.section}>
          <AppText variant="title">तुझं वय किती?</AppText>
          <AgeSelector value={age} onChange={setAge} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  section: { gap: spacing.md },
  input: {
    ...typography.heading,
    minHeight: touch.min,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    color: colors.text,
  },
});
