import { test, expect, chromium } from '@playwright/test';

/* AN UNDEFINED CSS VARIABLE FAILS SILENTLY, AND HAS TWICE.
 *
 * `color: var(--ink-1)` where --ink-1 does not exist does not error, does not
 * log, and does not fall back — the whole declaration is invalid, so the element
 * INHERITS. That painted white text on white in seven rules, three of them live
 * for weeks, and every check passed because none of them read the words.
 *
 * The second instance found by this check: `font-family: var(--display)` in
 * assets/pages.css, where --display is declared only inside index.html's inline
 * style. Every sub-page rendered the brand name in the system font while the
 * homepage rendered it in Space Grotesk.
 *
 * So this checks the CAUSE rather than either symptom: every var(--x) USED
 * against every --x DEFINED, in the stylesheets the browser actually resolved.
 * A var() carrying a fallback — var(--x, something) — still paints and is not a
 * defect, so it is excluded rather than reported.
 */
const PAGES = ['/', '/about.html', '/services/seo-grand-rapids.html',
               '/articles/', '/case-studies/', '/examples/roofing/'];

test('no page uses a CSS variable nothing defines', async () => {
  const browser = await chromium.launch();
  const broken: string[] = [];

  for (const path of PAGES) {
    const page = await browser.newPage();
    await page.goto(`https://builtbykerr.com${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    const missing = await page.evaluate(() => {
      /* Read the RESOLVED stylesheets, not the HTML source. A rule that arrives
         from an external file is exactly the case the source would miss, and it
         is the case that actually broke. */
      const css = [...document.styleSheets].flatMap(s => {
        try { return [...s.cssRules].map(r => r.cssText); } catch { return []; }
      }).join('\n');
      const defined = new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m => m[1]));
      const used = new Set([...css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map(m => m[1]));
      const hasFallback = new Set([...css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*,/g)].map(m => m[1]));
      return [...used].filter(v => !defined.has(v) && !hasFallback.has(v));
    });

    missing.forEach(v => broken.push(`${path} uses ${v}, which nothing defines`));
    await page.close();
  }

  await browser.close();
  expect(broken,
    'an undefined custom property makes its whole declaration invalid, so the ' +
    'element inherits instead. Nothing throws and the layout looks correct.'
  ).toEqual([]);
});
