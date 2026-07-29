/**
 * Validated environment configuration.
 *
 * WalletWise has no backend, so this module has very little left to do — and that is
 * worth stating rather than leaving as an absence. There is no database URL, no API key
 * and no anon key, because there is nothing to connect to: the card catalog is bundled
 * and every figure is computed on the device.
 *
 * What remains is the build's own identity plus two optional telemetry endpoints, all
 * of which are legitimately blank in a normal build.
 *
 * IMPORTANT: only `EXPO_PUBLIC_*` variables are inlined into the bundle by Metro, which
 * means every value read here ships to the device and must be treated as public.
 * Nothing genuinely secret may ever be read from this module.
 */
import { z } from 'zod';

const environmentSchema = z.object({
  environment: z.enum(['development', 'staging', 'production', 'test']),
  analyticsWriteKey: z.string().nullable(),
  errorMonitoringDsn: z.string().nullable(),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * The single place `process.env` is read.
 *
 * EVERY VARIABLE IS WRITTEN OUT LONGHAND, AND THAT IS LOAD-BEARING.
 * Metro inlines `EXPO_PUBLIC_*` by syntactically replacing each static
 * `process.env.SOME_NAME` member expression with a string literal at build time. A
 * helper that takes the variable name as an argument — `readRaw(name)` reading
 * `process.env[name]` — is invisible to that transform. Nothing gets substituted,
 * `process.env` is an empty object on Hermes and on the web, and the app throws
 * "Invalid environment configuration" on boot with a correct `.env` right there.
 *
 * That is not a hypothetical: it is what this function used to do, and it made every
 * real build unstartable while all of the unit tests passed, because Jest runs in Node
 * where `process.env` is genuinely populated and dynamic access works. `env.test.ts`
 * asserts the shape of these reads for that reason.
 *
 * So: no loops, no computed keys, no clever table of names. One line each.
 * `src/types/env.d.ts` declares them so dot access satisfies
 * `noPropertyAccessFromIndexSignature`.
 *
 * Read inside a function rather than at module scope so `resetEnvCache()` can force a
 * genuine re-read.
 */
function readRawEnvironment(): Readonly<Record<string, string | undefined>> {
  return {
    EXPO_PUBLIC_ENVIRONMENT: process.env.EXPO_PUBLIC_ENVIRONMENT,
    EXPO_PUBLIC_ANALYTICS_WRITE_KEY: process.env.EXPO_PUBLIC_ANALYTICS_WRITE_KEY,
    EXPO_PUBLIC_ERROR_MONITORING_DSN: process.env.EXPO_PUBLIC_ERROR_MONITORING_DSN,
  };
}

function readOptional(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

function readString(value: string | undefined, fallback = ''): string {
  return value ?? fallback;
}

/**
 * Reads and validates the environment.
 *
 * `environment` defaults to `development`, so the app starts with no `.env` at all —
 * which is the normal case now that there is nothing to configure. A build that wants
 * to be a release has to say so.
 *
 * The error message deliberately names only the *variable*, never the value, so a bad
 * setting cannot leak into a crash report.
 */
function loadEnvironment(): Environment {
  const raw = readRawEnvironment();

  const candidate = {
    environment: readString(raw['EXPO_PUBLIC_ENVIRONMENT'], 'development'),
    analyticsWriteKey: readOptional(raw['EXPO_PUBLIC_ANALYTICS_WRITE_KEY']),
    errorMonitoringDsn: readOptional(raw['EXPO_PUBLIC_ERROR_MONITORING_DSN']),
  };

  const parsed = environmentSchema.safeParse(candidate);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration (${fields}).`);
  }

  return parsed.data;
}

let cached: Environment | null = null;

/** Lazily validated so importing this module never throws at bundle time. */
export function getEnv(): Environment {
  cached ??= loadEnvironment();
  return cached;
}

/** Test-only: forces the next `getEnv()` to re-read `process.env`. */
export function resetEnvCache(): void {
  cached = null;
}

export const isProduction = (): boolean => getEnv().environment === 'production';
