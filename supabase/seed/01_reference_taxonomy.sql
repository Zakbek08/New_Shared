-- ============================================================================
-- WalletWise — Seed 01: merchant category taxonomy
-- ============================================================================
-- The 13 categories here are the quick-category buttons on the purchase form.
--
-- MCC ranges are INDICATIVE ONLY. Card issuers decide how a merchant is coded
-- and their choice is authoritative. WalletWise surfaces this uncertainty to
-- the user rather than hiding it. See PRIVACY_NOTES.md and the in-app
-- "Privacy and Disclosures" screen.
-- ============================================================================

insert into public.merchant_categories
  (id, slug, display_name, display_order, icon_name, mcc_ranges)
values
  ('33333333-0000-4000-8000-000000000001', 'dining', 'Dining', 1, 'utensils',
    array['[5811,5814]'::int4range]),
  ('33333333-0000-4000-8000-000000000002', 'grocery', 'Grocery', 2, 'shopping-basket',
    array['[5411,5411]'::int4range, '[5422,5422]'::int4range, '[5451,5451]'::int4range,
          '[5499,5499]'::int4range]),
  ('33333333-0000-4000-8000-000000000003', 'gas', 'Gas', 3, 'fuel',
    array['[5541,5542]'::int4range, '[5983,5983]'::int4range]),
  ('33333333-0000-4000-8000-000000000004', 'airfare', 'Airfare', 4, 'plane',
    array['[3000,3350]'::int4range, '[4511,4511]'::int4range]),
  ('33333333-0000-4000-8000-000000000005', 'hotel', 'Hotel', 5, 'bed',
    array['[3501,3999]'::int4range, '[7011,7011]'::int4range]),
  ('33333333-0000-4000-8000-000000000006', 'general_travel', 'General travel', 6, 'globe',
    array['[4111,4112]'::int4range, '[4411,4411]'::int4range, '[4722,4723]'::int4range,
          '[7512,7513]'::int4range]),
  ('33333333-0000-4000-8000-000000000007', 'transit', 'Transit', 7, 'train',
    array['[4111,4131]'::int4range, '[4121,4121]'::int4range, '[7523,7523]'::int4range]),
  ('33333333-0000-4000-8000-000000000008', 'pharmacy', 'Pharmacy', 8, 'pill',
    array['[5912,5912]'::int4range, '[5122,5122]'::int4range]),
  ('33333333-0000-4000-8000-000000000009', 'online_shopping', 'Online shopping', 9, 'package',
    array['[5262,5262]'::int4range, '[5310,5311]'::int4range, '[5942,5942]'::int4range,
          '[5964,5969]'::int4range]),
  ('33333333-0000-4000-8000-000000000010', 'entertainment', 'Entertainment', 10, 'ticket',
    array['[7832,7832]'::int4range, '[7922,7922]'::int4range, '[7929,7929]'::int4range,
          '[7996,7999]'::int4range]),
  ('33333333-0000-4000-8000-000000000011', 'warehouse_club', 'Warehouse club', 11, 'warehouse',
    array['[5300,5300]'::int4range]),
  ('33333333-0000-4000-8000-000000000012', 'utilities', 'Utilities', 12, 'plug',
    array['[4900,4900]'::int4range, '[4814,4816]'::int4range]),
  ('33333333-0000-4000-8000-000000000013', 'other', 'Other', 13, 'circle-dot',
    array[]::int4range[])
on conflict (id) do nothing;
