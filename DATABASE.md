# Database

Postgres via Supabase. Nineteen tables, all with row-level security.

- Migrations: `supabase/migrations/` (applied in filename order)
- Seed data: `supabase/seed.sql` → `supabase/seed/*.sql`
- TypeScript mirror: `src/types/database.ts`

```bash
supabase start      # local Postgres, Auth, Studio
supabase db reset   # re-apply migrations, reload the fictional seed catalog
```

## Migration order

| File                                      | Contents                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `…000100_extensions_and_enums.sql`        | `pgcrypto`, `citext`, the `walletwise_private` schema, 14 enum types                                     |
| `…000200_shared_functions.sql`            | `touch_updated_at`, role helpers, `cap_period_window()`                                                  |
| `…000300_reference_catalog.sql`           | `sources`, `issuers`, `reward_programs`, `card_products`, `merchant_categories`, `merchants`             |
| `…000400_reward_rules.sql`                | `reward_rules`, `reward_rule_conditions`, `verification_history`                                         |
| `…000500_users_and_wallet.sql`            | `users`, `user_cards`, `user_reward_preferences`, `user_rule_enrollments`, `user_offers`, `reward_usage` |
| `…000600_queries_and_recommendations.sql` | `purchase_queries`, `recommendations`, `recommendation_candidates`                                       |
| `…000700_audit_logs.sql`                  | `audit_logs` and the generic audit trigger                                                               |
| `…000800_row_level_security.sql`          | RLS enablement and every policy                                                                          |
| `20260702000100_custom_card_issuer.sql`   | Nullable `issuer_id` plus `custom_issuer_name`, so a member can create a private card                    |

## Conventions

| Concern      | Choice                                                                |
| ------------ | --------------------------------------------------------------------- |
| Primary keys | `uuid` with `gen_random_uuid()` (`audit_logs` uses a bigint identity) |
| Money        | `numeric(14,2)` for amounts, `numeric(14,4)` for computed values      |
| Rates        | `numeric(12,6)` — percent for cash back, multiplier for points/miles  |
| Reward units | `numeric(16,6)` — fractional points are kept, not silently rounded    |
| Timestamps   | `timestamptz`, defaulting to `now()`                                  |
| Dates        | `date` where no time exists (`account_opened_on`)                     |
| Soft delete  | `is_archived` / `is_active`; history is never hard-deleted            |
| `updated_at` | Maintained by a `touch_updated_at` trigger, not by the client         |

## Enums

| Type                  | Values                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_role`            | `member`, `catalog_editor`, `admin`                                                                                                                                                          |
| `card_network`        | `visa`, `mastercard`, `amex`, `discover`, `other`                                                                                                                                            |
| `card_kind`           | `personal_credit`, `business_credit`, `charge`, `store_credit`, `debit`                                                                                                                      |
| `reward_unit`         | `usd`, `points`, `miles`                                                                                                                                                                     |
| `reward_type`         | `cash_back_percent`, `points_per_dollar`, `miles_per_dollar`, `statement_credit`, `fixed_amount`                                                                                             |
| `rule_kind`           | `base`, `category_bonus`, `rotating_category`, `intro_bonus`, `online_bonus`, `mobile_wallet_bonus`, `travel_portal_bonus`, `merchant_specific`, `spend_threshold_bonus`, `statement_credit` |
| `cap_period`          | `none`, `monthly`, `quarterly`, `semi_annual`, `calendar_year`, `cardmember_year`, `lifetime`, `promotional_window`                                                                          |
| `purchase_channel`    | `online`, `in_store`, `either`                                                                                                                                                               |
| `payment_method`      | `physical_card`, `contactless_card`, `apple_pay`, `google_pay`, `samsung_pay`, `card_on_file`, `manual_entry`, `issuer_travel_portal`, `other`                                               |
| `verification_status` | `unverified`, `user_reported`, `verified`, `stale`, `disputed`, `retired`                                                                                                                    |
| `confidence_level`    | `high`, `medium`, `low`                                                                                                                                                                      |
| `category_match_kind` | `exact_merchant`, `known_mcc`, `user_selected`, `inferred`, `unknown`                                                                                                                        |
| `offer_status`        | `available`, `enrolled`, `redeemed`, `expired`, `declined`                                                                                                                                   |
| `enrollment_status`   | `not_enrolled`, `enrolled`, `ineligible`, `unknown`                                                                                                                                          |
| `audit_action`        | `insert`, `update`, `delete`, `verify`, `enroll`, `unenroll`, `export`, `admin_override`                                                                                                     |

`src/domain/enums.ts` mirrors these with exhaustiveness-checked tuples, so adding a value
in SQL without updating TypeScript is a typecheck failure.

---

## Reference catalog

### `sources`

Provenance for every rate. WalletWise reads sources manually — nothing fetches `url`.

| Column                         | Type      | Note                                                                                                           |
| ------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------- |
| `label`                        | `text`    | Human description                                                                                              |
| `url`                          | `text`    | CHECK: `https?://`. A citation, never fetched.                                                                 |
| `document_type`                | `text`    | `issuer_terms`, `issuer_marketing`, `network_documentation`, `user_submission`, `fictional_demo_data`, `other` |
| `published_on`, `retrieved_on` | `date`    |                                                                                                                |
| `is_fictional`                 | `boolean` | `true` for demo data, so the UI can badge it                                                                   |

### `issuers`

`slug` (unique, `^[a-z0-9-]+$`), `name`, `short_name`, `accent_color` (hex CHECK),
`country_code`, `is_fictional`.

A neutral accent colour only — WalletWise does not reproduce issuer logos or brand marks.

### `reward_programs`

The currency a card earns into.

| Column                    | Note                                                                             |
| ------------------------- | -------------------------------------------------------------------------------- |
| `unit`                    | `usd`, `points` or `miles`                                                       |
| `default_cents_per_unit`  | `numeric(12,6)`. Conservative default; **the user's own valuation always wins.** |
| `transfer_partners_count` | Context for the user, not an engine input                                        |

### `card_products`

| Column                            | Note                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `annual_fee_usd`                  | Displayed; not amortised into a per-purchase figure                                                                    |
| `foreign_transaction_fee_percent` | `0-20`. Subtracted by the engine on foreign-currency purchases.                                                        |
| `supported_country_codes`         | `char(2)[]`, default `{US}`                                                                                            |
| `issuer_id`                       | Required on a catalog row, always `null` on a user-defined one                                                         |
| `custom_issuer_name`              | The reverse: free text on a user-defined row, `null` on a catalog row                                                  |
| `is_user_defined`, `created_by`   | A user's custom card. Two CHECKs keep these consistent: a user-defined row must have an owner, a catalog row must not. |

`card_products_issuer_source` enforces the issuer split. It exists because `issuers` is
writable only by catalog editors, so a member creating a private card could never satisfy a
`NOT NULL` foreign key to it — and opening that table to members would mean letting anyone
write shared reference data for the sake of a display string.

### `merchant_categories`

The 13 quick-category buttons. `mcc_ranges` is `int4range[]` and **indicative only** — the
column comment says so, because issuer coding is authoritative and routinely differs.

### `merchants`

| Column                 | Note                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `aliases`              | `text[]`, GIN-indexed, for fuzzy classifier lookup                                                                                              |
| `known_mcc`            | Nullable. Unknown is a real, modelled state.                                                                                                    |
| `mcc_confidence`       | How much we trust `known_mcc`                                                                                                                   |
| `has_ambiguous_coding` | **When true the engine must attach a coding warning to every candidate.** Warehouse clubs and station convenience stores are the classic cases. |

---

## Reward rules

### `reward_rules`

Holds the numbers. The only source of truth for the engine.

| Column                                                      | Note                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `kind`                                                      | `rule_kind` — determines stacking behaviour                               |
| `reward_type`, `reward_unit`                                | Constrained to agree (see below)                                          |
| `base_rate`                                                 | Percent for cash back, multiplier for points/miles                        |
| `bonus_rate`                                                | Stacked on top when the rule qualifies                                    |
| `fixed_amount_usd`                                          | For `statement_credit` / `fixed_amount`                                   |
| `priority`                                                  | Higher wins within a `stack_group`                                        |
| `stack_group`                                               | Rules in the same group compete; the best one wins                        |
| `is_stackable`                                              | `true` adds on top of the group winner (intro bonuses, statement credits) |
| `cap_amount`, `cap_applies_to`, `cap_period`                | `cap_applies_to` is `spend` or `reward`                                   |
| `post_cap_rate`                                             | Rate past the cap. **`NULL` means fall through to the card's base rule.** |
| `starts_at`, `ends_at`                                      | Validity window; `NULL` is open-ended                                     |
| `requires_enrollment`, `enrollment_url`, `enrollment_notes` | Rotating categories and targeted offers                                   |
| `spend_threshold_usd`                                       | Cumulative spend before the rule unlocks                                  |
| `source_id`, `last_verified_at`, `verification_status`      | Provenance                                                                |

**Constraints:**

| Constraint                             | Guarantee                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `reward_rules_window_ordered`          | `starts_at < ends_at`                                                                                                                |
| `reward_rules_cap_needs_period`        | A cap amount implies a period                                                                                                        |
| `reward_rules_period_needs_cap`        | A period implies an amount                                                                                                           |
| `reward_rules_fixed_needs_amount`      | Credits name their amount                                                                                                            |
| `reward_rules_rate_needs_value`        | A rate rule earns something non-zero                                                                                                 |
| `reward_rules_unit_matches_type`       | `cash_back_percent`↔`usd`, `points_per_dollar`↔`points`, `miles_per_dollar`↔`miles`                                                  |
| `reward_rules_promo_window_bounded`    | A promotional cap has an end date                                                                                                    |
| `reward_rules_verified_needs_evidence` | **`verified` requires both a source and a verification date.** The database will not let a rule claim verification it does not have. |

### `reward_rule_conditions`

The predicate. **Every attached row must be satisfied (AND); array fields are OR-lists.**
A rule with no condition rows is unconditional — typical for `base`.

| Group     | Columns                                                                                       |
| --------- | --------------------------------------------------------------------------------------------- |
| Category  | `merchant_category_id` (scalar convenience), `included_category_ids`, `excluded_category_ids` |
| MCC       | `included_mccs`, `included_mcc_ranges`, `excluded_mccs`                                       |
| Merchant  | `included_merchant_ids`, `excluded_merchant_ids` (both GIN-indexed)                           |
| Geography | `included_country_codes`, `excluded_country_codes`, `included_currency_codes`                 |
| Context   | `channel`, `included_payment_methods`                                                         |
| Window    | `starts_at`, `ends_at`                                                                        |
| Amount    | `min_amount_usd`, `max_amount_usd`                                                            |

**Why one rule per rotating quarter:** condition rows AND together, so four rows carrying
four different date windows could never all be true. Each quarter is therefore its own rule
with its own `starts_at`/`ends_at`. The seed data demonstrates this with Q2 (expired), Q3
(active) and Q4 (future, unverified).

**Why `included_category_ids` exists:** "3x on airfare, hotels or transit" is a single
condition with three OR-ed categories. Expressing it as three condition rows would require
a purchase to be all three at once.

### `verification_history`

Append-only. Records the status transition plus a **snapshot of the rate at verification
time**, so an old recommendation stays explainable after the catalog changes. No UPDATE or
DELETE policy exists; corrections are new rows.

---

## User-owned data

### `users`

1:1 with `auth.users` via a trigger on insert. Holds `email` (display only),
`display_name`, `role`, locale and country preferences, and disclaimer acceptance.

Contains no financial account identifiers.

### `user_cards` — the wallet

**Security-critical.** See [SECURITY.md](SECURITY.md).

| Column                             | Note                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `card_product_id`                  | FK, `ON DELETE RESTRICT`                                                              |
| `nickname`                         | ≤40 chars, credential-screened by Zod                                                 |
| `last_four_cipher`                 | **Optional. Base64 AES-GCM produced on the device.** The server never sees plaintext. |
| `last_four_key_id`                 | Which device key encrypted it                                                         |
| `account_opened_on`                | Anniversary for `cardmember_year` cap windows                                         |
| `is_excluded_from_recommendations` | Skip a frozen card without losing history                                             |
| `is_preferred`                     | Tie-break in the user's favour                                                        |

There is **no column capable of holding a full card number**, and three CHECK constraints
guard the one that touches digits at all:

```sql
check (last_four_cipher is null or last_four_cipher !~ '^[0-9]{1,19}$')
check (last_four_cipher is null or last_four_cipher ~ '^[A-Za-z0-9+/=_-]{16,256}$')
check ((last_four_cipher is null) = (last_four_key_id is null))
```

### `user_reward_preferences`

The user's point valuations — the biggest single lever on a recommendation.

`cents_per_unit` is `0-100`. **Zero is valid and must be respected**: it means "these points
are worthless to me", not "no preference set". `UNIQUE NULLS NOT DISTINCT (user_id,
reward_program_id)` lets `NULL` mean "my default for this unit type".

`minimum_switch_benefit_usd` stops three-cent recommendations to switch cards.

### `user_rule_enrollments`

Self-reported activation. WalletWise never logs in to an issuer to check — the table
comment records why.

### `user_offers`

Targeted offers, entered by hand. `is_user_entered` defaults to `true`; there is no
scraping path that could set it otherwise. `max_benefit_usd` caps the total benefit.

### `reward_usage`

Cap progress: one row per (card, rule, window). `UNIQUE (user_card_id, reward_rule_id,
period_start, period_end)`.

`is_user_adjusted` marks a figure the user typed rather than one derived from a confirmed
recommendation, which lowers cap-alert confidence. **These are estimates, not a ledger** —
see the accepted limitation in SECURITY.md.

---

## Query history

### `purchase_queries`

What the user asked. `amount_usd` CHECK `> 0` — a zero-dollar purchase has no best card.
Records both the raw input and what the classifier resolved (`category_match_kind`,
`category_confidence`, `has_coding_warning`), so a recommendation can be re-explained.

`raw_natural_language_input` is the only place free text enters the pipeline. **No UPDATE
policy exists**: a query is an immutable record of a question.

### `recommendations`

One row per query (`UNIQUE (purchase_query_id)`). Denormalises the headline figures so the
history screen renders without a join, and records `engine_version` so results stay
reproducible across releases.

`advantage_over_runner_up_usd` has a CHECK `>= 0` — negative is impossible by construction.

### `recommendation_candidates`

One row per evaluated card, **including cards that did not qualify**, each with an
`ineligibility_code`. `recommendation_candidates_ineligible_has_code` enforces that an
ineligible candidate always carries a reason, so "why not my other card?" always has a real
answer.

Stores the full breakdown — capped and uncapped spend, effective rate, gross units, applied
valuation, offer value, statement credits, FX fee, net value — plus the provenance snapshot
(`source_verified_at`, `verification_status`).

---

## Audit

### `audit_logs`

Append-only, written by a SECURITY DEFINER trigger on the catalog tables.

**Records shape, not content.** `changed_columns` holds column _names_; there is no
`old_value` column, so the trail cannot leak the data it describes.
`audit_logs_no_credential_keys` rejects credential keys in the `context` JSON.

The trigger skips no-op updates (where only `updated_at` changed) so the log stays
meaningful.

---

## Row-level security

Full policy listing in the migration; rationale in [SECURITY.md](SECURITY.md).

| Group                       | Read                                    | Write                                                      |
| --------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| Reference catalog           | any authenticated user                  | `can_edit_catalog()`                                       |
| `card_products`             | catalog rows, plus your own custom rows | catalog editors, or the owner of a custom row              |
| `reward_rules` / conditions | when the parent product is readable     | catalog editors, or the owner of the parent custom product |
| `verification_history`      | any authenticated user                  | INSERT only, editors, `verified_by = auth.uid()`           |
| User-owned tables           | `user_id = auth.uid()`                  | same, per command                                          |
| `purchase_queries`          | owner                                   | INSERT and DELETE only — no UPDATE                         |
| `audit_logs`                | your own trail, or everything as admin  | never from the client                                      |

Enforcement details:

- **All 19 tables** have RLS enabled; user-owned tables also `FORCE ROW LEVEL SECURITY`.
- `anon` is revoked from every table; every policy is `TO authenticated`.
- Child tables verify parent ownership, so you cannot attach an offer to another user's card.
- `users_update_self` pins `role`, blocking self-promotion.
- Append-only tables have no UPDATE or DELETE policy at all.

## Helper functions

| Function                                          | Purpose                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.current_app_role()`                       | The caller's role. SECURITY DEFINER, so it reads `users` without recursing through its own RLS.                                                                                 |
| `public.is_admin()`                               | `role = 'admin'`                                                                                                                                                                |
| `public.can_edit_catalog()`                       | `role in ('catalog_editor', 'admin')`                                                                                                                                           |
| `public.cap_period_window(period, as_of, anchor)` | Resolves a cap period to a `tstzrange`. **Mirrors `src/domain/rewards/capWindow.ts`**; the two use identical anniversary arithmetic and the TypeScript side is pinned by tests. |

All three role helpers pin `search_path = public, pg_temp` and are revoked from `anon`.

---

## Seed data

**Everything is fictional.** Ten invented cards across the ten required archetypes, five
invented issuers, nine invented reward programs, fourteen invented merchants.

| #   | Card                         | Archetype     | Notable                                                   |
| --- | ---------------------------- | ------------- | --------------------------------------------------------- |
| 1   | Northwind Everyday Grocery   | grocery       | 6% grocery, $6,000/year cap, warehouse club excluded      |
| 2   | Cobalt Table Dining          | dining        | 4x points dining, capped 3x online grocery                |
| 3   | Meridian Fuel Advantage      | gas           | 5% gas, $2,000/quarter cap, station shop excluded         |
| 4   | Summit Ridge Voyager         | travel        | 3x on four travel categories, **no FX fee**               |
| 5   | Harborline Quarterly Rotator | rotating      | Q2 expired, Q3 active, Q4 unverified; all need activation |
| 6   | Cobalt Everyday Flat         | flat rate     | 2% unconditional — the fallback                           |
| 7   | Northwind TapPay             | mobile wallet | 3% mobile wallet only, $1,000/month cap                   |
| 8   | Meridian Online Shopper      | online        | 5% online, plus a **stacking** intro bonus                |
| 9   | Harborline Stay Rewards      | hotel         | 10x on a low-value currency, plus a statement credit      |
| 10  | Summit Sky Alliance          | airline       | Co-brand + travel-portal bonus, no FX fee                 |

Deliberate coverage for the harder paths:

- **Ambiguous coding:** BulkBarn Warehouse (codes 5300, not 5411) and Fuelworks Express Mart
  (codes 5499, not 5541) both carry `has_ambiguous_coding = true`.
- **Confidence levels:** a `retired` (expired) rule, a `stale` rule with a 2024 source, an
  `unverified` future quarter, and a `user_reported` intro bonus.
- **Stacking:** card 8's intro bonus and card 9's statement credit both use
  `is_stackable = true` with their own `stack_group`.
- **FX comparison:** cards 4 and 10 have no fee; the rest charge 3%.

No user-owned rows are seeded — those belong to the app and to RLS.

## Regenerating types

`src/types/database.ts` is currently hand-written to mirror the migrations. Once a Supabase
project exists, replace it with codegen so drift is impossible:

```bash
supabase gen types typescript --local --schema public > src/types/database.ts
```

The hand-written version encodes intent that codegen cannot: `TablesUpdate<'users'>` omits
`role`, and the append-only tables have `never` for Insert or Update. Preserve those as a
wrapper if you switch to codegen.
