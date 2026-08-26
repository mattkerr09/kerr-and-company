/**
 * Mobile layout assertions against the LIVE site.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 *
 * live-site.spec.ts deliberately runs without a browser — content and contract
 * assertions through APIRequestContext, because "a slow gate gets skipped, and
 * a skipped gate is the same as no gate". That reasoning still holds and this
 * file does not change it.
 *
 * But it means the suite could never see LAYOUT, and on 2026-08-19 that cost
 * something real: the six shipwall product links rendered 17px tall on a 390px
 * viewport — under WCAG 2.5.8 Target Size (Minimum), AA, which asks for 24x24
 * CSS px. They are a list of links rather than links inline in a sentence, so
 * the inline exception did not cover them. Nothing in the suite could have
 * caught it, because nothing in the suite had a layout engine. It was found by
 * auditing the live site by hand at 390px, which is not a gate.
 *
 * The cost objection was measured rather than assumed: chromium launches from
 * this repo in 197ms. One page load, every assertion read from it.
 *
 * DO NOT MEASURE THIS SITE WITH A fullPage SCREENSHOT.
 *
 * The reveals are deliberately TWO-WAY — the observer calls
 * toggle('in', isIntersecting), so an element hides again once it leaves the
 * viewport. Matthew asked for that specifically, to match outlier.host. It means
 * a fullPage capture comes back almost entirely empty: everything below the fold
 * is opacity 0 at the moment the shot is taken, and scrolling to the bottom
 * first does not help, because scrolling back up re-hides it.
 *
 * I lost a capture to this and read a solid black image as a broken page. The
 * honest way to look at this site is viewport by viewport — scroll to each
 * position, wait ~2.6s for the reveal to settle, then shoot. Anything reading
 * only the BACKGROUND (seams, band colours) is still fine on a fullPage shot,
 * because the ground paints regardless of the reveals.
 *
 *   npx playwright test
 */
import { test, expect, chromium, Browser, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/** Same rule as live-site.spec.ts: the domain is READ, never typed. */
const DOMAIN = readFileSync(join(__dirname, '..', 'CNAME'), 'utf8').trim();
const URL = `https://${DOMAIN}/`;

/** iPhone-class viewport. 390 is the common small-phone width in 2026. */
const VIEWPORT = { width: 390, height: 844 };

/**
 * WCAG 2.5.8 exempts a target "in a sentence or block of text". Read that
 * narrowly: a link is exempt only when its parent holds meaningfully more text
 * than the link itself, which is what "in a sentence" means. A <li> containing
 * nothing but one link is a list of targets, not a sentence.
 */
const TARGET_MIN = 24;

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  // Scroll the whole page once so every IntersectionObserver reveal has fired
  // and every element has its final size. Measuring before the reveals settle
  // reads transform/blur mid-animation as layout, which it is not.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
});

test.afterAll(async () => { await browser?.close(); });

/** Collect undersized interactive targets from whatever page is passed in. */
const undersized = (p: Page, min: number) => p.evaluate((MIN) => {
  const bad: string[] = [];
  document.querySelectorAll('a[href], button, [role=button], input, select, summary').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (!(e as any).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) return;
    if (r.height >= MIN && r.width >= MIN) return;
    const par = e.parentElement;
    const own = (e.textContent || '').trim().length;
    const inlineExempt = !!par && /^(p|li|span|td|h[1-6])$/i.test(par.tagName)
      && (par.textContent || '').trim().length > own + 12;
    if (inlineExempt) return;
    const label = (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30);
    bad.push(`${label} — ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  return bad;
}, min);

test.describe('mobile layout', () => {
  test('the page never scrolls horizontally at 390px', async () => {
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      // Report WHAT is wide, not just that something is — a bare boolean here
      // sends the next person hunting through 130KB of stylesheet.
      const wide: string[] = [];
      document.querySelectorAll('body *').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width <= d.clientWidth + 1) return;
        // A wide element inside its own scroll container is deliberate, not a
        // defect — the comparison table is 745px inside a 340px cmp-wrap that
        // carries overflow-x:auto. An earlier sweep of mine flagged it as
        // broken because it checked the element's own overflow, not its
        // scroll container's.
        let n: Element | null = e.parentElement;
        for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return;
        }
        wide.push(`${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : '')} ${Math.round(r.width)}px`);
      });
      return { scrolls: d.scrollWidth > d.clientWidth + 1, wide: [...new Set(wide)].slice(0, 6) };
    });
    expect(overflow.wide, 'an element is wider than the viewport and is not in a scroll container').toEqual([]);
    expect(overflow.scrolls, 'the page scrolls sideways on a phone').toBe(false);
  });

  test('every interactive target clears the WCAG 2.5.8 minimum', async () => {
    expect(await undersized(page, TARGET_MIN),
      'a target is under 24x24 CSS px and is not inline in a sentence').toEqual([]);
  });

  /**
   * The detector must still detect.
   *
   * Same lesson as live-site.spec.ts's forbidden-claim meta-test: a check that
   * has only ever returned zero is indistinguishable from a check that cannot
   * see. This plants a 14x14 link on a throwaway page and requires the same
   * collector to catch it. If this test ever passes while the one above passes
   * for the wrong reason, the pair disagrees and someone looks.
   */
  test('the target-size detector catches a planted undersized link', async () => {
    const scratch = await browser.newPage({ viewport: VIEWPORT });
    await scratch.setContent(
      `<div><a href="#" style="display:inline-block;width:14px;height:14px;font-size:9px">x</a></div>`);
    const caught = await undersized(scratch, TARGET_MIN);
    await scratch.close();
    expect(caught, 'the collector cannot see an obviously undersized target').toContain('x — 14x14');
  });
});

/* ⚠️ A CLIPPED ELEMENT DOES NOT SCROLL SIDEWAYS.
 *
 * The header's "Contact" button — the primary CTA above the fold — was rendering
 * 19px past the right edge on an iPhone SE and 4px past on an iPhone 14, and
 * every check on this page said the layout was fine. `body{overflow-x:hidden}`
 * makes scrollWidth == clientWidth, so the sideways-scroll assertion that guards
 * the rest of this file cannot see it: the guard converts a visible overflow into
 * an invisible amputation, with no scrollbar left to reveal what was cut.
 *
 * It also survived because 412px (Pixel) fits. Testing one Android width and a
 * desktop width and calling it covered is how a bug lives on the two most common
 * phone sizes in the US.
 *
 * So this measures the ELEMENT against the viewport, which is the only thing that
 * can catch it, and does it at the widths where it actually broke.
 */
for (const [label, width] of [['320px', 320], ['iPhone SE', 375], ['iPhone 14', 390], ['Pixel', 412]] as const) {
  test(`the header CTA is fully on screen at ${label}`, async ({ browser }) => {
    const page = await browser.newPage({
      viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    await page.goto(`https://${DOMAIN}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const cta = [...document.querySelectorAll('header a, nav a')]
        .find(a => /contact/i.test((a as HTMLElement).innerText));
      if (!cta) return null;
      const b = cta.getBoundingClientRect();
      return { vw, left: Math.round(b.left), right: Math.round(b.right), height: Math.round(b.height) };
    });
    await page.close();

    expect(r, 'a Contact control must exist in the header').not.toBeNull();
    expect(r!.right, `Contact ends at ${r!.right} against a ${r!.vw}px viewport`)
      .toBeLessThanOrEqual(r!.vw);
    expect(r!.left, 'Contact must not start off the left edge either').toBeGreaterThanOrEqual(0);
    expect(r!.height, 'the primary header CTA must be a 44px tap target')
      .toBeGreaterThanOrEqual(44);
  });
}
