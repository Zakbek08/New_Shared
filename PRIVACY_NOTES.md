# Privacy notes

Written plainly. The user-facing version is the in-app **Privacy and Disclosures** screen
(`app/legal/disclosures.tsx`); this document is the engineering reference behind it.

---

## What WalletWise stores

| Data                                      | Where                                          | Why                                          |
| ----------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| Email address                             | `users.email`, `auth.users`                    | Sign-in identity                             |
| Display name (optional)                   | `users.display_name`                           | Greeting only                                |
| Locale, home country, home currency       | `users`                                        | Formatting and FX-fee logic                  |
| Disclaimer acceptance and version         | `users`                                        | So a wording change can prompt re-acceptance |
| Which card products you own               | `user_cards.card_product_id`                   | The wallet to compare                        |
| Card nicknames (optional)                 | `user_cards.nickname`                          | Telling similar cards apart                  |
| **Encrypted last four digits (optional)** | `user_cards.last_four_cipher`                  | Telling similar cards apart                  |
| Account open month (optional)             | `user_cards.account_opened_on`                 | Resolving cardmember-year cap windows        |
| Your point and mile valuations            | `user_reward_preferences`                      | The largest input to a recommendation        |
| Which bonuses you have activated          | `user_rule_enrollments`                        | Self-reported; we cannot check               |
| Targeted offers you entered               | `user_offers`                                  | Typed in by hand from your issuer's app      |
| Estimated cap progress                    | `reward_usage`                                 | Estimates, not a transaction ledger          |
| Purchases you asked about                 | `purchase_queries`                             | History, and the "recently evaluated" list   |
| Recommendations we gave                   | `recommendations`, `recommendation_candidates` | So an old answer stays explainable           |

## What WalletWise never stores

- Full card numbers. **No column in the database can hold one.**
- CVV, CVC, security codes, PINs.
- Bank usernames, passwords or security answers.
- Card expiry dates.
- Your actual transactions, balances or statements — WalletWise cannot see them.
- Location data, contacts, device identifiers for advertising, or any biometric data.

## The one exception, and its boundary

The **last four digits** are optional and exist only so you can tell two similar cards apart.

They are **encrypted on your device** before the row is written. The plaintext never leaves
the phone, so the server, the database, the backups and every log see only ciphertext.

This is not "encrypted at rest by the hosting provider" — that would still mean the
plaintext arrived. Here it does not.

Three database constraints guard the column even so: bare digit strings are rejected, the
ciphertext shape is bounded, and ciphertext without a key id is rejected.

---

## Why you enter offers and activations by hand

Because the alternative is worse.

Targeted offers and rotating-category activations live behind your issuer login. Reading
them automatically would mean holding your banking credentials, or routing them through an
aggregator that does. WalletWise refuses to do either.

So you copy the offers across yourself. It takes a moment, and your issuer login stays where
it belongs. The honest cost of that decision:

- Offers are only as current as your last update.
- Activation state is self-reported. If you tell WalletWise a quarter is activated when it
  is not, the recommendation will be wrong.
- Cap progress is an estimate, not a ledger.

The app says all of this on screen rather than implying more precision than it has.

---

## What gets logged

Diagnostic events record which screens were used and which code paths ran. Every payload
goes through `src/services/redaction.ts` first — not by convention, but because
`track()` and `captureException()` call it unconditionally.

| Class                            | Treatment           | Example                                                   |
| -------------------------------- | ------------------- | --------------------------------------------------------- |
| Credentials                      | dropped             | `cvv` → `[redacted]`                                      |
| Identifiers                      | dropped             | `email`, `display_name`, `phone` → `[redacted]`           |
| Card digits                      | dropped             | `last_four_cipher` → `[redacted]`                         |
| Dollar amounts                   | coarsened to a band | `120` → `"100-499"`                                       |
| Merchant names, notes, free text | length only         | `"Greenleaf Market"` → `"[16 chars]"`                     |
| Any string                       | card-number masked  | `"ref 4111111111111111"` → `"ref [card-number-redacted]"` |
| Engine diagnostics               | preserved           | `ineligibilityCode: "cap_exhausted"`                      |

So a real event looks like:

```json
{
  "event": "recommendation_viewed",
  "amountUsd": "100-499",
  "merchant": "[16 chars]",
  "categorySlug": "grocery",
  "confidence": "high",
  "eligibleCount": 4,
  "hasCodingWarning": false
}
```

Enough to diagnose a bug. Not enough to reconstruct what someone bought, where, or for how
much.

`console.log` is banned by lint. An unredacted log line is the likeliest way sensitive data
escapes a mobile app, so the escape hatch is closed rather than discouraged.

### The audit trail records shape, not content

`audit_logs` records _which columns_ changed on a catalog row — never their values. There is
no `old_value` column, so the trail cannot leak the data it describes. A CHECK constraint
additionally rejects credential-shaped keys in its `context` JSON.

---

## Who can read your data

Row-level security is enabled on all 19 tables, and forced on every user-owned one. The
predicate is `user_id = auth.uid()`.

Concretely:

- Another signed-in user cannot read your wallet, offers, queries or recommendations, even
  with a hand-crafted request. The database refuses.
- The anonymous role is revoked from every table. Everything requires a session.
- Catalog editors can edit the shared card catalog. They cannot read any user's wallet.
- Child records verify their parent's owner, so nobody can attach an offer to your card.
- A member cannot promote themselves to admin — the update policy pins their own role to its
  current value.

The Supabase anon key ships inside the app bundle, as it does in every Supabase client. That
is why RLS is the control and key secrecy is not, and why RLS coverage is asserted per table
by tests rather than assumed.

---

## Deleting your account

Settings → **Delete your account**. You type `DELETE` to confirm, because a second tap on a
dialog lands on muscle memory before the sentence is read, and this cannot be undone.

Deleting the `auth.users` row cascades to every table that references it. Your profile,
wallet, preferences, enrollments, offers, cap history, queries and recommendations all go. It
happens in one database transaction, so there is no half-deleted state.

The encryption key for any stored card digits is wiped from the device at the same time —
after the account is gone, not before. If the order were reversed and the deletion then
failed, your account would survive holding digits nobody, including you, could ever decrypt.

Only you can do it. `public.delete_own_account()` takes no arguments: the account it deletes
is always the one in your session token, so "delete somebody else's account" is not something
the function can express. That is asserted in `supabase/tests/10_rls.sql`, along with the
fact that a signed-out caller cannot call it at all.

Two things survive by design, and neither identifies you:

- `audit_logs` rows where you were the _actor_ keep the log entry with `actor_id` set to
  `null` (`ON DELETE SET NULL`), because a catalog-editing trail must remain intact. Those
  rows contain only column names.
- `verification_history` rows you created keep the verification record with `verified_by` set
  to `null`.

## Data export

Settings → **Export your data**. You get a JSON file containing everything in the tables
listed above: your profile, your cards, your reward valuations, your enrollments, your offers,
your recorded spending against caps, every purchase you asked about and the recommendation
given, the per-card breakdown behind each one, any custom cards and rates you entered
yourself, and any audit rows you are party to. Thirteen sections in all.

The file is complete because it is your data. The one thing it does not contain in readable
form is any card digits you stored: those are encrypted with a key that never leaves your
device, and the file marks them as encrypted rather than showing them. Writing them out in
plaintext would undo the reason the column is encrypted in the first place, and you already
know your own last four.

There is no card number, security code or PIN in the file, because WalletWise never stores
one.

**How we know it is actually complete.** A test could easily confirm the export matches a
list somebody wrote by hand — and confirm nothing. So the test reads the database migrations
instead, works out which tables hold personal data from the row-level-security rules applied
to them, and fails if any of them has no section in the export. That check is what caught the
export missing custom cards and the rates entered for them.

Only counts reach analytics — how many sections, how many records. Never a row, never a
filename, never anything you typed.

---

## Third parties

Phase 1 has **no third-party data processors**. Analytics and error monitoring default to a
no-op sink; with no key configured, nothing is transmitted anywhere.

If a vendor is added later it must be listed here, and it receives only redacted payloads —
the sink interface makes bypassing redaction impossible without changing
`src/services/analytics.ts` itself.

Supabase is the only infrastructure processor: authentication and the database.

---

## Demonstration data

While `EXPO_PUBLIC_ENABLE_DEMO_DATA` is on, the catalog is fictional. Invented issuers,
invented cards, invented rates. Nothing in it describes a real financial product, and the
app shows a persistent banner saying so.

No real user data exists in any fixture or test.

---

## Regulatory posture

WalletWise is **not** a financial institution, a payment processor, a money transmitter, a
credit broker or a financial adviser. It gives estimates over public reward terms and the
card list you typed in.

It is not in scope for PCI DSS, because it never handles cardholder data: no PAN, no CVV, no
track data, no authentication credentials. The optional last four are, on their own, not
cardholder data under PCI DSS — and they are encrypted client-side regardless.

None of that is legal advice. If WalletWise is ever distributed at scale, get an actual
review.
