/**
 * The demo card product.
 *
 * `demoCardProduct` exists so the card-details screen works in the published preview,
 * where there is no database. The risk it carries is subtle: it converts the engine's
 * rule records into the row shape the screen reads, and a conversion is a place where a
 * number can quietly change. So every field is compared against the rule it came from,
 * and the headline and verification status are required to match what the shared
 * summary functions produce for the database path — because a demo that summarised a
 * card differently from production would be demonstrating the wrong app.
 */
import { headlineRuleLabel, weakestVerification } from '@/domain/catalog/summary';

import { DEMO_CARDS } from './demoCatalog';
import { DEMO_SOURCE } from './demoProvenance';
import { demoCardProduct } from './demoStore';

describe('demoCardProduct', () => {
  it('refuses an id that is not in the demo catalog, as not found', () => {
    expect(() => demoCardProduct('not-a-demo-product')).toThrow(
      /not in the demonstration catalog/,
    );
  });

  it.each(DEMO_CARDS.map((card) => [card.displayName, card.cardProductId]))(
    'describes %s',
    (displayName, cardProductId) => {
      const product = demoCardProduct(cardProductId);

      expect(product.id).toBe(cardProductId);
      expect(product.name).toBe(displayName);
      // Fictional and marked as such, on every card, on every screen.
      expect(product.isFictional).toBe(true);
    },
  );

  it('copies every rate straight off the rule, with nothing derived', () => {
    for (const card of DEMO_CARDS) {
      const product = demoCardProduct(card.cardProductId);

      for (const rule of card.rules) {
        const row = product.rules.find((candidate) => candidate.id === rule.id);

        expect(row?.base_rate).toBe(rule.baseRate);
        expect(row?.bonus_rate).toBe(rule.bonusRate);
        expect(row?.cap_amount).toBe(rule.capAmount);
        expect(row?.cap_period).toBe(rule.capPeriod);
        expect(row?.post_cap_rate).toBe(rule.postCapRate);
        expect(row?.reward_type).toBe(rule.rewardType);
        expect(row?.label).toBe(rule.label);
      }
    }
  });

  it('cites the one demo source on every rule, so the provenance screen has something to show', () => {
    for (const card of DEMO_CARDS) {
      for (const row of demoCardProduct(card.cardProductId).rules) {
        expect(row.source_id).toBe(DEMO_SOURCE.id);
      }
    }
  });

  // A fabricated activation link would send a user to a page that does not exist. The
  // same reasoning as the null source URL in demoProvenance.ts.
  it('invents no enrollment URL', () => {
    for (const card of DEMO_CARDS) {
      for (const row of demoCardProduct(card.cardProductId).rules) {
        expect(row.enrollment_url).toBeNull();
      }
    }
  });

  it('orders rules by priority descending, as the database path does', () => {
    // The grocery card's bonus is priority 10 and its base rule 1000, so the base
    // rule sorts first — exactly as `getCardProduct` would return them.
    const product = demoCardProduct('demo-product-grocery');
    const priorities = product.rules.map((row) => row.priority);

    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
  });

  it('summarises through the same functions the database path uses', () => {
    for (const card of DEMO_CARDS) {
      const product = demoCardProduct(card.cardProductId);

      expect(product.headline).toBe(headlineRuleLabel(product.rules));
      expect(product.verificationStatus).toBe(weakestVerification(product.rules).status);
      expect(product.lastVerifiedAt).toBe(weakestVerification(product.rules).lastVerifiedAt);
    }
  });

  // Every demo rule pays cash back in dollars. Naming a points programme would imply a
  // valuation the demo has not got, which is the invented-number defect in another form.
  it('names no reward programme', () => {
    for (const card of DEMO_CARDS) {
      expect(demoCardProduct(card.cardProductId).rewardProgramName).toBeNull();
    }
  });
});
