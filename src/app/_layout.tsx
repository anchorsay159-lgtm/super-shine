import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text } from 'react-native';

import { AppFrame } from '@/components/app-frame';
import { Button } from '@/components/super-ui';
import { Colors, FontFamily, FontFamilyMedium } from '@/constants/design';
import { AppProvider } from '@/context/app-context';

const superShineTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.teal,
    background: Colors.canvas,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.line,
    notification: Colors.coral,
  },
};

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.errorCanvas}>
      <Text style={styles.errorEyebrow}>SUPER SHINE</Text>
      <Text style={styles.errorTitle}>The dashboard hit an unexpected error</Text>
      <Text style={styles.errorMessage}>{error.message || 'Please retry this screen.'}</Text>
      <Button label="Retry screen" onPress={() => void retry()} style={styles.errorButton} />
    </SafeAreaView>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium });
  if (!fontsLoaded && !fontError) return null;
  return (
    <AppProvider>
      <ThemeProvider value={superShineTheme}>
        <StatusBar style="dark" />
        <AppFrame>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.canvas } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="driver" />
            <Stack.Screen name="new-order" options={{ presentation: 'modal' }} />
            <Stack.Screen name="order-tracking" />
            <Stack.Screen name="order-success" options={{ gestureEnabled: false }} />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="services" />
            <Stack.Screen name="account" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="reset-password" />
          </Stack>
        </AppFrame>
      </ThemeProvider>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  errorCanvas: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.canvas, padding: 28 },
  errorEyebrow: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 11, fontWeight: '500', letterSpacing: 1.4 },
  errorTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 25, fontWeight: '500', textAlign: 'center', marginTop: 10 },
  errorMessage: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 560, marginTop: 8 },
  errorButton: { minWidth: 160, marginTop: 18 },
});
