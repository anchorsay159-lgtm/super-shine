import type { OrderStatus, PaymentStatus } from '@/types/domain';
import {
  ADMIN_STATUS_LABELS, validNextStatuses as workflowNextStatuses,
} from '@/lib/order-workflow';

export const ORDER_SELECT = '*, profiles:user_id(full_name,email,phone), order_items(*), order_status_history(*), payments(*), support_messages(*)';

export type StatusTone = 'amber' | 'blue' | 'green' | 'teal' | 'coral' | 'gray';

export const ORDER_STATUS_CONFIG: Record<OrderStatus, {
  label: string;
  shortLabel: string;
  tone: StatusTone;
}> = {
  pending: { label: 'Pending', shortLabel: 'Pending', tone: 'amber' },
  accepted: { label: 'Accepted', shortLabel: 'Accepted', tone: 'blue' },
  pickup_in_progress: { label: 'Pickup in progress', shortLabel: 'Pickup started', tone: 'blue' },
  picked_up: { label: 'Picked up', shortLabel: 'Picked up', tone: 'blue' },
  awaiting_dropoff: { label: 'Awaiting store drop-off', shortLabel: 'Awaiting drop-off', tone: 'amber' },
  received_at_store: { label: 'Received at store', shortLabel: 'Received', tone: 'teal' },
  processing: { label: 'Processing', shortLabel: 'Processing', tone: 'teal' },
  ready: { label: 'Ready for delivery', shortLabel: 'Ready', tone: 'teal' },
  ready_for_collection: { label: 'Ready for collection', shortLabel: 'Ready to collect', tone: 'teal' },
  out_for_delivery: { label: 'Out for delivery', shortLabel: 'Out for delivery', tone: 'blue' },
  delivered: { label: 'Delivered', shortLabel: 'Delivered', tone: 'green' },
  collected: { label: 'Collected', shortLabel: 'Collected', tone: 'green' },
  cancelled: { label: 'Cancelled', shortLabel: 'Cancelled', tone: 'gray' },
};

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; tone: StatusTone }> = {
  unpaid: { label: 'Unpaid', tone: 'amber' },
  pending: { label: 'Pending', tone: 'gray' },
  paid: { label: 'Paid', tone: 'green' },
  partially_paid: { label: 'Partially Paid', tone: 'amber' },
  failed: { label: 'Failed', tone: 'coral' },
  expired: { label: 'Expired', tone: 'gray' },
  refunded: { label: 'Refunded', tone: 'gray' },
};

export const PIPELINE_STATUSES: OrderStatus[] = [
  'pending', 'accepted', 'pickup_in_progress', 'picked_up', 'awaiting_dropoff',
  'received_at_store', 'processing', 'ready', 'ready_for_collection',
  'out_for_delivery', 'delivered', 'collected',
];

export type OperationalGroupId = 'new' | 'pickup' | 'processing' | 'delivery' | 'completed';

export const OPERATIONAL_GROUPS: {
  id: OperationalGroupId;
  label: string;
  statuses: OrderStatus[];
}[] = [
  { id: 'new', label: 'New', statuses: ['pending', 'accepted'] },
  { id: 'pickup', label: 'Intake', statuses: ['pickup_in_progress', 'picked_up', 'awaiting_dropoff', 'received_at_store'] },
  { id: 'processing', label: 'Processing', statuses: ['processing', 'ready', 'ready_for_collection'] },
  { id: 'delivery', label: 'Delivery', statuses: ['out_for_delivery'] },
  { id: 'completed', label: 'Completed', statuses: ['delivered', 'collected', 'cancelled'] },
];

type WorkflowOrder = Pick<import('@/types/domain').CustomerOrder, 'status' | 'collectionMethod' | 'returnMethod'>;

export function validNextStatuses(order: WorkflowOrder) {
  return workflowNextStatuses(order.status, order.collectionMethod, order.returnMethod);
}

export function primaryNextStatus(order: WorkflowOrder) {
  return validNextStatuses(order)[0] ?? null;
}

export function statusLabel(status: OrderStatus) {
  return ADMIN_STATUS_LABELS[status];
}

export function paymentLabel(status: PaymentStatus) {
  return PAYMENT_STATUS_CONFIG[status].label;
}

export function isPaidStatus(status: PaymentStatus) {
  return status === 'paid';
}

export function isClosedStatus(status: OrderStatus) {
  return ['delivered', 'collected', 'cancelled'].includes(status);
}

export function orderWaitingMs(updatedAt: string) {
  return Math.max(0, Date.now() - new Date(updatedAt).getTime());
}

export function waitingLabel(updatedAt: string) {
  const minutes = Math.floor(orderWaitingMs(updatedAt) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function isOverdue(updatedAt: string, status: OrderStatus) {
  if (isClosedStatus(status)) return false;
  const thresholdHours = status === 'pending' ? 2 : 24;
  return orderWaitingMs(updatedAt) > thresholdHours * 3600000;
}

const PREFERENCE_LABELS: Record<string, string> = {
  water_temperature: 'Water temperature', waterTemperature: 'Water temperature', temperature: 'Water temperature',
  warm_wash: 'Warm wash', warmWash: 'Warm wash', detergent: 'Detergent',
  standard_detergent: 'Standard detergent', standardDetergent: 'Standard detergent',
  fragrance_free: 'Fragrance free', fragranceFree: 'Fragrance free', fabric_softener: 'Fabric softener',
  fabricSoftener: 'Fabric softener', hangers_required: 'Hangers required', hangersRequired: 'Hangers required',
  no_folding: 'No folding', noFolding: 'No folding', special_handling: 'Special handling instructions',
  specialHandling: 'Special handling instructions', folding: 'Folding', scent: 'Scent',
};

function humanize(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function readablePreferences(preferences: Record<string, unknown>) {
  return Object.entries(preferences || {}).flatMap(([key, value]) => {
    if (value === false || value == null || value === '') return [];
    const label = PREFERENCE_LABELS[key] || humanize(key);
    if (value === true) return [label];
    if (Array.isArray(value)) return [`${label}: ${value.map(String).join(', ')}`];
    if (typeof value === 'object') return Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== false && nested != null && nested !== '')
      .map(([nestedKey, nested]) => `${PREFERENCE_LABELS[nestedKey] || humanize(nestedKey)}${nested === true ? '' : `: ${String(nested)}`}`);
    return [`${label}: ${humanize(String(value))}`];
  });
}
