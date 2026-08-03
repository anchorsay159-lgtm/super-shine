'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Brand } from '@/components/brand';
import { Card, Field } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

function AuthContent() {
  const app = useWebApp(); const router = useRouter(); const search = useSearchParams();
  const requested = search.get('mode'); const mode = requested === 'signup' ? 'signup' : 'signin';
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [phone, setPhone] = useState('');
  useEffect(() => { if (app.initialized && app.mode !== 'guest') router.replace('/'); }, [app.initialized, app.mode, router]);
  useEffect(() => { if (requested === 'demo' && app.initialized && app.mode === 'guest') { app.startDemo(); router.replace('/'); } }, [app, requested, router]);
  async function submit(event: FormEvent) { event.preventDefault(); if (!email.trim() || !password || (mode === 'signup' && !name.trim())) return; const success = mode === 'signin' ? await app.signIn(email, password) : await app.signUp(name, email, password, phone); if (success === true || success === 'signed-in') router.replace('/'); }
  return <main className="auth-page"><Card className="auth-card"><Brand/><p className="eyebrow">Customer account</p><h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1><p className="muted">{mode === 'signin' ? 'Use the same account as the Super Shine mobile app.' : 'Your account will work in both the browser and mobile app.'}</p><div className="auth-tabs"><Link className={`auth-tab ${mode === 'signin' ? 'active' : ''}`} href="/auth?mode=signin">Sign in</Link><Link className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} href="/auth?mode=signup">Register</Link></div><form className="stack" onSubmit={submit}>{mode === 'signup' ? <Field label="Full name"><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required/></Field> : null}<Field label="Email"><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required/></Field>{mode === 'signup' ? <Field label="Phone" hint="Optional profile information"><input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)}/></Field> : null}<Field label="Password" hint={mode === 'signup' ? 'Use at least 8 characters.' : undefined}><input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required/></Field>{app.error ? <div className="form-error" role="alert">{app.error}</div> : null}{mode === 'signin' ? <Link className="small muted" href="/forgot-password">Forgot your password?</Link> : null}<button className="button button-primary button-block" disabled={Boolean(app.busy)}>{app.busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button></form><p className="auth-footer">Want to look around first? <button className="button-link" type="button" onClick={() => { app.startDemo(); router.replace('/'); }}>Explore demo</button></p></Card></main>;
}

export default function AuthPage() { return <Suspense fallback={<div className="fullscreen-state"><span className="spinner"/></div>}><AuthContent/></Suspense>; }
