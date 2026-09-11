import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/design';

export function LineConnectButton({ href, loading, label }: { href?: string; loading: boolean; label: string }) {
  if (!href || loading) {
    return <View style={[styles.button, styles.disabled]}>{loading ? <ActivityIndicator color={Colors.surface} /> : <Text style={styles.label}>{label}</Text>}</View>;
  }

  // A real anchor tap is intentional. LINE documents that iOS Universal Links
  // may not launch the LINE app when authorization begins from a JS redirect.
  return <View style={styles.button}>{React.createElement('a', {
    href,
    style: styles.anchor,
    'aria-label': label,
  }, label)}</View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 48, marginTop: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.teal },
  disabled: { alignItems: 'center', justifyContent: 'center', opacity: 0.58 },
  label: { color: Colors.surface, fontSize: 14, fontWeight: '800' },
  anchor: {
    minHeight: 48,
    color: Colors.surface,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: '800',
    textDecorationLine: 'none',
  },
});
