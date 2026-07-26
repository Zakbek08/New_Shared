-- ============================================================================
-- WalletWise — Seed 02: demonstration sources, issuers, reward programs
-- ============================================================================
-- EVERYTHING IN THIS FILE IS FICTIONAL.
--
-- The issuers, card products and reward rates in the WalletWise seed data are
-- invented for development and testing. They do not describe, approximate or
-- imply the terms of any real financial product, and they must never be
-- presented to an end user as factual. Every row carries is_fictional = true so
-- the UI can badge it.
-- ============================================================================

insert into public.sources
  (id, label, url, publisher, document_type, published_on, retrieved_on,
   is_fictional, notes)
values
  ('88888888-0000-4000-8000-000000000001',
   'WalletWise fictional demonstration dataset v1',
   null, 'WalletWise', 'fictional_demo_data', '2026-07-01', '2026-07-01', true,
   'Invented rates for development and testing. Not a real product disclosure.'),
  ('88888888-0000-4000-8000-000000000002',
   'WalletWise fictional demonstration dataset v1 — stale sample',
   null, 'WalletWise', 'fictional_demo_data', '2024-01-15', '2024-01-15', true,
   'Deliberately old so the low-confidence / stale-source UI path has coverage.'),
  ('88888888-0000-4000-8000-000000000003',
   'WalletWise fictional demonstration dataset v1 — user-reported sample',
   null, 'WalletWise', 'user_submission', '2026-06-01', '2026-06-01', true,
   'Represents a rate a user typed in themselves. Medium confidence at best.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Fictional issuers. Invented names, neutral colours, no real brand marks.
-- ---------------------------------------------------------------------------
insert into public.issuers
  (id, slug, name, short_name, accent_color, country_code, is_fictional)
values
  ('11111111-0000-4000-8000-000000000001', 'northwind-financial',
   'DEMO — Northwind Financial', 'Northwind', '#2F5D62', 'US', true),
  ('11111111-0000-4000-8000-000000000002', 'cobalt-trust-bank',
   'DEMO — Cobalt Trust Bank', 'Cobalt', '#2B4C7E', 'US', true),
  ('11111111-0000-4000-8000-000000000003', 'meridian-card-company',
   'DEMO — Meridian Card Company', 'Meridian', '#6B4E71', 'US', true),
  ('11111111-0000-4000-8000-000000000004', 'harborline-bank',
   'DEMO — Harborline Bank', 'Harborline', '#3D6B5A', 'US', true),
  ('11111111-0000-4000-8000-000000000005', 'summit-ridge-credit',
   'DEMO — Summit Ridge Credit', 'Summit Ridge', '#7A5230', 'US', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Fictional reward programs.
--
-- default_cents_per_unit is a conservative placeholder. The engine ALWAYS
-- prefers the user's own valuation from user_reward_preferences when one
-- exists; these defaults only apply when the user has expressed no preference.
-- ---------------------------------------------------------------------------
insert into public.reward_programs
  (id, slug, name, issuer_id, unit, default_cents_per_unit,
   transfer_partners_count, is_fictional, notes)
values
  ('22222222-0000-4000-8000-000000000001', 'northwind-cash',
   'DEMO — Northwind Cash Back', '11111111-0000-4000-8000-000000000001',
   'usd', 1.0, 0, true, 'Statement-credit cash back. 1 unit = 1 US cent.'),
  ('22222222-0000-4000-8000-000000000002', 'cobalt-points',
   'DEMO — Cobalt Reward Points', '11111111-0000-4000-8000-000000000002',
   'points', 1.1, 8, true, 'Transferable points. Fictional default valuation.'),
  ('22222222-0000-4000-8000-000000000003', 'cobalt-cash',
   'DEMO — Cobalt Simple Cash', '11111111-0000-4000-8000-000000000002',
   'usd', 1.0, 0, true, 'Flat cash back.'),
  ('22222222-0000-4000-8000-000000000004', 'meridian-cash',
   'DEMO — Meridian Cash Rewards', '11111111-0000-4000-8000-000000000003',
   'usd', 1.0, 0, true, 'Flat cash back.'),
  ('22222222-0000-4000-8000-000000000005', 'meridian-miles',
   'DEMO — Meridian Traveller Miles', '11111111-0000-4000-8000-000000000003',
   'miles', 1.25, 12, true, 'Airline-transferable miles. Fictional valuation.'),
  ('22222222-0000-4000-8000-000000000006', 'harborline-stay-points',
   'DEMO — Harborline Stay Points', '11111111-0000-4000-8000-000000000004',
   'points', 0.6, 0, true, 'Hotel loyalty currency. Low per-unit value by design.'),
  ('22222222-0000-4000-8000-000000000007', 'harborline-cash',
   'DEMO — Harborline Cash Back', '11111111-0000-4000-8000-000000000004',
   'usd', 1.0, 0, true, 'Flat cash back.'),
  ('22222222-0000-4000-8000-000000000008', 'summit-sky-miles',
   'DEMO — Summit Sky Alliance Miles', '11111111-0000-4000-8000-000000000005',
   'miles', 1.3, 3, true, 'Single-airline miles. Fictional valuation.'),
  ('22222222-0000-4000-8000-000000000009', 'summit-voyager-miles',
   'DEMO — Summit Voyager Miles', '11111111-0000-4000-8000-000000000005',
   'miles', 1.0, 6, true, 'Flexible travel currency, redeemable at 1 cent.')
on conflict (id) do nothing;
