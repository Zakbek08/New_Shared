/**
 * Holds the recommendation between the purchase screen and the result screen.
 *
 * WHY IT IS HELD IN MEMORY AND NOT PASSED IN THE URL
 * The result is a whole object graph — every card considered, its breakdown, every
 * reason a card was rejected. Serialising that into route params would be fragile and
 * would put dollar figures in a URL, where they get logged and shared.
 *
 * WHY IT IS NOT PERSISTED
 * Because it is a calculation, not a record. Reloading the page loses it, and the
 * result screen says so and offers to run the purchase again — which is honest, since
 * nothing was stored. Restoring a stale figure from disk after an app upgrade that
 * changed a rate would be the alternative, and that figure would be wrong.
 */
import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { PurchaseInput, RecommendationOutcome } from './recommend';

export interface LastResult extends RecommendationOutcome {
  readonly input: PurchaseInput;
}

interface LastResultValue {
  readonly last: LastResult | null;
  readonly setLast: (result: LastResult) => void;
}

const LastResultContext = createContext<LastResultValue | null>(null);

export function LastResultProvider({ children }: { readonly children: ReactNode }) {
  const [last, setLast] = useState<LastResult | null>(null);
  const value = useMemo<LastResultValue>(() => ({ last, setLast }), [last]);

  return <LastResultContext.Provider value={value}>{children}</LastResultContext.Provider>;
}

export function useLastResult(): LastResultValue {
  const context = useContext(LastResultContext);
  if (context === null) {
    throw new Error('useLastResult must be used inside LastResultProvider');
  }
  return context;
}
