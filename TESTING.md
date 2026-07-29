# Testing

## Principles

**Do not skip a test to make the build pass.** A failing test is information. Fix the code,
or fix the test's premise — and say which one you did and why. Two premises changed during
the rebuild and both say so in place, in the test file.

**A reward figure needs a hand-checked expected value.** Write the arithmetic into the test
name or a comment so a reviewer can verify it on paper:

```ts
// $100 of groceries on the Blue Cash Preferred: 6% of 100 = $6.00.
it('Blue Cash Preferred earns $6.00 on a $100 grocery shop', () => { … });
```

**Pin time explicitly.** The engine takes `asOf` as a parameter precisely so tests never
mock a clock. There is no `jest.useFakeTimers()` anywhere in this suite.

**Test the boundaries.** Cap exactly reached, cap partially remaining, cap exhausted, rule
expiring today, zero-dollar purchase, missing category, tied values. Bugs live at the edges,
and in a rewards engine an edge-case bug quietly costs the user money.

**Negative-control every guard.** A check that would pass on broken input is worse than no
check, because it reads as reassurance. Several guards here assert the _absence_ of
something; each also asserts it fires when the thing is present.

---

## Stack

| Tool                         | Role                                                     |
| ---------------------------- | -------------------------------------------------------- |
| Jest 29 + `jest-expo`        | Runner (Jest 29 is what `jest-expo@54` targets)          |
| React Native Testing Library | Component tests, queried the way a user perceives the UI |
| Playwright                   | One end-to-end walk through the built bundle, in CI      |

```bash
npm test                  # all suites
npm run test:coverage     # with coverage thresholds
npx jest src/domain       # one directory
npx jest -t "cap"         # by test name
npm run verify            # format + lint + typecheck + tests
```

**1,301 tests across 36 suites, no skips.**

---

## The suites that matter most

| Suite                                        | What it pins                                                        |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `src/domain/rewards/*.test.ts`               | The engine: conditions, caps, stacking, valuation, ranking, wording |
| `src/domain/purity.test.ts`                  | That the engine has no clock, no network, no randomness             |
| `src/data/marketCards.test.ts`               | Hand-checked arithmetic on the real catalog, and its integrity      |
| `src/features/local/recommend.test.ts`       | The wiring from a stored wallet to an answer                        |
| `src/features/local/storage.test.ts`         | Hostile storage: malformed, wrong-shaped, and retired card ids      |
| `src/domain/schemas.test.ts`                 | Credential rejection, positively and negatively                     |
| `src/theme/contrast.test.ts`                 | WCAG 2.2 AA on every colour pair the app renders, both schemes      |
| `src/components/accessibility.audit.test.ts` | A repo-wide source audit over every component and screen            |
| `src/config/env.test.ts`                     | The source shape that makes configuration inlinable                 |
| `src/config/bundle.test.ts`                  | That a test file could never reach the app bundle                   |

---

## The rates must be percentages

`money.percentOf` divides by 100, so `6` means 6% and `0.06` would mean six hundredths of
a percent. A catalog written in fractions would still parse, still render, still rank cards
in a plausible order, and quietly report **$0.006** on a $100 grocery shop.

So every expected value is worked out by hand from the published rate:

| Purchase                | Card                | Arithmetic                  | Expected |
| ----------------------- | ------------------- | --------------------------- | -------- |
| $100 groceries          | Blue Cash Preferred | 6% of 100                   | $6.00    |
| $100 anything           | Citi Double Cash    | 2% of 100                   | $2.00    |
| $200, no bonus category | Freedom Unlimited   | 1.5% of 200                 | $3.00    |
| $10,000 groceries       | Blue Cash Preferred | $6,000 at 6% + $4,000 at 1% | $400.00  |
| $100 dining             | Amex Gold           | 4x = 400 points, at 1¢      | $4.00    |

The $10,000 case is the interesting one: it exercises the cap split, and the capped card
still wins ($400) against the flat 2% card ($200), which only a real calculation can tell
you.

---

## The catalog is real, so its integrity is tested

`marketCards.test.ts` asserts, per card:

- The source URL is **https** and points at the issuer directly.
- It carries **no referral or affiliate parameters**. A recommendation that pays the
  recommender is worth nothing to the reader, so this is a product invariant, not a style
  preference.
- It records **the date its rates were read**. A rate with no date is a claim about today
  that nobody has checked.
- Every rate is ≥ 1, catching a fraction typed where a percentage belongs.
- Every cap is paired with the period it resets on.
- Nothing says `DEMO`, `fictional` or `example` — the catalog used to be invented, and
  nothing should still be.

---

## Activation is tested in both directions

Rotating and choose-your-own bonuses (Freedom Flex, Discover it, Citi Custom Cash, BoA
Customized Cash, US Bank Cash+) must not count until the cardholder confirms they switched
them on. Recommending an unactivated 5% bonus would have someone pay with a card earning
1%, which is the most expensive mistake this app could make.

So the test asserts the flip:

- **Off** — Discover it falls to its 1% base, so the flat 2% card wins at $2.00.
- **On** — Discover it pays 5% = $5.00 and wins.

`walletToCards` is also asserted to enrol _only_ the rules that need it. Marking the base
rule as enrolled would be a claim about the user with no basis.

---

## Storage is untrusted input

It survives app upgrades, gets hand-edited in browser devtools, and is left half-written
when a tab closes mid-save. The tests are the hostile ones: malformed JSON, the wrong
shape, an email that was valid under looser rules, and — the consequential one — **a
stored card id the catalog no longer has**.

That last case is real: a card can be retired between versions, and a wallet holding an id
with no product behind it would be a card the engine silently cannot price. Neither
recommended nor rejected, just absent from every answer.

A separate test asserts what is written contains no card digits, no security codes and no
credentials. The stored card reference is a public catalog id like `citi-double-cash`;
knowing which products someone holds is not a credential, and a card number would be.

---

## Two guards with negative controls

### Configuration must be inlinable

`src/config/env.ts` once read `process.env` through a computed key. Metro inlines
`EXPO_PUBLIC_*` by syntactically replacing each static `process.env.NAME` expression at
build time, so a computed read is invisible to it: nothing is substituted, `process.env` is
empty on device, and the app throws on boot with a perfectly correct `.env` right there.

Every behavioural test passed throughout, because Jest runs in Node where dynamic access
works. Only a check on the **source text** catches it, which is the second half of
`env.test.ts`. `scripts/check-bundle.mjs` then checks the **built artefact**, because the
source could be right and the mechanism still break.

### Test files must never reach the bundle

Expo Router builds its route table from `require.context(app/, /\.[tj]sx?$/)` — every
`.tsx` under `app/` becomes a route, and the only exclusions are the `+`-prefixed special
files. Test files are not excluded, so three colocated screen tests were once registered as
routes: `expo start` refused to boot, and the published bundle carried **342 KB** of
assertion library.

`metro.config.js` blocks `*.test.*`. Two guards:

| Guard                       | Asserts                                            | Cost    |
| --------------------------- | -------------------------------------------------- | ------- |
| `src/config/bundle.test.ts` | The resolved block list would catch such a file    | ~1s     |
| `scripts/check-bundle.mjs`  | The built artefact contains no matcher or renderer | a build |

The Jest guard loads `metro.config.js` in a **Node subprocess**, because
`expo/metro-config` pulls in `yaml`'s ESM which jest-expo will not transform. That is
deliberate rather than a workaround: asserting the regex as source text would pass on a
config that defined the right pattern and forgot to assign it to `resolver.blockList`.

There are no test files under `app/` today, so the guard is forward-looking — it asserts
that paths like `app/purchase.test.tsx` _would_ be blocked. The trap is a property of Expo
Router, not of one commit.

**The control removed a check rather than adding one.** `@testing-library/react-native` was
a third artefact marker until a deliberately broken build showed it reporting clean on a
bundle that was demonstrably contaminated — the module name does not survive bundling even
when its code does. A tick with nothing behind it is worse than no check, so it was deleted
rather than kept for the reassurance.

---

## The end-to-end walk

`scripts/flow-check.mjs`, run as a CI job. Every unit test stubs something; none of them
can answer the question a user actually asks.

It exports the bundle, serves it, and drives Chromium through all four steps: sign in, add
three cards by search, ask about $100 of groceries, and assert the answer names the Blue
Cash Preferred at **$6.00** with the Double Cash as runner-up at $2.00. Then it opens a
**second tab sharing the same storage** and asserts it lands on the purchase screen with
the name and cards already there — never back on sign-in. That is step 4 of the product,
and nothing short of a real browser can check it.

Two defects in this project were caught only by this class of check, both invisible to
every unit test: the configuration read that broke inlining, and the test files compiled
into the route table.

---

## Accessibility

`accessibility.audit.test.ts` reads every `.tsx` under `src/components`, `src/features` and
`app/` and fails on a touchable whose role or label count is lower than its opening count,
`allowFontScaling={false}`, a hard-coded `lineHeight`, a literal `44` where
`MIN_TOUCH_TARGET` belongs, or a screen with no `accessibilityRole="header"`.

Two premises changed in the rebuild, and the file says so where it happens:

1. The file-count floor dropped from 25 to 15, because the app went from seventeen screens
   to six. Its job is to catch a path typo returning nothing, and 15 still does that.
2. `app/index.tsx` is exempt from the heading rule, because it renders a loading state and
   a `<Redirect>` and no content. A second test asserts it really does redirect, so the
   exemption stops being true the moment the gate grows a UI.

It cannot simulate a screen-reader gesture. **VoiceOver and TalkBack passes remain manual
and are not done** — they need a device and a person, and are listed as outstanding rather
than implied to be complete.

One check is deliberately vacuous and says so in its own assertion: nothing in the app
animates, so the reduced-motion check examines nothing. A separate test asserts _that_ —
zero animating files — and will fail the moment an animation is added, at which point the
reduced-motion check starts doing real work.

---

## Coverage

Thresholds sit just under measured, so a regression fails rather than a rounding change.
`src/domain/` is held highest, because that is where a wrong number comes from.
