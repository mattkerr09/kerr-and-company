/* Rebuild the lead agent's factbase FROM THE RENDERED LIVE PAGE.
 *
 * The agent must never quote a price or term this site does not show, so its
 * facts come from here rather than from a prompt someone types — a price typed
 * into a prompt is a second copy of the truth, and second copies drift.
 *
 * It drifted anyway, within hours, and how it happened is why this is a script
 * rather than a one-off: I rewrote the price lines from .pkg-split to .pkg-alt
 * and the scraper was still looking for .pkg-split, so the agent kept answering
 * "50% to start" for a card that now offers $149/mo. The factbase was built the
 * right way and went stale because REBUILDING IT WAS SOMETHING TO REMEMBER.
 *
 * Run:  node scripts/scrape-agent-facts.mjs
 * Then: cd ~/ops/lead-agent && npx wrangler deploy
 * e2e/agent-facts.spec.ts fails when the shipped facts disagree with the page.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const OUT = process.env.HOME + '/ops/lead-agent/facts.json';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://builtbykerr.com/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);

const facts = await page.evaluate(() => {
  const txt = e => (e?.innerText || '').replace(/\s+/g, ' ').trim();
  const services = [...document.querySelectorAll('.pkg')].map(e => ({
    name: txt(e.querySelector('h3')),
    price: txt(e.querySelector('.price')),
    /* Read BOTH class names deliberately. The payment line has been .pkg-split
       and is now .pkg-alt; a scraper keyed to one silently returns nothing when
       the markup is renamed, which is exactly how this went stale. */
    payment: txt(e.querySelector('.pkg-alt, .pkg-split')) || null,
    meta: txt(e.querySelector('.meta')),
    desc: txt(e.querySelector('.desc')),
    includes: [...e.querySelectorAll('.feat li')].map(txt),
  }));
  const terms = {};
  document.querySelectorAll('.terms-col').forEach(c => {
    terms[txt(c.querySelector('h3'))] = [...c.querySelectorAll('li')].map(txt);
  });
  return {
    services, terms,
    ownit_monthly: {
      summary: txt(document.querySelector('.ownit p')),
      points: [...document.querySelectorAll('.ownit-points li')].map(txt),
    },
  };
});

/* Refuse to write a factbase that would make the agent WORSE. An empty scrape
   ships an assistant that knows no prices and invents them instead — the exact
   failure the factbase exists to prevent. */
if (facts.services.length < 4) throw new Error(`only ${facts.services.length} services scraped — refusing to write`);
if (facts.services.filter(s => /\$/.test(s.price)).length < 4) throw new Error('fewer than 4 priced services — refusing to write');
const withPayment = facts.services.filter(s => s.payment);
if (withPayment.length < 3) throw new Error(`only ${withPayment.length} payment lines — the markup probably changed again`);

facts.booking = 'https://calendly.com/admin-kerrandcompanyholdings/30min';
facts.text_only_phone = '(616) 320-1280';
facts.email = 'matthew@kerrandcompanyholdings.com';

writeFileSync(OUT, JSON.stringify(facts, null, 2));
console.log(`  ${facts.services.length} services, ${withPayment.length} with payment lines, ${Object.keys(facts.terms).length} term groups`);
facts.services.forEach(s => console.log(`    ${s.name.padEnd(24)} ${s.price.padEnd(20)} ${s.payment || '—'}`));
await browser.close();
