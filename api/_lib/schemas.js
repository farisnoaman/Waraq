import { z } from 'zod';

/*
 * Validation schemas shared by the API routes and the React forms, so the
 * browser and the server always agree on what valid input looks like.
 */

export const ROLES = ['buyer', 'staff', 'admin'];
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'under_processing',
  'in_delivery',
  'delivered',
  'completed',
];
export const DELIVERY_STATUSES = ['draft', 'assigned', 'dispatched', 'delivered'];
export const PAYMENT_METHODS = ['bank_transfer', 'mada', 'cash', 'cheque'];
export const CONTACT_SUBJECTS = ['General enquiry', 'Product enquiry', 'Quotation', 'Delivery'];
export const MAX_QTY = 9999;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Input sanitiser: drops control characters and angle brackets (so markup can
 * never be stored), collapses runs of spaces and trims. React escapes on
 * output as well, so this is defence in depth.
 */
export function clean(value) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/[<>]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const toCleanString = (v) => (v == null ? '' : typeof v === 'string' ? clean(v) : v);
const toTrimmed = (v) => (v == null ? '' : typeof v === 'string' ? v.trim() : v);

export const text = (max, min = 0, requiredMessage = 'This field is required.') =>
  z.preprocess(
    toCleanString,
    z.string().min(min, requiredMessage).max(max, `Keep this under ${max} characters.`),
  );

const email = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v == null ? '' : v),
  z
    .string()
    .min(1, 'Please enter your email address.')
    .max(254, 'This email address is too long.')
    .regex(
      /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/,
      'This email address does not look right. Example: name@company.com',
    ),
);

const phoneOptional = z.preprocess(
  toTrimmed,
  z.string().regex(/^(\+?[\d\s()-]{7,20})?$/, 'Use digits only, with an optional + at the start.'),
);

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid identifier.');

const id = z.coerce.number().int('Invalid identifier.').positive('Invalid identifier.');

const intRange = (min, max, message) =>
  z.coerce.number(message).int(message).min(min, message).max(max, message);

const decimalRange = (min, max, message) => z.coerce.number(message).min(min, message).max(max, message);

const imagePath = z.preprocess(
  toTrimmed,
  z
    .string()
    .max(400, 'This image address is too long.')
    .regex(
      /^(\/images\/[A-Za-z0-9._/-]+|https:\/\/[^\s"'<>()]+)$/,
      'Use a /images/… path or an https:// image address.',
    ),
);

const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Use 72 characters or fewer.');

const orderDetails = z.object({
  name: text(120, 2, 'Please enter your full name.'),
  company: text(160),
  phone: phoneOptional,
  city: text(80, 2, 'Please tell us the delivery city.'),
  address: text(300),
  notes: text(1500),
});

const productBase = {
  name: text(140, 2, 'Enter the product name.'),
  sku: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v == null ? '' : v),
    z
      .string()
      .min(2, 'Enter the SKU code.')
      .max(40, 'Keep the SKU under 40 characters.')
      .regex(/^[A-Z0-9._-]+$/, 'Use letters, digits, dots, dashes or underscores only.'),
  ),
  category_id: id,
  project_category_id: z.preprocess((v) => (v === '' || v == null ? null : v), id.nullable()),
  summary: text(300, 5, 'Add a short summary (at least 5 characters).'),
  description: text(3000),
  pack_unit: text(80, 1, 'Say how the product is sold, for example “Box of 5 reams”.'),
  min_order: text(60),
  moq: intRange(1, 100000, 'Enter a whole number of 1 or more.'),
  unit_price: decimalRange(0.01, 1000000, 'Enter a price greater than 0.'),
  vat_rate: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    decimalRange(0, 100, 'Enter a VAT percentage between 0 and 100.').nullable(),
  ),
  in_stock: z.boolean('Choose yes or no.'),
  featured: z.boolean('Choose yes or no.'),
  image: imagePath,
  specs: z
    .array(
      z.object({
        label: text(60, 1, 'Each specification needs a label.'),
        value: text(160, 1, 'Each specification needs a value.'),
      }),
    )
    .max(20, 'Use 20 specifications or fewer.'),
};

export const schemas = {
  id,
  uuid,

  login: z.object({
    email,
    password: z.string().min(1, 'Please enter your password.').max(72, 'This password is too long.'),
  }),

  signup: z.object({
    full_name: text(120, 2, 'Please enter your full name.'),
    email,
    password,
  }),

  profile: z.object({
    full_name: text(120, 2, 'Please enter your full name.'),
    company: text(160),
    phone: phoneOptional,
  }),

  orderDetails,

  orderCreate: orderDetails.extend({
    items: z
      .array(
        z.object({
          product_id: id,
          qty: intRange(1, MAX_QTY, `Quantities must be between 1 and ${MAX_QTY}.`),
        }),
      )
      .min(1, 'Add at least one product to your request list.')
      .max(100, 'A single order can hold up to 100 different products.'),
  }),

  contact: z.object({
    name: text(120, 2, 'Please enter your full name.'),
    email,
    company: text(160),
    phone: phoneOptional,
    subject: z.enum(CONTACT_SUBJECTS, 'Choose a subject.'),
    message: text(2000, 10, 'Please write a message of at least 10 characters.'),
  }),

  product: z.object(productBase),

  productPricing: z.object({
    id,
    unit_price: productBase.unit_price,
    vat_rate: productBase.vat_rate,
  }),

  category: z.object({
    name: text(80, 2, 'Enter the category name.'),
    kind: z.enum(['product', 'project'], 'Choose a category type.'),
    description: text(300),
    image: imagePath,
    sort_order: intRange(0, 9999, 'Enter a whole number between 0 and 9999.'),
  }),

  assign: z.object({
    id,
    staff_id: z.preprocess(toTrimmed, z.string().min(1, 'Choose a staff member.').pipe(uuid)),
    vehicle_type: text(60, 2, 'Enter the vehicle type.'),
    vehicle_plate: text(30, 2, 'Enter the vehicle plate number.'),
  }),

  installment: z.object({
    payment_id: id,
    amount: decimalRange(0.01, 100000000, 'Enter an amount greater than 0.'),
    method: z.enum(PAYMENT_METHODS, 'Choose a payment method.'),
    receiver_reference: text(120),
  }),

  settings: z.object({
    vat_rate: decimalRange(0, 100, 'Enter a VAT percentage between 0 and 100.'),
    default_commission_rate: decimalRange(0, 100, 'Enter a rate between 0 and 100.'),
    seller_vat_number: z.preprocess(
      toTrimmed,
      z.string().regex(/^(\d{15})?$/, 'A Saudi VAT registration number has 15 digits.'),
    ),
  }),

  tier: z.object({
    label: text(80, 2, 'Give the tier a label.'),
    min_moq: intRange(1, 100000, 'Enter a whole number of 1 or more.'),
    rate: decimalRange(0, 100, 'Enter a rate between 0 and 100.'),
  }),

  staffCreate: z.object({
    full_name: text(120, 2, 'Please enter the staff member’s full name.'),
    email,
    phone: phoneOptional,
    password,
  }),

  roleUpdate: z.object({
    id: uuid,
    role: z.enum(['buyer', 'staff'], 'Choose buyer or staff.'),
  }),
};

/** Flattens a ZodError into `{ fieldName: firstMessage }`. */
export function fieldErrors(error) {
  const out = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
