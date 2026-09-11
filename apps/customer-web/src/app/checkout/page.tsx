'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  calculateOrderPreview, formatDateTime, isSlotAvailable,
  type CollectionMethod, type PaymentMethod, type ReturnMethod,
} from '@supershine/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AppShell } from '@/components/shell';
import { PriceBreakdown } from '@/components/price-breakdown';
import { Card, EmptyState, Field, PageHeader } from '@/components/ui';
import { useWebApp } from '@/context/web-app';

const names = ['Fulfillment', 'Schedule', 'Payment', 'Review'];

export default function CheckoutPage() {
  const app = useWebApp();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [collectionMethod, setCollectionMethod] = useState<CollectionMethod>('home_pickup');
  const [returnMethod, setReturnMethod] = useState<ReturnMethod>('home_delivery');
  const [addressId, setAddressId] = useState(app.addresses.find((item) => item.isPrimary)?.id ?? app.addresses[0]?.id ?? '');
  const [slotId, setSlotId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [phone, setPhone] = useState(app.profile?.phone ?? '');
  const [payment, setPayment] = useState<PaymentMethod>(app.profile?.defaultPaymentMethod ?? 'cash_delivery');
  const [couponCode, setCouponCode] = useState('');
  const [comment, setComment] = useState('');
  const needsAddress = collectionMethod === 'home_pickup' || returnMethod === 'home_delivery';
  const cashMethod: PaymentMethod = returnMethod === 'home_delivery' ? 'cash_delivery' : 'cash_pickup';
  useEffect(() => { if (payment !== 'promptpay' && payment !== cashMethod) setPayment(cashMethod); }, [cashMethod, payment]);
  const coupon = app.coupons.find((item) => item.code === couponCode);
  const previewSettings = useMemo(() => ({
    ...app.settings,
    pickupFee: collectionMethod === 'home_pickup' ? app.settings.pickupFee : 0,
    deliveryFee: returnMethod === 'home_delivery' ? app.settings.deliveryFee : 0,
  }), [app.settings, collectionMethod, returnMethod]);
  const preview = useMemo(() => calculateOrderPreview(app.cart, app.services, previewSettings, coupon), [app.cart, app.services, coupon, previewSettings]);
  const canContinue = step === 1 ? (!needsAddress || Boolean(addressId))
    : step === 2 ? Boolean(phone.trim() && (collectionMethod !== 'home_pickup' || slotId)) : true;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < 4) { if (canContinue) setStep((value) => value + 1); return; }
    const order = await app.placeOrder({
      collectionMethod, returnMethod, addressId: needsAddress ? addressId : undefined,
      pickupSlotId: collectionMethod === 'home_pickup' ? slotId : undefined,
      pickupInstructions: instructions, contactPhone: phone, paymentMethod: payment,
      couponCode: couponCode || undefined, customerComment: comment,
    });
    if (order) router.push(`/orders/${order.databaseId}`);
  }

  if (!app.cart.length) return <AppShell><PageHeader title="Checkout"/><EmptyState title="Your cart is empty" body="Add a service before starting checkout." action={<Link className="button button-primary" href="/services">Browse services</Link>}/></AppShell>;
  return <AppShell><PageHeader eyebrow={`Step ${step} of 4`} title="Checkout" description="Choose how your laundry reaches Super Shine and how it comes back."/>
    <div className="checkout-steps" aria-label={`Checkout step ${step} of 4`}>{names.map((name, index) => <div key={name} className={`checkout-step ${step === index + 1 ? 'active' : ''}`}>{index + 1}. {name}</div>)}</div>
    <form className="split-layout" onSubmit={submit}><Card className="checkout-form stack">
      {step === 1 ? <>
        <h2>How should we receive your laundry?</h2><div className="choice-list">
          <Choice name="collection" checked={collectionMethod === 'home_pickup'} title="Home Pickup" body="Super Shine will collect your laundry from your address." onChange={() => setCollectionMethod('home_pickup')}/>
          <Choice name="collection" checked={collectionMethod === 'store_dropoff'} title="Store Drop-off" body="You’ll bring your laundry to Super Shine." onChange={() => setCollectionMethod('store_dropoff')}/>
        </div>
        <h2>How would you like your clean laundry returned?</h2><div className="choice-list">
          <Choice name="return" checked={returnMethod === 'home_delivery'} title="Home Delivery" body="Super Shine will deliver your clean laundry to your address." onChange={() => setReturnMethod('home_delivery')}/>
          <Choice name="return" checked={returnMethod === 'store_collection'} title="Store Collection" body="You’ll collect your clean laundry from Super Shine." onChange={() => setReturnMethod('store_collection')}/>
        </div>
        {needsAddress ? <><h3>{collectionMethod === 'home_pickup' ? 'Pickup and delivery address' : 'Delivery address'}</h3>{app.addresses.length ? <div className="choice-list">{app.addresses.map((address) => <Choice key={address.id} name="address" checked={addressId === address.id} title={address.label} body={address.detail} onChange={() => setAddressId(address.id)}/>)}</div> : <EmptyState title="No saved addresses" body="Add an address from your profile, then return to checkout." action={<Link className="button button-secondary" href="/profile">Add address</Link>}/>}</> : <p className="muted">Bring and collect this order at {app.settings.storeName}. Open {app.settings.openTime.slice(0,5)}–{app.settings.closeTime.slice(0,5)}.</p>}
      </> : null}
      {step === 2 ? <>
        {collectionMethod === 'home_pickup' ? <><h2>Select your home pickup</h2><div className="choice-list">{app.slots.filter(isSlotAvailable).map((slot) => <Choice key={slot.id} name="slot" checked={slotId === slot.id} title={formatDateTime(`${slot.date}T${slot.startTime}`, app.language)} body={`${slot.startTime.slice(0,5)}–${slot.endTime.slice(0,5)} · ${slot.capacity - slot.bookedCount} spaces`} onChange={() => setSlotId(slot.id)}/>)}</div><Field label="Pickup instructions" hint="Optional · 500 characters maximum"><textarea maxLength={500} value={instructions} onChange={(event) => setInstructions(event.target.value)}/></Field></> : <><h2>Store drop-off</h2><p className="muted">Bring your laundry to {app.settings.storeName} during opening hours. Keep your order number ready.</p></>}
        <Field label="Contact phone"><input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required/></Field>
      </> : null}
      {step === 3 ? <><h2>Payment and offers</h2><div className="choice-list">
        <Choice name="payment" checked={payment === cashMethod} title={returnMethod === 'home_delivery' ? 'Cash on delivery' : 'Cash on collection'} body={returnMethod === 'home_delivery' ? 'Cash is due when the laundry returns to your door.' : 'Cash is due when you collect the finished laundry.'} onChange={() => setPayment(cashMethod)}/>
        <Choice name="payment" checked={payment === 'promptpay'} title="PromptPay" body="Payment instructions appear after the final price is confirmed." onChange={() => setPayment('promptpay')}/>
      </div><Field label="Coupon"><select value={couponCode} onChange={(event) => setCouponCode(event.target.value)}><option value="">No coupon</option>{app.coupons.map((item) => <option value={item.code} key={item.code}>{item.code} · {item.title}</option>)}</select></Field></> : null}
      {step === 4 ? <><h2>Review your order</h2><div className="detail-list">
        <div className="detail-row"><span>Receive laundry</span><strong>{collectionMethod === 'home_pickup' ? 'Home Pickup' : 'Store Drop-off'}</strong></div>
        <div className="detail-row"><span>Return laundry</span><strong>{returnMethod === 'home_delivery' ? 'Home Delivery' : 'Store Collection'}</strong></div>
        {needsAddress ? <div className="detail-row"><span>Address</span><strong>{app.addresses.find((item) => item.id === addressId)?.detail}</strong></div> : null}
        {collectionMethod === 'home_pickup' ? <div className="detail-row"><span>Pickup</span><strong>{app.slots.find((item) => item.id === slotId)?.date} · {app.slots.find((item) => item.id === slotId)?.startTime.slice(0,5)}</strong></div> : null}
        <div className="detail-row"><span>Payment</span><strong>{payment.replaceAll('_', ' ')}</strong></div>
        <div className="detail-row"><span>Services</span><strong>{app.cart.map((line) => `${app.services.find((item) => item.id === line.serviceId)?.name} × ${line.quantity}`).join(', ')}</strong></div>
      </div><Field label="Customer order note" hint="Optional · visible to the laundry team · 1,000 characters maximum"><textarea maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)}/></Field>{app.error ? <div className="form-error" role="alert">{app.error}</div> : null}</> : null}
      <div className="checkout-actions">{step > 1 ? <button type="button" className="button button-secondary" onClick={() => setStep((value) => value - 1)}>Back</button> : <Link className="button button-secondary" href="/cart">Back to cart</Link>}<button className="button button-primary" disabled={!canContinue || Boolean(app.busy)}>{app.busy === 'place-order' ? 'Placing order…' : step === 4 ? 'Place order' : 'Continue'}</button></div>
    </Card><Card><PriceBreakdown preview={preview} language={app.language}/><div style={{padding: '0 24px 24px'}}><p className="muted small">Only the fees for your selected fulfillment methods are included. Estimated pricing may change after inspection.</p></div></Card></form>
  </AppShell>;
}

function Choice({ name, checked, title, body, onChange }: { name: string; checked: boolean; title: string; body: string; onChange: () => void }) {
  return <label className="choice-card"><input type="radio" name={name} checked={checked} onChange={onChange}/><span><strong>{title}</strong><span className="muted small">{body}</span></span></label>;
}
