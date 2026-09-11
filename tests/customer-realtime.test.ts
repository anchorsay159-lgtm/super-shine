import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contextSource = readFileSync('src/context/app-context.tsx', 'utf8');
const homeSource = readFileSync('src/app/(tabs)/home.tsx', 'utf8');
const checkoutSource = readFileSync('src/app/new-order.tsx', 'utf8');
const supabaseSource = readFileSync('src/lib/supabase.ts', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20260720_customer_realtime_sync.sql', 'utf8');

test('home stays focused without the free-pickup benefit card', () => {
  assert.doesNotMatch(homeSource, /Free pickup benefit|remainingFreePickups/);
  assert.match(homeSource, /SectionHeader title=\{t\('Services'\)\}/);
  assert.doesNotMatch(homeSource, /featuredOffer/);
});

test('customer orders update immediately and reconcile with Supabase', () => {
  assert.match(contextSource, /patchOrderFromRealtime/);
  assert.match(contextSource, /scheduleOrderRefresh\(userId, orderId\)/);
  assert.match(contextSource, /table: 'order_items'/);
  assert.match(contextSource, /table: 'order_status_history'/);
  assert.match(contextSource, /prepareRealtimeChannel\('customer-orders'\)/);
  assert.match(contextSource, /AppState\.addEventListener\('change'/);
  assert.doesNotMatch(contextSource, /table: 'orders'[\s\S]{0,180}\(\) => void loadAccount\(userId\)/);
});

test('provider owns stable batched channels for every live customer data group', () => {
  for (const channel of ['customer-public-catalog', 'customer-promotions', 'customer-orders', 'customer-notifications']) {
    assert.match(contextSource, new RegExp(`prepareRealtimeChannel\\('${channel}'\\)`));
  }
  for (const table of ['services', 'service_options', 'pickup_slots', 'business_settings', 'coupons', 'coupon_usage', 'orders', 'order_items', 'order_status_history', 'payments', 'notifications']) {
    assert.match(contextSource, new RegExp(`table: '${table}'`));
  }
  assert.match(contextSource, /setTimeout\(run, 80\)/);
  assert.match(contextSource, /removeChannel\(channel\)/);
  assert.match(contextSource, /realtime_channel_state/);
});

test('native sessions refresh safely and coupon refresh keeps valid cached data', () => {
  assert.match(supabaseSource, /Platform\.OS !== 'web'/);
  assert.match(supabaseSource, /storage: AsyncStorage/);
  assert.match(supabaseSource, /autoRefreshToken: true/);
  assert.match(supabaseSource, /persistSession: true/);
  assert.match(supabaseSource, /lock: processLock/);
  assert.match(supabaseSource, /startAutoRefresh/);
  assert.match(supabaseSource, /stopAutoRefresh/);
  assert.doesNotMatch(contextSource, /if \(result\.error\) \{\s*setCatalogCoupons\(\[\]\)/);
});

test('realtime migration publishes actual sources without broad replica identity changes', () => {
  for (const table of ['services', 'service_options', 'coupons', 'coupon_usage', 'pickup_slots', 'business_settings', 'orders', 'order_items', 'order_status_history', 'notifications', 'payments', 'support_messages']) {
    assert.match(migrationSource, new RegExp(`'${table}'`));
  }
  assert.match(migrationSource, /bump_customer_realtime_revision_v16/);
  assert.match(migrationSource, /services_public_read_catalog/);
  assert.doesNotMatch(migrationSource, /alter table[^;]+replica identity full/i);
});

test('invalid selected coupons are removed with the customer-safe message', () => {
  assert.match(checkoutSource, /if \(couponCode && !coupon\)/);
  assert.match(checkoutSource, /This offer is no longer available\./);
});
