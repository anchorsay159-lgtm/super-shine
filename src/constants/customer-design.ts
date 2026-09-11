import { Platform } from 'react-native';

export const CustomerColors = {
  navy: '#142D3D',
  navySoft: '#365262',
  teal: '#0B9185',
  tealPressed: '#0B756E',
  mint: '#DDF3EF',
  white: '#FFFFFF',
  canvas: '#F8FAF9',
  text: '#142D3D',
  muted: '#6C7F88',
  border: '#E4EBEA',
  info: '#4F80D7',
  infoSoft: '#E5EEFC',
  attention: '#F3C45C',
  attentionSoft: '#FFF1CC',
  error: '#D85E57',
  errorSoft: '#FDECE9',
  success: '#238B65',
  successSoft: '#E4F4ED',
  disabled: '#AAB8C0',
  disabledSoft: '#E8F0F2',
  focus: '#236BC5',
  selectedSurface: '#DDF3EF',
  overlay: 'rgba(9, 29, 43, 0.46)',
} as const;

export const CustomerSpace = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, section: 24, xxl: 32 } as const;
export const CustomerRadius = { control: 16, card: 21, modal: 26, pill: 999 } as const;
export const CustomerBorder = { hairline: 1, strong: 2 } as const;
export const CustomerHeight = { touch: 44, field: 52, button: 52, sticky: 74 } as const;
export const CustomerFontFamily = 'PlusJakartaSans_400Regular';
export const CustomerFontFamilyMedium = 'PlusJakartaSans_500Medium';
export const CustomerType = {
  screen: { fontFamily: CustomerFontFamilyMedium, fontSize: 27, lineHeight: 33, fontWeight: '500' as const, letterSpacing: -0.45 },
  section: { fontFamily: CustomerFontFamilyMedium, fontSize: 19, lineHeight: 24, fontWeight: '500' as const, letterSpacing: -0.2 },
  body: { fontFamily: CustomerFontFamily, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: CustomerFontFamilyMedium, fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
  caption: { fontFamily: CustomerFontFamily, fontSize: 12, lineHeight: 17 },
} as const;
export const CustomerLayout = { pagePadding: 22, compactMaxWidth: 700, checkoutMaxWidth: 720, desktopMaxWidth: 720, safeBottom: 16 } as const;
export const CustomerShadow = Platform.select({
  ios: { shadowColor: CustomerColors.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 14 },
  android: { elevation: 1 },
  default: { boxShadow: '0 7px 22px rgba(20, 45, 61, 0.07)' },
});
