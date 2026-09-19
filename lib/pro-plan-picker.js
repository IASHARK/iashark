/* IASHARK — selecteur de duree de l'offre Pro (Semaine / Mois / Annee).
   Offre UNIQUE (decision du proprietaire du 16/09/2026) : la duree ne change
   que la frequence et le montant du prelevement, jamais l'acces. Utilise par
   abonnement-page.js, account-page.js et les landings pays gb/za/mx, sur
   mobile comme sur desktop (meme composant, memes donnees, memes droits :
   seule la grille CSS s'adapte a la largeur).

   Donnees : window.IASHARK_MARKET.proOffer() (lib/market-config.js, depuis
   config/markets.json). Equivalent mensuel et economie CALCULES par
   market-config.js, jamais saisis. Une duree sans prix dans le marche n'est
   pas affichee (ZA : pas d'annuel au lancement).
   Durees NON PAYABLES = MASQUEES (decision du proprietaire du 19/09/2026 :
   « Bientot disponible » faisait hesiter) : une duree fermee par la
   configuration (config/markets.json#<marche>.checkoutOpen -> open:false) ou
   declaree fermee par le serveur (loadAvailability : availability[iv] ===
   false) n'est pas rendue du tout ; elle reapparait d'elle-meme des que la
   configuration ou le serveur l'ouvre. Disponibilite inconnue (ancienne
   fonction, erreur reseau) = on garde les durees ouvertes par la
   configuration, jamais tout masquer sur une supposition.
   Une seule duree visible : prix seul, sans bouton radio ni « Choisis ta
   duree ». Aucune duree payable : une ligne « paiement pas encore ouvert,
   aucun montant preleve » (pro_plans.closed) a la place des prix ; la page
   masque alors son bouton (option onUpdate).
   Textes : dictionnaire i18n, cle pro_plans.* (i18n/parts/site.<locale>.json) ;
   option `labels` pour forcer des libelles ; repli francais.
   Aucune duree n'est mise en avant : "month" est coche par defaut
   (config/markets.json#_proDefaultInterval), le visiteur choisit.

   API : IasharkProPlanPicker.mount(container, {market, labels, interval, onChange, onUpdate})
     -> {el, offer, interval(), visible(), isAvailable(iv), setAvailability(map), loadAvailability()}
     onUpdate(visible) : appele apres chaque rendu avec la liste des durees
     affichees (payables) ; [] = aucune duree payable.
   Fonctions pures exposees pour les tests : buildHtml, pickDefault, visibleIntervals, textFor. */
(function (global) {
  "use strict";

  var FALLBACK = {
    legend: "Choisis ta durée",
    week_label: "Semaine", month_label: "Mois", year_label: "Année",
    per_week: "/ semaine", per_month: "/ mois", per_year: "/ an",
    year_equiv: "soit {price} / mois",
    year_savings: "{pct} % de moins que 12 mois au tarif mensuel",
    billed_week: "Prélevé chaque semaine · sans engagement · résiliable à tout moment",
    billed_month: "Prélevé chaque mois · sans engagement · résiliable à tout moment",
    billed_year: "Prélevé {price} une fois par an · renouvellement automatique chaque année · résiliable avant l’échéance",
    closed: "Le paiement n’est pas encore ouvert pour ce pays. Aucun montant ne sera prélevé."
  };

  var hasOwn = Object.prototype.hasOwnProperty;

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fill(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return hasOwn.call(vars, k) ? vars[k] : m; });
  }

  // Texte : labels explicites > dictionnaire (variante par marche
  // pro_plans.<cle>_<marche>, puis cle generique) > repli francais.
  function textFor(key, market, labels) {
    labels = labels || {};
    var code = market && market.code;
    if (code && hasOwn.call(labels, key + "_" + code)) return labels[key + "_" + code];
    if (hasOwn.call(labels, key)) return labels[key];
    // BUG REEL (18/09/2026, page d'abonnement en production) : I18N.t(cle,
    // null) renvoie LA CLE quand elle est absente (i18n/i18n.js : fallback
    // != null ? fallback : key). La variante par marche
    // (pro_plans.week_label_fr) n'existe pas -> t() renvoyait la chaine
    // "pro_plans.week_label_fr", non vide, et le selecteur l'affichait telle
    // quelle sur les trois offres. On lit donc le dictionnaire directement :
    // absent = undefined, jamais une clef deguisee en texte.
    var I = global.I18N;
    if (I && I.dict) {
      var v = code ? dictGet(I.dict, "pro_plans." + key + "_" + code) : undefined;
      if (typeof v === "string" && v) return v;
      v = dictGet(I.dict, "pro_plans." + key);
      if (typeof v === "string" && v) return v;
    }
    return FALLBACK[key];
  }
  function dictGet(dict, path) {
    var cur = dict;
    var parts = String(path).split(".");
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object" || !hasOwn.call(cur, parts[i])) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  // Durees affichees = durees PAYABLES : vendues dans ce marche (prix), non
  // fermees par la configuration (open:false) et non declarees fermees par le
  // serveur (availability[iv] === false). Disponibilite absente = inconnue :
  // seule la configuration tranche.
  function visibleIntervals(offer, availability) {
    availability = availability || {};
    return offer.intervals.filter(function (i) {
      return i.amount != null && i.open !== false && availability[i.interval] !== false;
    }).map(function (i) { return i.interval; });
  }
  // Duree cochee : toujours une duree affichee (payable) ; null s'il n'y en a aucune.
  function pickDefault(offer, current, availability) {
    var pool = visibleIntervals(offer, availability);
    if (current && pool.indexOf(current) !== -1) return current;
    if (pool.indexOf(offer.defaultInterval) !== -1) return offer.defaultInterval;
    return pool[0] || null;
  }
  // Durees fermees par la configuration (open:false) : jamais affichees, jamais rouvertes par le serveur.
  function closedByConfig(offer) {
    var map = {};
    offer.intervals.forEach(function (i) { if (i.amount != null && i.open === false) map[i.interval] = false; });
    return map;
  }

  // Prix, equivalent mensuel, economie et rythme de prelevement d'une duree.
  function planDetails(it, t) {
    var iv = it.interval;
    var html = '<span class="iash-plan-price"><b data-market-price="pro.' + iv + '">' + esc(it.text) + "</b> "
      + '<span class="iash-plan-per">' + esc(t("per_" + iv)) + "</span></span>";
    if (iv === "year" && it.monthlyEquivalentText) {
      html += '<span class="iash-plan-equiv">' + esc(fill(t("year_equiv"), { price: it.monthlyEquivalentText })) + "</span>";
      if (it.savingsPct != null) html += '<span class="iash-plan-save">' + esc(fill(t("year_savings"), { pct: it.savingsPct })) + "</span>";
    }
    return html + '<span class="iash-plan-billed">' + esc(fill(t("billed_" + iv), { price: it.text })) + "</span>";
  }

  // HTML du selecteur. t(key) = texte ; availability = {iv: false} pour une
  // duree declaree fermee par le serveur (secret Stripe absent). Seules les
  // durees payables sont rendues (visibleIntervals) :
  //   - plusieurs : un bouton radio par duree, sous « Choisis ta duree » ;
  //   - une seule : son prix seul (rien a choisir) ;
  //   - aucune    : la ligne pro_plans.closed, sans aucun prix.
  function buildHtml(offer, t, uid, selected, availability) {
    var shown = visibleIntervals(offer, availability);
    var items = offer.intervals.filter(function (i) { return shown.indexOf(i.interval) !== -1; });
    if (!items.length) return '<p class="iash-plans-closed" role="status">' + esc(t("closed")) + "</p>";
    if (items.length === 1) {
      return '<div class="iash-plans iash-plans-single" data-interval="' + items[0].interval + '"><span class="iash-plan-body">' + planDetails(items[0], t) + "</span></div>";
    }
    var name = "iashPlan" + (uid || "");
    var html = '<fieldset class="iash-plans"><legend class="iash-plans-legend">' + esc(t("legend")) + "</legend>";
    items.forEach(function (it) {
      var iv = it.interval, id = name + "_" + iv;
      html += '<label class="iash-plan' + (iv === selected ? " is-selected" : "") + '" for="' + id + '" data-interval="' + iv + '">'
        + '<input type="radio" name="' + name + '" id="' + id + '" value="' + iv + '"' + (iv === selected ? " checked" : "") + ">"
        + '<span class="iash-plan-body">'
        + '<span class="iash-plan-name">' + esc(t(iv + "_label")) + "</span>"
        + planDetails(it, t)
        + "</span></label>";
    });
    return html + "</fieldset>";
  }

  var STYLE_ID = "iash-plans-style";
  var CSS = ""
    + ".iash-plans{margin:18px 0 6px;padding:0;border:0;min-width:0;display:grid;gap:10px;text-align:left}"
    + ".iash-plans-legend{margin:0 0 10px;padding:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#a6b4c6}"
    + ".iash-plan{position:relative;display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border:1px solid rgba(141,179,211,.22);border-radius:12px;background:rgba(255,255,255,.025);cursor:pointer}"
    + ".iash-plan.is-selected{border-color:var(--cyan,#20d5ef);background:rgba(32,213,239,.07)}"
    + ".iash-plan input{flex:none;width:18px;height:18px;margin:3px 0 0;accent-color:var(--cyan,#20d5ef);cursor:pointer}"
    + ".iash-plan input:focus-visible{outline:2px solid var(--cyan,#20d5ef);outline-offset:2px}"
    + ".iash-plan-body{display:grid;gap:3px;min-width:0}"
    + ".iash-plan-name{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#dbe4ee}"
    + ".iash-plan-price b{font-size:24px;font-weight:800;color:#f4f7fb}"
    + ".iash-plan-per,.iash-plan-equiv,.iash-plan-billed{font-size:12.5px;line-height:1.5;color:#a6b4c6}"
    + ".iash-plan-save{font-size:12.5px;font-weight:700;color:#5eead4}"
    + ".iash-plans-single{margin:18px 0 6px;text-align:center}"
    + ".iash-plans-single .iash-plan-body{justify-items:center}"
    + ".iash-plans-single .iash-plan-price b{font-size:30px}"
    + ".iash-plans-closed{margin:18px 0 6px;padding:12px 14px;border:1px solid rgba(141,179,211,.22);border-radius:12px;font-size:13px;line-height:1.5;color:#a6b4c6;text-align:center}"
    + "@media(min-width:900px){.iash-plans.iash-plans-row{grid-template-columns:repeat(auto-fit,minmax(0,1fr))}}";

  function injectStyle(doc) {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var s = doc.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  // Durees ouvertes au paiement : booleens renvoyes par create-checkout-session
  // (mode "availability", sans authentification ni id de Price). Echec reseau
  // ou paiement desactive = aucune marque (le serveur refuse de toute facon une
  // duree non configuree : reason interval_not_configured, aucun prelevement).
  function fetchAvailability(market) {
    var App = global.IasharkApp;
    if (!App || !App.url || !App.key || typeof global.fetch !== "function") return Promise.resolve(null);
    var body = { mode: "availability" };
    if (market && market.checkoutMarket) body.market = market.checkoutMarket;
    var request = global.fetch(App.url + "/functions/v1/create-checkout-session", {
      method: "POST",
      headers: { apikey: App.key, Authorization: "Bearer " + App.key, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); })
      .then(function (d) { return d && d.mode === "availability" && d.intervals && typeof d.intervals === "object" ? d.intervals : null; })
      .catch(function () { return null; });
    // Jamais d'attente sans fin avant un paiement (whenReady) : sans reponse en
    // 8 s, disponibilites inconnues (flux historique seul, voir loadAvailability).
    var timer = null;
    var timeout = new Promise(function (resolve) {
      timer = setTimeout(function () { resolve(null); }, 8000);
      if (timer && typeof timer.unref === "function") timer.unref();
    });
    return Promise.race([request, timeout]).then(function (m) { clearTimeout(timer); return m; });
  }

  var counter = 0;

  function mount(container, options) {
    options = options || {};
    var market = options.market || global.IASHARK_MARKET;
    if (!container || !market || typeof market.proOffer !== "function") return null;
    var doc = container.ownerDocument || global.document;
    var offer = market.proOffer();
    // Marche qui ne vend aucune duree : rien a monter (le repli HTML reste).
    if (!offer.intervals.some(function (i) { return i.amount != null; })) return null;
    var selected = pickDefault(offer, options.interval);
    injectStyle(doc);
    var uid = String(++counter);
    var availability = {};
    var ready = false;
    var t = function (key) { return textFor(key, market, options.labels); };

    function render() {
      ready = true;
      // Duree cochee devenue non payable (reponse du serveur) : la duree par
      // defaut parmi celles qui restent, signalee a la page.
      var before = selected;
      selected = pickDefault(offer, selected, availability);
      container.innerHTML = buildHtml(offer, t, uid, selected, availability);
      if (options.layout === "row" && container.firstChild && container.firstChild.classList) container.firstChild.classList.add("iash-plans-row");
      Array.prototype.forEach.call(container.querySelectorAll('input[type="radio"]'), function (input) {
        input.addEventListener("change", function () {
          if (!input.checked) return;
          selected = input.value;
          Array.prototype.forEach.call(container.querySelectorAll(".iash-plan"), function (l) {
            l.classList.toggle("is-selected", l.getAttribute("for") === input.id);
          });
          if (typeof options.onChange === "function") options.onChange(selected);
        });
      });
      if (before !== selected && before != null && typeof options.onChange === "function") options.onChange(selected);
      if (typeof options.onUpdate === "function") options.onUpdate(visibleIntervals(offer, availability));
    }
    // Rendu dans la langue de la page : si le dictionnaire n'est pas encore
    // charge, le contenu de repli du HTML reste affiche jusqu'a son arrivee
    // (jamais de libelles francais sur une page anglaise).
    var I = global.I18N;
    if (!options.labels && I && !I.dict && typeof I.init === "function") {
      Promise.resolve().then(function () { return I.init(); }).then(render, render);
    } else {
      render();
    }

    var closed = closedByConfig(offer);
    var pending = null;
    var api = {
      el: container,
      offer: offer,
      interval: function () { return selected; },
      visible: function () { return visibleIntervals(offer, availability); },
      isAvailable: function (iv) { var k = iv || selected; return !!k && visibleIntervals(offer, availability).indexOf(k) !== -1; },
      // Le serveur peut fermer une duree de plus, jamais rouvrir une duree
      // fermee par la configuration.
      setAvailability: function (map) {
        availability = {};
        if (map && typeof map === "object") Object.keys(map).forEach(function (k) { if (map[k] === false) availability[k] = false; });
        Object.keys(closed).forEach(function (k) { availability[k] = false; });
        if (ready) render();
      },
      // Reponse sans disponibilites (fonction create-checkout-session deployee
      // plus ancienne que le site, sans mode "availability" ; paiement
      // desactive ; erreur reseau) : seul le flux historique reste propose, le
      // MENSUEL du marche par defaut, sans champ market, que toute version de la
      // fonction facture au bon prix. Les anciennes versions ignoraient la duree
      // (facturaient le mensuel) et, selon la version, un marche inconnu : jamais
      // une duree ou un marche qu'elles factureraient a un autre prix.
      loadAvailability: function () {
        var run = function () {
          return fetchAvailability(market).then(function (m) {
            api.setAvailability(m || { week: false, month: !market.checkoutMarket, year: false });
            return m;
          });
        };
        // app-client.js est charge en defer : attendre DOMContentLoaded si besoin.
        if (global.IasharkApp || !doc || doc.readyState !== "loading") pending = run();
        else pending = new Promise(function (resolve) { doc.addEventListener("DOMContentLoaded", function () { run().then(resolve); }); });
        return pending;
      },
      // A attendre avant tout paiement : disponibilites du serveur connues.
      whenReady: function () { return pending ? pending.then(function () {}, function () {}) : Promise.resolve(); }
    };
    return api;
  }

  global.IasharkProPlanPicker = { mount: mount, buildHtml: buildHtml, pickDefault: pickDefault, visibleIntervals: visibleIntervals, textFor: textFor, fetchAvailability: fetchAvailability, FALLBACK: FALLBACK };
})(typeof window !== "undefined" ? window : this);
