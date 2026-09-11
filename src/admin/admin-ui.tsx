import { router as expoRouter, usePathname } from 'expo-router';
import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput,
  View, useWindowDimensions, type StyleProp, type ViewStyle,
} from 'react-native';

import { BrandMark, Button, Card } from '@/components/super-ui';
import { SymbolView, type SymbolName } from '@/components/symbol';
import { Colors, FontFamily, FontFamilyMedium, Radius, Shadow } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { isStoreOpen } from '@/lib/domain';
import { supabase } from '@/lib/supabase';
import type { StatusTone } from '@/admin/order-config';

type AdminPageProps = PropsWithChildren<{
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumb?: { label: string; onPress: () => void };
  onSearch?: (value: string) => void;
  searchValue?: string;
  contentStyle?: StyleProp<ViewStyle>;
}>;

const NAVIGATION = [
  { label: 'Overview', path: '/admin', icon: { ios: 'square.grid.2x2.fill', android: 'dashboard', web: 'dashboard' } },
  { label: 'Orders', path: '/admin/orders', icon: { ios: 'list.bullet.rectangle.fill', android: 'receipt_long', web: 'receipt_long' } },
  { label: 'Drivers', path: '/admin/drivers', icon: { ios: 'car.fill', android: 'car', web: 'car' } },
  { label: 'Reports', path: '/admin/reports', icon: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' } },
  { label: 'Accounting', path: '/admin/accounting', icon: { ios: 'books.vertical.fill', android: 'account_balance', web: 'account_balance' } },
  { label: 'Settings', path: '/admin/settings', icon: { ios: 'gearshape.fill', android: 'settings', web: 'settings' } },
] as const;
const router = expoRouter as { push: (href: string | Record<string, unknown>) => void };

export function AdminPage({ title, eyebrow, subtitle, actions, breadcrumb, onSearch, searchValue = '', contentStyle, children }: AdminPageProps) {
  const { authLoading, businessSettings, profile, signIn, signOut, t, unreadNotifications, userId } = useApp();
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const pathname = usePathname();
  const accountingArea = pathname.startsWith('/admin/accounting');
  const [accountingRole, setAccountingRole] = useState('');
  const [accountingRoleLoading, setAccountingRoleLoading] = useState(false);
  const compact = width < 920;
  const open = isStoreOpen(businessSettings);
  const activeSearch = onSearch ? searchValue : globalSearch;

  useEffect(() => {
    let active = true;
    if (!accountingArea || !userId) { setAccountingRole(''); setAccountingRoleLoading(false); return; }
    setAccountingRoleLoading(true);
    if (!supabase) { setAccountingRole(profile.role === 'admin' ? 'owner' : ''); setAccountingRoleLoading(false); return; }
    void supabase.from('accounting_staff_roles').select('staff_role,active').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setAccountingRole(data?.active ? data.staff_role : profile.role === 'admin' ? 'owner' : '');
        setAccountingRoleLoading(false);
      });
    return () => { active = false; };
  }, [accountingArea, profile.role, userId]);

  async function login() {
    if (!email.trim() || !password) return setLoginError('Enter your email and password.');
    setLoginLoading(true);
    setLoginError('');
    const result = await signIn(email, password);
    setLoginLoading(false);
    if (result.error) {
      setLoginError(result.error === 'SUPABASE_NOT_CONFIGURED'
        ? 'Supabase is not configured. Add the public Supabase URL and publishable key to .env, then restart Expo.'
        : t(result.error));
    }
  }

  if (authLoading || accountingRoleLoading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={Colors.teal} /></SafeAreaView>;
  if (!userId) return <SafeAreaView style={styles.loginCanvas}><View style={styles.loginGlowLarge} /><View style={styles.loginGlowSmall} /><View style={styles.loginWrap}><View style={styles.loginBrandRow}><BrandMark /><View style={styles.loginConsoleBadge}><Text style={styles.loginConsoleBadgeText}>ADMIN</Text></View></View><View style={styles.loginIcon}><SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={22} tintColor={Colors.tealDark} /></View><Text style={styles.loginEyebrow}>SUPER SHINE OPERATIONS</Text><Text style={styles.loginTitle}>Welcome back</Text><Text style={styles.loginSubtitle}>Manage today’s orders, routes, payments, and customer care from one clear workspace.</Text><Text style={styles.loginFieldLabel}>Email address</Text><TextInput value={email} onChangeText={(value) => { setEmail(value); setLoginError(''); }} placeholder="Admin email" keyboardType="email-address" autoCapitalize="none" style={styles.loginInput} placeholderTextColor={Colors.textMuted} /><Text style={styles.loginFieldLabel}>Password</Text><TextInput value={password} onChangeText={(value) => { setPassword(value); setLoginError(''); }} placeholder="Password" secureTextEntry style={styles.loginInput} placeholderTextColor={Colors.textMuted} onSubmitEditing={() => void login()} />{loginError ? <View style={styles.loginError}><Text style={styles.loginErrorTitle}>Admin sign-in failed</Text><Text style={styles.loginErrorText}>{loginError}</Text></View> : null}<Button label="Sign in to dashboard" onPress={() => void login()} loading={loginLoading} style={styles.loginButton} /></View></SafeAreaView>;
  if (profile.role !== 'admin' && !(accountingArea && accountingRole)) return <SafeAreaView style={styles.loading}><Card style={styles.accessCard}><Text style={styles.panelTitle}>Admin access required</Text><Text style={styles.muted}>This account is not approved for this dashboard area.</Text><Button label="Sign out" onPress={() => void signOut()} /></Card></SafeAreaView>;

  return <SafeAreaView style={styles.shell}>
    <View style={styles.shellRow}>
      {!compact ? <Sidebar /> : null}
      {compact && menuOpen ? <View style={styles.mobileMenu}><Sidebar onNavigate={() => setMenuOpen(false)} /><Pressable accessibilityLabel="Close navigation" onPress={() => setMenuOpen(false)} style={styles.mobileBackdrop} /></View> : null}
      <View style={styles.main}>
        <View style={styles.topbar}>
          {compact ? <IconButton label="Open navigation" icon={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }} onPress={() => setMenuOpen(true)} /> : null}
          <View style={styles.topSearchWrap}><SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={18} tintColor={Colors.textMuted} /><TextInput value={activeSearch} onChangeText={onSearch || setGlobalSearch} placeholder="Search orders, customers, phone or email" placeholderTextColor={Colors.textMuted} style={styles.topSearch} returnKeyType="search" onSubmitEditing={() => router.push({ pathname: '/admin/orders', params: { search: activeSearch.trim() } })} /></View>
          <View style={styles.topbarMeta}>
            <View style={[styles.storeBadge, { backgroundColor: open ? Colors.successLight : Colors.coralLight }]}><View style={[styles.storeDot, { backgroundColor: open ? Colors.success : Colors.coral }]} /><Text style={styles.storeText}>{open ? 'Open' : 'Closed'}</Text></View>
            {width >= 1120 ? <Text numberOfLines={1} style={styles.location}>{businessSettings.storeName}</Text> : null}
            <View style={styles.notificationWrap}><IconButton label="Notifications" icon={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} onPress={() => router.push('/notifications')} />{unreadNotifications.length ? <View style={styles.notificationDot}><Text style={styles.notificationCount}>{Math.min(99, unreadNotifications.length)}</Text></View> : null}</View>
            <View><Pressable accessibilityRole="button" accessibilityLabel="Admin profile menu" onPress={() => setProfileOpen((value) => !value)} style={styles.avatar}><Text style={styles.avatarText}>{(profile.name || profile.email || 'A').slice(0, 1).toUpperCase()}</Text></Pressable>{profileOpen ? <View style={styles.profileMenu}><Text numberOfLines={1} style={styles.profileName}>{profile.name || 'Administrator'}</Text><Text numberOfLines={1} style={styles.profileEmail}>{profile.email}</Text><View style={styles.menuRule} /><Pressable onPress={() => { setProfileOpen(false); router.push('/admin/settings'); }} style={styles.profileAction}><Text style={styles.profileActionText}>Settings</Text></Pressable><Pressable onPress={() => void signOut()} style={styles.profileAction}><Text style={[styles.profileActionText, { color: Colors.coral }]}>Sign out</Text></Pressable></View> : null}</View>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, contentStyle]}>
          {breadcrumb ? <Pressable accessibilityRole="link" onPress={breadcrumb.onPress} style={styles.breadcrumb}><Text style={styles.breadcrumbText}>{breadcrumb.label}</Text><Text style={styles.breadcrumbSeparator}>/</Text><Text style={styles.breadcrumbCurrent}>{title}</Text></Pressable> : null}
          <View style={styles.pageHeader}><View style={styles.headerCopy}>{eyebrow ? <Text style={styles.pageEyebrow}>{eyebrow}</Text> : null}<Text style={styles.pageTitle}>{title}</Text>{subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}</View>{actions ? <View style={styles.pageActions}>{actions}</View> : null}</View>
          {children}
        </ScrollView>
      </View>
    </View>
  </SafeAreaView>;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { profile } = useApp();
  const items = profile.role === 'admin' ? NAVIGATION : NAVIGATION.filter((item) => item.path === '/admin/accounting');
  return <View style={styles.sidebar}><View style={styles.sidebarBrand}><BrandMark compact /><View style={styles.consoleBadge}><Text style={styles.consoleBadgeText}>{profile.role === 'admin' ? 'ADMIN' : 'FINANCE'}</Text></View></View><Text style={styles.sidebarSection}>{profile.role === 'admin' ? 'WORKSPACE' : 'FINANCE WORKSPACE'}</Text><View style={styles.navList}>{items.map((item) => { const selected = item.path === '/admin' ? pathname === '/admin' : item.path === '/admin/orders' ? pathname.startsWith('/admin/order') : pathname.startsWith(item.path); return <Pressable key={item.path} onPress={() => { onNavigate?.(); router.push(item.path); }} style={({ pressed }) => [styles.navItem, selected && styles.navItemActive, pressed && styles.pressed]}><View style={[styles.navIcon, selected && styles.navIconActive]}><SymbolView name={item.icon} size={19} tintColor={selected ? Colors.surface : '#687C89'} /></View><Text style={[styles.navLabel, selected && styles.navLabelActive]}>{item.label}</Text>{selected ? <View style={styles.navActiveDot} /> : null}</Pressable>; })}</View><View style={styles.sidebarFooter}><View style={styles.sidebarSpark}><SymbolView name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={18} tintColor={Colors.tealDark} /></View><View><Text style={styles.sidebarFooterTitle}>Super Shine</Text><Text style={styles.sidebarFooterText}>{profile.role === 'admin' ? 'Operations console' : 'Accounting console'}</Text></View></View></View>;
}

function IconButton({ label, icon, onPress }: { label: string; icon: SymbolName; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><SymbolView name={icon} size={20} tintColor={Colors.navy} /></Pressable>;
}

export function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  const palette = TONES[tone];
  return <View style={[styles.badge, { backgroundColor: palette.background }]}><View style={[styles.badgeDot, { backgroundColor: palette.foreground }]} /><Text style={[styles.badgeText, { color: palette.foreground }]}>{label}</Text></View>;
}

export function AdminCard({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.adminCard, style]}>{children}</View>;
}

export function AdminKpiCard({ label, value, note, icon, indicator = 'neutral' }: { label: string; value: string; note: string; icon?: SymbolName; indicator?: 'positive' | 'warning' | 'critical' | 'neutral' }) {
  const toneStyle = indicator === 'positive' ? styles.kpiPositive : indicator === 'warning' ? styles.kpiWarning : indicator === 'critical' ? styles.kpiCritical : styles.kpiNeutral;
  const dotStyle = indicator === 'positive' ? styles.kpiIndicatorPositive : indicator === 'warning' ? styles.kpiIndicatorWarning : indicator === 'critical' ? styles.kpiIndicatorCritical : styles.kpiIndicatorNeutral;
  const iconColor = indicator === 'critical' ? Colors.coral : indicator === 'warning' ? '#B87500' : indicator === 'positive' ? Colors.success : Colors.blue;
  return <AdminCard style={styles.kpiCard}><View style={[styles.kpiAccent, dotStyle]} /><View style={styles.kpiTop}><View style={styles.kpiIdentity}>{icon ? <View style={[styles.kpiIcon, toneStyle]}><SymbolView name={icon} size={19} tintColor={iconColor} /></View> : null}<Text style={styles.kpiLabel}>{label}</Text></View><View style={[styles.kpiIndicator, dotStyle]} /></View><Text style={styles.kpiValue}>{value}</Text><View style={[styles.kpiNotePill, toneStyle]}><Text numberOfLines={1} style={styles.kpiNote}>{note}</Text></View></AdminCard>;
}

export function AdminLoadingState({ rows = 4 }: { rows?: number }) {
  return <View accessibilityLabel="Loading" style={styles.loadingStack}>{Array.from({ length: rows }, (_, index) => <View key={index} style={styles.loadingBlock} />)}</View>;
}

export function AdminFilterBar({ children }: PropsWithChildren) {
  return <AdminCard style={styles.filterBar}>{children}</AdminCard>;
}

export function AdminSectionTabs({ items, value, onChange }: { items: { id: string; label: string; dirty?: boolean }[]; value: string; onChange: (id: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>{items.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: value === item.id }} onPress={() => onChange(item.id)} style={[styles.sectionTab, value === item.id && styles.sectionTabActive]}><Text style={[styles.sectionTabText, value === item.id && styles.sectionTabTextActive]}>{item.label}{item.dirty ? ' •' : ''}</Text></Pressable>)}</ScrollView>;
}

export function EmptyState({ title, description, action, icon = { ios: 'tray.fill', android: 'inbox', web: 'inbox' } }: { title: string; description: string; action?: ReactNode; icon?: SymbolName }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><SymbolView name={icon} size={22} tintColor={Colors.tealDark} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{description}</Text>{action}</View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <AdminCard style={styles.errorPanel}><Text style={styles.errorPanelTitle}>Something went wrong</Text><Text style={styles.muted}>{message}</Text><Button label="Retry" variant="secondary" onPress={onRetry} style={styles.smallButton} /></AdminCard>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}</View>{action}</View>;
}

const TONES: Record<StatusTone, { background: string; foreground: string }> = {
  amber: { background: Colors.yellowLight, foreground: '#9A6100' },
  blue: { background: Colors.blueLight, foreground: Colors.blue },
  green: { background: Colors.successLight, foreground: Colors.success },
  teal: { background: Colors.tealLight, foreground: Colors.tealDark },
  coral: { background: Colors.coralLight, foreground: Colors.coral },
  gray: { background: '#EEF2F4', foreground: Colors.textMuted },
};

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#F2F6F5' },
  shellRow: { flex: 1, flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.canvas },
  sidebar: { width: 244, backgroundColor: Colors.surface, borderRightWidth: 1, borderRightColor: Colors.line, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20, zIndex: 30 },
  sidebarBrand: { paddingHorizontal: 9, marginBottom: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  consoleBadge: { minHeight: 24, borderRadius: Radius.pill, backgroundColor: Colors.tealLight, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  consoleBadgeText: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 9, fontWeight: '500', letterSpacing: 0.9 },
  sidebarSection: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 10.5, fontWeight: '500', letterSpacing: 1.25, paddingHorizontal: 11, marginBottom: 10 },
  navList: { gap: 7 },
  navItem: { minHeight: 52, borderRadius: 15, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  navItemActive: { backgroundColor: Colors.navy, ...Shadow },
  navIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#F0F5F4', alignItems: 'center', justifyContent: 'center' },
  navIconActive: { backgroundColor: 'rgba(255,255,255,0.13)' },
  navLabel: { flex: 1, color: Colors.navySoft, fontFamily: FontFamilyMedium, fontSize: 14, fontWeight: '500' },
  navLabelActive: { color: Colors.surface },
  navActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.teal },
  sidebarFooter: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: Colors.line, paddingTop: 18, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sidebarSpark: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.tealLight },
  sidebarFooterTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontWeight: '500', fontSize: 13 },
  sidebarFooterText: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11.5, marginTop: 2 },
  mobileMenu: { ...StyleSheet.absoluteFillObject, zIndex: 100, flexDirection: 'row' },
  mobileBackdrop: { flex: 1, backgroundColor: 'rgba(9,29,43,0.35)' },
  topbar: { height: 74, backgroundColor: 'rgba(255,255,255,0.96)', borderBottomWidth: 1, borderBottomColor: Colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, gap: 13, zIndex: 20 },
  topSearchWrap: { flex: 1, maxWidth: 560, minWidth: 160, height: 46, borderWidth: 0, borderRadius: 15, backgroundColor: '#EEF4F3', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  topSearch: { flex: 1, color: Colors.text, fontFamily: FontFamily, fontSize: 14, paddingHorizontal: 9, minWidth: 0 },
  topbarMeta: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 11 },
  storeBadge: { height: 34, borderRadius: 17, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  storeDot: { width: 8, height: 8, borderRadius: 4 },
  storeText: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500' },
  location: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 12.5 },
  iconButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF4F3' },
  notificationWrap: { position: 'relative' },
  notificationDot: { position: 'absolute', top: -5, right: -5, minWidth: 19, height: 19, paddingHorizontal: 3, borderRadius: 10, backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.surface },
  notificationCount: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 9, fontWeight: '500' },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontWeight: '500', fontSize: 14 },
  profileMenu: { position: 'absolute', right: 0, top: 50, width: 238, backgroundColor: Colors.surface, borderRadius: Radius.medium, borderWidth: 0, padding: 14, zIndex: 90, boxShadow: '0 14px 34px rgba(20,45,61,0.16)' },
  profileName: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 14, fontWeight: '500' },
  profileEmail: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 12, marginTop: 3 },
  menuRule: { height: 1, backgroundColor: Colors.line, marginVertical: 9 },
  profileAction: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 5 },
  profileActionText: { color: Colors.text, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500' },
  content: { width: '100%', maxWidth: 1400, alignSelf: 'center', paddingHorizontal: 30, paddingTop: 30, paddingBottom: 76 },
  breadcrumb: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginBottom: 6 },
  breadcrumbText: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 12.5, fontWeight: '500' },
  breadcrumbSeparator: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 13 },
  breadcrumbCurrent: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 12.5 },
  pageHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: 27 },
  headerCopy: { flex: 1, minWidth: 260 },
  pageEyebrow: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 11, fontWeight: '500', letterSpacing: 1.25, textTransform: 'uppercase', marginBottom: 7 },
  pageTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 34, lineHeight: 41, fontWeight: '500', letterSpacing: -0.8 },
  pageSubtitle: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 14, lineHeight: 22, marginTop: 5 },
  pageActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  badge: { minHeight: 29, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Radius.pill, paddingHorizontal: 11 },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontFamily: FontFamilyMedium, fontSize: 11.5, lineHeight: 16, fontWeight: '500' },
  adminCard: { backgroundColor: Colors.surface, borderWidth: 0, borderRadius: Radius.large, ...Shadow },
  kpiCard: { flexGrow: 1, flexBasis: 235, minWidth: 210, minHeight: 154, padding: 19, overflow: 'hidden' },
  kpiAccent: { position: 'absolute', left: 0, right: 0, top: 0, height: 4 },
  kpiTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  kpiIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  kpiIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  kpiLabel: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 13, fontWeight: '500' },
  kpiIndicator: { width: 8, height: 8, borderRadius: 4 },
  kpiIndicatorPositive: { backgroundColor: Colors.success },
  kpiIndicatorWarning: { backgroundColor: '#D58B00' },
  kpiIndicatorCritical: { backgroundColor: Colors.coral },
  kpiIndicatorNeutral: { backgroundColor: Colors.blue },
  kpiPositive: { backgroundColor: Colors.successLight },
  kpiWarning: { backgroundColor: Colors.yellowLight },
  kpiCritical: { backgroundColor: Colors.coralLight },
  kpiNeutral: { backgroundColor: Colors.blueLight },
  kpiValue: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 31, fontWeight: '500', letterSpacing: -0.6, marginTop: 15 },
  kpiNotePill: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 5, marginTop: 8 },
  kpiNote: { color: Colors.navySoft, fontFamily: FontFamily, fontSize: 11.5, lineHeight: 16 },
  loadingStack: { gap: 11 },
  loadingBlock: { height: 70, borderRadius: Radius.medium, backgroundColor: '#E7EFED' },
  filterBar: { padding: 15, gap: 11 },
  sectionTabs: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: Radius.medium, backgroundColor: '#E6ECEB' },
  sectionTab: { minHeight: 39, borderRadius: 12, borderWidth: 0, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  sectionTabActive: { backgroundColor: Colors.navy, ...Shadow },
  sectionTabText: { color: Colors.textMuted, fontFamily: FontFamilyMedium, fontSize: 11.5, fontWeight: '500' },
  sectionTabTextActive: { color: Colors.surface },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 13, marginBottom: 14 },
  sectionTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 20, fontWeight: '500', letterSpacing: -0.3 },
  sectionSubtitle: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  empty: { minHeight: 230, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyIcon: { width: 50, height: 50, borderRadius: 17, backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  emptyTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 17, fontWeight: '500' },
  emptyText: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 400, marginTop: 6 },
  errorPanel: { padding: 22, gap: 11 },
  errorPanelTitle: { color: Colors.coral, fontFamily: FontFamilyMedium, fontSize: 16, fontWeight: '500' },
  muted: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 13, lineHeight: 20 },
  smallButton: { minHeight: 42, alignSelf: 'flex-start' },
  panelTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 19, fontWeight: '500' },
  accessCard: { width: '90%', maxWidth: 480, padding: 26, gap: 15 },
  pressed: { opacity: 0.72 },
  loginCanvas: { flex: 1, backgroundColor: Colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'hidden' },
  loginGlowLarge: { position: 'absolute', width: 520, height: 520, borderRadius: 260, backgroundColor: Colors.tealLight, opacity: 0.72, top: -250, right: -150 },
  loginGlowSmall: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: Colors.blueLight, opacity: 0.56, bottom: -150, left: -80 },
  loginWrap: { width: '100%', maxWidth: 470, backgroundColor: Colors.surface, borderWidth: 0, borderRadius: Radius.xlarge, padding: 32, gap: 12, ...Shadow },
  loginBrandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  loginConsoleBadge: { minHeight: 27, borderRadius: Radius.pill, backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11 },
  loginConsoleBadgeText: { color: Colors.surface, fontFamily: FontFamilyMedium, fontSize: 9, fontWeight: '500', letterSpacing: 1 },
  loginIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  loginEyebrow: { color: Colors.tealDark, fontFamily: FontFamilyMedium, fontSize: 10, letterSpacing: 1.4, fontWeight: '500', marginTop: 3 },
  loginTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 29, lineHeight: 36, fontWeight: '500' },
  loginSubtitle: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 13, lineHeight: 20, marginBottom: 7 },
  loginFieldLabel: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 11.5, fontWeight: '500', marginTop: 2 },
  loginInput: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.canvas, color: Colors.text, fontFamily: FontFamily, fontSize: 13.5, paddingHorizontal: 14 },
  loginError: { backgroundColor: Colors.coralLight, borderRadius: 12, borderWidth: 0, padding: 12 },
  loginErrorTitle: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 12, fontWeight: '500' },
  loginErrorText: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 11, marginTop: 2 },
  loginButton: { minHeight: 50, marginTop: 4 },
});
