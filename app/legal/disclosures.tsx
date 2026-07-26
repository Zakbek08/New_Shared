/**
 * Screen 15 — Privacy and Disclosures.
 *
 * The full set of statements in one place. Written as plain sentences rather than
 * legal boilerplate, because a disclaimer nobody reads protects nobody.
 */
import {
  DISCLAIMER_VERSION,
  ESTIMATE_DISCLAIMER,
  FINANCIAL_INFORMATION_DISCLAIMER,
  NO_CREDENTIALS_DISCLAIMER,
  NO_PAYMENT_DISCLAIMER,
} from '@/components/Disclaimers';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { MERCHANT_CATEGORY_DISCLAIMER } from '@/domain/categories';

interface Section {
  readonly heading: string;
  readonly body: readonly string[];
}

const SECTIONS: readonly Section[] = [
  {
    heading: 'This is information, not advice',
    body: [
      FINANCIAL_INFORMATION_DISCLAIMER,
      'WalletWise is not a bank, a broker, or a financial adviser, and nothing it shows you is a recommendation to apply for, keep or close any financial product.',
    ],
  },
  {
    heading: 'How merchant categories work',
    body: [
      MERCHANT_CATEGORY_DISCLAIMER,
      'Some merchants are especially unpredictable. A warehouse club or a superstore often codes as a general merchandise store rather than a supermarket, and a filling station shop can code as a food store rather than a service station. Where we know a merchant is unpredictable, we say so on the results screen in amber.',
    ],
  },
  {
    heading: 'Estimates, not statements',
    body: [
      ESTIMATE_DISCLAIMER,
      'Cap progress is our estimate too. Real issuers measure caps against a statement cycle whose exact boundaries they do not publish, so WalletWise uses calendar periods. Treat a remaining-cap figure as a guide, and check your issuer for the real number.',
    ],
  },
  {
    heading: 'WalletWise never takes a payment',
    body: [
      NO_PAYMENT_DISCLAIMER,
      'There is no payment integration in the app, and no plan to add one. Asking WalletWise which card to use has exactly the same effect on your money as asking a friend.',
    ],
  },
  {
    heading: 'What we never ask for',
    body: [
      NO_CREDENTIALS_DISCLAIMER,
      'Our database has no column capable of storing a card number, a security code, a PIN or a banking password. The forms in the app actively reject text that looks like one.',
      'The one exception is the last four digits of a card, which are optional and exist only to help you tell two similar cards apart. They are encrypted on your device before they are sent, so we cannot read them either.',
    ],
  },
  {
    heading: 'We do not connect to your bank',
    body: [
      'WalletWise has no bank-login feature, no account aggregation and no website scraping. It cannot see your transactions, your balances or your statements.',
      'That is why you enter targeted offers and activate rotating categories yourself: those live behind your issuer login, and your issuer login is none of our business.',
    ],
  },
  {
    heading: 'What we store, and who can read it',
    body: [
      'Your account holds an email address, the card products in your wallet, your nicknames and preferences, the purchases you have asked about, and the recommendations we gave.',
      'Every row is protected by database row-level security keyed to your account, so another signed-in user cannot read your wallet even if they try. Deleting your account removes all of it.',
    ],
  },
  {
    heading: 'What we log',
    body: [
      'Diagnostic events record which screens were used and which code paths ran. Before anything is recorded it passes through a redaction layer that strips personal identifiers, replaces merchant names and notes with their length, and reduces amounts to a broad band such as "100-499".',
      'The audit trail behind the card catalog records which fields changed, never their values.',
    ],
  },
];

export default function DisclosuresScreen() {
  return (
    <Screen scroll accessibilityLabel="Privacy and disclosures" testID="disclosures-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Privacy and disclosures
          </Text>
          <Text variant="footnote" tone="tertiary">
            Version {DISCLAIMER_VERSION}
          </Text>
        </VStack>

        {SECTIONS.map((section) => (
          <Card key={section.heading}>
            <VStack gap="sm">
              <Text variant="title3" accessibilityRole="header">
                {section.heading}
              </Text>
              {section.body.map((paragraph) => (
                <Text key={paragraph} variant="callout" tone="secondary">
                  {paragraph}
                </Text>
              ))}
            </VStack>
          </Card>
        ))}
      </VStack>
    </Screen>
  );
}
