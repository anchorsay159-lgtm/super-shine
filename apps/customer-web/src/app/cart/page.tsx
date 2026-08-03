'use client';

import Link from 'next/link';
import { calculateOrderPreview, formatMoney } from '@supershine/shared';
import { AppShell } from '@/components/shell';
import { PriceBreakdown } from '@/components/price-breakdown';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

export default function CartPage() {
  const app = useWebApp(); const preview = calculateOrderPreview(app.cart, app.services, app.settings);
  if (!app.cart.length) return <AppShell><PageHeader title="Your cart" description="Build one pickup with as many laundry services as you need."/><EmptyState title={app.t('emptyCart')} body="Browse available laundry care and add the services you need." action={<Link className="button button-primary" href="/services">{app.t('browseServices')}</Link>}/></AppShell>;
  return <AppShell><PageHeader eyebrow="Your pickup" title="Review your cart" description="Quantities are used for the estimate. Estimated services receive a final price after inspection." action={<button className="button button-link" onClick={app.clearCart}>Clear cart</button>}/><div className="split-layout"><Card>{app.cart.map((line) => { const service = app.services.find((item) => item.id === line.serviceId); if (!service) return null; return <div className="cart-line" key={line.serviceId}><div><strong className="order-number">{service.name}</strong><span className="order-services">{formatMoney(service.price, app.language)} / {service.priceUnit}</span></div><div className="quantity"><button aria-label={`Decrease ${service.name}`} onClick={() => app.setCartQuantity(service.id, line.quantity - 1)}>−</button><span>{line.quantity}</span><button aria-label={`Increase ${service.name}`} onClick={() => app.setCartQuantity(service.id, line.quantity + 1)}>+</button></div><div className="order-amount">{formatMoney(service.price * line.quantity, app.language)}</div></div>; })}</Card><Card><PriceBreakdown preview={preview} language={app.language}/><div style={{padding: '0 24px 24px'}}><Link className="button button-primary button-block" href="/checkout">Continue to checkout</Link></div></Card></div></AppShell>;
}
