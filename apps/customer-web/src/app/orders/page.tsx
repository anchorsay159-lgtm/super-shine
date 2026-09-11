'use client';

import Link from 'next/link';
import {
  CUSTOMER_ORDER_STATUS_LABELS, formatDateTime, formatMoney,
  PAYMENT_STATUS_LABELS, orderIsActive, orderWorkflowProgress,
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
      <div><span className="order-number">{order.id}</span><span className="order-services">{order.items.map((item) => item.serviceName).join(', ')}</span><div className="progress"><span style={{width: `${Math.max(4, orderWorkflowProgress(order))}%`}}/></div></div>
      <div><span className="muted small">{order.collectionMethod === 'home_pickup' ? 'Home pickup' : 'Store drop-off'}</span><br/><strong>{order.collectionMethod === 'home_pickup' ? formatDateTime(order.pickupDate, app.language) : app.settings.storeName}</strong></div>
      <div><StatusBadge tone={order.paymentStatus === 'paid' || order.paymentStatus === 'refunded' ? 'success' : order.paymentStatus === 'failed' || order.paymentStatus === 'expired' ? 'danger' : 'attention'}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</StatusBadge><div className="order-amount">{formatMoney(order.amount, app.language)}</div>{order.outstandingAmount > 0 ? <span className="muted small">Balance {formatMoney(order.outstandingAmount, app.language)}</span> : null}</div>
      <Link className="button button-secondary" href={`/orders/${order.databaseId}`}>{CUSTOMER_ORDER_STATUS_LABELS[order.status]}</Link>
    </Card>)}</div> : <EmptyState title={view === 'active' ? 'No active orders' : 'No past orders'} body="When you place an order, its progress and payment status will appear here." action={<Link className="button button-primary" href="/services">Browse services</Link>}/>} 
  </AppShell>;
}
