/* Price-it-yourself, for every service.
 *
 * WHY THIS FILE EXISTS. The homepage has had a working configurator for
 * websites and Matthew asked for the same on every product: "do that for every
 * product to make it as easy for the customer as possible." Five other services
 * publish prices as static cards, so a visitor to /services/seo can read four
 * numbers but cannot find out what THEIR job costs without emailing.
 *
 * ⚠️ ONE TABLE, LOADED BY EVERY PAGE — AND THAT IS THE POINT, NOT A TIDINESS
 * PREFERENCE. This portfolio has shipped the same bug three times: a price that
 * lives on more than one surface, changed on one of them. The automation build
 * price alone currently appears on SEVEN pages including a published
 * "what agencies charge" article. A configurator that carried its own copy of
 * those numbers would make it eight. Every figure below is the number already
 * rendered in that service's cards; if a price changes, it changes here and the
 * live-site price-consistency test is what catches any card left behind.
 *
 * Mount by putting <div class="quote" data-quote="seo"></div> on a page and
 * loading this file. Unknown or missing key renders nothing rather than a
 * broken widget — a quote tool that guesses is worse than no quote tool.
 */
(function () {
  "use strict";

  /* ⚠️ THE WEBSITE TIERS ARE HOISTED AND EXPOSED ON PURPOSE. index.html is a
   * fully self-contained page with its own, nicer configurator, and when this
   * file was first written that widget kept its OWN copy of 999 / 2,499 /
   * 4,999 / 199 — so adding quote.js briefly made the site carry those numbers
   * in TWO places, which is the precise failure this file exists to prevent. I
   * created it in the same commit that argued against it.
   *
   * Rather than replace a better widget with a worse one, the numbers live here
   * and the homepage reads them off window.KC_PRICING. If this file fails to
   * load, that widget hides itself rather than rendering stale figures — an
   * absent quote is recoverable, a confidently wrong one is not. */
  var WEB = {
    starter:  { name: "Starter Site", price: 999, lead: 5,
                scope: ["Up to 3 pages, mobile-first", "Lead form + click-to-call", "On-page SEO + Google setup"] },
    business: { name: "Business Site", price: 2499, lead: 10,
                scope: ["5–8 custom pages", "Copywriting + on-page SEO", "Local schema, reviews, analytics"] },
    growth:   { name: "Growth Site + Tool", price: 4999, lead: 15,
                scope: ["Everything in Business", "One custom AI tool built for you", "Tool hosted and maintained"] }
  };
  var CARE = 199;

  var P = {
    websites: {
      title: "Price your site",
      lead: "Every figure here is the published price from the cards above.",
      qs: [
        { key: "pages", label: "How many pages", opts: [
          { v: "s", t: "1–3" }, { v: "b", t: "5–8" }, { v: "g", t: "9+" } ] },
        { key: "tool", label: "Anything else", multi: true, opts: [
          { v: "tool", t: "A custom AI tool" }, { v: "care", t: "Ongoing care plan" } ] }
      ],
      pick: function (s) {
        if (s.tool.indexOf("tool") > -1 || s.pages === "g") return WEB.growth;
        if (s.pages === "b") return WEB.business;
        return WEB.starter;
      },
      recur: function (s) { return s.tool.indexOf("care") > -1 ? { label: "care plan", amount: CARE } : null; }
    },

    audit: {
      title: "Price your audit",
      lead: "The report is yours whatever you do next — including taking it elsewhere.",
      qs: [
        { key: "depth", label: "What do you want", opts: [
          { v: "report", t: "The report only" }, { v: "fix", t: "Report + we fix it" } ] }
      ],
      pick: function (s) {
        if (s.depth === "fix") return { name: "Audit + Fix", price: 2500, lead: 10, from: true,
          scope: ["Everything in the report", "We implement the ranked fixes", "The audit fee comes off the build"] };
        return { name: "Site & Business Audit", price: 499, lead: 3,
          scope: ["Technical + SEO scan, every page", "Copy, conversion and ads review", "Ranked fix list: cost, effort, impact"] };
      },
      recur: function () { return null; }
    },

    automation: {
      title: "Price your automation",
      lead: "Published prices from the cards above — the same numbers, read once.",
      qs: [
        { key: "size", label: "How much are you automating", opts: [
          { v: "plan", t: "Just the plan" }, { v: "one", t: "One workflow" }, { v: "multi", t: "Several, connected" } ] },
        { key: "add", label: "Anything else", multi: true, opts: [
          { v: "managed", t: "Hosting + monitoring" } ] }
      ],
      pick: function (s) {
        if (s.size === "plan") return { name: "Automation Audit", price: 1500, lead: 5,
          scope: ["1 week · the plan is yours", "What to automate, in order", "No obligation to build with us"] };
        if (s.size === "multi") return { name: "Automation System", price: 7500, lead: 20, from: true,
          scope: ["Multi-step, custom build", "Connected to your existing tools", "Tested against your real workflow"] };
        return { name: "Single Automation", price: 2500, lead: 10, from: true,
          scope: ["Built + integrated with your tools", "Tested with your real workflow", "Training + documentation"] };
      },
      recur: function (s) { return s.add.indexOf("managed") > -1 ? { label: "managed", amount: 300 } : null; }
    },

    seo: {
      title: "Price your SEO",
      lead: "Retainers are month to month. The audit is a one-off and yours to keep.",
      qs: [
        { key: "kind", label: "What do you need", opts: [
          { v: "audit", t: "Audit + roadmap" }, { v: "local", t: "One location" },
          { v: "growth", t: "Competitive" }, { v: "bundle", t: "SEO + ads" } ] }
      ],
      pick: function (s) {
        if (s.kind === "audit") return { name: "SEO Audit & Roadmap", price: 1500, lead: 10,
          scope: ["2 weeks · yours to keep", "Technical, on-page and local", "Prioritised, not a 90-page PDF"] };
        if (s.kind === "growth") return { name: "Growth SEO", price: 2500, lead: 0, per: "mo", from: true,
          scope: ["Competitive / multi-service", "Content + technical + links", "Live dashboard"] };
        if (s.kind === "bundle") return { name: "SEO + Ads Bundle", price: 2500, lead: 0, per: "mo", from: true,
          scope: ["Rank long-term, buy leads now", "One team, one report", "Ad spend billed to you direct"] };
        return { name: "Local SEO", price: 750, lead: 0, per: "mo", from: true,
          scope: ["Single-location businesses", "Map pack + on-page", "Live dashboard"] };
      },
      recur: function () { return null; }
    },

    local: {
      title: "Price your local SEO",
      lead: "Priced per location, so a second shop costs what a second shop costs.",
      qs: [
        { key: "kind", label: "What do you need", opts: [
          { v: "tune", t: "One-time tune-up" }, { v: "managed", t: "Managed, ongoing" },
          { v: "system", t: "Profile + automation" }, { v: "multi", t: "3+ locations" } ] }
      ],
      pick: function (s) {
        if (s.kind === "tune") return { name: "Profile Tune-Up", price: 750, lead: 5,
          scope: ["One-time optimisation", "Categories, services, photos, posts", "Yours to run afterwards"] };
        if (s.kind === "system") return { name: "Local Growth System", price: 1200, lead: 0, per: "mo", from: true,
          scope: ["Profile + custom automation", "Review generation engine", "Local rank tracking"] };
        if (s.kind === "multi") return { name: "Multi-Location", custom: true,
          scope: ["3+ locations", "Priced per location, volume applies", "Scoped on a call first"] };
        return { name: "Managed Local", price: 500, lead: 0, per: "mo", from: true,
          scope: ["Per location · ongoing", "Posts, reviews, citations", "Local rank tracking"] };
      },
      recur: function () { return null; }
    },

    ads: {
      title: "Price your ads",
      lead: "Flat fees, never a percentage of spend — your ad budget is billed to you directly.",
      qs: [
        { key: "kind", label: "Where are you starting", opts: [
          { v: "setup", t: "Setup only" }, { v: "local", t: "Under $5k/mo spend" },
          { v: "growth", t: "Multi-platform" }, { v: "bundle", t: "Ads + SEO" } ] }
      ],
      pick: function (s) {
        if (s.kind === "setup") return { name: "Campaign Setup", price: 500, lead: 5,
          scope: ["Setup + first campaign", "Conversion tracking that works", "One-off — no retainer required"] };
        if (s.kind === "growth") return { name: "Growth Ads", price: 1500, lead: 0, per: "mo", from: true,
          scope: ["Multi-platform + automation", "Creative testing", "Leads you can count"] };
        if (s.kind === "bundle") return { name: "SEO + Ads Bundle", price: 2500, lead: 0, per: "mo", from: true,
          scope: ["Leads now + compounding growth", "One team, one report", "Ad spend billed to you direct"] };
        return { name: "Local Ads", price: 750, lead: 0, per: "mo", from: true,
          scope: ["Under $5k/mo ad spend", "Flat fee, never % of spend", "$500 setup, one-off"] };
      },
      recur: function () { return null; }
    },

    consulting: {
      title: "Price your advisory",
      lead: "Straight answers on where AI helps and what to build versus buy.",
      qs: [
        { key: "kind", label: "What do you need", opts: [
          { v: "call", t: "A one-off call" }, { v: "assess", t: "Opportunity assessment" },
          { v: "train", t: "Team training" }, { v: "retainer", t: "Ongoing advisory" } ] }
      ],
      pick: function (s) {
        if (s.kind === "assess") return { name: "AI Opportunity Assessment", price: 3500, lead: 10,
          scope: ["2 weeks · the plan is yours", "Build vs buy, with numbers", "No obligation to build with us"] };
        if (s.kind === "train") return { name: "Team Training", price: 2500, lead: 5, from: true,
          scope: ["Workshop on your own tools", "Your workflows, not slideware", "Recorded for the people who miss it"] };
        if (s.kind === "retainer") return { name: "Advisory Retainer", price: 1500, lead: 0, per: "mo", from: true,
          scope: ["Ongoing · on call", "Answers in hours, not weeks", "Cancel any month"] };
        return { name: "Advisory Call", price: 250, per: "hour", lead: 2,
          scope: ["One-off · no commitment", "Come with the real question", "Notes afterwards"] };
      },
      recur: function () { return null; }
    }
  };

  window.KC_PRICING = { web: WEB, care: CARE };

  var money = function (n) { return "$" + n.toLocaleString(); };

  /** Earliest start, in BUSINESS days. Never promises a delivery date: the page
   *  says a fixed date is agreed in writing once scope is, and inventing one
   *  here would contradict that on the same screen. */
  function startBy(days) {
    if (!days) return null;
    var d = new Date(), added = 0;
    while (added < days) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) added++; }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function build(host, key) {
    var cfg = P[key];
    if (!cfg) return;                       // unknown product: render nothing
    var state = {};
    cfg.qs.forEach(function (q) { state[q.key] = q.multi ? [] : q.opts[0].v; });

    var wrap = document.createElement("div");
    wrap.className = "quote-card";
    var h = '<div class="quote-h">' + cfg.title + "</div>";
    cfg.qs.forEach(function (q) {
      h += '<div class="quote-q"><span>' + q.label + "</span><div class=\"quote-opts\" data-k=\"" + q.key + '">';
      q.opts.forEach(function (o, i) {
        var on = q.multi ? "" : (i === 0 ? " is-on" : "");
        h += '<button type="button" class="quote-b' + on + '" data-v="' + o.v + '">' + o.t + "</button>";
      });
      h += "</div></div>";
    });
    h += '<div class="quote-out"><div class="quote-amt"></div><div class="quote-name"></div>'
      + '<ul class="quote-scope"></ul><div class="quote-when"></div></div>'
      + '<a class="quote-cta" href="/#contact">Get this in writing</a>'
      + '<p class="quote-note">' + cfg.lead + " A fixed price and a date are agreed in writing before any work begins.</p>";
    wrap.innerHTML = h;
    host.appendChild(wrap);

    function paint() {
      var t = cfg.pick(state), r = cfg.recur ? cfg.recur(state) : null;
      wrap.querySelector(".quote-amt").textContent = t.custom ? "Let's scope it"
        : (t.from ? "from " : "") + money(t.price) + (t.per ? "/" + t.per : "");
      var extra = r ? " + " + money(r.amount) + "/mo " + r.label : "";
      wrap.querySelector(".quote-name").textContent = t.name + extra;
      wrap.querySelector(".quote-scope").innerHTML =
        t.scope.map(function (s) { return "<li>" + s + "</li>"; }).join("");
      var by = startBy(t.lead);
      wrap.querySelector(".quote-when").textContent = by ? "Earliest start: " + by : "";
    }

    wrap.addEventListener("click", function (e) {
      var b = e.target.closest(".quote-b"); if (!b) return;
      var group = b.parentElement, k = group.getAttribute("data-k");
      var q = cfg.qs.filter(function (x) { return x.key === k; })[0];
      if (q.multi) {
        var i = state[k].indexOf(b.getAttribute("data-v"));
        if (i > -1) { state[k].splice(i, 1); b.classList.remove("is-on"); }
        else { state[k].push(b.getAttribute("data-v")); b.classList.add("is-on"); }
      } else {
        state[k] = b.getAttribute("data-v");
        [].forEach.call(group.children, function (c) { c.classList.remove("is-on"); });
        b.classList.add("is-on");
      }
      paint();
    });
    paint();
  }

  function init() {
    [].forEach.call(document.querySelectorAll("[data-quote]"), function (el) {
      if (!el.getAttribute("data-quote-done")) {
        el.setAttribute("data-quote-done", "1");
        build(el, el.getAttribute("data-quote"));
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
