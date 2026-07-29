#!/usr/bin/env node
/**
 * Walks the whole app in a real browser: sign in, choose cards, get a recommendation,
 * then reopen and confirm it remembered.
 *
 * WHY THIS EXISTS ALONGSIDE 1,295 UNIT TESTS
 * Every one of those tests stubs something. None of them can answer the question a user
 * actually asks — can I open this and get an answer? The two defects this class of check
 * has already caught in this project were both invisible to unit tests: a config read
 * that broke inlining and left the app unable to boot, and test files compiled into the
 * route table so the dev server refused to start.
 *
 * The figure asserted below is hand-checked: $100 of groceries on the Blue Cash
 * Preferred is 6% of 100 = $6.00, against 2% = $2.00 on the Citi Double Cash. If the
 * catalog's rates were ever written as fractions instead of percentages, this fails.
 *
 * Step 4 is the one worth having: a second browser tab, sharing storage, must land on
 * the purchase screen with the name and cards already there — never back on sign-in.
 *
 *   node scripts/flow-check.mjs <bundle-dir> <screenshot-dir>
 *
 * Exits non-zero and names the failing step.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const bundleDir = process.argv[2];
const outDir = process.argv[3];
const BASE = process.env['FLOW_BASE_PATH'] ?? '/New_Shared';
const PORT = 8131;
mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  let p = decodeURIComponent(url.pathname);
  if (p.startsWith(BASE)) p = p.slice(BASE.length) || '/';
  const rel = normalize(p).replace(/^(\.\.[/\\])+/, '');
  let f = join(bundleDir, rel);
  if (rel === '/' || !existsSync(f)) f = join(bundleDir, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const { chromium } = await import('playwright');

/**
 * Let Playwright find its own browser, unless told otherwise.
 *
 * An earlier version hardcoded a container-specific path
 * (`/opt/pw-browsers/chromium-.../chrome`). It worked in the sandbox it was written in
 * and failed on the first CI run with "executable doesn't exist" — a path that is
 * correct on exactly one machine is not a path.
 *
 * `npx playwright install chromium` puts the browser where Playwright expects it, so the
 * default resolution is right everywhere. The override exists for environments that
 * pre-install Chromium somewhere else and set the variable to say so.
 */
const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE'];
const browser = await chromium.launch({
  ...(executablePath === undefined || executablePath === '' ? {} : { executablePath }),
  // Required in containers, harmless on a CI runner.
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
const step = async (label, fn) => {
  try {
    await fn();
    console.log(`✓ ${label}`);
  } catch (e) {
    failed = true;
    console.log(`✕ ${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
};
const text = () => page.evaluate(() => document.body.innerText);
const shot = async (n) => {
  await page.screenshot({ path: join(outDir, `${n}.png`), fullPage: true });
};

try {
  await page.goto(`http://127.0.0.1:${PORT}${BASE}/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(8_000);

  await step('1. first open shows the sign-in page asking name and email', async () => {
    await shot('01-sign-in');
    const body = await text();
    for (const want of ['WalletWise', 'Your name', 'Email address', 'Sign in']) {
      if (!body.includes(want))
        throw new Error(`missing "${want}". Saw: ${body.slice(0, 400)}`);
    }
    if (/DEMO DATA|demonstration catalog|DEMO —/i.test(body))
      throw new Error('demo wording still present');
  });

  await step('1b. signing in moves to the card chooser', async () => {
    const inputs = page.locator('input:not([type="checkbox"])');
    await inputs.nth(0).fill('Zak Bek');
    await inputs.nth(1).fill('zak@example.com');
    await page
      .locator('[role="button"]')
      .filter({ hasText: /^Sign in$/ })
      .first()
      .click();
    await page.waitForTimeout(5_000);
    const body = await text();
    if (!body.includes('Search cards'))
      throw new Error(`not on chooser. Saw: ${body.slice(0, 400)}`);
  });

  await step('2. searching finds real bank cards with reward info', async () => {
    await page.locator('input').first().fill('chase');
    await page.waitForTimeout(1_500);
    await shot('02-search');
    const body = await text();
    for (const want of [
      'Freedom Unlimited',
      'Chase',
      '1.5% cash back',
      'Rates published by Chase',
    ]) {
      if (!body.includes(want))
        throw new Error(`missing "${want}". Saw: ${body.slice(0, 900)}`);
    }
  });

  await step('2b. adding cards to the wallet', async () => {
    for (const q of [
      'chase freedom unlimited',
      'citi double cash',
      'amex blue cash preferred',
    ]) {
      await page.locator('input').first().fill(q);
      await page.waitForTimeout(1_200);
      const add = page.locator('[role="button"]').filter({ hasText: /^Add to my wallet$/ });
      if ((await add.count()) === 0) throw new Error(`no Add button for "${q}"`);
      await add.first().click();
      await page.waitForTimeout(800);
    }
    await page.locator('input').first().fill('');
    await page.waitForTimeout(1_000);
    const body = await text();
    if (!body.includes('3 cards in your wallet'))
      throw new Error(`wallet count wrong. Saw: ${body.slice(0, 500)}`);
  });

  await step('2c. Continue goes to Start Purchase', async () => {
    await page
      .locator('[role="button"]')
      .filter({ hasText: /^Continue$/ })
      .first()
      .click();
    await page.waitForTimeout(4_000);
    await shot('03-purchase');
    const body = await text();
    if (!body.includes('Start a purchase'))
      throw new Error(`not on purchase. Saw: ${body.slice(0, 400)}`);
    if (!body.includes('Zak')) throw new Error('name not shown on purchase screen');
  });

  await step('3. entering a purchase and pressing Find the best card', async () => {
    const inputs = page.locator('input:not([type="checkbox"])');
    await inputs.nth(0).fill('Corner Market');
    await inputs.nth(1).fill('100');
    await page.getByText('Grocery', { exact: true }).first().click();
    await page.waitForTimeout(600);
    await page
      .locator('[role="button"]')
      .filter({ hasText: /Find the best card/ })
      .first()
      .click();
    await page.waitForTimeout(5_000);
    await shot('04-result');
  });

  await step('3b. the answer names one card and a hand-checkable figure', async () => {
    const body = await text();
    // 6% of $100 on the Blue Cash Preferred = $6.00
    if (!body.includes('Blue Cash Preferred'))
      throw new Error(`winner wrong. Saw: ${body.slice(0, 700)}`);
    if (!body.includes('$6.00')) throw new Error(`expected $6.00. Saw: ${body.slice(0, 700)}`);
    if (!body.includes('Next best')) throw new Error('no runner-up shown');
    console.log('   --- answer ---');
    console.log('   ' + body.split('\n').slice(0, 14).join('\n   '));
  });

  await step('4. reopening the app goes straight to Start Purchase', async () => {
    const fresh = await context.newPage();
    await fresh.goto(`http://127.0.0.1:${PORT}${BASE}/`, {
      waitUntil: 'load',
      timeout: 120_000,
    });
    await fresh.waitForTimeout(8_000);
    const body = await fresh.evaluate(() => document.body.innerText);
    await fresh.screenshot({ path: join(outDir, '05-returning.png'), fullPage: true });
    if (!body.includes('Start a purchase'))
      throw new Error(`did not land on purchase. Saw: ${body.slice(0, 400)}`);
    if (body.includes('Email address')) throw new Error('asked to sign in again');
    if (!body.includes('Zak')) throw new Error('name not remembered');
    if (!body.includes('Comparing 3 cards'))
      throw new Error(`cards not remembered. Saw: ${body.slice(0, 600)}`);
    await fresh.close();
  });

  console.log('--- uncaught errors ---');
  console.log(errors.length ? errors.join('\n') : '(none)');
  if (errors.length) failed = true;
} catch (e) {
  console.error('FLOW FAILED:', e instanceof Error ? e.message : String(e));
  failed = true;
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
