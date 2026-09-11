import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { InlineError, InlineSuccess } from '@/components/customer-ui';
import { Button, DetailHeader, Page } from '@/components/super-ui';
import { Colors, Radius, Space } from '@/constants/design';
import { useApp } from '@/context/app-context';

export default function ResetPasswordScreen() {
  const { authLoading, passwordRecoveryActive, t, updatePassword } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function save() {
    if (loading) return;
    if (password.length < 8) { setError(t('Use at least 8 characters.')); return; }
    if (password !== confirm) { setError(t('Enter the same password twice.')); return; }
    setError(''); setSuccess('');
    setLoading(true); const result = await updatePassword(password); setLoading(false);
    if (result.error) { setError(t(result.error)); return; }
    setSuccess(t('You can now sign in with your new password.'));
    setTimeout(() => router.replace('/auth'), 900);
  }
  if (authLoading) return <Page><DetailHeader title={t('Create a new password')} /><View style={styles.center}><ActivityIndicator color={Colors.teal} /><Text style={styles.text}>{t('Checking your reset link...')}</Text></View></Page>;
  if (!passwordRecoveryActive && !success) return <Page><DetailHeader title={t('Create a new password')} /><View style={styles.center}><Text style={styles.title}>{t('This reset link is invalid or has expired.')}</Text><Text style={styles.text}>{t('Request a new password reset link and try again.')}</Text><Button label={t('Request a new link')} onPress={() => router.replace('/forgot-password')} style={styles.full} /></View></Page>;
  return <Page><DetailHeader title={t('Create a new password')} /><Text style={styles.text}>{t('Use at least 8 characters.')}</Text><Text style={styles.label}>{t('New password')}</Text><TextInput accessibilityLabel={t('New password')} secureTextEntry value={password} onChangeText={(value) => { setPassword(value); setError(''); }} autoComplete="new-password" textContentType="newPassword" placeholder={t('Enter a new password')} placeholderTextColor={Colors.textMuted} style={[styles.input, error && styles.inputError]} /><Text style={styles.label}>{t('Confirm new password')}</Text><TextInput accessibilityLabel={t('Confirm new password')} secureTextEntry value={confirm} onChangeText={(value) => { setConfirm(value); setError(''); }} autoComplete="new-password" textContentType="newPassword" placeholder={t('Enter the same password again')} placeholderTextColor={Colors.textMuted} style={[styles.input, error && styles.inputError]} /><InlineError message={error} /><InlineSuccess message={success} /><Button label={t('Update password')} loading={loading} disabled={loading || Boolean(success)} onPress={() => void save()} /></Page>;
}
const styles = StyleSheet.create({ center: { alignItems: 'center', paddingTop: Space.xxxl }, title: { color: Colors.navy, fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'center' }, text: { color: Colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: Space.sm, marginBottom: Space.xl, textAlign: 'center' }, label: { color: Colors.text, fontSize: 13, fontWeight: '700', marginBottom: Space.sm }, input: { minHeight: 52, borderRadius: Radius.medium, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.line, paddingHorizontal: Space.lg, color: Colors.text, fontSize: 15, marginBottom: Space.md }, inputError: { borderColor: Colors.coral }, full: { width: '100%' } });
