/**
 * Administrative catalog hooks.
 *
 * `useCatalogAccess` reports whether the signed-in user holds an editing role, and
 * the screen uses it to choose what to *show*. It is not a security control and the
 * comment there says so: the database refuses the write regardless, which is why the
 * mutations below are wired up whether or not the flag is true — a refused write
 * surfaces a `forbidden` error, which is the honest outcome to display.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  RewardRuleConditionInput,
  RewardRuleInput,
  SourceInput,
  VerificationInput,
} from '@/domain/schemas';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/auth/hooks';
import { queryKeys } from '@/lib/queryKeys';
import { DataError } from '@/lib/errors';
import { appRateLimiter, describeRetryDelay } from '@/lib/rateLimit';
import type { AppRole } from '@/types/database';

import {
  bulkInsertRewardRules,
  createCondition,
  createRewardRule,
  createSource,
  deleteCondition,
  listAuditLog,
  listCatalogRules,
  listSources,
  listVerificationHistory,
  recordVerification,
  reinstateRewardRule,
  retireRewardRule,
  updateCondition,
  updateRewardRule,
  type AuditEntry,
  type CatalogRule,
  type VerificationHistoryEntry,
} from './api/catalog';

const EDITING_ROLES: readonly AppRole[] = ['catalog_editor', 'admin'];

export interface CatalogAccess {
  readonly role: AppRole | null;
  /** Mirrors `can_edit_catalog()` in SQL. For display only. */
  readonly canEdit: boolean;
  readonly isAdmin: boolean;
  readonly isPending: boolean;
}

/**
 * The signed-in user's catalog role.
 *
 * Deliberately mirrors the SQL predicate rather than inventing a second rule, so a
 * change to one is an obvious prompt to change the other. If the two ever disagree,
 * the database wins — it is the one that decides.
 */
export function useCatalogAccess(): CatalogAccess {
  const { isSignedIn } = useAuth();
  const profile = useProfile();

  const role = profile.data?.role ?? null;

  return {
    role,
    canEdit: role !== null && EDITING_ROLES.includes(role),
    isAdmin: role === 'admin',
    isPending: isSignedIn && profile.isPending,
  };
}

export function useCatalogRules(options: { readonly asOf: Date; readonly search?: string }) {
  const { isSignedIn } = useAuth();

  return useQuery<CatalogRule[]>({
    queryKey: queryKeys.admin.rules(options.search ?? ''),
    queryFn: () => listCatalogRules(options),
    enabled: isSignedIn,
    placeholderData: (previous) => previous,
  });
}

export function useSources() {
  const { isSignedIn } = useAuth();

  return useQuery({
    queryKey: queryKeys.admin.sources(),
    queryFn: () => listSources(),
    enabled: isSignedIn,
  });
}

export function useVerificationHistory(rewardRuleId: string | null) {
  const { isSignedIn } = useAuth();

  return useQuery<VerificationHistoryEntry[]>({
    queryKey: queryKeys.admin.verificationHistory(rewardRuleId ?? ''),
    queryFn: () => listVerificationHistory(rewardRuleId as string),
    enabled: isSignedIn && rewardRuleId !== null,
  });
}

export function useAuditLog(options: { readonly tableName?: string } = {}) {
  const { isSignedIn } = useAuth();

  return useQuery<AuditEntry[]>({
    queryKey: queryKeys.admin.audit(options.tableName ?? 'all'),
    queryFn: () => listAuditLog(options),
    enabled: isSignedIn,
  });
}

/**
 * Invalidates everything a catalog write can affect.
 *
 * The wallet snapshot is included: a rule edited here is a rule the engine reads, so
 * leaving the snapshot cached would keep recommending on the rate that was just
 * corrected.
 */
function useCatalogInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations.all });
  };
}

export function useSaveRule() {
  const invalidate = useCatalogInvalidation();

  return useMutation({
    mutationFn: (variables: { readonly id: string | null; readonly input: RewardRuleInput }) =>
      variables.id === null
        ? createRewardRule(variables.input)
        : updateRewardRule(variables.id, variables.input),
    onSuccess: invalidate,
  });
}

export function useRetireRule() {
  const invalidate = useCatalogInvalidation();

  return useMutation({
    mutationFn: (variables: { readonly id: string; readonly reinstate?: boolean }) =>
      variables.reinstate === true
        ? reinstateRewardRule(variables.id)
        : retireRewardRule(variables.id),
    onSuccess: invalidate,
  });
}

export function useSaveCondition() {
  const invalidate = useCatalogInvalidation();

  return useMutation({
    mutationFn: (variables: {
      readonly id: string | null;
      readonly input: RewardRuleConditionInput;
    }) =>
      variables.id === null
        ? createCondition(variables.input)
        : updateCondition(variables.id, variables.input),
    onSuccess: invalidate,
  });
}

export function useDeleteCondition() {
  const invalidate = useCatalogInvalidation();

  return useMutation({
    mutationFn: (id: string) => deleteCondition(id),
    onSuccess: invalidate,
  });
}

export function useCreateSource() {
  const invalidate = useCatalogInvalidation();

  return useMutation({
    mutationFn: (input: SourceInput) => createSource(input),
    onSuccess: invalidate,
  });
}

export function useRecordVerification() {
  const invalidate = useCatalogInvalidation();

  return useMutation({
    mutationFn: (variables: { readonly input: VerificationInput; readonly asOf?: Date }) =>
      recordVerification(variables.input, { asOf: variables.asOf }),
    onSuccess: invalidate,
  });
}

export function useBulkImport() {
  const invalidate = useCatalogInvalidation();

  return useMutation({
    mutationFn: (rules: readonly RewardRuleInput[]) => {
      // A bulk import writes many catalog rows at once, and the catalog is shared.
      // A stuck retry here would multiply rules across everybody's wallet.
      const decision = appRateLimiter.attempt('bulk_import', Date.now());
      if (!decision.isAllowed) {
        throw new DataError(
          'rate_limited',
          `Too many imports in a row. ${describeRetryDelay(decision.retryAfterMs)}`,
        );
      }
      return bulkInsertRewardRules(rules);
    },
    onSuccess: invalidate,
  });
}
