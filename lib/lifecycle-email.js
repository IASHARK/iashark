/* IASHARK — emails de relance / cycle de vie (module PUR : aucun acces reseau,
   fichier, variable d'environnement ; l'horloge est toujours passee en
   argument). Dependances : lib/email-render.js (moteur de gabarit,
   echappement, identite vendeur BLOCKED_DECISION), lib/free-match.js et
   lib/match-time.js (le MEME match offert que le site).

   Consommateurs :
   - tests/email-lifecycle*.test.js, tests/email-relances-paiement.test.js
     (node --test, require) ;
   - supabase/functions/send-lifecycle-emails, trial-reminder et
     email-unsubscribe via le module genere
     supabase/functions/_shared/lifecycle-email-bundle.generated.mjs
     (node lib/lifecycle-email-build.js). Envoi par Brevo (_shared/brevo.ts).

   Sources :
   - gabarit commun emails/lifecycle/layout.html|.txt (meme charte que
     emails/templates/*) ;
   - textes par langue emails/lifecycle/copy.<locale>.json (STATUT : REVIEW) ;
   - pays/devise/prix/aide jeu responsable : config/markets.json (passe en
     argument, jamais recopie ici).

   Regles de selection : miroir EXACT de public.lifecycle_email_candidates
   (derniere version : supabase/migrations/0055_emails_relances_paiement.sql).
   La fonction Edge n'envoie que si les deux sont d'accord. Exception :
   trial_ending (fin d'essai Stripe) est choisi par abonnement, pas par compte
   (decideTrialEnding, fonction trial-reminder). */
(function (root, factory) {
  "use strict";
  var node = typeof module === "object" && module && module.exports && typeof require === "function";
  var api = factory(
    node ? require("./email-render.js") : root.IasharkEmail,
    node ? require("./free-match.js") : root.IasharkFreeMatch,
    node ? require("./match-time.js") : root.IasharkMatchTime
  );
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else root.IasharkLifecycleEmail = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (R, FM, MT) {
  "use strict";

  var SITE_URL = R.SITE_URL;
  var DAY = 86400000;
  var hasOwn = Object.prototype.hasOwnProperty;

  var LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
  var DIRS = ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx"];

  // Fuseau de reference de chaque marche (heure locale du marche : jamais
  // d'email marketing la nuit). Les repertoires de langue en/es/de/it/pt
  // relevent du marche fr (config/markets.json#_dirs), /en/ du marche "us"
  // (offre USD) une fois config/markets.json#_usdSwitch applique : /en/ reste
  // la version internationale, meme fuseau qu'avant la bascule et que la
  // fenetre d'envoi SQL (migration 0024 : repertoire en -> Europe/Paris).
  var MARKET_TIMEZONES = { fr: "Europe/Paris", gb: "Europe/London", za: "Africa/Johannesburg", mx: "America/Mexico_City", us: "Europe/Paris" };

  // sender : fonction Edge qui choisit et envoie la campagne.
  // footer : raison affichee en bas de l'email (common.footer_reason_<footer>).
  // marketing : consentement obligatoire (sinon : email lie au compte).
  var CAMPAIGNS = {
    welcome: { marketing: false, needs: null, sender: "send-lifecycle-emails", footer: "welcome" },
    free_match: { marketing: true, needs: "free_match", sender: "send-lifecycle-emails", footer: "marketing" },
    pro_features: { marketing: true, needs: "pro_price", sender: "send-lifecycle-emails", footer: "marketing" },
    // 21/10/2026 : paiement commence puis abandonne (1 a 3 jours plus tard, une seule fois).
    checkout_abandoned: { marketing: true, needs: null, sender: "send-lifecycle-emails", footer: "marketing" },
    inactive_7d: { marketing: true, needs: "weekend_matches", sender: "send-lifecycle-emails", footer: "marketing" },
    inactive_30d: { marketing: true, needs: null, sender: "send-lifecycle-emails", footer: "marketing" },
    pro_weekly_summary: { marketing: true, needs: "weekend_matches", sender: "send-lifecycle-emails", footer: "marketing" },
    // 21/10/2026 : fin d'essai Stripe, 2 jours avant (fonction trial-reminder, reutilisee).
    // Email lie a l'abonnement : envoye meme sans consentement marketing.
    trial_ending: { marketing: false, needs: "trial", sender: "trial-reminder", footer: "billing" }
  };

  var RULES = {
    welcomeWindowDays: 3,
    quietStartHour: 21,          // marketing autorise de 09:00 a 20:59 locales
    quietEndHour: 9,
    minDaysBetweenMarketing: 3,  // 1 email marketing / 3 jours par personne
    stopAfterInactiveDays: 60,   // plus rien sans visite, ouverture ni clic
    freeMatchFromDays: 2, freeMatchUntilDays: 14,
    proFeaturesFromDays: 5, proFeaturesUntilDays: 21,
    inactive7Days: 7, inactive30Days: 30,
    weekendDows: [4, 5, 6],      // jeudi, vendredi, samedi (ISO)
    // Paiement abandonne : de 1 a 3 jours apres le dernier paiement commence,
    // prioritaire sur les autres relances (au moins 1 jour apres le dernier
    // email marketing, au lieu de 3).
    checkoutFromDays: 1, checkoutUntilDays: 3, checkoutMinDaysSinceMarketing: 1,
    // Fin d'essai : fin dans 36 a 60 heures (= « dans 2 jours » pour un passage horaire).
    trialEndingFromHours: 36, trialEndingUntilHours: 60
  };

  // Seul destinataire du mode « test » des fonctions Edge (le patron, decision du
  // 21/10/2026) : jamais une adresse recue dans la requete.
  var TEST_RECIPIENT = "yaramode81@gmail.com";
  // Compte fictif des apercus (aucun compte reel : le lien de desinscription
  // d'un apercu ne desinscrit personne).
  var SAMPLE_USER_ID = "00000000-0000-4000-8000-000000000000";

  var TOKEN_VERSION = "v1";
  var TOKEN_TTL_DAYS = 400;
  var MIN_SECRET_LENGTH = 32;

  // Pages absentes du depot pour certains repertoires (lien de repli vers la
  // version anglaise). tests/email-lifecycle.test.js verifie cette liste
  // contre les fichiers reels : ajouter la page oblige a mettre a jour ici.
  // 19/09/2026 : /de/ /it/ /pt/methodologie.html existent, plus aucun repli.
  var METHODOLOGY_MISSING_DIRS = [];

  // Vocabulaire interdit (aucune promesse de gain) par langue : sur, gagnant,
  // garanti, bonus et leurs equivalents.
  var FORBIDDEN_TERMS = {
    fr: ["sûr", "sûre", "sûrs", "sûres", "gagnant", "gagnante", "gagnants", "gagnantes", "garanti", "garantie", "garantis", "garanties", "garantir", "bonus"],
    en: ["sure", "surely", "winner", "winners", "winning", "guaranteed", "guarantee", "guarantees", "bonus"],
    es: ["seguro", "segura", "seguros", "seguras", "ganador", "ganadora", "ganadores", "garantizado", "garantizada", "garantizados", "garantía", "garantiza", "bono", "bonus"],
    de: ["sicher", "sichere", "sicheren", "sicherer", "gewinner", "garantiert", "garantie", "bonus"],
    it: ["sicuro", "sicura", "sicuri", "sicure", "vincente", "vincenti", "garantito", "garantita", "garantiti", "garanzia", "bonus"],
    pt: ["seguro", "segura", "seguros", "seguras", "vencedor", "vencedora", "garantido", "garantida", "garantia", "bónus", "bônus", "bonus"]
  };
  FORBIDDEN_TERMS["es-mx"] = FORBIDDEN_TERMS.es;

  var fail = function (code, message) { throw new R.EmailRenderError(code, message); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function toDate(v) {
    if (v == null || v === "") return null;
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // ------------------------------------------------------------- marches

  function siteContext(marketsConfig, dir) {
    var dirs = marketsConfig && marketsConfig._dirs;
    if (!dirs || !hasOwn.call(dirs, dir) || DIRS.indexOf(dir) === -1) fail("unknown_dir", "Repertoire de site inconnu : " + dir);
    var d = dirs[dir];
    var m = marketsConfig[d.market];
    if (!m) fail("unknown_market", "Marche inconnu : " + d.market);
    var helpline = d.helpline ? (marketsConfig._helplines || {})[d.helpline] : m.helpline;
    if (!helpline || !helpline.name || !helpline.url) fail("helpline_missing", "Aide jeu responsable absente pour " + dir);
    // Offre Pro unique vendue par duree : prices.pro.<week|month|year>.amount
    // (forme historique {amount, interval:"month"} acceptee). Duree absente ou
    // null = non vendue dans ce marche (ZA : pas d'annuel au lancement) : jamais
    // inventee, jamais affichee.
    // Duree vendue mais non payable en ligne (config/markets.json#checkoutOpen,
    // ex. semaine et annee de /gb/ au 19/09/2026) : traitee comme non vendue,
    // jamais annoncee dans un email. checkoutOpen absent = toutes ouvertes.
    var open = Array.isArray(m.checkoutOpen) ? m.checkoutOpen : null;
    var proMinor = function (iv) {
      var pro = m.prices && m.prices.pro;
      if (!pro || (open && open.indexOf(iv) === -1)) return null;
      var e = typeof pro.amount === "number" ? (iv === (pro.interval || "month") ? pro : null) : pro[iv];
      return e && typeof e.amount === "number" && isFinite(e.amount) && e.amount > 0 ? Math.round(e.amount * 100) : null;
    };
    return {
      dir: dir,
      locale: d.locale,
      htmlLang: d.htmlLang,
      intlLocale: d.intlLocale,
      // Prix : locale propre au marche (USD de /en/ : en-US, "$19.99"), sinon celle du repertoire.
      priceIntlLocale: m.priceIntlLocale || d.intlLocale,
      label: d.label,
      market: d.market,
      currency: m.currency,
      timeZone: MARKET_TIMEZONES[d.market] || fail("timezone_missing", "Fuseau absent pour " + d.market),
      helpline: { name: helpline.name, phone: helpline.phone || null, url: helpline.url, display: helpline.display || helpline.url },
      proPriceMinor: proMinor("month"),
      proPricesMinor: { week: proMinor("week"), month: proMinor("month"), year: proMinor("year") }
    };
  }

  // ------------------------------------------------------------- horloge

  var DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

  function localClock(date, timeZone) {
    var d = toDate(date) || fail("invalid_date", "date invalide");
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).formatToParts(d);
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    var y = Number(o.year), mo = Number(o.month), da = Number(o.day), dow = DOW[o.weekday];
    // Semaine ISO (meme format que to_char(..., 'IYYY-"W"IW') de Postgres).
    var dayUtc = Date.UTC(y, mo - 1, da);
    var thursday = dayUtc + (4 - dow) * DAY;
    var isoYear = new Date(thursday).getUTCFullYear();
    var week = 1 + Math.floor((thursday - Date.UTC(isoYear, 0, 1)) / DAY / 7);
    return { date: y + "-" + pad(mo) + "-" + pad(da), hour: Number(o.hour) % 24, minute: Number(o.minute), isoDow: dow, isoWeek: isoYear + "-W" + pad(week) };
  }

  function addDays(ymd, n) {
    var p = ymd.split("-").map(Number);
    var t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
  }

  function offsetAt(ms, timeZone) {
    var o = {};
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day), Number(o.hour) % 24, Number(o.minute), Number(o.second)) - Math.floor(ms / 1000) * 1000;
  }

  // "2026-09-16 21:30" (heure de Paris, format du pipeline) -> Date.
  function parisDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(str || ""));
    if (!m) return null;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var first = guess - offsetAt(guess, "Europe/Paris");
    return new Date(guess - offsetAt(first, "Europe/Paris"));
  }

  // ------------------------------------------------- selection des envois

  function daysBetween(a, b) { return (a.getTime() - b.getTime()) / DAY; }

  function maxDate() {
    var best = null;
    for (var i = 0; i < arguments.length; i++) {
      var d = toDate(arguments[i]);
      if (d && (!best || d.getTime() > best.getTime())) best = d;
    }
    return best;
  }

  // Ligne SQL (lifecycle_email_candidates) -> faits.
  function factsFromRow(row) {
    row = row || {};
    return {
      userId: row.user_id,
      market: row.market || "fr",
      plan: row.plan || "free",
      role: row.role || "customer",
      marketingOptIn: row.marketing_opt_in === true,
      notifyWeeklyRecap: row.notify_weekly_recap !== false,
      hasSubscription: row.has_subscription === true,
      suppressed: row.suppressed === true,
      createdAt: row.created_at,
      lastSignInAt: row.last_sign_in_at || null,
      lastFunnelAt: row.last_funnel_at || null,
      lastEngagementAt: row.last_engagement_at || null,
      lastMarketingSentAt: row.last_marketing_sent_at || null,
      // Dernier paiement commence (clic sur le bouton de paiement, evenement
      // checkout_started) ou retour sur checkout-annule (0055).
      lastCheckoutAt: row.last_checkout_at || null,
      sentKeys: Array.isArray(row.sent_keys) ? row.sent_keys.slice() : []
    };
  }

  function decideCampaign(facts, now) {
    var n = toDate(now) || fail("invalid_now", "now obligatoire");
    var created = toDate(facts && facts.createdAt);
    if (!created) return { campaign: null, key: "", reason: "invalid_facts" };
    var sent = facts.sentKeys || [];
    var has = function (k) { return sent.indexOf(k) !== -1; };
    var out = function (campaign, key, reason) { return { campaign: campaign, key: key || "", reason: reason || null }; };

    if (facts.suppressed) return out(null, "", "suppressed");
    var age = daysBetween(n, created);
    if (age <= RULES.welcomeWindowDays && !has("welcome:")) return out("welcome", "");
    if (!facts.marketingOptIn) return out(null, "", "not_opted_in");

    var tz = MARKET_TIMEZONES[facts.market] || MARKET_TIMEZONES.fr;
    var clock = localClock(n, tz);
    if (clock.hour < RULES.quietEndHour || clock.hour >= RULES.quietStartHour) return out(null, "", "quiet_hours");
    var lastSent = toDate(facts.lastMarketingSentAt);
    var noSales = facts.plan === "pro" || facts.hasSubscription === true || facts.role === "admin";

    // Paiement commence sans abonnement 1 a 3 jours plus tard : une seule fois,
    // avant toute autre relance (la frequence normale de 3 jours le ferait
    // souvent rater) mais jamais moins d'1 jour apres un email marketing.
    var checkout = toDate(facts.lastCheckoutAt);
    if (!noSales && checkout && !has("checkout_abandoned:")) {
      var sinceCheckout = daysBetween(n, checkout);
      var gapOk = !lastSent || daysBetween(n, lastSent) >= RULES.checkoutMinDaysSinceMarketing;
      if (sinceCheckout >= RULES.checkoutFromDays && sinceCheckout < RULES.checkoutUntilDays && gapOk) return out("checkout_abandoned", "");
    }
    if (lastSent && daysBetween(n, lastSent) < RULES.minDaysBetweenMarketing) return out(null, "", "frequency_cap");

    var activity = maxDate(created, facts.lastSignInAt, facts.lastFunnelAt);
    var engagement = maxDate(activity, facts.lastEngagementAt);
    if (daysBetween(n, engagement) > RULES.stopAfterInactiveDays) return out(null, "", "stopped_inactive_60d");

    if (noSales) {
      if (facts.notifyWeeklyRecap && RULES.weekendDows.indexOf(clock.isoDow) !== -1 && !has("pro_weekly_summary:" + clock.isoWeek)) {
        return out("pro_weekly_summary", clock.isoWeek);
      }
      return out(null, "", "nothing_due");
    }
    if (age >= RULES.freeMatchFromDays && age < RULES.freeMatchUntilDays && !has("free_match:")) return out("free_match", "");
    if (age >= RULES.proFeaturesFromDays && age < RULES.proFeaturesUntilDays && !has("pro_features:")) return out("pro_features", "");
    var inactive = daysBetween(n, activity);
    var episode = activity.toISOString().slice(0, 10);
    if (inactive >= RULES.inactive30Days && inactive < RULES.stopAfterInactiveDays && !has("inactive_30d:" + episode)) return out("inactive_30d", episode);
    if (inactive >= RULES.inactive7Days && inactive < RULES.inactive30Days && RULES.weekendDows.indexOf(clock.isoDow) !== -1 && !has("inactive_7d:" + episode)) {
      return out("inactive_7d", episode);
    }
    return out(null, "", "nothing_due");
  }

  // --------------------------------------------- matchs publics (data-home)

  // Liste blanche : seuls noms, competition, horaire et lien sortent du
  // fichier public. Jamais une cote, une probabilite ni un marche.
  function publicMatch(m, ctx) {
    if (!m || typeof m !== "object") return null;
    var id = Number(m.id);
    var home = m.home && typeof m.home.n === "string" ? m.home.n.trim() : "";
    var away = m.away && typeof m.away.n === "string" ? m.away.n.trim() : "";
    var kickoff = parisDate(m.date);
    if (!isFinite(id) || id <= 0 || Math.floor(id) !== id || !home || !away || home.length > 80 || away.length > 80 || !kickoff) return null;
    var league = typeof m.league === "string" && m.league.trim() && m.league.length <= 80 ? m.league.trim() : "";
    return {
      id: id,
      home: home,
      away: away,
      league: league,
      kickoffAt: kickoff.toISOString(),
      kickoff: new Intl.DateTimeFormat(ctx.intlLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: ctx.timeZone, timeZoneName: "short" }).format(kickoff),
      url: SITE_URL + "/" + ctx.dir + "/match.html?id=" + id
    };
  }

  function isFootball(m) { return !m.sport || m.sport === "football"; }

  // Horloge de Paris SANS fuseau ({day, now}) : mode historique de
  // lib/free-match.js, le meme que match-data#idOffertRepli (heure de Paris).
  function parisClock(n) {
    var c = MT.localClock(n, "Europe/Paris");
    return { day: c.day, now: c.now };
  }

  // Match offert que le SERVEUR (supabase/functions/match-data#idOffertRepli)
  // reconnait sans designation : aucune designation du jour ou a venir (heure
  // de Paris), puis le repli de lib/free-match.js (meme regle, verifiee par
  // tests/match-data-repli-offert.test.js). null = une designation fait autorite.
  function serverFreeMatchId(list, now) {
    var n = toDate(now);
    if (!Array.isArray(list) || !n) return null;
    var t = parisClock(n);
    var jour = function (m) { return String((m && m.date) || "").slice(0, 10); };
    var jourDesigne = function (m) {
      var fd = m && typeof m.free_day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.free_day) ? m.free_day : null;
      return fd && fd !== jour(m) ? fd : jour(m);
    };
    if (list.some(function (m) { return m && m.is_free === true && jourDesigne(m) >= t.day; })) return null;
    // Designations d'un jour passe : ignorees par le serveur (repli).
    var sans = list.map(function (m) { return m && m.is_free === true ? Object.assign({}, m, { is_free: false }) : m; });
    var id = FM.pickFreeMatchId(sans, t);
    return id == null ? null : String(id);
  }

  // Match offert de l'email = celui que montre le SITE au meme moment
  // (lib/free-match.js, appele comme match-page.js et index.html : horloge
  // locale du visiteur, ici le fuseau du marche, et code du marche) :
  // designation du pipeline (is_free), sinon le meme repli. Deux garde-fous
  // propres a l'email :
  // - le serveur doit le reconnaitre (designation, ou repli de match-data),
  //   sinon un compte gratuit cliquerait vers un mur payant ;
  // - pas encore commence (le site le garde offert toute la journee, meme
  //   termine ; un email ne propose jamais un match deja joue : il attend
  //   le match offert du lendemain).
  // Rien de tout cela = null (jamais de match invente).
  function pickFreeMatch(list, now, ctx) {
    var n = toDate(now);
    if (!Array.isArray(list) || !list.length || !n || !ctx) return null;
    var m = FM.pickFreeMatch(list, MT.localClock(n, ctx.timeZone), ctx.market || null);
    if (!m || !isFootball(m)) return null;
    var kickoff = parisDate(m.date);
    if (!kickoff || kickoff.getTime() <= n.getTime()) return null;
    if (m.is_free !== true && String(m.id) !== serverFreeMatchId(list, n)) return null;
    return publicMatch(m, ctx);
  }

  // Matchs du prochain week-end (samedi et dimanche, heure locale du marche).
  function weekendMatches(list, now, ctx, max) {
    var n = toDate(now);
    if (!Array.isArray(list) || !n) return [];
    var clock = localClock(n, ctx.timeZone);
    var sat = clock.isoDow === 7 ? addDays(clock.date, -1) : addDays(clock.date, 6 - clock.isoDow);
    var days = [sat, addDays(sat, 1)];
    return list.filter(function (m) {
      var k = m && isFootball(m) ? parisDate(m.date) : null;
      return k && k.getTime() > n.getTime() && days.indexOf(localClock(k, ctx.timeZone).date) !== -1;
    }).sort(function (a, b) { return parisDate(a.date) - parisDate(b.date); })
      .map(function (m) { return publicMatch(m, ctx); })
      .filter(Boolean)
      .slice(0, max || 8);
  }

  // ------------------------------------------------- fin d'essai (trialing)

  // Fenetre de lecture de la base pour un passage (trial-reminder) : abonnements
  // dont la fin d'essai tombe dans [now + 36 h, now + 60 h[.
  function trialWindow(now) {
    var n = toDate(now) || fail("invalid_now", "now obligatoire");
    return {
      fromIso: new Date(n.getTime() + RULES.trialEndingFromHours * 3600000).toISOString(),
      toIso: new Date(n.getTime() + RULES.trialEndingUntilHours * 3600000).toISOString()
    };
  }

  // Ligne public.subscriptions -> rappel du a ce passage ? Essai Stripe en
  // cours (statut trialing), pas d'annulation programmee, aucun rappel deja
  // envoye (trial_reminder_sent_at), fin dans 36 a 60 heures.
  function decideTrialEnding(sub, now) {
    var n = toDate(now) || fail("invalid_now", "now obligatoire");
    var out = function (due, reason) { return { due: due, reason: reason || null }; };
    if (!sub || typeof sub !== "object") return out(false, "invalid_row");
    if (sub.status !== "trialing") return out(false, "not_trialing");
    if (sub.cancel_at_period_end === true) return out(false, "cancel_scheduled");
    if (sub.trial_reminder_sent_at) return out(false, "already_sent");
    var end = toDate(sub.current_period_end);
    if (!end) return out(false, "invalid_end");
    var hours = (end.getTime() - n.getTime()) / 3600000;
    if (hours < RULES.trialEndingFromHours) return out(false, hours <= 0 ? "trial_over" : "too_late");
    if (hours >= RULES.trialEndingUntilHours) return out(false, "too_early");
    return out(true, null);
  }

  var INTERVALS = ["week", "month", "year"];

  function validTrial(t) {
    return !!(t && toDate(t.endsAt) && typeof t.amountMinor === "number" && isFinite(t.amountMinor) && t.amountMinor >= 0
      && typeof t.currency === "string" && /^[A-Za-z]{3}$/.test(t.currency) && INTERVALS.indexOf(t.interval) !== -1);
  }

  // Prix catalogue (config/markets.json) d'une duree dans un marche de
  // facturation (fr, gb, mx, za, us) : repli de trial-reminder quand Stripe
  // n'est pas configure (essais locaux). En production, le montant vient de la
  // prochaine facture Stripe (code promo et taxes compris).
  function catalogAmount(marketsConfig, market, interval) {
    var m = marketsConfig && hasOwn.call(marketsConfig, String(market || "")) && String(market).charAt(0) !== "_" ? marketsConfig[market] : null;
    var pro = m && m.prices && m.prices.pro;
    var e = pro && INTERVALS.indexOf(interval) !== -1 ? pro[interval] : null;
    if (!e || typeof e.amount !== "number" || !isFinite(e.amount) || e.amount <= 0 || !m.currency) return null;
    return { amountMinor: Math.round(e.amount * 100), currency: m.currency };
  }

  // Essai fictif des apercus et du mode test : fin dans 48 heures, prix
  // mensuel du marche de la version du site (l'essai ne porte que sur le mois).
  function sampleTrial(ctx, now) {
    var n = toDate(now) || fail("invalid_now", "now obligatoire");
    if (!ctx || ctx.proPriceMinor == null) return null;
    return { endsAt: new Date(n.getTime() + 48 * 3600000).toISOString(), amountMinor: ctx.proPriceMinor, currency: ctx.currency, interval: "month" };
  }

  // ----------------------------------------------- donnees d'une campagne

  // Donnees d'un email (envoi reel, apercu, test), jamais inventees :
  // { data, reason } ; data null = pas d'email (reason dit pourquoi).
  // publicList : matchs de data-home.json (null = fichier indisponible).
  function campaignData(campaign, publicList, now, ctx, base) {
    if (!hasOwn.call(CAMPAIGNS, campaign)) fail("unknown_campaign", "Campagne inconnue : " + campaign);
    var need = CAMPAIGNS[campaign].needs;
    var data = Object.assign({ marketingOptIn: false, freeMatch: null, weekendMatches: [], trial: null }, base || {});
    if (campaign === "welcome" || need === "free_match" || need === "weekend_matches") {
      if (!Array.isArray(publicList)) {
        if (need) return { data: null, reason: "public_data_unavailable" };
      } else {
        data.freeMatch = pickFreeMatch(publicList, now, ctx);
        if (need === "weekend_matches") data.weekendMatches = weekendMatches(publicList, now, ctx, 8);
      }
    }
    if (need === "free_match" && !data.freeMatch) return { data: null, reason: "no_free_match" };
    if (need === "weekend_matches" && !data.weekendMatches.length) return { data: null, reason: "no_weekend_matches" };
    if (need === "trial" && !validTrial(data.trial)) return { data: null, reason: "no_trial" };
    return { data: data, reason: null };
  }

  // ------------------------------------------------------------ desinscription

  function bytesToB64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToString(str) {
    if (!/^[A-Za-z0-9_-]+$/.test(str)) return null;
    try {
      var bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (_e) { return null; }
  }

  function subtle() {
    var c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
    if (!c || !c.subtle) fail("crypto_unavailable", "WebCrypto indisponible");
    return c.subtle;
  }

  function hmac(secret, data) {
    var enc = new TextEncoder();
    return subtle().importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      .then(function (key) { return subtle().sign("HMAC", key, enc.encode(data)); })
      .then(function (sig) { return bytesToB64url(new Uint8Array(sig)); });
  }

  function validSecret(secret) { return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH; }

  // Jeton = v1.<charge utile base64url>.<HMAC-SHA256 base64url>.
  // Charge utile : { u: user_id, d: repertoire, e: expiration (s) }. Aucun email.
  function createUnsubscribeToken(input, secret, now, ttlDays) {
    return Promise.resolve().then(function () {
      if (!validSecret(secret)) fail("secret_missing", "EMAIL_UNSUBSCRIBE_SECRET absent ou trop court (" + MIN_SECRET_LENGTH + " caracteres minimum)");
      var n = toDate(now) || fail("invalid_now", "now obligatoire");
      if (!input || !UUID_RE.test(String(input.userId))) fail("invalid_user", "userId invalide");
      if (DIRS.indexOf(input.dir) === -1) fail("unknown_dir", "Repertoire inconnu");
      var ttl = ttlDays == null ? TOKEN_TTL_DAYS : ttlDays;
      var payload = JSON.stringify({ u: String(input.userId).toLowerCase(), d: input.dir, e: Math.floor(n.getTime() / 1000) + Math.round(ttl * 86400) });
      var body = TOKEN_VERSION + "." + bytesToB64url(new TextEncoder().encode(payload));
      return hmac(secret, body).then(function (sig) { return body + "." + sig; });
    });
  }

  function verifyUnsubscribeToken(token, secret, now) {
    return Promise.resolve().then(function () {
      if (!validSecret(secret)) return { ok: false, reason: "secret_missing" };
      var n = toDate(now);
      if (!n) return { ok: false, reason: "invalid_now" };
      var parts = typeof token === "string" && token.length <= 512 ? token.split(".") : [];
      if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !parts[1] || !parts[2]) return { ok: false, reason: "malformed" };
      return hmac(secret, parts[0] + "." + parts[1]).then(function (expected) {
        if (!R.safeEqual(expected, parts[2])) return { ok: false, reason: "bad_signature" };
        var json = b64urlToString(parts[1]);
        var p = null;
        try { p = JSON.parse(json); } catch (_e) { p = null; }
        if (!p || !UUID_RE.test(String(p.u)) || DIRS.indexOf(p.d) === -1 || typeof p.e !== "number") return { ok: false, reason: "invalid_payload" };
        if (p.e * 1000 <= n.getTime()) return { ok: false, reason: "expired", dir: p.d };
        return { ok: true, userId: p.u, dir: p.d, expiresAt: new Date(p.e * 1000).toISOString() };
      });
    });
  }

  function unsubscribeLinks(token, dir, functionsBaseUrl) {
    if (DIRS.indexOf(dir) === -1) fail("unknown_dir", "Repertoire inconnu");
    if (typeof functionsBaseUrl !== "string" || !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(functionsBaseUrl)) fail("invalid_base_url", "URL Supabase invalide");
    var t = encodeURIComponent(token);
    return {
      // Fragment (#t=) : le jeton ne part ni dans les journaux Netlify ni dans
      // un en-tete Referer ; la page le lit en JS et le POSTe.
      page: SITE_URL + "/" + dir + "/desinscription-email.html#t=" + t,
      oneClick: functionsBaseUrl.replace(/\/$/, "") + "/functions/v1/email-unsubscribe?t=" + t
    };
  }

  // RFC 2369 + RFC 8058 (desinscription en un clic, exigee par Gmail/Yahoo).
  // pageUrl (facultatif) : la page du site en second lien, comme la relance
  // du 20/10/2026 (supabase/functions/relance-emails).
  function listUnsubscribeHeaders(oneClickUrl, pageUrl) {
    return {
      "List-Unsubscribe": "<" + oneClickUrl + ">" + (pageUrl ? ", <" + pageUrl + ">" : ""),
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    };
  }

  // ---------------------------------------------------------------- rendu

  function strip(str) { return String(str).normalize("NFC").toLowerCase(); }

  function findForbiddenWords(text, locale) {
    var lists = [FORBIDDEN_TERMS[locale] || [], FORBIDDEN_TERMS.fr, FORBIDDEN_TERMS.en].reduce(function (a, b) { return a.concat(b); }, []);
    var words = strip(text).split(/[^\p{L}\p{N}]+/u);
    var found = [];
    words.forEach(function (w) { if (w && lists.indexOf(w) !== -1 && found.indexOf(w) === -1) found.push(w); });
    return found;
  }

  function listBlocked(str) {
    var out = [];
    String(str).replace(/\[BLOCKED_DECISION: ([A-Z_]+)\]/g, function (m, k) { if (out.indexOf(k) === -1) out.push(k); return m; });
    return out;
  }

  function linkMap(ctx, data) {
    var page = function (p) { return SITE_URL + "/" + ctx.dir + "/" + p; };
    return {
      home: SITE_URL + "/" + ctx.dir + "/",
      account: page("compte.html"),
      notifications: page("compte.html#notifications"),
      subscription: page("compte.html#abonnement"),
      methodology: METHODOLOGY_MISSING_DIRS.indexOf(ctx.dir) !== -1 ? SITE_URL + "/en/methodologie.html" : page("methodologie.html"),
      pricing: page("abonnement.html"),
      tools: page("pro.html"),
      responsible: page("jeu-responsable.html"),
      privacy: page("confidentialite.html"),
      legal: page("mentions-legales.html"),
      freeMatch: data.freeMatch ? data.freeMatch.url : null
    };
  }

  function text(str, view) { return R.renderTemplate(str, view, false).replace(/\s+/g, " ").trim(); }

  var S = {
    p: "margin:0 0 16px;font-size:15px;line-height:24px;color:#1f2d3a;",
    lnk: "color:#0a6d8f;text-decoration:underline;"
  };

  function renderBlocks(blocks, view, links, data, common) {
    var html = [], txt = [];
    (blocks || []).forEach(function (b) {
      if (b.if && !view[b.if]) return;
      if (b.unless && view[b.unless]) return;
      if (b.type === "p") {
        var t = text(b.text, view);
        html.push('<p class="tx" style="' + S.p + '">' + R.escapeHtml(t) + "</p>");
        txt.push(t);
      } else if (b.type === "list") {
        var items = b.items.map(function (it) { return text(it, view); });
        html.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 18px;">'
          + items.map(function (it, i) {
            return '<tr><td class="tx" style="width:26px;vertical-align:top;padding:4px 0;font-size:15px;line-height:23px;font-weight:bold;color:#0a6d8f;">' + (b.ordered ? (i + 1) + "." : "✓") + '</td><td class="tx" style="padding:4px 0;font-size:15px;line-height:23px;color:#1f2d3a;">' + R.escapeHtml(it) + "</td></tr>";
          }).join("") + "</table>");
        txt.push(items.map(function (it, i) { return (b.ordered ? (i + 1) + ". " : "- ") + it; }).join("\n"));
      } else if (b.type === "match" || b.type === "matches") {
        var list = b.type === "match" ? (data.freeMatch ? [data.freeMatch] : []) : (data.weekendMatches || []);
        if (!list.length) fail("missing_match_data", "Bloc " + b.type + " sans donnees");
        html.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">'
          + list.map(function (m) {
            return '<tr><td class="bg-soft" style="padding:12px 16px;background-color:#f4f7fa;border-left:4px solid #0a6d8f;border-bottom:6px solid transparent;font-family:Arial,Helvetica,sans-serif;">'
              + '<p class="tx" style="margin:0 0 4px;font-size:16px;line-height:22px;font-weight:bold;color:#0b1a2a;">' + R.escapeHtml(m.home) + " – " + R.escapeHtml(m.away) + "</p>"
              + '<p class="tx-soft" style="margin:0 0 6px;font-size:13px;line-height:19px;color:#4b5a69;">' + (m.league ? R.escapeHtml(m.league) + " · " : "") + R.escapeHtml(common.kickoff_label + common.colon + m.kickoff) + "</p>"
              + '<a class="lnk" href="' + R.escapeHtml(m.url) + '" target="_blank" style="font-size:14px;line-height:20px;' + S.lnk + '">' + R.escapeHtml(common.match_link) + "</a>"
              + "</td></tr>";
          }).join("") + "</table>");
        txt.push(list.map(function (m) {
          return "* " + m.home + " – " + m.away + "\n  " + (m.league ? m.league + " · " : "") + common.kickoff_label + common.colon + m.kickoff + "\n  " + m.url;
        }).join("\n"));
      } else if (b.type === "cta" || b.type === "link") {
        var url = links[b.link];
        if (!url) fail("unknown_link", "Lien inconnu : " + b.link);
        var label = text(b.label, view);
        if (b.type === "cta") {
          html.push('<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:4px 0 22px;"><tr><td align="center" bgcolor="#0a6d8f" style="background-color:#0a6d8f;border-radius:8px;"><a href="' + R.escapeHtml(url) + '" target="_blank" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">' + R.escapeHtml(label) + "</a></td></tr></table>");
        } else {
          html.push('<p class="tx" style="' + S.p + '"><a class="lnk" href="' + R.escapeHtml(url) + '" target="_blank" style="' + S.lnk + '">' + R.escapeHtml(label) + "</a></p>");
        }
        txt.push(label + common.colon + url);
      } else {
        fail("unknown_block", "Bloc inconnu : " + b.type);
      }
    });
    return { html: html.join("\n"), text: txt.join("\n\n") };
  }

  var BLOCKS_MARKER = "<!--LIFECYCLE_BLOCKS-->";

  // bundle = { layout: {html, text}, copy: {<locale>: {...}}, markets: config/markets.json }
  // data   = { freeMatch, weekendMatches, marketingOptIn, trial }
  //          trial (fin d'essai) = { endsAt, amountMinor, currency, interval }
  // options = { company, unsubscribeUrl, now }
  function renderLifecycleEmail(bundle, campaign, dir, data, options) {
    options = options || {};
    data = data || {};
    if (!hasOwn.call(CAMPAIGNS, campaign)) fail("unknown_campaign", "Campagne inconnue : " + campaign);
    var ctx = siteContext(bundle && bundle.markets, dir);
    var copy = bundle.copy && bundle.copy[ctx.locale];
    if (!copy || !copy.campaigns || !copy.campaigns[campaign]) fail("copy_missing", "Textes absents : " + ctx.locale + "/" + campaign);
    var c = copy.campaigns[campaign], common = copy.common;
    var expectedUnsub = SITE_URL + "/" + dir + "/desinscription-email.html#t=";
    if (typeof options.unsubscribeUrl !== "string" || options.unsubscribeUrl.indexOf(expectedUnsub) !== 0 || options.unsubscribeUrl.length <= expectedUnsub.length) {
      fail("invalid_unsubscribe_url", "Lien de desinscription obligatoire (" + expectedUnsub + "...)");
    }
    var need = CAMPAIGNS[campaign].needs;
    if (need === "free_match" && !data.freeMatch) fail("missing_free_match", "Aucun match offert publie");
    if (need === "weekend_matches" && !(data.weekendMatches && data.weekendMatches.length)) fail("missing_weekend_matches", "Aucun match du week-end publie");
    // Fin d'essai : date, montant et duree connus, jamais devines.
    if (need === "trial" && !validTrial(data.trial)) fail("missing_trial", "Essai incomplet (fin, montant, devise, duree)");
    var trial = need === "trial" ? data.trial : null;
    // Prix Pro : le mensuel toujours ; textes prevus pour semaine + mois (+ an)
    // ou pour le mois seul (us : offre USD de /en/, config/markets.json
    // #_usdSwitch). Mois + an sans semaine : aucun texte, jamais un prix invente.
    var hasWeek = ctx.proPricesMinor.week != null, hasYear = ctx.proPricesMinor.year != null;
    if (need === "pro_price" && (ctx.proPriceMinor == null || (!hasWeek && hasYear))) fail("price_unavailable", "Prix Pro (mois, et semaine si l'annee est vendue) absent de config/markets.json pour " + ctx.market);

    var company = options.company || {};
    var view = {
      siteVersion: ctx.label,
      helplineName: ctx.helpline.name,
      helplinePhone: ctx.helpline.phone,
      helplineDisplay: ctx.helpline.display,
      hasHelplinePhone: !!ctx.helpline.phone,
      notOptedIn: data.marketingOptIn !== true,
      hasFreeMatch: !!data.freeMatch,
      // Email J5 « Ce que debloque Pro » : les durees vendues dans le marche.
      proPrice: ctx.proPriceMinor != null ? R.formatMoney(ctx.proPriceMinor, ctx.currency, ctx.priceIntlLocale) : null,
      proWeekPrice: ctx.proPricesMinor && ctx.proPricesMinor.week != null ? R.formatMoney(ctx.proPricesMinor.week, ctx.currency, ctx.priceIntlLocale) : null,
      proYearPrice: ctx.proPricesMinor && ctx.proPricesMinor.year != null ? R.formatMoney(ctx.proPricesMinor.year, ctx.currency, ctx.priceIntlLocale) : null,
      hasProYear: hasWeek && hasYear,
      hasNoProYear: hasWeek && !hasYear,
      hasOnlyProMonth: !hasWeek && !hasYear,
      freeMatchHome: data.freeMatch ? data.freeMatch.home : null,
      freeMatchAway: data.freeMatch ? data.freeMatch.away : null,
      // Fin d'essai : date et heure dans le fuseau du marche (fuseau affiche :
      // jamais d'ambiguite sur le dernier moment pour annuler).
      trialEndDate: trial ? new Intl.DateTimeFormat(ctx.intlLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: ctx.timeZone, timeZoneName: "short" }).format(toDate(trial.endsAt)) : null,
      trialAmount: trial ? R.formatMoney(trial.amountMinor, trial.currency, ctx.priceIntlLocale) : null,
      trialPer: trial ? common["per_" + trial.interval] : null,
      companyOperatorName: typeof company.operatorName === "string" && company.operatorName.trim() ? company.operatorName.trim() : "[BLOCKED_DECISION: COMPANY_OPERATOR_NAME]",
      companyAddress: typeof company.address === "string" && company.address.trim() ? company.address.trim() : "[BLOCKED_DECISION: COMPANY_ADDRESS]"
    };
    var links = linkMap(ctx, data);
    var blocks = renderBlocks(c.blocks, view, links, data, common);
    var layoutView = {
      htmlLang: ctx.htmlLang,
      subject: text(c.subject, view),
      preheader: text(c.preheader, view),
      title: text(c.title, view),
      greeting: common.greeting,
      sep: common.colon,
      rgTitle: common.rg_title,
      rgBody: text(common.rg_body, view),
      rgHelp: text(view.hasHelplinePhone ? common.rg_help_phone : common.rg_help_nophone, view),
      rgMore: common.rg_more,
      helplineUrl: ctx.helpline.url,
      responsibleUrl: links.responsible,
      footerReason: text(common["footer_reason_" + CAMPAIGNS[campaign].footer], view),
      // Signature de Clement (decision du 21/10/2026, comme la relance du 20/10).
      signoff: common.signoff,
      signature: common.signature,
      replyNote: text(c.reply || common.reply, view),
      unsubscribeLabel: common.unsubscribe,
      unsubscribeUrl: options.unsubscribeUrl,
      manageLabel: common.manage,
      manageUrl: links.notifications,
      privacyLabel: common.privacy,
      privacyUrl: links.privacy,
      legalLabel: common.legal,
      legalUrl: links.legal,
      homeUrl: links.home,
      senderLabel: common.sender,
      companyOperatorName: view.companyOperatorName,
      companyAddress: view.companyAddress
    };
    var parts = /^Subject: ([^\r\n]+)\r?\n/.exec(bundle.layout.text);
    if (!parts) fail("template_invalid", "layout.txt doit commencer par Subject:");
    var html = R.renderTemplate(bundle.layout.html, layoutView, true);
    var txt = R.renderTemplate(bundle.layout.text.slice(parts[0].length), layoutView, false);
    if (html.split(BLOCKS_MARKER).length !== 2 || txt.split(BLOCKS_MARKER).length !== 2) fail("template_invalid", "Marqueur de blocs absent ou multiple");
    html = html.replace(BLOCKS_MARKER, function () { return blocks.html; });
    txt = txt.replace(BLOCKS_MARKER, function () { return blocks.text; })
      .replace(/[ \t]+\r?\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    var subject = R.renderTemplate(parts[1], layoutView, false).replace(/\s+/g, " ").trim();
    return {
      campaign: campaign,
      marketing: CAMPAIGNS[campaign].marketing,
      dir: dir,
      locale: ctx.locale,
      htmlLang: ctx.htmlLang,
      subject: subject,
      html: html,
      text: txt,
      blockedDecisions: listBlocked(subject + html + txt)
    };
  }

  return {
    SITE_URL: SITE_URL,
    LOCALES: LOCALES,
    DIRS: DIRS,
    CAMPAIGNS: CAMPAIGNS,
    RULES: RULES,
    MARKET_TIMEZONES: MARKET_TIMEZONES,
    METHODOLOGY_MISSING_DIRS: METHODOLOGY_MISSING_DIRS,
    FORBIDDEN_TERMS: FORBIDDEN_TERMS,
    TOKEN_TTL_DAYS: TOKEN_TTL_DAYS,
    MIN_SECRET_LENGTH: MIN_SECRET_LENGTH,
    BLOCKS_MARKER: BLOCKS_MARKER,
    TEST_RECIPIENT: TEST_RECIPIENT,
    SAMPLE_USER_ID: SAMPLE_USER_ID,
    siteContext: siteContext,
    localClock: localClock,
    parisDate: parisDate,
    factsFromRow: factsFromRow,
    decideCampaign: decideCampaign,
    publicMatch: publicMatch,
    pickFreeMatch: pickFreeMatch,
    serverFreeMatchId: serverFreeMatchId,
    weekendMatches: weekendMatches,
    trialWindow: trialWindow,
    decideTrialEnding: decideTrialEnding,
    catalogAmount: catalogAmount,
    sampleTrial: sampleTrial,
    campaignData: campaignData,
    createUnsubscribeToken: createUnsubscribeToken,
    verifyUnsubscribeToken: verifyUnsubscribeToken,
    unsubscribeLinks: unsubscribeLinks,
    listUnsubscribeHeaders: listUnsubscribeHeaders,
    findForbiddenWords: findForbiddenWords,
    renderLifecycleEmail: renderLifecycleEmail
  };
});
