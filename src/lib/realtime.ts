let realtimeChannelSequence = 0;

/**
 * Supabase returns an existing channel when a name is reused. Screens can stay
 * mounted while navigating, so each subscription needs its own channel name.
 */
export function uniqueRealtimeChannelName(scope: string) {
  realtimeChannelSequence += 1;
  return `${scope}-${Date.now()}-${realtimeChannelSequence}`;
}
