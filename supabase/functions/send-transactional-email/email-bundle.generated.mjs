// FICHIER GENERE par `node lib/email-build.js` - NE PAS MODIFIER A LA MAIN.
// Sources : lib/email-render.js + emails/templates/*.html|*.txt
// Verifie par tests/email-templates.test.js (doit rester identique a la regeneration).
/* eslint-disable */
// deno-lint-ignore-file
const module = { exports: {} };
/* IASHARK — rendu des emails transactionnels (module PUR : aucun acces reseau,
   fichier, horloge ou variable d'environnement implicite).

   Consommateurs :
   - tests/email-*.test.js (node --test, require) ;
   - supabase/functions/send-transactional-email/ via le module genere
     email-bundle.generated.mjs (node lib/email-build.js recopie ce fichier et
     les gabarits de emails/templates/ : une fonction Edge deployee ne peut pas
     lire lib/ ni emails/ a l'execution).

   Gabarits (emails/templates/<type>.<marche>.html|.txt) : syntaxe minimale
     {{variable}}               valeur (echappee en HTML)
     {{#drapeau}}...{{/drapeau}} bloc affiche si la valeur est "vraie"
     {{^drapeau}}...{{/drapeau}} bloc affiche si la valeur est "fausse"
     {{! commentaire }}          retire au rendu
   La premiere ligne du .txt est "Subject: ..." (objet de l'email).
   Toute variable absente fait ECHOUER le rendu (jamais d'email avec un {{trou}}).

   Identite du vendeur : non publiee a ce jour (legal/README.md §4 point 1 et 2).
   Rien n'est invente : chaque champ absent devient le marqueur visible
   "[BLOCKED_DECISION: COMPANY_...]" (nom du secret Supabase a renseigner) et
   est liste dans result.blockedDecisions. Memes noms de secrets que le premier
   jet supabase/functions/_shared/email/config.ts.

   STATUT DES TEXTES : REVIEW (a faire valider par un juriste), repris des CGV
   legal/fr|gb|mx/cgv.html du 13/09/2026 et des cases de consentement
   (i18n/parts/checkout.*.json). */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else root.IasharkEmail = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SITE_URL = "https://iashark.com";
  var SUPPORT_EMAIL = "contact@iashark.com";

  // Miroir de config/markets.json (_dirs, <marche>.currency/intlLocale/helpline).
  // tests/email-templates.test.js fait echouer toute derive.
  var MARKETS = {
    fr: {
      market: "fr", dir: "fr", htmlLang: "fr", intlLocale: "fr-FR", currency: "EUR", timeZone: "Europe/Paris",
      helpline: { name: "Joueurs Info Service", phone: "09 74 75 13 13", url: "https://www.joueurs-info-service.fr", display: "joueurs-info-service.fr" }
    },
    gb: {
      market: "gb", dir: "gb", htmlLang: "en-GB", intlLocale: "en-GB", currency: "GBP", timeZone: "Europe/London",
      helpline: { name: "National Gambling Helpline", phone: "0808 8020 133", url: "https://www.begambleaware.org", display: "BeGambleAware.org" }
    },
    mx: {
      market: "mx", dir: "mx", htmlLang: "es-MX", intlLocale: "es-MX", currency: "MXN", timeZone: "America/Mexico_City",
      helpline: { name: "Línea de la Vida", phone: "800 911 2000", url: "https://www.gob.mx/conasama/articulos/linea-de-la-vida-800-911-2000", display: "gob.mx/conasama" }
    }
  };

  // Types d'email -> marches couverts par un gabarit.
  var TEMPLATE_KINDS = {
    purchase_confirmation: ["fr", "gb"],
    renewal_reminder: ["mx"]
  };

  // Champs d'identite du vendeur -> secret Supabase correspondant.
  var COMPANY_FIELDS = {
    operatorName: "COMPANY_OPERATOR_NAME",   // raison sociale / nom de l'exploitant
    address: "COMPANY_ADDRESS",              // adresse geographique complete
    registration: "COMPANY_REGISTRATION",    // SIREN / SIRET
    vat: "COMPANY_VAT",                      // n° TVA ou mention de franchise
    phone: "COMPANY_PHONE",
    mediator: "COMPANY_MEDIATOR"             // mediateur de la consommation (FR)
  };

  var DEFAULT_REMINDER_DAYS = 7;
  var MIN_REMINDER_DAYS = 1;
  var MAX_REMINDER_DAYS = 30;
  // En dessous, log d'avertissement (delai minimal legal MX a confirmer par
  // un juriste : le premier jet _shared/email cite 5 jours naturels, art. 76 Bis
  // LFPC reforme DOF 12/12/2025 - non verifie ici).
  var MIN_RECOMMENDED_REMINDER_DAYS = 5;

  var ACTIVE_STATUSES = ["active", "trialing"];
  var hasOwn = Object.prototype.hasOwnProperty;

  function EmailRenderError(code, message) {
    this.name = "EmailRenderError";
    this.code = code;
    this.message = message || code;
  }
  EmailRenderError.prototype = Object.create(Error.prototype);
  EmailRenderError.prototype.constructor = EmailRenderError;

  function fail(code, message) { throw new EmailRenderError(code, message); }

  // ---------------------------------------------------------------- utilitaires

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function isValidEmail(value) {
    return typeof value === "string" && value.length <= 254 && /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(value);
  }

  function maskEmail(value) {
    if (!isValidEmail(value)) return "(aucune)";
    var at = value.indexOf("@");
    return value.slice(0, 1) + "***" + value.slice(at);
  }

  function normalizeMarket(value) {
    var key = typeof value === "string" ? value.trim().toLowerCase() : "";
    return hasOwn.call(MARKETS, key) ? key : null;
  }

  function toDate(value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value !== "string" && typeof value !== "number") return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function unixToIso(ts) {
    return typeof ts === "number" && isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null;
  }

  function formatMoney(amountMinor, currency, intlLocale) {
    var cur = String(currency || "").toUpperCase();
    var out = new Intl.NumberFormat(intlLocale, { style: "currency", currency: cur }).format(amountMinor / 100);
    // "$199.00" seul est ambigu (pesos ou dollars) : on precise la devise.
    if (out.indexOf("$") !== -1 && cur !== "USD") out += " " + cur;
    return out;
  }

  function formatDate(date, intlLocale, timeZone) {
    return new Intl.DateTimeFormat(intlLocale, { dateStyle: "long", timeZone: timeZone }).format(date);
  }

  function formatDateTime(date, intlLocale, timeZone) {
    // dateStyle/timeStyle ne se combinent pas avec timeZoneName : champs explicites.
    return new Intl.DateTimeFormat(intlLocale, {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: timeZone, timeZoneName: "short"
    }).format(date);
  }

  // Date calendaire locale {y, m, d} d'un instant dans un fuseau.
  function localParts(date, timeZone) {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    return { y: Number(o.year), m: Number(o.month), d: Number(o.day) };
  }

  function localDateKey(date, timeZone) {
    var p = localParts(date, timeZone);
    return p.y + "-" + (p.m < 10 ? "0" : "") + p.m + "-" + (p.d < 10 ? "0" : "") + p.d;
  }

  // Decalage (ms) du fuseau a un instant donne.
  function zoneOffsetMs(date, timeZone) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(date);
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    var asUtc = Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day), Number(o.hour), Number(o.minute), Number(o.second));
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
  }

  // Instant UTC de minuit local (y, m, d) dans un fuseau.
  function zonedMidnight(y, m, d, timeZone) {
    var guess = Date.UTC(y, m - 1, d);
    var t = guess - zoneOffsetMs(new Date(guess), timeZone);
    return new Date(guess - zoneOffsetMs(new Date(t), timeZone));
  }

  // Date calendaire locale + n jours, formatee (sans derive de fuseau).
  function formatLocalDatePlusDays(date, days, intlLocale, timeZone) {
    var p = localParts(date, timeZone);
    return formatDate(new Date(Date.UTC(p.y, p.m - 1, p.d + days, 12)), intlLocale, "UTC");
  }

  function stringMap(value) {
    var out = {};
    if (value && typeof value === "object") {
      Object.keys(value).forEach(function (k) { if (typeof value[k] === "string") out[k] = value[k]; });
    }
    return out;
  }

  function cleanToken(value, re) {
    return typeof value === "string" && re.test(value) ? value : null;
  }

  // Comparaison en temps constant (secret interne).
  function safeEqual(a, b) {
    var x = String(a == null ? "" : a), y = String(b == null ? "" : b);
    var len = Math.max(x.length, y.length);
    var diff = x.length ^ y.length;
    for (var i = 0; i < len; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
    return diff === 0 && x.length > 0;
  }

  // ------------------------------------------------------------------ gabarits

  function lookup(view, name) {
    return hasOwn.call(view, name) ? view[name] : undefined;
  }

  function isTruthy(v) {
    return !(v === undefined || v === null || v === false || v === "" || v === 0);
  }

  function renderTemplate(source, view, html) {
    var out = String(source).replace(/\{\{![\s\S]*?\}\}/g, "");
    var sectionRe = /\{\{([#^])([A-Za-z][A-Za-z0-9_]*)\}\}([\s\S]*?)\{\{\/\2\}\}/g;
    var prev;
    do {
      prev = out;
      out = out.replace(sectionRe, function (_m, type, name, inner) {
        return (type === "#") === isTruthy(lookup(view, name)) ? inner : "";
      });
    } while (out !== prev);
    out = out.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g, function (_m, name) {
      var v = lookup(view, name);
      if (v === undefined || v === null || v === false) fail("unresolved_placeholder", "Variable de gabarit manquante : " + name);
      return html ? escapeHtml(v) : String(v);
    });
    if (/\{\{|\}\}/.test(out)) fail("unresolved_placeholder", "Balise de gabarit non resolue");
    return out;
  }

  function splitSubject(text) {
    var m = /^Subject: ([^\r\n]+)\r?\n/.exec(String(text));
    if (!m) fail("template_invalid", "Le gabarit texte doit commencer par \"Subject: ...\"");
    return { subject: m[1], body: String(text).slice(m[0].length) };
  }

  function listBlocked(str) {
    var seen = {}, out = [];
    String(str).replace(/\[BLOCKED_DECISION: ([A-Z_]+)\]/g, function (_m, key) {
      if (!seen[key]) { seen[key] = true; out.push(key); }
      return _m;
    });
    return out;
  }

  // ------------------------------------------------------------------- donnees

  function companyFromEnv(getEnv) {
    var out = {};
    Object.keys(COMPANY_FIELDS).forEach(function (field) {
      var v = typeof getEnv === "function" ? getEnv(COMPANY_FIELDS[field]) : null;
      out[field] = typeof v === "string" && v.trim() ? v.trim() : null;
    });
    return out;
  }

  function blockedMarker(field) {
    return "[BLOCKED_DECISION: " + COMPANY_FIELDS[field] + "]";
  }

  var PERIOD_LABELS = {
    fr: { month: "Mensuelle (chaque mois)", year: "Annuelle (chaque année)", months: "Tous les {n} mois", years: "Tous les {n} ans" },
    gb: { month: "Monthly", year: "Annual (every year)", months: "Every {n} months", years: "Every {n} years" },
    mx: { month: "Mensual (cada mes)", year: "Anual (cada año)", months: "Cada {n} meses", years: "Cada {n} años" }
  };

  function periodLabel(market, interval, count) {
    var L = PERIOD_LABELS[market];
    var n = typeof count === "number" && count > 1 ? Math.floor(count) : 1;
    if (interval === "month") return n > 1 ? L.months.replace("{n}", n) : L.month;
    if (interval === "year") return n > 1 ? L.years.replace("{n}", n) : L.year;
    fail("invalid_interval", "Periodicite inconnue : " + interval);
  }

  function requireObject(d) {
    if (!d || typeof d !== "object" || Array.isArray(d)) fail("invalid_data", "data doit etre un objet");
    return d;
  }

  function requireAmount(v, name, allowZero) {
    if (typeof v !== "number" || !isFinite(v) || Math.floor(v) !== v || v < 0 || (!allowZero && v === 0)) {
      fail("invalid_amount", name + " doit etre un entier en unite mineure (centimes)");
    }
    return v;
  }

  function requireDate(v, name) {
    var d = toDate(v);
    if (!d) fail("invalid_date", name + " doit etre une date ISO valide");
    return d;
  }

  function requireCurrency(v, cfg) {
    var cur = typeof v === "string" ? v.toUpperCase() : "";
    if (cur !== cfg.currency) fail("currency_mismatch", "Devise " + (cur || "absente") + " incompatible avec le marche " + cfg.market + " (" + cfg.currency + ")");
    return cur;
  }

  function requirePlanName(v) {
    if (typeof v !== "string" || !v.trim() || v.length > 120) fail("invalid_plan", "planName obligatoire");
    return v.trim();
  }

  function optionalPortalUrl(v) {
    if (v == null || v === "") return null;
    if (typeof v !== "string" || !/^https:\/\/billing\.stripe\.com\/[A-Za-z0-9/_\-]+$/.test(v)) {
      fail("invalid_portal_url", "portalUrl doit etre un lien https://billing.stripe.com/... (lien de connexion du portail client Stripe)");
    }
    return v;
  }

  function pageUrl(cfg, page) {
    return SITE_URL + "/" + cfg.dir + "/" + page;
  }

  function commonView(cfg, options) {
    var company = options.company || {};
    var view = {
      siteUrl: SITE_URL,
      homeUrl: SITE_URL + "/" + cfg.dir + "/",
      accountUrl: pageUrl(cfg, "compte.html"),
      cgvUrl: pageUrl(cfg, "cgv.html"),
      privacyUrl: pageUrl(cfg, "confidentialite.html"),
      legalUrl: pageUrl(cfg, "mentions-legales.html"),
      responsibleUrl: pageUrl(cfg, "jeu-responsable.html"),
      supportEmail: SUPPORT_EMAIL,
      helplineName: cfg.helpline.name,
      helplinePhone: cfg.helpline.phone,
      helplineUrl: cfg.helpline.url,
      helplineDisplay: cfg.helpline.display,
      portalUrl: optionalPortalUrl(options.portalUrl)
    };
    Object.keys(COMPANY_FIELDS).forEach(function (field) {
      var key = "company" + field.charAt(0).toUpperCase() + field.slice(1);
      var v = company[field];
      view[key] = typeof v === "string" && v.trim() ? v.trim() : blockedMarker(field);
    });
    return view;
  }

  function purchaseView(cfg, d, options) {
    requireObject(d);
    var start = requireDate(d.startDate, "startDate");
    var next = d.nextBillingDate == null ? null : requireDate(d.nextBillingDate, "nextBillingDate");
    var amountMinor = requireAmount(d.amountMinor, "amountMinor", true);
    var paidMinor = d.amountPaidMinor == null ? null : requireAmount(d.amountPaidMinor, "amountPaidMinor", true);
    requireCurrency(d.currency, cfg);
    if (!isValidEmail(d.customerEmail)) fail("invalid_email", "customerEmail invalide");
    var termsVersion = cleanToken(d.termsVersion, /^\d{4}-\d{2}-\d{2}$/);
    var consentAt = d.consentRecordedAt == null ? null : toDate(d.consentRecordedAt);
    var view = commonView(cfg, options);
    view.planName = requirePlanName(d.planName);
    view.amount = formatMoney(amountMinor, cfg.currency, cfg.intlLocale);
    view.amountPaid = paidMinor != null && paidMinor !== amountMinor ? formatMoney(paidMinor, cfg.currency, cfg.intlLocale) : null;
    view.currencyCode = cfg.currency;
    view.periodicity = periodLabel(cfg.market, d.interval, d.intervalCount);
    view.startDate = formatDate(start, cfg.intlLocale, cfg.timeZone);
    view.nextBillingDate = next ? formatDate(next, cfg.intlLocale, cfg.timeZone) : null;
    // Delai de 14 jours : fin du 14e jour calendaire qui suit la souscription.
    view.withdrawalDeadline = formatLocalDatePlusDays(start, 14, cfg.intlLocale, cfg.timeZone);
    view.customerEmail = d.customerEmail;
    view.immediateStart = d.immediateStartRequested === true;
    view.termsVersion = termsVersion ? formatDate(new Date(termsVersion + "T12:00:00Z"), cfg.intlLocale, "UTC") : null;
    view.consentRecordedAt = consentAt ? formatDateTime(consentAt, cfg.intlLocale, cfg.timeZone) : null;
    view.reference = cleanToken(d.reference, /^[A-Za-z0-9_\-]{1,100}$/);
    return view;
  }

  function reminderView(cfg, d, options) {
    requireObject(d);
    var now = toDate(options.now) || fail("invalid_now", "options.now obligatoire pour le rappel (fonction pure)");
    var renewal = requireDate(d.renewalDate, "renewalDate");
    if (renewal.getTime() <= now.getTime()) fail("renewal_in_past", "renewalDate doit etre dans le futur");
    var amountMinor = requireAmount(d.amountMinor, "amountMinor", false);
    requireCurrency(d.currency, cfg);
    if (!isValidEmail(d.customerEmail)) fail("invalid_email", "customerEmail invalide");
    var days = Math.max(1, Math.round((renewal.getTime() - now.getTime()) / 86400000));
    var view = commonView(cfg, options);
    view.planName = requirePlanName(d.planName);
    view.amount = formatMoney(amountMinor, cfg.currency, cfg.intlLocale);
    view.currencyCode = cfg.currency;
    view.periodicity = periodLabel(cfg.market, d.interval, d.intervalCount);
    view.renewalDate = formatDate(renewal, cfg.intlLocale, cfg.timeZone);
    view.daysUntil = days;
    view.daysUntilLabel = days === 1 ? "1 día" : days + " días";
    view.customerEmail = d.customerEmail;
    view.reference = cleanToken(d.reference, /^[A-Za-z0-9_\-]{1,100}$/);
    return view;
  }

  // Rendu complet. templates = { <type>: { <marche>: { html, text } } }.
  function renderEmail(templates, kind, market, data, options) {
    options = options || {};
    if (!hasOwn.call(TEMPLATE_KINDS, kind)) fail("unknown_kind", "Type d'email inconnu : " + kind);
    var mk = normalizeMarket(market);
    if (!mk || TEMPLATE_KINDS[kind].indexOf(mk) === -1) fail("unsupported_market", "Aucun gabarit " + kind + " pour le marche " + market);
    var tpl = templates && templates[kind] && templates[kind][mk];
    if (!tpl || typeof tpl.html !== "string" || typeof tpl.text !== "string") fail("template_missing", "Gabarit absent : " + kind + "." + mk);
    var cfg = MARKETS[mk];
    var view = kind === "purchase_confirmation" ? purchaseView(cfg, data, options) : reminderView(cfg, data, options);
    var parts = splitSubject(tpl.text);
    var subject = renderTemplate(parts.subject, view, false).replace(/\s+/g, " ").trim();
    view.subject = subject;
    var html = renderTemplate(tpl.html, view, true);
    var text = renderTemplate(parts.body, view, false)
      .replace(/[ \t]+\r?\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n";
    return {
      kind: kind,
      market: mk,
      locale: cfg.htmlLang,
      currency: cfg.currency,
      subject: subject,
      html: html,
      text: text,
      blockedDecisions: listBlocked(subject + html + text)
    };
  }

  // ------------------------------------------------------- Stripe -> donnees

  function firstItem(sub) {
    return (sub && sub.items && Array.isArray(sub.items.data) && sub.items.data[0]) || {};
  }

  function periodEndIso(sub) {
    // current_period_end : sur l'abonnement (anciennes API) ou sur l'item
    // (versions dahlia) - meme regle que stripe-webhook periodEndIso().
    return unixToIso(sub && sub.current_period_end) || unixToIso(firstItem(sub).current_period_end);
  }

  function planNameFromPrice(price) {
    if (price && price.product && typeof price.product === "object" && typeof price.product.name === "string" && price.product.name.trim()) return price.product.name.trim();
    if (price && typeof price.nickname === "string" && price.nickname.trim()) return price.nickname.trim();
    // create-checkout-session ne vend qu'un Price par marche : l'abonnement Pro.
    return "IASHARK Pro";
  }

  function customerEmailOf(sub, invoice, explicit) {
    if (isValidEmail(explicit)) return explicit;
    if (sub && sub.customer && typeof sub.customer === "object" && isValidEmail(sub.customer.email)) return sub.customer.email;
    if (invoice && isValidEmail(invoice.customer_email)) return invoice.customer_email;
    return null;
  }

  function skip(reason, extra) {
    var out = { ok: false, reason: reason };
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  // Abonnement Stripe (expand items.data.price.product, customer, latest_invoice)
  // -> charge utile de confirmation d'achat. Les metadata "market" et
  // "consent_*" sont posees par create-checkout-session (consent.ts).
  function purchaseConfirmationFromStripe(input) {
    input = input || {};
    var sub = input.subscription;
    if (!sub || typeof sub !== "object" || typeof sub.id !== "string") return skip("subscription_missing");
    var meta = stringMap(sub.metadata);
    // Flux historique sans marche = marche FR (meme regle que resolvePriceId).
    var market = normalizeMarket(meta.market || "fr");
    if (!market || TEMPLATE_KINDS.purchase_confirmation.indexOf(market) === -1) return skip("no_template_for_market", { market: meta.market || null });
    if (ACTIVE_STATUSES.indexOf(sub.status) === -1) return skip("subscription_not_active", { status: sub.status || null });
    var item = firstItem(sub);
    var price = item.price || {};
    if (typeof price.unit_amount !== "number" || typeof price.currency !== "string") return skip("price_missing");
    var qty = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
    var invoice = input.invoice && typeof input.invoice === "object" ? input.invoice
      : (sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null);
    var to = customerEmailOf(sub, invoice, input.customerEmail);
    if (!to) return skip("customer_email_missing");
    var recurring = price.recurring || {};
    return {
      ok: true,
      kind: "purchase_confirmation",
      market: market,
      to: to,
      idempotencyKey: "purchase_confirmation:" + market + ":" + sub.id,
      data: {
        planName: planNameFromPrice(price),
        amountMinor: price.unit_amount * qty,
        amountPaidMinor: invoice && typeof invoice.amount_paid === "number" ? invoice.amount_paid : null,
        currency: price.currency.toUpperCase(),
        interval: recurring.interval || null,
        intervalCount: recurring.interval_count || 1,
        startDate: unixToIso(sub.start_date) || unixToIso(sub.created),
        nextBillingDate: sub.cancel_at_period_end ? null : periodEndIso(sub),
        customerEmail: to,
        immediateStartRequested: meta.consent_waiver === "true",
        termsVersion: meta.consent_terms_version || null,
        consentRecordedAt: meta.consent_server_ts || null,
        reference: sub.id
      }
    };
  }

  function renewalReminderSkipReason(sub, now) {
    if (!sub || typeof sub !== "object" || typeof sub.id !== "string") return "subscription_missing";
    if (normalizeMarket(stringMap(sub.metadata).market) !== "mx") return "not_mx_market";
    if (ACTIVE_STATUSES.indexOf(sub.status) === -1) return "subscription_not_active";
    if (sub.cancel_at_period_end) return "cancel_at_period_end";
    var end = periodEndIso(sub);
    if (!end) return "renewal_date_missing";
    if (new Date(end).getTime() <= requireDate(now, "now").getTime()) return "renewal_in_past";
    return null;
  }

  // Abonnement Stripe MX + apercu de la prochaine facture
  // (POST /v1/invoices/create_preview) -> charge utile du rappel.
  function renewalReminderFromStripe(input) {
    input = input || {};
    var sub = input.subscription;
    var reason = renewalReminderSkipReason(sub, input.now);
    if (reason) return skip(reason);
    var preview = input.preview;
    // Montant EXACT de la prochaine facture (remises, taxes) : jamais estime.
    if (!preview || typeof preview.amount_due !== "number" || typeof preview.currency !== "string") return skip("amount_unavailable");
    if (preview.amount_due <= 0) return skip("nothing_to_charge");
    var to = customerEmailOf(sub, preview, input.customerEmail);
    if (!to) return skip("customer_email_missing");
    var price = firstItem(sub).price || {};
    var recurring = price.recurring || {};
    var renewal = periodEndIso(sub);
    return {
      ok: true,
      kind: "renewal_reminder",
      market: "mx",
      to: to,
      renewalLocalDate: localDateKey(new Date(renewal), MARKETS.mx.timeZone),
      idempotencyKey: "renewal_reminder:mx:" + sub.id + ":" + localDateKey(new Date(renewal), MARKETS.mx.timeZone),
      data: {
        planName: planNameFromPrice(price),
        amountMinor: preview.amount_due,
        currency: preview.currency.toUpperCase(),
        interval: recurring.interval || null,
        intervalCount: recurring.interval_count || 1,
        renewalDate: renewal,
        customerEmail: to,
        reference: sub.id
      }
    };
  }

  // ------------------------------------------------------------ planification

  function parseReminderDays(value) {
    if (value === undefined || value === null || value === "") return DEFAULT_REMINDER_DAYS;
    var n = typeof value === "number" ? value : (/^\s*\d+\s*$/.test(String(value)) ? Number(value) : NaN);
    if (!isFinite(n) || Math.floor(n) !== n || n < MIN_REMINDER_DAYS || n > MAX_REMINDER_DAYS) {
      fail("invalid_reminder_days", "daysBefore doit etre un entier entre " + MIN_REMINDER_DAYS + " et " + MAX_REMINDER_DAYS);
    }
    return n;
  }

  // Fenetre de selection d'une execution quotidienne : renouvellements dont la
  // date LOCALE (fuseau du marche) est aujourd'hui + daysBefore. Par jour
  // calendaire et non par "24 h glissantes" : un leger decalage de l'heure
  // d'execution du cron ne fait ni doublon ni trou.
  function renewalWindow(now, daysBefore, timeZone) {
    var d = requireDate(now, "now");
    var days = parseReminderDays(daysBefore);
    var tz = timeZone || MARKETS.mx.timeZone;
    var p = localParts(d, tz);
    var target = new Date(Date.UTC(p.y, p.m - 1, p.d + days, 12));
    var y = target.getUTCFullYear(), m = target.getUTCMonth() + 1, day = target.getUTCDate();
    var next = new Date(Date.UTC(y, m - 1, day + 1, 12));
    var start = zonedMidnight(y, m, day, tz);
    var end = zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz);
    return {
      daysBefore: days,
      timeZone: tz,
      localDate: y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day,
      start: start.toISOString(),
      end: end.toISOString()
    };
  }

  function cleanIdempotencyKey(value) {
    return cleanToken(value, /^[A-Za-z0-9_:.\-]{1,256}$/);
  }

  return {
    SITE_URL: SITE_URL,
    SUPPORT_EMAIL: SUPPORT_EMAIL,
    MARKETS: MARKETS,
    TEMPLATE_KINDS: TEMPLATE_KINDS,
    COMPANY_FIELDS: COMPANY_FIELDS,
    DEFAULT_REMINDER_DAYS: DEFAULT_REMINDER_DAYS,
    MIN_RECOMMENDED_REMINDER_DAYS: MIN_RECOMMENDED_REMINDER_DAYS,
    EmailRenderError: EmailRenderError,
    escapeHtml: escapeHtml,
    isValidEmail: isValidEmail,
    maskEmail: maskEmail,
    formatMoney: formatMoney,
    renderTemplate: renderTemplate,
    renderEmail: renderEmail,
    companyFromEnv: companyFromEnv,
    purchaseConfirmationFromStripe: purchaseConfirmationFromStripe,
    renewalReminderSkipReason: renewalReminderSkipReason,
    renewalReminderFromStripe: renewalReminderFromStripe,
    parseReminderDays: parseReminderDays,
    renewalWindow: renewalWindow,
    localDateKey: localDateKey,
    cleanIdempotencyKey: cleanIdempotencyKey,
    safeEqual: safeEqual
  };
});

const api = module.exports;
export const TEMPLATES = {
  "purchase_confirmation": {
    "fr": {
      "html": "{{! Confirmation d'abonnement - France (fr). Support durable : C. consom. L221-13 (informations de L221-5, formulaire de retractation, confirmation de la demande d'execution immediate). Textes repris de legal/fr/cgv.html (art. 6 a 9, 13/09/2026). STATUT : REVIEW. CSS inline ; le bloc <style> ne sert qu'au mode sombre et au mobile. }}<!DOCTYPE html>\n<html lang=\"fr\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<meta name=\"format-detection\" content=\"telephone=no, date=no, address=no, email=no\">\n<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"supported-color-schemes\" content=\"light dark\">\n<title>{{subject}}</title>\n<style>\n:root { color-scheme: light dark; supported-color-schemes: light dark; }\n@media (prefers-color-scheme: dark) {\n  .bg-page { background-color: #0b1118 !important; }\n  .bg-card { background-color: #131c27 !important; border-color: #263444 !important; }\n  .bg-soft { background-color: #18232f !important; border-color: #2f6f86 !important; }\n  .bg-warn { background-color: #2a2213 !important; border-color: #6b5320 !important; }\n  .tx { color: #e9eef4 !important; }\n  .tx-soft { color: #a9b6c4 !important; }\n  .bd { border-color: #263444 !important; }\n  .lnk { color: #62d6ec !important; }\n}\n[data-ogsc] .bg-page { background-color: #0b1118 !important; }\n[data-ogsc] .bg-card { background-color: #131c27 !important; }\n[data-ogsc] .bg-soft { background-color: #18232f !important; }\n[data-ogsc] .bg-warn { background-color: #2a2213 !important; }\n[data-ogsc] .tx { color: #e9eef4 !important; }\n[data-ogsc] .tx-soft { color: #a9b6c4 !important; }\n[data-ogsc] .lnk { color: #62d6ec !important; }\n@media only screen and (max-width: 620px) {\n  .container { width: 100% !important; }\n  .pad { padding: 20px !important; }\n}\n</style>\n</head>\n<body class=\"bg-page\" style=\"margin:0;padding:0;background-color:#f2f4f7;-webkit-text-size-adjust:100%;\">\n<div style=\"display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f2f4f7;\">Votre abonnement {{planName}} est actif : récapitulatif, résiliation en ligne et droit de rétractation.</div>\n<table role=\"presentation\" class=\"bg-page\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background-color:#f2f4f7;border-collapse:collapse;\">\n<tr>\n<td align=\"center\" style=\"padding:24px 12px;\">\n<table role=\"presentation\" class=\"container\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;border-collapse:collapse;\">\n<tr>\n<td class=\"tx\" style=\"padding:4px 4px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;font-weight:bold;letter-spacing:3px;color:#0b1a2a;\">IASHARK</td>\n</tr>\n<tr>\n<td class=\"bg-card pad\" style=\"padding:32px;background-color:#ffffff;border:1px solid #dfe4ea;border-radius:12px;font-family:Arial,Helvetica,sans-serif;\">\n\n<h1 class=\"tx\" style=\"margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:31px;font-weight:bold;color:#0b1a2a;\">Votre abonnement est confirmé</h1>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Bonjour,</p>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">Merci pour votre souscription. Cet email confirme votre contrat sur un support durable : nous vous conseillons de le conserver.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Récapitulatif</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 18px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Offre</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{planName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Prix</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amount}} TTC ({{currencyCode}})</td></tr>\n{{#amountPaid}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Montant payé aujourd’hui</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amountPaid}} TTC</td></tr>{{/amountPaid}}\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Périodicité</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{periodicity}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Date de début</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{startDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Prochain prélèvement</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{#nextBillingDate}}{{nextBillingDate}} ({{amount}} TTC){{/nextBillingDate}}{{^nextBillingDate}}Aucun : résiliation déjà programmée{{/nextBillingDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Compte</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{customerEmail}}</td></tr>\n{{#reference}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Référence</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:13px;line-height:20px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{reference}}</td></tr>{{/reference}}\n</table>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">L’abonnement est sans engagement de durée. Il se renouvelle automatiquement à chaque échéance, au prix alors en vigueur, jusqu’à sa résiliation. Toute modification de prix vous sera notifiée avant de s’appliquer, et vous pourrez résilier avant cette date.</p>\n\n<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:separate;margin:0 0 26px;\">\n<tr><td align=\"center\" bgcolor=\"#0a6d8f\" style=\"background-color:#0a6d8f;border-radius:8px;\"><a href=\"{{accountUrl}}\" target=\"_blank\" style=\"display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;\">Accéder à mon compte</a></td></tr>\n</table>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Résilier en ligne</h2>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Vous pouvez résilier à tout moment, gratuitement et en ligne : dans <a class=\"lnk\" href=\"{{accountUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Mon compte</a>, cliquez sur « Gérer mon abonnement ». Cela ouvre l’espace de facturation sécurisé de notre prestataire de paiement (Stripe), où vous choisissez l’annulation. Vous pouvez aussi écrire à <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.</p>\n{{#portalUrl}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Accès direct à l’espace de facturation : <a class=\"lnk\" href=\"{{portalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{portalUrl}}</a></p>{{/portalUrl}}\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">La résiliation prend effet à la fin de la période en cours : vous gardez l’accès jusqu’à cette date et aucun nouveau prélèvement n’est effectué.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Droit de rétractation : 14 jours</h2>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Vous disposez de 14 jours à compter de la souscription pour vous rétracter sans avoir à donner de motif (Code de la consommation, art. L221-18), soit jusqu’au {{withdrawalDeadline}} inclus.</p>\n{{#immediateStart}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Lors du paiement, vous avez demandé expressément que l’abonnement commence immédiatement, avant la fin de ce délai (art. L221-25). Cette demande ne vous fait pas perdre votre droit de rétractation : si vous vous rétractez pendant le délai, nous vous remboursons au plus tard 14 jours après votre demande, déduction faite d’un montant proportionnel au service fourni jusqu’à la communication de votre décision, calculé au prorata de la durée d’accès sur la période payée.</p>{{/immediateStart}}\n{{^immediateStart}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Aucune demande d’exécution immédiate n’est enregistrée pour cet abonnement : si vous vous rétractez pendant le délai, aucune somme n’est due et nous vous remboursons intégralement au plus tard 14 jours après votre demande.</p>{{/immediateStart}}\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Pour vous rétracter, envoyez avant la fin du délai une déclaration sans ambiguïté à <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>, par exemple avec le modèle ci-dessous. Le remboursement est effectué avec le moyen de paiement utilisé lors de la souscription.</p>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><td class=\"bg-soft\" style=\"padding:14px 16px;background-color:#f4f7fa;border-left:4px solid #0a6d8f;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#0b1a2a;\">Modèle de formulaire de rétractation</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">À l’attention d’IASHARK, {{supportEmail}} :</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">Je vous notifie par la présente ma rétractation du contrat portant sur l’abonnement {{planName}} souscrit le {{startDate}}.</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">Nom : ………… · Adresse email du compte : ………… · Date : …………</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#1f2d3a;\">Signature (uniquement en cas d’envoi sur papier) : …………</p>\n</td></tr>\n</table>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Conditions générales de vente</h2>\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{#termsVersion}}Vous avez accepté les conditions générales de vente dans leur version du {{termsVersion}}{{#consentRecordedAt}} (consentement enregistré le {{consentRecordedAt}}){{/consentRecordedAt}}. {{/termsVersion}}Elles sont consultables ici : <a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{cgvUrl}}</a></p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Vendeur</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Nom commercial</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">IASHARK (auto-entrepreneur)</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Raison sociale / exploitant</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyOperatorName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Adresse</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyAddress}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">SIREN / SIRET</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyRegistration}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">TVA</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyVat}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Téléphone</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyPhone}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Email</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\"><a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a></td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Médiateur de la consommation</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyMediator}}</td></tr>\n</table>\n\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0;\">\n<tr><td class=\"bg-warn\" style=\"padding:16px 18px;background-color:#fff8eb;border:1px solid #f0d49c;border-radius:8px;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#3a2a0c;\">Jeu responsable · 18+</p>\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;color:#3a2a0c;\">IASHARK publie des analyses statistiques : ce n’est pas un site de paris, aucune mise n’est prise et aucun gain n’est garanti. IASHARK n’est pas un opérateur agréé par l’Autorité nationale des jeux (ANJ). Les jeux d’argent sont interdits aux mineurs.</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#3a2a0c;\">Jouer comporte des risques : endettement, dépendance. Appelez le {{helplinePhone}} ({{helplineName}}, appel non surtaxé) ou consultez <a class=\"lnk\" href=\"{{helplineUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{helplineDisplay}}</a>. Nos ressources : <a class=\"lnk\" href=\"{{responsibleUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Jeu responsable</a>.</p>\n</td></tr>\n</table>\n\n</td>\n</tr>\n<tr>\n<td class=\"tx-soft\" style=\"padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5d6b79;\">\nEmail envoyé automatiquement à {{customerEmail}} à la suite de votre souscription. Question ou réclamation : <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.<br>\n<a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">CGV</a> · <a class=\"lnk\" href=\"{{privacyUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Confidentialité</a> · <a class=\"lnk\" href=\"{{legalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Mentions légales</a> · <a class=\"lnk\" href=\"{{homeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">iashark.com</a>\n</td>\n</tr>\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>\n",
      "text": "Subject: Confirmation de votre abonnement {{planName}}\n{{! Version texte de purchase-confirmation.fr.html : meme contenu, aucune information en moins. }}IASHARK\n\nVOTRE ABONNEMENT EST CONFIRMÉ\n\nBonjour,\n\nMerci pour votre souscription. Cet email confirme votre contrat sur un support durable : nous vous conseillons de le conserver.\n\nRÉCAPITULATIF\n- Offre : {{planName}}\n- Prix : {{amount}} TTC ({{currencyCode}})\n{{#amountPaid}}- Montant payé aujourd’hui : {{amountPaid}} TTC\n{{/amountPaid}}- Périodicité : {{periodicity}}\n- Date de début : {{startDate}}\n- Prochain prélèvement : {{#nextBillingDate}}{{nextBillingDate}} ({{amount}} TTC){{/nextBillingDate}}{{^nextBillingDate}}Aucun : résiliation déjà programmée{{/nextBillingDate}}\n- Compte : {{customerEmail}}\n{{#reference}}- Référence : {{reference}}\n{{/reference}}\nL’abonnement est sans engagement de durée. Il se renouvelle automatiquement à chaque échéance, au prix alors en vigueur, jusqu’à sa résiliation. Toute modification de prix vous sera notifiée avant de s’appliquer, et vous pourrez résilier avant cette date.\n\nMon compte : {{accountUrl}}\n\nRÉSILIER EN LIGNE\nVous pouvez résilier à tout moment, gratuitement et en ligne : dans Mon compte ({{accountUrl}}), cliquez sur « Gérer mon abonnement ». Cela ouvre l’espace de facturation sécurisé de notre prestataire de paiement (Stripe), où vous choisissez l’annulation. Vous pouvez aussi écrire à {{supportEmail}}.\n{{#portalUrl}}Accès direct à l’espace de facturation : {{portalUrl}}\n{{/portalUrl}}\nLa résiliation prend effet à la fin de la période en cours : vous gardez l’accès jusqu’à cette date et aucun nouveau prélèvement n’est effectué.\n\nDROIT DE RÉTRACTATION : 14 JOURS\nVous disposez de 14 jours à compter de la souscription pour vous rétracter sans avoir à donner de motif (Code de la consommation, art. L221-18), soit jusqu’au {{withdrawalDeadline}} inclus.\n\n{{#immediateStart}}Lors du paiement, vous avez demandé expressément que l’abonnement commence immédiatement, avant la fin de ce délai (art. L221-25). Cette demande ne vous fait pas perdre votre droit de rétractation : si vous vous rétractez pendant le délai, nous vous remboursons au plus tard 14 jours après votre demande, déduction faite d’un montant proportionnel au service fourni jusqu’à la communication de votre décision, calculé au prorata de la durée d’accès sur la période payée.{{/immediateStart}}{{^immediateStart}}Aucune demande d’exécution immédiate n’est enregistrée pour cet abonnement : si vous vous rétractez pendant le délai, aucune somme n’est due et nous vous remboursons intégralement au plus tard 14 jours après votre demande.{{/immediateStart}}\n\nPour vous rétracter, envoyez avant la fin du délai une déclaration sans ambiguïté à {{supportEmail}}, par exemple avec le modèle ci-dessous. Le remboursement est effectué avec le moyen de paiement utilisé lors de la souscription.\n\n  Modèle de formulaire de rétractation\n  | À l’attention d’IASHARK, {{supportEmail}} :\n  | Je vous notifie par la présente ma rétractation du contrat portant sur l’abonnement {{planName}} souscrit le {{startDate}}.\n  | Nom : ………… · Adresse email du compte : ………… · Date : …………\n  | Signature (uniquement en cas d’envoi sur papier) : …………\n\nCONDITIONS GÉNÉRALES DE VENTE\n{{#termsVersion}}Vous avez accepté les conditions générales de vente dans leur version du {{termsVersion}}{{#consentRecordedAt}} (consentement enregistré le {{consentRecordedAt}}){{/consentRecordedAt}}. {{/termsVersion}}Elles sont consultables ici : {{cgvUrl}}\n\nVENDEUR\n- Nom commercial : IASHARK (auto-entrepreneur)\n- Raison sociale / exploitant : {{companyOperatorName}}\n- Adresse : {{companyAddress}}\n- SIREN / SIRET : {{companyRegistration}}\n- TVA : {{companyVat}}\n- Téléphone : {{companyPhone}}\n- Email : {{supportEmail}}\n- Médiateur de la consommation : {{companyMediator}}\n\nJEU RESPONSABLE · 18+\nIASHARK publie des analyses statistiques : ce n’est pas un site de paris, aucune mise n’est prise et aucun gain n’est garanti. IASHARK n’est pas un opérateur agréé par l’Autorité nationale des jeux (ANJ). Les jeux d’argent sont interdits aux mineurs.\nJouer comporte des risques : endettement, dépendance. Appelez le {{helplinePhone}} ({{helplineName}}, appel non surtaxé) ou consultez {{helplineUrl}}. Nos ressources : {{responsibleUrl}}\n\n--\nEmail envoyé automatiquement à {{customerEmail}} à la suite de votre souscription. Question ou réclamation : {{supportEmail}}.\nCGV : {{cgvUrl}}\nConfidentialité : {{privacyUrl}}\nMentions légales : {{legalUrl}}\n"
    },
    "gb": {
      "html": "{{! Subscription confirmation - United Kingdom (gb, en-GB). Durable-medium confirmation: Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 reg. 16 and Schedule 2, reg. 36/37 (express request + acknowledgement), model cancellation form (Schedule 3 part B). Wording from legal/gb/cgv.html (s5 to s8, 13/09/2026). STATUS: REVIEW. Inline CSS; the <style> block is only for dark mode and mobile. }}<!DOCTYPE html>\n<html lang=\"en-GB\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<meta name=\"format-detection\" content=\"telephone=no, date=no, address=no, email=no\">\n<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"supported-color-schemes\" content=\"light dark\">\n<title>{{subject}}</title>\n<style>\n:root { color-scheme: light dark; supported-color-schemes: light dark; }\n@media (prefers-color-scheme: dark) {\n  .bg-page { background-color: #0b1118 !important; }\n  .bg-card { background-color: #131c27 !important; border-color: #263444 !important; }\n  .bg-soft { background-color: #18232f !important; border-color: #2f6f86 !important; }\n  .bg-warn { background-color: #2a2213 !important; border-color: #6b5320 !important; }\n  .tx { color: #e9eef4 !important; }\n  .tx-soft { color: #a9b6c4 !important; }\n  .bd { border-color: #263444 !important; }\n  .lnk { color: #62d6ec !important; }\n}\n[data-ogsc] .bg-page { background-color: #0b1118 !important; }\n[data-ogsc] .bg-card { background-color: #131c27 !important; }\n[data-ogsc] .bg-soft { background-color: #18232f !important; }\n[data-ogsc] .bg-warn { background-color: #2a2213 !important; }\n[data-ogsc] .tx { color: #e9eef4 !important; }\n[data-ogsc] .tx-soft { color: #a9b6c4 !important; }\n[data-ogsc] .lnk { color: #62d6ec !important; }\n@media only screen and (max-width: 620px) {\n  .container { width: 100% !important; }\n  .pad { padding: 20px !important; }\n}\n</style>\n</head>\n<body class=\"bg-page\" style=\"margin:0;padding:0;background-color:#f2f4f7;-webkit-text-size-adjust:100%;\">\n<div style=\"display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f2f4f7;\">Your {{planName}} subscription is active: summary, how to cancel online and your 14-day right to cancel.</div>\n<table role=\"presentation\" class=\"bg-page\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background-color:#f2f4f7;border-collapse:collapse;\">\n<tr>\n<td align=\"center\" style=\"padding:24px 12px;\">\n<table role=\"presentation\" class=\"container\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;border-collapse:collapse;\">\n<tr>\n<td class=\"tx\" style=\"padding:4px 4px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;font-weight:bold;letter-spacing:3px;color:#0b1a2a;\">IASHARK</td>\n</tr>\n<tr>\n<td class=\"bg-card pad\" style=\"padding:32px;background-color:#ffffff;border:1px solid #dfe4ea;border-radius:12px;font-family:Arial,Helvetica,sans-serif;\">\n\n<h1 class=\"tx\" style=\"margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:31px;font-weight:bold;color:#0b1a2a;\">Your subscription is confirmed</h1>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Hello,</p>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">Thank you for subscribing. This email confirms your contract on a durable medium, so please keep it for your records.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Summary</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 18px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Plan</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{planName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Price</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amount}} ({{currencyCode}}, total price including any applicable taxes)</td></tr>\n{{#amountPaid}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Amount paid today</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amountPaid}}</td></tr>{{/amountPaid}}\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Billing frequency</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{periodicity}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Start date</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{startDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Next payment</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{#nextBillingDate}}{{nextBillingDate}} ({{amount}}){{/nextBillingDate}}{{^nextBillingDate}}None: cancellation already scheduled{{/nextBillingDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Account</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{customerEmail}}</td></tr>\n{{#reference}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Reference</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:13px;line-height:20px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{reference}}</td></tr>{{/reference}}\n</table>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">Your subscription has no minimum term. It renews automatically at the end of each billing period, at the price then in force, until you cancel it. If we change the price, we will tell you in advance and you can cancel before the new price applies.</p>\n\n<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:separate;margin:0 0 26px;\">\n<tr><td align=\"center\" bgcolor=\"#0a6d8f\" style=\"background-color:#0a6d8f;border-radius:8px;\"><a href=\"{{accountUrl}}\" target=\"_blank\" style=\"display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;\">Go to my account</a></td></tr>\n</table>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Cancel online at any time</h2>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">You can stop your subscription at any time, free of charge: in <a class=\"lnk\" href=\"{{accountUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">My account</a>, click “Manage my subscription”. This opens our payment provider’s (Stripe) secure billing area, where you can cancel. You can also email <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.</p>\n{{#portalUrl}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Direct link to the billing area: <a class=\"lnk\" href=\"{{portalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{portalUrl}}</a></p>{{/portalUrl}}\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">Cancellation takes effect at the end of your current billing period. You keep paid access until then and you will not be charged again.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Your right to cancel within 14 days</h2>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013, you may cancel within 14 days of subscribing without giving a reason. The cancellation period ends on {{withdrawalDeadline}}.</p>\n{{#immediateStart}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">At checkout you gave your express consent for your subscription to start immediately, and you acknowledged that you lose the right to cancel once you get access to the digital content (regulation 37). If any part of the subscription is treated as a service and you cancel within 14 days, you pay a proportionate amount for what was supplied until you told us (regulation 36), and we refund the rest within 14 days. Your rights under the Consumer Rights Act 2015 are not affected.</p>{{/immediateStart}}\n{{^immediateStart}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">No express consent to an immediate start is recorded for this subscription: if you cancel within the 14 days, you bear no cost and we refund you in full within 14 days.</p>{{/immediateStart}}\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">How to cancel: before the 14 days end, email <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a> with a clear statement that you are cancelling. You can use the model form below, but you do not have to. Any refund is made without undue delay, and no later than 14 days after we are told of your decision, using the payment method you used.</p>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><td class=\"bg-soft\" style=\"padding:14px 16px;background-color:#f4f7fa;border-left:4px solid #0a6d8f;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#0b1a2a;\">Model cancellation form</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">To: IASHARK, {{supportEmail}}</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">I hereby give notice that I cancel my contract for the supply of the following service: IASHARK subscription {{planName}}, ordered on {{startDate}}.</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">Name: ………… · Account email address: ………… · Date: …………</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#1f2d3a;\">Signature (only if this form is sent on paper): …………</p>\n</td></tr>\n</table>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Terms and conditions</h2>\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{#termsVersion}}You accepted our terms dated {{termsVersion}}{{#consentRecordedAt}} (consent recorded on {{consentRecordedAt}}){{/consentRecordedAt}}. {{/termsVersion}}You can read them here: <a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{cgvUrl}}</a></p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Who we are</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Trading name</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">IASHARK (sole trader established in France)</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Legal name</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyOperatorName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Geographic address</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyAddress}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Registration number (SIREN / SIRET, France)</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyRegistration}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">VAT number</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyVat}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Telephone</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyPhone}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Email</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\"><a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a></td></tr>\n</table>\n\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0;\">\n<tr><td class=\"bg-warn\" style=\"padding:16px 18px;background-color:#fff8eb;border:1px solid #f0d49c;border-radius:8px;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#3a2a0c;\">Safer gambling · 18+</p>\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;color:#3a2a0c;\">IASHARK publishes statistical analysis only. We are not a bookmaker, we do not take bets and no winnings are guaranteed. You must be 18 or over to use IASHARK.</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#3a2a0c;\">Gambling can cause harm. For free, confidential support, visit <a class=\"lnk\" href=\"{{helplineUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{helplineDisplay}}</a> or call the {{helplineName}} on {{helplinePhone}} (24/7). More: <a class=\"lnk\" href=\"{{responsibleUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Safer gambling</a>.</p>\n</td></tr>\n</table>\n\n</td>\n</tr>\n<tr>\n<td class=\"tx-soft\" style=\"padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5d6b79;\">\nThis email was sent automatically to {{customerEmail}} following your subscription. Questions or complaints: <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.<br>\n<a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Terms</a> · <a class=\"lnk\" href=\"{{privacyUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Privacy</a> · <a class=\"lnk\" href=\"{{legalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Legal notice</a> · <a class=\"lnk\" href=\"{{homeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">iashark.com</a>\n</td>\n</tr>\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>\n",
      "text": "Subject: Your {{planName}} subscription is confirmed\n{{! Plain-text version of purchase-confirmation.gb.html: same content, nothing left out. }}IASHARK\n\nYOUR SUBSCRIPTION IS CONFIRMED\n\nHello,\n\nThank you for subscribing. This email confirms your contract on a durable medium, so please keep it for your records.\n\nSUMMARY\n- Plan: {{planName}}\n- Price: {{amount}} ({{currencyCode}}, total price including any applicable taxes)\n{{#amountPaid}}- Amount paid today: {{amountPaid}}\n{{/amountPaid}}- Billing frequency: {{periodicity}}\n- Start date: {{startDate}}\n- Next payment: {{#nextBillingDate}}{{nextBillingDate}} ({{amount}}){{/nextBillingDate}}{{^nextBillingDate}}None: cancellation already scheduled{{/nextBillingDate}}\n- Account: {{customerEmail}}\n{{#reference}}- Reference: {{reference}}\n{{/reference}}\nYour subscription has no minimum term. It renews automatically at the end of each billing period, at the price then in force, until you cancel it. If we change the price, we will tell you in advance and you can cancel before the new price applies.\n\nMy account: {{accountUrl}}\n\nCANCEL ONLINE AT ANY TIME\nYou can stop your subscription at any time, free of charge: in My account ({{accountUrl}}), click “Manage my subscription”. This opens our payment provider’s (Stripe) secure billing area, where you can cancel. You can also email {{supportEmail}}.\n{{#portalUrl}}Direct link to the billing area: {{portalUrl}}\n{{/portalUrl}}\nCancellation takes effect at the end of your current billing period. You keep paid access until then and you will not be charged again.\n\nYOUR RIGHT TO CANCEL WITHIN 14 DAYS\nUnder the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013, you may cancel within 14 days of subscribing without giving a reason. The cancellation period ends on {{withdrawalDeadline}}.\n\n{{#immediateStart}}At checkout you gave your express consent for your subscription to start immediately, and you acknowledged that you lose the right to cancel once you get access to the digital content (regulation 37). If any part of the subscription is treated as a service and you cancel within 14 days, you pay a proportionate amount for what was supplied until you told us (regulation 36), and we refund the rest within 14 days. Your rights under the Consumer Rights Act 2015 are not affected.{{/immediateStart}}{{^immediateStart}}No express consent to an immediate start is recorded for this subscription: if you cancel within the 14 days, you bear no cost and we refund you in full within 14 days.{{/immediateStart}}\n\nHow to cancel: before the 14 days end, email {{supportEmail}} with a clear statement that you are cancelling. You can use the model form below, but you do not have to. Any refund is made without undue delay, and no later than 14 days after we are told of your decision, using the payment method you used.\n\n  Model cancellation form\n  | To: IASHARK, {{supportEmail}}\n  | I hereby give notice that I cancel my contract for the supply of the following service: IASHARK subscription {{planName}}, ordered on {{startDate}}.\n  | Name: ………… · Account email address: ………… · Date: …………\n  | Signature (only if this form is sent on paper): …………\n\nTERMS AND CONDITIONS\n{{#termsVersion}}You accepted our terms dated {{termsVersion}}{{#consentRecordedAt}} (consent recorded on {{consentRecordedAt}}){{/consentRecordedAt}}. {{/termsVersion}}You can read them here: {{cgvUrl}}\n\nWHO WE ARE\n- Trading name: IASHARK (sole trader established in France)\n- Legal name: {{companyOperatorName}}\n- Geographic address: {{companyAddress}}\n- Registration number (SIREN / SIRET, France): {{companyRegistration}}\n- VAT number: {{companyVat}}\n- Telephone: {{companyPhone}}\n- Email: {{supportEmail}}\n\nSAFER GAMBLING · 18+\nIASHARK publishes statistical analysis only. We are not a bookmaker, we do not take bets and no winnings are guaranteed. You must be 18 or over to use IASHARK.\nGambling can cause harm. For free, confidential support, visit {{helplineDisplay}} ({{helplineUrl}}) or call the {{helplineName}} on {{helplinePhone}} (24/7). More: {{responsibleUrl}}\n\n--\nThis email was sent automatically to {{customerEmail}} following your subscription. Questions or complaints: {{supportEmail}}.\nTerms: {{cgvUrl}}\nPrivacy: {{privacyUrl}}\nLegal notice: {{legalUrl}}\n"
    }
  },
  "renewal_reminder": {
    "mx": {
      "html": "{{! Aviso previo de renovacion automatica - Mexico (mx, es-MX). LFPC art. 76 Bis (informacion clara del cobro recurrente y cancelacion inmediata en linea) ; datos de PROFECO tomados de legal/mx/cgv.html (apartados 6 a 8 y 12, 13/09/2026). Enviado N dias antes de la renovacion (por defecto 7). ESTADO: REVIEW. CSS en linea ; el bloque <style> solo sirve para el modo oscuro y movil. }}<!DOCTYPE html>\n<html lang=\"es-MX\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<meta name=\"format-detection\" content=\"telephone=no, date=no, address=no, email=no\">\n<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"supported-color-schemes\" content=\"light dark\">\n<title>{{subject}}</title>\n<style>\n:root { color-scheme: light dark; supported-color-schemes: light dark; }\n@media (prefers-color-scheme: dark) {\n  .bg-page { background-color: #0b1118 !important; }\n  .bg-card { background-color: #131c27 !important; border-color: #263444 !important; }\n  .bg-soft { background-color: #18232f !important; border-color: #2f6f86 !important; }\n  .bg-warn { background-color: #2a2213 !important; border-color: #6b5320 !important; }\n  .tx { color: #e9eef4 !important; }\n  .tx-soft { color: #a9b6c4 !important; }\n  .bd { border-color: #263444 !important; }\n  .lnk { color: #62d6ec !important; }\n}\n[data-ogsc] .bg-page { background-color: #0b1118 !important; }\n[data-ogsc] .bg-card { background-color: #131c27 !important; }\n[data-ogsc] .bg-soft { background-color: #18232f !important; }\n[data-ogsc] .bg-warn { background-color: #2a2213 !important; }\n[data-ogsc] .tx { color: #e9eef4 !important; }\n[data-ogsc] .tx-soft { color: #a9b6c4 !important; }\n[data-ogsc] .lnk { color: #62d6ec !important; }\n@media only screen and (max-width: 620px) {\n  .container { width: 100% !important; }\n  .pad { padding: 20px !important; }\n}\n</style>\n</head>\n<body class=\"bg-page\" style=\"margin:0;padding:0;background-color:#f2f4f7;-webkit-text-size-adjust:100%;\">\n<div style=\"display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f2f4f7;\">El {{renewalDate}} se cobrarán {{amount}}. Si no quieres renovar, puedes cancelar en línea antes de esa fecha.</div>\n<table role=\"presentation\" class=\"bg-page\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background-color:#f2f4f7;border-collapse:collapse;\">\n<tr>\n<td align=\"center\" style=\"padding:24px 12px;\">\n<table role=\"presentation\" class=\"container\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;border-collapse:collapse;\">\n<tr>\n<td class=\"tx\" style=\"padding:4px 4px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;font-weight:bold;letter-spacing:3px;color:#0b1a2a;\">IASHARK</td>\n</tr>\n<tr>\n<td class=\"bg-card pad\" style=\"padding:32px;background-color:#ffffff;border:1px solid #dfe4ea;border-radius:12px;font-family:Arial,Helvetica,sans-serif;\">\n\n<h1 class=\"tx\" style=\"margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:31px;font-weight:bold;color:#0b1a2a;\">Tu suscripción se renueva en {{daysUntilLabel}}</h1>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Hola:</p>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">Te avisamos con anticipación que tu suscripción {{planName}} se renovará automáticamente el <strong style=\"font-weight:bold;\">{{renewalDate}}</strong> y que ese día se hará el cargo a tu método de pago.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Detalle del próximo cobro</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 18px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Plan</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{planName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Monto que se cobrará</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amount}} (pesos mexicanos, impuestos aplicables incluidos)</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Fecha del cobro</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{renewalDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Periodicidad</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{periodicity}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Cuenta</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{customerEmail}}</td></tr>\n{{#reference}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Referencia</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:13px;line-height:20px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{reference}}</td></tr>{{/reference}}\n</table>\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">Si quieres seguir usando {{planName}}, no tienes que hacer nada.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Cómo cancelar en línea</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 14px;\">\n<tr><td class=\"bg-soft\" style=\"padding:14px 16px;background-color:#f4f7fa;border-left:4px solid #0a6d8f;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:15px;line-height:23px;color:#1f2d3a;\">1. Entra a <a class=\"lnk\" href=\"{{accountUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Mi cuenta</a> con tu correo {{customerEmail}}.</p>\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:15px;line-height:23px;color:#1f2d3a;\">2. Haz clic en «Gestionar mi suscripción». Se abre el área de facturación segura de nuestro proveedor de pagos (Stripe).</p>\n<p class=\"tx\" style=\"margin:0;font-size:15px;line-height:23px;color:#1f2d3a;\">3. Elige cancelar la suscripción. La cancelación es inmediata, sin costo y sin penalización.</p>\n</td></tr>\n</table>\n{{#portalUrl}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Acceso directo al área de facturación: <a class=\"lnk\" href=\"{{portalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{portalUrl}}</a></p>{{/portalUrl}}\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">Si cancelas antes del {{renewalDate}}, no se hará este cobro. Conservas el acceso de pago hasta el final del periodo que ya pagaste. También puedes pedir la cancelación escribiendo a <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.</p>\n\n<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:separate;margin:0 0 26px;\">\n<tr><td align=\"center\" bgcolor=\"#0a6d8f\" style=\"background-color:#0a6d8f;border-radius:8px;\"><a href=\"{{accountUrl}}\" target=\"_blank\" style=\"display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;\">Ir a Mi cuenta</a></td></tr>\n</table>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Tus derechos</h2>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Nada de este aviso limita los derechos que te otorga la Ley Federal de Protección al Consumidor, que son irrenunciables. Para cualquier aclaración o reclamación, escríbenos a <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.</p>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">También puedes acudir a la Procuraduría Federal del Consumidor (PROFECO): Teléfono del Consumidor 800 468 8722 (lada sin costo) o 55 5568 8722 (Ciudad de México y área metropolitana), <a class=\"lnk\" href=\"https://www.gob.mx/profeco\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">gob.mx/profeco</a>.</p>\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">Términos y condiciones: <a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{cgvUrl}}</a></p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Datos del proveedor</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Nombre comercial</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">IASHARK (empresario individual establecido en Francia)</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Titular</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyOperatorName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Domicilio</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyAddress}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Número de registro (SIREN / SIRET, Francia)</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyRegistration}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Teléfono</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyPhone}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Correo electrónico</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\"><a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a></td></tr>\n</table>\n\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0;\">\n<tr><td class=\"bg-warn\" style=\"padding:16px 18px;background-color:#fff8eb;border:1px solid #f0d49c;border-radius:8px;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#3a2a0c;\">Juego responsable · 18+</p>\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;color:#3a2a0c;\">IASHARK ofrece análisis estadísticos: no es una casa de apuestas, no recibe apuestas y no garantiza ganancias. Prohibido para menores de 18 años.</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#3a2a0c;\">Las apuestas pueden generar adicción. Orientación gratuita las 24 horas: {{helplineName}}, {{helplinePhone}} (<a class=\"lnk\" href=\"{{helplineUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{helplineDisplay}}</a>). Más información: <a class=\"lnk\" href=\"{{responsibleUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Juego responsable</a>.</p>\n</td></tr>\n</table>\n\n</td>\n</tr>\n<tr>\n<td class=\"tx-soft\" style=\"padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5d6b79;\">\nAviso de renovación enviado automáticamente a {{customerEmail}} porque tienes una suscripción activa con cobro recurrente. Aclaraciones: <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.<br>\n<a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Términos</a> · <a class=\"lnk\" href=\"{{privacyUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Aviso de privacidad</a> · <a class=\"lnk\" href=\"{{legalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Aviso legal</a> · <a class=\"lnk\" href=\"{{homeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">iashark.com</a>\n</td>\n</tr>\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>\n",
      "text": "Subject: Tu suscripción {{planName}} se renueva el {{renewalDate}}\n{{! Version de texto de renewal-reminder.mx.html: mismo contenido, sin omitir nada. }}IASHARK\n\nTu suscripción se renueva en {{daysUntilLabel}}\n===============================================\n\nHola:\n\nTe avisamos con anticipación que tu suscripción {{planName}} se renovará automáticamente el {{renewalDate}} y que ese día se hará el cargo a tu método de pago.\n\nDETALLE DEL PRÓXIMO COBRO\n- Plan: {{planName}}\n- Monto que se cobrará: {{amount}} (pesos mexicanos, impuestos aplicables incluidos)\n- Fecha del cobro: {{renewalDate}}\n- Periodicidad: {{periodicity}}\n- Cuenta: {{customerEmail}}\n{{#reference}}- Referencia: {{reference}}\n{{/reference}}\nSi quieres seguir usando {{planName}}, no tienes que hacer nada.\n\nCÓMO CANCELAR EN LÍNEA\n1. Entra a Mi cuenta con tu correo {{customerEmail}}: {{accountUrl}}\n2. Haz clic en «Gestionar mi suscripción». Se abre el área de facturación segura de nuestro proveedor de pagos (Stripe).\n3. Elige cancelar la suscripción. La cancelación es inmediata, sin costo y sin penalización.\n{{#portalUrl}}Acceso directo al área de facturación: {{portalUrl}}\n{{/portalUrl}}\nSi cancelas antes del {{renewalDate}}, no se hará este cobro. Conservas el acceso de pago hasta el final del periodo que ya pagaste. También puedes pedir la cancelación escribiendo a {{supportEmail}}.\n\nTUS DERECHOS\nNada de este aviso limita los derechos que te otorga la Ley Federal de Protección al Consumidor, que son irrenunciables. Para cualquier aclaración o reclamación, escríbenos a {{supportEmail}}.\nTambién puedes acudir a la Procuraduría Federal del Consumidor (PROFECO): Teléfono del Consumidor 800 468 8722 (lada sin costo) o 55 5568 8722 (Ciudad de México y área metropolitana), https://www.gob.mx/profeco\nTérminos y condiciones: {{cgvUrl}}\n\nDATOS DEL PROVEEDOR\n- Nombre comercial: IASHARK (empresario individual establecido en Francia)\n- Titular: {{companyOperatorName}}\n- Domicilio: {{companyAddress}}\n- Número de registro (SIREN / SIRET, Francia): {{companyRegistration}}\n- Teléfono: {{companyPhone}}\n- Correo electrónico: {{supportEmail}}\n\nJUEGO RESPONSABLE · 18+\nIASHARK ofrece análisis estadísticos: no es una casa de apuestas, no recibe apuestas y no garantiza ganancias. Prohibido para menores de 18 años.\nLas apuestas pueden generar adicción. Orientación gratuita las 24 horas: {{helplineName}}, {{helplinePhone}} ({{helplineUrl}}). Más información: {{responsibleUrl}}\n\n--\nAviso de renovación enviado automáticamente a {{customerEmail}} porque tienes una suscripción activa con cobro recurrente. Aclaraciones: {{supportEmail}}.\nTérminos: {{cgvUrl}}\nAviso de privacidad: {{privacyUrl}}\nAviso legal: {{legalUrl}}\n"
    }
  }
};
export function renderEmail(kind, market, data, options) {
  return api.renderEmail(TEMPLATES, kind, market, data, options);
}
export const {
  SITE_URL,
  SUPPORT_EMAIL,
  MARKETS,
  TEMPLATE_KINDS,
  COMPANY_FIELDS,
  DEFAULT_REMINDER_DAYS,
  MIN_RECOMMENDED_REMINDER_DAYS,
  EmailRenderError,
  escapeHtml,
  isValidEmail,
  maskEmail,
  formatMoney,
  companyFromEnv,
  purchaseConfirmationFromStripe,
  renewalReminderSkipReason,
  renewalReminderFromStripe,
  parseReminderDays,
  renewalWindow,
  localDateKey,
  cleanIdempotencyKey,
  safeEqual
} = api;
export default api;
