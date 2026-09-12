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
  // ---- ZAR price display --------------------------------------------------
  // config/markets.json -> za.currency = "ZAR". This page is ZAR-only by
  // definition, so we format directly with Intl rather than pulling in the
  // full i18n runtime's currency logic. The HTML already contains a correct
  // hardcoded value in each span (progressive enhancement: price is right
  // even if this script fails to load), this just re-renders it through the
  // real formatter for correctness/consistency. South Africa Launch Kit
  // (doc 08 S1) prices: Pro R199, Edge R299, Annual R1,999 - whole-Rand
  // amounts, so no fraction digits needed for any tier.
  try {
    var zar0 = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 0 });
    var prices = { priceFree: 0, pricePro: 199, priceEdge: 299, priceAnnual: 1999 };
    Object.keys(prices).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = zar0.format(prices[id]);
    });
  } catch (e) {
    // Formatting failure leaves the hardcoded HTML value in place - never
    // blank, never wrong currency symbol.
  }

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
        // Same convention as abonnement-page.js's /compte.html#plan redirect,
        // pointed at the EN account page (a market like "za" has no account
        // pages of its own - only /en/ compte.html, translated and working).
        location.href = "/en/compte.html#plan";
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
          body: JSON.stringify({ market: "za" })
        });
        var data = await response.json();
        if (data && data.url) {
          location.href = data.url;
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
