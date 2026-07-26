-- ============================================================================
-- WalletWise — Seed 05: fictional reward rules and their conditions
-- ============================================================================
-- EVERY RATE, CAP AND DATE BELOW IS INVENTED FOR TESTING.
--
-- UUID convention (so the test suite can reference rows stably):
--   reward_rules            66666666-0000-4000-8000-0000000<CC><RR>
--   reward_rule_conditions  77777777-0000-4000-8000-0000000<CC><RR><S>
-- where CC = card index 01..10, RR = rule index, S = condition index.
--
-- Rule semantics recap (see REWARDS_ENGINE.md):
--   * A rule qualifies only when EVERY attached condition row is satisfied.
--   * Within a condition row, array fields are OR-ed.
--   * Within a stack_group the engine keeps the single best-earning qualifying
--     rule. Rules with is_stackable = true are added on top.
--   * post_cap_rate NULL means "fall through to this card's base rule".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 01  DEMO — Northwind Everyday Grocery Card  (archetype: grocery)
-- ---------------------------------------------------------------------------
insert into public.reward_rules
  (id, card_product_id, reward_program_id, label, kind, reward_type, reward_unit,
   base_rate, bonus_rate, priority, stack_group, is_stackable,
   cap_amount, cap_applies_to, cap_period, post_cap_rate,
   starts_at, ends_at, requires_enrollment, source_id, last_verified_at,
   verification_status, notes)
values
  ('66666666-0000-4000-8000-000000000101', '55555555-0000-4000-8000-000000000001',
   '22222222-0000-4000-8000-000000000001',
   '1% cash back on everything else', 'base', 'cash_back_percent', 'usd',
   1.000000, 0, 10, 'category', false,
   null, 'spend', 'none', null,
   null, null, false, '88888888-0000-4000-8000-000000000001',
   '2026-07-01T00:00:00Z', 'verified', 'Fictional base earn rate.'),

  ('66666666-0000-4000-8000-000000000102', '55555555-0000-4000-8000-000000000001',
   '22222222-0000-4000-8000-000000000001',
   '6% cash back at US supermarkets, on up to $6,000 per calendar year',
   'category_bonus', 'cash_back_percent', 'usd',
   6.000000, 0, 100, 'category', false,
   6000.00, 'spend', 'calendar_year', 1.000000,
   null, null, false, '88888888-0000-4000-8000-000000000001',
   '2026-07-01T00:00:00Z', 'verified',
   'Warehouse clubs and superstores are excluded — see the attached condition.')
on conflict (id) do nothing;

insert into public.reward_rule_conditions
  (id, reward_rule_id, merchant_category_id, excluded_merchant_ids,
   included_country_codes, notes)
values
  ('77777777-0000-4000-8000-000000001021', '66666666-0000-4000-8000-000000000102',
   '33333333-0000-4000-8000-000000000002',
   array['44444444-0000-4000-8000-000000000002']::uuid[],
   array['US']::char(2)[],
   'US supermarkets only. BulkBarn Warehouse is excluded because it codes as a warehouse club.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 02  DEMO — Cobalt Table Dining Card  (archetype: dining)
-- ---------------------------------------------------------------------------
insert into public.reward_rules
  (id, card_product_id, reward_program_id, label, kind, reward_type, reward_unit,
   base_rate, bonus_rate, priority, stack_group, is_stackable,
   cap_amount, cap_applies_to, cap_period, post_cap_rate,
   requires_enrollment, source_id, last_verified_at, verification_status, notes)
values
  ('66666666-0000-4000-8000-000000000201', '55555555-0000-4000-8000-000000000002',
   '22222222-0000-4000-8000-000000000002',
   '1x point per dollar on everything else', 'base', 'points_per_dollar', 'points',
   1.000000, 0, 10, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Fictional base earn rate.'),

  ('66666666-0000-4000-8000-000000000202', '55555555-0000-4000-8000-000000000002',
   '22222222-0000-4000-8000-000000000002',
   '4x points at restaurants', 'category_bonus', 'points_per_dollar', 'points',
   4.000000, 0, 100, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Uncapped fictional dining bonus.'),

  ('66666666-0000-4000-8000-000000000203', '55555555-0000-4000-8000-000000000002',
   '22222222-0000-4000-8000-000000000002',
   '3x points on online grocery orders, on up to $2,000 per calendar year',
   'category_bonus', 'points_per_dollar', 'points',
   3.000000, 0, 90, 'category', false,
   2000.00, 'spend', 'calendar_year', 1.000000,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Online-only. In-store grocery earns the base rate.')
on conflict (id) do nothing;

insert into public.reward_rule_conditions
  (id, reward_rule_id, merchant_category_id, channel, excluded_merchant_ids, notes)
values
  ('77777777-0000-4000-8000-000000002021', '66666666-0000-4000-8000-000000000202',
   '33333333-0000-4000-8000-000000000001', 'either', '{}'::uuid[],
   'Restaurants, cafes and bars.'),
  ('77777777-0000-4000-8000-000000002031', '66666666-0000-4000-8000-000000000203',
   '33333333-0000-4000-8000-000000000002', 'online',
   array['44444444-0000-4000-8000-000000000002']::uuid[],
   'Online grocery only; warehouse clubs excluded.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 03  DEMO — Meridian Fuel Advantage Card  (archetype: gas)
-- ---------------------------------------------------------------------------
insert into public.reward_rules
  (id, card_product_id, reward_program_id, label, kind, reward_type, reward_unit,
   base_rate, bonus_rate, priority, stack_group, is_stackable,
   cap_amount, cap_applies_to, cap_period, post_cap_rate,
   requires_enrollment, source_id, last_verified_at, verification_status, notes)
values
  ('66666666-0000-4000-8000-000000000301', '55555555-0000-4000-8000-000000000003',
   '22222222-0000-4000-8000-000000000004',
   '1% cash back on everything else', 'base', 'cash_back_percent', 'usd',
   1.000000, 0, 10, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Fictional base earn rate.'),

  ('66666666-0000-4000-8000-000000000302', '55555555-0000-4000-8000-000000000003',
   '22222222-0000-4000-8000-000000000004',
   '5% cash back at gas stations, on up to $2,000 per quarter',
   'category_bonus', 'cash_back_percent', 'usd',
   5.000000, 0, 100, 'category', false,
   2000.00, 'spend', 'quarterly', 1.000000,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Station convenience stores are excluded — see the attached condition.'),

  ('66666666-0000-4000-8000-000000000303', '55555555-0000-4000-8000-000000000003',
   '22222222-0000-4000-8000-000000000004',
   '2% cash back at supermarkets', 'category_bonus', 'cash_back_percent', 'usd',
   2.000000, 0, 90, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Uncapped secondary category.')
on conflict (id) do nothing;

insert into public.reward_rule_conditions
  (id, reward_rule_id, merchant_category_id, excluded_merchant_ids,
   included_country_codes, notes)
values
  ('77777777-0000-4000-8000-000000003021', '66666666-0000-4000-8000-000000000302',
   '33333333-0000-4000-8000-000000000003',
   array['44444444-0000-4000-8000-000000000006']::uuid[],
   array['US']::char(2)[],
   'Fuelworks Express Mart is excluded: it codes as a misc. food store, not a service station.'),
  ('77777777-0000-4000-8000-000000003031', '66666666-0000-4000-8000-000000000303',
   '33333333-0000-4000-8000-000000000002', '{}'::uuid[],
   array['US']::char(2)[], 'US supermarkets.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 04  DEMO — Summit Ridge Voyager Travel Card  (archetype: travel)
-- ---------------------------------------------------------------------------
insert into public.reward_rules
  (id, card_product_id, reward_program_id, label, kind, reward_type, reward_unit,
   base_rate, bonus_rate, priority, stack_group, is_stackable,
   cap_amount, cap_applies_to, cap_period, post_cap_rate,
   requires_enrollment, source_id, last_verified_at, verification_status, notes)
values
  ('66666666-0000-4000-8000-000000000401', '55555555-0000-4000-8000-000000000004',
   '22222222-0000-4000-8000-000000000009',
   '1x mile per dollar on everything else', 'base', 'miles_per_dollar', 'miles',
   1.000000, 0, 10, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Fictional base earn rate.'),

  ('66666666-0000-4000-8000-000000000402', '55555555-0000-4000-8000-000000000004',
   '22222222-0000-4000-8000-000000000009',
   '3x miles on airfare, hotels, transit and general travel',
   'category_bonus', 'miles_per_dollar', 'miles',
   3.000000, 0, 100, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Multi-category bonus expressed as an OR-list.'),

  ('66666666-0000-4000-8000-000000000403', '55555555-0000-4000-8000-000000000004',
   '22222222-0000-4000-8000-000000000009',
   '2x miles at restaurants worldwide', 'category_bonus', 'miles_per_dollar', 'miles',
   2.000000, 0, 90, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Explicitly worldwide, unlike the US-only grocery bonuses above.')
on conflict (id) do nothing;

insert into public.reward_rule_conditions
  (id, reward_rule_id, included_category_ids, merchant_category_id, notes)
values
  ('77777777-0000-4000-8000-000000004021', '66666666-0000-4000-8000-000000000402',
   array[
     '33333333-0000-4000-8000-000000000004',
     '33333333-0000-4000-8000-000000000005',
     '33333333-0000-4000-8000-000000000006',
     '33333333-0000-4000-8000-000000000007'
   ]::uuid[], null,
   'Airfare OR hotel OR general travel OR transit.'),
  ('77777777-0000-4000-8000-000000004031', '66666666-0000-4000-8000-000000000403',
   '{}'::uuid[], '33333333-0000-4000-8000-000000000001',
   'No country restriction: this bonus applies abroad too.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 05  DEMO — Harborline Quarterly Rotator Card  (archetype: rotating category)
-- ---------------------------------------------------------------------------
-- Each quarter is a SEPARATE rule with its own validity window. Condition rows
-- AND together, so four quarters could never live on one rule.
--
-- Q2 2026 is deliberately expired and Q4 2026 deliberately unverified, so the
-- expired-rule and low-confidence paths have seed coverage.
insert into public.reward_rules
  (id, card_product_id, reward_program_id, label, kind, reward_type, reward_unit,
   base_rate, bonus_rate, priority, stack_group, is_stackable,
   cap_amount, cap_applies_to, cap_period, post_cap_rate,
   starts_at, ends_at, requires_enrollment, enrollment_notes,
   source_id, last_verified_at, verification_status, notes)
values
  ('66666666-0000-4000-8000-000000000501', '55555555-0000-4000-8000-000000000005',
   '22222222-0000-4000-8000-000000000007',
   '1% cash back on everything else', 'base', 'cash_back_percent', 'usd',
   1.000000, 0, 10, 'category', false,
   null, 'spend', 'none', null,
   null, null, false, null,
   '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Fictional base earn rate.'),

  ('66666666-0000-4000-8000-000000000502', '55555555-0000-4000-8000-000000000005',
   '22222222-0000-4000-8000-000000000007',
   'Q2 2026: 5% cash back on dining and entertainment, on up to $1,500 in the quarter',
   'rotating_category', 'cash_back_percent', 'usd',
   5.000000, 0, 100, 'category', false,
   1500.00, 'spend', 'quarterly', 1.000000,
   '2026-04-01T00:00:00Z', '2026-07-01T00:00:00Z', true,
   'Cardholder must activate the quarter before the first qualifying purchase.',
   '88888888-0000-4000-8000-000000000001', '2026-04-01T00:00:00Z',
   'retired', 'EXPIRED quarter, kept for history and for the expired-rule test path.'),

  ('66666666-0000-4000-8000-000000000503', '55555555-0000-4000-8000-000000000005',
   '22222222-0000-4000-8000-000000000007',
   'Q3 2026: 5% cash back on grocery and gas, on up to $1,500 in the quarter',
   'rotating_category', 'cash_back_percent', 'usd',
   5.000000, 0, 100, 'category', false,
   1500.00, 'spend', 'quarterly', 1.000000,
   '2026-07-01T00:00:00Z', '2026-10-01T00:00:00Z', true,
   'Cardholder must activate the quarter before the first qualifying purchase.',
   '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'ACTIVE quarter in the seed dataset.'),

  ('66666666-0000-4000-8000-000000000504', '55555555-0000-4000-8000-000000000005',
   '22222222-0000-4000-8000-000000000007',
   'Q4 2026: 5% cash back on online shopping and warehouse clubs, on up to $1,500 in the quarter',
   'rotating_category', 'cash_back_percent', 'usd',
   5.000000, 0, 100, 'category', false,
   1500.00, 'spend', 'quarterly', 1.000000,
   '2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z', true,
   'Categories announced but not yet confirmed against a primary source.',
   '88888888-0000-4000-8000-000000000003', null,
   'unverified', 'FUTURE quarter. Deliberately unverified to exercise low confidence.')
on conflict (id) do nothing;

insert into public.reward_rule_conditions
  (id, reward_rule_id, included_category_ids, starts_at, ends_at, notes)
values
  ('77777777-0000-4000-8000-000000005021', '66666666-0000-4000-8000-000000000502',
   array[
     '33333333-0000-4000-8000-000000000001',
     '33333333-0000-4000-8000-000000000010'
   ]::uuid[], '2026-04-01T00:00:00Z', '2026-07-01T00:00:00Z',
   'Dining OR entertainment.'),
  ('77777777-0000-4000-8000-000000005031', '66666666-0000-4000-8000-000000000503',
   array[
     '33333333-0000-4000-8000-000000000002',
     '33333333-0000-4000-8000-000000000003'
   ]::uuid[], '2026-07-01T00:00:00Z', '2026-10-01T00:00:00Z',
   'Grocery OR gas.'),
  ('77777777-0000-4000-8000-000000005041', '66666666-0000-4000-8000-000000000504',
   array[
     '33333333-0000-4000-8000-000000000009',
     '33333333-0000-4000-8000-000000000011'
   ]::uuid[], '2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z',
   'Online shopping OR warehouse club.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 06  DEMO — Cobalt Everyday Flat Card  (archetype: flat rate)
-- ---------------------------------------------------------------------------
-- Intentionally has exactly one unconditional rule. This is the card the
-- engine falls back to when nothing else qualifies.
insert into public.reward_rules
  (id, card_product_id, reward_program_id, label, kind, reward_type, reward_unit,
   base_rate, bonus_rate, priority, stack_group, is_stackable,
   cap_amount, cap_applies_to, cap_period, post_cap_rate,
   requires_enrollment, source_id, last_verified_at, verification_status, notes)
values
  ('66666666-0000-4000-8000-000000000601', '55555555-0000-4000-8000-000000000006',
   '22222222-0000-4000-8000-000000000003',
   '2% cash back on every purchase', 'base', 'cash_back_percent', 'usd',
   2.000000, 0, 10, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Unconditional: no category, cap, channel or country restriction.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 07  DEMO — Northwind TapPay Card  (archetype: mobile wallet)
-- ---------------------------------------------------------------------------
insert into public.reward_rules
  (id, card_product_id, reward_program_id, label, kind, reward_type, reward_unit,
   base_rate, bonus_rate, priority, stack_group, is_stackable,
   cap_amount, cap_applies_to, cap_period, post_cap_rate,
   requires_enrollment, source_id, last_verified_at, verification_status, notes)
values
  ('66666666-0000-4000-8000-000000000701', '55555555-0000-4000-8000-000000000007',
   '22222222-0000-4000-8000-000000000001',
   '1% cash back on everything else', 'base', 'cash_back_percent', 'usd',
   1.000000, 0, 10, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Fictional base earn rate.'),

  ('66666666-0000-4000-8000-000000000702', '55555555-0000-4000-8000-000000000007',
   '22222222-0000-4000-8000-000000000001',
   '3% cash back when you pay with a mobile wallet, on up to $1,000 per month',
   'mobile_wallet_bonus', 'cash_back_percent', 'usd',
   3.000000, 0, 100, 'category', false,
   1000.00, 'spend', 'monthly', 1.000000,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Applies to Apple Pay, Google Pay and Samsung Pay only.')
on conflict (id) do nothing;

insert into public.reward_rule_conditions
  (id, reward_rule_id, included_payment_methods, notes)
values
  ('77777777-0000-4000-8000-000000007021', '66666666-0000-4000-8000-000000000702',
   array['apple_pay', 'google_pay', 'samsung_pay']::public.payment_method[],
   'Contactless taps of the physical card do NOT qualify on this fictional product.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 08  DEMO — Meridian Online Shopper Card  (archetype: online shopping)
-- ---------------------------------------------------------------------------
insert into public.reward_rules
  (id, card_product_id, reward_program_id, label, kind, reward_type, reward_unit,
   base_rate, bonus_rate, priority, stack_group, is_stackable,
   cap_amount, cap_applies_to, cap_period, post_cap_rate,
   starts_at, ends_at, requires_enrollment,
   source_id, last_verified_at, verification_status, notes)
values
  ('66666666-0000-4000-8000-000000000801', '55555555-0000-4000-8000-000000000008',
   '22222222-0000-4000-8000-000000000004',
   '1% cash back on everything else', 'base', 'cash_back_percent', 'usd',
   1.000000, 0, 10, 'category', false,
   null, 'spend', 'none', null,
   null, null, false,
   '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Fictional base earn rate.'),

  ('66666666-0000-4000-8000-000000000802', '55555555-0000-4000-8000-000000000008',
   '22222222-0000-4000-8000-000000000004',
   '5% cash back on online retail purchases, on up to $3,000 per calendar year',
   'category_bonus', 'cash_back_percent', 'usd',
   5.000000, 0, 100, 'category', false,
   3000.00, 'spend', 'calendar_year', 1.000000,
   null, null, false,
   '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Online channel only.'),

  ('66666666-0000-4000-8000-000000000803', '55555555-0000-4000-8000-000000000008',
   '22222222-0000-4000-8000-000000000004',
   'Introductory: an extra 2% on all online purchases through 31 December 2026',
   'intro_bonus', 'cash_back_percent', 'usd',
   2.000000, 0, 150, 'intro', true,
   null, 'spend', 'none', null,
   '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', false,
   '88888888-0000-4000-8000-000000000003', '2026-06-01T00:00:00Z',
   'user_reported',
   'STACKS on top of the category rule. Reported by a user, not confirmed — medium confidence.')
on conflict (id) do nothing;

insert into public.reward_rule_conditions
  (id, reward_rule_id, merchant_category_id, channel, notes)
values
  ('77777777-0000-4000-8000-000000008021', '66666666-0000-4000-8000-000000000802',
   '33333333-0000-4000-8000-000000000009', 'online', 'Online retail only.'),
  ('77777777-0000-4000-8000-000000008031', '66666666-0000-4000-8000-000000000803',
   null, 'online', 'Any online purchase, any category.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 09  DEMO — Harborline Stay Rewards Card  (archetype: hotel)
-- ---------------------------------------------------------------------------
insert into public.reward_rules
  (id, card_product_id, reward_program_id, label, kind, reward_type, reward_unit,
   base_rate, bonus_rate, fixed_amount_usd, priority, stack_group, is_stackable,
   cap_amount, cap_applies_to, cap_period, post_cap_rate,
   requires_enrollment, source_id, last_verified_at, verification_status, notes)
values
  ('66666666-0000-4000-8000-000000000901', '55555555-0000-4000-8000-000000000009',
   '22222222-0000-4000-8000-000000000006',
   '1x Stay Point per dollar on everything else', 'base', 'points_per_dollar', 'points',
   1.000000, 0, null, 10, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Stay Points are worth much less per unit than transferable points.'),

  ('66666666-0000-4000-8000-000000000902', '55555555-0000-4000-8000-000000000009',
   '22222222-0000-4000-8000-000000000006',
   '10x Stay Points at Harborline properties', 'merchant_specific',
   'points_per_dollar', 'points',
   10.000000, 0, null, 120, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'A high multiple on a low-value currency — a good ranking test case.'),

  ('66666666-0000-4000-8000-000000000903', '55555555-0000-4000-8000-000000000009',
   '22222222-0000-4000-8000-000000000006',
   '2x Stay Points on other travel', 'category_bonus', 'points_per_dollar', 'points',
   2.000000, 0, null, 90, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000002', '2024-01-15T00:00:00Z',
   'stale', 'DELIBERATELY STALE source so the stale-verification UI path has coverage.'),

  ('66666666-0000-4000-8000-000000000904', '55555555-0000-4000-8000-000000000009',
   '22222222-0000-4000-8000-000000000006',
   '$50 statement credit each cardmember year on Harborline stays',
   'statement_credit', 'statement_credit', 'usd',
   0, 0, 50.00, 200, 'credit', true,
   50.00, 'reward', 'cardmember_year', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'STACKS with the points rules. Capped at the credit amount itself.')
on conflict (id) do nothing;

insert into public.reward_rule_conditions
  (id, reward_rule_id, included_merchant_ids, included_category_ids,
   min_amount_usd, notes)
values
  ('77777777-0000-4000-8000-000000009021', '66666666-0000-4000-8000-000000000902',
   array['44444444-0000-4000-8000-000000000008']::uuid[], '{}'::uuid[], null,
   'Harborline-operated properties only.'),
  ('77777777-0000-4000-8000-000000009031', '66666666-0000-4000-8000-000000000903',
   '{}'::uuid[],
   array[
     '33333333-0000-4000-8000-000000000004',
     '33333333-0000-4000-8000-000000000005',
     '33333333-0000-4000-8000-000000000006',
     '33333333-0000-4000-8000-000000000007'
   ]::uuid[], null,
   'Airfare OR hotel OR general travel OR transit.'),
  ('77777777-0000-4000-8000-000000009041', '66666666-0000-4000-8000-000000000904',
   array['44444444-0000-4000-8000-000000000008']::uuid[], '{}'::uuid[], 100.00,
   'Applies to Harborline stays of $100 or more.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 10  DEMO — Summit Sky Alliance Airline Card  (archetype: airline)
-- ---------------------------------------------------------------------------
insert into public.reward_rules
  (id, card_product_id, reward_program_id, label, kind, reward_type, reward_unit,
   base_rate, bonus_rate, priority, stack_group, is_stackable,
   cap_amount, cap_applies_to, cap_period, post_cap_rate,
   requires_enrollment, source_id, last_verified_at, verification_status, notes)
values
  ('66666666-0000-4000-8000-000000001001', '55555555-0000-4000-8000-000000000010',
   '22222222-0000-4000-8000-000000000008',
   '1x Alliance Mile per dollar on everything else', 'base',
   'miles_per_dollar', 'miles',
   1.000000, 0, 10, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Fictional base earn rate.'),

  ('66666666-0000-4000-8000-000000001002', '55555555-0000-4000-8000-000000000010',
   '22222222-0000-4000-8000-000000000008',
   '3x Alliance Miles on Summit Sky Airways tickets', 'merchant_specific',
   'miles_per_dollar', 'miles',
   3.000000, 0, 120, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Airline co-brand bonus on the issuing airline only.'),

  ('66666666-0000-4000-8000-000000001003', '55555555-0000-4000-8000-000000000010',
   '22222222-0000-4000-8000-000000000008',
   '5x Alliance Miles when booked through the Summit Sky travel portal',
   'travel_portal_bonus', 'miles_per_dollar', 'miles',
   5.000000, 0, 130, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Requires the purchase to be routed through the issuer portal.'),

  ('66666666-0000-4000-8000-000000001004', '55555555-0000-4000-8000-000000000010',
   '22222222-0000-4000-8000-000000000008',
   '2x Alliance Miles on hotels, transit and general travel',
   'category_bonus', 'miles_per_dollar', 'miles',
   2.000000, 0, 90, 'category', false,
   null, 'spend', 'none', null,
   false, '88888888-0000-4000-8000-000000000001', '2026-07-01T00:00:00Z',
   'verified', 'Excludes airfare, which is covered by the co-brand rule above.')
on conflict (id) do nothing;

insert into public.reward_rule_conditions
  (id, reward_rule_id, included_merchant_ids, included_category_ids,
   included_payment_methods, notes)
values
  ('77777777-0000-4000-8000-000000010021', '66666666-0000-4000-8000-000000001002',
   array['44444444-0000-4000-8000-000000000007']::uuid[], '{}'::uuid[],
   '{}'::public.payment_method[], 'Summit Sky Airways only.'),
  ('77777777-0000-4000-8000-000000010031', '66666666-0000-4000-8000-000000001003',
   '{}'::uuid[], '{}'::uuid[],
   array['issuer_travel_portal']::public.payment_method[],
   'Booked through the issuer travel portal.'),
  ('77777777-0000-4000-8000-000000010041', '66666666-0000-4000-8000-000000001004',
   '{}'::uuid[],
   array[
     '33333333-0000-4000-8000-000000000005',
     '33333333-0000-4000-8000-000000000006',
     '33333333-0000-4000-8000-000000000007'
   ]::uuid[], '{}'::public.payment_method[],
   'Hotel OR general travel OR transit. Airfare deliberately omitted.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verification history for the two rules whose provenance the UI highlights.
-- ---------------------------------------------------------------------------
insert into public.verification_history
  (reward_rule_id, source_id, previous_status, new_status,
   verified_base_rate, verified_bonus_rate, verified_at, note)
values
  ('66666666-0000-4000-8000-000000000102', '88888888-0000-4000-8000-000000000001',
   'unverified', 'verified', 6.000000, 0, '2026-07-01T00:00:00Z',
   'Fictional demo dataset: initial load.'),
  ('66666666-0000-4000-8000-000000000903', '88888888-0000-4000-8000-000000000002',
   'verified', 'stale', 2.000000, 0, '2026-07-01T00:00:00Z',
   'Source is older than the 18-month freshness window; downgraded to stale.'),
  ('66666666-0000-4000-8000-000000000803', '88888888-0000-4000-8000-000000000003',
   'unverified', 'user_reported', 2.000000, 0, '2026-06-01T00:00:00Z',
   'Reported by a cardholder. Needs confirmation against a primary source.')
on conflict do nothing;
