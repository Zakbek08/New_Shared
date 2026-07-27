# Looking at WalletWise

No installation and no commands. There is **one setting to switch on, once** — it
cannot be automated, because turning on web hosting for a repository needs a
permission that automation is not given. Three clicks, then it is done forever.

## Step 1 — switch on hosting (once)

1. Open **https://github.com/Zakbek08/New_Shared/settings/pages**
2. Under **Source**, choose **GitHub Actions**
3. That is all — there is no Save button

## Step 2 — the link

**https://zakbek08.github.io/New_Shared/**

Open it on a phone or a laptop. On a phone it will look like the real app, because
that is the same code the app itself runs.

It is republished automatically every time the code on `main` changes, so the
address stays current and does not need to be regenerated.

It goes live a minute or two after step 1. If the link says "404 there isn't a
GitHub Pages site here", step 1 has not taken effect yet, or the publish is still
running.

## What you can do right now

You will land on the welcome screen. From there:

- **Read the two safety notices.** They are on the first screen on purpose. One says
  WalletWise never moves money or connects to a bank. The other says it never asks
  for a card number, security code, PIN or banking password.
- **Tap "Create an account"** or **"I already have an account"** to see the sign-up
  and sign-in screens, and the wording of the disclaimers you would be agreeing to.

## What does not work yet, and why

**You cannot create an account or sign in.** Everything past that point — adding
cards, asking which card to use, seeing a recommendation — needs a database, and
there is not one connected to this preview.

That is not a bug. WalletWise keeps each person's wallet private using database
rules, so there is nothing to look at until there is a real database with a real
account in it. Wiring one up takes a few minutes and is free; ask and it can be
done, after which this same link works fully.

The alternative would be a preview stuffed with invented card names and made-up
reward rates. For an app whose entire purpose is telling you the truth about money,
a convincing fake is worse than an honest gap.

## Is anything here sensitive?

No.

- The repository is public. It contains no passwords or keys — the history has been
  scanned for them.
- Every card, bank and reward rate in the demonstration data is **invented**. None
  of it describes a real financial product.
- WalletWise cannot take a payment or reach a bank. It has no code that could.

## If the page looks broken

Two things to try, in order:

1. **Refresh.** A publish takes a minute or two, and a browser can hold on to the
   old version.
2. **Check the address ends with a slash:** `.../New_Shared/`

If it is still wrong, the publishing log is under the repository's **Actions** tab,
in the run named **pages** — the failure will be named there rather than silent.
