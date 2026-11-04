import { test, expect, chromium, Browser } from '@playwright/test';
import { createServer, Server } from 'node:http';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

/**
 * GLOBAL PRIVACY CONTROL: the privacy policy says "we honour the GPC signal
 * where your browser sends one", so a browser that sends it must get no Meta
 * pixel on any page.
 *
 * WHY THIS ONE READS THE REPO, NOT THE LIVE SITE
 *
 * Every other spec here reads https://builtbykerr.com. This one serves the
 * files in this folder from a local port, because the promise is made by the
 * source and has to be provable before it is published, not after.
 *
 * It runs both ways, on every page that carries the pixel:
 *   - GPC on:  window.fbq is never defined and nothing is requested from Meta.
 *   - GPC off: fbq IS defined and fbevents.js IS requested. Without this half,
 *     the check above would also pass on a page whose pixel is simply broken.
 *
 * Meta's own host is answered locally in both runs, so nothing leaves the
 * machine. The requests are counted before they are answered.
 */

const ROOT = resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'test-results', 'playwright-report']);
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.txt': 'text/plain', '.xml': 'application/xml', '.json': 'application/json',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** Every published page that loads the pixel. Underscore files are not published. */
const PAGES = walk(ROOT)
  .filter(f => f.endsWith('.html') && !basename(f).startsWith('_'))
  .filter(f => readFileSync(f, 'utf8').includes('connect.facebook.net'))
  .map(f => '/' + relative(ROOT, f).split('\\').join('/'));

let server: Server;
let base = '';
let browser: Browser;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let u = decodeURIComponent((req.url || '/').split('?')[0]);
    if (u.endsWith('/')) u += 'index.html';
    const f = join(ROOT, u);
    if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
    createReadStream(f).pipe(res);
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch();
});
test.afterAll(async () => {
  await browser?.close();
  await new Promise<void>(ok => (server ? server.close(() => ok()) : ok()));
});

/** Load pixel pages (all by default) with the given GPC value; report what each one did. */
async function run(gpc: boolean | undefined, pages: string[] = PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (gpc !== undefined) {
    await ctx.addInitScript(`Object.defineProperty(navigator, 'globalPrivacyControl', { value: ${gpc}, configurable: true });`);
  }
  // Pictures, video and fonts are not what is being asked, and the page does not need them.
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/facebook\.(net|com)$/.test(url.hostname)) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    }
    if (url.hostname !== '127.0.0.1') return route.abort();
    return ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue();
  });

  const one = async (p: string) => {
    const page = await ctx.newPage();
    let metaRequests = 0;
    page.on('request', r => { if (/facebook\.(net|com)/.test(new URL(r.url()).hostname)) metaRequests++; });
    await page.goto(base + p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(150);
    const fbq = await page.evaluate(() => typeof (window as unknown as { fbq?: unknown }).fbq);
    await page.close();
    return { page: p, fbq, metaRequests };
  };
  // Eight at a time: the whole site in seconds, not a minute.
  const results: { page: string; fbq: string; metaRequests: number }[] = [];
  for (let i = 0; i < pages.length; i += 8) {
    results.push(...await Promise.all(pages.slice(i, i + 8).map(one)));
  }
  await ctx.close();
  return results;
}

const line = (r: { page: string; fbq: string; metaRequests: number }) =>
  `${r.page}: fbq is ${r.fbq}, ${r.metaRequests} request(s) to Meta`;

test.describe('Global Privacy Control', () => {
  test('the check can see every pixel page (a floor, so it cannot pass on nothing)', () => {
    expect(PAGES.length, 'found far fewer pixel pages than the site has').toBeGreaterThanOrEqual(60);
    expect(PAGES, 'the home page must be among them').toContain('/index.html');
    expect(PAGES.some(p => p.startsWith('/examples/')), 'the demo builds run the pixel too').toBe(true);
  });

  test('a browser that sends GPC gets no Meta pixel on any page', async () => {
    test.setTimeout(180_000);
    const loaded = (await run(true)).filter(r => r.fbq !== 'undefined' || r.metaRequests > 0).map(line);
    expect(loaded, 'the pixel loaded for a browser that sent Global Privacy Control').toEqual([]);
  });

  test('without GPC the same pages do load it, so the gate above is what stopped it', async () => {
    test.setTimeout(180_000);
    const silent = (await run(undefined)).filter(r => r.fbq !== 'function' || r.metaRequests < 1).map(line);
    expect(silent, 'the pixel did not load without GPC, so the check above proves nothing').toEqual([]);
  });

  test('an explicit GPC value of false does not switch the pixel off', async () => {
    test.setTimeout(180_000);
    const silent = (await run(false, PAGES.slice(0, 3))).filter(r => r.fbq !== 'function' || r.metaRequests < 1).map(line);
    expect(silent).toEqual([]);
  });

  test('the policy still makes the promise this test keeps', () => {
    const policy = readFileSync(join(ROOT, 'legal', 'privacy.html'), 'utf8');
    expect(policy).toMatch(/we honour the[\s\S]{0,200}GPC[\s\S]{0,20}signal/i);
  });
});
