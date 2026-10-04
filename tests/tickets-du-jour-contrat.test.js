"use strict";
// CONTRAT DE LA FONCTION tickets-du-jour (regles-tickets.md §5, tests 14 a 18) : ce que chaque
// niveau recoit, construit par liste blanche ; jour du serveur ; regle Pro = match-data.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const charger = () => import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/tickets-contrat.mjs")).href);

const JAMBE = (id, o) => Object.assign({ fixture_id: id, domicile: "Lens" + id, exterieur: "Lille" + id, ligue: "Ligue 1", ligue_key: "ligue1", ligue_id: 61,
  coup_envoi: "2026-10-04 15:00", coup_envoi_ms: 1, pari: "Victoire Lens" + id, market_id: "home-win", famille: "1N2", cote: 1.55,
  operateur: "Winamax", chance: 64, chance_calculee: 66 }, o || {});
const LIGNES = [
  { type: "x5", meta: { nb_matchs: 4, cote_totale: 4.62 }, publie_a: "2026-10-04T04:12:09Z", etats: {},
    contenu: { nb_matchs: 4, cote_totale: 4.62, chance: 17, chance_exacte: 0.1731, operateur_unique: "Winamax", paires_meme_ligue_meme_heure: 1, jambes: [JAMBE(1), JAMBE(2), JAMBE(3), JAMBE(4)] } },
  { type: "x10", meta: { nb_matchs: 6, cote_totale: 10.18 }, publie_a: "2026-10-04T04:12:09Z", etats: { jambes: { 15: "reporte" }, sans_matchs_reportes: { nb_matchs: 5, cote_totale: 6.57, chance: 12 } },
    contenu: { nb_matchs: 6, cote_totale: 10.18, chance: 8, chance_exacte: 0.0812, operateur_unique: null, jambes: [JAMBE(11), JAMBE(12), JAMBE(13), JAMBE(14), JAMBE(15), JAMBE(16)] } },
  { type: "or", meta: { nb_paris: 3 }, publie_a: "2026-10-04T04:12:09Z", etats: {},
    contenu: { paris: [Object.assign({ rang: 1 }, JAMBE(21, { chance: 71 })), Object.assign({ rang: 2 }, JAMBE(22)), Object.assign({ rang: 3 }, JAMBE(23))] } },
  { type: "buteur", meta: {}, publie_a: "2026-10-04T04:12:09Z", etats: {},
    contenu: { joueur: "Buteur Secret", joueur_id: 123, poste: "Attaquant", cote: "home", equipe: "Lens", adversaire: "Lille", domicile: "Lens", exterieur: "Lille",
      fixture_id: 1234567, ligue: "Ligue 1", ligue_key: "ligue1", coup_envoi: "2026-10-04 21:00", coup_envoi_ms: 1, chance: 35, p_marque: 0.3712 } },
];
const SECRETES = ["jambes", "paris", "pari", "market_id", "cote", "operateur", "chance", "joueur", "joueur_id", "fixture_id", "ligue", "coup_envoi", "equipe", "adversaire"];
function clesProfondes(v, out) {
  out = out || new Set();
  if (Array.isArray(v)) v.forEach((x) => clesProfondes(x, out));
  else if (v && typeof v === "object") Object.keys(v).forEach((k) => { out.add(k); clesProfondes(v[k], out); });
  return out;
}
const INTERNES = ["chance_exacte", "paires_meme_ligue_meme_heure", "p_marque", "chance_calculee", "coup_envoi_ms", "ligue_key", "ligue_id", "famille", "regle_version", "resultat", "pipeline_sha"];

test("14. sans compte : type, statut, nombre de matchs et cote totale ; aucune cle revelatrice a aucune profondeur", async () => {
  const C = await charger();
  const r = C.construireReponse({ jour: "2026-10-04", niveau: "anonyme", lignes: LIGNES, calcul: null });
  assert.deepEqual(r, {
    version: 1, jour: "2026-10-04", niveau: "anonyme",
    tickets: [
      { type: "x5", statut: "publie", verrou: "compte", nb_matchs: 4, cote_totale: 4.62 },
      { type: "x10", statut: "publie", verrou: "compte", nb_matchs: 6, cote_totale: 10.18 },
    ],
    selection_or: { statut: "publie", verrou: "compte", nb_paris: 3 },
    buteur_du_jour: { statut: "publie", verrou: "compte" },
  });
  const cles = clesProfondes(r);
  SECRETES.concat(INTERNES).forEach((k) => assert.ok(!cles.has(k), "cle " + k));
  assert.doesNotMatch(JSON.stringify(r), /Lens|Lille|Winamax|Buteur Secret|1234567|home-win/);
});

test("15. compte gratuit : x5 et buteur complets ; x10 et Selection en or sans aucune cle revelatrice", async () => {
  const C = await charger();
  const r = C.construireReponse({ jour: "2026-10-04", niveau: "gratuit", lignes: LIGNES, calcul: null });
  const x5 = r.tickets[0];
  assert.equal(x5.verrou, null); assert.equal(x5.chance, 17); assert.equal(x5.operateur_unique, "Winamax");
  assert.equal(x5.jambes.length, 4);
  assert.deepEqual(Object.keys(x5.jambes[0]).sort(), ["chance", "cote", "coup_envoi", "domicile", "etat", "exterieur", "fixture_id", "ligue", "market_id", "operateur", "pari"]);
  assert.equal(x5.sans_matchs_reportes, null);
  assert.equal(x5.publie_a, "2026-10-04T04:12:09Z");
  assert.deepEqual(r.tickets[1], { type: "x10", statut: "publie", verrou: "pro", nb_matchs: 6, cote_totale: 10.18 });
  assert.deepEqual(r.selection_or, { statut: "publie", verrou: "pro", nb_paris: 3 });
  assert.deepEqual(Object.keys(r.buteur_du_jour).sort(), ["adversaire", "chance", "coup_envoi", "equipe", "etat", "fixture_id", "joueur", "joueur_id", "ligue", "poste", "publie_a", "statut", "verrou"]);
  assert.equal(r.buteur_du_jour.chance, 35);
  const json = JSON.stringify([r.tickets[1], r.selection_or]);
  assert.doesNotMatch(json, /Lens|Lille|Winamax|home-win|"chance"/);
  INTERNES.forEach((k) => assert.ok(!clesProfondes(r).has(k), "cle interne " + k));
});

test("16. Pro : tout complet (x10 avec « sans ce match », Selection en or classee) ; famille et admin = Pro ; plan illisible = gratuit", async () => {
  const C = await charger();
  const r = C.construireReponse({ jour: "2026-10-04", niveau: "pro", lignes: LIGNES, calcul: null });
  const x10 = r.tickets[1];
  assert.equal(x10.verrou, null); assert.equal(x10.jambes.length, 6); assert.equal(x10.operateur_unique, null);
  assert.equal(x10.jambes.find((j) => j.fixture_id === 15).etat, "reporte");
  assert.deepEqual(x10.sans_matchs_reportes, { nb_matchs: 5, cote_totale: 6.57, chance: 12 });
  assert.deepEqual(r.selection_or.paris.map((p) => [p.rang, p.fixture_id, p.chance]), [[1, 21, 71], [2, 22, 64], [3, 23, 64]]);
  INTERNES.forEach((k) => assert.ok(!clesProfondes(r).has(k), "cle interne " + k));
  assert.equal(C.niveauDe(null), "anonyme");
  assert.equal(C.niveauDe({ utilisateur: false }), "anonyme");
  assert.equal(C.niveauDe({ utilisateur: true, ligne: { plan: "free" } }), "gratuit");
  assert.equal(C.niveauDe({ utilisateur: true, ligne: null }), "gratuit");
  assert.equal(C.niveauDe({ utilisateur: true, ligne: { plan: "pro" } }), "pro");
  assert.equal(C.niveauDe({ utilisateur: true, ligne: { plan: "famille" } }), "pro");
  assert.equal(C.niveauDe({ utilisateur: true, ligne: { plan: "free", role: "admin" } }), "pro");
  assert.equal(C.niveauDe({ utilisateur: true, erreurPlan: true, ligne: { plan: "pro" } }), "gratuit", "plan illisible : jamais Pro par defaut");
  assert.equal(C.cacheDe("anonyme"), "public, max-age=300");
  assert.equal(C.cacheDe("gratuit"), "private, no-store");
  assert.equal(C.cacheDe("pro"), "private, no-store");
});

test("statuts : aucun, en preparation, indisponible ; jamais d'erreur crue", async () => {
  const C = await charger();
  const r1 = C.construireReponse({ jour: "2026-10-04", niveau: "pro", lignes: [], calcul: null });
  assert.deepEqual(r1.tickets.map((t) => t.statut), ["en_preparation", "en_preparation"]);
  assert.equal(r1.buteur_du_jour.statut, "en_preparation");
  const r2 = C.construireReponse({ jour: "2026-10-04", niveau: "pro", lignes: [], calcul: { statuts: { x5: "aucun", x10: "non_go", or: "indisponible", buteur: "aucun" } } });
  assert.deepEqual([r2.tickets[0].statut, r2.tickets[1].statut, r2.selection_or.statut, r2.buteur_du_jour.statut], ["aucun", "indisponible", "indisponible", "aucun"]);
  assert.equal(r2.tickets[0].nb_matchs, undefined);
  const r3 = C.construireReponse({ jour: "2026-10-04", niveau: "anonyme", lignes: LIGNES, calcul: null, lectureOk: false });
  assert.ok(r3.tickets.every((t) => t.statut === "indisponible" && t.nb_matchs === undefined));
  const r4 = C.construireReponse({ jour: "2026-10-04", niveau: "inconnu", lignes: LIGNES, calcul: null });
  assert.equal(r4.niveau, "anonyme", "niveau inconnu : le plus ferme");
});

test("17. le jour vient du serveur (heure de Paris) ; la fonction ignore tout jour envoye par le client", async () => {
  const C = await charger();
  assert.equal(C.jourParis(Date.parse("2026-10-04T21:59:00Z")), "2026-10-04");
  assert.equal(C.jourParis(Date.parse("2026-10-04T22:01:00Z")), "2026-10-05");
  assert.equal(C.jourParis(Date.parse("2026-10-25T23:30:00Z")), "2026-10-26");
  const fn = read("supabase/functions/tickets-du-jour/index.ts");
  assert.match(fn, /const jour = jourParis\(Date\.now\(\)\);/);
  assert.doesNotMatch(fn, /req\.json\(|searchParams|new URL\(req\.url\)/, "aucun parametre du client n'est lu");
  assert.match(fn, /\.eq\("jour", jour\)/);
  assert.match(fn, /"Vary": "Authorization"/);
  assert.match(fn, /"Cache-Control": cacheDe\(niveau\)/);
  assert.match(fn, /construireReponse\(\{ jour, niveau, lignes, calcul, lectureOk \}\)/);
  assert.doesNotMatch(fn, /niveau\s*=\s*"pro"|isPro\s*=\s*true/, "aucun contournement");
});

test("18. regle Pro identique a match-data (copie litterale) ; champs Pro seulement identiques a lib/premium-fields.js", async () => {
  const md = read("supabase/functions/match-data/index.ts");
  const regleMd = /isPro = (row\?\.plan === "pro" \|\| row\?\.plan === "famille" \|\| row\?\.role === "admin");/.exec(md);
  assert.ok(regleMd, "regle Pro de match-data introuvable");
  const contrat = read("supabase/functions/_shared/tickets-contrat.mjs");
  assert.ok(contrat.includes("return " + regleMd[1] + ";"), "la regle Pro de tickets-du-jour doit etre la copie litterale de match-data");
  const PREMIUM = require("../lib/premium-fields.js");
  const bloc = /const CHAMPS_PRO_SEULEMENT = \[([^\]]*)\];/.exec(md);
  assert.deepEqual([...bloc[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]), PREMIUM.PRO_ONLY_FIELDS);
  for (const k of ["marches_panneau", "v3_marches", "marches_flux"]) assert.ok(PREMIUM.PRO_ONLY_FIELDS.includes(k), k + " : Pro seulement, meme sur le match offert");
});
