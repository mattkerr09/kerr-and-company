import { test, expect } from '@playwright/test';

/* WHAT I TOLD MATTHEW IS ON THE PAGE, CHECKED ON THE PAGE.
 *
 * Standing instruction, 2026-08-26: "double check the live site always."
 *
 * The prompt for it was cheap — I reported four rewritten price lines as done
 * immediately after pushing, without confirming they had deployed. They had.
 * That was luck, not method.
 *
 * The suite already runs against the live URL, and still passed while text was
 * painted white-on-white and the brand font was wrong on every sub-page — because
 * every check tested MECHANISM (does it load, does it link, does it fire) and
 * none tested CLAIMS (does it say the thing I said it says).
 *
 * So this asserts the commercial promises, in the words a customer reads. When a
 * price or a term changes, this fails and has to be updated deliberately — which
 * is the point: a claim nobody has to re-approve is a claim that goes stale
 * silently, which is the defect this file exists to stop.
 */
const PRICES: [string, string][] = [
  ['Site & Business Audit', '$750'],
  ['Starter Site',          '$999'],
  ['Business Site',         '$2,499'],
  ['Growth Site + Tool',    '$4,999'],
  ['Care Plan',             '$199'],
];

test.describe('the live page says what we say it says', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://builtbykerr.com/', { waitUntil: 'networkidle' });
  });

  test('every service shows its price', async ({ page }) => {
    for (const [name, price] of PRICES) {
      const card = page.locator('.pkg', { hasText: name }).first();
      await expect(card.locator('.price'), `${name} price`).toContainText(price);
    }
  });

  test('the payment option sits ON the price, not under it as subtext', async ({ page }) => {
    /* Matthew: "all bnpl numbers need to be right next to the price and not below
       in subtext… and say its theirs forever". The earlier version put it in a
       dimmer, smaller line beneath — which is subtext, and subtext is skipped. */
    const alts = page.locator('.pkg .pkg-alt');
    await expect(alts, 'cards carrying a payment line').toHaveCount(4);

    const texts = await alts.allInnerTexts();
    for (const t of texts) {
      expect(t, `"${t.slice(0, 60)}" must end in ownership — "$149/mo" without ` +
        `"then it stops" reads as a subscription`).toMatch(/yours|keep/i);
    }
    expect(texts.join(' '), 'the monthly alternative must appear beside a price')
      .toMatch(/\$149\/mo for 12 months/);

    /* The superseded pattern must not come back alongside the new one. */
    await expect(page.locator('.pkg-split'), 'the old subtext line').toHaveCount(0);
  });

  test('the stop-paying term is stated where the commitment is made', async ({ page }) => {
    /* It lived only in a comparison table two sections from the band that asks
       for $1,788. The clause most likely to be disputed is the one nobody saw. */
    await expect(page.locator('.ownit-points')).toContainText('the site comes down');
    await expect(page.locator('.ownit-points')).toContainText('90 days');
  });

  test('the hero asks for the same thing the process sells', async ({ page }) => {
    await expect(page.locator('.hero-actions .btn-primary')).toContainText('20-minute call');
  });

  test('the example builds are listed and reachable', async ({ page, request }) => {
    const names = page.locator('.ex strong');
    await expect(names).toHaveCount(3);
    for (const href of ['/examples/roofing/', '/examples/restaurant/', '/examples/salon/']) {
      const res = await request.get(`https://builtbykerr.com${href}`);
      expect(res.status(), `${href} must serve`).toBe(200);
      const body = await res.text();
      expect(body, `${href} must declare itself a demonstration, not a client`)
        .toMatch(/demonstration build/i);
      expect(body, `${href} must not be indexable as a real company`)
        .toMatch(/noindex/);
    }
  });
});
