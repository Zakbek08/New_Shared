# CLAUDE.md — working agreement for WalletWise

Read this before changing code. It is the short version of every other document, plus the
rules that are not negotiable.

---

## What this app is

WalletWise recommends which credit card in a user's wallet to use for a proposed purchase,
to maximise cash back, points, miles, merchant offers and statement credits.

It is an **information tool**. It never moves money, never touches a bank, and never
handles payment credentials.

---

## The two rules that override everything

### 1. All reward calculations are deterministic

Every reward figure the user sees must come from:

- a **validated database record** (`reward_rules`, `reward_rule_conditions`, `user_offers`,
  `user_reward_preferences`), and
- a **pure TypeScript function** in `src/domain/rewards/`.

A language model may do exactly two things in this codebase:

| Allowed                                                                                                                                                | Forbidden                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Turn free text into structured purchase fields ("coffee at the airport, tapped my phone, twelve dollars" → merchant, category, amount, payment method) | Produce, estimate, adjust or "sanity-check" a reward rate   |
| Rephrase a calculation the engine already performed, using only the numbers the engine produced                                                        | Decide which card wins, or invent a cap, exclusion or offer |

If a rate is not in the database, the answer is "we do not know", not a plausible guess.
An honest gap is a feature; a fabricated rate is a defect that costs the user money.

**Purity requirements for `src/domain/`:**

- No `Date.now()`, no `new Date()` without arguments. Time enters through an explicit
  `asOf` parameter. This is what makes the engine testable and its output reproducible.
- No network calls, no Supabase client, no React.
- No randomness.
- The engine takes a fully-materialised snapshot and returns a result. Fetching is the
  caller's job.

### 2. Card credentials do not exist in this codebase

WalletWise must **never** request, store, transmit, log or model:

- a full card number (PAN)
- a CVV, CVC, CID or security code
- a PIN
- a bank password, banking username or security answer
- card expiry details

The only card digits permitted anywhere are the **optional last four**, encrypted on the
device before transmission, stored in `user_cards.last_four_cipher`.

Encryption lives in `src/lib/lastFour.ts` and uses **AES-256-GCM from `@noble/ciphers`**,
with the key in `expo-secure-store`. Do not reach for `expo-crypto` for this — it provides
randomness and digests but no symmetric cipher — and do not assume `crypto.subtle` exists on
React Native.

This is enforced in four places, and all four must stay in place:

1. **Schema** — no column can hold a PAN. `user_cards_last_four_not_plaintext` rejects
   bare digit strings; `user_cards_last_four_cipher_shape` bounds the ciphertext.
2. **Validation** — `noCredentials()` in `src/domain/schemas.ts` runs on every free-text
   field and rejects card-number, CVV and PIN patterns with a clear message.
3. **Lint** — `no-restricted-syntax` in `eslint.config.mjs` fails the build on an
   identifier named `cardNumber`, `pan`, `cvv`, `cvc`, `pin`, `bankPassword` and friends.
4. **Tests** — `src/database/schema.test.ts` greps the migrations for forbidden columns;
   `src/domain/schemas.test.ts` asserts each rejection pattern.

Also prohibited, as product scope:

- Bank-login or credential-based aggregation features
- Website scraping of issuer pages
- Initiating, authorising or simulating a payment

---

## Architecture

Fourteen modules. Full detail in [ARCHITECTURE.md](ARCHITECTURE.md).

```
Purchase input ─▶ Merchant-category classifier ─▶ Deterministic rewards engine
                            │                              │
                     (LLM allowed here,           (pure functions only,
                      structure only)              database rates only)
                                                           │
                                                           ▼
                              Recommendation ranking ─▶ Explanation layer ─▶ UI
```

| Layer       | Location                         | Rules                                                     |
| ----------- | -------------------------------- | --------------------------------------------------------- |
| Routes      | `app/`                           | Expo Router. Screens compose features; no business logic. |
| Components  | `src/components/`                | Presentational. Read theme from context.                  |
| Domain      | `src/domain/`                    | Pure. No React, no I/O, no clock.                         |
| Data access | `src/lib/`, `src/features/*/api` | Supabase queries, TanStack Query hooks.                   |
| Services    | `src/services/`                  | Analytics, error monitoring, redaction.                   |
| Types       | `src/types/database.ts`          | Mirrors the migrations.                                   |

**Dependency direction is one-way:** `app/` → `components/` → `domain/`. The domain layer
imports nothing from the layers above it. If a domain module needs data, it takes it as an
argument.

---

## Coding standards

**TypeScript**

- Strict mode, plus `noUncheckedIndexedAccess` and `noPropertyAccessFromIndexSignature`.
- No `any`. No non-null assertions in `src/` production code — narrow properly instead.
  (`!` is acceptable in tests, where a failure is the point.)
- `import type` for type-only imports; enforced by lint.
- Prefer `readonly` on interface fields and array parameters. Domain data is immutable.
- Model absence explicitly. `null` means "known to be absent"; `undefined` means "not
  provided". An unknown merchant category is a real state, not an error.
- Exhaustive `switch` over unions, with no `default` clause, so adding an enum member is a
  typecheck failure.

**Naming**

- Money variables carry their unit: `amountUsd`, `netValueUsd`, `centsPerUnit`.
- Reward quantities carry theirs: `rewardUnits`, `grossRewardUnits`.
- Booleans read as assertions: `isEligible`, `hasCodingWarning`, `requiresEnrollment`.
- Database columns are `snake_case`; TypeScript is `camelCase`. Convert at the boundary.

**React**

- Function components only. Hooks at the top level.
- Never inline a `StyleSheet.create` inside a render.
- Every interactive element needs an `accessibilityRole`, an `accessibilityLabel` and — if
  the outcome is not obvious from the label — an `accessibilityHint`.
- Minimum touch target 44pt (`MIN_TOUCH_TARGET`).
- `allowFontScaling` stays on. Never hard-code a line height; derive it from the ratio in
  the type scale.

**Comments**

Explain _why_, not _what_. Comment the non-obvious: a floating-point correction, a
security invariant, a deliberate approximation, a case that looks wrong but is not. Do not
narrate code that already reads clearly.

**Money arithmetic**

Always go through `src/domain/rewards/money.ts`. It handles the IEEE-754 cases that a
naive `Math.round(x * 100) / 100` gets wrong. Never format money for display inside the
engine — formatting lives in `src/lib/format.ts`.

---

## Commands

```bash
npm start                # Expo dev server
npm run ios / android    # platform dev build

npm run lint             # ESLint, including the security rules
npm run typecheck        # tsc --noEmit, strict
npm test                 # Jest
npm run test:coverage    # with coverage
npm run format           # Prettier, writing
npm run format:check     # Prettier, checking

npm run verify           # ← format check + lint + typecheck + tests. Run before committing.

supabase start           # local Postgres, Auth, Studio
supabase db reset        # re-apply migrations and reload the fictional seed data
```

---

## Testing requirements

Full matrix in [TESTING.md](TESTING.md). The rules:

- **Do not skip, `.skip`, or delete a test to make the build pass.** A failing test is
  information. Fix the code, or fix the test's premise and say which you did and why.
- **Every reward calculation needs a unit test with a hand-checked expected value.** Write
  the arithmetic out in the test name or a comment so a reviewer can verify it on paper.
- **Pin time explicitly.** Pass `asOf` rather than mocking the clock.
- **Test the boundaries, not just the middle:** cap exactly reached, cap partially
  remaining, cap exhausted, rule expiring today, zero-dollar purchase, missing category,
  tied values.
- **Test the security invariants.** Credential rejection, RLS coverage and log redaction
  each have dedicated suites. They are the mechanism, not documentation of one.
- **Accessibility is asserted, not assumed.** Contrast ratios, touch targets and
  accessible names are checked in tests.

Phase 3 must land the full engine matrix listed in TESTING.md before the recommendation UI
is built on top of it.

---

## Environment and secrets

- Secrets live in environment variables. Nothing secret goes in source, and `.env` is
  git-ignored.
- **Only `EXPO_PUBLIC_*` variables reach the device.** Treat every one as public — Metro
  inlines them into the bundle.
- The service-role key, database URL and any model API key are **server-side only**. They
  belong in Supabase Edge Function secrets or CI, and are deliberately unreachable from
  `src/config/env.ts`.
- Read configuration through `getEnv()`. Do not touch `process.env` elsewhere.

---

## Logging

Use `src/services/analytics.ts`. Never call `console.log` — lint forbids it, precisely
because an unredacted log line is the most likely way sensitive data escapes.

Everything passed to `track()`, `captureException()` or `captureMessage()` is redacted
first: credential and identifier keys are dropped, user free text becomes `[12 chars]`,
and dollar amounts become a band like `100-499`.

When adding an analytics event, add it to the `ANALYTICS_EVENTS` union. The closed union is
the review gate.

---

## Working in phases

Each phase ends with the same checklist:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. Fix every failure — do not skip tests
5. Summarise the files created and changed
6. Commit with a message explaining _why_, not just _what_

Do not build a later phase's functionality early. If a screen region belongs to a later
phase, render a `PlaceholderSection` naming that phase. **Never display a fabricated
reward number**, even as a mock — a plausible fake figure in a financial app is worse than
an obvious gap.
