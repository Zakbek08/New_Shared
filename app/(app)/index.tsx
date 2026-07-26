/**
 * Screen 4 — Home dashboard.
 *
 * Layout follows the product specification: a large "What are you buying?"
 * action above everything else, then top cards by category, recently evaluated
 * merchants, current rotating categories, spending-cap alerts and expiring
 * offers.
 *
 * Phase 1 builds the real structure and the real primary action; each data
 * region says which phase fills it. Nothing on this screen shows a fabricated
 * reward figure.
 */
import { useMemo } from 'react';
import { useRouter } from 'expo-router';

import { DemoDataBanner, DisclaimerNotice } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { isDemoDataEnabled } from '@/config/env';
import { RecentRecommendations } from '@/features/recommendations/ui/RecentRecommendations';
import { TopCardsByCategory } from '@/features/recommendations/ui/TopCardsByCategory';

export default function HomeScreen() {
  const router = useRouter();

  // Time enters the app here, at the edge, and is passed down. The engine itself
  // never reads a clock — see CLAUDE.md. Held for the life of the mount so the
  // category list does not silently re-rank mid-session.
  const asOf = useMemo(() => new Date(), []);

  let showDemoBanner = false;
  try {
    showDemoBanner = isDemoDataEnabled();
  } catch {
    // An unconfigured environment should not blank the dashboard. Settings
    // surfaces the configuration error properly.
    showDemoBanner = false;
  }

  return (
    <Screen scroll accessibilityLabel="WalletWise home" testID="home-screen">
      <VStack gap="xl">
        <VStack gap="xs">
          <Text variant="title1" accessibilityRole="header">
            WalletWise
          </Text>
          <Text variant="callout" tone="secondary">
            Pick the right card before you pay.
          </Text>
        </VStack>

        {/* The primary action. Deliberately the largest thing on the screen. */}
        <Card emphasis="accent" testID="home-primary-action">
          <VStack gap="md">
            <Text variant="title2" accessibilityRole="header">
              What are you buying?
            </Text>
            <Text variant="callout" tone="secondary">
              Enter the merchant and the amount, and WalletWise compares every card in your
              wallet.
            </Text>
            <Button
              label="Start a purchase"
              size="large"
              fullWidth
              onPress={() => router.push('/(app)/assistant')}
              accessibilityHint="Opens the purchase assistant"
              testID="home-start-purchase"
            />
          </VStack>
        </Card>

        {showDemoBanner ? <DemoDataBanner /> : null}

        <TopCardsByCategory asOf={asOf} testID="home-top-cards" />

        <RecentRecommendations
          onSelectMerchant={(merchant) =>
            router.push({
              pathname: '/(app)/assistant',
              params: { merchant },
            })
          }
          testID="home-recent-merchants"
        />

        <PlaceholderSection
          phase="Phase 5"
          title="Current rotating categories"
          description="This quarter's activated categories for any rotating-category card in your wallet, with an activation reminder when one is not enrolled."
          testID="home-rotating"
        />

        <PlaceholderSection
          phase="Phase 5"
          title="Spending-cap alerts"
          description="Which capped bonuses you are close to exhausting, and when each cap resets."
          testID="home-cap-alerts"
        />

        <PlaceholderSection
          phase="Phase 5"
          title="Expiring offers"
          description="Targeted offers you have entered that are about to run out."
          testID="home-expiring-offers"
        />

        <DisclaimerNotice kind="financial" />
      </VStack>
    </Screen>
  );
}
