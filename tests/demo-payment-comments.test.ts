import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contextSource = readFileSync('src/context/app-context.tsx', 'utf8');
const adminOrdersSource = readFileSync('src/app/admin/orders.tsx', 'utf8');
const adminHookSource = readFileSync('src/admin/use-admin-orders.ts', 'utf8');
const adminDetailSource = readFileSync('src/app/admin/order/[id].tsx', 'utf8');
const trackingSource = readFileSync('src/app/order-tracking.tsx', 'utf8');
const checkoutSource = readFileSync('src/app/new-order.tsx', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20260722_demo_orders_payments_comments.sql', 'utf8');
const hotfixMigrationSource = readFileSync('supabase/migrations/20260723_admin_conversation_payment_hotfix.sql', 'utf8');
const demoCompatibilityMigrationSource = readFileSync('supabase/migrations/20260723_demo_profile_schema_compatibility.sql', 'utf8');
const fulfillmentMigrationSource = readFileSync('supabase/migrations/20260810_shared_fulfillment_workflow.sql', 'utf8');
const driverWorkflowMigrationSource = readFileSync('supabase/migrations/20260910_driver_employee_workflow.sql', 'utf8');

test('new demo orders are local, require no Auth, and remain isolated from real placement', () => {
  assert.doesNotMatch(contextSource, /signInAnonymously/);
  assert.match(contextSource, /DEMO_ORDERS_KEY/);
  assert.doesNotMatch(contextSource, /rpc\('place_demo_order_v17'/);
  assert.match(contextSource, /rpc\('place_order_v20',[\s\S]*p_collection_method:[\s\S]*p_return_method:/);
  assert.match(migrationSource, /does not call place_order_v11/);
  assert.match(migrationSource, /payment_status, coupon_code, coupon_code_snapshot/);
  assert.doesNotMatch(migrationSource, /insert into public\.coupon_usage/);
  assert.doesNotMatch(migrationSource, /booked_count\s*=\s*booked_count\s*\+/);
});

test('admin Demo Orders is separate and receives all related realtime records', () => {
  assert.match(adminOrdersSource, /view === 'demo'\) return order\.isDemo/);
  assert.match(adminOrdersSource, /view === 'all' && order\.isDemo/);
  for (const table of ['orders', 'order_items', 'order_status_history', 'payments', 'uploaded_files', 'support_messages']) {
    assert.match(adminHookSource, new RegExp(`table: '${table}'`));
  }
  assert.match(adminHookSource, /admin-operations-v17/);
  assert.match(adminDetailSource, /admin-order-conversation:\$\{id\}/);
  assert.match(adminDetailSource, /event: 'INSERT'[\s\S]*table: 'support_messages'/);
  assert.match(adminDetailSource, /event: 'UPDATE'[\s\S]*table: 'support_messages'/);
  assert.match(adminDetailSource, /visibilitychange/);
});

test('payment follows final price, approval, submission, and admin verification', () => {
  assert.match(migrationSource, /normalize_initial_payment_v17/);
  assert.match(migrationSource, /admin_set_final_price_v17/);
  assert.match(migrationSource, /respond_to_price_v17/);
  assert.match(migrationSource, /register_order_upload_v17/);
  assert.match(migrationSource, /admin_update_payment_v17/);
  assert.match(migrationSource, /order_row\.final_total is null/);
  assert.match(migrationSource, /order_row\.price_approval_status not in \('approved', 'not_required'\)/);
  assert.match(hotfixMigrationSource, /admin_set_final_price_v18/);
  assert.match(hotfixMigrationSource, /admin_handoff_order_v18/);
  assert.match(hotfixMigrationSource, /PAYMENT_REQUIRED_FOR_COMPLETION/);
  assert.match(hotfixMigrationSource, /outstanding_since/);
  assert.match(adminDetailSource, /Confirm collection and cash received/);
  assert.match(adminDetailSource, /assigned driver confirms delivery/i);
  assert.match(adminDetailSource, /AdminDriverTaskCard/);
  assert.match(adminDetailSource, /Mark collected, payment outstanding/);
  assert.doesNotMatch(driverWorkflowMigrationSource, /payment_status='paid'/);
  assert.doesNotMatch(driverWorkflowMigrationSource, /update public\.payments/);
  assert.match(adminDetailSource, /Record payment received/);
  assert.match(adminDetailSource, /Final price cannot be changed at the current order stage/);
  assert.match(trackingSource, /Cash due at collection\./);
  assert.match(trackingSource, /Waiting for confirmation/);
  assert.match(trackingSource, /payment slip \(fallback\)/);
  assert.match(trackingSource, /No real transfer is made/);
  const priorityPayment = trackingSource.indexOf("order.paymentMethod === 'promptpay' && finalPriceReady");
  const journey = trackingSource.indexOf('<Card style={styles.workflowCard}>');
  assert.ok(priorityPayment >= 0 && priorityPayment < journey, 'actionable payment must appear above the laundry journey');
  assert.match(trackingSource, /styles\.priorityCard/);
  assert.doesNotMatch(checkoutSource, /remainingFreePickups=|Free pickup applied/);
  assert.doesNotMatch(checkoutSource, /p\.t\(`payment\.\$\{/);
  assert.match(checkoutSource, /p\.t\(`paymentMethod\.\$\{/);
  assert.match(fulfillmentMigrationSource, /admin_handoff_order_v18/);
  assert.match(fulfillmentMigrationSource, /next_status:='collected'/);
});

test('checkout note and later order conversation remain separate and bounded', () => {
  assert.match(checkoutSource, /ORDER_NOTE_MAX_LENGTH = 1000/);
  assert.match(checkoutSource, /Customer order note/);
  assert.match(contextSource, /sendOrderMessage/);
  assert.match(contextSource, /messageSubmissionRef/);
  assert.match(trackingSource, /order\.messages\.map/);
  assert.match(adminDetailSource, /Customer order note/);
  assert.match(adminDetailSource, /Customer conversation/);
  assert.match(migrationSource, /support_insert_customer_or_admin/);
  assert.match(migrationSource, /orders_customer_comment_length_v17/);
});

test('demo RLS binds anonymous sessions to only their demo records', () => {
  assert.match(migrationSource, /auth\.jwt\(\) ->> 'is_anonymous'/);
  assert.match(migrationSource, /user_id = auth\.uid\(\)[\s\S]*is_demo/);
  assert.match(migrationSource, /orders_demo_identity_boundary_v17/);
  assert.match(migrationSource, /DEMO_FILE_UPLOAD_DISABLED/);
  assert.match(migrationSource, /customers_upload_own_order_files/);
  assert.match(demoCompatibilityMigrationSource, /auth\.jwt\(\) ->> 'is_anonymous'/);
  assert.match(demoCompatibilityMigrationSource, /new\.id is distinct from auth\.uid\(\)/);
  assert.match(demoCompatibilityMigrationSource, /to_jsonb\(new\) \? 'normalized_phone'/);
  assert.match(demoCompatibilityMigrationSource, /to_jsonb\(new\) \? 'phone_verified_at'/);
});
