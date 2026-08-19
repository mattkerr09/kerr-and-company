# Facebook Ads Readiness — builtbykerr.com

Audited 2026-08-19 against the live site, not the repo. Every number below was
measured, and where a check could only ever return "fine", it was also run
against a planted defect to prove it can fail.

---

## Do these three things before the first ad dollar

### 1. Fix the calendar timezone — 30 seconds, and it is free *today*

`admin@kerrandcompanyholdings.com` is set to **UTC**. You are Eastern (UTC-4 in
August). Google appointment schedules define your availability in the
*calendar's* timezone, so "9am–5pm" would publish as **5am–1pm your time**.

The calendar is currently **empty**. That matters: changing the timezone now
moves nothing. Once bookings exist, the same change reinterprets them and you
get to work out by hand which are real.

> Google Calendar → Settings → General → Timezone → **America/New_York**

Then create the appointment schedule and send me the public booking URL. The
booking section on the site is **already built and live**, showing an email
fallback; it upgrades itself to the real widget the moment that URL is set.
Nothing else to build.

### 1b. Booking switch-on runbook — exact, so nobody re-derives it

**Order matters. Timezone first, or the schedule is created against UTC and you
will fix it twice.**

1. Google Calendar → Settings → General → **Timezone** → `America/New_York`.
   Confirm it saved by reloading; the API reports `UTC` today.
2. Calendar → **Create → Appointment schedule**. Set duration 20 min, and set
   availability in **your** hours — after step 1 those are Eastern.
3. Open the schedule → **Share** → copy the **public booking page** URL. It
   looks like:
   `https://calendar.google.com/calendar/appointments/schedules/AcZssZ...`
   Use that form, **not** `/calendar/u/0/r/...` (that is your private admin
   view and shows a stranger a Google sign-in wall).
4. Send it to me. It goes in one line: `var BOOKING_URL = '...'` in
   `index.html`. The section upgrades itself from the fallback to the widget.

**How it gets verified — not by assuming:** I load the live page in a browser
pinned to `America/New_York`, read the *rendered* slot times out of the iframe,
and check the earliest offered slot against the availability you set. A
timezone bug shows up as a clean 4-hour offset, which is obvious in rendered
text and invisible in the URL. I will not call it done off the URL alone.

### 1c. Confirmations — one recommendation, not options

**Email only, native, at launch.** Google's appointment schedules send booking
confirmations and email reminders themselves; that covers the person who books
with no new vendor.

**Do not add SMS yet.** Google Calendar cannot send SMS natively at all, so it
means a third-party Marketplace app. That is a monthly cost, a new company
receiving your customers' phone numbers, and a matching disclosure in the
privacy policy — to reduce no-shows on a booking page that currently has zero
traffic. Revisit once no-shows are a real, measured number.

**One thing to check that I cannot see from here:** automated email reminders
and verified bookings are **Business Standard+** features. On a free or Starter
plan you get the booking page and confirmation, but not the reminder
automation. Worth confirming which plan `kerrandcompanyholdings.com` is on
before promising a reminder cadence.

### 2. Create the pixel and give me the ID

The pixel is scaffolded and **dark** — `META_PIXEL_ID = ''` in `index.html`.
Verified in both directions: empty makes zero requests to facebook.net and
leaves `fbq` undefined; a planted test ID loads `fbevents.js` and initialises
across 3 requests. So it is inert, not broken.

> Events Manager → Data sources → your pixel → the 15–16 digit number

### 3. Verify the domain in Business Manager

> Business Settings → Brand Safety → **Domains** → add `builtbykerr.com`
> (root, no `www`) → DNS TXT record

Not optional. An unverified domain gets its events **partially or fully
ignored**, and you would be paying for delivery optimisation against data Meta
is discarding.

---

## The thing that gets ad accounts restricted

Setting the pixel ID makes **four statements on `/legal/privacy.html` false**:

| Live sentence | Why it breaks |
|---|---|
| "we don't run advertising trackers on it" | You would be running one |
| "This Site sets no cookies at all" | The pixel sets `_fbp` |
| "no consent banner: there is nothing to consent to" | There would be |
| "We do not sell or **share** personal information for cross-context behavioral advertising" | CPRA's "sharing" covers exactly this |

The last one is a **legal representation**, not a description. Meta also
requires a reachable privacy policy disclosing pixel use and an opt-out route;
burying or omitting it is grounds for suspension.

This page has drifted this way once already — on 2026-08-13 it said analytics
"may be added in future" while Plausible was already loading. That drift cost
nothing. This one costs the ad account.

**So it is enforced rather than remembered:**
- `legal/privacy-pixel-revision.html` — the rewritten sections, ready to apply
- `e2e/ads-readiness.spec.ts` — fails if the pixel goes live while the policy
  denies it, **and** fails if the policy starts describing a pixel that is not
  running. Either half alone is the bug.

Apply the revision in the **same commit** that sets the ID. A CPRA "Do Not Sell
or Share" footer link is also required at that point — the gate checks for it.

---

## Already good — measured, not assumed

| Check | Result |
|---|---|
| First contentful paint (mobile) | **252ms** |
| Load event | **463ms** |
| Page weight | **0.92MB / 15 requests** |
| Horizontal overflow at 390px | none |
| Tap targets vs WCAG 2.5.8 | all pass |
| Contrast, both themes | 0 failures of 313 / 314 |
| E2E suite | **21 passing** |
| OG share card | 200, 103KB PNG |
| Structured data | ProfessionalService + PostalAddress + GeoCoordinates |
| Conversion event | fires on `res.ok`, not on click |

Speed is not what will hold these ads back. Landing-page load time is a real
Meta quality signal and this site is comfortably inside it.

---

## Decisions that are yours, not mine

**Conversions API.** Browser pixels lose roughly a third of events to iOS and
content blockers. CAPI recovers them server-side, but this site is static on
GitHub Pages — **there is no server**. It needs a Cloudflare Worker or similar.
Every event already carries an `eventID` so the two dedupe to one Lead when you
add it; retrofitting that later means a period of double-counted conversions in
exactly the numbers you would use to judge the ads.

**One page per ad.** Best practice is message match — the landing page headline
continues the ad's hook. This homepage is **27 screens tall on a phone** and
sells six products plus services. It is a good site; it is a diffuse ad target.
If you run more than one angle, each wants its own short page.

**Consent banner.** Michigan has no state privacy law requiring one, and the US
industry opt-out links cover you. Only worth building if you deliberately target
EU/UK traffic.

---

## Still blocked on you, unrelated to ads

- Provenance of `crisp/samples/dark.mp4` — no license file, and crispvideo.app
  credits Prelinger Archives for a reason
- "ProposalAI was built almost entirely by the framework itself" — not
  verifiable from the repo
- "3 provisional patents" — **UNCONFIRMED** across 7 surfaces. Do not let this
  reach ad copy: Meta rejects unsubstantiated claims, and an unverifiable patent
  claim in an ad is a worse problem than on a page.
