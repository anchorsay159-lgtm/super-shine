import { Platform } from 'react-native';

export const Colors = {
  navy: '#142D3D',
  navySoft: '#365262',
  teal: '#0B9185',
  tealDark: '#0B756E',
  tealLight: '#DDF3EF',
  mint: '#EAF7F4',
  canvas: '#F8FAF9',
  surface: '#FFFFFF',
  text: '#142D3D',
  textMuted: '#6C7F88',
  line: '#E4EBEA',
  yellow: '#F3C45C',
  yellowLight: '#FFF1CC',
  coral: '#EE746D',
  coralLight: '#FDECE9',
  blue: '#4F80D7',
  blueLight: '#E5EEFC',
  success: '#238B65',
  successLight: '#E4F4ED',
} as const;

export const Radius = {
  small: 10,
  medium: 16,
  large: 21,
  xlarge: 26,
  pill: 999,
} as const;

export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Shadow = Platform.select({
  ios: {
    shadowColor: '#142D3D',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
  },
  android: { elevation: 1 },
  default: {
    boxShadow: '0 7px 22px rgba(20, 45, 61, 0.07)',
  },
});

export const FontFamily = 'PlusJakartaSans_400Regular';
export const FontFamilyMedium = 'PlusJakartaSans_500Medium';

export const PageWidth = 720;
