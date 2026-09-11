import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, readJson } from '../_shared/http.ts';
import { randomUrlToken, sha256Hex, safeReturnUrl } from '../_shared/line-core.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const loginId = Deno.env.get('LINE_LOGIN_CHANNEL_ID')!;
const loginSecret = Deno.env.get('LINE_LOGIN_CHANNEL_SECRET')!;
const service = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function allowlist() {
  return (Deno.env.get('LINE_ALLOWED_RETURN_URLS') || '').split(',').map((item) => item.trim()).filter(Boolean);
}

async function userFromRequest(request: Request) {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const client = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await service.from('profiles').select('role,is_demo').eq('id', data.user.id).maybeSingle();
  return profile?.role === 'customer' && !profile?.is_demo ? data.user : null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const user = await userFromRequest(request);
    if (!user) return json({ error: 'AUTH_REQUIRED' }, 401);
    const { value } = await readJson(request);
    const action = String(value.action || 'start');
    if (action === 'status') {
      const { data, error } = await service.from('line_connections').select('line_user_id,notifications_enabled,order_updates_enabled,payment_updates_enabled,friend_status,linked_at,last_successful_delivery_at').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return json({ connected: Boolean(data?.line_user_id), notificationsEnabled: data?.notifications_enabled ?? true, orderUpdatesEnabled: data?.order_updates_enabled ?? true, paymentUpdatesEnabled: data?.payment_updates_enabled ?? true, friendStatus: data?.friend_status ?? 'unknown', linkedAt: data?.linked_at ?? null, lastSuccessfulDeliveryAt: data?.last_successful_delivery_at ?? null });
    }
    if (action === 'disconnect') {
      const { error } = await service.from('line_connections').update({ line_user_id: null, notifications_enabled: false, friend_status: 'unknown', disconnected_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', user.id);
      if (error) throw error;
      return json({ connected: false });
    }
    if (action === 'preferences') {
      const { notificationsEnabled, orderUpdatesEnabled, paymentUpdatesEnabled } = value;
      const { data: current } = await service.from('line_connections').select('line_user_id').eq('user_id', user.id).maybeSingle();
      if (!current?.line_user_id) return json({ error: 'LINE_NOT_CONNECTED' }, 409);
      const { error } = await service.from('line_connections').update({ notifications_enabled: Boolean(notificationsEnabled), order_updates_enabled: Boolean(orderUpdatesEnabled), payment_updates_enabled: Boolean(paymentUpdatesEnabled), updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('line_user_id', current.line_user_id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === 'finish') {
      const attemptId = String(value.attemptId || '');
      const secret = String(value.finalizeSecret || '');
      if (!attemptId || secret.length < 32) return json({ error: 'LINE_LINK_ATTEMPT_INVALID' }, 400);
      const { data: attempt } = await service.from('line_link_attempts').select('line_user_id,friend_status,status').eq('id', attemptId).eq('user_id', user.id).maybeSingle();
      if (!attempt?.line_user_id || attempt.status !== 'callback_received') return json({ error: 'LINE_LINK_NOT_READY' }, 409);
      const result = await service.rpc('line_finish_link_v1', { p_user_id: user.id, p_attempt_id: attemptId, p_finalize_secret_hash: await sha256Hex(secret), p_line_user_id: attempt.line_user_id, p_friend_status: attempt.friend_status });
      if (result.error) return json({ error: result.error.message }, 400);
      return json({ connected: true, friendStatus: result.data?.[0]?.friend_status || attempt.friend_status });
    }
    if (!loginId || !loginSecret) return json({ error: 'LINE_LOGIN_NOT_CONFIGURED' }, 503);
    const returnUrl = safeReturnUrl(value.returnUrl, allowlist());
    if (!returnUrl) return json({ error: 'RETURN_URL_NOT_ALLOWED' }, 400);
    const state = randomUrlToken(32), nonce = randomUrlToken(24), verifier = randomUrlToken(48), finalizeSecret = randomUrlToken(32);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))))
      .replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    const callbackUrl = Deno.env.get('LINE_LOGIN_CALLBACK_URL') || `${supabaseUrl}/functions/v1/line-connect-callback`;
    const { data: attempt, error } = await service.from('line_link_attempts').insert({ user_id: user.id, state_hash: await sha256Hex(state), nonce, code_verifier: verifier, finalize_secret_hash: await sha256Hex(finalizeSecret), return_url: returnUrl }).select('id,expires_at').single();
    if (error) throw error;
    const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize');
    authorize.search = new URLSearchParams({ response_type: 'code', client_id: loginId, redirect_uri: callbackUrl, state, scope: 'openid profile', nonce, code_challenge: challenge, code_challenge_method: 'S256', bot_prompt: 'aggressive' }).toString();
    return json({ authorizeUrl: authorize.toString(), attemptId: attempt.id, finalizeSecret, returnUrl, expiresAt: attempt.expires_at });
  } catch (error) {
    console.error('line_connect_start_failed', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
    return json({ error: 'LINE_CONNECT_FAILED' }, 500);
  }
});
