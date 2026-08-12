/**
 * End-to-end tests against the LIVE kerrandcompanyholdings.com.
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

const BASE = 'https://kerrandcompanyholdings.com';

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
  ];

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
