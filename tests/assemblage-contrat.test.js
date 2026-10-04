"use strict";
// ASSEMBLAGE DU 04/10/2026 (branche tickets-page-match) : le calcul (tickets-moteur) et
// l'interface (tickets-interface) parlent EXACTEMENT la meme langue.
//  - Les champs que le pipeline produit (lib/sections-match.js, lib/simulation-15min.js,
//    lib/marches-panneau.js, lib/jumeaux.js, lib/moteur-v3.js, contrat tickets-du-jour)
//    sont rendus par la page avec LES MEMES chiffres, sans rien recalculer.
//  - Chaque cle produite est lue par l'interface, ou figure dans la courte liste des cles
//    volontairement non affichees (avec la raison).
//  - Un calcul sans feu vert (buteur du jour « en_attente » : statut « indisponible ») ne
//    laisse aucune carte « momentanement indisponible ».
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

global.window = undefined;
require("../lib/icones.js");
require("../lib/composants.js");
const MS = require("../lib/match-sections.js");
const AJ = require("../lib/aujourdhui.js");
const S = require("../lib/sections-match.js");
const P = require("../lib/marches-panneau.js");
const V3 = require("../lib/moteur-v3.js");
const SIM = require("../lib/simulation-15min.js");
const J = require("../lib/jumeaux.js");
const PR = require("../lib/pronostic.js");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const SORTIES = ["vraie_sortie_bb2a929.json", "exemple_sortie.json"].map((f) => require("./fixtures/moteur-v3/" + f));
const AVEC_GRILLE = [];
SORTIES.forEach((s) => s.matchs.forEach((v) => { if (v.marches.some((x) => x.cle === "SCORE:0-0") && v.marches.some((x) => x.cle === "PREMIER_BUT:dom")) AVEC_GRILLE.push(v); }));
// [marche, ecart en points avec le v3 arrondi] : dans la tolerance de 2 points du
// mathematicien (controle du 04/10/2026, point 2).
const PARIS = [null, ["home-win", 1], ["away-win", -1], ["draw", 0], ["dc-1x", 1], ["over-25", -1]];

// Match tel que le pipeline le laisse apres publication des paris, puis les nouveaux champs
// poses par les MEMES fonctions que .github/workflows/update-data.yml.
function matchPipeline(v, pr) {
  const m = { id: 1, home: { n: v.domicile }, away: { n: v.exterieur }, league_key: "mls",
    moteur_v3: { source: "v3", origine_probabilite: "modèle + cotes", couverture: v.couverture }, v3_fiabilite: { couverture: "vérifiée" },
    v3_marches: v.marches.map((x) => ({ cle: x.cle, probabilite: Math.round(x.probabilite * 1000) / 10 })) };
  if (pr) {
    const pv = m.v3_marches.find((x) => x.cle === P.cleV3DuMarche(pr[0])).probabilite;
    Object.assign(m, { pari_rec: "x", market_id: pr[0], chance_iashark: Math.round(pv) + pr[1] });
  }
  P.poserPanneaux([m]);
  S.poserSections([m]);
  m.sim_15min = SIM.champPipeline({ lambdaH: 1.5, lambdaA: 1.2, favori: "home", ligueApi: 39, ajouts: S.ajoutsSimulation() });
  const pb = V3.premiersButeursV3(v, { ligue: m.league_key });
  if (pb.length) m.v3_premiers_buteurs = pb;
  return m;
}
function vmDe(m) {
  return { id: 1, identity: { home: { name: m.home.n }, away: { name: m.away.n } }, model: { recommendation: m.market_id ? { probability: m.chance_iashark } : null }, editorial: { signalReasons: [] }, players: {} };
}
function rendre(m, o) {
  const vm = vmDe(m), dit = MS.registre();
  MS.clesAvis(vm, m, dit);
  const c = Object.assign({ raw: m, vm, vuePro: true, verrouPro: false, dit }, o || {});
  const secs = Object.fromEntries(MS.sections(c).map(([k, h]) => [k, h]));
  return { secs, panneau: o && o.vuePro === false ? null : MS.panneau(c), dit };
}
const texte = (h) => String(h || "").replace(/<canvas[^>]*>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");
const specs = (h) => [...String(h).matchAll(/data-ch="([^"]*)"/g)].map((x) => JSON.parse(x[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")));
const fmtNombre = (x) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(x);

test("feux du mathematicien : NO-GO et « en_attente » ne sont jamais produits ; les GO le sont", () => {
  const V = require("../config/verdicts-maths.json");
  assert.equal(V.match.zone_chaude, "NO-GO");
  assert.equal(V.match.score_le_plus_fou, "NO-GO");
  assert.notEqual(V.match.arbitre, "GO", "arbitre : jamais tant que l'heure de nomination n'est pas mesuree");
  assert.notEqual(V.tickets.buteur_du_jour, "GO", "buteur du jour : aucun verdict sur « le plus probable de la journee »");
  const m = matchPipeline(AVEC_GRILLE[0], ["home-win", 1]);
  assert.doesNotMatch(JSON.stringify(m.sim_15min), /chaude|hot|zone/i);
  assert.ok(!("simulation_count" in m) && !("mc_scores_fou" in m));
  for (const k of ["film_tr", "film_tr_equipes", "et_si", "qui_ouvre", "premier_but_avant_pause", "minute_mediane_premier_but", "premier_buteur", "sim_resume"]) assert.equal(V.match[k], "GO", k);
});

test("« 10 000 fois » : la page montre exactement sim_resume (issues, scores, nombre de buts), le pari renvoie a l'Avis", () => {
  assert.ok(AVEC_GRILLE.length >= 2);
  for (const v of AVEC_GRILLE) for (const pr of PARIS) {
    const m = matchPipeline(v, pr);
    assert.ok(m.sim_resume, "sim_resume pose");
    const { secs } = rendre(m);
    const h = secs.sim, t = texte(h);
    const r = m.sim_resume;
    const iss = [["dom", "home-win"], ["nul", "draw"], ["ext", "away-win"]];
    for (const [k, id] of iss) {
      const attendu = "≈ " + fmtNombre(r.issues[k]) + " fois";
      if (pr && pr[0] === id) assert.ok(t.includes("dans l’avis"), "pari : renvoi a l'Avis, chiffre jamais repete");
      else assert.ok(t.replace(/ | /g, " ").includes(attendu.replace(/ | /g, " ")), k + " " + attendu + " dans " + t.slice(0, 300));
    }
    const [anneau, sc, bu] = specs(h);
    assert.deepEqual(anneau.data.datasets[0].data, [r.issues.dom / 100, r.issues.nul / 100, r.issues.ext / 100]);
    assert.deepEqual(sc.data.labels, r.scores.map((x) => x.score.replace("-", " – ")));
    assert.deepEqual(sc.data.datasets[0].data, r.scores.map((x) => x.n));
    const zero = r.scores.some((x) => x.score === "0-0");
    assert.deepEqual(bu.data.datasets[0].data, r.total_buts.map((x) => x.n));
    assert.deepEqual(bu.data.datasets[0].datalabels.display, r.total_buts.map((x) => !(x.buts === "0" && zero)), "0 but = 0-0 : nombre jamais reecrit");
  }
});

test("qui ouvre le score, avant la pause, minute mediane, premiers buteurs, Et si : les chiffres du pipeline, tels quels", () => {
  let vus = 0;
  for (const v of AVEC_GRILLE) for (const pr of PARIS) {
    const m = matchPipeline(v, pr);
    const { secs, panneau } = rendre(m);
    const h = secs.premier, t = texte(h).replace(/ | /g, " ");
    const pb = m.premier_but;
    assert.ok(pb && Number.isInteger(pb.avant_pause));
    assert.ok(t.includes("Premier but avant la pause : " + pb.avant_pause + " %."), t.slice(0, 400));
    // Le panneau ne repete pas « 1re mi-temps : plus de 0,5 but » : il renvoie a la section.
    assert.match(panneau.html, /1re mi-temps : plus de 0,5 but<\/span><span class="mk-r"><a class="mk-ref" href="#sec-premier">/);
    const masque = (pb.ext >= 10 && pb.ext < 20) || (pb.dom >= 80 && pb.dom < 90);
    const barre = specs(h).find((s) => s.type === "bar");
    if (masque) assert.equal(barre, undefined);
    else { assert.deepEqual(barre.data.datasets.map((d) => d.data[0]), [pb.dom, pb.aucun, pb.ext]); vus++; }
    const s15 = m.sim_15min;
    assert.ok(t.includes("avant la " + s15.minute_mediane_premier_but + "e minute"));
    const scen = [...h.matchAll(/data-e="([^"]*)"/g)].map((x) => JSON.parse(x[1].replace(/&quot;/g, '"')));
    assert.deepEqual(scen, ["dom_premier", "ext_premier", "nul_pause"].map((k) => [s15.si_affiche[k].p1, s15.si_affiche[k].pn, s15.si_affiche[k].p2]));
    for (const b of m.v3_premiers_buteurs || []) { assert.ok(t.includes(b.joueur)); assert.ok(t.includes(b.chance + " %")); }
    assert.doesNotMatch(t, /marquera|quart d’heure le plus probable/i);
  }
  assert.ok(vus >= 1, "au moins un match avec la barre « qui ouvre le score »");
});

test("film du match : tr, tr_dom, tr_ext du pipeline en pourcentages entiers", () => {
  const v = AVEC_GRILLE[0];
  const m = matchPipeline(v, null);
  m.events_home = { games: 20, slots: [3, 4, 3, 8, 1, 6].map((n) => ({ n })), slots_against: [4, 2, 3, 7, 7, 5].map((n) => ({ n })) };
  m.events_away = { games: 20, slots: [2, 3, 3, 4, 5, 6].map((n) => ({ n })), slots_against: [3, 3, 4, 4, 4, 5].map((n) => ({ n })) };
  const h = rendre(m).secs.film;
  // La courbe a son propre graphique (avec son echelle), sous les barres (controle UX du 04/10).
  const sp = specs(h);
  assert.equal(sp[0].type, "bar");
  assert.ok(!sp[0].data.datasets.some((d) => d.type === "line"), "plus de courbe posee sur l'axe des buts");
  const ligne = sp[1].data.datasets[0];
  assert.equal(sp[1].type, "line");
  assert.equal(sp[1].options.scales.x.offset, true, "alignee sur les 6 colonnes des barres");
  assert.deepEqual(ligne.data, m.sim_15min.tr.map((x) => Math.round(x * 100)));
  const details = JSON.parse(h.match(/data-f-all="([^"]*)"/)[1].replace(/&quot;/g, '"'));
  details.forEach((d, i) => {
    assert.ok(d.replace(/ | /g, " ").includes(m.home.n + " " + Math.round(m.sim_15min.tr_dom[i] * 100) + " %, " + m.away.n + " " + Math.round(m.sim_15min.tr_ext[i] * 100) + " %"), d);
  });
});

test("jumeaux : la sortie de lib/jumeaux.js est rendue telle quelle (comptes, pct, niveau, exemples)", () => {
  const cotes = (p1, pn, p2) => [p1, pn, p2].map((p) => (1 / (p * 1.05)).toFixed(4));
  const c = cotes(0.45, 0.25, 0.30);
  const m = { league_key: "premier", date: "2026-10-04 18:00", c1: c[0], cn: c[1], c2: c[2], co25: "1.75", cu25: "2.15" };
  const q = PR.sansMargePuissance([Number(m.c1), Number(m.cn), Number(m.c2)]);
  const lignes = [];
  for (let i = 0; i < 260; i++) {
    const issue = i < 150 ? [2, 0] : i < 210 ? [1, 1] : [0, 1];
    lignes.push({ date: "2023-0" + (1 + (i % 9)) + "-1" + (i % 10), code: ["E0", "SP1", "D1"][i % 3], ligue: "Premier League", domicile: "D" + i, exterieur: "E" + i,
      bd: issue[0], be: issue[1], p1: q[0] + ((i % 7) - 3) * 0.006, p2: q[2] + ((i % 5) - 2) * 0.009, po25: 0.55 });
  }
  const j = J.jumeauxDuMatch(J.construireTable(lignes, { fin: "2026-10-03" }), m);
  assert.ok(j && j.resultat, "jumeaux produits");
  const h = MS.jumeaux({ raw: { jumeaux: j }, vm: vmDe({ home: { n: "A" }, away: { n: "B" } }), vuePro: false, verrouPro: false, dit: MS.registre() });
  const t = texte(h).replace(/ | /g, " ");
  const r = j.resultat;
  assert.ok(t.includes(r.n + " matchs jumeaux depuis " + r.depuis), t.slice(0, 200));
  for (const k of ["dom", "nul", "ext"]) assert.ok(t.includes(r[k] + " (" + r.pct[k] + " %)"), k);
  assert.ok(t.includes(r.niveau === "tous" ? "Tous championnats" : "Même niveau"));
});

test("chaque champ produit est lu par l'interface (ou volontairement ignore, raison ecrite)", () => {
  const src = read("lib/match-sections.js") + read("lib/aujourdhui.js") + read("match-page.js");
  const lit = (k) => new RegExp("[.\"']" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(src);
  const m = matchPipeline(AVEC_GRILLE[0], ["home-win", 1]);
  const IGNORES = {
    v: "numero de version du format, pas un chiffre affiche",
    premier: "sim_15min.premier : le verdict c1 prend la grille v3 (premier_but), pas la simulation",
    si: "sim_15min.si : valeurs brutes ; la page lit si_affiche (deja arrondi a 5 points par le pipeline)",
    p_premier_buteur: "probabilite brute ; la page montre la chance entiere (chance)",
    source: "marches_panneau : modele ou marche, non affiche (une seule chance par ligne)",
  };
  const champs = {
    sim_resume: m.sim_resume, premier_but: m.premier_but, sim_15min: m.sim_15min, v3_premiers_buteurs: m.v3_premiers_buteurs && m.v3_premiers_buteurs[0],
    marches_panneau: { v: 1, releve_at: 1, nb: 1, familles: 1 }, famille: { cle: 1, marches: 1 }, ligne_panneau: m.marches_panneau.familles[0].marches[0],
  };
  for (const [nom, obj] of Object.entries(champs)) {
    assert.ok(obj, nom + " produit");
    for (const k of Object.keys(obj)) if (!IGNORES[k]) assert.ok(lit(k), nom + "." + k + " : produit par le pipeline mais jamais lu par la page");
  }
  for (const k of ["sim_resume", "premier_but", "v3_premiers_buteurs", "marches_panneau", "nb_marches", "jumeaux", "tr_dom", "tr_ext", "si_affiche", "minute_mediane_premier_but", "avant_pause", "total_buts", "niveau", "pct"]) assert.ok(lit(k), k);
  // Plus aucun champ que le pipeline ne produit pas (anciennes lectures de l'interface).
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /tous_niveaux|raw\.arbitre\b|PREMIER_BUT:(dom|ext|aucun)/);
});

test("tickets du jour : la reponse du contrat (3 niveaux) est rendue sans fuite ; un calcul sans feu vert ne montre aucune carte", async () => {
  const C = await import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/tickets-contrat.mjs")).href);
  const J1 = (id, o) => Object.assign({ fixture_id: id, domicile: "Lens" + id, exterieur: "Lille" + id, ligue: "Ligue 1", coup_envoi: "2026-10-04 15:0" + (id % 10), pari: "Victoire Lens" + id, market_id: "home-win", cote: 1.55, operateur: "Winamax", chance: 64 }, o || {});
  const LIGNES = [
    { type: "x5", meta: { nb_matchs: 3, cote_totale: 4.62 }, publie_a: "2026-10-04T04:12:09Z", etats: {}, contenu: { chance: 26, operateur_unique: "Winamax", jambes: [J1(1), J1(2), J1(3)] } },
    { type: "x10", meta: { nb_matchs: 5, cote_totale: 9.12 }, publie_a: "2026-10-04T04:12:09Z", etats: {}, contenu: { chance: 10, operateur_unique: null, jambes: [J1(11), J1(12), J1(13), J1(14), J1(15)] } },
    { type: "or", meta: { nb_paris: 3 }, publie_a: "2026-10-04T04:12:09Z", etats: {}, contenu: { paris: [1, 2, 3].map((r) => Object.assign({ rang: r }, J1(20 + r, { chance: 72 - r }))) } },
  ];
  const calcul = { statuts: { x5: "publie", x10: "publie", or: "publie", buteur: "non_go" } };
  const anon = C.construireReponse({ jour: "2026-10-04", niveau: "anonyme", lignes: LIGNES, calcul });
  const hA = AJ.html(anon, {});
  assert.match(hA, /3 matchs · cote totale 4,62/);
  assert.match(hA, /5 matchs · cote totale 9,12/);
  assert.doesNotMatch(hA, /Lens|Winamax|Victoire/);
  assert.doesNotMatch(hA, /Buteur du jour|indisponible/i, "buteur sans feu vert : aucune carte");
  const gratuit = C.construireReponse({ jour: "2026-10-04", niveau: "gratuit", lignes: LIGNES, calcul });
  const hG = AJ.html(gratuit, {});
  assert.match(hG, /Lens1 – Lille1/);
  assert.doesNotMatch(hG, /Lens11|Lens21/, "x10 et Selection en or : jamais leurs jambes pour un compte gratuit");
  const pro = C.construireReponse({ jour: "2026-10-04", niveau: "pro", lignes: LIGNES, calcul });
  const hP = AJ.html(pro, {});
  for (const x of ["Lens1 – Lille1", "Lens11 – Lille11", "Victoire Lens21"]) assert.ok(hP.includes(x), x);
  assert.match(hP, /Chance calculée du ticket/);
  assert.doesNotMatch(hP, /aj-unlock/);
});
