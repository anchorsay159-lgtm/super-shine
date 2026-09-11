import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { verifyHmacSha256Base64 } from '../_shared/line-core.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 200_000) return json({ error: 'REQUEST_TOO_LARGE' }, 413);
    const signature = request.headers.get('x-line-signature');
    if (!signature || !(await verifyHmacSha256Base64(Deno.env.get('LINE_MESSAGING_CHANNEL_SECRET') || '', raw, signature))) return json({ error: 'INVALID_SIGNATURE' }, 401);
    const body = JSON.parse(raw) as { events?: Array<Record<string, unknown>> };
    for (const event of Array.isArray(body.events) ? body.events : []) {
      const eventId = String(event.webhookEventId || '');
      const lineUserId = typeof event.source === 'object' && event.source ? String((event.source as Record<string, unknown>).userId || '') : '';
      const timestamp = typeof event.timestamp === 'number' ? new Date(event.timestamp).toISOString() : null;
      if (!eventId) continue;
      const inserted = await service.from('line_webhook_events').insert({ event_id: eventId, event_type: String(event.type || 'unknown'), line_user_id: lineUserId || null, event_timestamp: timestamp }).select('event_id').maybeSingle();
      if (inserted.error?.code === '23505') continue;
      if (inserted.error) throw inserted.error;
      if (!lineUserId || !['follow', 'unfollow'].includes(String(event.type))) continue;
      const nextStatus = event.type === 'follow' ? 'following' : 'blocked';
      const { data: connection } = await service.from('line_connections').select('user_id,last_friend_event_at').eq('line_user_id', lineUserId).maybeSingle();
      if (!connection || (timestamp && connection.last_friend_event_at && new Date(connection.last_friend_event_at).getTime() >= new Date(timestamp).getTime())) continue;
      await service.from('line_connections').update({ friend_status: nextStatus, last_friend_event_at: timestamp || new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', connection.user_id).eq('line_user_id', lineUserId);
    }
    return json({ ok: true });
  } catch (error) {
    console.error('line_webhook_failed', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
    return json({ error: 'WEBHOOK_PROCESSING_FAILED' }, 500);
  }
});
