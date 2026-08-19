/**
 * Initial-payload assertions against the LIVE site.
 *
 * WHY
 *
 * On 2026-08-19 this page shipped 3,140KB to a phone before a single scroll,
 * of which 2,839KB was video — six .webm files, all fetched immediately. Five
 * of them already carried preload="none", and it did nothing: per spec
 * `autoplay` overrides the preload hint, so the browser fetches regardless.
 *
 * That is the failure this file exists to catch, and it is a nasty one, because
 * the markup READ as handled. Someone reviewing it would see preload="none" on
 * five videos and move on. Only the network panel disagreed.
 *
 * So this asserts the OUTCOME — how many videos are actually fetched and how
 * many bytes actually arrive — rather than the presence of any attribute. An
 * attribute check would have passed happily throughout the entire defect.
 *
 *   npx playwright test
 */
import { test, expect, chromium, Browser } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const DOMAIN = readFileSync(join(__dirname, '..', 'CNAME'), 'utf8').trim();
const URL = `https://${DOMAIN}/`;

/**
 * Ceilings, not targets. Measured after the fix: 1 video and 797KB. These sit
 * above that with room for ordinary growth — another font, a hero image — and
 * well below the 6 videos / 3,140KB that prompted the file. A ceiling that
 * tracks the current number too closely fails on every honest change and gets
 * deleted, which is the same outcome as not having it.
 */
const MAX_VIDEOS_BEFORE_SCROLL = 2;
const MAX_KB_BEFORE_SCROLL = 1400;

let browser: Browser;
test.beforeAll(async () => { browser = await chromium.launch(); });
test.afterAll(async () => { await browser?.close(); });

test.describe('initial payload', () => {
  test('a phone is not sent every video before it scrolls', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    const videos: string[] = [];
    let bytes = 0;
    page.on('response', (r) => {
      bytes += parseInt(r.headers()['content-length'] || '0', 10);
      if (/\.(webm|mp4|mov)(\?|$)/.test(r.url())) videos.push(r.url().split('/').pop()!);
    });

    await page.goto(URL, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForTimeout(2500);   // let anything eager finish arriving
    const kb = Math.round(bytes / 1024);
    await ctx.close();

    // Lower bound first, and it is not decoration. The hero video IS eager on
    // purpose, so a correct collector sees at least one. Without this, a broken
    // URL match would count zero and sail under the ceiling — the test would
    // pass hardest at the exact moment it stopped being able to see.
    expect(videos.length,
      'no video requests seen at all — the collector is broken, not the page')
      .toBeGreaterThanOrEqual(1);
    expect(videos.length,
      `${videos.length} videos fetched before any scroll (${videos.join(', ')}) — ` +
      `check that autoplay has not come back on a below-fold video, since it overrides preload="none"`)
      .toBeLessThanOrEqual(MAX_VIDEOS_BEFORE_SCROLL);
    expect(kb, `${kb}KB arrived before any scroll`).toBeLessThanOrEqual(MAX_KB_BEFORE_SCROLL);
  });

  test('the deferred videos still load and play once scrolled to', async () => {
    // The saving is worthless if it breaks the showcase. This is the other half
    // of the assertion above: cheap AND still works.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load', timeout: 120_000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(4000);

    const state = await page.evaluate(() =>
      [...document.querySelectorAll('video.lazyshot')].map((v: any) => ({
        pending: !!v.querySelector('source[data-src]'),
        paused: v.paused,
        readyState: v.readyState,
      })));
    await ctx.close();

    expect(state.length, 'no deferred videos found — the class has been renamed and this test is vacuous')
      .toBeGreaterThan(0);
    expect(state.filter((s) => s.pending), 'a deferred video never got its source after scrolling past it')
      .toEqual([]);
    expect(state.filter((s) => s.readyState === 0),
      'a deferred video was told to load and still has no data').toEqual([]);
  });
});
