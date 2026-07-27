#!/usr/bin/env node
/**
 * Boots the exported web bundle in a browser and asserts the app mounts.
 *
 * WHY "IT COMPILED" IS NOT ENOUGH
 * The unit suite mocks every dependency and runs under Node. The bundle check
 * proves the configuration reached the artefact. Neither proves the app *runs*:
 * a throw in a provider, a bad import resolved only at runtime, or a missing
 * polyfill produces a bundle that builds cleanly and renders a blank screen.
 *
 * This is the cheapest test that would catch that. It serves the bundle, loads
 * it, and fails if the root is empty or anything threw.
 *
 * Deliberately not a full end-to-end test. There is no backend here, so signing
 * in is out of scope — auth requests are expected to fail and are not counted
 * against the run. What is checked is that the first screen renders and that the
 * app got far enough to ask.
 *
 *   node scripts/smoke-web.mjs <bundle-dir>
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const RED = '[31m';
const GREEN = '[32m';
const DIM = '[2m';
const RESET = '[0m';

const bundleDir = process.argv[2];
if (bundleDir === undefined) {
  process.stderr.write('Usage: node scripts/smoke-web.mjs <bundle-dir>\n');
  process.exit(1);
}

const OUT_DIR = 'smoke';
const PORT = 8099;

/**
 * The path the app is served under, read from the same place the build reads it.
 *
 * GitHub Pages serves a project site from a subdirectory, so `experiments.baseUrl`
 * in app.json is `/New_Shared` and every asset reference in index.html is prefixed
 * with it. Serving the bundle at `/` here would 404 on its own JavaScript and the
 * app would never mount — the check would fail for a reason that has nothing to do
 * with the app. Reading the value rather than hard-coding it means this keeps
 * matching if the deployment path changes.
 */
function readBaseUrl() {
  try {
    const config = JSON.parse(readFileSync('app.json', 'utf8'));
    const baseUrl = config?.expo?.experiments?.baseUrl;
    return typeof baseUrl === 'string' ? baseUrl.replace(/\/$/, '') : '';
  } catch {
    return '';
  }
}

const BASE_URL = readBaseUrl();

/** Text the first screen must contain, so a blank mount cannot pass. */
const EXPECTED_PHRASES = [
  'WalletWise',
  // The security disclaimer is a product requirement, not decoration: it must be
  // on the first screen a user sees. If it silently disappears, that is a defect
  // worth failing a build over.
  'never asks for a full card number',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);

  // Strip the deployment prefix, so `/New_Shared/_expo/x.js` resolves to
  // `dist/_expo/x.js` exactly as it does on the real host.
  let pathname = decodeURIComponent(url.pathname);
  if (BASE_URL !== '' && pathname.startsWith(BASE_URL)) {
    pathname = pathname.slice(BASE_URL.length) || '/';
  }

  // `normalize` then reject `..` so a path cannot escape the bundle directory.
  const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(bundleDir, relative);

  if (relative === '/' || relative === '\\' || !existsSync(filePath)) {
    filePath = join(bundleDir, 'index.html');
  }

  if (!existsSync(filePath)) {
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
  });
  response.end(readFileSync(filePath));
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
const appUrl = `http://127.0.0.1:${PORT}${BASE_URL}/`;
process.stdout.write(`${DIM}Serving ${bundleDir} at ${appUrl}${RESET}\n`);

/** Resolved lazily so the script can explain itself if Playwright is absent. */
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  process.stderr.write(
    `${RED}Playwright is not installed.${RESET}\n` +
      'This check needs a browser:  npx playwright install --with-deps chromium\n',
  );
  server.close();
  process.exit(1);
}

/**
 * Honour a pre-installed browser when one is pointed at.
 *
 * CI runs `playwright install chromium`, which downloads the build this Playwright
 * version expects, so the default resolution is correct there and this stays
 * unset. Some sandboxes ship a Chromium at a fixed path that does not match the
 * pinned revision; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` lets those run the check
 * without downloading a second browser.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (executablePath !== undefined && executablePath !== '') {
  process.stdout.write(`${DIM}Using the Chromium at ${executablePath}${RESET}\n`);
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  ...(executablePath !== undefined && executablePath !== '' ? { executablePath } : {}),
});
const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  // The favicon is requested by the browser, not the app, and there is no reason
  // for a bundle to ship one. Network failures to the placeholder Supabase host
  // are expected: there is no backend in this job.
  if (/favicon/i.test(text)) return;
  if (/Failed to load resource/i.test(text)) return;
  consoleErrors.push(text);
});

let exitCode = 0;

try {
  await page.goto(appUrl, { waitUntil: 'load', timeout: 60_000 });

  // A fixed settle window rather than waiting on a selector: the assertion is
  // about the app mounting at all, so it must not depend on a testID that could
  // itself be the thing that broke.
  await page.waitForTimeout(6_000);

  const rootSize = await page.evaluate(
    () => document.getElementById('root')?.innerHTML.length ?? 0,
  );
  const visibleText = await page.evaluate(() => document.body.innerText);

  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, 'boot.png'), fullPage: true });
  writeFileSync(
    join(OUT_DIR, 'boot.json'),
    JSON.stringify({ rootSize, visibleText, pageErrors, consoleErrors }, null, 2),
  );

  process.stdout.write(`${DIM}Mounted DOM: ${rootSize} characters in #root${RESET}\n`);

  if (pageErrors.length > 0) {
    process.stderr.write(`${RED}✕ Uncaught error during boot:${RESET}\n`);
    for (const error of pageErrors) process.stderr.write(`      ${error}\n`);
    exitCode = 1;
  } else {
    process.stdout.write(`  ${GREEN}✓${RESET} no uncaught errors\n`);
  }

  if (rootSize === 0) {
    process.stderr.write(
      `${RED}✕ The app did not mount — #root is empty.${RESET}\n` +
        '      The bundle built, so this is a runtime failure, not a build one.\n',
    );
    exitCode = 1;
  } else {
    process.stdout.write(`  ${GREEN}✓${RESET} the app mounted\n`);
  }

  for (const phrase of EXPECTED_PHRASES) {
    if (visibleText.includes(phrase)) {
      process.stdout.write(`  ${GREEN}✓${RESET} first screen contains "${phrase}"\n`);
    } else {
      process.stderr.write(
        `${RED}✕ First screen does not contain "${phrase}".${RESET}\n` +
          `      Rendered text was:\n      ${visibleText.slice(0, 500).replace(/\n/g, '\n      ')}\n`,
      );
      exitCode = 1;
    }
  }

  if (consoleErrors.length > 0) {
    // Reported, not fatal: without a backend some console noise is legitimate.
    process.stdout.write(`${DIM}console errors (not failing the run):${RESET}\n`);
    for (const error of consoleErrors.slice(0, 10)) process.stdout.write(`      ${error}\n`);
  }
} catch (error) {
  process.stderr.write(
    `${RED}✕ ${error instanceof Error ? error.message : String(error)}${RESET}\n`,
  );
  exitCode = 1;
} finally {
  await browser.close();
  server.close();
}

process.stdout.write(
  exitCode === 0
    ? `\n${GREEN}The app boots and renders.${RESET}\n`
    : `\n${RED}Smoke check failed.${RESET}\n`,
);
process.exit(exitCode);
