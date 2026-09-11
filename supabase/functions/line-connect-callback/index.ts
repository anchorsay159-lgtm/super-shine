import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/http.ts';
import { hmacSha256Base64, sha256Hex, safeReturnUrl } from '../_shared/line-core.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
const callbackUrl = Deno.env.get('LINE_LOGIN_CALLBACK_URL') || `${supabaseUrl}/functions/v1/line-connect-callback`;

function allowed(url: string) {
  return safeReturnUrl(url, (Deno.env.get('LINE_ALLOWED_RETURN_URLS') || '').split(',').map((item) => item.trim()).filter(Boolean));
}

function redirect(url: string, result: string, attemptId?: string) {
  const target = new URL(url);
  target.searchParams.set('line', result);
  if (attemptId) target.searchParams.set('attemptId', attemptId);
  return Response.redirect(target.toString(), 303);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  let attempt: Record<string, unknown> | null = null;
  try {
    const params = new URL(request.url).searchParams;
    const state = params.get('state') || '';
    const stateHash = await sha256Hex(state);
    const { data } = await service.from('line_link_attempts').select('id,user_id,return_url,nonce,code_verifier,finalize_secret_hash,status,expires_at').eq('state_hash', stateHash).maybeSingle();
    attempt = data as Record<string, unknown> | null;
    const returnUrl = allowed(String(attempt?.return_url || ''));
    if (!attempt || !returnUrl || !state || attempt.status !== 'started' || new Date(String(attempt.expires_at)).getTime() <= Date.now()) {
      return new Response('Invalid or expired LINE connection attempt.', { status: 400, headers: corsHeaders });
    }
    const attemptId = String(attempt.id);
    const errorCode = params.get('error');
    if (errorCode) {
      await service.from('line_link_attempts').update({ status: 'failed', error_code: errorCode }).eq('id', attemptId).eq('status', 'started');
      return redirect(returnUrl, errorCode === 'access_denied' ? 'cancelled' : 'failed', attemptId);
    }
    const code = params.get('code');
    if (!code) return redirect(returnUrl, 'failed', attemptId);
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl, client_id: Deno.env.get('LINE_LOGIN_CHANNEL_ID') || '', client_secret: Deno.env.get('LINE_LOGIN_CHANNEL_SECRET') || '', code_verifier: String(attempt.code_verifier) }) });
    if (!tokenResponse.ok) throw new Error('LINE_TOKEN_EXCHANGE_FAILED');
    const token = await tokenResponse.json() as { access_token?: string; id_token?: string };
    if (!token.access_token || !token.id_token) throw new Error('LINE_TOKEN_RESPONSE_INVALID');
    const verifyResponse = await fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id_token: token.id_token, client_id: Deno.env.get('LINE_LOGIN_CHANNEL_ID') || '' }) });
    if (!verifyResponse.ok) throw new Error('LINE_ID_TOKEN_INVALID');
    const identity = await verifyResponse.json() as { sub?: string; aud?: string; exp?: number; nonce?: string };
    if (!identity.sub || identity.aud !== Deno.env.get('LINE_LOGIN_CHANNEL_ID') || !identity.exp || identity.exp * 1000 <= Date.now() || identity.nonce !== attempt.nonce) throw new Error('LINE_IDENTITY_INVALID');
    const friendshipResponse = await fetch('https://api.line.me/friendship/v1/status', { headers: { Authorization: `Bearer ${token.access_token}` } });
    const friendship = friendshipResponse.ok ? await friendshipResponse.json() as { friendFlag?: boolean } : {};
    // A successful friendship response with friendFlag=false means the user
    // has not added the Official Account yet; only an unfollow webhook marks
    // an existing connection as blocked.
    const friendStatus = friendshipResponse.ok && friendship.friendFlag === true ? 'following' : 'unknown';
    const { error: updateError } = await service.from('line_link_attempts').update({ line_user_id: identity.sub, friend_status: friendStatus, status: 'callback_received', callback_at: new Date().toISOString() }).eq('id', attemptId).eq('status', 'started').is('used_at', null);
    if (updateError) throw updateError;
    const { error: finishError } = await service.rpc('line_finish_link_v1', {
      p_user_id: String(attempt.user_id),
      p_attempt_id: attemptId,
      p_finalize_secret_hash: String(attempt.finalize_secret_hash),
      p_line_user_id: identity.sub,
      p_friend_status: friendStatus,
    });
    if (finishError) throw finishError;
    return redirect(returnUrl, 'success', attemptId);
  } catch (error) {
    console.error('line_connect_callback_failed', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
    const returnUrl = attempt ? allowed(String(attempt.return_url || '')) : null;
    if (returnUrl) {
      await service.from('line_link_attempts').update({ status: 'failed', error_code: 'CALLBACK_FAILED' }).eq('id', String(attempt.id)).eq('status', 'started');
      return redirect(returnUrl, 'failed', String(attempt.id));
    }
    return new Response('LINE connection could not be completed.', { status: 400, headers: corsHeaders });
  }
});
