-- ============================================================================
-- WalletWise — Seed 03: fictional merchants
-- ============================================================================
-- All merchant names below are invented. Two of them intentionally carry
-- has_ambiguous_coding = true so the amber "merchant coding is uncertain"
-- warning has real seed coverage:
--
--   * BulkBarn Warehouse       — superstores frequently code as 5300
--                                (warehouse club) rather than 5411 (grocery),
--                                so a grocery bonus may not apply.
--   * Fuelworks Express Mart   — station convenience stores sometimes code as
--                                5499 (misc. food) rather than 5541 (gas).
-- ============================================================================

insert into public.merchants
  (id, slug, display_name, aliases, primary_category_id, known_mcc,
   mcc_confidence, country_code, has_ambiguous_coding, is_online_only,
   source_id, is_fictional)
values
  -- Grocery ----------------------------------------------------------------
  ('44444444-0000-4000-8000-000000000001', 'greenleaf-market',
   'DEMO — Greenleaf Market', array['greenleaf', 'green leaf market'],
   '33333333-0000-4000-8000-000000000002', 5411, 'high', 'US', false, false,
   '88888888-0000-4000-8000-000000000001', true),
  ('44444444-0000-4000-8000-000000000002', 'bulkbarn-warehouse',
   'DEMO — BulkBarn Warehouse', array['bulkbarn', 'bulk barn'],
   '33333333-0000-4000-8000-000000000011', 5300, 'medium', 'US', true, false,
   '88888888-0000-4000-8000-000000000001', true),

  -- Dining -----------------------------------------------------------------
  ('44444444-0000-4000-8000-000000000003', 'trattoria-nove',
   'DEMO — Trattoria Nove', array['trattoria 9', 'nove'],
   '33333333-0000-4000-8000-000000000001', 5812, 'high', 'US', false, false,
   '88888888-0000-4000-8000-000000000001', true),
  ('44444444-0000-4000-8000-000000000004', 'kettle-and-crumb',
   'DEMO — Kettle & Crumb Cafe', array['kettle and crumb', 'kettle crumb'],
   '33333333-0000-4000-8000-000000000001', 5814, 'medium', 'US', false, false,
   '88888888-0000-4000-8000-000000000001', true),

  -- Gas --------------------------------------------------------------------
  ('44444444-0000-4000-8000-000000000005', 'fuelworks',
   'DEMO — Fuelworks', array['fuelworks fuel', 'fuel works'],
   '33333333-0000-4000-8000-000000000003', 5541, 'high', 'US', false, false,
   '88888888-0000-4000-8000-000000000001', true),
  ('44444444-0000-4000-8000-000000000006', 'fuelworks-express-mart',
   'DEMO — Fuelworks Express Mart', array['fuelworks express', 'express mart'],
   '33333333-0000-4000-8000-000000000003', 5499, 'low', 'US', true, false,
   '88888888-0000-4000-8000-000000000001', true),

  -- Travel -----------------------------------------------------------------
  ('44444444-0000-4000-8000-000000000007', 'summit-sky-airways',
   'DEMO — Summit Sky Airways', array['summit sky', 'summitsky'],
   '33333333-0000-4000-8000-000000000004', 3012, 'high', 'US', false, false,
   '88888888-0000-4000-8000-000000000001', true),
  ('44444444-0000-4000-8000-000000000008', 'harborline-grand-hotel',
   'DEMO — Harborline Grand Hotel', array['harborline grand', 'harborline hotel'],
   '33333333-0000-4000-8000-000000000005', 3502, 'high', 'US', false, false,
   '88888888-0000-4000-8000-000000000001', true),
  ('44444444-0000-4000-8000-000000000009', 'metrorail-transit',
   'DEMO — MetroRail Transit', array['metrorail', 'metro rail'],
   '33333333-0000-4000-8000-000000000007', 4111, 'high', 'US', false, false,
   '88888888-0000-4000-8000-000000000001', true),

  -- Retail / online --------------------------------------------------------
  ('44444444-0000-4000-8000-000000000010', 'orbital-goods',
   'DEMO — Orbital Goods', array['orbital', 'orbitalgoods'],
   '33333333-0000-4000-8000-000000000009', 5310, 'medium', 'US', false, true,
   '88888888-0000-4000-8000-000000000001', true),
  ('44444444-0000-4000-8000-000000000011', 'corner-remedy-pharmacy',
   'DEMO — Corner Remedy Pharmacy', array['corner remedy', 'corner pharmacy'],
   '33333333-0000-4000-8000-000000000008', 5912, 'high', 'US', false, false,
   '88888888-0000-4000-8000-000000000001', true),
  ('44444444-0000-4000-8000-000000000012', 'streamly-media',
   'DEMO — Streamly Media', array['streamly'],
   '33333333-0000-4000-8000-000000000010', 7841, 'medium', 'US', false, true,
   '88888888-0000-4000-8000-000000000001', true),
  ('44444444-0000-4000-8000-000000000013', 'powerco-utilities',
   'DEMO — PowerCo Utilities', array['powerco', 'power co'],
   '33333333-0000-4000-8000-000000000012', 4900, 'high', 'US', false, false,
   '88888888-0000-4000-8000-000000000001', true),

  -- Non-US, for the foreign-transaction-fee path -----------------------------
  ('44444444-0000-4000-8000-000000000014', 'maison-bleue-paris',
   'DEMO — Maison Bleue (Paris)', array['maison bleue'],
   '33333333-0000-4000-8000-000000000001', 5812, 'medium', 'FR', false, false,
   '88888888-0000-4000-8000-000000000001', true)
on conflict (id) do nothing;
