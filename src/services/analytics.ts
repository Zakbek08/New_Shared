/**
 * Analytics and error-monitoring abstraction.
 *
 * WalletWise talks to telemetry only through this module, for two reasons:
 *
 *   1. Every payload passes through `redact()` on the way out, so the "do not
 *      log sensitive user or financial data" requirement holds by construction
 *      rather than by reviewer vigilance.
 *   2. The concrete sink is swappable. With no key configured the no-op sink is
 *      used, which is the correct default and the one used in tests.
 *
 * Event names are a closed union: you cannot emit an event that has not been
 * reviewed. Adding one is a deliberate, visible change.
 */
import { getEnv } from '@/config/env';

import { redact } from './redaction';

export const ANALYTICS_EVENTS = [
  'app_opened',
  'sign_up_succeeded',
  'sign_in_succeeded',
  'sign_out',
  'disclaimers_accepted',
  'card_added',
  'card_archived',
  'custom_card_created',
  'purchase_query_submitted',
  'recommendation_viewed',
  'recommendation_accepted',
  'recommendation_details_viewed',
  'offer_added',
  'offer_enrolled',
  'offer_removed',
  'preferences_updated',
  'cap_alert_viewed',
  'reward_usage_recorded',
  'rotating_category_activated',
  'catalog_rule_edited',
  'catalog_rule_verified',
  'catalog_rules_imported',
  'catalog_access_denied',
  // Counts only, never the exported document or any row from it.
  'account_data_exported',
  'account_deleted',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsProperties = Record<string, unknown>;

export interface AnalyticsSink {
  readonly name: string;
  track(event: AnalyticsEvent, properties: Record<string, unknown>): void;
  /**
   * Associates subsequent events with a user. Only the opaque Supabase user id
   * is ever passed — no email, no name.
   */
  identify(userId: string): void;
  reset(): void;
}

export interface ErrorMonitoringSink {
  readonly name: string;
  captureException(error: unknown, context: Record<string, unknown>): void;
  captureMessage(message: string, context: Record<string, unknown>): void;
}

/** The default. Discards everything; used when no key is configured, and in tests. */
export const noopAnalyticsSink: AnalyticsSink = {
  name: 'noop',
  track: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
};

export const noopErrorMonitoringSink: ErrorMonitoringSink = {
  name: 'noop',
  captureException: () => undefined,
  captureMessage: () => undefined,
};

/**
 * Development sink. Writes redacted payloads to the console so engineers can see
 * the event stream without a vendor account.
 *
 * Uses `console.warn` because the ESLint config bans `console.log` outright —
 * an unredacted `console.log` is exactly the mistake we are guarding against.
 */
export const consoleAnalyticsSink: AnalyticsSink = {
  name: 'console',
  track: (event, properties) => {
    console.warn(`[analytics] ${event}`, properties);
  },
  identify: (userId) => {
    console.warn('[analytics] identify', { userId });
  },
  reset: () => {
    console.warn('[analytics] reset');
  },
};

export const consoleErrorMonitoringSink: ErrorMonitoringSink = {
  name: 'console',
  captureException: (error, context) => {
    console.error('[monitoring] exception', error, context);
  },
  captureMessage: (message, context) => {
    console.error('[monitoring] message', message, context);
  },
};

let analyticsSink: AnalyticsSink = noopAnalyticsSink;
let errorSink: ErrorMonitoringSink = noopErrorMonitoringSink;

/**
 * Chooses a sink from the environment.
 *
 * Phase 1 ships the no-op and console sinks only. Wiring a vendor SDK is a
 * matter of implementing the two interfaces above and registering it here — no
 * call site changes, and redaction stays mandatory.
 */
export function initialiseTelemetry(): void {
  const env = getEnv();

  if (env.analyticsWriteKey !== null) {
    // A real sink would be constructed here. Until one is integrated, falling
    // back to the console is honest: it makes clear nothing is being shipped.
    analyticsSink = consoleAnalyticsSink;
  } else if (env.environment === 'development') {
    analyticsSink = consoleAnalyticsSink;
  } else {
    analyticsSink = noopAnalyticsSink;
  }

  if (env.errorMonitoringDsn !== null || env.environment === 'development') {
    errorSink = consoleErrorMonitoringSink;
  } else {
    errorSink = noopErrorMonitoringSink;
  }
}

/** Test seam: inject a spy sink. */
export function setTelemetrySinks(options: {
  readonly analytics?: AnalyticsSink;
  readonly errors?: ErrorMonitoringSink;
}): void {
  if (options.analytics) analyticsSink = options.analytics;
  if (options.errors) errorSink = options.errors;
}

/**
 * Records an event. `properties` is redacted before it reaches the sink, so
 * callers do not have to remember which fields are sensitive.
 */
export function track(event: AnalyticsEvent, properties: AnalyticsProperties = {}): void {
  const safe = redact(properties);
  analyticsSink.track(event, safe as Record<string, unknown>);
}

export function identify(userId: string): void {
  analyticsSink.identify(userId);
}

export function resetAnalyticsIdentity(): void {
  analyticsSink.reset();
}

export function captureException(error: unknown, context: AnalyticsProperties = {}): void {
  errorSink.captureException(error, redact(context) as Record<string, unknown>);
}

export function captureMessage(message: string, context: AnalyticsProperties = {}): void {
  errorSink.captureMessage(message, redact(context) as Record<string, unknown>);
}
