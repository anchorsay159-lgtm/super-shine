import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration=readFileSync('supabase/migrations/20260910_driver_employee_workflow.sql','utf8');
const driverHome=readFileSync('src/app/driver/index.tsx','utf8');
const driverTask=readFileSync('src/app/driver/task/[id].tsx','utf8');
const adminDrivers=readFileSync('src/app/admin/drivers.tsx','utf8');
const adminOrder=readFileSync('src/app/admin/order/[id].tsx','utf8');
const customerTracking=readFileSync('src/app/order-tracking.tsx','utf8');
const customerWebTracking=readFileSync('apps/customer-web/src/components/driver-trip-panel.tsx','utf8');
const adminOrders=readFileSync('src/app/admin/orders.tsx','utf8');
const auth=readFileSync('src/app/auth.tsx','utf8');
const tabs=readFileSync('src/app/(tabs)/_layout.tsx','utf8');
const driverRoleHotfix=readFileSync('supabase/migrations/20260911120000_driver_profile_role_hotfix.sql','utf8');
const createDriverFunction=readFileSync('supabase/functions/admin-create-driver/index.ts','utf8');
const driverOperationsHook=readFileSync('src/admin/use-driver-operations.ts','utf8');
const rootLayout=readFileSync('src/app/_layout.tsx','utf8');

test('driver tasks are separate, idempotent order legs',()=>{
  assert.match(migration,/create table if not exists public\.driver_tasks/);
  assert.match(migration,/constraint driver_tasks_order_leg_unique unique \(order_id, task_type\)/);
  assert.match(migration,/on conflict \(order_id, task_type\) do nothing/);
  assert.match(migration,/orders_sync_driver_tasks_v1/);
  assert.match(migration,/collection_method = 'home_pickup'/);
  assert.match(migration,/return_method = 'home_delivery'/);
});

test('driver actions own routine trip transitions and live GPS',()=>{
  assert.match(migration,/driver_start_task_v1/);
  assert.match(migration,/pickup_in_progress/);
  assert.match(migration,/out_for_delivery/);
  assert.match(migration,/driver_arrive_task_v1/);
  assert.match(migration,/driver_complete_task_v1/);
  assert.match(migration,/task_id=p_task_id and order_id=v_order_id and driver_id=auth\.uid\(\)/);
  assert.match(driverTask,/Start .*live GPS/);
  assert.match(driverTask,/I’ve arrived/);
  assert.match(driverTask,/Confirm \$\{task\.taskType\}/);
  assert.match(driverTask,/Unable to complete/);
});

test('verification code and permissions are least privilege',()=>{
  assert.match(migration,/driver_task_verifications_customer_admin_read_v1/);
  assert.match(migration,/Drivers can submit a code/);
  assert.match(migration,/revoke insert, update, delete on public\.driver_tasks from anon, authenticated/);
  assert.match(migration,/if not public\.is_driver\(\)/);
  assert.match(migration,/if not public\.is_admin\(\)/);
  assert.match(migration,/protect_profile_role_v1/);
  assert.match(migration,/profiles_protect_role_insert_v1/);
  assert.match(migration,/new\.role := 'customer'/);
  assert.match(migration,/<> 'service_role'/);
  assert.match(migration,/ROLE_CHANGE_FORBIDDEN/);
  assert.match(migration,/INVALID_VERIFICATION_CODE/);
  assert.match(migration,/verification_failed/);
  assert.match(migration,/CODE_TEMPORARILY_LOCKED/);
});

test('admin dispatch and customer tracking extend existing screens',()=>{
  assert.match(adminDrivers,/Dispatch queue/);
  assert.match(adminDrivers,/admin_assign_driver_task_v1/);
  assert.match(adminOrder,/AdminDriverTaskCard/);
  assert.match(customerTracking,/CustomerDriverTaskCard/);
  assert.match(customerWebTracking,/customer_order_driver_tasks_v1/);
  assert.match(customerWebTracking,/order_live_locations/);
  assert.match(customerWebTracking,/postgres_changes/);
  assert.match(driverHome,/driver_tasks_list_v1|useDriverTasks/);
});

test('role routing keeps drivers out of customer and admin areas',()=>{
  assert.match(auth,/profile\.role === 'driver'/);
  assert.match(tabs,/profile\.role === 'driver'/);
  assert.match(migration,/role='driver'/);
});

test('audit, issue and realtime records are first class',()=>{
  assert.match(migration,/create table if not exists public\.driver_task_events/);
  assert.match(migration,/create table if not exists public\.driver_task_issues/);
  assert.match(migration,/admin_resolve_driver_issue_v1/);
  assert.match(migration,/admin_complete_driver_task_v1/);
  assert.match(migration,/admin_override_completed/);
  assert.match(migration,/alter publication supabase_realtime add table public\.driver_tasks/);
  assert.match(migration,/source_event_key/);
});

test('admin supervises transport work instead of reproducing driver actions',()=>{
  assert.match(adminOrders,/require the assigned driver to record this transport action/);
  assert.match(adminOrders,/order\.status === 'pickup_in_progress' && next === 'picked_up'/);
  assert.match(adminOrders,/order\.status === 'out_for_delivery' && next === 'delivered'/);
  assert.match(migration,/guard_driver_owned_order_transition_v1/);
  assert.match(migration,/DRIVER_TASK_ACTION_REQUIRED/);
  assert.match(migration,/app\.driver_admin_override/);
});

test('driver schedule cancellation and reassignment events notify employees',()=>{
  assert.match(migration,/driver_task_schedule_changed/);
  assert.match(migration,/driver_task_cancelled/);
  assert.match(migration,/driver_task_reassigned/);
  assert.match(migration,/update of status, pickup_date, pickup_start, delivery_eta/);
  assert.match(migration,/p_history then t\.task_status in \('completed','cancelled'\)/);
  assert.match(migration,/else t\.task_status in \('assigned','accepted','en_route','arrived','failed'\)/);
});

test('driver account provisioning supports the deployed profile role constraint',()=>{
  assert.match(driverRoleHotfix,/attribute_row\.attname = 'role'/);
  assert.match(driverRoleHotfix,/check \(role in \('customer', 'admin', 'driver'\)\)/);
  assert.match(createDriverFunction,/EMAIL_ALREADY_REGISTERED/);
  assert.match(createDriverFunction,/DRIVER_PROFILE_CREATE_FAILED/);
  assert.match(createDriverFunction,/ADMIN_SESSION_MISSING/);
  assert.match(createDriverFunction,/ADMIN_SESSION_INVALID/);
  assert.match(createDriverFunction,/ADMIN_ROLE_REQUIRED/);
  assert.match(adminDrivers,/supabase\.auth\.getSession\(\)/);
  assert.match(adminDrivers,/supabase\.auth\.refreshSession\(\)/);
  assert.match(adminDrivers,/Authorization:`Bearer \$\{session\.access_token\}`/);
});

test('admin driver failures render recoverable UI instead of a blank screen',()=>{
  assert.match(driverOperationsHook,/Array\.isArray/);
  assert.match(driverOperationsHook,/catch\(loadError\)/);
  assert.match(driverOperationsHook,/\+\+driverOperationsChannelSequence/);
  assert.match(driverOperationsHook,/removeChannel\(channel\)/);
  assert.match(rootLayout,/export function ErrorBoundary/);
  assert.match(adminDrivers,/driverCreationErrorMessage/);
});

test('a single available driver can be assigned without a hidden selection step',()=>{
  assert.match(adminDrivers,/drivers\.length===1\?drivers\[0\]\.id/);
  assert.match(adminDrivers,/accessibilityState=\{\{selected\}\}/);
  assert.match(adminDrivers,/Assign \$\{drivers\[0\]\.name/);
  assert.match(adminDrivers,/catch\(assignError\)/);
});
