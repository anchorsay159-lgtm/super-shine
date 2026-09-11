import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LiveLocationMap } from '@/components/live-location-map';
import { Card } from '@/components/super-ui';
import { CustomerColors as C, CustomerSpace as S, CustomerType } from '@/constants/customer-design';
import { formatEta, useDrivingRoute } from '@/hooks/use-driving-route';
import { useOrderLiveLocation } from '@/hooks/use-order-live-location';
import { distanceMeters, formatDistance } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import type { CustomerOrder } from '@/types/domain';
import type { TrackingPhase } from '@/types/live-location';

function trackingPhase(order: CustomerOrder): TrackingPhase | null {
  if (order.collectionMethod === 'home_pickup' && order.status === 'pickup_in_progress') return 'pickup';
  if (order.returnMethod === 'home_delivery' && order.status === 'out_for_delivery') return 'delivery';
  return null;
}

function gpsError(error: GeolocationPositionError | Error) {
  if ('code' in error && error.code === 1) return 'Location permission was denied. Allow location access and try again.';
  if ('code' in error && error.code === 2) return 'Your current location is unavailable. Turn on device location and try again.';
  return 'We could not read your location. Check location access and try again.';
}

function freshnessLabel(capturedAt: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(capturedAt).getTime()) / 1000));
  if (seconds < 15) return 'Live now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  return `Updated ${Math.floor(seconds / 60)}m ago`;
}

export function CustomerOrderGpsCard({ order }: { order: CustomerOrder }) {
  const { location, loading, reload } = useOrderLiveLocation(order.databaseId);
  const phase = trackingPhase(order);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [sharedLocation, setSharedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const autoSharePhase = useRef<TrackingPhase | null>(null);
  const activeLocation = location?.status === 'active' ? location : null;
  const livePhase = activeLocation?.phase ?? phase;
  useEffect(() => {
    const latitude = livePhase === 'pickup' ? order.pickupLatitude : order.deliveryLatitude;
    const longitude = livePhase === 'pickup' ? order.pickupLongitude : order.deliveryLongitude;
    setSharedLocation(latitude != null && longitude != null ? { latitude, longitude } : null);
  }, [livePhase, order.deliveryLatitude, order.deliveryLongitude, order.pickupLatitude, order.pickupLongitude]);
  const destination = sharedLocation;
  const driverDistance = activeLocation && destination
    ? distanceMeters(activeLocation.latitude, activeLocation.longitude, destination.latitude, destination.longitude)
    : null;
  const { route, loading: routeLoading, error: routeError } = useDrivingRoute(
    activeLocation?.latitude,
    activeLocation?.longitude,
    destination?.latitude,
    destination?.longitude,
  );
  const waitingForPickup = livePhase === 'pickup';

  const captureLocation = useCallback(() => {
    if (!supabase || !activeLocation || !livePhase || sharing || typeof navigator === 'undefined' || !navigator.geolocation) {
      if (livePhase && typeof navigator !== 'undefined' && !navigator.geolocation) setError('Automatic location is not available in this browser.');
      return;
    }
    setSharing(true); setError('');
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const result = await supabase!.rpc('customer_set_order_location_v1', {
          p_order_id: order.databaseId,
          p_phase: livePhase,
          p_latitude: position.coords.latitude,
          p_longitude: position.coords.longitude,
          p_accuracy_meters: position.coords.accuracy || null,
        });
        if (result.error) throw new Error(result.error.message);
        setSharedLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        await reload();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your location could not be saved.'); }
      finally { setSharing(false); }
    }, (cause) => { setError(gpsError(cause)); setSharing(false); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
  }, [activeLocation, livePhase, order.databaseId, reload, sharing]);

  useEffect(() => {
    if (order.isDemo || !activeLocation || ['delivered', 'collected', 'cancelled'].includes(order.status) || !livePhase || destination || autoSharePhase.current === livePhase) return;
    autoSharePhase.current = livePhase;
    captureLocation();
  }, [activeLocation, captureLocation, destination, livePhase, order.isDemo, order.status]);

  if (order.isDemo || loading || !activeLocation || ['delivered', 'collected', 'cancelled'].includes(order.status)) return null;
  const stale = activeLocation ? Date.now() - new Date(activeLocation.capturedAt).getTime() > 90_000 : false;
  return <Card style={styles.card}>
    <View style={styles.header}>
      <View style={activeLocation ? styles.liveDot : styles.waitingDot} />
      <View style={styles.copy}>
        <Text style={styles.title}>Live GPS tracking</Text>
        <Text style={[styles.status, stale && styles.stale]}>{activeLocation ? (stale ? 'Waiting for the next GPS update' : freshnessLabel(activeLocation.capturedAt)) : waitingForPickup ? 'Pickup tracking is ready' : 'Delivery tracking is ready'}</Text>
      </View>
    </View>
    {activeLocation ? <LiveLocationMap latitude={activeLocation.latitude} longitude={activeLocation.longitude} destinationLatitude={destination?.latitude} destinationLongitude={destination?.longitude} routeCoordinates={route?.coordinates} /> : null}
    {route ? <View style={styles.tripSummary}><View><Text style={styles.distance}>{formatDistance(route.distanceMeters)} away</Text><Text style={styles.eta}>Estimated arrival in {formatEta(route.durationSeconds)}</Text></View><View style={styles.livePill}><Text style={styles.livePillText}>LIVE</Text></View></View> : driverDistance != null ? <Text style={styles.distance}>Driver is about {formatDistance(driverDistance)} away</Text> : <Text style={styles.waiting}>{sharing ? 'Getting your location automatically…' : waitingForPickup ? 'Waiting for your pickup location permission.' : 'Waiting for your delivery location permission.'}</Text>}
    {routeLoading ? <Text style={styles.note}>Calculating the fastest road route…</Text> : null}
    {routeError && driverDistance != null ? <Text style={styles.note}>Road route is temporarily unavailable. The distance shown is approximate.</Text> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Text style={styles.note}>{activeLocation ? 'The driver marker updates automatically while the driver keeps live tracking open.' : 'The map will appear automatically when the driver starts the trip.'}</Text>
  </Card>;
}

const styles = StyleSheet.create({
  card: { gap: S.md, borderColor: C.teal, backgroundColor: C.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.teal },
  waitingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.border },
  copy: { flex: 1 },
  title: { ...CustomerType.section, color: C.navy },
  status: { ...CustomerType.caption, color: C.tealPressed, marginTop: 2 },
  stale: { color: C.muted },
  waiting: { ...CustomerType.body, color: C.muted, marginTop: 4 },
  distance: { ...CustomerType.body, color: C.navy, fontWeight: '700' },
  eta: { ...CustomerType.caption, color: C.tealPressed, marginTop: 2, fontWeight: '700' },
  tripSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  livePill: { backgroundColor: C.teal, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  livePillText: { ...CustomerType.caption, color: C.white, fontWeight: '900' },
  error: { ...CustomerType.caption, color: C.error },
  note: { ...CustomerType.caption, color: C.muted },
});
