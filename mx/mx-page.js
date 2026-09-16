"use strict";
// IASHARK /mx/ acquisition page - MXN pricing display, P0 landing analytics
// (doc 18 S7) and Pro checkout wiring (single plan sold weekly, monthly or annually) against the shared
// create-checkout-session Supabase Edge Function. Mirrors gb/gb-page.js
// exactly (same client pattern as abonnement-page.js/account-page.js's
// facturation(), with { market: "mx" } added to the request body - see
// supabase/functions/create-checkout-session, which resolves the Stripe price
// for this market and billing period (STRIPE_PRICE_ID_MX_WEEK / _MONTH / _YEAR)
// and returns { processed:false, reason:"interval_not_configured" |
// "market_not_configured" } honestly when the matching secret isn't set).
(function () {
  // ---- Price display ------------------------------------------------------
  // Prices come from lib/market-config.js (window.IASHARK_MARKET, built from
  // config/markets.json), which fills every [data-market-price] element of
  // this page: no second copy of the MXN amounts lives here any more. The
  // HTML keeps the same values as a no-JS fallback.

  // ---- P0 analytics: landing_view --------------------------------------
  // doc 18 S7 lists country/locale/source/campaign/creative_id as the
  // minimal properties for this event on /mx arrival. funnel-track.js's
  // iasharkTrack(eventType, metadata, userId) already accepts an arbitrary
  // metadata object - nothing in that shared script needed to change (same
  // shared script GB uses, verified unchanged before writing this file).
  function utmParam(name) {
    try { return new URLSearchParams(location.search).get(name) || null; }
    catch (e) { return null; }
  }
  var landingMeta = {
    market: "mx",
    country: "MX",
    locale: "es-mx",
    source: utmParam("utm_source"),
    campaign: utmParam("utm_campaign"),
    creative_id: utmParam("utm_content") || utmParam("creative_id")
  };
  if (window.iasharkTrack) iasharkTrack("landing_view", landingMeta);

  // ---- Checkout wiring ----------------------------------------------------
  // Single Pro plan (owner decision 16/09/2026, the former second paid
  // tier is abandoned) sold weekly, monthly or annually. The visitor picks the billing
  // period in lib/pro-plan-picker.js (month pre-selected); the request body
  // carries it as { interval }. create-checkout-session resolves the Stripe
  // Price for this market AND period (STRIPE_PRICE_ID_MX_WEEK / _MONTH / _YEAR),
  // checks it matches the displayed price, and never falls back to another
  // period, price or currency: a missing Price comes back as processed:false
  // (interval_not_configured / market_not_configured), shown honestly below.
  var picker = (window.IasharkProPlanPicker && document.getElementById("proPlanPicker"))
    ? window.IasharkProPlanPicker.mount(document.getElementById("proPlanPicker"), {})
    : null;
  // Duree vendue mais Price Stripe absent cote serveur : marquee "coming soon"
  // des l'affichage (create-checkout-session, mode availability).
  if (picker) picker.loadAvailability();

  // ---- Consentimiento antes del pago ------------------------------------
  // lib/checkout-consent.js muestra en #checkoutConsent la casilla obligatoria
  // (Términos y condiciones + consentimiento expreso al cobro recurrente, LFPC
  // art. 76 Bis VIII) y una línea informativa; no se pide ninguna renuncia
  // (LFPC art. 1, derechos irrenunciables). El botón de pago queda
  // aria-disabled hasta marcarla. create-checkout-session vuelve a verificar
  // el consentimiento en el servidor. Si el módulo no carga, no se llama al
  // checkout.
  var consentReady = new Promise(function (resolve) {
    function mountIt() {
      var lib = window.IasharkCheckoutConsent;
      var box = document.getElementById("checkoutConsent");
      resolve(lib && box ? lib.mount(box, {
        buttons: ["subscribeProBtn"].map(function (id) { return document.getElementById(id); }).filter(Boolean)
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
        show("No pudimos cargar las condiciones de pago. Vuelve a cargar la página.", true);
        return;
      }
      if (!consent.check()) {
        // Le bloc de consentement affiche deja le message d'erreur : un seul
        // message a l'ecran (audit QA 14/09/2026).
        show("", false);
        return;
      }
      if (!window.IasharkApp) {
        show("El checkout todavía se está cargando — inténtalo de nuevo en un momento.", true);
        return;
      }
      var ctx;
      try {
        ctx = await window.IasharkApp.context();
      } catch (e) {
        show("No pudimos verificar tu cuenta. Inténtalo de nuevo en un momento.", true);
        return;
      }
      if (!ctx.user) {
        // Same convention as abonnement-page.js's /compte.html#plan redirect
        // and gb-page.js's own /en/compte.html#plan redirect. A market like
        // "mx" has no account pages of its own. Its underlying interface
        // locale is "es-mx" (i18n/i18n.js MARKET_LOCALE), but unlike GB's
        // "en" - which has a full /en/ page set - there is NO /es-mx/
        // directory anywhere in this repo (verified: no compte.html/pro.html
        // exist under an /es-mx/ prefix). Redirecting there would 404. /es/
        // (Spain Spanish) is the nearest real, working account page - same
        // "nearest existing locale" fallback this page's own HTML already
        // uses for the Track Record link (see mx/index.html comment next to
        // that link), and now also the fallback bottom-navigation.js's own
        // MARKET_PAGE_LOCALE map uses for the shared Tools/Account nav
        // (fixed - see GEO_EXPANSION_STATUS.md).
        // Superseded 2026-09-13: /mx/ now has its own generated compte.html
        // (scripts/build-locales.js), so the /es/ fallback above no longer applies.
        location.href = "/mx/compte.html#plan";
        return;
      }

      var interval = picker ? picker.interval() : "month";
      if (picker && !picker.isAvailable()) {
        show("Este plazo todavía no está disponible para pagar. Elige otro plazo o vuelve pronto. No se hizo ningún cargo.", true);
        return;
      }
      btn.disabled = true;
      show("Abriendo el pago seguro…");
      if (window.iasharkTrack) iasharkTrack("checkout_started", { market: "mx", tier: tierLabel, interval: interval });

      try {
        var session = await window.IasharkApp.supabase.auth.getSession();
        var token = session.data.session && session.data.session.access_token;
        var response = await fetch(window.IasharkApp.url + "/functions/v1/create-checkout-session", {
          method: "POST",
          headers: { apikey: window.IasharkApp.key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ market: "mx", dir: "mx", interval: interval, consent: consent.payload() })
        });
        var data = await response.json();
        if (data && data.url) {
          location.href = data.url;
          return;
        }
        if (data && data.code === "consent_required") {
          // Cases decochees : le bloc affiche son message. Cases cochees mais
          // refus serveur (version des CGV...) : message du serveur ici.
          if (consent.check()) show(data.message || consent.text("error_required"), true);
          else show("", false);
          btn.disabled = false;
          return;
        }
        // Honest "próximamente" - matches the site's existing
        // PAYMENT_PROVIDER=disabled messaging pattern (abonnement-page.js /
        // account-page.js / gb-page.js), covers both processed:false shapes
        // the function can return (generic disabled, and
        // reason:"market_not_configured" when no MX price secret is set yet).
        if (data && data.reason === "already_subscribed") {
          show("Ya tienes una suscripción Pro. Para cambiar de plazo, entra a tu cuenta.", true);
          btn.disabled = false;
          return;
        }
        if (data && data.reason === "interval_not_configured") {
          if (window.iasharkTrack) iasharkTrack("checkout_unavailable", { market: "mx", tier: tierLabel, interval: interval, reason: "interval_not_configured" });
          show("Este plazo todavía no está disponible para pagar. Elige otro plazo o vuelve pronto. No se hizo ningún cargo.", true);
          btn.disabled = false;
          return;
        }
        if (window.iasharkTrack) {
          iasharkTrack("checkout_unavailable", { market: "mx", tier: tierLabel, reason: (data && data.reason) || "payment_disabled" });
        }
        show("El checkout para México se abrirá muy pronto — gracias por tu paciencia. No se te ha cobrado nada.", true);
      } catch (e) {
        if (window.iasharkTrack) iasharkTrack("checkout_unavailable", { market: "mx", tier: tierLabel, reason: "network_error" });
        show("No pudimos abrir el checkout en este momento. Inténtalo de nuevo en un momento.", true);
      }
      btn.disabled = false;
    });
  }

  // Un seul bouton de paiement : l'offre Pro, avec la duree choisie.
  wireCheckout("subscribeProBtn", "proMsg", "pro");
})();
