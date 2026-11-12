import type {
  CommissionStatus,
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
} from './types';
import { getLang } from './i18n';

const moneyFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Keeps phone numbers left-to-right inside Arabic text (so the + stays in front). */
export const ltr = (value: string | null | undefined) => (value ? `\u2066${value}\u2069` : '');

export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function sar(value: number | string | null | undefined): string {
  const amount = moneyFormat.format(Number(value) || 0);
  return getLang() === 'ar' ? `${amount} ر.س` : `SAR ${amount}`;
}

export function percent(value: number | string | null | undefined): string {
  const n = Number(value) || 0;
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}%`;
}

// Gregorian calendar with Western digits in both languages, as used on Saudi business documents.
const dateLocale = () => (getLang() === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB');

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(dateLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(dateLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type Tone = 'neutral' | 'brass' | 'mint' | 'solid' | 'dark' | 'danger';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'under_processing',
  'in_delivery',
  'delivered',
  'completed',
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending review',
  confirmed: 'Confirmed',
  preparing: 'Preparing order',
  under_processing: 'Under processing',
  in_delivery: 'In delivery · on the way',
  delivered: 'Delivered',
  completed: 'Completed',
};

export const ORDER_STATUS_SHORT: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  under_processing: 'Processing',
  in_delivery: 'On the way',
  delivered: 'Delivered',
  completed: 'Completed',
};

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  pending: 'brass',
  confirmed: 'mint',
  preparing: 'mint',
  under_processing: 'neutral',
  in_delivery: 'dark',
  delivered: 'solid',
  completed: 'solid',
};

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  draft: 'Draft · unassigned',
  assigned: 'Assigned',
  dispatched: 'Dispatched · on the way',
  delivered: 'Delivered',
};

export const DELIVERY_STATUS_TONE: Record<DeliveryStatus, Tone> = {
  draft: 'brass',
  assigned: 'mint',
  dispatched: 'dark',
  delivered: 'solid',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partially paid',
  paid: 'Paid in full',
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  unpaid: 'brass',
  partial: 'mint',
  paid: 'solid',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  mada: 'Mada / card',
  cash: 'Cash on delivery',
  cheque: 'Corporate cheque',
};

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  unpaid: 'Not paid',
  awaiting_confirmation: 'Not paid · awaiting staff confirmation',
  paid: 'Paid · staff confirmed',
};

export const COMMISSION_STATUS_TONE: Record<CommissionStatus, Tone> = {
  unpaid: 'brass',
  awaiting_confirmation: 'neutral',
  paid: 'solid',
};

export const ROLE_LABEL: Record<Role, string> = {
  buyer: 'Buyer',
  staff: 'Staff',
  admin: 'Admin',
};

export const ROLE_TONE: Record<Role, Tone> = {
  buyer: 'neutral',
  staff: 'mint',
  admin: 'dark',
};
