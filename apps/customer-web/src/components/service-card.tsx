'use client';

import Link from 'next/link';
import { formatMoney, type LaundryService } from '@supershine/shared';
import { StatusBadge } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

const symbols: Record<string, string> = { laundry: '◉', 'dry-cleaning': '◇', bed: '▰', iron: '⌁' };

export function ServiceCard({ service }: { service: LaundryService }) {
  const app = useWebApp();
  const line = app.cart.find((item) => item.serviceId === service.id);
  return <article className={`card service-card ${service.enabled ? '' : 'disabled'}`}>
    <div className="service-art"><span className="service-symbol" aria-hidden="true">{symbols[service.icon] ?? '✦'}</span><span className="service-time">{service.turnaroundHours} hr turnaround</span></div>
    <div className="service-body"><div className="cluster"><h2>{service.name}</h2>{!service.enabled ? <StatusBadge tone="attention">{app.t('unavailable')}</StatusBadge> : null}</div><p>{service.description}</p><div className="service-price">{formatMoney(service.price, app.language)} <small>/ {service.priceUnit}</small></div>
      <div className="cluster"><Link className="button button-secondary" href={`/services/${encodeURIComponent(service.id)}`}>Details</Link><button className="button button-primary" disabled={!service.enabled} onClick={() => app.setCartQuantity(service.id, (line?.quantity ?? 0) + 1)}>{line ? `Add another · ${line.quantity} in cart` : app.t('addToCart')}</button></div>
    </div>
  </article>;
}
