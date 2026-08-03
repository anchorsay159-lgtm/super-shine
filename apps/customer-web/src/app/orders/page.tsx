'use client';

import Link from 'next/link';
import {
  formatDateTime, formatMoney, ORDER_STATUS_LABELS, ORDER_STATUS_PROGRESS,
  PAYMENT_STATUS_LABELS, orderIsActive,
} from '@supershine/shared';
import { useState } from 'react';
import { AppShell } from '@/components/shell';
import { Card, EmptyState, LoadingState, PageHeader, StatusBadge } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

export default function OrdersPage() {
  const app = useWebApp();
  const [view, setView] = useState<'active' | 'past'>('active');
  const visible = app.orders.filter((order) => view === 'active' ? orderIsActive(order) : !orderIsActive(order));
  return <AppShell>
    <PageHeader eyebrow="Your laundry" title="Orders" description="Orders placed in the mobile app and browser appear together here." action={<div className="cluster"><button className={`button ${view === 'active' ? 'button-primary' : 'button-secondary'}`} onClick={() => setView('active')}>Current</button><button className={`button ${view === 'past' ? 'button-primary' : 'button-secondary'}`} onClick={() => setView('past')}>Past</button></div>}/>
    {app.accountLoading ? <LoadingState label="Loading your orders…"/> : visible.length ? <div>{visible.map((order) => <Card className="order-card" key={order.databaseId}>
      <div><span className="order-number">{order.id}</span><span className="order-services">{order.items.map((item) => item.serviceName).join(', ')}</span><div className="progress"><span style={{width: `${Math.max(4, ORDER_STATUS_PROGRESS[order.status])}%`}}/></div></div>
      <div><span className="muted small">Pickup</span><br/><strong>{formatDateTime(order.pickupDate, app.language)}</strong></div>
      <div><StatusBadge tone={order.paymentStatus === 'paid' || order.paymentStatus === 'verified' ? 'success' : order.paymentStatus === 'rejected' || order.paymentStatus === 'outstanding' ? 'danger' : 'attention'}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</StatusBadge><div className="order-amount">{formatMoney(order.amount, app.language)}</div></div>
      <Link className="button button-secondary" href={`/orders/${order.databaseId}`}>{ORDER_STATUS_LABELS[order.status]}</Link>
    </Card>)}</div> : <EmptyState title={view === 'active' ? 'No active orders' : 'No past orders'} body="When you place an order, its progress and payment status will appear here." action={<Link className="button button-primary" href="/services">Browse services</Link>}/>} 
  </AppShell>;
}
