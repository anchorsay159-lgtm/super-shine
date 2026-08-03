import Link from 'next/link';
import { Brand } from '@/components/brand';
import { Card } from '@/components/ui';

export default function NotFoundPage() {
  return <main className="auth-page"><Card className="auth-card"><Brand/><p className="eyebrow">Page not found</p><h1>This link does not exist</h1><p className="muted">The page may have moved, or the address may be incorrect.</p><Link className="button button-primary button-block" href="/">Return to Super Shine</Link></Card></main>;
}
