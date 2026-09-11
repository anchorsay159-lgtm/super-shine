import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, readJson } from '../_shared/http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const service = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function requireAdmin(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7) : '';
  if (!token) return null;
  const { data } = await service.auth.getUser(token);
  if (!data.user) return null;
  const { data: profile } = await service.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return profile?.role === 'admin' ? data.user : null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const admin = await requireAdmin(request);
    if (!admin) return json({ error: 'ADMIN_REQUIRED' }, 403);
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
    if (created.error || !created.data.user) return json({ error: created.error?.message || 'DRIVER_CREATE_FAILED' }, 400);
    const userId = created.data.user.id;
    const profile = await service.from('profiles').upsert({ id: userId, full_name: fullName, email, phone, role: 'driver', is_demo: false, updated_at: new Date().toISOString() });
    if (profile.error) {
      await service.auth.admin.deleteUser(userId);
      throw profile.error;
    }
    return json({ ok: true, driverId: userId });
  } catch (error) {
    console.error('admin_create_driver_failed', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
    return json({ error: 'DRIVER_CREATE_FAILED' }, 500);
  }
});

