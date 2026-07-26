/**
 * One reward program, and what the user says a point of it is worth.
 *
 * Zero is a legitimate answer and is treated as one — it means "these points are
 * worthless to me", and the engine honours it rather than falling back to a default.
 * The field distinguishes "not set" (blank, catalog figure applies) from "set to
 * zero", because collapsing the two would silently overrule the user.
 */
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import type { ProgramValuation } from '@/features/preferences/api/preferences';
import { formatValuation } from '@/lib/format';

/** Rejects anything that is not a plain cents figure. Mirrors the Zod bound. */
function parseCents(raw: string): { readonly value: number } | { readonly error: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { error: 'Enter a value in cents' };

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { error: 'Enter a number, for example 1.25' };
  if (value < 0) return { error: 'Cannot be negative' };
  if (value > 100) return { error: 'That is more than $1.00 per point — check the value' };

  return { value };
}

export function ValuationRow({
  program,
  onSave,
  isSaving = false,
  testID,
}: {
  readonly program: ProgramValuation;
  readonly onSave: (centsPerUnit: number) => void;
  readonly isSaving?: boolean;
  readonly testID?: string;
}) {
  const [draft, setDraft] = useState(
    program.userCentsPerUnit === null ? '' : String(program.userCentsPerUnit),
  );
  const [error, setError] = useState<string | undefined>(undefined);

  // Re-sync when a save completes and the query returns the stored figure, so the
  // field shows what is actually persisted rather than the user's last keystroke.
  useEffect(() => {
    setDraft(program.userCentsPerUnit === null ? '' : String(program.userCentsPerUnit));
  }, [program.userCentsPerUnit]);

  const isDirty =
    draft.trim() !==
    (program.userCentsPerUnit === null ? '' : String(program.userCentsPerUnit));

  const save = () => {
    const parsed = parseCents(draft);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(undefined);
    onSave(parsed.value);
  };

  const noun = program.unit === 'miles' ? 'mile' : 'point';

  return (
    <VStack gap="sm" testID={testID}>
      <VStack gap="xxs">
        <Text variant="bodyStrong">{program.programName}</Text>
        <Text variant="caption" tone="secondary">
          {program.cardNames.join(', ')}
        </Text>
      </VStack>

      <HStack gap="sm" wrap align="flex-start">
        {program.userCentsPerUnit === null ? (
          <Badge label="Using the catalog figure" tone="neutral" />
        ) : (
          <Badge label="Your figure" tone="accent" glyph="★" />
        )}
        <Badge
          label={`In use: ${formatValuation(program.effectiveCentsPerUnit, program.unit)}`}
          tone="info"
        />
      </HStack>

      <TextField
        label={`Cents per ${noun}`}
        hint={
          program.userCentsPerUnit === null
            ? `Blank uses the catalog's ${formatValuation(program.defaultCentsPerUnit, program.unit)}. Enter 0 if these are worthless to you.`
            : `Enter 0 if these are worthless to you.`
        }
        value={draft}
        onChangeText={(text) => {
          setDraft(text.replace(/[^0-9.]/gu, ''));
          setError(undefined);
        }}
        error={error}
        keyboardType="decimal-pad"
        testID={`valuation-input-${program.rewardProgramId}`}
      />

      <Button
        label="Save this value"
        variant="secondary"
        disabled={!isDirty}
        loading={isSaving}
        onPress={save}
        accessibilityHint="Saves your value and re-ranks your cards immediately"
        testID={`valuation-save-${program.rewardProgramId}`}
      />
    </VStack>
  );
}
