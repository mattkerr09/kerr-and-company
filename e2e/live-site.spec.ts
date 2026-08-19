/**
 * End-to-end tests against the LIVE site, whichever domain that currently is.
 *
 * WHY THE LIVE SITE AND NOT THE REPO
 *
 * This site is served by GitHub Pages from the repo root, so "it is correct in
 * git" and "it is correct to a buyer" are different claims — a deploy can lag,
 * and on 2026-08-12 a fix took three polls to appear. The repo is not the
 * artifact. The URL is. Every assertion here reads what a visitor is actually
 * served.
 *
 * WHY NO BROWSER
 *
 * These are content and contract assertions, not interaction ones, so they run
 * through Playwright's APIRequestContext. That means no browser binaries to
 * install and a suite that finishes in seconds — worth it, because a slow gate
 * gets skipped, and a skipped gate is the same as no gate.
 *
 *   npx playwright test
 */
import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';

/**
 * The domain is READ FROM `CNAME`, not typed here.
 *
 * It was typed here, as `https://kerrandcompanyholdings.com`, and on
 * 2026-08-17 this repo's CNAME changed to builtbykerr.com while this constant
 * did not. That pointed all twenty assertions at a domain this repo no longer
 * publishes — kerrandcompanyholdings.com is now the LLC entity page, a
 * different site — where `/studio.html` and every article and case study
 * return 404. Eight of nine tests failed, so the whole live-site contract for
 * the business that sells to prospects went unenforced: no check on attributed
 * testimonials, on retired false claims coming back, on our own prices
 * agreeing with each other, or on filesystem paths leaking into published
 * HTML.
 *
 * It failed loudly rather than passing vacuously, which was luck rather than
 * design — six of the eight only failed because `body()` asserts 200 before
 * returning. A suite that fails on every run is one nobody runs, which is the
 * same outcome as a suite that passes on nothing.
 *
 * RULES.md #4: a value stated in two places has one source of truth and the
 * other is a copy that will rot. GitHub Pages reads the domain from CNAME, so
 * CNAME is the source of truth and this derives from it. Changing the domain
 * now moves the tests with it, and a missing or empty CNAME throws instead of
 * quietly falling back to a default that would test the wrong site.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function liveDomain(): string {
  const cname = readFileSync(join(__dirname, '..', 'CNAME'), 'utf8').trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cname)) {
    throw new Error(
      `CNAME does not contain a usable domain (read ${JSON.stringify(cname)}). ` +
      'Refusing to guess — a default here would test a site this repo does not publish.');
  }
  return `https://${cname}`;
}

/**
 * The domain this site is EXPECTED to publish at.
 *
 * This is not a second source of truth competing with CNAME — CNAME still
 * decides what gets tested. This is the assertion that the two agree, which is
 * the other half of RULES.md #4: "derive it or check it in CI". Deriving alone
 * made the suite correct and made it invisible, because ops/bin/readiness.py
 * looks for the production URL in the spec to know the suite targets the live
 * site, and a computed string is not there to be found. It scored this suite
 * FAIL for having no reference to https://builtbykerr.com immediately after
 * the derivation fixed it — a regression I introduced by removing the literal.
 *
 * Writing the domain here as an EXPECTATION keeps CNAME authoritative, makes
 * the target legible to a reader and to the scorer, and turns a silent domain
 * change into a failing test that names the file to update. The 2026-08-17
 * migration is exactly the event this would have caught on the day.
 */
const PRODUCTION = 'https://builtbykerr.com';

const BASE = liveDomain();

/** Every page a visitor or crawler can reach. Mirrors the files in the repo. */
const PAGES = [
  '/',
  '/studio.html',
  '/articles/',
  '/articles/calendar-link-beats-free-estimate.html',
  '/articles/how-long-should-a-website-take.html',
  '/articles/lihtc-marketing-fair-housing.html',
  '/articles/what-grand-rapids-agencies-charge.html',
  '/articles/what-moves-cost-per-lead.html',
  '/articles/why-website-projects-stall.html',
  '/case-studies/',
  '/case-studies/real-estate-ads-3-82-cost-per-lead.html',
  '/case-studies/street-outfitters-organic-instagram-ecommerce.html',
  '/legal/disclaimer.html',
  '/legal/privacy.html',
  '/legal/terms.html',
  '/services/ai-automation.html',
  '/services/ai-consulting.html',
  '/services/digital-marketing-grand-rapids.html',
  '/services/local-seo-google-business-profile.html',
  '/services/seo-grand-rapids.html',
];

let api: APIRequestContext;
const bodies = new Map<string, string>();

async function body(path: string): Promise<string> {
  if (!bodies.has(path)) {
    const res = await api.get(`${BASE}${path}`, { timeout: 30_000 });
    expect(res.status(), `${path} must serve`).toBe(200);
    bodies.set(path, await res.text());
  }
  return bodies.get(path)!;
}

/** Strip tags before matching. A `</b>` inside `<b>2,500+</b>` once hid a live
 *  false claim from a sweep that used `[^<]`, so text assertions read text. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

test.beforeAll(async () => {
  api = await pwRequest.newContext();
});
test.afterAll(async () => {
  await api.dispose();
});

test.describe('live site contract', () => {
  test('CNAME and the expected production domain agree', async () => {
    // Fails on the day the domain moves, naming both values, instead of
    // silently pointing twenty assertions at a site this repo does not
    // publish — which is what happened on 2026-08-17 and went unnoticed for
    // a day because nothing compared the two.
    expect(BASE,
      `CNAME says ${BASE} but this suite expects ${PRODUCTION}. If the domain ` +
      'moved on purpose, update PRODUCTION in this file; if it did not, fix CNAME.')
      .toBe(PRODUCTION);
  });

  test('every page serves 200', async () => {
    test.setTimeout(120_000);
    const broken: string[] = [];
    for (const p of PAGES) {
      const res = await api.get(`${BASE}${p}`, { timeout: 30_000 });
      if (res.status() !== 200) broken.push(`${p} -> ${res.status()}`);
    }
    expect(broken, 'pages not serving 200').toEqual([]);
  });

  test('the three legal pages are reachable, because refunds and terms depend on them', async () => {
    for (const p of ['/legal/privacy.html', '/legal/terms.html', '/legal/disclaimer.html']) {
      const res = await api.get(`${BASE}${p}`, { timeout: 30_000 });
      expect(res.status(), `${p}`).toBe(200);
    }
  });

  test('every JSON-LD block parses', async () => {
    test.setTimeout(120_000);
    // A malformed or truncated block is invisible to a human reading the page and
    // silently drops the site's structured data. It is exactly the class of defect
    // that shipped an absolute filesystem path into an og:image once.
    const bad: string[] = [];
    for (const p of PAGES) {
      const html = await body(p);
      const blocks = [...html.matchAll(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      )];
      for (const [, raw] of blocks) {
        try {
          JSON.parse(raw);
        } catch (e) {
          bad.push(`${p}: ${(e as Error).message.slice(0, 80)}`);
        }
      }
    }
    expect(bad, 'unparseable JSON-LD').toEqual([]);
  });

  test('no page advertises an absolute local filesystem path', async () => {
    test.setTimeout(120_000);
    // Shipped once already: an og:image rendered from a Path object became
    // content="/Users/matthewkerr/...".
    const leaks: string[] = [];
    for (const p of PAGES) {
      if (/\/Users\/[a-z]/i.test(await body(p))) leaks.push(p);
    }
    expect(leaks, 'local paths leaked into published HTML').toEqual([]);
  });

  test('each page has a title, a meta description, a canonical and exactly one h1', async () => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    for (const p of PAGES) {
      const html = await body(p);
      if (!/<title>[^<]{5,}<\/title>/i.test(html)) problems.push(`${p}: title`);
      if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html))
        problems.push(`${p}: description`);
      if (!/<link[^>]+rel=["']canonical["']/i.test(html)) problems.push(`${p}: canonical`);
      const h1s = (html.match(/<h1[\s>]/gi) || []).length;
      if (h1s !== 1) problems.push(`${p}: ${h1s} h1s`);
    }
    expect(problems, 'page-level SEO contract').toEqual([]);
  });
});

/**
 * REGRESSION TESTS FOR CLAIMS THAT WERE ACTUALLY FALSE AND ACTUALLY LIVE.
 *
 * Each string below was published on this site and was untrue. They are not
 * hypothetical bad copy — every one shipped to buyers, and the two number claims
 * contradicted each other on the same page. If any reappears, the site is lying
 * to a prospect again, so this fails loudly rather than warning.
 */
test.describe('claims that must never come back', () => {
  const FORBIDDEN: { needle: RegExp; why: string }[] = [
    {
      needle: /2,?800\+?\s*(?:&nbsp;|\s)*monthly downloads/i,
      why: 'overstated downloads: the real 30-day figure was 2,559',
    },
    {
      needle: /5K\+/i,
      why: 'claimed ~5,000 monthly downloads against a real 2,559 — off by nearly 2x',
    },
    {
      needle: /50\+\s*AI agents over MCP/i,
      why: 'wrong architecture: 104 agent modules, but only 6 MCP servers',
    },
    /*
     * The Jarvis Factory panel was hand-written HTML styled as a terminal.
     * A terminal frame reads as a transcript — as something that happened —
     * so invented lines inside one are a fabricated demonstration, not copy.
     * Checked 2026-08-18 against ~/jarvis: all three phrases returned 0
     * occurrences and there is no `spawn` command in the repo at all. The
     * real lifecycle is plan -> approve -> orchestrate, which is better.
     */
    {
      needle: /supervisor\s+spawn\s+--agents/i,
      why: 'no `spawn` command exists in ~/jarvis — invented terminal output',
    },
    {
      needle: /\d+\s*agents registered/i,
      why: 'invented result line; the real CLI never prints this',
    },
    {
      needle: /product,\s*site\s*&(?:amp;)?\s*payments shipped/i,
      why: 'invented result line; the real CLI never prints this',
    },
  ];

  /**
   * The detectors must still detect.
   *
   * Every needle above is a regex written against a string that has since been
   * removed from the site. Nothing re-checks that the regex still matches the
   * text it was written for — so a well-meant tidy of one of these patterns
   * would leave a test that passes because it can no longer see, which is
   * indistinguishable from passing because the claim is gone.
   *
   * This is the lesson of 2026-08-13, when four of five new assertions in a
   * sibling repo caught their defect and the fifth was decorative: a gate is
   * only known to work once it has been watched failing on the thing it names.
   */
  test('each forbidden-claim detector still matches the claim it was written for', async () => {
    const SAMPLES: [RegExp, string][] = [
      [FORBIDDEN[0].needle, 'Over 2,800+ monthly downloads across our models'],
      [FORBIDDEN[1].needle, 'Trusted by 5K+ developers'],
      [FORBIDDEN[2].needle, 'Orchestrating 50+ AI agents over MCP'],
      [FORBIDDEN[3].needle, '\u279c supervisor spawn --agents 50 --sandbox'],
      [FORBIDDEN[4].needle, '50 agents registered'],
      [FORBIDDEN[5].needle, 'product, site & payments shipped'],
    ];
    const blind: string[] = [];
    for (const [needle, sample] of SAMPLES) {
      if (!needle.test(sample)) blind.push(`${needle} no longer matches "${sample}"`);
    }
    expect(blind, 'a detector stopped detecting — it would now pass on a live falsehood')
      .toEqual([]);
  });

  test('no retired false claim has returned', async () => {
    test.setTimeout(120_000);
    const found: string[] = [];
    for (const p of PAGES) {
      const text = visibleText(await body(p));
      for (const { needle, why } of FORBIDDEN) {
        if (needle.test(text)) found.push(`${p}: ${needle} — ${why}`);
      }
    }
    expect(found, 'a previously-corrected false claim is live again').toEqual([]);
  });

  /**
   * Our OWN prices must agree with each other across the site.
   *
   * The care plan was published at $199/month in nine places — including the
   * pricing card and the JSON-LD FAQ — and at $99/month in one article, inside a
   * paragraph that began "My pricing is public". A prospect who read that article
   * would have been quoted double. This is worse than a wrong competitor figure:
   * a buyer can hold us to the lower number, and they would be right to.
   *
   * This asserts agreement rather than banning one string, so it catches the
   * drift in either direction — including a genuine price change applied to some
   * pages and not others.
   */
  test('our own recurring prices agree everywhere they appear', async () => {
    test.setTimeout(120_000);
    const CARE = /care plans? (?:start(?:ing)? at|from) \$([\d,]+)/gi;
    const seen = new Map<string, string[]>();
    for (const p of PAGES) {
      const text = visibleText(await body(p));
      for (const m of text.matchAll(CARE)) {
        const price = m[1].replace(/,/g, '');
        if (!seen.has(price)) seen.set(price, []);
        seen.get(price)!.push(p);
      }
    }
    const summary = [...seen.entries()].map(([p, ps]) => `$${p} on ${ps.join(', ')}`);
    // `<= 1` was wrong, and wrong in the direction that hides things: zero matches
    // also satisfies it. The regex is narrow by necessity — it looks for "care
    // plans from $199" — so a rewrite to "Care plan: $199/mo" would stop matching
    // and this test would go green forever while checking nothing. That is the
    // same failure as the `[^<]` sweep documented above, and the same one found in
    // an AdPlaybook e2e assertion on 2026-08-13 that passed against a stub
    // returning empty lists.
    //
    // Exactly one price, therefore: found, and agreeing with itself. It currently
    // matches $199 across four places.
    expect(seen.size, seen.size === 0
      ? 'no care-plan price matched anywhere. The copy was reworded and this ' +
        'assertion stopped checking — fix the pattern, do not delete the test.'
      : `care plan quoted at conflicting prices — ${summary.join(' | ')}`)
      .toBe(1);
  });

  test('no testimonial names a person, because there are no collected testimonials', async () => {
    test.setTimeout(120_000);
    // Three fabricated testimonials with names and cities shipped on a sibling
    // product whose database read zero customers. That is the worst category of
    // defect in this portfolio and it gets a permanent gate.
    const hits: string[] = [];
    for (const p of PAGES) {
      const text = visibleText(await body(p));
      // "— Name, City" or "- Name, City" following a closing quote.
      if (/["”]\s*[—–-]\s*[A-Z][a-z]+ [A-Z][a-z]+,\s*[A-Z][a-z]+/.test(text)) hits.push(p);
    }
    expect(hits, 'attributed testimonial found').toEqual([]);
  });
});
