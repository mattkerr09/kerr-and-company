import { test, expect, request } from '@playwright/test';

/* ONE PAGE IS NOT A MEASUREMENT OF A SITE.
 *
 * On 2026-08-25 the Meta pixel was on 1 page of 19. The 18 without it were the
 * six service pages, the six articles, the case studies and /about — i.e. every
 * page an ad would actually land on. A visitor arriving on
 * /services/seo-grand-rapids.html was invisible to Meta: no conversion, no
 * retargeting audience, and a campaign optimising toward a signal that never
 * arrives.
 *
 * It survived because every check we had looked at the homepage. The homepage
 * was correct the entire time, so every instrument agreed and all of them were
 * answering a narrower question than the one that mattered.
 *
 * This test asks the site-wide question. It discovers pages from the live nav
 * rather than a hardcoded list, so a page added next month is covered without
 * anyone remembering to add it here — a fixed list would have the same blind
 * spot as checking one page, just further out.
 */
const DOMAIN = 'builtbykerr.com';
const PIXEL = '28202025336060922';

/* Legal pages are deliberately EXEMPT, not forgotten. They are where someone
   goes to find out what is tracked, they sit in no ad's conversion path, and
   tracking a reader of the tracking policy buys data nobody needs. The test
   asserts they stay clean, so "exempt" cannot quietly become "missed". */
const NO_PIXEL = /\/legal\//;

test.describe('meta pixel coverage', () => {
  test('every commercial page carries the pixel, and legal pages do not', async () => {
    const api = await request.newContext();

    /* THE SITEMAP, NOT THE NAV — and the first version of this test got it wrong.
     *
     * Scraping the homepage's links finds 15 pages. The sitemap lists 19. The six
     * article pages are reachable only from /articles/, so a nav scrape never sees
     * them, and this test would have passed while six pages quietly lost their
     * pixel. That is the identical blind spot the test exists to close, rebuilt
     * inside the test — one source, believed because it was convenient.
     *
     * The sitemap is what we tell Google the site IS, so it is the right list to
     * hold ourselves to: a page good enough to submit for indexing is a page good
     * enough to measure. If the two ever disagree, the sitemap is the claim. */
    const sm = await api.get(`https://${DOMAIN}/sitemap.xml`);
    expect(sm.ok(), 'no sitemap — page discovery has no trustworthy source').toBeTruthy();
    const urls = [...(await sm.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());

    /* A floor tied to the real figure. An empty or truncated sitemap would
       otherwise make this test pass by checking nothing, which is the failure
       mode that looks most like success. */
    expect(urls.length, 'sitemap returned too few pages — a test that checks ' +
      'nothing reports success').toBeGreaterThanOrEqual(15);

    const missing: string[] = [];
    const unexpected: string[] = [];
    for (const u of [...new Set(urls)]) {
      const res = await api.get(u);
      if (!res.ok()) continue;
      const has = (await res.text()).includes(PIXEL);
      if (NO_PIXEL.test(u)) { if (has) unexpected.push(u); }
      else if (!has) missing.push(u);
    }

    expect(missing,
      'these pages have NO Meta pixel. An ad landing here records no conversion ' +
      'and builds no retargeting audience.').toEqual([]);
    expect(unexpected,
      'the pixel reached a legal page — those are exempt on purpose.').toEqual([]);
    await api.dispose();
  });
});
