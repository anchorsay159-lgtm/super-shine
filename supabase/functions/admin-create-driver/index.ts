import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, readJson } from '../_shared/http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const service = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function requireAdmin(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7) : '';
  if (!token) return { admin: null, error: 'ADMIN_SESSION_MISSING', status: 401 } as const;
  const { data, error: userError } = await service.auth.getUser(token);
  if (userError || !data.user) return { admin: null, error: 'ADMIN_SESSION_INVALID', status: 401 } as const;
  const { data: profile, error: profileError } = await service.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (profileError) {
    console.error('admin_create_driver_profile_lookup_failed', profileError.code || 'UNKNOWN_CODE', profileError.message);
    return { admin: null, error: 'ADMIN_PROFILE_LOOKUP_FAILED', status: 500 } as const;
  }
  if (profile?.role !== 'admin') return { admin: null, error: 'ADMIN_ROLE_REQUIRED', status: 403 } as const;
  return { admin: data.user, error: null, status: 200 } as const;
}

function isExistingEmailError(error: { code?: string; message?: string } | null) {
  const code = error?.code?.toLowerCase() || '';
  const message = error?.message?.toLowerCase() || '';
  return code === 'email_exists' || message.includes('already') || message.includes('registered');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const authorization = await requireAdmin(request);
    if (!authorization.admin) return json({ error: authorization.error }, authorization.status);
    const admin = authorization.admin;
    const { value } = await readJson(request);
    const fullName = String(value.fullName || '').trim();
    const email = String(value.email || '').trim().toLowerCase();
    const phone = String(value.phone || '').trim();
    const temporaryPassword = String(value.temporaryPassword || '');
    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || temporaryPassword.length < 8) {
      return json({ error: 'INVALID_DRIVER_DETAILS' }, 400);
    }
    const created = await service.auth.admin.createUser({
      email, password: temporaryPassword, email_confirm: true,
      user_metadata: { full_name: fullName, phone, account_created_by: admin.id },
    });
    if (created.error || !created.data.user) {
      if (isExistingEmailError(created.error)) return json({ error: 'EMAIL_ALREADY_REGISTERED' }, 409);
      console.error('admin_create_driver_auth_failed', created.error?.code || 'UNKNOWN_CODE', created.error?.message || 'UNKNOWN_ERROR');
      return json({ error: 'DRIVER_AUTH_CREATE_FAILED' }, 400);
    }
    const userId = created.data.user.id;
    const profile = await service.from('profiles').upsert({ id: userId, full_name: fullName, email, phone, role: 'driver', is_demo: false, updated_at: new Date().toISOString() });
    if (profile.error) {
      await service.auth.admin.deleteUser(userId);
      console.error('admin_create_driver_profile_failed', profile.error.code || 'UNKNOWN_CODE', profile.error.message);
      return json({ error: 'DRIVER_PROFILE_CREATE_FAILED' }, 500);
    }
    return json({ ok: true, driverId: userId });
  } catch (error) {
    console.error('admin_create_driver_failed', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
    return json({ error: 'DRIVER_CREATE_FAILED' }, 500);
  }
});
