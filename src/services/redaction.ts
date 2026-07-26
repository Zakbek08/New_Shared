/**
 * Redaction for anything that could reach a log, an analytics event or a crash
 * report.
 *
 * Requirement: WalletWise does not log sensitive user or financial data. This
 * module is how that requirement is enforced in code rather than in a comment.
 * Every payload passed to the analytics and error-monitoring services goes
 * through `redact()` before it leaves the process.
 *
 * The rule is deny-by-default for value content: keys on the deny list are
 * dropped entirely, monetary and merchant fields are coarsened, and any string
 * that looks like a card number is masked wherever it appears.
 */

/** Keys whose values must never be recorded, at any nesting depth. */
const DENIED_KEYS: ReadonlySet<string> = new Set(
  [
    // Payment credentials — these should not exist in WalletWise at all, so
    // seeing one here means something has gone badly wrong upstream.
    'cardnumber',
    'card_number',
    'pan',
    'accountnumber',
    'account_number',
    'cvv',
    'cvc',
    'cid',
    'securitycode',
    'security_code',
    'pin',
    'expiry',
    'expirationdate',
    'expiration_date',
    // Authentication
    'password',
    'newpassword',
    'confirmpassword',
    'token',
    'accesstoken',
    'access_token',
    'refreshtoken',
    'refresh_token',
    'apikey',
    'api_key',
    'authorization',
    'securityanswer',
    'security_answer',
    'secret',
    // Personal identifiers
    'email',
    'phone',
    'phonenumber',
    'phone_number',
    'ssn',
    'dateofbirth',
    'date_of_birth',
    'address',
    'displayname',
    'display_name',
    // Card digits — even the last four are encrypted at rest; they have no
    // business in telemetry.
    'lastfour',
    'last_four',
    'lastfourcipher',
    'last_four_cipher',
  ].map((key) => key.toLowerCase()),
);

/**
 * Keys holding a dollar amount. We keep the *magnitude* because it is genuinely
 * useful for diagnosing engine behaviour, and drop the exact figure because it
 * describes a person's spending.
 */
const BUCKETED_AMOUNT_KEYS: ReadonlySet<string> = new Set(
  [
    'amount',
    'amountusd',
    'amount_usd',
    'netvalueusd',
    'net_value_usd',
    'estimatedvalueusd',
    'estimated_value_usd',
    'capremainingusd',
    'cap_remaining_usd',
    'qualifyingspendusd',
    'qualifying_spend_usd',
  ].map((key) => key.toLowerCase()),
);

/**
 * Keys holding free text a user typed, which may contain anything. We keep only
 * the fact that a value was present and how long it was.
 */
const LENGTH_ONLY_KEYS: ReadonlySet<string> = new Set(
  [
    'merchant',
    'merchantinput',
    'merchant_input',
    'merchantlabel',
    'merchant_label',
    'notes',
    'note',
    'description',
    'nickname',
    'rawnaturallanguageinput',
    'raw_natural_language_input',
    'text',
    'query',
  ].map((key) => key.toLowerCase()),
);

const REDACTED = '[redacted]';
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 20;

/**
 * Masks anything shaped like a payment card number inside a string.
 *
 * Matches 13-19 digits with optional single spaces or hyphens between them,
 * which covers `4111111111111111`, `4111 1111 1111 1111` and
 * `4111-1111-1111-1111`.
 */
export function maskCardLikeSequences(value: string): string {
  return value.replace(/\d(?:[ -]?\d){12,18}/g, '[card-number-redacted]');
}

/**
 * Buckets a dollar amount into an order-of-magnitude label.
 *
 * `$120` becomes `"100-499"`, which is enough to reproduce a bug without
 * recording what someone spent.
 */
export function bucketAmount(value: number): string {
  if (!Number.isFinite(value)) return 'invalid';
  const amount = Math.abs(value);
  if (amount === 0) return '0';
  if (amount < 10) return '0-9';
  if (amount < 100) return '10-99';
  if (amount < 500) return '100-499';
  if (amount < 1000) return '500-999';
  if (amount < 5000) return '1000-4999';
  return '5000+';
}

type Redacted = string | number | boolean | null | Redacted[] | { [key: string]: Redacted };

/**
 * Returns a copy of `input` that is safe to log.
 *
 * Unknown keys with primitive values are preserved — engine diagnostics like
 * `ineligibilityCode` or `capPeriod` are the whole point of telemetry — but the
 * deny/bucket/length lists above take precedence, and every string is masked.
 */
export function redact(input: unknown): Redacted {
  return redactValue(input, 0, new WeakSet());
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): Redacted {
  if (value === null || value === undefined) return null;

  switch (typeof value) {
    case 'string':
      return maskCardLikeSequences(value);
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'boolean':
      return value;
    case 'bigint':
      return Number(value);
    case 'function':
    case 'symbol':
    case 'undefined':
      return null;
    case 'object':
      break;
  }

  if (depth >= MAX_DEPTH) return '[max-depth]';

  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      // Error messages are written by us, but they can interpolate user input,
      // so they get masked like any other string.
      message: maskCardLikeSequences(value.message),
    };
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    }
    return items;
  }

  const output: Record<string, Redacted> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalised = key.toLowerCase();

    if (DENIED_KEYS.has(normalised)) {
      output[key] = REDACTED;
      continue;
    }

    if (BUCKETED_AMOUNT_KEYS.has(normalised)) {
      output[key] = typeof entry === 'number' ? bucketAmount(entry) : REDACTED;
      continue;
    }

    if (LENGTH_ONLY_KEYS.has(normalised)) {
      output[key] = typeof entry === 'string' ? `[${entry.length} chars]` : REDACTED;
      continue;
    }

    output[key] = redactValue(entry, depth + 1, seen);
  }

  return output;
}
