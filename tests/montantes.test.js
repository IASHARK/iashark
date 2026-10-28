"use strict";
// LES 3 MONTANTES de la page Combines (lib/montantes.js, 28/10/2026) : regle, reglement partage avec la bande des
// resultats, fichier public sans le jour en cours, et branchement dans le calcul quotidien.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("../lib/montantes.js");
const BP = require("../lib/bandeau-preuves.js");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// Fabrique : une Selection en or du jour j, publiee a 6 h, premier match a 18 h (UTC), paris [fixture, marche, cote].
function or(j, paris, extra) {
  return Object.assign({ jour: j, type: "or", publie_a: j + "T06:00:00Z", premier_coup_envoi: j + "T18:00:00Z",
    contenu: { paris: paris.map((p, i) => ({ rang: i + 1, fixture_id: p[0], market_id: p[1], cote: p[2], pari: "Pari " + p[0], domicile: "Dom " + p[0], exterieur: "Ext " + p[0],
      coup_envoi: j + " 19:00", coup_envoi_ms: Date.parse(j + "T18:00:00Z") })) } }, extra || {});
}
// Archive : meme marche, publie avant le coup d'envoi.
function ar(f, marche, result, score, j) {
  return { fixture_id: f, market: marche, result: result, score: score, published_at: (j || "2026-10-10") + "T06:00:00Z", kickoff_at: (j || "2026-10-10") + "T18:00:00Z" };
}
const MAINTENANT = Date.parse("2026-11-20T06:00:00Z");
function calc(tickets, archive, jour, maintenant) {
  return M.construireMontantes({ tickets, archive, matchs: [], jour: jour || "2026-11-20", maintenant: maintenant || MAINTENANT, genereLe: "2026-11-20T06:00:00Z" });
}

test("produit des cotes : au centime, moitie vers le haut, entiers exacts", () => {
  assert.equal(M.produitCotes([1.4, 1.4]), 1.96);
  assert.equal(M.produitCotes([1.46, 1.4, 1.4, 1.4, 1.4]), 5.61); // 5,60896
  assert.equal(M.produitCotes([1.44, 1.4, 1.4, 1.41, 1.4]), 5.57); // 5,5720...
  assert.equal(M.produitCotes([1.05, 1.05]), 1.1); // 1,1025 -> 1,10
  assert.equal(M.produitCotes([1.5, 1.01]), 1.52); // 1,515 -> 1,52 (moitie vers le haut)
  assert.equal(M.produitCotes([]), null);
  assert.equal(M.produitCotes([1.4, "x"]), null);
});

test("chaque pari or nourrit sa montante : gagne = palier suivant, perdu = retour au palier 1", () => {
  const t = [
    or("2026-11-01", [[1, "over-25", 1.4], [2, "over-25", 1.5], [3, "dc-1x", 1.45]]),
    or("2026-11-02", [[4, "over-25", 1.4], [5, "btts-yes", 1.6], [6, "home-win", 1.42]]),
  ];
  const a = [ar(1, "over-25", "win", "2-1"), ar(2, "over-25", "loss", "1-0"), ar(3, "dc-1x", "win", "1-1"),
    ar(4, "over-25", "win", "3-0"), ar(5, "btts-yes", "win", "1-1"), ar(6, "home-win", "loss", "0-1")];
  const f = calc(t, a);
  const [m1, m2, m3] = f.montantes;
  assert.equal(m1.gagnes, 2); assert.equal(m1.cote, 1.96); assert.equal(m1.etat, "en_cours");
  assert.equal(m2.gagnes, 1); assert.equal(m2.cote, 1.6); assert.equal(m2.dernier.t, "perdu"); assert.equal(m2.dernier.j, "2026-11-01");
  assert.equal(m3.gagnes, 0); assert.equal(m3.cote, null); assert.equal(m3.dernier.t, "perdu"); assert.equal(m3.dernier.n, 1, "1 palier gagne avant la defaite");
  assert.equal(f.jour, "2026-11-20"); assert.equal(f.objectif, 10); assert.equal(f.debut, M.DEBUT);
});

test("objectif cote 10 : annonce, puis la montante repart au palier 1", () => {
  const jours = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];
  const t = jours.map((j, i) => or(j, [[100 + i, "over-25", 1.4]]));
  const a = jours.map((j, i) => ar(100 + i, "over-25", "win", "3-1"));
  const m1 = calc(t, a).montantes[0];
  // 1,4^7 = 10,54 : objectif au 7e palier (07/11), puis 1 palier le 08/11.
  assert.deepEqual(m1.objectifs, [{ j: "2026-11-07", n: 7, c: 10.54 }]);
  assert.equal(m1.dernier.t, "objectif");
  assert.equal(m1.gagnes, 1); assert.equal(m1.cote, 1.4);
});

test("annule : ne compte pas et ne casse rien ; jour sans pari de ce rang : rien ne bouge", () => {
  const t = [
    or("2026-11-01", [[1, "over-25", 1.4], [2, "over-25", 1.5]]),
    or("2026-11-02", [[3, "over-25", 1.4]]),
  ];
  const a = [ar(1, "over-25", "win", "2-1"), ar(2, "over-25", "win", "2-1"), ar(3, "over-25", "void", null)];
  const f = calc(t, a);
  assert.equal(f.montantes[0].gagnes, 1); assert.equal(f.montantes[0].paliers.length, 2); assert.equal(f.montantes[0].paliers[1].r, "annule");
  assert.equal(f.montantes[1].gagnes, 1, "pas de pari 2 le 02/11 : la montante 2 garde son palier");
  assert.equal(f.montantes[2].gagnes, 0);
});

test("pas encore regle : en attente, la suite n'est pas jouee ; sans resultat 72 h apres : non regle, jamais gagne", () => {
  const t = [
    or("2026-11-17", [[1, "over-25", 1.4]]),
    or("2026-11-18", [[2, "anytime-scorer-99", 1.7]]), // buteur : ni l'archive ni le score ne le reglent
    or("2026-11-19", [[3, "over-25", 1.4]]),           // pas encore regle
  ];
  const a = [ar(1, "over-25", "win", "2-1"), ar(2, "over-25", "win", "2-1"), ar(3, "over-25", "scheduled", null)];
  // Le 20/11 a 6 h : le buteur du 18/11 a moins de 72 h -> en attente des le 18/11.
  let m = calc(t, a).montantes[0];
  assert.equal(m.etat, "en_attente"); assert.deepEqual(m.attente, { j: "2026-11-18" }); assert.equal(m.gagnes, 1);
  // Le 22/11 : buteur non regle (plus de 72 h apres la fin du match) -> la montante repart ; le 19/11 attend encore.
  m = calc(t, a, "2026-11-22", Date.parse("2026-11-22T06:00:00Z")).montantes[0];
  assert.equal(m.dernier.t, "non_regle"); assert.equal(m.dernier.j, "2026-11-18"); assert.equal(m.dernier.n, 1);
  assert.equal(m.gagnes, 0); assert.equal(m.etat, "en_attente"); assert.deepEqual(m.attente, { j: "2026-11-19" });
});

test("seulement les Selections en or publiees AVANT leur premier coup d'envoi, depuis DEBUT, jamais le jour du calcul", () => {
  const t = [
    or("2026-10-01", [[1, "over-25", 1.4]]), // avant DEBUT
    or("2026-11-01", [[2, "over-25", 1.4]], { publie_a: "2026-11-01T19:00:00Z" }), // publiee apres le premier match
    or("2026-11-02", [[3, "over-25", 1.4]]),
    or("2026-11-20", [[4, "over-25", 1.4]]), // jour du calcul : le pari du soir n'entre jamais dans le fichier
  ];
  const a = [ar(1, "over-25", "win", "3-0"), ar(2, "over-25", "win", "3-0"), ar(3, "over-25", "win", "3-0"), ar(4, "over-25", "win", "3-0")];
  const m = calc(t, a).montantes[0];
  assert.deepEqual(m.paliers.map((p) => p.f), [3]);
  assert.ok(!JSON.stringify(calc(t, a)).includes('"f":4'), "rien du jour en cours");
});

test("reglement : la MEME regle que la bande des resultats (creerRegleur), meme marche sinon score final", () => {
  const regler = BP.creerRegleur([ar(1, "home-win", "win", "4-2"), ar(2, "over-25", "win", "1-0")], []);
  assert.equal(regler(1, "home-win-over-25"), "win", "autre marche : score final 4-2");
  assert.equal(regler(2, "over-25"), "win", "meme marche publie avant : son resultat");
  assert.equal(regler(1, "fh-over-05"), null, "mi-temps : le score final ne suffit pas");
  assert.equal(regler(9, "over-25"), null, "match absent de l'archive : en verification");
  const src = read("lib/montantes.js");
  assert.match(src, /BP\.creerRegleur\(o\.archive, o\.matchs\)/);
  assert.doesNotMatch(src, /function reglerParScore/, "aucune regle de marche reecrite");
});

test("lecture par la page : si ca passe ce soir seulement avec un fichier du jour et une montante qui n'attend rien", () => {
  const t = [or("2026-11-18", [[1, "over-25", 1.4], [2, "over-25", 1.5]]), or("2026-11-19", [[3, "over-25", 1.45], [4, "over-25", 1.4]])];
  const a = [ar(1, "over-25", "win", "3-0"), ar(2, "over-25", "win", "3-0"), ar(3, "over-25", "win", "3-0"), ar(4, "over-25", "scheduled", null)];
  const f = calc(t, a);
  const s = M.soir(f, "2026-11-20");
  assert.equal(s.length, 3);
  assert.equal(s[0].palier, 3); assert.equal(s[0].cote, 2.03); assert.equal(s[0].pret, true);
  assert.equal(M.siCaPasse(s[0], 1.4), 2.84); // 1,4 x 1,45 x 1,4 = 2,842
  assert.equal(s[1].pret, false, "montante 2 en attente du 19/11"); assert.equal(M.siCaPasse(s[1], 1.4), null);
  assert.equal(M.siCaPasse(M.soir(f, "2026-11-21")[0], 1.4), null, "fichier d'hier : aucun chiffre du soir");
  assert.equal(M.siCaPasse(s[0], null), null);
  assert.deepEqual(M.soir(null, "2026-11-20"), []);
  assert.equal(M.avancement(10), 1); assert.equal(M.avancement(null), 0); assert.ok(Math.abs(M.avancement(1.4 * 1.4) - 2 * Math.log(1.4) / Math.log(10)) < 1e-9);
});

test("fichier public : aucune mise, aucun gain, aucun montant ; cles courtes, jamais la forme d'un match", () => {
  const f = calc([or("2026-11-02", [[3, "over-25", 1.4]])], [ar(3, "over-25", "win", "3-0")]);
  const s = JSON.stringify(f);
  assert.doesNotMatch(s, /mise|gain|stake|profit|unite|capital|€|\$/i);
  const p = f.montantes[0].paliers[0];
  assert.deepEqual(Object.keys(p).sort(), ["a", "c", "cc", "f", "h", "j", "m", "p", "r"]);
  const PF = require("../lib/premium-fields.js");
  assert.deepEqual(PF.deepPremiumLeaks(f), []);
});

// ---------------------------------------------------------------- faits API-Sports et historique complet
// (controle historique-public du 28/10/2026 : perdus visibles, buteurs regles par les buts du match)
function fx(statut, gh, ga, ht, events, players) {
  return { fixture: { id: 1, status: { short: statut } }, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: gh, away: ga },
    score: { fulltime: { home: gh, away: ga }, halftime: { home: ht[0], away: ht[1] } }, events: events, players: players };
}
// But : joueur, minute, equipe qui en profite (1 = domicile, 2 = exterieur), detail.
const but = (id, elapsed, eq, detail) => ({ type: "Goal", detail: detail || "Normal Goal", time: { elapsed: elapsed }, player: { id: id }, team: { id: eq } });
const joueurs = (l) => [{ players: l.map((x) => ({ player: { id: x[0] }, statistics: [{ games: { minutes: x[1] } }] })) }];

test("faits du match : buts de joueur en temps reglementaire, sans contre son camp ni penalty manque ; minutes jouees", () => {
  // 2-1 a 90 minutes (contre son camp de 8 pour l'exterieur), puis prolongation.
  const f = M.faitsDuMatch(fx("AET", 2, 1, [1, 1], [but(7, 20, 1), but(8, 55, 2, "Own Goal"), but(9, 60, 1, "Missed Penalty"), but(7, 90, 1), but(10, 105, 2)], joueurs([[7, 120], [8, 90], [11, null]])));
  assert.deepEqual(f.buts, { 7: 2 });
  assert.deepEqual(f.score, [2, 1], "score reglementaire (lib/resolvers.js)");
  assert.deepEqual(f.mt, [1, 1]);
  assert.deepEqual(f.joue, { 7: true, 8: true, 11: false });
  assert.equal(M.faitsDuMatch(null), null);
});

test("buteur : buts controles contre le score (VAR), sinon aucun verdict (lib/film-du-match.js#controlerMatch)", () => {
  const annule = { type: "Var", detail: "Goal cancelled", time: { elapsed: 31 }, player: { id: 5 }, team: { id: 1 } };
  const propre = M.faitsDuMatch(fx("FT", 0, 0, [0, 0], [but(5, 30, 1), annule], joueurs([[5, 90]])));
  assert.deepEqual(propre.buts, {}, "but annule par la VAR retire");
  assert.equal(M.reglerParFaits("anytime-scorer-5", propre), "loss");
  const incoherent = M.faitsDuMatch(fx("FT", 0, 0, [0, 0], [but(5, 30, 1)], joueurs([[5, 90]])));
  assert.equal(incoherent.buts, null, "evenements qui ne redonnent pas le score : pas de buts par joueur");
  assert.equal(M.reglerParFaits("anytime-scorer-5", incoherent), null);
  assert.equal(M.reglerParFaits("under-25", incoherent), "win", "le score reglementaire, lui, reste lisible");
});

test("buteur : gagne s'il marque, perdu s'il a joue sans marquer, annule s'il n'a pas joue, rien sans donnees", () => {
  const f = M.faitsDuMatch(fx("FT", 1, 2, [0, 1], [but(99, 10, 1), but(21393, 30, 2), but(21393, 70, 2)], joueurs([[21393, 90], [5, 90], [6, 0]])));
  assert.equal(M.reglerParFaits("anytime-scorer-21393", f), "win");
  assert.equal(M.reglerParFaits("anytime-scorer-5", f), "loss");
  assert.equal(M.reglerParFaits("anytime-scorer-6", f), "void");
  assert.equal(M.reglerParFaits("anytime-scorer-5", Object.assign({}, f, { joue: null })), null, "sans les joueurs : pas de verdict");
  assert.equal(M.reglerParFaits("anytime-scorer-5", Object.assign({}, f, { statut: "2H" })), null, "match pas fini");
  assert.equal(M.reglerParFaits("over-25", Object.assign({}, f, { statut: "PST" })), "void");
  assert.equal(M.reglerParFaits("over-25", f), "win");
  assert.equal(M.reglerParFaits("fh-over-05", f), "win", "mi-temps : score a la pause");
  assert.equal(M.reglerParFaits("fh-over-05", Object.assign({}, f, { mt: [0, 0] })), "loss");
});

test("non regle : DEFINITIF une fois pose, jamais d'objectif retroactif ; archive et faits lus les plus recents d'abord", () => {
  const jours = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];
  const t = jours.map((j, i) => or(j, [[400 + i, i === 0 ? "anytime-scorer-9" : "over-25", 1.4]]));
  const gagnes = jours.map((j, i) => ar(400 + i, "over-25", "win", "3-1"));
  // Passage du 08/11 : le buteur du 01/11 n'a aucune donnee depuis plus de 72 h -> non regle.
  const avant = M.construireMontantes({ tickets: t, archive: gagnes.slice(1), matchs: [], jour: "2026-11-08", maintenant: Date.parse("2026-11-08T06:00:00Z") });
  assert.equal(avant.montantes[0].historique[0].r, "non_regle");
  assert.equal(avant.montantes[0].gagnes, 6); assert.equal(avant.montantes[0].objectifs.length, 0);
  // Le resultat reapparait ensuite (archive, faits) : le non regle reste, aucun objectif retroactif (1,4^7 = 10,54).
  const archiveTard = gagnes.concat([ar(400, "anytime-scorer-9", "win", "1-0")]);
  const faitsTard = { 400: M.faitsDuMatch(fx("FT", 1, 0, [1, 0], [but(9, 10, 1)], joueurs([[9, 90]]))) };
  const o = { tickets: t, archive: archiveTard, matchs: [], jour: "2026-11-09", maintenant: Date.parse("2026-11-09T06:00:00Z"), precedent: avant, faits: faitsTard };
  const apres = M.construireMontantes(o);
  assert.equal(apres.montantes[0].historique[0].r, "non_regle");
  assert.equal(apres.montantes[0].objectifs.length, 0);
  assert.equal(apres.montantes[0].bilan.non_regles, 1);
  assert.ok(!M.aRegler(o).includes(400), "plus jamais relu");
  assert.ok(!M.aLireArchive(o).includes(400), "plus dans l'adresse de l'archive");
  // Les plus recents d'abord ; rien de deja fige dans l'adresse de l'archive.
  assert.deepEqual(M.aLireArchive({ tickets: t, precedent: null, jour: "2026-11-09" }), [406, 405, 404, 403, 402, 401, 400]);
  assert.deepEqual(M.aLireArchive({ tickets: t, precedent: avant, jour: "2026-11-09" }), []);
  assert.deepEqual(M.aRegler({ tickets: t, archive: [], matchs: [], jour: "2026-11-09", maintenant: Date.parse("2026-11-09T06:00:00Z") }).slice(0, 3), [406, 405, 404]);
});

test("historique complet : gagnes, perdus, objectifs et cote cumulee apres chaque pari ; bilan ; precedent reutilise", () => {
  const jours = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"];
  const t = jours.map((j, i) => or(j, [[200 + i, "over-25", 1.4]]));
  const a = jours.map((j, i) => ar(200 + i, "over-25", i === 7 ? "loss" : "win", i === 7 ? "0-1" : "3-1"));
  const f = calc(t, a);
  const m = f.montantes[0];
  assert.deepEqual(m.historique.map((x) => x.r), ["gagne", "gagne", "gagne", "gagne", "gagne", "gagne", "gagne", "perdu", "gagne"]);
  assert.equal(m.historique[6].o, 1); assert.equal(m.historique[6].cc, 10.54);
  assert.equal(m.historique[1].cc, 1.96); assert.equal(m.historique[7].cc, null);
  assert.deepEqual(m.bilan, { gagnes: 8, perdus: 1, annules: 0, non_regles: 0, objectifs: 1 });
  // Un resultat deja etabli (faits API-Sports d'un passage precedent) est repris sans relire l'API.
  const t2 = [or("2026-11-01", [[300, "anytime-scorer-9", 1.7]])];
  const precedent = { version: 1, montantes: [{ historique: [{ j: "2026-11-01", f: 300, m: "anytime-scorer-9", r: "gagne" }] }] };
  const o = { tickets: t2, archive: [], matchs: [], jour: "2026-11-20", maintenant: MAINTENANT, precedent };
  assert.deepEqual(M.aRegler(o), [], "deja regle : rien a relire");
  assert.equal(M.construireMontantes(o).montantes[0].gagnes, 1);
  assert.deepEqual(M.aRegler(Object.assign({}, o, { precedent: null })), [300], "sinon : faits a lire chez API-Sports");
});

test("Selections en or reelles du 06 au 27/10 : buteur regle par ses buts, perdus visibles, objectif de la montante 2", () => {
  const D = JSON.parse(read("tests/fixtures/montantes-selections-or-octobre.json"));
  const base = { tickets: D.tickets, archive: D.archive, matchs: [], jour: "2026-10-28", maintenant: Date.parse("2026-10-28T06:30:00Z") };
  // Sans les faits du match 1635719 : le pari buteur du 20/10 (Guirassy) n'est pas regle ; les 3 matchs du 27/10 non plus.
  assert.deepEqual(M.aRegler(base).sort(), [1550174, 1635719, 1638559, 1638565]);
  // Faits : Guirassy (21393) a marque deux fois le 20/10 (Sabah 1-2 Dortmund, controle historique-public du 28/10) ;
  // 27/10 : Gladbach 2-0 (plus de 2,5 perdu) ; les deux autres scores sont des scores d'ESSAI donnant les issues
  // relevees par historique-public (plus de 2,5 gagne a Grossaspach, nul ou Lazio gagne a Sassuolo).
  const faits = {
    1635719: M.faitsDuMatch(fx("FT", 1, 2, [0, 1], [but(888, 12, 1), but(21393, 34, 2), but(21393, 77, 2)], joueurs([[21393, 90]]))),
    1638559: M.faitsDuMatch(fx("FT", 2, 0, [1, 0], [], [])),
    1638565: M.faitsDuMatch(fx("FT", 0, 3, [0, 1], [], [])),
    1550174: M.faitsDuMatch(fx("FT", 1, 1, [0, 0], [], [])),
  };
  const avant27 = M.construireMontantes(Object.assign({}, base, { faits: { 1635719: faits[1635719] } }));
  const m2 = avant27.montantes[1];
  assert.equal(m2.etat, "en_attente"); assert.equal(m2.gagnes, 6); assert.equal(m2.cote, 9.3);
  assert.deepEqual(m2.bilan, { gagnes: 6, perdus: 1, annules: 0, non_regles: 0, objectifs: 0 });
  const f = M.construireMontantes(Object.assign({}, base, { faits }));
  const [n1, n2, n3] = f.montantes;
  assert.deepEqual(n1.bilan, { gagnes: 6, perdus: 2, annules: 0, non_regles: 0, objectifs: 1 });
  assert.deepEqual(n1.objectifs, [{ j: "2026-10-25", n: 5, c: 11.02 }]);
  assert.equal(n1.gagnes, 1); assert.equal(n1.cote, 1.4);
  assert.deepEqual(n2.objectifs, [{ j: "2026-10-27", n: 7, c: 13.03 }]);
  assert.equal(n2.gagnes, 0); assert.equal(n2.dernier.t, "objectif");
  assert.deepEqual(n2.bilan, { gagnes: 7, perdus: 1, annules: 0, non_regles: 0, objectifs: 1 });
  assert.equal(n3.gagnes, 0); assert.equal(n3.dernier.t, "perdu"); assert.equal(n3.dernier.j, "2026-10-27"); assert.equal(n3.dernier.n, 6);
  assert.deepEqual(n3.bilan, { gagnes: 6, perdus: 1, annules: 0, non_regles: 0, objectifs: 0 });
  assert.deepEqual(n3.historique.map((x) => x.j), ["2026-10-06", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"], "un jour sans Selection en or ne casse pas la serie");
});

test("calcul quotidien : montantes ecrites apres la bande, memes lectures, fichier garde si une lecture echoue", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /var MONTANTES=require\('\.\/lib\/montantes\.js'\);/);
  const debut = wf.indexOf("// LES 3 MONTANTES de la page Combines");
  const fin = wf.indexOf("::warning title=Montantes::preuves/montantes.json non ecrit", debut);
  assert.ok(debut > wf.indexOf("// BANDEAU DES VRAIS RESULTATS") && fin > debut, "bloc apres la bande");
  const bloc = wf.slice(debut, fin);
  assert.match(bloc, /tickets_du_jour\?select=jour,type,contenu,publie_a,premier_coup_envoi&type=eq\.or&jour=gte\.'\+MONTANTES\.DEBUT/);
  assert.match(bloc, /predictions_archive\?select=fixture_id,market,result,published_at,kickoff_at,score&fixture_id=in\./);
  assert.match(bloc, /MONTANTES\.aLireArchive\(\{tickets:ticketsM,precedent:precM,jour:jourM\}\)/);
  assert.match(bloc, /MONTANTES\.aRegler\(optsM\)\.slice\(0,15\)/);
  assert.match(bloc, /fixtures\?id='\+aLireM\[mi2\]/);
  assert.match(bloc, /precedent:precM/);
  const garde = bloc.indexOf("if(Array.isArray(ticketsM)&&Array.isArray(archiveM)){");
  const ecriture = bloc.indexOf("fs.writeFileSync('preuves/montantes.json'");
  assert.ok(garde > 0 && ecriture > garde, "ecriture seulement apres lectures reussies");
  assert.equal(bloc.split("fs.writeFileSync('preuves/montantes.json'").length - 1, 1);
  (bloc.match(/console\.log\([^;]*\);/g) || []).forEach((l) => assert.doesNotMatch(l, /\.pari\b|\.cote\b|\.p\b|\.h\b/, l));
});

test("empreinte de la Selection en or du jour : rang compris, avant le premier match, recalculable depuis l'historique public", () => {
  const E = require("../lib/empreintes-paris.js");
  const t = or("2026-11-02", [[3, "over-25", 1.4], [4, "dc-1x", 1.45], [5, "btts-yes", 1.5]]);
  const reg = E.vide();
  const avantMatch = Date.parse("2026-11-02T07:00:00Z");
  const a = M.ajouterEmpreinteOr(E, reg, t, "secret-essai", "2026-11-02T07:00:00Z", avantMatch);
  assert.equal(a.ajoute, true); assert.equal(a.maillon.nb_paris, 3);
  assert.equal(M.ajouterEmpreinteOr(E, reg, t, "secret-essai", null, avantMatch).raison, "inchange", "Selection en or figee : un maillon");
  assert.equal(E.verifier(reg).ok, true);
  assert.equal(M.ajouterEmpreinteOr(E, E.vide(), t, "secret-essai", null, Date.parse("2026-11-02T18:30:00Z")).raison, "premier match commence");
  assert.equal(M.ajouterEmpreinteOr(E, E.vide(), Object.assign({}, t, { publie_a: "2026-11-02T18:30:00Z" }), "secret-essai", null, avantMatch).ajoute, false);
  // Un jour a 2 paris : 2 paris empreints.
  const deux = or("2026-11-03", [[6, "over-25", 1.4], [7, "home-win", 1.5]]);
  assert.equal(M.ajouterEmpreinteOr(E, reg, deux, "secret-essai", null, Date.parse("2026-11-03T07:00:00Z")).maillon.nb_paris, 2);
  assert.equal(E.verifier(reg).ok, true);
  assert.match(M.EXPLICATION_EMPREINTES_OR, /2 ou 3 paris, avec leur rang/);
  // Sel revele : l'empreinte se refait avec les champs de l'historique public, rang = numero de la montante.
  const f = calc([t], [ar(3, "over-25", "win", "3-0"), ar(4, "dc-1x", "win", "1-0"), ar(5, "btts-yes", "loss", "1-0")]);
  const publics = f.montantes.map((m) => Object.assign({ rang: m.rang }, m.historique[0])).map((x) => ({ rang: x.rang, fixture_id: x.f, home: x.h, away: x.a, prediction: x.p, cote: x.c, market: x.m }));
  assert.equal(E.empreinteParis(publics, E.sel("secret-essai", t.jour)), a.maillon.empreinte_paris);
  // Changer le rang casse l'empreinte.
  const permute = publics.map((x, i) => Object.assign({}, x, { rang: [2, 1, 3][i] }));
  assert.notEqual(E.empreinteParis(permute, E.sel("secret-essai", t.jour)), a.maillon.empreinte_paris);
  const wf = read(".github/workflows/update-data.yml");
  const i = wf.indexOf("// EMPREINTE DE LA SELECTION EN OR DU JOUR"), j = wf.indexOf("TICKETS_DU_JOUR.publierTicketsDuJour(");
  assert.ok(i > j && j > 0, "juste apres la publication des tickets du jour");
  const bloc = wf.slice(i, wf.indexOf("::warning title=Empreintes Selection en or::'+(e&&e.message)", i));
  assert.match(bloc, /type=eq\.or&jour=eq\.'\+jourOr/, "la Selection en or du jour seulement");
  assert.match(bloc, /MONTANTES\.ajouterEmpreinteOr\(EMPREINTES,regOr,t,SECRET_OR,new Date\(\)\.toISOString\(\),Date\.now\(\)\)/);
  assert.match(bloc, /EMPREINTES\.verifier\(regOr\)/);
  assert.match(bloc, /fs\.writeFileSync\('preuves\/empreintes-or\.json'/);
  assert.match(bloc, /EMPREINTES\.revelerSels\(regOr,SECRET_OR,MATCH_RESULTS\.ajouterJours\(jourOr,-2\)\)/);
});
