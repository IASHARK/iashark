"use strict";
// IASHARK /za/ acquisition page - ZAR pricing display, P0 landing analytics
// (doc 18 S7 pattern, applied per-market) and Pro/Edge/Annual Edge checkout
// wiring against the shared create-checkout-session Supabase Edge Function
// (same client pattern as abonnement-page.js/account-page.js's facturation(),
// with { market: "za" } added to the request body - see
// supabase/functions/create-checkout-session which already resolves a
// market-specific Stripe price via STRIPE_PRICE_ID_ZA and returns
// { processed:false, reason:"market_not_configured" } honestly when that env
// var isn't set, exactly the current real state for ZA). Built as the direct
// South African counterpart of gb/gb-page.js - same structure, same honesty
// discipline, currency and market code swapped.
(function () {
  // ---- Price display ------------------------------------------------------
  // Prices come from lib/market-config.js (window.IASHARK_MARKET, built from
  // config/markets.json), which fills every [data-market-price] element of
  // this page: no second copy of the ZAR amounts lives here any more. The
  // HTML keeps the same values as a no-JS fallback.

  // ---- P0 analytics: landing_view --------------------------------------
  // doc 18 S7 lists country/locale/source/campaign/creative_id as the
  // minimal properties for this event on market-page arrival. funnel-track.js's
  // iasharkTrack(eventType, metadata, userId) already accepts an arbitrary
  // metadata object - nothing in that shared script needed to change.
  function utmParam(name) {
    try { return new URLSearchParams(location.search).get(name) || null; }
    catch (e) { return null; }
  }
  var landingMeta = {
    market: "za",
    country: "ZA",
    locale: "en",
    source: utmParam("utm_source"),
    campaign: utmParam("utm_campaign"),
    creative_id: utmParam("utm_content") || utmParam("creative_id")
  };
  if (window.iasharkTrack) iasharkTrack("landing_view", landingMeta);

  // ---- Checkout wiring ----------------------------------------------------
  // KNOWN LIMITATION, surfaced here rather than hidden: create-checkout-session
  // resolves ONE Stripe price per market (STRIPE_PRICE_ID_ZA) - it has no
  // concept yet of Pro vs Edge vs Annual Edge as distinct server-side prices.
  // "Edge" does not exist anywhere else in the codebase as a plan value either
  // (only 'pro' exists on public.users.plan - checked against
  // supabase/functions/match-data and account-page.js). Until real per-tier
  // Stripe prices exist and the function is extended to resolve them, all
  // three buttons below call the same endpoint with the same { market: "za" }
  // body, and - today, with STRIPE_PRICE_ID_ZA unset - all get back
  // processed:false/reason:"market_not_configured" from the server. That is
  // shown to the visitor honestly below, never papered over with a fake URL.
  // South Africa is also, per the launch kit's own framing, "a test market -
  // no paid [ads] before the necessary approvals" - this honest "coming soon"
  // messaging matters more here, not less.
  // ---- Consent before payment -------------------------------------------
  // lib/checkout-consent.js renders the required boxes (Terms + consent to the
  // service starting before the 7-day cooling-off period ends, ECT Act
  // s42(2)(d)) into #checkoutConsent and keeps the three pay buttons
  // aria-disabled until they are ticked. create-checkout-session re-checks the
  // same consent server-side. Fails closed: if the module cannot load, no
  // checkout call is ever made.
  var consentReady = new Promise(function (resolve) {
    function mountIt() {
      var lib = window.IasharkCheckoutConsent;
      var box = document.getElementById("checkoutConsent");
      resolve(lib && box ? lib.mount(box, {
        buttons: ["subscribeProBtn", "subscribeEdgeBtn", "subscribeAnnualBtn"].map(function (id) { return document.getElementById(id); })
      }) : null);
    }
    if (window.IasharkCheckoutConsent) return mountIt();
    var s = document.createElement("script");
    s.src = "/lib/checkout-consent.js";
    s.onload = mountIt;
    s.onerror = function () { resolve(null); };
    document.head.appendChild(s);
  });

  function wireCheckout(buttonId, msgId, tierLabel) {
    var btn = document.getElementById(buttonId);
    var msg = document.getElementById(msgId);
    if (!btn) return;

    function show(text, isError) {
      if (!msg) return;
      msg.textContent = text;
      msg.className = "plan-msg" + (isError ? " error" : "");
    }

    btn.addEventListener("click", async function () {
      var consent = await consentReady;
      if (!consent) {
        show("The payment conditions could not be loaded. Please reload the page.", true);
        return;
      }
      if (!consent.check()) {
        show(consent.text("error_required"), true);
        return;
      }
      if (!window.IasharkApp) {
        show("Checkout is still loading — please try again in a moment.", true);
        return;
      }
      var ctx;
      try {
        ctx = await window.IasharkApp.context();
      } catch (e) {
        show("Could not check your account. Please try again shortly.", true);
        return;
      }
      if (!ctx.user) {
        // /za/ has its own generated account page (scripts/build-locales.js).
        location.href = "/za/compte.html#plan";
        return;
      }

      btn.disabled = true;
      show("Opening secure checkout…");
      if (window.iasharkTrack) iasharkTrack("checkout_started", { market: "za", tier: tierLabel });

      try {
        var session = await window.IasharkApp.supabase.auth.getSession();
        var token = session.data.session && session.data.session.access_token;
        var response = await fetch(window.IasharkApp.url + "/functions/v1/create-checkout-session", {
          method: "POST",
          headers: { apikey: window.IasharkApp.key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ market: "za", dir: "za", consent: consent.payload() })
        });
        var data = await response.json();
        if (data && data.url) {
          location.href = data.url;
          return;
        }
        if (data && data.code === "consent_required") {
          consent.check();
          show(data.message || consent.text("error_required"), true);
          btn.disabled = false;
          return;
        }
        // Honest "coming soon" - matches the site's existing
        // PAYMENT_PROVIDER=disabled messaging pattern (abonnement-page.js /
        // account-page.js), covers both processed:false shapes the function
        // can return (generic disabled, and reason:"market_not_configured").
        if (window.iasharkTrack) {
          iasharkTrack("checkout_unavailable", { market: "za", tier: tierLabel, reason: (data && data.reason) || "payment_disabled" });
        }
        show("Checkout for South Africa is opening shortly — thanks for your patience. Nothing has been charged.", true);
      } catch (e) {
        if (window.iasharkTrack) iasharkTrack("checkout_unavailable", { market: "za", tier: tierLabel, reason: "network_error" });
        show("Could not open checkout right now. Please try again shortly.", true);
      }
      btn.disabled = false;
    });
  }

  wireCheckout("subscribeProBtn", "proMsg", "pro");
  wireCheckout("subscribeEdgeBtn", "edgeMsg", "edge");
  wireCheckout("subscribeAnnualBtn", "annualMsg", "annual_edge");
})();
