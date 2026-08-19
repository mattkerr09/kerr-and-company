/**
 * Accessibility assertions against the LIVE site.
 *
 * Both checks here passed on first run, which is exactly when an assertion is
 * least trustworthy — a check that has only ever returned zero is
 * indistinguishable from a check that cannot see. So each one plants a control
 * it MUST catch, in the same spirit as the forbidden-claim meta-test in
 * live-site.spec.ts. If a control ever stops being caught, that test fails
 * before the real one can pass vacuously.
 *
 * WHY THESE TWO
 *
 * This site leans hard on motion — three orbs drifting on 26s/32s/38s loops,
 * IntersectionObserver reveals with blur and transform on thirty elements, and
 * staggered children. That is a lot of surface for two specific failures:
 *
 *   1. Honouring prefers-reduced-motion by killing the TRANSITION while leaving
 *      the hidden initial state, which makes content permanently invisible to
 *      the people who asked for less motion. Verified by loading with reduce
 *      and NOT scrolling, so nothing depends on an observer having fired.
 *
 *   2. Killing focus outlines for looks. The site already passes, and it would
 *      be easy to lose that in a restyle without anyone noticing, because
 *      nobody tabs through a marketing page by hand twice.
 *
 *   npx playwright test
 */
import { test, expect, chromium, Browser } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const DOMAIN = readFileSync(join(__dirname, '..', 'CNAME'), 'utf8').trim();
const URL = `https://${DOMAIN}/`;

/** Everything that visibly distinguishes a focused control from an unfocused one. */
const FOCUS_SIGNATURE = `(c) => [c.outlineStyle, c.outlineWidth, c.outlineColor,
  c.boxShadow, c.borderColor, c.backgroundColor, c.textDecorationLine].join('|')`;

let browser: Browser;
test.beforeAll(async () => { browser = await chromium.launch(); });
test.afterAll(async () => { await browser?.close(); });

test.describe('accessibility', () => {
  test('prefers-reduced-motion stops the motion without hiding the content', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Deliberately NOT scrolling. Anything that needs an IntersectionObserver to
    // become visible is still hidden at this point if the reduced-motion block
    // only killed the transition and left opacity:0 / blur() in place.
    const state = await page.evaluate(() => {
      const reveals = [...document.querySelectorAll('.reveal, .rise, .stagger')];
      const hidden = reveals.filter((e) => {
        const c = getComputedStyle(e);
        return parseFloat(c.opacity) < 0.9 || /blur\((?!0)/.test(c.filter || '');
      }).map((e) => `${(e.textContent || '').trim().slice(0, 30)} — opacity ${getComputedStyle(e).opacity}`);
      const moving = [...document.querySelectorAll('.mesh > i')]
        .filter((e) => getComputedStyle(e).animationName !== 'none')
        .map((e) => getComputedStyle(e).animationName);
      return { total: reveals.length, hidden, moving };
    });
    await page.close();

    expect(state.total, 'no reveal elements found — the selector has drifted and this test is now vacuous')
      .toBeGreaterThan(10);
    expect(state.hidden, 'content is permanently invisible to anyone who asked for reduced motion')
      .toEqual([]);
    expect(state.moving, 'the background orbs still animate under prefers-reduced-motion')
      .toEqual([]);
  });

  test('every keyboard-focusable control visibly changes on focus', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // A control that MUST be caught: outline suppressed, but carrying a permanent
    // box-shadow. An earlier version of this check treated any box-shadow as a
    // focus indicator and passed this element, which is how a real one could
    // hide behind a decorative card shadow.
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = '#'; a.id = 'planted-no-focus-style'; a.textContent = 'planted';
      a.style.cssText = 'display:inline-block;padding:10px;box-shadow:0 2px 6px rgba(0,0,0,.3)';
      const s = document.createElement('style');
      s.textContent = '#planted-no-focus-style:focus,#planted-no-focus-style:focus-visible' +
        '{outline:none!important;box-shadow:0 2px 6px rgba(0,0,0,.3)!important}';
      document.head.appendChild(s);
      document.body.prepend(a);
    });

    const idOf = `(e) => e.id || (e.textContent || e.tagName).trim().slice(0, 24)`;
    const unfocused: Record<string, string> = await page.evaluate(
      ([sigFn, idFn]) => {
        const sig = eval(sigFn), id = eval(idFn), m: Record<string, string> = {};
        document.querySelectorAll('a[href],button,input,select,summary,[tabindex]')
          .forEach((e) => { m[id(e)] = sig(getComputedStyle(e)); });
        return m;
      }, [FOCUS_SIGNATURE, idOf]);

    const noChange: string[] = [];
    const seen = new Set<string>();
    // Real Tab presses, not .focus(): :focus-visible is only guaranteed for
    // keyboard focus, and that is the state a keyboard user is actually in.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(
        ([sigFn, idFn]) => {
          const e = document.activeElement as HTMLElement;
          if (!e || e === document.body) return null;
          const sig = eval(sigFn), id = eval(idFn);
          return { id: id(e), sig: sig(getComputedStyle(e)) };
        }, [FOCUS_SIGNATURE, idOf]);
      if (!f || seen.has(f.id)) continue;
      seen.add(f.id);
      if (unfocused[f.id] !== undefined && unfocused[f.id] === f.sig) noChange.push(f.id);
    }
    await page.close();

    expect(seen.size, 'tabbing reached almost nothing — this test would pass vacuously')
      .toBeGreaterThan(10);
    expect(noChange, 'the planted control was not caught, so this check cannot see a missing focus style')
      .toContain('planted-no-focus-style');
    expect(noChange.filter((id) => id !== 'planted-no-focus-style'),
      'a real control gives no visible feedback when focused by keyboard').toEqual([]);
  });
});
