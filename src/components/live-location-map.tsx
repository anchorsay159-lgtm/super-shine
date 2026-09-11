import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/super-ui';
import { Colors } from '@/constants/design';

export function LiveLocationMap({ latitude, longitude, destinationLatitude, destinationLongitude }: { latitude: number; longitude: number; destinationLatitude?: number; destinationLongitude?: number; routeCoordinates?: [number, number][] }) {
  const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  return <View style={styles.fallback}>
    <Text style={styles.title}>Live location available</Text>
    <Text style={styles.coordinates}>{latitude.toFixed(5)}, {longitude.toFixed(5)}</Text>
    {destinationLatitude != null && destinationLongitude != null ? <Text style={styles.coordinates}>Customer: {destinationLatitude.toFixed(5)}, {destinationLongitude.toFixed(5)}</Text> : null}
    <Button label="Open map" onPress={() => void Linking.openURL(url)} />
  </View>;
}

const styles = StyleSheet.create({
  fallback: { gap: 10, borderRadius: 14, backgroundColor: Colors.tealLight, padding: 16 },
  title: { color: Colors.navy, fontSize: 14, fontWeight: '900' },
  coordinates: { color: Colors.textMuted, fontSize: 11 },
});
