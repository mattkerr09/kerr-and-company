# Directional reveal — portable spec

For Crisp, Docket, ProposalAI and AdPlaybook. Matthew asked for Outlier's
motion on **all** the sites; builtbykerr.com and matthewkerr.dev are done.

His words: *"look how outlier makes their website move/appear/dissappear and
then do that to all the sites as well, like how some text comes in from the
side etc"*

---

## First: do NOT start by porting the orb system

Most of these sites already have it. On matthewkerr.dev I read one CSS
fragment, saw two static `.glow` rules, concluded the gradient did not move,
re-added the whole orb layer and **duplicated an element** — when the drift had
been there for two days under a different keyframe prefix (`mkdrift1/2/3`), and
`drift` had already returned 7 matches in my own grep output.

**Grep first:**

    grep -cE 'IntersectionObserver|@keyframes .*drift|\.reveal' index.html

If drift keyframes exist, the orbs are done. Leave them alone.

## The part that is actually missing: direction

Every element rises on the same axis, so the page fades uniformly. Outlier
drives one rule from three custom properties, which is what lets a photo arrive
from the left while the prose beside it arrives from the right.

```css
.js .reveal {
  opacity: 0;
  transform: translate(var(--rx, 0), var(--ry, 26px)) scale(var(--rs, .988));
  filter: blur(var(--rb, 4px)); }
.js .reveal.in {
  opacity: 1; transform: none; filter: blur(0);
  transition: opacity .8s cubic-bezier(.16,1,.3,1),
              transform .95s cubic-bezier(.16,1,.3,1),
              filter .8s cubic-bezier(.16,1,.3,1); }
```

Direction per block. **The pairs are the point** — opposite sides state the
relationship between two elements:

```css
.about-photo { --rx:-30px; --ry:14px; }
.about-body  { --rx: 30px; --ry:14px; }
.feature:nth-of-type(odd)  { --rx:-34px; --ry:20px; }
.feature:nth-of-type(even) { --rx: 34px; --ry:20px; }
```

The observer must be **two-way** — toggle, never `unobserve()`. If a site
unobserves, elements fill in once and never move again, and scrolling back up
shows nothing. That is the half Matthew means by "disappear".

```js
new IntersectionObserver(
  es => es.forEach(e => e.target.classList.toggle('in', e.isIntersecting)),
  { threshold: .08, rootMargin: '0px 0px -8% 0px' }
);
```

## Three things that will bite you

**1. Never override `transform` directly to set direction.** Two features
writing one property means whichever loads last wins. That is what sent the
white panels sliding off builtbykerr. It is invisible until AFTER the reveal
fires, so a static read will not catch it. Custom properties only.

**2. Check horizontal overflow at every scroll position, not at load.** A
lateral reveal can only overflow mid-transition. Checking at load returns a
clean `false` and proves nothing:

```js
for (let y = 0; y < document.body.scrollHeight; y += 280) {
  window.scrollTo(0, y);
  // assert scrollWidth <= clientWidth + 1
}
```

Run it at 1440 / 1024 / 768 / 390.

**3. Exempt above-the-fold, and restate reduced-motion.** The hero flashes on
load otherwise. And an existing reduced-motion block written against the old
rule knows nothing about the filter or the offsets — it will leave content
stuck at `opacity: 0` for exactly the people who asked for less motion.

## Verification that proves it

Measured on matthewkerr.dev:

    .about-photo before reveal   matrix(.988, 0, 0, .988, -30, 14), opacity 0
    after reveal                 settles to none, opacity 1
    scrolled away                opacity 0 again          <- two-way intact
    project --rx by index        [-34px, 34px, -34px, 34px]  <- alternating
    overflow 1440/1024/768/390   none, at every scroll position

**Reading the offset BEFORE reveal is the whole test.** Measuring after it
lands returns `none` on every site — including one where the direction was
never applied at all.
