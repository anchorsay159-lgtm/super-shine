import { Redirect, Tabs, usePathname, type Href } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import House from 'lucide-react-native/icons/house';
import ReceiptText from 'lucide-react-native/icons/receipt-text';
import TicketPercent from 'lucide-react-native/icons/ticket-percent';
import UserRound from 'lucide-react-native/icons/user-round';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomerColors as C } from '@/constants/customer-design';
import { FontFamilyMedium } from '@/constants/design';
import { useApp } from '@/context/app-context';

const CUSTOMER_TAB_ICONS = {
  home: House,
  orders: ReceiptText,
  offers: TicketPercent,
  profile: UserRound,
} as const;

export default function CustomerTabs() {
  const { authLoading, profile, refresh, refreshCoupons, t, unreadNotifications, userId } = useApp();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.endsWith('/home')) void refresh();
    else if (pathname.endsWith('/offers')) void refreshCoupons();
  }, [pathname, refresh, refreshCoupons]);

  if (authLoading) return <View style={styles.loading}><ActivityIndicator color={C.teal} /></View>;
  if (!userId) return <Redirect href="/auth" />;
  if (profile.role === 'admin') return <Redirect href={'/admin' as Href} />;
  if (profile.role === 'driver') return <Redirect href={'/driver' as Href} />;

  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <FreshTabBar {...props} unreadCount={unreadNotifications.length} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarHideOnKeyboard: true,
      }}>
      <Tabs.Screen name="home" options={{ title: t('Home') }} />
      <Tabs.Screen name="orders" options={{ title: t('Orders') }} />
      <Tabs.Screen name="offers" options={{ title: t('Offers') }} />
      <Tabs.Screen name="profile" options={{ title: t('Profile') }} />
    </Tabs>
  );
}

function FreshTabBar({ state, descriptors, navigation, unreadCount }: BottomTabBarProps & { unreadCount: number }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.tabBarArea, { paddingBottom: Math.max(insets.bottom, 14) }]}><View style={styles.tabBar}>
    {state.routes.map((route, index) => {
      const focused = state.index === index;
      const option = descriptors[route.key].options;
      const label = typeof option.title === 'string' ? option.title : route.name;
      const TabIcon = CUSTOMER_TAB_ICONS[route.name as keyof typeof CUSTOMER_TAB_ICONS] ?? House;
      return <Pressable key={route.key} accessibilityRole="button" accessibilityState={{ selected: focused }} accessibilityLabel={option.tabBarAccessibilityLabel ?? label} onPress={() => { const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params); }} style={({ pressed }) => [styles.tabItem, focused && styles.tabItemActive, pressed && styles.tabPressed]}>
        <View><TabIcon size={19} color={focused ? C.white : C.muted} strokeWidth={focused ? 2.2 : 1.8} />{route.name === 'orders' && unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(99, unreadCount)}</Text></View> : null}</View>
        <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
      </Pressable>;
    })}
  </View></View>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.canvas },
  scene: { backgroundColor: C.canvas },
  tabBarArea: { backgroundColor: C.canvas, paddingHorizontal: 14 },
  tabBar: {
    width: '100%',
    height: 72,
    maxWidth: 692,
    alignSelf: 'center',
    flexDirection: 'row',
    padding: 8,
    borderRadius: 22,
    backgroundColor: C.white,
    shadowColor: C.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 8,
  },
  tabItem: { flex: 1, minHeight: 50, borderRadius: 15, marginHorizontal: 2, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabItemActive: { backgroundColor: C.navy },
  tabPressed: { opacity: 0.72 },
  tabLabel: { color: C.muted, fontFamily: FontFamilyMedium, fontSize: 10, lineHeight: 13, fontWeight: '500' },
  tabLabelActive: { color: C.white },
  badge: { position: 'absolute', top: -5, right: -8, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: '#EE746D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: C.white, fontFamily: FontFamilyMedium, fontSize: 8, fontWeight: '500' },
});
