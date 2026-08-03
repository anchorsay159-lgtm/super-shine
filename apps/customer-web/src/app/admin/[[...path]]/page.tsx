import Link from 'next/link';
import { Brand } from '@/components/brand';
import { Card } from '@/components/ui';

export default function CustomerAdminBlockPage() {
  return <main className="auth-page"><Card className="auth-card"><Brand/><p className="eyebrow">Customer application</p><h1>Admin access is not available here</h1><p className="muted">This browser application contains customer routes only. Use the protected Super Shine operations dashboard for authorized admin work.</p><Link className="button button-primary button-block" href="/">Return to customer home</Link></Card></main>;
}
