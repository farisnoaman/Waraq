# Waraq Pro (ورق برو)

E-commerce and operations portal for Waraq Pro (waraq.pro), a paper, packaging and office
supplier in Jeddah. Buyers order from the catalogue and track their orders; staff deliver and
collect payments; the administrator runs the catalogue, deliveries, payments, commissions and VAT.

- **Languages:** Arabic (default, right-to-left) and English. The globe button in the header switches between them and remembers the choice.
- **Font:** Readex Pro, self-hosted, for both Arabic and Latin text.
- **Stack:** Vite + React + TypeScript + Tailwind CSS, Supabase (Postgres + Auth), Node API handlers.
- **Runs on:** Coolify / Docker (`server.js`), or Vercel (the same `api/` handlers run as serverless functions).

## Features

### Public site
- Home, products (search, category / project filters, sort), product detail, services, contact form.
- Request list (cart) with minimum order quantity (MOQ) enforced per product.
- Order bill with Saudi VAT: VAT % and VAT value per item, subtotal, items total, VAT total and final payable total.
- Installable PWA with an offline app shell and offline catalogue.

### Accounts and roles
- Sign in with email and password or with Google. Every new account starts as a **buyer**.
- Three roles: **buyer**, **staff**, **admin**. Roles are stored in Supabase Auth `app_metadata`, which only the server can write.
- Every API request verifies the session and the role on the server. The browser guards only decide what is shown.
- Sign-out for every role, and automatic sign-out after 10 minutes without activity (with a one-minute warning).

### Buyer portal (`/buyer`)
- **My orders:** active and past orders, 7-step status bar, items with VAT breakdown, printable order bill, optional confirmation of delivery reception.
- **Payments (read-only):** payment status and every payment recorded by the Waraq Pro team for the buyer's own orders, with printable receipts. Buyers cannot record or change payments.
- **Profile:** contact details.
- A buyer only ever receives their own orders, deliveries, payments and receipts.
- Offline: orders are saved on the device (IndexedDB), a reception confirmation made offline is queued and sent on reconnect, and saved data is removed on sign-out.

### Admin and staff portal (`/admin`)
| Tab | Admin | Staff |
|---|---|---|
| Catalog | Products, categories, MOQ, prices | no access |
| Orders | Review, confirm, start preparation | Orders of their own deliveries (view) |
| Deliveries | Assign staff and vehicle, dispatch, confirm | Accept, dispatch, confirm reception for their own deliveries |
| Payments | Record installments, print receipts | Same, for their own deliveries only |
| Commissions | See all, press "Pay commission" | See their own, confirm or reject a payment |
| Users & staff | Create staff, switch users between buyer and staff | no access |
| Settings | Default VAT, VAT per product, commission tiers, VAT number | no access |
| Inbox | Contact form messages | no access |
| Profile | yes | yes |

Workflow rules:
- Confirming an order creates a draft delivery.
- Once a staff member **accepts** a delivery, the admin can no longer assign it to someone else.
- Confirming reception creates the payment record and the staff commission.
- Payments: quick-select 10% to 80% and Full, unique receipt numbers, expandable installment rows, printable receipt showing amount received, remaining balance and receiving staff.
- An order becomes "completed" when it is paid in full.
- Commissions use MOQ tiers from Settings. A commission stays **not paid** until the staff member confirms receiving it.

## Demo accounts (hosted preview database)

| Role | Email | Password |
|---|---|---|
| Admin | admin@waraq.pro | WaraqAdmin#2026 |
| Staff | staff@waraq.pro | WaraqStaff#2026 |
| Staff | staff2@waraq.pro | WaraqStaff#2026 |
| Buyer | buyer@waraq.pro | WaraqBuyer#2026 |

These exist only in the preview database. Create your own accounts in your own Supabase project and never reuse these passwords.

## Deploying on Coolify

1. **Create a Supabase project** (Supabase Cloud, or the Supabase service in Coolify).
2. **Create the database.** In the Supabase SQL editor run, in order:
   - `supabase/migrations/0000_schema_and_seed.sql` (tables, catalogue, VAT and commission defaults)
   - `supabase/migrations/0001_waraq_pro_hardening.sql` (role enum, triggers, row level security)

   Both files are written for this app but have not been run yet: the preview database could not execute SQL. Read the output of each run. In `0001`, replace the administrator id (step 4) before running.
3. **Push this folder to a Git repository** and add it in Coolify as an application with the **Dockerfile** build pack. Port: `3000`. Health check path: `/healthz`.
4. **Create the administrator.** In Supabase → Authentication → Users, add your admin user and copy its user id.
5. **Set the environment variables** in Coolify (see `.env.example`):

   | Variable | When | Notes |
   |---|---|---|
   | `VITE_SUPABASE_URL` | build | tick "Build Variable" |
   | `VITE_SUPABASE_ANON_KEY` | build | tick "Build Variable" |
   | `NEXT_PUBLIC_SUPABASE_URL` | runtime | same URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | runtime | secret, server only |
   | `WARAQ_ADMIN_USER_IDS` | runtime | admin user id(s), comma separated |
   | `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_AUTH_PROXY` | build | leave empty when self-hosting |

6. **Google sign-in (optional).** Enable the Google provider in Supabase → Authentication → Providers and add `https://your-domain/buyer` to the allowed redirect URLs. With the two `VITE_GOOGLE_*` variables empty, the app uses that provider directly. This path has not been tested yet.
7. **Deploy**, then set your domain in Coolify. HTTPS is required for the PWA and service worker.

Run it without Coolify:

```bash
docker build -t waraq-pro \
  --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e WARAQ_ADMIN_USER_IDS=... waraq-pro
```

Or with Node 20+: `npm ci && npm run build && npm start`.

## Project layout

```
api/                 API handlers (shared by server.js and Vercel)
api/_lib/            auth and roles, validation schemas (Zod), workflow automations
server.js            production server: static files, SPA fallback, /api, /healthz
Dockerfile           two-stage build for Coolify / Docker
src/lib/i18n.ts      language store and t(); src/lib/ar.ts holds the Arabic text
src/pages/           public pages, buyer portal, admin and staff portal
supabase/migrations  SQL for a new Supabase project
public/sw.js         service worker (app shell and public catalogue only)
```

## Security notes

- All data access goes through the API, which uses the service role key on the server. The browser only holds the anon key, for sign-in.
- Inputs are validated with the same Zod schemas in the browser and on the server, and sanitised before storage. Prices, VAT and MOQ are always taken from the database, never from the browser.
- A Content Security Policy and related headers are set in `vercel.json` and reused by `server.js`.
- **Row level security must be enforced in your Supabase project** by running `0001_waraq_pro_hardening.sql`. Without it, anyone holding the anon key can read and change tables directly, bypassing the API. In the hosted preview database it is not enforced, so treat that data as demo only.
- The CSP still allows inline scripts and two preview-platform hosts. When self-hosting you can tighten it in `vercel.json`.

## Known limits

- Arabic catalogue text comes from the translation file. Products, categories or commission tiers that you add later appear exactly as typed, in both languages.
- Messages that the server builds with live values (for example a product name inside an error) are translated only for the common cases.
- Order status refreshes every 25 to 30 seconds rather than instantly.
- The bill shows the VAT breakdown and your VAT number, but has not been checked against ZATCA e-invoicing (QR code, XML) requirements.
- One administrator role assignment path: admins are listed in `WARAQ_ADMIN_USER_IDS`; the Users tab switches people between buyer and staff only.
