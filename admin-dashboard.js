/* IASHARK - Tableau de bord admin (admin.html).
 *
 * Deux parties :
 * 1) Helpers PURS (noms de pages lisibles, regroupement des sources, formats,
 *    CSV, phrases de parcours, resume) : exportes pour les tests Node
 *    (tests/admin-dashboard.test.js) et exposes en window.IasharkAdminHelpers.
 * 2) Application navigateur : garde admin, appels RPC Supabase (migration
 *    0019_admin_dashboard_v2.sql, repli sur 0015 si elle n'est pas appliquee),
 *    rendu, graphiques Chart.js, tableaux triables, export CSV.
 *
 * SECURITE : toute valeur issue de funnel_events (ecrite par la cle anon
 * publique, donc controlee par le visiteur) passe par esc() avant d'entrer
 * dans le HTML. Aucun innerHTML n'est construit sans esc() sur les donnees.
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
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits == null ? 1 : digits }).format(n) + " %";
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

  // Variation vs periode precedente.
  function fmtDelta(cur, prev, opts) {
    opts = opts || {};
    var c = num(cur), p = num(prev);
    if (opts.previousComplete === false) return { dir: "none", text: "", good: null };
    if (c === null || p === null) return { dir: "none", text: "—", good: null };
    var diff = c - p;
    if (opts.points) {
      if (Math.abs(diff) < 0.05) return { dir: "flat", text: "=", good: null };
      var pts = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Math.abs(diff));
      return { dir: diff > 0 ? "up" : "down", text: (diff > 0 ? "+" : "−") + pts + " pt", good: opts.lowerIsBetter ? diff < 0 : diff > 0 };
    }
    if (p === 0) return c === 0 ? { dir: "flat", text: "=", good: null } : { dir: "new", text: "nouveau", good: null };
    var pct = Math.round((diff / p) * 100);
    if (pct === 0) return { dir: "flat", text: "=", good: null };
    return { dir: pct > 0 ? "up" : "down", text: (pct > 0 ? "+" : "−") + NF.format(Math.abs(pct)) + " %", good: opts.lowerIsBetter ? pct < 0 : pct > 0 };
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
  function siteFlag(key) {
    return SITES[key] && SITES[key].country ? flagEmoji(SITES[key].country) : "🌐";
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
  function fromCountry(code) {
    if (!isCountry(code)) return null;
    var p = prep(code), n = countryName(code);
    if (p === "au") return "du " + n;
    if (p === "aux") return "des " + n;
    if (p === "à") return "de " + n;
    return /^[aeiouyâéèêîôû]/i.test(n) ? "d'" + n : "de " + n;
  }

  var DEVICE_LABELS = { mobile: "Mobile", tablet: "Tablette", desktop: "Ordinateur" };
  function deviceLabel(key) { return DEVICE_LABELS[key] || "Appareil inconnu"; }

  // ---------- Sources ----------
  // MEMES regles (memes expressions, meme ordre) que public.admin_source_group
  // dans supabase/migrations/0019_admin_dashboard_v2.sql (test de parite).
  var SOURCE_RULES = [
    ["whatsapp", "whatsapp|^wa\\.me$"],
    ["tiktok", "tiktok|musical\\.ly|bytedance|^tt$"],
    ["instagram", "instagram|^ig$"],
    ["facebook", "facebook|^fb$|(^|\\.)fb\\.com$|^m\\.me$|messenger"],
    ["x", "^t\\.co$|twitter|^x$|(^|\\.)x\\.com$"],
    ["google", "(^|\\.)google(\\.|$)|googlequicksearchbox"],
    ["bing", "(^|\\.)bing(\\.|$)"]
  ];
  var SOURCE_RES = SOURCE_RULES.map(function (r) { return [r[0], new RegExp(r[1])]; });
  var SOURCE_LABELS = {
    tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", google: "Google", bing: "Bing",
    x: "X / Twitter", whatsapp: "WhatsApp", direct: "Direct", other: "Autres sites"
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
  function pageInfo(path, matchId, names) {
    var raw = path == null ? "" : String(path);
    if (!raw) return { title: "Page inconnue", base: "Page inconnue", site: null, kind: "unknown", matchId: null, raw: "" };
    var p = normalizePath(raw);
    var q = raw.match(/[?&]id=(\d{1,12})(?:[&#]|$)/);
    var m = p.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)(?=\/|$)/);
    var site = m ? m[1] : "fr";
    var rest = p.slice(m ? m[0].length : 0).replace(/^\/+|\/+$/g, "");
    var id = /^\d{1,12}$/.test(String(matchId == null ? "" : matchId)) ? String(matchId) : (q ? q[1] : null);
    var mm = rest.match(/^match\/(\d{1,12})$/);
    if (mm) { id = mm[1]; rest = "match"; }
    var kind = "page", base, seg;
    if (rest === "match") {
      kind = "match";
      var nm = id ? matchName(id, names) : null;
      base = nm ? "Match : " + nm : id ? "Match n° " + id : "Page match";
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
    return { title: base + suffix, base: base, site: site, kind: kind, matchId: kind === "match" ? id : null, raw: raw };
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

  // ---------- CSV (separateur ; pour Excel en francais) ----------
  function csvCell(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "oui" : "non";
    if (typeof v === "number") return isFinite(v) ? String(v).replace(".", ",") : "";
    var s = String(v);
    // Anti-injection de formule (donnees visiteur ouvertes dans un tableur).
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[";,\r\n]/.test(s) || /^\s|\s$/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCsv(columns, rows) {
    var lines = [columns.map(function (c) { return csvCell(c.label); }).join(";")];
    (rows || []).forEach(function (r) {
      lines.push(columns.map(function (c) { return csvCell(c.csv ? c.csv(r) : r[c.key]); }).join(";"));
    });
    return lines.join("\r\n");
  }

  // ---------- Dates et periodes ----------
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
    if (key === "today") { from = to = today; label = "Aujourd'hui"; compare = "Comparé à hier à la même heure"; }
    else if (key === "yesterday") { from = to = addDays(today, -1); label = "Hier"; compare = "Comparé à avant-hier"; }
    else if (key === "7" || key === "30" || key === "90") {
      var n = Number(key);
      from = addDays(today, -(n - 1)); to = today;
      label = n + " derniers jours"; compare = "Comparé aux " + n + " jours d'avant";
    } else if (key === "custom" && custom && ymdOk(custom.from)) {
      from = custom.from;
      to = ymdOk(custom.to) ? custom.to : custom.from;
      if (from > to) { var t = from; from = to; to = t; }
      if (to > today) to = today;
      if (from > today) from = today;
      if (daysBetween(from, to) > 394) from = addDays(to, -394);
      label = from === to ? "Le " + fmtYmd(from) : "Du " + fmtYmd(from) + " au " + fmtYmd(to);
      compare = "Comparé à la période de même durée juste avant";
    } else {
      return periodRange("7", today);
    }
    var legacy = { today: 1, "7": 7, "30": 30, "90": 90 };
    return { key: key, from: from, to: to, days: daysBetween(from, to) + 1, label: label, compare: compare, legacyDays: legacy[key] || null };
  }
  // Bucket SQL sans fuseau ("2026-09-14T15:00:00", heure de Paris).
  function bucketLabel(t, hourly, long) {
    var m = String(t == null ? "" : t).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/);
    if (!m) return String(t == null ? "" : t);
    var h = Number(m[4]);
    if (hourly) return long ? h + " h – " + (h + 1) + " h" : h + " h";
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
    return d.toLocaleDateString("fr-FR", long ? { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" } : { timeZone: "UTC", day: "numeric", month: "short" });
  }

  // ---------- Phrases ----------
  var DEVICE_WORDS = { mobile: "mobile", tablet: "tablette", desktop: "ordinateur" };
  function sessionSentence(s) {
    s = s || {};
    var parts = [];
    var where = inCountry(s.country);
    parts.push(where ? "Visiteur " + where : "Visiteur (pays inconnu)");
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
  function topOf(list, key, total) {
    var best = null;
    (list || []).forEach(function (r) {
      if (!r || r[key] === null || r[key] === undefined) return;
      var v = Number(r.visitors) || 0;
      if (!best || v > best.value) best = { key: r[key], value: v };
    });
    if (!best || !best.value) return null;
    best.share = total ? best.value / total : 0;
    return best;
  }
  function summarize(a, ctx) {
    ctx = ctx || {};
    var label = ctx.label || "Sur la période";
    if (!a || !a.kpis) return label + " : données indisponibles pour le moment.";
    var k = a.kpis, v = Number(k.visitors) || 0;
    if (!v) return label + " : aucun visiteur enregistré" + (ctx.filtered ? " avec ces filtres." : " pour l'instant.");
    var head = label + " : " + fmtInt(v) + " visiteur" + (v > 1 ? "s" : "");
    var d = fmtDelta(k.visitors, a.previous && a.previous.visitors, { previousComplete: !(a.range && a.range.previous_complete === false) });
    if (d.dir === "up" || d.dir === "down") head += " (" + d.text + ")";
    else if (d.dir === "flat") head += " (stable)";
    var where = topOf(a.countries, "country", v);
    var via = topOf(a.sources, "source_group", v);
    var bits = "";
    if (where && isCountry(where.key)) bits += (where.share >= 0.5 ? ", surtout " : ", d'abord ") + fromCountry(where.key);
    if (via) {
      var viaText = via.key === "direct" ? "en accès direct" : "via " + sourceLabel(via.key);
      bits += bits ? " " + viaText : (via.share >= 0.5 ? ", surtout " : ", d'abord ") + viaText;
    }
    var signups = Number(k.signups) || 0;
    var tail = ", " + (signups ? fmtInt(signups) + " inscription" + (signups > 1 ? "s" : "") : "aucune inscription");
    var paid = Number(k.checkout_success) || 0;
    if (paid) tail += ", " + fmtInt(paid) + " paiement" + (paid > 1 ? "s" : "") + " réussi" + (paid > 1 ? "s" : "");
    var out = head + bits + tail + ".";
    var top = (a.top_pages || [])[0];
    if (top && Number(top.views) > 0) out += " Page la plus vue : " + pageInfo(top.page, top.match_id, ctx.names).title + ".";
    return out;
  }

  // ---------- Agregats pour l'affichage ----------
  // Tunnel d'achat (accueil -> match -> abonnement -> paiement) et tunnel
  // d'inscription. Une etape absente de la reponse (repli 0015) vaut null :
  // affichee "—", jamais inventee.
  var FUNNELS = {
    purchase: [
      ["visitors", "Visite", "a vu au moins une page"],
      ["home_page", "Accueil", "a vu une page d'accueil"],
      ["match_page", "Page match", "a ouvert l'analyse d'un match"],
      ["pricing_page", "Abonnement", "a vu les offres Pro"],
      ["checkout_started", "Paiement commencé", "a cliqué sur le bouton de paiement"],
      ["checkout_success", "Payé", "paiement confirmé"]
    ],
    signup: [
      ["visitors", "Visite", "a vu au moins une page"],
      ["signup_page", "Page inscription", "a ouvert la page d'inscription"],
      ["signed_up", "Inscrit", "a créé son compte"]
    ]
  };
  function funnelSteps(f, which) {
    f = f || {};
    var defs = FUNNELS[which] || FUNNELS.purchase;
    var first = num(f.visitors) || 0, prev;
    return defs.map(function (d, i) {
      var v = num(f[d[0]]);
      var step = {
        key: d[0], label: d[1], help: d[2], value: v,
        pctOfFirst: v === null ? null : first ? (v / first) * 100 : 0,
        pctOfPrev: i === 0 || v === null || prev === null || !(prev > 0) ? null : (v / prev) * 100
      };
      prev = v;
      return step;
    });
  }
  function pctOf(part, total) {
    var p = num(part), t = num(total);
    return p === null || t === null || t <= 0 ? null : (p / t) * 100;
  }
  // Conversions affichees dans la vue d'ensemble. Pro = nouveaux abonnements
  // Stripe de la periode (admin_business), rapportes aux visiteurs suivis et
  // aux comptes crees : deux sources differentes, d'ou le libelle "environ".
  function conversionRates(o) {
    o = o || {};
    return {
      visitToSignup: pctOf(o.signups, o.visitors),
      signupToPro: pctOf(o.newPro, o.accountsCreated),
      visitToPro: pctOf(o.newPro, o.visitors)
    };
  }
  // Fraicheur du pipeline quotidien (workflow "Update IASHARK Daily", cron
  // 06:00 UTC) d'apres generated_at de data-home.json.
  function pipelineStatus(generatedAt, now) {
    var t = generatedAt ? new Date(generatedAt).getTime() : NaN;
    if (isNaN(t)) return { level: "unknown", hours: null, text: "Date de génération inconnue" };
    var hours = Math.max(0, ((now ? new Date(now).getTime() : Date.now()) - t) / 36e5);
    var h = Math.floor(hours);
    var age = h < 1 ? "il y a moins d'une heure" : h < 48 ? "il y a " + h + " h" : "il y a " + Math.floor(h / 24) + " jours";
    if (hours <= 26) return { level: "ok", hours: hours, text: "À jour · généré " + age };
    if (hours <= 50) return { level: "warn", hours: hours, text: "En retard · généré " + age + " (une mise à jour quotidienne a été manquée)" };
    return { level: "bad", hours: hours, text: "Bloqué · généré " + age + " : vérifier le workflow GitHub « Update IASHARK Daily »" };
  }
  var DOW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  function heatmapGrid(list, binHours) {
    var bin = [1, 2, 3, 4, 6].indexOf(binHours) !== -1 ? binHours : 1;
    var cols = Math.ceil(24 / bin), max = 0;
    var rows = DOW_LABELS.map(function (label, i) {
      var cells = [];
      for (var c = 0; c < cols; c++) cells.push({ from: c * bin, to: Math.min(24, (c + 1) * bin), visitors: 0 });
      return { dow: i + 1, label: label, cells: cells };
    });
    (list || []).forEach(function (h) {
      var d = Number(h.dow), hr = Number(h.hour);
      if (!(d >= 1 && d <= 7 && hr >= 0 && hr <= 23)) return;
      var cell = rows[d - 1].cells[Math.floor(hr / bin)];
      cell.visitors += Number(h.visitors) || 0;
      if (cell.visitors > max) max = cell.visitors;
    });
    return { rows: rows, max: max, bin: bin };
  }
  function leaguesFromMatches(rows, names) {
    var map = {}, order = [];
    (rows || []).forEach(function (r) {
      var n = names && names[String(r.match_id)];
      var league = n && n.league ? String(n.league) : "Ligue inconnue";
      if (!map[league]) { map[league] = { league: league, matches: 0, views: 0, visitors: 0 }; order.push(league); }
      map[league].matches += 1;
      map[league].views += Number(r.views) || 0;
      map[league].visitors += Number(r.visitors) || 0;
    });
    return order.map(function (k) { return map[k]; }).sort(function (x, y) { return y.views - x.views; });
  }
  var REASON_LABELS = {
    excluded: "Exclue à la main", internal: "Mon trafic", qa: "Test QA",
    bot: "Robot / navigateur piloté", emulated: "Test (écran émulé)", account: "Compte admin ou de test"
  };
  function internalReasonLabel(r) { return REASON_LABELS[r] || (r ? "Trafic interne" : ""); }

  // Reponse 0015 (migration 0019 absente) convertie au format 0019.
  function legacyAnalytics(o) {
    o = o || {};
    var k = o.kpis || {}, p = o.previous || {}, f = o.funnel || {};
    function kp(x, success) {
      var vis = num(x.visitors);
      return {
        visitors: x.visitors, visits: x.sessions, page_views: x.page_views, avg_visit_sec: x.avg_visit_sec,
        bounce_rate: x.bounce_rate, signups: x.signup_sessions,
        signup_rate: vis ? Math.round((10000 * (Number(x.signup_sessions) || 0)) / vis) / 100 : null,
        checkout_started: x.checkout_sessions, checkout_success: success, multi_visit_visitors: null
      };
    }
    var merged = {}, order = [];
    (o.sources || []).forEach(function (s) {
      var rawSrc = s.source === "(direct)" ? null : s.source;
      var g = sourceGroup(rawSrc, null, null);
      if (!merged[g]) { merged[g] = { source_group: g, visitors: 0, signups: 0, checkout_success: null, examples: [] }; order.push(g); }
      merged[g].visitors += Number(s.visits) || 0;
      merged[g].signups += Number(s.signups) || 0;
      if (rawSrc && merged[g].examples.length < 8) merged[g].examples.push(rawSrc);
    });
    return {
      legacy: true,
      range: { days: o.days, granularity: o.granularity, previous_complete: true },
      kpis: kp(k, f.checkout_success),
      previous: kp(p, null),
      internal_sessions: null,
      series: (o.series || []).map(function (s) { return { t: s.t, visitors: s.visits, page_views: s.page_views }; }),
      top_pages: (o.top_pages || []).map(function (r) { return { page: r.page, match_id: null, views: r.views, visitors: r.visits, avg_sec: r.avg_sec, avg_scroll: r.avg_scroll }; }),
      top_matches: (o.top_matches || []).map(function (r) { return { match_id: r.match_id, views: r.views, visitors: r.visits, sites: null }; }),
      sources: order.map(function (g) { return merged[g]; }).sort(function (x, y) { return y.visitors - x.visitors; }),
      campaigns: (o.campaigns || []).map(function (c) { return { utm_source: c.source, medium: c.medium, campaign: c.campaign, source_group: sourceGroup(c.source, null, null), visitors: c.visits, signups: c.signups }; }),
      countries: (o.countries || []).map(function (c) { return { country: c.key, visitors: c.visits, signups: null }; }),
      sites: (o.site_versions || []).map(function (c) { return { site: c.key, visitors: c.visits, signups: null }; }),
      devices: (o.devices || []).map(function (c) { return { device: c.key, visitors: c.visits }; }),
      funnel: { visitors: f.visits, home_page: null, match_page: null, signup_page: f.signup_page, signed_up: f.signup_completed, pricing_page: f.pricing_page, checkout_started: f.checkout_started, checkout_success: f.checkout_success },
      entry_pages: null, exit_pages: null, heatmap: null
    };
  }

  return {
    TZ: TZ, LAUNCH_AT: LAUNCH_AT, SITES: SITES, SOURCE_RULES: SOURCE_RULES, SOURCE_LABELS: SOURCE_LABELS,
    esc: esc, num: num, fmtInt: fmtInt, fmtPct: fmtPct, fmtDur: fmtDur, fmtMoney: fmtMoney, fmtDelta: fmtDelta,
    isCountry: isCountry, flagEmoji: flagEmoji, siteLabel: siteLabel, siteFlag: siteFlag, countryName: countryName,
    inCountry: inCountry, fromCountry: fromCountry, deviceLabel: deviceLabel,
    sourceGroup: sourceGroup, sourceLabel: sourceLabel,
    prettySlug: prettySlug, normalizePath: normalizePath, matchName: matchName, pageInfo: pageInfo, safeHref: safeHref,
    csvCell: csvCell, toCsv: toCsv,
    ymdOk: ymdOk, addDays: addDays, daysBetween: daysBetween, parisToday: parisToday, fmtYmd: fmtYmd,
    periodRange: periodRange, bucketLabel: bucketLabel,
    sessionSentence: sessionSentence, summarize: summarize,
    funnelSteps: funnelSteps, conversionRates: conversionRates, pipelineStatus: pipelineStatus, pctOf: pctOf, heatmapGrid: heatmapGrid, leaguesFromMatches: leaguesFromMatches,
    internalReasonLabel: internalReasonLabel, legacyAnalytics: legacyAnalytics
  };
});

(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined" || !document.getElementById("dash")) return;

  var H = window.IasharkAdminHelpers;
  var esc = H.esc;
  var SUPA_URL = "https://ksvjraqitxouwiabecai.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";
  var LIVE_EVERY_MS = 15000;
  var RPC_TIMEOUT_MS = 25000;
  var PREFS_KEY = "iashark_admin_prefs_v2";
  var MIGRATION_FILE = "0019_admin_dashboard_v2.sql";

  var SOURCE_COLORS = {
    direct: "#3987e5", google: "#d95926", tiktok: "#199e70", instagram: "#c98500",
    facebook: "#d55181", x: "#008300", whatsapp: "#9085e9", bing: "#e66767", other: "#64748b"
  };
  var DEVICE_COLORS = { mobile: "#3987e5", desktop: "#d95926", tablet: "#199e70" };
  var UNKNOWN_COLOR = "#64748b";

  var sb = null;
  var S = {
    period: "today", custom: { from: null, to: null }, site: "", device: "", source: "",
    includeInternal: false, showTestPeriod: false, journeyFilter: "all",
    range: null, legacy: false, analytics: null, business: null, stats: null, sessions: null, signups: null, live: null,
    names: {}, loading: false, liveTimer: null, liveLoading: false, charts: {}, tables: {}, journeyLimit: 20, openJourney: null,
    lastLiveCount: null, tab: "apercu", health: null, home: null, dataJson: null, signupsRaw: null
  };
  var TABS = ["apercu", "direct", "audience", "pages", "conversion", "visites", "inscrits", "sante"];
  var INTERNAL_KEY = "iashark_internal";
  var INTERNAL_CHOICE_KEY = "iashark_internal_choice";

  function $(id) { return document.getElementById(id); }

  // ---------- Preferences (confort local, jamais indispensable) ----------
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (!p || typeof p !== "object") return;
      if (["today", "yesterday", "7", "30", "90", "custom"].indexOf(p.period) !== -1) S.period = p.period;
      if (p.custom && H.ymdOk(p.custom.from)) S.custom = { from: p.custom.from, to: H.ymdOk(p.custom.to) ? p.custom.to : p.custom.from };
      if (typeof p.site === "string" && /^(|fr|en|es|de|it|pt|gb|za|mx|intl)$/.test(p.site)) S.site = p.site;
      if (typeof p.device === "string" && /^(|mobile|tablet|desktop)$/.test(p.device)) S.device = p.device;
      if (typeof p.source === "string" && /^(|tiktok|instagram|facebook|google|bing|x|whatsapp|direct|other)$/.test(p.source)) S.source = p.source;
      S.includeInternal = p.includeInternal === true;
      S.showTestPeriod = p.showTestPeriod === true;
    } catch (e) {}
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        period: S.period, custom: S.custom, site: S.site, device: S.device, source: S.source,
        includeInternal: S.includeInternal, showTestPeriod: S.showTestPeriod
      }));
    } catch (e) {}
  }

  // ---------- Formats ----------
  function fmtTime(iso, withSec) {
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleTimeString("fr-FR", withSec ? { timeZone: H.TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" } : { timeZone: H.TZ, hour: "2-digit", minute: "2-digit" });
  }
  function fmtDay(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    var today = H.parisToday(new Date()), day = H.parisToday(d);
    if (day === today) return "Aujourd'hui";
    if (day === H.addDays(today, -1)) return "Hier";
    return d.toLocaleDateString("fr-FR", { timeZone: H.TZ, day: "numeric", month: "short" });
  }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleString("fr-FR", { timeZone: H.TZ, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function relTime(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return "—";
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return "il y a " + s + " s";
    var m = Math.floor(s / 60);
    if (m < 60) return "il y a " + m + " min";
    var h = Math.floor(m / 60);
    if (h < 48) return "il y a " + h + " h";
    return "il y a " + Math.floor(h / 24) + " jours";
  }
  function countryHtml(code) {
    return H.isCountry(code)
      ? '<span aria-hidden="true">' + H.flagEmoji(code) + "</span> " + esc(H.countryName(code))
      : '<span class="cell-sub">Pays inconnu</span>';
  }
  function siteHtml(key) {
    return '<span aria-hidden="true">' + H.siteFlag(key) + "</span> " + esc(H.siteLabel(key));
  }
  function pageCell(path, matchId) {
    var info = H.pageInfo(path, matchId, S.names);
    var href = H.safeHref(path, matchId);
    var main = href
      ? '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(info.title) + "</a>"
      : esc(info.title);
    return '<div class="cell-main" title="' + esc(info.title) + '">' + main + '</div><div class="cell-sub" title="' + esc(path) + '">' + esc(path || "—") + "</div>";
  }

  // ---------- Etats ----------
  function showState(which, message) {
    ["stateLoading", "stateDenied", "stateError"].forEach(function (id) { $(id).hidden = true; });
    $("dash").hidden = which !== "dash";
    if (which === "loading") $("stateLoading").hidden = false;
    if (which === "denied") { stopLive(); $("stateDenied").hidden = false; }
    if (which === "error") {
      stopLive();
      $("stateError").hidden = false;
      if (message) $("stateErrorMsg").textContent = message;
    }
  }
  function emptyHtml(title, help) {
    return '<div class="empty"><b>' + esc(title) + "</b>" + (help ? "<p>" + esc(help) + "</p>" : "") + "</div>";
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
    if (kind === "missing") return "Migration 0019 non appliquée : « " + what + " » sera disponible après application de " + MIGRATION_FILE + ".";
    if (kind === "network") return "Connexion impossible au serveur de données pour « " + what + " ». Vérifiez la connexion Internet puis cliquez sur Actualiser.";
    if (kind === "timeout") return "Le serveur met trop de temps à répondre pour « " + what + " ». Réessayez dans un instant.";
    var code = err && err.code ? " (code " + err.code + ")" : "";
    return "Erreur au chargement de « " + what + " »" + code + ". Réessayez avec Actualiser.";
  }
  function blockError(el, kind, err, what) {
    if (!el) return;
    el.innerHTML = '<div class="block-error' + (kind === "missing" ? " missing" : "") + '"><p>' + esc(errorText(kind, err, what)) + "</p>"
      + (kind === "missing" ? "" : '<button type="button" class="btn btn-sm btn-ghost" data-retry="1">Réessayer</button>') + "</div>";
  }
  function unavailableLegacy(el, what) {
    if (el) el.innerHTML = '<div class="block-error missing"><p>' + esc("« " + what + " » : disponible après application de la migration 0019.") + "</p></div>";
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
    return {
      p_include_internal: S.includeInternal,
      p_site: S.site || null,
      p_device: S.device || null,
      p_source: S.source || null
    };
  }
  function periodArgs() {
    return {
      p_days: S.range.days,
      p_from: S.range.from,
      p_to: S.range.to,
      p_since: S.showTestPeriod ? null : H.LAUNCH_AT
    };
  }
  function hasFilters() { return !!(S.site || S.device || S.source); }

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
  function loadHomeNames() {
    if (!homeLoaded) {
      homeLoaded = fetchJson("/data-home.json").then(function (d) {
        S.home = d && typeof d === "object"
          ? { ok: true, generated_at: typeof d.generated_at === "string" ? d.generated_at : null, run_id: typeof d.run_id === "string" ? d.run_id.slice(0, 60) : null, matches: Array.isArray(d.matchs) ? d.matchs.length : null }
          : { ok: false };
        ((d && d.matchs) || []).forEach(addMatch);
        saveNamesCache();
        renderHealth();
      });
    }
    return homeLoaded;
  }
  var tried = {};
  // Matchs absents de data-home.json : fiche /match/<id>.json (meme donnee que
  // data.json, sans telecharger les 25 Mo de data.json), 12 au plus par
  // chargement, noms mis en cache local.
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
      (a.top_matches || []).slice(0, 30).forEach(function (r) { ids[r.match_id] = 1; });
      (a.top_pages || []).slice(0, 20).forEach(function (r) { if (r.match_id) ids[r.match_id] = 1; });
    }
    (S.live && S.live.visitors || []).forEach(function (v) { if (v.match_id) ids[v.match_id] = 1; });
    return Object.keys(ids).filter(function (id) { return id && id !== "null"; });
  }
  function refreshNames() {
    loadHomeNames().then(function () {
      rerenderNamed();
      return loadMissingNames(neededMatchIds());
    }).then(function (changed) { if (changed) rerenderNamed(); });
  }
  function rerenderNamed() {
    if (S.analytics) { renderSummary(); renderPages(); }
    if (S.sessions) renderJourneys();
    if (S.live) renderLive();
  }

  // ---------- Graphiques ----------
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  function chartsReady() {
    if (!window.Chart) return false;
    if (!chartsReady.done) {
      var C = window.Chart;
      C.defaults.color = "#b3bfcd";
      C.defaults.borderColor = "rgba(255,255,255,0.08)";
      C.defaults.font.family = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
      C.defaults.font.size = 12;
      C.defaults.animation = reduceMotion ? false : { duration: 350 };
      C.defaults.plugins.tooltip.backgroundColor = "#162338";
      C.defaults.plugins.tooltip.borderColor = "rgba(255,255,255,0.15)";
      C.defaults.plugins.tooltip.borderWidth = 1;
      C.defaults.plugins.tooltip.titleColor = "#e8eef6";
      C.defaults.plugins.tooltip.bodyColor = "#e8eef6";
      C.defaults.plugins.tooltip.padding = 10;
      chartsReady.done = true;
    }
    return true;
  }
  function destroyChart(id) {
    if (S.charts[id]) { try { S.charts[id].destroy(); } catch (e) {} delete S.charts[id]; }
  }
  function chartFallback(boxId, text) {
    var box = $(boxId);
    if (!box) return;
    var fb = box.querySelector(".chart-fallback");
    if (!text) { if (fb) fb.remove(); return; }
    if (!fb) { fb = document.createElement("p"); fb.className = "chart-fallback"; box.appendChild(fb); }
    fb.textContent = text;
  }
  function makeChart(id, boxId, config, emptyText) {
    destroyChart(id);
    if (!chartsReady()) { chartFallback(boxId, "Graphique indisponible (bibliothèque Chart.js non chargée). Les tableaux et exports CSV contiennent les mêmes données."); return; }
    chartFallback(boxId, emptyText || "");
    try {
      S.charts[id] = new window.Chart($(id), config);
    } catch (e) {
      chartFallback(boxId, "Graphique indisponible pour le moment.");
    }
  }
  var gridColor = "rgba(255,255,255,0.07)";

  // ---------- CSV ----------
  function downloadCsv(name, columns, rows) {
    try {
      var csv = "﻿" + H.toCsv(columns, rows);
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var stamp = (S.range ? S.range.from + "_" + S.range.to : H.parisToday(new Date()));
      a.href = url;
      a.download = "iashark-" + name + "-" + stamp + ".csv";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch (e) {
      toast("Export CSV impossible sur ce navigateur.");
    }
  }

  // ---------- Tableaux triables ----------
  function DataTable(el, opts) {
    this.el = el;
    this.opts = opts;
    this.rows = [];
    this.sortKey = opts.sortKey || null;
    this.sortDir = opts.sortDir || "desc";
    this.query = "";
    this.limit = opts.pageSize || 10;
    this.built = false;
    var self = this;
    el.addEventListener("click", function (ev) {
      var t = ev.target;
      var sortBtn = t.closest && t.closest("button.sort");
      if (sortBtn) {
        var key = sortBtn.getAttribute("data-key");
        if (self.sortKey === key) self.sortDir = self.sortDir === "asc" ? "desc" : "asc";
        else { self.sortKey = key; self.sortDir = sortBtn.getAttribute("data-num") === "1" ? "desc" : "asc"; }
        self.draw();
        return;
      }
      if (t.closest && t.closest("button[data-more]")) { self.limit += self.opts.pageSize || 10; self.draw(); return; }
      if (t.closest && t.closest("button[data-csv]")) {
        downloadCsv(self.opts.filename, self.opts.columns.map(function (c) {
          return { label: c.label, csv: c.csv || function (r) { return c.sortValue ? c.sortValue(r) : r[c.key]; } };
        }), self.visibleRows(true));
      }
    });
    el.addEventListener("input", function (ev) {
      if (ev.target && ev.target.matches && ev.target.matches("input[type=search]")) {
        self.query = ev.target.value;
        self.limit = self.opts.pageSize || 10;
        self.draw();
      }
    });
  }
  DataTable.prototype.setRows = function (rows) {
    this.rows = rows || [];
    if (!this.rows.length) { this.built = false; this.el.innerHTML = emptyHtml(this.opts.emptyTitle || "Aucune donnée sur cette période", this.opts.emptyHelp || "Élargissez la période ou retirez les filtres."); return; }
    if (!this.built) this.build();
    this.draw();
  };
  DataTable.prototype.build = function () {
    var o = this.opts, idBase = this.el.id + "Search";
    var head = o.columns.map(function (c) {
      return "<th scope=\"col\"" + (c.num ? ' class="num"' : "") + ' data-key="' + esc(c.key) + '"><button type="button" class="sort" data-key="' + esc(c.key) + '" data-num="' + (c.num ? 1 : 0) + '">' + esc(c.label) + "</button></th>";
    }).join("");
    this.el.innerHTML = '<div class="tbl-tools">'
      + (o.searchable === false ? "<span></span>" : '<label class="sr-only" for="' + idBase + '">Rechercher dans ' + esc(o.caption) + '</label><input type="search" id="' + idBase + '" placeholder="Rechercher…" autocomplete="off">')
      + '<span class="tbl-count" aria-live="polite"></span><button type="button" class="btn btn-ghost btn-sm" data-csv="1">Exporter CSV</button></div>'
      + '<div class="tbl-wrap"><table class="tbl"><caption class="sr-only">' + esc(o.caption) + "</caption><thead><tr>" + head + "</tr></thead><tbody></tbody></table></div>"
      + '<div class="tbl-more"></div>';
    var input = this.el.querySelector("input[type=search]");
    if (input) input.value = this.query;
    this.built = true;
  };
  DataTable.prototype.visibleRows = function () {
    var o = this.opts, q = this.query.trim().toLowerCase(), key = this.sortKey, dir = this.sortDir;
    var rows = this.rows.slice();
    if (q) rows = rows.filter(function (r) { return String(o.searchText ? o.searchText(r) : "").toLowerCase().indexOf(q) !== -1; });
    if (key) {
      var col = o.columns.filter(function (c) { return c.key === key; })[0];
      if (col) {
        var val = col.sortValue || function (r) { return r[key]; };
        rows.sort(function (a, b) {
          var x = val(a), y = val(b);
          if (x === y) return 0;
          if (x === null || x === undefined || x === "") return 1;
          if (y === null || y === undefined || y === "") return -1;
          var cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr");
          return dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return rows;
  };
  DataTable.prototype.draw = function () {
    var o = this.opts, self = this;
    var rows = this.visibleRows();
    var shown = rows.slice(0, this.limit);
    var tbody = this.el.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = shown.length ? shown.map(function (r) {
      return "<tr>" + o.columns.map(function (c) { return "<td" + (c.num ? ' class="num"' : "") + ">" + c.render(r) + "</td>"; }).join("") + "</tr>";
    }).join("") : '<tr><td colspan="' + o.columns.length + '">' + emptyHtml("Aucun résultat", "Modifiez la recherche.") + "</td></tr>";
    Array.prototype.forEach.call(this.el.querySelectorAll("th[data-key]"), function (th) {
      var k = th.getAttribute("data-key");
      if (k === self.sortKey) th.setAttribute("aria-sort", self.sortDir === "asc" ? "ascending" : "descending");
      else th.removeAttribute("aria-sort");
    });
    this.el.querySelector(".tbl-count").textContent = rows.length === this.rows.length
      ? H.fmtInt(rows.length) + " ligne" + (rows.length > 1 ? "s" : "")
      : H.fmtInt(rows.length) + " sur " + H.fmtInt(this.rows.length);
    var rest = rows.length - shown.length;
    this.el.querySelector(".tbl-more").innerHTML = rest > 0
      ? '<button type="button" class="btn btn-ghost btn-sm" data-more="1">Afficher plus (' + H.fmtInt(rest) + " restante" + (rest > 1 ? "s" : "") + ")</button>"
      : "";
  };
  function table(id, opts) {
    if (!S.tables[id]) S.tables[id] = new DataTable($(id), opts);
    return S.tables[id];
  }
  function numCol(key, label, fmt, extra) {
    var c = { key: key, label: label, num: true, sortValue: function (r) { return H.num(r[key]); }, render: function (r) { return esc((fmt || H.fmtInt)(r[key])); } };
    if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
    return c;
  }

  // ---------- Resume, bandeaux ----------
  function renderSummary() {
    var a = S.analytics;
    $("summaryText").textContent = a ? H.summarize(a, { label: S.range.label, names: S.names, filtered: hasFilters() }) : "Résumé indisponible pour le moment.";
  }
  function renderNotices() {
    $("noticeMigration").hidden = !S.legacy;
    $("noticeLaunch").hidden = S.legacy;
    $("noticeLaunchText").textContent = S.showTestPeriod
      ? "Période de test affichée : les données d'avant le 13 septembre 2026 à 21 h (heure de Paris) sont surtout des tests."
      : "Les statistiques commencent au lancement du suivi, le 13 septembre 2026 à 21 h (heure de Paris). Avant, il s'agissait presque uniquement de tests.";
    $("testPeriodBtn").textContent = S.showTestPeriod ? "Masquer la période de test" : "Afficher la période de test";
    $("testPeriodBtn").setAttribute("aria-pressed", String(S.showTestPeriod));
    var a = S.analytics, n = a && !S.legacy ? H.num(a.internal_sessions) : null;
    var box = $("noticeInternal");
    if (S.legacy || n === null) { box.hidden = true; }
    else if (S.includeInternal) {
      box.hidden = false;
      $("noticeInternalText").textContent = "Votre trafic et les tests sont inclus dans les chiffres (" + H.fmtInt(n) + " visiteur" + (n > 1 ? "s" : "") + " concerné" + (n > 1 ? "s" : "") + " sur la période).";
      $("noticeInternalBtn").textContent = "Les masquer";
    } else if (n > 0) {
      box.hidden = false;
      $("noticeInternalText").textContent = H.fmtInt(n) + " visiteur" + (n > 1 ? "s" : "") + " interne" + (n > 1 ? "s" : "") + " ou de test masqué" + (n > 1 ? "s" : "") + " sur cette période (votre trafic, tests QA, robots, visites exclues).";
      $("noticeInternalBtn").textContent = "Les afficher";
    } else {
      box.hidden = true;
    }
    var legacyOff = S.legacy;
    ["siteFilter", "deviceFilter", "sourceFilter", "internalToggle"].forEach(function (id) { $(id).disabled = legacyOff; });
    var note = $("filterNote");
    note.hidden = !legacyOff;
    note.textContent = legacyOff ? "Filtres et exclusion du trafic interne disponibles après la migration 0019." : "";
  }

  // ---------- KPI ----------
  var KPI_DEFS = [
    { key: "visitors", label: "Visiteurs", help: "Personnes (onglets) ayant vu au moins une page." },
    { key: "visits", label: "Visites", help: "Une nouvelle visite commence après 30 min d'absence." },
    { key: "page_views", label: "Pages vues", help: "Nombre total de pages ouvertes." },
    { key: "avg_visit_sec", label: "Durée moyenne", fmt: H.fmtDur, help: "Temps passé par visiteur, onglet au premier plan." },
    { key: "bounce_rate", label: "Taux de rebond", fmt: H.fmtPct, points: true, lowerIsBetter: true, help: "Part des visiteurs repartis après une seule page. Plus bas = mieux." },
    { key: "signups", label: "Inscriptions", help: "Comptes créés pendant une visite suivie." },
    { key: "signup_rate", label: "Taux d'inscription", fmt: function (v) { return H.fmtPct(v, 2); }, points: true, help: "Inscrits ÷ visiteurs." },
    { key: "checkout_started", label: "Paiements commencés", help: "Visiteurs ayant cliqué sur le bouton de paiement." },
    { key: "checkout_success", label: "Paiements réussis", help: "Visiteurs revenus sur la page « paiement réussi »." },
    { key: "multi_visit_visitors", label: "Revenus dans la journée", help: "Revenus dans le même onglet après 30 min. Sans cookie, un retour un autre jour n'est pas reconnaissable : c'est un minimum." }
  ];
  function deltaHtml(def, cur, prev, previousComplete) {
    var d = H.fmtDelta(cur, prev, { points: def.points, lowerIsBetter: def.lowerIsBetter, previousComplete: previousComplete });
    if (d.dir === "none") {
      return '<div class="delta-line"><span class="delta none">' + (previousComplete === false ? "pas de comparaison" : "—") + "</span></div>";
    }
    var cls = d.dir === "flat" || d.dir === "new" ? d.dir : d.good ? "good" : "bad";
    var arrow = d.dir === "up" ? "▲ " : d.dir === "down" ? "▼ " : "";
    var sr = d.dir === "up" ? "en hausse" : d.dir === "down" ? "en baisse" : d.dir === "new" ? "nouveau" : "stable";
    return '<div class="delta-line"><span class="delta ' + cls + '"><span aria-hidden="true">' + arrow + "</span>" + esc(d.text) + '<span class="sr-only"> (' + sr + ")</span></span></div>";
  }
  function renderKpis() {
    var a = S.analytics, k = a.kpis || {}, p = a.previous || {};
    var complete = !(a.range && a.range.previous_complete === false);
    $("periodLabel").textContent = S.range.label;
    $("compareLabel").textContent = complete ? S.range.compare : "Pas de comparaison : la période précédente est avant le lancement des statistiques";
    $("kpis").innerHTML = KPI_DEFS.map(function (def) {
      if (def.key === "multi_visit_visitors" && H.num(k[def.key]) === null) return "";
      var fmt = def.fmt || H.fmtInt;
      return '<div class="kpi"><div class="kpi-label">' + esc(def.label) + '</div><div class="kpi-value tnum">' + esc(fmt(k[def.key])) + "</div>"
        + deltaHtml(def, k[def.key], p[def.key], complete) + '<p class="kpi-help">' + esc(def.help) + "</p></div>";
    }).join("");
  }

  // ---------- Comptes et revenus ----------
  function renderBusiness(result) {
    var el = $("bizKpis");
    S.business = result && result.data ? result.data : null;
    renderOverview();
    if (result && result.data) {
      var b = result.data, u = b.users || {}, s = b.subscriptions || {};
      var revenue = {};
      (b.first_payments || []).concat(b.renewals || []).forEach(function (r) {
        var c = String(r.currency || "eur");
        revenue[c] = (revenue[c] || 0) + (Number(r.amount_cents) || 0);
      });
      var currencies = Object.keys(revenue);
      var revText = currencies.length ? currencies.map(function (c) { return H.fmtMoney(revenue[c], c); }).join(" + ") : H.fmtMoney(0, "eur");
      var firstCount = (b.first_payments || []).reduce(function (n, r) { return n + (Number(r.payments) || 0); }, 0);
      var renewCount = (b.renewals || []).reduce(function (n, r) { return n + (Number(r.payments) || 0); }, 0);
      var cards = [
        { label: "Comptes", value: H.fmtInt(u.total), help: H.fmtInt(u.free) + " gratuit" + (u.free > 1 ? "s" : "") + " · " + H.fmtInt(u.pro) + " Pro (hors admin)." },
        { label: "Nouveaux comptes", value: H.fmtInt(b.accounts_created), delta: [b.accounts_created, b.accounts_created_prev], help: "Comptes créés sur la période (hors admin)." },
        { label: "Nouveaux abonnements Pro", value: H.fmtInt(s.new_in_period), delta: [s.new_in_period, s.new_prev_period], help: "Abonnements Stripe démarrés sur la période." },
        { label: "Abonnés Pro actifs", value: H.fmtInt(s.active), help: (Number(s.past_due) ? H.fmtInt(s.past_due) + " en impayé · " : "") + "état actuel, toutes périodes." },
        { label: "Résiliations", value: H.fmtInt(s.ended_in_period), help: H.fmtInt(s.cancel_pending) + " résiliation" + (Number(s.cancel_pending) > 1 ? "s" : "") + " programmée" + (Number(s.cancel_pending) > 1 ? "s" : "") + " en fin de période payée." },
        { label: "Encaissé sur la période", value: revText, help: H.fmtInt(firstCount) + " premier" + (firstCount > 1 ? "s" : "") + " paiement" + (firstCount > 1 ? "s" : "") + " · " + H.fmtInt(renewCount) + " renouvellement" + (renewCount > 1 ? "s" : "") + ", montants TTC reçus de Stripe." }
      ];
      el.innerHTML = cards.map(function (c) {
        return '<div class="kpi"><div class="kpi-label">' + esc(c.label) + '</div><div class="kpi-value tnum">' + esc(c.value) + "</div>"
          + (c.delta ? deltaHtml({}, c.delta[0], c.delta[1], true) : "") + '<p class="kpi-help">' + esc(c.help) + "</p></div>";
      }).join("");
      $("bizNote").textContent = "Montants : événements Stripe réellement reçus par le webhook (aucun prix recopié ici). Exclus : " + H.fmtInt(u.internal) + " compte" + (Number(u.internal) > 1 ? "s" : "") + " admin ou de test (et leurs abonnements).";
    } else if (result && result.kind === "missing" && S.stats) {
      var st = S.stats;
      el.innerHTML = [["Comptes", st.total_users], ["Gratuit", st.free_users], ["Pro", st.pro_users], ["Inscriptions 7 j", st.signups_last_7d], ["Inscriptions 30 j", st.signups_last_30d]].map(function (x) {
        return '<div class="kpi"><div class="kpi-label">' + esc(x[0]) + '</div><div class="kpi-value tnum">' + esc(H.fmtInt(x[1])) + "</div></div>";
      }).join("");
      $("bizNote").textContent = "Abonnements et revenus détaillés : disponibles après application de la migration 0019.";
    } else {
      blockError(el, result ? result.kind : "error", result && result.error, "Comptes et revenus");
      $("bizNote").textContent = "";
    }
  }
  function renderSignupTables() {
    var a = S.analytics;
    var rateCol = numCol("rate", "Taux d'inscription", function (v) { return H.fmtPct(v, 1); });
    function withRate(list) {
      return (list || []).map(function (r) {
        var v = Number(r.visitors) || 0, sgn = H.num(r.signups);
        var o = {};
        Object.keys(r).forEach(function (k) { o[k] = r[k]; });
        o.rate = v && sgn !== null ? (sgn / v) * 100 : null;
        return o;
      });
    }
    table("tblSignSite", {
      caption: "Inscriptions par version du site", filename: "inscriptions-par-version", sortKey: "visitors", pageSize: 10,
      searchText: function (r) { return H.siteLabel(r.site); },
      columns: [
        { key: "site", label: "Version", render: function (r) { return siteHtml(r.site); }, sortValue: function (r) { return H.siteLabel(r.site); }, csv: function (r) { return H.siteLabel(r.site); } },
        numCol("visitors", "Visiteurs"), numCol("signups", "Inscrits"), rateCol
      ]
    }).setRows(withRate(a.sites));
    table("tblSignSource", {
      caption: "Inscriptions par source", filename: "inscriptions-par-source", sortKey: "visitors", pageSize: 10,
      searchText: function (r) { return H.sourceLabel(r.source_group); },
      columns: [
        { key: "source_group", label: "Source", render: function (r) { return esc(H.sourceLabel(r.source_group)); }, sortValue: function (r) { return H.sourceLabel(r.source_group); }, csv: function (r) { return H.sourceLabel(r.source_group); } },
        numCol("visitors", "Visiteurs"), numCol("signups", "Inscrits"), rateCol
      ]
    }).setRows(withRate(a.sources));
  }

  // ---------- Graphiques ----------
  function renderTrend() {
    var a = S.analytics, hourly = a.range && a.range.granularity === "hour";
    var series = a.series || [];
    $("trendSub").textContent = hourly ? "Par heure (Paris)" : "Par jour";
    var labels = series.map(function (s) { return H.bucketLabel(s.t, hourly); });
    var longLabels = series.map(function (s) { return H.bucketLabel(s.t, hourly, true); });
    var visitors = series.map(function (s) { return Number(s.visitors) || 0; });
    var pv = series.map(function (s) { return Number(s.page_views) || 0; });
    var totalV = visitors.reduce(function (x, y) { return x + y; }, 0);
    $("trendChart").setAttribute("aria-label", "Évolution sur " + S.range.label.toLowerCase() + " : " + H.fmtInt(H.num(a.kpis.visitors)) + " visiteurs et " + H.fmtInt(H.num(a.kpis.page_views)) + " pages vues. Données détaillées disponibles en export CSV.");
    var few = series.length <= 31;
    makeChart("trendChart", "trendBox", {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          { label: "Visiteurs", data: visitors, borderColor: "#3987e5", backgroundColor: "rgba(57,135,229,0.16)", fill: true, tension: 0.3, borderWidth: 2, pointRadius: few ? 3 : 0, pointHoverRadius: 5, pointBackgroundColor: "#3987e5" },
          { label: "Pages vues", data: pv, borderColor: "#d95926", backgroundColor: "#d95926", fill: false, tension: 0.3, borderWidth: 2, pointRadius: few ? 3 : 0, pointHoverRadius: 5, pointBackgroundColor: "#d95926" }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", align: "end", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8, color: "#e8eef6" } },
          tooltip: { callbacks: { title: function (items) { return items.length ? longLabels[items[0].dataIndex] : ""; } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 14 } },
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { precision: 0 } }
        }
      }
    }, totalV === 0 ? "Aucun visiteur sur cette période." : "");
  }
  function donut(id, boxId, legendId, items, colorOf, labelOf, ariaWhat) {
    var total = items.reduce(function (n, r) { return n + (Number(r.visitors) || 0); }, 0);
    $(legendId).innerHTML = items.length ? items.map(function (r) {
      var v = Number(r.visitors) || 0;
      return '<li><span class="swatch" style="background:' + colorOf(r) + '" aria-hidden="true"></span><span class="legend-name">' + esc(labelOf(r)) + '</span><span class="legend-val tnum">' + esc(H.fmtInt(v)) + "<small>" + esc(H.fmtPct(total ? (v / total) * 100 : 0, 0)) + "</small></span></li>";
    }).join("") : "";
    $(id).setAttribute("aria-label", ariaWhat + " : " + (items.length ? items.map(function (r) { return labelOf(r) + " " + H.fmtInt(r.visitors); }).join(", ") : "aucune donnée"));
    makeChart(id, boxId, {
      type: "doughnut",
      data: { labels: items.map(labelOf), datasets: [{ data: items.map(function (r) { return Number(r.visitors) || 0; }), backgroundColor: items.map(colorOf), borderColor: "#0d1520", borderWidth: 2, hoverOffset: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "66%", plugins: { legend: { display: false } } }
    }, total ? "" : "Aucune donnée sur cette période.");
  }
  function foldOther(list, keyName, max, otherKey) {
    var sorted = (list || []).slice().sort(function (x, y) { return (Number(y.visitors) || 0) - (Number(x.visitors) || 0); });
    if (sorted.length <= max) return sorted;
    var head = sorted.slice(0, max - 1), rest = sorted.slice(max - 1);
    var other = { visitors: rest.reduce(function (n, r) { return n + (Number(r.visitors) || 0); }, 0), __other: true };
    other[keyName] = otherKey;
    return head.concat([other]);
  }
  function renderDonuts() {
    var a = S.analytics;
    donut("deviceChart", "deviceBox", "deviceLegend", (a.devices || []).slice(),
      function (r) { return DEVICE_COLORS[r.device] || UNKNOWN_COLOR; },
      function (r) { return H.deviceLabel(r.device); }, "Visiteurs par appareil");
    var sources = foldOther(a.sources, "source_group", 6, "__rest");
    donut("sourceChart", "sourceBox", "sourceLegend", sources,
      function (r) { return r.__other ? UNKNOWN_COLOR : SOURCE_COLORS[r.source_group] || UNKNOWN_COLOR; },
      function (r) { return r.__other ? "Autres sources" : H.sourceLabel(r.source_group); }, "Visiteurs par source");
  }
  function hbar(id, boxId, items, labelOf, ariaWhat) {
    var total = items.reduce(function (n, r) { return n + (Number(r.visitors) || 0); }, 0);
    $(id).setAttribute("aria-label", ariaWhat + " : " + (items.length ? items.map(function (r) { return labelOf(r) + " " + H.fmtInt(r.visitors); }).join(", ") : "aucune donnée"));
    makeChart(id, boxId, {
      type: "bar",
      data: { labels: items.map(labelOf), datasets: [{ label: "Visiteurs", data: items.map(function (r) { return Number(r.visitors) || 0; }), backgroundColor: "#22d3ee", borderRadius: 4, maxBarThickness: 20 }] },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grid: { color: gridColor }, ticks: { precision: 0 } }, y: { grid: { display: false }, ticks: { color: "#e8eef6" } } }
      }
    }, total ? "" : "Aucune donnée sur cette période.");
  }
  function renderBars() {
    var a = S.analytics;
    hbar("countryChart", "countryBox", foldOther(a.countries, "country", 8, "__rest"), function (r) {
      if (r.__other) return "Autres pays";
      return H.isCountry(r.country) ? H.flagEmoji(r.country) + " " + H.countryName(r.country) : "Pays inconnu";
    }, "Visiteurs par pays estimé");
    hbar("siteChart", "siteBox", (a.sites || []).slice(), function (r) { return H.siteFlag(r.site) + " " + H.siteLabel(r.site); }, "Visiteurs par version du site");
  }
  function renderHeatmap() {
    var a = S.analytics, el = $("heatmap");
    if (a.heatmap === null || a.heatmap === undefined) { unavailableLegacy(el, "Heures d'affluence"); return; }
    if (!a.heatmap.length) { el.innerHTML = emptyHtml("Pas encore assez de visites", "La carte se remplit au fil des visites : revenez après quelques jours de trafic."); return; }
    var width = el.clientWidth || 800;
    var bin = width < 420 ? 4 : width < 640 ? 3 : 1;
    var g = H.heatmapGrid(a.heatmap, bin);
    var headCells = g.rows[0].cells.map(function (c) { return '<th scope="col">' + c.from + (bin > 1 ? "-" + c.to : "") + "</th>"; }).join("");
    var body = g.rows.map(function (r) {
      return '<tr><th scope="row">' + esc(r.label) + "</th>" + r.cells.map(function (c) {
        var ratio = g.max ? c.visitors / g.max : 0;
        var style = c.visitors ? ' style="background:rgba(34,211,238,' + (0.12 + ratio * 0.83).toFixed(2) + ')"' : "";
        var cls = c.visitors ? (ratio > 0.55 ? "v dark" : "v") : "";
        var label = r.label + " " + c.from + " h à " + c.to + " h : " + c.visitors + " visiteur" + (c.visitors > 1 ? "s" : "");
        return "<td" + (cls ? ' class="' + cls + '"' : "") + style + ' title="' + esc(label) + '">' + (c.visitors ? H.fmtInt(c.visitors) : '<span class="sr-only">0</span>') + "</td>";
      }).join("") + "</tr>";
    }).join("");
    el.innerHTML = '<div class="heat-scroll"><table class="heat"><caption class="sr-only">Visiteurs par jour et par heure (heure de Paris)' + (bin > 1 ? ", par tranches de " + bin + " heures" : "") + '</caption><thead><tr><td></td>' + headCells + "</tr></thead><tbody>" + body + "</tbody></table></div>"
      + '<div class="heat-legend"><span>Moins</span><span class="heat-ramp" aria-hidden="true"></span><span>Plus</span><span>· maximum ' + esc(H.fmtInt(g.max)) + " visiteurs" + (bin > 1 ? " par tranche de " + bin + " h" : " par heure") + "</span></div>";
    S.heatBin = bin;
  }
  function funnelHtml(steps, note) {
    if (!steps[0].value) return emptyHtml("Aucun visiteur sur cette période", "Le tunnel s'affichera dès les premières visites.");
    var html = '<ol class="funnel">';
    steps.forEach(function (s, i) {
      if (i > 0) {
        var arrow = s.value === null ? "étape disponible après la migration 0019"
          : steps[i - 1].value === null ? "étape précédente non mesurée"
          : s.pctOfPrev === null ? "aucun visiteur à l'étape précédente"
          : "<b>" + esc(H.fmtPct(s.pctOfPrev, 0)) + "</b> passent à l'étape « " + esc(s.label) + " »";
        html += '<li class="fstep-arrow">↓ ' + arrow + "</li>";
      }
      var width = s.pctOfFirst === null ? 0 : Math.max(0, Math.min(100, s.pctOfFirst));
      html += '<li class="fstep"><div class="fstep-label">' + esc(s.label) + "<small>" + esc(s.help) + '</small></div><div class="fstep-track" aria-hidden="true"><div class="fstep-fill" style="width:' + width.toFixed(2) + '%"></div></div><div class="fstep-num"><b class="tnum">' + esc(H.fmtInt(s.value)) + "</b><span>" + esc(s.pctOfFirst === null ? "non mesuré" : H.fmtPct(s.pctOfFirst, 1) + " des visiteurs") + "</span></div></li>";
    });
    return html + '</ol><p class="note">' + esc(note) + "</p>";
  }
  function renderFunnel() {
    var a = S.analytics;
    $("funnel").innerHTML = funnelHtml(H.funnelSteps(a.funnel, "purchase"),
      "Chaque étape compte les visiteurs qui l'ont atteinte, dans n'importe quel ordre (on peut arriver directement sur une page match ou sur l'abonnement), d'où des pourcentages parfois supérieurs à 100 %. « Paiement commencé » = clic sur le bouton de paiement ; « Payé » = retour sur la page de paiement réussi.");
    $("funnelSignup").innerHTML = funnelHtml(H.funnelSteps(a.funnel, "signup"),
      "Inscrit = compte créé pendant une visite suivie. Les comptes admin et de test sont exclus.");
  }

  // ---------- Vue d'ensemble ----------
  function revenueOf(b) {
    var revenue = {};
    ((b && b.first_payments) || []).concat((b && b.renewals) || []).forEach(function (r) {
      var c = String(r.currency || "eur");
      revenue[c] = (revenue[c] || 0) + (Number(r.amount_cents) || 0);
    });
    var cur = Object.keys(revenue);
    return cur.length ? cur.map(function (c) { return H.fmtMoney(revenue[c], c); }).join(" + ") : H.fmtMoney(0, "eur");
  }
  function renderOverview() {
    var el = $("kpiOverview");
    var a = S.analytics, b = S.business;
    if (!a && !b) return;
    var k = (a && a.kpis) || {}, p = (a && a.previous) || {};
    var complete = !(a && a.range && a.range.previous_complete === false);
    var subs = (b && b.subscriptions) || {}, users = (b && b.users) || {};
    var rates = H.conversionRates({ visitors: k.visitors, signups: k.signups, newPro: b ? subs.new_in_period : null, accountsCreated: b ? b.accounts_created : null });
    var cards = [
      { label: "Visiteurs uniques", value: H.fmtInt(k.visitors), delta: a ? [k.visitors, p.visitors] : null, help: "Onglets ayant vu au moins une page (hors trafic interne)." },
      { label: "Sessions", value: H.fmtInt(k.visits), delta: a ? [k.visits, p.visits] : null, help: H.fmtInt(k.page_views) + " pages vues · durée moyenne " + H.fmtDur(k.avg_visit_sec) + "." },
      { label: "Inscriptions", value: H.fmtInt(b ? b.accounts_created : k.signups), delta: b ? [b.accounts_created, b.accounts_created_prev] : null, help: b ? "Comptes créés sur la période (hors admin et tests)." : "Inscriptions faites pendant une visite suivie (tests compris avant la migration 0019)." },
      { label: "Visite → inscription", value: H.fmtPct(rates.visitToSignup, 2), help: "Visiteurs suivis qui ont créé un compte pendant leur visite." },
      { label: "Nouveaux abonnés Pro", value: b ? H.fmtInt(subs.new_in_period) : "—", delta: b ? [subs.new_in_period, subs.new_prev_period] : null, help: "Abonnements Stripe démarrés sur la période." },
      { label: "Inscription → Pro", value: H.fmtPct(rates.signupToPro, 1), help: "Environ : nouveaux abonnés Pro ÷ nouveaux comptes de la même période." },
      { label: "Abonnés Pro actifs", value: b ? H.fmtInt(subs.active) : "—", help: b ? H.fmtInt(users.pro) + " compte" + (Number(users.pro) > 1 ? "s" : "") + " avec l'offre Pro · état actuel." : "Disponible après la migration 0019." },
      { label: "Encaissé", value: b ? revenueOf(b) : "—", help: b ? "Montants reçus de Stripe sur la période (premiers paiements et renouvellements)." : "Disponible après la migration 0019." }
    ];
    el.innerHTML = cards.map(function (c) {
      return '<div class="kpi"><div class="kpi-label">' + esc(c.label) + '</div><div class="kpi-value tnum">' + esc(c.value) + "</div>"
        + (c.delta ? deltaHtml({}, c.delta[0], c.delta[1], complete) : "") + '<p class="kpi-help">' + esc(c.help) + "</p></div>";
    }).join("");
    $("overviewNote").textContent = a ? S.range.compare + "." : "";
  }

  // ---------- Sante ----------
  function healthCard(level, title, value, lines) {
    var labels = { ok: "OK", warn: "À surveiller", bad: "Problème", unknown: "Inconnu" };
    return '<div class="hcard ' + level + '"><div class="hcard-head"><span class="hcard-title">' + esc(title) + '</span><span class="hbadge ' + level + '">' + esc(labels[level] || "") + '</span></div><div class="hcard-value">' + esc(value) + "</div>"
      + lines.filter(Boolean).map(function (l) { return '<p class="kpi-help">' + esc(l) + "</p>"; }).join("") + "</div>";
  }
  function ageLevel(iso, okHours, warnHours) {
    var t = iso ? new Date(iso).getTime() : NaN;
    if (isNaN(t)) return "unknown";
    var h = (Date.now() - t) / 36e5;
    return h <= okHours ? "ok" : h <= warnHours ? "warn" : "bad";
  }
  function renderHealth() {
    var el = $("healthCards");
    if (!el) return;
    var home = S.home, pipe = H.pipelineStatus(home && home.generated_at);
    var cards = [];
    if (!home) cards.push(healthCard("unknown", "Pronostics du jour (data.json)", "Vérification…", []));
    else if (!home.ok) cards.push(healthCard("bad", "Pronostics du jour (data.json)", "Fichier illisible", ["data-home.json n'a pas pu être lu sur le site."]));
    else {
      var dj = S.dataJson;
      cards.push(healthCard(pipe.level, "Pronostics du jour (data.json)", home.generated_at ? fmtDateTime(home.generated_at) : "Date inconnue", [
        pipe.text + ".",
        (home.run_id ? "Exécution " + home.run_id + " · " : "") + (home.matches !== null ? H.fmtInt(home.matches) + " matchs publiés." : ""),
        dj && dj.lastModified ? "data.json publié le " + fmtDateTime(dj.lastModified) + (dj.size ? " (" + (dj.size / 1e6).toFixed(1).replace(".", ",") + " Mo)" : "") + "." : null,
        "Mise à jour automatique prévue chaque jour vers 8 h (heure de Paris)."
      ]));
    }
    var h = S.health;
    if (h && h.data) {
      var d = h.data;
      var lvl = ageLevel(d.last_event_at, 6, 24);
      cards.push(healthCard(lvl, "Suivi des visites", d.last_event_at ? relTime(d.last_event_at) : "Aucun événement", [
        "Dernier événement reçu : " + (d.last_event_at ? fmtDateTime(d.last_event_at) : "—") + ".",
        H.fmtInt(d.page_views_24h) + " pages vues et " + H.fmtInt(d.events_24h) + " événements sur 24 h, dont " + H.fmtInt(d.flagged_events_24h) + " internes ou de test (exclus).",
        lvl === "bad" ? "Aucun événement depuis plus de 24 h : vérifier que funnel-track.js est bien chargé sur le site." : null
      ]));
      cards.push(healthCard("ok", "Comptes et paiements", d.last_signup_at ? "Dernière inscription " + relTime(d.last_signup_at) : "Aucune inscription client", [
        "Dernière inscription client : " + (d.last_signup_at ? fmtDateTime(d.last_signup_at) : "—") + ".",
        "Dernier événement Stripe reçu : " + (d.last_billing_event_at ? fmtDateTime(d.last_billing_event_at) : "aucun") + "."
      ]));
    } else if (h && h.kind === "missing") {
      var c = S.analytics && S.analytics.coverage;
      cards.push(healthCard("warn", "Suivi des visites", "Détail indisponible", ["Santé détaillée du suivi disponible après application de la migration 0019."].concat(c && c.last_event_at ? ["Dernier événement reçu : " + fmtDateTime(c.last_event_at) + "."] : [])));
    } else if (h) {
      cards.push(healthCard("unknown", "Suivi des visites", "Indisponible", [errorText(h.kind, h.error, "Santé du suivi")]));
    }
    cards.push(healthCard(S.legacy ? "warn" : S.analytics ? "ok" : "unknown", "Base de données (tableau de bord)", S.legacy ? "Migration 0019 à appliquer" : S.analytics ? "À jour" : "Vérification…", [
      S.legacy ? "Le tableau de bord fonctionne en mode réduit (anciens chiffres, tests compris)." : "Fonctions admin sécurisées : accès réservé au compte administrateur.",
      window.Chart ? null : "Bibliothèque de graphiques non chargée : les tableaux restent disponibles."
    ]));
    el.innerHTML = cards.join("");
    var bad = home && home.ok && (pipe.level === "warn" || pipe.level === "bad");
    $("noticePipeline").hidden = !bad;
    $("noticePipelineText").textContent = bad ? "Pronostics : " + pipe.text + "." : "";
    $("healthDot").hidden = !(bad || (home && !home.ok));
    $("miniPipeline").textContent = !home ? "Vérification…" : !home.ok ? "Fichier des pronostics illisible." : pipe.text + (home.matches !== null ? " · " + H.fmtInt(home.matches) + " matchs" : "");
    $("miniPipeline").className = "health-line " + (home && home.ok ? pipe.level : "bad");
  }
  function loadDataJsonMeta() {
    return fetch("/data.json", { method: "HEAD", credentials: "omit", cache: "no-cache" }).then(function (r) {
      if (!r.ok) return null;
      var lm = r.headers.get("Last-Modified"), size = Number(r.headers.get("Content-Length")) || null;
      return { lastModified: lm && !isNaN(new Date(lm)) ? new Date(lm).toISOString() : null, size: size };
    }).catch(function () { return null; }).then(function (m) { S.dataJson = m; renderHealth(); });
  }

  // ---------- Appareil exclu ----------
  function deviceExcluded() {
    try { return localStorage.getItem(INTERNAL_KEY) === "1"; } catch (e) { return false; }
  }
  function renderDevice() {
    var on = deviceExcluded();
    $("deviceState").innerHTML = on
      ? '<span class="hbadge ok">Exclu</span> Cet appareil est exclu : vos visites sur le site depuis ce navigateur ne sont pas comptées.'
      : '<span class="hbadge warn">Compté</span> Cet appareil est compté comme un visiteur normal.';
    $("deviceBtn").textContent = on ? "Ne plus exclure cet appareil" : "Exclure cet appareil";
    $("deviceBtn").className = on ? "btn btn-ghost" : "btn";
  }
  function toggleDevice() {
    var on = !deviceExcluded();
    try {
      if (on) { localStorage.setItem(INTERNAL_KEY, "1"); localStorage.setItem(INTERNAL_CHOICE_KEY, "on"); }
      else { localStorage.removeItem(INTERNAL_KEY); localStorage.setItem(INTERNAL_CHOICE_KEY, "off"); }
    } catch (e) {
      toast("Impossible d'enregistrer ce réglage : le stockage local est bloqué dans ce navigateur.");
      return;
    }
    renderDevice();
    toast(on ? "Cet appareil est maintenant exclu des statistiques." : "Cet appareil est de nouveau compté dans les statistiques.");
  }

  // ---------- Onglets ----------
  function showTab(name, focus) {
    if (TABS.indexOf(name) === -1) name = "apercu";
    S.tab = name;
    TABS.forEach(function (t) {
      var btn = $("tabbtn-" + t), panel = $("tab-" + t), on = t === name;
      btn.setAttribute("aria-selected", String(on));
      btn.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
    });
    if (focus) $("tabbtn-" + name).focus();
    try { if (window.history && history.replaceState) history.replaceState(null, "", "#" + name); } catch (e) {}
    // Les graphiques d'un onglet cache ont une taille nulle : recalcul.
    Object.keys(S.charts).forEach(function (id) {
      var c = S.charts[id], canvas = $(id);
      if (c && canvas && !canvas.closest("[hidden]")) { try { c.resize(); } catch (e) {} }
    });
    if (name === "audience" && S.analytics && S.analytics.heatmap) renderHeatmap();
    if (name === "sante") renderDevice();
  }
  function wireTabs() {
    $("tablist").addEventListener("click", function (ev) {
      var b = ev.target.closest("[role=tab]");
      if (b) showTab(b.getAttribute("data-tab"));
    });
    $("tablist").addEventListener("keydown", function (ev) {
      var i = TABS.indexOf(S.tab), next = null;
      if (ev.key === "ArrowRight") next = TABS[(i + 1) % TABS.length];
      else if (ev.key === "ArrowLeft") next = TABS[(i - 1 + TABS.length) % TABS.length];
      else if (ev.key === "Home") next = TABS[0];
      else if (ev.key === "End") next = TABS[TABS.length - 1];
      if (next) { ev.preventDefault(); showTab(next, true); }
    });
    document.addEventListener("click", function (ev) {
      var g = ev.target.closest && ev.target.closest("[data-goto]");
      if (!g) return;
      ev.preventDefault();
      showTab(g.getAttribute("data-goto"));
      var nav = document.querySelector(".tabs");
      if (nav && nav.scrollIntoView) nav.scrollIntoView({ block: "start" });
    });
    window.addEventListener("hashchange", function () {
      var h = String(location.hash || "").slice(1);
      if (TABS.indexOf(h) !== -1 && h !== S.tab) showTab(h);
    });
  }

  // ---------- Tableaux de pages ----------
  function renderPages() {
    var a = S.analytics;
    function pageSearch(r) { var i = H.pageInfo(r.page, r.match_id, S.names); return i.title + " " + (r.page || ""); }
    function pageColumn(label) {
      return { key: "page", label: label || "Page", render: function (r) { return pageCell(r.page, r.match_id); }, sortValue: function (r) { return H.pageInfo(r.page, r.match_id, S.names).title; }, csv: function (r) { return H.pageInfo(r.page, r.match_id, S.names).title; } };
    }
    function rawColumn() { return { key: "raw", label: "Adresse", hideTable: true, csv: function (r) { return r.page; } }; }
    var pagesCols = [pageColumn(), numCol("views", "Vues"), numCol("visitors", "Visiteurs"), numCol("avg_sec", "Temps moyen", H.fmtDur), numCol("avg_scroll", "Lecture", function (v) { return H.fmtPct(v, 0); })];
    table("tblPages", {
      caption: "Pages les plus vues", filename: "pages", sortKey: "views", pageSize: 10, searchText: pageSearch,
      emptyTitle: "Aucune page vue sur cette période", emptyHelp: "Élargissez la période ou retirez les filtres.",
      columns: pagesCols
    }).setRows(a.top_pages || []);
    if (a.entry_pages === null || a.entry_pages === undefined) { unavailableLegacy($("tblEntry"), "Pages d'arrivée"); }
    else table("tblEntry", { caption: "Pages d'arrivée", filename: "pages-arrivee", sortKey: "entries", pageSize: 8, searchText: pageSearch, columns: [pageColumn(), numCol("entries", "Arrivées")] }).setRows(a.entry_pages);
    if (a.exit_pages === null || a.exit_pages === undefined) { unavailableLegacy($("tblExit"), "Pages de sortie"); }
    else table("tblExit", {
      caption: "Pages de sortie", filename: "pages-sortie", sortKey: "exits", pageSize: 8, searchText: pageSearch,
      columns: [pageColumn(), numCol("exits", "Sorties"), numCol("exit_rate", "Taux de sortie", function (v) { return H.fmtPct(v, 0); })]
    }).setRows(a.exit_pages);
    table("tblMatches", {
      caption: "Matchs les plus consultés", filename: "matchs", sortKey: "views", pageSize: 10,
      searchText: function (r) { var n = S.names[String(r.match_id)]; return (H.matchName(r.match_id, S.names) || "") + " " + (n ? n.league : "") + " " + r.match_id; },
      emptyTitle: "Aucun match consulté sur cette période",
      columns: [
        { key: "match", label: "Match", render: function (r) {
          var name = H.matchName(r.match_id, S.names), id = /^\d{1,12}$/.test(String(r.match_id)) ? String(r.match_id) : null;
          var n = id && S.names[id];
          var label = name || "Match n° " + (id || "?");
          return '<div class="cell-main">' + (id ? '<a href="/match/' + id + '.html" target="_blank" rel="noopener noreferrer">' + esc(label) + "</a>" : esc(label)) + '</div><div class="cell-sub">' + esc(n && n.league ? n.league : "Ligue inconnue") + "</div>";
        }, sortValue: function (r) { return H.matchName(r.match_id, S.names) || "~" + r.match_id; }, csv: function (r) { return H.matchName(r.match_id, S.names) || "Match n° " + r.match_id; } },
        { key: "sites", label: "Versions", render: function (r) { return esc((r.sites || []).map(function (s) { return H.SITES[s] ? H.SITES[s].short : String(s); }).join(" · ") || "—"); }, sortValue: function (r) { return (r.sites || []).length; }, csv: function (r) { return (r.sites || []).join(" "); } },
        numCol("views", "Vues"), numCol("visitors", "Visiteurs")
      ]
    }).setRows(a.top_matches || []);
    table("tblLeagues", {
      caption: "Ligues les plus suivies", filename: "ligues", sortKey: "views", pageSize: 10,
      searchText: function (r) { return r.league; }, emptyTitle: "Aucun match consulté sur cette période",
      columns: [
        { key: "league", label: "Ligue", render: function (r) { return '<div class="cell-main">' + esc(r.league) + "</div>"; } },
        numCol("matches", "Matchs"), numCol("views", "Vues"), numCol("visitors", "Visiteurs")
      ]
    }).setRows(H.leaguesFromMatches(a.top_matches, S.names));
  }

  function renderSourcesTables() {
    var a = S.analytics;
    var totalVisitors = Number(a.kpis && a.kpis.visitors) || 0;
    table("tblSources", {
      caption: "Sources de trafic", filename: "sources", sortKey: "visitors", pageSize: 10,
      searchText: function (r) { return H.sourceLabel(r.source_group) + " " + (r.examples || []).join(" "); },
      columns: [
        { key: "source_group", label: "Source", render: function (r) {
          var ex = (r.examples || []).join(", ");
          return '<div class="cell-main" title="' + esc(ex || "Aucun site référent") + '"><span class="swatch" style="display:inline-block;margin-right:6px;background:' + (SOURCE_COLORS[r.source_group] || UNKNOWN_COLOR) + '" aria-hidden="true"></span>' + esc(H.sourceLabel(r.source_group)) + "</div>"
            + (ex ? '<div class="cell-sub" title="' + esc(ex) + '">' + esc(ex) + "</div>" : "");
        }, sortValue: function (r) { return H.sourceLabel(r.source_group); }, csv: function (r) { return H.sourceLabel(r.source_group); } },
        { key: "examples", label: "Sites référents", render: function (r) { return esc(String((r.examples || []).length)); }, sortValue: function (r) { return (r.examples || []).length; }, csv: function (r) { return (r.examples || []).join(" "); }, num: true },
        numCol("visitors", "Visiteurs"),
        { key: "share", label: "Part", num: true, render: function (r) { return esc(H.fmtPct(totalVisitors ? (Number(r.visitors) || 0) / totalVisitors * 100 : 0, 0)); }, sortValue: function (r) { return Number(r.visitors) || 0; }, csv: function (r) { return totalVisitors ? Math.round((Number(r.visitors) || 0) / totalVisitors * 1000) / 10 : 0; } },
        numCol("signups", "Inscrits"), numCol("checkout_success", "Paiements")
      ]
    }).setRows(a.sources || []);
    table("tblCountries", {
      caption: "Pays", filename: "pays", sortKey: "visitors", pageSize: 10,
      searchText: function (r) { return H.countryName(r.country); },
      columns: [
        { key: "country", label: "Pays", render: function (r) { return '<div class="cell-main">' + countryHtml(r.country) + "</div>"; }, sortValue: function (r) { return H.countryName(r.country); }, csv: function (r) { return H.countryName(r.country); } },
        numCol("visitors", "Visiteurs"),
        { key: "share", label: "Part", num: true, render: function (r) { return esc(H.fmtPct(totalVisitors ? (Number(r.visitors) || 0) / totalVisitors * 100 : 0, 0)); }, sortValue: function (r) { return Number(r.visitors) || 0; }, csv: function (r) { return totalVisitors ? Math.round((Number(r.visitors) || 0) / totalVisitors * 1000) / 10 : 0; } },
        numCol("signups", "Inscrits")
      ]
    }).setRows(a.countries || []);
    table("tblCampaigns", {
      caption: "Campagnes UTM", filename: "campagnes", sortKey: "visitors", pageSize: 10,
      emptyTitle: "Aucune campagne sur cette période",
      emptyHelp: "Ajoutez ?utm_source=tiktok&utm_campaign=nom-de-la-campagne à vos liens (bio, publicité, message) pour les suivre ici.",
      searchText: function (r) { return [r.utm_source, r.medium, r.campaign, H.sourceLabel(r.source_group)].join(" "); },
      columns: [
        { key: "utm_source", label: "utm_source", render: function (r) { return '<div class="cell-main">' + esc(r.utm_source || "—") + '</div><div class="cell-sub">' + esc(H.sourceLabel(r.source_group)) + "</div>"; } },
        { key: "medium", label: "Support", render: function (r) { return esc(r.medium || "—"); } },
        { key: "campaign", label: "Campagne", render: function (r) { return esc(r.campaign || "—"); } },
        numCol("visitors", "Visiteurs"), numCol("signups", "Inscrits")
      ]
    }).setRows(a.campaigns || []);
  }

  // ---------- Parcours ----------
  function journeyList() {
    var list = S.sessions || [];
    if (S.journeyFilter === "signed") return list.filter(function (s) { return s.signed_up; });
    if (S.journeyFilter === "paid") return list.filter(function (s) { return s.checkout_started || s.checkout_success; });
    if (S.journeyFilter === "long") return list.filter(function (s) { return (Number(s.page_views) || 0) >= 3; });
    return list;
  }
  function journeyBadges(s) {
    var b = [];
    if (s.signed_up) b.push('<span class="badge ok">Inscrit</span>');
    if (s.checkout_success) b.push('<span class="badge pay">A payé</span>');
    else if (s.checkout_started) b.push('<span class="badge warn">Paiement commencé</span>');
    if (s.internal_reason || s.is_internal) b.push('<span class="badge int">' + esc(H.internalReasonLabel(s.internal_reason) || "Interne") + "</span>");
    b.push('<span class="badge" title="Version du site"><span aria-hidden="true">' + H.siteFlag(s.site) + "</span> " + esc(H.SITES[s.site] ? H.SITES[s.site].short : "?") + "</span>");
    return b.join("");
  }
  var EVENT_LABELS = {
    signup_started: "A ouvert l'inscription", signup_completed: "Inscription terminée", login_completed: "Connexion",
    landing_view: "A vu l'offre Pro", paywall_view: "A vu un contenu réservé Pro", tool_page_view: "A vu les outils",
    checkout_started: "Paiement commencé", checkout_unavailable: "Paiement indisponible",
    checkout_success_view: "Paiement réussi", checkout_cancel_view: "Paiement annulé", onboarding_dismissed: "A fermé l'accueil"
  };
  var CLICK_KINDS = { inscription: "inscription", connexion: "connexion", abonnement: "abonnement", pro: "offre Pro", compte: "compte", landing: "offre", match: "match", checkout: "paiement", lang_switch: "changement de langue", cta: "bouton" };
  function journeyDetail(s) {
    var items = [];
    (s.pages || []).forEach(function (p) {
      var info = H.pageInfo(p.page, p.match_id, S.names);
      var meta = fmtTime(p.at) + " · " + (p.sec === null || p.sec === undefined ? "durée inconnue" : "resté " + H.fmtDur(p.sec)) + (p.scroll !== null && p.scroll !== undefined ? " · lu à " + H.fmtPct(p.scroll, 0) : "");
      items.push({ at: p.at, html: '<li><span class="tl-main" title="' + esc(p.page) + '">' + esc(info.title) + '</span><span class="tl-meta">' + esc(meta) + "</span></li>" });
    });
    (s.events || []).forEach(function (e) {
      var label, cls = "ev";
      if (e.type === "click") {
        label = "Clic " + (CLICK_KINDS[e.kind] || "") + (e.label ? " : « " + String(e.label) + " »" : "");
        if (e.kind === "match" && e.match_id) { var nm = H.matchName(e.match_id, S.names); if (nm) label += " → " + nm; }
      } else {
        label = EVENT_LABELS[e.type] || String(e.type || "Événement");
        if (e.type === "signup_completed" || e.type === "checkout_success_view") cls = "ev win";
      }
      items.push({ at: e.at, html: '<li class="' + cls + '"><span class="tl-main">' + esc(label) + '</span><span class="tl-meta">' + esc(fmtTime(e.at)) + "</span></li>" });
    });
    items.sort(function (x, y) { return new Date(x.at) - new Date(y.at); });
    var raw = [
      "Source brute : " + (s.source_raw || "aucune (accès direct)"),
      s.utm_campaign ? "Campagne : " + s.utm_campaign : null,
      "Navigateur : " + [s.browser, s.os].filter(Boolean).join(" · ") || null,
      s.session_id ? "Identifiant de visite : " + s.session_id : null
    ].filter(Boolean).join(" · ");
    var actions = "";
    if (S.legacy || !s.session_id) {
      actions = '<p class="note">Exclusion d\'une visite : disponible après application de la migration 0019.</p>';
    } else if (s.internal_reason === "excluded") {
      actions = '<button type="button" class="btn btn-ghost btn-sm" data-restore="' + esc(s.session_id) + '">Réintégrer cette visite dans les statistiques</button>';
    } else if (!s.internal_reason) {
      actions = '<button type="button" class="btn btn-danger btn-sm" data-exclude="' + esc(s.session_id) + '">Exclure cette visite des statistiques</button>';
    }
    return (items.length ? '<ol class="timeline">' + items.map(function (i) { return i.html; }).join("") + "</ol>" : emptyHtml("Aucun détail pour cette visite"))
      + '<p class="j-raw">' + esc(raw) + "</p>" + actions;
  }
  function renderJourneys() {
    var el = $("journeys");
    var list = journeyList();
    Array.prototype.forEach.call(document.querySelectorAll("#journeyFilter button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-jf") === S.journeyFilter)); });
    if (!list.length) {
      el.innerHTML = emptyHtml(S.sessions && S.sessions.length ? "Aucune visite ne correspond à ce filtre" : "Aucune visite sur cette période",
        S.sessions && S.sessions.length ? "Choisissez « Toutes » pour voir toutes les visites." : "Élargissez la période ou retirez les filtres.");
      return;
    }
    var shown = list.slice(0, S.journeyLimit);
    el.innerHTML = '<ul class="journeys">' + shown.map(function (s, i) {
      var key = String(s.session_id || s.first_at + "|" + i);
      var open = S.openJourney === key;
      var entry = H.pageInfo(s.entry_page, s.entry_match_id, S.names);
      var detailId = "jd" + i;
      return '<li class="journey"><button type="button" class="j-row" data-j="' + i + '" aria-expanded="' + open + '" aria-controls="' + detailId + '">'
        + '<span class="j-time"><b>' + esc(fmtTime(s.first_at)) + "</b>" + esc(fmtDay(s.first_at)) + "</span>"
        + '<span><span class="j-sentence">' + esc(H.sessionSentence(s)) + '</span><span class="j-entry" style="display:block">Arrivée : ' + esc(entry.title) + "</span></span>"
        + '<span class="j-badges">' + journeyBadges(s) + '<svg class="j-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span></button>'
        + '<div class="j-detail" id="' + detailId + '"' + (open ? "" : " hidden") + ">" + (open ? journeyDetail(s) : "") + "</div></li>";
    }).join("") + "</ul>"
      + (list.length > shown.length ? '<div class="tbl-more"><button type="button" class="btn btn-ghost btn-sm" id="journeysMore">Afficher plus de visites (' + H.fmtInt(list.length - shown.length) + ")</button></div>" : "")
      + '<p class="note">' + esc(H.fmtInt(list.length)) + " visite" + (list.length > 1 ? "s" : "") + " affichée" + (list.length > 1 ? "s" : "") + " (les plus récentes de la période, 200 au maximum).</p>";
  }

  // ---------- Inscrits ----------
  function renderSignups(result) {
    var el = $("tblSignups");
    if (result) S.signupsRaw = result;
    result = S.signupsRaw;
    if (!result || !result.data) { blockError(el, result ? result.kind : "error", result && result.error, "Inscrits"); return; }
    var all = result.data.map(function (u) {
      var o = {};
      Object.keys(u).forEach(function (k) { o[k] = u[k]; });
      if (!o.source_group && o.source) o.source_group = H.sourceGroup(o.source === "(direct)" ? null : o.source, null, null);
      // Avant 0019 : seul role = 'admin' est connu.
      if (o.is_internal === undefined || o.is_internal === null) o.is_internal = o.role === "admin";
      return o;
    });
    var internal = all.filter(function (u) { return u.is_internal; }).length;
    var list = S.includeInternal ? all : all.filter(function (u) { return !u.is_internal; });
    var accounts = all.length - internal;
    $("accountsLine").textContent = H.fmtInt(accounts) + " compte" + (accounts > 1 ? "s" : "") + " client" + (accounts > 1 ? "s" : "") + " au total"
      + (internal ? " · " + H.fmtInt(internal) + " compte" + (internal > 1 ? "s" : "") + " admin ou de test " + (S.includeInternal ? "affiché" + (internal > 1 ? "s" : "") : "masqué" + (internal > 1 ? "s" : "")) : "")
      + " · version, source et appareil connus seulement pour les inscriptions suivies depuis le lancement";
    table("tblSignups", {
      caption: "Derniers inscrits", filename: "inscrits", sortKey: "created_at", pageSize: 15,
      emptyTitle: "Aucun compte pour le moment", emptyHelp: "Les nouveaux comptes apparaîtront ici dès leur création.",
      searchText: function (u) { return [u.email, H.siteLabel(u.site_version), H.sourceLabel(u.source_group), u.plan].join(" "); },
      columns: [
        { key: "email", label: "E-mail", render: function (u) { return '<div class="cell-main" title="' + esc(u.email) + '">' + esc(u.email || "—") + "</div>"; } },
        { key: "created_at", label: "Date", render: function (u) { return esc(fmtDay(u.created_at) + " · " + fmtTime(u.created_at)); }, sortValue: function (u) { var t = new Date(u.created_at).getTime(); return isNaN(t) ? null : t; }, csv: function (u) { return u.created_at; } },
        { key: "plan", label: "Offre", render: function (u) {
          var plan = u.role === "admin" ? '<span class="badge cy">Admin</span>' : u.plan === "pro" ? '<span class="badge pay">Pro</span>' : '<span class="badge">Gratuit</span>';
          return plan + (u.is_internal && u.role !== "admin" ? ' <span class="badge int">Test / interne</span>' : "");
        }, sortValue: function (u) { return u.role === "admin" ? "admin" : u.plan; }, csv: function (u) { return (u.role === "admin" ? "admin" : u.plan) + (u.is_internal ? " (interne)" : ""); } },
        { key: "site_version", label: "Version", render: function (u) { return u.site_version ? siteHtml(u.site_version) : '<span class="cell-sub">Inconnue</span>'; }, sortValue: function (u) { return u.site_version ? H.siteLabel(u.site_version) : null; }, csv: function (u) { return u.site_version ? H.siteLabel(u.site_version) : ""; } },
        { key: "source_group", label: "Source", render: function (u) { return u.source_group ? '<span title="' + esc(u.source_raw || u.source || "") + '">' + esc(H.sourceLabel(u.source_group)) + "</span>" : '<span class="cell-sub">Inconnue</span>'; }, sortValue: function (u) { return u.source_group ? H.sourceLabel(u.source_group) : null; }, csv: function (u) { return u.source_group ? H.sourceLabel(u.source_group) : ""; } },
        { key: "device", label: "Appareil", render: function (u) { return u.device ? esc(H.deviceLabel(u.device)) : '<span class="cell-sub">Inconnu</span>'; }, sortValue: function (u) { return u.device || null; }, csv: function (u) { return u.device ? H.deviceLabel(u.device) : ""; } },
        { key: "country_guess", label: "Pays", render: function (u) { return u.country_guess ? countryHtml(u.country_guess) : '<span class="cell-sub">Inconnu</span>'; }, sortValue: function (u) { return u.country_guess ? H.countryName(u.country_guess) : null; }, csv: function (u) { return u.country_guess ? H.countryName(u.country_guess) : ""; } }
      ]
    }).setRows(list);
  }

  // ---------- En direct ----------
  function renderLive() {
    var l = S.live;
    if (!l) return;
    var n = Number(l.active_visitors) || 0;
    $("liveCount").textContent = H.fmtInt(n);
    $("miniLiveCount").textContent = H.fmtInt(n);
    $("miniLiveDot").classList.toggle("off", !n);
    var firstV = (l.visitors || [])[0];
    $("miniLiveText").textContent = n
      ? (firstV ? "Dernière page : " + H.pageInfo(firstV.page, firstV.match_id, S.names).title : "")
      : "Personne sur le site en ce moment.";
    $("liveChip").hidden = false;
    $("liveChipText").textContent = H.fmtInt(n) + " en ligne";
    $("liveChipDot").classList.toggle("off", !n);
    $("liveDot").classList.toggle("off", !n);
    if (S.lastLiveCount !== n) {
      $("liveAnnounce").textContent = H.fmtInt(n) + " visiteur" + (n > 1 ? "s" : "") + " actif" + (n > 1 ? "s" : "") + " en ce moment";
      S.lastLiveCount = n;
    }
    var extra = [];
    if (H.num(l.page_views_30m) !== null) extra.push(H.fmtInt(l.page_views_30m) + " pages vues sur 30 min");
    if (!S.includeInternal && Number(l.internal_active) > 0) extra.push(H.fmtInt(l.internal_active) + " visite" + (Number(l.internal_active) > 1 ? "s" : "") + " interne" + (Number(l.internal_active) > 1 ? "s" : "") + " ou de test masquée" + (Number(l.internal_active) > 1 ? "s" : ""));
    $("liveExtra").textContent = extra.join(" · ");
    $("liveUpdated").textContent = "Actualisé à " + fmtTime(l.generated_at || new Date().toISOString(), true) + " · automatiquement toutes les 15 s";
    var visitors = l.visitors || [];
    $("liveList").innerHTML = visitors.length ? '<ul class="live-list">' + visitors.slice(0, 12).map(function (v) {
      var info = H.pageInfo(v.page, v.match_id, S.names);
      var meta = [
        '<span><span aria-hidden="true">' + H.siteFlag(v.site) + "</span> " + esc(H.siteLabel(v.site)) + "</span>",
        "<span>" + esc(H.deviceLabel(v.device)) + "</span>",
        '<span title="' + esc(v.source_raw || "Accès direct") + '">' + esc(v.source_group === "direct" ? "Direct" : "via " + H.sourceLabel(v.source_group)) + "</span>",
        "<span>" + esc(H.fmtInt(v.page_views) + " page" + (Number(v.page_views) > 1 ? "s" : "")) + "</span>"
      ];
      if (v.tab_hidden) meta.push("<span>onglet en arrière-plan</span>");
      if (v.is_internal) meta.push('<span class="badge int">Interne</span>');
      return '<li class="live-row"><span class="live-flag" title="' + esc(H.countryName(v.country)) + '">' + (H.isCountry(v.country) ? H.flagEmoji(v.country) : "🌐") + '<span class="sr-only">' + esc(H.countryName(v.country)) + "</span></span>"
        + '<div style="min-width:0"><div class="live-page" title="' + esc(v.page) + '">' + esc(info.title) + '</div><div class="live-meta">' + meta.join("") + "</div></div>"
        + '<span class="live-when">' + esc(relTime(v.last_at)) + "</span></li>";
    }).join("") + "</ul>" + (visitors.length > 12 ? '<p class="note">+ ' + esc(H.fmtInt(visitors.length - 12)) + " autres visiteurs actifs (voir l'export CSV).</p>" : "")
      : emptyHtml("Personne sur le site en ce moment", "La liste se met à jour toute seule toutes les 15 secondes.");
    var per = l.per_minute || [];
    if (per.length) {
      makeChart("liveChart", "liveChartBox", {
        type: "bar",
        data: { labels: per.map(function (p) { return fmtTime(p.t); }), datasets: [{ label: "Pages vues", data: per.map(function (p) { return Number(p.page_views) || 0; }), backgroundColor: "#34d399", borderRadius: 3, maxBarThickness: 10 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } } }
      });
    } else {
      destroyChart("liveChart");
      chartFallback("liveChartBox", "");
    }
  }
  function legacyLive(o) {
    return {
      active_visitors: o.active_visitors, internal_active: null, page_views_30m: o.page_views_30m, generated_at: o.generated_at, per_minute: o.per_minute,
      visitors: (o.visitors || []).map(function (v) {
        return { last_at: v.last_at, page_views: v.page_views, page: v.page, match_id: null, site: v.locale, country: v.country_guess, device: v.device, source_group: H.sourceGroup(v.source, null, null), source_raw: v.source, tab_hidden: v.tab_hidden, is_internal: false };
      })
    };
  }
  function loadLive() {
    if (!sb || S.liveLoading) return Promise.resolve();
    S.liveLoading = true;
    var args = S.legacy ? null : filterArgs();
    return rpc("admin_live_view", args).then(function (r) {
      if (r.kind === "missing" && args) return rpc("admin_live_view").then(function (r2) { return { r: r2, legacy: true }; });
      return { r: r, legacy: S.legacy };
    }).then(function (x) {
      S.liveLoading = false;
      if (x.r.kind === "denied") { showState("denied"); return; }
      if (x.r.data) {
        S.live = x.legacy ? legacyLive(x.r.data) : x.r.data;
        renderLive();
        var ids = (S.live.visitors || []).map(function (v) { return v.match_id; }).filter(Boolean);
        if (ids.some(function (id) { return !S.names[id]; })) loadMissingNames(ids).then(function (changed) { if (changed) renderLive(); });
      } else {
        S.live = null;
        $("liveChip").hidden = true;
        $("liveCount").textContent = "—";
        blockError($("liveList"), x.r.kind, x.r.error, "En direct");
      }
    });
  }
  function startLive() {
    stopLive();
    S.liveTimer = setInterval(function () { if (!document.hidden) loadLive(); }, LIVE_EVERY_MS);
  }
  function stopLive() {
    if (S.liveTimer) clearInterval(S.liveTimer);
    S.liveTimer = null;
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
    $("customRange").hidden = S.period !== "custom";
    var today = H.parisToday(new Date());
    $("fromDate").max = today;
    $("toDate").max = today;
    if (S.custom.from) $("fromDate").value = S.custom.from;
    if (S.custom.to) $("toDate").value = S.custom.to;
    $("siteFilter").value = S.site;
    $("deviceFilter").value = S.device;
    $("sourceFilter").value = S.source;
    $("internalToggle").checked = S.includeInternal;
    $("resetFilters").hidden = !(hasFilters() || S.includeInternal);
  }
  function renderAnalyticsBlocks() {
    renderSummary();
    renderOverview();
    renderKpis();
    renderSignupTables();
    renderTrend();
    renderDonuts();
    renderBars();
    renderHeatmap();
    renderFunnel();
    renderPages();
    renderSourcesTables();
  }
  var PERIOD_BLOCKS = [["kpis", "Chiffres clés"], ["tblSignSite", "Inscriptions par version"], ["tblSignSource", "Inscriptions par source"], ["heatmap", "Heures d'affluence"], ["funnel", "Tunnel d'achat"], ["funnelSignup", "Tunnel d'inscription"],
    ["tblPages", "Pages les plus vues"], ["tblEntry", "Pages d'arrivée"], ["tblExit", "Pages de sortie"], ["tblMatches", "Matchs"], ["tblLeagues", "Ligues"],
    ["tblSources", "Sources"], ["tblCountries", "Pays"], ["tblCampaigns", "Campagnes"]];
  function renderAnalyticsError(kind, err, message) {
    S.analytics = null;
    $("summaryText").textContent = message || errorText(kind, err, "Statistiques de la période");
    PERIOD_BLOCKS.forEach(function (b) {
      if (S.tables[b[0]]) S.tables[b[0]].built = false;
      if (message) $(b[0]).innerHTML = '<div class="block-error missing"><p>' + esc(message) + "</p></div>";
      else blockError($(b[0]), kind, err, b[1]);
    });
    ["trendChart", "deviceChart", "sourceChart", "countryChart", "siteChart"].forEach(destroyChart);
    [["trendBox"], ["deviceBox"], ["sourceBox"], ["countryBox"], ["siteBox"]].forEach(function (b) { chartFallback(b[0], message || "Données indisponibles."); });
    $("deviceLegend").innerHTML = "";
    $("sourceLegend").innerHTML = "";
  }

  function loadAll() {
    if (S.loading || !sb) return Promise.resolve();
    setBusy(true);
    S.range = H.periodRange(S.period, H.parisToday(new Date()), S.custom);
    syncControls();
    var args = {}, pa = periodArgs(), fa = filterArgs();
    Object.keys(pa).forEach(function (k) { args[k] = pa[k]; });
    Object.keys(fa).forEach(function (k) { args[k] = fa[k]; });
    var sessArgs = { p_limit: 200 };
    Object.keys(args).forEach(function (k) { if (k !== "p_days") sessArgs[k] = args[k]; });
    var bizArgs = { p_days: S.range.days, p_from: S.range.from, p_to: S.range.to };

    return Promise.all([
      rpc("admin_analytics", args),
      rpc("admin_business", bizArgs),
      rpc("admin_recent_sessions", sessArgs),
      rpc("admin_recent_signups", { p_limit: 500 }),
      rpc("admin_stats"),
      rpc("admin_health")
    ]).then(function (res) {
      if (res.some(function (r) { return r.kind === "denied"; })) { setBusy(false); showState("denied"); return null; }
      S.stats = res[4].data || null;
      S.health = res[5];
      var an = res[0];
      if (an.data) { S.legacy = false; return [res, { data: an.data }]; }
      if (an.kind !== "missing") { S.legacy = false; return [res, an]; }
      S.legacy = true;
      if (!S.range.legacyDays) return [res, { kind: "legacy-period" }];
      return rpc("admin_analytics", { p_days: S.range.legacyDays }).then(function (old) {
        return [res, old.data ? { data: H.legacyAnalytics(old.data) } : old];
      });
    }).then(function (pack) {
      if (!pack) return null;
      var res = pack[0], an = pack[1];
      if (S.legacy) {
        return rpc("admin_recent_sessions", { p_limit: 60 }).then(function (old) { return [res, an, old]; });
      }
      return [res, an, res[2]];
    }).then(function (pack) {
      if (!pack) return;
      var res = pack[0], an = pack[1], ses = pack[2];
      showState("dash");
      if (an.data) {
        S.analytics = an.data;
        renderAnalyticsBlocks();
      } else if (an.kind === "legacy-period") {
        renderAnalyticsError("missing", null, "La période « " + S.range.label + " » nécessite la migration 0019. Choisissez Aujourd'hui, 7, 30 ou 90 jours.");
      } else {
        renderAnalyticsError(an.kind, an.error);
      }
      renderNotices();
      renderBusiness(res[1]);
      if (ses.data) {
        S.sessions = S.legacy ? ses.data.map(function (s) {
          return { first_at: s.first_at, last_at: s.last_at, site: s.locale, entry_page: s.entry_page, device: s.device, browser: s.browser, os: s.os, country: s.country_guess, source_group: s.source === null || s.source === undefined ? null : H.sourceGroup(s.source === "(direct)" ? null : s.source, null, null), source_raw: s.source === "(direct)" ? null : s.source, utm_campaign: s.campaign, page_views: s.page_views, duration_sec: s.duration_sec, signed_up: s.signed_up, checkout_started: s.checkout_started, checkout_success: s.checkout_success, pages: s.pages || [], events: s.events || [] };
        }) : ses.data;
        renderJourneys();
      } else {
        S.sessions = null;
        blockError($("journeys"), ses.kind, ses.error, "Parcours des visiteurs");
      }
      renderSignups(res[3]);
      renderHealth();
      if (!S.analytics && !S.business) $("kpiOverview").innerHTML = '<div class="block-error"><p>' + esc(errorText(an.kind || "error", an.error, "L'essentiel")) + "</p></div>";
      var c = S.analytics && S.analytics.coverage;
      $("footCoverage").textContent = c && c.first_event_at
        ? "Premier événement enregistré : " + fmtDateTime(c.first_event_at) + " · lancement des statistiques : " + fmtDateTime(c.launch_at || H.LAUNCH_AT) + " · rétention : 13 mois."
        : "";
      $("updatedAt").textContent = "Mis à jour à " + fmtTime(new Date().toISOString());
      setBusy(false);
      refreshNames();
      return loadLive().then(startLive);
    }).catch(function (e) {
      setBusy(false);
      showState("dash");
      renderAnalyticsError("error", e);
    });
  }

  // ---------- Exclusion d'une visite ----------
  var pendingExclusion = null;
  function askExclusion(sessionId, exclude) {
    var s = (S.sessions || []).filter(function (x) { return x.session_id === sessionId; })[0];
    var text = exclude
      ? "« " + (s ? H.sessionSentence(s) : sessionId) + " » ne sera plus comptée dans les statistiques. Rien n'est supprimé : vous pourrez la réintégrer en activant « Inclure mon trafic / tests »."
      : "Cette visite sera de nouveau comptée dans les statistiques.";
    pendingExclusion = { id: sessionId, exclude: exclude };
    $("confirmTitle").textContent = exclude ? "Exclure cette visite ?" : "Réintégrer cette visite ?";
    $("confirmText").textContent = text;
    $("confirmOk").textContent = exclude ? "Exclure" : "Réintégrer";
    $("confirmOk").className = exclude ? "btn btn-danger" : "btn";
    var dlg = $("confirmDialog");
    if (dlg && typeof dlg.showModal === "function") {
      dlg.showModal();
      $("confirmCancel").focus();
    } else if (window.confirm(text)) {
      runExclusion();
    }
  }
  function runExclusion() {
    var p = pendingExclusion;
    pendingExclusion = null;
    var dlg = $("confirmDialog");
    if (dlg && dlg.open) dlg.close();
    if (!p) return;
    rpc("admin_exclude_session", { p_session_id: p.id, p_exclude: p.exclude }).then(function (r) {
      if (r.kind === "denied") { showState("denied"); return; }
      if (r.kind === "missing") { toast("Migration 0019 non appliquée : l'exclusion de visites sera disponible après son application."); return; }
      if (r.error) { toast(r.kind === "invalid" ? "Identifiant de visite invalide." : errorText(r.kind, r.error, "Exclusion")); return; }
      var n = Number(r.data) || 0;
      toast(p.exclude ? "Visite exclue (" + n + " événement" + (n > 1 ? "s" : "") + " marqué" + (n > 1 ? "s" : "") + "). Chiffres recalculés." : "Visite réintégrée. Chiffres recalculés.");
      S.openJourney = null;
      loadAll();
    });
  }

  // ---------- Evenements ----------
  function wire() {
    wireTabs();
    $("deviceBtn").addEventListener("click", toggleDevice);
    $("stateErrorRetry").addEventListener("click", function () { window.location.reload(); });
    $("refreshBtn").addEventListener("click", function () { loadAll(); });
    $("periodSeg").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-period]");
      if (!b) return;
      var p = b.getAttribute("data-period");
      if (p === "custom") {
        S.period = "custom";
        if (!S.custom.from) { var t = H.parisToday(new Date()); S.custom = { from: H.addDays(t, -13), to: t }; }
        syncControls();
        $("fromDate").focus();
        return;
      }
      if (p === S.period) return;
      S.period = p;
      savePrefs();
      loadAll();
    });
    $("applyRange").addEventListener("click", function () {
      var f = $("fromDate").value, t = $("toDate").value;
      if (!H.ymdOk(f)) { toast("Choisissez une date de début."); $("fromDate").focus(); return; }
      S.custom = { from: f, to: H.ymdOk(t) ? t : f };
      S.period = "custom";
      savePrefs();
      loadAll();
    });
    [["siteFilter", "site"], ["deviceFilter", "device"], ["sourceFilter", "source"]].forEach(function (x) {
      $(x[0]).addEventListener("change", function (ev) { S[x[1]] = ev.target.value; savePrefs(); loadAll(); });
    });
    $("internalToggle").addEventListener("change", function (ev) { S.includeInternal = ev.target.checked; savePrefs(); loadAll(); });
    $("resetFilters").addEventListener("click", function () { S.site = ""; S.device = ""; S.source = ""; S.includeInternal = false; savePrefs(); loadAll(); });
    $("testPeriodBtn").addEventListener("click", function () { S.showTestPeriod = !S.showTestPeriod; savePrefs(); loadAll(); });
    $("noticeInternalBtn").addEventListener("click", function () { S.includeInternal = !S.includeInternal; savePrefs(); loadAll(); });
    $("noticeDeviceClose").addEventListener("click", function () {
      $("noticeDevice").hidden = true;
      try { localStorage.setItem("iashark_admin_device_notice", "1"); } catch (e) {}
    });
    $("journeyFilter").addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-jf]");
      if (!b) return;
      S.journeyFilter = b.getAttribute("data-jf");
      S.journeyLimit = 20;
      renderJourneys();
    });
    $("journeys").addEventListener("click", function (ev) {
      var t = ev.target;
      var ex = t.closest("button[data-exclude]");
      if (ex) { askExclusion(ex.getAttribute("data-exclude"), true); return; }
      var re = t.closest("button[data-restore]");
      if (re) { askExclusion(re.getAttribute("data-restore"), false); return; }
      if (t.closest("#journeysMore")) { S.journeyLimit += 20; renderJourneys(); return; }
      var row = t.closest("button.j-row");
      if (!row) return;
      var i = Number(row.getAttribute("data-j")), list = journeyList(), s = list[i];
      if (!s) return;
      var detail = $("jd" + i), open = row.getAttribute("aria-expanded") !== "true";
      row.setAttribute("aria-expanded", String(open));
      detail.hidden = !open;
      detail.innerHTML = open ? journeyDetail(s) : "";
      S.openJourney = open ? String(s.session_id || s.first_at + "|" + i) : null;
    });
    $("confirmOk").addEventListener("click", runExclusion);
    $("confirmCancel").addEventListener("click", function () { pendingExclusion = null; $("confirmDialog").close(); });
    $("confirmDialog").addEventListener("close", function () { pendingExclusion = null; });
    document.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest("button[data-retry]")) loadAll();
    });

    // Exports CSV des graphiques et du direct.
    $("trendCsv").addEventListener("click", function () {
      if (!S.analytics) return;
      var hourly = S.analytics.range && S.analytics.range.granularity === "hour";
      downloadCsv("evolution", [
        { label: hourly ? "Heure (Paris)" : "Jour", csv: function (r) { return String(r.t).replace("T", " ").slice(0, hourly ? 16 : 10); } },
        { label: "Visiteurs", csv: function (r) { return Number(r.visitors) || 0; } },
        { label: "Pages vues", csv: function (r) { return Number(r.page_views) || 0; } }
      ], S.analytics.series || []);
    });
    $("deviceCsv").addEventListener("click", function () {
      if (S.analytics) downloadCsv("appareils", [{ label: "Appareil", csv: function (r) { return H.deviceLabel(r.device); } }, { label: "Visiteurs", csv: function (r) { return Number(r.visitors) || 0; } }], S.analytics.devices || []);
    });
    $("sourceCsv").addEventListener("click", function () {
      if (S.analytics) downloadCsv("sources", [{ label: "Source", csv: function (r) { return H.sourceLabel(r.source_group); } }, { label: "Visiteurs", csv: function (r) { return Number(r.visitors) || 0; } }, { label: "Inscrits", key: "signups" }, { label: "Sites référents", csv: function (r) { return (r.examples || []).join(" "); } }], S.analytics.sources || []);
    });
    $("countryCsv").addEventListener("click", function () {
      if (S.analytics) downloadCsv("pays", [{ label: "Pays", csv: function (r) { return H.countryName(r.country); } }, { label: "Code", key: "country" }, { label: "Visiteurs", csv: function (r) { return Number(r.visitors) || 0; } }, { label: "Inscrits", key: "signups" }], S.analytics.countries || []);
    });
    $("siteCsv").addEventListener("click", function () {
      if (S.analytics) downloadCsv("versions", [{ label: "Version", csv: function (r) { return H.siteLabel(r.site); } }, { label: "Visiteurs", csv: function (r) { return Number(r.visitors) || 0; } }, { label: "Inscrits", key: "signups" }], S.analytics.sites || []);
    });
    $("heatmapCsv").addEventListener("click", function () {
      if (!S.analytics || !S.analytics.heatmap) return;
      var g = H.heatmapGrid(S.analytics.heatmap, 1), rows = [];
      g.rows.forEach(function (r) { r.cells.forEach(function (c) { rows.push({ day: r.label, hour: c.from, visitors: c.visitors }); }); });
      downloadCsv("heures-affluence", [{ label: "Jour", key: "day" }, { label: "Heure (Paris)", key: "hour" }, { label: "Visiteurs", key: "visitors" }], rows);
    });
    $("funnelCsv").addEventListener("click", function () {
      if (!S.analytics) return;
      downloadCsv("tunnel-achat", funnelCsvColumns(), H.funnelSteps(S.analytics.funnel, "purchase"));
    });
    $("funnelSignupCsv").addEventListener("click", function () {
      if (!S.analytics) return;
      downloadCsv("tunnel-inscription", funnelCsvColumns(), H.funnelSteps(S.analytics.funnel, "signup"));
    });
    function funnelCsvColumns() {
      return [{ label: "Étape", key: "label" }, { label: "Visiteurs", key: "value" },
        { label: "% des visiteurs", csv: function (s) { return s.pctOfFirst === null ? "" : Math.round(s.pctOfFirst * 10) / 10; } },
        { label: "% de l'étape précédente", csv: function (s) { return s.pctOfPrev === null ? "" : Math.round(s.pctOfPrev * 10) / 10; } }];
    }
    $("liveCsv").addEventListener("click", function () {
      var list = (S.live && S.live.visitors) || [];
      downloadCsv("en-direct", [
        { label: "Dernière activité", key: "last_at" },
        { label: "Page", csv: function (v) { return H.pageInfo(v.page, v.match_id, S.names).title; } },
        { label: "Adresse", key: "page" },
        { label: "Version", csv: function (v) { return H.siteLabel(v.site); } },
        { label: "Pays estimé", csv: function (v) { return H.countryName(v.country); } },
        { label: "Appareil", csv: function (v) { return H.deviceLabel(v.device); } },
        { label: "Source", csv: function (v) { return H.sourceLabel(v.source_group); } },
        { label: "Source brute", key: "source_raw" },
        { label: "Pages vues", key: "page_views" }
      ], list);
    });
    $("journeysCsv").addEventListener("click", function () {
      downloadCsv("parcours", [
        { label: "Début", key: "first_at" }, { label: "Fin", key: "last_at" },
        { label: "Résumé", csv: function (s) { return H.sessionSentence(s); } },
        { label: "Version", csv: function (s) { return H.siteLabel(s.site); } },
        { label: "Pays estimé", csv: function (s) { return H.countryName(s.country); } },
        { label: "Appareil", csv: function (s) { return H.deviceLabel(s.device); } },
        { label: "Source", csv: function (s) { return s.source_group ? H.sourceLabel(s.source_group) : ""; } },
        { label: "Source brute", key: "source_raw" }, { label: "Campagne", key: "utm_campaign" },
        { label: "Page d'arrivée", csv: function (s) { return H.pageInfo(s.entry_page, s.entry_match_id, S.names).title; } },
        { label: "Pages vues", key: "page_views" }, { label: "Durée (s)", key: "duration_sec" },
        { label: "Inscrit", key: "signed_up" }, { label: "Paiement commencé", key: "checkout_started" }, { label: "Payé", key: "checkout_success" },
        { label: "Parcours", csv: function (s) { return (s.pages || []).map(function (p) { return H.pageInfo(p.page, p.match_id, S.names).title; }).join(" > "); } },
        { label: "Trafic interne", csv: function (s) { return H.internalReasonLabel(s.internal_reason); } }
      ], journeyList());
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!S.analytics || !S.analytics.heatmap) return;
        var w = $("heatmap").clientWidth || 800;
        var bin = w < 420 ? 4 : w < 640 ? 3 : 1;
        if (bin !== S.heatBin) renderHeatmap();
      }, 200);
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && S.liveTimer) loadLive(); });
  }

  // ---------- Demarrage ----------
  // Premier passage sur le tableau de bord : l'appareil est exclu d'office,
  // sauf si le proprietaire a choisi "Ne plus exclure cet appareil".
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
    showTab(String(location.hash || "").slice(1));
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      showState("error", "Le module de connexion (Supabase) n'a pas pu être chargé. Vérifiez la connexion Internet ou désactivez un bloqueur de contenu pour cette page, puis rechargez.");
      return;
    }
    try {
      sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    } catch (e) {
      showState("error", "Le client de connexion n'a pas pu démarrer. Rechargez la page.");
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
        else showState("error", kind === "network" ? "Connexion impossible au serveur. Vérifiez la connexion Internet puis rechargez." : "Impossible de vérifier votre compte pour le moment. Rechargez la page.");
        return;
      }
      if (!ures.data || ures.data.role !== 'admin') { showState("denied"); return; }
      markInternalBrowser();
      renderDevice();
      showState("dash");
      loadDataJsonMeta();
      return loadAll();
    }).catch(function () {
      showState("error", "Impossible de vérifier votre compte pour le moment. Rechargez la page.");
    });
  }

  init();
})();
