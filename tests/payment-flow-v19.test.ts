import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260809_promptpay_payment_flow.sql', 'utf8');
const customerTracking = readFileSync('src/app/order-tracking.tsx', 'utf8');
const adminOrder = readFileSync('src/app/admin/order/[id].tsx', 'utf8');
const browserOrder = readFileSync('apps/customer-web/src/app/orders/[id]/page.tsx', 'utf8');

test('payment statuses remain separate from operational order statuses', () => {
  assert.match(migration, /payment_status\s+in \(\s*'unpaid', 'pending', 'paid', 'partially_paid', 'failed', 'expired', 'refunded'/);
  assert.match(migration, /new\.status = 'completed' and new\.payment_status not in \('paid', 'refunded'\)/);
  assert.match(migration, /new\.status = 'delivered'.*new\.payment_status/s);
});

test('customer confirmation cannot directly mark PromptPay paid', () => {
  const requestBody = migration.match(/create or replace function public\.request_promptpay_confirmation_v19[\s\S]*?\n\$\$;/)?.[0] ?? '';
  assert.match(requestBody, /payment_status = 'pending'/);
  assert.doesNotMatch(requestBody, /payment_status = 'paid'/);
  assert.match(customerTracking, /requestPromptPayConfirmation/);
  assert.match(browserOrder, /requestPromptPayConfirmation/);
});

test('secure confirmation, receipt, and accounting paths are idempotent', () => {
  assert.match(migration, /admin_update_payment_v19/);
  assert.match(migration, /order_row\.payment_status <> 'pending'/);
  assert.match(migration, /DUPLICATE_PAYMENT_REFERENCE/);
  assert.match(migration, /enqueue_accounting_event/);
  assert.match(adminOrder, /Confirm paid/);
});

test('failed and expired payments recover on the same order', () => {
  assert.match(migration, /prepare_promptpay_attempt_v19/);
  assert.match(migration, /customer_change_payment_method_v19/);
  assert.match(customerTracking, /Try again/);
  assert.match(browserOrder, /Try again \/ new QR/);
});
