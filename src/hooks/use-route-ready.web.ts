import { useEffect, useState } from 'react';

export function useRouteReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
