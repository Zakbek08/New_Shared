# Security

## Principle

WalletWise is a **read-only advisory tool over public reward data plus a user's own card
list**. It has no legitimate need for payment credentials, bank access, or the ability to
move money — so it has none of those capabilities, and the codebase is built to make adding
them difficult rather than easy.

The strongest control here is scope: data you never collect cannot leak.

---

## The ten requirements, and how each is enforced

### 1. Never request or store full card numbers

| Control                                                                      | Where                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| No column can hold a PAN                                                     | `supabase/migrations/20260701000500_users_and_wallet.sql` |
| `user_cards_last_four_not_plaintext` rejects bare digit strings              | same                                                      |
| `user_cards_last_four_cipher_shape` bounds ciphertext to 16-256 base64 chars | same                                                      |
| `lastFourSchema` accepts **exactly** four digits — five is rejected          | `src/domain/schemas.ts`                                   |
| `noCredentials()` rejects 13-19 digit sequences in every free-text field     | same                                                      |
| `no-restricted-syntax` fails the build on a `cardNumber` / `pan` identifier  | `eslint.config.mjs`                                       |
| Migrations are grepped for forbidden columns                                 | `src/database/schema.test.ts`                             |

The five-digit rejection matters: a field that accepted "41111" would accept a full number
one keystroke at a time.

### 2. Never request or store CVV, PIN, bank password or security answers

Same four layers. `noCredentials()` matches a 3-4 digit value adjacent to
`cvv` / `cvc` / `security code`, and a value adjacent to `pin` / `password` / `passcode`.
The lint rule covers `cvv`, `cvc`, `securityCode`, `pin`, `bankPassword`.

There is no authentication flow, no form and no table anywhere in the app that could carry
one.

### 3. Card records hold only product, nickname, encrypted last four and preferences

`user_cards` in full:

| Column                                                                             | Note                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------ |
| `card_product_id`                                                                  | FK to the catalog                          |
| `nickname`                                                                         | user text, credential-screened             |
| `last_four_cipher`, `last_four_key_id`                                             | optional, device-encrypted                 |
| `display_order`, `is_archived`, `is_excluded_from_recommendations`, `is_preferred` | preferences                                |
| `account_opened_on`                                                                | date only, for cardmember-year cap windows |
| `notes`                                                                            | user text, credential-screened             |

**The encryption boundary is the device.** The last four are encrypted with a device-held
key before the row is written, so the server, the database and every log sink see only
ciphertext. This is not "encrypted at rest by the provider" — the plaintext never arrives.

Implementation (`src/lib/lastFour.ts`):

| Choice                             | Reason                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AES-256-GCM via `@noble/ciphers`   | Authenticated, so a wrong key or tampered payload fails loudly instead of yielding four plausible digits. Audited, dependency-free, pure TypeScript — identical on Hermes and in Node, so the tests exercise the shipping code path. |
| Key in `expo-secure-store`         | Platform keystore: Keychain on iOS, Keystore-backed on Android.                                                                                                                                                                      |
| Fresh 12-byte nonce per encryption | Never reused with the same key. Stored as `nonce ‖ ciphertext ‖ tag`, base64.                                                                                                                                                        |
| `last_four_key_id` recorded        | Names which device key was used, so keys can rotate and a foreign payload is identifiable rather than silently undecryptable.                                                                                                        |

`expo-crypto` supplies the key and nonce bytes only; it has no symmetric cipher, and React
Native has no dependable `crypto.subtle`.

**Accepted consequence.** The key lives on one device, so after a reinstall — or on a second
phone — the stored ciphertext cannot be read. `decryptLastFour` returns `null`, the UI shows
`••••` and offers to re-enter. That is the honest cost of never letting the server hold the
plaintext, and it is cheap because the last four digits are a convenience, not data the app
needs.

### 4. Secrets live in environment variables

- `.env` is git-ignored; `.env.example` documents every variable with no real values.
- `src/config/env.ts` is the only reader of `process.env`, and validates with Zod.
- **Only `EXPO_PUBLIC_*` reaches the device.** Metro inlines those into the bundle, so they
  are public by construction. `.env.example` says so at the top.
- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` and `ANTHROPIC_API_KEY` have no
  `EXPO_PUBLIC_` prefix and are unreachable from client code. They belong in Supabase Edge
  Function secrets or CI.
- Configuration errors name the _variable_, never the value, so a bad key cannot reach a
  crash report.

`.gitignore` also covers `*.pem`, `*.p8`, `*.p12`, `*.key`, `*.keystore`, `*.jks`,
`*.mobileprovision`, `google-services.json` and `GoogleService-Info.plist`.

### 5. Row-Level Security on all user-owned data

`supabase/migrations/20260701000800_row_level_security.sql`.

- **RLS is enabled on all 19 tables.** No exceptions.
- **`FORCE ROW LEVEL SECURITY`** on every user-owned table, so a misconfigured connection
  string cannot silently bypass policies even as table owner.
- **`anon` is revoked from every table.** All access requires an authenticated session.
- **Every policy is scoped `TO authenticated`** — asserted by test, not by review.
- Owner-scoped predicates are `user_id = auth.uid()`. Child tables verify the parent's
  ownership too, so you cannot attach an offer to someone else's card.
- Catalog tables: read for any authenticated user, write gated on
  `can_edit_catalog()`.
- **Append-only tables have no UPDATE or DELETE policy at all** (`verification_history`,
  `audit_logs`), which makes tampering impossible through the API rather than merely
  forbidden. `purchase_queries` likewise has no UPDATE policy — it records what was asked.

**Privilege escalation is blocked at the policy level.** `users_update_self` pins `role` to
its current value in its `WITH CHECK`, so a member cannot promote themselves to admin even
with a hand-crafted request:

```sql
with check (
  id = auth.uid()
  and role = (select u.role from public.users u where u.id = auth.uid())
)
```

`TablesUpdate<'users'>` also omits `role`, so the mistake fails at compile time first.

**SECURITY DEFINER functions pin `search_path`** (`set search_path = public, pg_temp`),
defeating search-path hijacking. Asserted in `schema.test.ts`.

**Table privileges are granted explicitly, per table and per verb.** RLS decides which rows a
role sees; `GRANT` decides whether it can ask at all. A hosted Supabase project ships
`ALTER DEFAULT PRIVILEGES` granting everything to `anon`, `authenticated` and `service_role`,
which means a migration that grants nothing still appears to work — while depending on a
platform setting no reviewer can see in this repository, and handing every role every verb.
Migration 0008 now states the grants, so an append-only table has no `UPDATE` privilege as
well as no `UPDATE` policy, and a missing policy is a second lock rather than the only one.
This was found by the integration tests, not by review.

**These policies are executed, not just inspected.** `npm run test:db` builds a throwaway
Postgres cluster, applies every migration and seed, and runs 70 assertions as `anon`, as two
different members, as a catalog editor and as an admin. Structural assertions in
`schema.test.ts` catch a missing policy; only a live database catches a wrong predicate. See
[TESTING.md](TESTING.md).

**Self-service deletion cannot delete anyone else.** `public.delete_own_account()` is
SECURITY DEFINER — it has to be, because no client role may touch `auth`, and none should.
It takes **no arguments**: the account deleted is always `auth.uid()`, so "delete somebody
else" is unexpressible rather than merely forbidden. It raises `insufficient_privilege` when
there is no session, rather than relying on `id = NULL` matching nothing. Its zero-argument
signature and its grant to `authenticated` alone are both asserted in the integration tests.

### 6. Never log sensitive user or financial data

`src/services/redaction.ts` is the enforcement, and every telemetry call routes through it.

| Class          | Treatment          | Example                                                   |
| -------------- | ------------------ | --------------------------------------------------------- |
| Credentials    | dropped            | `cvv` → `[redacted]`                                      |
| Identifiers    | dropped            | `email` → `[redacted]`                                    |
| Card digits    | dropped            | `last_four_cipher` → `[redacted]`                         |
| Dollar amounts | coarsened          | `120` → `"100-499"`                                       |
| User free text | length only        | `"Greenleaf Market"` → `"[16 chars]"`                     |
| Any string     | card-number masked | `"ref 4111111111111111"` → `"ref [card-number-redacted]"` |
| Diagnostics    | preserved          | `ineligibilityCode: "cap_exhausted"`                      |

Also: depth-capped at 6, arrays truncated at 20, circular references handled, `Error`
messages masked because they can interpolate user input.

`console.log` is banned by lint — an unredacted log line is the likeliest escape route.

**The audit log records shape, not content.** `audit_logs.changed_columns` holds column
_names_; there is no `old_value` column, so the trail cannot leak the data it describes.
`audit_logs_no_credential_keys` rejects credential keys in the `context` JSON.

### 7. Clear financial-information and merchant-category disclaimers

`src/components/Disclaimers.tsx` centralises five versioned statements: financial
information, merchant category, no payment, no credentials, estimate.

- `DISCLAIMER_VERSION` is recorded in `users.disclaimers_accepted_version`, so a wording
  change can require re-acceptance.
- `MerchantCodingWarning` renders wherever coding is uncertain, in amber, **with a text
  label** so the warning survives greyscale.
- The Privacy and Disclosures screen carries the full text.
- Copy is asserted by test — the disclaimers cannot be quietly weakened.

### 8. The application must never initiate a payment

There is no payment SDK, no wallet-provisioning API, no funds-transfer code path. A
`purchase_query` is a hypothetical, and the table comment says so.

`payment_method` records **how the user intends to pay** — because mobile-wallet bonuses
depend on it — not a payment instrument. The values are `apple_pay`, `google_pay`, etc. as
_categories_, with no tokens or instrument references behind them.

### 9. No scraping or credential-based bank login

- No aggregator SDK, no HTTP client pointed at an issuer, no headless browser.
- No OAuth providers configured in `supabase/config.toml`.
- `sources.url` stores a citation for a human to read; nothing fetches it.
- Targeted offers are typed in by the user, and rotating categories are self-reported
  (`user_rule_enrollments.status`), with the table comment recording why.

This costs convenience. It is the right trade: the alternative is holding banking
credentials for millions of people.

### 10. Only test data during development

- The entire seed catalog is fictional. Invented issuers, invented cards, invented rates.
- Every row carries `is_fictional = true`; every name is prefixed `DEMO —`.
- `sources` rows use `document_type = 'fictional_demo_data'`.
- `DemoDataBanner` shows persistently while `EXPO_PUBLIC_ENABLE_DEMO_DATA` is on.
- No real user data exists in any fixture.

---

## Threat model

| Threat                                   | Mitigation                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Another signed-in user reads a wallet    | RLS `user_id = auth.uid()`, `FORCE ROW LEVEL SECURITY`, tested per table                   |
| A member escalates to admin              | `users_update_self` pins `role`; type excludes it                                          |
| A member writes to the shared catalog    | Catalog writes gated on `can_edit_catalog()`                                               |
| Anonymous read of any table              | `anon` revoked; every policy `TO authenticated`                                            |
| Search-path hijack of a definer function | `set search_path` pinned, tested                                                           |
| Stolen device reads the session          | Session in platform keystore, not AsyncStorage                                             |
| Credentials leak via logs                | Mandatory redaction; `console.log` banned                                                  |
| Credentials leak via crash report        | Same redaction path for `captureException`                                                 |
| A PAN is entered anyway                  | Schema CHECK + Zod rejection + four-digit-max field                                        |
| Audit trail leaks the data it audits     | Column names only; no value columns                                                        |
| A secret is committed                    | `.gitignore`; `.env.example` carries no values                                             |
| History is tampered with                 | No UPDATE/DELETE policy on append-only tables                                              |
| A user is misled by an unverified rate   | `verification_status` + `last_verified_at` surfaced; `verified` requires evidence by CHECK |
| A bad migration removes a control        | `schema.test.ts` asserts the controls, so the build fails                                  |
| A policy predicate is subtly wrong       | 70 assertions against a real Postgres, as five different roles (`npm run test:db`)         |
| One user deletes another's account       | `delete_own_account()` takes no arguments; identity comes from the JWT                     |
| An export leaks the encrypted last four  | Ciphertext and key id replaced with a marker; asserted in `exportDocument.test.ts`         |
| An export silently omits a table         | Sections derived from the migrations, so a new personal table fails the build              |
| A retry loop burns quota or money        | `src/lib/rateLimit.ts` on the classifier path and bulk import (advisory — see below)       |

### Accepted limitations

Stated plainly rather than papered over.

- **The anon key ships in the bundle.** That is how Supabase works; RLS is the control, not
  key secrecy. This is why RLS coverage is tested per table rather than assumed.
- **Cap figures are estimates.** Issuers measure caps against unpublished statement cycles;
  WalletWise uses UTC calendar windows. Documented in `capWindow.ts` and disclosed in-app.
- **Enrollment state is self-reported.** Without a bank login we cannot verify it. The
  deliberate trade from requirement 9.
- **Device encryption is only as strong as the device.** A rooted or jailbroken device can
  reach the keystore. The last four are low-value by design, which is why only they are
  stored.
- **Rate limiting is client-side and advisory.** `src/lib/rateLimit.ts` throttles the
  expensive, abusable actions on the device, and Supabase Auth rate-limits sign-in
  server-side. A determined caller with the anon key can bypass the client limiter
  entirely; what stops them reading anything is RLS, not the limiter. The limiter exists
  to protect the user from a runaway retry loop and the project from an accidental bill,
  and it is honest about being nothing more than that. A server-side limit belongs in an
  Edge Function and is not built.

---

## Dependency audit

Run `npm audit` and read it against this section rather than reacting to the headline
count.

**As of the end of Phase 7: 50 advisories — 40 high, 10 moderate, 0 critical.**

Every one of them reaches the project through build tooling, not through code that runs
on a user's device. There are five distinct root advisories; the count is inflated because
`npm audit` reports every package in every path to each one.

| Root advisory                                     | Reached through                                                                    | Ships to the device? |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------- |
| `brace-expansion` — DoS via unbounded expansion   | `minimatch` / `glob`, under `eslint`, `jest`, `@react-native/codegen`, `@expo/cli` | No                   |
| `postcss` — path traversal via `sourceMappingURL` | `@expo/metro-config`, at bundle time                                               | No                   |
| `postcss` — arbitrary file read via source maps   | same                                                                               | No                   |
| `postcss` — XSS via unescaped `</style>`          | same; WalletWise ships no CSS and no web target                                    | No                   |
| `uuid@7` — missing buffer bounds check            | `@expo/config-plugins` → `xcode`, at prebuild time                                 | No                   |

Why no fix is applied:

- **No fix exists that does not downgrade the framework.** Each advisory sits in a
  transitive dependency pinned by `expo@54` / `react-native@0.81`. `npm audit fix --force`
  resolves them by moving Expo off its supported version, which trades three
  developer-machine advisories for an unsupported build toolchain. That is a worse
  position, not a better one.
- **The threat model does not reach them.** All five are exploited by feeding hostile
  input to a build tool: a malicious glob pattern, a crafted CSS source map, an
  attacker-controlled Xcode project. Reaching them requires already being able to run code
  in the build, at which point the audit is not the problem.
- **`npm audit --omit=dev` still reports 44,** because `expo` is a runtime dependency in
  `package.json` even though `@expo/cli` within it is build-time only. The flag is not a
  useful filter here, and quoting it as if it were would be misleading.

What is checked at each phase boundary, and what would change the answer:

- [ ] `npm audit` produces no **critical** advisory. One critical is a stop-and-fix,
      regardless of where it sits.
- [ ] No advisory names a package that appears in the shipped bundle. Anything reachable
      at runtime is treated as critical whatever severity it carries, because it runs on a
      user's phone.
- [ ] The count has not grown without explanation. A new advisory gets a row above or a
      fix, not silence.
- [ ] `@noble/ciphers`, `@supabase/supabase-js`, `expo-secure-store`, `expo-file-system`
      and `expo-sharing` are clean. These are the runtime dependencies that touch
      encryption, the session or the exported file.

---

## Secret scanning

`.env` is git-ignored and `.env.example` carries keys with no values, but neither fact
proves nothing was ever committed — a secret removed in a later commit is still in the
history and still readable from any clone.

So the history is scanned, not just the working tree. Over all 8 commits and 412 objects,
looking for: Supabase service-role JWTs (`eyJ…`), `SERVICE_ROLE_KEY=` with a value, PEM
private keys, `sk-` / `sk_live_` API keys, GitHub tokens (`ghp_`, `github_pat_`), AWS
access-key ids (`AKIA…`), Slack tokens (`xox…`), and connection strings with an inline
password.

**Result: no hits. `.env.example` is the only environment file ever tracked.**

One methodological note, because it is the part that is easy to get wrong: a scanner that
matches nothing is indistinguishable from a scanner that is broken. The first version of
this scan reported zero hits because its JWT pattern required a longer segment than the
test secret had — a clean bill of health from a scanner that could not have found
anything. Every run is therefore preceded by a negative control: three planted secrets of
realistic shape in a scratch file, all three of which must be detected before the real
result is believed.

### The one deliberate match

`4111111111111111` appears in `SECURITY.md`, `PRIVACY_NOTES.md`,
`src/domain/schemas.test.ts`, `src/lib/lastFour.test.ts`, `src/services/redaction.ts` and
`src/services/redaction.test.ts`.

This is the canonical Visa **test** number, present on purpose: it is the input that proves
`noCredentials()` rejects a PAN and that the redaction layer scrubs one. It is not a card,
it belongs to nobody, and removing it would delete the tests that enforce requirement 1.

---

## Reviewer checklist

Before merging anything that touches data:

- [ ] No new column could hold a PAN, CVV, PIN or password
- [ ] Any new table has RLS enabled, `FORCE`d if user-owned, and a policy per command
- [ ] Every new policy is scoped `TO authenticated`
- [ ] Owner-scoped predicates use `auth.uid()`, and child tables check the parent's owner
- [ ] New SECURITY DEFINER functions pin `search_path`
- [ ] New free-text fields go through `safeTextSchema` / `noCredentials`
- [ ] New telemetry keys are covered by the redaction lists, with a test
- [ ] No `console.log`; no new `EXPO_PUBLIC_` variable holding a secret
- [ ] New user-facing reward figures carry a disclaimer and a verification date
- [ ] `npm run verify` passes with no skipped tests

## Reporting a vulnerability

Do not open a public issue. Contact the maintainers directly with reproduction steps.
