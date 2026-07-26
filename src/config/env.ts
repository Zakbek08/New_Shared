/**
 * Validated environment configuration.
 *
 * Secrets live in environment variables, never in source. See `.env.example`.
 *
 * IMPORTANT: only `EXPO_PUBLIC_*` variables are inlined into the bundle by
 * Metro, which means every value read here ships to the device and must be
 * treated as public. Anything genuinely secret (service-role keys, model API
 * keys) belongs in a Supabase Edge Function's secret store and is deliberately
 * unreachable from this module.
 */
import { z } from 'zod';

const environmentSchema = z.object({
  supabaseUrl: z
    .url('EXPO_PUBLIC_SUPABASE_URL must be a full URL')
    .refine((value) => value.startsWith('https://') || value.startsWith('http://localhost'), {
      message: 'Supabase must be reached over https, except for a local dev stack',
    }),
  supabaseAnonKey: z.string().min(20, 'EXPO_PUBLIC_SUPABASE_ANON_KEY looks wrong'),
  environment: z.enum(['development', 'staging', 'production', 'test']),
  enableDemoData: z.boolean(),
  analyticsWriteKey: z.string().nullable(),
  errorMonitoringDsn: z.string().nullable(),
});

export type Environment = z.infer<typeof environmentSchema>;

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

function readOptional(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

/**
 * Reads and validates the environment.
 *
 * Throws on invalid configuration rather than limping along with a broken
 * client — a misconfigured Supabase URL is not something to discover three
 * screens later. The error message deliberately names only the *variable*, never
 * the value, so a bad key cannot leak into a crash report.
 */
function loadEnvironment(): Environment {
  const candidate = {
    supabaseUrl: process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '',
    supabaseAnonKey: process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
    environment: process.env['EXPO_PUBLIC_ENVIRONMENT'] ?? 'development',
    enableDemoData: readBoolean(process.env['EXPO_PUBLIC_ENABLE_DEMO_DATA'], true),
    analyticsWriteKey: readOptional(process.env['EXPO_PUBLIC_ANALYTICS_WRITE_KEY']),
    errorMonitoringDsn: readOptional(process.env['EXPO_PUBLIC_ERROR_MONITORING_DSN']),
  };

  const parsed = environmentSchema.safeParse(candidate);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `Invalid environment configuration (${fields}). Copy .env.example to .env and fill it in.`,
    );
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

/**
 * Whether the fictional demo catalog is in play. When true the UI must show the
 * demonstration-data banner, because the rates on screen are invented.
 */
export const isDemoDataEnabled = (): boolean => getEnv().enableDemoData;
