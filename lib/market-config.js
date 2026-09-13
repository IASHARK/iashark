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
        "label": "Français"
      },
      "gb": {
        "market": "gb",
        "locale": "en",
        "htmlLang": "en-GB",
        "intlLocale": "en-GB",
        "blogDir": "en",
        "label": "English (UK)"
      },
      "za": {
        "market": "za",
        "locale": "en",
        "htmlLang": "en-ZA",
        "intlLocale": "en-ZA",
        "blogDir": "en",
        "label": "English (South Africa)"
      },
      "en": {
        "market": "fr",
        "locale": "en",
        "htmlLang": "en",
        "intlLocale": "en-GB",
        "blogDir": "en",
        "label": "English (International)"
      },
      "mx": {
        "market": "mx",
        "locale": "es-mx",
        "htmlLang": "es-MX",
        "intlLocale": "es-MX",
        "blogDir": "es",
        "label": "Español (México)"
      },
      "es": {
        "market": "fr",
        "locale": "es",
        "htmlLang": "es",
        "intlLocale": "es-ES",
        "blogDir": "es",
        "label": "Español"
      },
      "de": {
        "market": "fr",
        "locale": "de",
        "htmlLang": "de",
        "intlLocale": "de-DE",
        "blogDir": "de",
        "label": "Deutsch"
      },
      "it": {
        "market": "fr",
        "locale": "it",
        "htmlLang": "it",
        "intlLocale": "it-IT",
        "blogDir": "it",
        "label": "Italiano"
      },
      "pt": {
        "market": "fr",
        "locale": "pt",
        "htmlLang": "pt",
        "intlLocale": "pt-PT",
        "blogDir": "pt",
        "label": "Português"
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
      helpline: clone(mk.helpline),
      legal: { status: mk.status || null, minAge: mk.minAge || 18, pages: pages },
      checkoutMarket: mk.checkoutMarket || null,
      status: mk.status || null
    };

    // Prix formate pour un planKey, ou null si ce marche n'a pas ce prix.
    market.formatPrice = function (planKey) {
      var p = market.prices[planKey];
      if (!p || typeof p.amount !== "number") return null;
      var digits = Math.round(p.amount) === p.amount ? 0 : 2;
      try {
        return new Intl.NumberFormat(market.intlLocale, {
          style: "currency", currency: market.currency,
          minimumFractionDigits: digits, maximumFractionDigits: digits
        }).format(p.amount);
      } catch (e) {
        return p.amount.toFixed(digits) + " " + market.currency;
      }
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
          el.textContent = h.phone;
          if (isLink) el.setAttribute("href", "tel:" + h.tel);
        } else if (part === "url") {
          el.textContent = h.display || h.url;
          if (isLink) el.setAttribute("href", h.url);
        } else {
          el.textContent = h.name + " · " + h.phone;
        }
        el.hidden = false;
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
  global.IasharkMarketConfig = { data: DATA, build: build, detectDir: detectDir };

  var doc = global.document;
  if (doc && doc.addEventListener) {
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", function () { market.apply(doc); });
    } else {
      market.apply(doc);
    }
  }
})(typeof window !== "undefined" ? window : this);
