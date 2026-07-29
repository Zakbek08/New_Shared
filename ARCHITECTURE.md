# Architecture

## The shape of the problem

Picking the best card for a purchase is a ranking problem with awkward inputs. Reward
rates are public but scattered and change without notice. The category a merchant is
coded under is genuinely uncertain, and the issuer — not the app — decides it. Caps are
per-cardholder and invisible from outside. And the value of a point depends on how a
particular person redeems.

That shapes the whole design:

1. **Rates live in data, never in code paths.** They change, they need provenance, and
   they need a date the user can see.
2. **Category uncertainty is modelled, not hidden.** The classifier reports how it
   decided and how sure it is, so the app can say "your bank decides the real category"
   instead of quietly guessing.
3. **The engine is a pure function.** Given a wallet, a purchase and an instant, it
   returns the same answer every time. Reproducibility is what makes a financial estimate
   auditable.
4. **There is no server.** Nothing the app computes depends on anyone else's machine, so
   adding one would buy an account system, a password and a breach surface in exchange for
   nothing the user asked for.

---

## The five screens, and the gate

```
app/index.tsx ── the gate. Reads storage, then redirects. Renders no content.
   │
   ├── no profile ─────────▶ app/sign-in.tsx        name + email, once
   ├── no cards ───────────▶ app/choose-cards.tsx   search the catalog, add what you hold
   └── otherwise ──────────▶ app/purchase.tsx       the home screen for a returning user
                                   │
                                   ▼
                            app/result.tsx          one card, the figure, and why
```

`app/about.tsx` carries the disclosures and the "start over" control.

The gate waits for storage rather than redirecting on the first render. Guessing would
send a returning user to sign-in for a frame — visible, alarming, and the most annoying
bug this kind of app can have.

---

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│  app/                Expo Router screens                     │
│                      Composition and navigation only         │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  src/features/local/  Storage, and the wallet → answer bridge │
└──────────┬────────────────────────────────────┬──────────────┘
           │                                    │
┌──────────▼──────────────┐      ┌──────────────▼──────────────┐
│  src/components/        │      │  src/domain/                │
│  Design system          │      │  PURE logic                 │
│  src/theme/             │      │  No React · No I/O · No clock│
└─────────────────────────┘      └──────────────┬──────────────┘
                                                │
┌───────────────────────────────────────────────▼──────────────┐
│  src/data/            The card catalog: dated, sourced, real  │
└──────────────────────────────────────────────────────────────┘
```

Dependencies point downward only. `src/domain/` is a leaf: it imports types and other
domain modules, nothing else. That is what lets the engine be tested with plain objects
and no harness.

---

## The pipeline

```
 Purchase input (app/purchase.tsx)
        │  reads the clock ONCE, here, at the edge
        ▼
 classifyPurchase()            src/domain/classifier/
        │  what kind of purchase, and how sure
        ▼
 evaluateWallet()              src/domain/rewards/
        │  twelve deterministic steps over rule records
        ▼
 explainRecommendation()       src/domain/rewards/explain.ts
        │  words assembled from the figures, never generated
        ▼
 app/result.tsx
```

`src/features/local/recommend.ts` is the only place these meet. It does no arithmetic
itself — if it started adjusting a rate or breaking a tie, the recommendation would stop
being reproducible and no test could pin it.

---

## Where the numbers come from

`src/data/marketCards.ts` holds 22 real products from 8 issuers. Each carries the issuer's
own product-page URL and the date its rates were read off that page, and both are shown in
the UI. The file is a **dated transcription, not a live feed** — WalletWise does not scrape
issuer pages, so a human reads them and types the result, which is exactly why the date is
load-bearing.

Deliberately omitted: sign-up bonuses, transfer-partner valuations, and "up to $X in
credits" perks. They depend on behaviour the app cannot see, and folding them into a
per-purchase answer would make the answer to "which card for this coffee?" quietly wrong.

Rotating and choose-your-own bonuses are modelled as requiring activation without
asserting which quarter or category is live, because the app has no feed for that. They do
not compete until the cardholder confirms they have switched them on.

---

## What was removed, and why it is not missing

Earlier versions of this app had a Supabase backend: 19 tables, row-level security on
every one, an admin catalog, auth, and data export and deletion. All of it is gone.

It was not wrong — it was scope the product does not need. A bundled catalog plus a pure
engine answers the question completely on the device. Keeping a server would have meant
keeping an account system, a password reset flow, an RLS matrix to prove correct, and
personal data in a place that can be breached, to deliver an answer that never needed to
leave the phone.

The pure domain layer survived unchanged, which is the point of having built it that way.

---

## Model use

A language model is permitted exactly two things in this codebase, and does neither today:

| Allowed                                           | Forbidden                                        |
| ------------------------------------------------- | ------------------------------------------------ |
| Turning free text into structured purchase fields | Producing, estimating or adjusting a reward rate |
| Rephrasing a calculation the engine already did   | Deciding which card wins, or inventing a cap     |

The free-text parsing that would have been the allowed case is implemented as a
deterministic parser (`src/domain/purchaseText/`) instead, because a pure function can be
tested against hand-checked expectations and cannot fail closed into a guessed rate.
