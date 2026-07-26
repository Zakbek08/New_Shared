-- ============================================================================
-- WalletWise — seed entrypoint
-- ============================================================================
-- Run by `supabase db reset`. Loads the taxonomy and the FICTIONAL
-- demonstration catalog.
--
-- Nothing in here creates users, wallets or offers: those are user-owned rows
-- protected by RLS and are created through the app. To populate a local demo
-- wallet, sign up in the app and use the "Load demo wallet" action on the
-- Settings screen (Phase 2).
--
-- REMINDER: every card, issuer, merchant and rate loaded below is invented.
-- See supabase/seed/02_demo_sources_and_issuers.sql for the full disclaimer.
-- ============================================================================

\ir seed/01_reference_taxonomy.sql
\ir seed/02_demo_sources_and_issuers.sql
\ir seed/03_demo_merchants.sql
\ir seed/04_demo_card_products.sql
\ir seed/05_demo_reward_rules.sql
