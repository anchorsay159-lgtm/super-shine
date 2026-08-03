'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Brand } from '@/components/brand';
import { Card, Field } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

export default function ResetPasswordPage() {
  const app = useWebApp(); const router = useRouter(); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const mismatch = confirm && password !== confirm ? 'Passwords do not match.' : '';
  async function submit(event: FormEvent) { event.preventDefault(); if (password.length < 8 || mismatch) return; if (await app.updatePassword(password)) router.replace('/'); }
  return <main className="auth-page"><Card className="auth-card"><Brand/><p className="eyebrow">Choose a new password</p><h1>Secure your account</h1><form className="stack" onSubmit={submit}><Field label="New password" hint="Use at least 8 characters."><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required/></Field><Field label="Confirm password" error={mismatch}><input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required/></Field>{app.error ? <div className="form-error">{app.error}</div> : null}<button className="button button-primary button-block" disabled={Boolean(app.busy) || Boolean(mismatch)}>{app.busy ? 'Updating…' : 'Update password'}</button></form></Card></main>;
}
