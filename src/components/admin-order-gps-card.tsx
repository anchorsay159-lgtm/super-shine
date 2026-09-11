import { StyleSheet, Text, View } from 'react-native';

import { AdminCard } from '@/admin/admin-ui';
import { SymbolView } from '@/components/symbol';
import { Colors, FontFamily, FontFamilyMedium } from '@/constants/design';
import type { CustomerOrder } from '@/types/domain';
import type { TrackingPhase } from '@/types/live-location';

export function AdminOrderGpsCard({ order }: { order: CustomerOrder; onStartTrip?: (phase: TrackingPhase) => Promise<boolean> }) {
  const relevant = order.collectionMethod === 'home_pickup' && ['accepted', 'pickup_in_progress'].includes(order.status)
    || order.returnMethod === 'home_delivery' && ['ready', 'out_for_delivery'].includes(order.status);
  if (!relevant) return null;
  if (order.isDemo) return null;
  const active = ['pickup_in_progress', 'out_for_delivery'].includes(order.status);
  return <AdminCard style={styles.card}><View style={styles.header}><View style={[styles.icon, active && styles.iconActive]}><SymbolView name={{ ios: 'location.fill', android: 'location_on', web: 'location_on' }} size={19} tintColor={active ? Colors.surface : Colors.tealDark} /></View><View style={styles.copy}><Text style={styles.title}>Live GPS tracking</Text><Text style={[styles.state, active && styles.stateActive]}>{active ? 'Trip stage active' : 'Ready when the trip begins'}</Text></View><View style={[styles.dot, active && styles.dotActive]} /></View><Text style={styles.description}>Open this order on the driver’s phone. When pickup or delivery starts, the secure web app uses that device’s location for customer tracking.</Text></AdminCard>;
}

const styles = StyleSheet.create({
  card: { padding: 17, borderTopWidth: 3, borderTopColor: Colors.blue },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.tealLight, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: Colors.teal },
  copy: { flex: 1 },
  title: { color: Colors.navy, fontFamily: FontFamilyMedium, fontSize: 13.5, fontWeight: '500' },
  state: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 9.5, marginTop: 3 },
  stateActive: { color: Colors.success },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.textMuted, opacity: 0.35 },
  dotActive: { backgroundColor: Colors.success, opacity: 1, boxShadow: '0 0 0 4px rgba(35,139,101,0.12)' },
  description: { color: Colors.textMuted, fontFamily: FontFamily, fontSize: 9.5, lineHeight: 16, marginTop: 11 },
});
