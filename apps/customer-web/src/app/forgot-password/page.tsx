'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Brand } from '@/components/brand';
import { Card, Field } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

export default function ForgotPasswordPage() {
  const app = useWebApp(); const [email, setEmail] = useState('');
  async function submit(event: FormEvent) { event.preventDefault(); if (email.trim()) await app.requestPasswordReset(email); }
  return <main className="auth-page"><Card className="auth-card"><Brand/><p className="eyebrow">Account recovery</p><h1>Reset your password</h1><p className="muted">We’ll send a secure reset link to your account email.</p><form className="stack" onSubmit={submit}><Field label="Email"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required/></Field>{app.error ? <div className="form-error" role="alert">{app.error}</div> : null}<button className="button button-primary button-block" disabled={Boolean(app.busy)}>{app.busy ? 'Sending…' : 'Send reset link'}</button><Link className="button button-secondary button-block" href="/auth?mode=signin">Back to sign in</Link></form></Card></main>;
}
