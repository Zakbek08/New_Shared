# Running WalletWise

There are two ways to open it. The first needs nothing installed.

---

## 1. The published link — nothing to install, nothing to start

**https://zakbek08.github.io/New_Shared/**

Open it on a phone or a laptop. On a phone it looks and behaves like the real app,
because it is the same code.

There is nothing to start and nothing to keep running. It is static hosting, so the
link works whether or not anyone is at a computer, and it is republished
automatically every time the code on `main` changes.

If you have had the page open before, force a refresh so you get the current build:
**Ctrl+Shift+R**, or **Cmd+Shift+R** on a Mac.

### What works

All of it. The published build runs against a **bundled fictional wallet**, so the
whole flow works with no account and no database:

| Do this                                      | Where                                          |
| -------------------------------------------- | ---------------------------------------------- |
| See five demonstration cards                 | **Wallet** tab                                 |
| Read the earn rates and cap progress         | Tap any card                                   |
| See where each rate came from                | Same screen, scroll down                       |
| Ask which card to use                        | **Purchase** tab → type a merchant and amount  |
| See the winner, runner-up and every reject   | The results screen, with a reason on each card |
| Follow the arithmetic row by row             | "How we worked this out"                       |
| See the document and its full change history | Bottom of that screen                          |

Two things worth trying, because they show the engine is really calculating rather
than reciting a headline rate:

- Enter **Greenleaf** for **100** — the 6% grocery card wins with **$6.00**.
- Change the amount to **5000** — the winner **changes** to the flat 2% card at
  **$100.00**, because the grocery card's yearly cap runs out partway through.

### Everything in it is invented

Every issuer, card and rate is fictional and labelled `DEMO —`. The app says so on
the first screen and again on every card. It describes no real financial product, and
no purchase decision should be made on it.

Signing in, syncing and saving are the parts that genuinely need a database. Those
screens exist and work; they just have nothing to connect to from this link. Wiring up
a real (free) database takes a few minutes — ask, and this same link works fully.

---

## 2. On your own machine — if you want to change the code

You need [Node.js](https://nodejs.org) 20 or newer. Then:

```bash
git clone https://github.com/Zakbek08/New_Shared.git
cd New_Shared
npm install
npm run preview:web
```

It prints a `http://localhost:8081` address — open that in a browser. Edit a file and
the page reloads by itself.

`npm run preview:web` is the demonstration wallet, same as the published link, so it
needs no database. To run against a real Supabase project instead, put its URL and
anon key in a `.env` file and use `npm start`.

### If `npm start` fails to launch

On a restricted or offline network, `expo start` can fail before it opens with
`SyntaxError: Unexpected token 'H', "Host not i"...`. That is the Expo CLI failing to
reach Expo's servers for a routine dependency check, not a problem with the app. Add
`--offline`, which skips that check:

```bash
npx expo start --web --offline
```

`npm run preview:web` already passes it.

---

## Running it as a real phone app

Both routes above run WalletWise in a browser. To install it on a phone as an actual
app, you need an Apple Developer account (£79/$99 a year) or a Google Play account
($25 once), plus an Expo build. That is a paid, account-bound step — the code is ready
for it, but it cannot be done from here.
