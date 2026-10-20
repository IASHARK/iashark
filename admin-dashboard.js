/* IASHARK - Mon tableau de bord (admin.html), pense pour un proprietaire
 * debutant : une phrase du jour, 5 grandes cartes, un feu tricolore, le
 * parcours du visiteur au client, les sources, pays et villes, qui est la
 * maintenant, pages et matchs, robots et tests filtres, puis les details.
 *
 * Deux parties :
 * 1) Helpers PURS (phrases, pourcentages, feu tricolore, villes, heures,
 *    noms de pages lisibles, regroupement des sources) : exportes pour les
 *    tests Node (tests/admin-dashboard.test.js) et exposes en
 *    window.IasharkAdminHelpers.
 * 2) Application navigateur : garde admin, appels RPC Supabase (migration
 *    0019_admin_dashboard_v2.sql, appliquee ; villes et raisons de filtrage
 *    detaillees si 0022_admin_geo_city.sql est appliquee, sinon repli
 *    automatique : pays seulement ; « Ou les visiteurs decrochent » si
 *    0031_admin_conversion_funnel.sql est appliquee, sinon message « a
 *    appliquer »), rendu, rafraichissement.
 *
 * Ecran « Partenaires » (20/10/2026) : candidatures au programme
 * d'affiliation (RPC admin_affiliates), accepter / refuser / suspendre /
 * remettre a valider (RPC admin_affiliate_set_status), pastille sur
 * l'onglet et ligne dans « A faire en premier ».
 *
 * SECURITE : toute valeur issue de funnel_events (ecrite par la cle anon
 * publique, donc controlee par le visiteur) ou d'une candidature partenaire
 * passe par esc() avant d'entrer dans le HTML. Aucun innerHTML n'est
 * construit sans esc() sur les donnees.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkAdminHelpers = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var TZ = "Europe/Paris";
  var LAUNCH_AT = "2026-09-13T19:00:00Z";

  var ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"'`]/g, function (c) { return ESC_MAP[c]; });
  }

  // ---------- Nombres et durees ----------
  var NF = new Intl.NumberFormat("fr-FR");
  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function fmtInt(v) {
    var n = num(v);
    return n === null ? "—" : NF.format(Math.round(n));
  }
  function fmtPct(v, digits) {
    var n = num(v);
    if (n === null) return "—";
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits == null ? 1 : digits }).format(n) + " %";
  }
  function fmtDur(sec) {
    var n = num(sec);
    if (n === null) return "—";
    var s = Math.max(0, Math.round(n));
    if (s < 60) return s + " s";
    var m = Math.floor(s / 60), r = s % 60;
    if (m < 60) return m + " min" + (r ? " " + (r < 10 ? "0" : "") + r : "");
    var h = Math.floor(m / 60), mm = m % 60;
    return h + " h" + (mm ? " " + (mm < 10 ? "0" : "") + mm : "");
  }
  function fmtMoney(cents, currency) {
    var n = num(cents);
    if (n === null) return "—";
    var cur = /^[a-z]{3}$/i.test(String(currency || "")) ? String(currency).toUpperCase() : "EUR";
    try {
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur }).format(n / 100);
    } catch (e) {
      return NF.format(n / 100) + " " + cur;
    }
  }

  // Variation par rapport a la periode precedente.
  function fmtDelta(cur, prev, opts) {
    opts = opts || {};
    var c = num(cur), p = num(prev);
    if (opts.previousComplete === false) return { dir: "none", text: "", good: null };
    if (c === null || p === null) return { dir: "none", text: "—", good: null };
    var diff = c - p;
    if (p === 0) return c === 0 ? { dir: "flat", text: "=", good: null } : { dir: "new", text: "nouveau", good: null };
    var pct = Math.round((diff / p) * 100);
    if (pct === 0) return { dir: "flat", text: "=", good: null };
    return { dir: pct > 0 ? "up" : "down", text: (pct > 0 ? "+" : "−") + NF.format(Math.abs(pct)) + " %", good: opts.lowerIsBetter ? pct < 0 : pct > 0 };
  }

  // ---------- Versions du site, pays, appareils ----------
  var SITES = {
    fr: { name: "France", short: "FR", country: "FR" },
    gb: { name: "Royaume-Uni", short: "UK", country: "GB" },
    za: { name: "Afrique du Sud", short: "ZA", country: "ZA" },
    mx: { name: "Mexique", short: "MX", country: "MX" },
    en: { name: "International EN", short: "EN", country: null },
    es: { name: "International ES", short: "ES", country: null },
    de: { name: "International DE", short: "DE", country: null },
    it: { name: "International IT", short: "IT", country: null },
    pt: { name: "International PT", short: "PT", country: null }
  };
  function isCountry(code) { return typeof code === "string" && /^[A-Z]{2}$/.test(code); }
  function flagEmoji(code) {
    if (!isCountry(code)) return "";
    return String.fromCodePoint(0x1f1e6 + code.charCodeAt(0) - 65, 0x1f1e6 + code.charCodeAt(1) - 65);
  }
  function siteLabel(key) {
    if (key === "intl") return "International (EN, ES, DE, IT, PT)";
    return SITES[key] ? SITES[key].name : "Version inconnue";
  }

  var COUNTRY_FALLBACK = {
    FR: "France", GB: "Royaume-Uni", ZA: "Afrique du Sud", MX: "Mexique", US: "États-Unis", BE: "Belgique",
    CH: "Suisse", CA: "Canada", ES: "Espagne", DE: "Allemagne", IT: "Italie", PT: "Portugal", MA: "Maroc",
    SN: "Sénégal", CI: "Côte d'Ivoire", IE: "Irlande", NL: "Pays-Bas", DZ: "Algérie", TN: "Tunisie", BR: "Brésil"
  };
  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(["fr"], { type: "region" }); } catch (e) { regionNames = null; }
  function countryName(code) {
    if (!isCountry(code)) return "Pays inconnu";
    if (COUNTRY_FALLBACK[code]) return COUNTRY_FALLBACK[code];
    try {
      var n = regionNames ? regionNames.of(code) : null;
      if (n && n !== code) return n;
    } catch (e) {}
    return code;
  }
  var PREP_AU = " MX GB CA BR PT MA SN CM LU DK JP NG KE CL PE VE LB QA VN GH ML BF BJ TG GA NE TD CD CG MZ PY UY EC SV HN NI GT PA CR ";
  var PREP_AUX = " US NL AE PH ";
  var PREP_A = " MC MT SG HK RE YT MG CY MU CU ";
  function prep(code) {
    if (PREP_AUX.indexOf(" " + code + " ") !== -1) return "aux";
    if (PREP_AU.indexOf(" " + code + " ") !== -1) return "au";
    if (PREP_A.indexOf(" " + code + " ") !== -1) return "à";
    return "en";
  }
  function inCountry(code) {
    if (!isCountry(code)) return null;
    return prep(code) + " " + countryName(code);
  }

  var DEVICE_LABELS = { mobile: "Téléphone", tablet: "Tablette", desktop: "Ordinateur" };
  function deviceLabel(key) { return DEVICE_LABELS[key] || "Appareil inconnu"; }

  // ---------- Sources ----------
  // MEMES regles (memes expressions, meme ordre) que public.admin_source_group
  // dans supabase/migrations/0052_admin_diagnostics.sql (test de parite ;
  // 0019 avant le 19/10/2026 : YouTube, Snapchat, IA, Reddit, Telegram ajoutes).
  var SOURCE_RULES = [
    ["whatsapp", "whatsapp|^wa\\.me$"],
    ["tiktok", "tiktok|musical\\.ly|bytedance|^tt$"],
    ["instagram", "instagram|^ig$"],
    ["facebook", "facebook|^fb$|(^|\\.)fb\\.com$|^m\\.me$|messenger"],
    ["x", "^t\\.co$|twitter|^x$|(^|\\.)x\\.com$"],
    ["youtube", "youtube|youtu\\.be|^yt$"],
    ["snapchat", "snapchat|^snap$"],
    ["ia", "chatgpt|openai|perplexity|gemini\\.google|copilot|claude\\.ai|^ia$"],
    ["google", "(^|\\.)google(\\.|$)|googlequicksearchbox"],
    ["bing", "(^|\\.)bing(\\.|$)"],
    ["reddit", "reddit"],
    ["telegram", "telegram|^t\\.me$"]
  ];
  var SOURCE_RES = SOURCE_RULES.map(function (r) { return [r[0], new RegExp(r[1])]; });
  var SOURCE_LABELS = {
    tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", google: "Google", bing: "Bing",
    x: "X / Twitter", whatsapp: "WhatsApp", youtube: "YouTube", snapchat: "Snapchat", ia: "ChatGPT et autres IA",
    reddit: "Reddit", telegram: "Telegram", direct: "Direct", other: "Autres sites"
  };
  function trimOrNull(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).replace(/^ +| +$/g, "");
    return s ? s : null;
  }
  function sourceGroup(utm, ref, browser) {
    var s = trimOrNull(utm) || trimOrNull(ref);
    if (!s) {
      var b = String(browser || "");
      if (/^tiktok/i.test(b)) return "tiktok";
      if (/^instagram/i.test(b)) return "instagram";
      if (/^facebook/i.test(b)) return "facebook";
      if (/^snapchat/i.test(b)) return "snapchat";
      return "direct";
    }
    s = s.toLowerCase();
    for (var i = 0; i < SOURCE_RES.length; i++) {
      if (SOURCE_RES[i][1].test(s)) return SOURCE_RES[i][0];
    }
    return "other";
  }
  function sourceLabel(key) { return SOURCE_LABELS[key] || "Source inconnue"; }

  // ---------- Noms de pages lisibles ----------
  var PAGE_TITLES = {
    "": "Accueil", "abonnement": "Abonnement", "pro": "Outils Pro", "landing": "Offre Pro",
    "inscription": "Inscription", "connexion": "Connexion", "compte": "Mon compte", "marches": "Marchés",
    "exemple-analyse": "Exemple d'analyse", "joueur": "Fiche joueur", "a-propos": "À propos", "cgv": "CGV",
    "mentions-legales": "Mentions légales", "confidentialite": "Confidentialité", "cookies": "Cookies",
    "jeu-responsable": "Jeu responsable", "mot-de-passe-oublie": "Mot de passe oublié",
    "reinitialiser-mot-de-passe": "Nouveau mot de passe", "checkout-succes": "Paiement réussi",
    "checkout-annule": "Paiement annulé", "404": "Page introuvable", "page-inexistante": "Page introuvable",
    "blog": "Blog", "blog/guides": "Blog : tous les guides", "maintenance": "Maintenance",
    "admin": "Tableau de bord admin", "leagues": "Ligues"
  };
  var BLOG_TITLES = {
    "coupe-du-monde-2026-guide-complet": "Coupe du monde 2026 : format, calendrier, méthode",
    "guide-paris-sportifs-debutant-complet": "Paris sportifs pour débutants",
    "meilleurs-bookmakers-monde-2026": "Bookmakers agréés en France 2026",
    "plus-de-2-5-buts-probabilite-methode-poisson": "Plus de 2,5 buts : calculer la probabilité",
    "prediction-ia-football-guide-2026": "Prédiction IA football 2026",
    "value-bet-guide-complet-2026": "Value bet : définition, calcul et limites",
    "xg-expected-goals-guide-complet": "xG (expected goals) : calcul et lecture"
  };
  var LEAGUE_NAMES = {
    "premier-league": "Premier League", "ligue-1": "Ligue 1", "la-liga": "La Liga", "serie-a": "Serie A",
    "bundesliga": "Bundesliga", "champions-league": "Ligue des champions", "europa-league": "Ligue Europa",
    "conference-league": "Ligue Europa Conférence", "eredivisie": "Eredivisie", "mls": "MLS", "liga-mx": "Liga MX"
  };
  function prettySlug(slug) {
    var s = String(slug == null ? "" : slug);
    try { s = decodeURIComponent(s); } catch (e) {}
    s = s.replace(/\.html?$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }
  function normalizePath(p) {
    var s = String(p == null ? "" : p);
    var cut = s.search(/[?#]/);
    if (cut !== -1) s = s.slice(0, cut);
    s = s.replace(/\.html$/i, "").replace(/\/index$/i, "/");
    return s || "/";
  }
  function matchName(id, names) {
    var n = names && id != null ? names[String(id)] : null;
    return n && n.home && n.away ? String(n.home) + " – " + String(n.away) : null;
  }
  // title : nom complet avec la version (« Match : PSG – OM (FR) ») ;
  // name : nom court pour le proprietaire (« Match PSG – OM », « Accueil »).
  function pageInfo(path, matchId, names) {
    var raw = path == null ? "" : String(path);
    if (!raw) return { title: "Page inconnue", base: "Page inconnue", name: "Page inconnue", site: null, kind: "unknown", matchId: null, raw: "" };
    var p = normalizePath(raw);
    var q = raw.match(/[?&]id=(\d{1,12})(?:[&#]|$)/);
    var m = p.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)(?=\/|$)/);
    var site = m ? m[1] : "fr";
    var rest = p.slice(m ? m[0].length : 0).replace(/^\/+|\/+$/g, "");
    var id = /^\d{1,12}$/.test(String(matchId == null ? "" : matchId)) ? String(matchId) : (q ? q[1] : null);
    var mm = rest.match(/^match\/(\d{1,12})$/);
    if (mm) { id = mm[1]; rest = "match"; }
    var kind = "page", base, name, seg;
    if (rest === "match") {
      kind = "match";
      var nm = id ? matchName(id, names) : null;
      base = nm ? "Match : " + nm : id ? "Match n° " + id : "Page match";
      name = nm ? "Match " + nm : id ? "Match n° " + id : "Page match";
    } else if (/^blog\/guides\/[^/]+$/.test(rest)) {
      kind = "blog";
      seg = rest.split("/")[2];
      base = "Blog : " + (BLOG_TITLES[seg] || prettySlug(seg));
    } else if (/^blog\/.+/.test(rest) && !Object.prototype.hasOwnProperty.call(PAGE_TITLES, rest)) {
      kind = "blog";
      base = "Blog : " + prettySlug(rest.split("/").pop());
    } else if (/^(leagues|ligues?)\/[^/]+$/.test(rest)) {
      kind = "league";
      seg = rest.split("/")[1];
      base = "Ligue : " + (LEAGUE_NAMES[seg] || prettySlug(seg));
    } else if (/^(clubs?|equipes?|teams?)\/[^/]+$/.test(rest)) {
      kind = "club";
      base = "Club : " + prettySlug(rest.split("/")[1]);
    } else if (Object.prototype.hasOwnProperty.call(PAGE_TITLES, rest)) {
      base = PAGE_TITLES[rest];
    } else {
      base = prettySlug(rest.split("/").pop()) || "Page";
    }
    var info = SITES[site];
    var suffix = kind === "match" ? " (" + info.short + ")" : " (" + info.name + ")";
    return { title: base + suffix, base: base, name: name || base, site: site, kind: kind, matchId: kind === "match" ? id : null, raw: raw };
  }
  // Lien cliquable uniquement pour un chemin sur (sinon texte seul).
  function safeHref(path, matchId) {
    var p = String(path == null ? "" : path);
    if (!/^\/[A-Za-z0-9._~\/-]{0,300}$/.test(p) || /^\/\//.test(p)) return null;
    if (/\/match(\.html)?$/.test(p) && /^\d{1,12}$/.test(String(matchId == null ? "" : matchId))) {
      return p.replace(/\/match$/, "/match.html") + "?id=" + matchId;
    }
    return p;
  }

  // ---------- Dates, heures, periodes ----------
  function ymdOk(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T12:00:00Z")); }
  function addDays(ymd, n) { return new Date(Date.parse(ymd + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5); }
  function parisToday(date) {
    var parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date || new Date());
    var o = {};
    parts.forEach(function (x) { o[x.type] = x.value; });
    return o.year + "-" + o.month + "-" + o.day;
  }
  function fmtYmd(ymd) {
    return new Date(Date.parse(ymd + "T12:00:00Z")).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  }
  function periodRange(key, today, custom) {
    var from, to, label, compare;
    if (key === "today") { from = to = today; label = "aujourd'hui"; compare = "par rapport à hier à la même heure"; }
    else if (key === "yesterday") { from = to = addDays(today, -1); label = "hier"; compare = "par rapport à avant-hier"; }
    else if (key === "day" && custom && ymdOk(custom.from) && custom.from < today) {
      // Un jour precis (fleches « jour d'avant / jour d'apres », clic dans « Jour par jour »).
      if (custom.from === addDays(today, -1)) return periodRange("yesterday", today);
      from = to = custom.from < addDays(today, -394) ? addDays(today, -394) : custom.from;
      label = from === addDays(today, -2) ? "avant-hier" : "le " + dayTitle(from).toLowerCase();
      compare = "par rapport au jour d'avant";
    }
    else if (key === "7" || key === "15" || key === "30") {
      var n = Number(key);
      from = addDays(today, -(n - 1)); to = today;
      label = n + " derniers jours"; compare = "par rapport aux " + n + " jours d'avant";
    } else if (key === "custom" && custom && ymdOk(custom.from)) {
      from = custom.from;
      to = ymdOk(custom.to) ? custom.to : custom.from;
      if (from > to) { var t = from; from = to; to = t; }
      if (to > today) to = today;
      if (from > today) from = today;
      if (daysBetween(from, to) > 394) from = addDays(to, -394);
      label = from === to ? "le " + fmtYmd(from) : "du " + fmtYmd(from) + " au " + fmtYmd(to);
      compare = "par rapport à la période d'avant";
    } else {
      return periodRange("today", today);
    }
    return { key: key, from: from, to: to, days: daysBetween(from, to) + 1, label: label, compare: compare };
  }
  var TZ_RE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;
  function timeIn(iso, tz) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    try { return d.toLocaleTimeString("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }); } catch (e) { return null; }
  }
  // Heure de Paris et, si le fuseau du visiteur est connu, son heure locale.
  function visitClock(iso, tz) {
    var paris = timeIn(iso, TZ);
    if (!paris) return { paris: null, local: null, text: "—" };
    var local = typeof tz === "string" && TZ_RE.test(tz) ? timeIn(iso, tz) : null;
    if (!local) return { paris: paris, local: null, text: paris + " (Paris)" };
    if (local === paris) return { paris: paris, local: local, text: paris + " à Paris, même heure chez le visiteur" };
    return { paris: paris, local: local, text: paris + " à Paris · " + local + " chez le visiteur" };
  }
  function ago(iso, now) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return "—";
    var s = Math.max(0, Math.round(((now ? new Date(now).getTime() : Date.now()) - t) / 1000));
    if (s < 10) return "à l'instant";
    if (s < 60) return "il y a " + s + " s";
    var m = Math.floor(s / 60);
    if (m < 60) return "il y a " + m + " min";
    var h = Math.floor(m / 60);
    if (h < 48) return "il y a " + h + " h";
    return "il y a " + Math.floor(h / 24) + " jours";
  }
  function onSiteFor(firstIso, now) {
    var t = new Date(firstIso).getTime();
    if (isNaN(t)) return null;
    var s = Math.max(0, Math.round(((now ? new Date(now).getTime() : Date.now()) - t) / 1000));
    return s < 60 ? "sur le site depuis moins d'une minute" : "sur le site depuis " + fmtDur(Math.floor(s / 60) * 60);
  }

  // ---------- Phrase du jour ----------
  function todaySentence(o) {
    o = o || {};
    var v = num(o.visitors), s = num(o.signups), p = num(o.newPro);
    if (v === null) return "Les chiffres d'aujourd'hui ne sont pas disponibles pour le moment.";
    var parts = [];
    if (v === 0) {
      parts.push("Aucune visite pour l'instant aujourd'hui");
      if (s !== null) parts.push(s === 0 ? "aucune inscription" : fmtInt(s) + " inscription" + (s > 1 ? "s" : ""));
    } else {
      parts.push(fmtInt(v) + " " + (v > 1 ? "personnes sont venues" : "personne est venue") + " aujourd'hui");
      if (s !== null) parts.push(s === 0 ? "personne ne s'est inscrit" : fmtInt(s) + " " + (s > 1 ? "se sont inscrites" : "s'est inscrite"));
    }
    if (p !== null) parts.push(p === 0 ? "aucun nouvel abonné" : fmtInt(p) + " " + (p > 1 ? "nouveaux abonnés" : "nouvel abonné"));
    return parts.join(", ") + ".";
  }
  // Moyenne de visiteurs par jour sur les journees COMPLETES suivies (apres
  // le jour du lancement du suivi). null s'il n'y en a aucune.
  function dailyAverage(series, launchAt) {
    var launchDay = parisToday(new Date(launchAt || LAUNCH_AT));
    var days = 0, total = 0;
    (series || []).forEach(function (b) {
      var day = String(b && b.t || "").slice(0, 10);
      if (!ymdOk(day) || day <= launchDay) return;
      days += 1;
      total += Number(b.visitors) || 0;
    });
    return days ? { avg: total / days, days: days } : null;
  }
  // Comparaisons du jour : avec hier a la meme heure, et avec la moyenne des
  // 7 jours precedents (la journee en cours n'est pas finie : on le dit).
  function compareToday(o) {
    o = o || {};
    var out = [], cur = num(o.today), y = num(o.yesterday);
    if (cur === null) return out;
    if (o.yesterdayComplete === false || y === null) {
      out.push({ dir: "none", text: "Pas encore de comparaison avec hier : le suivi des visites a démarré le 13 septembre 2026 au soir." });
    } else if (cur === y) {
      out.push({ dir: "flat", text: "Autant de visiteurs qu'hier à la même heure (" + fmtInt(y) + ")." });
    } else {
      var d = Math.abs(cur - y);
      out.push({ dir: cur > y ? "up" : "down", text: fmtInt(d) + " visiteur" + (d > 1 ? "s" : "") + " de " + (cur > y ? "plus" : "moins") + " qu'hier à la même heure (hier : " + fmtInt(y) + ")." });
    }
    var a = o.average;
    if (!a || num(a.avg) === null) {
      out.push({ dir: "none", text: "Pas encore assez d'historique pour comparer à la semaine passée." });
    } else {
      var avg = Math.round(a.avg * 10) / 10;
      var avgTxt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(avg);
      var base = "Moyenne des " + (a.days >= 7 ? "7 derniers jours" : a.days + " dernier" + (a.days > 1 ? "s" : "") + " jour" + (a.days > 1 ? "s" : "")) + " : " + avgTxt + " visiteur" + (avg > 1 ? "s" : "") + " par jour";
      if (cur > avg) out.push({ dir: "up", text: base + ". Aujourd'hui fait déjà mieux." });
      else if (cur === avg) out.push({ dir: "flat", text: base + ". Aujourd'hui est dans la moyenne." });
      else out.push({ dir: "down", text: base + ". Aujourd'hui : " + fmtInt(cur) + " pour l'instant (la journée n'est pas finie)." });
    }
    return out;
  }

  // ---------- Du visiteur au client ----------
  var JOURNEY = [
    ["visitors", "Visite", "a ouvert le site"],
    ["match_page", "Page match", "a ouvert l'analyse d'un match"],
    ["pricing_page", "Page abonnement", "a regardé les offres Pro"],
    ["checkout_started", "Paiement commencé", "a cliqué sur le bouton de paiement"],
    ["checkout_success", "Abonné", "paiement confirmé"]
  ];
  function journeySteps(f) {
    f = f || {};
    var first = num(f.visitors) || 0, prev = null;
    return JOURNEY.map(function (d, i) {
      var v = num(f[d[0]]);
      var step = {
        key: d[0], label: d[1], help: d[2], value: v,
        pctOfFirst: v === null ? null : first ? (v / first) * 100 : 0,
        pctOfPrev: i === 0 || v === null || !(prev > 0) ? null : (v / prev) * 100
      };
      prev = v;
      return step;
    });
  }
  // Etape ou l'on perd le plus de personnes (en nombre). null si personne
  // n'est perdu (ou aucun visiteur).
  function biggestLeak(steps) {
    var best = null;
    for (var i = 1; i < (steps || []).length; i++) {
      var a = steps[i - 1], b = steps[i];
      if (a.value === null || b.value === null || !(a.value > 0)) continue;
      var lost = a.value - b.value;
      if (lost > 0 && (!best || lost > best.lost)) best = { index: i, from: a.label, to: b.label, lost: lost, of: a.value, pct: (lost / a.value) * 100 };
    }
    if (!best) return null;
    best.sentence = "C'est ici que tu perds le plus de monde : entre « " + best.from + " » et « " + best.to + " », "
      + fmtInt(best.lost) + " personne" + (best.lost > 1 ? "s" : "") + " sur " + fmtInt(best.of) + " s'arrête" + (best.lost > 1 ? "nt" : "") + " (" + fmtPct(best.pct, 0) + ").";
    return best;
  }

  // ---------- Sante du site (feu tricolore) ----------
  function hoursSince(iso, now) {
    var t = iso ? new Date(iso).getTime() : NaN;
    if (isNaN(t)) return null;
    return Math.max(0, ((now ? new Date(now).getTime() : Date.now()) - t) / 36e5);
  }
  function ageText(hours) {
    if (hours === null) return "date inconnue";
    var h = Math.floor(hours);
    if (h < 1) { var m = Math.floor(hours * 60); return m < 2 ? "il y a moins de 2 min" : "il y a " + m + " min"; }
    return h < 48 ? "il y a " + h + " h" : "il y a " + Math.floor(h / 24) + " jours";
  }
  // Fraicheur du pipeline quotidien (workflow "Update IASHARK Daily", cron
  // 06:00 UTC) d'apres generated_at de data-home.json.
  function pipelineStatus(generatedAt, now) {
    var hours = hoursSince(generatedAt, now);
    if (hours === null) return { level: "unknown", hours: null, text: "Date de mise à jour des pronostics inconnue." };
    if (hours <= 26) return { level: "ok", hours: hours, text: "Pronostics du jour à jour (mis à jour " + ageText(hours) + ")." };
    if (hours <= 50) return { level: "warn", hours: hours, text: "Les pronostics n'ont pas été mis à jour ce matin (dernière mise à jour " + ageText(hours) + "). Regarde sur GitHub, onglet Actions, la tâche « Update IASHARK Daily »." };
    return { level: "bad", hours: hours, text: "Pronostics bloqués : dernière mise à jour " + ageText(hours) + ". Sur GitHub, onglet Actions, relance la tâche « Update IASHARK Daily » ou préviens ton développeur." };
  }
  var LIGHT_TEXT = {
    green: ["Tout va bien", "Le site fonctionne normalement."],
    amber: ["À surveiller", "Le site fonctionne, mais un point mérite un coup d'œil (voir ci-dessous)."],
    red: ["Problème à régler", "Quelque chose ne fonctionne pas : le détail ci-dessous dit quoi faire."],
    unknown: ["Vérification incomplète", "Certaines vérifications n'ont pas pu se faire pour le moment."]
  };
  // o = { home: {ok, generated_at} | undefined, health: donnees admin_health
  // | null, healthError: bool, activePro: nombre | null, now }
  function healthLights(o) {
    o = o || {};
    var checks = [];
    var home = o.home;
    if (!home) checks.push({ key: "pronos", title: "Pronostics du jour", level: "unknown", text: "Vérification en cours…" });
    else if (!home.ok) checks.push({ key: "pronos", title: "Pronostics du jour", level: "bad", text: "Le fichier des pronostics est illisible sur le site. Vérifie le dernier déploiement ou préviens ton développeur." });
    else { var ps = pipelineStatus(home.generated_at, o.now); checks.push({ key: "pronos", title: "Pronostics du jour", level: ps.level, text: ps.text }); }

    var h = o.health;
    if (!h) {
      var why = o.healthError ? "Impossible de vérifier pour le moment. Réessaie dans une minute." : "Vérification en cours…";
      checks.push({ key: "visits", title: "Visites reçues", level: "unknown", text: why });
      checks.push({ key: "payments", title: "Paiements", level: "unknown", text: why });
    } else {
      var vh = hoursSince(h.last_page_view_at || h.last_event_at, o.now);
      if (vh === null) checks.push({ key: "visits", title: "Visites reçues", level: "warn", text: "Aucune visite enregistrée pour l'instant. Ouvre ton site une fois pour vérifier que le suivi marche." });
      else if (vh <= 6) checks.push({ key: "visits", title: "Visites reçues", level: "ok", text: "Les visites arrivent normalement (dernière " + ageText(vh) + ")." });
      else if (vh <= 24) checks.push({ key: "visits", title: "Visites reçues", level: "warn", text: "Aucune visite depuis " + ageText(vh).replace("il y a ", "") + ". C'est peut-être calme ; sinon, vérifie que le site s'ouvre bien." });
      else checks.push({ key: "visits", title: "Visites reçues", level: "bad", text: "Aucune visite enregistrée depuis " + ageText(vh).replace("il y a ", "") + " : le suivi est peut-être cassé. Ouvre le site pour vérifier qu'il s'affiche, puis préviens ton développeur." });

      var active = num(o.activePro);
      var bh = hoursSince(h.last_billing_event_at, o.now);
      if (bh === null) {
        if (active > 0) checks.push({ key: "payments", title: "Paiements", level: "warn", text: "Tu as des abonnés, mais aucun message de Stripe n'est jamais arrivé : fais vérifier le webhook Stripe." });
        else checks.push({ key: "payments", title: "Paiements", level: "ok", text: "Aucun paiement pour l'instant : c'est normal tant que personne ne s'est abonné." });
      } else if (bh <= 35 * 24 || !(active > 0)) {
        checks.push({ key: "payments", title: "Paiements", level: "ok", text: "Dernier message de Stripe reçu " + ageText(bh) + "." });
      } else {
        checks.push({ key: "payments", title: "Paiements", level: "warn", text: "Aucun message de Stripe depuis " + ageText(bh).replace("il y a ", "") + " alors que tu as des abonnés actifs : fais vérifier le webhook Stripe." });
      }
    }
    var levels = checks.map(function (c) { return c.level; });
    var level = levels.indexOf("bad") !== -1 ? "red" : levels.indexOf("warn") !== -1 ? "amber" : levels.indexOf("unknown") !== -1 ? "unknown" : "green";
    return { level: level, title: LIGHT_TEXT[level][0], sentence: LIGHT_TEXT[level][1], checks: checks };
  }

  // ---------- Humains, robots et tests ----------
  var REASONS = {
    bot: ["Robot ou navigateur automatique", "Programmes qui parcourent le site tout seuls (moteurs, outils de test)."],
    headless: ["Robot déguisé en navigateur", "Navigateur réglé sur l'heure universelle (UTC) qui se présente comme un téléphone ou avec l'écran par défaut des robots : jamais un vrai visiteur."],
    emulated: ["Écran simulé", "Un ordinateur qui se fait passer pour un téléphone : c'est typique des tests."],
    internal: ["Ton appareil", "Tes propres visites, depuis un appareil exclu des chiffres."],
    qa: ["Test automatique", "Visites de contrôle du site (liens de test)."],
    excluded: ["Retirée à la main", "Visites que tu as retirées toi-même depuis « Détails »."],
    account: ["Compte admin ou de test", "Visites faites avec un compte administrateur ou de test."]
  };
  function reasonLabel(r) { return REASONS[r] ? REASONS[r][0] : "Test ou visite interne"; }
  function reasonHelp(r) { return REASONS[r] ? REASONS[r][1] : "Visite reconnue comme interne ou de test."; }
  function visitorKind(v) {
    v = v || {};
    if (v.is_internal || v.internal_reason) {
      return { human: false, label: "Robot / test", why: v.internal_reason ? reasonLabel(v.internal_reason) + " : pas compté dans tes chiffres." : "Robot, test ou ton appareil : pas compté dans tes chiffres." };
    }
    return { human: true, label: "Humain", why: "Visite normale, comptée dans tes chiffres." };
  }
  // Repartition des visites retirees. Avec 0022 : chiffres exacts de la
  // periode (analytics.internal_reasons). Sans : estimation d'apres un
  // echantillon des dernieres visites (sessions avec p_include_internal).
  function reasonBreakdown(analytics, sample) {
    var a = analytics || {};
    var total = num(a.internal_sessions);
    var counts = {}, order = [], source;
    if (Array.isArray(a.internal_reasons)) {
      source = "period";
      a.internal_reasons.forEach(function (r) {
        var k = r && r.reason ? String(r.reason) : "account";
        if (!counts[k]) { counts[k] = 0; order.push(k); }
        counts[k] += Number(r.visitors) || 0;
      });
    } else if (Array.isArray(sample)) {
      source = "sample";
      sample.forEach(function (s) {
        if (!s || !(s.is_internal || s.internal_reason)) return;
        var k = s.internal_reason ? String(s.internal_reason) : "account";
        if (!counts[k]) { counts[k] = 0; order.push(k); }
        counts[k] += 1;
      });
    } else {
      source = "none";
    }
    var rows = order.map(function (k) { return { reason: k, label: reasonLabel(k), help: reasonHelp(k), visitors: counts[k] }; })
      .sort(function (x, y) { return y.visitors - x.visitors || x.reason.localeCompare(y.reason); });
    var sampled = rows.reduce(function (n, r) { return n + r.visitors; }, 0);
    return { total: total, rows: rows, source: source, sampled: sampled };
  }

  // ---------- Pays et villes ----------
  function placeLabel(o) {
    o = o || {};
    var city = typeof o.city === "string" && o.city ? o.city : null;
    if (city) return city + (isCountry(o.country) ? ", " + countryName(o.country) : "");
    return isCountry(o.country) ? countryName(o.country) : "Lieu inconnu";
  }
  // Villes disponibles seulement si la migration 0022 est appliquee.
  function geoState(analytics) {
    var a = analytics || {};
    var available = !!(a.geo && a.geo.cities_available) || Array.isArray(a.cities);
    var cities = available && Array.isArray(a.cities) ? a.cities.filter(function (c) { return c && c.city; }) : [];
    return {
      available: available,
      cities: cities,
      withCity: a.geo ? num(a.geo.visitors_with_city) : null,
      visitors: a.geo ? num(a.geo.visitors) : null
    };
  }

  // Parts d'un total, repli des petites lignes en « Autres ».
  function shareRows(list, keyName, max) {
    var rows = (list || []).filter(Boolean).map(function (r) { return { key: r[keyName], visitors: Number(r.visitors) || 0, row: r }; })
      .filter(function (r) { return r.visitors > 0; })
      .sort(function (x, y) { return y.visitors - x.visitors; });
    var total = rows.reduce(function (n, r) { return n + r.visitors; }, 0);
    if (max && rows.length > max) {
      var head = rows.slice(0, max - 1), rest = rows.slice(max - 1);
      head.push({ key: "__other", visitors: rest.reduce(function (n, r) { return n + r.visitors; }, 0), other: rest.length });
      rows = head;
    }
    rows.forEach(function (r) { r.pct = total ? (r.visitors / total) * 100 : 0; });
    return { rows: rows, total: total };
  }

  // ---------- Phrases diverses ----------
  var DEVICE_WORDS = { mobile: "téléphone", tablet: "tablette", desktop: "ordinateur" };
  function sessionSentence(s) {
    s = s || {};
    var parts = [];
    if (s.city) parts.push("Visiteur à " + s.city + (isCountry(s.country) ? " (" + countryName(s.country) + ")" : ""));
    else parts.push(inCountry(s.country) ? "Visiteur " + inCountry(s.country) : "Visiteur (lieu inconnu)");
    parts.push(DEVICE_WORDS[s.device] || "appareil inconnu");
    if (s.source_group === "direct") parts.push("venu en direct");
    else if (s.source_group) parts.push("arrivé via " + sourceLabel(s.source_group));
    else parts.push("source inconnue");
    var n = Number(s.page_views) || 0;
    parts.push(n + " page" + (n > 1 ? "s" : ""));
    if (num(s.duration_sec) !== null && n > 0) parts.push(fmtDur(s.duration_sec));
    var outcome = [];
    if (s.signed_up) outcome.push("s'est inscrit");
    if (s.checkout_success) outcome.push("a payé");
    else if (s.checkout_started) outcome.push("a commencé un paiement");
    if (outcome.length) parts.push(outcome.join(" et "));
    return parts.join(" · ");
  }
  function revenueText(b) {
    var revenue = {};
    ((b && b.first_payments) || []).concat((b && b.renewals) || []).forEach(function (r) {
      var c = /^[a-z]{3}$/i.test(String(r && r.currency || "")) ? String(r.currency).toLowerCase() : "eur";
      revenue[c] = (revenue[c] || 0) + (Number(r.amount_cents) || 0);
    });
    var cur = Object.keys(revenue).filter(function (c) { return revenue[c] > 0; });
    return cur.length ? cur.map(function (c) { return fmtMoney(revenue[c], c); }).join(" + ") : fmtMoney(0, "eur");
  }
  // MRR : ce que rapportent les abonnements EN COURS chaque mois si rien ne
  // change (fonction Edge admin-revenue : Stripe en direct, hebdo x 52/12,
  // annuel / 12, resiliations programmees exclues). r.mrr = { EUR: 19.95 }.
  function mrrText(r) {
    var map = r && r.mrr && typeof r.mrr === "object" ? r.mrr : {};
    var cur = Object.keys(map).filter(function (c) { return Number(map[c]) > 0; });
    return cur.length ? cur.map(function (c) { return fmtMoney(Math.round(Number(map[c]) * 100), c.toLowerCase()); }).join(" + ") : fmtMoney(0, "eur");
  }

  // ---------- Mes inscrits (migration 0025_admin_members.sql) ----------
  // MEMES seuils et meme ordre que le statut calcule par admin_members (SQL).
  var MEMBER_NEW_DAYS = 7, MEMBER_IDLE_DAYS = 7, MEMBER_GONE_DAYS = 30;
  var MEMBER_STATUS = {
    pro: { label: "Pro", cls: "pro", help: "Paie l'abonnement Pro." },
    "new": { label: "Nouveau", cls: "new", help: "Inscrit depuis moins de 7 jours." },
    active: { label: "Actif", cls: "active", help: "Venu sur le site dans les 7 derniers jours." },
    to_nudge: { label: "À relancer", cls: "nudge", help: "Plus venu depuis 7 jours ou plus : un petit message peut le faire revenir." },
    gone: { label: "Parti", cls: "gone", help: "Plus venu depuis 30 jours ou plus." }
  };
  var MEMBER_STATUS_ORDER = ["pro", "new", "active", "to_nudge", "gone"];
  function msOf(iso) {
    if (iso === null || iso === undefined || iso === "") return null;
    var t = new Date(iso).getTime();
    return isNaN(t) ? null : t;
  }
  function latestMs(list) {
    var best = null;
    list.forEach(function (v) { var t = msOf(v); if (t !== null && (best === null || t > best)) best = t; });
    return best;
  }
  // « le***@gmail.com » : MEMES regles que public.admin_mask_email (SQL).
  function maskEmail(email) {
    var s = String(email == null ? "" : email).replace(/^ +| +$/g, "");
    var at = s.indexOf("@");
    if (at < 1) return null;
    var local = s.slice(0, at);
    return local.slice(0, local.length <= 2 ? 1 : 2) + "***@" + s.slice(at + 1).split("@")[0];
  }
  function memberLastActivity(m) {
    m = m || {};
    var t = latestMs([m.last_seen_at, m.last_sign_in_at]);
    return t === null ? null : new Date(t).toISOString();
  }
  // Ordre : Pro, Nouveau (< 7 j d'inscription), Actif (< 7 j sans activite),
  // A relancer (7 a 29 j), Parti (30 j et plus). Activite = derniere visite
  // vue, derniere connexion ou inscription.
  function memberStatus(m, now) {
    m = m || {};
    var t = now ? new Date(now).getTime() : Date.now();
    var created = msOf(m.created_at);
    var base = latestMs([m.created_at, m.last_seen_at, m.last_sign_in_at]);
    var key;
    if (m.plan === "pro") key = "pro";
    else if (created !== null && t - created < MEMBER_NEW_DAYS * 864e5) key = "new";
    else if (base !== null && t - base < MEMBER_IDLE_DAYS * 864e5) key = "active";
    else if (base !== null && t - base < MEMBER_GONE_DAYS * 864e5) key = "to_nudge";
    else key = "gone";
    var s = MEMBER_STATUS[key];
    return { key: key, label: s.label, cls: s.cls, help: s.help, idleDays: base === null ? null : Math.max(0, Math.floor((t - base) / 864e5)) };
  }
  function memberCounts(members, now) {
    var c = { total: 0, pro: 0, "new": 0, active: 0, to_nudge: 0, gone: 0 };
    (members || []).forEach(function (m) { if (!m) return; c.total += 1; c[memberStatus(m, now).key] += 1; });
    return c;
  }
  // « Forte intention » : inscrit gratuit qui a presque paye (checkout
  // commence, clic sur le bouton de paiement, ou panneau « Debloquer » vu au
  // moins deux fois). La liste de relance la plus rentable : ces comptes
  // etaient a un clic de payer.
  function memberIntent(m) {
    m = m || {};
    if (m.plan === "pro") return false;
    return !!m.checkout_started || !!m.clicked_pay || Number(m.paywall_view) >= 2;
  }
  // Jours calendaires de Paris : « aujourd'hui », « hier », « il y a 2 jours ».
  function daysAgo(iso, now) {
    var t = msOf(iso);
    if (t === null) return "jamais";
    var d = daysBetween(parisToday(new Date(t)), parisToday(now ? new Date(now) : new Date()));
    if (d <= 0) return "aujourd'hui";
    if (d === 1) return "hier";
    if (d < 60) return "il y a " + d + " jours";
    return "il y a " + Math.floor(d / 30) + " mois";
  }
  // n derniers jours (du plus ancien a aujourd'hui), actif ou non.
  function activityBar(dates, now, n) {
    n = n || 7;
    var set = {};
    (dates || []).forEach(function (d) { var s = String(d == null ? "" : d).slice(0, 10); if (ymdOk(s)) set[s] = true; });
    var today = parisToday(now ? new Date(now) : new Date()), out = [];
    for (var i = n - 1; i >= 0; i--) { var day = addDays(today, -i); out.push({ day: day, active: !!set[day] }); }
    return out;
  }
  function shortDay(ymd) {
    return ymdOk(ymd) ? Number(ymd.slice(8, 10)) + "/" + ymd.slice(5, 7) : "?";
  }
  // Revenus apres N jours : seuls les inscrits depuis au moins N jours comptent.
  function retentionCell(c, days) {
    c = c || {};
    var el = num(c["eligible_d" + days]) || 0, r = num(c["returned_d" + days]) || 0;
    if (!el) return { state: "early", eligible: 0, returned: 0, pct: null, text: "trop tôt" };
    return { state: "ok", eligible: el, returned: r, pct: (r / el) * 100, text: fmtInt(r) + " sur " + fmtInt(el) };
  }
  function retentionRate(c, days) {
    var cell = retentionCell(c, days);
    return cell.state === "ok" ? cell.pct : null;
  }
  function retentionSentence(c, days) {
    c = c || {};
    var s = num(c.signups) || 0, cell = retentionCell(c, days);
    var when = days === 1 ? "le lendemain ou plus tard" : "après " + days + " jours";
    var week = "de la semaine du " + shortDay(String(c.week_start || "").slice(0, 10));
    if (cell.state === "early") return "Inscrits " + week + " : trop tôt pour savoir s'ils reviennent " + when + ".";
    var head = "Sur " + fmtInt(cell.eligible) + " inscrit" + (cell.eligible > 1 ? "s" : "") + " " + week + ", ";
    var body = cell.returned === 0 ? (cell.eligible > 1 ? "aucun n'est revenu " : "il n'est pas revenu ")
      : fmtInt(cell.returned) + " " + (cell.returned > 1 ? "sont revenus " : "est revenu ");
    var others = s - cell.eligible;
    var rest = others > 0 ? " (" + fmtInt(others) + " autre" + (others > 1 ? "s" : "") + " inscrit" + (others > 1 ? "s" : "") + " depuis moins de " + days + " jour" + (days > 1 ? "s" : "") + ")" : "";
    return head + body + when + rest + ".";
  }
  var MEMBER_EVENT_LABELS = {
    signup_started: "A ouvert l'inscription", signup_completed: "Inscription terminée", login_completed: "Connexion",
    landing_view: "A vu l'offre Pro", paywall_view: "A vu un contenu réservé Pro", tool_page_view: "A vu les outils",
    checkout_started: "Paiement commencé", checkout_unavailable: "Paiement indisponible",
    checkout_success_view: "Paiement réussi", checkout_cancel_view: "Paiement annulé", onboarding_dismissed: "A fermé l'accueil",
    gate_view: "A vu le panneau « Débloquer »"
  };
  var MEMBER_CLICK_KINDS = {
    inscription: "inscription", connexion: "connexion", abonnement: "abonnement", pro: "offre Pro", compte: "compte", landing: "offre",
    match: "match", checkout: "bouton de paiement", lang_switch: "changement de langue", cta: "bouton",
    match_gate_unlock: "« Débloquer » (panneau d'analyse)",
    match_avis_unlock: "« Débloquer » (avis de l'IA)", match_recall_unlock: "« Débloquer » (rappel après les stats)",
    match_analysis_unlock: "« Débloquer » (analyse fermée)", match_faq_unlock: "« Débloquer » (FAQ)", match_bar_unlock: "« Débloquer » (barre du bas)",
    home_scorers_unlock: "« Débloquer » (buteurs du jour)", home_scorers_locked_row: "un buteur flouté", home_scorers_card: "un buteur du jour",
    checkout_consent: "la case des conditions de vente"
  };
  function dayTitle(ymd, now) {
    var today = parisToday(now ? new Date(now) : new Date());
    if (ymd === today) return "Aujourd'hui";
    if (ymd === addDays(today, -1)) return "Hier";
    var s = new Date(Date.parse(ymd + "T12:00:00Z")).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // « Jour par jour » : une ligne par jour de la periode, du plus recent au plus
  // ancien, depuis la serie journaliere de admin_analytics (buckets 'day').
  // Rien si la serie est horaire (periode d'un seul jour).
  function dailyRows(series, range, today) {
    if (!range || !(range.days > 1)) return [];
    var byDay = {};
    (Array.isArray(series) ? series : []).forEach(function (b) {
      var day = String(b && b.t || "").slice(0, 10);
      if (!ymdOk(day) || day < range.from || day > range.to) return;
      var o = byDay[day] || (byDay[day] = { day: day, visitors: 0, pageViews: 0, buckets: 0 });
      o.visitors += num(b.visitors) || 0; o.pageViews += num(b.page_views) || 0; o.buckets++;
    });
    var days = Object.keys(byDay);
    if (days.some(function (d) { return byDay[d].buckets > 1; })) return [];
    return days.sort().reverse().map(function (d) {
      var o = byDay[d];
      // Libelle et drapeau « jour en cours » tires du MEME jour de reference :
      // sans cela le titre suivait l'horloge reelle et la ligne du jour affiche
      // s'appelait « Hier » des le lendemain (constate le 20/09/2026).
      return { day: d, title: dayTitle(d, today ? today + "T12:00:00Z" : undefined), visitors: o.visitors, pageViews: o.pageViews, partial: d === today };
    });
  }
  // Parcours d'un inscrit (admin_member_journey.items) regroupe par jour de
  // Paris, jour le plus recent en premier, actions dans l'ordre de la journee.
  function journeyDays(items, names, now) {
    var byDay = {}, order = [];
    (items || []).forEach(function (it) {
      var t = msOf(it && it.at);
      if (t === null) return;
      var day = parisToday(new Date(t));
      if (!byDay[day]) {
        byDay[day] = { day: day, title: dayTitle(day, now), pages: 0, clicks: 0, sec: 0, secKnown: false, matchIds: {}, entries: [] };
        order.push(day);
      }
      var g = byDay[day], e = { at: new Date(t).toISOString(), beforeSignup: it.before_signup === true };
      if (it.type === "page_view") {
        var info = pageInfo(it.page, it.match_id, names);
        var sec = num(it.sec);
        g.pages += 1;
        if (info.matchId) g.matchIds[info.matchId] = 1;
        if (sec !== null) { g.sec += Math.max(0, sec); g.secKnown = true; }
        e.kind = "page"; e.text = info.name; e.title = info.title; e.sec = sec; e.matchId = info.matchId;
      } else if (it.type === "click") {
        g.clicks += 1;
        e.kind = "click";
        e.text = "Clic sur " + (MEMBER_CLICK_KINDS[it.kind] || "bouton") + (it.label && it.label !== it.kind && !/^(match|home|checkout)_[a-z_]+$/.test(String(it.label)) && it.kind !== "checkout_consent" ? " : « " + String(it.label).slice(0, 80) + " »" : "");
        if (it.kind === "match" && it.match_id) { var nm = matchName(it.match_id, names); if (nm) e.text += " → " + nm; }
      } else {
        e.kind = "event";
        e.text = MEMBER_EVENT_LABELS[it.type] || "Autre action";
        e.win = it.type === "signup_completed" || it.type === "checkout_success_view";
      }
      g.entries.push(e);
    });
    return order.sort().reverse().map(function (d) {
      var g = byDay[d];
      g.entries.sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
      g.matches = Object.keys(g.matchIds).length;
      delete g.matchIds;
      var parts = [g.pages + " page" + (g.pages > 1 ? "s" : "")];
      if (g.matches) parts.push(g.matches + " match" + (g.matches > 1 ? "s" : ""));
      if (g.clicks) parts.push(g.clicks + " clic" + (g.clicks > 1 ? "s" : ""));
      if (g.secKnown) parts.push(fmtDur(g.sec));
      g.summary = parts.join(" · ");
      return g;
    });
  }

  // ---------- Clics « Debloquer » de la page match (admin_unlock_clicks, 0025 puis 0029) ----------
  // Cles = kinds emis par match-page.js et acceptes par funnel-track.js.
  // 19/09/2026 : sur un match payant, l'avis ferme est remplace par le panneau
  // d'analyse (match_gate_unlock, compte par 0029_admin_unlock_gate.sql) ;
  // match_avis_unlock ne reste que sur le match gratuit du jour sans compte.
  var UNLOCK_FILE = "0029_admin_unlock_gate.sql";
  var UNLOCK_PLACES = [
    ["match_gate_unlock", "Panneau d'analyse", "grand bouton « Débloquer avec Pro » posé sur l'analyse floutée, en haut de la page match"],
    ["match_avis_unlock", "Avis de l'IA", "bouton sous l'avis fermé, en haut de la page match (depuis le 19/09/2026 : match gratuit du jour seulement)"],
    ["match_recall_unlock", "Rappel après les stats", "bouton du rappel placé après les statistiques"],
    ["match_analysis_unlock", "Analyse fermée", "bouton posé sur l'analyse complète verrouillée"],
    ["match_faq_unlock", "Réponses de la FAQ", "lien « Débloquer » d'une réponse réservée aux abonnés"],
    ["match_bar_unlock", "Barre en bas de l'écran", "bouton de la barre fixe sur téléphone"]
  ];
  function unlockRows(data) {
    var byKind = {};
    ((data && data.rows) || []).forEach(function (r) { if (r && r.kind) byKind[r.kind] = r; });
    // Emplacement absent de la reponse du serveur : fonction anterieure a sa
    // migration (0029 pour le panneau d'analyse), pas « zero clic ».
    var served = data && Array.isArray(data.rows) && data.rows.length > 0;
    var rows = UNLOCK_PLACES.map(function (p) {
      var r = byKind[p[0]] || {};
      return { kind: p[0], label: p[1], help: p[2], clicks: num(r.clicks) || 0, visitors: num(r.visitors) || 0 };
    });
    var total = rows.reduce(function (n, r) { return n + r.clicks; }, 0);
    rows.forEach(function (r) { r.pct = total ? (r.clicks / total) * 100 : 0; });
    var best = null;
    rows.forEach(function (r) { if (r.clicks > 0 && (!best || r.clicks > best.clicks)) best = r; });
    return {
      rows: rows, total: total,
      uncounted: served ? UNLOCK_PLACES.filter(function (p) { return !byKind[p[0]]; }).map(function (p) { return p[0]; }) : [],
      sentence: !best ? "Aucun clic sur un bouton « Débloquer » de la page match sur cette période."
        : "Le bouton le plus cliqué : « " + best.label + " » (" + fmtInt(best.clicks) + " clic" + (best.clicks > 1 ? "s" : "") + " sur " + fmtInt(total) + ")."
    };
  }

  // ---------- Ou les visiteurs decrochent (admin_conversion_funnel, 0031) ----------
  // Cles et ordre = etapes renvoyees par la fonction SQL. visitors = a fait
  // cette etape ET toutes celles d'avant ; reached = a fait cette etape, par
  // n'importe quel chemin (arrive directement sur l'abonnement...).
  var DROP_FILE = "0031_admin_conversion_funnel.sql";
  var DROP_STEPS = [
    ["arrived", "Arrivée sur le site", "a ouvert au moins une page"],
    ["match_page", "Page match ouverte", "a ouvert l'analyse d'un match"],
    ["gate_view", "Panneau Pro vu", "a vu le panneau « Débloquer » (Pro ou compte gratuit)"],
    ["unlock_click", "Clic « Débloquer »", "a cliqué sur « Débloquer » (page match ou buteurs du jour)"],
    ["pricing_page", "Offre Pro vue", "a vu la page abonnement (ou l'offre de son compte)"],
    ["consent", "Case CGV cochée", "a coché la case des conditions de vente"],
    ["checkout", "Paiement lancé", "a ouvert le paiement sécurisé"],
    ["subscribed", "Abonné", "paiement confirmé par Stripe"]
  ];
  var DROP_SOURCES = { google: "Google", direct: "Direct", social: "Réseaux sociaux", other: "Autre" };
  var DROP_DEVICES = { mobile: "Mobile (téléphone, tablette)", desktop: "Ordinateur" };
  function dropSteps(data) {
    var byKey = {};
    ((data && data.steps) || []).forEach(function (s) { if (s && s.key) byKey[s.key] = s; });
    var first = null, prev = null;
    return DROP_STEPS.map(function (d, i) {
      var r = byKey[d[0]] || {};
      var v = num(r.visitors), reached = num(r.reached);
      if (i === 0) first = v;
      var step = {
        key: d[0], label: d[1], help: d[2], value: v, reached: reached,
        other: v !== null && reached !== null && reached > v ? reached - v : 0,
        pctOfFirst: v === null ? null : first ? (v / first) * 100 : 0,
        pctOfPrev: i === 0 || v === null || !(prev > 0) ? null : (v / prev) * 100
      };
      prev = v;
      return step;
    });
  }
  // Plus gros decrochage (en nombre de visiteurs perdus), phrase simple.
  function dropLeak(steps) {
    var leak = biggestLeak(steps);
    if (!leak) return null;
    leak.sentence = "Le plus gros décrochage : entre « " + leak.from + " » et « " + leak.to + " », "
      + fmtInt(leak.lost) + " visiteur" + (leak.lost > 1 ? "s" : "") + " sur " + fmtInt(leak.of) + " s'arrête" + (leak.lost > 1 ? "nt" : "") + " (" + fmtPct(leak.pct, 0) + ").";
    return leak;
  }
  // Etapes mesurees depuis peu (gate_view et case CGV, 19/09/2026) : dit
  // clairement quand le chiffre est deduit de l'etape suivante.
  function dropNotes(data, range) {
    var t = (data && data.tracking) || {};
    var from = range && ymdOk(range.from) ? range.from : null;
    var out = [];
    [["gate_view_since", "Panneau Pro vu", "du clic « Débloquer »"], ["consent_since", "Case CGV cochée", "du paiement lancé"]].forEach(function (x) {
      var since = t[x[0]] ? new Date(t[x[0]]) : null;
      if (since && isNaN(since)) since = null;
      if (!since) out.push("« " + x[1] + " » n'est pas encore mesuré : en attendant, cette étape est déduite " + x[2] + ".");
      else if (from && parisToday(since) > from) out.push("« " + x[1] + " » est mesuré depuis le " + fmtYmd(parisToday(since)) + " ; avant, cette étape est déduite " + x[2] + ".");
    });
    return out;
  }
  function countryBasisText(b) {
    if (!b) return "";
    var geo = num(b.geo) || 0, tz = num(b.tz) || 0, lang = num(b.lang) || 0, unk = num(b.unknown) || 0;
    if (!(geo + tz + lang + unk)) return "";
    var parts = ["Pays connu par le réseau pour " + fmtInt(geo) + " visiteur" + (geo > 1 ? "s" : "")];
    if (tz) parts.push("estimé par le fuseau horaire pour " + fmtInt(tz));
    if (lang) parts.push("par la langue du navigateur pour " + fmtInt(lang));
    return parts.join(", ") + (unk ? " ; inconnu pour " + fmtInt(unk) : "") + ".";
  }
  function excludedText(e) {
    if (!e) return "";
    var i = num(e.internal) || 0, p = num(e.already_pro) || 0;
    var parts = [];
    if (i) parts.push(fmtInt(i) + " visite" + (i > 1 ? "s" : "") + " de robots, de tests ou de ton appareil");
    if (p) parts.push(fmtInt(p) + " visite" + (p > 1 ? "s" : "") + " d'abonnés déjà Pro");
    return parts.length ? "Non comptées : " + parts.join(" et ") + "." : "";
  }
  function signupTimingText(t) {
    var n = num(t && t.signups) || 0;
    if (!n) return { value: "—", text: "Aucune inscription sur cette période avec ces filtres." };
    var sec = num(t.median_sec), pages = num(t.median_pages);
    return {
      value: sec === null ? "—" : fmtDur(sec),
      text: "Temps médian entre l'arrivée sur le site et l'inscription, sur " + fmtInt(n) + " inscription" + (n > 1 ? "s" : "") + "."
        + (pages === null ? "" : " Pages vues avant de s'inscrire (médiane) : " + new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(pages) + ".")
    };
  }
  function exitRows(data, names) {
    var total = num(data && data.exit_total) || 0;
    return ((data && data.exit_pages) || []).filter(function (r) { return r && num(r.visitors) > 0; }).map(function (r) {
      var info = pageInfo(r.page, r.match_id, names);
      var v = num(r.visitors);
      return { page: r.page, matchId: info.matchId, name: info.name, title: info.title, site: info.site, visitors: v, pct: total ? (v / total) * 100 : 0 };
    });
  }

  // ---------- 10 écrans (9 le 19/10/2026, Partenaires le 20/10/2026) ----------
  // Une question par écran, dans l'ordre où le propriétaire doit les lire.
  // key = ancre (#ecran-<key>) et valeur de data-screen dans admin.html.
  var SCREENS = [
    { key: "aujourdhui", label: "Aujourd'hui", title: "Que dois-je faire aujourd'hui ?", sub: "Les problèmes qui te coûtent le plus de clients, puis les chiffres de la période et qui est sur le site maintenant." },
    { key: "site", label: "Le site", title: "Est-ce que le site marche bien ?", sub: "Pannes, vitesse d'affichage et matchs qui s'affichent (ou pas) : ce qui peut faire fuir un visiteur sans qu'il le dise." },
    { key: "provenance", label: "Provenance", title: "Quel réseau amène des gens utiles ?", sub: "Pour chaque réseau et chaque publication : combien viennent, combien regardent vraiment, combien s'inscrivent ou ouvrent le paiement." },
    { key: "arrivee", label: "Arrivée", title: "Pourquoi les gens partent dès l'arrivée ?", sub: "La première page vue, le temps passé dessus et la langue : c'est là que se joue la plus grosse perte." },
    { key: "parcours", label: "Parcours", title: "À quelle étape on perd les futurs clients ?", sub: "Du premier match ouvert jusqu'au paiement, étape par étape, avec le formulaire d'inscription et le paiement en détail." },
    { key: "envie", label: "Envie", title: "Qu'est-ce qui donne envie de payer ?", sub: "Les boutons « Débloquer » cliqués, les pages et les matchs les plus regardés." },
    { key: "inscrits", label: "Inscrits", title: "Les inscrits reviennent-ils ?", sub: "Ce que font les personnes qui ont créé un compte, et qui relancer." },
    { key: "argent", label: "Argent", title: "Combien ça rapporte ?", sub: "Abonnements en cours, argent encaissé, nouveaux abonnés et résiliations, d'après Stripe et les comptes." },
    { key: "partenaires", label: "Partenaires", title: "Qui accepter comme partenaire ?", sub: "Les candidatures déposées sur la page Partenaires, à accepter ou à refuser, puis ce que rapporte chaque partenaire accepté." },
    { key: "fiabilite", label: "Fiabilité", title: "Peut-on croire ces chiffres ?", sub: "Ce qui est mesuré, ce qui manque, ce qui est retiré (robots, tests, ton appareil), et tous les filtres." }
  ];
  function screenKey(hash) {
    var m = String(hash || "").match(/^#ecran-([a-z]+)$/);
    if (!m) return null;
    for (var i = 0; i < SCREENS.length; i++) if (SCREENS[i].key === m[1]) return m[1];
    return null;
  }

  // ---------- Diagnostics (admin_diagnostics, migration 0052) ----------
  var DIAG_FILE = "0052_admin_diagnostics.sql";
  function pctOf(n, d) {
    var a = num(n), b = num(d);
    return a === null || b === null || b <= 0 ? null : (a / b) * 100;
  }
  // « 1,8 s » au-dessus d'une seconde, « 350 ms » en dessous.
  function msText(ms) {
    var v = num(ms);
    if (v === null || v < 0) return "—";
    if (v < 1000) return NF.format(Math.round(v)) + " ms";
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(v / 1000) + " s";
  }
  // Seuils officiels Google (web.dev/vitals), 75e centile.
  var VITALS = {
    lcp: { label: "Affichage du contenu principal", good: 2500, poor: 4000, words: ["Rapide", "Moyen", "Lent"], unit: "ms" },
    fcp: { label: "Premier affichage", good: 1800, poor: 3000, words: ["Rapide", "Moyen", "Lent"], unit: "ms" },
    inp: { label: "Réaction après un clic", good: 200, poor: 500, words: ["Réactif", "Un peu lent", "Lent au clic"], unit: "ms" },
    cls: { label: "Page qui bouge pendant le chargement", good: 0.1, poor: 0.25, words: ["Stable", "Bouge un peu", "La page saute"], unit: "" }
  };
  function vitalVerdict(metric, value) {
    var v = num(value), def = VITALS[metric];
    if (!def || v === null) return { level: "unknown", word: "Pas encore mesuré" };
    if (v <= def.good) return { level: "good", word: def.words[0] };
    if (v <= def.poor) return { level: "mid", word: def.words[1] };
    return { level: "bad", word: def.words[2] };
  }
  function vitalValue(metric, value) {
    var v = num(value);
    if (v === null) return "—";
    return metric === "cls" ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v) : msText(v);
  }
  var LANG_NAMES = {
    fr: "français", en: "anglais", es: "espagnol", pt: "portugais", de: "allemand", it: "italien", ar: "arabe",
    nl: "néerlandais", tr: "turc", fi: "finnois", sv: "suédois", pl: "polonais", ru: "russe", ro: "roumain",
    vi: "vietnamien", zh: "chinois", ja: "japonais", ko: "coréen", el: "grec", hu: "hongrois", cs: "tchèque", da: "danois", no: "norvégien", nb: "norvégien"
  };
  function langName(code) {
    var c = String(code || "").toLowerCase();
    return LANG_NAMES[c] || (/^[a-z]{2}$/.test(c) ? "langue « " + c + " »" : "langue inconnue");
  }
  var SITE_LANG = { fr: "en français", en: "en anglais", gb: "en anglais (Royaume-Uni)", za: "en anglais (Afrique du Sud)", es: "en espagnol", mx: "en espagnol (Mexique)", de: "en allemand", it: "en italien", pt: "en portugais" };
  function siteLangText(site) { return SITE_LANG[site] || "dans une version inconnue"; }
  // Page d'arrivée lisible : « Accueil (FR) », « Page match (EN) »...
  function landingName(page, site) {
    var p = String(page || "/");
    if (p === "/") return "Accueil, adresse iashark.com";
    if (p === "/match/") return "Page match, adresse courte iashark.com/match/…";
    var info = pageInfo(p, null, {});
    var key = SITES[site] ? site : /^\/(fr|en|es|de|it|pt|gb|za|mx)(\/|$)/.test(p) ? info.site : null;
    return info.name + (key && SITES[key] ? " (" + SITES[key].short + ")" : "");
  }
  // Libellés courts des motifs d'échec envoyés par le site (auth-pages.js,
  // lib/offre-pro.js). Motif inconnu : affiché tel quel.
  var FAIL_REASONS = {
    champ_email: "adresse e-mail refusée par le formulaire", champ_mdp: "mot de passe trop court", champ_mdp_confirmation: "les deux mots de passe ne correspondent pas",
    deja_inscrit: "compte déjà existant", mdp_trop_court: "mot de passe trop court (serveur)", mdp_trop_simple: "mot de passe trop simple",
    trop_de_tentatives: "trop de tentatives", reseau: "problème de connexion", email_refuse: "adresse e-mail refusée", inscriptions_fermees: "inscriptions fermées", autre: "autre erreur",
    interval_not_configured: "durée d'abonnement pas ouverte", market_not_configured: "paiement pas ouvert dans ce pays", already_subscribed: "déjà abonné",
    price_mismatch: "prix indisponible", consent_required: "case des conditions non cochée", consent_not_loaded: "conditions de paiement pas chargées",
    app_missing: "page mal chargée", reseau_ou_erreur: "problème de connexion ou erreur", checkout_unavailable: "paiement indisponible (ancien suivi)"
  };
  function failReason(code) {
    var c = String(code || "");
    if (FAIL_REASONS[c]) return FAIL_REASONS[c];
    if (/^http_\d{3}$/.test(c)) return "erreur du serveur (" + c.slice(5) + ")";
    return c || "motif inconnu";
  }

  // « À faire en premier » : 3 actions au plus, les plus graves d'abord.
  // Chaque action dit le problème EN CHIFFRES, où regarder, quoi faire.
  // Seuils volontairement simples (peu de trafic) : au moins 20 visiteurs
  // pour parler d'une page ou d'une source, sinon c'est du hasard.
  function todoActions(d) {
    var out = [];
    if (!d || !d.totals) return out;
    var t = d.totals;
    var sessions = num(t.sessions) || 0;
    var pay = d.payment || {}, su = d.signup || {};
    // 1) Paiement qui échoue : urgence absolue (de l'argent perdu).
    if ((num(pay.failed) || 0) > 0) {
      out.push({ level: "urgent", screen: "parcours", weight: 1000 + num(pay.failed),
        title: fmtInt(pay.failed) + " personne" + (pay.failed > 1 ? "s ont" : " a") + " voulu payer sans que le paiement s'ouvre",
        why: "Le motif est dans l'écran Parcours, partie « Le paiement ». C'est de l'argent perdu : à corriger avant tout le reste." });
    }
    // 2) Pannes JavaScript.
    if ((num(t.with_error) || 0) > 0) {
      out.push({ level: "urgent", screen: "site", weight: 900 + num(t.with_error),
        title: "Le site plante pour " + fmtInt(t.with_error) + " visiteur" + (t.with_error > 1 ? "s" : ""),
        why: "Une erreur du site s'est produite pendant leur visite. Le détail (message, page) est dans l'écran Le site : envoie-le à ton développeur." });
    }
    // 3) Source qui amène du monde inutile (pub mal ciblée, mauvaise page).
    (d.sources || []).forEach(function (s) {
      var n = num(s.sessions) || 0, u = num(s.useful) || 0;
      if (n >= 20 && u / n < 0.15) {
        out.push({ level: "important", screen: "provenance", weight: 400 + (n - u),
          title: sourceLabel(s.source) + " : " + fmtInt(n) + " visites, seulement " + fmtInt(u) + " utile" + (u > 1 ? "s" : ""),
          why: "Presque tous repartent sans rien regarder. Si c'est une pub, vérifie la cible et la page d'arrivée avant de remettre de l'argent." });
      }
    });
    // 4) Page d'arrivée qui fait fuir.
    var worst = null;
    (d.landing || []).forEach(function (l) {
      var n = num(l.sessions) || 0, one = num(l.one_page) || 0;
      if (n >= 20 && one / n >= 0.75 && (!worst || one > num(worst.one_page))) worst = l;
    });
    if (worst) {
      out.push({ level: "important", screen: "arrivee", weight: 350 + num(worst.one_page),
        title: "« " + landingName(worst.page, worst.site) + " » : " + fmtInt(worst.one_page) + " arrivées sur " + fmtInt(worst.sessions) + " repartent sans 2e page",
        why: "Le premier écran ne donne pas envie d'aller plus loin. Regarde-le sur un téléphone : comprend-on tout de suite quoi faire ?" });
    }
    // 5) Langue qui ne correspond pas au visiteur.
    var mis = num(t.lang_mismatch) || 0;
    if (mis >= 10 && mis / Math.max(1, sessions) >= 0.08) {
      out.push({ level: "important", screen: "arrivee", weight: 300 + mis,
        title: fmtInt(mis) + " visiteurs lisent le site dans une autre langue que la leur",
        why: "Leur téléphone est réglé dans une langue, ils tombent sur une autre version. Le détail par langue est dans l'écran Arrivée." });
    }
    // 6) Contenu qui ne s'affiche pas avant le départ.
    var known = num(t.content_known) || 0, before = num(t.before_content) || 0;
    if (known >= 10 && before / known >= 0.2) {
      out.push({ level: "important", screen: "site", weight: 280 + before,
        title: fmtInt(before) + " visiteurs partent avant que les matchs s'affichent",
        why: "La liste ou l'analyse met trop de temps à apparaître. Voir la vitesse d'affichage dans l'écran Le site." });
    }
    // 7) Vitesse sur téléphone.
    (d.vitals || []).forEach(function (v) {
      if (v.device === "mobile" && (num(v.n_lcp) || 0) >= 10 && num(v.lcp) > VITALS.lcp.poor) {
        out.push({ level: "important", screen: "site", weight: 260,
          title: "Sur téléphone, la page met " + msText(v.lcp) + " à s'afficher",
          why: "Au-delà de 4 s, beaucoup de visiteurs abandonnent. À montrer à ton développeur (images, scripts trop lourds)." });
      }
    });
    // 8) Inscription qui bloque.
    var page = num(su.page) || 0, done = num(su.completed) || 0;
    if (page >= 5 && done / page < 0.5) {
      out.push({ level: "important", screen: "parcours", weight: 200 + (page - done),
        title: "Inscription : " + fmtInt(page) + " ouvrent le formulaire, " + fmtInt(done) + " le terminent",
        why: "Regarde dans Parcours à quel moment ils abandonnent (avant de taper, ou après une erreur)." });
    }
    // 9) Offre vue, paiement jamais ouvert.
    var offer = num(pay.offer) || 0, click = num(pay.click) || 0;
    if (offer >= 5 && click === 0) {
      out.push({ level: "info", screen: "envie", weight: 150 + offer,
        title: fmtInt(offer) + " personnes ont vu l'offre Pro, aucune n'a ouvert le paiement",
        why: "L'offre ne convainc pas encore : ce que Pro apporte en plus du gratuit doit se voir en un coup d'œil." });
    }
    out.sort(function (a, b) { return b.weight - a.weight; });
    return out.slice(0, 3);
  }

  // ---------- Partenaires (admin_affiliates, 20/10/2026) ----------
  // Candidatures au programme d'affiliation : textes en français, liens
  // sûrs (http/https seulement), tri « À valider » d'abord, commissions.
  var PARTNER_STATUS = {
    pending: { label: "À valider", cls: "nudge", group: "À valider" },
    approved: { label: "Accepté", cls: "new", group: "Acceptés" },
    suspended: { label: "Suspendu", cls: "gone", group: "Suspendus" },
    refused: { label: "Refusé", cls: "gone", group: "Refusés" }
  };
  var PARTNER_ORDER = ["pending", "approved", "suspended", "refused"];
  var PARTNER_STYLES = { analysis: "Analyse", tips: "Pronostics", entertainment: "Divertissement", education: "Éducation", community: "Communauté", other: "Autre" };
  var PARTNER_LEGAL = { individual: "Particulier", professional: "Professionnel" };
  function partnerStatus(s) {
    return PARTNER_STATUS[s] || { label: "Statut inconnu", cls: "gone", group: "Autres" };
  }
  function partnerStyle(s) { return PARTNER_STYLES[s] || "Style non précisé"; }
  function partnerLegal(s) { return PARTNER_LEGAL[s] || "Statut non précisé"; }
  // Boutons proposés selon le statut actuel. confirm = demande avant d'agir.
  function partnerActions(status) {
    var A = { approved: "Accepter", refused: "Refuser", suspended: "Suspendre", pending: "Remettre à valider" };
    var to = status === "pending" ? ["approved", "refused"]
      : status === "approved" ? ["suspended"]
      : status === "suspended" || status === "refused" ? ["approved", "pending"]
      : ["pending"];
    return to.map(function (t) { return { to: t, label: A[t], confirm: t === "refused" || t === "suspended", primary: t === "approved" }; });
  }
  // Lien cliquable seulement pour une vraie adresse web (http ou https) ;
  // « tiktok.com/@x » devient https://tiktok.com/@x ; « @x » reste du texte.
  function partnerUrl(raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s || s.length > 500 || /\s/.test(s)) return null;
    if (!/^https?:\/\//i.test(s)) {
      if (!/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}([/?#]\S*)?$/i.test(s)) return null;
      s = "https://" + s;
    }
    try {
      var u = new URL(s);
      if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password) return null;
      return u.href;
    } catch (e) {
      return null;
    }
  }
  function partnerLinks(networks) {
    var list = networks;
    if (typeof list === "string") { try { list = JSON.parse(list); } catch (e) { list = [list]; } }
    if (list && typeof list === "object" && !Array.isArray(list)) {
      list = Object.keys(list).map(function (k) { var v = list[k]; return typeof v === "string" ? { network: k, url: v } : v; });
    }
    if (!Array.isArray(list)) list = list == null ? [] : [list];
    var out = [];
    list.forEach(function (it) {
      var raw = null, name = null;
      if (typeof it === "string" || typeof it === "number") raw = String(it);
      else if (it && typeof it === "object") {
        raw = it.url || it.link || it.href || it.handle || it.value || null;
        name = typeof (it.network || it.name || it.platform) === "string" ? (it.network || it.name || it.platform) : null;
      }
      raw = raw == null ? "" : String(raw).trim();
      if (!raw) return;
      var href = partnerUrl(raw);
      var text = href ? raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "") : raw;
      out.push({ text: (name ? name + " : " : "") + text, href: href });
    });
    return out.slice(0, 20);
  }
  function partnerRank(s) {
    var i = PARTNER_ORDER.indexOf(s);
    return i === -1 ? PARTNER_ORDER.length : i;
  }
  // « À valider » d'abord, puis acceptés, suspendus, refusés ; du plus récent au plus ancien.
  function partnerSort(list) {
    return (Array.isArray(list) ? list : []).filter(function (a) { return a && typeof a === "object"; }).sort(function (a, b) {
      return partnerRank(a.status) - partnerRank(b.status) || (msOf(b.created_at) || 0) - (msOf(a.created_at) || 0);
    });
  }
  function partnerCounts(list) {
    var c = { pending: 0, approved: 0, closed: 0, total: 0 };
    (Array.isArray(list) ? list : []).forEach(function (a) {
      if (!a) return;
      c.total += 1;
      if (a.status === "pending") c.pending += 1;
      else if (a.status === "approved") c.approved += 1;
      else if (a.status === "refused" || a.status === "suspended") c.closed += 1;
    });
    return c;
  }
  // Commissions en centimes, par devise : « 12,50 € » (+ « 3,00 $US » si autre devise).
  // open = en attente + à verser, c'est-à-dire ce qu'un refus ou une suspension annule.
  function partnerMoney(balances) {
    var b = balances && typeof balances === "object" && !Array.isArray(balances) ? balances : {};
    var cur = Object.keys(b).filter(function (c) { return /^[a-z]{3}$/i.test(c) && b[c] && typeof b[c] === "object"; })
      .sort(function (x, y) { return (x.toLowerCase() === "eur" ? 0 : 1) - (y.toLowerCase() === "eur" ? 0 : 1) || x.localeCompare(y); });
    var parts = { pending: [], payable: [], paid: [], open: [] };
    cur.forEach(function (c) {
      var v = b[c];
      ["pending", "payable", "paid"].forEach(function (k) { var n = num(v[k]); if (n) parts[k].push(fmtMoney(n, c)); });
      var o = (num(v.pending) || 0) + (num(v.payable) || 0);
      if (o > 0) parts.open.push(fmtMoney(o, c));
    });
    var zero = fmtMoney(0, "eur");
    return {
      pending: parts.pending.join(" + ") || zero, payable: parts.payable.join(" + ") || zero, paid: parts.paid.join(" + ") || zero,
      open: parts.open.join(" + ") || zero, hasOpen: parts.open.length > 0
    };
  }

  return {
    PARTNER_STATUS: PARTNER_STATUS, PARTNER_STYLES: PARTNER_STYLES, partnerStatus: partnerStatus, partnerStyle: partnerStyle, partnerLegal: partnerLegal,
    partnerActions: partnerActions, partnerUrl: partnerUrl, partnerLinks: partnerLinks, partnerSort: partnerSort, partnerCounts: partnerCounts, partnerMoney: partnerMoney,
    SCREENS: SCREENS, screenKey: screenKey, DIAG_FILE: DIAG_FILE, pctOf: pctOf, msText: msText, VITALS: VITALS, vitalVerdict: vitalVerdict,
    vitalValue: vitalValue, langName: langName, siteLangText: siteLangText, landingName: landingName, failReason: failReason, todoActions: todoActions,
    DROP_FILE: DROP_FILE, DROP_STEPS: DROP_STEPS, DROP_SOURCES: DROP_SOURCES, DROP_DEVICES: DROP_DEVICES,
    dropSteps: dropSteps, dropLeak: dropLeak, dropNotes: dropNotes, countryBasisText: countryBasisText,
    excludedText: excludedText, signupTimingText: signupTimingText, exitRows: exitRows,
    UNLOCK_PLACES: UNLOCK_PLACES, UNLOCK_FILE: UNLOCK_FILE, unlockRows: unlockRows,
    MEMBER_STATUS: MEMBER_STATUS, MEMBER_STATUS_ORDER: MEMBER_STATUS_ORDER, maskEmail: maskEmail, memberLastActivity: memberLastActivity,
    memberStatus: memberStatus, memberCounts: memberCounts, daysAgo: daysAgo, activityBar: activityBar, shortDay: shortDay,
    retentionCell: retentionCell, retentionRate: retentionRate, retentionSentence: retentionSentence, journeyDays: journeyDays, dayTitleOf: dayTitle,
    TZ: TZ, LAUNCH_AT: LAUNCH_AT, SITES: SITES, SOURCE_RULES: SOURCE_RULES, SOURCE_LABELS: SOURCE_LABELS, REASONS: REASONS,
    esc: esc, num: num, fmtInt: fmtInt, fmtPct: fmtPct, fmtDur: fmtDur, fmtMoney: fmtMoney, fmtDelta: fmtDelta,
    isCountry: isCountry, flagEmoji: flagEmoji, siteLabel: siteLabel, countryName: countryName, inCountry: inCountry, deviceLabel: deviceLabel,
    sourceGroup: sourceGroup, sourceLabel: sourceLabel,
    prettySlug: prettySlug, normalizePath: normalizePath, matchName: matchName, pageInfo: pageInfo, safeHref: safeHref,
    ymdOk: ymdOk, addDays: addDays, daysBetween: daysBetween, parisToday: parisToday, fmtYmd: fmtYmd, periodRange: periodRange, dailyRows: dailyRows,
    visitClock: visitClock, ago: ago, onSiteFor: onSiteFor,
    todaySentence: todaySentence, dailyAverage: dailyAverage, compareToday: compareToday,
    journeySteps: journeySteps, biggestLeak: biggestLeak,
    pipelineStatus: pipelineStatus, healthLights: healthLights,
    reasonLabel: reasonLabel, reasonHelp: reasonHelp, visitorKind: visitorKind, reasonBreakdown: reasonBreakdown,
    placeLabel: placeLabel, geoState: geoState, shareRows: shareRows,
    sessionSentence: sessionSentence, revenueText: revenueText, mrrText: mrrText, memberIntent: memberIntent
  };
});

(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined" || !document.getElementById("dash")) return;

  var H = window.IasharkAdminHelpers;
  var esc = H.esc;
  var SUPA_URL = "https://ksvjraqitxouwiabecai.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";
  var LIVE_EVERY_MS = 30000;
  var FULL_EVERY_MS = 5 * 60000;
  var RPC_TIMEOUT_MS = 25000;
  var PREFS_KEY = "iashark_admin_prefs_v3";
  var MIGRATION_FILE = "0019_admin_dashboard_v2.sql";
  var INTERNAL_KEY = "iashark_internal";
  var INTERNAL_CHOICE_KEY = "iashark_internal_choice";

  var sb = null;
  var S = {
    period: "today", custom: { from: null, to: null }, day: null, site: "", device: "", source: "",
    range: null, today: null, week: null, analytics: null, bizToday: null, business: null, bizError: null, stats: null,
    sessions: null, sessionsError: null, botSample: null, signups: null, health: null, healthError: false, live: null, liveError: null,
    home: undefined, names: {}, loading: false, liveLoading: false, liveTimer: null, fullTimer: null,
    openHelp: {}, openVisit: null, visitLimit: 20, signupLimit: 15, lastLiveCount: null,
    members: null, retention: null, membersLoading: false, showEmails: false, openMember: null, journeys: {}, memberLimit: 25,
    unlocks: null,
    drop: { country: "", device: "", source: "" }, dropRes: null, dropSeq: 0,
    screen: "aujourdhui", diag: null, diagSeq: 0,
    partners: null, partnersLoading: false, partnersAgain: false, partnerBusy: null
  };

  function $(id) { return document.getElementById(id); }

  // ---------- Preferences (seulement la periode, jamais les filtres) ----------
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (p && ["today", "yesterday", "7", "15", "30"].indexOf(p.period) !== -1) S.period = p.period;
    } catch (e) {}
  }
  function savePrefs() {
    try { if (S.period !== "custom" && S.period !== "day") localStorage.setItem(PREFS_KEY, JSON.stringify({ period: S.period })); } catch (e) {}
  }

  // ---------- Formats locaux ----------
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleString("fr-FR", { timeZone: H.TZ, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function fmtDay(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    var today = H.parisToday(new Date()), day = H.parisToday(d);
    if (day === today) return "Aujourd'hui";
    if (day === H.addDays(today, -1)) return "Hier";
    return d.toLocaleDateString("fr-FR", { timeZone: H.TZ, day: "numeric", month: "short" });
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleTimeString("fr-FR", { timeZone: H.TZ, hour: "2-digit", minute: "2-digit" });
  }
  function plural(n, one, many) { return (Number(n) || 0) > 1 ? many : one; }

  var ICONS = {
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    signup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
    money: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    pulse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    empty: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M7 16V9M12 16V5M17 16v-4"/></svg>'
  };

  // ---------- Etats ----------
  function showState(which, message) {
    ["stateLoading", "stateDenied", "stateError"].forEach(function (id) { $(id).hidden = true; });
    $("dash").hidden = which !== "dash";
    if (which === "loading") $("stateLoading").hidden = false;
    if (which === "denied") { stopTimers(); $("stateDenied").hidden = false; }
    if (which === "error") {
      stopTimers();
      $("stateError").hidden = false;
      if (message) $("stateErrorMsg").textContent = message;
    }
  }
  function emptyHtml(title, help) {
    return '<div class="empty"><div class="empty-icon" aria-hidden="true">' + ICONS.empty + "</div><b>" + esc(title) + "</b>" + (help ? "<p>" + esc(help) + "</p>" : "") + "</div>";
  }
  function errKind(err) {
    if (!err) return null;
    if (err.__timeout) return "timeout";
    var msg = [err.message, err.details, err.hint].join(" ");
    if (err.code === "42501" || /access_denied/i.test(msg)) return "denied";
    if (err.code === "PGRST301" || err.code === "PGRST303" || /JWT expired|invalid JWT/i.test(msg)) return "denied";
    if (err.code === "PGRST202" || err.code === "42883" || /Could not find the function|function .* does not exist/i.test(msg)) return "missing";
    if (err.code === "22023") return "invalid";
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return "network";
    return "error";
  }
  function errorText(kind, err, what) {
    if (kind === "missing") return "« " + what + " » n'est pas disponible : la mise à jour de la base " + MIGRATION_FILE + " n'est pas appliquée. Préviens ton développeur.";
    if (kind === "network") return "Pas de connexion au serveur pour « " + what + " ». Vérifie ta connexion Internet, puis touche Réessayer.";
    if (kind === "timeout") return "Le serveur met trop de temps à répondre pour « " + what + " ». Réessaie dans une minute.";
    var code = err && err.code ? " (code " + err.code + ")" : "";
    return "« " + what + " » n'a pas pu se charger" + code + ". Touche Réessayer ; si ça continue, envoie ce message à ton développeur.";
  }
  function blockError(el, r, what) {
    if (!el) return;
    el.innerHTML = '<div class="block-error" role="alert"><p>' + esc(errorText(r && r.kind, r && r.error, what)) + "</p>"
      + (r && r.kind === "missing" ? "" : '<button type="button" class="btn btn-sm btn-ghost" data-retry="1">Réessayer</button>') + "</div>";
  }
  var toastTimer = null;
  function toast(text) {
    var t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 5200);
  }

  // ---------- RPC ----------
  function rpc(name, args) {
    if (!sb) return Promise.resolve({ error: { message: "client absent" }, kind: "error" });
    var call;
    try { call = args ? sb.rpc(name, args) : sb.rpc(name); } catch (e) { return Promise.resolve({ error: e, kind: errKind(e) || "error" }); }
    var timer;
    var timeout = new Promise(function (resolve) {
      timer = setTimeout(function () { resolve({ error: { __timeout: true, message: "timeout" } }); }, RPC_TIMEOUT_MS);
    });
    return Promise.race([Promise.resolve(call), timeout]).then(function (r) {
      clearTimeout(timer);
      if (r && r.error) return { error: r.error, kind: errKind(r.error) };
      return { data: r ? r.data : null };
    }, function (e) {
      clearTimeout(timer);
      return { error: e, kind: errKind(e) || "network" };
    });
  }
  function filterArgs() {
    return { p_site: S.site || null, p_device: S.device || null, p_source: S.source || null };
  }
  function merge(a, b) {
    var o = {};
    [a, b].forEach(function (x) { Object.keys(x || {}).forEach(function (k) { o[k] = x[k]; }); });
    return o;
  }
  function analyticsArgs(from, to) {
    return merge({ p_days: H.daysBetween(from, to) + 1, p_include_internal: false, p_from: from, p_to: to, p_since: H.LAUNCH_AT }, filterArgs());
  }
  function hasFilters() { return !!(S.site || S.device || S.source || S.period === "custom"); }

  // ---------- Noms des matchs ----------
  var NAMES_CACHE = "iashark_admin_match_names_v1";
  function loadNamesCache() {
    try {
      var c = JSON.parse(localStorage.getItem(NAMES_CACHE) || "null");
      if (c && typeof c === "object") {
        Object.keys(c).forEach(function (id) {
          var n = c[id];
          if (/^\d{1,12}$/.test(id) && n && typeof n.home === "string" && typeof n.away === "string") {
            S.names[id] = { home: n.home.slice(0, 60), away: n.away.slice(0, 60), league: typeof n.league === "string" ? n.league.slice(0, 60) : "" };
          }
        });
      }
    } catch (e) {}
  }
  function saveNamesCache() {
    try {
      var ids = Object.keys(S.names).slice(-400), out = {};
      ids.forEach(function (id) { out[id] = S.names[id]; });
      localStorage.setItem(NAMES_CACHE, JSON.stringify(out));
    } catch (e) {}
  }
  function addMatch(m) {
    if (!m || m.id == null || !m.home || !m.away) return false;
    var home = typeof m.home === "object" ? m.home.n : m.home;
    var away = typeof m.away === "object" ? m.away.n : m.away;
    if (typeof home !== "string" || typeof away !== "string") return false;
    S.names[String(m.id)] = { home: home.slice(0, 60), away: away.slice(0, 60), league: typeof m.league === "string" ? m.league.slice(0, 60) : "" };
    return true;
  }
  function fetchJson(url) {
    return fetch(url, { credentials: "omit", cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  var homeLoaded = null;
  function loadHome() {
    if (!homeLoaded) {
      homeLoaded = fetchJson("/data-home.json").then(function (d) {
        S.home = d && typeof d === "object"
          ? { ok: true, generated_at: typeof d.generated_at === "string" ? d.generated_at : null, matches: Array.isArray(d.matchs) ? d.matchs.length : null }
          : { ok: false };
        ((d && d.matchs) || []).forEach(addMatch);
        saveNamesCache();
        renderHealth();
      });
    }
    return homeLoaded;
  }
  var tried = {};
  // Matchs absents de data-home.json : fiche /match/<id>.json, 12 au plus
  // par chargement, noms mis en cache local.
  function loadMissingNames(ids) {
    var missing = ids.filter(function (id) { return /^\d{1,12}$/.test(id) && !S.names[id] && !tried[id]; }).slice(0, 12);
    if (!missing.length) return Promise.resolve(false);
    missing.forEach(function (id) { tried[id] = true; });
    var i = 0, changed = false;
    function worker() {
      if (i >= missing.length) return Promise.resolve();
      var id = missing[i++];
      return fetchJson("/match/" + id + ".json").then(function (m) { if (m && String(m.id) === id && addMatch(m)) changed = true; }).then(worker);
    }
    return Promise.all([worker(), worker(), worker()]).then(function () { if (changed) saveNamesCache(); return changed; });
  }
  function neededMatchIds() {
    var ids = {};
    var a = S.analytics;
    if (a) {
      (a.top_matches || []).slice(0, 10).forEach(function (r) { ids[r.match_id] = 1; });
      (a.top_pages || []).slice(0, 10).forEach(function (r) { if (r.match_id) ids[r.match_id] = 1; });
    }
    ((S.live && S.live.visitors) || []).forEach(function (v) { if (v.match_id) ids[v.match_id] = 1; });
    return Object.keys(ids).filter(function (id) { return id && id !== "null"; });
  }
  function refreshNames() {
    loadHome().then(function () {
      rerenderNamed();
      return loadMissingNames(neededMatchIds());
    }).then(function (changed) { if (changed) rerenderNamed(); });
  }
  function rerenderNamed() {
    if (S.analytics) { renderPages(); renderMatches(); }
    if (S.sessions) renderVisits();
    if (S.live) renderLive();
    if (S.dropRes && S.dropRes.data) renderDrop();
  }

  // ---------- Petits blocs HTML ----------
  function infoButton(id, label) {
    var open = !!S.openHelp[id];
    return '<button type="button" class="info" aria-expanded="' + open + '" aria-controls="' + id + '" aria-label="Aide : ' + esc(label) + '">i</button>';
  }
  function helpPara(id, text) {
    return '<p class="help" id="' + id + '"' + (S.openHelp[id] ? "" : " hidden") + ">" + esc(text) + "</p>";
  }
  function barsHtml(rows, opts) {
    opts = opts || {};
    var max = rows.reduce(function (m, r) { return Math.max(m, r.value); }, 0);
    return '<ul class="bars">' + rows.map(function (r) {
      var w = max ? Math.max(1.5, (r.value / max) * 100) : 0;
      return '<li class="bar-row"><span class="bar-name"' + (r.title ? ' title="' + esc(r.title) + '"' : "") + ">" + r.nameHtml + '</span><span class="bar-val tnum">' + esc(H.fmtInt(r.value)) + (r.extra ? "<small>" + esc(r.extra) + "</small>" : "")
        + '</span><span class="bar-track" aria-hidden="true"><i class="' + (r.cls || opts.cls || "") + '" style="width:' + w.toFixed(1) + '%"></i></span></li>';
    }).join("") + "</ul>";
  }
  function deltaHtml(cur, prev, complete, caption) {
    var d = H.fmtDelta(cur, prev, { previousComplete: complete });
    if (d.dir === "none") return '<span class="delta none">' + (complete === false ? "pas encore de comparaison" : "—") + "</span>";
    var cls = d.dir === "flat" ? "flat" : d.dir === "new" ? "new" : d.good ? "good" : "bad";
    var arrow = d.dir === "up" ? "▲ " : d.dir === "down" ? "▼ " : "";
    var sr = d.dir === "up" ? "en hausse" : d.dir === "down" ? "en baisse" : d.dir === "new" ? "nouveau" : "stable";
    return '<span class="delta ' + cls + '"><span aria-hidden="true">' + arrow + "</span>" + esc(d.text) + '<span class="sr-only"> (' + sr + ")</span></span>"
      + '<span class="delta-cap">' + esc(caption) + "</span>";
  }

  // ---------- 1. Aujourd'hui en une phrase ----------
  function renderHero() {
    var a = S.today, w = S.week, b = S.bizToday;
    if (!a) {
      $("heroText").textContent = "Les chiffres d'aujourd'hui ne sont pas disponibles pour le moment.";
      $("heroCompare").innerHTML = "";
      return;
    }
    var k = a.kpis || {};
    var signups = b ? b.accounts_created : k.signups;
    var newPro = b && b.subscriptions ? b.subscriptions.new_in_period : null;
    $("heroText").textContent = H.todaySentence({ visitors: k.visitors, signups: signups, newPro: newPro });
    var lines = H.compareToday({
      today: k.visitors,
      yesterday: a.previous ? a.previous.visitors : null,
      yesterdayComplete: !(a.range && a.range.previous_complete === false),
      average: w ? H.dailyAverage(w.series) : null
    });
    var SR = { up: "en hausse : ", down: "en baisse : ", flat: "stable : ", none: "" };
    $("heroCompare").innerHTML = lines.map(function (l) {
      var arrow = l.dir === "up" ? "▲" : l.dir === "down" ? "▼" : l.dir === "flat" ? "=" : "·";
      return '<li class="cmp ' + l.dir + '"><span class="cmp-arrow" aria-hidden="true">' + arrow + '</span><span><span class="sr-only">' + SR[l.dir] + "</span>" + esc(l.text) + "</span></li>";
    }).join("");
  }

  // ---------- 2. Grandes cartes ----------
  function liveHumans() {
    if (!S.live) return null;
    return (S.live.visitors || []).filter(function (v) { return H.visitorKind(v).human; }).length;
  }
  function renderCards() {
    var el = $("cards");
    var a = S.analytics, b = S.business;
    if (!a && !b) {
      blockError(el, S.analyticsError || { kind: "error" }, "L'essentiel");
      return;
    }
    $("periodLabel").textContent = S.range.label;
    var k = (a && a.kpis) || {}, p = (a && a.previous) || {};
    var complete = !(a && a.range && a.range.previous_complete === false);
    var subs = (b && b.subscriptions) || {};
    var cards = [];

    var v = H.num(k.visitors);
    cards.push({
      id: "visitors", label: "Visiteurs", icon: ICONS.users, value: H.fmtInt(v),
      delta: a ? deltaHtml(k.visitors, p.visitors, complete, S.range.compare) : "",
      mean: v === null ? "Chiffre indisponible pour le moment." : v === 0 ? "Personne n'est encore venu sur cette période." : H.fmtInt(v) + " " + plural(v, "personne a", "personnes différentes ont") + " ouvert au moins une page du site.",
      help: "Une personne = un onglet de navigateur ouvert sur le site. Sans cookie : quelqu'un qui revient un autre jour compte à nouveau. Robots, tests et ton appareil ne sont jamais comptés."
    });

    var signups = b ? H.num(b.accounts_created) : H.num(k.signups);
    var ratio = signups > 0 && v > 0 ? Math.max(1, Math.round(v / signups)) : null;
    cards.push({
      id: "signups", label: "Inscriptions", icon: ICONS.signup, cls: "violet", value: H.fmtInt(signups),
      delta: b ? deltaHtml(b.accounts_created, b.accounts_created_prev, complete, S.range.compare) : "",
      mean: signups === null ? "Chiffre indisponible pour le moment." : signups === 0 ? "Aucun compte créé sur cette période." : H.fmtInt(signups) + " " + plural(signups, "compte créé", "comptes créés") + (ratio ? ", soit environ 1 visiteur sur " + H.fmtInt(ratio) + "." : "."),
      help: "Comptes créés sur le site pendant la période. Les comptes administrateur et de test ne sont pas comptés."
    });

    var active = b ? H.num(subs.active) : S.stats ? H.num(S.stats.pro_users) : null;
    var newPro = b ? H.num(subs.new_in_period) : null;
    var proMean = active === null ? "Chiffre indisponible pour le moment."
      : active === 0 ? "Personne ne paie l'abonnement Pro pour l'instant."
      : H.fmtInt(active) + " " + plural(active, "personne paie", "personnes paient") + " l'abonnement Pro en ce moment.";
    if (newPro > 0) proMean += " Dont " + H.fmtInt(newPro) + " " + plural(newPro, "nouveau", "nouveaux") + " sur la période.";
    if (b && Number(subs.past_due) > 0) proMean += " Attention : " + H.fmtInt(subs.past_due) + " paiement" + (Number(subs.past_due) > 1 ? "s" : "") + " en échec.";
    cards.push({
      id: "pro", label: "Abonnés Pro actifs", icon: ICONS.star, cls: "amber", value: H.fmtInt(active), delta: '<span class="delta-cap">aujourd\'hui, toutes dates confondues</span>',
      mean: proMean,
      help: "Nombre d'abonnements Pro payants en cours aujourd'hui (Stripe). Ce chiffre ne dépend pas de la période choisie. Comptes de test exclus."
    });

    var firstCount = b ? (b.first_payments || []).reduce(function (n, r) { return n + (Number(r.payments) || 0); }, 0) : 0;
    var renewCount = b ? (b.renewals || []).reduce(function (n, r) { return n + (Number(r.payments) || 0); }, 0) : 0;
    var money = b ? H.revenueText(b) : "—";
    cards.push({
      id: "money", label: "Argent encaissé", icon: ICONS.money, cls: "green", value: money, long: money.length > 10,
      delta: "",
      mean: !b ? "Chiffre indisponible pour le moment." : firstCount + renewCount === 0 ? "Aucun paiement reçu sur cette période."
        : H.fmtInt(firstCount) + " premier" + (firstCount > 1 ? "s" : "") + " paiement" + (firstCount > 1 ? "s" : "") + " et " + H.fmtInt(renewCount) + " renouvellement" + (renewCount > 1 ? "s" : "") + " sur la période.",
      help: "Montants réellement reçus par Stripe sur la période (TTC, avant les frais Stripe) : premiers paiements et renouvellements mensuels."
    });

    // MRR (Stripe en direct via la fonction admin-revenue, chargee apres le
    // premier rendu : la carte affiche « — » puis se remplit d'elle-meme).
    var rev = S.revenue;
    var failed30 = rev ? H.num(rev.last30d && rev.last30d.failed) || 0 : null;
    var cancelPending = rev ? H.num(rev.counts && rev.counts.cancel_at_period_end) || 0 : null;
    var mrrMean = !rev ? "Chiffre indisponible pour le moment."
      : "Ce que rapportent les abonnements en cours chaque mois si rien ne change.";
    if (rev && failed30 > 0) mrrMean += " Attention : " + H.fmtInt(failed30) + " paiement" + (failed30 > 1 ? "s" : "") + " en échec sur 30 jours.";
    if (rev && cancelPending > 0) mrrMean += " " + H.fmtInt(cancelPending) + " résiliation" + (cancelPending > 1 ? "s" : "") + " programmée" + (cancelPending > 1 ? "s" : "") + ".";
    var mrr = rev ? H.mrrText(rev) : "—";
    cards.push({
      id: "mrr", label: "Revenu mensuel (MRR)", icon: ICONS.money, cls: "violet", value: mrr, long: mrr.length > 10,
      delta: '<span class="delta-cap">abonnements en cours, Stripe</span>',
      mean: mrrMean,
      help: "Revenu mensuel récurrent : la somme des abonnements en cours ramenée au mois (hebdo × 52/12, annuel ÷ 12), lue en direct dans Stripe. Les abonnements dont la résiliation est programmée ne sont pas comptés."
    });

    var now = liveHumans();
    cards.push({
      id: "now", label: "En ce moment", icon: ICONS.pulse, cls: "green wide", value: H.fmtInt(now), delta: '<span class="delta-cap">mis à jour toutes les 30 s</span>',
      mean: now === null ? "Vérification en cours…" : now === 0 ? "Personne sur le site à cet instant." : H.fmtInt(now) + " " + plural(now, "personne navigue", "personnes naviguent") + " sur le site en ce moment.",
      help: "Personnes qui ont fait quelque chose sur le site dans les 5 dernières minutes (robots et tests non comptés).",
      link: '<a class="kcard-link" href="#maintenant">Voir qui est là</a>'
    });

    el.innerHTML = cards.map(function (c) {
      var hid = "help-card-" + c.id;
      return '<article class="kcard ' + (c.cls || "") + '" aria-labelledby="lbl-' + c.id + '">'
        + '<div class="kcard-top"><span class="kcard-icon" aria-hidden="true">' + c.icon + '</span><h3 class="kcard-label" id="lbl-' + c.id + '">' + esc(c.label) + "</h3>" + infoButton(hid, c.label) + "</div>"
        + '<div class="kcard-value tnum' + (c.long ? " long" : "") + '">' + esc(c.value) + "</div>"
        + '<div class="kcard-delta">' + c.delta + "</div>"
        + helpPara(hid, c.help)
        + '<p class="kcard-mean"><span class="micro">Ce que ça veut dire</span>' + esc(c.mean) + "</p>"
        + (c.link || "") + "</article>";
    }).join("");
  }

  // ---------- 3. Sante du site ----------
  function renderHealth() {
    var el = $("health");
    if (!el) return;
    var active = S.business && S.business.subscriptions ? S.business.subscriptions.active : S.stats ? S.stats.pro_users : null;
    var r = H.healthLights({ home: S.home, health: S.health, healthError: S.healthError, activePro: active });
    var on = { red: "red", amber: "amber", green: "green", unknown: "amber" }[r.level];
    var lampName = { red: "rouge", amber: "orange", green: "vert", unknown: "orange" }[r.level];
    el.innerHTML = '<div class="light ' + r.level + '"><div class="lamps" role="img" aria-label="Feu ' + lampName + '">'
      + ["red", "amber", "green"].map(function (c) { return '<span class="lamp ' + c + (c === on ? " on" : "") + '"></span>'; }).join("")
      + '</div><p class="light-text"><b>' + esc(r.title) + "</b>" + esc(r.sentence) + "</p></div>"
      + '<ul class="checks">' + r.checks.map(function (c) {
        var word = { ok: "OK", warn: "à surveiller", bad: "problème", unknown: "non vérifié" }[c.level];
        return '<li class="check ' + c.level + '"><span class="check-dot" aria-hidden="true"></span><div><b>' + esc(c.title) + '</b><span class="sr-only"> : ' + word + "</span><p>" + esc(c.text) + "</p></div></li>";
      }).join("") + "</ul>";
  }

  // ---------- 4. Du visiteur au client ----------
  function renderFunnel() {
    var el = $("funnel"), a = S.analytics;
    if (!a) { blockError(el, S.analyticsError, "Du visiteur au client"); return; }
    var steps = H.journeySteps(a.funnel);
    if (!steps[0].value) {
      el.innerHTML = emptyHtml("Aucun visiteur sur cette période", "Le parcours s'affichera dès les premières visites.");
      return;
    }
    var leak = H.biggestLeak(steps);
    var html = '<ol class="steps">';
    steps.forEach(function (s, i) {
      if (i > 0) {
        var isLeak = leak && leak.index === i;
        var gap = s.pctOfPrev === null ? "" : H.fmtPct(Math.min(s.pctOfPrev, 999), 0) + " des personnes de l'étape précédente";
        if (gap || isLeak) html += '<li class="step-gap' + (isLeak ? " leak" : "") + '">' + (gap ? "↓ " + esc(gap) : "") + (isLeak ? " · plus grosse perte" : "") + "</li>";
      }
      var w = s.pctOfFirst === null ? 0 : Math.max(0, Math.min(100, s.pctOfFirst));
      html += '<li class="step"><span class="step-name">' + esc(s.label) + "<small>" + esc(s.help) + '</small></span><span class="step-num"><b class="tnum">' + esc(H.fmtInt(s.value)) + '</b><span class="tnum">' + esc(i === 0 ? "100 %" : H.fmtPct(s.pctOfFirst, s.pctOfFirst < 10 ? 1 : 0)) + "</span></span>"
        + '<span class="step-bar" aria-hidden="true"><i style="width:' + w.toFixed(2) + '%"></i></span></li>';
    });
    html += "</ol>";
    html += leak ? '<p class="leak-box">' + esc(leak.sentence) + "</p>" : '<p class="note">Personne n\'est perdu entre les étapes sur cette période.</p>';
    el.innerHTML = html;
  }

  // ---------- 5. Sources, pays, villes ----------
  function renderSources() {
    var el = $("sources"), a = S.analytics;
    if (!a) { blockError(el, S.analyticsError, "D'où viennent les gens"); return; }
    var sr = H.shareRows(a.sources, "source_group", 8);
    if (!sr.total) { el.innerHTML = emptyHtml("Pas encore de visiteurs sur cette période", "Les sources apparaîtront dès les premières visites."); return; }
    el.innerHTML = barsHtml(sr.rows.map(function (r) {
      var name = r.key === "__other" ? "Autres sources" : H.sourceLabel(r.key);
      var ex = r.row && r.row.examples && r.row.examples.length ? r.row.examples.join(", ") : "";
      return { nameHtml: esc(name), title: ex, value: r.visitors, extra: H.fmtPct(r.pct, 0) };
    }));
  }
  function renderPlaces() {
    var a = S.analytics;
    if (!a) { blockError($("countries"), S.analyticsError, "Pays"); $("cities").innerHTML = ""; return; }
    var cr = H.shareRows(a.countries, "country", 8);
    $("countries").innerHTML = cr.total ? barsHtml(cr.rows.map(function (r) {
      var name = r.key === "__other" ? "Autres pays" : H.isCountry(r.key) ? H.flagEmoji(r.key) + " " + H.countryName(r.key) : "Pays inconnu";
      return { nameHtml: esc(name), value: r.visitors, extra: H.fmtPct(r.pct, 0) };
    })) : emptyHtml("Aucun pays pour l'instant", "Ils apparaîtront dès les premières visites.");

    var g = H.geoState(a);
    var el = $("cities");
    if (!g.available) {
      el.innerHTML = '<p class="soft-msg"><b>Villes disponibles après activation</b>Pour l\'instant, seul le pays est connu. Les villes apparaîtront ici quand ton développeur aura activé la mise à jour prévue (0022).</p>';
      return;
    }
    if (!g.cities.length) {
      el.innerHTML = '<p class="soft-msg"><b>Aucune ville connue pour l\'instant</b>Les villes s\'affichent pour les nouvelles visites, au fur et à mesure.</p>';
      return;
    }
    el.innerHTML = barsHtml(g.cities.slice(0, 10).map(function (c) {
      return { nameHtml: esc(c.city) + "<small>" + esc(H.isCountry(c.country) ? H.countryName(c.country) : "") + "</small>", title: [c.city, c.region, H.isCountry(c.country) ? H.countryName(c.country) : ""].filter(Boolean).join(", "), value: Number(c.visitors) || 0, cls: "alt" };
    })) + (g.withCity !== null && g.visitors ? '<p class="note">Ville connue pour ' + esc(H.fmtInt(g.withCity)) + " visiteur" + (g.withCity > 1 ? "s" : "") + " sur " + esc(H.fmtInt(g.visitors)) + ".</p>" : "");
  }

  // ---------- 6. Qui est la maintenant ----------
  function renderLive() {
    var el = $("live");
    if (!S.live) {
      if (S.liveError) blockError(el, S.liveError, "Qui est là maintenant");
      return;
    }
    var list = (S.live.visitors || []).slice().sort(function (x, y) {
      var hx = H.visitorKind(x).human, hy = H.visitorKind(y).human;
      if (hx !== hy) return hx ? -1 : 1;
      return new Date(y.last_at) - new Date(x.last_at);
    });
    var humans = list.filter(function (v) { return H.visitorKind(v).human; }).length;
    var robots = list.length - humans;
    $("liveChip").hidden = false;
    $("liveChipText").textContent = H.fmtInt(humans) + " en ligne";
    $("liveChipDot").classList.toggle("off", !humans);
    $("liveDot").classList.toggle("off", !humans);
    if (S.lastLiveCount !== humans) {
      $("liveAnnounce").textContent = H.fmtInt(humans) + " personne" + (humans > 1 ? "s" : "") + " sur le site en ce moment";
      S.lastLiveCount = humans;
    }
    if (!list.length) {
      el.innerHTML = emptyHtml("Personne sur le site en ce moment", "C'est normal la nuit ou entre deux publications. La liste se met à jour toute seule toutes les 30 secondes.");
      return;
    }
    var now = Date.now();
    el.innerHTML = '<ul class="lrows">' + list.slice(0, 15).map(function (v) {
      var kind = H.visitorKind(v);
      var info = H.pageInfo(v.page, v.match_id, S.names);
      var clock = H.visitClock(new Date(now).toISOString(), v.tz);
      var meta = [
        "<span>" + esc(H.placeLabel(v)) + "</span>",
        "<span>" + esc(H.deviceLabel(v.device)) + "</span>",
        "<span>" + esc(v.source_group === "direct" ? "venu en direct" : v.source_group ? "via " + H.sourceLabel(v.source_group) : "source inconnue") + "</span>"
      ];
      var since = H.onSiteFor(v.first_at, now);
      if (since) meta.push("<span>" + esc(since) + "</span>");
      if (clock.local && clock.local !== clock.paris) meta.push("<span>il est " + esc(clock.local) + " chez cette personne</span>");
      if (v.tab_hidden) meta.push("<span>onglet en arrière-plan</span>");
      return '<li class="lrow' + (kind.human ? "" : " robot") + '"><span class="lflag" aria-hidden="true">' + (H.isCountry(v.country) ? H.flagEmoji(v.country) : "🌐") + "</span>"
        + '<div style="min-width:0"><div class="lpage" title="' + esc(info.title) + '">' + esc(info.name) + '</div><div class="lmeta">' + meta.join("") + "</div></div>"
        + '<span class="badge ' + (kind.human ? "human" : "robot") + '" title="' + esc(kind.why) + '">' + esc(kind.label) + '<span class="sr-only"> : ' + esc(kind.why) + "</span></span></li>";
    }).join("") + "</ul>"
      + '<p class="live-foot">' + esc(H.fmtInt(humans) + " humain" + (humans > 1 ? "s" : "") + (robots ? " · " + H.fmtInt(robots) + " robot" + (robots > 1 ? "s" : "") + " ou test" + (robots > 1 ? "s" : "") + " (non compté" + (robots > 1 ? "s" : "") + ")" : "") + (list.length > 15 ? " · 15 premières lignes affichées" : "")) + "</p>";
  }

  // ---------- 7. Pages et matchs ----------
  function renderPages() {
    var el = $("pages"), a = S.analytics;
    if (!a) { blockError(el, S.analyticsError, "Pages les plus vues"); return; }
    var rows = (a.top_pages || []).filter(function (r) { return Number(r.views) > 0; }).slice(0, 8);
    if (!rows.length) { el.innerHTML = emptyHtml("Aucune page vue sur cette période", "Les pages apparaîtront dès les premières visites."); return; }
    el.innerHTML = barsHtml(rows.map(function (r) {
      var info = H.pageInfo(r.page, r.match_id, S.names);
      var href = H.safeHref(r.page, r.match_id);
      var tag = info.site && H.SITES[info.site] ? H.SITES[info.site].short : "";
      var name = href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(info.name) + "</a>" : esc(info.name);
      return { nameHtml: name + (tag ? "<small>" + esc(tag) + "</small>" : ""), title: info.title, value: Number(r.views) || 0, extra: "vue" + (Number(r.views) > 1 ? "s" : "") };
    }));
  }
  // « Jour par jour » (periodes de plusieurs jours) : visiteurs et pages vues
  // de chaque jour, un clic ouvre tous les chiffres de ce jour.
  function renderDaily() {
    var sec = $("dailySection"), el = $("daily"), r = S.range;
    var multi = !!(r && r.days > 1);
    sec.hidden = !multi;
    if (!multi) return;
    var a = S.analytics;
    if (!a) { blockError(el, S.analyticsError, "Jour par jour"); return; }
    var rows = H.dailyRows(a.series, r, H.parisToday(new Date()));
    if (!rows.length) { el.innerHTML = emptyHtml("Pas de détail jour par jour pour cette période", "Il apparaîtra dès les premières visites."); return; }
    el.innerHTML = barsHtml(rows.map(function (d) {
      return {
        nameHtml: '<button type="button" class="day-link" data-day="' + esc(d.day) + '">' + esc(d.title) + "</button>" + (d.partial ? "<small>en cours</small>" : ""),
        title: d.title, value: d.visitors,
        extra: plural(d.visitors, "visiteur", "visiteurs") + " · " + H.fmtInt(d.pageViews) + " " + plural(d.pageViews, "page vue", "pages vues")
      };
    }));
  }
  function openDay(day) {
    var today = H.parisToday(new Date());
    if (!H.ymdOk(day) || day > today) return;
    S.day = day;
    S.period = day === today ? "today" : day === H.addDays(today, -1) ? "yesterday" : "day";
    savePrefs();
    loadAll({ silent: true });
  }
  function renderMatches() {
    var el = $("matches"), a = S.analytics;
    if (!a) { blockError(el, S.analyticsError, "Matchs les plus regardés"); return; }
    var rows = (a.top_matches || []).filter(function (r) { return Number(r.views) > 0; }).slice(0, 8);
    if (!rows.length) { el.innerHTML = emptyHtml("Aucun match regardé sur cette période", "Les matchs apparaîtront dès qu'un visiteur ouvrira une analyse."); return; }
    el.innerHTML = barsHtml(rows.map(function (r) {
      var id = /^\d{1,12}$/.test(String(r.match_id)) ? String(r.match_id) : null;
      var nm = id ? H.matchName(id, S.names) : null;
      var n = id ? S.names[id] : null;
      var label = nm || "Match n° " + (id || "?");
      var name = id ? '<a href="/match/' + id + '.html" target="_blank" rel="noopener noreferrer">' + esc(label) + "</a>" : esc(label);
      return { nameHtml: name + (n && n.league ? "<small>" + esc(n.league) + "</small>" : ""), title: label, value: Number(r.views) || 0, extra: H.fmtInt(r.visitors) + " pers.", cls: "warm" };
    }));
  }

  // ---------- 8. Robots et tests filtres ----------
  function renderBots() {
    var el = $("bots"), a = S.analytics;
    if (!a) { blockError(el, S.analyticsError, "Robots et tests filtrés"); return; }
    var br = H.reasonBreakdown(a, S.botSample);
    var total = br.total || 0;
    var humans = H.num(a.kpis && a.kpis.visitors) || 0;
    if (!total) {
      el.innerHTML = '<div class="bots-big"><b class="tnum">0</b><span>visite retirée</span></div><p class="bots-text">'
        + esc(humans > 0
          ? "Aucun robot ni test repéré sur cette période : " + (humans > 1 ? "les " + H.fmtInt(humans) + " visiteurs affichés sont de vrais humains." : "le visiteur affiché est un vrai humain.")
          : "Aucun robot ni test repéré sur cette période.") + "</p>";
      return;
    }
    var html = '<div class="bots-big"><b class="tnum">' + esc(H.fmtInt(total)) + "</b><span>visite" + (total > 1 ? "s" : "") + " retirée" + (total > 1 ? "s" : "") + " des chiffres</span></div>"
      + '<p class="bots-text">' + esc("Elles ne sont comptées nulle part. Les " + H.fmtInt(humans) + " visiteur" + (humans > 1 ? "s" : "") + " affiché" + (humans > 1 ? "s" : "") + " sur cette page sont de vrais humains.") + "</p>";
    if (br.rows.length) {
      html += barsHtml(br.rows.map(function (r) {
        return { nameHtml: esc(r.label) + '<span class="reason-help">' + esc(r.help) + "</span>", value: r.visitors, cls: "alt" };
      }));
      if (br.source === "sample") html += '<p class="note">' + esc("Pourquoi : estimation faite sur les " + H.fmtInt(br.sampled) + " dernières visites retirées. Le détail exact sera disponible après la mise à jour prévue (0022).") + "</p>";
    } else if (br.source !== "period") {
      html += '<p class="note">Le détail des raisons n\'a pas pu être calculé pour le moment.</p>';
    }
    el.innerHTML = html;
  }
  function deviceExcluded() {
    try { return localStorage.getItem(INTERNAL_KEY) === "1"; } catch (e) { return false; }
  }
  function renderDevice() {
    var on = deviceExcluded();
    $("deviceState").innerHTML = on
      ? '<span class="badge ok">Exclu</span> Cet appareil est exclu : tes visites depuis ce navigateur ne sont pas comptées.'
      : '<span class="badge warn">Compté</span> Cet appareil est compté comme un visiteur normal.';
    $("deviceBtn").textContent = on ? "Compter à nouveau cet appareil" : "Exclure cet appareil";
    $("deviceBtn").className = on ? "btn btn-ghost" : "btn";
  }
  function toggleDevice() {
    var on = !deviceExcluded();
    try {
      if (on) { localStorage.setItem(INTERNAL_KEY, "1"); localStorage.setItem(INTERNAL_CHOICE_KEY, "on"); }
      else { localStorage.removeItem(INTERNAL_KEY); localStorage.setItem(INTERNAL_CHOICE_KEY, "off"); }
    } catch (e) {
      toast("Impossible d'enregistrer ce réglage : ce navigateur bloque le stockage local.");
      return;
    }
    renderDevice();
    toast(on ? "C'est fait : cet appareil n'est plus compté dans les chiffres." : "Cet appareil est de nouveau compté dans les chiffres.");
  }

  // ---------- 9. Details : visites ----------
  var EVENT_LABELS = {
    signup_started: "A ouvert l'inscription", signup_completed: "Inscription terminée", login_completed: "Connexion",
    landing_view: "A vu l'offre Pro", paywall_view: "A vu un contenu réservé Pro", tool_page_view: "A vu les outils",
    checkout_started: "Paiement commencé", checkout_unavailable: "Paiement indisponible",
    checkout_success_view: "Paiement réussi", checkout_cancel_view: "Paiement annulé", onboarding_dismissed: "A fermé l'accueil",
    gate_view: "A vu le panneau « Débloquer »"
  };
  // Boutons « Debloquer » de la page match. admin_recent_sessions (0022) coupe
  // kind a 20 caracteres : « match_analysis_unloc » est la meme valeur.
  var CLICK_KINDS = { inscription: "inscription", connexion: "connexion", abonnement: "abonnement", pro: "offre Pro", compte: "compte", landing: "offre", match: "match", checkout: "paiement", lang_switch: "changement de langue", cta: "bouton",
    match_gate_unlock: "Débloquer (panneau d'analyse)", match_avis_unlock: "Débloquer (avis)", match_recall_unlock: "Débloquer (rappel)", match_analysis_unlock: "Débloquer (analyse)", match_analysis_unloc: "Débloquer (analyse)", match_faq_unlock: "Débloquer (FAQ)", match_bar_unlock: "Débloquer (barre du bas)",
    // 0031 (19/09/2026) : buteurs du jour, case des conditions de vente (kind coupe a 20 caracteres).
    home_scorers_unlock: "Débloquer (buteurs du jour)", home_scorers_locked_row: "buteur flouté", home_scorers_locked_: "buteur flouté", home_scorers_card: "buteur du jour",
    checkout_consent: "case des conditions cochée" };
  function visitKey(s, i) { return String(s.session_id || s.first_at + "|" + i); }
  function visitDetail(s) {
    var items = [];
    (s.pages || []).forEach(function (p) {
      var info = H.pageInfo(p.page, p.match_id, S.names);
      var meta = fmtTime(p.at) + " · " + (p.sec === null || p.sec === undefined ? "durée inconnue" : "resté " + H.fmtDur(p.sec));
      items.push({ at: p.at, html: '<li><span class="tl-main" title="' + esc(info.title) + '">' + esc(info.name) + '</span><span class="tl-meta">' + esc(meta) + "</span></li>" });
    });
    (s.events || []).forEach(function (e) {
      var label, cls = "ev";
      if (e.type === "click") {
        label = "Clic " + (CLICK_KINDS[e.kind] || "") + (e.label && !/^(match|home|checkout)_[a-z_]+$/.test(String(e.label)) && e.kind !== "checkout_consent" ? " : « " + String(e.label) + " »" : "");
        if (e.kind === "match" && e.match_id) { var nm = H.matchName(e.match_id, S.names); if (nm) label += " → " + nm; }
      } else {
        label = EVENT_LABELS[e.type] || String(e.type || "Événement");
        if (e.type === "signup_completed" || e.type === "checkout_success_view") cls = "ev win";
      }
      items.push({ at: e.at, html: '<li class="' + cls + '"><span class="tl-main">' + esc(label) + '</span><span class="tl-meta">' + esc(fmtTime(e.at)) + "</span></li>" });
    });
    items.sort(function (x, y) { return new Date(x.at) - new Date(y.at); });
    var extra = [
      s.browser || s.os ? "Navigateur : " + [s.browser, s.os].filter(Boolean).join(" · ") : null,
      s.source_raw ? "Venu de : " + s.source_raw : null,
      s.utm_campaign ? "Campagne : " + s.utm_campaign : null
    ].filter(Boolean).join(" · ");
    var action = s.session_id
      ? '<p class="note">Cette visite te semble fausse (toi, un test, un robot) ? Tu peux la retirer des chiffres. Rien n\'est supprimé.</p><div class="card-actions"><button type="button" class="btn btn-danger btn-sm" data-exclude="' + esc(s.session_id) + '">Retirer cette visite des chiffres</button></div>'
      : "";
    return (items.length ? '<ol class="timeline">' + items.map(function (i) { return i.html; }).join("") + "</ol>" : emptyHtml("Aucun détail pour cette visite"))
      + (extra ? '<p class="note">' + esc(extra) + "</p>" : "") + action;
  }
  function renderVisits() {
    var el = $("visits");
    if (!S.sessions) { blockError(el, S.sessionsError, "Dernières visites"); return; }
    var list = S.sessions;
    if (!list.length) { el.innerHTML = emptyHtml("Aucune visite sur cette période", "Les visites apparaîtront ici au fil de l'eau."); return; }
    var shown = list.slice(0, S.visitLimit);
    el.innerHTML = '<ul class="visits">' + shown.map(function (s, i) {
      var key = visitKey(s, i), open = S.openVisit === key;
      var entry = H.pageInfo(s.entry_page, s.entry_match_id, S.names);
      var clock = H.visitClock(s.first_at, s.tz);
      var badges = [];
      if (s.signed_up) badges.push('<span class="badge ok">Inscrit</span>');
      if (s.checkout_success) badges.push('<span class="badge pay">A payé</span>');
      else if (s.checkout_started) badges.push('<span class="badge warn">Paiement commencé</span>');
      return '<li class="visit"><button type="button" class="v-row" data-v="' + i + '" aria-expanded="' + open + '" aria-controls="vd' + i + '">'
        + '<span class="v-time tnum"><b>' + esc(clock.paris || "—") + "</b>" + esc(fmtDay(s.first_at)) + (clock.local && clock.local !== clock.paris ? " · " + esc(clock.local) + " chez lui" : "") + "</span>"
        + '<span style="min-width:0"><span class="v-sentence">' + esc(H.sessionSentence(s)) + '</span><span class="v-entry">Arrivé sur : ' + esc(entry.name) + "</span></span>"
        + '<span class="v-badges">' + badges.join("") + '<svg class="v-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span></button>'
        + '<div class="v-detail" id="vd' + i + '"' + (open ? "" : " hidden") + ">" + (open ? visitDetail(s) : "") + "</div></li>";
    }).join("") + "</ul>"
      + (list.length > shown.length ? '<div class="more"><button type="button" class="btn btn-ghost btn-sm" id="visitsMore">Voir plus de visites (' + esc(H.fmtInt(list.length - shown.length)) + ")</button></div>" : "")
      + '<p class="note">Heures de Paris ; « chez lui » = heure locale du visiteur quand son fuseau horaire est connu.</p>';
  }

  // ---------- 9. Details : inscrits ----------
  function renderSignups() {
    var el = $("signups"), r = S.signups;
    if (!r || !r.data) { blockError(el, r, "Derniers inscrits"); return; }
    var list = r.data.filter(function (u) { return u && !(u.is_internal === true || u.role === "admin"); });
    if (!list.length) { el.innerHTML = emptyHtml("Aucun inscrit pour le moment", "Les nouveaux comptes apparaîtront ici dès leur création."); return; }
    var shown = list.slice(0, S.signupLimit);
    el.innerHTML = '<ul class="srows">' + shown.map(function (u) {
      var plan = u.plan === "pro" ? '<span class="badge pay">Pro</span>' : '<span class="badge">Gratuit</span>';
      var meta = [
        fmtDay(u.created_at) + " à " + fmtTime(u.created_at) + " (Paris)",
        u.source_group ? "via " + H.sourceLabel(u.source_group) : null,
        u.country_guess ? H.countryName(u.country_guess) : null,
        u.device ? H.deviceLabel(u.device) : null,
        u.site_version ? "version " + H.siteLabel(u.site_version) : null
      ].filter(Boolean).join(" · ");
      return '<li class="srow"><span class="s-mail">' + esc(u.email || "—") + "</span>" + plan + '<span class="s-meta">' + esc(meta) + "</span></li>";
    }).join("") + "</ul>"
      + (list.length > shown.length ? '<div class="more"><button type="button" class="btn btn-ghost btn-sm" id="signupsMore">Voir plus d\'inscrits (' + esc(H.fmtInt(list.length - shown.length)) + ")</button></div>" : "");
  }

  // ---------- Mes inscrits (migration 0025_admin_members.sql) ----------
  // Sans la migration : message « a activer », le reste du tableau de bord
  // ne change pas. Donnees passees : jamais reconstituees (tracking_since).
  var MEMBERS_FILE = "0025_admin_members.sql";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function loadMembers() {
    if (!sb || S.membersLoading) return Promise.resolve();
    S.membersLoading = true;
    return Promise.all([
      rpc("admin_members", { p_days: 30, p_include_internal: false }),
      rpc("admin_retention", { p_include_internal: false })
    ]).then(function (res) {
      S.membersLoading = false;
      if (res.some(function (x) { return x && x.kind === "denied"; })) { showState("denied"); return; }
      S.members = res[0];
      S.retention = res[1];
      renderMembers();
    });
  }
  function trackingNote(since) {
    if (!since) return "Le suivi des visites par inscrit démarre avec la mise en ligne de la mise à jour du site. Pour l'instant, seules la date d'inscription et la dernière connexion sont connues : rien n'est reconstitué pour les jours d'avant.";
    return "Visites des inscrits suivies depuis le " + fmtDateTime(since) + " (heure de Paris). Avant, seules l'inscription et la dernière connexion sont connues : rien n'est reconstitué.";
  }
  function renderMembers() {
    if (!S.members && !S.retention) return;
    var missing = (S.members && S.members.kind === "missing") || (S.retention && S.retention.kind === "missing");
    if (missing) {
      $("membersBody").hidden = true;
      $("membersNote").hidden = true;
      $("memberCards").innerHTML = '<p class="soft-msg"><b>Suivi des inscrits à activer</b>Cette partie s\'affichera quand ton développeur aura appliqué la mise à jour de la base ' + esc(MEMBERS_FILE)
        + '. En attendant, la liste « Derniers inscrits » reste disponible dans « Détails », en bas de page.</p>';
      return;
    }
    var m = S.members && S.members.data, r = S.retention && S.retention.data;
    $("membersBody").hidden = false;
    $("membersNote").hidden = !(m || r);
    $("membersNote").textContent = trackingNote((m && m.tracking_since) || (r && r.tracking_since) || null);
    renderMemberCards(m, r);
    renderMemberList(m);
    renderRetention(r);
  }
  function renderMemberCards(m, r) {
    var el = $("memberCards");
    if (!m && !r) { blockError(el, S.members, "Mes inscrits"); return; }
    var list = m && Array.isArray(m.members) ? m.members : null;
    var counts = list ? H.memberCounts(list) : null;
    var act = r && r.active ? r.active : null;
    var total = r ? H.num(r.members_total) : list ? list.length : null;
    var d7 = r ? H.retentionCell(r.overall, 7) : null;
    var na = "Chiffre indisponible pour le moment.";
    var cards = [
      {
        id: "mtoday", label: "Actifs aujourd'hui", icon: ICONS.users, cls: "green", value: H.fmtInt(act ? act.today : null),
        mean: !act ? na : Number(act.today) === 0 ? "Aucun inscrit n'est venu aujourd'hui pour l'instant." : H.fmtInt(act.today) + " " + plural(act.today, "inscrit est venu", "inscrits sont venus") + " aujourd'hui (visite ou connexion).",
        help: "Inscrits qui ont ouvert une page en étant connectés, ou qui se sont connectés, aujourd'hui (heure de Paris). Comptes admin et de test exclus."
      },
      {
        id: "mweek", label: "Actifs cette semaine", icon: ICONS.pulse, value: H.fmtInt(act ? act.week : null),
        mean: !act ? na : H.fmtInt(act.week) + " sur " + H.fmtInt(total) + " " + plural(total, "inscrit", "inscrits") + " " + plural(act.week, "est venu", "sont venus") + " au moins une fois ces 7 derniers jours.",
        help: "Inscrits venus au moins un jour sur les 7 derniers jours, aujourd'hui compris."
      },
      {
        id: "mnudge", label: "À relancer", icon: ICONS.signup, cls: "amber", value: H.fmtInt(counts ? counts.to_nudge : null),
        mean: !counts ? na : counts.to_nudge === 0 ? "Personne à relancer pour l'instant." : H.fmtInt(counts.to_nudge) + " " + plural(counts.to_nudge, "inscrit n'est plus venu", "inscrits ne sont plus venus") + " depuis au moins 7 jours. Un petit message peut les faire revenir.",
        help: "Inscrits gratuits, inscrits depuis plus de 7 jours, sans visite ni connexion depuis 7 à 29 jours. Au-delà de 30 jours, ils passent en « Parti »."
      },
      {
        id: "mback", label: "Reviennent après 7 jours", icon: ICONS.star, cls: "violet", value: d7 && d7.state === "ok" ? H.fmtPct(d7.pct, 0) : "—",
        mean: !d7 ? na : d7.state !== "ok" ? "Trop tôt pour le dire : aucun inscrit ne l'est depuis au moins 7 jours."
          : d7.returned === 0 ? "Aucun des " + H.fmtInt(d7.eligible) + " inscrits depuis au moins 7 jours n'est revenu après son premier jour."
          : H.fmtInt(d7.returned) + " " + plural(d7.returned, "inscrit", "inscrits") + " sur " + H.fmtInt(d7.eligible) + " " + plural(d7.returned, "est revenu", "sont revenus") + " 7 jours ou plus après l'inscription.",
        help: "Parmi les inscrits depuis au moins 7 jours : part de ceux venus (visite ou connexion) au moins une fois 7 jours ou plus après leur inscription. Avant le suivi par inscrit, seule la dernière connexion est connue : le chiffre peut être sous-estimé, jamais gonflé."
      }
    ];
    el.innerHTML = cards.map(function (c) {
      var hid = "help-card-" + c.id;
      return '<article class="kcard ' + (c.cls || "") + '" aria-labelledby="lbl-' + c.id + '">'
        + '<div class="kcard-top"><span class="kcard-icon" aria-hidden="true">' + c.icon + '</span><h3 class="kcard-label" id="lbl-' + c.id + '">' + esc(c.label) + "</h3>" + infoButton(hid, c.label) + "</div>"
        + '<div class="kcard-value tnum">' + esc(c.value) + "</div>"
        + helpPara(hid, c.help)
        + '<p class="kcard-mean"><span class="micro">Ce que ça veut dire</span>' + esc(c.mean) + "</p></article>";
    }).join("");
  }
  function statusBadge(st) {
    return '<span class="mstatus st-' + esc(st.cls) + '" title="' + esc(st.help) + '">' + esc(st.label) + '<span class="sr-only"> : ' + esc(st.help) + "</span></span>";
  }
  var INTENT_BADGE = { label: "Forte intention", cls: "intent", help: "A presque payé : paiement commencé, clic sur le bouton de paiement, ou panneau « Débloquer » vu au moins deux fois. Un message personnel simple est ta relance la plus rentable." };
  function renderMemberList(m) {
    var el = $("members"), btn = $("membersEmails");
    if (!m) { blockError(el, S.members, "Liste des inscrits"); btn.hidden = true; return; }
    var list = (Array.isArray(m.members) ? m.members : []).filter(Boolean);
    btn.hidden = !list.length;
    btn.textContent = S.showEmails ? "Masquer les emails" : "Afficher les emails complets";
    btn.setAttribute("aria-pressed", String(!!S.showEmails));
    if (!list.length) { el.innerHTML = emptyHtml("Aucun inscrit pour le moment", "Les comptes créés sur le site apparaîtront ici, avec leur activité."); return; }
    var now = Date.now(), counts = H.memberCounts(list, now);
    var intentCount = list.filter(H.memberIntent).length;
    var summary = H.MEMBER_STATUS_ORDER.filter(function (k) { return counts[k] > 0; }).map(function (k) {
      return "<span>" + statusBadge(H.MEMBER_STATUS[k]) + " " + esc(H.fmtInt(counts[k])) + "</span>";
    }).join("");
    // « Forte intention » (20/09/2026) : compte gratuit qui a presque paye.
    if (intentCount > 0) summary += "<span>" + statusBadge(INTENT_BADGE) + " " + esc(H.fmtInt(intentCount)) + "</span>";
    var shown = list.slice(0, S.memberLimit);
    el.innerHTML = '<p class="m-summary"><b>' + esc(H.fmtInt(counts.total) + " inscrit" + (counts.total > 1 ? "s" : "")) + "</b>" + summary + "</p>"
      + '<ul class="members">' + shown.map(function (u, i) {
        var st = H.memberStatus(u, now);
        var last = H.memberLastActivity(u);
        var open = !!u.user_id && S.openMember === u.user_id;
        var mail = S.showEmails ? (u.email || "Adresse inconnue") : (u.email_masked || H.maskEmail(u.email) || "Adresse inconnue");
        var bar = H.activityBar(u.active_dates, now, 7);
        var n7 = H.num(u.active_days_7);
        if (n7 === null) n7 = bar.filter(function (b) { return b.active; }).length;
        var n30 = H.num(u.active_days_30);
        var meta = [
          "Dernière visite : " + (last ? H.daysAgo(last, now) : "jamais vue"),
          "inscrit " + H.daysAgo(u.created_at, now),
          u.source_group ? (u.source_group === "direct" ? "venu en direct" : "via " + H.sourceLabel(u.source_group)) : null,
          // Ville quand admin_members la fournit (migration 0028), sinon le pays seul.
          (u.city || H.isCountry(u.country)) ? H.placeLabel(u) : null,
          st.key === "pro" && st.idleDays >= 7 ? "absent depuis " + st.idleDays + " jours" : null,
          u.tracking_opt_out ? "a refusé le suivi de ses visites" : null
        ].filter(Boolean).join(" · ");
        return '<li class="member"><button type="button" class="m-row" data-m="' + i + '" aria-expanded="' + open + '" aria-controls="md' + i + '">'
          + '<span class="m-main"><span class="m-top"><span class="m-mail">' + esc(mail) + "</span>" + statusBadge(st) + (H.memberIntent(u) ? statusBadge(INTENT_BADGE) : "") + "</span>"
          + '<span class="m-meta">' + esc(meta) + "</span></span>"
          + '<span class="m-act"><span class="m-bar" role="img" aria-label="' + esc("Venu " + n7 + " jour" + (n7 > 1 ? "s" : "") + " sur les 7 derniers") + '">'
          + bar.map(function (b) { return '<i class="' + (b.active ? "on" : "") + '" title="' + esc(H.fmtYmd(b.day)) + '"></i>'; }).join("")
          + '</span><span class="m-act-txt tnum">' + esc(n7 + " j sur 7" + (n30 !== null ? " · " + n30 + " j sur 30" : "")) + "</span></span>"
          + '<svg class="v-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>'
          + '<div class="m-detail" id="md' + i + '"' + (open ? "" : " hidden") + ">" + (open ? memberDetail(u, i) : "") + "</div></li>";
      }).join("") + "</ul>"
      + (list.length > shown.length ? '<div class="more"><button type="button" class="btn btn-ghost btn-sm" id="membersMore">Voir plus d\'inscrits (' + esc(H.fmtInt(list.length - shown.length)) + ")</button></div>" : "");
  }
  function memberDetail(u, i) {
    var facts = [
      "Inscrit le " + fmtDateTime(u.created_at),
      "Dernière connexion : " + (u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : "inconnue")
    ];
    if (u.tracking_opt_out) {
      facts.push("A choisi « Ne pas lier mes visites à mon compte » : ses visites ne sont pas affichées ici.");
    } else {
      facts.push(H.fmtInt(u.page_views) + " page" + (Number(u.page_views) > 1 ? "s" : "") + " vue" + (Number(u.page_views) > 1 ? "s" : "") + " et " + H.fmtInt(u.matches_viewed) + " match" + (Number(u.matches_viewed) > 1 ? "s" : "") + " consulté" + (Number(u.matches_viewed) > 1 ? "s" : "") + " sur 30 jours (visites suivies)");
      facts.push(u.saw_pricing ? "A vu la page abonnement" : "N'a pas vu la page abonnement (visites suivies)");
      facts.push(u.clicked_pay ? "A cliqué sur le bouton de paiement" : "N'a jamais cliqué sur le bouton de paiement (visites suivies)");
    }
    facts.push(u.origin_basis === "signup" ? "Origine : première page vue lors de l'inscription"
      : u.origin_basis === "first_tracked_visit" ? "Origine : première visite suivie (la visite d'inscription n'est pas connue)"
      : "Origine inconnue (inscrit avant le suivi)");
    if (u.device) facts.push("Appareil d'origine : " + H.deviceLabel(u.device));
    if (u.site) facts.push("Version du site : " + H.siteLabel(u.site));
    return '<ul class="m-facts">' + facts.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>"
      + '<h4 class="micro">Son parcours, jour par jour</h4><div class="m-journey" id="mj' + i + '">' + journeyHtml(u) + "</div>";
  }
  function journeyHtml(u) {
    var j = S.journeys[u.user_id];
    if (!j || j.loading) return '<div class="skel skel-line" style="width:60%"></div><p class="note">Chargement du parcours…</p>';
    if (!j.data) {
      return '<div class="block-error" role="alert"><p>' + esc(j.kind === "missing" ? "Parcours indisponible : la mise à jour " + MEMBERS_FILE + " n'est pas appliquée." : errorText(j.kind, j.error, "Parcours de l'inscrit")) + "</p></div>";
    }
    var d = j.data;
    if (d.member && d.member.tracking_opt_out) {
      return '<p class="soft-msg"><b>Parcours non suivi</b>Cet inscrit a choisi « Ne pas lier mes visites à mon compte ». Ses visites restent comptées anonymement dans les chiffres généraux.</p>';
    }
    var days = H.journeyDays(d.items, S.names);
    if (!days.length) {
      return '<p class="soft-msg"><b>Aucune visite enregistrée pour cet inscrit</b>' + esc(d.tracking_since
        ? "Il n'est pas revenu connecté depuis le début du suivi par inscrit."
        : "Le suivi par inscrit n'a pas encore démarré : ses prochaines visites connectées apparaîtront ici.") + "</p>";
    }
    var html = days.map(function (g) {
      return '<div class="j-day"><h5 class="j-title">' + esc(g.title) + "<small>" + esc(g.summary) + '</small></h5><ol class="timeline">'
        + g.entries.map(function (e) {
          var meta = fmtTime(e.at) + (e.kind === "page" ? " · " + (e.sec === null || e.sec === undefined ? "durée inconnue" : "resté " + H.fmtDur(e.sec)) : "") + (e.beforeSignup ? " · avant l'inscription" : "");
          var cls = e.kind === "page" ? "" : e.win ? "ev win" : "ev";
          return "<li" + (cls ? ' class="' + cls + '"' : "") + '><span class="tl-main"' + (e.title ? ' title="' + esc(e.title) + '"' : "") + ">" + esc(e.text) + '</span><span class="tl-meta">' + esc(meta) + "</span></li>";
        }).join("") + "</ol></div>";
    }).join("");
    var lim = H.num(d.limit) || 200;
    if ((d.items || []).length >= lim) html += '<p class="note">' + esc("Seules les " + H.fmtInt(lim) + " dernières actions sont affichées.") + "</p>";
    return html;
  }
  function toggleMember(row) {
    var i = Number(row.getAttribute("data-m"));
    var list = (S.members && S.members.data && S.members.data.members) || [];
    var u = list[i];
    if (!u) return;
    var detail = document.getElementById("md" + i), open = row.getAttribute("aria-expanded") !== "true";
    row.setAttribute("aria-expanded", String(open));
    detail.hidden = !open;
    S.openMember = open ? u.user_id : null;
    if (open && !S.journeys[u.user_id]) {
      if (UUID_RE.test(String(u.user_id || ""))) loadJourney(u, i);
      else S.journeys[u.user_id] = { kind: "invalid", error: null };
    }
    detail.innerHTML = open ? memberDetail(u, i) : "";
  }
  function loadJourney(u, i) {
    S.journeys[u.user_id] = { loading: true };
    rpc("admin_member_journey", { p_user_id: u.user_id, p_limit: 200 }).then(function (r) {
      if (r.kind === "denied") { showState("denied"); return; }
      S.journeys[u.user_id] = r;
      var paint = function () {
        var box = document.getElementById("mj" + i);
        if (box && S.openMember === u.user_id) box.innerHTML = journeyHtml(u);
      };
      paint();
      var ids = ((r.data && r.data.items) || []).map(function (x) { return x && x.match_id; }).filter(Boolean);
      if (ids.some(function (id) { return !S.names[id]; })) loadMissingNames(ids).then(function (changed) { if (changed) paint(); });
    });
  }
  function renderRetention(r) {
    var el = $("retention");
    if (!r) { blockError(el, S.retention, "Est-ce qu'ils reviennent ?"); return; }
    var a = r.active || {};
    var head = '<p class="ret-active">' + esc("Inscrits venus : " + H.fmtInt(a.today) + " aujourd'hui · " + H.fmtInt(a.week) + " sur 7 jours · " + H.fmtInt(a.month) + " sur 30 jours") + "</p>";
    var cohorts = (r.cohorts || []).filter(function (c) { return c && Number(c.signups) > 0; });
    if (!cohorts.length) { el.innerHTML = head + emptyHtml("Aucun inscrit pour le moment", "Les semaines d'inscription apparaîtront ici."); return; }
    var steps = [[1, "Le lendemain ou après"], [7, "Après 7 jours"], [30, "Après 30 jours"]];
    el.innerHTML = head + '<ul class="ret-list">' + cohorts.slice(0, 8).map(function (c) {
      var n = Number(c.signups) || 0;
      return '<li class="ret"><div class="ret-head"><b>Semaine du ' + esc(H.shortDay(String(c.week_start || "").slice(0, 10))) + "</b><span>" + esc(H.fmtInt(n) + " inscrit" + (n > 1 ? "s" : "")) + "</span></div>"
        + '<p class="ret-sentence">' + esc(H.retentionSentence(c, 7)) + "</p>"
        + '<ul class="bars">' + steps.map(function (s) {
          var cell = H.retentionCell(c, s[0]);
          var ok = cell.state === "ok";
          return '<li class="bar-row"><span class="bar-name">' + esc(s[1]) + '</span><span class="bar-val tnum">' + esc(ok ? cell.text : "trop tôt")
            + (ok ? "<small>" + esc(H.fmtPct(cell.pct, 0)) + "</small>" : "") + '</span><span class="bar-track" aria-hidden="true"><i class="alt' + (ok && cell.returned ? "" : " none") + '" style="width:' + (ok ? cell.pct : 0).toFixed(1) + '%"></i></span></li>';
        }).join("") + "</ul></li>";
    }).join("") + "</ul>"
      + (cohorts.length > 8 ? '<p class="note">Les 8 dernières semaines sont affichées.</p>' : "");
  }

  // ---------- Clics « Debloquer » par emplacement (carte du tunnel) ----------
  function loadUnlocks() {
    if (!sb || !S.range) return Promise.resolve();
    var r = S.range;
    return rpc("admin_unlock_clicks", { p_from: r.from, p_to: r.to, p_include_internal: false, p_since: H.LAUNCH_AT }).then(function (x) {
      if (x.kind === "denied") { showState("denied"); return; }
      S.unlocks = x;
      renderUnlocks();
    });
  }
  function renderUnlocks() {
    var el = $("unlockClicks");
    if (!el || !S.unlocks) return;
    var title = '<h3 class="flow-sub unlock-title">Clics « Débloquer » par emplacement (page match)</h3>';
    if (S.unlocks.kind === "missing") {
      el.innerHTML = title + '<p class="soft-msg"><b>À activer</b>Les clics sur chaque bouton « Débloquer » s\'afficheront ici quand ton développeur aura appliqué la mise à jour ' + esc(MEMBERS_FILE) + ".</p>";
      return;
    }
    if (!S.unlocks.data) { el.innerHTML = title; el.innerHTML += '<div class="block-error" role="alert"><p>' + esc(errorText(S.unlocks.kind, S.unlocks.error, "Clics « Débloquer »")) + "</p></div>"; return; }
    var u = H.unlockRows(S.unlocks.data);
    el.innerHTML = title
      + (u.total ? barsHtml(u.rows.map(function (row) {
        return { nameHtml: esc(row.label) + '<span class="reason-help">' + esc(row.help) + "</span>", value: row.clicks, extra: H.fmtPct(row.pct, 0), cls: "warm" };
      })) : "")
      + '<p class="note">' + esc(u.sentence) + " Comptés sur la période choisie, robots, tests et ton appareil exclus.</p>"
      + (u.uncounted.indexOf("match_gate_unlock") !== -1 ? '<p class="note">Le panneau d\'analyse (bouton « Débloquer avec Pro » ajouté le 19/09/2026) sera compté ici quand ton développeur aura appliqué la mise à jour ' + esc(H.UNLOCK_FILE) + ".</p>" : "");
  }

  // ---------- Ou les visiteurs decrochent (admin_conversion_funnel, 0031) ----------
  // Filtres propres a la section (pays, appareil, provenance) ; periode du
  // haut de page. Sans la migration : « Migration 0031 a appliquer ».
  function loadDrop() {
    if (!sb || !S.range) return Promise.resolve();
    var r = S.range, seq = ++S.dropSeq;
    return rpc("admin_conversion_funnel", {
      p_from: r.from, p_to: r.to, p_include_internal: false, p_since: H.LAUNCH_AT,
      p_country: S.drop.country || null, p_device: S.drop.device || null, p_source: S.drop.source || null
    }).then(function (x) {
      if (seq !== S.dropSeq) return;
      if (x.kind === "denied") { showState("denied"); return; }
      S.dropRes = x;
      renderDrop();
    });
  }
  function dropCountryOptions(list) {
    var cur = S.drop.country;
    var rows = (Array.isArray(list) ? list : []).filter(function (c) { return c && Number(c.visitors) > 0; });
    var seen = {};
    var opts = ['<option value="">Tous les pays</option>'];
    rows.forEach(function (c) {
      var code = H.isCountry(c.country) ? c.country : "unknown";
      if (seen[code]) return;
      seen[code] = 1;
      var name = code === "unknown" ? "Pays inconnu" : H.flagEmoji(code) + " " + H.countryName(code);
      opts.push('<option value="' + esc(code) + '"' + (code === cur ? " selected" : "") + ">" + esc(name + " (" + H.fmtInt(c.visitors) + ")") + "</option>");
    });
    if (cur && !seen[cur]) opts.push('<option value="' + esc(cur) + '" selected>' + esc(cur === "unknown" ? "Pays inconnu" : H.countryName(cur)) + "</option>");
    return opts.join("");
  }
  function dropNotesHtml(notes) {
    return notes.length ? '<ul class="drop-notes">' + notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "";
  }
  function renderDrop() {
    var el = $("dropFunnel"), x = S.dropRes;
    if (!el || !x) return;
    if (x.kind === "missing") {
      $("dropFilters").hidden = true;
      $("dropExtra").hidden = true;
      el.innerHTML = '<p class="soft-msg"><b>Migration 0031 à appliquer dans Supabase</b>Cette partie s\'affichera quand ton développeur aura appliqué la mise à jour de la base ' + esc(H.DROP_FILE)
        + " (à coller dans le SQL Editor de Supabase). Le reste du tableau de bord fonctionne normalement.</p>";
      return;
    }
    $("dropFilters").hidden = false;
    if (!x.data) { $("dropExtra").hidden = true; blockError(el, x, "Où les visiteurs décrochent"); return; }
    var d = x.data;
    $("dropCountry").innerHTML = dropCountryOptions(d.countries);
    $("dropCountry").value = S.drop.country;
    $("dropDevice").value = S.drop.device;
    $("dropSource").value = S.drop.source;
    var steps = H.dropSteps(d);
    var filtered = !!(S.drop.country || S.drop.device || S.drop.source);
    var notes = [H.excludedText(d.excluded), H.countryBasisText(d.country_basis)].concat(H.dropNotes(d, S.range)).filter(Boolean);
    if (!steps[0].value) {
      $("dropExtra").hidden = true;
      el.innerHTML = emptyHtml(filtered ? "Aucun visiteur avec ces filtres" : "Aucun visiteur sur cette période", filtered ? "Change ou retire un filtre pour voir le parcours." : "Le parcours s'affichera dès les premières visites.")
        + dropNotesHtml(notes);
      return;
    }
    var leak = H.dropLeak(steps);
    var html = (filtered ? '<p class="drop-filter-note">' + esc("Filtre : " + [
      S.drop.country ? (S.drop.country === "unknown" ? "pays inconnu" : H.countryName(S.drop.country)) : null,
      S.drop.device ? H.DROP_DEVICES[S.drop.device] : null,
      S.drop.source ? "provenance " + H.DROP_SOURCES[S.drop.source] : null
    ].filter(Boolean).join(" · ")) + "</p>" : "") + '<ol class="steps drop-steps">';
    steps.forEach(function (s, i) {
      if (i > 0) {
        var isLeak = leak && leak.index === i;
        var gap = s.pctOfPrev === null ? "" : H.fmtPct(Math.min(s.pctOfPrev, 100), 0) + " de l'étape précédente";
        if (gap || isLeak) html += '<li class="step-gap' + (isLeak ? " leak" : "") + '">' + (gap ? "↓ " + esc(gap) : "") + (isLeak ? " · plus gros décrochage" : "") + "</li>";
      }
      var w = s.pctOfFirst === null ? 0 : Math.max(0, Math.min(100, s.pctOfFirst));
      var pct = i === 0 ? "100 % des arrivées" : H.fmtPct(s.pctOfFirst, s.pctOfFirst < 10 ? 1 : 0) + " des arrivées";
      html += '<li class="step' + (leak && leak.index === i ? " step-leak" : "") + '"><span class="step-name">' + esc((i + 1) + ". " + s.label) + "<small>" + esc(s.help) + "</small>"
        + (s.other ? '<small class="step-alt">' + esc("+ " + H.fmtInt(s.other) + " par un autre chemin (" + H.fmtInt(s.reached) + " au total)") + "</small>" : "")
        + '</span><span class="step-num"><b class="tnum">' + esc(H.fmtInt(s.value)) + '</b><span class="tnum">' + esc(pct) + "</span></span>"
        + '<span class="step-bar" aria-hidden="true"><i style="width:' + w.toFixed(2) + '%"></i></span></li>';
    });
    html += "</ol>";
    html += leak ? '<p class="leak-box">' + esc(leak.sentence) + "</p>" : '<p class="note">Personne ne décroche entre les étapes sur cette période.</p>';
    html += dropNotesHtml(notes);
    el.innerHTML = html;

    $("dropExtra").hidden = false;
    var exits = H.exitRows(d, S.names);
    $("dropExits").innerHTML = exits.length ? barsHtml(exits.map(function (r) {
      var href = H.safeHref(r.page, r.matchId);
      var tag = r.site && H.SITES[r.site] ? H.SITES[r.site].short : "";
      var name = href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(r.name) + "</a>" : esc(r.name);
      return { nameHtml: name + (tag ? "<small>" + esc(tag) + "</small>" : ""), title: r.title, value: r.visitors, extra: H.fmtPct(r.pct, 0), cls: "warm" };
    })) + '<p class="note">' + esc("Sur " + H.fmtInt(d.exit_total) + " visiteur" + (Number(d.exit_total) > 1 ? "s" : "") + " sans compte ni inscription.") + "</p>"
      : emptyHtml("Aucune page de sortie", "Tous les visiteurs de cette sélection se sont inscrits ou avaient déjà un compte.");
    var t = H.signupTimingText(d.signup_timing);
    $("dropSignup").innerHTML = '<div class="bots-big"><b class="tnum">' + esc(t.value) + "</b><span>médiane</span></div>" + '<p class="bots-text">' + esc(t.text) + "</p>";
    var ids = exits.map(function (r) { return r.matchId; }).filter(Boolean);
    if (ids.some(function (id) { return !S.names[id]; })) loadMissingNames(ids).then(function (changed) { if (changed) renderDrop(); });
  }

  // ---------- Partenaires (admin_affiliates, admin_affiliate_set_status) ----------
  // Tout texte venant d'un candidat (code, e-mail, réseaux, « à propos »)
  // passe par esc() ; les liens ne sont cliquables qu'en http/https.
  function partnersList() {
    var r = S.partners;
    if (!r || r.error) return null;
    var d = r.data;
    if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { d = null; } }
    return H.partnerSort(d && d.affiliates);
  }
  function partnerById(id) {
    return (partnersList() || []).filter(function (a) { return String(a.id) === String(id); })[0] || null;
  }
  function loadPartners() {
    if (!sb) return Promise.resolve();
    if (S.partnersLoading) { S.partnersAgain = true; return Promise.resolve(); }
    S.partnersLoading = true;
    return rpc("admin_affiliates").then(function (r) {
      S.partnersLoading = false;
      if (r.kind === "denied") { showState("denied"); return; }
      S.partners = r;
      renderPartners();
      if (S.partnersAgain) { S.partnersAgain = false; return loadPartners(); }
    });
  }
  // « aujourd'hui », « hier », « le 18 oct. »
  function onDay(iso) {
    var d = fmtDay(iso);
    return d === "—" ? null : d === "Aujourd'hui" ? "aujourd'hui" : d === "Hier" ? "hier" : "le " + d;
  }
  // Pastille sur l'onglet + ligne dans « À faire en premier ».
  function renderPartnersFlag(list) {
    var n = list ? H.partnerCounts(list).pending : 0;
    var b = $("partnersTabCount");
    b.hidden = !n;
    b.innerHTML = n ? esc(H.fmtInt(n)) + '<span class="sr-only"> ' + esc(plural(n, "dossier à valider", "dossiers à valider")) + "</span>" : "";
    var t = $("partnersTodo");
    t.hidden = !n;
    t.innerHTML = n ? '<span class="badge warn">Partenaires</span><b>' + esc(H.fmtInt(n) + " " + plural(n, "candidature partenaire à valider", "candidatures partenaire à valider"))
      + '</b><a class="todo-link" href="#ecran-partenaires">Ouvrir l\'écran Partenaires ›</a>' : "";
  }
  function partnerStats(a) {
    var m = H.partnerMoney(a.balances);
    var cell = function (label, value) { return "<div><dt>" + esc(label) + '</dt><dd class="tnum">' + esc(value) + "</dd></div>"; };
    return '<dl class="pa-stats">' + cell("Clics", H.fmtInt(a.clicks)) + cell("Inscrits", H.fmtInt(a.signups)) + cell("Abonnés payants", H.fmtInt(a.active_paying)) + "</dl>"
      + '<p class="pa-cap">Commissions</p><dl class="pa-stats">' + cell("En attente", m.pending) + cell("À verser", m.payable) + cell("Déjà versées", m.paid) + "</dl>"
      + (a.status === "approved" && a.payout_ready === false
        ? '<p class="pa-review">' + esc(a.has_stripe_account ? "Compte de versement commencé, pas encore prêt." : "Compte de versement pas encore créé par le partenaire.") + "</p>" : "");
  }
  function partnerReview(a) {
    var when = onDay(a.reviewed_at);
    if (!when) return "";
    var verb = { approved: "Accepté", refused: "Refusé", suspended: "Suspendu", pending: "Remis à valider" }[a.status] || "Modifié";
    var note = a.reviewed_note ? String(a.reviewed_note).trim() : "";
    return '<p class="pa-review">' + esc(verb + " " + when + (note ? " · message envoyé : « " + note + " »" : "")) + "</p>";
  }
  function partnerButtons(a, id) {
    if (!UUID_RE.test(id)) return '<p class="pa-review">Identifiant du dossier illisible : aucune action possible ici.</p>';
    var busy = S.partnerBusy;
    return '<div class="pa-actions">' + H.partnerActions(a.status).map(function (x) {
      var mine = busy && busy.id === id && busy.to === x.to;
      return '<button type="button" class="btn btn-sm' + (x.primary ? "" : " btn-ghost") + '" data-pa-id="' + esc(id) + '" data-pa-to="' + esc(x.to) + '"'
        + (busy ? " disabled" : "") + ">" + esc(mine ? "Enregistrement…" : x.label) + "</button>";
    }).join("") + "</div>";
  }
  function partnerRow(a) {
    var st = H.partnerStatus(a.status);
    var id = String(a.id == null ? "" : a.id);
    var when = onDay(a.created_at);
    var country = String(a.country || "").toUpperCase();
    var aud = H.num(a.audience);
    var facts = [
      H.isCountry(country) ? H.countryName(country) : "Pays non précisé",
      H.partnerLegal(a.legal_status),
      H.partnerStyle(a.content_style),
      aud === null ? "audience non précisée" : H.fmtInt(aud) + " " + plural(aud, "abonné", "abonnés")
    ];
    var links = H.partnerLinks(a.networks);
    var about = a.about ? String(a.about).trim() : "";
    return '<li class="pa"' + (S.partnerBusy && S.partnerBusy.id === id ? ' aria-busy="true"' : "") + ">"
      + '<div class="pa-top"><b class="pa-code">' + esc(a.code || "Sans code") + '</b><span class="mstatus st-' + esc(st.cls) + '">' + esc(st.label) + "</span>"
      + '<span class="pa-date">' + esc(when ? "Déposé " + when + " à " + fmtTime(a.created_at) : "Date de dépôt inconnue") + "</span></div>"
      + '<p class="pa-mail">' + esc(a.email || "E-mail inconnu") + "</p>"
      + '<p class="pa-facts">' + esc(facts.join(" · ")) + "</p>"
      + (links.length ? '<ul class="pa-links" aria-label="Réseaux et liens">' + links.map(function (l) {
        return "<li>" + (l.href
          ? '<a href="' + esc(l.href) + '" target="_blank" rel="noopener noreferrer" title="' + esc(l.text) + '">' + esc(l.text) + "</a>"
          : '<span title="' + esc(l.text) + '">' + esc(l.text) + "</span>") + "</li>";
      }).join("") + "</ul>" : '<p class="pa-review">Aucun réseau indiqué.</p>')
      + (about ? '<p class="pa-about">' + esc(about) + "</p>" : "")
      + (a.status === "approved" || a.status === "suspended" ? partnerStats(a) : "")
      + partnerReview(a)
      + partnerButtons(a, id)
      + "</li>";
  }
  function renderPartners() {
    var el = $("partners"), r = S.partners;
    if (!r) return;
    var list = partnersList();
    renderPartnersFlag(list);
    if (!list) {
      if (r.kind === "missing") {
        el.innerHTML = '<p class="soft-msg"><b>Programme Partenaires pas encore branché</b>La liste s\'affichera quand la fonction admin_affiliates sera en place dans Supabase. Préviens ton développeur.</p>';
      } else blockError(el, r, "Partenaires");
      return;
    }
    if (!list.length) {
      el.innerHTML = emptyHtml("Aucune candidature pour l'instant.", "Les dossiers déposés sur la page Partenaires apparaîtront ici.");
      return;
    }
    var c = H.partnerCounts(list);
    var cell = function (n, label, todo) { return "<div" + (todo ? ' class="is-todo"' : "") + '><b class="tnum">' + esc(H.fmtInt(n)) + "</b><span>" + esc(label) + "</span></div>"; };
    var html = '<div class="pa-sum">' + cell(c.pending, "À valider", c.pending > 0) + cell(c.approved, "Acceptés") + cell(c.closed, "Refusés ou suspendus") + "</div>";
    var group = null;
    list.forEach(function (a) {
      var g = H.partnerStatus(a.status).group;
      if (g !== group) {
        var n = list.filter(function (x) { return H.partnerStatus(x.status).group === g; }).length;
        html += (group === null ? "" : "</ul>") + '<h3 class="pa-group">' + esc(g) + ' <span class="tnum">(' + esc(H.fmtInt(n)) + ')</span></h3><ul class="pa-list">';
        group = g;
      }
      html += partnerRow(a);
    });
    el.innerHTML = html + "</ul>";
  }

  // Accepter / remettre à valider : tout de suite. Refuser / suspendre :
  // confirmation, avec un message facultatif (le partenaire le voit).
  var pendingPartner = null;
  function askPartner(id, to) {
    if (S.partnerBusy || !UUID_RE.test(String(id || "")) || ["approved", "refused", "suspended", "pending"].indexOf(to) === -1) return;
    if (to !== "refused" && to !== "suspended") { setPartnerStatus(id, to, null); return; }
    var a = partnerById(id), code = a && a.code ? String(a.code) : "ce dossier";
    var money = H.partnerMoney(a && a.balances);
    pendingPartner = { id: id, to: to };
    $("partnerDialogTitle").textContent = to === "refused" ? "Refuser " + code + " ?" : "Suspendre " + code + " ?";
    $("partnerDialogText").textContent = (to === "refused"
      ? "La personne verra dans son espace que sa candidature n'est pas retenue."
      : "Ce partenaire ne gagnera plus de commission tant qu'il est suspendu.")
      + (money.hasOpen ? " Ses commissions pas encore versées (" + money.open + ") seront annulées, même si tu changes d'avis ensuite." : "")
      + " Tu pourras revenir sur ta décision avec « Remettre à valider ».";
    $("partnerOk").textContent = to === "refused" ? "Refuser" : "Suspendre";
    $("partnerNote").value = "";
    var dlg = $("partnerDialog");
    if (dlg && typeof dlg.showModal === "function") {
      dlg.showModal();
      $("partnerCancel").focus();
    } else if (window.confirm($("partnerDialogText").textContent)) {
      runPartner();
    } else pendingPartner = null;
  }
  function runPartner() {
    var p = pendingPartner;
    pendingPartner = null;
    var note = String($("partnerNote").value || "").trim().slice(0, 500);
    var dlg = $("partnerDialog");
    if (dlg && dlg.open) dlg.close();
    if (p) setPartnerStatus(p.id, p.to, note || null);
  }
  function partnerErrorText(r) {
    if (r.kind === "network") return "Pas de connexion au serveur : la décision n'est pas enregistrée. Vérifie ta connexion, puis réessaie.";
    if (r.kind === "timeout") return "Le serveur ne répond pas assez vite. Touche Actualiser pour voir si la décision est passée.";
    if (r.kind === "invalid") return "Ce dossier n'a pas été trouvé, il a peut-être déjà changé. La liste vient d'être rechargée.";
    if (r.kind === "missing") return "La décision ne peut pas être enregistrée : la fonction admin_affiliate_set_status manque dans Supabase. Préviens ton développeur.";
    var code = r.error && r.error.code ? " (code " + r.error.code + ")" : "";
    return "La décision n'a pas pu être enregistrée" + code + ". Réessaie ; si ça continue, envoie ce message à ton développeur.";
  }
  function setPartnerStatus(id, to, note) {
    if (S.partnerBusy) return;
    var a = partnerById(id), code = a && a.code ? String(a.code) : "";
    S.partnerBusy = { id: id, to: to };
    renderPartners();
    rpc("admin_affiliate_set_status", { p_id: id, p_status: to, p_note: note }).then(function (r) {
      S.partnerBusy = null;
      if (r.kind === "denied") { showState("denied"); return; }
      var d = r.data;
      if (!r.error && (!d || d.ok !== true)) r = { error: { message: "réponse inattendue" }, kind: "error" };
      if (r.error) {
        toast(partnerErrorText(r));
        renderPartners();
        if (r.kind === "invalid") loadPartners();
        return;
      }
      var done = { approved: "accepté", refused: "refusé", suspended: "suspendu", pending: "remis à valider" }[to];
      var n = H.num(d.commissions_refused) || 0;
      toast("Dossier " + (code ? code + " " : "") + done + "."
        + (n > 0 ? " " + H.fmtInt(n) + " " + plural(n, "commission pas encore versée a été annulée.", "commissions pas encore versées ont été annulées.") : ""));
      return loadPartners();
    });
  }

  // ---------- Les 10 écrans ----------
  // L'ancre #ecran-<cle> choisit l'écran ; une ancre vers un bloc (#maintenant,
  // #inscrits...) ouvre l'écran qui le contient puis y descend.
  function screenOf(hash) {
    var key = H.screenKey(hash);
    if (key) return { key: key, target: null };
    var id = String(hash || "").replace(/^#/, "");
    var el = id && /^[A-Za-z][\w-]*$/.test(id) ? document.getElementById(id) : null;
    var box = el && el.closest ? el.closest("[data-screen]") : null;
    return box ? { key: box.getAttribute("data-screen"), target: el } : { key: S.screen || "aujourdhui", target: null };
  }
  function applyScreen(hash, scroll) {
    var r = screenOf(hash);
    S.screen = r.key;
    var def = H.SCREENS.filter(function (x) { return x.key === r.key; })[0] || H.SCREENS[0];
    Array.prototype.forEach.call(document.querySelectorAll("[data-screen]"), function (el) {
      el.classList.toggle("off-screen", el.getAttribute("data-screen") !== def.key);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-screen-link]"), function (a) {
      if (a.getAttribute("data-screen-link") === def.key) {
        a.setAttribute("aria-current", "page");
        if (a.scrollIntoView && scroll !== false) {
          var track = a.closest(".screens-track");
          if (track) track.scrollTo({ left: a.offsetLeft - (track.clientWidth - a.offsetWidth) / 2, behavior: "smooth" });
        }
      } else a.removeAttribute("aria-current");
    });
    $("screenTitle").textContent = def.title;
    $("screenSub").textContent = def.sub;
    document.title = "IASHARK — " + def.label;
    if (scroll === false) return;
    if (r.target) r.target.scrollIntoView({ behavior: "smooth", block: "start" });
    else {
      var nav = $("screens");
      var top = nav ? nav.getBoundingClientRect().top + window.pageYOffset - 70 : 0;
      if (window.pageYOffset > top) window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }

  // ---------- Diagnostics (admin_diagnostics, migration 0052) ----------
  function loadDiag() {
    if (!sb || !S.range) return Promise.resolve();
    var r = S.range, seq = ++S.diagSeq;
    return rpc("admin_diagnostics", merge({ p_from: r.from, p_to: r.to, p_include_internal: false }, filterArgs())).then(function (x) {
      if (seq !== S.diagSeq) return;
      if (x.kind === "denied") { showState("denied"); return; }
      S.diag = x;
      renderDiag();
    });
  }
  function diagMissing(el) {
    el.innerHTML = '<p class="soft-msg"><b>Mise à jour de la base à appliquer</b>Cette partie s\'affichera quand la mise à jour ' + esc(H.DIAG_FILE) + " sera appliquée dans Supabase. Le reste du tableau de bord fonctionne normalement.</p>";
  }
  var DIAG_BLOCKS = ["todo", "speed", "errors", "shown", "channels", "posts", "landing", "langs", "signupFlow", "payFlow", "money", "quality"];
  function renderDiag() {
    var x = S.diag;
    if (!x) return;
    if (!x.data) {
      DIAG_BLOCKS.forEach(function (id) {
        var el = $(id);
        if (!el) return;
        if (x.kind === "missing") diagMissing(el); else blockError(el, x, "Diagnostic");
      });
      return;
    }
    var d = x.data;
    renderTodo(d); renderSpeed(d); renderErrors(d); renderShown(d); renderChannels(d); renderPosts(d);
    renderLanding(d); renderLangs(d); renderSignupFlow(d); renderPayFlow(d); renderMoney(d); renderQuality(d);
  }
  function pctTxt(n, d) {
    var p = H.pctOf(n, d);
    return p === null ? "—" : H.fmtPct(p, p > 0 && p < 10 ? 1 : 0);
  }
  // Depuis quand une mesure existe : phrase si elle a démarré pendant la période.
  function sinceNote(iso, what) {
    if (!iso) return "Mesure de « " + what + " » ajoutée le 19/10/2026 : les premiers chiffres arrivent avec les prochaines visites.";
    if (S.range && H.parisToday(new Date(iso)) > S.range.from) return "Mesure de « " + what + " » ajoutée le " + fmtDay(iso).toLowerCase() + " : elle ne couvre pas toute la période.";
    return "";
  }
  function noteHtml(text) { return text ? '<p class="note">' + esc(text) + "</p>" : ""; }

  function renderTodo(d) {
    var el = $("todo");
    var acts = H.todoActions(d);
    var sessions = Number(d.totals && d.totals.sessions) || 0;
    if (!acts.length) {
      el.innerHTML = sessions < 20
        ? '<p class="soft-msg"><b>Pas encore assez de visiteurs pour conclure</b>' + esc(H.fmtInt(sessions) + " visiteur" + (sessions > 1 ? "s" : "") + " sur la période. Choisis « 7 jours » ou « 15 jours » en haut pour avoir assez de recul.") + "</p>"
        : '<p class="soft-msg"><b>Rien d\'urgent sur cette période</b>Pas de panne, pas de paiement bloqué, pas de grosse fuite repérée. Regarde l\'écran Provenance pour savoir quel réseau pousser.</p>';
      return;
    }
    var LEVEL = { urgent: "Urgent", important: "Important", info: "À regarder" };
    el.innerHTML = '<ol class="todo">' + acts.map(function (a, i) {
      return '<li class="todo-item todo-' + esc(a.level) + '"><span class="todo-n tnum" aria-hidden="true">' + (i + 1) + '</span><div class="todo-body">'
        + '<span class="badge ' + (a.level === "urgent" ? "warn" : a.level === "important" ? "cy" : "") + '">' + esc(LEVEL[a.level]) + "</span>"
        + "<b>" + esc(a.title) + "</b><p>" + esc(a.why) + '</p><a class="todo-link" href="#ecran-' + esc(a.screen) + '">Voir le détail ›</a></div></li>';
    }).join("") + "</ol>";
  }

  function renderSpeed(d) {
    var el = $("speed");
    var rows = (d.vitals || []).filter(function (v) { return v.device === "mobile" || v.device === "desktop"; });
    var any = rows.some(function (v) { return Number(v.n_lcp) > 0 || Number(v.n_inp) > 0; });
    if (!any) {
      el.innerHTML = emptyHtml("Pas encore de mesure de vitesse", "La mesure part avec la mise à jour du site du 19/10/2026 : les chiffres arrivent avec les prochaines visites.");
      return;
    }
    var html = "";
    rows.sort(function (a, b) { return a.device === "mobile" ? -1 : b.device === "mobile" ? 1 : 0; }).forEach(function (v) {
      html += '<h3 class="vit-dev">' + esc(v.device === "mobile" ? "Sur téléphone" : "Sur ordinateur") + '<small class="tnum">' + esc(H.fmtInt(v.n_lcp) + " mesure" + (Number(v.n_lcp) > 1 ? "s" : "")) + "</small></h3><ul class=\"vits\">";
      ["lcp", "inp", "cls"].forEach(function (m) {
        var verdict = H.vitalVerdict(m, v[m]);
        html += '<li class="vit vit-' + verdict.level + '"><span class="vit-name">' + esc(H.VITALS[m].label) + '</span><span class="vit-val tnum">' + esc(H.vitalValue(m, v[m])) + '</span><span class="vit-word">' + esc(verdict.word) + "</span></li>";
      });
      html += "</ul>";
    });
    el.innerHTML = html + noteHtml(sinceNote(d.quality && d.quality.since && d.quality.since.vitals, "vitesse"));
  }

  function renderErrors(d) {
    var el = $("errors");
    var list = d.errors || [];
    var since = d.quality && d.quality.since && d.quality.since.js_error;
    if (!list.length) {
      el.innerHTML = '<div class="bots-big"><b class="tnum">0</b><span>panne enregistrée</span></div>'
        + '<p class="bots-text">' + esc(since ? "Aucune erreur pendant les visites de la période." : "Aucune erreur pour l'instant. Le suivi des pannes démarre avec la mise à jour du site du 19/10/2026.") + "</p>";
      return;
    }
    var t = d.totals || {};
    el.innerHTML = '<p class="err-sum">' + esc(H.fmtInt(t.with_error) + " visiteur" + (Number(t.with_error) > 1 ? "s touchés" : " touché") + " sur " + H.fmtInt(t.sessions) + " (" + pctTxt(t.with_error, t.sessions) + ")") + "</p>"
      + '<ul class="errs">' + list.map(function (e) {
        var where = [e.src ? "fichier " + e.src : null, e.page ? "page " + H.pageInfo(e.page, null, S.names).name : null].filter(Boolean).join(" · ");
        return '<li class="err"><code class="err-msg">' + esc(e.msg) + '</code><span class="err-meta tnum">' + esc(H.fmtInt(e.n) + " fois · " + H.fmtInt(e.sessions) + " visiteur" + (Number(e.sessions) > 1 ? "s" : "") + (where ? " · " + where : "") + " · dernière " + fmtDay(e.last_at).toLowerCase() + " " + fmtTime(e.last_at)) + "</span></li>";
      }).join("") + "</ul>" + noteHtml(sinceNote(since, "pannes"));
  }

  function renderShown(d) {
    var el = $("shown"), t = d.totals || {};
    var known = Number(t.content_known) || 0;
    if (!known) {
      el.innerHTML = emptyHtml("Pas encore de mesure", "La mesure part avec la mise à jour du site du 19/10/2026 : elle arrivera avec les prochaines visites de l'accueil et des pages match.");
      return;
    }
    var before = Number(t.before_content) || 0;
    var rows = (d.landing || []).filter(function (l) { return Number(l.content_known) > 0; });
    el.innerHTML = '<div class="bots-big"><b class="tnum">' + esc(pctTxt(before, known)) + '</b><span>partent avant de voir les matchs</span></div>'
      + '<p class="bots-text">' + esc(H.fmtInt(before) + " visiteur" + (before > 1 ? "s" : "") + " sur " + H.fmtInt(known) + " arrivés sur l'accueil ou une page match sont partis pendant le chargement.") + "</p>"
      + (rows.length ? '<ul class="bars shown-list">' + rows.slice(0, 5).map(function (l) {
        return '<li class="bar-row"><span class="bar-name">' + esc(H.landingName(l.page, l.site)) + '</span><span class="bar-val tnum">' + esc(H.msText(l.content_ms)) + "<small>" + esc("délai médian") + "</small></span></li>";
      }).join("") + "</ul>" : "")
      + noteHtml(sinceNote(d.quality && d.quality.since && d.quality.since.content, "contenu affiché"));
  }

  // Tableau qui devient une liste de fiches sur téléphone (data-label).
  function tableHtml(cols, rows, opts) {
    opts = opts || {};
    return '<div class="dt-wrap"><table class="dt' + (opts.cls ? " " + opts.cls : "") + '"><thead><tr>' + cols.map(function (c) {
      return '<th scope="col"' + (c.num ? ' class="num"' : "") + ">" + esc(c.label) + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.map(function (r) {
      return "<tr" + (r.cls ? ' class="' + r.cls + '"' : "") + ">" + cols.map(function (c, i) {
        var v = r.cells[i];
        return (i === 0 ? '<th scope="row"' : "<td") + ' data-label="' + esc(c.label) + '"' + (c.num ? ' class="num tnum"' : "") + ">" + (i === 0 ? v : '<span class="dt-v">' + v + "</span>") + (i === 0 ? "</th>" : "</td>");
      }).join("") + "</tr>";
    }).join("") + "</tbody></table></div>";
  }
  function cnt(n, of) {
    var v = H.fmtInt(n);
    return of === undefined ? esc(v) : esc(v) + '<small class="dt-pct">' + esc(pctTxt(n, of)) + "</small>";
  }

  function renderChannels(d) {
    var el = $("channels"), list = d.sources || [];
    if (!list.length) { el.innerHTML = emptyHtml("Aucun visiteur sur cette période", "Le tableau se remplira dès les premières visites."); return; }
    var cols = [{ label: "Provenance" }, { label: "Visiteurs", num: true }, { label: "Utiles", num: true }, { label: "Temps médian", num: true },
      { label: "Inscrits", num: true }, { label: "Intérêt Pro", num: true }, { label: "Paiement ouvert", num: true }];
    el.innerHTML = tableHtml(cols, list.map(function (s) {
      var n = Number(s.sessions) || 0, u = Number(s.useful) || 0;
      return {
        cls: n >= 20 && u / n < 0.15 ? "row-warn" : "",
        cells: [esc(H.sourceLabel(s.source)), cnt(n), cnt(u, n), esc(H.fmtDur(s.median_sec)), cnt(s.signups), cnt(s.pro_interest), cnt(s.pay_clicks)]
      };
    })) + '<p class="note">Lignes en orange : au moins 20 visiteurs, mais moins de 15 % sont utiles. Pourcentage = part des visiteurs de la ligne.</p>';
  }

  function renderPosts(d) {
    var el = $("posts"), list = d.campaigns || [];
    if (!list.length) {
      el.innerHTML = emptyHtml("Aucun lien marqué sur cette période", "Ajoute une étiquette utm aux liens de tes vidéos, de ta bio et de tes pubs : chaque publication aura alors sa ligne ici.");
      return;
    }
    var cols = [{ label: "Publication" }, { label: "Visiteurs", num: true }, { label: "Utiles", num: true }, { label: "Partis sans 2e page", num: true }, { label: "Inscrits", num: true }, { label: "Paiement ouvert", num: true }];
    el.innerHTML = tableHtml(cols, list.map(function (c) {
      var n = Number(c.sessions) || 0;
      var label = [H.sourceLabel(c.source), c.medium === "paid" || c.medium === "cpc" || c.medium === "paid_social" ? "pub" : c.medium, c.campaign, c.content].filter(Boolean).join(" · ");
      return { cls: n >= 20 && (Number(c.useful) || 0) / n < 0.15 ? "row-warn" : "",
        cells: [esc(label) + '<small class="dt-sub">' + esc("arrivée : " + H.landingName(c.landing, null)) + "</small>", cnt(n), cnt(c.useful, n), cnt(c.one_page, n), cnt(c.signups), cnt(c.pay_clicks)] };
    }));
  }

  function renderLanding(d) {
    var el = $("landing"), list = (d.landing || []).slice(0, 15);
    if (!list.length) { el.innerHTML = emptyHtml("Aucune arrivée sur cette période", "Le tableau se remplira dès les premières visites."); return; }
    var cols = [{ label: "Page d'arrivée" }, { label: "Arrivées", num: true }, { label: "Partis sans 2e page", num: true }, { label: "Temps sur la page", num: true }, { label: "Contenu pas affiché", num: true }, { label: "Autre langue", num: true }];
    el.innerHTML = tableHtml(cols, list.map(function (l) {
      var n = Number(l.sessions) || 0, one = Number(l.one_page) || 0;
      var shown = Number(l.content_known) > 0 ? cnt(l.before_content, l.content_known) : '<span class="dt-na">non mesuré</span>';
      return { cls: n >= 20 && one / n >= 0.75 ? "row-warn" : "",
        cells: [esc(H.landingName(l.page, l.site)), cnt(n), cnt(one, n), esc(H.fmtDur(l.median_sec)), shown, cnt(l.lang_mismatch, n)] };
    })) + '<p class="note">Lignes en orange : au moins 20 arrivées et 3 sur 4 repartent sans voir une autre page.</p>'
      + noteHtml(sinceNote(d.quality && d.quality.since && d.quality.since.content, "contenu affiché"));
  }

  function renderLangs(d) {
    var el = $("langs"), list = d.languages || [];
    if (!list.length) { el.innerHTML = emptyHtml("Aucun visiteur sur cette période", ""); return; }
    var t = d.totals || {};
    var cols = [{ label: "Téléphone réglé en" }, { label: "A lu le site", num: false }, { label: "Visiteurs", num: true }, { label: "Utiles", num: true }, { label: "Partis sans 2e page", num: true }];
    el.innerHTML = '<p class="err-sum">' + esc(H.fmtInt(t.lang_mismatch) + " visiteur" + (Number(t.lang_mismatch) > 1 ? "s" : "") + " sur " + H.fmtInt(t.sessions) + " (" + pctTxt(t.lang_mismatch, t.sessions) + ") ont lu le site dans une autre langue que celle de leur téléphone.") + "</p>"
      + tableHtml(cols, list.slice(0, 14).map(function (l) {
        var n = Number(l.sessions) || 0;
        return { cls: l.mismatch ? "row-warn" : "", cells: [esc(l.lang ? H.langName(l.lang) : "langue inconnue"), esc(H.siteLangText(l.site)), cnt(n), cnt(l.useful, n), cnt(l.one_page, n)] };
      }));
  }

  function flowHtml(steps) {
    var first = Number(steps[0].value) || 0;
    var html = '<ol class="steps flow">';
    steps.forEach(function (s, i) {
      if (s.value === null) {
        html += '<li class="step step-na"><span class="step-name">' + esc(s.label) + (s.help ? "<small>" + esc(s.help) + "</small>" : "")
          + '</span><span class="step-num"><span>pas encore mesuré</span></span><span class="step-bar" aria-hidden="true"><i style="width:0"></i></span></li>';
        return;
      }
      var v = Number(s.value) || 0;
      var w = first ? Math.max(0, Math.min(100, (v / first) * 100)) : 0;
      html += '<li class="step' + (s.bad && v > 0 ? " step-leak" : "") + '"><span class="step-name">' + esc(s.label) + (s.help ? "<small>" + esc(s.help) + "</small>" : "")
        + '</span><span class="step-num"><b class="tnum">' + esc(H.fmtInt(v)) + "</b>" + (i > 0 && first && !s.bad ? '<span class="tnum">' + esc(pctTxt(v, first)) + "</span>" : "")
        + '</span><span class="step-bar" aria-hidden="true"><i style="width:' + w.toFixed(1) + '%"></i></span></li>';
    });
    return html + "</ol>";
  }
  function reasonsHtml(list, keyName, title) {
    if (!list || !list.length) return "";
    return '<h3 class="flow-sub">' + esc(title) + '</h3><ul class="bars">' + list.map(function (r) {
      return '<li class="bar-row"><span class="bar-name">' + esc(H.failReason(r[keyName])) + '</span><span class="bar-val tnum">' + esc(H.fmtInt(r.n)) + "</span></li>";
    }).join("") + "</ul>";
  }
  function renderSignupFlow(d) {
    var el = $("signupFlow"), s = d.signup || {};
    if (!Number(s.page) && !Number(s.completed)) { el.innerHTML = emptyHtml("Personne n'a ouvert l'inscription sur cette période", ""); return; }
    var steps = [
      { label: "Page d'inscription ouverte", value: s.page },
      { label: "A commencé à remplir", value: s.form_started, help: "a tapé au moins une lettre" },
      { label: "A envoyé le formulaire", value: s.submitted },
      { label: "Compte créé", value: s.completed }
    ];
    var started = d.quality && d.quality.since && d.quality.since.signup_form;
    // Mesure plus recente que la periode : « pas encore mesure » plutot qu'un 0 trompeur.
    if (!started || (S.range && H.parisToday(new Date(started)) > S.range.from)) { steps[1].value = null; steps[2].value = null; }
    el.innerHTML = flowHtml(steps)
      + (Number(s.failed) ? '<p class="leak-box">' + esc(H.fmtInt(s.failed) + " visiteur" + (Number(s.failed) > 1 ? "s ont" : " a") + " vu une erreur en s'inscrivant.") + "</p>" : "")
      + reasonsHtml(s.reasons, "code", "Pourquoi l'inscription a été refusée")
      + noteHtml(sinceNote(started, "formulaire"));
  }
  function renderPayFlow(d) {
    var el = $("payFlow"), p = d.payment || {};
    var steps = [
      { label: "Panneau Pro vu", value: p.gate, help: "le panneau « Débloquer » est resté affiché au moins 1 s" },
      { label: "Offre Pro ouverte", value: p.offer, help: "page abonnement ou offre" },
      { label: "Case des conditions cochée", value: p.consent },
      { label: "A cliqué pour payer", value: p.click },
      { label: "Abonné", value: p.success, help: "page de confirmation Stripe" }
    ];
    var html = flowHtml(steps);
    if (Number(p.failed)) html += '<p class="leak-box">' + esc(H.fmtInt(p.failed) + " visiteur" + (Number(p.failed) > 1 ? "s" : "") + " : le paiement n'a pas pu s'ouvrir.") + "</p>";
    if (Number(p.cancel)) html += '<p class="note">' + esc(H.fmtInt(p.cancel) + " retour" + (Number(p.cancel) > 1 ? "s" : "") + " depuis Stripe sans payer (bouton « retour » sur la page de paiement).") + "</p>";
    el.innerHTML = html + reasonsHtml(p.reasons, "reason", "Pourquoi le paiement n'a pas pu s'ouvrir")
      + noteHtml(sinceNote(d.quality && d.quality.since && d.quality.since.checkout_failed, "paiement qui échoue"));
  }

  function renderMoney(d) {
    var el = $("money"), m = d.money || {};
    var MARKET = { fr: "France (€)", gb: "Royaume-Uni (£)", za: "Afrique du Sud (R)", mx: "Mexique ($)", us: "États-Unis ($)" };
    var INTERVAL = { month: "au mois", week: "à la semaine", year: "à l'année", day: "au jour" };
    var mrr = S.revenue ? H.mrrText(S.revenue) : S.revenueLoading ? "…" : "—";
    var paid = S.business ? H.revenueText(S.business) : null;
    var tiles = [
      { v: mrr, l: "revenu mensuel des abonnements en cours (lu chez Stripe)", big: true },
      { v: paid || "—", l: "encaissé · " + (S.range ? S.range.label : "période") },
      { v: H.fmtInt(m.active), l: "abonnés Pro en cours" },
      { v: H.fmtInt(m.new_in_period), l: "nouveaux abonnés · " + (S.range ? S.range.label : "période") },
      { v: H.fmtInt(m.canceled_in_period), l: "abonnements terminés · " + (S.range ? S.range.label : "période") },
      { v: H.fmtInt(m.cancel_planned), l: "résiliations prévues (encore Pro)" },
      { v: H.fmtInt(m.past_due), l: "paiements en retard (carte refusée)" }
    ];
    var detail = [];
    if (Number(m.trialing)) detail.push(H.fmtInt(m.trialing) + " en essai");
    Object.keys(m.by_market || {}).forEach(function (k) { detail.push(H.fmtInt(m.by_market[k]) + " " + (MARKET[k] || k)); });
    Object.keys(m.by_interval || {}).forEach(function (k) { detail.push(H.fmtInt(m.by_interval[k]) + " " + (INTERVAL[k] || k)); });
    el.innerHTML = '<div class="money">' + tiles.map(function (t) {
      return '<div class="money-tile' + (t.big ? " big" : "") + '"><b class="tnum">' + esc(t.v) + "</b><span>" + esc(t.l) + "</span></div>";
    }).join("") + "</div>" + (detail.length ? '<p class="note">' + esc("Abonnés en cours : " + detail.join(" · ") + ".") + "</p>" : "")
      + '<p class="note">' + esc("Résiliés depuis le lancement : " + H.fmtInt(m.canceled_total) + ".") + "</p>";
  }

  function renderQuality(d) {
    var el = $("quality"), q = d.quality || {}, since = q.since || {};
    var EV = { page_view: "Pages vues", page_leave: "Départs de page (temps, vitesse)", click: "Clics", gate_view: "Panneaux Pro vus", signup_started: "Inscriptions ouvertes",
      signup_completed: "Comptes créés", login_completed: "Connexions", js_error: "Pannes", signup_form_started: "Formulaires commencés", signup_submitted: "Formulaires envoyés",
      signup_failed: "Inscriptions refusées", checkout_failed: "Paiements bloqués", checkout_started: "Paiements lancés", checkout_success_view: "Paiements confirmés", checkout_cancel_view: "Retours sans payer" };
    var last = q.last_event_at;
    var hours = last ? (Date.now() - Date.parse(last)) / 36e5 : null;
    var lastLine = last ? "Dernière donnée reçue " + fmtDay(last).toLowerCase() + " à " + fmtTime(last) + (hours !== null && hours > 6 ? " : rien depuis plus de 6 h, vérifie que le site tourne." : ".") : "Aucune donnée reçue.";
    var sessions = Number(q.sessions) || 0;
    var facts = [
      lastLine,
      H.fmtInt(q.excluded_sessions) + " visites retirées (robots, tests, ton appareil, comptes internes).",
      H.fmtInt(q.direct) + " visiteurs sur " + H.fmtInt(sessions) + " sans provenance connue (« Direct »).",
      H.fmtInt(q.no_leave) + " visiteurs sans temps mesuré (téléphone fermé brutalement ou navigateur qui bloque l'envoi)."
    ];
    var news = [
      ["Pannes du site", since.js_error], ["Vitesse d'affichage", since.vitals], ["Matchs affichés ou pas", since.content],
      ["Formulaire d'inscription", since.signup_form], ["Publication précise (utm_content)", since.utm_content], ["Paiement bloqué", since.checkout_failed]
    ];
    el.innerHTML = '<ul class="checks">' + facts.map(function (f, i) {
      return '<li class="check ' + (i === 0 && hours !== null && hours > 6 ? "warn" : "ok") + '"><span class="check-dot" aria-hidden="true"></span><div><p>' + esc(f) + "</p></div></li>";
    }).join("") + "</ul>"
      + '<h3 class="flow-sub">Mesures ajoutées le 19/10/2026</h3><ul class="checks">' + news.map(function (n) {
        return '<li class="check ' + (n[1] ? "ok" : "warn") + '"><span class="check-dot" aria-hidden="true"></span><div><b>' + esc(n[0]) + "</b><p>" + esc(n[1] ? "Premières données le " + fmtDateTime(n[1]) + "." : "En attente des premières données (aucun cas encore).") + "</p></div></li>";
      }).join("") + "</ul>"
      + '<h3 class="flow-sub">Données reçues sur la période</h3><ul class="bars">' + (q.events || []).map(function (e) {
        return '<li class="bar-row"><span class="bar-name">' + esc(EV[e.event_type] || e.event_type) + '</span><span class="bar-val tnum">' + esc(H.fmtInt(e.n)) + "<small>" + esc("dernière " + fmtTime(e.last_at)) + "</small></span></li>";
      }).join("") + "</ul>";
  }

  // ---------- Bandeaux ----------
  function renderNotices() {
    var bits = [];
    if (S.period === "custom" && S.range) bits.push("période " + S.range.label);
    if (S.site) bits.push("version " + H.siteLabel(S.site));
    if (S.device) bits.push(H.deviceLabel(S.device).toLowerCase());
    if (S.source) bits.push("source " + H.sourceLabel(S.source));
    $("noticeFilters").hidden = !bits.length;
    $("noticeFiltersText").textContent = bits.length ? "Filtre actif : " + bits.join(" · ") + ". Les chiffres ne montrent qu'une partie des visiteurs." : "";
  }
  function renderAll() {
    renderNotices();
    renderHero();
    renderCards();
    renderDaily();
    renderHealth();
    renderFunnel();
    renderSources();
    renderPlaces();
    renderLive();
    renderPages();
    renderMatches();
    renderBots();
    renderDevice();
    renderVisits();
    renderSignups();
  }

  // ---------- Chargement ----------
  function setBusy(busy) {
    S.loading = busy;
    var b = $("refreshBtn");
    b.disabled = busy;
    b.classList.toggle("busy", busy);
    b.setAttribute("aria-busy", String(busy));
  }
  function syncControls() {
    Array.prototype.forEach.call(document.querySelectorAll("#periodSeg button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-period") === S.period)); });
    var today = H.parisToday(new Date());
    var single = !!(S.range && S.range.days === 1);
    $("dayNav").hidden = !single;
    if (single) {
      $("dayNavLabel").textContent = S.range.from === today ? "Aujourd'hui" : H.dayTitleOf(S.range.from);
      $("dayNext").disabled = S.range.to >= today;
      $("dayPrev").disabled = S.range.from <= H.addDays(today, -394);
    }
    $("fromDate").max = today;
    $("toDate").max = today;
    $("fromDate").value = S.period === "custom" && S.custom.from ? S.custom.from : "";
    $("toDate").value = S.period === "custom" && S.custom.to ? S.custom.to : "";
    $("siteFilter").value = S.site;
    $("deviceFilter").value = S.device;
    $("sourceFilter").value = S.source;
  }

  function loadAll(opts) {
    opts = opts || {};
    if (S.loading || !sb) return Promise.resolve();
    setBusy(true);
    var today = H.parisToday(new Date());
    S.range = H.periodRange(S.period, today, S.period === "day" ? { from: S.day } : S.custom);
    syncControls();
    var r = S.range, isToday = r.from === today && r.to === today;
    var calls = [
      rpc("admin_analytics", analyticsArgs(today, today)),
      rpc("admin_analytics", analyticsArgs(H.addDays(today, -7), H.addDays(today, -1))),
      isToday ? null : rpc("admin_analytics", analyticsArgs(r.from, r.to)),
      rpc("admin_business", { p_days: 1, p_from: today, p_to: today }),
      isToday ? null : rpc("admin_business", { p_days: r.days, p_from: r.from, p_to: r.to }),
      rpc("admin_recent_sessions", merge({ p_limit: 100, p_include_internal: false, p_from: r.from, p_to: r.to, p_since: H.LAUNCH_AT }, filterArgs())),
      rpc("admin_recent_signups", { p_limit: 60 }),
      rpc("admin_health")
    ];
    return Promise.all(calls.map(function (c) { return c || Promise.resolve(null); })).then(function (res) {
      if (res.some(function (x) { return x && x.kind === "denied"; })) { setBusy(false); showState("denied"); return null; }
      var aToday = res[0], aWeek = res[1], aPeriod = res[2] || res[0], bToday = res[3], bPeriod = res[4] || res[3];
      S.today = aToday.data || null;
      S.week = aWeek.data || null;
      S.analytics = aPeriod.data || null;
      S.analyticsError = aPeriod.data ? null : aPeriod;
      S.bizToday = bToday.data || null;
      S.business = bPeriod.data || null;
      S.sessions = res[5].data || null;
      S.sessionsError = res[5].data ? null : res[5];
      S.signups = res[6];
      S.health = res[7].data || null;
      S.healthError = !res[7].data;
      S.botSample = null;
      var extra = [];
      // Sans 0022 : raisons estimees sur les dernieres visites retirees.
      if (S.analytics && !Array.isArray(S.analytics.internal_reasons) && Number(S.analytics.internal_sessions) > 0) {
        extra.push(rpc("admin_recent_sessions", merge({ p_limit: 200, p_include_internal: true, p_from: r.from, p_to: r.to, p_since: H.LAUNCH_AT }, filterArgs())).then(function (x) {
          S.botSample = x.data ? x.data.filter(function (s) { return s.is_internal || s.internal_reason; }) : null;
        }));
      }
      // admin_business absente : repli sur admin_stats (nombre de comptes Pro).
      if (!S.business && bPeriod.kind === "missing") {
        extra.push(rpc("admin_stats").then(function (x) { S.stats = x.data || null; }));
      }
      return Promise.all(extra);
    }).then(function (ok) {
      if (ok === null) return;
      showState("dash");
      var failed = !S.analytics && S.analyticsError;
      $("noticeError").hidden = !failed;
      $("noticeErrorText").textContent = failed ? errorText(S.analyticsError.kind, S.analyticsError.error, "Statistiques") : "";
      renderAll();
      $("updatedAt").textContent = "Mis à jour à " + fmtTime(new Date().toISOString()) + " (toutes les heures sont celles de Paris) · « Qui est là maintenant » se rafraîchit toutes les 30 s";
      var c = S.analytics && S.analytics.coverage;
      $("footCoverage").textContent = "Suivi des visites démarré le " + fmtDateTime((c && c.launch_at) || H.LAUNCH_AT) + " (heure de Paris). Les données sont gardées 13 mois.";
      setBusy(false);
      refreshNames();
      loadMembers();
      loadUnlocks();
      loadDrop();
      loadDiag();
      loadRevenue();
      loadPartners();
      if (!opts.silent) return loadLive().then(startTimers);
    }).catch(function (e) {
      setBusy(false);
      showState("dash");
      S.analyticsError = { kind: errKind(e) || "error", error: e };
      $("noticeError").hidden = false;
      $("noticeErrorText").textContent = errorText(S.analyticsError.kind, e, "Statistiques");
      if (!opts.silent) startTimers();
    });
  }

  // MRR et etat Stripe (fonction Edge admin-revenue). Jamais bloquant : la
  // carte affiche « — » tant que la reponse n'est pas arrivee, et le reste
  // du tableau de bord vit sa vie.
  function loadRevenue() {
    if (!sb || !sb.functions || typeof sb.functions.invoke !== "function" || S.revenueLoading) return;
    S.revenueLoading = true;
    sb.functions.invoke("admin-revenue", { body: {} }).then(function (r) {
      S.revenueLoading = false;
      if (!(r && r.data && r.data.ok) && S.diag && S.diag.data) renderMoney(S.diag.data);
      if (r && r.data && r.data.ok) {
        S.revenue = r.data;
        renderCards();
        if (S.diag && S.diag.data) renderMoney(S.diag.data);
      }
    }, function () { S.revenueLoading = false; if (S.diag && S.diag.data) renderMoney(S.diag.data); });
  }

  function loadLive() {
    if (!sb || S.liveLoading) return Promise.resolve();
    S.liveLoading = true;
    return rpc("admin_live_view", merge({ p_include_internal: true }, filterArgs())).then(function (r) {
      S.liveLoading = false;
      if (r.kind === "denied") { showState("denied"); return; }
      if (r.data) {
        S.live = r.data;
        S.liveError = null;
        renderLive();
        renderCards();
        var ids = (S.live.visitors || []).map(function (v) { return v.match_id; }).filter(Boolean);
        if (ids.some(function (id) { return !S.names[id]; })) loadMissingNames(ids).then(function (changed) { if (changed) renderLive(); });
      } else {
        S.live = null;
        S.liveError = r;
        $("liveChip").hidden = true;
        renderLive();
      }
    });
  }
  function startTimers() {
    stopTimers();
    S.liveTimer = setInterval(function () { if (!document.hidden) loadLive(); }, LIVE_EVERY_MS);
    S.fullTimer = setInterval(function () { if (!document.hidden && !S.loading) loadAll({ silent: true }); }, FULL_EVERY_MS);
  }
  function stopTimers() {
    if (S.liveTimer) clearInterval(S.liveTimer);
    if (S.fullTimer) clearInterval(S.fullTimer);
    S.liveTimer = null;
    S.fullTimer = null;
  }

  // ---------- Retirer une visite ----------
  var pending = null;
  function askExclusion(sessionId) {
    var s = (S.sessions || []).filter(function (x) { return x.session_id === sessionId; })[0];
    pending = sessionId;
    $("confirmText").textContent = "« " + (s ? H.sessionSentence(s) : "Cette visite") + " » ne sera plus comptée dans tes chiffres. Rien n'est supprimé : ton développeur peut la remettre si besoin.";
    var dlg = $("confirmDialog");
    if (dlg && typeof dlg.showModal === "function") {
      dlg.showModal();
      $("confirmCancel").focus();
    } else if (window.confirm($("confirmText").textContent)) {
      runExclusion();
    }
  }
  function runExclusion() {
    var id = pending;
    pending = null;
    var dlg = $("confirmDialog");
    if (dlg && dlg.open) dlg.close();
    if (!id) return;
    rpc("admin_exclude_session", { p_session_id: id, p_exclude: true }).then(function (r) {
      if (r.kind === "denied") { showState("denied"); return; }
      if (r.error) { toast(r.kind === "invalid" ? "Cette visite ne peut pas être retirée (identifiant invalide)." : errorText(r.kind, r.error, "Retirer la visite")); return; }
      toast("Visite retirée des chiffres. Les chiffres sont recalculés.");
      S.openVisit = null;
      loadAll({ silent: true });
    });
  }

  // ---------- Evenements ----------
  function resetFilters() {
    S.site = ""; S.device = ""; S.source = "";
    if (S.period === "custom") S.period = "today";
    loadAll({ silent: true });
  }
  function wire() {
    $("stateErrorRetry").addEventListener("click", function () { window.location.reload(); });
    $("refreshBtn").addEventListener("click", function () { loadAll({ silent: true }); loadLive(); });
    $("periodSeg").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-period]");
      if (!b) return;
      var p = b.getAttribute("data-period");
      if (p === S.period) return;
      S.period = p;
      savePrefs();
      loadAll({ silent: true });
    });
    $("dayPrev").addEventListener("click", function () { if (S.range) openDay(H.addDays(S.range.from, -1)); });
    $("dayNext").addEventListener("click", function () { if (S.range) openDay(H.addDays(S.range.from, 1)); });
    $("daily").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-day]");
      if (b) { openDay(b.getAttribute("data-day")); window.scrollTo({ top: 0, behavior: "smooth" }); }
    });
    $("applyRange").addEventListener("click", function () {
      var f = $("fromDate").value, t = $("toDate").value;
      if (!H.ymdOk(f)) { toast("Choisis d'abord une date de début."); $("fromDate").focus(); return; }
      S.custom = { from: f, to: H.ymdOk(t) ? t : f };
      S.period = "custom";
      loadAll({ silent: true });
    });
    [["siteFilter", "site"], ["deviceFilter", "device"], ["sourceFilter", "source"]].forEach(function (x) {
      $(x[0]).addEventListener("change", function (ev) { S[x[1]] = ev.target.value; loadAll({ silent: true }); loadLive(); });
    });
    $("noticeFiltersReset").addEventListener("click", function () { resetFilters(); loadLive(); });
    [["dropCountry", "country"], ["dropDevice", "device"], ["dropSource", "source"]].forEach(function (x) {
      $(x[0]).addEventListener("change", function (ev) { S.drop[x[1]] = ev.target.value; loadDrop(); });
    });
    $("deviceBtn").addEventListener("click", toggleDevice);
    $("noticeDeviceClose").addEventListener("click", function () {
      $("noticeDevice").hidden = true;
      try { localStorage.setItem("iashark_admin_device_notice", "1"); } catch (e) {}
    });
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t.closest) return;
      if (t.closest("button[data-retry]")) { loadAll({ silent: true }); loadLive(); return; }
      var pa = t.closest("button[data-pa-to]");
      if (pa) { if (!pa.disabled) askPartner(pa.getAttribute("data-pa-id"), pa.getAttribute("data-pa-to")); return; }
      var info = t.closest("button.info");
      if (info) {
        var id = info.getAttribute("aria-controls"), panel = id && document.getElementById(id);
        if (!panel) return;
        var open = info.getAttribute("aria-expanded") !== "true";
        info.setAttribute("aria-expanded", String(open));
        panel.hidden = !open;
        if (open) S.openHelp[id] = true; else delete S.openHelp[id];
        return;
      }
      var ex = t.closest("button[data-exclude]");
      if (ex) { askExclusion(ex.getAttribute("data-exclude")); return; }
      if (t.closest("#visitsMore")) { S.visitLimit += 20; renderVisits(); return; }
      if (t.closest("#signupsMore")) { S.signupLimit += 15; renderSignups(); return; }
      if (t.closest("#membersEmails")) { S.showEmails = !S.showEmails; renderMemberList(S.members && S.members.data); return; }
      if (t.closest("#membersMore")) { S.memberLimit += 25; renderMemberList(S.members && S.members.data); return; }
      var mrow = t.closest("button.m-row");
      if (mrow) { toggleMember(mrow); return; }
      var row = t.closest("button.v-row");
      if (row) {
        var i = Number(row.getAttribute("data-v")), s = (S.sessions || [])[i];
        if (!s) return;
        var detail = document.getElementById("vd" + i), open2 = row.getAttribute("aria-expanded") !== "true";
        row.setAttribute("aria-expanded", String(open2));
        detail.hidden = !open2;
        detail.innerHTML = open2 ? visitDetail(s) : "";
        S.openVisit = open2 ? visitKey(s, i) : null;
      }
    });
    $("confirmOk").addEventListener("click", runExclusion);
    $("confirmCancel").addEventListener("click", function () { pending = null; $("confirmDialog").close(); });
    $("confirmDialog").addEventListener("close", function () { pending = null; });
    $("partnerOk").addEventListener("click", runPartner);
    $("partnerCancel").addEventListener("click", function () { pendingPartner = null; $("partnerDialog").close(); });
    $("partnerDialog").addEventListener("close", function () { pendingPartner = null; });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && S.liveTimer) loadLive(); });
    if (typeof window.addEventListener === "function") window.addEventListener("hashchange", function () { applyScreen(window.location.hash); });
  }

  // ---------- Demarrage ----------
  // Premier passage sur le tableau de bord : l'appareil est exclu d'office,
  // sauf si le proprietaire a choisi « Compter a nouveau cet appareil ».
  function markInternalBrowser() {
    try {
      if (localStorage.getItem(INTERNAL_CHOICE_KEY) === "off") return;
      localStorage.setItem(INTERNAL_KEY, "1");
      if (localStorage.getItem("iashark_admin_device_notice") !== "1") $("noticeDevice").hidden = false;
    } catch (e) {}
  }
  function init() {
    loadPrefs();
    loadNamesCache();
    wire();
    try { applyScreen(window.location && window.location.hash, false); } catch (e) {}
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      showState("error", "Le module de connexion (Supabase) n'a pas pu se charger. Vérifie ta connexion Internet ou désactive le bloqueur de publicités pour cette page, puis recharge.");
      return;
    }
    try {
      sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    } catch (e) {
      showState("error", "La connexion n'a pas pu démarrer. Recharge la page.");
      return;
    }
    sb.auth.getSession().then(function (res) {
      if (!res || !res.data || !res.data.session) { showState("denied"); return null; }
      return sb.from("users").select("role").eq('id', res.data.session.user.id).maybeSingle();
    }).then(function (ures) {
      if (!ures) return;
      if (ures.error) {
        var kind = errKind(ures.error);
        if (kind === "denied") showState("denied");
        else showState("error", kind === "network" ? "Pas de connexion au serveur. Vérifie ta connexion Internet, puis recharge la page." : "Impossible de vérifier ton compte pour le moment. Recharge la page dans une minute.");
        return;
      }
      if (!ures.data || ures.data.role !== 'admin') { showState("denied"); return; }
      markInternalBrowser();
      showState("dash");
      loadHome();
      return loadAll();
    }).catch(function () {
      showState("error", "Impossible de vérifier ton compte pour le moment. Recharge la page dans une minute.");
    });
  }

  init();
})();
