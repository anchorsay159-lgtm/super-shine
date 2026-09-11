import { usePathname } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { CustomerColors as C, CustomerLayout } from '@/constants/customer-design';

import '@/styles/customer-web.css';

export function AppFrame({ children }: PropsWithChildren) {
  const pathname = usePathname();

  if (pathname.startsWith('/admin')) return children;

  return (
    <View style={styles.canvas} testID="customer-web-canvas">
      <View style={styles.frame} testID="customer-web-frame">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#DCE8EC',
    overflow: 'hidden',
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: CustomerLayout.desktopMaxWidth,
    backgroundColor: C.canvas,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
});
