/**
 * Data export and account deletion.
 *
 * Both are things the user is entitled to and both are irreversible in one
 * direction or the other, so both are written to be boring: no clever batching,
 * no partial success, no silent recovery. If a section of the export cannot be
 * read, the export fails and says so, because a file that quietly omits a table
 * would break the only promise an export makes.
 *
 * WHY THE READS ARE NOT FILTERED BY user_id
 * They do not need to be. Every table below is under a row-level policy scoped to
 * `auth.uid()`, so `select *` returns exactly the caller's rows. Adding a client
 * filter would suggest the client is what makes this safe; it is not, and
 * supabase/tests/10_rls.sql is where that is proven.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { File, Paths } from 'expo-file-system';
import { isAvailableAsync as isSharingAvailableAsync, shareAsync } from 'expo-sharing';

import {
  buildAccountExport,
  exportFileName,
  serialiseAccountExport,
  totalRecords,
  type AccountExportDocument,
  type AccountExportInput,
} from '@/domain/account/exportDocument';
import { DataError, fromPostgrestError, toDataError } from '@/lib/errors';
import { forgetDeviceKeys } from '@/lib/lastFour';
import { getSupabaseClient } from '@/lib/supabase';
import { captureException, track } from '@/services/analytics';
import type { RewardRuleConditionRow, RewardRuleRow } from '@/types/database';

export interface AccountExportResult {
  readonly document: AccountExportDocument;
  readonly fileName: string;
  readonly recordCount: number;
  /**
   * Where the file was written. Present even when sharing was unavailable, so the
   * UI can tell the user the file exists rather than implying nothing happened.
   */
  readonly fileUri: string;
  readonly wasShared: boolean;
}

/**
 * Turns a PostgREST result into rows, or throws.
 *
 * Generic over the row type so each caller keeps the type the client inferred for
 * that table — there is no cast anywhere in the export path, which is what makes
 * "every column of every table" a claim the compiler checks.
 */
function unwrap<T>(result: { data: T[] | null; error: PostgrestError | null }): readonly T[] {
  if (result.error !== null) throw fromPostgrestError(result.error);
  return result.data ?? [];
}

/**
 * Reads every table the user owns.
 *
 * Sequentially, not in parallel. An export is a rare, deliberate action; the few
 * hundred milliseconds saved by racing thirteen queries is not worth losing the
 * ability to say which table failed.
 */
async function fetchExportInput(userId: string): Promise<AccountExportInput> {
  const client = getSupabaseClient();

  const profileResult = await client.from('users').select('*').eq('id', userId).maybeSingle();
  if (profileResult.error !== null) throw fromPostgrestError(profileResult.error);
  if (profileResult.data === null) {
    throw new DataError(
      'not_found',
      'We could not find your profile, so there is nothing to export.',
    );
  }

  // Catalog tables hold shared rows too, so these two are the only reads that
  // need a filter — and it is a filter on *what the row is*, not on who may see
  // it. The RLS policy already limits the caller to their own user-defined rows;
  // this keeps the shared catalog out of a file about one person.
  const customProductsResult = await client
    .from('card_products')
    .select('*')
    .eq('is_user_defined', true)
    .eq('created_by', userId);
  if (customProductsResult.error !== null) throw fromPostgrestError(customProductsResult.error);
  const customCardProducts = customProductsResult.data ?? [];

  const customProductIds = customCardProducts.map((product) => product.id);

  let customRewardRules: readonly RewardRuleRow[] = [];
  let customRuleConditions: readonly RewardRuleConditionRow[] = [];

  if (customProductIds.length > 0) {
    const rulesResult = await client
      .from('reward_rules')
      .select('*')
      .in('card_product_id', customProductIds);
    if (rulesResult.error !== null) throw fromPostgrestError(rulesResult.error);
    customRewardRules = rulesResult.data ?? [];

    const ruleIds = customRewardRules.map((rule) => rule.id);
    if (ruleIds.length > 0) {
      const conditionsResult = await client
        .from('reward_rule_conditions')
        .select('*')
        .in('reward_rule_id', ruleIds);
      if (conditionsResult.error !== null) throw fromPostgrestError(conditionsResult.error);
      customRuleConditions = conditionsResult.data ?? [];
    }
  }

  // Written out one table at a time rather than looped over a list of names. A
  // loop would need a cast to say what each row is, and a cast is exactly the
  // wrong tool here: if a column is added to a table and not to the export type,
  // the compiler should say so, and a cast would silence it.
  return {
    profile: profileResult.data,
    cards: unwrap(await client.from('user_cards').select('*')),
    valuations: unwrap(await client.from('user_reward_preferences').select('*')),
    enrollments: unwrap(await client.from('user_rule_enrollments').select('*')),
    offers: unwrap(await client.from('user_offers').select('*')),
    rewardUsage: unwrap(await client.from('reward_usage').select('*')),
    purchaseQueries: unwrap(await client.from('purchase_queries').select('*')),
    recommendations: unwrap(await client.from('recommendations').select('*')),
    recommendationCandidates: unwrap(
      await client.from('recommendation_candidates').select('*'),
    ),
    customCardProducts,
    customRewardRules,
    customRuleConditions,
    auditTrail: unwrap(await client.from('audit_logs').select('*')),
  };
}

/**
 * Builds the export, writes it to a file and offers the share sheet.
 *
 * `exportedAt` is a parameter so a test can assert the whole document, including
 * its filename. Callers in the app pass `new Date()`.
 */
export async function exportAccountData(
  userId: string,
  exportedAt: Date,
): Promise<AccountExportResult> {
  try {
    const input = await fetchExportInput(userId);
    const document = buildAccountExport(input, exportedAt);
    const fileName = exportFileName(exportedAt);

    // The cache directory, not the document directory: this file is a copy of data
    // the server already holds, it contains no secret the device does not already
    // store, and leaving it lying around forever serves nobody. The OS may reclaim
    // it, which is the correct lifetime for a download the user has already saved.
    const file = new File(Paths.cache, fileName);
    if (file.exists) file.delete();
    file.create();
    file.write(serialiseAccountExport(document));

    const canShare = await isSharingAvailableAsync();
    if (canShare) {
      await shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Your WalletWise data',
        UTI: 'public.json',
      });
    }

    // Counts only. The event must never carry the document or a filename derived
    // from anything but the clock.
    track('account_data_exported', {
      sectionCount: Object.keys(document.counts).length,
      recordCount: totalRecords(document),
      wasShared: canShare,
    });

    return {
      document,
      fileName,
      recordCount: totalRecords(document),
      fileUri: file.uri,
      wasShared: canShare,
    };
  } catch (cause) {
    const error = toDataError(cause);
    captureException(error, { operation: 'exportAccountData' });
    throw error;
  }
}

/**
 * Deletes the signed-in user's account, then this device's encryption key.
 *
 * ORDER MATTERS, AND THIS IS THE SAFE ORDER
 * The server row goes first. If the key were wiped first and the delete then
 * failed, the account would survive with card digits nobody — including the
 * owner — could ever decrypt again. In the reverse order, a failure after the
 * delete leaves an orphaned key on the device, which is inert: there is nothing
 * left for it to decrypt, and the next sign-in overwrites it.
 *
 * The key wipe is therefore allowed to fail without failing the deletion. The
 * account is already gone by then, and reporting an error for it would tell the
 * user their deletion did not work when it did.
 */
export async function deleteOwnAccount(): Promise<void> {
  const client = getSupabaseClient();

  try {
    const { error } = await client.rpc('delete_own_account');
    if (error !== null) throw fromPostgrestError(error);
  } catch (cause) {
    const error = toDataError(cause);
    captureException(error, { operation: 'deleteOwnAccount' });
    throw error;
  }

  track('account_deleted', {});

  try {
    await forgetDeviceKeys();
  } catch (cause) {
    captureException(toDataError(cause), { operation: 'deleteOwnAccount.forgetDeviceKeys' });
  }

  // Best effort. The session's user no longer exists, so the token is already
  // useless; this only clears the local copy.
  try {
    await client.auth.signOut();
  } catch (cause) {
    captureException(toDataError(cause), { operation: 'deleteOwnAccount.signOut' });
  }
}
