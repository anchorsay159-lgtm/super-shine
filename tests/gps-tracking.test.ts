import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260908150000_live_order_gps_tracking.sql', 'utf8');
const distanceMigration = readFileSync('supabase/migrations/20260908170000_gps_distance_arrival_notifications.sql', 'utf8');
const ownershipMigration = readFileSync('supabase/migrations/20260908180000_staff_owned_live_tracking.sql', 'utf8');
const driverWorkflowMigration = readFileSync('supabase/migrations/20260910_driver_employee_workflow.sql', 'utf8');
const customerCard = readFileSync('src/components/customer-order-gps-card.tsx', 'utf8');
const staffCard = readFileSync('src/components/admin-order-gps-card.web.tsx', 'utf8');
const driverTracking = readFileSync('src/hooks/use-driver-task-tracking.web.ts', 'utf8');
const driverTask = readFileSync('src/app/driver/task/[id].tsx', 'utf8');
const routeHook = readFileSync('src/hooks/use-driving-route.ts', 'utf8');
const webMap = readFileSync('src/components/live-location-map.web.tsx', 'utf8');
const lineCore = readFileSync('supabase/functions/_shared/line-core.ts', 'utf8');
const customerOrder = readFileSync('src/app/order-tracking.tsx', 'utf8');
const adminOrder = readFileSync('src/app/admin/order/[id].tsx', 'utf8');

test('live locations are private to the order customer and authorized staff', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /o\.user_id = auth\.uid\(\)/);
  assert.match(migration, /public\.is_admin\(\)/);
  assert.match(migration, /o\.assigned_driver_id = auth\.uid\(\)/);
  assert.match(migration, /revoke insert, update, delete .* from anon, authenticated/i);
});

test('GPS updates are realtime and retain only the latest order position', () => {
  assert.match(migration, /order_id uuid primary key/);
  assert.match(migration, /on conflict \(order_id\) do update/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.order_live_locations/i);
  assert.match(customerCard, /useOrderLiveLocation/);
  assert.match(customerCard, /map will appear automatically when the driver starts the trip/);
  assert.match(customerCard, /loading \|\| !activeLocation/);
  assert.doesNotMatch(customerCard, /\['accepted', 'pickup_in_progress'\]/);
  assert.doesNotMatch(customerCard, /\['ready', 'out_for_delivery'\]/);
  assert.match(customerOrder, /CustomerOrderGpsCard/);
});

test('assigned driver foreground sharing uses the browser watch position API', () => {
  assert.match(driverTracking, /navigator\.geolocation\.watchPosition/);
  assert.match(driverTracking, /driver_start_task_v1/);
  assert.match(driverTracking, /driver_update_task_location_v1/);
  assert.match(driverWorkflowMigration, /driver_id=auth\.uid\(\)/);
  assert.match(adminOrder, /AdminDriverTaskCard/);
});

test('one driver action advances the trip and starts task-scoped live tracking', () => {
  assert.match(customerCard, /captureLocation\(\)/);
  assert.match(customerCard, /autoSharePhase/);
  assert.match(driverTask, /Start \$\{task\.taskType\} & live GPS/);
  assert.match(driverTracking, /await send\(position,true\)/);
  assert.match(driverWorkflowMigration, /task_status='en_route'/);
  assert.match(driverWorkflowMigration, /pickup_in_progress/);
  assert.match(driverWorkflowMigration, /out_for_delivery/);
  assert.match(driverTracking, /driver_stop_task_tracking_v1/);
  assert.match(ownershipMigration, /assigned_driver_id = auth\.uid\(\)/);
  assert.match(ownershipMigration, /driver_id = auth\.uid\(\)/);
  assert.match(ownershipMigration, /TRACKING_DEVICE_NOT_OWNER/);
});

test('driver task tracking can pause and safely resume after reopening or reassignment', () => {
  assert.match(driverWorkflowMigration, /driver_stop_task_tracking_v1/);
  assert.match(driverWorkflowMigration, /task_status in \('en_route','arrived'\)/);
  assert.match(driverWorkflowMigration, /v_order\.status not in \('accepted','pickup_in_progress'\)/);
  assert.match(driverWorkflowMigration, /v_order\.status not in \('ready','out_for_delivery'\)/);
  assert.match(driverTask, /Live GPS resumed on this phone/);
});

test('customer and staff maps use a routed road polyline with distance and ETA', () => {
  assert.match(routeHook, /route\/v1\/driving/);
  assert.match(routeHook, /geometries=geojson/);
  assert.match(routeHook, /distanceMeters/);
  assert.match(routeHook, /durationSeconds/);
  assert.match(webMap, /leaflet\.polyline/);
  assert.doesNotMatch(webMap, /routeLine/);
  assert.match(customerCard, /Estimated arrival in/);
  assert.match(driverTask, /formatEta/);
  assert.match(driverTask, /useDrivingRoute/);
});

test('customer location and arrival notifications are secured and deduplicated', () => {
  assert.match(distanceMigration, /customer_set_order_location_v1/);
  assert.match(distanceMigration, /user_id = auth\.uid\(\)/);
  assert.match(distanceMigration, /pickup_latitude/);
  assert.match(distanceMigration, /delivery_latitude/);
  assert.match(distanceMigration, /6371000/);
  assert.match(distanceMigration, /v_distance_meters > 1000/);
  assert.match(distanceMigration, /driver-arriving:/);
  assert.match(distanceMigration, /on conflict \(user_id, order_id, source_event_key\)/i);
  assert.match(customerCard, /customer_set_order_location_v1/);
  assert.match(customerCard, /Driver is about/);
  assert.match(driverTask, /Customer stop/);
  assert.match(lineCore, /driver_arriving/);
});
