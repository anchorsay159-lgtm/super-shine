export type DriverTaskType = 'pickup' | 'delivery';
export type DriverTaskStatus =
  | 'unassigned'
  | 'assigned'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type DriverTaskIssue = {
  id: string;
  reason: string;
  notes: string;
  createdAt: string;
};

export type DriverTask = {
  id: string;
  orderId: string;
  orderNumber: string;
  driverId: string | null;
  driverName: string;
  taskType: DriverTaskType;
  taskStatus: DriverTaskStatus;
  scheduledFor: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  customerName: string;
  customerPhone: string;
  address: string;
  instructions: string;
  itemSummary: string;
  latitude: number | null;
  longitude: number | null;
  verificationCode: string | null;
  openIssue: DriverTaskIssue | null;
  updatedAt: string;
};

export type DriverSummary = {
  id: string;
  name: string;
  email: string;
  phone: string;
  activeTaskCount: number;
};

export type DriverIssueSummary = DriverTaskIssue & {
  taskId: string;
  orderId: string;
  orderNumber: string;
  driverId: string;
  driverName: string;
  status: 'open' | 'resolved';
};

export function mapDriverTask(value: Record<string, unknown>): DriverTask {
  const issue = value.openIssue as Record<string, unknown> | null | undefined;
  return {
    id: String(value.id), orderId: String(value.orderId), orderNumber: String(value.orderNumber || ''),
    driverId: value.driverId == null ? null : String(value.driverId), driverName: String(value.driverName || ''),
    taskType: value.taskType as DriverTaskType, taskStatus: value.taskStatus as DriverTaskStatus,
    scheduledFor: value.scheduledFor == null ? null : String(value.scheduledFor),
    assignedAt: value.assignedAt == null ? null : String(value.assignedAt),
    acceptedAt: value.acceptedAt == null ? null : String(value.acceptedAt),
    startedAt: value.startedAt == null ? null : String(value.startedAt),
    arrivedAt: value.arrivedAt == null ? null : String(value.arrivedAt),
    completedAt: value.completedAt == null ? null : String(value.completedAt),
    customerName: String(value.customerName || 'Customer'), customerPhone: String(value.customerPhone || ''),
    address: String(value.address || ''), instructions: String(value.instructions || ''),
    itemSummary: String(value.itemSummary || ''),
    latitude: value.latitude == null ? null : Number(value.latitude), longitude: value.longitude == null ? null : Number(value.longitude),
    verificationCode: value.verificationCode == null ? null : String(value.verificationCode),
    openIssue: issue ? { id: String(issue.id), reason: String(issue.reason || ''), notes: String(issue.notes || ''), createdAt: String(issue.createdAt || '') } : null,
    updatedAt: String(value.updatedAt || ''),
  };
}

