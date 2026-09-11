import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, DetailHeader, IconBadge, Page } from '@/components/super-ui';
import { InformationBanner } from '@/components/customer-ui';
import { SymbolView } from '@/components/symbol';
import { Colors, Radius, Space } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { formatBangkokDate } from '@/lib/domain';

export default function NotificationsScreen() {
  const { dataError, dataLoading, language, markAllNotificationsRead, markNotificationRead, notifications, refresh, t, unreadNotifications } = useApp();
  async function open(id: string, orderId?: string | null, link?: string | null) {
    await markNotificationRead(id);
    if (orderId) router.push({ pathname: '/order-tracking', params: { orderId } });
    else if (link === '/offers') router.push('/(tabs)/offers');
  }
  const grouped = groupNotifications(notifications, t);
  return (
    <Page>
      <DetailHeader title={t('Notifications')} action={unreadNotifications.length ? t('Read all') : undefined} onAction={() => void markAllNotificationsRead()} />
      <InformationBanner title={unreadNotifications.length ? t('{{count}} new updates', { count: unreadNotifications.length }) : t('You are all caught up')} message={t('Order progress and support replies appear here.')} icon={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} />
      {dataLoading && !notifications.length ? <ActivityIndicator color={Colors.teal} /> : null}
      {dataError ? <Card style={styles.state}><Text style={styles.stateTitle}>{t('Notifications could not be loaded')}</Text><Text style={styles.detail}>{t(dataError)}</Text><Button label={t('Retry')} onPress={() => void refresh()} /></Card> : null}
      {!dataLoading && !dataError && !notifications.length ? <Card style={styles.state}><Text style={styles.stateTitle}>{t('No notifications yet')}</Text><Text style={styles.detail}>{t('Order updates and support replies will appear here.')}</Text></Card> : null}
      <View style={styles.list}>{grouped.map((group) => <View key={group.title} style={styles.group}><Text accessibilityRole="header" style={styles.groupTitle}>{group.title}</Text>{group.items.map((item) => {
        const unread = !item.readAt;
        return <Pressable key={item.id} onPress={() => void open(item.id, item.orderId, item.link)} style={({ pressed }) => [styles.item, unread && styles.unread, pressed && styles.pressed]}>
          <IconBadge name={{ ios: item.type.includes('support') ? 'message.fill' : 'bell.fill', android: item.type.includes('support') ? 'chat_bubble' : 'notifications', web: item.type.includes('support') ? 'chat_bubble' : 'notifications' }} color={item.type.includes('support') ? Colors.blue : Colors.tealDark} backgroundColor={item.type.includes('support') ? Colors.blueLight : Colors.tealLight} badgeSize={48} />
          <View style={styles.copy}><View style={styles.titleRow}><Text style={styles.title}>{t(item.titleKey || item.title, item.messageParams)}</Text>{unread ? <View style={styles.dot} /> : null}</View><Text style={styles.detail}>{t(item.messageKey || item.message, item.messageParams)}</Text><Text style={styles.time}>{formatBangkokDate(item.createdAt, language)}</Text></View>
          <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} tintColor={Colors.textMuted} />
        </Pressable>;
      })}</View>)}</View>
    </Page>
  );
}

function groupNotifications<T extends { createdAt: string }>(items: T[], t: (key: string) => string) {
  const bangkokDay = (value: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  const today = bangkokDay(new Date());
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const groups = [
    { title: t('Today'), items: items.filter((item) => bangkokDay(new Date(item.createdAt)) === today) },
    { title: t('Earlier'), items: items.filter((item) => bangkokDay(new Date(item.createdAt)) !== today && new Date(item.createdAt).getTime() >= weekAgo) },
    { title: t('Older'), items: items.filter((item) => new Date(item.createdAt).getTime() < weekAgo) },
  ];
  return groups.filter((group) => group.items.length);
}

const styles = StyleSheet.create({ list: { gap: Space.xl }, group: { gap: Space.md }, groupTitle: { color: Colors.navy, fontSize: 16, fontWeight: '700' }, item: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: Space.md, backgroundColor: Colors.surface, borderRadius: Radius.large, borderWidth: 1, borderColor: Colors.line, padding: Space.lg }, unread: { borderColor: '#B9E7E1', backgroundColor: Colors.mint }, pressed: { opacity: 0.68 }, copy: { flex: 1 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm }, title: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '700' }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.coral }, detail: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 }, time: { color: Colors.tealDark, fontSize: 10, fontWeight: '600', marginTop: 7 }, state: { padding: Space.xl, gap: Space.md }, stateTitle: { color: Colors.navy, fontSize: 20, fontWeight: '700' } });
