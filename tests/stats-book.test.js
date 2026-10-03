"use strict";
// STATS IASHARK (profils du Book sur la page match, 30/09/2026).
// Controle : seuils, anti-fuite de date, un seul championnat par profil d'equipe,
// partage gratuit / Pro (fichiers publics, fonction match-data, page), fichiers
// chiffres et dates du depot public (preuve en clair), i18n complet.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const S = require("../lib/stats-book.js");
const SCELLER = require("../scripts/stats-book/sceller.js");
const PREMIUM = require("../lib/premium-fields.js");
const SPLIT = require("../lib/public-data-split.js");
const VM = require("../lib/match-view-model.js");
// Jour de reference fixe (regle de fraicheur : lib/match-view-model.js#bookAssezFrais).
const MAINTENANT = "2026-09-30T08:00:00Z";
const bookStatsAu = (raw, quand) => VM.bookStats(raw, quand || MAINTENANT);

const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
// La regle des espaces insecables de match-page.js (insecableNom, insecableTexte, insecable), telle quelle.
function insecableDe(src) {
  const ligne = nom => src.match(new RegExp("const " + nom + "=(s=>[^\\n]*);"))[1];
  return new Function("esc", "const insecableNom=" + ligne("insecableNom") + ";const insecableTexte=" + ligne("insecableTexte") + ";return " + ligne("insecable") + ";")(v => String(v));
}

const manifeste = {
  version: "2.0.0", calcule_le: "2026-09-30T02:00:00Z", periode: { fin: "2026-09-28", fin_book: "2026-09-28", recent_inclus: false },
  empreinte_sources: "a".repeat(64),
  seuils: { equipe: 15, sous_groupe: 30, arbitre: 30, ligue: 30 },
  tranches: ["1-15", "16-30", "31-45+", "46-60", "61-75", "76-90+"],
  championnats: [39, 40], selections: [1, 4, 5, 32],
  index_equipes: { "1": 39, "2": 39, "3": 40 }, index_arbitres: { "m oliver": 39 },
};
const tr = (m, e) => [m, Math.max(0, +(m - e).toFixed(2)), +(m + e).toFixed(2)];
const pb = { n: 60, marque: [0.55, 0.42, 0.67], encaisse: [0.35, 0.24, 0.48], zero_zero: [0.1, 0.05, 0.2] };
const profilA = {
  n: 60, debut: "2024-09-29", fin: "2026-09-27", bp: [1.8, 1.5, 2.1], bc: [0.9, 0.7, 1.1],
  tranches: { n: 60, pour: [0.2, 0.3, 0.35, 0.3, 0.3, 0.35].map(v => tr(v, 0.12)), contre: [0.1, 0.15, 0.2, 0.15, 0.1, 0.2].map(v => tr(v, 0.1)) },
  premier_but: pb, apres_75: { n: 60, match_avec_but: [0.5, 0.38, 0.62], pour: [0.35, 0.2, 0.5], contre: [0.2, 0.09, 0.31] },
  cartons: { n: 60, pour: [1.8, 1.5, 2.1], adverse: [2.1, 1.8, 2.4] },
  corners: { n: 58, pour: [6.1, 5.6, 6.6], contre: [3.9, 3.4, 4.4] },
  pause: { mene: { n: 35, v: [0.84, 0.65, 0.94], nul: [0.12, 0.04, 0.3], d: [0.04, 0.01, 0.2] },
    egalite: { n: 34, v: [0.5, 0.31, 0.69], nul: [0.33, 0.18, 0.53], d: [0.17, 0.07, 0.36] } },
};
const ligue39 = {
  league_id: 39,
  ligue: { n: 700, debut: "2024-09-29", fin: "2026-09-28", buts: [2.8, 2.7, 2.9], plus_2_5: [0.55, 0.51, 0.59], btts: [0.52, 0.48, 0.56],
    dom: [0.44, 0.4, 0.48], nul: [0.25, 0.22, 0.28], ext: [0.31, 0.28, 0.35],
    tranches: { n: 690, buts: [0.3, 0.4, 0.5, 0.45, 0.5, 0.6].map(v => tr(v, 0.05)) }, apres_75: [0.52, 0.48, 0.56],
    cartons: { n: 690, m: [4.1, 4.0, 4.2] }, penaltys: { n: 690, m: [0.28, 0.25, 0.31] }, corners: { n: 680, m: [9.8, 9.6, 10.0] } },
  equipes: {
    "1": { nom: "A", championnat: 39, championnat_nom: "Premier League", tout: profilA, dom: Object.assign({}, profilA, { n: 30 }), ext: Object.assign({}, profilA, { n: 30 }) },
    "2": { nom: "B", championnat: 39, championnat_nom: "Premier League", tout: { n: 60, debut: "2024-09-29", fin: "2026-09-28", premier_but: pb } },
  },
  arbitres: { "m oliver": { nom: "Michael Oliver", n: 40, debut: "2023-09-29", fin: "2026-09-28",
    cartons: { m: [4.6, 4.2, 5.0], attendu: 4.1, ecart: [0.5, 0.1, 0.9], net: true } } },
};
// Deuxieme division : l'equipe 3 (promue) n'a ses matchs que la ; l'equipe 1 y a aussi un vieux profil.
const ligue40 = { league_id: 40, ligue: null, arbitres: {}, equipes: {
  "3": { nom: "C", championnat: 40, championnat_nom: "Championship", tout: { n: 70, debut: "2024-09-29", fin: "2026-05-01", premier_but: pb } },
} };
const lire = id => (Number(id) === 39 ? ligue39 : Number(id) === 40 ? ligue40 : null);
const matchAVenir = { date: "2026-10-01T19:00:00+02:00", league_id: 39, home: { id: 1 }, away: { id: 2 }, arbitre: "Michael Oliver, England" };

// ------------------------------------------------------------------ anti-fuite de date
test("anti-fuite : aucun profil pour un match joue le jour du dernier match du profil ou avant", () => {
  assert.strictEqual(S.profilUtilisable({ fin: "2026-09-28" }, "2026-09-28 20:00"), false);
  assert.strictEqual(S.profilUtilisable({ fin: "2026-09-28" }, "2026-09-10T18:00:00Z"), false);
  assert.strictEqual(S.profilUtilisable({ fin: "2026-09-28" }, "2026-09-29 13:30"), true);
  assert.strictEqual(S.profilUtilisable(null, "2026-09-29"), false);
  assert.strictEqual(S.profilUtilisable({ fin: "2026-09-28" }, "date inconnue"), false);
});

test("anti-fuite : heure de Paris apres minuit = veille en UTC (jamais un jour trop tard)", () => {
  // 29/09 01:30 a Paris = 28/09 23:30 UTC : le match du 28 (UTC) est peut-etre dans le profil.
  assert.strictEqual(S.jourUtc("2026-09-29 01:30"), "2026-09-28");
  assert.strictEqual(S.profilUtilisable({ fin: "2026-09-28" }, "2026-09-29 01:30"), false);
  assert.strictEqual(S.jourUtc("2026-09-29T00:30:00+02:00"), "2026-09-28");
  assert.strictEqual(S.jourUtc("2026-09-29T00:30:00Z"), "2026-09-29");
  assert.strictEqual(S.jourUtc(new Date("2026-09-29T23:59:00Z")), "2026-09-29");
  assert.strictEqual(S.jourUtc("2026-09-29"), "2026-09-28", "jour seul : la veille, par prudence");
  // La page applique exactement la meme regle (lib/match-view-model.js).
  for (const d of ["2026-09-29 01:30", "2026-09-29 21:00", "2026-09-29T00:30:00+02:00", "2026-09-29T00:30:00Z", "2026-09-29"]) {
    assert.strictEqual(VM.jourUtcBook(d), S.jourUtc(d), d);
  }
});

test("match a venir : gratuit = 2 chiffres avec periode, Pro = profils utiles au match", () => {
  const r = S.statsPourMatch(matchAVenir, manifeste, lire);
  assert.deepStrictEqual(Object.keys(r).sort(), ["gratuit", "pro"]);
  assert.deepStrictEqual(r.gratuit.premier_but_dom, { n: 60, marque: pb.marque, debut: "2024-09-29", fin: "2026-09-27", championnat: 39, championnat_nom: "Premier League" });
  assert.deepStrictEqual(r.gratuit.ligue_apres_75, { n: 690, taux: [0.52, 0.48, 0.56], debut: "2024-09-29", fin: "2026-09-28" });
  assert.strictEqual(r.pro.arbitre.nom, "Michael Oliver");
  assert.ok(r.pro.dom.tout.tranches && r.pro.dom.dom, "equipe qui recoit : tout + domicile");
  assert.ok(!("ext" in r.pro.dom), "le profil exterieur de l'equipe qui recoit ne sert pas ce match");
});

test("match deja joue avant le calcul : rien, jamais son propre resultat", () => {
  const r = S.statsPourMatch(Object.assign({}, matchAVenir, { date: "2026-09-27 15:00" }), manifeste, lire);
  assert.strictEqual(r, null);
  // Joue le 28 : l'equipe 1 (fin 27) serait utilisable seule, mais la ligue et l'arbitre (fin 28) non.
  const r28 = S.statsPourMatch(Object.assign({}, matchAVenir, { date: "2026-09-28T20:00:00Z" }), manifeste, lire);
  assert.ok(r28.pro.dom && !r28.pro.ext && !r28.pro.ligue && !r28.pro.arbitre);
  assert.strictEqual(r28.gratuit.ligue_apres_75, null);
});

test("un seul championnat par profil : jamais les matchs d'une autre division (cas Le Mans)", () => {
  // Match de Premier League (39) de l'equipe 3, promue : son profil est en Championship (40) -> rien.
  const promu = S.statsPourMatch({ date: "2026-10-01T18:00:00Z", league_id: 39, home: { id: 3 }, away: { id: 1 }, arbitre: null }, manifeste, lire);
  assert.strictEqual(promu.pro.dom, null, "profil de deuxieme division refuse en premiere division");
  assert.strictEqual(promu.gratuit.premier_but_dom, null);
  assert.strictEqual(promu.pro.ext.championnat, 39);
  // Coupe d'Europe (2) : dernier championnat de chaque equipe, ecrit a cote du chiffre.
  const coupe = S.statsPourMatch({ date: "2026-10-01T18:00:00Z", league_id: 2, home: { id: 1 }, away: { id: 3 }, arbitre: null }, manifeste, lire);
  assert.strictEqual(coupe.gratuit.premier_but_dom.championnat_nom, "Premier League");
  assert.strictEqual(coupe.gratuit.premier_but_ext.championnat_nom, "Championship");
  // Profil range dans le fichier d'un championnat mais etiquete d'un autre : refuse.
  const faux = JSON.parse(JSON.stringify(ligue39)); faux.equipes["1"].championnat = 40;
  const r = S.statsPourMatch(matchAVenir, manifeste, id => (Number(id) === 39 ? faux : null));
  assert.strictEqual(r.pro.dom, null);
  // Ancien format (sans championnat) : refuse.
  const ancien = JSON.parse(JSON.stringify(ligue39)); delete ancien.equipes["1"].championnat;
  assert.strictEqual(S.statsPourMatch(matchAVenir, manifeste, id => (Number(id) === 39 ? ancien : null)).pro.dom, null);
  // La page ecarte aussi un profil sans championnat, et ecrit le championnat du chiffre gratuit.
  const g = bookStatsAu({ date: "2026-10-01 19:00", stats_iashark_gratuit: coupe.gratuit });
  assert.deepStrictEqual(g.firstGoal.away.comp, { id: 40, name: "Championship" });
  const sans = JSON.parse(JSON.stringify(coupe.gratuit)); delete sans.premier_but_dom.championnat;
  assert.strictEqual(bookStatsAu({ date: "2026-10-01 19:00", stats_iashark_gratuit: sans }).firstGoal.home, null);
  // Selections : leurs matchs officiels, jamais un profil de club (et inversement).
  const man = Object.assign({}, manifeste, { index_equipes: Object.assign({}, manifeste.index_equipes, { "9": 32 }) });
  const f32 = { league_id: 32, equipes: { "9": { nom: "N", championnat: "selections", championnat_nom: null, tout: { n: 40, debut: "2023-09-01", fin: "2026-09-10", premier_but: pb } } } };
  const lireN = id => (Number(id) === 32 ? f32 : lire(id));
  const nat = S.statsPourMatch({ date: "2026-10-10T18:00:00Z", league_id: 32, home: { id: 9 }, away: { id: 1 }, arbitre: null }, man, lireN);
  assert.strictEqual(nat.pro.dom.championnat, "selections");
  assert.strictEqual(nat.pro.ext, null, "profil de club refuse sur un match de selections");
  assert.deepStrictEqual(bookStatsAu({ date: "2026-10-10 20:00", stats_iashark_gratuit: nat.gratuit }).firstGoal.home.comp, { nat: true });
  // Le script d'export ne compte que les matchs du championnat.
  const py = read("scripts/stats-book/export_stats_book.py");
  assert.match(py, /L = ME\[ME\.league_id == lg\]\n\s+for tid in sorted\(set\(L\.dom_id\) \| set\(L\.ext_id\)\):\n\s+p = complet\(vue_equipe\(L, tid\)/);
});

test("equipe ou arbitre inconnu : on n'invente rien", () => {
  const r = S.statsPourMatch({ date: "2026-10-01T18:00:00Z", league_id: 39, home: { id: 999 }, away: { id: 2 }, arbitre: null }, manifeste, lire);
  assert.strictEqual(r.pro.dom, null);
  assert.strictEqual(r.pro.arbitre, null);
  assert.strictEqual(r.gratuit.premier_but_dom, null);
  assert.strictEqual(S.statsPourMatch({ date: "2026-10-01T18:00:00Z", league_id: 1, home: { id: 998 }, away: { id: 999 } }, manifeste, lire), null);
});

test("cle d'arbitre : une seule cle pour toutes les ecritures de l'API (initiale + nom)", () => {
  for (const n of ["François Letexier, France", "Francois Letexier", "F. Letexier", "f letexier"]) assert.strictEqual(S.cleArbitre(n), "f letexier", n);
  assert.strictEqual(S.cleArbitre("Hakim Ben el Salem Hadj, France"), "h ben el salem hadj");
  assert.strictEqual(S.cleArbitre("Jorge Figueroa Vázquez, Spain"), S.cleArbitre("J. Figueroa Vazquez"));
  assert.strictEqual(S.cleArbitre(""), null);
  assert.strictEqual(S.cleArbitre(" , "), null);
  // Lettres sans accent decomposable : supprimees AVANT le decoupage, comme Python
  // (encode("ascii", "ignore")). Verifie le 30/09/2026 sur les 17 311 noms d'arbitre du Book : 0 difference.
  assert.strictEqual(S.cleArbitre("Jørgen Daugbjerg Burchardt"), "j daugbjerg burchardt");
  assert.strictEqual(S.cleArbitre("Paweł Raczkowski, Poland"), "p raczkowski");
  assert.strictEqual(S.cleArbitre("Ömer Faruk Tanrıkulu"), "o faruk tanrkulu");
  assert.strictEqual(S.cleArbitre("İbrahim Ethem"), "i ethem");
  // Meme regle dans le script Python (export_stats_book.py).
  const py = read("scripts/stats-book/export_stats_book.py");
  assert.match(py, /unicodedata\.normalize\("NFKD", s\)\.encode\("ascii", "ignore"\)\.decode\(\)\.lower\(\)/);
  assert.match(py, /return mots\[0\]\[0\] \+ " " \+ " "\.join\(mots\[1:\]\)/);
});

// ------------------------------------------------------------------ gratuit / Pro
// Cles autorisees dans le champ PUBLIC : liste fermee, rien d'autre ne sort.
// detail_pro : NOMS des rubriques du detail Pro de ce match (aucun chiffre), pour que la vue gratuite
// n'annonce que ce qui existe (relecture du 30/09).
const CLES_GRATUIT = ["version", "calcule_le", "periode_fin", "seuils", "premier_but_dom", "premier_but_ext", "ligue_apres_75", "detail_pro"];
const RUBRIQUES = ["premier", "quarts", "pause", "lieu", "arbitre", "ligue"];
const CLES_CHIFFRE = ["n", "marque", "taux", "debut", "fin", "championnat", "championnat_nom"];
function verifierGratuit(g, label) {
  for (const k of Object.keys(g)) assert.ok(CLES_GRATUIT.includes(k), label + " : cle publique inattendue " + k);
  if ("detail_pro" in g) assert.ok(Array.isArray(g.detail_pro) && g.detail_pro.every(x => RUBRIQUES.includes(x)), label + " : detail_pro = noms de rubriques seulement");
  for (const k of ["premier_but_dom", "premier_but_ext", "ligue_apres_75"]) {
    if (g[k] == null) continue;
    for (const c of Object.keys(g[k])) assert.ok(CLES_CHIFFRE.includes(c), label + " : " + k + "." + c + " n'est pas public");
  }
}

test("champ public : seulement les 2 chiffres gratuits (liste fermee)", () => {
  const r = S.statsPourMatch(matchAVenir, manifeste, lire);
  verifierGratuit(r.gratuit, "stats_iashark_gratuit");
  const sansSeuils = Object.assign({}, r.gratuit); delete sansSeuils.seuils; delete sansSeuils.detail_pro;
  const texte = JSON.stringify(sansSeuils);
  for (const interdit of ["tranches", "pause", "corners", "cartons", "arbitre", "Michael", "encaisse", "zero_zero", "bp", "btts"]) {
    assert.ok(!texte.includes('"' + interdit), interdit + " dans le champ public");
  }
});

test("detail Pro : champ premium « Pro seulement » partout (liste unique, match-data, page)", () => {
  assert.ok(PREMIUM.PREMIUM_PAYLOAD_FIELDS.includes("stats_iashark"), "persiste dans premium_fields pour les Pro");
  assert.ok(PREMIUM.PRO_ONLY_FIELDS.includes("stats_iashark"), "meme sur le match offert");
  assert.ok(!PREMIUM.PREMIUM_FIELDS.includes("stats_iashark_gratuit"), "les 2 chiffres gratuits restent publics");
  const edge = read("supabase/functions/match-data/index.ts");
  assert.match(edge, /const CHAMPS_PRO_SEULEMENT = \["sim_15min", "stats_iashark", "lecture_match"\];/);
  const page = read("match-page.js");
  assert.match(page, /const CHAMPS_PREMIUM=\[[^\]]*"stats_iashark"/);
  assert.match(page, /if\(!VUE_PRO\)\{delete raw\.sim_15min;delete raw\.stats_iashark;\}/);
  assert.ok(SPLIT.DETAIL_ONLY_FIELDS.includes("stats_iashark") && SPLIT.DETAIL_ONLY_FIELDS.includes("stats_iashark_gratuit"));
});

test("fichiers publics : le detail Pro n'y est jamais, match offert compris", () => {
  const r = S.statsPourMatch(matchAVenir, manifeste, lire);
  const m = { id: 7, league_id: 39, date: "2026-10-01 19:00", home: { n: "A", id: 1 }, away: { n: "B", id: 2 },
    stats_iashark: r.pro, stats_iashark_gratuit: r.gratuit };
  for (const cas of [m, Object.assign({}, m, { is_free: true })]) {
    const pub = PREMIUM.stripPremium(cas);
    assert.strictEqual(pub.stats_iashark, undefined, "stripPremium");
    assert.deepStrictEqual(pub.stats_iashark_gratuit, r.gratuit);
    assert.deepStrictEqual(PREMIUM.deepPremiumLeaks(pub), []);
    const split = SPLIT.buildPublicSplit([pub], {});
    split.list.matchs.forEach(x => { assert.strictEqual(x.stats_iashark, undefined); assert.strictEqual(x.stats_iashark_gratuit, undefined, "liste legere"); });
    split.details.forEach(x => { assert.strictEqual(x.match.stats_iashark, undefined); verifierGratuit(x.match.stats_iashark_gratuit, "detail"); });
    assert.ok(!JSON.stringify(SPLIT.preloadedMatch(cas)).includes("Michael"), "PRELOADED_MATCH");
  }
  assert.ok(PREMIUM.premiumLeaks(Object.assign({}, m, { is_free: true })).includes("stats_iashark"), "le controle de fuite la voit");
});

test("fichiers publics reels (match/<id>.json, data-home.json) : aucun detail Pro", () => {
  const fichiers = fs.readdirSync(path.join(ROOT, "match")).filter(f => /^\d+\.json$/.test(f)).map(f => "match/" + f).concat(["data-home.json"]);
  for (const f of fichiers) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    const texte = read(f);
    assert.ok(!/"stats_iashark"\s*:\s*\{/.test(texte), f + " porte le detail Pro");
    const j = JSON.parse(texte);
    for (const m of [].concat(j.matchs || [j])) if (m && m.stats_iashark_gratuit) verifierGratuit(m.stats_iashark_gratuit, f);
  }
});

// ------------------------------------------------------------------ seuils
test("seuils : le controle avant scellement refuse un profil sous le seuil ou trop recent", () => {
  assert.deepStrictEqual(SCELLER.controler(manifeste, { 39: ligue39, 40: ligue40 }), []);
  const petit = JSON.parse(JSON.stringify(ligue39));
  petit.equipes["1"].dom.n = 14;
  petit.equipes["1"].tout.pause.mene.n = 29;       // sous-groupe « a la pause » : 30 minimum
  petit.arbitres["m oliver"].n = 29;
  petit.ligue.n = 29;
  petit.equipes["2"].tout.fin = "2026-09-29";
  const pb2 = SCELLER.controler(manifeste, { 39: petit });
  assert.strictEqual(pb2.length, 5, pb2.join("\n"));
  assert.ok(SCELLER.controler(Object.assign({}, manifeste, { periode: { fin: "2026-09-30" } }), {}).length === 1, "periode posterieure au calcul");
});

test("scellement : archive seulement, un championnat par profil, marges presentes, empreinte presente", () => {
  const recent = Object.assign({}, manifeste, { periode: { fin: "2026-09-28", fin_book: "2025-06-30", recent_inclus: true } });
  assert.ok(SCELLER.controler(recent, { 39: ligue39 }).some(x => /hors de l'archive/.test(x)), "donnees apres le registre du Book refusees");
  const melange = JSON.parse(JSON.stringify(ligue39)); melange.equipes["1"].championnat = 40;
  assert.ok(SCELLER.controler(manifeste, { 39: melange }).some(x => /autre championnat/.test(x)));
  const sansMarge = JSON.parse(JSON.stringify(ligue39)); sansMarge.equipes["1"].tout.tranches.pour = [0.2, 0.3, 0.35, 0.3, 0.3, 0.35];
  sansMarge.ligue.tranches.buts = [0.3, 0.4, 0.5, 0.45, 0.5, 0.6];
  assert.strictEqual(SCELLER.controler(manifeste, { 39: sansMarge }).filter(x => /sans marge/.test(x)).length, 2);
  assert.ok(SCELLER.controler(Object.assign({}, manifeste, { empreinte_sources: "x" }), {}).some(x => /empreinte/.test(x)));
});

test("export : archive par defaut, controle de recouvrement bloquant, empreinte au debut et a la fin, n reels", () => {
  const py = read("scripts/stats-book/export_stats_book.py");
  // Par defaut, seulement l'archive du Book (jusqu'au 30/06/2025).
  assert.match(py, /if not a\.avec_recent:\n\s+fin = min\(fin, FIN_BOOK\)/);
  // Recodage API contre registre : seuil fixe a l'avance, arret sans rien ecrire.
  assert.match(py, /SEUIL_RECOUVREMENT = 0\.005/);
  assert.match(py, /ctl\["taux_differents"\] > SEUIL_RECOUVREMENT:\n\s+sys\.exit\(/);
  // Empreinte des sources avant le calcul, recalculee a la fin, arret si elle differe.
  const avant = py.indexOf("sources, empreinte = empreinte_sources(recent)"), calcul = py.indexOf("M = charger_matchs(fin, debut, qualite)");
  const apres = py.indexOf("sources_fin, empreinte_fin = empreinte_sources(recent)"), ecrit = py.indexOf("os.makedirs(a.sortie, exist_ok=True)");
  assert.ok(avant > 0 && avant < calcul && calcul < apres && apres < ecrit, "ordre : empreinte, calcul, empreinte, ecriture");
  assert.match(py, /if empreinte_fin != empreinte:\n[^\n]*\n\s+sys\.exit\(/);
  // Profil de la ligue : UNE base de matchs pour tout (relecture du 30/09 : plus de « 605 » puis « 606 »
  // dans la meme carte) ; cartons et penaltys comptes sur cette base, cartons aberrants exclus de la base.
  assert.match(py, /ok = L\.ev_ok & L\.cartons_d\.notna\(\) & L\.cartons_e\.notna\(\)/);
  assert.match(py, /r\["cartons"\] = \{"n": int\(n\), "m": moyenne\(base\.cartons_d \+ base\.cartons_e\)\[0\]\}/);
  assert.match(py, /r\["tranches"\] = \{"n": int\(n\), "buts": \[moyenne\(base\[f"b\{i\}_d"\] \+ base\[f"b\{i\}_e"\]\)\[0\] for i in range\(6\)\]\}/);
  // Marges sur chaque tranche (equipe et ligue) et apres la 75e.
  assert.match(py, /"pour": \[moyenne\(ev\[f"p\{k\}"\]\)\[0\] for k in range\(6\)\]/);
  assert.match(py, /"pour": moyenne\(ev\.p5\)\[0\], "contre": moyenne\(ev\.c5\)\[0\]/);
  // Arbitre : marge exacte (Poisson) ou variance observee, la plus large, au niveau simultane.
  assert.match(py, /ALPHA_ARBITRE = 0\.05 \/ 3/);
  assert.match(py, /m, bas, haut = marge_comptage\(g\[s\], ALPHA_ARBITRE\)/);
});

test("seuils : la page ecarte aussi un chiffre sous le seuil, sans nombre de matchs ou incoherent", () => {
  const r = S.statsPourMatch(matchAVenir, manifeste, lire);
  const pro = JSON.parse(JSON.stringify(r.pro));
  pro.dom.tout.pause.mene.n = 29;             // sous 30 (sous-groupe)
  pro.dom.tout.corners.pour = [6.1, 6.5, 6.6]; // valeur hors de sa marge
  pro.arbitre.n = 29;                          // sous 30
  pro.ligue.btts = null;
  const b = bookStatsAu({ date: "2026-10-01 19:00", stats_iashark: pro });
  assert.ok(b.pro && b.teams.home.all);
  assert.ok(!b.teams.home.all.halfTime.leading && b.teams.home.all.halfTime.level);
  assert.strictEqual(b.teams.home.all.corners, undefined);
  assert.strictEqual(b.referee, null);
  assert.strictEqual(b.league.btts, null);
  assert.strictEqual(b.firstGoal.home.scores.p, 0.55);
  assert.strictEqual(b.firstGoal.home.n, 60);
});

test("page : vue gratuite sans detail, anti-fuite cote page, rien si rien", () => {
  const r = S.statsPourMatch(matchAVenir, manifeste, lire);
  const g = bookStatsAu({ date: "2026-10-01 19:00", stats_iashark_gratuit: r.gratuit });
  assert.strictEqual(g.pro, false);
  assert.strictEqual(g.teams, null); assert.strictEqual(g.league, null); assert.strictEqual(g.referee, null);
  assert.deepStrictEqual(g.firstGoal.home, { n: 60, debut: "2024-09-29", fin: "2026-09-27", comp: { id: 39, name: "Premier League" }, scores: { p: 0.55, lo: 0.42, hi: 0.67 } });
  assert.strictEqual(g.leagueLate.n, 690);
  // « Matchs joues jusqu'au » : fin des donnees, jamais la date du calcul.
  assert.strictEqual(g.periodEnd, "2026-09-28");
  // Match du 27/09 (profil termine le 27) : rien, meme si un fichier trainait.
  assert.strictEqual(bookStatsAu({ date: "2026-09-27 21:00", stats_iashark_gratuit: r.gratuit, stats_iashark: r.pro }), null);
  assert.strictEqual(bookStatsAu({ date: "2026-10-01 19:00" }), null);
  assert.strictEqual(bookStatsAu({ date: "2026-10-01 19:00", stats_iashark_gratuit: { premier_but_dom: { n: 10, marque: [0.5, 0.3, 0.7], debut: "2025-01-01", fin: "2026-09-01" } } }), null, "sous le seuil");
  assert.strictEqual(bookStatsAu({ date: "2026-10-01 19:00", stats_iashark_gratuit: { premier_but_dom: { n: 40, marque: [0.5, 0.3, 0.7] } } }), null, "sans periode");
  assert.strictEqual(VM.buildMatchViewModel({ id: 1, home: { n: "A" }, away: { n: "B" } }).bookStats, null);
});

// ------------------------------------------------------------------ deuxieme relecture visuelle (30/09)
test("fraicheur : jamais une date perimee (plus de 14 jours de retard = aucune carte)", () => {
  const r = S.statsPourMatch(matchAVenir, manifeste, lire);   // donnees jusqu'au 28/09
  const brut = { date: "2026-10-20 19:00", stats_iashark_gratuit: r.gratuit, stats_iashark: r.pro };
  assert.strictEqual(bookStatsAu(brut, "2026-10-19T08:00:00Z"), null, "21 jours de retard le jour de la page");
  assert.ok(bookStatsAu(brut, "2026-10-12T08:00:00Z"), "14 jours : encore affiche");
  assert.strictEqual(bookStatsAu(brut, "2026-10-13T08:00:00Z"), null, "15 jours : plus rien");
  // Match deja joue : le jour du match sert de reference (la periode etait juste ce jour-la).
  assert.ok(bookStatsAu({ date: "2026-10-01 19:00", stats_iashark_gratuit: r.gratuit }, "2026-12-01T08:00:00Z"));
  // Sans date de fin : on ne peut pas dire jusqu'a quand -> rien.
  const sansFin = Object.assign({}, r.gratuit); delete sansFin.periode_fin;
  assert.strictEqual(bookStatsAu({ date: "2026-10-01 19:00", stats_iashark_gratuit: sansFin }), null);
  assert.strictEqual(VM.FRAICHEUR_BOOK_J, 14);
});

test("vue gratuite : la ligne Pro ne cite que les rubriques de CE match (detail_pro)", () => {
  const r = S.statsPourMatch(matchAVenir, manifeste, lire);
  assert.deepStrictEqual(r.gratuit.detail_pro, ["premier", "quarts", "pause", "lieu", "arbitre", "ligue"]);
  // Sans arbitre designe : pas d'« arbitre » promis.
  const sansArb = S.statsPourMatch(Object.assign({}, matchAVenir, { arbitre: null }), manifeste, lire);
  assert.deepStrictEqual(sansArb.gratuit.detail_pro, ["premier", "quarts", "pause", "lieu", "ligue"]);
  // Equipes sans quarts d'heure ni pause (equipe 2 seule) : ni quarts, ni pause, ni domicile / exterieur.
  const maigre = S.statsPourMatch({ date: "2026-10-01T18:00:00Z", league_id: 39, home: { id: 2 }, away: { id: 999 }, arbitre: null }, manifeste, lire);
  // (le premier but encaisse et les 0-0 de l'equipe 2 restent du detail Pro : « premier »)
  assert.deepStrictEqual(maigre.gratuit.detail_pro, ["premier", "ligue"]);
  assert.deepStrictEqual(bookStatsAu({ date: "2026-10-01 19:00", stats_iashark_gratuit: sansArb.gratuit }).lockedParts, ["premier", "quarts", "pause", "lieu", "ligue"]);
  // Ancien fichier sans la liste : null (phrase generale, sans liste).
  const ancien = Object.assign({}, r.gratuit); delete ancien.detail_pro;
  assert.strictEqual(bookStatsAu({ date: "2026-10-01 19:00", stats_iashark_gratuit: ancien }).lockedParts, null);
});

test("noms d'equipe : un nom court, le meme dans tous les blocs de stats", () => {
  assert.strictEqual(VM.nomCourt("Paris Saint Germain"), "PSG");
  assert.strictEqual(VM.nomCourt("Paris Saint-Germain"), "PSG");
  assert.strictEqual(VM.nomCourt("New York Red Bulls"), "NYRB");
  assert.strictEqual(VM.nomCourt("Vancouver Whitecaps FC"), "Vancouver Whitecaps");
  assert.strictEqual(VM.nomCourt("Marseille"), "Marseille");
  assert.strictEqual(VM.nomCourt("Olympique de Marseille"), "Olympique de Marseille");
  assert.strictEqual(VM.nomCourt("Queens Park Rangers"), "QPR");
  // Suffixe de club retire en fin de nom seulement : « 1. FC Heidenheim » reste entier.
  assert.strictEqual(VM.nomCourt("1. FC Heidenheim"), "1. FC Heidenheim");
  assert.strictEqual(VM.nomCourt("Inter Miami CF"), "Inter Miami CF");
});

test("noms d'equipe : jamais de sigle invente (liste de noms courts connus, pas d'initiales)", () => {
  // 4e relecture du 30/09 : la regle des initiales ecrivait « Victoire GAE » ou « WHU ».
  const entiers = ["West Ham United", "Yokohama F. Marinos", "Defensa Y Justicia", "Go Ahead Eagles", "Newells Old Boys",
    "San Jose Earthquakes", "New England Revolution", "Atletico San Luis", "Red Bull Salzburg", "Urawa Red Diamonds"];
  for (const nom of entiers) {
    assert.strictEqual(VM.nomCourt(nom), nom, nom + " garde son nom");
    const vm = VM.buildMatchViewModel({ id: 1, home: { n: nom, id: 1 }, away: { n: "Monaco", id: 91 } });
    assert.strictEqual(vm.identity.home.short, nom, nom + " : meme nom dans le corps de la page");
  }
});

test("noms d'equipe : en-tete officiel, corps de page au nom court", () => {
  const vm = VM.buildMatchViewModel({ id: 1, home: { n: "Paris Saint Germain", id: 85 }, away: { n: "Monaco", id: 91 } });
  assert.strictEqual(vm.identity.home.short, "PSG");
  // En-tete : le nom officiel complet (« Paris Saint-Germain », avec son trait d'union) ; api : le nom de la source.
  assert.strictEqual(vm.identity.home.name, "Paris Saint-Germain", "l'en-tete du match garde le nom officiel complet");
  assert.strictEqual(vm.identity.home.api, "Paris Saint Germain");
  assert.strictEqual(VM.nomOfficiel("Monaco"), "Monaco");
  // Page : Comparatif, forme, classement, compositions et carte IASHARK passent tous par nomEq.
  const stats = js.slice(js.indexOf("function formeFold(vm)"), js.indexOf("// Simulation par tranches de 15 minutes (vm.model.goalSimulation"));
  assert.match(stats, /const dom=nomEq\(vm\.identity\.home\),ext=nomEq\(vm\.identity\.away\);/);
  assert.doesNotMatch(stats, /esc\(tm\.name\)|esc\(team\.name\)|esc\(e\.name\)|sbkCourt|\{team:e\.name\}/);
});

test("un seul chiffre par mesure : plus de tableau « Par match » a cote du Comparatif", () => {
  assert.doesNotMatch(section, /sbkParMatch|stats_iashark\.per_/);
  const fr = JSON.parse(read("i18n/parts/statsbook.fr.json")).stats_iashark;
  assert.ok(!Object.keys(fr).some(k => k.startsWith("per_")));
});

test("colonnes : meme grille pour le Comparatif et les tableaux a deux valeurs", () => {
  const css = read("assets/match-page.css");
  assert.match(css, /\.cmp-table\{--cmp-c:150px;--cmp-e:140px;table-layout:fixed\}/);
  assert.match(css, /\.cmp-table thead th\+th\{width:var\(--cmp-c\)\}/);
  assert.match(css, /\.cmp-table \.sbk-x\{width:var\(--cmp-e\);padding:0\}/);
  assert.match(section, /const SBK_VIDE='<td class="sbk-x" aria-hidden="true"><\/td>';/);
  // Marge jamais coupee en fin de ligne, periode jamais coupee apres le tiret.
  assert.match(section, /\.replace\(\/ \/g,'\\u00a0'\)/);
  assert.match(section, /`\$\{a\}-\\u2060\$\{b\}`/);
});

test("mur Pro et avis ferme : la ligne des stats ne cite que les blocs de ce match", () => {
  // Fusion V3 (30/09) : le mur Pro reprend UNE seule liste, celle de la grille de
  // prix (LISTE_PRO, textes pricing_grid.f_*) ; « buts par quart d'heure » n'y est
  // qu'une fois (f_stats_iashark). statsContenu ne sert plus qu'au match offert.
  const mur = js.slice(js.indexOf("function proGate(vm,o)"), js.indexOf("function proGate(vm,o)") + 4000);
  assert.doesNotMatch(mur, /statsContenu/);
  assert.match(mur, /t\('pricing_grid\.'\+k,fb\)/);
  const f = js.slice(js.indexOf("function statsContenu(vm,gratuit)"), js.indexOf("function logoEquipe"));
  assert.ok(f.length > 200, "statsContenu introuvable");
  // Le mot du mur = le titre du bloc (« Confrontations directes ») ; l'arbitre cite quand le detail Pro l'a.
  assert.match(f, /h2hFold\(vm\)\?t\('match_page\.stats_part_h2h','confrontations directes'\):''/);
  assert.match(f, /b\.lockedParts\.includes\('arbitre'\)\?t\('match_page\.stats_part_ref','arbitre'\)/);
  assert.match(f, /b\.lockedParts\.includes\('quarts'\)/);
  // 5e relecture du 30/09 : le panneau du match offert (compte gratuit) ne promet jamais le detail Pro.
  assert.match(f, /!gratuit&&Array\.isArray\(b\.lockedParts\)&&b\.lockedParts\.includes\('quarts'\)/);
  assert.match(f, /!gratuit&&b&&Array\.isArray\(b\.lockedParts\)&&b\.lockedParts\.includes\('arbitre'\)/);
  const offert = js.slice(js.indexOf("function gateCard(vm,opts)"), js.indexOf("// MUR PRO (visiteur"));
  assert.match(offert, /statsContenu\(vm,true\)/);
  assert.doesNotMatch(offert, /\['avis_item_scenario'/, "la simulation 15 minutes est reservee aux Pro (29/09)");
});

// ------------------------------------------------------------------ fichier chiffre (depot public)
test("fichier scelle : preuve en clair (empreintes), liee au contenu, jamais reecrit", () => {
  const cle = crypto.randomBytes(32).toString("base64");
  const contenu = { manifeste, ligues: { 39: ligue39, 40: ligue40 } };
  const scelle = S.sceller(contenu, cle);
  assert.strictEqual(scelle.empreinte_sources, manifeste.empreinte_sources);
  assert.strictEqual(scelle.sha256_clair, crypto.createHash("sha256").update(JSON.stringify(contenu)).digest("hex"));
  // Chiffres gratuits : forme canonique documentee, recalculable par quiconque les a.
  const gratuit = S.chiffresGratuits(contenu);
  assert.deepStrictEqual(Object.keys(gratuit.equipes), ["39:1", "39:2", "40:3"]);
  assert.deepStrictEqual(gratuit.ligues["39"], { n: 690, taux: [0.52, 0.48, 0.56], debut: "2024-09-29", fin: "2026-09-28" });
  assert.strictEqual(scelle.sha256_gratuit, crypto.createHash("sha256").update(S.jsonCanonique(gratuit)).digest("hex"));
  assert.deepStrictEqual(scelle.gratuit_compte, { equipes: 3, ligues: 1 });
  // Toucher a la partie en clair rend le fichier illisible (donnees authentifiees).
  for (const k of ["empreinte_sources", "sha256_clair", "sha256_gratuit", "periode_fin", "calcule_le"]) {
    const v = String(scelle[k]);
    assert.strictEqual(S.ouvrirScelle(Object.assign({}, scelle, { [k]: (v[0] === "0" ? "1" : "0") + v.slice(1) }), cle), null, k);
  }
  assert.ok(S.ouvrirScelle(scelle, cle));
  // Un fichier par calcul, nomme par sa date ; jamais d'ecrasement.
  assert.strictEqual(S.nomScelle("2026-09-30T02:00:00Z"), "2026-09-30T02-00-00Z.json");
  assert.strictEqual(S.nomScelle("30/09/2026"), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scelles-"));
  try {
    SCELLER.ecrireSansEcraser(path.join(dir, "2026-09-30T02-00-00Z.json"), "a");
    SCELLER.ecrireSansEcraser(path.join(dir, "2026-10-07T02-00-00Z.json"), "b");
    assert.throws(() => SCELLER.ecrireSansEcraser(path.join(dir, "2026-09-30T02-00-00Z.json"), "c"), "jamais reecrit");
    assert.strictEqual(fs.readFileSync(path.join(dir, "2026-09-30T02-00-00Z.json"), "utf8"), "a");
    assert.strictEqual(path.basename(S.dernierScelle(dir)), "2026-10-07T02-00-00Z.json");
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ["2026-09-30T02-00-00Z.json", "2026-10-07T02-00-00Z.json"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("fichier scelle : illisible sans la cle, relu a l'identique avec elle", () => {
  const cle = crypto.randomBytes(32).toString("base64");
  const contenu = { manifeste, ligues: { 39: ligue39 } };
  const scelle = S.sceller(contenu, cle);
  const texte = JSON.stringify(scelle);
  for (const clair of ["Michael", "premier_but", "tranches", "0.55", "index_equipes"]) assert.ok(!texte.includes(clair), clair + " en clair");
  assert.deepStrictEqual(S.ouvrirScelle(scelle, cle), JSON.parse(JSON.stringify(contenu)));
  assert.strictEqual(S.ouvrirScelle(scelle, crypto.randomBytes(32).toString("base64")), null, "mauvaise cle");
  assert.strictEqual(S.ouvrirScelle(scelle, ""), null, "sans cle");
  const abime = Object.assign({}, scelle, { donnees: scelle.donnees.slice(0, -8) + "AAAAAAA=" });
  assert.strictEqual(S.ouvrirScelle(abime, cle), null, "fichier modifie");
  assert.throws(() => S.sceller(contenu, "trop-courte"));
  // Pipeline : fichier + cle -> profils ; sinon null (aucun champ pose).
  const tmp = path.join(os.tmpdir(), "stats-book-scelle-" + process.pid + ".json");
  fs.writeFileSync(tmp, JSON.stringify(scelle));
  try {
    const p = S.chargerPourPipeline(cle, tmp);
    assert.ok(p && p.manifeste.version === "2.0.0" && p.lire(39).league_id === 39 && p.lire(61) === null);
    assert.strictEqual(S.chargerPourPipeline("", tmp), null);
    assert.strictEqual(S.chargerPourPipeline(cle, tmp + ".absent"), null);
  } finally { fs.unlinkSync(tmp); }
});

test("depot public : seuls les fichiers chiffres et dates de stats-book/ sont suivis, rien n'est publie sur le site", () => {
  const gi = read(".gitignore");
  assert.match(gi, /^\/stats-book\/\*$/m);
  assert.match(gi, /^!\/stats-book\/scelles\/$/m);
  assert.doesNotMatch(gi, /^!\/stats-book\/(?!scelles\/$)/m, "aucun autre fichier de stats-book/ suivi");
  const src = read("scripts/build-public.js");
  assert.ok(!/stats-book/.test(src));
  for (const f of ["match-page.js", "match.html"]) assert.ok(!/stats-book\//.test(read(f)), f);
  // Chaque scelle suivi : en clair SEULEMENT la date, les empreintes et les comptes ; archive seulement.
  const scelles = fs.existsSync(S.DOSSIER_SCELLES) ? fs.readdirSync(S.DOSSIER_SCELLES) : [];
  for (const f of scelles) {
    assert.match(f, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/, f);
    const sc = JSON.parse(fs.readFileSync(path.join(S.DOSSIER_SCELLES, f), "utf8"));
    assert.deepStrictEqual(Object.keys(sc).sort(), S.CHAMPS_CLAIRS.concat(["iv", "tag", "donnees"]).sort(), f);
    assert.strictEqual(sc.recent_inclus, false, f + " : hors archive");
    for (const k of ["empreinte_sources", "sha256_clair", "sha256_gratuit"]) assert.match(sc[k], /^[0-9a-f]{64}$/, f + " " + k);
    assert.strictEqual(S.nomScelle(sc.calcule_le), f, "nom = date du calcul");
  }
  // Pipeline : cle lue dans le secret, aucun chiffre de stats dans les journaux publics.
  const yml = read(".github/workflows/update-data.yml");
  assert.match(yml, /STATS_BOOK_CLE:\s+\$\{\{ secrets\.STATS_BOOK_CLE \}\}/);
  assert.match(yml, /matchObj\.stats_iashark_gratuit=sbMatch\?sbMatch\.gratuit:null;\s*matchObj\.stats_iashark=sbMatch\?sbMatch\.pro:null;/);
  const logs = [...yml.matchAll(/console\.log\(([^;]*STATS IASHARK[^;]*)\);/g)].map(m => m[1]);
  assert.ok(logs.length >= 1);
  for (const l of logs) assert.ok(!/sbMatch|gratuit|pro\b|manifeste\./.test(l), "journal : " + l);
});

test("fichiers exportes (s'ils sont la) : seuils respectes et periode anterieure au calcul", { skip: !fs.existsSync(path.join(S.DOSSIER, "manifeste.json")) }, () => {
  const c = SCELLER.lireDossier(S.DOSSIER);
  assert.deepStrictEqual(SCELLER.controler(c.manifeste, c.ligues).slice(0, 10), []);
});

// ------------------------------------------------------------------ page Methodologie
test("methodologie : une section « stats IASHARK » (ancre du lien de la page match), sans aucun reglage chiffre", () => {
  const pages = fs.readdirSync(path.join(ROOT, "legal")).filter(d => fs.existsSync(path.join(ROOT, "legal", d, "methodologie.html"))).map(d => "legal/" + d + "/methodologie.html")
    .concat(["fr", "en", "es", "gb", "mx", "za"].map(d => d + "/methodologie.html").filter(f => fs.existsSync(path.join(ROOT, f))));
  assert.ok(pages.length >= 15, pages.length + " pages");
  for (const f of pages) {
    const html = read(f);
    const m = /<section class="section" id="stats-iashark">([\s\S]*?)<\/section>/.exec(html);
    assert.ok(m, f + " : section absente");
    const txt = m[1].replace(/<[^>]+>/g, " ");
    // Page courte et vague (decision du 19/09/2026) : ni seuil, ni fenetre, ni methode nommee.
    assert.doesNotMatch(txt.replace(/^\s*\d\.\s/, ""), /\d/, f + " : chiffre dans la section");
    assert.doesNotMatch(txt, /Poisson|\bSHA-?\d|Bonferroni/i, f);
    assert.match(txt, /Book IASHARK|IASHARK[ -]Book/, f + " : source");
  }
});

// ------------------------------------------------------------------ page et i18n
// Reprise du 30/09/2026 (retour de Clement) : la page garde sa structure. Les
// stats du Book sont UNE carte repliable de plus dans « Les stats du match »,
// au format des autres (fold, tableaux du Comparatif) ; ni onglet, ni section,
// ni rien sous le mur du visiteur.
const js = read("match-page.js");
const section = js.slice(js.indexOf("const SBK_TRANCHES"), js.indexOf("// Simulation par tranches de 15 minutes (vm.model.goalSimulation"));

test("page : une carte dans « Les stats du match », rien d'autre ne bouge", () => {
  assert.ok(section.length > 5000, "bloc introuvable");
  const stats = js.slice(js.indexOf("function statsBlocs(vm)"), js.indexOf("}", js.indexOf("function statsBlocs(vm)")));
  assert.match(stats, /comparatifFold\(vm\),bookFold\(vm\),compoFold\(vm\)/);
  // Ni section « book », ni puce de sommaire en plus, ni vue visiteur changee.
  assert.doesNotMatch(js, /\['book',|statsIasharkSection|stats_iashark\.nav|bindBookStats/);
  // 30/09 (page match plus) : « Le match en 30 secondes » et « Le chiffre fou » rejoignent la puce « Avis IASHARK ».
  assert.match(js, /\{key:'avis',secs:\['resume','avis','chiffre'\][^\n]*\n\s*\{key:'stats',secs:\['stats','rappel'\],label:\['match_page\.nav_stats','Stats'\]\},\n\s*\{key:'analyse'/);
  const visiteur = js.slice(js.indexOf("function renderVisitor(raw,opts)"), js.indexOf("function renderAuthWall"));
  assert.match(visiteur, /paint\(vm,\[\['avis',o\.free\?gateCard\(vm,o\):proGate\(vm,o\),true\],estFr\(\)\?\['chiffre',chiffreFouCard\(vm\)\]:null\],'','',\{sansStats:true\}\);/);
  // Meme composant que les autres cartes, memes tableaux que le Comparatif.
  assert.match(section, /return fold\(\{key:'book',title:t\('stats_iashark\.title','Les stats IASHARK'\)/);
  assert.match(section, /<table class="cmp-table sbk-table/);
  assert.doesNotMatch(section, /role="img"|data-sbk-to|sbk-lock|SBK_FAUX/);
  // 30/09 (demande de Clement, composants 21st.dev) : chiffres-cles animes, mais seulement dans
  // sbkCompteurs, jamais sous « mouvement reduit », et le texte exact est toujours remis a la fin.
  const compteurs = section.slice(section.indexOf("// Chiffres-cles animes"), section.indexOf("// Bascule « tous leurs matchs"));
  assert.ok(compteurs.length > 300, "sbkCompteurs introuvable");
  assert.strictEqual((section.match(/IntersectionObserver/g) || []).length, (compteurs.match(/IntersectionObserver/g) || []).length);
  assert.match(compteurs, /prefers-reduced-motion: reduce/);
  assert.match(compteurs, /el\.textContent=k<1\?ecrire\(v\*\(1-Math\.pow\(1-k,3\)\)\):fin;/);
});

test("page : detail Pro seulement en vue Pro, sinon la ligne « Reserve aux abonnes Pro »", () => {
  // Le detail n'est construit que si la vue est Pro ET le serveur l'a envoye.
  // Sans Pro : un encadre lisible aligne a gauche (troisieme relecture du 30/09 : la ligne grise se ratait).
  assert.match(section, /const detail=VUE_PRO&&b\.pro\?sbkDetail\(vm,b\):VUE_PRO\?'':sbkVerrou\(b\);/);
  assert.match(section, /return `<div class="sbk-pro">\$\{cardIcon\('lock'\)\}<p>\$\{insecable\(texte\)\}<\/p><\/div>`;/);
  // La ligne ne cite QUE les rubriques de ce match (b.lockedParts) ; aucune liste en dur.
  assert.match(section, /const l=b\.lockedParts\.filter\(k=>R\[k\]\)\.map\(k=>R\[k\]\);/);
  assert.doesNotMatch(section, /l’arbitre et le profil de la ligue/);
  // L'arbitre une seule fois : dans le detail Pro, plus de ligne en avant qui le repete.
  assert.match(section, /const avant=sbkPremierBut\(vm,b\)\+sbkApres75\(vm,b\);/);
  assert.doesNotMatch(section, /sbkArbitreLigne/);
  // Aucun essai gratuit annonce (il n'en existe pas : CGV), aucun appel au serveur de paiement, aucun lien de paiement.
  assert.doesNotMatch(section, /trial_days|create-checkout-session|data-sbk-essai|lock_trial|abonnement\.html|offrePro|suivi\(/);
  assert.doesNotMatch(js, /verifierEssaiStats|SANS_COMPTE|iashark\.stats\.trial_days/);
  // Date : fin des donnees (periode_fin), jamais la date du calcul ; lien vers la section methode.
  assert.match(section, /summary:esc\(tf\('stats_iashark\.fold_sub_until','Calculées sur les matchs joués jusqu’au \{date\}',\{date:jour\}\)\)/);
  assert.doesNotMatch(section, /b\.computedAt/);
  assert.match(section, /lien\('methodologie\.html'\)\+'#stats-iashark'/);
  // Titre factuel : un historique, pas un pronostic de ce match.
  assert.doesNotMatch(section, /Qui marque en premier/);
  assert.match(section, /ce n’est pas la chance de marquer en premier dans ce match/);
});

test("page : chaque chiffre avec sa marge, son nombre de matchs et sa periode ; vrais tableaux", () => {
  // Toutes les cellules chiffrees passent par sbkCase (chiffre + marge dessous), quarts d'heure compris :
  // UNE seule notation de marge sur la carte (relecture du 30/09), plus de « ± ».
  // 30/09 : le chiffre (sbkNum), son visuel decoratif, puis sa marge ; absente : « — ».
  assert.match(section, /if\(!iv\)return '<td class="sbk-na">—<\/td>';/);
  assert.match(section, /return `\$\{td\}\$\{sbkNum\(iv\.p,part\)\}\$\{vis\}<small>\$\{esc\(sbkEntre\(iv,part\)\)\}<\/small><\/td>`;/);
  assert.match(section, /const sbkNum=\(v,part\)=>`<b data-cu="\$\{Number\(v\)\}" data-cu-f="\$\{part\?'p':sbkDec\(v\)\}">\$\{esc\(part\?sbkPart\(v\):sbkMoy\(v\)\)\}<\/b>`;/);
  // Visuels decoratifs seulement (le chiffre et sa marge restent ecrits).
  for (const m of section.matchAll(/<span class="(sbk-bar[^"]*|sbk-metre)"([^>]*)>/g)) assert.match(m[2], /aria-hidden="true"/, m[1]);
  assert.match(section, /ligne=\(a,repere\)=>cols\.map\(i=>sbkCase\(a\[i\],false,\{chaleur:a\[i\]\?a\[i\]\.p\/haut:0,repere\}\)\)\.join\(''\)/);
  assert.doesNotMatch(section, /±/);
  assert.match(section, /\$\{sbkCase\(g\.win,true,\{cote:c\}\)\}\$\{sbkCase\(g\.draw,true,\{cote:c\}\)\}\$\{sbkCase\(g\.loss,true,\{cote:c\}\)\}/);
  assert.match(section, /sbkEntre\(l\.p,true\),sample:sbkEchantillon\(l\.n,l\.debut,l\.fin\)/);
  assert.match(section, /\$\{sbkCase\(x\.m,false,\{metre:x\.expected\}\)\}/);
  // Tableau des quarts d'heure : un tbody par equipe, en-tete scope="rowgroup" ;
  // 6 colonnes sur ordinateur, deux blocs de 3 sur telephone (meme construction).
  assert.match(section, /<tbody class="sbk-q-team is-\$\{c\}">\s*\$\{sbkGroupe\(nom\(c,e\),nb,ech\?sbkEchantillon\(/);
  assert.match(section, /tableau\(\[0,1,2,3,4,5\],[\s\S]*?tableau\(\[0,1,2\],[\s\S]*?tableau\(\[3,4,5\],/);
  assert.match(section, /<tr class="cmp-groupe"><th scope="rowgroup" colspan="\$\{cols\}">/);
  assert.match(section, /<caption class="sim-sub">/);
  assert.doesNotMatch(section, /scope="colgroup"/);
  // Pas de vert ni de rouge, pas de gras « gagnant » (aucun chiffre « bon » ou « mauvais »).
  assert.doesNotMatch(section, /gagne|is-pos|is-neg/);
  const css = read("assets/match-page.css");
  const bloc = css.slice(css.indexOf("LES STATS IASHARK"));
  // 30/09 : + les visuels (barres, jauge, chaleur), toujours sans vert ni rouge.
  assert.ok(bloc.length > 1000 && bloc.length < 9000, "bloc CSS court : " + bloc.length);
  assert.doesNotMatch(bloc, /var\(--green\)|var\(--red\)|#34d399|#f87171/);
  assert.doesNotMatch(bloc, /text-transform:\s*uppercase/);
});

function clesSection() {
  const cles = new Set();
  for (const m of section.matchAll(/'stats_iashark\.([a-z_0-9]+)'/g)) cles.add(m[1]);
  for (const m of section.matchAll(/\['(?:[a-z]+',')?((?:ht|per|ref|first|league)_[a-z_]+)','/g)) cles.add(m[1]);
  return [...cles];
}

test("i18n : 7 langues, memes cles, aucune valeur vide, memes variables", () => {
  const cles = clesSection();
  assert.ok(cles.length >= 60, cles.length + " cles");
  const parts = Object.fromEntries(LOCALES.map(l => [l, JSON.parse(read("i18n/parts/statsbook." + l + ".json")).stats_iashark]));
  const ref = Object.keys(parts.fr).sort();
  // Aucune cle orpheline : le fichier ne garde que ce que la page lit.
  assert.deepStrictEqual(ref, cles.slice().sort(), "cles du fichier = cles lues par la page");
  for (const l of LOCALES) {
    assert.deepStrictEqual(Object.keys(parts[l]).sort(), ref, l + " : cles differentes du francais");
    const dict = JSON.parse(read("i18n/dict/" + l + ".json")).stats_iashark;
    assert.deepStrictEqual(dict, parts[l], l + " : dictionnaire different du fichier (bloc stats_iashark a recopier)");
    for (const k of cles) {
      assert.ok(typeof parts[l][k] === "string" && parts[l][k].trim(), l + " : " + k + " manquant");
      const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
      assert.strictEqual(vars(parts[l][k]), vars(parts.fr[k]), l + " : variables de " + k);
    }
  }
  // Repli francais du code = dictionnaire francais (aucun texte orphelin).
  for (const m of section.matchAll(/tf?\('stats_iashark\.([a-z_0-9]+)','([^']*)'/g)) assert.strictEqual(parts.fr[m[1]], m[2], m[1]);
  for (const m of section.matchAll(/\['(?:[a-z]+',')?((?:ht|per|ref|first|league)_[a-z_]+)','([^']*)'/g)) assert.strictEqual(parts.fr[m[1]], m[2], m[1]);
  // Aucune promesse de gain, aucune incitation a parier.
  const tout = LOCALES.map(l => JSON.stringify(parts[l])).join(" ").toLowerCase();
  assert.doesNotMatch(tout, /garanti|gagnant|parie[rz]|misez|bet now|sure win|seguro|sicher gewinnen/);
});

test("4e relecture : un seul arrondi des parts, attendu de l'arbitre, pourcentages et points, sans coupure", () => {
  // Parts arrondies UNE fois, au pourcent, dans le calcul (plus de 0,99478 -> 0,995 -> « 100 % »).
  const py = read("scripts/stats-book/export_stats_book.py");
  assert.match(py, /return \[arrondi_part\(p\), arrondi_part\(max\(0, c - m\)\), arrondi_part\(min\(1, c \+ m\)\)\]/);
  assert.match(py, /quantize\(Decimal\("0\.01"\), rounding=ROUND_HALF_UP\)/);
  if (fs.existsSync(path.join(S.DOSSIER, "manifeste.json"))) {
    const m = S.chargerManifeste();
    if (m && m.version >= "2.0.1") {
      const entier = v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;
      for (const f of fs.readdirSync(S.DOSSIER).filter(x => /^ligue-\d+\.json$/.test(x))) {
        const l = JSON.parse(fs.readFileSync(path.join(S.DOSSIER, f), "utf8")).ligue;
        if (l) for (const k of ["plus_2_5", "btts", "dom", "nul", "ext", "apres_75"]) assert.ok(l[k].every(entier), f + " " + k);
      }
    }
  }
  // Arbitre : « Attendu pour ses matchs (toutes compétitions) », la note dit les deux periodes.
  const fr = JSON.parse(read("i18n/parts/statsbook.fr.json")).stats_iashark;
  assert.strictEqual(fr.ref_col_league, "Attendu pour ses matchs");
  assert.strictEqual(fr.ref_all_comp, "Toutes compétitions");
  assert.match(fr.ref_note, /sur 3 ans/);
  assert.match(fr.ref_note, /2 ans de \{league\}/);
  for (const l of LOCALES) {
    const p = JSON.parse(read("i18n/parts/statsbook." + l + ".json")).stats_iashark;
    for (const k of ["ref_col_league", "ref_note", "ref_more", "ref_less", "ref_ok_all", "ref_ok_rest", "ref_margin_help"]) {
      assert.doesNotMatch(p[k], /moyenne de la ligue|league average|Ligaschnitt|media de la liga|promedio de la liga|media del campionato|média da liga/i, l + " " + k);
    }
  }
  // Comparatif : « 69 % » au format de la langue, ecart de deux pourcentages en points.
  const cmp = js.slice(js.indexOf("function comparison(vm)"), js.indexOf("// STATS IASHARK (Book, 30/09/2026)"));
  assert.match(cmp, /const valeur=\(v,unite\)=>unite==='%'\?pct\(v,0\):un\(v,unite\);/);
  assert.match(cmp, /t\('match_page\.proba_point_other','points'\)/);
  assert.doesNotMatch(cmp, /points_short/);
  assert.doesNotMatch(cmp, /\$\{un\(r\.home,unite\)\}\$\{esc\(unite\)\}/);
  // Pas de coupure : chiffre + unite, mot + chiffre (« Ligue 1 »), mot compose (« Hors-jeu »).
  const insecable = insecableDe(js);
  const html = insecable("Suivi sur 3 ans (2 ans de Ligue 1). Hors-jeu et arrêts, 15 %.");
  assert.match(html, /3\u00a0ans \(2\u00a0ans de Ligue\u00a01\)/);
  assert.match(html, /<span class="nw">Hors-jeu<\/span>/);
  assert.match(html, /15\u00a0%/);
  // Les notes des stats et du Comparatif passent par insecable.
  assert.match(cmp, /<p class="cmp-note">\$\{insecable\(note\+' '\+t\('match_page\.comparison_note_disclaimer'/);
  assert.match(section, /<p class="cmp-note tip-host">\$\{insecable\(\(conforme\?conforme\+' ':''\)\+note\+' '\+t\('stats_iashark\.ref_meter',/);
  assert.match(read("assets/match-page.css"), /\n\.nw\{white-space:nowrap\}/);
});

test("5e relecture : blocs a 100 %, espaces insecables, arbitre, Comparatif, textes, panneaux", () => {
  const py = read("scripts/stats-book/export_stats_book.py");
  // Plus grand reste : les parts d'un meme bloc font toujours 100 % (PSG : 79 + 19 + 1 = 99 %).
  assert.match(py, /def parts_bloc\(ks, n\):/);
  assert.match(py, /for i in sorted\(range\(len\(ks\)\), key=lambda i: \(-restes\[i\], -ks\[i\], i\)\)\[:manque\]:/);
  assert.match(py, /marque, encaisse, zero = parts_bloc\(/);
  assert.match(py, /v, nul, d = parts_bloc\(/);
  assert.match(py, /dom, nul, ext = parts_bloc\(/);
  if (fs.existsSync(path.join(S.DOSSIER, "manifeste.json"))) {
    const m = S.chargerManifeste();
    if (m && m.version >= "2.0.2") {
      const cent = xs => Math.round(xs.reduce((a, x) => a + x[0], 0) * 100);
      let blocs = 0;
      for (const f of fs.readdirSync(S.DOSSIER).filter(x => /^ligue-\d+\.json$/.test(x))) {
        const d = JSON.parse(fs.readFileSync(path.join(S.DOSSIER, f), "utf8"));
        if (d.ligue) { blocs++; assert.strictEqual(cent([d.ligue.dom, d.ligue.nul, d.ligue.ext]), 100, f + " ligue"); }
        for (const [id, e] of Object.entries(d.equipes)) for (const vue of ["tout", "dom", "ext"]) {
          const v = e[vue];
          if (!v) continue;
          if (v.premier_but) { blocs++; assert.strictEqual(cent([v.premier_but.marque, v.premier_but.encaisse, v.premier_but.zero_zero]), 100, f + " " + id + " premier but"); }
          for (const c of Object.values(v.pause || {})) { blocs++; assert.strictEqual(cent([c.v, c.nul, c.d]), 100, f + " " + id + " pause"); }
        }
      }
      assert.ok(blocs > 100, blocs + " blocs");
    }
  }
  // Espaces insecables : le chiffre et son unite QUI SUIT, jamais le mot d'avant.
  const insecable = insecableDe(js), NB = "\u00a0";
  assert.strictEqual(insecable("le vrai chiffre s’y trouve 95 fois sur 100."), "le vrai chiffre s’y trouve 95" + NB + "fois sur" + NB + "100.");
  assert.strictEqual(insecable("compte 2 ans de Ligue 1 seulement : les deux chiffres peuvent différer."), "compte 2" + NB + "ans de Ligue" + NB + "1 seulement : les deux chiffres peuvent différer.");
  assert.match(insecable("Le scénario du match par tranche de 15 minutes : quand les buts tombent"), /tranche de 15\u00a0minutes :/);
  assert.match(insecable("« Attendu pour ses matchs » : la moyenne"), /«\u00a0Attendu pour ses matchs\u00a0»/);
  assert.match(insecable("J1 League, Liga 1 Peru et Premier League sont affichées"), /J1\u00a0League, Liga\u00a01 Peru et Premier\u00a0League sont affichées/);
  // Jamais un mot court seul en fin de note (« dans ce / match. »).
  assert.match(insecable("de marquer en premier dans ce match."), /dans ce\u00a0match\.$/);
  assert.match(insecable("comparatif, buts par quart d’heure, arbitre"), /quart\u00a0d’heure/);
  // Partout : notes, panneau visiteur (mur Pro) et panneau du match offert.
  assert.match(js, /<ul class="gate-facts">\$\{contenu\.map\(\(\[k,fb\]\)=>`<li>\$\{insecable\(/);
  const css = read("assets/match-page.css");
  assert.match(css, /\.seo-foot-nav a\{white-space:nowrap\}/);
  // Arbitre : « Toutes compétitions » vaut pour ses matchs ET l'attendu (ligne de groupe, 3 colonnes).
  assert.match(section, /const groupeArb=sbkGroupe\(t\('stats_iashark\.ref_all_comp','Toutes compétitions'\),3,sbkEchantillon\(a\.n,a\.debut,a\.fin\)\);/);
  assert.doesNotMatch(section, /ref_col_league_all|sbk-th-sub/);
  const fr = JSON.parse(read("i18n/parts/statsbook.fr.json")).stats_iashark;
  assert.ok(fr.ref_note.indexOf("il est suivi sur 3 ans") > fr.ref_note.indexOf("sélections comprises"), "les 3 ans juste apres la definition");
  // Comparatif : « sur les 7 mesures », jamais « sur 7 des 7 » ; apostrophe typographique.
  const cmp = js.slice(js.indexOf("function comparison(vm)"), js.indexOf("// STATS IASHARK (Book, 30/09/2026)"));
  assert.match(cmp, /conclusion=meneur&&compte===total\s*\?/);
  for (const l of LOCALES) {
    const mp = JSON.parse(read("i18n/dict/" + l + ".json")).match_page;
    assert.ok(mp.comparison_leads_all && mp.comparison_leads_all.trim(), l + " comparison_leads_all");
    assert.doesNotMatch(mp.sig_risk_negative_edge + mp.sig_risk_small_edge, /\b(pts|Pkt\.|pt)\b/, l + " : l'ecart s'ecrit en points, comme l'avis");
  }
  assert.doesNotMatch(JSON.parse(read("i18n/dict/fr.json")).match_page.comparison_note_disclaimer, /'/);
  // Classement : le meme nom de ligue que l'en-tete ; nom court « Los Chankas ».
  assert.match(js, /<p class="st-note">\$\{esc\(nomLigue\(i,vm\)\|\|c\.league_name\)\}/);
  assert.strictEqual(VM.nomCourt("Club Deportivo Los Chankas"), "Los Chankas");
});
