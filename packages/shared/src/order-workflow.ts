import type { CollectionMethod, OrderStatus, ReturnMethod } from './types';

const COLLECTION: Record<CollectionMethod, OrderStatus[]> = {
  home_pickup: ['pickup_in_progress', 'picked_up'],
  store_dropoff: ['awaiting_dropoff', 'received_at_store'],
};
const RETURN: Record<ReturnMethod, OrderStatus[]> = {
  home_delivery: ['ready', 'out_for_delivery', 'delivered'],
  store_collection: ['ready_for_collection', 'collected'],
};

export const CUSTOMER_ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Order placed', accepted: 'Order confirmed',
  pickup_in_progress: 'We’re coming to pick up your laundry', picked_up: 'Laundry picked up',
  awaiting_dropoff: 'Waiting for your laundry', received_at_store: 'Laundry received',
  processing: 'Cleaning your laundry', ready: 'Laundry ready', ready_for_collection: 'Ready for collection',
  out_for_delivery: 'On the way to you', delivered: 'Delivered', collected: 'Collected', cancelled: 'Cancelled',
};
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending', accepted: 'Accepted', pickup_in_progress: 'Pickup in progress', picked_up: 'Picked up',
  awaiting_dropoff: 'Awaiting drop-off', received_at_store: 'Received at store', processing: 'Processing',
  ready: 'Ready', ready_for_collection: 'Ready for collection', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', collected: 'Collected', cancelled: 'Cancelled',
};
export const COLLECTION_METHOD_LABELS: Record<CollectionMethod, string> = { home_pickup: 'Home Pickup', store_dropoff: 'Store Drop-off' };
export const RETURN_METHOD_LABELS: Record<ReturnMethod, string> = { home_delivery: 'Home Delivery', store_collection: 'Store Collection' };

export function orderWorkflow(collectionMethod: CollectionMethod, returnMethod: ReturnMethod): OrderStatus[] {
  return ['pending', 'accepted', ...COLLECTION[collectionMethod], 'processing', ...RETURN[returnMethod]];
}
export function orderProgress(status: OrderStatus, collectionMethod: CollectionMethod, returnMethod: ReturnMethod) {
  if (status === 'cancelled') return 0;
  const workflow = orderWorkflow(collectionMethod, returnMethod); const index = workflow.indexOf(status);
  return index < 0 ? 0 : Math.round(((index + 1) / workflow.length) * 100);
}
export function normalizeCollectionMethod(value: unknown): CollectionMethod { return value === 'store_dropoff' ? 'store_dropoff' : 'home_pickup'; }
export function normalizeReturnMethod(value: unknown): ReturnMethod { return value === 'store_collection' ? 'store_collection' : 'home_delivery'; }
export function normalizeOrderStatus(value: unknown, returnMethod: ReturnMethod = 'home_delivery'): OrderStatus {
  const raw = String(value || 'pending');
  if (raw in ORDER_STATUS_LABELS) return raw as OrderStatus;
  const legacy: Record<string, OrderStatus> = {
    requested: 'pending', payment_verification_required: 'pending', pickup_confirmed: 'accepted', picked_up: 'picked_up',
    received: 'processing', waiting_price_approval: 'processing', cleaning: 'processing',
    quality_check: returnMethod === 'store_collection' ? 'ready_for_collection' : 'ready', out_for_delivery: 'out_for_delivery',
    delivered: returnMethod === 'store_collection' ? 'collected' : 'delivered', completed: returnMethod === 'store_collection' ? 'collected' : 'delivered',
    on_hold: 'processing', rejected: 'cancelled', withdrawn: 'cancelled',
  };
  return legacy[raw] || 'pending';
}
export function customerStatusDetail(status: OrderStatus) {
  if (status === 'awaiting_dropoff') return 'Bring your laundry to Super Shine when you’re ready.';
  if (status === 'ready_for_collection') return 'Your clean laundry is ready at Super Shine.';
  if (status === 'pickup_in_progress') return 'Our team is travelling to your pickup address.';
  if (status === 'out_for_delivery') return 'Your clean laundry is on its way.';
  return 'Super Shine will notify you when your order moves to the next stage.';
}

