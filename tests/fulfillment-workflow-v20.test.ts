import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CUSTOMER_STATUS_LABELS,
  validNextStatuses,
  workflowStatuses,
} from '../src/lib/order-workflow.ts';
import type { CollectionMethod, OrderStatus, ReturnMethod } from '../src/types/domain.ts';

const cases: Array<{
  name: string;
  collection: CollectionMethod;
  returns: ReturnMethod;
  expected: OrderStatus[];
}> = [
  {
    name: 'home pickup and home delivery',
    collection: 'home_pickup',
    returns: 'home_delivery',
    expected: ['pending', 'accepted', 'pickup_in_progress', 'picked_up', 'processing', 'ready', 'out_for_delivery', 'delivered'],
  },
  {
    name: 'home pickup and store collection',
    collection: 'home_pickup',
    returns: 'store_collection',
    expected: ['pending', 'accepted', 'pickup_in_progress', 'picked_up', 'processing', 'ready_for_collection', 'collected'],
  },
  {
    name: 'store drop-off and home delivery',
    collection: 'store_dropoff',
    returns: 'home_delivery',
    expected: ['pending', 'accepted', 'awaiting_dropoff', 'received_at_store', 'processing', 'ready', 'out_for_delivery', 'delivered'],
  },
  {
    name: 'store drop-off and store collection',
    collection: 'store_dropoff',
    returns: 'store_collection',
    expected: ['pending', 'accepted', 'awaiting_dropoff', 'received_at_store', 'processing', 'ready_for_collection', 'collected'],
  },
];

for (const scenario of cases) {
  test(`${scenario.name} follows only its valid operational path`, () => {
    assert.deepEqual(workflowStatuses(scenario.collection, scenario.returns), scenario.expected);
    scenario.expected.slice(0, -1).forEach((status, index) => {
      assert.deepEqual(validNextStatuses(status, scenario.collection, scenario.returns), [scenario.expected[index + 1]]);
    });
    assert.deepEqual(validNextStatuses(scenario.expected.at(-1)!, scenario.collection, scenario.returns), []);
  });
}

test('customer labels hide backend terminology', () => {
  assert.equal(CUSTOMER_STATUS_LABELS.processing, 'Cleaning your laundry');
  assert.equal(CUSTOMER_STATUS_LABELS.awaiting_dropoff, 'Waiting for your laundry');
  assert.equal(CUSTOMER_STATUS_LABELS.ready_for_collection, 'Ready for collection');
  assert.equal(CUSTOMER_STATUS_LABELS.out_for_delivery, 'On the way to you');
});

test('migration keeps fulfillment, pricing, payment, and accounting concerns separate', () => {
  const sql = readFileSync('supabase/migrations/20260810_shared_fulfillment_workflow.sql', 'utf8');
  assert.match(sql, /collection_method text/);
  assert.match(sql, /return_method text/);
  assert.match(sql, /pricing_status text/);
  assert.match(sql, /admin_update_order_status_v20/);
  assert.match(sql, /new\.payment_status not in \('paid','refunded'\)/);
  assert.match(sql, /new\.status in \('delivered','collected'\)/);
  assert.match(sql, /if new\.is_demo then return new; end if;/);
  assert.doesNotMatch(sql, /customer_status|admin_status/);
});
