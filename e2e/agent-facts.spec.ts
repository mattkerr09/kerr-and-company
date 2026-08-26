import { test, expect, request } from '@playwright/test';

/* THE ASSISTANT MUST BELIEVE WHAT THE SITE SAYS.
 *
 * Its whole safety argument is that it cannot quote a price this page does not
 * show, because its facts are scraped from the rendered page instead of typed
 * into a prompt. That argument is only true while the two agree.
 *
 * They stopped agreeing within hours of shipping. The price lines were rewritten
 * from .pkg-split to .pkg-alt, the scraper still looked for .pkg-split, and the
 * agent went on answering "50% to start" for a card that by then offered $149/mo
 * for 12 months. Nothing failed. It quietly stopped knowing, which is the worst
 * available outcome for a thing whose job is to answer accurately.
 *
 * So this compares the DEPLOYED agent against the LIVE page. Checking a local
 * facts.json would not have caught it: the file can be correct while the worker
 * running in production is a week old.
 *
 * When it fails:
 *     node scripts/scrape-agent-facts.mjs
 *     cd ~/ops/lead-agent && npx wrangler deploy
 */
const SITE  = 'https://builtbykerr.com';
const AGENT = 'https://kerr-lead-agent.kerrco.workers.dev';

test('the deployed assistant knows the prices the live page shows', async ({ page }) => {
  await page.goto(`${SITE}/`, { waitUntil: 'networkidle' });
  const live = await page.evaluate(() => {
    const t = (e: Element | null) => (e as HTMLElement)?.innerText.replace(/\s+/g, ' ').trim() || '';
    return [...document.querySelectorAll('.pkg')].map(e => ({
      name: t(e.querySelector('h3')),
      price: t(e.querySelector('.price')),
      payment: t(e.querySelector('.pkg-alt, .pkg-split')) || null,
    }));
  });

  const api = await request.newContext();
  const res = await api.get(`${AGENT}/facts`, { headers: { Origin: SITE } });
  expect(res.ok(), 'the agent must answer /facts — if this 404s the worker is older than this test').toBeTruthy();
  const known = (await res.json()).services as { name: string; price: string; payment: string | null }[];
  await api.dispose();

  expect(known.length, 'service count').toBe(live.length);

  const drift: string[] = [];
  for (const l of live) {
    const k = known.find(x => x.name === l.name);
    if (!k) { drift.push(`the agent does not know "${l.name}" exists`); continue; }
    if (k.price !== l.price) drift.push(`${l.name}: agent says "${k.price}", page says "${l.price}"`);
    if ((k.payment || '') !== (l.payment || ''))
      drift.push(`${l.name} payment: agent says "${k.payment ?? '—'}", page says "${l.payment ?? '—'}"`);
  }

  expect(drift,
    'the assistant is quoting terms this page no longer shows. Re-scrape and ' +
    'redeploy: node scripts/scrape-agent-facts.mjs, then wrangler deploy in ~/ops/lead-agent.'
  ).toEqual([]);
});
