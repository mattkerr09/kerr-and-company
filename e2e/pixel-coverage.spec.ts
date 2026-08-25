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
    const home = await (await api.get(`https://${DOMAIN}/`)).text();

    const paths = [...new Set([...home.matchAll(/href="(\/[^"#?]*)"/g)].map(m => m[1]))]
      .filter(p => p.endsWith('.html') || p.endsWith('/'));
    const urls = [`https://${DOMAIN}/`, ...paths.map(p => `https://${DOMAIN}${p}`)];

    expect(urls.length, 'discovered too few pages — the nav scrape probably broke, ' +
      'and a test that checks nothing passes').toBeGreaterThan(8);

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
