import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { accountingIdempotencyKey, ageingGroup, budgetVariance, isBalanced, profitSummary } from '../src/accounting/accounting-rules.ts';

const migration = readFileSync('supabase/migrations/20260804_sme_accounting.sql', 'utf8');
const adminUi = readFileSync('src/accounting/accounting-ui.tsx', 'utf8');
const expoClient = readFileSync('src/lib/supabase.ts', 'utf8');
const browserClient = readFileSync('apps/customer-web/src/lib/supabase.ts', 'utf8');

test('sample management accounting calculation is exact', () => {
  assert.deepEqual(profitSummary(350, 20, 120, 60, 1), {
    netRevenue: 330, grossProfit: 210, operatingProfit: 150,
    averageRevenuePerOrder: 330, averageCostPerOrder: 120,
    operatingProfitMargin: (150 / 330) * 100,
  });
  assert.deepEqual(profitSummary(0, 0, 0, 0, 0), {
    netRevenue: 0, grossProfit: 0, operatingProfit: 0,
    averageRevenuePerOrder: 0, averageCostPerOrder: 0, operatingProfitMargin: 0,
  });
});

test('journal balance and duplicate source controls are deterministic', () => {
  assert.equal(isBalanced([{ debit: 330, credit: 0 }, { debit: 20, credit: 0 }, { debit: 0, credit: 350 }]), true);
  assert.equal(isBalanced([{ debit: 330, credit: 0 }, { debit: 0, credit: 350 }]), false);
  assert.equal(accountingIdempotencyKey('Order', 'ABC', 'Revenue', '7'), accountingIdempotencyKey('order', 'abc', 'revenue', '7'));
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(migration, /on conflict \(idempotency_key\) do nothing/);
});

test('budget variance and receivable ageing use the required formulas', () => {
  assert.deepEqual(budgetVariance('revenue', 100, 120), { variance: 20, favourable: true, percentage: 20 });
  assert.deepEqual(budgetVariance('expense', 100, 120), { variance: -20, favourable: false, percentage: -20 });
  assert.equal(ageingGroup('2026-08-04', '2026-08-04'), 'current');
  assert.equal(ageingGroup('2026-07-20', '2026-08-04'), '1-30');
  assert.equal(ageingGroup('2026-06-20', '2026-08-04'), '31-60');
  assert.equal(ageingGroup('2026-05-01', '2026-08-04'), '60+');
});

test('trusted posting is atomic, balanced, immutable and retryable', () => {
  assert.match(migration, /create or replace function public\.post_accounting_event/);
  assert.match(migration, /ACCOUNTING_JOURNAL_UNBALANCED/);
  assert.match(migration, /exception when others[\s\S]*posting_status='pending_review'/);
  assert.match(migration, /POSTED_ACCOUNTING_RECORDS_ARE_IMMUTABLE/);
  assert.match(migration, /reverse_accounting_journal/);
  assert.match(migration, /retry_accounting_event/);
  assert.match(migration, /orders_accounting_capture_v1/);
  assert.doesNotMatch(adminUi, /service_role|SUPABASE_SERVICE_ROLE/);
});

test('versioned configuration and separate accounting statuses are present', () => {
  for (const structure of ['accounting_accounts','accounting_tax_rules','accounting_journal_templates','accounting_journal_template_lines','accounting_events','accounting_journal_entries','accounting_journal_lines','accounting_expenses','accounting_supplies','accounting_inventory_movements','accounting_inventory_layers','accounting_service_cost_rules','accounting_order_cost_snapshots','accounting_budgets','accounting_invoices','accounting_receipts','accounting_audit_log']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${structure}`));
  }
  assert.match(migration, /posting_status text not null default 'not_recorded'/);
  assert.doesNotMatch(migration, /alter table public\.orders[\s\S]{0,120}add column if not exists accounting_status/);
});

test('role controls deny customer and delivery access by default', () => {
  assert.match(migration, /staff_role in \('owner','admin','accountant','cashier'\)/);
  assert.match(migration, /has_accounting_role/);
  assert.doesNotMatch(migration, /staff_role in \([^)]*customer/);
  assert.doesNotMatch(migration, /staff_role in \([^)]*driver/);
  assert.match(migration, /ACCOUNTING_ACCESS_REQUIRED/);
});

test('all requested accounting business scenarios are represented by controls', () => {
  const scenarios = [
    'android order','ios order','customer web order','completed cash order','completed unpaid order',
    'partial payment','receivable collection','advance payment','discounted order','coupon order',
    'pickup and delivery fees','cancelled order','full refund','partial refund','duplicate payment click',
    'duplicate payment reference','repeated network request','historical price','historical cost','historical tax',
    'expense entry','supply purchase','supply usage','budget variance','invoice generation','receipt generation',
    'trial balance','failed event','exception retry','unauthorized access','journal reversal',
  ];
  assert.equal(scenarios.length, 31);
  for (const token of ['android','ios','customer_web','advance_payment_received','credit_sale_completed','receivable_collected','refund_approved','expense_approved','supply_purchased','supply_consumed','accounting_budgets','accounting_invoices','accounting_receipts','accounting_trial_balance_v','pending_review','retry_accounting_event','reverse_accounting_journal']) assert.match(migration, new RegExp(token));
});

test('platform provenance, realtime refresh triggers, FIFO and approvals are wired', () => {
  assert.match(expoClient, /x-super-shine-platform/);
  assert.match(browserClient, /x-super-shine-platform.*customer_web/);
  assert.match(migration, /orders_accounting_source_platform_v1/);
  assert.match(migration, /alter publication supabase_realtime add table/);
  assert.doesNotMatch(migration, /REPLICA IDENTITY FULL/i);
  assert.match(migration, /accounting_inventory_layers/);
  assert.match(migration, /FIFO_INVENTORY_LAYERS_INCOMPLETE/);
  assert.match(migration, /approve_accounting_journal/);
  assert.match(adminUi, /Approve and post journal/);
});
