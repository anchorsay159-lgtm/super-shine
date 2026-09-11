import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark, Button } from '@/components/super-ui';
import { SymbolView } from '@/components/symbol';
import { Colors, Radius, Space } from '@/constants/design';

export default function NotFoundScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <BrandMark compact />
        <View style={styles.card}>
          <View style={styles.icon}>
            <SymbolView
              name={{ ios: 'questionmark.circle.fill', android: 'help', web: 'help' }}
              size={28}
              tintColor={Colors.tealDark}
            />
          </View>
          <Text accessibilityRole="header" style={styles.title}>Page not found</Text>
          <Text style={styles.message}>The page may have moved, or the address may be incorrect.</Text>
          <Button label="Return to Super Shine" onPress={() => router.replace('/')} style={styles.button} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvas },
  page: { flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center', padding: Space.xl },
  card: {
    flex: 1,
    minHeight: 360,
    marginTop: Space.xl,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xxxl,
  },
  icon: { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.navy, fontSize: 30, lineHeight: 38, fontWeight: '900', textAlign: 'center', marginTop: Space.xl },
  message: { color: Colors.textMuted, fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 420, marginTop: Space.sm },
  button: { width: '100%', maxWidth: 320, marginTop: Space.xxl },
});
