export type LanguageCode = 'en' | 'th' | 'my' | 'bn' | 'dz';
export type UserRole = 'customer' | 'admin' | 'driver';
export type PaymentMethod = 'cash_pickup' | 'cash_delivery' | 'promptpay';
export type PaymentStatus = 'pending' | 'waiting_verification' | 'verified' | 'rejected' | 'paid' | 'outstanding' | 'refunded';
export type PriceApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';
export type OrderStatus =
  | 'requested' | 'pickup_confirmed' | 'picked_up' | 'received' | 'cleaning'
  | 'quality_check' | 'out_for_delivery' | 'delivered' | 'completed'
  | 'waiting_price_approval' | 'payment_verification_required' | 'on_hold'
  | 'rejected' | 'withdrawn';

export type ServiceOption = {
  id: string; serviceId: string; optionKey: string; labelKey: string;
  inputType: 'select' | 'boolean' | 'text' | 'photo'; choices: string[];
  required: boolean; sortOrder: number;
};

export type LaundryService = {
  id: string; name: string; nameKey: string; description: string; descriptionKey: string;
  price: number; priceUnit: string; pricingType: 'fixed' | 'estimated';
  turnaroundHours: number; icon: string; enabled: boolean; sortOrder: number;
  options: ServiceOption[];
};

export type Coupon = {
  code: string; title: string; description: string;
  discountTarget: 'service' | 'pickup_fee' | 'delivery_fee' | 'pickup_and_delivery';
  discountType: 'percentage' | 'fixed_amount' | 'free'; discountValue: number;
  maxDiscount?: number | null; minimumOrder: number; startsAt?: string | null;
  expiresAt?: string | null; perCustomerLimit?: number | null; totalUsageLimit?: number | null;
  usageCount: number; serviceId?: string | null; eligibleServiceIds: string[];
  requiresVerifiedPhone: boolean; firstVerifiedProfileOnly: boolean; active: boolean;
};

export type PickupSlot = {
  id: string; date: string; startTime: string; endTime: string;
  capacity: number; bookedCount: number; enabled: boolean;
};

export type BusinessSettings = {
  storeName: string; timezone: string; currency: string; openTime: string; closeTime: string;
  manualStatus: 'automatic' | 'open' | 'closed'; pickupFee: number; deliveryFee: number;
  promptPayQrPath?: string | null; businessPhone: string; lineUrl: string;
  serviceAreas: string[]; appVersion: string;
};

export type Profile = {
  id: string; name: string; email: string; phone: string; role: UserRole;
  language: LanguageCode; defaultPaymentMethod: PaymentMethod;
  defaultPreferences: Record<string, unknown>; isDemo: boolean;
};

export type Address = { id: string; label: string; detail: string; isPrimary: boolean };
export type CartLine = { serviceId: string; quantity: number; preferences: Record<string, unknown> };

export type OrderItem = {
  id: string; serviceId: string; serviceName: string; serviceIcon: string; quantity: number;
  priceUnit: string; unitPrice: number; lineTotal: number; pricingType: 'fixed' | 'estimated';
  preferences: Record<string, unknown>;
};

export type OrderMessage = { id: string; senderRole: 'customer' | 'admin'; message: string; readAt?: string | null; createdAt: string };
export type StatusHistory = { id: string; previousStatus?: OrderStatus | null; newStatus: OrderStatus; actorRole: 'customer' | 'admin' | 'system'; comment: string; createdAt: string };

export type CustomerOrder = {
  databaseId: string; id: string; userId: string; status: OrderStatus; items: OrderItem[];
  contactPhone: string; pickupSlotId?: string | null; pickupDate?: string | null;
  pickupStart?: string | null; pickupEnd?: string | null; pickupAddress: string;
  pickupInstructions: string; customerComment: string; subtotal: number; pickupFee: number;
  deliveryFee: number; discount: number; pickupBenefitDiscount: number;
  couponCode?: string | null; estimatedTotal: number; finalTotal?: number | null; amount: number;
  pricingType: 'fixed' | 'estimated'; paymentMethod: PaymentMethod; paymentStatus: PaymentStatus;
  paymentRejectionReason?: string; hasPaymentSlip: boolean; priceApprovalStatus: PriceApprovalStatus;
  history: StatusHistory[]; messages: OrderMessage[]; isDemo: boolean; createdAt: string; updatedAt: string;
};

export type CustomerNotification = {
  id: string; orderId?: string | null; type: string; title: string; message: string;
  link?: string | null; readAt?: string | null; createdAt: string;
};
