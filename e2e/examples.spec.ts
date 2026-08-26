import { test, expect, chromium } from '@playwright/test';

/* THE DEMOS ARE THE PORTFOLIO. They are the only pages on this site that show a
 * local business owner what they are actually buying, so a broken one argues
 * against the studio more effectively than anything on the homepage argues for it.
 *
 * Checked on a PHONE first. The first version of these was verified only at
 * 1200px, and the restaurant's nav links were 29px tall — on the device most
 * people book a table from. Desktop-only verification found nothing wrong with a
 * page that was awkward to use for most of its audience.
 */
const SITE = 'https://builtbykerr.com';
const DEMOS = ['roofing', 'restaurant', 'salon'];
const PHONE = { width: 390, height: 844 };

for (const demo of DEMOS) {
  test(`the ${demo} demo works on a phone and declares itself`, async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: PHONE, deviceScaleFactor: 2 });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`${SITE}/examples/${demo}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const r = await page.evaluate(() => {
      const de = document.documentElement;
      /* Tap targets, excluding links that sit inline inside a sentence —
         those are prose, not controls, and WCAG 2.5.8 exempts them. */
      const small = [...document.querySelectorAll('a[href],button,input,select,textarea')]
        .filter(e => { const b = e.getBoundingClientRect(); return b.height > 0 && b.height < 44; })
        .filter(e => {
          const p = e.parentElement, own = (e.textContent || '').trim().length;
          return !(p && /^(P|LI|SPAN|TD)$/.test(p.tagName) &&
                   (p.textContent || '').trim().length > own + 12);
        })
        .map(e => `"${(e.textContent || '').trim().slice(0, 20)}" ${Math.round(e.getBoundingClientRect().height)}px`);
      return {
        sideways: de.scrollWidth - de.clientWidth,
        small,
        declaresDemo: /demonstration build/i.test(document.body.innerText),
        saysFictional: /fictional|not a real/i.test(document.body.innerText),
        linksToPricing: !!document.querySelector('a[href="/#services"]'),
        noindex: !!document.querySelector('meta[name="robots"][content*="noindex"]'),
      };
    });

    await browser.close();

    expect(r.sideways, 'the page must not scroll sideways on a phone').toBeLessThanOrEqual(1);
    expect(r.small, 'tap targets under 44px').toEqual([]);
    expect(errors, 'JavaScript errors').toEqual([]);

    /* The honesty guarantees. These pages must never be mistaken for client work —
       naming a business we have not worked for would be inventing a client, and a
       prospect who discovers one unverifiable claim discards every other claim
       on the site with it. A test holds that better than an intention does. */
    expect(r.declaresDemo, 'must say it is a demonstration build').toBeTruthy();
    expect(r.saysFictional, 'must say the business is fictional').toBeTruthy();
    expect(r.noindex, 'must be noindex so it cannot rank as a real company').toBeTruthy();
    expect(r.linksToPricing, 'must link back to pricing — it is the reason it exists').toBeTruthy();
  });
}
