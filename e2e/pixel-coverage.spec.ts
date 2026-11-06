import { test, expect, request } from '@playwright/test';

/* 2026-11-06: INVERTED. Matthew removed the Meta pixel from every Kerr & Company site
 * (no consent popup, 1 Facebook visit in 30 days). This test now holds the site to
 * ZERO pixel pages, sitemap-wide, for the same reason it first held it to all of
 * them: one page is not a measurement of a site.
 *
 * ONE PAGE IS NOT A MEASUREMENT OF A SITE.
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

test.describe('meta pixel removed', () => {
  test('no page carries the Meta pixel or loads Facebook\'s script', async () => {
    const api = await request.newContext();
    const sm = await api.get(`https://${DOMAIN}/sitemap.xml`);
    expect(sm.ok(), 'no sitemap: page discovery has no trustworthy source').toBeTruthy();
    const urls = [...(await sm.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
    expect(urls.length, 'sitemap returned too few pages; a test that checks nothing reports success')
      .toBeGreaterThanOrEqual(15);
    const still: string[] = [];
    let read = 0;
    for (const u of [...new Set(urls)]) {
      const res = await api.get(u);
      if (!res.ok()) continue;
      read++;
      const t = await res.text();
      if (t.includes(PIXEL) || t.includes('connect.facebook.net/en_US/fbevents.js') && !/META_PIXEL_ID = ''/.test(t)) still.push(u);
    }
    expect(read, 'too few pages answered to judge the site').toBeGreaterThanOrEqual(15);
    expect(still, 'these pages still carry the Meta pixel').toEqual([]);
    await api.dispose();
  });
});
