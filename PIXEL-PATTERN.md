# Dark-pixel pattern — portable spec

Implementable without reading `kerr-and-company`. Written for Crisp, Docket,
Outlier and ProposalAI after builtbykerr.com shipped it on 2026-08-19.

The pattern exists because a tracker and a privacy policy are **one change
split across two files**, and the half that is easy to forget is the half with
legal consequences.

---

## 1. The constant

```js
var META_PIXEL_ID = '';
```

Top-level, in the same script block as the loader, **not** in a config object
and **not** injected at build time. It must be greppable from the *served*
HTML, because the test reads the live site rather than the repo.

Empty string = dark. Any digit string = live. No other states, no
`enabled: true` flag — a second switch is a second thing to get wrong.

## 2. The loader

```js
(function () {
  if (!META_PIXEL_ID) return;              // dark: nothing happens at all
  !function(f,b,e,v,n,t,s){ /* Meta's standard snippet, unmodified */ }
  (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');
})();
```

The guard is the **first statement**. Not a wrapper around `fbq('init')` — the
whole snippet, including the script injection, must not run. Dark means zero
requests to `facebook.net`, not "loaded but uninitialised".

## 3. The conversion event

Fire it where the conversion **actually succeeded** — inside the branch that
confirms the server accepted it:

```js
if (res.ok) {
  if (window.fbq && META_PIXEL_ID) {
    fbq('track', 'Lead', { content_name: 'Contact form' },
        { eventID: kcEventId() });
  }
  ...
}
```

Wired to the click or to `submit`, it counts bad emails, network failures and
spam rejections — and Meta then optimises delivery toward whoever generates
those. For a paid download the equivalent is `Purchase` on payment
confirmation, never on "checkout opened".

**Always emit `eventID`**, even with no Conversions API yet:

```js
function kcEventId() {
  try { return crypto.randomUUID(); }
  catch (e) { return 'kc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10); }
}
```

It costs nothing now. Adding CAPI later without it means a stretch of
double-counted conversions in exactly the numbers used to judge the ads.

## 4. Assert the dark state — and prove the assertion can fail

This is the part that matters. **A check that only ever confirms zero passes
just as happily when the loader is broken.** Run both:

**Dark (the shipped state):** load the live page, assert `typeof window.fbq ===
'undefined'` and **zero** network requests matching `/facebook|fbevents/`.

**Live (planted defect):** copy the site to a scratch directory, `sed` a fake
15-digit id into the constant, serve it on a spare port, and assert `fbq` IS
defined and `fbevents.js` IS requested. Delete the copy.

builtbykerr's result, for calibration: dark → `fbq undefined`, 0 requests.
Planted `123456789012345` → `fbq` defined, 3 requests, `fbevents.js` loaded.

If the planted-id half passes while dark, the guard is inverted. If it fails
while dark, the loader is broken and the dark test was never proving anything.

## 5. The privacy-policy coupling

### Do NOT copy builtbykerr's four sentences

builtbykerr's policy said "we don't run advertising trackers", "sets no cookies
at all", "no consent banner: nothing to consent to", and the CCPA/CPRA line.
**Those are that page's wording.** Each site says it differently and will have
a different set of false statements — possibly more, possibly worse.

**Find your own.** Grep the site's live policy for claims a pixel falsifies:

    tracker | cookie | consent | third.part | advertis | share | sell
    cross-context | behavioral | do not track | analytics

Read every hit. Any sentence that is true today and false with a pixel running
is on your list.

### What the revised policy must contain

- The Meta pixel is named, and `_fbp` is named as the cookie it sets
- What is sent: page viewed, IP, user-agent, and that a conversion occurred
- What is **not** sent (be specific — for builtbykerr, the form contents)
- Opt-out routes: Meta ad settings, `optout.aboutads.info`,
  `youronlinechoices.eu`, content blockers, and Global Privacy Control
- **CCPA/CPRA:** if the policy claims no "sharing for cross-context behavioral
  advertising", that claim must change. CPRA's definition of *sharing* covers
  sending pixel data to Meta for advertising. This one is a legal
  representation, not copy.
- A **"Do Not Sell or Share My Personal Information"** footer link, required
  for California visitors once the pixel is live. Separate edit, easily missed.

### The gate

A test that fails in **both** directions:

- **pixel live + policy still denying trackers** → fail
- **policy describing a pixel that is not running** → fail

Read `META_PIXEL_ID` out of the served homepage, branch on it, and assert the
policy text accordingly. Point it at the live URL, not the repo — a deploy can
lag, and the repo is not the artifact a visitor is served.

---

## Reference implementation

In `kerr-and-company`, if reading it is easier than reimplementing:

| File | What to look at |
|---|---|
| `index.html` | search `META_PIXEL_ID` — constant, comment block, loader, and the `Lead` call inside `res.ok` |
| `e2e/ads-readiness.spec.ts` | the bidirectional gate, ~110 lines, no browser needed |
| `legal/privacy-pixel-revision.html` | prepared diff, with the reasoning per sentence |
| `robots.txt` | why the prepared revision is disallowed from indexing |
| `ADS-READINESS.md` | the launch audit this came out of |
## A wrong id does not fail. Verify the id, not the loader.

Measured on this site with a deliberately invalid 16-digit id
(`1234567890123456`):

    fbevents.js               loaded
    signals/config/<id>       HTTP 200
    facebook.com/tr/          HTTP 200
    window.fbq                function
    cookies set               fr only
    _fbp                      NOT SET     <- the only tell

**Every network signal a normal check looks at is healthy.** The script loads,
the config request succeeds, the PageView beacon returns 200, `fbq` is defined.
A site could ship a typo'd id, watch all of that go green, and conclude the
pixel works — while Meta records nothing and the ads optimise against no data.
It looks identical to "the campaign has not warmed up yet".

The discriminator observed here is **`_fbp`**. Meta's own `fr` cookie was set;
`_fbp`, which the pixel writes for a dataset it accepts, was not.

**So after setting a real id, assert `_fbp` exists** — not that `fbevents.js`
loaded:

```js
const cookies = await context.cookies();
const ok = cookies.some(c => c.name === '_fbp');
```

**Confirmed in both directions**, which is what makes this trustworthy:

    invalid id  1234567890123456   -> only Meta's `fr` cookie, NO _fbp
    real id     28202025336060922  -> _fbp set

The invalid case was measured on a scratch copy; the valid case on the live
site the day the real id shipped. If it is
absent with an id you believe is correct, **check the id in Events Manager
before assuming the code is wrong** — and confirm receipt on Meta's side, which
is the only authority on whether events actually arrived.

**Check the shape before shipping.** Meta pixel/dataset ids are **15–16
digits**. Anything longer or shorter is a transcription error until proven
otherwise — a 17-digit value reached this repo, which is what prompted this
section.

