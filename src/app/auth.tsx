import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageButton, LanguagePicker } from '@/components/customer-language-picker';
import { InlineError, InlineSuccess } from '@/components/customer-ui';
import { BrandMark, Button } from '@/components/super-ui';
import { SymbolView } from '@/components/symbol';
import { CustomerColors as C, CustomerHeight, CustomerLayout, CustomerRadius, CustomerSpace as S, CustomerType } from '@/constants/customer-design';
import { useApp } from '@/context/app-context';
import { useRouteReady } from '@/hooks/use-route-ready';
import { normalizeThaiPhone } from '@/lib/customer-rules';

type Mode = 'signin' | 'signup';
type Errors = Partial<Record<'name' | 'phone' | 'email' | 'password' | 'form', string>>;

export default function AuthScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const routeReady = useRouteReady();
  const app = useApp();
  const [mode, setMode] = useState<Mode>(routeReady && params.mode === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true); const [loading, setLoading] = useState(false); const [errors, setErrors] = useState<Errors>({}); const [success, setSuccess] = useState(''); const [languageOpen, setLanguageOpen] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (routeReady && params.mode === 'signup') setMode('signup');
  }, [params.mode, routeReady]);

  useEffect(() => {
    if (app.authLoading || app.passwordRecoveryActive || !app.userId || app.dataError === 'PROFILE_LOAD_FAILED') return;
    router.replace((app.profile.role === 'admin' ? '/admin' : app.profile.role === 'driver' ? '/driver' : '/(tabs)/home') as Href);
  }, [app.authLoading, app.dataError, app.passwordRecoveryActive, app.profile.role, app.userId]);

  function validate() { const next: Errors = {}; if (mode === 'signup' && !name.trim()) next.name = app.t('Enter your full name.'); if (mode === 'signup' && !normalizeThaiPhone(phone)) next.phone = app.t('PHONE_INVALID'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = app.t('Enter a valid email address.'); if (!password) next.password = app.t('PASSWORD_REQUIRED'); else if (mode === 'signup' && password.length < 8) next.password = app.t('Use at least 8 characters.'); setErrors(next); return Object.keys(next).length === 0; }
  async function submit() {
    if (submitLock.current || !validate()) return;
    submitLock.current = true; setLoading(true); setErrors({}); setSuccess('');
    try {
      const result = mode === 'signup' ? await app.signUp(name, email, password, phone) : await app.signIn(email, password);
      if (result.error) { setErrors({ form: app.t(result.error) }); return; }
      if (result.needsEmailConfirmation) { setSuccess(app.t('Open the confirmation email from Super Shine, then return and sign in.')); setMode('signin'); }
    } catch {
      setErrors({ form: app.t('AUTH_NETWORK_ERROR') });
    } finally {
      setLoading(false); submitLock.current = false;
    }
  }

  function changeMode(next: Mode) { setMode(next); setErrors({}); setSuccess(''); }
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <View style={styles.top}><Pressable accessibilityRole="button" accessibilityLabel={app.t('Back')} onPress={() => router.back()} style={styles.icon}><SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={19} tintColor={C.navy} /></Pressable><BrandMark compact /><LanguageButton label={app.t('Choose language')} onPress={() => setLanguageOpen(true)} /></View>
    <View style={styles.modeTabs}><Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'signin' }} onPress={() => changeMode('signin')} style={[styles.modeTab, mode === 'signin' && styles.modeSelected]}><Text style={[styles.modeText, mode === 'signin' && styles.modeTextSelected]}>{app.t('Sign in')}</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'signup' }} onPress={() => changeMode('signup')} style={[styles.modeTab, mode === 'signup' && styles.modeSelected]}><Text style={[styles.modeText, mode === 'signup' && styles.modeTextSelected]}>{app.t('Create account')}</Text></Pressable></View>
    <Text accessibilityRole="header" style={styles.title}>{app.t(mode === 'signin' ? 'Welcome back' : 'Create your account')}</Text><Text style={styles.subtitle}>{app.t(mode === 'signin' ? 'Sign in to track orders and schedule pickups.' : 'Create an account to schedule your first pickup.')}</Text>
    {!app.supabaseConfigured ? <InlineError message={app.t('Supabase is not configured. Add the required environment variables.')} /> : null}<InlineSuccess message={success} />{app.userId && app.dataError === 'PROFILE_LOAD_FAILED' ? <View style={styles.profileError}><InlineError message={app.t('PROFILE_LOAD_FAILED')} /><Button label={app.t('Retry')} variant="secondary" onPress={() => void app.refresh()} /></View> : null}
    <View style={styles.form}>{mode === 'signup' ? <><Field label={app.t('Full name')} value={name} onChangeText={(value) => { setName(value); setErrors((current) => ({ ...current, name: '' })); }} autoComplete="name" textContentType="name" error={errors.name} /><Field label={app.t('Phone number')} value={phone} onChangeText={(value) => { setPhone(value); setErrors((current) => ({ ...current, phone: '' })); }} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" error={errors.phone} /></> : null}<Field label={app.t('Email address')} value={email} onChangeText={(value) => { setEmail(value); setErrors((current) => ({ ...current, email: '' })); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" error={errors.email} /><View><Text style={styles.label}>{app.t('Password')}</Text><View style={[styles.password, errors.password && styles.fieldError]}><TextInput accessibilityLabel={app.t('Password')} value={password} onChangeText={(value) => { setPassword(value); setErrors((current) => ({ ...current, password: '' })); }} secureTextEntry={secure} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} textContentType={mode === 'signin' ? 'password' : 'newPassword'} style={styles.passwordInput} /><Pressable accessibilityRole="button" accessibilityLabel={app.t(secure ? 'Show password' : 'Hide password')} onPress={() => setSecure(!secure)} style={styles.eye}><SymbolView name={{ ios: secure ? 'eye' : 'eye.slash', android: secure ? 'visibility' : 'visibility_off', web: secure ? 'visibility' : 'visibility_off' }} size={20} tintColor={C.muted} /></Pressable></View><InlineError message={errors.password} /></View>{mode === 'signin' ? <Pressable accessibilityRole="button" onPress={() => router.push('/forgot-password')} style={styles.forgot}><Text style={styles.link}>{app.t('Forgot password?')}</Text></Pressable> : null}<InlineError message={errors.form} /><Button label={app.t(mode === 'signin' ? 'Sign in' : 'Create account')} onPress={() => void submit()} loading={loading} disabled={!app.supabaseConfigured || loading} /></View>
    <Pressable accessibilityRole="button" onPress={() => changeMode(mode === 'signin' ? 'signup' : 'signin')} style={styles.switch}><Text style={styles.switchText}>{app.t(mode === 'signin' ? 'New to Super Shine? Create an account' : 'Already have an account? Sign in')}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.demo}><Text style={styles.demoText}>{app.t('Explore demo from the welcome screen')}</Text></Pressable>
  </ScrollView></KeyboardAvoidingView><LanguagePicker visible={languageOpen} selected={app.language} title={app.t('Choose language')} closeLabel={app.t('Close')} onSelect={app.setLanguage} onClose={() => setLanguageOpen(false)} /></SafeAreaView>;
}

function Field({ label, error, ...props }: { label: string; error?: string } & React.ComponentProps<typeof TextInput>) { return <View><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={C.disabled} style={[styles.field, error && styles.fieldError]} {...props} /><InlineError message={error} /></View>; }
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.canvas }, flex: { flex: 1 }, page: { width: '100%', maxWidth: 540, alignSelf: 'center', padding: CustomerLayout.pagePadding, paddingBottom: S.xxl }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.section }, icon: { width: CustomerHeight.touch, height: CustomerHeight.touch, alignItems: 'center', justifyContent: 'center' }, modeTabs: { flexDirection: 'row', backgroundColor: C.disabledSoft, borderRadius: CustomerRadius.control, padding: 4, marginBottom: S.section }, modeTab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, modeSelected: { backgroundColor: C.white }, modeText: { color: C.muted, fontWeight: '800' }, modeTextSelected: { color: C.navy }, title: { ...CustomerType.screen, color: C.navy }, subtitle: { ...CustomerType.body, color: C.muted, marginTop: S.sm }, profileError: { gap: S.sm, marginTop: S.lg }, form: { gap: S.lg, marginTop: S.section }, label: { ...CustomerType.label, color: C.text, marginBottom: S.sm }, field: { minHeight: CustomerHeight.field, borderRadius: CustomerRadius.control, borderWidth: 1, borderColor: C.border, backgroundColor: C.white, paddingHorizontal: S.lg, color: C.text, fontSize: 15 }, fieldError: { borderColor: C.error }, password: { flexDirection: 'row', borderRadius: CustomerRadius.control, borderWidth: 1, borderColor: C.border, backgroundColor: C.white }, passwordInput: { flex: 1, minHeight: CustomerHeight.field, paddingHorizontal: S.lg, color: C.text, fontSize: 15 }, eye: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }, forgot: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center', marginTop: -12 }, link: { color: C.tealPressed, fontSize: 13, fontWeight: '800' }, switch: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: S.lg }, switchText: { color: C.navy, textAlign: 'center', fontWeight: '800' }, demo: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, demoText: { color: C.info, fontSize: 12, fontWeight: '700' } });
