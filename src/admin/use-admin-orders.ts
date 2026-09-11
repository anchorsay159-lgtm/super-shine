import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { ORDER_SELECT } from '@/admin/order-config';
import { mapOrder } from '@/lib/domain';
import { supabase } from '@/lib/supabase';
import type { CustomerOrder } from '@/types/domain';

export type SupportQueueMessage = {
  id: string;
  orderId: string | null;
  senderRole: 'customer' | 'admin';
  readAt: string | null;
  createdAt: string;
};

export function useAdminOrders(enabled: boolean) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [messages, setMessages] = useState<SupportQueueMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!supabase || !enabled) {
      setLoading(false);
      return;
    }
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [orderResult, messageResult] = await Promise.all([
        supabase.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false }),
        supabase.from('support_messages').select('id,order_id,sender_role,read_at,created_at').order('created_at', { ascending: false }),
      ]);
      const queryError = orderResult.error || messageResult.error;
      if (queryError) {
        setError(queryError.message);
        return;
      }
      const orderRows = Array.isArray(orderResult.data) ? orderResult.data : [];
      const messageRows = Array.isArray(messageResult.data) ? messageResult.data : [];
      setOrders(orderRows.map(mapOrder));
      setMessages(messageRows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        senderRole: row.sender_role,
        readAt: row.read_at,
        createdAt: row.created_at,
      })) as SupportQueueMessage[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Admin orders could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supabase || !enabled) return;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    const refresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { refreshTimer.current = null; void load(true); }, 80);
    };
    void (async () => {
      const topic = 'realtime:admin-operations-v17';
      const existing = supabase.getChannels().find((item) => item.topic === topic);
      if (existing) await supabase.removeChannel(existing);
      if (cancelled) return;
      channel = supabase.channel('admin-operations-v17')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_status_history' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'uploaded_files' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, refresh)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') refresh();
          if (__DEV__ && ['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) console.warn('admin_realtime_state', { status });
        });
    })();
    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [enabled, load]);

  return { orders, messages, loading, refreshing, error, reload: () => load(true) };
}
