#!/usr/bin/env node
"use strict";
// ESSAI A VIDE DU CHOIX DU PARI SUR TOUS LES MARCHES (06/10/2026) : rejoue, EN MEMOIRE, sur un fichier de matchs
// (data.json par defaut, ou un export complet avec les champs premium du moteur v3), la publication des paris
// (lib/pronostic.js#publierPronostics, comme si aucun pari n'etait encore fige), les candidats des combines
// (#marchesCandidats) et le calcul de la Selection en or et des combines (lib/tickets-du-jour.js#calculerDuJour).
// N'ECRIT RIEN : ni fichier, ni base, ni message. Aucun appel reseau.
//
// Usage : node scripts/essai-paris-tous-marches.js [fichier.json] [--flux flux.json] [--maintenant 2026-10-06T04:00:00Z] [--detail]
//   --flux : { "<fixture>": { raw: { bookmakers: [...] } } } (releve odds_snapshots : choix NEUTRE sur tous les marches,
//            lib/flux-paris.js) ; ou { selections, toutes } (supabase/functions/_shared/marches-flux.mjs
//            #selectionsDuMatch et #toutesLesCotes sur un releve odds_snapshots), facultatif.
//   --detail : liste chaque match (pari, cote, chance) ; sans lui, seulement des compteurs.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const P = require("../lib/pronostic.js");
const T = require("../lib/tickets-du-jour.js");
const LIGUES = require("../config/leagues.json");
const VERDICTS = require("../config/verdicts-maths.json");

function arg(nom) { const i = process.argv.indexOf(nom); return i !== -1 ? process.argv[i + 1] : null; }
const fichier = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : path.join(ROOT, "data.json");
const brut = JSON.parse(fs.readFileSync(fichier, "utf8"));
const matchs = JSON.parse(JSON.stringify(Array.isArray(brut) ? brut : (brut.matchs || brut.matches || [])));
const fluxPar = arg("--flux") ? JSON.parse(fs.readFileSync(arg("--flux"), "utf8")) : {};
const nowMs = arg("--maintenant") ? Date.parse(arg("--maintenant")) : Date.now();
const detail = process.argv.indexOf("--detail") !== -1;

function jourParis(ms) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  return p.year + "-" + p.month + "-" + p.day;
}
const avant = {};
matchs.forEach((m) => { if (m && m.id != null) avant[String(m.id)] = m.market_id || null; });
// Fixture minimale pour la garde coup d'envoi (date publique « AAAA-MM-JJ HH:MM », heure de Paris).
const fixtureById = {};
const MT = require("../lib/match-time.js");
matchs.forEach((m) => {
  const t = m && m.id != null ? MT.parseParis(m.date) : null;
  if (t) fixtureById[String(m.id)] = { fixture: { timestamp: Math.floor(t.getTime() / 1000), status: { short: m.status || "NS" } } };
});

P.poserPronostics(matchs, { configLigues: LIGUES, figes: {} });
const r = P.publierPronostics(matchs, [], { configLigues: LIGUES, figes: {}, fluxPar, nowIso: new Date(nowMs).toISOString() });
P.alignerChancesAffichees(matchs, [], { configLigues: LIGUES });
const familles = {}, change = { meme: 0, autre: 0 };
matchs.forEach((m) => {
  if (!m || m.id == null || !m.market_id || m.no_signal === true) return;
  const f = (P.MARCHE[m.market_id] || {}).famille || ((require("../lib/flux-paris.js").definitionCode(m.market_id) || {}).famille) || "?";
  familles[f] = (familles[f] || 0) + 1;
  if (avant[String(m.id)] === m.market_id) change.meme++; else change.autre++;
});
console.log("Fichier : " + path.relative(ROOT, fichier) + " ; " + matchs.length + " match(s) ; maintenant " + new Date(nowMs).toISOString());
console.log("Paris publies : " + r.publies + " (" + r.dans_fourchette + " dans la fourchette, " + r.hors_fourchette + " au plus proche) ; sans pari : " + r.sans_pari + " (dont " + r.sans_cote + " sans cote reelle).");
console.log("Familles choisies : " + JSON.stringify(familles));
if (Object.keys(avant).some((k) => avant[k])) console.log("Par rapport au fichier : " + change.meme + " meme marche, " + change.autre + " autre marche.");
else console.log("Fichier public : le pari d'origine n'y figure pas (champ Pro), aucune comparaison.");
if (detail) matchs.forEach((m) => { if (m && m.market_id && m.no_signal !== true) console.log("  " + m.id + " " + (m.league_key || "") + " : " + (m.pronostic && m.pronostic.libelle_fr) + " @ " + m.cote_rec + " (" + m.chance_iashark + " %)"); });

const candidatsPar = P.marchesCandidats(matchs, { configLigues: LIGUES, fluxPar });
const jour = jourParis(nowMs);
const c = T.calculerDuJour(matchs, { jour, nowMs, fixtureById, configLigues: LIGUES, categoriesNoGo: VERDICTS.categories_no_go, competitions: VERDICTS.competitions_jambes, candidatsPar });
console.log("Jour " + jour + " : " + Object.values(candidatsPar).reduce((s, l) => s + l.length, 0) + " marche(s) candidat(s) ; " + c.nb_jambes + " jambe(s) sure(s) ; " + c.nb_candidats_or + " candidat(s) a la Selection en or.");
console.log("  exclus (jambes) : " + JSON.stringify(c.exclus));
console.log("  exclus (or) : " + JSON.stringify(c.exclus_or));
["or", "x5", "x10"].forEach((t) => {
  const x = c[t];
  const nom = { or: "Selection en or", x5: "Petit combine", x10: "Grand combine" }[t];
  if (!x) { console.log(nom + " : aucun."); return; }
  const l = t === "or" ? x.contenu.paris : x.contenu.jambes;
  console.log(nom + " : " + l.length + " pari(s)" + (x.meta.cote_totale ? ", cote totale " + x.meta.cote_totale : "") + " ; familles " + JSON.stringify(l.reduce((o, j) => { o[j.famille] = (o[j.famille] || 0) + 1; return o; }, {})));
  if (detail) l.forEach((j) => console.log("    " + j.domicile + " - " + j.exterieur + " : " + j.pari + " @ " + j.cote + (t === "or" ? " (" + j.chance + " %)" : "")));
});
