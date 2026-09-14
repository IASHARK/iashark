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
