'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OrderStatus } from '@supershine/shared';

import { getSupabase } from '@/lib/supabase';

type TaskStatus = 'unassigned' | 'assigned' | 'accepted' | 'en_route' | 'arrived' | 'completed' | 'cancelled' | 'failed';
type DriverTask = {
  id: string; taskType: 'pickup' | 'delivery'; taskStatus: TaskStatus; driverName: string;
  verificationCode: string | null; latitude: number | null; longitude: number | null;
};
type LiveLocation = {
  task_id: string | null; phase: 'pickup' | 'delivery'; status: 'active' | 'completed';
  latitude: number; longitude: number; captured_at: string;
};

function mapTask(value: Record<string, unknown>): DriverTask {
  return {
    id: String(value.id), taskType: value.taskType as DriverTask['taskType'], taskStatus: value.taskStatus as TaskStatus,
    driverName: String(value.driverName || ''), verificationCode: value.verificationCode == null ? null : String(value.verificationCode),
    latitude: value.latitude == null ? null : Number(value.latitude), longitude: value.longitude == null ? null : Number(value.longitude),
  };
}

function activePhase(status: OrderStatus) {
  if (status === 'accepted' || status === 'pickup_in_progress') return 'pickup';
  if (status === 'ready' || status === 'out_for_delivery') return 'delivery';
  return null;
}

function distanceMeters(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(toLat - fromLat); const dLng = radians(toLng - fromLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapUrl(latitude: number, longitude: number) {
  const span = 0.012;
  const bbox = [longitude - span, latitude - span, longitude + span, latitude + span].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

export function DriverTripPanel({ orderId, orderStatus }: { orderId: string; orderStatus: OrderStatus }) {
  const [tasks, setTasks] = useState<DriverTask[]>([]);
  const [location, setLocation] = useState<LiveLocation | null>(null);
  const phase = activePhase(orderStatus);

  const load = useCallback(async () => {
    const client = getSupabase();
    if (!client || !orderId) return;
    const [taskResult, locationResult] = await Promise.all([
      client.rpc('customer_order_driver_tasks_v1', { p_order_id: orderId }),
      client.from('order_live_locations').select('task_id,phase,status,latitude,longitude,captured_at').eq('order_id', orderId).maybeSingle(),
    ]);
    if (!taskResult.error) setTasks(((taskResult.data || []) as Record<string, unknown>[]).map(mapTask));
    if (!locationResult.error) setLocation(locationResult.data as LiveLocation | null);
  }, [orderId]);

  useEffect(() => {
    void load();
    const client = getSupabase();
    if (!client) return;
    const channel = client.channel(`customer-web-driver:${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_tasks', filter: `order_id=eq.${orderId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_live_locations', filter: `order_id=eq.${orderId}` }, () => void load())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [load, orderId]);

  const task = useMemo(() => tasks.find((item) => item.taskType === phase && !['unassigned', 'completed', 'cancelled'].includes(item.taskStatus)), [phase, tasks]);
  if (!task) return null;
  const live = location?.status === 'active' && location.task_id === task.id && location.phase === task.taskType && ['en_route', 'arrived'].includes(task.taskStatus);
  const distance = live && task.latitude != null && task.longitude != null
    ? distanceMeters(location.latitude, location.longitude, task.latitude, task.longitude) : null;
  const state = task.taskStatus === 'assigned' ? 'Driver assigned' : task.taskStatus === 'accepted' ? 'Driver is preparing'
    : task.taskStatus === 'en_route' ? 'Driver is on the way' : task.taskStatus === 'arrived' ? 'Driver has arrived'
      : 'Super Shine is arranging the next step';
  const directions = live && task.latitude != null && task.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&origin=${location.latitude},${location.longitude}&destination=${task.latitude},${task.longitude}` : '';

  return <section className={`card driver-trip-panel${live ? ' is-live' : ''}`} aria-live="polite">
    <div className="driver-trip-heading">
      <div className="driver-trip-icon" aria-hidden="true">{task.taskType === 'pickup' ? '🧺' : '🚚'}</div>
      <div><p className="eyebrow">{task.taskType === 'pickup' ? 'Pickup trip' : 'Delivery trip'}</p><h2>{state}</h2><p className="muted">{task.driverName || 'Your Super Shine driver'}</p></div>
      {live ? <span className="driver-live-badge"><i/>LIVE</span> : null}
    </div>
    {live ? <div className="driver-live-map">
      <iframe title="Live Super Shine driver location" src={mapUrl(location.latitude, location.longitude)} loading="lazy" referrerPolicy="no-referrer"/>
      <div className="driver-map-footer"><div><strong>{distance == null ? 'Live location active' : distance < 1000 ? `${Math.round(distance)} m from your stop` : `${(distance / 1000).toFixed(1)} km from your stop`}</strong><span>Updated {new Date(location.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>{directions ? <a className="button button-secondary" href={directions} target="_blank" rel="noreferrer">Open route</a> : null}</div>
    </div> : <p className="driver-trip-note">Live tracking appears here automatically after the driver starts this trip.</p>}
    {task.verificationCode ? <div className="driver-code"><div><strong>{task.taskType === 'pickup' ? 'Pickup code' : 'Delivery code'}</strong><span>Share this only when you hand over or receive your laundry.</span></div><b>{task.verificationCode}</b></div> : null}
  </section>;
}
