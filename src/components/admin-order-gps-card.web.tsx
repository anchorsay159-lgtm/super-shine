import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AdminCard } from '@/admin/admin-ui';
import { LiveLocationMap } from '@/components/live-location-map';
import { Button } from '@/components/super-ui';
import { Colors } from '@/constants/design';
import { formatEta, useDrivingRoute } from '@/hooks/use-driving-route';
import { useOrderLiveLocation } from '@/hooks/use-order-live-location';
import { distanceMeters, formatDistance } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import type { CustomerOrder } from '@/types/domain';
import type { TrackingPhase } from '@/types/live-location';

type BrowserPosition = GeolocationPosition;

function trackingPhase(order: CustomerOrder): TrackingPhase | null {
  if (order.collectionMethod === 'home_pickup' && ['accepted', 'pickup_in_progress'].includes(order.status)) return 'pickup';
  if (order.returnMethod === 'home_delivery' && ['ready', 'out_for_delivery'].includes(order.status)) return 'delivery';
  return null;
}

function gpsError(error: GeolocationPositionError | Error) {
  if ('code' in error && error.code === 1) return 'Location permission was denied. Allow location access in this browser, then press Start again.';
  if ('code' in error && error.code === 2) return 'Your current location is unavailable. Turn on device location, then press Start again.';
  return 'GPS could not start. Check location access and your internet connection.';
}

export function AdminOrderGpsCard({ order, onStartTrip }: { order: CustomerOrder; onStartTrip?: (phase: TrackingPhase) => Promise<boolean> }) {
  const phase = trackingPhase(order);
  const { location, reload } = useOrderLiveLocation(order.databaseId);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sharedTarget, setSharedTarget] = useState({
    pickupLatitude: order.pickupLatitude ?? null,
    pickupLongitude: order.pickupLongitude ?? null,
    deliveryLatitude: order.deliveryLatitude ?? null,
    deliveryLongitude: order.deliveryLongitude ?? null,
  });
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);

  useEffect(() => {
    setSharedTarget({
      pickupLatitude: order.pickupLatitude ?? null,
      pickupLongitude: order.pickupLongitude ?? null,
      deliveryLatitude: order.deliveryLatitude ?? null,
      deliveryLongitude: order.deliveryLongitude ?? null,
    });
  }, [order.deliveryLatitude, order.deliveryLongitude, order.pickupLatitude, order.pickupLongitude]);

  useEffect(() => {
    if (!supabase || order.isDemo) return;
    let cancelled = false;
    const loadTarget = async () => {
      const result = await supabase!.from('orders').select('pickup_latitude,pickup_longitude,delivery_latitude,delivery_longitude').eq('id', order.databaseId).maybeSingle();
      if (!cancelled && result.data) setSharedTarget({
        pickupLatitude: result.data.pickup_latitude == null ? null : Number(result.data.pickup_latitude),
        pickupLongitude: result.data.pickup_longitude == null ? null : Number(result.data.pickup_longitude),
        deliveryLatitude: result.data.delivery_latitude == null ? null : Number(result.data.delivery_latitude),
        deliveryLongitude: result.data.delivery_longitude == null ? null : Number(result.data.delivery_longitude),
      });
    };
    void loadTarget();
    const timer = setInterval(() => void loadTarget(), 5_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [order.databaseId, order.isDemo]);

  const livePhase = location?.phase || phase;
  const customerLatitude = livePhase === 'pickup' ? sharedTarget.pickupLatitude : sharedTarget.deliveryLatitude;
  const customerLongitude = livePhase === 'pickup' ? sharedTarget.pickupLongitude : sharedTarget.deliveryLongitude;
  const customerDistance = location && customerLatitude != null && customerLongitude != null
    ? distanceMeters(location.latitude, location.longitude, customerLatitude, customerLongitude)
    : null;
  const { route, loading: routeLoading, error: routeError } = useDrivingRoute(
    location?.status === 'active' ? location.latitude : undefined,
    location?.status === 'active' ? location.longitude : undefined,
    customerLatitude ?? undefined,
    customerLongitude ?? undefined,
  );

  const clearWatch = useCallback(() => {
    if (watchId.current != null && typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
  }, []);

  useEffect(() => () => clearWatch(), [clearWatch]);
  useEffect(() => { if (!phase && sharing) clearWatch(); }, [clearWatch, phase, sharing]);

  const sendPosition = useCallback(async (position: BrowserPosition, first: boolean) => {
    if (!supabase || !phase) return;
    const now = Date.now();
    if (!first && now - lastSentAt.current < 4_000) return;
    lastSentAt.current = now;
    const values = {
      p_order_id: order.databaseId,
      p_latitude: position.coords.latitude,
      p_longitude: position.coords.longitude,
      p_accuracy_meters: position.coords.accuracy || null,
      p_heading_degrees: position.coords.heading == null || position.coords.heading < 0 ? null : position.coords.heading,
      p_speed_mps: position.coords.speed == null || position.coords.speed < 0 ? null : position.coords.speed,
    };
    const result = first
      ? await supabase.rpc('staff_start_order_tracking_v1', { ...values, p_phase: phase })
      : await supabase.rpc('staff_update_order_location_v1', values);
    if (result.error) throw new Error(result.error.message);
    void reload();
  }, [order.databaseId, phase, reload]);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !phase || busy || sharing) {
      if (phase && typeof navigator !== 'undefined' && !navigator.geolocation) setError('Automatic location is not available in this browser.');
      return;
    }
    setBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        if (onStartTrip && !(await onStartTrip(phase))) throw new Error('The order stage could not be updated. Try again.');
        await sendPosition(position, true);
        setSharing(true);
        watchId.current = navigator.geolocation.watchPosition(
          (next) => void sendPosition(next, false).catch((cause) => { setError(gpsError(cause as Error)); clearWatch(); }),
          (cause) => { setError(gpsError(cause)); clearWatch(); },
          { enableHighAccuracy: true, maximumAge: 3_000, timeout: 20_000 },
        );
      } catch (cause) { setError(gpsError(cause as Error)); }
      finally { setBusy(false); }
    }, (cause) => { setError(gpsError(cause)); setBusy(false); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
  }, [busy, clearWatch, onStartTrip, phase, sendPosition, sharing]);

  const stop = useCallback(async () => {
    if (!supabase || busy) return;
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('staff_stop_order_tracking_v1', { p_order_id: order.databaseId });
      if (result.error) throw new Error(result.error.message);
      clearWatch();
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tracking could not be stopped.');
    } finally {
      setBusy(false);
    }
  }, [busy, clearWatch, order.databaseId, reload]);

  if (order.isDemo || (!phase && location?.status !== 'active')) return null;
  return <AdminCard style={styles.card}>
    <View style={styles.heading}><View style={[styles.dot, sharing && styles.dotLive]} /><View style={styles.copy}><Text style={styles.title}>{phase === 'delivery' ? 'Delivery & live tracking' : 'Pickup & live tracking'}</Text><Text style={styles.hint}>{phase ? `Use the staff phone handling this ${phase}. One action updates the order stage and starts live GPS.` : 'This trip is finishing and no longer accepts new GPS updates.'}</Text></View></View>
    {location?.status === 'active' ? <LiveLocationMap latitude={location.latitude} longitude={location.longitude} destinationLatitude={customerLatitude ?? undefined} destinationLongitude={customerLongitude ?? undefined} routeCoordinates={route?.coordinates} /> : null}
    {location?.status === 'active' && (route || customerDistance != null) ? <View style={styles.tripSummary}>
      <Text style={styles.distance}>{route ? formatDistance(route.distanceMeters) : `About ${formatDistance(customerDistance!)}`}</Text>
      <Text style={styles.eta}>{route ? `${formatEta(route.durationSeconds)} estimated drive` : 'Straight-line estimate'}</Text>
    </View> : location?.status === 'active' ? <Text style={styles.pausedText}>The customer destination pin is missing, so route and ETA are unavailable.</Text> : null}
    {routeLoading ? <Text style={styles.pausedText}>Calculating the road route…</Text> : null}
    {routeError && customerDistance != null ? <Text style={styles.pausedText}>Road route unavailable. Showing an approximate distance.</Text> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {phase ? <View style={styles.actions}>
      {!sharing ? <Button label={location?.status === 'active' ? `Take over ${phase} tracking` : order.status === 'accepted' || order.status === 'ready' ? `Start ${phase} & live tracking` : `Resume ${phase} tracking on this phone`} onPress={start} loading={busy} style={styles.action} /> : null}
      {sharing ? <Button label="End live tracking" variant="danger" onPress={() => void stop()} loading={busy} style={styles.action} /> : null}
    </View> : null}
    {sharing ? <Text style={styles.liveText}>This phone is now the live driver. Keep this page open while travelling.</Text> : location?.status === 'active' ? <Text style={styles.pausedText}>Another staff session is active. Take over only if you are handling this trip.</Text> : phase ? <Text style={styles.pausedText}>The customer map stays hidden until this phone starts sending live GPS.</Text> : null}
  </AdminCard>;
}

const styles = StyleSheet.create({
  card: { padding: 15, gap: 12, marginBottom: 18 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, copy: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.line }, dotLive: { backgroundColor: Colors.success },
  title: { color: Colors.navy, fontSize: 14, fontWeight: '900' }, hint: { color: Colors.textMuted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  error: { color: Colors.coral, fontSize: 10, lineHeight: 15 }, liveText: { color: Colors.success, fontSize: 10, fontWeight: '700' }, pausedText: { color: Colors.textMuted, fontSize: 10, lineHeight: 15 },
  distance: { color: Colors.navy, fontSize: 12, fontWeight: '800' },
  eta: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
  tripSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  actions: { flexDirection: 'row', gap: 10 }, action: { flex: 1 },
});
