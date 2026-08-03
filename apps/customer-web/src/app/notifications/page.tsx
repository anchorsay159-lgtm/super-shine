'use client';

import Link from 'next/link';
import { formatDateTime } from '@supershine/shared';
import { AppShell } from '@/components/shell';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

export default function NotificationsPage() {
  const app = useWebApp();
  return <AppShell><PageHeader eyebrow="Updates" title="Notifications" description="Order, price, payment, and support updates from Super Shine." action={app.unreadCount ? <button className="button button-secondary" onClick={() => void app.markAllNotificationsRead()}>Mark all as read</button> : null}/>{app.notifications.length ? <div>{app.notifications.map((notification) => <Card className={`notification-card ${notification.readAt ? 'read' : ''}`} key={notification.id}><span className="notification-dot" aria-hidden="true"/><div><h2>{notification.title}</h2><p>{notification.message}</p><span className="muted small">{formatDateTime(notification.createdAt, app.language)}</span></div>{notification.orderId ? <Link className="button button-secondary" href={`/orders/${notification.orderId}`} onClick={() => void app.markNotificationRead(notification.id)}>View order</Link> : !notification.readAt ? <button className="button button-link" onClick={() => void app.markNotificationRead(notification.id)}>Mark read</button> : null}</Card>)}</div> : <EmptyState title={app.t('noNotifications')} body="Order and payment updates will appear here as they happen."/>}</AppShell>;
}
