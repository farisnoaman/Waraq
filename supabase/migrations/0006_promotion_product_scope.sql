-- =============================================================================
-- Waraq Pro: promotions can target specific products.
--
-- applies_to holds an array of product ids. An empty array means the
-- promotion covers the whole order (every product), exactly as before; a
-- non-empty array restricts both the threshold and the discount to the
-- order lines of those products.
--
-- STATUS: run once in the Supabase SQL editor after 0005. Idempotent.
-- =============================================================================

alter table public.promotions
  add column if not exists applies_to jsonb not null default '[]'::jsonb;
