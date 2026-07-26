/**
 * Zod schemas — the single validation boundary for everything a user types and
 * everything the network hands back.
 *
 * SECURITY: several schemas below actively *reject* card credentials rather
 * than merely omitting them. A user who pastes a 16-digit number into the
 * nickname field gets a clear error instead of having it silently stored.
 */
import { z } from 'zod';

import { CATEGORY_SLUGS } from './categories';
import {
  CAP_PERIODS,
  CARD_KINDS,
  CARD_NETWORKS,
  PAYMENT_METHODS,
  REWARD_TYPES,
  REWARD_UNITS,
  RULE_KINDS,
  VERIFICATION_STATUSES,
} from './enums';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const uuidSchema = z.uuid('Expected a UUID');

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(2, 'Use a two-letter country code, for example US');

export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(3, 'Use a three-letter currency code, for example USD');

export const mccSchema = z
  .number()
  .int('A merchant category code is a whole number')
  .min(1)
  .max(9999);

/**
 * Rejects anything that looks like a payment credential.
 *
 * Runs on every free-text field the user can type into. The patterns catch a
 * bare 13-19 digit account number, one written with separators, and a 3-4 digit
 * value adjacent to the words CVV / CVC / PIN.
 */
const CREDENTIAL_PATTERNS: readonly { readonly pattern: RegExp; readonly message: string }[] = [
  {
    pattern: /(?:\d[ -]?){13,19}/,
    message:
      'That looks like a card number. WalletWise never stores card numbers — remove it to continue.',
  },
  {
    pattern: /\b(?:cvv|cvc|cid|security\s*code)\b\D{0,10}\d{3,4}\b/i,
    message: 'WalletWise never stores security codes. Remove it to continue.',
  },
  {
    pattern: /\b(?:pin|passcode|password)\b\D{0,10}[\w]{3,}\b/i,
    message: 'WalletWise never stores PINs or passwords. Remove it to continue.',
  },
];

export function noCredentials(schema: z.ZodString) {
  return schema.superRefine((value, ctx) => {
    for (const { pattern, message } of CREDENTIAL_PATTERNS) {
      if (pattern.test(value)) {
        ctx.addIssue({ code: 'custom', message });
        return;
      }
    }
  });
}

/** Free text the user types. Trimmed, length-bounded, credential-screened. */
export const safeTextSchema = (max: number, label = 'This field') =>
  noCredentials(z.string().trim().max(max, `${label} must be ${max} characters or fewer`));

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter your email address')
  .max(254, 'That email address is too long')
  .pipe(z.email('Enter a valid email address'));

/**
 * Matches the `minimum_password_length` and `password_requirements` settings in
 * `supabase/config.toml`, so client-side and server-side rules agree.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use 128 characters or fewer')
  .regex(/[a-z]/, 'Include a lower-case letter')
  .regex(/[A-Z]/, 'Include an upper-case letter')
  .regex(/\d/, 'Include a number');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const registrationSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    displayName: safeTextSchema(80, 'Your name').optional(),
    // `z.boolean().refine(...)` rather than `z.literal(true)`: the literal makes
    // the form's *input* type `true`, so an unchecked default of `false` would
    // not typecheck. This keeps the input a plain boolean and still refuses to
    // pass validation until it is accepted.
    acceptedDisclaimers: z.boolean().refine((accepted) => accepted, {
      message: 'Please confirm you understand the disclaimers',
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;

/**
 * Form-side (pre-validation) shapes.
 *
 * A schema with `.default()` or `z.coerce` has a wider *input* type than output:
 * `isPreferred` is optional going in and guaranteed coming out. React Hook Form
 * needs the input type for its field values and the output type for the submit
 * handler, hence both being exported.
 */
export type RegistrationFormValues = z.input<typeof registrationSchema>;

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

/**
 * The last four digits of a card. OPTIONAL, and the only card digits WalletWise
 * will accept anywhere.
 *
 * Exactly four digits: five or more is rejected, because that is the shape of
 * someone starting to type a full account number.
 */
export const lastFourSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'Enter exactly the last four digits, or leave this blank');

export const addUserCardSchema = z.object({
  cardProductId: uuidSchema,
  nickname: safeTextSchema(40, 'Nickname').optional(),
  /** Encrypted on the device before it leaves; see `src/lib/lastFour.ts`. */
  lastFour: lastFourSchema.optional(),
  accountOpenedOn: z.coerce.date().max(new Date('2100-01-01')).optional(),
  isPreferred: z.boolean().default(false),
  notes: safeTextSchema(500, 'Notes').optional(),
});

export type AddUserCardInput = z.infer<typeof addUserCardSchema>;
export type AddUserCardFormValues = z.input<typeof addUserCardSchema>;

export const customCardProductSchema = z.object({
  name: safeTextSchema(80, 'Card name').pipe(z.string().min(2, 'Enter the card name')),
  issuerName: safeTextSchema(80, 'Issuer name').pipe(z.string().min(2, 'Enter the issuer')),
  cardKind: z.enum(CARD_KINDS).default('personal_credit'),
  network: z.enum(CARD_NETWORKS).default('other'),
  annualFeeUsd: z.coerce.number().min(0).max(10_000).default(0),
  foreignTransactionFeePercent: z.coerce.number().min(0).max(20).default(0),
  rewardUnit: z.enum(REWARD_UNITS).default('usd'),
  /** The everything-else earn rate. Percent for cash back, multiple otherwise. */
  baseRate: z.coerce.number().min(0).max(100),
  summary: safeTextSchema(280, 'Summary').optional(),
});

export type CustomCardProductInput = z.infer<typeof customCardProductSchema>;
export type CustomCardProductFormValues = z.input<typeof customCardProductSchema>;

// ---------------------------------------------------------------------------
// Purchase intent
// ---------------------------------------------------------------------------

/**
 * The purchase form.
 *
 * `amountUsd` must be strictly positive: a zero-dollar purchase has no best
 * card, and the engine should never be asked to rank one.
 */
export const purchaseIntentSchema = z.object({
  merchant: safeTextSchema(120, 'Merchant')
    .pipe(z.string().min(1, 'Enter where you are buying'))
    .describe('Merchant name as the user typed it'),
  amountUsd: z.coerce
    .number({ error: 'Enter an amount' })
    .finite('Enter a valid amount')
    .positive('Enter an amount greater than $0')
    .max(1_000_000, 'Enter an amount under $1,000,000')
    // Money has two decimal places. Compared with a tolerance because
    // `12.34 * 100` is `1234.0000000000002` in binary floating point, and an
    // exact integer test would reject a perfectly valid amount.
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
      message: 'Use at most two decimal places',
    }),
  categorySlug: z.enum(CATEGORY_SLUGS).nullable().default(null),
  channel: z.enum(['online', 'in_store']),
  countryCode: countryCodeSchema.default('US'),
  currencyCode: currencyCodeSchema.default('USD'),
  paymentMethod: z.enum(PAYMENT_METHODS).default('physical_card'),
  notes: safeTextSchema(500, 'Notes').optional(),
});

export type PurchaseIntentInput = z.infer<typeof purchaseIntentSchema>;
export type PurchaseIntentFormValues = z.input<typeof purchaseIntentSchema>;

/** Free-text entry, before the classifier turns it into a structured intent. */
export const naturalLanguagePurchaseSchema = z.object({
  text: safeTextSchema(500, 'Description').pipe(
    z.string().min(3, 'Describe the purchase in a few words'),
  ),
});

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export const rewardPreferenceSchema = z.object({
  rewardProgramId: uuidSchema.nullable().default(null),
  unit: z.enum(REWARD_UNITS),
  /** US cents per point or mile. Zero is valid: "I do not value these". */
  centsPerUnit: z.coerce
    .number({ error: 'Enter a value in cents' })
    .min(0, 'Cannot be negative')
    .max(100, 'That is more than $1.00 per point — check the value'),
  prefersCashBackOnly: z.boolean().default(false),
  minimumSwitchBenefitUsd: z.coerce.number().min(0).max(1000).default(0),
});

export type RewardPreferenceInput = z.infer<typeof rewardPreferenceSchema>;

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export const userOfferSchema = z
  .object({
    userCardId: uuidSchema,
    merchantId: uuidSchema.nullable().default(null),
    merchantLabel: safeTextSchema(120, 'Merchant').optional(),
    title: safeTextSchema(120, 'Offer title').pipe(z.string().min(2, 'Enter a title')),
    description: safeTextSchema(500, 'Description').optional(),
    rewardType: z.enum(REWARD_TYPES),
    rewardUnit: z.enum(REWARD_UNITS).default('usd'),
    rate: z.coerce.number().min(0).max(100).default(0),
    fixedAmountUsd: z.coerce.number().min(0).max(10_000).nullable().default(null),
    minimumSpendUsd: z.coerce.number().min(0).max(100_000).default(0),
    maxBenefitUsd: z.coerce.number().positive().max(10_000).nullable().default(null),
    channel: z.enum(['online', 'in_store', 'either']).default('either'),
    startsAt: z.coerce.date().nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
  })
  .refine((offer) => offer.merchantId !== null || (offer.merchantLabel ?? '').length > 0, {
    path: ['merchantLabel'],
    message: 'Tell us which merchant this offer is for',
  })
  .refine((offer) => offer.rate > 0 || offer.fixedAmountUsd !== null, {
    path: ['rate'],
    message: 'Enter either a rate or a fixed amount',
  })
  .refine(
    (offer) =>
      offer.startsAt === null || offer.endsAt === null || offer.startsAt < offer.endsAt,
    { path: ['endsAt'], message: 'The end date must be after the start date' },
  );

export type UserOfferInput = z.infer<typeof userOfferSchema>;
export type UserOfferFormValues = z.input<typeof userOfferSchema>;

// ---------------------------------------------------------------------------
// Administrative catalog
// ---------------------------------------------------------------------------

/**
 * Admin-facing reward rule editor. Mirrors the CHECK constraints in
 * `20260701000400_reward_rules.sql` so bad data is rejected before a round trip.
 */
export const rewardRuleSchema = z
  .object({
    cardProductId: uuidSchema,
    label: safeTextSchema(160, 'Label').pipe(z.string().min(4, 'Describe the rule')),
    kind: z.enum(RULE_KINDS),
    rewardType: z.enum(REWARD_TYPES),
    rewardUnit: z.enum(REWARD_UNITS),
    baseRate: z.coerce.number().min(0).max(1000).default(0),
    bonusRate: z.coerce.number().min(0).max(1000).default(0),
    fixedAmountUsd: z.coerce.number().min(0).max(100_000).nullable().default(null),
    priority: z.coerce.number().int().min(0).max(1000).default(100),
    stackGroup: safeTextSchema(40, 'Stack group').pipe(z.string().min(1)).default('category'),
    isStackable: z.boolean().default(false),
    capAmount: z.coerce.number().positive().max(10_000_000).nullable().default(null),
    capAppliesTo: z.enum(['spend', 'reward']).default('spend'),
    capPeriod: z.enum(CAP_PERIODS).default('none'),
    postCapRate: z.coerce.number().min(0).max(1000).nullable().default(null),
    startsAt: z.coerce.date().nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
    requiresEnrollment: z.boolean().default(false),
    enrollmentUrl: z.string().url('Enter a full https:// URL').nullable().default(null),
    spendThresholdUsd: z.coerce.number().min(0).nullable().default(null),
    sourceId: uuidSchema.nullable().default(null),
    lastVerifiedAt: z.coerce.date().nullable().default(null),
    verificationStatus: z.enum(VERIFICATION_STATUSES).default('unverified'),
    notes: safeTextSchema(1000, 'Notes').optional(),
  })
  .refine(
    (rule) => rule.startsAt === null || rule.endsAt === null || rule.startsAt < rule.endsAt,
    {
      path: ['endsAt'],
      message: 'The end date must be after the start date',
    },
  )
  .refine((rule) => (rule.capAmount === null) === (rule.capPeriod === 'none'), {
    path: ['capPeriod'],
    message: 'A cap amount needs a cap period, and a cap period needs an amount',
  })
  .refine(
    (rule) =>
      !['statement_credit', 'fixed_amount'].includes(rule.rewardType) ||
      rule.fixedAmountUsd !== null,
    { path: ['fixedAmountUsd'], message: 'Enter the credit amount' },
  )
  .refine(
    (rule) =>
      ['statement_credit', 'fixed_amount'].includes(rule.rewardType) ||
      rule.baseRate + rule.bonusRate > 0,
    { path: ['baseRate'], message: 'A rate rule must earn something' },
  )
  .refine(
    (rule) =>
      rule.verificationStatus !== 'verified' ||
      (rule.sourceId !== null && rule.lastVerifiedAt !== null),
    {
      path: ['verificationStatus'],
      message: 'Mark a rule verified only when it has a source and a verification date',
    },
  );

export type RewardRuleInput = z.infer<typeof rewardRuleSchema>;

export const verificationSchema = z.object({
  rewardRuleId: uuidSchema,
  sourceId: uuidSchema.nullable().default(null),
  newStatus: z.enum(VERIFICATION_STATUSES),
  verifiedBaseRate: z.coerce.number().min(0).nullable().default(null),
  verifiedBonusRate: z.coerce.number().min(0).nullable().default(null),
  note: safeTextSchema(500, 'Note').optional(),
});

export type VerificationInput = z.infer<typeof verificationSchema>;
