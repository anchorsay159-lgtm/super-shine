import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Page, RowLink, ScreenTitle } from '@/components/super-ui';
import { Colors, FontFamily, FontFamilyMedium, Shadow } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { getLanguageOption } from '@/i18n';
import { customerAlert } from '@/lib/customer-alert';

export default function ProfileScreen() {
  const { addresses, customerEligibility, language, paymentMethod, primaryAddress, profile, signOut, t } = useApp();
  const initials = profile.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'SS';
  const completionChecks = [
    Boolean(profile.name.trim()),
    Boolean(profile.email.trim()),
    Boolean(profile.phone.trim()),
    addresses.length > 0,
    customerEligibility.phoneVerified,
    Object.keys(profile.defaultPreferences || {}).length > 0,
  ];
  const completion = Math.round((completionChecks.filter(Boolean).length / completionChecks.length) * 100);
  return (
    <Page>
      <ScreenTitle eyebrow={t('YOUR ACCOUNT')} title={t('Profile')} />
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/account', params: { section: 'personal' } })} style={({ pressed }) => [styles.identity, pressed && styles.pressed]}>
        <View style={styles.avatarWrap}><View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View><View style={styles.memberBadge}><Text style={styles.memberBadgeText}>{t('MEMBER')}</Text></View></View>
        <View style={styles.identityCopy}><Text style={styles.name}>{profile.name || t('Customer')}</Text><Text style={styles.identityMeta}>{t('Manage your laundry experience')}</Text></View>
        <Text style={styles.edit}>{t('Edit')}</Text>
      </Pressable>

      <Card style={styles.completionCard}>
        <View style={styles.completionTop}><Text style={styles.completionTitle}>{t('Profile complete')}</Text><Text style={styles.completionValue}>{completion}%</Text></View>
        <View style={styles.completionTrack}><View style={[styles.completionFill, { width: `${completion}%` }]} /></View>
        {customerEligibility.remainingFreePickups > 0 ? <Text style={styles.benefitText}>{t('{{count}} free pickups remaining', { count: customerEligibility.remainingFreePickups })}</Text> : null}
      </Card>

      <ProfileGroup title={t('Your defaults')}>
        <RowLink icon={{ ios: 'mappin', android: 'map-marker-outline', web: 'map-marker-outline' }} iconColor={Colors.tealDark} iconBackground={Colors.tealLight} title={t('Home address')} subtitle={primaryAddress.detail || t('Add your preferred address')} onPress={() => router.push({ pathname: '/account', params: { section: 'addresses' } })} />
        <Divider />
        <RowLink icon={{ ios: 'banknote', android: 'cash', web: 'cash' }} iconColor={Colors.blue} iconBackground={Colors.blueLight} title={t('Payment preference')} subtitle={t(`paymentMethod.${paymentMethod}`)} onPress={() => router.push({ pathname: '/account', params: { section: 'payments' } })} />
        <Divider />
        <RowLink icon={{ ios: 'heart', android: 'heart-outline', web: 'heart-outline' }} iconColor={Colors.coral} iconBackground={Colors.coralLight} title={t('Laundry care profile')} subtitle={t('Everyday care')} onPress={() => router.push({ pathname: '/account', params: { section: 'laundry-preferences' } })} />
      </ProfileGroup>

      <ProfileGroup title={t('Settings')}>
        <RowLink icon={{ ios: 'bell', android: 'bell-outline', web: 'bell-outline' }} iconColor="#B67A12" iconBackground={Colors.yellowLight} title={t('Notifications')} subtitle={t('Order updates and offers')} onPress={() => router.push({ pathname: '/account', params: { section: 'notifications' } })} />
        <Divider />
        <RowLink icon={{ ios: 'character.book.closed', android: 'translate', web: 'translate' }} iconColor={Colors.tealDark} iconBackground={Colors.tealLight} title={t('Language')} subtitle={getLanguageOption(language).nativeName} onPress={() => router.push({ pathname: '/account', params: { section: 'language' } })} />
      </ProfileGroup>

      <ProfileGroup title={t('Support')}>
        <RowLink icon={{ ios: 'questionmark.circle', android: 'help-circle-outline', web: 'help-circle-outline' }} iconColor={Colors.blue} iconBackground={Colors.blueLight} title={t('Help centre')} subtitle={t('Answers and care guidance')} onPress={() => router.push({ pathname: '/account', params: { section: 'help' } })} />
        <Divider />
        <RowLink icon={{ ios: 'message', android: 'message-outline', web: 'message-outline' }} iconColor={Colors.tealDark} iconBackground={Colors.tealLight} title={t('Contact SuperShine')} subtitle={t('Chat with our laundry team')} onPress={() => router.push({ pathname: '/account', params: { section: 'support' } })} />
      </ProfileGroup>

      <ProfileGroup title={t('Account & security')}>
        <RowLink icon={{ ios: 'lock.rotation', android: 'lock-reset', web: 'lock-reset' }} iconColor={Colors.navy} iconBackground={Colors.line} title={t('Reset password')} onPress={() => router.push('/forgot-password')} />
        <Divider />
        <RowLink icon={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} iconBackground={Colors.coralLight} title={t('Sign out')} danger onPress={() => customerAlert(t('Sign out?'), t('You will return to the welcome screen.'), [{ text: t('Cancel'), style: 'cancel' }, { text: t('Sign out'), style: 'destructive', onPress: async () => { await signOut(); router.replace('/'); } }])} />
      </ProfileGroup>
    </Page>
  );
}

function ProfileGroup({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.group}><Text style={styles.groupTitle}>{title}</Text><Card style={styles.groupCard}>{children}</Card></View>;
}

function Divider() { return <View style={styles.divider} />; }

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 23 },
  avatarWrap: { paddingBottom: 8 },
  avatar: { width: 68, height: 68, borderRadius: 23, backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center', ...Shadow },
  avatarText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 22, fontWeight: '500' },
  memberBadge: { position: 'absolute', left: -3, right: -3, bottom: 0, minHeight: 18, borderRadius: 9, backgroundColor: Colors.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, ...Shadow },
  memberBadgeText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 7, fontWeight: '500', letterSpacing: .8 },
  identityCopy: { flex: 1 },
  name: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 20, lineHeight: 25, fontWeight: '500' },
  identityMeta: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 12, lineHeight: 17, marginTop: 4 },
  edit: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500' },
  completionCard: { padding: 16, marginBottom: 24 },
  completionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  completionTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500' },
  completionValue: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500' },
  completionTrack: { height: 7, borderRadius: 4, backgroundColor: Colors.line, overflow: 'hidden', marginTop: 11 },
  completionFill: { height: 7, borderRadius: 4, backgroundColor: Colors.teal },
  benefitText: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 10, marginTop: 8 },
  group: { marginBottom: 23 },
  groupTitle: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500', marginBottom: 9 },
  groupCard: { paddingHorizontal: 15, paddingVertical: 0 },
  divider: { height: 1, backgroundColor: Colors.line, marginLeft: 40 },
  pressed: { opacity: 0.7 },
});
