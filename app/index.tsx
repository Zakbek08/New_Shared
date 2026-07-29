/**
 * The gate. Decides which screen a person lands on, and renders nothing itself.
 *
 * Three states, in order:
 *
 *   no profile              → sign in
 *   profile but no cards    → choose cards
 *   both                    → start a purchase
 *
 * That last line is the whole point of the app remembering anything: a returning user
 * goes straight to the only screen they came here to use.
 *
 * WHY THIS WAITS FOR `isReady`
 * The decision is invalid until storage has been read, and storage is asynchronous. A
 * redirect on the first render would send a returning user to the sign-in screen for a
 * frame before correcting itself — visible, alarming, and the single most annoying bug
 * this kind of app can have. So it holds a neutral loading state instead of guessing.
 */
import { Redirect } from 'expo-router';

import { LoadingState } from '@/components/StateViews';
import { Screen } from '@/components/ui/Screen';
import { useLocalStore } from '@/features/local/LocalStore';

export default function IndexScreen() {
  const { isReady, profile, wallet } = useLocalStore();

  if (!isReady) {
    return (
      <Screen accessibilityLabel="Starting WalletWise" testID="gate-loading">
        <LoadingState label="Starting WalletWise" testID="gate-loading-state" />
      </Screen>
    );
  }

  if (profile === null) return <Redirect href="/sign-in" />;
  if (wallet.cardIds.length === 0) return <Redirect href="/choose-cards" />;
  return <Redirect href="/purchase" />;
}
