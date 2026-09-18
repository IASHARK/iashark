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
   proOffer(), apply()}.

   Remplissage automatique (DOMContentLoaded, ou immediatement si le DOM est
   deja pret) :
     [data-market-price="free|pro|pro.week|pro.month|pro.year"] -> prix
       formate (Intl.NumberFormat, locale + devise du marche). "pro" = alias du
       prix MENSUEL (retro-compatibilite des pages existantes). Si le marche
       n'a pas ce prix (null/absent), le texte existant n'est PAS modifie et
       l'element recoit l'attribut data-market-price-unavailable (jamais de
       prix invente).
     [data-market-price-equiv="year"] -> equivalent mensuel de l'annuel
       (arrondi au centime SUPERIEUR : jamais un montant plus bas que le reel).
     [data-market-price-if="pro.year"] -> element masque (hidden) si le marche
       ne vend pas ce prix (ex. annuel ZA non ouvert), visible sinon.
     [data-market-savings="year"] -> economie en % de l'annuel face a 12 mois
       au tarif mensuel (arrondie a l'entier INFERIEUR : jamais surestimee) ;
       element masque (hidden) si l'economie n'est pas strictement positive.
     [data-market-currency] -> code devise (EUR, GBP, ZAR, MXN).
     [data-market-helpline] -> "nom · numero" ; valeur "name" | "phone" | "url"
       pour une seule partie (href tel:/url pose si l'element est un <a>).
       Element masque (hidden) quand le marche n'a pas de ressource confirmee.
     [data-market-legal="legal_notice|terms|privacy|cookies|responsible_gambling"]
       -> href de la page legale du repertoire courant (sur un <a>).

   Checkout : envoyer { market: IASHARK_MARKET.checkoutMarket, dir:
   IASHARK_MARKET.dir, interval: "week"|"month"|"year" } a
   create-checkout-session. checkoutMarket vaut null pour le marche EUR par
   defaut : ne pas envoyer de champ market dans ce cas. */
(function (global) {
  "use strict";

  /*IASHARK_MARKETS_DATA_START*/
  var DATA = {
    "defaultMarket": "fr",
    "defaultDir": "fr",
    "planKeys": [
      "free",
      "pro"
    ],
    "proIntervals": [
      "week",
      "month",
      "year"
    ],
    "proDefaultInterval": "month",
    "legalFiles": {
      "legal_notice": "mentions-legales.html",
      "terms": "cgv.html",
      "privacy": "confidentialite.html",
      "cookies": "cookies.html",
      "responsible_gambling": "jeu-responsable.html",
      "methodology": "methodologie.html"
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
        "checkoutOpen": [
          "month"
        ],
        "prices": {
          "free": {
            "amount": 0,
            "interval": "month"
          },
          "pro": {
            "week": {
              "amount": 6.99
            },
            "month": {
              "amount": 19.95
            },
            "year": {
              "amount": 199
            }
          }
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
        "checkoutOpen": null,
        "prices": {
          "free": {
            "amount": 0,
            "interval": "month"
          },
          "pro": {
            "week": {
              "amount": 4.99
            },
            "month": {
              "amount": 14.99
            },
            "year": {
              "amount": 149
            }
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
        "checkoutOpen": null,
        "prices": {
          "free": {
            "amount": 0,
            "interval": "month"
          },
          "pro": {
            "week": {
              "amount": 69
            },
            "month": {
              "amount": 199
            },
            "year": {
              "amount": 1990
            }
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
        "checkoutOpen": null,
        "prices": {
          "free": {
            "amount": 0,
            "interval": "month"
          },
          "pro": {
            "week": {
              "amount": 69
            },
            "month": {
              "amount": 199
            },
            "year": null
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

  // ---- Offre Pro : 3 durees ------------------------------------------------
  // Forme actuelle : prices.pro = { week:{amount}, month:{amount}, year:{amount} }.
  // Forme historique acceptee : prices.pro = { amount, interval:"month" }.
  var PRO_INTERVALS = (DATA.proIntervals && DATA.proIntervals.length) ? DATA.proIntervals : ["week", "month", "year"];
  var PRO_DEFAULT_INTERVAL = DATA.proDefaultInterval || "month";

  function amountOf(entry) {
    return entry && typeof entry.amount === "number" && isFinite(entry.amount) ? entry.amount : null;
  }
  function proAmount(prices, interval) {
    var pro = prices && prices.pro;
    if (!pro || PRO_INTERVALS.indexOf(interval) === -1) return null;
    if (typeof pro.amount === "number") return interval === (pro.interval || "month") ? amountOf(pro) : null;
    return amountOf(pro[interval]);
  }
  // Cle d'affichage -> montant : "free", "pro" (= mensuel), "pro.week",
  // "pro_week", "pro.month", "pro.year"... ; null si non vendu.
  function priceFor(prices, key) {
    var k = String(key || "");
    if (k === "pro") return proAmount(prices, "month");
    var m = k.match(/^pro[._](week|month|year)$/);
    if (m) return proAmount(prices, m[1]);
    if (k === "free") return amountOf(prices && prices.free);
    return null;
  }
  // Donnees derivees, CALCULEES (jamais saisies a la main) :
  // - monthlyEquivalent : annuel / 12, arrondi au centime superieur ;
  // - savingsPct : 1 - annuel / (12 x mensuel), en % entier inferieur ;
  //   null si <= 0 ou si l'un des deux prix manque.
  // checkoutOpen (facultatif) : durees reellement payables en ligne
  // (config/markets.json#<marche>.checkoutOpen). Une duree vendue mais absente
  // de cette liste garde son prix affiche avec open:false ("Bientot
  // disponible", jamais selectionnable). Sans liste : toutes ouvertes.
  function proOffer(prices, currency, intlLocale, checkoutOpen) {
    var month = proAmount(prices, "month"), year = proAmount(prices, "year");
    var openList = Array.isArray(checkoutOpen) ? checkoutOpen : null;
    var items = PRO_INTERVALS.map(function (iv) {
      var amount = proAmount(prices, iv);
      var item = { interval: iv, amount: amount, text: amount == null ? null : formatAmount(amount, currency, intlLocale),
        open: amount != null && (!openList || openList.indexOf(iv) !== -1),
        monthlyEquivalent: null, monthlyEquivalentText: null, savingsPct: null };
      if (iv === "year" && amount != null) {
        var eq = Math.ceil(Math.round(amount * 100) / 12) / 100;
        item.monthlyEquivalent = eq;
        item.monthlyEquivalentText = formatAmount(eq, currency, intlLocale);
        if (month != null && month > 0) {
          var pct = Math.floor((1 - (amount * 100) / (month * 1200)) * 100 + 1e-9);
          item.savingsPct = pct > 0 ? pct : null;
        }
      }
      return item;
    });
    return { defaultInterval: PRO_DEFAULT_INTERVAL, intervals: items };
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
      checkoutOpen: Array.isArray(mk.checkoutOpen) ? mk.checkoutOpen.slice() : null,
      status: mk.status || null
    };

    // Prix formate pour un planKey, ou null si ce marche n'a pas ce prix.
    market.formatPrice = function (planKey) {
      var amount = priceFor(market.prices, planKey);
      return amount == null ? null : formatAmount(amount, market.currency, market.intlLocale);
    };
    market.proOffer = function () { return proOffer(market.prices, market.currency, market.intlLocale, market.checkoutOpen); };

    market.apply = function (root) {
      root = root || global.document;
      each(root, "[data-market-price]", function (el) {
        var txt = market.formatPrice(el.getAttribute("data-market-price"));
        if (txt == null) { el.setAttribute("data-market-price-unavailable", ""); return; }
        el.removeAttribute("data-market-price-unavailable");
        el.textContent = txt;
      });
      var offer = null;
      function offerItem(iv) {
        offer = offer || market.proOffer();
        return offer.intervals.filter(function (i) { return i.interval === iv; })[0] || null;
      }
      each(root, "[data-market-price-equiv]", function (el) {
        var it = offerItem(el.getAttribute("data-market-price-equiv"));
        if (!it || it.monthlyEquivalentText == null) { el.setAttribute("data-market-price-unavailable", ""); return; }
        el.removeAttribute("data-market-price-unavailable");
        el.textContent = it.monthlyEquivalentText;
      });
      each(root, "[data-market-savings]", function (el) {
        var it = offerItem(el.getAttribute("data-market-savings"));
        if (!it || it.savingsPct == null) { el.hidden = true; return; }
        el.textContent = String(it.savingsPct);
        el.hidden = false;
      });
      each(root, "[data-market-price-if]", function (el) {
        el.hidden = market.formatPrice(el.getAttribute("data-market-price-if")) == null;
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

  // /en/blog/ est partage par /gb/ et /za/ (blogDir "en") : si le visiteur a
  // choisi gb ou za (localStorage "iashark_dir", pose par le selecteur de
  // langue), la ligne d'aide affichee est celle de ce marche au lieu de la
  // ressource internationale. Seule la ligne d'aide change (prix, pages
  // legales et devise restent ceux de /en/).
  if (market.dir === "en" && /^\/en\/blog\//.test(String(pathname || ""))) {
    var savedDir = "";
    try { savedDir = global.localStorage.getItem("iashark_dir") || ""; } catch (e) {}
    var savedConf = (savedDir === "gb" || savedDir === "za") && hasOwn.call(DATA.dirs, savedDir) ? DATA.dirs[savedDir] : null;
    if (savedConf && savedConf.blogDir === "en") {
      market.helpline = helplineFor(savedConf, DATA.markets[savedConf.market] || {});
    }
  }

  global.IASHARK_MARKET = market;
  global.IasharkMarketConfig = {
    data: DATA, build: build, detectDir: detectDir,
    formatAmount: formatAmount, helplineText: helplineText,
    priceFor: priceFor, proAmount: proAmount, proOffer: proOffer,
    PRO_INTERVALS: PRO_INTERVALS, PRO_DEFAULT_INTERVAL: PRO_DEFAULT_INTERVAL
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
