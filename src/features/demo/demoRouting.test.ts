/**
 * In demo mode, nothing reaches the database.
 *
 * This is the invariant the published preview rests on. The preview is built with
 * `EXPO_PUBLIC_DEMO_MODE=true` and points at a placeholder Supabase URL that resolves to
 * nothing, so a read that slipped past its demo branch would not fail fast — it would
 * hang until the request timed out, and the screen would sit on a spinner. That is
 * exactly the defect that hid the first broken submit button.
 *
 * `getSupabaseClient` is replaced with a function that throws, so any unguarded read is
 * a loud failure here rather than a quiet hang in a browser.
 */
import { resetEnvCache } from '@/config/env';

const REACHED_DATABASE = 'a demo-mode read reached the Supabase client';

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => {
    throw new Error(REACHED_DATABASE);
  },
  resetSupabaseClient: jest.fn(),
}));

import { getCardProduct } from '@/features/catalog/api/catalog';
import { listRuleProvenance } from '@/features/provenance/api/provenance';
import {
  listMerchantsForClassification,
  listRecentRecommendations,
} from '@/features/recommendations/api/recommendations';
import { loadWalletSnapshot } from '@/features/recommendations/api/snapshot';
import { getUserCard, listUserCards } from '@/features/wallet/api/wallet';

import { DEMO_CARDS } from './demoCatalog';
import { resetDemoStore } from './demoStore';

beforeEach(() => {
  process.env['EXPO_PUBLIC_DEMO_MODE'] = 'true';
  resetEnvCache();
  resetDemoStore();
});

afterEach(() => {
  delete process.env['EXPO_PUBLIC_DEMO_MODE'];
  resetEnvCache();
});

const FIRST_CARD = DEMO_CARDS[0];

describe('every read the demo preview makes is served locally', () => {
  it('lists the wallet', async () => {
    await expect(listUserCards()).resolves.toHaveLength(DEMO_CARDS.length);
  });

  it('opens one card', async () => {
    const card = await getUserCard(FIRST_CARD?.userCardId ?? '');
    expect(card.productName).toBe(FIRST_CARD?.displayName);
  });

  it('opens that card’s product, rates and all', async () => {
    const product = await getCardProduct(FIRST_CARD?.cardProductId ?? '');
    expect(product.rules.length).toBeGreaterThan(0);
  });

  it('shows where the rates came from', async () => {
    const ruleIds = (FIRST_CARD?.rules ?? []).map((rule) => rule.id);
    const provenance = await listRuleProvenance(ruleIds);

    expect(provenance).toHaveLength(ruleIds.length);
    expect(provenance[0]?.source?.isFictional).toBe(true);
  });

  it('builds the engine’s input snapshot', async () => {
    const snapshot = await loadWalletSnapshot();
    expect(snapshot.cards).toHaveLength(DEMO_CARDS.length);
  });

  it('lists merchants for the classifier', async () => {
    await expect(listMerchantsForClassification('US')).resolves.not.toHaveLength(0);
  });

  it('lists recent recommendations, of which there are none until one is made', async () => {
    await expect(listRecentRecommendations(5)).resolves.toEqual([]);
  });
});

describe('a missing demo record fails as missing, not as a permissions problem', () => {
  // The refusing Supabase client reports `forbidden`, which would be the wrong
  // diagnosis for an id that simply is not in the demo wallet.
  it('reports an unknown card as not found', async () => {
    await expect(getUserCard('no-such-card')).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('reports an unknown card product as not found', async () => {
    await expect(getCardProduct('no-such-product')).rejects.toMatchObject({
      kind: 'not_found',
    });
  });
});

describe('with demo mode off, the same reads do go to the database', () => {
  // The negative control. Without this, every test above would still pass if
  // `isDemoMode()` were hard-wired to true, and the guard would be worthless.
  beforeEach(() => {
    delete process.env['EXPO_PUBLIC_DEMO_MODE'];
    resetEnvCache();
  });

  it('reaches for the client when listing the wallet', async () => {
    await expect(listUserCards()).rejects.toThrow(REACHED_DATABASE);
  });

  it('reaches for the client when reading provenance', async () => {
    await expect(listRuleProvenance(['rule-1'])).rejects.toThrow(REACHED_DATABASE);
  });

  it('reaches for the client when reading a card product', async () => {
    await expect(getCardProduct('product-1')).rejects.toThrow(REACHED_DATABASE);
  });
});
