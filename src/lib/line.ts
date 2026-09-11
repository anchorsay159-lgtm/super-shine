import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export type LineConnection = {
  connected: boolean;
  notificationsEnabled: boolean;
  orderUpdatesEnabled: boolean;
  paymentUpdatesEnabled: boolean;
  friendStatus: 'unknown' | 'following' | 'blocked';
  linkedAt: string | null;
  lastSuccessfulDeliveryAt: string | null;
};

export type LineLinkStart = { authorizeUrl: string; attemptId: string; finalizeSecret: string; returnUrl: string; expiresAt: string };

export const EMPTY_LINE_CONNECTION: LineConnection = {
  connected: false, notificationsEnabled: true, orderUpdatesEnabled: true, paymentUpdatesEnabled: true,
  friendStatus: 'unknown', linkedAt: null, lastSuccessfulDeliveryAt: null,
};

function webReturnUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/line-callback`;
  return Linking.createURL('line-callback');
}

async function invoke<T>(body: Record<string, unknown>) {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const result = await supabase.functions.invoke<T>('line-connect-start', { body });
  if (result.error) throw new Error(result.error.message || 'LINE_REQUEST_FAILED');
  if ((result.data as { error?: string } | null)?.error) throw new Error((result.data as { error: string }).error);
  return result.data as T;
}

export function getLineReturnUrl() { return webReturnUrl(); }
export function getLineConnection() { return invoke<LineConnection>({ action: 'status' }); }
export function startLineConnection() { return invoke<LineLinkStart>({ action: 'start', returnUrl: webReturnUrl() }); }
export function finishLineConnection(attemptId: string, finalizeSecret: string) { return invoke<{ connected: boolean; friendStatus?: LineConnection['friendStatus'] }>({ action: 'finish', attemptId, finalizeSecret }); }
export function disconnectLine() { return invoke<{ connected: false }>({ action: 'disconnect' }); }
export function updateLinePreferences(input: Pick<LineConnection, 'notificationsEnabled' | 'orderUpdatesEnabled' | 'paymentUpdatesEnabled'>) { return invoke<{ ok: true }>({ action: 'preferences', ...input }); }
