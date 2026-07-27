# WalletWise

**Which card should you use?**

WalletWise looks at the credit cards you own and tells you which one to reach for on a
specific purchase, so you stop leaving cash back and points on the table.

You tell it what you are buying:

| Field          | Example          |
| -------------- | ---------------- |
| Merchant       | Greenleaf Market |
| Amount         | $120.00          |
| Category       | Grocery          |
| Payment method | Apple Pay        |
| Country        | United States    |

It evaluates every eligible card in your wallet and answers:

> **Use your Northwind Everyday Grocery Card.** Estimated reward: **$7.20** cash back
> (6% at US supermarkets). Your second-best option earns about **$6.00**.

Every figure comes from a validated database record and a deterministic TypeScript
function. Nothing is guessed, and no reward rate is ever produced by a language model.

---

## What WalletWise will never do

These are hard product constraints, enforced in the schema and the lint rules — not
promises in a marketing page. See [SECURITY.md](SECURITY.md).

- **Never asks for a full card number, CVV/CVC, PIN, bank password or security answer.**
  There is no column in the database capable of holding one, and the input schemas
  actively reject text that looks like one.
- **Never initiates a payment** or moves money. Asking WalletWise which card to use has
  the same effect on your finances as asking a friend.
- **Never logs in to a bank** and never scrapes an issuer website. No account
  aggregation, no credential storage, no screen scraping.
- **Never logs sensitive financial or personal data.** Telemetry passes through a
  redaction layer that strips identifiers, reduces free text to a character count and
  coarsens amounts into bands.

The one card detail WalletWise will store is the **last four digits**, and only if you
choose to add them so you can tell two similar cards apart. They are encrypted on your
device before they are sent, so the server never sees them in plaintext.

---

## Status

**Complete.** Every screen region is built — no placeholders remain anywhere in the app.
The last two were the provenance regions: a card now shows the document behind each of its
rates, and a recommendation shows that document plus every change recorded against the rule,
with the rate that was on file on each date. Freshness is derived from how long ago a rate
was checked rather than stored, so a rate verified six months ago reads as out of date even
where the catalog still calls it verified.

**Phase 6 complete.** The catalog every recommendation reads from is now curated in the
app: a rule editor, a condition builder down to inclusive MCC ranges, a verification
workflow with an append-only history, a review queue ordered by how stale each rate is, and
a bulk importer that shows you what it would reject before it writes anything. Editing is
gated by the **database**, not by the screen — a member can reach every button and each
write comes back refused.

**Phase 5 complete.** On top of the end-to-end recommendation, WalletWise now tracks the
things that quietly change the answer: how much of each capped bonus is left and when it
resets, which rotating category is running and whether you have activated it, which offers
are about to expire, and what a point is worth **to you**. Change a valuation and the
ranking re-ranks on the spot — that is a test, not a claim.

**Phase 4 complete.** The app answers the question it exists to answer, end to end.
Describe a purchase — in the form or in a sentence — and WalletWise classifies the
merchant, loads your wallet, runs the deterministic engine on your device and shows the
winner, the runner-up and every card that did not qualify, each with a reason. The details
screen walks through the arithmetic row by row and names the rule and source behind it.

The specification's own example is a test: $120 of groceries at a supermarket with Apple
Pay returns the 6% card at **$7.20**, with the runner-up at **$6.00**. Every figure in it
is traced to the seed rule that produced it.

| Phase | Scope                                             | Status         |
| ----- | ------------------------------------------------- | -------------- |
| 1     | Architecture, docs, navigation, schema, seed data | ✅ Complete    |
| 2     | Authentication and wallet management              | ✅ Complete    |
| 3     | Deterministic rewards engine and its test matrix  | ✅ Complete    |
| 4     | Purchase form and recommendation UI               | ✅ Complete    |
| 5     | User offers, spending caps, reward preferences    | ✅ Complete    |
| 6     | Administrative catalog and verification workflow  | ✅ Complete    |
| 7     | Security review, accessibility review, docs       | ⬜ Not started |

1,730 tests across 57 suites. `src/domain/` sits at 99% statements and 96% branches, and
those floors are enforced in `jest.config.js` rather than merely reported.

Every screen now renders real data. What remains for Phase 7 is review and hardening:
RLS integration tests against a live Postgres, data export and account deletion, and a
full accessibility pass.

---

## Getting started

### Requirements

- Node.js 20.19 or newer
- The [Supabase CLI](https://supabase.com/docs/guides/cli) for the local database
- Xcode or Android Studio for a device build (Expo Go works for most of the app)

### Install and run

```bash
git clone <repository-url> walletwise
cd walletwise
npm install

cp .env.example .env      # then fill in your own Supabase project values

npm start                 # Expo dev server
npm run ios               # or: npm run android
```

### Local database

```bash
supabase start            # Postgres, Auth, Studio on localhost
supabase db reset         # applies migrations, then loads the fictional seed data
```

`supabase start` prints the local API URL and anon key. Put those in `.env` as
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

---

## Commands

| Command                                           | What it does                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm start`                                       | Expo dev server                                                          |
| `npm run ios` / `npm run android` / `npm run web` | Platform-specific dev server                                             |
| `npm run lint`                                    | ESLint, including the WalletWise security rules                          |
| `npm run lint:fix`                                | ESLint with autofix                                                      |
| `npm run typecheck`                               | `tsc --noEmit` in strict mode                                            |
| `npm test`                                        | Jest                                                                     |
| `npm run test:watch`                              | Jest in watch mode                                                       |
| `npm run test:coverage`                           | Jest with a coverage report                                              |
| `npm run format`                                  | Prettier, writing changes                                                |
| `npm run format:check`                            | Prettier, checking only                                                  |
| `npm run verify`                                  | **Format check, lint, typecheck and tests — run this before committing** |
| `npm run test:db`                                 | Row-level-security and cap-window tests against a real Postgres          |
| `npm run verify:all`                              | `verify` plus `test:db`. Needs a local Postgres server                   |
| `npm run build:web`                               | Bundles the app for web into `dist/`                                     |
| `npm run check:bundle`                            | Asserts the built bundle has its configuration inlined                   |
| `npm run smoke:web`                               | Boots `dist/` in Chromium and checks the app mounts                      |

---

## Project layout

```
app/                        Expo Router file-based routes (16 screens)
  (auth)/                     registration, sign in
  (app)/                      signed-in tabs: home, wallet, purchase, offers, settings
  cards/                      catalog search, custom card, card details
  recommendations/            results, calculation details
  preferences/  legal/  admin/

src/
  components/               Design-system primitives and disclaimer components
  config/                   Validated environment configuration
  domain/                   Business logic — no React, no I/O
    categories.ts             The 13-category taxonomy and MCC hints
    enums.ts                  Exhaustive runtime enums, checked against the DB types
    schemas.ts                Zod validation, including credential rejection
    rewards/                  money.ts, capWindow.ts, engine contracts
  lib/                      Supabase client, display formatting
  providers/                React Query, theme and safe-area composition
  services/                 Analytics, error monitoring, redaction
  theme/                    Design tokens, theme context, contrast maths
  types/database.ts         Typed Supabase schema

supabase/
  migrations/               19 tables, enums, constraints, triggers, RLS policies
  seed/                     Fictional demonstration catalog (10 cards)
```

## Documentation

| Document                               | Contents                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                 | Working agreement: architecture, coding standards, security restrictions, commands, the determinism rule |
| [ARCHITECTURE.md](ARCHITECTURE.md)     | The 14 modules and how data flows between them                                                           |
| [SECURITY.md](SECURITY.md)             | Threat model, the ten security requirements and how each is enforced                                     |
| [DATABASE.md](DATABASE.md)             | Every table, column and RLS policy                                                                       |
| [REWARDS_ENGINE.md](REWARDS_ENGINE.md) | The 12 evaluation steps, worked examples and the stacking rules                                          |
| [API.md](API.md)                       | Data access patterns and query contracts                                                                 |
| [TESTING.md](TESTING.md)               | Test strategy and the full engine test matrix                                                            |
| [PRIVACY_NOTES.md](PRIVACY_NOTES.md)   | What is stored, what is logged, what is redacted                                                         |
| [ROADMAP.md](ROADMAP.md)               | Phases, and what is deliberately out of scope                                                            |

---

## Demonstration data

The seed data is **entirely fictional**. Issuers like "Northwind Financial" and cards
like "DEMO — Cobalt Table Dining Card" are invented for development and testing. Their
rates do not describe, approximate or imply the terms of any real financial product.

Every seeded row carries `is_fictional = true`, every name is prefixed `DEMO —`, and the
app shows a persistent banner while the demonstration catalog is active.

## Disclaimer

WalletWise provides estimates, not financial advice. Reward rates, caps and offers change
without notice; only your card issuer can tell you what you actually earned. Merchant
categories are our best interpretation of how a merchant is usually coded — your issuer
decides the real category, and it can differ from what we show.

## Licence

Unlicensed and private. Not for distribution.
