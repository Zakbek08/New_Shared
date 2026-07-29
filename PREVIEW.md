# Running WalletWise

Two ways. The first needs nothing installed.

---

## 1. The published link

**https://zakbek08.github.io/New_Shared/**

Open it on a phone or a laptop. There is nothing to start and nothing to keep running —
it is static hosting, so the link works whether or not anyone is at a computer, and it
republishes automatically whenever `main` changes.

If you have opened it before, force a refresh to get the current build: **Ctrl+Shift+R**,
or **Cmd+Shift+R** on a Mac.

---

## 2. On your own machine

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/Zakbek08/New_Shared.git
cd New_Shared
npm install
npm run preview:web
```

Open the `http://localhost:8081` address it prints. Edit a file and the page reloads
itself.

### If `npm start` will not launch

On a restricted or offline network, `expo start` can fail before it opens with
`SyntaxError: Unexpected token 'H', "Host not i"...`. That is the Expo CLI failing to
reach Expo's servers for a routine dependency check, not a problem with the app. Add
`--offline`:

```bash
npx expo start --web --offline
```

`npm run preview:web` already passes it.

---

## Using it

**First time**, three steps:

1. **Sign in** — your name and email address. There is no password, because there is no
   account: nothing is uploaded, so there is nothing for a password to protect.
2. **Choose your cards** — search for the cards you actually hold and add them. Search by
   issuer (`chase`), by name (`double cash`), or by nickname (`csp`, `bcp`).
3. **Start a purchase** — where, how much, what kind of thing, how you are paying. Press
   **Find the best card**.

**Every time after that**, the app opens straight on Start a purchase with your name and
cards already there.

### Worth trying

- `Corner Market`, **100**, **Grocery** — with an Amex Blue Cash Preferred and a Citi
  Double Cash in your wallet, the Blue Cash Preferred wins with **$6.00** against
  **$2.00**. That is 6% of $100, and you can check it on paper.
- Change the amount to **10000**. The answer becomes **$400.00**, not $600 — the 6% rate
  is capped at $6,000 a year, so $6,000 earns 6% ($360) and the remaining $4,000 earns
  the post-cap 1% ($40).
- Add a **Discover it** and ask about something in **Other**. It loses to a flat 2% card,
  because its 5% is a rotating bonus you have to switch on with Discover — until you tick
  "I have activated this card's bonus categories" on the card, WalletWise will not count
  it. Tick it and the answer changes.

---

## Where the rates come from

22 cards from 8 issuers: American Express, Bank of America, Capital One, Chase, Citi,
Discover, U.S. Bank and Wells Fargo.

Each card's rates were read by hand from that issuer's own product page. Every card shows
**the date it was read** and links **the page it was read from**, so any figure can be
checked at source in one tap.

Issuers change rates without notice, so treat these as a starting point and confirm with
your bank. The catalog covers the major issuers' mainstream cards, not every card on the
market — if yours is missing, the app says so rather than guessing its rates.

Cards that earn points rather than cash are valued at **1¢ per point**. That is an
assumption, not a rate: a deliberately cautious floor, so a points card that wins here
would also win at a higher valuation.

WalletWise earns nothing from any card it recommends. No referral links, no affiliate
fees — there is a test asserting the source URLs carry no referral parameters.

---

## What it stores, and what it will never do

Your name, your email and your list of cards, saved **in that browser or app on that
device**. No server, no account, no password. The flip side, stated plainly: clearing
your browser data or reinstalling loses them, because there is no copy.

It never takes a payment, never asks for a card number, security code, PIN or banking
password, never signs in to your bank, and never fetches or scrapes an issuer's website.

---

## Running it as a real phone app

Both routes above run WalletWise in a browser. To install it on a phone as an actual app
you need an Apple Developer account (£79/$99 a year) or a Google Play account ($25 once),
plus an Expo build. The code is ready for it; that step is paid and tied to your identity,
so it cannot be done from here.
