"use strict";
// Bandeau des vrais resultats (lib/bandeau-preuves.js, 26/10/2026), regles validees par historique-public et
// l'avocat du diable : defile des 40 derniers paris simples dans l'ordre ; aucun pari publie apres le coup d'envoi ;
// combines et Selection en or jamais retires en silence (« resultat en verification ») ; aucune phrase de gain.
// Affichage (decision de Clement du 26/10/2026) : la bande seule, sans ligne de texte au-dessus, 44 px de haut ;
// le compte depuis le 04/10 reste calcule dans preuves/bandeau.json.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const B = require("../lib/bandeau-preuves.js");

const MAINTENANT = Date.parse("2026-10-26T10:00:00Z");
function pari(id, heure, result, extra) {
  const k = new Date(Date.parse("2026-10-25T00:00:00Z") + heure * 3600000).toISOString();
  return Object.assign({ fixture_id: id, home: "Dom" + id, away: "Ext" + id, prediction: "Over 2.5", market: "over-25", cote: "1.5", result, score: "2-1", type: "single",
    published_at: new Date(Date.parse(k) - 6 * 3600000).toISOString(), kickoff_at: k }, extra || {});
}

test("compte : TOUS les paris simples regles depuis le 04/10 (heure de Paris), pas les 40 du defile", () => {
  const simples = [];
  for (let i = 1; i <= 60; i++) simples.push(pari(i, i * 0.3, i % 3 === 0 ? "loss" : "win"));
  // Avant le 04/10 (heure de Paris) : hors compte. Le 04/10 a 00 h 30 (heure de Paris) : dans le compte.
  simples.push(pari(900, 0, "win", { kickoff_at: "2026-10-03T21:30:00Z", published_at: "2026-10-03T10:00:00Z" }));
  simples.push(pari(901, 0, "loss", { kickoff_at: "2026-10-03T22:30:00Z", published_at: "2026-10-03T10:00:00Z" }));
  const b = B.construireBandeau({ simples, tickets: [], jambes: [], matchs: [], maintenant: MAINTENANT });
  assert.equal(b.compte.depuis, "2026-10-04");
  assert.equal(b.compte.gagnes, 40, "40 gagnes sur les 60 paris du 25/10 (+0 avant le 04/10)");
  assert.equal(b.compte.perdus, 21, "20 perdus du 25/10 + celui du 04/10 a 00 h 30");
  // Defile : les 40 derniers, dans l'ordre, sans trou ; un perdu recent reste devant un gagne plus ancien.
  assert.equal(b.simples.n, 40);
  assert.deepEqual(b.simples.items.map((x) => x.f), Array.from({ length: 40 }, (_, i) => 60 - i));
  assert.equal(b.simples.items[0].r, "loss");
  assert.equal(b.simples.au, b.simples.items[0].k);
  assert.equal(b.simples.du, b.simples.items[39].k);
});

test("paris simples : publie apres le coup d'envoi, sans date, annule ou en attente = ni compte ni defile", () => {
  const simples = [
    pari(1, 1, "win"),
    pari(2, 2, "win", { published_at: "2026-10-25T03:00:00Z" }), // publie apres le coup d'envoi (02:00)
    pari(3, 3, "win", { published_at: null }),
    pari(4, 4, "void"),
    pari(5, 5, "scheduled"),
    pari(6, 6, "loss", { kickoff_at: null }),
  ];
  const b = B.construireBandeau({ simples, tickets: [], jambes: [], matchs: [], maintenant: MAINTENANT });
  assert.deepEqual(b.simples.items.map((x) => x.f), [1]);
  assert.deepEqual([b.compte.gagnes, b.compte.perdus], [1, 0]);
});

test("combines et Selection en or : perdu des qu'un pari est perdu, gagne si tout est regle, sinon « en verification » (jamais retire)", () => {
  const jambes = [pari(11, 10, "win"), pari(12, 11, "win"), pari(13, 12, "loss"), pari(14, 13, "win", { market: "btts-yes" }), pari(15, 14, "scheduled"), pari(16, 14, "void")];
  const fini = Date.parse("2026-10-25T11:00:00Z");
  const jambe = (id, market, k) => ({ fixture_id: id, market_id: market || "over-25", coup_envoi: "2026-10-25 12:00", coup_envoi_ms: k || fini });
  const tickets = [
    { jour: "2026-10-25", type: "x5", meta: { cote_totale: 4.03 }, contenu: { jambes: [jambe(11), jambe(12)] } },               // gagne
    { jour: "2026-10-25", type: "x10", meta: { cote_totale: 8.52 }, contenu: { jambes: [jambe(11), jambe(13), jambe(15)] } },    // perdu (un perdu suffit)
    { jour: "2026-10-24", type: "x5", meta: { cote_totale: 3.9 }, contenu: { jambes: [jambe(11), jambe(14, "fh-over-05")] } },  // autre marche que le score final ne regle pas : en verification
    { jour: "2026-10-24", type: "x10", meta: { cote_totale: 9 }, contenu: { jambes: [jambe(11), jambe(15)] } },                 // non regle : en verification
    { jour: "2026-10-25", type: "or", contenu: { paris: [jambe(11), jambe(13), jambe(16), jambe(99, "anytime-scorer-1")] } },   // 1 g, 1 p, 1 annule, 1 en verification
    { jour: "2026-10-26", type: "x5", meta: { cote_totale: 4 }, contenu: { jambes: [jambe(11, null, MAINTENANT - 3600000)] } }, // pas encore termine : pas montre
    { jour: "2026-10-10", type: "x5", meta: { cote_totale: 4 }, contenu: { jambes: [jambe(11, null, Date.parse("2026-10-10T11:00:00Z"))] } }, // trop ancien
  ];
  const b = B.construireBandeau({ simples: [], tickets, jambes, matchs: [], maintenant: MAINTENANT });
  assert.deepEqual(b.combines.map((c) => c.j + " " + c.t + ":" + c.r).sort(), ["2026-10-24 x10:verif", "2026-10-24 x5:verif", "2026-10-25 x10:loss", "2026-10-25 x5:win"]);
  assert.deepEqual(b.or.map((o) => [o.g, o.p, o.a, o.v]), [[1, 1, 1, 1]]);
  const h = B.html(Object.assign({}, b, { simples: { n: 1, du: "2026-10-25T10:00:00Z", au: "2026-10-25T10:00:00Z", items: [{ f: 1, k: "2026-10-25T10:00:00Z", h: "A", a: "B", m: "over-25", p: "Over 2.5", c: 1.5, r: "win" }] }, compte: { depuis: "2026-10-04", gagnes: 1, perdus: 0 } }));
  assert.equal((h.rail.match(/Résultat en vérification/g) || []).length, 2);
  assert.match(h.rail, /1 en vérification/);
  assert.match(h.rail, /du 24\/10/);
});

test("logos : identifiants lus dans les matchs du run et gardes d'un passage a l'autre ; inconnus = aucun logo", () => {
  const simples = [pari(21, 1, "win"), pari(22, 2, "loss")];
  const premier = B.construireBandeau({ simples: [], tickets: [], jambes: [], matchs: [{ id: 21, home: { id: 85 }, away: { id: 80 }, date: "2026-10-25 01:00" }], maintenant: MAINTENANT });
  const second = B.construireBandeau({ simples, tickets: [], jambes: [], matchs: [], precedent: premier, maintenant: MAINTENANT });
  const it = Object.fromEntries(second.simples.items.map((x) => [x.f, x]));
  assert.deepEqual([it[21].hi, it[21].ai], [85, 80]);
  assert.deepEqual([it[22].hi, it[22].ai], [null, null]);
});

test("affichage : la bande seule (aucune ligne de texte), cote sur chaque ligne, aucune phrase de gain", () => {
  const simples = [pari(31, 3, "win"), pari(32, 2, "loss"), pari(33, 1, "win")];
  const d = B.construireBandeau({ simples, tickets: [], jambes: [], matchs: [], maintenant: MAINTENANT, genereLe: "2026-10-26T10:33:33.000Z" });
  const h = B.html(d);
  assert.equal(h.tete, undefined, "plus de ligne de texte au-dessus de la bande");
  assert.doesNotMatch(h.rail, /depuis le|Défilé|derniers paris simples|mis à jour/, "ni compte ni titre dans la bande");
  assert.equal((h.rail.match(/class="bp-c">1,50</g) || []).length, 3, "la cote sur chaque ligne");
  assert.equal((h.rail.match(/bp-it bp-win/g) || []).length, 2);
  assert.equal((h.rail.match(/bp-it bp-loss/g) || []).length, 1);
  // Ordre des coups d'envoi, gagnes et perdus melanges (jamais trie par resultat).
  assert.deepEqual([...h.rail.matchAll(/bp-it bp-(win|loss)/g)].map((m) => m[1]), ["win", "loss", "win"]);
  // Code de la consommation L121-2 a L121-4 : aucun argument de gain, aucune promesse, aucun taux presente comme tel.
  const tout = h.rail + h.aria;
  assert.doesNotMatch(tout, /mise|gains?\b|garanti|€|esp[ée]rance|taux|r[ée]ussite|%|rentab|profit|b[ée]n[ée]fice/i);
  assert.match(h.aria, /^Derniers résultats, gagnés et perdus · mis à jour le 26\/10/, "date de mise a jour pour les lecteurs d'ecran");
  assert.equal(B.html({ simples: { n: 0, items: [] }, compte: { depuis: "2026-10-04", gagnes: 0, perdus: 0 } }), null, "sans pari regle : rien (bandeau replie)");
  // Le fichier publie garde son compte (historique), meme s'il n'est plus affiche.
  assert.deepEqual([d.compte.gagnes, d.compte.perdus], [2, 1]);
});

test("affichage : style de la bande (44 px, defile regulier, pause au survol et au toucher, sans animation si demande)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "bandeau-preuves.js"), "utf8");
  assert.match(src, /\.bp\{box-sizing:border-box;height:44px;/);
  assert.match(src, /\.bp-it\{[^}]*height:30px;/, "cartes de 30 px centrees dans la bande");
  assert.match(src, /animation-play-state:paused/);
  assert.match(src, /prefers-reduced-motion:reduce\)\{\.bp-rail\{animation:none\}/);
  assert.match(src, /\.bp-double\{display:none!important\}/, "copie de la boucle masquee sans animation (le style en ligne ne la remontre pas)");
  assert.match(src, /var VITESSE = 45;/);
  assert.doesNotMatch(src, /bp-tete|bp-sous|summary_since|rail_title/, "plus aucune ligne de texte");
});

test("date de mise a jour : tiree de genere_le (jamais de l'horloge du visiteur) ; sans date lisible, rien", () => {
  const d = B.construireBandeau({ simples: [pari(41, 3, "win")], tickets: [], jambes: [], matchs: [], maintenant: MAINTENANT, genereLe: "2026-10-26T10:33:33.000Z" });
  assert.match(B.html(d).maj, /26\/10/);
  assert.match(B.html(Object.assign({}, d, { genere_le: "2026-10-20T05:00:00.000Z" })).maj, /20\/10/, "un fichier ancien montre sa vieille date");
  assert.equal(B.html(Object.assign({}, d, { genere_le: "pas une date" })).maj, null);
});

test("calcul quotidien : lecture complete (pages de 1000), et aucune reecriture si une lecture echoue (genere_le garde sa date)", () => {
  const yml = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-data.yml"), "utf8");
  const debut = yml.indexOf("// BANDEAU DES VRAIS RESULTATS");
  const fin = yml.indexOf("::warning title=Bandeau::preuves/bandeau.json non ecrit", debut);
  assert.ok(debut > 0 && fin > debut, "bloc du bandeau present");
  const bloc = yml.slice(debut, fin);
  assert.match(bloc, /limit=1000&offset='\+\(pageB\*1000\)/, "lecture par pages");
  assert.match(bloc, /if\(!Array\.isArray\(repB\)\)\{ simplesB=null; break; \}/, "page illisible = rien d'ecrit");
  assert.match(bloc, /if\(\+\+pageB>=50\)\{ simplesB=null; break; \}/, "jamais un compte tronque");
  assert.match(bloc, /BANDEAU_PREUVES\.DEBUT_COMPTE/);
  assert.equal(bloc.split("fs.writeFileSync('preuves/bandeau.json'").length - 1, 1, "une seule ecriture");
  const garde = bloc.indexOf("if(Array.isArray(simplesB)&&Array.isArray(ticketsB)&&Array.isArray(jambesB)){");
  const nonVide = bloc.indexOf("if(bandeau.simples.n>0){");
  const ecriture = bloc.indexOf("fs.writeFileSync('preuves/bandeau.json'");
  assert.ok(garde > 0 && nonVide > garde && ecriture > nonVide, "ecriture seulement apres lectures reussies et bandeau non vide");
  assert.match(bloc, /genereLe:genere\b/);
});

test("fichier publie preuves/bandeau.json : conforme (compte depuis le 04/10, defile ordonne, combines regles ou en verification)", () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "preuves", "bandeau.json"), "utf8"));
  assert.equal(d.compte.depuis, B.DEBUT_COMPTE);
  assert.ok(d.compte.gagnes + d.compte.perdus >= d.simples.n, "le compte couvre au moins le defile");
  const it = d.simples.items;
  assert.ok(it.length > 0 && it.length <= B.N_SIMPLES);
  for (let i = 1; i < it.length; i++) assert.ok(it[i - 1].k >= it[i].k, "ordre des coups d'envoi");
  assert.ok(it.every((x) => (x.r === "win" || x.r === "loss") && x.c > 1));
  assert.ok(d.combines.every((c) => ["win", "loss", "verif", "void"].includes(c.r)));
});

test("pages : bandeau sur l'accueil et la page match des 6 versions, hauteur de 44 px reservee, script differe", () => {
  const ROOT = path.join(__dirname, "..");
  for (const v of ["", "fr/", "en/", "es/", "gb/", "mx/", "za/"]) for (const p of ["index.html", "match.html"]) {
    const html = fs.readFileSync(path.join(ROOT, v + p), "utf8");
    assert.match(html, /<style>#bandeauPreuves\{box-sizing:border-box;height:44px;overflow:hidden\}<\/style><div id="bandeauPreuves"/, v + p + " : place reservee (pas de saut de page)");
    assert.match(html, /<script src="\/lib\/bandeau-preuves\.js" defer><\/script>/, v + p + " : script differe");
  }
});

// Controle historique-public du 27/10/2026 : une jambe sur un AUTRE marche que le pari simple publie se regle par le
// score final de l'archive (une regle par marche) ; seuls le buteur, les mi-temps et les codes « F… » restent en
// verification. Une regle = un test.
test("reglerParScore : une regle par marche, sur le score final (90 minutes)", () => {
  const R = B.reglerParScore;
  const cas = [
    // resultat et double chance
    ["home-win", [3, 1], "win"], ["home-win", [1, 1], "loss"], ["draw", [2, 2], "win"], ["draw", [2, 1], "loss"],
    ["away-win", [0, 3], "win"], ["away-win", [1, 0], "loss"],
    ["dc-1x", [1, 1], "win"], ["dc-1x", [1, 2], "loss"], ["dc-x2", [1, 1], "win"], ["dc-x2", [4, 0], "loss"],
    ["dc-12", [3, 1], "win"], ["dc-12", [0, 0], "loss"],
    // rembourse si nul
    ["home-dnb", [1, 1], "void"], ["home-dnb", [2, 0], "win"], ["dnb-away", [2, 0], "loss"],
    // buts du match
    ["over-15", [1, 1], "win"], ["over-15", [1, 0], "loss"], ["under-35", [2, 2], "loss"], ["under-35", [2, 1], "win"],
    ["under-45", [4, 0], "win"], ["under-45", [3, 2], "loss"], ["over-25", [2, 1], "win"], ["under-25", [2, 1], "loss"], ["over-2_5", [2, 1], "win"],
    // buts d'une equipe
    ["home-team-over-05", [1, 2], "win"], ["home-team-over-05", [0, 2], "loss"], ["away-team-over-05", [4, 0], "loss"], ["away-team-over-05", [0, 3], "win"],
    ["home-team-under-25", [0, 1], "win"], ["home-team-under-25", [5, 1], "loss"], ["away-team-under-15", [3, 1], "win"],
    // les deux equipes marquent
    ["btts-yes", [1, 2], "win"], ["btts-yes", [4, 0], "loss"], ["btts-no", [4, 0], "win"], ["btts-no", [1, 1], "loss"],
    // victoire et buts du match
    ["home-win-over-25", [4, 3], "win"], ["home-win-over-25", [2, 0], "loss"], ["home-win-over-25", [2, 3], "loss"], ["away-win-under-35", [0, 2], "win"],
    ["draw-under-25", [1, 1], "win"], ["draw-under-25", [2, 2], "loss"],
    // clean sheet, victoire sans encaisser
    ["home-clean-sheet", [0, 0], "win"], ["home-clean-sheet", [1, 1], "loss"], ["away-win-to-nil", [0, 2], "win"], ["away-win-to-nil", [1, 2], "loss"],
  ];
  for (const [m, sc, att] of cas) assert.equal(R(m, sc), att, m + " " + sc.join("-"));
  // Non reglables par le score final : en verification (jamais devine).
  for (const m of ["fh-over-05", "sh-under-15", "anytime-scorer-21393", "total-shots-over-235", "F29:No", "over-2", "over-3", "inconnu"]) assert.equal(R(m, [1, 2]), null, m);
  assert.equal(R("over-25", null), null, "score illisible");
  assert.deepEqual(B.lireScore("4-0"), [4, 0]);
  assert.equal(B.lireScore("4:0"), null);
});

test("tickets reels du 19 et du 20/10 : regles par le score final (x5 gagnes, x10 perdus, buteur en verification)", () => {
  const j = (f, m, k) => ({ fixture_id: f, market_id: m, coup_envoi_ms: k });
  const tickets = [
    { jour: "2026-10-19", type: "x10", meta: { cote_totale: 8.57 }, contenu: { jambes: [j(1494299, "home-team-over-05", 1792429200000), j(1550153, "away-team-over-05", 1792427400000), j(1550154, "away-team-over-05", 1792435500000), j(1557436, "dc-12", 1792436400000), j(1569971, "dc-1x", 1792434600000), j(1570417, "dc-x2", 1792436400000), j(1575458, "fh-over-05", 1792437300000)] } },
    { jour: "2026-10-19", type: "x5", meta: { cote_totale: 4 }, contenu: { jambes: [j(1550154, "away-team-over-05", 1792435500000), j(1557436, "home-win", 1792436400000), j(1569971, "dc-1x", 1792434600000), j(1570417, "dc-x2", 1792436400000)] } },
    { jour: "2026-10-20", type: "or", contenu: { paris: [j(1635702, "home-win-over-25", 1792522800000), j(1635719, "anytime-scorer-21393", 1792514700000)] } },
    { jour: "2026-10-20", type: "x10", meta: { cote_totale: 39.83 }, contenu: { jambes: [j(1635661, "under-35", 1792514700000), j(1635688, "home-win-over-25", 1792522800000), j(1635693, "home-team-under-25", 1792522800000), j(1635702, "under-35", 1792522800000), j(1635617, "under-45", 1792522800000)] } },
    { jour: "2026-10-20", type: "x5", meta: { cote_totale: 3.65 }, contenu: { jambes: [j(1635719, "btts-yes", 1792514700000), j(1563150, "over-15", 1792521900000), j(1635655, "home-team-under-25", 1792522800000)] } },
  ];
  const a = (f, m, r, p, k, s) => ({ fixture_id: f, market: m, result: r, published_at: p, kickoff_at: k, score: s });
  const P1 = "2026-10-17T05:54:28Z", P2 = "2026-10-18T05:47:15Z";
  // Archive (predictions_archive, lecture du 27/10/2026) : le pari simple publie de chaque match et son score final.
  const jambes = [a(1494299, "dc-1x", "loss", P1, "2026-10-19T17:00:00Z", "1-2"), a(1550153, "dc-x2", "loss", P1, "2026-10-19T16:30:00Z", "4-0"),
    a(1550154, "over-15", "win", P1, "2026-10-19T18:45:00Z", "0-3"), a(1557436, "home-win", "win", P1, "2026-10-19T19:00:00Z", "3-1"),
    a(1563150, "F29:No", "win", P2, "2026-10-20T18:45:00Z", "1-1"), a(1569971, "dc-1x", "win", P2, "2026-10-19T18:30:00Z", "1-1"),
    a(1570417, "dc-x2", "win", P1, "2026-10-19T19:00:00Z", "1-1"), a(1575458, "fh-over-05", "win", P1, "2026-10-19T19:15:00Z", "1-2"),
    a(1635617, "home-win", "win", P2, "2026-10-20T19:00:00Z", "4-0"), a(1635655, "over-25", "loss", P2, "2026-10-20T19:00:00Z", "0-1"),
    a(1635661, "over-25", "win", P2, "2026-10-20T16:45:00Z", "2-2"), a(1635688, "home-win", "win", P2, "2026-10-20T19:00:00Z", "4-3"),
    a(1635693, "home-win", "win", "2026-10-20T05:37:19Z", "2026-10-20T19:00:00Z", "5-1"), a(1635702, "home-win", "win", P2, "2026-10-20T19:00:00Z", "4-2"),
    a(1635719, "over-25", "win", P2, "2026-10-20T16:45:00Z", "1-2")];
  const b = B.construireBandeau({ simples: [], tickets, jambes, matchs: [], maintenant: Date.parse("2026-10-26T12:00:00Z") });
  assert.deepEqual(b.combines.map((c) => c.j + " " + c.t + ":" + c.r).sort(), ["2026-10-19 x10:loss", "2026-10-19 x5:win", "2026-10-20 x10:loss", "2026-10-20 x5:win"]);
  // Selection en or du 20/10 : le PSG gagne et plus de 2,5 buts (4-2) gagne ; le buteur reste en verification.
  assert.deepEqual(b.or.map((o) => [o.j, o.g, o.p, o.a, o.v]), [["2026-10-20", 1, 0, 0, 1]]);
  // Le calcul quotidien lit le score des matchs des tickets.
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update-data.yml"), "utf8");
  assert.match(wf, /predictions_archive\?select=fixture_id,market,result,published_at,kickoff_at,score&fixture_id=in\./);
});


// Chaque marche du catalogue (lib/marches-paris.js, les seuls marches publies) : regle par le score final avec le MEME
// resultat que la regle du catalogue, sur toutes les issues jusqu'a 3 buts par equipe et par mi-temps ; sinon (mi-temps,
// tirs) « resultat en verification ». Buteurs et codes « F… » restent en verification.
test("catalogue : chaque marche regle par le score final comme lib/marches-paris.js, sinon en verification", () => {
  const MP = require("../lib/marches-paris.js");
  const issues = [];
  for (let h1 = 0; h1 <= 3; h1++) for (let a1 = 0; a1 <= 3; a1++) for (let h2 = 0; h2 <= 3; h2++) for (let a2 = 0; a2 <= 3; a2++) issues.push({ h1, a1, h2, a2 });
  let regles = 0, verification = 0;
  for (const def of Object.values(MP.CATALOGUE)) {
    if (def.dim === "buts" && def.ft === true) {
      for (const o of issues) {
        const sc = [o.h1 + o.h2, o.a1 + o.a2];
        assert.equal(B.reglerParScore(def.id, sc), def.test(o) ? "win" : "loss", def.id + " " + sc.join("-"));
      }
      regles++;
    } else {
      for (const sc of [[0, 0], [2, 1], [1, 3]]) assert.equal(B.reglerParScore(def.id, sc), null, def.id + " : en verification");
      verification++;
    }
  }
  assert.ok(regles >= 30 && verification >= 100, regles + " regles, " + verification + " en verification");
  for (const m of ["anytime-scorer-21393", "first-scorer-874", "F29:No", "F5:Over 2.5", "F13:Home", ""]) assert.equal(B.reglerParScore(m, [2, 1]), null, m || "vide");
  // Score illisible ou absent : jamais devine.
  for (const sc of [null, [2], [2, -1], [1.5, 0], ["2", "1"]]) assert.equal(B.reglerParScore("over-15", sc), null, JSON.stringify(sc));
});
