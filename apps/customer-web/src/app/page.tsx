'use client';

import Link from 'next/link';
import { formatDateTime, formatMoney, orderIsActive } from '@supershine/shared';
import { AppShell } from '@/components/shell';
import { Brand } from '@/components/brand';
import { ServiceCard } from '@/components/service-card';
import { ErrorState, LoadingState, StatusBadge } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

function Welcome() {
  const app = useWebApp();
  return <main className="welcome"><section className="welcome-copy"><Brand/><p className="eyebrow">Pickup · Care · Delivery</p><h1>{app.t('welcomeTitle')}</h1><p>{app.t('welcomeBody')}</p><div className="welcome-actions"><Link className="button button-primary" href="/auth?mode=signup">{app.t('createAccount')}</Link><Link className="button button-secondary" href="/auth?mode=signin">{app.t('signIn')}</Link><Link className="button button-link" href="/auth?mode=demo">{app.t('demo')}</Link></div></section><aside className="welcome-visual" aria-label="Fresh laundry service"><div className="machine"><div className="machine-door" aria-hidden="true">✦</div></div><div className="visual-copy"><strong>Professional care, visible progress.</strong><span>From your door and back again.</span></div></aside></main>;
}

function CustomerHome() {
  const app = useWebApp(); const active = app.orders.find(orderIsActive);
  return <AppShell><section className="hero-panel"><div className="card hero-copy"><p className="eyebrow">Welcome back{app.profile?.name ? `, ${app.profile.name.split(' ')[0]}` : ''}</p><h1>Fresh laundry without losing your day.</h1><p>Choose the care you need, book a convenient pickup, and follow every update from one place.</p><div className="cluster"><Link className="button button-primary" href="/services">{app.t('browseServices')}</Link>{active ? <Link className="button button-secondary" href={`/orders/${active.databaseId}`}>Track current order</Link> : null}</div></div><aside className="card hero-summary"><h2>{active ? 'Current order' : 'Ready when you are'}</h2>{active ? <><p>{active.id}</p><div className="summary-row"><span>Status</span><StatusBadge tone="info">{active.status.replaceAll('_', ' ')}</StatusBadge></div><div className="summary-row"><span>Pickup</span><strong>{formatDateTime(active.pickupDate, app.language)}</strong></div><div className="summary-row"><span>Total</span><strong>{formatMoney(active.amount, app.language)}</strong></div></> : <><p>No active laundry orders. Start with a service below.</p><div className="summary-row"><span>Store hours</span><strong>{app.settings.openTime.slice(0,5)}–{app.settings.closeTime.slice(0,5)}</strong></div><div className="summary-row"><span>Delivery fee</span><strong>{formatMoney(app.settings.deliveryFee, app.language)}</strong></div></>}</aside></section>
    <div className="section-heading"><h2>{app.t('availableServices')}</h2><Link href="/services">View every service →</Link></div>
    {app.catalogLoading ? <LoadingState label="Loading laundry services…"/> : app.error && !app.services.length ? <ErrorState body={app.error} retry={() => void app.refresh()}/> : <div className="grid grid-3">{app.services.slice(0, 3).map((service) => <ServiceCard key={service.id} service={service}/>)}</div>}
  </AppShell>;
}

export default function HomePage() {
  const app = useWebApp();
  if (!app.initialized) return <div className="fullscreen-state"><span className="spinner"/><p>Opening Super Shine…</p></div>;
  return app.mode === 'guest' ? <Welcome/> : <CustomerHome/>;
}
