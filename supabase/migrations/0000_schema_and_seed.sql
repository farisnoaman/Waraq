-- =============================================================================
-- Waraq Pro: tables and starting catalogue for a NEW Supabase project.
--
-- STATUS: written to match the schema the app uses, but NOT yet run or tested
-- (the hosted preview database was created through tooling, not from this file).
-- Run it once in the Supabase SQL editor, then run 0001_waraq_pro_hardening.sql.
-- =============================================================================

begin;

create table if not exists public.profiles (
  id uuid primary key,
  email text not null,
  full_name text not null,
  role text not null default 'buyer',
  company text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id serial primary key,
  slug text not null,
  name text not null,
  description text,
  image text not null,
  kind text not null default 'product',
  sort_order integer not null default 0
);

create table if not exists public.products (
  id serial primary key,
  slug text not null,
  sku text not null,
  name text not null,
  category_id integer not null references public.categories (id) on delete restrict,
  project_category_id integer references public.categories (id) on delete set null,
  summary text,
  description text,
  specs jsonb default '[]'::jsonb,
  pack_unit text not null,
  min_order text,
  moq integer not null default 1,
  unit_price numeric not null default 0,
  vat_rate numeric,
  in_stock boolean not null default true,
  featured boolean not null default false,
  image text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id serial primary key,
  kind text not null,
  step_number integer,
  title text not null,
  summary text not null,
  points jsonb default '[]'::jsonb,
  icon text not null,
  sort_order integer not null default 0
);

create table if not exists public.contact_messages (
  id serial primary key,
  name text not null,
  email text not null,
  company text,
  phone text,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id integer primary key,
  vat_rate numeric not null default 15,
  default_commission_rate numeric not null default 2,
  seller_vat_number text,
  updated_at timestamptz not null default now()
);

create table if not exists public.commission_tiers (
  id serial primary key,
  label text not null,
  min_moq integer not null,
  rate numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id serial primary key,
  reference text not null,
  buyer_id uuid not null,
  buyer_name text not null,
  buyer_email text not null,
  buyer_company text,
  buyer_phone text,
  city text not null,
  address text,
  notes text,
  status text not null default 'pending',
  subtotal numeric not null default 0,
  vat_total numeric not null default 0,
  total numeric not null default 0,
  total_units integer not null default 0,
  buyer_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id serial primary key,
  order_id integer not null references public.orders (id) on delete cascade,
  product_id integer,
  product_name text not null,
  sku text not null,
  pack_unit text not null,
  moq integer not null default 1,
  qty integer not null,
  unit_price numeric not null,
  vat_rate numeric not null,
  vat_per_item numeric not null,
  line_subtotal numeric not null,
  line_vat numeric not null,
  line_total numeric not null
);

create table if not exists public.deliveries (
  id serial primary key,
  order_id integer not null references public.orders (id) on delete cascade,
  status text not null default 'draft',
  staff_id uuid,
  staff_accepted_at timestamptz,
  vehicle_type text,
  vehicle_plate text,
  assigned_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  staff_confirmed_at timestamptz,
  buyer_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id serial primary key,
  order_id integer not null references public.orders (id) on delete cascade,
  delivery_id integer references public.deliveries (id) on delete set null,
  buyer_id uuid,
  total_due numeric not null default 0,
  total_paid numeric not null default 0,
  status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_installments (
  id serial primary key,
  payment_id integer not null references public.payments (id) on delete cascade,
  receipt_number text not null,
  amount numeric not null,
  balance_after numeric not null,
  method text not null default 'bank_transfer',
  receiver_id uuid,
  receiver_name text not null,
  receiver_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.commissions (
  id serial primary key,
  order_id integer not null references public.orders (id) on delete cascade,
  delivery_id integer,
  staff_id uuid not null,
  moq_basis integer not null default 1,
  tier_label text,
  order_value numeric not null default 0,
  rate numeric not null default 0,
  amount numeric not null default 0,
  breakdown jsonb default '[]'::jsonb,
  status text not null default 'unpaid',
  paid_marked_at timestamptz,
  paid_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---- starting data ----------------------------------------------------------

insert into public.settings (id, vat_rate, default_commission_rate) values (1, 15, 2)
on conflict (id) do nothing;

insert into public.commission_tiers (label, min_moq, rate)
select * from (values ('Standard MOQ', 2, 2.5), ('Volume MOQ', 5, 3.5), ('Bulk MOQ', 10, 5)) as t (label, min_moq, rate)
where not exists (select 1 from public.commission_tiers);

insert into public.categories (id, slug, name, description, image, kind, sort_order) values
  (1, 'copy-paper', 'Copy & Printing Paper', 'Everyday office paper in reams and rolls for printers, copiers and point of sale.', '/images/a4-copy-paper.jpg', 'product', 1),
  (2, 'specialty-paper', 'Art & Specialty Paper', 'Card, kraft and wide-format paper for print, design and wrapping work.', '/images/card-stock.jpg', 'product', 2),
  (3, 'packaging', 'Packaging & Cartons', 'Cartons, bags, tape and protective wrap for packing and shipping.', '/images/cartons.jpg', 'product', 3),
  (4, 'stationery', 'Office Stationery', 'Files, envelopes, notebooks and desk essentials.', '/images/box-files.jpg', 'product', 4),
  (5, 'tissue-hygiene', 'Tissue & Hygiene Paper', 'Tissue and paper towels for offices and facilities.', '/images/tissue-box.jpg', 'product', 5),
  (6, 'food-service', 'Food Service Paper', 'Cups and takeaway packaging for cafes, restaurants and catering.', '/images/paper-cups.jpg', 'product', 6),
  (7, 'corporate-office', 'Corporate Office', 'Everyday supplies for offices and administration teams.', '/images/box-files.jpg', 'project', 11),
  (8, 'retail-pos', 'Retail & Point of Sale', 'Receipt rolls, labels and bags for shops and checkouts.', '/images/thermal-roll-80x80.jpg', 'project', 12),
  (9, 'warehouse-ecommerce', 'Warehouse & E-commerce', 'Packing and shipping materials for fulfilment teams.', '/images/cartons.jpg', 'project', 13),
  (10, 'cafes-hospitality', 'Cafes & Hospitality', 'Cups, takeaway packaging and tissue for food service and hospitality.', '/images/paper-cups.jpg', 'project', 14)
on conflict (id) do nothing;

insert into public.products (id, slug, sku, name, category_id, project_category_id, summary, description, specs, pack_unit, min_order, moq, unit_price, vat_rate, in_stock, featured, image, created_at) values
  (1, 'a4-copy-paper-80gsm', 'WQ-CP-A480', 'A4 Copy Paper 80 gsm', 1, 7, 'White multipurpose paper for everyday printing and copying.', 'A dependable white A4 sheet for laser printers, inkjet printers and copiers. Suitable for daily office documents, reports and forms.', '[{"label":"Size","value":"A4 (210 x 297 mm)"},{"label":"Weight","value":"80 gsm"},{"label":"Colour","value":"White"},{"label":"Sheets per ream","value":"500"}]'::jsonb, 'Box of 5 reams', '3 boxes', 3, 85, null, true, true, '/images/a4-copy-paper.jpg', '2026-01-12T08:00:00+00:00'),
  (2, 'coloured-copy-paper', 'WQ-CP-COL', 'Coloured Copy Paper, Assorted', 1, 7, 'Pastel and bright A4 sheets for notices, dividers and forms.', 'Coloured A4 paper that runs through standard office printers and copiers. Useful for colour-coding documents, notices and internal forms.', '[{"label":"Size","value":"A4 (210 x 297 mm)"},{"label":"Weight","value":"80 gsm"},{"label":"Colours","value":"Assorted pastel and bright"},{"label":"Sheets per ream","value":"500"}]'::jsonb, 'Ream of 500 sheets', '5 reams', 5, 32, null, true, false, '/images/coloured-paper.jpg', '2026-02-03T08:00:00+00:00'),
  (3, 'thermal-paper-roll-80x80mm', 'WQ-CP-TR8080', 'Thermal Paper Roll 80 x 80 mm', 1, 8, '70 gsm thermal paper roll, 80 x 80 mm, on a 17/19 mm core.', 'Thermal paper roll for POS terminals and receipt printers. Prints without ribbon or ink.', '[{"label":"Roll size","value":"80 x 80 mm"},{"label":"Paper weight","value":"70 gsm"},{"label":"Core","value":"17/19 mm"},{"label":"Paper","value":"Thermal"}]'::jsonb, 'Single roll', '10 rolls', 10, 6, null, true, true, '/images/thermal-roll-80x80.jpg', '2026-11-10T19:00:00+00:00'),
  (4, 'thermal-paper-roll-80x67mm', 'WQ-CP-TR8067', 'Thermal Paper Roll 80 x 67 mm', 1, 8, 'Thermal paper roll, 80 x 67 mm, on a 14/17 mm core.', 'Thermal paper roll for POS terminals and receipt printers. Prints without ribbon or ink.', '[{"label":"Roll size","value":"80 x 67 mm"},{"label":"Core","value":"14/17 mm"},{"label":"Paper","value":"Thermal"}]'::jsonb, 'Single roll', '10 rolls', 10, 5, null, true, true, '/images/thermal-roll-80x67.jpg', '2026-11-10T19:01:00+00:00'),
  (5, 'direct-thermal-labels-58x40mm', 'WQ-CP-TL5840', 'Direct Thermal Labels 58 x 40 mm', 1, 8, 'Direct thermal labels, 58 x 40 mm, 1,000 labels per roll on a 44 mm core.', 'Direct thermal label rolls for label printers. Prints without ribbon or ink.', '[{"label":"Label size","value":"58 x 40 mm"},{"label":"Labels per roll","value":"1,000"},{"label":"Core","value":"44 mm"},{"label":"Material weight","value":"70 gsm + 58 gsm"},{"label":"Type","value":"Direct thermal"}]'::jsonb, 'Roll of 1,000 labels', '5 rolls', 5, 24, null, true, true, '/images/thermal-labels-58x40.jpg', '2026-11-10T19:02:00+00:00'),
  (6, 'white-card-stock-250gsm', 'WQ-SP-CS250', 'White Card Stock 250 gsm', 2, 7, 'Smooth heavyweight card for covers, menus and invitations.', 'A rigid, smooth white card for report covers, menus, invitations and presentation work. Available in A4 and A3.', '[{"label":"Sizes","value":"A4 and A3"},{"label":"Weight","value":"250 gsm"},{"label":"Finish","value":"Smooth, uncoated"},{"label":"Sheets per pack","value":"100"}]'::jsonb, 'Pack of 100 sheets', '5 packs', 5, 45, null, true, false, '/images/card-stock.jpg', '2026-02-20T08:00:00+00:00'),
  (7, 'brown-kraft-paper-roll', 'WQ-SP-KR80', 'Brown Kraft Paper Roll', 2, 9, 'Kraft paper on the roll for wrapping, interleaving and void fill.', 'Natural brown kraft paper supplied on the roll. Used for wrapping goods, protecting surfaces and filling space inside cartons.', '[{"label":"Width","value":"100 cm"},{"label":"Weight","value":"80 gsm"},{"label":"Length","value":"50 m"},{"label":"Colour","value":"Natural brown"}]'::jsonb, 'Single roll', '2 rolls', 2, 95, null, true, false, '/images/kraft-roll.jpg', '2026-04-07T08:00:00+00:00'),
  (8, 'wide-format-plotter-paper', 'WQ-SP-PL80', 'Wide-Format Plotter Paper', 2, 7, 'Uncoated bond rolls for plotters, plans and CAD printing.', 'Bond paper rolls for wide-format plotters. Suited to architectural plans, engineering drawings and CAD output.', '[{"label":"Widths","value":"610 mm and 914 mm"},{"label":"Weight","value":"80 gsm"},{"label":"Length","value":"50 m"},{"label":"Core","value":"2 inch"}]'::jsonb, 'Carton of 4 rolls', '1 carton', 1, 220, null, false, false, '/images/plotter-rolls.jpg', '2026-06-15T08:00:00+00:00'),
  (9, 'corrugated-shipping-cartons', 'WQ-PK-CTN', 'Corrugated Shipping Cartons', 3, 9, 'Single-wall and double-wall cartons in standard sizes.', 'Brown corrugated cartons for storage and shipping. Supplied flat in bundles, in single-wall or double-wall board.', '[{"label":"Material","value":"Corrugated board"},{"label":"Wall","value":"Single or double"},{"label":"Sizes","value":"Small, medium and large"},{"label":"Colour","value":"Brown kraft"}]'::jsonb, 'Bundle of 25', '1 bundle', 1, 110, null, true, false, '/images/cartons.jpg', '2026-01-25T08:00:00+00:00'),
  (10, 'kraft-paper-bags-with-handles', 'WQ-PK-BAG', 'Kraft Paper Bags with Handles', 3, 8, 'Twisted-handle paper bags for retail and takeaway.', 'Natural kraft carrier bags with twisted paper handles. A practical choice for shops, bakeries and takeaway counters.', '[{"label":"Material","value":"Kraft paper"},{"label":"Handle","value":"Twisted paper"},{"label":"Sizes","value":"Small, medium and large"},{"label":"Colour","value":"Natural brown"}]'::jsonb, 'Carton of 250', '1 carton', 1, 160, null, true, false, '/images/paper-bags.jpg', '2026-05-02T08:00:00+00:00'),
  (11, 'packing-tape-48mm', 'WQ-PK-TP48', 'Packing Tape 48 mm', 3, 9, 'Carton sealing tape in clear or brown.', 'General-purpose carton sealing tape for hand dispensers. Available in clear or brown.', '[{"label":"Width","value":"48 mm"},{"label":"Length","value":"66 m"},{"label":"Colour","value":"Clear or brown"},{"label":"Adhesive","value":"Acrylic"}]'::jsonb, 'Box of 36 rolls', '1 box', 1, 130, null, true, false, '/images/packing-tape.jpg', '2026-03-05T08:00:00+00:00'),
  (12, 'bubble-wrap-roll', 'WQ-PK-BW10', 'Bubble Wrap Roll', 3, 9, 'Protective bubble wrap for fragile items.', 'Lightweight cushioning for fragile goods in storage and transit. Supplied on the roll and easy to cut to size.', '[{"label":"Width","value":"100 cm"},{"label":"Length","value":"50 m"},{"label":"Bubble size","value":"10 mm"},{"label":"Material","value":"Polyethylene"}]'::jsonb, 'Single roll', '2 rolls', 2, 80, null, false, false, '/images/bubble-wrap.jpg', '2026-07-21T08:00:00+00:00'),
  (13, 'lever-arch-files', 'WQ-ST-LAF', 'Lever Arch Files', 4, 7, 'Rigid board files with a lever mechanism for A4 documents.', 'Sturdy A4 files with a lever arch mechanism and spine label. For filing invoices, contracts and records.', '[{"label":"Size","value":"A4"},{"label":"Spine","value":"75 mm"},{"label":"Mechanism","value":"Lever arch"},{"label":"Colours","value":"Assorted"}]'::jsonb, 'Carton of 20', '1 carton', 1, 150, null, true, false, '/images/box-files.jpg', '2026-02-11T08:00:00+00:00'),
  (14, 'kraft-envelopes', 'WQ-ST-ENV', 'Kraft Envelopes', 4, 7, 'Peel-and-seal kraft envelopes for everyday mailing.', 'Brown kraft envelopes with a peel-and-seal flap. Available in common sizes for letters and documents.', '[{"label":"Sizes","value":"DL, C5 and C4"},{"label":"Colour","value":"Kraft brown"},{"label":"Seal","value":"Peel and seal"},{"label":"Window","value":"Plain, no window"}]'::jsonb, 'Box of 500', '1 box', 1, 75, null, true, false, '/images/envelopes.jpg', '2026-04-22T08:00:00+00:00'),
  (15, 'spiral-notebooks-a4', 'WQ-ST-NB4', 'Spiral Notebooks A4', 4, 7, 'Wire-bound ruled notebooks for meetings and notes.', 'A4 wire-bound notebooks with ruled pages and a card cover. Pages turn flat for easy writing.', '[{"label":"Size","value":"A4"},{"label":"Sheets","value":"100"},{"label":"Ruling","value":"Lined"},{"label":"Binding","value":"Wire spiral"}]'::jsonb, 'Pack of 10', '2 packs', 2, 55, null, true, false, '/images/notebooks.jpg', '2026-05-19T08:00:00+00:00'),
  (16, 'sticky-notes-76mm', 'WQ-ST-SN76', 'Sticky Notes 76 x 76 mm', 4, 7, 'Repositionable notes in pastel colours.', 'Square repositionable notes that stick cleanly to paper, screens and desks. Supplied in assorted pastel colours.', '[{"label":"Size","value":"76 x 76 mm"},{"label":"Sheets per pad","value":"100"},{"label":"Colours","value":"Assorted pastel"},{"label":"Adhesive","value":"Repositionable"}]'::jsonb, 'Pack of 12 pads', '5 packs', 5, 28, null, true, false, '/images/sticky-notes.jpg', '2026-06-30T08:00:00+00:00'),
  (17, 'facial-tissue', 'WQ-TH-FT2', 'Facial Tissue', 5, 10, 'Soft two-ply facial tissue for offices and reception areas.', 'Soft white two-ply tissue for desks, meeting rooms and reception areas.', '[{"label":"Ply","value":"2"},{"label":"Sheets per pack","value":"150"},{"label":"Colour","value":"White"}]'::jsonb, 'Carton of 30 packs', '1 carton', 1, 90, null, true, false, '/images/tissue-box.jpg', '2026-08-10T08:00:00+00:00'),
  (18, 'paper-towel-rolls', 'WQ-TH-PT2', 'Paper Towel Rolls', 5, 10, 'Absorbent paper towel rolls for kitchens and washrooms.', 'Absorbent two-ply paper towels on the roll for pantries, kitchens and washrooms.', '[{"label":"Ply","value":"2"},{"label":"Rolls per pack","value":"6"},{"label":"Colour","value":"White"}]'::jsonb, 'Carton of 6 packs', '1 carton', 1, 85, null, true, false, '/images/paper-towels.jpg', '2026-08-28T08:00:00+00:00'),
  (19, 'paper-hot-cups', 'WQ-FS-CUP', 'Paper Hot Cups', 6, 10, 'Ripple-wall paper cups for coffee and tea.', 'Insulating ripple-wall cups for hot drinks. Lids are available separately on request.', '[{"label":"Sizes","value":"4 oz, 8 oz and 12 oz"},{"label":"Wall","value":"Ripple"},{"label":"Lids","value":"Available separately"}]'::jsonb, 'Carton of 500', '1 carton', 1, 140, null, true, false, '/images/paper-cups.jpg', '2026-09-14T08:00:00+00:00'),
  (20, 'kraft-takeaway-food-boxes', 'WQ-FS-BOX', 'Kraft Takeaway Food Boxes', 6, 10, 'Kraft board boxes and bowls for takeaway meals.', 'Kraft board boxes and bowls for takeaway and delivery meals. Several sizes are available on request.', '[{"label":"Material","value":"Kraft board"},{"label":"Formats","value":"Boxes and bowls"},{"label":"Sizes","value":"Several, on request"}]'::jsonb, 'Carton of 200', '1 carton', 1, 175, null, false, false, '/images/food-boxes.jpg', '2026-10-06T08:00:00+00:00')
on conflict (id) do nothing;

insert into public.services (id, kind, step_number, title, summary, points, icon, sort_order) values
  (1, 'step', 1, 'Request', 'Send us your list through the website or by email. Mixed items are welcome.', '["Add products to your request list, or describe what you need","Tell us the quantities and where the order should be delivered","Your order appears in your buyer portal straight away"]'::jsonb, 'clipboard-list', 1),
  (2, 'step', 2, 'Order bill', 'You see every price in writing, with VAT shown for each item.', '["Availability checked item by item","Unit price, VAT percentage and VAT value listed per item","Alternatives suggested when an item is unavailable"]'::jsonb, 'file-text', 2),
  (3, 'step', 3, 'Order confirmation', 'We confirm the order and fix the quantities and delivery details.', '["Final quantities and specifications agreed","Delivery address and contact person confirmed","A delivery is scheduled as soon as the order is confirmed"]'::jsonb, 'file-check', 3),
  (4, 'step', 4, 'Sourcing and preparation', 'We gather your items and prepare them as one complete order.', '["Catalogue items picked and special items sourced","Everything brought together into a single order","Packed for safe transport"]'::jsonb, 'package-search', 4),
  (5, 'step', 5, 'Quality check', 'Before dispatch, the order is checked against what you approved.', '["Quantities counted against the confirmed order","Items inspected for damage","Packing reviewed before loading"]'::jsonb, 'shield-check', 5),
  (6, 'step', 6, 'Door-to-door delivery', 'We bring the order to your address and hand it over.', '["Delivered to your office, shop, warehouse or site","Handed over to the contact person you named","Confirm reception from your buyer portal, even offline"]'::jsonb, 'truck', 6),
  (7, 'service', null, 'Sourcing on request', 'Looking for something that is not in the catalogue? Describe it and we will try to source it for you.', '[]'::jsonb, 'search', 11),
  (8, 'service', null, 'Bulk and recurring supply', 'Order in volume, or repeat the same request for the items you use regularly.', '[]'::jsonb, 'repeat', 12),
  (9, 'service', null, 'Consolidated orders', 'Paper, packaging and stationery combined into one order and one delivery.', '[]'::jsonb, 'boxes', 13),
  (10, 'service', null, 'After-delivery support', 'If something is not right with your delivery, write to us and we will follow up.', '[]'::jsonb, 'life-buoy', 14)
on conflict (id) do nothing;

-- Keep the id sequences ahead of the rows inserted with explicit ids.
select setval(pg_get_serial_sequence('public.categories', 'id'), (select max(id) from public.categories));
select setval(pg_get_serial_sequence('public.products', 'id'), (select max(id) from public.products));
select setval(pg_get_serial_sequence('public.services', 'id'), (select max(id) from public.services));

commit;
