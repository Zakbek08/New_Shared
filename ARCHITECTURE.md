# Architecture

## The shape of the problem

A recommendation is a ranking problem with awkward inputs. The reward rates are public but
scattered, the merchant's category is genuinely uncertain, the caps are per-user and
invisible from outside, and the value of a point depends on how a particular person
redeems it.

That shapes the whole design:

1. **Rates live in a database, never in code.** They change, they need provenance, and they
   need a verification date the user can see.
2. **Category uncertainty is modelled, not hidden.** `category_match_kind`,
   `mcc_confidence` and `has_ambiguous_coding` exist so the app can say "we are not sure
   how this merchant codes" instead of quietly guessing.
3. **The engine is a pure function.** Given a wallet snapshot, a purchase and an instant,
   it returns the same answer every time. Reproducibility is what makes a financial
   estimate auditable.
4. **Point valuations belong to the user.** Two people with identical wallets can correctly
   get different answers.

---

## Module map

The fourteen modules from the specification, and where each lives.

| #   | Module                                     | Location                                                      | Phase |
| --- | ------------------------------------------ | ------------------------------------------------------------- | ----- |
| 1   | Mobile application                         | `app/`, `src/components/`, `src/theme/`                       | 1     |
| 2   | Authentication layer                       | `src/features/auth/`, `src/lib/supabase.ts`                   | 2     |
| 3   | Card catalog                               | `src/features/catalog/`, `supabase/seed/`                     | 1-2   |
| 4   | User wallet                                | `src/features/wallet/`                                        | 2     |
| 5   | Purchase-intent form                       | `app/(app)/assistant.tsx`, `src/domain/schemas.ts`            | 1-4   |
| 6   | Merchant-category classifier               | `src/domain/classifier/`                                      | 4     |
| 7   | Deterministic rewards engine               | `src/domain/rewards/`                                         | 1-3   |
| 8   | Recommendation-ranking engine              | `src/domain/rewards/rank.ts`                                  | 3     |
| 9   | Recommendation explanation layer           | `src/domain/rewards/explain.ts`                               | 3     |
| 10  | User-specific offers                       | `src/features/offers/`                                        | 5     |
| 11  | Spending-cap tracker                       | `src/features/caps/`, `src/domain/rewards/capWindow.ts`       | 1, 5  |
| 12  | Administrative card-rules interface        | `app/admin/`, `src/features/admin/`                           | 6     |
| 13  | Source verification and audit history      | `supabase/` (`sources`, `verification_history`, `audit_logs`) | 1, 6  |
| 14  | Analytics and error monitoring abstraction | `src/services/`                                               | 1     |

Phase 7 added two supporting modules that are not on the specification's list of fourteen,
because they support the whole app rather than one part of it:

| Module                    | Location                                       | Phase |
| ------------------------- | ---------------------------------------------- | ----- |
| Data export and deletion  | `src/domain/account/`, `src/features/account/` | 7     |
| Client-side rate limiting | `src/lib/rateLimit.ts`                         | 7     |

The export follows the same split as everything else: `src/domain/account/exportDocument.ts`
assembles the document from rows and is pure, so a test can assert the whole thing including
its filename; `src/features/account/api/account.ts` does the fetching and the file writing.
Account deletion is a single SECURITY DEFINER database function, `public.delete_own_account()`,
which takes no arguments — the account deleted is always `auth.uid()`, so "delete somebody
else" is not expressible rather than merely forbidden.

Modules 1, 11, 13 and 14 have their Phase 1 foundations in place. Modules 2, 3 and 4 —
authentication, card catalog and user wallet — are complete as of Phase 2; modules 7, 8 and
9 — the rewards engine, the ranking engine and the explanation layer — as of Phase 3; and
modules 5 and 6 — the purchase-intent form and the merchant-category classifier — as of
Phase 4, along with the results and details screens that render module 9's output; and
modules 10 and 11 — user offers and the spending-cap tracker — as of Phase 5; and modules 12
and 13 — the administrative rules interface and the source-verification trail — as of
Phase 6.

All fourteen modules are now implemented. What remains for Phase 7 is review and hardening
rather than new surface: RLS integration tests against a live Postgres, data export and
account deletion, and a full accessibility pass.

One correction to the table above: module 6 is implemented as a **deterministic classifier
plus a deterministic free-text parser** (`src/domain/purchaseText/`), not as a model call.
A model would be permitted for the parsing step, but a pure function that can be tested
against hand-checked expectations does the same job and cannot fail closed into a guessed
rate.

---

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│  app/                Expo Router screens                     │
│                      Composition and navigation only         │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  src/features/*      Feature slices                          │
│                      api/ (Supabase) · hooks/ (Query) · ui/  │
└──────────┬────────────────────────────────────┬──────────────┘
           │                                    │
┌──────────▼──────────────┐      ┌──────────────▼──────────────┐
│  src/components/        │      │  src/domain/                │
│  Design system          │      │  PURE business logic        │
│  src/theme/             │      │  No React · No I/O · No clock│
└─────────────────────────┘      └──────────────┬──────────────┘
                                                │
┌───────────────────────────────────────────────▼──────────────┐
│  src/lib/  ·  src/services/  ·  src/config/                  │
│  Supabase client · telemetry · validated environment         │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  Supabase — Postgres with RLS on every table + Auth          │
└──────────────────────────────────────────────────────────────┘
```

Dependencies point downward only. `src/domain/` is a leaf: it imports types and other
domain modules, nothing else. That is what lets the engine be tested with plain objects and
no test harness.

---

## The recommendation pipeline

```
 ┌─ User input ─────────────────────────────────────────────┐
 │  Structured form   OR   free text                        │
 └────────┬─────────────────────┬───────────────────────────┘
          │                     │
          │            ┌────────▼─────────────────────────┐
          │            │ LLM: text → structured fields    │
          │            │ ONLY parsing. Produces no rates. │
          │            └────────┬─────────────────────────┘
          │                     │
 ┌────────▼─────────────────────▼───────────────────────────┐
 │ Zod validation (purchaseIntentSchema)                    │
 │ Rejects $0, malformed codes, and credential-like text    │
 └────────┬─────────────────────────────────────────────────┘
          │
 ┌────────▼─────────────────────────────────────────────────┐
 │ Merchant-category classifier                             │
 │ exact_merchant > known_mcc > user_selected > inferred     │
 │ Emits categoryId, mcc, matchKind, confidence, warning    │
 └────────┬─────────────────────────────────────────────────┘
          │
 ┌────────▼─────────────────────────────────────────────────┐
 │ Wallet snapshot loader                                   │
 │ cards + rules + conditions + offers + cap usage + prefs  │
 │ The last impure step. Everything below is pure.          │
 └────────┬─────────────────────────────────────────────────┘
          │
 ┌────────▼─────────────────────────────────────────────────┐
 │ DETERMINISTIC REWARDS ENGINE  (src/domain/rewards/)      │
 │  1  collect active rules      7  apply merchant offers   │
 │  2  test qualification        8  subtract FX fees        │
 │  3  apply exclusions          9  convert to USD          │
 │  4  check enrollment         10  assign confidence       │
 │  5  compute remaining cap    11  rank by net value       │
 │  6  apply base + bonus       12  return winner + rest    │
 └────────┬─────────────────────────────────────────────────┘
          │
 ┌────────▼─────────────────────────────────────────────────┐
 │ Explanation layer                                        │
 │ Phrases the numbers the engine produced. Invents none.   │
 └────────┬─────────────────────────────────────────────────┘
          │
 ┌────────▼─────────────────────────────────────────────────┐
 │ Persist: purchase_queries → recommendations →            │
 │          recommendation_candidates                       │
 │ Snapshotted so an old answer stays explainable after a   │
 │ catalog change.                                          │
 └──────────────────────────────────────────────────────────┘
```

### Where the LLM sits, precisely

Two narrow slots, both outside the arithmetic:

**Before the engine — parsing.** Free text in, structured fields out. Its output is
validated by the same Zod schema as the manual form, so a hallucinated field is rejected
like any other bad input. If parsing fails, the user fills in the form.

**After the engine — phrasing.** Given a completed `RewardBreakdown`, it may produce a
friendlier sentence. It receives only numbers the engine computed and may not alter them.
The deterministic `explain.ts` string is always available as a fallback and is what gets
persisted.

The engine itself has no model dependency. It cannot: it is a pure function over plain
objects.

**As built in Phase 4, both slots are empty.** The parsing slot is filled by
`src/domain/purchaseText/parse.ts`, a pure function, and the phrasing slot by
`src/domain/rewards/explain.ts`. Neither screen calls a model. The slots stay documented
because the architecture permits them and a later phase may use them — but nothing in the
shipped app depends on one, and the details screen states outright that no number on it was
generated by a model.

---

## Data model shape

Nineteen tables in three groups. Full detail in [DATABASE.md](DATABASE.md).

**Reference catalog** — shared, slow-changing, readable by every authenticated user,
writable only by catalog editors.

```
issuers ──▶ card_products ──▶ reward_rules ──▶ reward_rule_conditions
                │                  │
       reward_programs         sources ◀── verification_history
                            merchant_categories ◀── merchants
```

**User-owned** — one owner each, protected by RLS keyed to `auth.uid()`.

```
users ──▶ user_cards ──▶ user_rule_enrollments
             │      └──▶ user_offers
             │      └──▶ reward_usage          (cap progress)
             └──▶ user_reward_preferences      (point valuations)
```

**Query history** — immutable records of what was asked and answered.

```
purchase_queries ──▶ recommendations ──▶ recommendation_candidates
```

### Two modelling decisions worth explaining

**Conditions AND, arrays OR.** A rule qualifies only when _every_ attached
`reward_rule_conditions` row is satisfied. Within a row, each array field is an OR-list.

This is why a rotating-category card gets **one rule per quarter** rather than one rule
with four condition rows: four rows with different date windows could never all be true at
once. And it is why `included_category_ids` exists alongside the scalar
`merchant_category_id` — "3x on airfare, hotels or transit" is one condition with three
categories, not three ANDed conditions that can never all hold.

**Ineligible cards are first-class rows.** `recommendation_candidates` stores the cards
that did _not_ qualify, each with an `ineligibility_code`. "Why not my other card?" is the
question that builds trust, and it deserves a real answer rather than a silent omission.

---

## Design system

`src/theme/tokens.ts` holds the tokens; `ThemeProvider` resolves light or dark from the OS
setting or the user's override.

**Semantic colour is load-bearing**, and specified by the product:

| Colour | Meaning                                  |
| ------ | ---------------------------------------- |
| Green  | The highest-value option                 |
| Amber  | Merchant coding is uncertain             |
| Red    | A fee applies, or the card is ineligible |

**Colour is never the only signal.** Every coloured element also carries a text label and
often a glyph, so meaning survives colour-blindness, greyscale and a screenshot. `Badge`
has no label-less variant — that is deliberate.

Accessibility is asserted rather than asserted-to: `src/theme/contrast.test.ts` checks
every foreground/background pair the app actually renders against WCAG 2.2 AA, in both
schemes. A token change that breaks contrast breaks the build. That test is why the light
primary is `#1E7A70` and not a lighter, prettier teal — the lighter shade failed under
white button text.

The palette is original: slate-navy neutrals with a teal primary, chosen to avoid
resembling any existing financial brand.

---

## Client-side state

| Concern          | Mechanism                                                                     |
| ---------------- | ----------------------------------------------------------------------------- |
| Server data      | TanStack Query. Catalog data is stale after 5 minutes; mutations never retry. |
| Auth session     | Supabase client, persisted in the device keystore via `expo-secure-store`     |
| Theme preference | `ThemeProvider` + SecureStore                                                 |
| Form state       | React Hook Form + Zod resolver                                                |
| Navigation       | Expo Router (file-based)                                                      |

There is no Redux-style global store. Server state belongs to Query, form state to the
form, and everything else is local. Introducing a global store should require an argument.

**Sessions go in SecureStore, not AsyncStorage.** AsyncStorage is unencrypted; a refresh
token does not belong there. SecureStore caps items at 2048 bytes and Supabase sessions can
exceed that, so `src/lib/supabase.ts` implements a chunking adapter with a count key. A
partially-written value reads back as absent, so the worst case is signing in again rather
than a corrupt session.

---

## Error and telemetry boundaries

All telemetry goes through `src/services/analytics.ts`, which redacts before dispatch. The
sink is an interface with a no-op default, so:

- tests record nothing,
- an unconfigured build ships nothing,
- swapping in a vendor SDK touches one file and cannot bypass redaction.

Event names are a closed union. Adding one is a visible, reviewable change.

---

## What is deliberately not here

- **No payment processing.** Not in scope, not on the roadmap.
- **No bank aggregation and no scraping.** Users enter targeted offers by hand; that is the
  cost of not asking for their banking credentials, and it is worth paying.
- **No server-side recommendation service.** The engine is pure TypeScript and runs on the
  device. Nothing about a wallet snapshot needs to leave it to be evaluated.
- **No offline write queue.** Reads cache through Query; writes require connectivity.
