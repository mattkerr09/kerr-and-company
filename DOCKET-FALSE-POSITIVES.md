# Three false positives in the 2026-08-19 Docket audit

Found while acting on the audit for builtbykerr.com. Written up because Docket
is a product being sold, and two of these would misfire on **every site** that
adopts the dark-pixel pattern now being rolled out across the portfolio.

Verified against the live site, not the repo.

---

## 1. "Reviews are shown but not marked up" — would produce fabricated markup

**Severity of the bug: high.** Acting on this recommendation creates a Google
manual-action risk.

Docket flagged `articles/why-website-projects-stall.html` as displaying reviews
and recommended adding `AggregateRating` markup, with a worked example of
`"ratingValue": "4.8", "reviewCount": "127"`.

What it actually read:

> You own a plumbing company. An email arrives asking for:
> A description of each service you offer · Your "about" story ·
> Photos of completed work · **Team headshots** · **Testimonials** ·
> Your service area

That is a bulleted list, inside a narrative article, of things an agency asks a
client to supply. There are no reviews on that page. There are no reviews
anywhere on this site — an E2E test asserts it, because none have been
collected.

Following the fix would have put a fabricated 4.8-star rating into structured
data on a page with zero reviews.

**Cause:** the detector appears to match on keyword proximity
(`testimonials`, `reviews`) without checking for the repeated sibling structure
that an actual review list has — multiple similar blocks each carrying a name,
a rating, or a date.

**Suggested fix:** require ≥2 sibling elements of similar shape, or an explicit
rating-like token (`★`, `/5`, `out of 5`, a numeric rating near a name), before
the finding fires. Prose mentioning the word should never be enough.

---

## 2 & 3. Pixel findings fire on code that cannot execute

Docket reported both of these:

- *"1 advertising pixel is only on part of the site"* — Meta Pixel, 1 of 21 pages
- *"Advertising or session-recording tags **run** with no consent mechanism …
  This is a legal exposure"*

**Neither is true.** Measured on the live homepage:

    requests to facebook.net:  0
    fbq defined:               undefined
    _fbp cookie set:           no
    cookies set at all:        0

The site ships the Meta pixel loader behind an empty id:

```js
var META_PIXEL_ID = '';
(function () {
  if (!META_PIXEL_ID) return;      // nothing below this line runs
  ...
})();
```

The snippet is present in the HTML. It never executes, sets no cookie, and
contacts no Meta endpoint.

**Why this matters commercially:** the consent finding asserts a *legal
exposure* that does not exist. A site owner who reads it either buys a consent
platform they do not need, or learns to distrust the finding — and that finding
is correct and important the moment a real pixel goes live.

**It is about to misfire far more widely.** This dark-pixel pattern is being
adopted across all five portfolio sites precisely because it is the safe way to
stage advertising tracking. Docket will report all five as running an
unconsented tracker.

**Cause:** tag detection greps the HTML for tracker signatures rather than
observing execution.

**Suggested fix, cheapest first:**

1. If a tracker's snippet is found inside a guard that cannot pass — an empty
   string constant, `return` before the loader — classify it as **staged, not
   active**. A dedicated finding ("advertising tag staged but inactive") would
   be genuinely useful and is a differentiator; nobody else reports it.
2. Better: when `--render` is used, assert on observed network requests and
   cookies rather than on source text. `0 requests to facebook.net` is the
   ground truth and Docket already has a rendering mode.
3. The consent finding specifically should require **evidence of execution**
   (a cookie set, or a request observed) before asserting legal exposure.

---

## What was right

The other 22 findings held up. Several were understated rather than overstated:
Docket reported analytics missing from 19 of 21 crawled pages, and the repo
actually had 21 of 23 html files without it. The sitemap/noindex contradiction,
the orphan page, the missing Open Graph tags, the over-length meta description,
the skipped heading level and the title/h1 mismatch were all real and all
verified before fixing.

Score after fixing the true findings: **89.0 B → 93.6 A**, 25 findings → 17.
