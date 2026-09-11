import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/http.ts';
import { hmacSha256Base64 } from '../_shared/line-core.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

function safeBase64(value: string) { return value.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(value.length / 4) * 4, '='); }

Deno.serve(async (request) => {
  try {
    const params = new URL(request.url).searchParams; const orderNumber = params.get('o') || ''; const signature = params.get('s') || '';
    if (!orderNumber || !signature) return new Response('Invalid order link.', { status: 400, headers: corsHeaders });
    const signingSecret = Deno.env.get('LINE_LOGIN_CHANNEL_SECRET') || '';
    if (!signingSecret) return new Response('Order links are not configured.', { status: 503, headers: corsHeaders });
    const expected = await hmacSha256Base64(signingSecret, orderNumber);
    if (safeBase64(signature) !== expected) return new Response('Invalid order link.', { status: 403, headers: corsHeaders });
    const { data: order } = await service.from('orders').select('id').eq('order_number', orderNumber).maybeSingle();
    if (!order) return new Response('Order not found.', { status: 404, headers: corsHeaders });
    const destination = new URL(Deno.env.get('LINE_PUBLIC_WEB_URL') || 'https://super-shine.expo.app');
    destination.pathname = `/orders/${order.id}`;
    return Response.redirect(destination.toString(), 303);
  } catch { return new Response('Order link unavailable.', { status: 400, headers: corsHeaders }); }
});
