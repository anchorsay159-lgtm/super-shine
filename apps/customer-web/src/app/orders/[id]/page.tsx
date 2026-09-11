'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { COLLECTION_METHOD_LABELS, CUSTOMER_ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, RETURN_METHOD_LABELS, formatDateTime, formatMoney, orderWorkflow, orderWorkflowProgress } from '@supershine/shared';
import { AppShell } from '@/components/shell';
import { Card, EmptyState, LoadingState, PageHeader, StatusBadge } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

function publicQrUrl(path?: string | null) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  return base ? `${base}/storage/v1/object/public/business-public/${path.split('/').map(encodeURIComponent).join('/')}` : '';
}

export default function OrderDetailPage() {
  const app = useWebApp();
  const params = useParams<{ id: string }>();
  const order = app.orders.find((item) => item.databaseId === decodeURIComponent(params.id));
  const [message, setMessage] = useState('');
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (await app.sendMessage(order!.databaseId, message)) setMessage('');
  }

  if (app.accountLoading) return <AppShell><LoadingState label="Loading order details…"/></AppShell>;
  if (!order) return <AppShell><EmptyState title="Order not found" body="The link may be incorrect, or this order does not belong to your account." action={<Link className="button button-secondary" href="/orders">Return to orders</Link>}/></AppShell>;

  const paid = order.paymentStatus === 'paid' || order.paymentStatus === 'refunded';
  const failed = order.paymentStatus === 'failed' || order.paymentStatus === 'expired';
  const priceReady = order.finalTotal != null && !['pending', 'rejected'].includes(order.priceApprovalStatus);
  const qrUrl = publicQrUrl(app.settings.promptPayQrPath);
  const promptPayConfigured = order.isDemo || (app.settings.promptPayEnabled && Boolean(qrUrl));
  const paymentTone = paid ? 'success' : failed ? 'danger' : 'attention';
  const workflow = orderWorkflow(order.collectionMethod, order.returnMethod);
  const workflowIndex = workflow.indexOf(order.status);
  const workflowPercent = orderWorkflowProgress(order);

  return <AppShell>
    <PageHeader eyebrow="Order tracking" title={order.id} description={`Placed ${formatDateTime(order.createdAt, app.language)}`} action={<div className="cluster"><StatusBadge tone="info">{CUSTOMER_ORDER_STATUS_LABELS[order.status]}</StatusBadge><StatusBadge tone={paymentTone}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</StatusBadge></div>}/>
    <Card className="detail-header">
      <div className="detail-title-row"><div><h1>{CUSTOMER_ORDER_STATUS_LABELS[order.status]}</h1><p className="muted">{workflowPercent}% of this order path complete</p></div><div className="order-amount">{formatMoney(order.amount, app.language)}</div></div>
      <div className="progress"><span style={{width: `${Math.max(3, workflowPercent)}%`}}/></div>
      <div className="timeline" style={{marginTop: 20}}>{workflow.map((status, index) => <div className="timeline-item" key={status}><strong>{index < workflowIndex ? '✓ ' : index === workflowIndex ? '● ' : '○ '}{CUSTOMER_ORDER_STATUS_LABELS[status]}</strong></div>)}</div>
      {order.priceApprovalStatus === 'pending' ? <div className="card card-pad" style={{marginTop: 20}}><h2>Final price approval required</h2><p>The laundry team updated the final total to <strong>{formatMoney(order.amount, app.language)}</strong>. Approve it to continue, or reject it so the team can contact you.</p><div className="cluster"><button className="button button-primary" disabled={Boolean(app.busy)} onClick={() => void app.respondToPrice(order.databaseId, true)}>Approve final price</button><button className="button button-danger" disabled={Boolean(app.busy)} onClick={() => void app.respondToPrice(order.databaseId, false)}>Reject</button></div></div> : null}
    </Card>

    <div className="grid grid-2" style={{marginTop: 20}}>
      <Card className="detail-section"><h2>Fulfillment</h2><div className="detail-list"><div className="detail-row"><span>Receive laundry</span><strong>{COLLECTION_METHOD_LABELS[order.collectionMethod]}</strong></div><div className="detail-row"><span>Return laundry</span><strong>{RETURN_METHOD_LABELS[order.returnMethod]}</strong></div>{order.collectionMethod === 'home_pickup' ? <div className="detail-row"><span>Pickup window</span><strong>{order.pickupDate} · {order.pickupStart?.slice(0,5)}–{order.pickupEnd?.slice(0,5)}</strong></div> : <div className="detail-row"><span>Store</span><strong>{app.settings.storeName} · {app.settings.openTime.slice(0,5)}–{app.settings.closeTime.slice(0,5)}</strong></div>}{order.pickupAddress || order.deliveryAddress ? <div className="detail-row"><span>Address</span><strong>{order.deliveryAddress || order.pickupAddress}</strong></div> : null}<div className="detail-row"><span>Contact</span><strong>{order.contactPhone}</strong></div>{order.pickupInstructions ? <div className="detail-row"><span>Instructions</span><strong>{order.pickupInstructions}</strong></div> : null}</div></Card>
      <Card className="detail-section">
        <h2>Payment</h2>
        <div className="detail-list"><div className="detail-row"><span>Method</span><strong>{order.paymentMethod.replaceAll('_', ' ')}</strong></div><div className="detail-row"><span>Status</span><strong>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</strong></div><div className="detail-row"><span>Exact amount</span><strong>{formatMoney(order.amount, app.language)}</strong></div>{order.amountPaid > 0 ? <div className="detail-row"><span>Paid</span><strong>{formatMoney(order.amountPaid, app.language)}</strong></div> : null}{order.outstandingAmount > 0 ? <div className="detail-row"><span>Balance</span><strong>{formatMoney(order.outstandingAmount, app.language)}</strong></div> : null}</div>
        {order.paymentAmountMismatch ? <div className="form-error">Amount mismatch. The laundry team must review this payment.</div> : null}
        {order.paymentFailureReason || order.paymentRejectionReason ? <div className="form-error">{order.paymentFailureReason || order.paymentRejectionReason}</div> : null}

        {order.paymentMethod === 'promptpay' && !paid ? <div className="stack" style={{marginTop: 16}}>
          {!priceReady ? <p className="muted">Payment becomes available after the laundry team confirms the final price and any required price approval is complete.</p> : null}
          {priceReady && !promptPayConfigured ? <div className="form-error">PromptPay is temporarily unavailable. Choose a cash option or return to the order.</div> : null}
          {priceReady && promptPayConfigured && order.paymentStatus === 'pending' ? <div><h3>Waiting for confirmation</h3><p className="muted small">Super Shine will confirm the bank transaction. This screen updates automatically; no new order is created.</p></div> : null}
          {priceReady && promptPayConfigured && order.paymentStatus !== 'pending' ? <>
            {failed ? <div><h3>{order.paymentStatus === 'expired' ? 'QR attempt expired' : 'Payment not confirmed'}</h3><p className="muted small">Try again to create a new reference, or change to cash without creating another order.</p></div> : null}
            {qrUrl ? <div style={{textAlign: 'center'}}><Image src={qrUrl} alt="Super Shine PromptPay QR" width={280} height={280} unoptimized style={{maxWidth: '100%', height: 'auto'}}/></div> : <div className="state-icon" aria-label="Demo QR">QR</div>}
            <div className="detail-list"><div className="detail-row"><span>Amount</span><strong>{formatMoney(order.amount, app.language)}</strong></div><div className="detail-row"><span>Order</span><strong>{order.id}</strong></div><div className="detail-row"><span>Reference</span><strong>{order.paymentReference || 'Create an attempt first'}</strong></div>{app.settings.promptPayDisplayName ? <div className="detail-row"><span>Recipient</span><strong>{app.settings.promptPayDisplayName}</strong></div> : null}</div>
            {app.settings.promptPayInstructions ? <p className="muted small">{app.settings.promptPayInstructions}</p> : null}
            <div className="cluster">
              {qrUrl ? <a className="button button-secondary" href={qrUrl} download={`Super-Shine-${order.id}-PromptPay.png`} target="_blank" rel="noreferrer">Save QR</a> : null}
              {order.paymentReference && !failed ? <button className="button button-primary" disabled={Boolean(app.busy)} onClick={() => void app.requestPromptPayConfirmation(order.databaseId)}>I paid — request confirmation</button> : null}
              <button className="button button-secondary" disabled={Boolean(app.busy)} onClick={() => void app.beginPromptPayAttempt(order.databaseId, Boolean(order.paymentReference))}>{order.paymentReference ? 'Try again / new QR' : 'Generate payment reference'}</button>
            </div>
          </> : null}
          <div className="cluster"><button className="button button-secondary" disabled={Boolean(app.busy)} onClick={() => void app.changeOrderPaymentMethod(order.databaseId, order.returnMethod === 'home_delivery' ? 'cash_delivery' : 'cash_pickup')}>{order.returnMethod === 'home_delivery' ? 'Change to cash at delivery' : 'Change to cash at collection'}</button><Link className="button button-link" href="/orders">Return to order</Link></div>
          {order.paymentStatus === 'pending' ? <button className="button button-link" onClick={() => setShowFallback((value) => !value)}>Use payment slip fallback</button> : null}
          {showFallback ? <div className="stack"><p className="muted small">Use a slip only when bank confirmation cannot be matched automatically or manually.</p><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setUploadingFile(event.target.files?.[0] ?? null)}/><button className="button button-secondary" disabled={!uploadingFile || Boolean(app.busy)} onClick={() => uploadingFile && void app.uploadPaymentSlip(order.databaseId, uploadingFile)}>Submit fallback slip</button></div> : null}
        </div> : null}
        {order.paymentStatus === 'paid' ? <div className="stack" style={{marginTop: 16}}><h3>Paid ✓</h3><p className="muted small">Payment was confirmed. The receipt and accounting entry are generated once by the secure backend.</p></div> : null}
      </Card>
    </div>

    <div className="grid grid-2" style={{marginTop: 20}}><Card className="detail-section"><h2>Service items</h2><div className="detail-list">{order.items.map((item) => <div className="detail-row" key={item.id}><span>{item.serviceName} × {item.quantity} {item.priceUnit}</span><strong>{formatMoney(item.lineTotal, app.language)}</strong></div>)}<div className="detail-row"><span>Pickup fee</span><strong>{formatMoney(order.pickupFee, app.language)}</strong></div><div className="detail-row"><span>Delivery fee</span><strong>{formatMoney(order.deliveryFee, app.language)}</strong></div>{order.discount ? <div className="detail-row"><span>Discount{order.couponCode ? ` · ${order.couponCode}` : ''}</span><strong>−{formatMoney(order.discount, app.language)}</strong></div> : null}</div>{order.customerComment ? <><div className="divider"/><h2>Customer order note</h2><p style={{whiteSpace: 'pre-wrap'}}>{order.customerComment}</p></> : null}</Card><Card className="detail-section"><h2>Status timeline</h2><div className="timeline">{order.history.map((item) => <div className="timeline-item" key={item.id}><strong>{CUSTOMER_ORDER_STATUS_LABELS[item.newStatus]}</strong>{item.comment ? <span className="small">{item.comment}</span> : null}<time>{formatDateTime(item.createdAt, app.language)}</time></div>)}</div></Card></div>
    <Card className="detail-section" style={{marginTop: 20} as never}><h2>Conversation with Super Shine</h2><div className="messages">{order.messages.length ? order.messages.map((item) => <div className={`message ${item.senderRole}`} key={item.id}><strong>{item.senderRole === 'admin' ? 'Super Shine' : 'You'}</strong><div>{item.message}</div><small>{formatDateTime(item.createdAt, app.language)}</small></div>) : <p className="muted">No messages yet. Your original checkout note remains separate above.</p>}</div><form className="message-form" onSubmit={send}><input aria-label="Message" maxLength={1000} placeholder="Write a message about this order" value={message} onChange={(event) => setMessage(event.target.value)}/><button className="button button-primary" disabled={!message.trim() || Boolean(app.busy)}>Send</button></form></Card>
  </AppShell>;
}
