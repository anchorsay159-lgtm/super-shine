import {
  SymbolView as ExpoSymbolView,
  type SFSymbol,
  type SymbolViewProps as ExpoSymbolViewProps,
} from 'expo-symbols';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';

export type SymbolName =
  | SFSymbol
  | {
      ios?: SFSymbol;
      android?: string;
      web?: string;
    };

export type SymbolViewProps = Omit<ExpoSymbolViewProps, 'name'> & {
  name: SymbolName;
};

type MaterialIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ANDROID_ICON_ALIASES: Record<string, MaterialIconName> = {
  add: 'plus', add_a_photo: 'camera-plus-outline', arrow_back: 'arrow-left', arrow_back_ios_new: 'chevron-left',
  arrow_forward: 'arrow-right', check: 'check', check_circle: 'check-circle', chevron_right: 'chevron-right', close: 'close',
  delivery_dining: 'truck-delivery-outline', error: 'alert-circle', event: 'calendar-plus-outline', expand_less: 'chevron-up',
  expand_more: 'chevron-down', help: 'help-circle-outline', home: 'home-outline', home_map_marker: 'home-map-marker',
  info: 'information', local_laundry_service: 'washing-machine', location_on: 'map-marker-outline', notifications: 'bell-outline',
  payments: 'credit-card-outline', remove: 'minus', schedule: 'clock-outline', shopping_bag: 'shopping-outline',
  shopping_basket: 'basket-outline', storefront: 'storefront-outline', calendar_month: 'calendar-month-outline',
};

const FALLBACK_GLYPHS: Record<string, string> = {
  account_circle: '●', add: '+', add_a_photo: '⊕', arrow_back: '←', arrow_back_ios_new: '‹',
  arrow_forward: '→', auto_awesome: '✦', bar_chart: '▥', bed: '▰', cancel: '×',
  chat_bubble: '◖', check: '✓', check_circle: '✓', chevron_right: '›', close: '×',
  dashboard: '▦', dry_cleaning: '◇', error: '!', event: '▣', help: '?', home: '⌂',
  info: 'i', iron: '⌁', language: '◎', local_laundry_service: '◉', location_on: '⌾',
  lock_reset: '↻', logout: '↪', mark_chat_read: '✓', mark_email_read: '✓', menu: '☰',
  notifications: '●', payments: '฿', qr_code: '▦', receipt_long: '▤', refresh: '↻',
  remove: '−', schedule: '◷', search: '⌕', sell: '◆', settings: '⚙',
  shopping_basket: '▱', tune: '☷',
};

export function SymbolView({ name, size = 24, tintColor, fallback, ...props }: SymbolViewProps) {
  const iosName = typeof name === 'string' ? name : (name.ios ?? 'questionmark.circle');
  if (Platform.OS === 'android') {
    const requestedName = typeof name === 'string' ? name : (name.android ?? name.web ?? 'help');
    const materialName = ANDROID_ICON_ALIASES[requestedName] ?? requestedName.replaceAll('_', '-') as MaterialIconName;
    return <MaterialCommunityIcons name={materialName} size={size} color={tintColor} />;
  }
  const fallbackName = typeof name === 'string'
    ? name
    : name.web ?? name.android ?? '';
  const browserFallback = fallback ?? (
    <Text
      accessible={false}
      style={[styles.fallback, { color: tintColor, fontSize: size, lineHeight: size }]}>
      {FALLBACK_GLYPHS[fallbackName] ?? '•'}
    </Text>
  );
  return <ExpoSymbolView name={iosName} size={size} tintColor={tintColor} fallback={browserFallback} {...props} />;
}

const styles = StyleSheet.create({
  fallback: { fontWeight: '900', textAlign: 'center', includeFontPadding: false },
});
