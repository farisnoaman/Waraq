export type Role = 'buyer' | 'staff' | 'admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  company: string | null;
  phone: string | null;
  created_at?: string;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  image: string;
  kind: 'product' | 'project';
  sort_order: number;
}

export interface Spec {
  label: string;
  value: string;
}

export interface Product {
  id: number;
  slug: string;
  sku: string;
  name: string;
  category_id: number;
  project_category_id: number | null;
  category_slug: string;
  project_category_slug: string | null;
  summary: string;
  description: string | null;
  specs: Spec[];
  pack_unit: string;
  min_order: string | null;
  moq: number;
  unit_price: number;
  /** Effective VAT % (the product's own rate, or the default from Settings). */
  vat_rate: number;
  /** The product's own VAT %, or null when it follows the default. */
  vat_rate_override: number | null;
  vat_value: number;
  price_incl_vat: number;
  in_stock: boolean;
  featured: boolean;
  image: string;
  created_at: string;
}

export interface ServiceItem {
  id: number;
  kind: 'step' | 'service';
  step_number: number | null;
  title: string;
  summary: string;
  points: string[] | null;
  icon: string;
  sort_order: number;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'under_processing'
  | 'in_delivery'
  | 'delivered'
  | 'completed';

export type DeliveryStatus = 'draft' | 'assigned' | 'dispatched' | 'delivered';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PaymentMethod = 'bank_transfer' | 'mada' | 'cash' | 'cheque';
export type CommissionStatus = 'unpaid' | 'awaiting_confirmation' | 'paid';

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  pack_unit: string;
  moq: number;
  qty: number;
  unit_price: number;
  vat_rate: number;
  vat_per_item: number;
  line_subtotal: number;
  line_vat: number;
  line_total: number;
}

export interface Installment {
  id: number;
  payment_id: number;
  receipt_number: string;
  amount: number;
  balance_after: number;
  method: PaymentMethod;
  receiver_id: string;
  receiver_name: string;
  receiver_reference: string | null;
  created_at: string;
}

export interface Payment {
  id: number;
  order_id: number;
  delivery_id: number | null;
  total_due: number;
  total_paid: number;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
  installments: Installment[];
}

export interface Delivery {
  id: number;
  order_id: number;
  status: DeliveryStatus;
  staff_id: string | null;
  staff_name: string | null;
  staff_email: string | null;
  staff_phone: string | null;
  staff_accepted_at: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  assigned_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  staff_confirmed_at: string | null;
  buyer_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  reference: string;
  buyer_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_company: string | null;
  buyer_phone: string | null;
  city: string;
  address: string | null;
  notes: string | null;
  status: OrderStatus;
  subtotal: number;
  vat_total: number;
  total: number;
  total_units: number;
  buyer_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  delivery: Delivery | null;
  payment: Payment | null;
}

export interface OrdersResponse {
  orders: Order[];
  seller_vat_number: string;
}

export interface CommissionLine {
  product_name: string;
  sku: string;
  moq: number;
  tier_label: string;
  rate: number;
  base: number;
  amount: number;
}

export interface Commission {
  id: number;
  order_id: number;
  order_reference: string;
  buyer_name: string;
  staff_id: string;
  staff_name: string;
  staff_email: string;
  moq_basis: number;
  tier_label: string;
  order_value: number;
  rate: number;
  amount: number;
  breakdown: CommissionLine[];
  status: CommissionStatus;
  paid_marked_at: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface Tier {
  id: number;
  label: string;
  min_moq: number;
  rate: number;
}

export interface Settings {
  vat_rate: number;
  default_commission_rate: number;
  seller_vat_number: string;
  tiers: Tier[];
}

export interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  subject: string;
  message: string;
  created_at: string;
}

export type NotificationType =
  | 'info'
  | 'order_new'
  | 'order_confirmed'
  | 'order_on_the_way'
  | 'delivery_assigned';

export interface NotificationItem {
  id: number;
  user_id: string;
  type: NotificationType;
  params: Record<string, string | number>;
  order_id: number | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unread: number;
}
