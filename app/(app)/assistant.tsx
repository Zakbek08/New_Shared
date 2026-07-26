/**
 * Screen 8 — Purchase Assistant.
 *
 * The purchase-intent form. Phase 1 renders the real quick-category buttons from
 * the shared taxonomy and documents every field; Phase 4 wires React Hook Form
 * against `purchaseIntentSchema` and runs the engine.
 *
 * WalletWise never initiates a payment. Submitting this form asks a question.
 */
import { useState } from 'react';
import { Pressable } from 'react-native';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { PlaceholderSection } from '@/components/PlaceholderSection';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { CATEGORIES, type CategorySlug } from '@/domain/categories';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

function CategoryChip({
  slug,
  label,
  hint,
  selected,
  onPress,
}: {
  readonly slug: CategorySlug;
  readonly label: string;
  readonly hint: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={`category-chip-${slug}`}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected
          ? theme.colors.primarySubtle
          : pressed
            ? theme.colors.surfaceSunken
            : theme.colors.surface,
      })}
    >
      <Text
        variant="label"
        style={{
          color: selected ? theme.colors.onPrimarySubtle : theme.colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function PurchaseAssistantScreen() {
  const [selected, setSelected] = useState<CategorySlug | null>(null);

  return (
    <Screen scroll accessibilityLabel="Purchase assistant" testID="assistant-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            What are you buying?
          </Text>
          <Text variant="body" tone="secondary">
            WalletWise compares every eligible card in your wallet and shows you the estimated
            value of each. It does not pay for anything.
          </Text>
        </VStack>

        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Quick category
            </Text>
            <Text variant="callout" tone="secondary">
              Choosing a category yourself is the most reliable option — it removes the
              guesswork from how a merchant is coded.
            </Text>
            <HStack gap="sm" wrap align="flex-start">
              {CATEGORIES.map((category) => (
                <CategoryChip
                  key={category.slug}
                  slug={category.slug}
                  label={category.displayName}
                  hint={category.accessibilityHint}
                  selected={selected === category.slug}
                  onPress={() =>
                    setSelected((current) => (current === category.slug ? null : category.slug))
                  }
                />
              ))}
            </HStack>
          </VStack>
        </Card>

        <PlaceholderSection
          phase="Phase 4"
          title="Purchase details"
          description="Merchant name, amount in US dollars, category, online or in store, country, currency, payment method and optional notes — validated with the Zod purchase schema."
          testID="assistant-form"
        />

        <PlaceholderSection
          phase="Phase 4"
          title="Describe it in your own words"
          description="Optional free-text entry. A language model turns 'coffee at the airport, tapped my phone, twelve dollars' into structured fields. It never calculates or invents a reward rate."
          testID="assistant-natural-language"
        />

        <DisclaimerNotice kind="merchant_category" />
        <DisclaimerNotice kind="no_payment" />
      </VStack>
    </Screen>
  );
}
