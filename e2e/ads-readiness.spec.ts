import { test, expect, request } from '@playwright/test';

/**
 * ADS READINESS — the tracker and the policy must agree, in BOTH directions.
 *
 * WHY THIS EXISTS
 *
 * On 2026-08-13 this site's privacy policy said "if we add analytics in the
 * future, we will update this policy" while Plausible was already loading on
 * the homepage. A sentence describing an intention had quietly become a false
 * description of the present. Nobody lied; the two files just drifted, because
 * keeping them together depended on somebody remembering.
 *
 * Adding the Meta pixel makes that same drift far more expensive. A privacy
 * policy that denies advertising trackers while an advertising tracker runs is
 * the documented way to get a Meta ad account restricted, and under CCPA/CPRA
 * the "we do not share for cross-context behavioral advertising" sentence is a
 * legal representation rather than a description.
 *
 * So this asserts the pair, not the pixel. It fails if the pixel goes live
 * while the policy still denies it, AND it fails if the policy starts
 * describing a pixel that is not actually running. Either half alone is a bug.
 */

const SITE = 'https://builtbykerr.com';

async function fetchText(path: string) {
  const ctx = await request.newContext();
  const res = await ctx.get(SITE + path);
  expect(res.status(), `${path} should be reachable`).toBe(200);
  const body = await res.text();
  await ctx.dispose();
  return body;
}

/** The shipped value of META_PIXEL_ID, read from what a visitor is served. */
function pixelIdFrom(html: string): string | null {
  const m = html.match(/var\s+META_PIXEL_ID\s*=\s*'([^']*)'/);
  return m ? m[1] : null;
}

test('the pixel constant still exists and is readable', async () => {
  const home = await fetchText('/');
  const id = pixelIdFrom(home);
  expect(id, 'META_PIXEL_ID declaration not found — this gate cannot see the site it guards').not.toBeNull();
});

test('pixel and privacy policy agree', async () => {
  const home = await fetchText('/');
  const policy = await fetchText('/legal/privacy.html');
  const id = (pixelIdFrom(home) ?? '').trim();
  const pixelLive = id.length > 0;

  // What the policy currently claims about trackers.
  const deniesTrackers = /don't run advertising trackers|do not run advertising trackers/i.test(policy);
  const deniesCookies  = /sets no cookies at all/i.test(policy);
  const describesPixel = /meta pixel/i.test(policy);
  const namesFbp       = /_fbp/i.test(policy);
  const hasOptOut      = /aboutads\.info|youronlinechoices|ad_settings/i.test(policy);

  if (pixelLive) {
    // Shape only: digits, and long enough not to be a stray character. The
    // earlier version asserted 15-16 digits and FAILED THE REAL ID, which is 17.
    // That range was invented from the examples to hand, not from anything Meta
    // publishes -- a proxy for "is this id valid" that was wrong in the one
    // direction that mattered. Whether Meta accepts the id is measured by
    // 'Meta accepts the live pixel id' below, which asks Meta rather than
    // guessing from the string.
    expect(id, 'pixel id should be digits only').toMatch(/^\d{8,25}$/);
    expect(deniesTrackers,
      'PIXEL IS LIVE but the policy still says the site runs no advertising trackers. ' +
      'Update legal/privacy.html so it describes the tracking that is actually live.').toBe(false);
    expect(deniesCookies,
      'PIXEL IS LIVE but the policy still says the site sets no cookies. The pixel sets _fbp. ' +
      'Update legal/privacy.html so it describes the tracking that is actually live.').toBe(false);
    expect(describesPixel, 'PIXEL IS LIVE but the policy never mentions the Meta pixel.').toBe(true);
    expect(namesFbp, 'PIXEL IS LIVE but the policy does not name the _fbp cookie it sets.').toBe(true);
    expect(hasOptOut, 'PIXEL IS LIVE but the policy offers no opt-out route. Meta requires one.').toBe(true);
  } else {
    // The reverse drift: a policy that describes tracking the site does not do.
    expect(describesPixel,
      'The policy describes a Meta pixel, but META_PIXEL_ID is empty so no pixel runs. ' +
      'This is the 2026-08-13 Plausible bug in the other direction.').toBe(false);
  }
});

test('a live pixel also requires the California opt-out link in the footer', async () => {
  const home = await fetchText('/');
  const id = (pixelIdFrom(home) ?? '').trim();
  if (!id) { test.skip(); return; }
  expect(/do not sell or share/i.test(home),
    'PIXEL IS LIVE. CPRA treats sending pixel data to Meta as "sharing", which requires a ' +
    '"Do Not Sell or Share My Personal Information" link in the footer.').toBe(true);
});

test('the conversion event is wired to real success, not to the click', async () => {
  const home = await fetchText('/');
  // Lead must sit inside the res.ok branch. If it drifts out to the submit
  // handler, Meta optimises delivery toward people whose submissions FAILED.
  const okBranch = home.indexOf('if (res.ok) {');
  const lead = home.indexOf("fbq('track', 'Lead'");
  const catchBlock = home.indexOf('} catch (err) {');
  expect(okBranch, 'res.ok branch not found').toBeGreaterThan(-1);
  expect(lead, "Lead event not found").toBeGreaterThan(-1);
  expect(lead > okBranch && lead < catchBlock,
    'the Lead event is no longer inside the res.ok branch — it would now count failed submissions').toBe(true);
});

test('booking stays dark while its calendar is misconfigured', async () => {
  const home = await fetchText('/');
  const m = home.match(/var\s+BOOKING_URL\s*=\s*'([^']*)'/);
  expect(m, 'BOOKING_URL declaration not found').not.toBeNull();
  const url = (m?.[1] ?? '').trim();
  if (url) {
    // Set deliberately? Then the fallback copy must be gone, or visitors see
    // both a booking widget and a message saying booking is not switched on.
    expect(/Online booking is being switched on/i.test(home),
      'BOOKING_URL is set but the "booking is being switched on" fallback copy is still in the HTML.').toBe(false);
  }
});

/**
 * Does Meta actually ACCEPT the id?
 *
 * Everything else in this file reads HTML. None of it can tell a correct id
 * from a typo, because a wrong id fails silently: measured on this site with a
 * deliberately invalid id, fbevents.js still loaded, signals/config still
 * returned 200, facebook.com/tr still returned 200, and window.fbq was still a
 * function. Every signal a normal check looks at stayed green while Meta
 * recorded nothing.
 *
 * The discriminator is the _fbp cookie. Confirmed in BOTH directions:
 *   invalid id 1234567890123456  -> only Meta's own `fr` cookie, no _fbp
 *   real id    28202025336060922 -> _fbp set
 *
 * If this fails while the id looks right, the id is wrong. Check Events
 * Manager -- the fix is there, not in this repo.
 */
test('Meta accepts the live pixel id', async ({ browser }) => {
  const home = await fetchText('/');
  const id = (pixelIdFrom(home) ?? '').trim();
  test.skip(!id, 'pixel is dark; nothing to validate');

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  const cookies = await ctx.cookies();
  await ctx.close();

  expect(
    cookies.some(c => c.name === '_fbp'),
    `pixel id ${id} is live but Meta did not set _fbp. An id Meta rejects still ` +
    `loads fbevents.js and still returns 200 on every request, so this cookie is ` +
    `the only signal that it was accepted. Verify the id in Events Manager.`
  ).toBe(true);
});
