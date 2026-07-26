/**
 * Enforces the determinism guarantee from CLAUDE.md.
 *
 * `src/domain/` must be pure: no clock, no network, no randomness, no React, no
 * Supabase. Those are the properties that make a reward figure reproducible, and a
 * comment asserting them is worth nothing without a test.
 *
 * Read as source text rather than by executing the modules, so a violation is
 * caught even on a code path no test happens to run.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { evaluateWallet } from './rewards/evaluate';
import * as fixtures from './rewards/__fixtures__/wallet';

const DOMAIN_DIR = join(__dirname);

function collectSourceFiles(dir: string): { name: string; source: string }[] {
  const files: { name: string; source: string }[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      // Fixtures exist for tests only and are not part of the engine.
      if (entry === '__fixtures__') continue;
      files.push(...collectSourceFiles(path));
      continue;
    }

    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) {
      continue;
    }

    files.push({
      name: path.replace(`${DOMAIN_DIR}/`, ''),
      source: readFileSync(path, 'utf8'),
    });
  }

  return files;
}

const sourceFiles = collectSourceFiles(DOMAIN_DIR);

/** Strips comments, so prose about `Date.now()` does not trip a check. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const codeOnly = sourceFiles.map((file) => ({
  name: file.name,
  code: stripComments(file.source),
}));

describe('the domain layer has files to check', () => {
  it('found the engine modules', () => {
    expect(sourceFiles.length).toBeGreaterThan(8);
    const names = sourceFiles.map((file) => file.name);
    expect(names).toContain('rewards/evaluate.ts');
    expect(names).toContain('rewards/money.ts');
    expect(names).toContain('rewards/conditions.ts');
  });
});

describe('SECURITY / DETERMINISM: no ambient clock', () => {
  it.each(codeOnly)('$name does not call Date.now()', ({ code }) => {
    expect(code).not.toMatch(/\bDate\.now\s*\(/);
  });

  it.each(codeOnly)('$name does not construct a Date with no argument', ({ code }) => {
    // `new Date()` reads the wall clock; `new Date(x)` is fine. Time must arrive
    // through an explicit `asOf` so results are reproducible.
    expect(code).not.toMatch(/new\s+Date\s*\(\s*\)/);
  });

  it.each(codeOnly)('$name does not use performance.now()', ({ code }) => {
    expect(code).not.toMatch(/performance\s*\.\s*now\s*\(/);
  });
});

describe('DETERMINISM: no randomness', () => {
  it.each(codeOnly)('$name does not call Math.random()', ({ code }) => {
    expect(code).not.toMatch(/\bMath\.random\s*\(/);
  });

  it.each(codeOnly)('$name does not use a crypto random source', ({ code }) => {
    expect(code).not.toMatch(/getRandomValues|getRandomBytes|randomUUID/);
  });
});

describe('PURITY: no I/O and no framework', () => {
  it.each(codeOnly)('$name performs no network access', ({ code }) => {
    expect(code).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|axios/);
  });

  it.each(codeOnly)('$name imports no Supabase client', ({ code }) => {
    expect(code).not.toMatch(/@supabase\/|getSupabaseClient/);
  });

  it.each(codeOnly)('$name imports no React', ({ code }) => {
    expect(code).not.toMatch(/from\s+['"]react(-native)?['"]/);
  });

  it.each(codeOnly)('$name reads no environment variables', ({ code }) => {
    expect(code).not.toMatch(/process\.env|getEnv\s*\(/);
  });

  it.each(codeOnly)('$name reads no filesystem', ({ code }) => {
    expect(code).not.toMatch(/node:fs|require\(['"]fs['"]\)/);
  });

  it.each(codeOnly)('$name writes nothing to a log', ({ code }) => {
    expect(code).not.toMatch(/console\s*\.\s*(log|warn|error|info|debug)\s*\(/);
  });
});

describe('LAYERING: the domain is a leaf', () => {
  const allowedPrefixes = ['@/types/', '@/domain/', '@/lib/format', './', '../', 'zod'];

  it.each(codeOnly)('$name imports only from allowed places', ({ name, code }) => {
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
      (match) => match[1] ?? '',
    );

    for (const specifier of imports) {
      const isAllowed = allowedPrefixes.some((prefix) => specifier.startsWith(prefix));
      // `src/domain/` must not depend on the layers above it. If a domain module
      // needs data, it takes it as an argument.
      expect(isAllowed).toBe(true);
      expect(specifier).not.toMatch(/^@\/(features|components|providers|services|config)\//);
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('DETERMINISM: the engine is reproducible in practice', () => {
  it('gives byte-identical output for identical inputs', () => {
    // A behavioural companion to the source checks above.
    const wallet = [fixtures.flatCard(2), fixtures.flatCard(6)];

    const first = evaluateWallet(fixtures.intent(), wallet, fixtures.context());
    const second = evaluateWallet(fixtures.intent(), wallet, fixtures.context());

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('depends on asOf rather than on the wall clock', () => {
    const seasonal = fixtures.card({
      userCardId: 'seasonal',
      rules: [
        fixtures.rule({
          id: 'q3',
          baseRate: 5,
          startsAt: new Date('2026-07-01T00:00:00.000Z'),
          endsAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
      ],
    });

    const inQuarter = evaluateWallet(
      fixtures.intent(),
      [seasonal],
      fixtures.context({ asOf: new Date('2026-08-01T00:00:00.000Z') }),
    );
    const afterQuarter = evaluateWallet(
      fixtures.intent(),
      [seasonal],
      fixtures.context({ asOf: new Date('2026-11-01T00:00:00.000Z') }),
    );

    expect(inQuarter.recommended).not.toBeNull();
    expect(afterQuarter.recommended).toBeNull();
  });
});
