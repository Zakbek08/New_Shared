# CLAUDE.md — working agreement for WalletWise

Read this before changing code. It is the short version of every other document, plus the
rules that are not negotiable.

---

## What this app is

WalletWise tells a user which credit card in their wallet earns the most on a purchase they
are about to make.

Four screens, and that is the product: sign in, choose your cards, describe a purchase, get
an answer. A returning user goes straight to the purchase screen.

It is an **information tool**. It never moves money, never touches a bank, and never handles
payment credentials.

---

## The three rules that override everything

### 1. All reward calculations are deterministic

Every reward figure the user sees must come from:

- a **rule record** in `src/data/marketCards.ts`, and
- a **pure TypeScript function** in `src/domain/rewards/`.

A language model may do exactly two things in this codebase:

| Allowed                                                                                 | Forbidden                                                   |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Turn free text into structured purchase fields                                          | Produce, estimate, adjust or "sanity-check" a reward rate   |
| Rephrase a calculation the engine already performed, using only the numbers it produced | Decide which card wins, or invent a cap, exclusion or offer |

If a rate is not in the catalog, the answer is "we do not know", not a plausible guess. An
honest gap is a feature; a fabricated rate is a defect that costs the user money.

**Purity requirements for `src/domain/`:**

- No `Date.now()`, no `new Date()` without arguments. Time enters through an explicit `asOf`
  parameter. This is what makes the engine testable and its output reproducible.
- No network calls, no React, no storage.
- No randomness.
- The engine takes a fully-materialised snapshot and returns a result.

`src/domain/purity.test.ts` enforces all of this by reading the source.

### 2. Every rate is dated and sourced, or it does not ship

`src/data/marketCards.ts` is a **dated transcription** of issuers' own product pages, not a
live feed. Issuers change rates without notice, so:

- Every card carries `sourceUrl` (the issuer's own domain) and `ratesAsOf`.
- Both are **shown in the UI**, not kept in the file. A rate with no visible date is a claim
  about today that nobody has checked.
- The app tells the user to confirm with their bank.
- No affiliate or referral parameters, ever. `marketCards.test.ts` asserts this. A
  recommendation that pays the recommender is worth nothing to the person reading it.

WalletWise does not scrape issuer pages. A human reads them and types the result, which is
precisely why the date matters.

**Assumptions must be labelled as assumptions.** Points are valued at 1¢ — stated in words
on the result screen and in About, and deliberately pessimistic so a points card that wins
at 1¢ wins at any higher valuation. Never present an assumption as a rate.

**A bonus that needs activating is not counted until the user confirms it.** The app cannot
know which rotating quarter is live. Counting an unactivated 5% bonus would have someone pay
with a card earning 1%, which is the most expensive mistake this app can make.

### 3. Card credentials do not exist in this codebase

WalletWise must **never** request, store, transmit, log or model:

- a full card number (PAN)
- a CVV, CVC, CID or security code
- a PIN
- a bank password, banking username or security answer
- card expiry details

This is enforced in three places, and all three must stay:

1. **Validation** — `noCredentials()` in `src/domain/schemas.ts` runs on free-text fields and
   rejects card-number, CVV and PIN patterns with a clear message.
2. **Lint** — `no-restricted-syntax` in `eslint.config.mjs` fails the build on an identifier
   named `cardNumber`, `pan`, `cvv`, `cvc`, `pin`, `bankPassword` and friends.
3. **Tests** — `src/domain/schemas.test.ts` asserts each rejection pattern;
   `src/features/local/storage.test.ts` asserts nothing resembling a credential is written.

Also prohibited, as product scope:

- Bank-login or credential-based aggregation
- Website scraping of issuer pages
- Initiating, authorising or simulating a payment
- Referral or affiliate monetisation of any kind

---

## Architecture

Full detail in [ARCHITECTURE.md](ARCHITECTURE.md).

```
Purchase input ─▶ Classifier ─▶ Deterministic rewards engine ─▶ Explanation ─▶ Result
   (screen edge      (pure)         (pure, catalog rates only)      (pure)
    reads the
    clock once)
```

| Layer      | Location              | Rules                                              |
| ---------- | --------------------- | -------------------------------------------------- |
| Routes     | `app/`                | Expo Router. Screens compose; no business logic.   |
| Components | `src/components/`     | Presentational. Read theme from context.           |
| Domain     | `src/domain/`         | Pure. No React, no I/O, no clock.                  |
| Catalog    | `src/data/`           | Rule records. Dated and sourced.                   |
| Local      | `src/features/local/` | On-device storage, and the wallet → answer bridge. |
| Services   | `src/services/`       | Analytics and redaction.                           |

**Dependency direction is one-way:** `app/` → `features/` → `components/` → `domain/`. The
domain layer imports nothing from above it. If a domain module needs data, it takes it as an
argument.

**There is no server.** Do not add one without a reason the user asked for: it buys an
account system, a password to lose and a breach surface, in exchange for an answer that
never needed to leave the device.

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
- Exhaustive `switch` over unions with no `default`, so adding a member is a typecheck
  failure.

**Naming**

- Money variables carry their unit: `amountUsd`, `netValueUsd`, `centsPerUnit`.
- Reward quantities carry theirs: `rewardUnits`, `grossRewardUnits`.
- Booleans read as assertions: `isEligible`, `hasCodingWarning`, `requiresEnrollment`.

**React**

- Function components only. Hooks at the top level.
- Never inline a `StyleSheet.create` inside a render.
- Every interactive element needs an `accessibilityRole`, an `accessibilityLabel` and — if
  the outcome is not obvious from the label — an `accessibilityHint`.
- Minimum touch target 44pt (`MIN_TOUCH_TARGET`).
- `allowFontScaling` stays on. Never hard-code a line height; derive it from the type scale.
- Selection state is carried by more than colour: colour alone excludes a colour-blind user,
  and a visual-only cue excludes a screen-reader user entirely.

**Comments**

Explain _why_, not _what_. Comment the non-obvious: a floating-point correction, a security
invariant, a deliberate approximation, a case that looks wrong but is not. Do not narrate
code that already reads clearly.

**Money arithmetic**

Always go through `src/domain/rewards/money.ts`. It handles the IEEE-754 cases a naive
`Math.round(x * 100) / 100` gets wrong. Never format money inside the engine — formatting
lives in `src/lib/format.ts`.

**Rates are percentages, not fractions.** `money.percentOf` divides by 100, so `6` means 6%.
Writing `0.06` produces six hundredths of a percent, parses fine, renders fine, and quietly
reports $0.006 on a $100 shop. There are hand-checked tests for exactly this.

---

## Commands

```bash
npm run preview:web      # dev server on localhost:8081
npm start                # Expo dev server (add --offline on a restricted network)

npm run lint             # ESLint, including the security rules
npm run typecheck        # tsc --noEmit, strict
npm test                 # Jest
npm run test:coverage    # with coverage thresholds
npm run format           # Prettier, writing

npm run verify           # ← format check + lint + typecheck + tests. Run before committing.

npm run build:web        # export the web bundle to dist/
npm run check:bundle     # assert no test code leaked into dist/
```

---

## Testing requirements

Full matrix in [TESTING.md](TESTING.md). The rules:

- **Do not skip, `.skip`, or delete a test to make the build pass.** A failing test is
  information. Fix the code, or fix the test's premise — and say which you did and why, in
  the file.
- **Every reward calculation needs a unit test with a hand-checked expected value.** Write
  the arithmetic into the test name or a comment so a reviewer can verify it on paper.
- **Pin time explicitly.** Pass `asOf` rather than mocking the clock.
- **Test the boundaries:** cap exactly reached, cap partially remaining, cap exhausted, rule
  expiring today, zero-dollar purchase, missing category, tied values.
- **Negative-control every guard.** A check that would pass on broken input reads as
  reassurance while providing none. If a guard asserts an absence, also assert it fires on
  the presence. If the control shows a check is vacuous, delete the check — do not keep it
  for the comfort.
- **Test the security invariants.** Credential rejection and log redaction have dedicated
  suites. They are the mechanism, not documentation of one.
- **Accessibility is asserted, not assumed.** Contrast ratios, touch targets and accessible
  names are checked in tests.

Deleting a feature means deleting its tests **with it**, in the same commit. That is not
skipping a test; leaving tests for code that no longer exists is.

---

## Environment and secrets

- There is nothing secret to configure. The app has no backend, no API key and no database
  URL.
- **Only `EXPO_PUBLIC_*` variables reach the device.** Treat every one as public — Metro
  inlines them into the bundle.
- Read configuration through `getEnv()`. Do not touch `process.env` elsewhere, and never
  through a computed key: Metro can only inline a static `process.env.NAME` expression, and
  a computed read makes the app unbootable while every unit test still passes.

---

## Logging

Use `src/services/analytics.ts`. Never call `console.log` — lint forbids it, precisely
because an unredacted log line is the most likely way sensitive data escapes.

Everything passed to `track()`, `captureException()` or `captureMessage()` is redacted
first: credential and identifier keys are dropped, user free text becomes `[12 chars]`, and
dollar amounts become a band like `100-499`.

When adding an analytics event, add it to the `ANALYTICS_EVENTS` union. The closed union is
the review gate.

---

## Before you finish

1. `npm run verify`
2. Fix every failure — do not skip tests
3. If you changed a screen or the flow, run `scripts/flow-check.mjs` against a fresh build.
   No unit test can tell you whether a person can open the app and get an answer.
4. Summarise the files created and changed
5. Commit with a message explaining _why_, not just _what_

**Never display a fabricated reward number**, even as a placeholder. A plausible fake figure
in a financial app is worse than an obvious gap.
