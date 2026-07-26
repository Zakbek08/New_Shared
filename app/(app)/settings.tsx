/**
 * Screen 14 — Settings.
 *
 * Appearance control is real in Phase 1, because dark mode is a Phase 1
 * deliverable. Data export and account deletion arrived in Phase 7; everything
 * else routes to its own screen.
 */
import { useRouter } from 'expo-router';

import { ErrorNotice } from '@/components/StateViews';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { DataExportCard } from '@/features/account/ui/DataExportCard';
import { DeleteAccountCard } from '@/features/account/ui/DeleteAccountCard';
import { useProfile, useSignOut } from '@/features/auth/hooks';
import { useThemePreference, type ThemePreference } from '@/theme/ThemeProvider';

const APPEARANCE_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { preference, setPreference } = useThemePreference();
  const profile = useProfile();
  const signOut = useSignOut();

  return (
    <Screen scroll accessibilityLabel="Settings" testID="settings-screen">
      <VStack gap="xl">
        <VStack gap="xs">
          <Text variant="title1" accessibilityRole="header">
            Settings
          </Text>
          {profile.data?.email !== null && profile.data?.email !== undefined ? (
            <Text variant="callout" tone="secondary">
              Signed in as {profile.data.email}
            </Text>
          ) : null}
        </VStack>

        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Appearance
            </Text>
            <HStack gap="sm" wrap>
              {APPEARANCE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  label={option.label}
                  variant={preference === option.value ? 'primary' : 'ghost'}
                  onPress={() => setPreference(option.value)}
                  accessibilityHint={`Use the ${option.label.toLowerCase()} appearance`}
                  testID={`appearance-${option.value}`}
                />
              ))}
            </HStack>
            <Text variant="footnote" tone="tertiary">
              Text size follows your device setting everywhere in WalletWise.
            </Text>
          </VStack>
        </Card>

        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Rewards
            </Text>
            <Text variant="callout" tone="secondary">
              Set what a point or a mile is worth to you. Every recommendation uses your
              numbers, not ours.
            </Text>
            <Button
              label="Reward preferences"
              variant="secondary"
              fullWidth
              onPress={() => router.push('/preferences/rewards')}
              accessibilityHint="Opens reward preferences"
              testID="settings-preferences"
            />
          </VStack>
        </Card>

        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Privacy
            </Text>
            <Button
              label="Privacy and disclosures"
              variant="secondary"
              fullWidth
              onPress={() => router.push('/legal/disclosures')}
              accessibilityHint="Opens privacy and disclosures"
              testID="settings-disclosures"
            />
            <Button
              label="Card catalog administration"
              variant="ghost"
              fullWidth
              onPress={() => router.push('/admin/catalog')}
              accessibilityHint="Opens the administrative card catalog. Requires the catalog editor role."
              testID="settings-admin"
            />
          </VStack>
        </Card>

        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Account
            </Text>
            {signOut.isError ? (
              <ErrorNotice error={signOut.error} testID="settings-signout-error" />
            ) : null}
            <Button
              label="Sign out"
              variant="secondary"
              fullWidth
              loading={signOut.isPending}
              onPress={() => signOut.mutate()}
              accessibilityHint="Signs you out on this device"
              testID="settings-sign-out"
            />
            <Text variant="footnote" tone="tertiary">
              Signing out clears the cached copy of your wallet from this device. The encryption
              key for your stored card digits is kept, so they still work when you sign back in
              here.
            </Text>
          </VStack>
        </Card>

        <DataExportCard />

        <DeleteAccountCard />
      </VStack>
    </Screen>
  );
}
