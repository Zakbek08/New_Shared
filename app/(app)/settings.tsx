/**
 * Screen 14 — Settings.
 *
 * Appearance control is real in Phase 1, because dark mode is a Phase 1
 * deliverable. The rest routes to its own screen or names its phase.
 */
import { useRouter } from 'expo-router';

import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { useThemePreference, type ThemePreference } from '@/theme/ThemeProvider';

const APPEARANCE_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { preference, setPreference } = useThemePreference();

  return (
    <Screen scroll accessibilityLabel="Settings" testID="settings-screen">
      <VStack gap="xl">
        <Text variant="title1" accessibilityRole="header">
          Settings
        </Text>

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

        <PlaceholderSection
          phase="Phase 2"
          title="Account"
          description="Change password, sign out, export your data and delete your account. Deleting the account removes every row you own by database cascade."
          testID="settings-account"
        />
      </VStack>
    </Screen>
  );
}
