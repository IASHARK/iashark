"use strict";
// SURVEILLANCE DU SITE (MONITORING.md) - fonctions PURES, sans reseau.
//
// Chaque controle renvoie un resultat { id, group, title, status, detail, fix }
// avec status = "ok" | "warn" | "fail" | "skip" :
//   - fail : panne critique -> issue GitHub "Sante du site" + code de sortie 1 ;
//   - warn : a surveiller -> resume du job uniquement ;
//   - skip : controle impossible (secret absent, fichier pas encore deploye).
// scripts/site-health-check.js fait les appels reseau et passe les reponses
// a ces fonctions ; tests/site-health.test.js les teste avec des fixtures.
//
// Section "DONNEES PUBLIQUES" (fin de fichier) : controles du workflow
// .github/workflows/health-monitor.yml et de scripts/health-check.js sur les
// fichiers publics (data-home.json, data.json, match/<id>.json) : fraicheur
// de generated_at, nombre de matchs, match offert, ligues attendues, cotes
// brutes publiques et fuite de champs premium (lib/premium-fields.js,
// deepPremiumLeaks). Testes par tests/health-checks.test.js.
// odds_available est un champ PREMIUM (retire des fichiers publics) : il n'est
// jamais utilise pour savoir si des cotes existent.

const path = require("path");

// Liste minimale des champs premium (demande du proprietaire). Completee a
// l'execution par lib/premium-fields.js (s'il existe) et par
// lib/public-data-split.js (PREMIUM_FIELDS) : jamais moins que ces sources.
const BASE_PREMIUM_FIELDS = [
  "pari_rec", "cote_rec", "model_probability", "markets_compared", "market_id", "marche",
  "kelly", "edge", "verdict_shark", "facteur_x", "player_markets",
];

function result(id, group, title, status, detail, fix) {
  const r = { id: id, group: group, title: title, status: status, detail: detail || "" };
  if (fix) r.fix = fix;
  return r;
}
const ok = (id, group, title, detail) => result(id, group, title, "ok", detail);
const warn = (id, group, title, detail, fix) => result(id, group, title, "warn", detail, fix);
const fail = (id, group, title, detail, fix) => result(id, group, title, "fail", detail, fix);
const skip = (id, group, title, detail) => result(id, group, title, "skip", detail);

// Toutes les listes de chaines exportees par un module dont le nom evoque
// "premium" (ou le module lui-meme s'il est un tableau).
function premiumListsFromModule(mod) {
  if (Array.isArray(mod)) return [mod];
  if (!mod || typeof mod !== "object") return [];
  return Object.keys(mod)
    .filter((k) => /premium/i.test(k) && Array.isArray(mod[k]))
    .map((k) => mod[k]);
}

// Noms trop generiques pour etre cherches en profondeur (fatigue.home.val,
// par exemple, n'est pas un pari) : verifies au premier niveau du match
// seulement. Meme regle que TOP_LEVEL_ONLY dans lib/premium-fields.js.
const GENERIC_TOP_LEVEL_ONLY = ["val", "hot", "scores", "risque", "mise", "scenario", "edge", "marche", "btts", "p1", "p2", "pn"];

// fields : champs interdits au premier niveau d'un match non offert.
// deepFields : champs interdits a toute profondeur (DEEP_PREMIUM_KEYS de la
// liste partagee si elle l'exporte, sinon fields moins les noms generiques).
function loadPremiumFields(root, requireFn) {
  const req = requireFn || require;
  const set = new Set(BASE_PREMIUM_FIELDS);
  const deep = new Set();
  const sources = ["base"];
  for (const rel of ["lib/premium-fields.js", "lib/public-data-split.js"]) {
    let mod;
    try { mod = req(path.join(root, rel)); } catch (e) { continue; }
    const lists = premiumListsFromModule(mod);
    if (!lists.length) continue;
    lists.forEach((l) => l.forEach((f) => { if (typeof f === "string" && f) set.add(f); }));
    if (mod && Array.isArray(mod.DEEP_PREMIUM_KEYS)) mod.DEEP_PREMIUM_KEYS.forEach((f) => { if (typeof f === "string") deep.add(f); });
    sources.push(rel);
  }
  const fields = Array.from(set);
  fields.forEach((f) => { if (GENERIC_TOP_LEVEL_ONLY.indexOf(f) === -1) deep.add(f); });
  GENERIC_TOP_LEVEL_ONLY.forEach((f) => deep.delete(f));
  return { fields: fields, deepFields: Array.from(deep), sources: sources };
}

// Accepte une liste simple (tout est cherche partout) ou { fields, deepFields }.
function normFields(spec) {
  if (Array.isArray(spec)) return { top: spec, deep: spec };
  return { top: (spec && spec.fields) || [], deep: (spec && (spec.deepFields || spec.fields)) || [] };
}

// Parcours recursif : chemins des cles premium trouvees. Les champs `top` sont
// verifies au premier niveau, les champs `deep` a toute profondeur.
function scanPremium(value, spec, basePath, out, depth) {
  const f = normFields(spec);
  const found = out || [];
  const d = depth || 0;
  const p = basePath || "";
  if (d > 20 || value == null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanPremium(v, { fields: f.deep, deepFields: f.deep }, p + "[" + i + "]", found, d + 1));
    return found;
  }
  const here = d === 0 ? f.top.concat(f.deep) : f.deep;
  for (const k of Object.keys(value)) {
    const child = p ? p + "." + k : k;
    if (here.indexOf(k) !== -1) found.push(child);
    scanPremium(value[k], { fields: f.deep, deepFields: f.deep }, child, found, d + 1);
  }
  return found;
}

// Fuites sur les matchs NON offerts uniquement (is_free === true : tout public).
function findMatchLeaks(matches, spec) {
  const leaks = [];
  (matches || []).forEach((m) => {
    if (!m || typeof m !== "object" || m.is_free === true) return;
    const paths = scanPremium(m, spec, "");
    if (paths.length) leaks.push({ id: m.id != null ? String(m.id) : "?", paths: paths });
  });
  return leaks;
}

function summarizeLeaks(leaks) {
  const fieldsSeen = new Set();
  leaks.forEach((l) => l.paths.forEach((p) => fieldsSeen.add(p.replace(/\[\d+\]/g, "[]"))));
  return { matchCount: leaks.length, fields: Array.from(fieldsSeen).sort() };
}

// Liste lisible : les 12 premiers champs, puis "et N autres".
function fieldList(names, max) {
  const n = max || 12;
  return names.length <= n ? names.join(", ") : names.slice(0, n).join(", ") + " et " + (names.length - n) + " autre(s)";
}

function checkPremiumLeaks(id, sourceLabel, matches, fields) {
  const title = "Aucun champ premium public : " + sourceLabel;
  if (!Array.isArray(matches)) return skip(id, "fuite", title, "source indisponible");
  const leaks = findMatchLeaks(matches, fields);
  if (!leaks.length) return ok(id, "fuite", title, matches.length + " match(s) verifie(s), aucun champ premium hors match offert");
  const s = summarizeLeaks(leaks);
  return fail(id, "fuite", title,
    s.matchCount + " match(s) payant(s) exposent : " + fieldList(s.fields) + " (ex. match " + leaks[0].id + ")",
    "Des donnees payantes sont lisibles gratuitement. Verifier que le dernier commit de nettoyage du pipeline (update-data.yml, CHAMPS_PREMIUM) est bien sur main, puis relancer \"Update IASHARK Daily\" (Actions -> Run workflow) pour regenerer les fichiers publics.");
}

// --- Dates (heure de Paris) -------------------------------------------------
function parisDay(date) {
  // en-CA formate en AAAA-MM-JJ.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function addDays(day, n) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function matchDay(m) {
  // data.json : "date" = "AAAA-MM-JJ HH:MM" en heure de Paris.
  const s = String((m && m.date) || "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function checkUpcomingMatches(matches, now) {
  const id = "fraicheur-matchs";
  const title = "Matchs d'aujourd'hui ou de demain (heure de Paris)";
  if (!Array.isArray(matches)) {
    return fail(id, "fraicheur", title, "Impossible de lire la liste des matchs publique",
      "Le site ne publie plus de donnees lisibles. Verifier le dernier deploiement Netlify et le dernier run \"Update IASHARK Daily\".");
  }
  const today = parisDay(now);
  const tomorrow = addDays(today, 1);
  const upcoming = matches.filter((m) => { const d = matchDay(m); return d === today || d === tomorrow; });
  if (upcoming.length) return ok(id, "fraicheur", title, upcoming.length + " match(s) le " + today + " ou le " + tomorrow + " (" + matches.length + " au total)");
  const days = Array.from(new Set(matches.map(matchDay).filter(Boolean))).sort();
  return fail(id, "fraicheur", title,
    "Aucun match le " + today + " ni le " + tomorrow + " (" + matches.length + " match(s) publies, jours : " + (days.join(", ") || "aucun") + ")",
    "Les donnees ne se rafraichissent plus. Ouvrir Actions -> \"Update IASHARK Daily\" : si le dernier run a echoue, lire l'etape en rouge et le relancer. S'il a reussi, verifier le deploiement Netlify. (Rare : treve internationale sans aucun match couvert.)");
}

function hoursBetween(a, b) {
  return (b.getTime() - a.getTime()) / 3600000;
}

function checkDailyCommitAge(commitIso, now, maxHours) {
  const id = "fraicheur-commit";
  const limit = maxHours || 30;
  const title = "Dernier commit \"Daily update\" sur main de moins de " + limit + " h";
  if (!commitIso) {
    return fail(id, "fraicheur", title, "Aucun commit \"Daily update\" trouve sur main",
      "Le pipeline quotidien ne publie plus. Ouvrir Actions -> \"Update IASHARK Daily\" et verifier qu'il tourne (il peut avoir ete desactive) puis le lancer a la main.");
  }
  const d = new Date(commitIso);
  if (isNaN(d.getTime())) return skip(id, "fraicheur", title, "date illisible : " + commitIso);
  const age = hoursBetween(d, now);
  const detail = "dernier commit " + commitIso + " (il y a " + age.toFixed(1) + " h)";
  if (age <= limit) return ok(id, "fraicheur", title, detail);
  return fail(id, "fraicheur", title, detail,
    "Le pipeline quotidien n'a rien publie depuis plus de " + limit + " h. Ouvrir Actions -> \"Update IASHARK Daily\" : lire le dernier run (echec, delai depasse ou workflow desactive) et le relancer.");
}

// Deploiement Netlify bloque : main a un "Daily update" recent mais le site
// sert encore des donnees generees bien avant.
function checkDeployLag(commitIso, generatedAtIso, now) {
  const id = "deploiement-netlify";
  const title = "Le site sert les donnees du dernier commit quotidien (Netlify)";
  if (!commitIso || !generatedAtIso) return skip(id, "deploiement", title, "date de commit ou de generation indisponible");
  const c = new Date(commitIso);
  const g = new Date(generatedAtIso);
  if (isNaN(c.getTime()) || isNaN(g.getTime())) return skip(id, "deploiement", title, "date illisible");
  const lag = hoursBetween(g, c);
  const sinceCommit = hoursBetween(c, now);
  const detail = "donnees en ligne generees le " + generatedAtIso + ", commit quotidien le " + commitIso;
  // Netlify deploie en quelques minutes : 1 h de grace apres le commit.
  if (lag > 3 && sinceCommit > 1) {
    return fail(id, "deploiement", title, detail + " : le site a " + lag.toFixed(1) + " h de retard",
      "Le deploiement Netlify semble bloque ou en echec. Ouvrir Netlify -> Deploys : lire le log du dernier deploiement de main (souvent une erreur de \"node scripts/build-public.js\") et cliquer \"Retry deploy\".");
  }
  return ok(id, "deploiement", title, detail);
}

function checkFreeMatch(matches) {
  const id = "contenu-match-offert";
  const title = "Au moins un match offert (is_free)";
  if (!Array.isArray(matches) || !matches.length) return skip(id, "contenu", title, "aucun match publie");
  const free = matches.filter((m) => m && m.is_free === true);
  if (free.length) return ok(id, "contenu", title, free.length + " match(s) offert(s) : " + free.map((m) => m.id).join(", "));
  return fail(id, "contenu", title, "Aucun match n'est marque is_free:true sur " + matches.length + " match(s)",
    "Les visiteurs gratuits n'ont plus d'analyse offerte (bouton \"match gratuit du jour\" casse). Verifier dans le log du pipeline l'etape de choix du match offert (lib/free-match.js) et relancer \"Update IASHARK Daily\".");
}

// run_output.safe_pick (data.json) : complet uniquement pour le match offert.
function checkSafePick(runOutput, matches) {
  const id = "fuite-safe-pick";
  const title = "run_output (safe_pick, combines, buteurs) masque hors match offert";
  if (!runOutput || typeof runOutput !== "object") return skip(id, "fuite", title, "run_output absent de la source lue");
  const problems = [];
  const freeIds = (matches || []).filter((m) => m && m.is_free === true).map((m) => String(m.id));
  const sp = runOutput.safe_pick;
  if (sp && typeof sp === "object" && sp.redacted !== true) {
    const fid = sp.fixture && sp.fixture.fixture_id != null ? String(sp.fixture.fixture_id) : null;
    const revealing = ["market", "selection", "model_probability", "decimal_odds"].some((k) => sp[k] != null);
    if (revealing && !(fid && freeIds.indexOf(fid) !== -1)) problems.push("safe_pick du match " + (fid || "?") + " (non offert) publie en clair");
  }
  const combos = runOutput.daily_combos;
  if (combos && typeof combos === "object" && Array.isArray(combos.combos) &&
      combos.combos.some((c) => c && (Array.isArray(c.legs) && c.legs.length))) {
    problems.push("combines du jour publies avec leurs jambes");
  }
  const top = runOutput.top5_scorers;
  if (top && typeof top === "object" && Array.isArray(top.players) && top.players.length) {
    problems.push("top buteurs publie en clair");
  }
  if (!problems.length) return ok(id, "fuite", title, sp && sp.redacted === true ? "safe_pick masque" : "safe_pick absent ou sur le match offert");
  return fail(id, "fuite", title, problems.join(" ; "),
    "Le pari du jour d'un match payant est lisible dans data.json. Verifier que lib/public-run-output.js est bien utilise par le pipeline sur main, puis relancer \"Update IASHARK Daily\".");
}

function hasText(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(hasText);
  if (typeof v === "object") return Object.keys(v).some((k) => hasText(v[k]));
  return false;
}

// freeOnly : quand analyse_card / contexte sont premium (lib/premium-fields.js),
// seuls les matchs offerts les portent dans les fichiers publics ; le ratio est
// alors calcule sur eux (sinon 0 % permanent et fausse alerte ANTHROPIC_KEY).
function checkLlmTexts(allMatches, sourceLabel, opts) {
  const id = "contenu-textes-ia";
  const title = "Textes d'analyse IA presents (analyse_card / contexte)";
  const freeOnly = !!(opts && opts.freeOnly);
  const matches = Array.isArray(allMatches) && freeOnly ? allMatches.filter((m) => m && m.is_free === true) : allMatches;
  if (!Array.isArray(matches) || !matches.length) return skip(id, "contenu", title, freeOnly ? "aucun match offert dans la source lue" : "aucun match detaille lu");
  const n = matches.filter((m) => m && (hasText(m.analyse_card) || hasText(m.contexte))).length;
  const pct = Math.round((n / matches.length) * 100);
  const detail = n + "/" + matches.length + (freeOnly ? " match(s) offert(s)" : " match(s)") + " avec texte (" + pct + " %, source " + sourceLabel + ")";
  if (n === 0) {
    return warn(id, "contenu", title, detail + " - cause probable : secret ANTHROPIC_KEY absent, invalide ou credit Anthropic epuise",
      "Verifier Settings -> Secrets and variables -> Actions -> ANTHROPIC_KEY, et le credit sur console.anthropic.com, puis relancer \"Update IASHARK Daily\".");
  }
  return ok(id, "contenu", title, detail);
}

// Valeur non vide : texte, nombre fini, ou objet/tableau qui en contient.
function hasData(v) {
  if (v == null) return false;
  if (typeof v === "number") return isFinite(v);
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(hasData);
  if (typeof v === "object") return Object.keys(v).some((k) => hasData(v[k]));
  return false;
}

// Cotes BRUTES publiques des bookmakers (donnee de marche, PUBLIC_FACT de
// lib/premium-fields.js). odds_available est premium : jamais lu ici.
const PUBLIC_ODDS_FIELDS = ["c1", "cn", "c2"];

function parseOdd(v) {
  const n = parseFloat(v);
  return isFinite(n) && n > 1 ? n : null;
}

function hasOdds(m) {
  return !!m && typeof m === "object" && PUBLIC_ODDS_FIELDS.some((k) => parseOdd(m[k]) !== null);
}

function checkOdds(matches) {
  const id = "contenu-cotes";
  const title = "Cotes presentes sur les matchs";
  if (!Array.isArray(matches) || !matches.length) return skip(id, "contenu", title, "aucun match publie");
  const n = matches.filter(hasOdds).length;
  const pct = Math.round((n / matches.length) * 100);
  const detail = n + "/" + matches.length + " match(s) avec cotes (" + pct + " %)";
  const fix = "Verifier le quota api-football (dashboard.api-football.com) et le secret APISPORTS_KEY, puis le log de l'etape cotes du pipeline.";
  if (n === 0) return fail(id, "contenu", title, detail + " - aucune cote : api-football en panne, quota epuise ou cle invalide", fix);
  if (pct < 50) return warn(id, "contenu", title, detail, fix);
  return ok(id, "contenu", title, detail);
}

function checkPinnacle(matches) {
  const id = "contenu-cotes-pinnacle";
  const title = "Cotes Pinnacle presentes (pinnacle_snapshot)";
  if (!Array.isArray(matches) || !matches.length) return skip(id, "contenu", title, "aucun match detaille lu");
  const n = matches.filter((m) => m && hasData(m.pinnacle_snapshot)).length;
  const detail = n + "/" + matches.length + " match(s) avec cotes Pinnacle";
  if (n === 0) {
    return warn(id, "contenu", title, detail + " - cotes Pinnacle vides",
      "Verifier dans le log du pipeline l'etape Pinnacle (lib/pinnacle-odds.js) : cle, quota ou changement du fournisseur.");
  }
  return ok(id, "contenu", title, detail);
}

// --- Pages -------------------------------------------------------------------
function htmlLang(body) {
  const m = String(body || "").match(/<html\b[^>]*\blang\s*=\s*["']?([A-Za-z-]+)/i);
  return m ? m[1] : null;
}

function checkPage(pathname, res, expectedLang) {
  const id = "page:" + pathname;
  const title = "Page " + pathname + " en ligne";
  const fix = "Verifier le dernier deploiement Netlify (Deploys) et que le fichier existe dans dist/ (node scripts/build-public.js).";
  if (!res || res.error) return fail(id, "pages", title, "injoignable : " + ((res && res.error) || "pas de reponse"), fix);
  if (res.status !== 200) return fail(id, "pages", title, "HTTP " + res.status + " (attendu 200)", fix);
  if (expectedLang) {
    const lang = htmlLang(res.body);
    if (!lang || lang.toLowerCase() !== expectedLang.toLowerCase()) {
      return fail(id, "pages", title, "<html lang=\"" + lang + "\"> au lieu de \"" + expectedLang + "\"",
        "La page sert la mauvaise langue. Regenerer les pages (node scripts/build-locales.js) et redeployer.");
    }
    return ok(id, "pages", title, "200, lang=" + lang);
  }
  return ok(id, "pages", title, "200");
}

function checkNotPublic(pathname, res) {
  const id = "interne:" + pathname;
  const title = "Fichier interne " + pathname + " non publie";
  if (!res || res.error) return skip(id, "securite", title, "injoignable : " + ((res && res.error) || "pas de reponse"));
  if (res.status === 404 || res.status === 410) return ok(id, "securite", title, "HTTP " + res.status);
  return fail(id, "securite", title, "HTTP " + res.status + " (attendu 404) : fichier interne accessible publiquement",
    "Un document interne est en ligne. Verifier netlify.toml (publish = \"dist\") et la liste FORBIDDEN de scripts/build-public.js, puis redeployer.");
}

function checkRedirect(pathname, res, expectedStatus, expectedTarget) {
  const id = "redirection:" + pathname;
  const title = "Redirection " + pathname + " -> " + expectedTarget;
  const fix = "Verifier _redirects (genere par node scripts/build-locales.js) et qu'il est bien copie dans dist/.";
  if (!res || res.error) return fail(id, "pages", title, "injoignable : " + ((res && res.error) || "pas de reponse"), fix);
  const loc = String(res.location || "");
  const target = loc.replace(/^https?:\/\/[^/]+/, "");
  if (res.status !== expectedStatus) return fail(id, "pages", title, "HTTP " + res.status + " (attendu " + expectedStatus + ")" + (loc ? " vers " + loc : ""), fix);
  if (expectedTarget && target !== expectedTarget) return fail(id, "pages", title, "redirige vers " + (loc || "(rien)") + " au lieu de " + expectedTarget, fix);
  return ok(id, "pages", title, res.status + " -> " + target);
}

// --- Fonctions Edge Supabase -------------------------------------------------
function checkMatchDataFunction(res, fields) {
  const id = "edge:match-data";
  const title = "Fonction match-data (visiteur anonyme)";
  const fix = "Ouvrir Supabase -> Edge Functions -> match-data -> Logs. Une erreur 502 veut dire que la fonction n'arrive pas a lire les fichiers publics du site.";
  if (!res || res.error) return fail(id, "supabase", title, "injoignable : " + ((res && res.error) || "pas de reponse"), fix);
  if (res.status !== 200) return fail(id, "supabase", title, "HTTP " + res.status, fix);
  const matches = res.json && Array.isArray(res.json.matchs) ? res.json.matchs : null;
  if (!matches || !matches.length) return fail(id, "supabase", title, "aucun match renvoye", fix);
  if (res.json.isPro === true) return fail(id, "supabase", title, "un visiteur anonyme est considere comme abonne (isPro:true)", "Faille d'acces : verifier la verification du jeton dans supabase/functions/match-data/index.ts.");
  const leaks = findMatchLeaks(matches, fields);
  if (leaks.length) {
    const s = summarizeLeaks(leaks);
    return fail(id, "supabase", title, s.matchCount + " match(s) payant(s) renvoient : " + fieldList(s.fields),
      "La fonction match-data laisse passer des champs premium. Comparer PREMIUM_FIELDS de supabase/functions/match-data/index.ts avec lib/public-data-split.js et redeployer la fonction.");
  }
  return ok(id, "supabase", title, matches.length + " match(s), aucun champ premium hors match offert");
}

function checkCheckoutFunction(res) {
  const id = "edge:create-checkout-session";
  const title = "Fonction create-checkout-session sans consentement";
  const fix = "Ouvrir Supabase -> Edge Functions -> create-checkout-session -> Logs, et verifier les secrets STRIPE_* / PAYMENT_PROVIDER.";
  if (!res || res.error) return fail(id, "supabase", title, "injoignable : " + ((res && res.error) || "pas de reponse"), fix);
  const j = res.json || {};
  if (res.status >= 500) return fail(id, "supabase", title, "HTTP " + res.status + " " + (j.error || ""), fix);
  if (res.status === 400 && j.code === "consent_required") return ok(id, "supabase", title, "400 consent_required (attendu)");
  if (res.status === 200 && j.processed === false) {
    return ok(id, "supabase", title, "200 processed:false (" + (j.reason || "paiement desactive, PAYMENT_PROVIDER=" + (j.payment_provider || "?")) + ")");
  }
  if (res.status === 200 && j.processed === true) {
    return fail(id, "supabase", title, "une session de paiement a ete creee SANS consentement",
      "Faille de conformite : verifier validateConsent() dans supabase/functions/create-checkout-session/ et redeployer.");
  }
  return warn(id, "supabase", title, "reponse non documentee : HTTP " + res.status + " " + JSON.stringify(j).slice(0, 120), fix);
}

function checkLoginGuardFunction(res) {
  const id = "edge:login-guard";
  const title = "Fonction login-guard (JSON invalide -> 400)";
  const fix = "Ouvrir Supabase -> Edge Functions -> login-guard -> Logs. Si la fonction est en erreur, plus personne ne peut se connecter.";
  if (!res || res.error) return fail(id, "supabase", title, "injoignable : " + ((res && res.error) || "pas de reponse"), fix);
  if (res.status === 400) return ok(id, "supabase", title, "400 " + ((res.json && res.json.error) || ""));
  return fail(id, "supabase", title, "HTTP " + res.status + " (attendu 400)", fix);
}

// --- api-football --------------------------------------------------------------
function checkApiFootballStatus(res) {
  const id = "api-football-quota";
  const title = "Quota api-football";
  const fix = "Ouvrir dashboard.api-football.com : quota du jour, abonnement actif, cle APISPORTS_KEY valide. Le quota se reinitialise a minuit UTC.";
  if (!res) return skip(id, "fournisseurs", title, "secret APISPORTS_KEY absent : controle non execute");
  if (res.error) return warn(id, "fournisseurs", title, "injoignable : " + res.error, fix);
  const j = res.json || {};
  const errors = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
  if (errors && errors.length) return fail(id, "fournisseurs", title, "erreur api-football : " + errors.join(" ; "), fix);
  const r = j.response || {};
  if (r.subscription && r.subscription.active === false) return fail(id, "fournisseurs", title, "abonnement api-football inactif", fix);
  const cur = r.requests && Number(r.requests.current);
  const lim = r.requests && Number(r.requests.limit_day);
  if (!lim || isNaN(cur)) return skip(id, "fournisseurs", title, "reponse sans compteur de quota");
  const pct = Math.round((cur / lim) * 100);
  const detail = cur + "/" + lim + " requetes aujourd'hui (" + pct + " %)";
  if (cur >= lim) return fail(id, "fournisseurs", title, detail + " - quota epuise", fix);
  if (pct >= 85) return warn(id, "fournisseurs", title, detail, fix);
  return ok(id, "fournisseurs", title, detail);
}

// --- pg_cron ---------------------------------------------------------------------
const CRON_EXPECTED = { "expire-past-due-access": 30, "purge-old-funnel-events": 24 * 8 };

// rows : [{ jobname, active, status, start_time, return_message }] (derniere
// execution par job, ou job sans execution : status null).
function checkCronJobs(rows, now, expected) {
  const exp = expected || CRON_EXPECTED;
  const group = "supabase";
  if (!rows) return [skip("pg-cron", group, "Taches pg_cron Supabase", "secret SUPABASE_ACCESS_TOKEN absent : controle non execute")];
  const out = [];
  Object.keys(exp).forEach((name) => {
    const id = "pg-cron:" + name;
    const title = "Tache pg_cron " + name;
    const fix = "Supabase -> SQL Editor : select * from cron.job_run_details order by start_time desc limit 20; lire return_message puis corriger la fonction appelee.";
    const r = rows.find((x) => x && x.jobname === name);
    if (!r) return out.push(fail(id, group, title, "tache absente de cron.job", "La tache planifiee a disparu : la recreer depuis la migration Supabase correspondante."));
    if (r.active === false) return out.push(fail(id, group, title, "tache desactivee", fix));
    if (!r.start_time) return out.push(warn(id, group, title, "aucune execution enregistree", fix));
    const age = hoursBetween(new Date(r.start_time), now);
    if (r.status === "failed") return out.push(fail(id, group, title, "derniere execution en echec (" + r.start_time + ") : " + String(r.return_message || "").slice(0, 160), fix));
    if (age > exp[name]) return out.push(warn(id, group, title, "derniere execution il y a " + age.toFixed(0) + " h (attendu moins de " + exp[name] + " h)", fix));
    out.push(ok(id, group, title, r.status + " le " + r.start_time));
  });
  return out;
}

// --- Synthese ------------------------------------------------------------------
function summarize(results) {
  const counts = { ok: 0, warn: 0, fail: 0, skip: 0 };
  (results || []).forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const status = counts.fail ? "fail" : counts.warn ? "warn" : "ok";
  return { status: status, counts: counts };
}

// ============================================================================
// DONNEES PUBLIQUES (scripts/health-check.js, .github/workflows/health-monitor.yml)
// ============================================================================

const RELANCER = "Ouvrir Actions -> \"Update IASHARK Daily\" : lire le dernier run (échec, délai dépassé, workflow désactivé), le relancer (Run workflow), puis vérifier le déploiement Netlify.";

// generated_at du fichier public : date de fin de calcul du pipeline.
function checkGeneratedAt(generatedAtIso, now, maxHours, sourceLabel) {
  const id = "fraicheur-generation";
  const limit = maxHours || 30;
  const title = "Données publiques générées il y a moins de " + limit + " h";
  const src = sourceLabel ? " (" + sourceLabel + ")" : "";
  const fix = "Le pipeline quotidien ne publie plus de données fraîches. " + RELANCER;
  if (!generatedAtIso) return fail(id, "fraicheur", title, "generated_at absent" + src, fix);
  const d = new Date(generatedAtIso);
  if (isNaN(d.getTime())) return fail(id, "fraicheur", title, "generated_at illisible : " + String(generatedAtIso).slice(0, 40) + src, fix);
  const age = hoursBetween(d, now);
  if (age < -2) {
    return warn(id, "fraicheur", title, "generated_at dans le futur (" + generatedAtIso + ")" + src,
      "Vérifier l'horloge utilisée par le pipeline (runOutput.snapshot_time).");
  }
  const detail = "généré le " + generatedAtIso + ", il y a " + Math.max(0, age).toFixed(1) + " h" + src;
  if (age <= limit) return ok(id, "fraicheur", title, detail);
  return fail(id, "fraicheur", title, detail + " : données périmées", fix);
}

// Cles des ligues en saison le jour `day` (AAAA-MM-JJ) d'apres
// league-coverage-report.json (scripts/verify-league-coverage.js, dates
// reelles de l'API). null si le rapport est inutilisable.
function leaguesInSeason(coverage, day) {
  const list = coverage && Array.isArray(coverage.leagues) ? coverage.leagues : null;
  if (!list) return null;
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || ""));
  const keys = [];
  let dated = 0;
  list.forEach((l) => {
    if (!l || !l.key || !isDay(l.seasonStart) || !isDay(l.seasonEnd)) return;
    dated++;
    if (String(l.seasonStart).slice(0, 10) <= day && day <= String(l.seasonEnd).slice(0, 10)) keys.push(l.key);
  });
  return dated ? keys : null;
}

// Jour de match = au moins une ligue en saison. Rapport de couverture
// illisible : un fichier vide est traite comme une panne (prudence).
function checkMatchCount(matches, inSeasonKeys, sourceLabel) {
  const id = "contenu-nombre-matchs";
  const title = "Matchs publiés (plus de 0)";
  const src = sourceLabel ? " dans " + sourceLabel : "";
  const fix = "Le pipeline a publié une liste vide : collecte des fixtures en échec (quota ou clé APISPORTS_KEY, api-football en panne). " + RELANCER;
  if (!Array.isArray(matches)) return fail(id, "contenu", title, "liste des matchs illisible" + src, fix);
  if (matches.length) return ok(id, "contenu", title, matches.length + " match(s)" + src);
  if (Array.isArray(inSeasonKeys) && !inSeasonKeys.length) {
    return warn(id, "contenu", title, "0 match" + src + ", mais aucune ligue suivie n'est en saison (league-coverage-report.json)",
      "Normal hors saison. Sinon, relancer scripts/verify-league-coverage.js puis le pipeline.");
  }
  const why = Array.isArray(inSeasonKeys) ? inSeasonKeys.length + " ligue(s) en saison" : "saison des ligues inconnue (league-coverage-report.json illisible)";
  return fail(id, "contenu", title, "0 match" + src + " alors que " + why, fix);
}

function hasAnalysis(m) {
  return !!m && (m.model_output_available === true || m.has_signal === true);
}

function checkFreeMatchOfDay(matches, now) {
  const id = "contenu-match-offert-du-jour";
  const title = "Match offert du jour présent (is_free === true)";
  if (!Array.isArray(matches) || !matches.length) return skip(id, "contenu", title, "aucun match publié");
  const analysed = matches.filter(hasAnalysis);
  if (!analysed.length) return skip(id, "contenu", title, "aucune analyse publiée (model_output_available / has_signal) : match offert non exigé");
  const free = matches.filter((m) => m && m.is_free === true);
  if (!free.length) {
    return fail(id, "contenu", title, "aucun match is_free === true alors que " + analysed.length + " analyse(s) sont publiées",
      "Les visiteurs gratuits n'ont plus d'analyse offerte. Lire dans le log du pipeline l'étape de choix du match offert (lib/free-match.js), puis relancer \"Update IASHARK Daily\".");
  }
  const today = parisDay(now);
  const days = [today, addDays(today, 1)];
  const label = free.slice(0, 3).map((m) => m.id + " (" + (m.date || "date ?") + ")").join(", ");
  if (!free.some((m) => days.indexOf(matchDay(m)) !== -1)) {
    return warn(id, "contenu", title, "match offert hors d'aujourd'hui et de demain (heure de Paris) : " + label,
      "Le match offert n'est plus celui du jour : les données n'ont probablement pas été rafraîchies. " + RELANCER);
  }
  return ok(id, "contenu", title, free.length + " match(s) offert(s) : " + label);
}

function configLeagues(cfg) {
  if (Array.isArray(cfg)) return cfg.filter((l) => l && l.key);
  return cfg && Array.isArray(cfg.leagues) ? cfg.leagues.filter((l) => l && l.key) : [];
}

// Cle config/leagues.json d'un match : league_key, sinon league_id = apiFootballId.
function matchLeagueKey(m, leagues) {
  if (!m) return null;
  if (m.league_key && leagues.some((l) => l.key === m.league_key)) return m.league_key;
  const hit = m.league_id != null ? leagues.find((l) => Number(l.apiFootballId) === Number(m.league_id)) : null;
  return hit ? hit.key : null;
}

// Une ligue sans match sur 2-3 jours est normale (coupes europeennes,
// treves) : alerte seulement si moins de `minShare` des ligues en saison ont
// au moins un match (collecte partielle), echec si AUCUN match ne correspond
// a une ligue de la config.
function checkExpectedLeagues(matches, leaguesConfig, inSeasonKeys, opts) {
  const id = "contenu-ligues";
  const title = "Ligues attendues (config/leagues.json) présentes";
  const minShare = opts && opts.minShare != null ? opts.minShare : 0.5;
  const leagues = configLeagues(leaguesConfig);
  if (!leagues.length) return skip(id, "contenu", title, "config/leagues.json illisible");
  if (!Array.isArray(matches) || !matches.length) return skip(id, "contenu", title, "aucun match publié");
  const present = new Set();
  const unknown = new Set();
  matches.forEach((m) => {
    const k = matchLeagueKey(m, leagues);
    if (k) present.add(k);
    else unknown.add(String((m && (m.league || m.league_key || m.league_id)) || "?"));
  });
  const known = leagues.map((l) => l.key);
  const expected = Array.isArray(inSeasonKeys) ? inSeasonKeys.filter((k) => known.indexOf(k) !== -1) : known;
  const presentExpected = expected.filter((k) => present.has(k));
  const missing = expected.filter((k) => !present.has(k));
  const detail = presentExpected.length + "/" + expected.length + " ligue(s) " + (Array.isArray(inSeasonKeys) ? "en saison " : "") + "avec au moins un match" +
    (missing.length ? " ; sans match : " + fieldList(missing) : "") +
    (unknown.size ? " ; hors config : " + fieldList(Array.from(unknown)) : "");
  if (!present.size) {
    return fail(id, "contenu", title, detail,
      "Aucun match ne correspond à une ligue de config/leagues.json : collecte des fixtures cassée ou configuration désalignée. " + RELANCER);
  }
  if (expected.length && presentExpected.length / expected.length < minShare) {
    return warn(id, "contenu", title, detail,
      "Moins de " + Math.round(minShare * 100) + " % des ligues en saison ont un match publié : collecte partielle probable (quota api-football, erreurs par ligue). Lire le log du pipeline.");
  }
  if (unknown.size) {
    return warn(id, "contenu", title, detail, "Des matchs viennent de ligues absentes de config/leagues.json : vérifier la liste de lancement.");
  }
  return ok(id, "contenu", title, detail);
}

// Chemins renvoyes par deepPremiumLeaks : "matchs[3]#123.pari_rec",
// "match/123.json#123.top_scorers_home[0].goal_threat_score".
function summarizeDeepLeaks(paths) {
  const ids = new Set();
  const fields = new Set();
  (paths || []).forEach((p) => {
    const s = String(p);
    const m = s.match(/#([^.[\]]+)/);
    if (m) ids.add(m[1]);
    const hash = s.indexOf("#");
    const dot = hash === -1 ? -1 : s.indexOf(".", hash);
    const tail = hash === -1 ? s : dot === -1 ? s : s.slice(dot + 1);
    fields.add(tail.replace(/\[\d+\]/g, "[]"));
  });
  return { matchIds: Array.from(ids), fields: Array.from(fields).sort() };
}

// Fuite = alerte CRITIQUE (critical: true). deepLeaksFn = deepPremiumLeaks
// de lib/premium-fields.js ; absent = impossible d'exclure une fuite = echec.
function checkDeepPremiumLeaks(id, sourceLabel, value, deepLeaksFn) {
  const title = "Aucun champ premium public : " + sourceLabel;
  const fix = "Des données payantes sont lisibles gratuitement. Vérifier que le nettoyage du pipeline (update-data.yml, CHAMPS_PREMIUM / lib/premium-fields.js) est bien sur main, relancer \"Update IASHARK Daily\" pour régénérer les fichiers publics, puis contrôler à nouveau.";
  if (value == null) return skip(id, "fuite", title, "fichier non lu");
  if (typeof deepLeaksFn !== "function") {
    const r = fail(id, "fuite", title, "lib/premium-fields.js (deepPremiumLeaks) introuvable : fuite impossible à exclure",
      "Vérifier que lib/premium-fields.js existe et exporte deepPremiumLeaks.");
    r.critical = true;
    return r;
  }
  let paths;
  try {
    paths = deepLeaksFn(value) || [];
  } catch (e) {
    const r = fail(id, "fuite", title, "contrôle des fuites en erreur : " + ((e && e.message) || e), "Lire l'erreur de scripts/health-check.js.");
    r.critical = true;
    return r;
  }
  if (!paths.length) return ok(id, "fuite", title, "aucun champ premium hors match offert");
  const s = summarizeDeepLeaks(paths);
  const r = fail(id, "fuite", title,
    "FUITE PREMIUM : " + (s.matchIds.length || "?") + " match(s) payant(s) exposent " + fieldList(s.fields) +
    (s.matchIds.length ? " (ex. match " + s.matchIds[0] + ")" : ""), fix);
  r.critical = true;
  r.leak_paths = paths.slice(0, 20);
  return r;
}

// Controles qui bloquent la publication dans le pipeline (--gate) : fichier
// illisible, liste vide un jour de match, fuite premium. Les autres (match
// offert, ligues, cotes) sont signales sans empecher de publier les donnees
// du jour (mieux que garder celles de la veille).
function isGateFailure(r) {
  return !!r && r.status === "fail" && (r.id === "source-publique" || r.id === "contenu-nombre-matchs" || r.group === "fuite");
}

// input : { now, maxAgeHours, home, homeLabel, homeError, data, dataLabel,
//   dataError, details: { "match/<id>.json": json }, detailsMissing: [ids],
//   leaguesConfig, coverage, deepLeaksFn }
function evaluatePublicData(input) {
  const o = input || {};
  const now = o.now || new Date();
  const maxAge = o.maxAgeHours || 30;
  const homeLabel = o.homeLabel || "data-home.json";
  const dataLabel = o.dataLabel || "data.json";
  const home = o.home && Array.isArray(o.home.matchs) ? o.home : null;
  const data = o.data && Array.isArray(o.data.matchs) ? o.data : null;
  const results = [];
  const title = "Fichier public des matchs lisible";
  const done = (extra) => Object.assign({ generated_at: now.toISOString(), summary: summarize(results), results: results }, extra || {});

  if (home) {
    results.push(ok("source-publique", "source", title, homeLabel + " : " + home.matchs.length + " match(s)"));
  } else if (data) {
    results.push(warn("source-publique", "source", title,
      homeLabel + " illisible (" + (o.homeError || "sans liste matchs") + ") : repli sur " + dataLabel,
      "Si cela persiste après un Daily update, vérifier que data-home.json est produit (lib/public-data-split.js) et copié dans dist/ par scripts/build-public.js."));
  } else {
    results.push(fail("source-publique", "source", title,
      homeLabel + " (" + (o.homeError || "sans liste matchs") + ") et " + dataLabel + " (" + (o.dataError || "sans liste matchs") + ") illisibles",
      "Le site ne publie plus de données lisibles. Vérifier le dernier déploiement Netlify et le dernier run \"Update IASHARK Daily\"."));
    return done({ source: null, data_generated_at: null });
  }

  const list = home ? home.matchs : data.matchs;
  const listLabel = home ? homeLabel : dataLabel;
  const ro = data && data.run_output;
  const generatedAt = (home && home.generated_at) || (data && data.generated_at) ||
    (ro && typeof ro.snapshot === "string" ? ro.snapshot : null);
  results.push(checkGeneratedAt(generatedAt, now, maxAge, home ? homeLabel : dataLabel));

  const inSeason = leaguesInSeason(o.coverage, parisDay(now));
  results.push(checkMatchCount(list, inSeason, listLabel));
  if (list.length) {
    const upcoming = checkUpcomingMatches(list, now);
    if (upcoming.status === "fail" && Array.isArray(inSeason) && !inSeason.length) upcoming.status = "warn";
    results.push(upcoming);
  }
  results.push(checkFreeMatchOfDay(list, now));
  results.push(checkExpectedLeagues(list, o.leaguesConfig, inSeason));
  results.push(checkOdds(list));

  if (home) results.push(checkDeepPremiumLeaks("fuite-data-home", homeLabel, home, o.deepLeaksFn));
  if (data) {
    results.push(checkDeepPremiumLeaks("fuite-data-json", dataLabel, data, o.deepLeaksFn));
    results.push(checkSafePick(data.run_output, data.matchs));
  }
  const details = o.details && typeof o.details === "object" ? o.details : {};
  const detailNames = Object.keys(details);
  if (detailNames.length) {
    results.push(checkDeepPremiumLeaks("fuite-match-detail", detailNames.length + " fichier(s) match/<id>.json", details, o.deepLeaksFn));
  }
  const missing = o.detailsMissing || [];
  if (missing.length) {
    results.push(warn("source-match-detail", "source", "Fichiers match/<id>.json lisibles",
      missing.length + " fichier(s) détail illisible(s) : " + fieldList(missing.map(String), 6),
      "Un match listé n'a pas de fichier détail lisible : sa page sera vide. Vérifier le log du pipeline (écriture de match/<id>.json) et scripts/build-public.js."));
  }
  return done({ source: listLabel, data_generated_at: generatedAt || null });
}

module.exports = {
  BASE_PREMIUM_FIELDS,
  GENERIC_TOP_LEVEL_ONLY,
  CRON_EXPECTED,
  fieldList,
  loadPremiumFields,
  premiumListsFromModule,
  scanPremium,
  findMatchLeaks,
  summarizeLeaks,
  checkPremiumLeaks,
  parisDay,
  addDays,
  matchDay,
  checkUpcomingMatches,
  checkDailyCommitAge,
  checkDeployLag,
  checkFreeMatch,
  checkSafePick,
  hasText,
  checkLlmTexts,
  hasData,
  PUBLIC_ODDS_FIELDS,
  hasOdds,
  checkOdds,
  checkPinnacle,
  htmlLang,
  checkPage,
  checkNotPublic,
  checkRedirect,
  checkMatchDataFunction,
  checkCheckoutFunction,
  checkLoginGuardFunction,
  checkApiFootballStatus,
  checkCronJobs,
  summarize,
  result,
  // Donnees publiques (health-monitor)
  checkGeneratedAt,
  leaguesInSeason,
  checkMatchCount,
  hasAnalysis,
  checkFreeMatchOfDay,
  configLeagues,
  matchLeagueKey,
  checkExpectedLeagues,
  summarizeDeepLeaks,
  checkDeepPremiumLeaks,
  isGateFailure,
  evaluatePublicData,
};
