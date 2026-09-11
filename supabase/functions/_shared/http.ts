export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-super-shine-platform, x-line-signature, x-line-worker-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export function noContent() { return new Response(null, { status: 204, headers: corsHeaders }); }

export async function readJson(request: Request) {
  const raw = await request.text();
  if (raw.length > 100_000) throw new Error('REQUEST_TOO_LARGE');
  return { raw, value: JSON.parse(raw) as Record<string, unknown> };
}
