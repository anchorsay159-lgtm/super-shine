import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { hmacSha256Base64, lineFlexMessage, retryableLineStatus } from '../_shared/line-core.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
const accessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
const loginSecret = Deno.env.get('LINE_LOGIN_CHANNEL_SECRET') || '';

type Delivery = { id: string; user_id: string; event_type: string; payload: Record<string, unknown>; retry_key: string; lock_token: string; attempts: number };

function locale(value: unknown) { return ['en','th','my','bn','dz'].includes(String(value)) ? String(value) as 'en'|'th'|'my'|'bn'|'dz' : 'en'; }

async function complete(delivery: Delivery, status: 'sent'|'skipped'|'failed', error = '', httpStatus: number | null = null, retry = false) {
  await service.rpc('line_complete_delivery_v1', { p_delivery_id: delivery.id, p_lock_token: delivery.lock_token, p_status: status, p_error: error, p_http_status: httpStatus, p_retry: retry });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const expected = Deno.env.get('LINE_WORKER_SECRET') || '';
  if (!expected || request.headers.get('x-line-worker-secret') !== expected) return json({ error: 'WORKER_UNAUTHORIZED' }, 401);
  if (!accessToken) return json({ error: 'LINE_MESSAGING_NOT_CONFIGURED' }, 503);
  const lockToken = crypto.randomUUID();
  try {
    const { data, error } = await service.rpc('line_claim_deliveries_v1', { p_limit: 20, p_lock_token: lockToken });
    if (error) throw error;
    let sent = 0, skipped = 0, failed = 0;
    for (const row of (data || []) as Array<Omit<Delivery, 'lock_token'> & { lock_token?: string }>) {
      const delivery = { ...row, lock_token: lockToken } as Delivery;
      const { data: connection } = await service.from('line_connections').select('line_user_id,notifications_enabled,order_updates_enabled,payment_updates_enabled,friend_status').eq('user_id', delivery.user_id).maybeSingle();
      if (!connection?.line_user_id || connection.friend_status === 'blocked' || !connection.notifications_enabled || (delivery.event_type.startsWith('payment_') ? !connection.payment_updates_enabled : !connection.order_updates_enabled)) {
        await complete(delivery, 'skipped', connection?.friend_status === 'blocked' ? 'LINE_FRIENDSHIP_BLOCKED' : 'LINE_NOT_CONNECTED_OR_DISABLED'); skipped++; continue;
      }
      const { data: profile } = await service.from('profiles').select('language').eq('id', delivery.user_id).maybeSingle();
      const payload = { ...delivery.payload, amount: typeof delivery.payload.amount === 'number' ? delivery.payload.amount : undefined };
      const orderNumber = String(delivery.payload.orderNumber || '');
      const opaqueSignature = orderNumber && loginSecret ? (await hmacSha256Base64(loginSecret, orderNumber)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'') : '';
      const link = orderNumber && opaqueSignature ? `${supabaseUrl}/functions/v1/line-order-link?o=${encodeURIComponent(orderNumber)}&s=${encodeURIComponent(opaqueSignature)}` : '';
      const messages = [lineFlexMessage(delivery.event_type, locale(profile?.language), payload, link)];
      try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Line-Retry-Key': delivery.retry_key }, body: JSON.stringify({ to: connection.line_user_id, messages }) });
        if (response.ok || response.status === 409) { await complete(delivery, 'sent', '', response.status); sent++; continue; }
        const detail = (await response.text()).slice(0, 500);
        const shouldRetry = retryableLineStatus(response.status) && delivery.attempts < 8;
        await complete(delivery, shouldRetry ? 'failed' : 'skipped', detail || `LINE_HTTP_${response.status}`, response.status, shouldRetry);
        shouldRetry ? failed++ : skipped++;
      } catch (error) {
        const shouldRetry = delivery.attempts < 8;
        await complete(delivery, 'failed', error instanceof Error ? error.message : 'LINE_NETWORK_ERROR', null, shouldRetry); failed++;
      }
    }
    return json({ ok: true, sent, skipped, failed });
  } catch (error) {
    console.error('line_worker_failed', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
    return json({ error: 'LINE_WORKER_FAILED' }, 500);
  }
});
