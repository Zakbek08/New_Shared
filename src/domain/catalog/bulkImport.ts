/**
 * Bulk import of reward rules, with a validation report.
 *
 * An editor pastes or uploads a batch of rules; this validates every row against
 * the same `rewardRuleSchema` the single-rule editor uses and reports what would
 * happen, per row, **before** anything is written.
 *
 * TWO RULES SHAPE THIS MODULE
 *
 * 1. **Validation is total and pure.** No row is written from here. The caller gets
 *    a report and decides. A partially-applied import that stopped at the first bad
 *    row would leave the catalog in a state nobody chose.
 * 2. **A rejected row is rejected loudly, with its own reasons.** Reporting "3 rows
 *    failed" without saying which or why turns a fixable typo into a guessing game.
 *
 * Rates in this catalog are what every user's recommendation is computed from, so
 * a silent partial import is a correctness problem, not an inconvenience.
 */
import type { z } from 'zod';

import { rewardRuleSchema, type RewardRuleInput } from '../schemas';

/** One problem with one row, addressed to the person who has to fix it. */
export interface ImportIssue {
  /** Dotted path into the row, e.g. `capPeriod`. Empty for a whole-row problem. */
  readonly field: string;
  readonly message: string;
}

export interface ImportRowResult {
  /** Zero-based position in the input, so the editor can find the row again. */
  readonly index: number;
  /** The rule's label when it could be read, for a human-readable report line. */
  readonly label: string | null;
  readonly isValid: boolean;
  /** Present only when `isValid`. Ready to insert. */
  readonly value: RewardRuleInput | null;
  readonly issues: readonly ImportIssue[];
}

export interface ImportReport {
  readonly rows: readonly ImportRowResult[];
  readonly validCount: number;
  readonly invalidCount: number;
  /** Rows that parsed, in input order. What the caller would write. */
  readonly validRows: readonly RewardRuleInput[];
  /**
   * True when nothing at all can be imported.
   *
   * The UI uses this to refuse rather than offer a no-op "import 0 rules" button.
   */
  readonly isEmpty: boolean;
}

/** Flattens a Zod error into per-field messages, in a stable order. */
function issuesFrom(error: z.ZodError): readonly ImportIssue[] {
  return error.issues
    .map((issue) => ({
      field: issue.path.map((segment) => String(segment)).join('.'),
      message: issue.message,
    }))
    .sort(
      (left, right) =>
        left.field.localeCompare(right.field) || left.message.localeCompare(right.message),
    );
}

/** Reads a label off an unvalidated row, for the report line, without trusting it. */
function labelOf(row: unknown): string | null {
  if (typeof row !== 'object' || row === null) return null;
  const label = (row as Record<string, unknown>)['label'];
  return typeof label === 'string' && label.trim().length > 0
    ? label.trim().slice(0, 80)
    : null;
}

/**
 * Validates a batch of candidate rules.
 *
 * Every row is validated independently: one bad row does not stop the others being
 * reported, which is what makes the report useful on a 200-row paste.
 */
export function validateRuleImport(rows: readonly unknown[]): ImportReport {
  const results: ImportRowResult[] = rows.map((row, index) => {
    const parsed = rewardRuleSchema.safeParse(row);

    if (parsed.success) {
      return {
        index,
        label: parsed.data.label,
        isValid: true,
        value: parsed.data,
        issues: [],
      };
    }

    return {
      index,
      label: labelOf(row),
      isValid: false,
      value: null,
      issues: issuesFrom(parsed.error),
    };
  });

  const validRows = results
    .map((result) => result.value)
    .filter((value): value is RewardRuleInput => value !== null);

  return {
    rows: results,
    validCount: validRows.length,
    invalidCount: results.length - validRows.length,
    validRows,
    isEmpty: validRows.length === 0,
  };
}

/**
 * Parses pasted JSON into rows, without validating them.
 *
 * Returns an error rather than throwing, because a malformed paste is an expected
 * outcome of a text box, not an exceptional one. A bare object is accepted as a
 * one-row batch: pasting a single rule is a normal thing to do.
 */
export function parseImportText(
  text: string,
): { readonly rows: readonly unknown[] } | { readonly error: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { error: 'Paste one or more rules as JSON.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // The parser's own message names character offsets, which is no help in a text
    // box. Say what shape is expected instead.
    return { error: 'That is not valid JSON. Expected an array of rule objects.' };
  }

  if (Array.isArray(parsed)) {
    return { rows: parsed };
  }

  if (typeof parsed === 'object' && parsed !== null) {
    return { rows: [parsed] };
  }

  return { error: 'Expected an array of rule objects, or a single rule object.' };
}

/**
 * A one-line summary of a report.
 *
 * Phrased so the counts cannot be misread: "12 of 15 rules are ready to import"
 * rather than "12 valid", which reads as though the other three were dropped
 * silently.
 */
export function summariseReport(report: ImportReport): string {
  const total = report.rows.length;

  if (total === 0) return 'Nothing to import.';
  if (report.invalidCount === 0) {
    return total === 1
      ? '1 rule is ready to import.'
      : `All ${total} rules are ready to import.`;
  }
  if (report.validCount === 0) {
    return total === 1
      ? 'The rule cannot be imported. See the reason below.'
      : `None of the ${total} rules can be imported. See the reasons below.`;
  }

  return `${report.validCount} of ${total} rules are ready to import. ${report.invalidCount} ${
    report.invalidCount === 1 ? 'row needs' : 'rows need'
  } fixing first.`;
}
