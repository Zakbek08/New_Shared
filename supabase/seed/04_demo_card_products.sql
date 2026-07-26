-- ============================================================================
-- WalletWise — Seed 04: ten fictional card products
-- ============================================================================
-- EVERY RATE BELOW IS INVENTED.
--
-- These ten products exist so the rewards engine, the recommendation UI and
-- the test suite have realistic *shapes* to work with. They are not modelled
-- on, and must not be presented as, any real credit card. Each row carries
-- is_fictional = true and each name is prefixed "DEMO —".
--
-- Archetype coverage (one per required demo category):
--   01 Grocery            06 Flat rate
--   02 Dining             07 Mobile wallet
--   03 Gas                08 Online shopping
--   04 Travel             09 Hotel
--   05 Rotating category  10 Airline
-- ============================================================================

insert into public.card_products
  (id, slug, issuer_id, reward_program_id, name, card_kind, network,
   annual_fee_usd, foreign_transaction_fee_percent, supported_country_codes,
   summary, is_fictional, is_active)
values
  -- 01 Grocery --------------------------------------------------------------
  ('55555555-0000-4000-8000-000000000001', 'demo-northwind-everyday-grocery',
   '11111111-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001',
   'DEMO — Northwind Everyday Grocery Card', 'personal_credit', 'other',
   95.00, 3.000, array['US']::char(2)[],
   'Fictional grocery specialist: elevated cash back at supermarkets up to an annual cap, 1% elsewhere.',
   true, true),

  -- 02 Dining ---------------------------------------------------------------
  ('55555555-0000-4000-8000-000000000002', 'demo-cobalt-table-dining',
   '11111111-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002',
   'DEMO — Cobalt Table Dining Card', 'personal_credit', 'other',
   0.00, 2.700, array['US', 'CA']::char(2)[],
   'Fictional dining card earning transferable points at restaurants, with a capped online grocery bonus.',
   true, true),

  -- 03 Gas ------------------------------------------------------------------
  ('55555555-0000-4000-8000-000000000003', 'demo-meridian-fuel-advantage',
   '11111111-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000004',
   'DEMO — Meridian Fuel Advantage Card', 'personal_credit', 'other',
   0.00, 3.000, array['US']::char(2)[],
   'Fictional gas card with a quarterly-capped fuel bonus. Station convenience stores are excluded.',
   true, true),

  -- 04 Travel ---------------------------------------------------------------
  ('55555555-0000-4000-8000-000000000004', 'demo-summit-ridge-voyager',
   '11111111-0000-4000-8000-000000000005', '22222222-0000-4000-8000-000000000009',
   'DEMO — Summit Ridge Voyager Travel Card', 'personal_credit', 'other',
   150.00, 0.000, array['US', 'CA', 'GB', 'FR', 'DE', 'JP', 'MX']::char(2)[],
   'Fictional general travel card: flexible miles on all travel categories and no foreign transaction fee.',
   true, true),

  -- 05 Rotating category ----------------------------------------------------
  ('55555555-0000-4000-8000-000000000005', 'demo-harborline-quarterly-rotator',
   '11111111-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000007',
   'DEMO — Harborline Quarterly Rotator Card', 'personal_credit', 'other',
   0.00, 3.000, array['US']::char(2)[],
   'Fictional rotating-category card. Each quarter must be activated by the cardholder before it earns.',
   true, true),

  -- 06 Flat rate ------------------------------------------------------------
  ('55555555-0000-4000-8000-000000000006', 'demo-cobalt-everyday-flat',
   '11111111-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000003',
   'DEMO — Cobalt Everyday Flat Card', 'personal_credit', 'other',
   0.00, 3.000, array['US']::char(2)[],
   'Fictional flat-rate card: the same cash back rate on every purchase, with no categories or caps.',
   true, true),

  -- 07 Mobile wallet --------------------------------------------------------
  ('55555555-0000-4000-8000-000000000007', 'demo-northwind-tappay',
   '11111111-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001',
   'DEMO — Northwind TapPay Card', 'personal_credit', 'other',
   0.00, 3.000, array['US']::char(2)[],
   'Fictional mobile-wallet card: a monthly-capped bonus when paid with Apple Pay, Google Pay or Samsung Pay.',
   true, true),

  -- 08 Online shopping ------------------------------------------------------
  ('55555555-0000-4000-8000-000000000008', 'demo-meridian-online-shopper',
   '11111111-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000004',
   'DEMO — Meridian Online Shopper Card', 'personal_credit', 'other',
   0.00, 3.000, array['US']::char(2)[],
   'Fictional online-shopping card with an annual cap, plus a stacking introductory online bonus.',
   true, true),

  -- 09 Hotel ----------------------------------------------------------------
  ('55555555-0000-4000-8000-000000000009', 'demo-harborline-stay-rewards',
   '11111111-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000006',
   'DEMO — Harborline Stay Rewards Card', 'personal_credit', 'other',
   99.00, 3.000, array['US', 'CA', 'GB']::char(2)[],
   'Fictional hotel co-brand: a large points multiple at Harborline properties plus an annual statement credit.',
   true, true),

  -- 10 Airline --------------------------------------------------------------
  ('55555555-0000-4000-8000-000000000010', 'demo-summit-sky-alliance',
   '11111111-0000-4000-8000-000000000005', '22222222-0000-4000-8000-000000000008',
   'DEMO — Summit Sky Alliance Airline Card', 'personal_credit', 'other',
   95.00, 0.000, array['US', 'CA', 'GB', 'FR', 'DE', 'JP']::char(2)[],
   'Fictional airline co-brand: elevated miles on Summit Sky airfare and through the issuer travel portal.',
   true, true)
on conflict (id) do nothing;
