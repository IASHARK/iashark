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
  assert.deepEqual(Object.keys(p).sort(), ["a", "c", "f", "h", "j", "m", "p", "r"]);
  const PF = require("../lib/premium-fields.js");
  assert.deepEqual(PF.deepPremiumLeaks(f), []);
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
  const garde = bloc.indexOf("if(Array.isArray(ticketsM)&&Array.isArray(archiveM)){");
  const ecriture = bloc.indexOf("fs.writeFileSync('preuves/montantes.json'");
  assert.ok(garde > 0 && ecriture > garde, "ecriture seulement apres lectures reussies");
  assert.equal(bloc.split("fs.writeFileSync('preuves/montantes.json'").length - 1, 1);
  (bloc.match(/console\.log\([^;]*\);/g) || []).forEach((l) => assert.doesNotMatch(l, /\.pari\b|\.cote\b|\.p\b|\.h\b/, l));
});
