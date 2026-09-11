import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark, Button, Card } from '@/components/super-ui';
import { Colors, Space } from '@/constants/design';
import { useApp } from '@/context/app-context';
import { useRouteReady } from '@/hooks/use-route-ready';

export default function OrderSuccessScreen() {
  const { activeOrder, orders, t } = useApp();
  const params = useLocalSearchParams<{ orderId?: string; orderNumber?: string; total?: string; pickup?: string; address?: string }>();
  const routeReady = useRouteReady();
  const orderId = routeReady ? params.orderId : undefined;
  const createdOrder = orders.find((order) => order.databaseId === orderId) || activeOrder;
  const orderNumber = (routeReady ? params.orderNumber : undefined) ?? createdOrder?.id ?? t('Pending');
  const pickupSlot = (routeReady ? params.pickup : undefined) || createdOrder?.pickupSlot || t('To be confirmed');
  const address = (routeReady ? params.address : undefined) || createdOrder?.pickupAddress || t('To be confirmed');
  const total = Number((routeReady ? params.total : undefined) ?? createdOrder?.amount ?? 0);
  const paymentLabel = createdOrder ? t(`paymentMethod.${createdOrder.paymentMethod}`) : '—';
  const homePickup = createdOrder?.collectionMethod !== 'store_dropoff';
  const confirmationTitle = homePickup ? t('Pickup scheduled!') : t('Order confirmed!');
  const confirmationMessage = homePickup
    ? t('Super Shine received your order and will collect your laundry during the selected pickup window.')
    : t('Super Shine received your order. Bring your laundry to the store when you are ready.');

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <BrandMark compact />
        <View style={styles.content}>
          <View style={styles.successCircleOuter}>
            <View style={styles.successCircle}>
              <SymbolView
                name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                size={44}
                tintColor={Colors.surface}
                weight="bold"
              />
            </View>
          </View>
          <Text style={styles.eyebrow}>{t('ORDER CONFIRMED')}</Text>
          <Text style={styles.title}>{confirmationTitle}</Text>
          <Text style={styles.subtitle}>{confirmationMessage}</Text>

          <Card style={styles.orderCard}>
            <View style={styles.orderRow}>
              <Text style={styles.orderLabel}>{t('Order number')}</Text>
              <Text style={styles.orderValue}>#{orderNumber}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.orderRow}>
              <Text style={styles.orderLabel}>{t(homePickup ? 'Pickup window' : 'Fulfillment')}</Text>
              <Text style={styles.orderValue}>{homePickup ? t(pickupSlot) : t('Store Drop-off')}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.orderRow}>
              <Text style={styles.orderLabel}>{t(homePickup ? 'Pickup address' : 'Next step')}</Text>
              <Text style={styles.orderValue}>{homePickup ? address : t('Bring your laundry to Super Shine')}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.orderRow}>
              <Text style={styles.orderLabel}>{t('Estimated total')}</Text>
              <Text style={styles.orderValue}>฿{new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(total)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.orderRow}>
              <Text style={styles.orderLabel}>{t('Payment')}</Text>
              <Text style={styles.orderValue}>{paymentLabel}</Text>
            </View>
          </Card>
        </View>

        <View style={styles.actions}>
          <Button label={t('View order')} onPress={() => router.replace({ pathname: '/order-tracking', params: { orderId } })} />
          <Button label={t('Back to home')} variant="ghost" onPress={() => router.replace('/(tabs)/home')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.surface },
  container: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: Space.xxl, paddingTop: Space.md, paddingBottom: Space.xxl },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  successCircleOuter: { width: 126, height: 126, borderRadius: 63, backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  successCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.teal, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: Colors.tealDark, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginTop: Space.xxl },
  title: { color: Colors.navy, fontSize: 30, fontWeight: '700', letterSpacing: -0.55, marginTop: 7, textAlign: 'center' },
  subtitle: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: Space.md, maxWidth: 390 },
  orderCard: { width: '100%', padding: Space.xl, marginTop: Space.xxxl },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Space.xl },
  orderLabel: { color: Colors.textMuted, fontSize: 13 },
  orderValue: { color: Colors.text, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  divider: { height: 1, backgroundColor: Colors.line, marginVertical: Space.md },
  actions: { gap: Space.sm },
});
