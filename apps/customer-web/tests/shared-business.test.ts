import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateCouponDiscount, calculateOrderPreview, DEFAULT_SETTINGS, DEMO_SERVICES,
  normalizeEmail, normalizeThaiPhone, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS,
} from '@supershine/shared';

test('browser and mobile-compatible account input normalization is safe', () => {
  assert.equal(normalizeEmail('  Customer@Example.COM '), 'customer@example.com');
  assert.equal(normalizeThaiPhone('092-721-8119'), '+66927218119');
});

test('shared labels preserve the established database meanings', () => {
  assert.equal(ORDER_STATUS_LABELS.pickup_confirmed, 'Pickup confirmed');
  assert.equal(PAYMENT_STATUS_LABELS.waiting_verification, 'Pending verification');
});

test('coupon and total helpers calculate against the intended base', () => {
  const lines = [{ serviceId: DEMO_SERVICES[0].id, quantity: 4, preferences: {} }];
  const coupon = { code: 'SAVE20', title: 'Save', description: '', discountTarget: 'service' as const, discountType: 'percentage' as const, discountValue: 20, minimumOrder: 0, usageCount: 0, eligibleServiceIds: [], requiresVerifiedPhone: false, firstVerifiedProfileOnly: false, active: true };
  assert.equal(calculateCouponDiscount(coupon, 280, 0, 30, DEMO_SERVICES, lines), 56);
  assert.deepEqual(calculateOrderPreview(lines, DEMO_SERVICES, DEFAULT_SETTINGS, coupon), { subtotal: 280, pickupFee: 0, deliveryFee: 30, discount: 56, total: 254 });
});
