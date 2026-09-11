import type Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  latitude: number;
  longitude: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
  routeCoordinates?: [number, number][];
};

const DRIVER_ICON = '<div style="width:24px;height:24px;border-radius:50%;background:#0FA493;border:4px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>';
const CUSTOMER_ICON = '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#D9574E;border:4px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);transform:rotate(-45deg)"><div style="width:6px;height:6px;border-radius:50%;background:white;margin:6px"></div></div>';

export function LiveLocationMap({ latitude, longitude, destinationLatitude, destinationLongitude, routeCoordinates }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const driverRef = useRef<Leaflet.Marker | null>(null);
  const customerRef = useRef<Leaflet.Marker | null>(null);
  const routeRef = useRef<Leaflet.Polyline | null>(null);
  const [leaflet, setLeaflet] = useState<typeof Leaflet | null>(null);
  const hasDestination = destinationLatitude != null && destinationLongitude != null;

  useEffect(() => {
    let active = true;
    void import('leaflet').then((module) => {
      if (active) setLeaflet(module.default);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!leaflet || !containerRef.current || mapRef.current) return;
    const map = leaflet.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([latitude, longitude], 15);
    leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
      driverRef.current = null;
      customerRef.current = null;
      routeRef.current = null;
    };
  }, [latitude, leaflet, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!leaflet || !map) return;
    const driverPoint: Leaflet.LatLngExpression = [latitude, longitude];
    const driverIcon = leaflet.divIcon({ html: DRIVER_ICON, className: '', iconSize: [32, 32], iconAnchor: [16, 16] });
    if (driverRef.current) driverRef.current.setLatLng(driverPoint);
    else driverRef.current = leaflet.marker(driverPoint, { icon: driverIcon, title: 'Driver' }).addTo(map);

    if (hasDestination) {
      const customerPoint: Leaflet.LatLngExpression = [destinationLatitude, destinationLongitude];
      const customerIcon = leaflet.divIcon({ html: CUSTOMER_ICON, className: '', iconSize: [34, 34], iconAnchor: [17, 31] });
      if (customerRef.current) customerRef.current.setLatLng(customerPoint);
      else customerRef.current = leaflet.marker(customerPoint, { icon: customerIcon, title: 'Customer' }).addTo(map);
    } else if (customerRef.current) {
      customerRef.current.remove();
      customerRef.current = null;
    }

    if (routeRef.current) {
      routeRef.current.remove();
      routeRef.current = null;
    }
    if (routeCoordinates?.length) {
      const routePoints = routeCoordinates.map(([pointLongitude, pointLatitude]) => [pointLatitude, pointLongitude] as Leaflet.LatLngExpression);
      routeRef.current = leaflet.polyline(routePoints, { color: '#0FA493', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      map.fitBounds(routeRef.current.getBounds(), { padding: [28, 28], maxZoom: 16 });
    } else if (hasDestination) {
      map.fitBounds(leaflet.latLngBounds([driverPoint, [destinationLatitude, destinationLongitude]]), { padding: [28, 28], maxZoom: 16 });
    } else {
      map.setView(driverPoint, 15);
    }
  }, [destinationLatitude, destinationLongitude, hasDestination, latitude, leaflet, longitude, routeCoordinates]);

  return <View style={styles.frame}>
    <div ref={containerRef} aria-label="Live driver route to customer" style={webStyles.map} />
    <View pointerEvents="none" style={styles.legend}><Text style={styles.legendText}><Text style={styles.driver}>●</Text> Driver   <Text style={styles.customer}>●</Text> Customer</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { height: 300, overflow: 'hidden', borderRadius: 16, position: 'relative', backgroundColor: '#E8F1F3' },
  legend: { position: 'absolute', left: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.94)' },
  legendText: { color: '#16324A', fontSize: 11, fontWeight: '800' },
  driver: { color: '#0FA493' },
  customer: { color: '#D9574E' },
});
const webStyles = { map: { width: '100%', height: '100%' } };
