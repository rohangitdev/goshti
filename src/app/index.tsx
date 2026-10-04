import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AajiIllustration, AppText, BigButton, Screen } from '@/components';
import { useChildProfile } from '@/hooks/useChildProfile';
import { colors } from '@/theme';

/** 1. Welcome */
export default function WelcomeScreen() {
  const { profile, loading } = useChildProfile();

  const start = () => {
    if (profile) router.replace('/home');
    else router.push('/setup');
  };

  return (
    <Screen footer={<BigButton label="सुरू करा" onPress={start} disabled={loading} />}>
      <View style={styles.center}>
        <AppText variant="display" center color={colors.primary}>
          गोष्टी
        </AppText>
        <AajiIllustration variant="scene" size={240} />
        <AppText variant="heading" center>
          आजीच्या गोष्टी, तुमच्या कल्पनेतून.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 32 },
});
