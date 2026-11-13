-- =============================================================================
-- Waraq Pro: fix cross-customer data exposure in the two "visible rows" RLS
-- policies (order_items and payment_installments).
--
-- 0001's subqueries only checked "the parent row exists", which is true for
-- every order in the database — so ANY signed-in user could read every
-- customer's line items and every receipt via direct PostgREST access with
-- the anon key. These replacements scope visibility to the buyer, the
-- assigned delivery staff, or an admin, mirroring the orders/payments rules.
--
-- STATUS: written to be run once in the Supabase SQL editor (like 0001),
-- AFTER 0001 has been applied. Applying it twice is safe (drop + create).
--
-- Verify afterwards (also useful to audit the LIVE policies, since 0000/0001
-- were written blind against a tooling-created database):
--
--   select tablename, policyname, cmd, qual
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, policyname;
--
-- Confirm these two rows show the new buyer/staff/admin-filtered quals.
-- =============================================================================

begin;

drop policy if exists order_items_read_visible_orders on public.order_items;
create policy order_items_read_visible_orders on public.order_items for select
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (
        o.buyer_id = auth.uid()
        or exists (
          select 1 from public.deliveries d
          where d.order_id = o.id and d.staff_id = auth.uid()
        )
        or public.app_role() = 'admin'
      )
  )
);

drop policy if exists installments_read_visible_payments on public.payment_installments;
create policy installments_read_visible_payments on public.payment_installments for select
using (
  exists (
    select 1 from public.payments p
    where p.id = payment_installments.payment_id
      and (
        p.buyer_id = auth.uid()
        or exists (
          select 1 from public.deliveries d
          where d.id = p.delivery_id and d.staff_id = auth.uid()
        )
        or public.app_role() = 'admin'
      )
  )
);

commit;
