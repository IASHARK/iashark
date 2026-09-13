"use strict";
// IASHARK /mx/ acquisition page - MXN pricing display, P0 landing analytics
// (doc 18 S7) and Pro/Edge/Annual Edge checkout wiring against the shared
// create-checkout-session Supabase Edge Function. Mirrors gb/gb-page.js
// exactly (same client pattern as abonnement-page.js/account-page.js's
// facturation(), with { market: "mx" } added to the request body - see
// supabase/functions/create-checkout-session which already resolves a
// market-specific Stripe price via STRIPE_PRICE_ID_MX and returns
// { processed:false, reason:"market_not_configured" } honestly when that env
// var isn't set, exactly the current real state for MX - confirmed by
// reading resolvePriceId()/MARKET_ENV_KEYS in that function before writing
// this file).
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
  // KNOWN LIMITATION, surfaced here rather than hidden (same discipline as
  // gb-page.js): create-checkout-session resolves ONE Stripe price per
  // market (STRIPE_PRICE_ID_MX) - it has no concept yet of Pro vs Edge vs
  // Annual Edge as distinct server-side prices, and "Edge" does not exist
  // anywhere else in the codebase as a plan value (only 'pro' exists on
  // public.users.plan). Until real per-tier Stripe prices exist and the
  // function is extended to resolve them, all three buttons below call the
  // same endpoint with the same { market: "mx" } body, and - today, with
  // STRIPE_PRICE_ID_MX unset - all get back processed:false /
  // reason:"market_not_configured" from the server. That is shown to the
  // visitor honestly below, in Mexican Spanish, never papered over with a
  // fake URL or a fake success state.
  // ---- Consentimiento antes del pago ------------------------------------
  // lib/checkout-consent.js muestra en #checkoutConsent la casilla obligatoria
  // (Términos y condiciones + consentimiento expreso al cobro recurrente, LFPC
  // art. 76 Bis VIII) y una línea informativa; no se pide ninguna renuncia
  // (LFPC art. 1, derechos irrenunciables). Los tres botones quedan
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

      btn.disabled = true;
      show("Abriendo el pago seguro…");
      if (window.iasharkTrack) iasharkTrack("checkout_started", { market: "mx", tier: tierLabel });

      try {
        var session = await window.IasharkApp.supabase.auth.getSession();
        var token = session.data.session && session.data.session.access_token;
        var response = await fetch(window.IasharkApp.url + "/functions/v1/create-checkout-session", {
          method: "POST",
          headers: { apikey: window.IasharkApp.key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ market: "mx", dir: "mx", consent: consent.payload() })
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
        // reason:"market_not_configured", which is the real current state
        // for MX since STRIPE_PRICE_ID_MX is not set - confirmed by reading
        // supabase/functions/create-checkout-session before writing this).
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

  // Seul Pro est propose (audit QA 14/09/2026) : les cartes Edge et Annual
  // Edge sont retirees de la page tant que create-checkout-session ne connait
  // qu'un prix Stripe par marche (voir KNOWN LIMITATION ci-dessus). Aucun
  // bouton Edge/Annual n'est cable : rien ne peut facturer le mauvais plan.
  wireCheckout("subscribeProBtn", "proMsg", "pro");
})();
