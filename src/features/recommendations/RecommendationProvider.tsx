/**
 * Holds the most recent recommendation so the results and details screens can
 * render it without a round trip.
 *
 * WHY IN MEMORY RATHER THAN RE-FETCHED
 * `RecommendationResult` contains the full `EvaluableCard` for each candidate —
 * rules, conditions, cap usage — and that snapshot is deliberately *not*
 * persisted. Reconstructing it from `recommendation_candidates` would mean
 * inventing the parts we chose not to store.
 *
 * The consequence, which the UI states plainly rather than hiding: opening the
 * results screen after an app restart finds nothing, and offers to start a new
 * purchase. Historic answers appear on the dashboard as summaries, which is what
 * `recommendation_candidates` genuinely supports.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { RecommendationOutcome } from './hooks';

interface RecommendationContextValue {
  readonly latest: RecommendationOutcome | null;
  setLatest: (outcome: RecommendationOutcome) => void;
  clear: () => void;
}

const RecommendationContext = createContext<RecommendationContextValue | null>(null);

export function RecommendationProvider({ children }: { readonly children: ReactNode }) {
  const [latest, setLatestState] = useState<RecommendationOutcome | null>(null);

  const setLatest = useCallback((outcome: RecommendationOutcome) => {
    setLatestState(outcome);
  }, []);

  const clear = useCallback(() => {
    setLatestState(null);
  }, []);

  const value = useMemo<RecommendationContextValue>(
    () => ({ latest, setLatest, clear }),
    [latest, setLatest, clear],
  );

  return (
    <RecommendationContext.Provider value={value}>{children}</RecommendationContext.Provider>
  );
}

/** Never throws when the provider is absent, so a leaf renders in isolation. */
export function useLatestRecommendation(): RecommendationContextValue {
  return (
    useContext(RecommendationContext) ?? {
      latest: null,
      setLatest: () => undefined,
      clear: () => undefined,
    }
  );
}
