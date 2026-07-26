/**
 * Honest placeholder for a screen region whose behaviour arrives in a later
 * phase.
 *
 * Phase 1 builds navigation and structure; the data and interactions land in
 * Phases 2-6. Rather than shipping fake numbers that look real, each unfinished
 * region says plainly what it will do and which phase delivers it. Nothing here
 * is ever mistakable for a live reward figure.
 */
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Text } from './ui/Text';
import { VStack } from './ui/Stack';

export interface PlaceholderSectionProps {
  readonly title: string;
  readonly description: string;
  /** e.g. `'Phase 4'`. */
  readonly phase: string;
  readonly testID?: string;
}

export function PlaceholderSection({
  title,
  description,
  phase,
  testID,
}: PlaceholderSectionProps) {
  return (
    <Card testID={testID} accessibilityLabel={`${title}. ${description} Arriving in ${phase}.`}>
      <VStack gap="sm">
        <Badge label={`${phase} — not built yet`} tone="neutral" />
        <Text variant="title3">{title}</Text>
        <Text variant="callout" tone="secondary">
          {description}
        </Text>
      </VStack>
    </Card>
  );
}
