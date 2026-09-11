import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

type Coordinates = { latitude: number; longitude: number; accuracy: number | null; heading: number | null; speed: number | null };

function positionValues(position: GeolocationPosition): Coordinates {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy || null,
    heading: position.coords.heading == null || position.coords.heading < 0 ? null : position.coords.heading,
    speed: position.coords.speed == null || position.coords.speed < 0 ? null : position.coords.speed };
}

function message(error: GeolocationPositionError | Error) {
  if ('code' in error && error.code === 1) return 'Location permission is blocked. Allow it in browser settings and try again.';
  if ('code' in error && error.code === 2) return 'Location is unavailable. Turn on device location and try again.';
  if ('code' in error && error.code === 3) return 'Location timed out. Move somewhere with a clearer GPS signal and try again.';
  return error.message || 'Live location could not start.';
}

export function useDriverTaskTracking(taskId?: string, orderId?: string) {
  const [sharing, setSharing] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const watch = useRef<number | null>(null); const lastSentAt = useRef(0); const ids = useRef({ taskId, orderId });
  ids.current = { taskId, orderId };
  const clear = useCallback(() => { if (watch.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watch.current); watch.current = null; setSharing(false); }, []);
  const send = useCallback(async (position: GeolocationPosition, first: boolean) => {
    if (!supabase || !ids.current.taskId) throw new Error('Task is unavailable.');
    const now = Date.now(); if (!first && now-lastSentAt.current < 4000) return;
    lastSentAt.current = now; const c = positionValues(position);
    const result = first ? await supabase.rpc('driver_start_task_v1', { p_task_id: ids.current.taskId, p_latitude:c.latitude,p_longitude:c.longitude,p_accuracy_meters:c.accuracy,p_heading_degrees:c.heading,p_speed_mps:c.speed })
      : await supabase.rpc('driver_update_task_location_v1', { p_task_id: ids.current.taskId,p_latitude:c.latitude,p_longitude:c.longitude,p_accuracy_meters:c.accuracy,p_heading_degrees:c.heading,p_speed_mps:c.speed });
    if (result.error) throw new Error(result.error.message);
  }, []);
  const start = useCallback(async () => {
    if (busy || sharing || !navigator.geolocation) { if (!navigator.geolocation) setError('This browser cannot share GPS.'); return false; }
    setBusy(true); setError('');
    return new Promise<boolean>((resolve) => navigator.geolocation.getCurrentPosition(async (position) => {
      try { await send(position,true); setSharing(true); watch.current=navigator.geolocation.watchPosition((next)=>void send(next,false).catch((e)=>{setError(message(e));clear();}),(e)=>{setError(message(e));clear();},{enableHighAccuracy:true,maximumAge:3000,timeout:20000}); resolve(true); }
      catch(e){setError(message(e as Error));resolve(false);} finally{setBusy(false);}
    },(e)=>{setError(message(e));setBusy(false);resolve(false);},{enableHighAccuracy:true,maximumAge:0,timeout:20000}));
  }, [busy, clear, send, sharing]);
  const stop = useCallback(async () => { clear(); if (supabase && ids.current.taskId) await supabase.rpc('driver_stop_task_tracking_v1',{p_task_id:ids.current.taskId}); }, [clear]);
  useEffect(() => () => { clear(); if (supabase && ids.current.taskId) void supabase.rpc('driver_stop_task_tracking_v1',{p_task_id:ids.current.taskId}); }, [clear]);
  return { sharing, busy, error, start, stop };
}
