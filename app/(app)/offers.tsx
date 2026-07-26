/**
 * Screen 12 — User Offers.
 *
 * Targeted offers are entered by hand by the user from their issuer's app.
 * WalletWise does not scrape issuer sites and does not log in to any bank, so
 * hand entry is the only mechanism there will ever be.
 *
 * The screen shows what the user entered and nothing more. What an offer is *worth*
 * depends on the purchase, so that figure appears in a recommendation — where the
 * engine computed it — and never here.
 */
import { useMemo } from 'react';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { EmptyState, ErrorNotice, LoadingState } from '@/components/StateViews';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import {
  useCreateOffer,
  useDeleteOffer,
  useSetOfferStatus,
  useUserOffers,
} from '@/features/offers/hooks';
import { OfferForm } from '@/features/offers/ui/OfferForm';
import { OfferRow } from '@/features/offers/ui/OfferRow';
import { useWalletCards } from '@/features/wallet/hooks';
import { formatCardName } from '@/lib/format';

export default function OffersScreen() {
  const offers = useUserOffers();
  const wallet = useWalletCards();
  const create = useCreateOffer();
  const setStatus = useSetOfferStatus();
  const remove = useDeleteOffer();

  const formCards = useMemo(
    () =>
      (wallet.data ?? []).map((card) => ({
        id: card.id,
        name: formatCardName(card.productName, card.nickname),
      })),
    [wallet.data],
  );

  const live = (offers.data ?? []).filter(
    (offer) => offer.status === 'available' || offer.status === 'enrolled',
  );
  const finished = (offers.data ?? []).filter(
    (offer) => offer.status !== 'available' && offer.status !== 'enrolled',
  );

  return (
    <Screen scroll accessibilityLabel="Your offers" testID="offers-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Your offers
          </Text>
          <Text variant="body" tone="secondary">
            Merchant offers and statement credits you have added, and how they change the
            recommendation.
          </Text>
        </VStack>

        <Card>
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Why you add these yourself
            </Text>
            <Text variant="callout" tone="secondary">
              Targeted offers are specific to your account, and only your issuer knows which
              ones you have. WalletWise never signs in to your bank or scrapes an issuer
              website, so you copy the offers across yourself. It takes a moment and keeps your
              credentials where they belong.
            </Text>
          </VStack>
        </Card>

        {create.isError ? (
          <ErrorNotice error={create.error} testID="offers-save-error" />
        ) : null}
        {setStatus.isError ? (
          <ErrorNotice error={setStatus.error} testID="offers-status-error" />
        ) : null}
        {remove.isError ? (
          <ErrorNotice error={remove.error} testID="offers-delete-error" />
        ) : null}

        {formCards.length === 0 && !wallet.isPending ? (
          <EmptyState
            title="Add a card first"
            description="An offer belongs to a card, so add a card to your wallet before entering offers."
            testID="offers-no-cards"
          />
        ) : (
          <OfferForm
            cards={formCards}
            isSaving={create.isPending}
            onSubmit={(input) => create.mutate(input)}
            testID="offers-add"
          />
        )}

        {/* ---- Live offers ---- */}
        {offers.isPending ? (
          <LoadingState label="Loading your offers" />
        ) : offers.isError ? (
          <ErrorNotice
            error={offers.error}
            onRetry={() => void offers.refetch()}
            testID="offers-error"
          />
        ) : live.length === 0 ? (
          <EmptyState
            title="No active offers"
            description="When you add an offer, it appears here and is taken into account the next time you compare a purchase."
            testID="offers-empty"
          />
        ) : (
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Active offers
            </Text>
            {live.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                isSaving={setStatus.isPending}
                onActivate={(target) => setStatus.mutate({ id: target.id, status: 'enrolled' })}
                onMarkUsed={(target) => setStatus.mutate({ id: target.id, status: 'redeemed' })}
                onDelete={(target) => remove.mutate(target.id)}
                testID={`offers-row-${offer.id}`}
              />
            ))}
          </VStack>
        )}

        {/* ---- Used and expired, kept so the user does not re-enter them ---- */}
        {finished.length > 0 ? (
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Used and expired
            </Text>
            <Text variant="callout" tone="secondary">
              Kept so you can see what you have already claimed. These no longer affect a
              recommendation.
            </Text>
            {finished.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                onActivate={(target) => setStatus.mutate({ id: target.id, status: 'enrolled' })}
                onMarkUsed={(target) => setStatus.mutate({ id: target.id, status: 'redeemed' })}
                onDelete={(target) => remove.mutate(target.id)}
                testID={`offers-row-${offer.id}`}
              />
            ))}
          </VStack>
        ) : null}

        <DisclaimerNotice kind="financial" />
      </VStack>
    </Screen>
  );
}
