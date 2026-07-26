/**
 * Account deletion, behind a typed confirmation.
 *
 * WHY TYPING A WORD AND NOT AN "ARE YOU SURE?" DIALOG
 * A dialog is dismissed by reflex; the second tap lands on muscle memory before
 * the sentence is read. Typing a word cannot be done by accident, and it costs
 * about four seconds — which is the right price for an action with no undo. The
 * button stays disabled until the word matches, so the destructive tap is never
 * even available to a mis-tap.
 *
 * The copy is specific about what goes and what stays, because "your account will
 * be deleted" does not answer the question the user is actually asking.
 */
import { useState } from 'react';

import { ErrorNotice } from '@/components/StateViews';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useDeleteAccount } from '@/features/account/hooks';
import { useTheme } from '@/theme/ThemeProvider';

/** Deliberately short, and deliberately not "yes". */
export const DELETE_CONFIRMATION_WORD = 'DELETE';

export function DeleteAccountCard() {
  const theme = useTheme();
  const deleteAccount = useDeleteAccount();
  const [confirmation, setConfirmation] = useState('');

  const isConfirmed = confirmation.trim().toUpperCase() === DELETE_CONFIRMATION_WORD;

  return (
    <Card>
      <VStack gap="md">
        <Text
          variant="title3"
          accessibilityRole="header"
          style={{ color: theme.colors.danger }}
        >
          Delete your account
        </Text>

        <Text variant="body" tone="secondary">
          This removes your profile, your cards, your reward valuations, your offers, your
          recorded cap usage, and your purchase history. It happens in one database transaction,
          so nothing is left behind.
        </Text>

        <Text variant="body" tone="secondary">
          The encryption key for any stored card digits is wiped from this device at the same
          time. The shared card catalog is not affected — it belongs to everyone, not to your
          account.
        </Text>

        <Text variant="footnote" tone="tertiary">
          This cannot be undone, and we cannot restore the data afterwards. Export it first if
          you want a copy.
        </Text>

        {deleteAccount.isError ? (
          <ErrorNotice error={deleteAccount.error} testID="account-delete-error" />
        ) : null}

        <TextField
          label={`Type ${DELETE_CONFIRMATION_WORD} to confirm`}
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          hint="The button below stays disabled until this matches."
          testID="account-delete-confirmation"
        />

        <Button
          label="Delete my account"
          variant="danger"
          fullWidth
          disabled={!isConfirmed}
          loading={deleteAccount.isPending}
          onPress={() => deleteAccount.mutate()}
          accessibilityHint={
            isConfirmed
              ? 'Permanently deletes your account and all of your data. This cannot be undone.'
              : `Disabled until you type ${DELETE_CONFIRMATION_WORD} in the field above.`
          }
          testID="account-delete"
        />
      </VStack>
    </Card>
  );
}
