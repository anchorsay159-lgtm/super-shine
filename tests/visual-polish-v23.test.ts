import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const homeSource = readFileSync('src/app/(tabs)/home.tsx', 'utf8');
const ordersSource = readFileSync('src/app/(tabs)/orders.tsx', 'utf8');
const offersSource = readFileSync('src/app/(tabs)/offers.tsx', 'utf8');
const profileSource = readFileSync('src/app/(tabs)/profile.tsx', 'utf8');
const checkoutSource = readFileSync('src/app/new-order.tsx', 'utf8');
const trackingSource = readFileSync('src/app/order-tracking.tsx', 'utf8');

test('home adds useful hierarchy without removing core order actions', () => {
  assert.match(homeSource, /greetingGlow/);
  assert.match(homeSource, /styles\.offerBanner/);
  assert.match(homeSource, /subtitle=\{lastOrder\?\.itemSummary/);
  assert.match(homeSource, /borderTopColor: palette\.color/);
  assert.match(homeSource, /router\.push\('\/new-order'\)/);
});

test('orders and offers communicate state at a glance', () => {
  assert.match(ordersSource, /<EmptyState/);
  assert.match(ordersSource, /<StatusBadge/);
  assert.match(offersSource, /couponUrgencyDays/);
  assert.match(offersSource, /\{\{current\}\} of \{\{target\}\}/);
});

test('profile polish reflects real account data', () => {
  assert.match(profileSource, /completionChecks/);
  assert.match(profileSource, /customerEligibility\.phoneVerified/);
  assert.match(profileSource, /customerEligibility\.remainingFreePickups/);
  assert.match(profileSource, /iconBackground=\{Colors\.tealLight\}/);
});

test('checkout fixes zero-selection total, duplicate addresses, and repeated review content', () => {
  assert.match(checkoutSource, /items\.length \? formatBaht\(total\) : t\('Select an item'\)/);
  assert.match(checkoutSource, /duplicateAddressIds/);
  assert.match(checkoutSource, /1 service selected/);
});

test('tracking adds live motion and future timing while preserving Contact Support', () => {
  assert.match(trackingSource, /function LiveOrderIcon/);
  assert.match(trackingSource, /Animated\.loop/);
  assert.match(trackingSource, /trackingStageEstimate/);
  assert.match(trackingSource, /label=\{t\('Contact support'\)\}/);
  assert.doesNotMatch(trackingSource, /Contact your driver/);
});
