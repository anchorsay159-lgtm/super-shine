import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { InlineError } from '@/components/customer-ui';
import { Button, DetailHeader, IconBadge, Page } from '@/components/super-ui';
import { Colors, Radius, Space } from '@/constants/design';
import { useApp } from '@/context/app-context';

export default function ForgotPasswordScreen() {
  const { profile, requestPasswordReset, t } = useApp();
  const [email, setEmail] = useState(profile.email || '');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function send() {
    if (loading) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(t('Enter a valid email address.')); return; }
    setError('');
    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (result.error) { setError(t(result.error)); return; }
    setSent(true);
  }
  return <Page contentStyle={styles.page}><DetailHeader title={t('Reset password')} />{sent ? <View style={styles.success}><IconBadge name={{ ios: 'envelope.badge.fill', android: 'mark_email_read', web: 'mark_email_read' }} color={Colors.success} backgroundColor={Colors.successLight} badgeSize={78} size={34} /><Text style={styles.title}>{t('Check your email')}</Text><Text style={styles.text}>{t('We sent password reset instructions to {{email}}.', { email })}</Text><Button label={t('Send again')} variant="secondary" onPress={() => void send()} loading={loading} style={styles.full} /></View> : <View><Text style={styles.title}>{t('Forgot your password?')}</Text><Text style={styles.text}>{t('Enter your account email to receive reset instructions.')}</Text><Text style={styles.label}>{t('Email address')}</Text><TextInput accessibilityLabel={t('Email address')} value={email} onChangeText={(value) => { setEmail(value); setError(''); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" style={[styles.input, error && styles.inputError]} placeholder="name@example.com" placeholderTextColor={Colors.textMuted} /><InlineError message={error} /><Button label={t('Send reset link')} onPress={() => void send()} loading={loading} disabled={loading} style={styles.button} /></View>}</Page>;
}
const styles = StyleSheet.create({ page: { maxWidth: 620, paddingBottom: Space.xxxl }, success: { alignItems: 'center', paddingTop: 52 }, title: { color: Colors.navy, fontSize: 28, lineHeight: 34, fontWeight: '700' }, text: { color: Colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: Space.sm, marginBottom: Space.xxxl }, label: { color: Colors.text, fontSize: 13, fontWeight: '700', marginBottom: Space.sm }, input: { minHeight: 52, borderRadius: Radius.medium, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, paddingHorizontal: Space.lg, color: Colors.text, fontSize: 15 }, inputError: { borderColor: Colors.coral }, button: { marginTop: Space.xl }, full: { width: '100%' } });
