import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shellSource = readFileSync('src/admin/admin-ui.tsx', 'utf8');
const overviewSource = readFileSync('src/app/admin/index.tsx', 'utf8');
const ordersSource = readFileSync('src/app/admin/orders.tsx', 'utf8');
const reportsSource = readFileSync('src/app/admin/reports.tsx', 'utf8');
const settingsSource = readFileSync('src/app/admin/settings.tsx', 'utf8');
const accountingSource = readFileSync('src/accounting/accounting-ui.tsx', 'utf8');
const orderDetailSource = readFileSync('src/app/admin/order/[id].tsx', 'utf8');

test('admin shell shares the customer app brand system', () => {
  assert.match(shellSource, /FontFamilyMedium/);
  assert.match(shellSource, /backgroundColor: Colors\.navy, \.\.\.Shadow/);
  assert.match(shellSource, /styles\.navIconActive/);
  assert.match(shellSource, /SUPER SHINE OPERATIONS/);
  assert.match(shellSource, /Sign in to dashboard/);
});

test('overview adds a real-data operations focus without fake metrics', () => {
  assert.match(overviewSource, /TODAY’S FOCUS/);
  assert.match(overviewSource, /attentionCount/);
  assert.match(overviewSource, /nextRoute/);
  assert.match(overviewSource, /unreadCustomerMessages/);
  assert.match(overviewSource, /GROUP_VISUALS/);
});

test('all admin workspaces use the upgraded typography', () => {
  for (const source of [ordersSource, reportsSource, settingsSource, accountingSource, orderDetailSource]) {
    assert.match(source, /FontFamily/);
    assert.match(source, /FontFamilyMedium/);
  }
});

test('redesign preserves order mutations, accounting and delegates trip GPS to driver tasks', () => {
  assert.match(ordersSource, /admin_update_order_status_v20/);
  assert.match(orderDetailSource, /AdminDriverTaskCard/);
  assert.match(orderDetailSource, /Record payment received/);
  assert.match(accountingSource, /Accounting/);
});
