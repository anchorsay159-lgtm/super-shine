export type TrackingPhase = 'pickup' | 'delivery';

export type OrderLiveLocation = {
  orderId: string;
  driverId: string;
  phase: TrackingPhase;
  status: 'active' | 'completed';
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  speedMps: number | null;
  startedAt: string;
  capturedAt: string;
  endedAt: string | null;
};

export function mapOrderLiveLocation(row: Record<string, unknown>): OrderLiveLocation {
  return {
    orderId: String(row.order_id),
    driverId: String(row.driver_id),
    phase: row.phase as TrackingPhase,
    status: row.status as OrderLiveLocation['status'],
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: row.accuracy_meters == null ? null : Number(row.accuracy_meters),
    headingDegrees: row.heading_degrees == null ? null : Number(row.heading_degrees),
    speedMps: row.speed_mps == null ? null : Number(row.speed_mps),
    startedAt: String(row.started_at),
    capturedAt: String(row.captured_at),
    endedAt: row.ended_at == null ? null : String(row.ended_at),
  };
}
