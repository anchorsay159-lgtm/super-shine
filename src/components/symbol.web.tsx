import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import type {
  SFSymbol,
  SymbolViewProps as ExpoSymbolViewProps,
} from 'expo-symbols';

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

type WebIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const WEB_ICON_ALIASES: Record<string, WebIconName> = {
  'account-circle': 'account-circle-outline',
  'add': 'plus',
  'add-a-photo': 'camera-plus-outline',
  'arrow-back': 'arrow-left',
  'arrow-back-ios-new': 'chevron-left',
  'arrow-forward': 'arrow-right',
  'auto-awesome': 'creation',
  'bar-chart': 'chart-bar',
  'bed': 'bed',
  'cancel': 'close-circle',
  'chat-bubble': 'message-text',
  'check': 'check',
  'check-circle': 'check-circle',
  'chevron-right': 'chevron-right',
  'close': 'close',
  'dashboard': 'view-dashboard-outline',
  'dry-cleaning': 'creation',
  'error': 'alert-circle',
  'event': 'calendar-plus-outline',
  'expand-less': 'chevron-up',
  'expand-more': 'chevron-down',
  'help': 'help-circle-outline',
  'home': 'home-outline',
  'home-map-marker': 'home-map-marker',
  'info': 'information',
  'iron': 'weather-windy',
  'language': 'web',
  'local-laundry-service': 'washing-machine',
  'location-on': 'map-marker-outline',
  'lock-reset': 'lock-reset',
  'logout': 'logout',
  'mark-chat-read': 'message-check-outline',
  'mark-email-read': 'email-check-outline',
  'menu': 'menu',
  'notifications': 'bell',
  'payments': 'credit-card-outline',
  'qr-code': 'qrcode',
  'receipt-long': 'receipt-text-outline',
  'refresh': 'refresh',
  'remove': 'minus',
  'schedule': 'clock',
  'search': 'magnify',
  'sell': 'tag',
  'settings': 'cog-outline',
  'shopping-basket': 'basket-outline',
  'shopping-bag': 'shopping-outline',
  'storefront': 'storefront-outline',
  'delivery-dining': 'truck-delivery-outline',
  'calendar-month': 'calendar-month-outline',
  'tune': 'tune-variant',
  'visibility': 'eye',
  'visibility-off': 'eye-off',
};

export function SymbolView({ name, size = 24, tintColor, fallback }: SymbolViewProps) {
  const requestedName = typeof name === 'string'
    ? name
    : name.web ?? name.android ?? '';
  const normalizedName = requestedName.replaceAll('_', '-');
  const webName = WEB_ICON_ALIASES[normalizedName] ?? normalizedName as WebIconName;

  if (!webName) return fallback ?? null;

  return (
    <MaterialCommunityIcons
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      name={webName}
      size={size}
      color={tintColor}
    />
  );
}
