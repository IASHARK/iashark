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
    { jour: "2026-10-24", type: "x5", meta: { cote_totale: 3.9 }, contenu: { jambes: [jambe(11), jambe(14)] } },                // autre marche : en verification
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
