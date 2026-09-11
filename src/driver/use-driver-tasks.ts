import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { mapDriverTask, type DriverTask } from '@/types/driver';

export function useDriverTasks(enabled: boolean, history = false) {
  const [tasks, setTasks] = useState<DriverTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase || !enabled) { setTasks([]); setLoading(false); return; }
    const result = await supabase.rpc('driver_tasks_list_v1', { p_history: history });
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setError('');
    setTasks(((result.data || []) as Record<string, unknown>[]).map(mapDriverTask));
  }, [enabled, history]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supabase || !enabled) return;
    const client = supabase;
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    void (async () => {
      const name = `driver-tasks:${history ? 'history' : 'active'}`;
      const existing = client.getChannels().find((item) => item.topic === `realtime:${name}`);
      if (existing) await client.removeChannel(existing);
      if (cancelled) return;
      channel = client.channel(name)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_tasks' }, () => void load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_task_issues' }, () => void load())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void load();
          if (__DEV__ && ['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) console.warn('driver_tasks_realtime', { status });
        });
    })();
    return () => { cancelled = true; if (channel) void client.removeChannel(channel); };
  }, [enabled, history, load]);

  return { tasks, loading, error, reload: load };
}

export function useDriverTask(taskId?: string, enabled = true) {
  const [task, setTask] = useState<DriverTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!supabase || !taskId || !enabled) { setLoading(false); return; }
    const result = await supabase.rpc('driver_task_detail_v1', { p_task_id: taskId });
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setError(''); setTask(result.data ? mapDriverTask(result.data as Record<string, unknown>) : null);
  }, [enabled, taskId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supabase || !taskId || !enabled) return;
    const client = supabase;
    const channel = client.channel(`driver-task:${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_tasks', filter: `id=eq.${taskId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_task_issues', filter: `task_id=eq.${taskId}` }, () => void load())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [enabled, load, taskId]);
  return { task, loading, error, reload: load };
}

