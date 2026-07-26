/**
 * Screen 4 — Home dashboard.
 *
 * Layout follows the product specification: a large "What are you buying?"
 * action above everything else, then top cards by category, recently evaluated
 * merchants, current rotating categories, spending-cap alerts and expiring
 * offers.
 *
 * Nothing on this screen shows a fabricated reward figure: every number comes from
 * the deterministic engine run against the user's own wallet. The three alert
 * regions render nothing at all when there is nothing to warn about, so a section
 * appearing is itself the signal.
 */
import { useMemo } from 'react';
import { useRouter } from 'expo-router';

import { DemoDataBanner, DisclaimerNotice } from '@/components/Disclaimers';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { isDemoDataEnabled } from '@/config/env';
import { CapAlertsSection } from '@/features/caps/ui/CapTracker';
import { ActivationRemindersSection } from '@/features/caps/ui/RotatingCategories';
import { ExpiringOffersSection } from '@/features/offers/ui/ExpiringOffers';
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

        {/*
          Three alert regions, each of which renders nothing when there is nothing to
          say. A dashboard that announces "no alerts" three times buries the one
          section that matters on the day it appears.
        */}
        <ActivationRemindersSection asOf={asOf} testID="home-rotating" />

        <CapAlertsSection asOf={asOf} testID="home-cap-alerts" />

        <ExpiringOffersSection asOf={asOf} testID="home-expiring-offers" />

        <DisclaimerNotice kind="financial" />
      </VStack>
    </Screen>
  );
}
