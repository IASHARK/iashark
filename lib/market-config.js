/* IASHARK — configuration marche au runtime (devise, prix, aide jeu
   responsable, pages legales) pour le repertoire courant.
   - Repertoires de langue /fr/ /en/ /es/ /de/ /it/ /pt/ (et pages racine) :
     marche EUR par defaut (cle "fr" de config/markets.json).
   - /gb/ /za/ /mx/ : marche pays (GBP / ZAR / MXN).
   Les donnees du bloc ci-dessous sont RECOPIEES depuis config/markets.json par
   scripts/build-locales.js a chaque build (entre les marqueurs) : aucun fetch
   au runtime, aucun prix a maintenir a la main dans ce fichier.

   Exposition : window.IASHARK_MARKET = {code, dir, lang, locale, intlLocale,
   currency, prices, helpline, legal, checkoutMarket, status, formatPrice(),
   apply()}.

   Remplissage automatique (DOMContentLoaded, ou immediatement si le DOM est
   deja pret) :
     [data-market-price="free|pro|edge|annual_edge"] -> prix formate
       (Intl.NumberFormat, locale + devise du marche). Si le marche n'a pas ce
       prix (null), le texte existant n'est PAS modifie et l'element recoit
       l'attribut data-market-price-unavailable (jamais de prix invente).
     [data-market-currency] -> code devise (EUR, GBP, ZAR, MXN).
     [data-market-helpline] -> "nom · numero" ; valeur "name" | "phone" | "url"
       pour une seule partie (href tel:/url pose si l'element est un <a>).
       Element masque (hidden) quand le marche n'a pas de ressource confirmee.
     [data-market-legal="legal_notice|terms|privacy|cookies|responsible_gambling"]
       -> href de la page legale du repertoire courant (sur un <a>).

   Checkout : envoyer { market: IASHARK_MARKET.checkoutMarket, dir:
   IASHARK_MARKET.dir } a create-checkout-session. checkoutMarket vaut null pour
   le marche EUR par defaut : ne pas envoyer de champ market dans ce cas. */
(function (global) {
  "use strict";

  /*IASHARK_MARKETS_DATA_START*/
  var DATA = {
    "defaultMarket": "fr",
    "defaultDir": "fr",
    "planKeys": [
      "free",
      "pro",
      "edge",
      "annual_edge"
    ],
    "legalFiles": {
      "legal_notice": "mentions-legales.html",
      "terms": "cgv.html",
      "privacy": "confidentialite.html",
      "cookies": "cookies.html",
      "responsible_gambling": "jeu-responsable.html"
    },
    "dirs": {
      "fr": {
        "market": "fr",
        "locale": "fr",
        "htmlLang": "fr",
        "intlLocale": "fr-FR",
        "blogDir": "",
        "label": "Français",
        "helpline": null
      },
      "gb": {
        "market": "gb",
        "locale": "en",
        "htmlLang": "en-GB",
        "intlLocale": "en-GB",
        "blogDir": "en",
        "label": "English (UK)",
        "helpline": null
      },
      "za": {
        "market": "za",
        "locale": "en",
        "htmlLang": "en-ZA",
        "intlLocale": "en-ZA",
        "blogDir": "en",
        "label": "English (South Africa)",
        "helpline": null
      },
      "en": {
        "market": "fr",
        "locale": "en",
        "htmlLang": "en",
        "intlLocale": "en-GB",
        "blogDir": "en",
        "label": "English (International)",
        "helpline": "international"
      },
      "mx": {
        "market": "mx",
        "locale": "es-mx",
        "htmlLang": "es-MX",
        "intlLocale": "es-MX",
        "blogDir": "mx",
        "label": "Español (México)",
        "helpline": null
      },
      "es": {
        "market": "fr",
        "locale": "es",
        "htmlLang": "es",
        "intlLocale": "es-ES",
        "blogDir": "es",
        "label": "Español",
        "helpline": "international"
      },
      "de": {
        "market": "fr",
        "locale": "de",
        "htmlLang": "de",
        "intlLocale": "de-DE",
        "blogDir": "de",
        "label": "Deutsch",
        "helpline": "international"
      },
      "it": {
        "market": "fr",
        "locale": "it",
        "htmlLang": "it",
        "intlLocale": "it-IT",
        "blogDir": "it",
        "label": "Italiano",
        "helpline": "international"
      },
      "pt": {
        "market": "fr",
        "locale": "pt",
        "htmlLang": "pt",
        "intlLocale": "pt-PT",
        "blogDir": "pt",
        "label": "Português",
        "helpline": "international"
      }
    },
    "markets": {
      "fr": {
        "currency": "EUR",
        "locale": "fr",
        "htmlLang": "fr",
        "intlLocale": "fr-FR",
        "status": "LIVE",
        "minAge": 18,
        "checkoutMarket": null,
        "prices": {
          "free": {
            "amount": 0,
            "interval": "month"
          },
          "pro": {
            "amount": 19.95,
            "interval": "month"
          },
          "edge": null,
          "annual_edge": null
        },
        "helpline": {
          "name": "Joueurs Info Service",
          "phone": "09 74 75 13 13",
          "tel": "0974751313",
          "url": "https://www.joueurs-info-service.fr",
          "display": "joueurs-info-service.fr"
        }
      },
      "gb": {
        "currency": "GBP",
        "locale": "en",
        "htmlLang": "en-GB",
        "intlLocale": "en-GB",
        "status": "DRAFT_PENDING_LEGAL_REVIEW",
        "minAge": 18,
        "checkoutMarket": "gb",
        "prices": {
          "free": {
            "amount": 0,
            "interval": "month"
          },
          "pro": {
            "amount": 14.99,
            "interval": "month"
          },
          "edge": {
            "amount": 24.99,
            "interval": "month"
          },
          "annual_edge": {
            "amount": 199,
            "interval": "year"
          }
        },
        "helpline": {
          "name": "National Gambling Helpline (GamCare / BeGambleAware)",
          "phone": "0808 8020 133",
          "tel": "08088020133",
          "url": "https://www.begambleaware.org",
          "display": "begambleaware.org"
        }
      },
      "mx": {
        "currency": "MXN",
        "locale": "es-mx",
        "htmlLang": "es-MX",
        "intlLocale": "es-MX",
        "status": "DRAFT_PENDING_LEGAL_REVIEW",
        "minAge": 18,
        "checkoutMarket": "mx",
        "prices": {
          "free": {
            "amount": 0,
            "interval": "month"
          },
          "pro": {
            "amount": 199,
            "interval": "month"
          },
          "edge": {
            "amount": 299,
            "interval": "month"
          },
          "annual_edge": {
            "amount": 1990,
            "interval": "year"
          }
        },
        "helpline": {
          "name": "Línea de la Vida (CONASAMA)",
          "phone": "800 911 2000",
          "tel": "8009112000",
          "url": "https://www.gob.mx/conasama/articulos/linea-de-la-vida-800-911-2000",
          "display": "gob.mx/conasama",
          "hours": "gratuita, 24/7"
        }
      },
      "za": {
        "currency": "ZAR",
        "locale": "en",
        "htmlLang": "en-ZA",
        "intlLocale": "en-ZA",
        "status": "DRAFT_PENDING_LEGAL_REVIEW",
        "minAge": 18,
        "checkoutMarket": "za",
        "prices": {
          "free": {
            "amount": 0,
            "interval": "month"
          },
          "pro": {
            "amount": 199,
            "interval": "month"
          },
          "edge": {
            "amount": 299,
            "interval": "month"
          },
          "annual_edge": {
            "amount": 1999,
            "interval": "year"
          }
        },
        "helpline": {
          "name": "National Responsible Gambling Programme (NRGP)",
          "phone": "0800 006 008",
          "tel": "0800006008",
          "url": "https://www.responsiblegambling.org.za",
          "display": "responsiblegambling.org.za"
        }
      }
    },
    "helplines": {
      "international": {
        "name": "Gambling Therapy",
        "phone": null,
        "tel": null,
        "url": "https://www.gamblingtherapy.org",
        "display": "gamblingtherapy.org",
        "hours": "free, international (chat, forum)"
      }
    }
  };
  /*IASHARK_MARKETS_DATA_END*/

  var hasOwn = Object.prototype.hasOwnProperty;

  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }

  function detectDir(pathname) {
    var m = String(pathname || "").match(/^\/([a-z]{2})(?:\/|$)/);
    return (m && hasOwn.call(DATA.dirs, m[1])) ? m[1] : "";
  }

  function metaHint(doc) {
    try {
      var el = doc && doc.querySelector && doc.querySelector('meta[name="iashark-market"]');
      return el ? el.getAttribute("content") : null;
    } catch (e) { return null; }
  }

  function each(root, selector, fn) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll(selector), fn);
  }

  // Montant formate (Intl, locale + devise). Fonction pure, partagee avec
  // scripts/build-locales.js (prix ecrits dans le HTML genere) : une seule
  // regle de formatage. MXN : en es-MX, Intl rend "$199", ambigu avec le
  // dollar americain (audit QA 14/09/2026) -> "MX$199".
  function formatAmount(amount, currency, intlLocale) {
    if (typeof amount !== "number" || !isFinite(amount)) return null;
    var digits = Math.round(amount) === amount ? 0 : 2;
    var txt;
    try {
      txt = new Intl.NumberFormat(intlLocale || "fr-FR", {
        style: "currency", currency: currency || "EUR",
        minimumFractionDigits: digits, maximumFractionDigits: digits
      }).format(amount);
    } catch (e) {
      return amount.toFixed(digits) + " " + (currency || "EUR");
    }
    if (currency === "MXN" && txt.indexOf("MX") === -1) txt = txt.replace("$", "MX$");
    return txt;
  }

  // Ressource d'aide d'un repertoire : surcharge du repertoire
  // (config/markets.json#_dirs.<dir>.helpline -> _helplines.<cle>), sinon
  // celle de son marche.
  function helplineFor(dirConf, mk) {
    var key = dirConf && dirConf.helpline;
    if (key && DATA.helplines && hasOwn.call(DATA.helplines, key)) return clone(DATA.helplines[key]);
    return clone(mk.helpline);
  }
  function helplineText(h) {
    if (!h) return "";
    return h.phone ? h.name + " · " + h.phone : h.name;
  }

  function build(dir, marketHint) {
    var dirConf = dir && hasOwn.call(DATA.dirs, dir) ? DATA.dirs[dir] : null;
    if (!dirConf) dir = "";
    var code = dirConf ? dirConf.market
      : (marketHint && hasOwn.call(DATA.markets, marketHint) ? marketHint : DATA.defaultMarket);
    var mk = DATA.markets[code] || {};
    var prefix = dir ? "/" + dir + "/" : "/";
    var pages = {};
    Object.keys(DATA.legalFiles || {}).forEach(function (k) { pages[k] = prefix + DATA.legalFiles[k]; });

    var market = {
      code: code,
      dir: dir,
      lang: (dirConf && dirConf.htmlLang) || mk.htmlLang || "fr",
      locale: (dirConf && dirConf.locale) || mk.locale || "fr",
      intlLocale: (dirConf && dirConf.intlLocale) || mk.intlLocale || "fr-FR",
      currency: mk.currency || "EUR",
      prices: clone(mk.prices) || {},
      helpline: helplineFor(dirConf, mk),
      legal: { status: mk.status || null, minAge: mk.minAge || 18, pages: pages },
      checkoutMarket: mk.checkoutMarket || null,
      status: mk.status || null
    };

    // Prix formate pour un planKey, ou null si ce marche n'a pas ce prix.
    market.formatPrice = function (planKey) {
      var p = market.prices[planKey];
      if (!p || typeof p.amount !== "number") return null;
      return formatAmount(p.amount, market.currency, market.intlLocale);
    };

    market.apply = function (root) {
      root = root || global.document;
      each(root, "[data-market-price]", function (el) {
        var txt = market.formatPrice(el.getAttribute("data-market-price"));
        if (txt == null) { el.setAttribute("data-market-price-unavailable", ""); return; }
        el.removeAttribute("data-market-price-unavailable");
        el.textContent = txt;
      });
      each(root, "[data-market-currency]", function (el) { el.textContent = market.currency; });
      each(root, "[data-market-helpline]", function (el) {
        var h = market.helpline;
        if (!h) { el.hidden = true; return; }
        var part = el.getAttribute("data-market-helpline");
        var isLink = el.tagName && el.tagName.toUpperCase() === "A";
        if (part === "name") {
          el.textContent = h.name;
        } else if (part === "phone") {
          // Ressource sans numero (Gambling Therapy) : masque, jamais invente.
          if (!h.phone) { el.hidden = true; return; }
          el.textContent = h.phone;
          if (isLink && h.tel) el.setAttribute("href", "tel:" + h.tel);
        } else if (part === "url") {
          el.textContent = h.display || h.url;
          if (isLink) el.setAttribute("href", h.url);
        } else {
          el.textContent = helplineText(h);
        }
        el.hidden = false;
      });
      // Enveloppe conditionnelle (" · <numero>") : masquee sans numero.
      each(root, "[data-market-helpline-if]", function (el) {
        var h = market.helpline;
        el.hidden = !(h && h[el.getAttribute("data-market-helpline-if")]);
      });
      each(root, "[data-market-legal]", function (el) {
        var href = market.legal.pages[el.getAttribute("data-market-legal")];
        if (href && el.tagName && el.tagName.toUpperCase() === "A") el.setAttribute("href", href);
      });
      return market;
    };

    return market;
  }

  var pathname = "/";
  try { pathname = global.location.pathname; } catch (e) {}
  var market = build(detectDir(pathname), metaHint(global.document));

  global.IASHARK_MARKET = market;
  global.IasharkMarketConfig = {
    data: DATA, build: build, detectDir: detectDir,
    formatAmount: formatAmount, helplineText: helplineText
  };

  var doc = global.document;
  if (doc && doc.addEventListener) {
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", function () { market.apply(doc); });
    } else {
      market.apply(doc);
    }
  }
})(typeof window !== "undefined" ? window : this);
