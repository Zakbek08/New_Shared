/**
 * Financial-information and merchant-category disclaimers.
 *
 * These are a product requirement, not decoration. The copy is centralised here
 * so it reads identically everywhere and can be versioned: `DISCLAIMER_VERSION`
 * is what gets recorded in `users.disclaimers_accepted_version` when a user
 * accepts them at registration.
 */
import { View } from 'react-native';

import { MERCHANT_CATEGORY_DISCLAIMER } from '@/domain/categories';
import { useTheme } from '@/theme/ThemeProvider';

import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Text } from './ui/Text';
import { VStack } from './ui/Stack';

/** Bump when the wording changes materially; users re-accept. */
export const DISCLAIMER_VERSION = '2026-07-01';

export const FINANCIAL_INFORMATION_DISCLAIMER =
  'WalletWise gives estimates, not financial advice. Reward rates, caps and offers change ' +
  'without notice, and only your card issuer can tell you what you actually earned. Check ' +
  'your own card terms before you rely on anything here.';

export const NO_PAYMENT_DISCLAIMER =
  'WalletWise never makes a payment, moves money, or connects to your bank. It only ' +
  'suggests which card in your wallet to reach for.';

export const NO_CREDENTIALS_DISCLAIMER =
  'WalletWise never asks for a full card number, security code, PIN or banking password. ' +
  'If anything ever does, it is not us.';

export const ESTIMATE_DISCLAIMER =
  'Point and mile values are your own estimates, set on the Reward Preferences screen. ' +
  'Change them and every recommendation changes with them.';

export const DEMO_DATA_DISCLAIMER =
  'This build uses a fictional demonstration catalog. The issuers, cards and reward rates ' +
  'shown are invented for testing and do not describe any real product.';

export type DisclaimerKind =
  'financial' | 'merchant_category' | 'no_payment' | 'no_credentials' | 'estimate';

const COPY: Record<DisclaimerKind, string> = {
  financial: FINANCIAL_INFORMATION_DISCLAIMER,
  merchant_category: MERCHANT_CATEGORY_DISCLAIMER,
  no_payment: NO_PAYMENT_DISCLAIMER,
  no_credentials: NO_CREDENTIALS_DISCLAIMER,
  estimate: ESTIMATE_DISCLAIMER,
};

/**
 * Inline disclaimer. Rendered as a single accessible block so a screen reader
 * announces the whole statement rather than fragmenting it.
 */
export function DisclaimerNotice({
  kind,
  compact = false,
}: {
  readonly kind: DisclaimerKind;
  readonly compact?: boolean;
}) {
  const theme = useTheme();
  const copy = COPY[kind];

  if (compact) {
    return (
      <Text variant="footnote" tone="tertiary" accessibilityLabel={copy}>
        {copy}
      </Text>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={copy}
      style={{
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radii.md,
        padding: theme.spacing.md,
      }}
    >
      <Text variant="footnote" tone="secondary">
        {copy}
      </Text>
    </View>
  );
}

/**
 * Amber banner shown wherever merchant coding is uncertain.
 *
 * `merchantName` is optional because the classifier may not have resolved one.
 */
export function MerchantCodingWarning({ merchantName }: { readonly merchantName?: string }) {
  const detail =
    merchantName === undefined
      ? MERCHANT_CATEGORY_DISCLAIMER
      : `We are not certain how ${merchantName} is coded. ${MERCHANT_CATEGORY_DISCLAIMER}`;

  return (
    <Card emphasis="uncertain" accessibilityLabel={`Merchant coding uncertain. ${detail}`}>
      <VStack gap="sm">
        <Badge label="Coding uncertain" tone="uncertain" glyph="!" />
        <Text variant="callout" tone="secondary">
          {detail}
        </Text>
      </VStack>
    </Card>
  );
}

/**
 * Persistent banner shown whenever the fictional catalog is active.
 *
 * Requirement: use only test data during development, and be unmistakably clear
 * on screen that that is what the user is looking at.
 */
export function DemoDataBanner() {
  return (
    <Card emphasis="accent" accessibilityLabel={`Demonstration data. ${DEMO_DATA_DISCLAIMER}`}>
      <VStack gap="sm">
        <Badge label="DEMO DATA" tone="accent" glyph="i" />
        <Text variant="footnote" tone="secondary">
          {DEMO_DATA_DISCLAIMER}
        </Text>
      </VStack>
    </Card>
  );
}
