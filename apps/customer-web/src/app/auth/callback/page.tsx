'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

function CallbackContent() {
  const router = useRouter();
  const search = useSearchParams();
  useEffect(() => {
    const code = search.get('code');
    const supabase = getSupabase();
    if (!code || !supabase) { router.replace('/auth?mode=signin'); return; }
    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      router.replace(error ? '/auth?mode=signin' : '/');
    });
  }, [router, search]);
  return <div className="fullscreen-state"><span className="spinner"/><p>Confirming your account…</p></div>;
}

export default function AuthCallbackPage() {
  return <Suspense fallback={<div className="fullscreen-state"><span className="spinner"/></div>}><CallbackContent/></Suspense>;
}
