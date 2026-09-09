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

/* One assistant, five sites (2026-08-26): the worker imports facts/<host>.json per
   tenant, so this writes builtbykerr's file, not the old single facts.json. */
const OUT = process.env.HOME + '/ops/lead-agent/facts/builtbykerr.com.json';
/* The service pages carry their own price cards (retainers and one-time work)
   in the same .pkg markup as the home page. The assistant knew none of them
   until 2026-09-09 — it could quote a $999 Starter Site but not the $750/mo
   Local SEO retainer written on /services/seo-grand-rapids.html. */
const SERVICE_PAGES = [
  '/services/seo-grand-rapids.html',
  '/services/digital-marketing-grand-rapids.html',
  '/services/local-seo-google-business-profile.html',
];
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

/* CURATED TERMS — statements Matthew made that the page does not print, added
   by hand on 2026-09-01 (ops 90daac5: the assistant was telling prospects there
   are no refunds; 6976094: it said there is no public portfolio). A rebuild from
   the page alone erases them, which is how they were lost for a minute on
   2026-09-09. They are merged into the same term groups on every rebuild; edit
   them here, not in the JSON. */
const CURATED_TERMS = {
  "On every project, whatever the size": [
    "Cancellation before work starts: a full refund of the deposit. After work starts: you pay only for work done, and anything already paid beyond that is refunded. This is in the signed project agreement, section 8.",
    "There ARE public examples — three complete demonstration builds on the site, linked from the home page: /examples/roofing/ (home services, estimate form), /examples/restaurant/ (menu, hours, reservations) and /examples/salon/ (priced service list, online booking).",
    "Those three are DEMONSTRATIONS, not client work. Each says so on the page and the businesses are fictional. Never describe them as clients or imply somebody paid for them.",
    "On the $149/mo Own It plan: if the site is never delivered, every payment made is refunded and nothing transfers."
  ]
};
for (const [group, lines] of Object.entries(CURATED_TERMS)) {
  facts.terms[group] = [...(facts.terms[group] || []), ...lines.filter(l => !(facts.terms[group] || []).includes(l))];
}
facts.service_pages = {};
for (const path of SERVICE_PAGES) {
  await page.goto('https://builtbykerr.com' + path, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);
  facts.service_pages['https://builtbykerr.com' + path] = await page.evaluate(() => {
    const txt = e => (e?.innerText || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('.pkg')].map(e => ({
      name: txt(e.querySelector('h3')),
      price: txt(e.querySelector('.price')),
      meta: txt(e.querySelector('.meta')),
      desc: txt(e.querySelector('.desc')),
      includes: [...e.querySelectorAll('.feat li')].map(txt),
    })).filter(c => c.name && c.price);
  });
}
writeFileSync(OUT, JSON.stringify(facts, null, 2));
for (const [u, cards] of Object.entries(facts.service_pages)) {
  console.log(`  ${u}: ${cards.length} cards`);
  cards.forEach(c => console.log(`    ${c.name.padEnd(24)} ${c.price}`));
}
console.log(`  ${facts.services.length} services, ${withPayment.length} with payment lines, ${Object.keys(facts.terms).length} term groups`);
facts.services.forEach(s => console.log(`    ${s.name.padEnd(24)} ${s.price.padEnd(20)} ${s.payment || '—'}`));
await browser.close();
