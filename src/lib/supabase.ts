import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const isNative = Platform.OS !== 'web';
export const isAdminWebRoute = Platform.OS === 'web'
  && typeof globalThis.location !== 'undefined'
  && /^\/admin(?:\/|$)/.test(globalThis.location.pathname);
const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : '';
const defaultWebAuthStorageKey = projectRef ? `sb-${projectRef}-auth-token` : '';
const webAuthStorageKey = isAdminWebRoute ? `${defaultWebAuthStorageKey}-admin` : defaultWebAuthStorageKey;
const sourcePlatform = Platform.OS === 'ios'
  ? 'ios'
  : Platform.OS === 'android'
    ? 'android'
    : isAdminWebRoute ? 'admin_web' : 'customer_web';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        ...(isNative ? { storage: AsyncStorage } : {}),
        ...(!isNative && webAuthStorageKey ? { storageKey: webAuthStorageKey } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        lock: processLock,
      },
      global: { headers: { 'x-super-shine-platform': sourcePlatform } },
    })
  : null;

if (supabase && isNative) {
  if (AppState.currentState === 'active') void supabase.auth.startAutoRefresh();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
