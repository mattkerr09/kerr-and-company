import { test, expect, chromium } from '@playwright/test';

/* WHITE TEXT ON WHITE, AND NOTHING ERRORED.
 *
 * Reported by Matthew 2026-08-26. Cause: seven rules used `var(--ink-1)`, which
 * does not exist — the palette is --ink, --ink-2, --ink-3, --ink-4, so "--ink-1"
 * reads as the obvious name for the brightest one. An UNDEFINED custom property
 * makes the whole `color` declaration invalid, so the element inherits, which on
 * a light surface is white on white.
 *
 * Three of the seven were PRE-EXISTING, in the Own It band and the terms grid.
 * Bold text there had been invisible for as long as those rules existed and no
 * check caught it, because nothing throws, nothing logs, the layout is perfect
 * and a screenshot looks fine to anything that is not reading the words.
 *
 * So this measures the thing that was wrong — the computed contrast between the
 * text and whatever is actually painted behind it — in BOTH themes, because the
 * failure only showed in one.
 */
const DOMAIN = 'builtbykerr.com';
const MIN = 4.5;                 // WCAG AA, normal text

const TARGETS = [
  ['.kc-a-head strong', 'assistant heading'],
  ['#kc-agent-input',   'assistant input'],
  ['.kc-a-foot',        'assistant footnote'],
  ['.ex-lede',          'examples intro'],
  ['.ex strong',        'examples name'],
  ['.ex em',            'examples blurb'],
  ['.terms-col strong', 'terms bold'],
  ['.ownit-points strong', 'own-it bold'],
  ['.pkg-alt',          'payment line'],
  /* ⚠️ BUTTONS, because the first version of this list contained only text and
     the bug Matthew reported was a BUTTON. #kc-agent-toggle carried
     `background:var(--accent); color:#fff` — and --accent is near-WHITE in the
     dark theme, so its label measured 1.05:1. The identical defect is recorded
     in index.html's BUTTON CONTRAST note, where four buttons once measured
     1.00:1, and I reproduced it on a new button written after reading it.
     A list of things to check is only as good as what someone remembered to
     put in it, which is why these are here by name. */
  ['#kc-agent-toggle',  'assistant button'],
  ['#kc-agent-form button', 'assistant send button'],
  ['.btn-primary',      'hero button'],
  ['.nav-cta',          'nav button'],
  ['.pkg-cta',          'package button'],
];

for (const theme of ['dark', 'light']) {
  test(`text is readable in the ${theme} theme`, async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`https://${DOMAIN}/`, { waitUntil: 'networkidle' });
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.waitForTimeout(500);
    /* ⚠️ ASSERT IT IS SHUT BEFORE OPENING IT. Every test in this suite clicked
       the toggle first, so all of them opened a panel that was ALREADY OPEN and
       measured it without noticing — `hidden` was being defeated by an author
       `display:flex`, and the widget covered the page on every load for hours.
       A test that puts a thing into the state it wants can never report that the
       thing was in the wrong state to begin with. */
    const panelShut = await page.evaluate(() => {
      const e = document.getElementById('kc-agent-panel');
      return !e || getComputedStyle(e).display === 'none';
    });
    expect(panelShut, 'the assistant panel must be CLOSED on load — an open panel ' +
      'covers the page for every visitor').toBeTruthy();

    await page.evaluate(() => (document.getElementById('kc-agent-toggle') as HTMLElement)?.click());
    await page.waitForTimeout(400);

    const bad = await page.evaluate(({ targets, min }) => {
      /* ⚠️ TWO COLOUR SYNTAXES, TWO SCALES. getComputedStyle returns rgb() with
         0-255 channels, but also CSS Color 4 `color(srgb 1 1 1 / 0.7)` whose
         channels are 0-1. Dividing those by 255 turns WHITE into near-black, and
         the first version of this test did exactly that: it reported dark text on
         a white band as 1.95:1 and I nearly filed it as a site bug. The
         instrument was wrong, not the page. */
      const lum = (c: string) => {
        const nums = (c.match(/[\d.]+/g) || []).map(Number);
        const isSrgbUnit = /^color\(/.test(c.trim());
        const p = nums.slice(0, 3).map(v => {
          v = isSrgbUnit ? v : v / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
      };
      /* Walk UP for the painted background. An element with a transparent
         background is not on nothing — it is on whatever its ancestor paints,
         and that is what the eye compares against. */
      const paintedBg = (el: Element) => {
        let e: Element | null = el;
        while (e) {
          const c = getComputedStyle(e).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
          e = e.parentElement;
        }
        return 'rgb(255, 255, 255)';
      };
      const out: string[] = [];
      for (const [sel, label] of targets) {
        const el = document.querySelector(sel);
        if (!el) continue;                       // absent is a different test's job
        const fg = getComputedStyle(el).color;
        const bg = paintedBg(el);
        const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (hi + 0.05) / (lo + 0.05);
        if (ratio < min) out.push(`${label} (${sel}): ${ratio.toFixed(2)}:1 — ${fg} on ${bg}`);
      }
      return out;
    }, { targets: TARGETS, min: MIN });

    await browser.close();
    expect(bad, `unreadable text in the ${theme} theme. An undefined CSS variable ` +
      `makes colour inherit and fails silently — nothing throws and the layout looks right.`
    ).toEqual([]);
  });
}
