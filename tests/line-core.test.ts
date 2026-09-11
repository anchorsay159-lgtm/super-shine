import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hmacSha256Base64, lineFlexMessage, lineTemplate, retryableLineStatus, safeReturnUrl, sha256Hex, verifyHmacSha256Base64 } from '../supabase/functions/_shared/line-core.ts';

test('LINE callback return URLs are exact allowlist matches', () => {
  assert.equal(safeReturnUrl('https://super-shine.expo.app/line-callback', ['https://super-shine.expo.app/line-callback']), 'https://super-shine.expo.app/line-callback');
  assert.equal(safeReturnUrl('https://evil.example/line-callback', ['https://super-shine.expo.app/line-callback']), null);
});

test('LINE OAuth hashes and webhook signatures are deterministic', async () => {
  assert.equal(await sha256Hex('supershine'), '3988a10b36fea02256a48a2001ca70c78100a310261a939bd39d0c5d588d277e');
  const signature = await hmacSha256Base64('secret', '{"events":[]}');
  assert.equal(signature, 'pkK1lVPJPiJ+wPLziRD79xIxohl8AImYM8AEeM7IbzQ=');
  assert.equal(await verifyHmacSha256Base64('secret', '{"events":[]}', signature), true);
  assert.equal(await verifyHmacSha256Base64('secret', '{"events":[]}', `${signature.slice(0, -1)}A`), false);
});

test('LINE templates respect store collection wording and payment amount', () => {
  const ready = lineTemplate('laundry_ready', 'en', { orderNumber: 'SS-42', returnMethod: 'store_collection' });
  assert.match(ready.title, /collection/i);
  assert.doesNotMatch(ready.body, /delivery/i);
  const paid = lineTemplate('payment_confirmed', 'en', { orderNumber: 'SS-42', amount: 320 });
  assert.match(paid.body, /฿320\.00/);
});

test('driver arrival has a customer-facing LINE message', () => {
  const message = lineTemplate('driver_arrived', 'en', { orderNumber: 'SS-1200' });
  assert.equal(message.title, 'Driver arrived');
  assert.match(message.body, /SS-1200/);
});

test('LINE notifications use a branded Flex card with a button and concise preview', () => {
  const message = lineFlexMessage('payment_confirmed', 'en', { orderNumber: 'SS-42', amount: 320 }, 'https://example.com/order');
  assert.equal(message.type, 'flex');
  assert.equal(message.altText, 'Payment confirmed · Order SS-42');
  assert.doesNotMatch(message.altText, /Super Shine Laundry/);
  const serialized = JSON.stringify(message.contents);
  assert.match(serialized, /PAYMENT UPDATE/);
  assert.match(serialized, /View order/);
  assert.match(serialized, /https:\/\/example\.com\/order/);
  assert.match(serialized, /฿320\.00/);
});

test('only temporary LINE API failures retry', () => {
  assert.equal(retryableLineStatus(429), true);
  assert.equal(retryableLineStatus(503), true);
  assert.equal(retryableLineStatus(400), false);
  assert.equal(retryableLineStatus(403), false);
});

test('customer connection uses a direct LINE authorization link and explicit add-friend step', () => {
  const start = readFileSync('supabase/functions/line-connect-start/index.ts', 'utf8');
  const button = readFileSync('src/components/line-connect-button.web.tsx', 'utf8');
  const callback = readFileSync('src/app/line-callback.tsx', 'utf8');
  assert.match(start, /bot_prompt: 'aggressive'/);
  assert.match(button, /React\.createElement\('a'/);
  assert.match(callback, /Returning to your notification settings/);
});
