"use strict";
// IASHARK /gb/ acquisition page - GBP pricing display, P0 landing analytics
// (doc 18 S7) and Pro/Edge/Annual Edge checkout wiring against the shared
// create-checkout-session Supabase Edge Function (same client pattern as
// abonnement-page.js/account-page.js's facturation(), with { market: "gb" }
// added to the request body - see supabase/functions/create-checkout-session
// which already resolves a market-specific Stripe price via
// STRIPE_PRICE_ID_GB and returns { processed:false, reason:"market_not_configured" }
// honestly when that env var isn't set, exactly the current real state for GB).
(function () {
  // ---- GBP price display -------------------------------------------------
  // config/markets.json -> gb.currency = "GBP". This page is GBP-only by
  // definition, so we format directly with Intl rather than pulling in the
  // full i18n runtime's currency logic. The HTML already contains a correct
  // hardcoded value in each span (progressive enhancement: price is right
  // even if this script fails to load), this just re-renders it through the
  // real formatter for correctness/consistency.
  try {
    var gbp2 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
    var gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0 });
    var prices = { priceFree: [0, gbp0], pricePro: [14.99, gbp2], priceEdge: [24.99, gbp2], priceAnnual: [199, gbp0] };
    Object.keys(prices).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var amount = prices[id][0], fmt = prices[id][1];
      el.textContent = fmt.format(amount);
    });
  } catch (e) {
    // Formatting failure leaves the hardcoded HTML value in place - never
    // blank, never wrong currency symbol.
  }

  // ---- P0 analytics: landing_view --------------------------------------
  // doc 18 S7 lists country/locale/source/campaign/creative_id as the
  // minimal properties for this event on /gb arrival. funnel-track.js's
  // iasharkTrack(eventType, metadata, userId) already accepts an arbitrary
  // metadata object - nothing in that shared script needed to change.
  function utmParam(name) {
    try { return new URLSearchParams(location.search).get(name) || null; }
    catch (e) { return null; }
  }
  var landingMeta = {
    market: "gb",
    country: "GB",
    locale: "en",
    source: utmParam("utm_source"),
    campaign: utmParam("utm_campaign"),
    creative_id: utmParam("utm_content") || utmParam("creative_id")
  };
  if (window.iasharkTrack) iasharkTrack("landing_view", landingMeta);

  // ---- Checkout wiring ----------------------------------------------------
  // KNOWN LIMITATION, surfaced here rather than hidden: create-checkout-session
  // resolves ONE Stripe price per market (STRIPE_PRICE_ID_GB) - it has no
  // concept yet of Pro vs Edge vs Annual Edge as distinct server-side prices.
  // "Edge" does not exist anywhere else in the codebase as a plan value either
  // (only 'pro' exists on public.users.plan - checked against
  // supabase/functions/match-data and account-page.js). Until real per-tier
  // Stripe prices exist and the function is extended to resolve them, all
  // three buttons below call the same endpoint with the same { market: "gb" }
  // body, and - today, with STRIPE_PRICE_ID_GB unset - all get back
  // processed:false/reason:"market_not_configured" from the server. That is
  // shown to the visitor honestly below, never papered over with a fake URL.
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
        // pointed at the EN account page (a market like "gb" has no account
        // pages of its own - only /en/ compte.html, translated and working).
        location.href = "/en/compte.html#plan";
        return;
      }

      btn.disabled = true;
      show("Opening secure checkout…");
      if (window.iasharkTrack) iasharkTrack("checkout_started", { market: "gb", tier: tierLabel });

      try {
        var session = await window.IasharkApp.supabase.auth.getSession();
        var token = session.data.session && session.data.session.access_token;
        var response = await fetch(window.IasharkApp.url + "/functions/v1/create-checkout-session", {
          method: "POST",
          headers: { apikey: window.IasharkApp.key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ market: "gb" })
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
          iasharkTrack("checkout_unavailable", { market: "gb", tier: tierLabel, reason: (data && data.reason) || "payment_disabled" });
        }
        show("Checkout for the UK is opening shortly — thanks for your patience. Nothing has been charged.", true);
      } catch (e) {
        if (window.iasharkTrack) iasharkTrack("checkout_unavailable", { market: "gb", tier: tierLabel, reason: "network_error" });
        show("Could not open checkout right now. Please try again shortly.", true);
      }
      btn.disabled = false;
    });
  }

  wireCheckout("subscribeProBtn", "proMsg", "pro");
  wireCheckout("subscribeEdgeBtn", "edgeMsg", "edge");
  wireCheckout("subscribeAnnualBtn", "annualMsg", "annual_edge");
})();
