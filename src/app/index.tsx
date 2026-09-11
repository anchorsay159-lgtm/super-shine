import { Redirect, router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageButton, LanguagePicker } from '@/components/customer-language-picker';
import { InlineError } from '@/components/customer-ui';
import { BrandMark, Button } from '@/components/super-ui';
import { SymbolView } from '@/components/symbol';
import { CustomerColors as C, CustomerLayout, CustomerSpace as S, CustomerType } from '@/constants/customer-design';
import { useApp } from '@/context/app-context';

export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const { authLoading, continueDemo, language, passwordRecoveryActive, profile, setLanguage, t, userId } = useApp();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState('');
  const demoLock = useRef(false);
  if (!authLoading && passwordRecoveryActive) return <Redirect href="/reset-password" />;
  if (!authLoading && userId) return <Redirect href={(profile.role === 'admin' ? '/admin' : profile.role === 'driver' ? '/driver' : '/(tabs)/home') as Href} />;

  async function demo() {
    if (demoLock.current) return;
    demoLock.current = true; setDemoLoading(true); setError('');
    try {
      const result = await continueDemo();
      if (result.error) setError(t(result.error)); else router.replace('/(tabs)/home');
    } catch {
      setError(t('DEMO_START_FAILED'));
    } finally {
      setDemoLoading(false); demoLock.current = false;
    }
  }

  return <SafeAreaView style={styles.safe}><View style={styles.page}>
    <View style={styles.top}><BrandMark compact /><LanguageButton label={t('Choose language')} onPress={() => setLanguageOpen(true)} /></View>
    <View style={[styles.hero, wide && styles.heroWide]}>
      <View style={[styles.illustration, wide && styles.illustrationWide]}><View style={styles.bubble} /><View style={styles.fold} /><View style={styles.machine}><View style={styles.controls}><View style={styles.dot} /><View style={styles.dot} /><View style={styles.slot} /></View><View style={styles.door}><View style={styles.water} /><SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={30} tintColor={C.white} /></View></View><View style={styles.careTag}><SymbolView name={{ ios: 'leaf.fill', android: 'leaf', web: 'leaf' }} size={16} tintColor={C.tealPressed} /></View></View>
      <View style={[styles.content, wide && styles.contentWide]}>
        <View style={styles.copy}><Text style={styles.eyebrow}>{t('FRESH LAUNDRY, LESS EFFORT')}</Text><Text accessibilityRole="header" style={[styles.title, wide && styles.titleWide]}>{t('Laundry day, handled.')}</Text><Text style={styles.subtitle}>{t('Schedule a pickup, track every step, and receive fresh laundry at your door.')}</Text></View>
        <View style={styles.actions}><Button label={t('Create account')} onPress={() => router.push({ pathname: '/auth', params: { mode: 'signup' } })} /><Button label={t('Sign in')} variant="secondary" onPress={() => router.push({ pathname: '/auth', params: { mode: 'signin' } })} /><Pressable accessibilityRole="button" disabled={demoLoading} onPress={() => void demo()} style={styles.demo}>{demoLoading ? <ActivityIndicator color={C.info} /> : <Text style={styles.demoText}>{t(error ? 'Retry' : 'Explore demo')}</Text>}</Pressable><InlineError message={error} /></View>
      </View>
    </View>
  </View><LanguagePicker visible={languageOpen} selected={language} title={t('Choose language')} closeLabel={t('Close')} onSelect={setLanguage} onClose={() => setLanguageOpen(false)} /></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.canvas }, page: { flex: 1, width: '100%', maxWidth: CustomerLayout.desktopMaxWidth, alignSelf: 'center', paddingHorizontal: CustomerLayout.pagePadding, paddingTop: S.sm, paddingBottom: S.section }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, hero: { flex: 1, paddingTop: S.lg }, heroWide: { flexDirection: 'row-reverse', alignItems: 'center', gap: 72, paddingVertical: 52 }, illustration: { height: 222, borderRadius: 28, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, illustrationWide: { flex: 1.05, height: 440, marginTop: 0 }, bubble: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: '#D8F1ED', right: -55, top: -70 }, fold: { position: 'absolute', width: 190, height: 78, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.48)', left: -34, bottom: -26, transform: [{ rotate: '8deg' }] }, machine: { width: 150, height: 172, borderRadius: 28, padding: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, transform: [{ rotate: '-2deg' }] }, controls: { height: 25, flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.attention }, slot: { marginLeft: 'auto', width: 40, height: 10, borderRadius: 5, backgroundColor: C.border }, door: { width: 100, height: 100, borderRadius: 50, alignSelf: 'center', marginTop: 9, borderWidth: 8, borderColor: C.navy, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, water: { position: 'absolute', width: 120, height: 55, borderRadius: 55, bottom: -18, backgroundColor: C.tealPressed }, careTag: { position: 'absolute', right: 22, bottom: 18, width: 42, height: 42, borderRadius: 15, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }, content: { flex: 1 }, contentWide: { justifyContent: 'center', maxWidth: 450 }, copy: { marginTop: S.section }, eyebrow: { color: C.tealPressed, fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 1.3, marginBottom: S.sm }, title: { ...CustomerType.screen, color: C.navy }, titleWide: { fontSize: 44, lineHeight: 50, letterSpacing: -1.2 }, subtitle: { ...CustomerType.body, color: C.muted, marginTop: S.sm, maxWidth: 480 }, actions: { gap: S.md, marginTop: S.xxl }, demo: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, demoText: { color: C.info, fontSize: 13, fontWeight: '800' } });
