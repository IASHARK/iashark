/* IASHARK — consentement obligatoire avant tout paiement.
   Utilise par chaque point d'entree du checkout (abonnement-page.js,
   account-page.js, gb/gb-page.js, za/za-page.js, mx/mx-page.js) AVANT l'appel a
   la fonction Edge create-checkout-session, qui refait la meme verification
   cote serveur (supabase/functions/create-checkout-session/consent.ts) : les
   cases ne sont jamais la seule barriere.

   Regime par marche (lib/market-config.js -> IASHARK_MARKET.code) :
   - fr (repertoires fr en es de it pt, pages racine) -> "eu" : CGV + demande
     expresse d'execution immediate avec paiement proportionnel en cas de
     retractation (C. conso. L221-25 ; CJUE C-234/25 du 9/07/2026).
   - gb -> "uk" : CGV + express consent/acknowledgement (CCR 2013 reg. 36/37).
   - za -> "za" : CGV + consent to immediate start (ECT Act s42(2)(d)).
   - mx -> "mx" : une seule case (CGV + consentement expres au cobro recurrente,
     LFPC art. 76 Bis VIII) et une ligne d'information ; aucune renonciation
     (LFPC art. 1, droits irrenunciables).
   Les textes vivent dans i18n/parts/checkout.<locale>.json (cle
   checkout_consent.*). Aucune case n'est pre-cochee.

   API : IasharkCheckoutConsent.mount(container, {buttons}) -> controleur
     {check(), isValid(), payload(), text(key), regime, el}
   Fonctions pures exposees pour les tests : regimeFor, buildHtml, missing,
   buildPayload. */
(function (global) {
  "use strict";

  // Date de la version des CGV a laquelle le consentement se rapporte.
  // A mettre a jour en meme temps que la mention "Derniere mise a jour" des
  // pages legal/<dir>/cgv.html.
  // 19/09/2026 : les CGV des 9 versions changent ensemble (durees ouvertes au
  // paiement par marche, offre USD mensuelle de /en/, mention de franchise en
  // base de TVA « art. 293 B du CGI ») ; versions precedentes archivees dans
  // legal/<dir>/archives/cgv-<date>.html (fr : 2026-09-16 et 2026-09-18 ;
  // autres : 2026-09-16).
  var TERMS_VERSION = "2026-09-19";
  // Version propre a un repertoire quand ses CGV changent seules (ex. 18/09/2026 :
  // fr et pages racine, francaises, en "2026-09-18"). Aucune depuis le 19/09/2026.
  var TERMS_VERSIONS = {};
  function termsVersionFor(dir) {
    var d = typeof dir === "string" ? dir : "";
    return Object.prototype.hasOwnProperty.call(TERMS_VERSIONS, d) ? TERMS_VERSIONS[d] : TERMS_VERSION;
  }

  var REGIMES = {
    eu: { id: "eu", waiverRequired: true, termsKey: "terms_label", waiverKey: "waiver_eu", infoKey: null },
    uk: { id: "uk", waiverRequired: true, termsKey: "terms_label", waiverKey: "waiver_uk", infoKey: null },
    za: { id: "za", waiverRequired: true, termsKey: "terms_label", waiverKey: "waiver_za", infoKey: null },
    mx: { id: "mx", waiverRequired: false, termsKey: "terms_label_recurring", waiverKey: null, infoKey: "info_mx" }
  };
  var MARKET_REGIME = { fr: "eu", gb: "uk", za: "za", mx: "mx" };

  // Repli francais uniquement si le dictionnaire ne se charge pas du tout.
  var FALLBACK = {
    title: "Avant de payer",
    terms_label: "J’ai lu et j’accepte les {terms} et j’ai pris connaissance de la {privacy}.",
    terms_label_recurring: "J’ai lu et j’accepte les {terms}, j’ai pris connaissance de la {privacy} et je consens expressément au prélèvement automatique récurrent de l’offre choisie, au montant et à la fréquence indiqués avant le paiement, jusqu’à ma résiliation.",
    terms_link: "Conditions générales de vente",
    privacy_link: "Politique de confidentialité",
    waiver_eu: "Je demande que mon abonnement commence immédiatement, avant la fin du délai de rétractation de 14 jours. Je reconnais que, si je me rétracte pendant ce délai, je devrai payer un montant proportionnel au service fourni jusqu’à ma rétractation.",
    waiver_uk: "Je demande que mon abonnement commence immédiatement et je reconnais perdre mon droit d’annulation de 14 jours dès que j’accède au contenu numérique. Si la loi traite une partie de l’abonnement comme un service et que j’annule dans les 14 jours, je paierai un montant proportionnel à ce qui a été fourni.",
    waiver_za: "J’accepte que mon abonnement commence immédiatement, avant la fin du délai de réflexion de 7 jours, et je comprends que ce délai de réflexion prévu par l’ECT Act ne s’applique alors plus.",
    info_mx: "Vous pouvez annuler votre abonnement à tout moment et immédiatement depuis votre compte. Rien de ce qui est accepté ici ne limite vos droits prévus par la Ley Federal de Protección al Consumidor.",
    error_required: "Cochez les cases obligatoires ci-dessus pour continuer vers le paiement.",
    error_load: "Les conditions de paiement n’ont pas pu être chargées. Rechargez la page.",
    required: "obligatoire"
  };

  var hasOwn = Object.prototype.hasOwnProperty;

  function regimeFor(market) {
    var key = String(market || "").toLowerCase();
    return REGIMES[hasOwn.call(MARKET_REGIME, key) ? MARKET_REGIME[key] : "eu"];
  }

  function currentMarket() {
    var M = global.IASHARK_MARKET;
    if (M && typeof M.code === "string" && M.code) return M.code;
    var I = global.I18N;
    if (I && typeof I.market === "string" && I.market) return I.market;
    var seg = "";
    try { seg = (String(global.location.pathname).match(/^\/([a-z]{2})(?:\/|$)/) || [])[1] || ""; } catch (e) {}
    return MARKET_REGIME[seg] ? seg : "fr";
  }

  function text(key) {
    var I = global.I18N;
    var fallback = FALLBACK[key];
    if (I && typeof I.t === "function" && I.dict) {
      var v = I.t("checkout_consent." + key, null);
      if (typeof v === "string" && v) return v;
    }
    return fallback;
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function href(page) {
    var I = global.I18N;
    if (I && typeof I.href === "function") { try { var h = I.href(page); if (h) return h; } catch (e) {} }
    return "/" + page;
  }

  // Texte -> HTML : tout est echappe, puis seuls {terms} et {privacy} deviennent
  // des liens (nouvel onglet : cocher puis lire ne perd pas l'etat de la page).
  function withLinks(raw, t, hrefs) {
    var link = function (url, label) {
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label) + "</a>";
    };
    return esc(raw)
      .replace("{terms}", link(hrefs.terms, t("terms_link")))
      .replace("{privacy}", link(hrefs.privacy, t("privacy_link")));
  }

  // HTML du bloc. `t` = fonction de traduction, `hrefs` = {terms, privacy},
  // `uid` = suffixe d'identifiants (plusieurs blocs possibles sur une page).
  // UNE SEULE CASE (decision du proprietaire du 19/09/2026 : un clic de moins
  // avant le paiement) : quand le regime exige la demande expresse de debut
  // immediat (eu/uk/za), son texte complet figure dans la meme case que
  // l'acceptation des CGV, en toutes lettres - jamais seulement dans les CGV.
  // Cocher la case vaut les deux accords (data-consent-with="waiver") ; le
  // serveur (consent.ts) recoit toujours terms ET waiver.
  function buildHtml(regime, t, hrefs, uid) {
    var id = "iashConsent" + (uid || "");
    var html = '<p class="iash-consent-title">' + esc(t("title")) + "</p>"
      + '<label class="iash-consent-row" for="' + id + 'Terms">'
      + '<input type="checkbox" id="' + id + 'Terms" data-consent="terms"' + (regime.waiverKey ? ' data-consent-with="waiver"' : "") + ' required aria-required="true">'
      + "<span>" + withLinks(t(regime.termsKey), t, hrefs)
      + (regime.waiverKey ? " " + esc(t(regime.waiverKey)) : "")
      + ' <span class="iash-consent-req">(' + esc(t("required")) + ")</span></span></label>";
    if (regime.infoKey) html += '<p class="iash-consent-info">' + esc(t(regime.infoKey)) + "</p>";
    html += '<p class="iash-consent-error" role="alert" hidden></p>';
    return html;
  }

  // Cases obligatoires non cochees. state = {terms: bool, waiver: bool}.
  function missing(state, regime) {
    var out = [];
    if (!state || state.terms !== true) out.push("terms");
    if (regime.waiverRequired && (!state || state.waiver !== true)) out.push("waiver");
    return out;
  }

  // Corps "consent" envoye a create-checkout-session.
  function buildPayload(state, regime, ctx) {
    ctx = ctx || {};
    return {
      terms: !!(state && state.terms === true),
      waiver: regime.waiverRequired ? !!(state && state.waiver === true) : null,
      terms_version: termsVersionFor(ctx.dir || ""),
      locale: ctx.locale || "fr",
      dir: ctx.dir || "",
      ts: ctx.ts || new Date().toISOString()
    };
  }

  var STYLE_ID = "iash-consent-style";
  var CSS = ""
    + ".iash-consent{margin:18px 0 16px;padding:14px 16px;border:1px solid rgba(141,179,211,.2);border-radius:12px;background:rgba(255,255,255,.025);text-align:left;font-family:inherit}"
    + ".iash-consent-title{margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#a6b4c6}"
    + ".iash-consent-row{display:flex;gap:10px;align-items:flex-start;margin:0 0 10px;font-size:13px;line-height:1.55;color:#dbe4ee;cursor:pointer;text-transform:none;letter-spacing:normal}"
    + ".iash-consent-row:last-of-type{margin-bottom:0}"
    + ".iash-consent-row input{flex:none;width:18px;height:18px;margin:2px 0 0;accent-color:var(--cyan,#20d5ef);cursor:pointer}"
    + ".iash-consent-row input:focus-visible{outline:2px solid var(--cyan,#20d5ef);outline-offset:2px}"
    + ".iash-consent-row.is-missing{color:#ffd7a8}"
    + ".iash-consent-row.is-missing input{outline:2px solid #f59e0b;outline-offset:2px}"
    + ".iash-consent a{color:var(--cyan,#20d5ef);text-decoration:underline;text-underline-offset:2px}"
    + ".iash-consent-req{color:#8193a8;font-size:11.5px}"
    + ".iash-consent-info{margin:10px 0 0;font-size:12px;line-height:1.55;color:#a6b4c6}"
    + ".iash-consent-error{margin:10px 0 0;font-size:12.5px;line-height:1.5;color:#f59e0b;font-weight:600}"
    + ".iash-consent-locked[aria-disabled=\"true\"]{opacity:.5;cursor:not-allowed;filter:saturate(.6)}";

  function injectStyle(doc) {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var s = doc.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  // Charge le dictionnaire si la page ne l'a pas encore fait (landings pays).
  function ensureDict() {
    var I = global.I18N;
    if (!I || I.dict || typeof I.init !== "function") return Promise.resolve();
    return I.init().then(function () {}, function () {});
  }

  var counter = 0;

  function mount(container, options) {
    options = options || {};
    if (!container) return null;
    var doc = container.ownerDocument || global.document;
    injectStyle(doc);
    var regime = regimeFor(options.market || currentMarket());
    var uid = String(++counter);
    var buttons = (options.buttons || []).filter(Boolean);
    var state = { terms: false, waiver: false };

    container.classList.add("iash-consent");
    container.setAttribute("data-consent-regime", regime.id);

    function hrefs() { return { terms: href("cgv.html"), privacy: href("confidentialite.html") }; }

    function input(name) { return container.querySelector('[data-consent="' + name + '"]'); }

    function errorEl() { return container.querySelector(".iash-consent-error"); }

    function syncButtons() {
      var ok = missing(state, regime).length === 0;
      buttons.forEach(function (b) {
        b.classList.add("iash-consent-locked");
        b.setAttribute("aria-disabled", ok ? "false" : "true");
      });
      if (ok) {
        var e = errorEl();
        if (e) { e.hidden = true; e.textContent = ""; }
        ["terms", "waiver"].forEach(function (n) {
          var i = input(n);
          if (i && i.parentNode) { i.parentNode.classList.remove("is-missing"); i.removeAttribute("aria-invalid"); }
        });
      }
    }

    function render() {
      container.innerHTML = buildHtml(regime, text, hrefs(), uid);
      ["terms", "waiver"].forEach(function (n) {
        var i = input(n);
        if (!i) return;
        i.checked = state[n] === true;
        i.addEventListener("change", function () {
          state[n] = i.checked;
          // Case unique : elle porte aussi la demande de debut immediat.
          var also = i.getAttribute("data-consent-with");
          if (also) state[also] = i.checked;
          if (i.checked && i.parentNode) { i.parentNode.classList.remove("is-missing"); i.removeAttribute("aria-invalid"); }
          syncButtons();
        });
      });
      syncButtons();
    }

    render();
    // Re-rendu dans la langue de la page des que le dictionnaire est pret.
    if (global.I18N && !global.I18N.dict) ensureDict().then(render);

    var controller = {
      regime: regime,
      el: container,
      text: text,
      isValid: function () { return missing(state, regime).length === 0; },
      missing: function () { return missing(state, regime); },
      // A appeler au clic sur un bouton de paiement : false (et message
      // d'erreur traduit, focus sur la premiere case manquante) si une case
      // obligatoire n'est pas cochee.
      check: function () {
        var miss = missing(state, regime);
        if (!miss.length) return true;
        miss.forEach(function (n) {
          var i = input(n);
          if (i && i.parentNode) { i.parentNode.classList.add("is-missing"); i.setAttribute("aria-invalid", "true"); }
        });
        var e = errorEl();
        if (e) { e.textContent = text("error_required"); e.hidden = false; }
        var first = input(miss[0]);
        if (first && typeof first.focus === "function") { try { first.focus(); } catch (err) {} }
        return false;
      },
      payload: function () {
        var I = global.I18N, M = global.IASHARK_MARKET;
        return buildPayload(state, regime, {
          locale: (I && I.locale) || "fr",
          dir: (M && typeof M.dir === "string") ? M.dir : ((I && I.dir) || "")
        });
      }
    };
    return controller;
  }

  global.IasharkCheckoutConsent = {
    TERMS_VERSION: TERMS_VERSION,
    TERMS_VERSIONS: TERMS_VERSIONS,
    termsVersionFor: termsVersionFor,
    REGIMES: REGIMES,
    regimeFor: regimeFor,
    currentMarket: currentMarket,
    buildHtml: buildHtml,
    missing: missing,
    buildPayload: buildPayload,
    text: text,
    mount: mount
  };
})(typeof window !== "undefined" ? window : this);
