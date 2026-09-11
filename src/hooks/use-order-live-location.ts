import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { mapOrderLiveLocation, type OrderLiveLocation } from '@/types/live-location';

export function useOrderLiveLocation(orderId?: string) {
  const [location, setLocation] = useState<OrderLiveLocation | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));

  const load = useCallback(async () => {
    if (!supabase || !orderId) {
      setLocation(null);
      setLoading(false);
      return;
    }
    const result = await supabase.from('order_live_locations').select('*').eq('order_id', orderId).maybeSingle();
    if (!result.error) setLocation(result.data ? mapOrderLiveLocation(result.data) : null);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    void load();
    if (!supabase || !orderId) return;
    const client = supabase;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    void (async () => {
      const name = `order-live-location:${orderId}`;
      const existing = client.getChannels().find((item) => item.topic === `realtime:${name}`);
      if (existing) await client.removeChannel(existing);
      if (cancelled) return;
      channel = client.channel(name)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_live_locations', filter: `order_id=eq.${orderId}` }, () => void load())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void load();
          if (__DEV__ && ['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) console.warn('gps_realtime_state', { status, orderId });
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void client.removeChannel(channel);
    };
  }, [load, orderId]);

  return { location, loading, reload: load };
}
