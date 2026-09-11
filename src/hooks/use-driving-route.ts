import { useEffect, useRef, useState } from 'react';

export type DrivingRoute = {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
};

type RouteResponse = {
  code?: string;
  routes?: {
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: [number, number][] };
  }[];
};

const DEFAULT_ROUTING_URL = 'https://router.project-osrm.org';
const MIN_ROUTE_REFRESH_MS = 10_000;

export function useDrivingRoute(
  latitude?: number,
  longitude?: number,
  destinationLatitude?: number,
  destinationLongitude?: number,
) {
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastRequestAt = useRef(0);

  useEffect(() => {
    if (
      latitude == null || longitude == null ||
      destinationLatitude == null || destinationLongitude == null
    ) {
      setRoute(null);
      setLoading(false);
      setError('');
      return;
    }

    const elapsed = Date.now() - lastRequestAt.current;
    if (route && elapsed < MIN_ROUTE_REFRESH_MS) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      lastRequestAt.current = Date.now();
      setLoading(true);
      const baseUrl = (process.env.EXPO_PUBLIC_ROUTING_BASE_URL || DEFAULT_ROUTING_URL).replace(/\/$/, '');
      const points = `${longitude},${latitude};${destinationLongitude},${destinationLatitude}`;
      const url = `${baseUrl}/route/v1/driving/${points}?overview=full&geometries=geojson&steps=false`;

      void fetch(url, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Route request failed (${response.status})`);
          return response.json() as Promise<RouteResponse>;
        })
        .then((payload) => {
          const result = payload.routes?.[0];
          const coordinates = result?.geometry?.coordinates;
          if (payload.code !== 'Ok' || !coordinates?.length || result?.distance == null || result.duration == null) {
            throw new Error('No driving route was found for these locations.');
          }
          setRoute({
            coordinates,
            distanceMeters: Number(result.distance),
            durationSeconds: Number(result.duration),
          });
          setError('');
        })
        .catch((cause: unknown) => {
          if (cause instanceof Error && cause.name === 'AbortError') return;
          setError(cause instanceof Error ? cause.message : 'Driving route is temporarily unavailable.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destinationLatitude, destinationLongitude, latitude, longitude, route]);

  return { route, loading, error };
}

export function formatEta(durationSeconds: number) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
