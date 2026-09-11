import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ADMIN_STATUS_LABELS, workflowStatuses } from '../src/lib/order-workflow.ts';

test('review and payment keeps payment and coupons before the price summary', () => {
  const source = readFileSync('src/app/new-order.tsx', 'utf8');
  const paymentStep = source.slice(source.indexOf('function PaymentStep'), source.indexOf('type ReviewProps'));
  const paymentIndex = paymentStep.indexOf("p.t('Payment method')");
  const couponIndex = paymentStep.indexOf("p.t('Coupons')");
  const priceIndex = paymentStep.indexOf("p.t('Price summary')");

  assert.ok(paymentIndex >= 0);
  assert.ok(couponIndex > paymentIndex);
  assert.ok(priceIndex > couponIndex);
});

test('current orders receive an explicit visual treatment', () => {
  const source = readFileSync('src/app/(tabs)/orders.tsx', 'utf8');
  assert.match(source, /t\('CURRENT ORDER'\)/);
  assert.match(source, /activeCard: \{[^}]*borderColor: Colors\.teal/);
});

test('customer tracking follows the same route-specific stages as admin', () => {
  const trackingSource = readFileSync('src/app/order-tracking.tsx', 'utf8');
  assert.match(trackingSource, /workflowStatuses\(order\.collectionMethod, order\.returnMethod\)/);
  assert.match(trackingSource, /label: ADMIN_STATUS_LABELS\[status\]/);
  assert.match(trackingSource, /Step \{\{current\}\} of \{\{total\}\}/);
  assert.deepEqual(
    workflowStatuses('home_pickup', 'home_delivery'),
    ['pending', 'accepted', 'pickup_in_progress', 'picked_up', 'processing', 'ready', 'out_for_delivery', 'delivered'],
  );
  assert.equal(ADMIN_STATUS_LABELS.awaiting_dropoff, 'Awaiting store drop-off');
  assert.equal(ADMIN_STATUS_LABELS.ready, 'Ready for delivery');
});
