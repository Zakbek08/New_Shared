/**
 * Declares WalletWise's public environment variables as real properties.
 *
 * WHY THIS FILE EXISTS — IT IS NOT A TYPING CONVENIENCE
 * Metro inlines `EXPO_PUBLIC_*` variables into the bundle by *syntactically*
 * replacing each `process.env.SOME_NAME` member expression with a string literal
 * at build time. A dynamic read — `process.env[name]` — is invisible to that
 * transform, so nothing is substituted, and at runtime `process.env` is an empty
 * object on Hermes and on the web. The app then fails to boot with "Invalid
 * environment configuration" while a perfectly good `.env` sits next to it.
 *
 * So the reads in `env.ts` must be written as static dot access. But
 * `@types/node` types `ProcessEnv` with an index signature, and this project
 * enables `noPropertyAccessFromIndexSignature`, which makes dot access on an
 * index signature a compile error (TS4111). Declaring the variables here turns
 * them into declared properties, so `process.env.EXPO_PUBLIC_SUPABASE_URL` both
 * typechecks and inlines.
 *
 * Adding a variable to the app means adding it here too. If you forget, the
 * compiler will tell you — which is the point.
 *
 * Everything named here ships to the device and is therefore public by
 * construction. Nothing secret belongs in this file; see SECURITY.md
 * requirement 4.
 *
 * Not marked `readonly`, deliberately: the Jest setup and `env.test.ts` assign
 * these to exercise the validation, and a `readonly` declaration makes that a
 * compile error. Production code is kept away from `process.env` by convention
 * and by `getEnv()` being the only reader, not by this type.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    /** Supabase project URL. `http://localhost` is permitted for the local stack. */
    EXPO_PUBLIC_SUPABASE_URL?: string;
    /** The *anon* key. Public by design — RLS is the control, not key secrecy. */
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    /** `development` | `staging` | `production` | `test`. */
    EXPO_PUBLIC_ENVIRONMENT?: string;
    /** Enables the fictional demo catalog and the on-screen DEMO DATA banner. */
    EXPO_PUBLIC_ENABLE_DEMO_DATA?: string;
    /**
     * Runs the app entirely against a bundled fictional wallet, with no backend
     * and no sign-in. For the published preview only — see isDemoMode().
     */
    EXPO_PUBLIC_DEMO_MODE?: string;
    EXPO_PUBLIC_ANALYTICS_WRITE_KEY?: string;
    EXPO_PUBLIC_ERROR_MONITORING_DSN?: string;
  }
}
