import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppFrame } from '@/components/app-frame';
import { Colors } from '@/constants/design';
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
