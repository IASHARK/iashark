"use strict";
// TICKETS DU JOUR x5 / x10, SELECTION EN OR, BUTEUR DU JOUR (demande de Clement du
// 04/10/2026 ; regles du trader de cotes, regles-tickets.md §2 et §8, tests 1 a 11).
const test = require("node:test");
const assert = require("node:assert/strict");

const { generateDailyCombos, decrireTicket } = require("../lib/run-output/combos.js");
const MATH = require("../lib/run-output/combo-math.js");
const J = require("../lib/run-output/jambes-du-jour.js");
const T = require("../lib/tickets-du-jour.js");
const REGLES = require("../config/tickets.json");
const LIGUES = require("../config/leagues.json");

const NOW = Date.parse("2026-10-04T06:00:00Z"); // 08:00 a Paris
const SNAP = "2026-10-04T06:00:00.000Z";

// Match publie du 04/10 a 18:00 (Paris) = 16:00 UTC, pari verifie, cote agreee.
function match(id, o) {
  return Object.assign({
    id: id, home: { n: "Dom" + id, id: id * 10 }, away: { n: "Ext" + id, id: id * 10 + 1 },
    date: "2026-10-04 18:00", league: "Ligue 1", league_key: "ligue1", league_id: 61,
    pari_rec: "Victoire Domicile", market_id: "home-win", no_signal: false,
    cote_rec: "1.55", cote_source: "anj", cote_bookmaker: "Winamax", chance_iashark: 64,
    pronostic: { market_id: "home-win", publie: true, fiabilite: "vérifiée", libelle_fr: "Victoire Dom" + id },
  }, o || {});
}
function fixture(ts, statut) { return { fixture: { timestamp: Math.floor(ts / 1000), status: { short: statut || "NS" } } }; }
function monde(matchs, statuts) {
  const fixtureById = {};
  matchs.forEach((m) => {
    const [d, h] = m.date.split(" ");
    // Heure de Paris (UTC+2 en octobre) -> UTC.
    const ts = Date.parse(d + "T" + h + ":00+02:00");
    fixtureById[String(m.id)] = fixture(ts, statuts && statuts[m.id]);
  });
  return { matchs, fixtureById };
}
function jambesDe(matchs, opts) {
  const w = monde(matchs, opts && opts.statuts);
  return J.jambesDuJour(w.matchs, Object.assign({ nowMs: NOW, fixtureById: w.fixtureById, configLigues: LIGUES }, opts || {}));
}
function leg(id, cote, chance, o) {
  return Object.assign({ fixture_id: id, cote: cote, chance: chance, coup_envoi: "2026-10-04 18:00", ligue_key: "ligue1", operateur: "Winamax", market_id: "home-win" }, o || {});
}

// ------------------------------------------------------------ 1. fourchette lue dans la config
test("1. fourchette lue dans la config passee (bornes du 04/10 : 1,39 et 1,71 refusees, 1,40 et 1,70 acceptees)", () => {
  // Bornes de la fourchette (marge_sans_agree, 04/10/2026, ne concerne que les cotes non agreees,
  // jamais retenues dans un ticket).
  const LIGUES_0410 = JSON.parse(JSON.stringify(LIGUES)); LIGUES_0410.fiabilite.fourchette_pari = { cote_min: 1.4, cote_max: 1.7, marge_sans_agree: 0.02 };
  assert.deepEqual([LIGUES.fiabilite.fourchette_pari.cote_min, LIGUES.fiabilite.fourchette_pari.cote_max], [1.4, 2.2], "depot : 1,40-2,20 (06/10)");
  const r = jambesDe([match(1, { cote_rec: "1.39" }), match(2, { cote_rec: "1.40" }), match(3, { cote_rec: "1.70" }), match(4, { cote_rec: "1.71" })], { configLigues: LIGUES_0410 });
  assert.deepEqual(r.jambes.map((j) => j.fixture_id), [2, 3]);
  assert.equal(r.exclus.hors_fourchette, 2);
  // Une autre fourchette dans la config passee : appliquee (jamais recopiee en dur).
  const cfg = JSON.parse(JSON.stringify(LIGUES)); cfg.fiabilite.fourchette_pari = { cote_min: 1.5, cote_max: 1.6 };
  assert.deepEqual(jambesDe([match(2, { cote_rec: "1.40" }), match(5, { cote_rec: "1.55" })], { configLigues: cfg }).jambes.map((j) => j.fixture_id), [5]);
  const src = require("node:fs").readFileSync(require.resolve("../lib/run-output/jambes-du-jour.js"), "utf8");
  assert.doesNotMatch(src, /1\.4\b|1\.7\b|1,40|1,70/, "aucune borne de cote ecrite en dur");
});

// ------------------------------------------------------------ 2. exclusions
test("2. jambe exclue : sans pari, no_signal, en test, chance illisible, cote non agreee, coup d'envoi, statut, autre jour", () => {
  const ms = [
    match(1),
    match(2, { pari_rec: "" }),
    match(3, { no_signal: true }),
    match(4, { pronostic: { market_id: "home-win", publie: true, fiabilite: "en test" } }),
    match(5, { chance_iashark: null }),
    match(6, { cote_source: "indicative", cote_bookmaker: null }),
    match(7, { cote_bookmaker: "Pinnacle" }),
    match(8, { cote_bookmaker: "bet365" }),
    match(9, { date: "2026-10-04 08:10" }), // 10 min apres le calcul : imminent
    match(10, { date: "2026-10-04 07:30" }), // deja commence
    match(11), // reporte (PST)
    match(12), // annule (CANC)
    match(13, { date: "2026-10-05 00:30" }), // lendemain a Paris
    match(14, { pronostic: { market_id: "away-win", publie: true, fiabilite: "vérifiée" } }), // pronostic d'un autre marche
    match(15, { pronostic: { market_id: "home-win", publie: false, fiabilite: "vérifiée" } }),
  ];
  const r = jambesDe(ms, { statuts: { 11: "PST", 12: "CANC" } });
  assert.deepEqual(r.jambes.map((j) => j.fixture_id), [1]);
  assert.equal(r.exclus.sans_pari_publie, 4);
  assert.equal(r.exclus.en_test, 1);
  assert.equal(r.exclus.chance_illisible, 1);
  assert.equal(r.exclus.cote_non_agreee, 3);
  assert.equal(r.exclus.coup_envoi, 4);
  // Match a 00:30 le lendemain : il sera dans les tickets du lendemain (calcul a 00:05 a Paris le 05).
  assert.deepEqual(J.jambesDuJour(ms, { nowMs: Date.parse("2026-10-04T22:05:00Z"), fixtureById: monde(ms).fixtureById, configLigues: LIGUES }).jambes.map((j) => j.fixture_id), [13]);
  // Changement d'heure (25/10/2026) : 23:30 UTC le 25 = 00:30 a Paris le 26 (UTC+1).
  assert.equal(J.jourParis(Date.parse("2026-10-25T23:30:00Z")), "2026-10-26");
  assert.equal(J.jourParis(Date.parse("2026-10-25T22:30:00Z")), "2026-10-25");
});

test("2b. categorie NO-GO du mathematicien : exclue (ligue, famille ou les deux)", () => {
  const ms = [match(1), match(2, { league_key: "argentina_liga_profesional" }), match(3, { market_id: "dc-1x", pronostic: { market_id: "dc-1x", publie: true, fiabilite: "vérifiée" } })];
  assert.deepEqual(jambesDe(ms, { categoriesNoGo: [{ ligue: "argentina_liga_profesional" }] }).jambes.map((j) => j.fixture_id), [1, 3]);
  assert.deepEqual(jambesDe(ms, { categoriesNoGo: [{ famille: "DC" }] }).jambes.map((j) => j.fixture_id), [1, 2]);
  assert.deepEqual(jambesDe(ms, { categoriesNoGo: [{ ligue: "ligue1", famille: "DC" }] }).jambes.map((j) => j.fixture_id), [1, 2], "ligue ET famille");
  assert.deepEqual(jambesDe(ms, { categoriesNoGo: [{ ligue: "seriea", famille: "DC" }] }).jambes.map((j) => j.fixture_id), [1, 2, 3]);
  assert.deepEqual(jambesDe(ms, { categoriesNoGo: [{}] }).jambes.map((j) => j.fixture_id), [1, 2, 3], "une entree vide ne bloque rien");
});

test("2c. la jambe porte exactement ce qu'affiche la page (pari, cote, operateur, chance)", () => {
  const r = jambesDe([match(1, { chance_correction: { calculee: 66, points: -2 } })]);
  assert.deepEqual(r.jambes[0], {
    fixture_id: 1, domicile: "Dom1", exterieur: "Ext1", ligue: "Ligue 1", ligue_key: "ligue1", ligue_id: 61,
    coup_envoi: "2026-10-04 18:00", coup_envoi_ms: Date.parse("2026-10-04T16:00:00Z"),
    pari: "Victoire Dom1", market_id: "home-win", famille: "1N2", cote: 1.55, operateur: "Winamax", chance: 64, chance_calculee: 66,
  });
});

// ------------------------------------------------------------ 3. optimalite (force brute ecrite a part)
function prng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function bruteForce(legs, R) {
  const n = legs.length;
  let best = null;
  const sizes = R.jambes;
  const comb = (k, start, acc) => {
    if (acc.length === k) {
      let P = 1n, Q = 1n;
      acc.forEach((i) => { P *= BigInt(Math.round(legs[i].cote * 100)); Q *= BigInt(legs[i].chance); });
      const div = 10n ** BigInt(2 * (k - 1));
      const arr = Number((2n * P + div) / (2n * div));
      if (arr < Math.round(R.cote_min * 100) || arr > Math.round(R.cote_max * 100)) return;
      const ids = acc.map((i) => legs[i].fixture_id).sort((a, b) => a - b);
      const cand = { ids, k, Q, arr, ecart: Math.abs(arr - R.centre * 100) };
      if (!best) { best = cand; return; }
      // Comparaison exacte des chances : Q1 / 100^k1 vs Q2 / 100^k2.
      const l = cand.Q * 100n ** BigInt(best.k), r = best.Q * 100n ** BigInt(cand.k);
      if (l !== r) { if (l > r) best = cand; return; }
      if (cand.k !== best.k) { if (cand.k < best.k) best = cand; return; }
      if (cand.ecart !== best.ecart) { if (cand.ecart < best.ecart) best = cand; return; }
      for (let i = 0; i < cand.ids.length; i++) if (cand.ids[i] !== best.ids[i]) { if (cand.ids[i] < best.ids[i]) best = cand; return; }
      return;
    }
    for (let i = start; i < n; i++) comb(k, i + 1, acc.concat([i]));
  };
  sizes.forEach((k) => comb(k, 0, []));
  return best;
}

test("3. optimalite : 200 tirages de 8 a 14 jambes, le resultat = la recherche par force brute", () => {
  const rnd = prng(20261004);
  for (let t = 0; t < 200; t++) {
    const n = 8 + Math.floor(rnd() * 7);
    const legs = [];
    for (let i = 0; i < n; i++) legs.push(leg(1000 + Math.floor(rnd() * 9000) * 10 + i, Math.round((1.4 + rnd() * 0.3) * 100) / 100, 52 + Math.floor(rnd() * 22)));
    const r = generateDailyCombos({ jambes: legs, snapshotTime: SNAP });
    for (const type of ["x5", "x10"]) {
      const c = r.combos.find((x) => x.type === type);
      const b = bruteForce(legs, REGLES[type]);
      if (!b) { assert.equal(c.status, "NO_QUALIFYING_COMBINATION", "tirage " + t + " " + type); continue; }
      assert.equal(c.status, "GENERATED", "tirage " + t + " " + type);
      assert.deepEqual(c.jambes.map((j) => j.fixture_id), b.ids, "tirage " + t + " " + type);
      assert.equal(Math.round(c.cote_totale * 100), b.arr, "tirage " + t + " " + type);
    }
  }
});

test("3 bis. recherche exacte (controle du mathematicien du 04/10/2026) : egalites de cotes et de chances = force brute ; plus aucun plafond de 40 jambes", () => {
  // Beaucoup d'egalites (4 cotes, 3 chances possibles) : le choix par jeux de cotes = la force brute.
  const rnd = prng(41004);
  for (let t = 0; t < 150; t++) {
    const n = 8 + Math.floor(rnd() * 9);
    const legs = [];
    for (let i = 0; i < n; i++) legs.push(leg(2000 + Math.floor(rnd() * 500) * 10 + i, [1.4, 1.5, 1.65, 1.7][Math.floor(rnd() * 4)], [55, 60, 65][Math.floor(rnd() * 3)]));
    const r = generateDailyCombos({ jambes: legs, snapshotTime: SNAP });
    for (const type of ["x5", "x10"]) {
      const c = r.combos.find((x) => x.type === type);
      const b = bruteForce(legs, REGLES[type]);
      if (!b) { assert.equal(c.status, "NO_QUALIFYING_COMBINATION", "egalites " + t + " " + type); continue; }
      assert.deepEqual(c.jambes.map((j) => j.fixture_id), b.ids, "egalites " + t + " " + type);
    }
  }
  // 44 jambes tres probables a 1,40 et UNE a 1,70 (la moins probable, 45e) : le seul ticket x5 possible
  // (1,40^3 x 1,70 = 4,66) a besoin d'elle. L'ancien plafond de 40 jambes ne publiait aucun ticket.
  const jour = [];
  for (let i = 0; i < 44; i++) jour.push(leg(3000 + i, 1.4, 70));
  jour.push(leg(3999, 1.7, 50));
  const x5 = generateDailyCombos({ jambes: jour, snapshotTime: SNAP }).combos[0];
  assert.equal(x5.status, "GENERATED");
  assert.deepEqual(x5.jambes.map((j) => j.fixture_id), [3000, 3001, 3002, 3999]);
  assert.equal(x5.cote_totale, 4.66);
  assert.equal(REGLES.jambes_max, undefined, "plus de plafond dans config/tickets.json");
  // Journee tres chargee (120 jambes, 31 cotes) : resultat en moins d'une seconde.
  const charge = [];
  for (let i = 0; i < 120; i++) charge.push(leg(5000 + i, Math.round((1.4 + (i % 31) * 0.01) * 100) / 100, 52 + ((i * 7) % 20)));
  const t0 = Date.now();
  const rc = generateDailyCombos({ jambes: charge, snapshotTime: SNAP });
  assert.ok(Date.now() - t0 < 1000, "recherche trop lente : " + (Date.now() - t0) + " ms");
  assert.deepEqual(rc.combos.map((c) => c.status), ["GENERATED", "GENERATED"]);
});

// ------------------------------------------------------------ 4. determinisme et departage
test("4. departage deterministe : entree melangee -> meme ticket ; egalite : moins de jambes, centre, numeros", () => {
  const legs = [leg(11, 1.55, 60), leg(12, 1.6, 62), leg(13, 1.45, 64), leg(14, 1.5, 58), leg(15, 1.7, 61), leg(16, 1.42, 59), leg(17, 1.65, 63), leg(18, 1.48, 57)];
  const a = generateDailyCombos({ jambes: legs, snapshotTime: SNAP });
  const b = generateDailyCombos({ jambes: legs.slice().reverse(), snapshotTime: SNAP });
  const c = generateDailyCombos({ jambes: [legs[3], legs[0], legs[6], legs[2], legs[7], legs[5], legs[1], legs[4]], snapshotTime: SNAP });
  assert.deepEqual(a, b); assert.deepEqual(a, c);
  // Regle du 06/10/2026 (petit combine : 4 ou 5 jambes, cote totale 4,00-6,00).
  // Egalite de chance entre 4 jambes (60 x 60 x 60 x 60 = 12,96 %) et 5 jambes (90 x 80 x 60 x 60 x 50 = 12,96 %) :
  // moins de jambes gagne.
  const eg = [leg(1, 1.45, 60), leg(2, 1.45, 60), leg(3, 1.45, 60), leg(4, 1.45, 60), leg(5, 1.2, 90), leg(6, 1.25, 80), leg(7, 2.6, 50)];
  const x5 = generateDailyCombos({ jambes: eg, snapshotTime: SNAP }).combos[0];
  assert.equal(x5.status, "GENERATED");
  assert.ok(x5.nb_matchs === 4 || x5.chance_exacte > 0.1296, "a chance egale, moins de jambes");
  // Egalite de chance et de nombre de jambes : la cote la plus proche de 5,00 gagne.
  // 1,45^3 x 1,42 = 4,33 ; 1,45^3 x 1,40 = 4,27 ; 1,45^2 x 1,42 x 1,40 = 4,18 : meme chance, 4,33 est la plus proche de 5.
  const centre = [leg(21, 1.45, 60), leg(22, 1.45, 60), leg(23, 1.45, 60), leg(24, 1.42, 60), leg(25, 1.4, 60)];
  const t = generateDailyCombos({ jambes: centre, snapshotTime: SNAP }).combos[0];
  assert.deepEqual(t.jambes.map((j) => j.fixture_id), [21, 22, 23, 24]);
  // Egalite totale (memes cotes, memes chances) : la plus petite liste de numeros.
  const tot = [leg(35, 1.45, 60), leg(31, 1.45, 60), leg(33, 1.45, 60), leg(32, 1.45, 60), leg(34, 1.45, 60)];
  const u = generateDailyCombos({ jambes: tot, snapshotTime: SNAP }).combos[0];
  assert.deepEqual(u.jambes.map((j) => j.fixture_id), [31, 32, 33, 34]);
  assert.equal(u.cote_totale, 4.42);
});

// ------------------------------------------------------------ 5. bornes (apres arrondi)
test("5. bornes (06/10/2026) : 4-5 jambes et 4,00-6,00 pour le petit combine ; 7-8 et 8,50-12,00 pour le grand ; cote testee apres arrondi", () => {
  assert.deepEqual([REGLES.x5.jambes, REGLES.x5.cote_min, REGLES.x5.cote_max], [[4, 5], 4, 6]);
  assert.deepEqual([REGLES.x10.jambes, REGLES.x10.cote_min, REGLES.x10.cote_max], [[7, 8], 8.5, 12]);
  // 1,41^4 = 3,95 refuse ; 1,42^4 = 4,07 accepte ; 1,44^5 = 6,19 refuse ; 1,43^5 = 5,98 accepte.
  const quatre = (c) => [1, 2, 3, 4].map((i) => leg(i, c, 66));
  assert.equal(generateDailyCombos({ jambes: quatre(1.41), snapshotTime: SNAP }).combos[0].status, "NO_QUALIFYING_COMBINATION");
  assert.equal(generateDailyCombos({ jambes: quatre(1.42), snapshotTime: SNAP }).combos[0].cote_totale, 4.07);
  const cinq = (c) => [1, 2, 3, 4, 5].map((i) => leg(i, c, 30));
  assert.equal(generateDailyCombos({ jambes: cinq(1.44), snapshotTime: SNAP }).combos[0].nb_matchs, 4, "5 jambes a 1,44 = 6,19 : hors ; 4 jambes = 4,30");
  assert.equal(generateDailyCombos({ jambes: cinq(1.31), snapshotTime: SNAP }).combos[0].status, "NO_QUALIFYING_COMBINATION", "1,31^5 = 3,86 : sous 4,00");
  assert.equal(generateDailyCombos({ jambes: cinq(1.43), snapshotTime: SNAP }).combos[0].cote_totale, 4.18, "4 jambes (4,18) plutot que 5 (5,98) : plus grande chance");
  // Grand combine : 7 jambes a 1,36 = 8,6 ; jamais 6 ni 9 jambes.
  const sept = []; for (let i = 0; i < 9; i++) sept.push(leg(200 + i, 1.36, 75));
  const g = generateDailyCombos({ jambes: sept, snapshotTime: SNAP }).combos[1];
  assert.equal(g.status, "GENERATED"); assert.ok([7, 8].includes(g.nb_matchs)); assert.ok(g.cote_totale >= 8.5 && g.cote_totale <= 12);
});

test("5 (regle du 04/10, regles passees en parametre) : arrondi au centime aux bornes", () => {
  // 4,495 -> 4,50 accepte : 1,55 x 2,9 n'est pas dans la fourchette des jambes, on teste le calcul pur.
  assert.equal(MATH.coteTotale([{ cote: 1.55 }, { cote: 2.9 }]), 4.5);
  assert.equal(MATH.coteTotale([{ cote: 1.45 }, { cote: 1.55 }, { cote: 2 }]), 4.5); // 4,495
  // 11,005 -> 11,01 refuse : 1,1 x 1,0005 ... calcul pur sur l'arrondi.
  assert.equal(MATH.coteTotale([{ cote: 2.05 }, { cote: 5.37 }]), 11.01); // 11,0085
  // Bornes du ticket x5 de la regle du 04/10 (passees en parametre) : 3 jambes a 1,65 (4,49 -> refuse) ; 1,65 x 1,65 x 1,66 = 4,52 accepte.
  const ANCIENNE = { regle_version: "tickets-2026-10-04", x5: { jambes: [3, 4], cote_min: 4.5, cote_max: 5.5, centre: 5 }, x10: { jambes: [5, 6], cote_min: 9, cote_max: 11, centre: 10 } };
  assert.equal(generateDailyCombos({ jambes: [leg(1, 1.65, 60), leg(2, 1.65, 60), leg(3, 1.65, 60)], snapshotTime: SNAP, regles: ANCIENNE }).combos[0].status, "NO_QUALIFYING_COMBINATION");
  const ok = generateDailyCombos({ jambes: [leg(1, 1.65, 60), leg(2, 1.65, 60), leg(3, 1.66, 60)], snapshotTime: SNAP, regles: ANCIENNE }).combos[0];
  assert.equal(ok.status, "GENERATED"); assert.equal(ok.cote_totale, 4.52);
  // 4,495 exactement par les jambes : 1,45 x 1,55 x 2,00 n'est pas une jambe ; on verifie l'arrondi du moteur
  // avec 3 jambes qui donnent 4,4950 : 1,45 x 1,55 x 2 -> hors fourchette des jambes, donc via regles elargies.
  const large = { regle_version: "essai", jambes_max: 40, x5: { jambes: [3], cote_min: 4.5, cote_max: 5.5, centre: 5 }, x10: { jambes: [5, 6], cote_min: 9, cote_max: 11, centre: 10 }, selection_or: { nb: 3 } };
  assert.equal(generateDailyCombos({ jambes: [leg(1, 1.45, 60), leg(2, 1.55, 60), leg(3, 2, 60)], snapshotTime: SNAP, regles: large }).combos[0].cote_totale, 4.5);
  const r11 = { regle_version: "essai", jambes_max: 40, x5: { jambes: [2], cote_min: 9, cote_max: 11, centre: 10 }, x10: { jambes: [2], cote_min: 9, cote_max: 11, centre: 10 } };
  assert.equal(generateDailyCombos({ jambes: [leg(1, 2.05, 60), leg(2, 5.37, 60)], snapshotTime: SNAP, regles: r11 }).combos[0].status, "NO_QUALIFYING_COMBINATION", "11,0085 -> 11,01 refuse");
  assert.equal(generateDailyCombos({ jambes: [leg(1, 2.2, 60), leg(2, 5, 60)], snapshotTime: SNAP, regles: r11 }).combos[0].cote_totale, 11, "11,00 accepte");
  // Nombre de jambes : x10 jamais 4 ni 7.
  const many = []; for (let i = 0; i < 12; i++) many.push(leg(100 + i, Math.round((1.4 + (i % 7) * 0.05) * 100) / 100, 60 + (i % 5)));
  const r = generateDailyCombos({ jambes: many, snapshotTime: SNAP, regles: ANCIENNE });
  assert.ok([3, 4].includes(r.combos[0].nb_matchs)); assert.ok([5, 6].includes(r.combos[1].nb_matchs));
  assert.ok(r.combos[0].cote_totale >= 4.5 && r.combos[0].cote_totale <= 5.5);
  assert.ok(r.combos[1].cote_totale >= 9 && r.combos[1].cote_totale <= 11);
});

// ------------------------------------------------------------ 6. jamais force
test("6. impossible -> NO_QUALIFYING_COMBINATION, jamais un ticket hors regles", () => {
  const r = generateDailyCombos({ jambes: [leg(1, 1.4, 70), leg(2, 1.4, 70)], snapshotTime: SNAP });
  assert.deepEqual(r.combos.map((c) => [c.combo_id, c.status]), [["TICKET_X5", "NO_QUALIFYING_COMBINATION"], ["TICKET_X10", "NO_QUALIFYING_COMBINATION"]]);
  assert.ok(r.combos.every((c) => c.jambes === undefined));
  assert.equal(generateDailyCombos({ jambes: [], snapshotTime: SNAP }).combos[1].status, "NO_QUALIFYING_COMBINATION");
  assert.throws(() => generateDailyCombos({ jambes: [] }), /snapshotTime/);
});

// ------------------------------------------------------------ 7. chance et cote
test("7. chance = produit des chances affichees, vers le bas, au moins 1 ; cote = produit arrondi au centime", () => {
  assert.deepEqual(MATH.chanceTicket([{ chance: 66 }, { chance: 64 }, { chance: 65 }, { chance: 63 }]), { chance: 17, chance_exacte: 0.173 });
  assert.equal(MATH.chanceTicket([{ chance: 10 }, { chance: 10 }, { chance: 10 }]).chance, 1, "0,1 % -> au moins 1 %");
  assert.equal(MATH.chanceTicket([{ chance: 99 }, { chance: 99 }]).chance, 98, "98,01 -> 98");
  assert.equal(MATH.chanceTicket([{ chance: 64.5 }]), null, "chance non entiere refusee");
  assert.equal(MATH.coteTotale([{ cote: "1,55" }, { cote: 1.62 }, { cote: 1.44 }, { cote: 1.3 }]), 4.7);
  const t = decrireTicket("x5", [leg(1, 1.55, 66), leg(2, 1.62, 64), leg(3, 1.44, 65), leg(4, 1.3, 63)]);
  assert.equal(t.chance, 17); assert.equal(t.cote_totale, 4.7);
});

// ------------------------------------------------------------ 8. matchs differents
test("8. matchs tous differents, aucun doublon de jambe", () => {
  const legs = [leg(1, 1.55, 60), leg(1, 1.7, 70), leg(2, 1.65, 62), leg(3, 1.7, 61), leg(4, 1.65, 63)];
  const r = generateDailyCombos({ jambes: legs, snapshotTime: SNAP });
  r.combos.filter((c) => c.status === "GENERATED").forEach((c) => {
    const ids = c.jambes.map((j) => j.fixture_id);
    assert.equal(new Set(ids).size, ids.length);
  });
  // 06/10/2026 : plusieurs marches candidats sur un meme match ; un combine en garde au plus UN.
  const x5 = r.combos[0];
  if (x5.status === "GENERATED") assert.ok(x5.jambes.filter((j) => j.fixture_id === 1).length <= 1);
  const plusieurs = [leg(1, 1.3, 80, { market_id: "dc-1x" }), leg(1, 1.42, 66), leg(2, 1.42, 66), leg(3, 1.42, 66), leg(4, 1.42, 66), leg(5, 1.42, 66)];
  const p = generateDailyCombos({ jambes: plusieurs, snapshotTime: SNAP }).combos[0];
  assert.equal(p.status, "GENERATED");
  assert.equal(new Set(p.jambes.map((j) => j.fixture_id)).size, p.jambes.length);
});

// ------------------------------------------------------------ 9. Selection en or
test("9. Selection en or : exactement 3, ordre et departage ; 2 eligibles -> aucune", () => {
  const legs = [leg(5, 1.5, 64, { coup_envoi: "2026-10-04 20:00" }), leg(4, 1.5, 70), leg(3, 1.5, 64, { chance_calculee: 66, coup_envoi: "2026-10-04 21:00" }), leg(2, 1.5, 64, { coup_envoi: "2026-10-04 15:00" }), leg(1, 1.5, 60)];
  const or = J.selectionEnOr(legs);
  assert.deepEqual(or.map((p) => [p.rang, p.fixture_id]), [[1, 4], [2, 3], [3, 2]]);
  assert.equal(J.selectionEnOr(legs.slice(0, 2)), null);
  assert.equal(J.selectionEnOr([]), null);
});

// ------------------------------------------------------------ 10. buteur du jour
test("10. buteur du jour : v3_buteurs, chanceButeur (45 au plus, rien sous 10), departage, aucun -> null", () => {
  const ms = [
    match(1, { v3_buteurs: [{ joueur_id: 9, joueur: "A", cote: "home", poste: "A", p_marque: 0.41, chance: 40 }, { joueur_id: 8, joueur: "B", cote: "away", p_marque: 0.62, chance: 45 }] }),
    match(2, { date: "2026-10-04 15:00", v3_buteurs: [{ joueur_id: 7, joueur: "C", cote: "home", p_marque: 0.62, chance: 45 }] }),
    match(3, { date: "2026-10-04 07:00", v3_buteurs: [{ joueur_id: 6, joueur: "D", cote: "home", p_marque: 0.9, chance: 45 }] }), // commence
    match(4, { date: "2026-10-05 15:00", v3_buteurs: [{ joueur_id: 5, joueur: "E", cote: "home", p_marque: 0.95 }] }), // demain
  ];
  const w = monde(ms);
  const b = J.buteurDuJour(ms, { nowMs: NOW, fixtureById: w.fixtureById });
  assert.equal(b.joueur, "C", "egalite de p_marque : coup d'envoi le plus tot");
  assert.equal(b.chance, 45, "plafond 45 %");
  assert.equal(b.equipe, "Dom2"); assert.equal(b.adversaire, "Ext2"); assert.equal(b.fixture_id, 2);
  const faible = [match(1, { v3_buteurs: [{ joueur_id: 1, joueur: "F", cote: "home", p_marque: 0.09 }] })];
  assert.equal(J.buteurDuJour(faible, { nowMs: NOW, fixtureById: monde(faible).fixtureById }), null, "rien sous 10 %");
  const sansV3 = [match(1, { top_scorers: [{ name: "X" }] })];
  assert.equal(J.buteurDuJour(sansV3, { nowMs: NOW, fixtureById: monde(sansV3).fixtureById }), null, "ancien calcul jamais utilise");
  assert.equal(J.buteurDuJour(ms, { nowMs: NOW, fixtureById: w.fixtureById, categoriesNoGo: [{ ligue: "ligue1" }] }), null, "ligue NO-GO");
});

// ------------------------------------------------------------ 11. report apres publication
test("11. match reporte apres publication : etat reporte, ticket inchange, « sans ce match » correct", () => {
  const legs = [leg(1, 1.55, 66), leg(2, 1.62, 64), leg(3, 1.44, 65), leg(4, 1.3, 63)];
  const t = decrireTicket("x5", legs);
  const contenu = { jambes: t.jambes };
  const etats = T.etatsDe("x5", contenu, { fixtureById: { 2: fixture(NOW + 3600e3, "PST"), 3: fixture(NOW + 3600e3, "CANC"), 1: fixture(NOW, "NS") } });
  assert.deepEqual(etats.jambes, { 1: "a_venir", 2: "reporte", 3: "annule", 4: "a_venir" });
  assert.deepEqual(etats.sans_matchs_reportes, { nb_matchs: 2, cote_totale: 2.02, chance: 41 });
  assert.equal(t.cote_totale, 4.7, "le ticket lui-meme ne change pas");
  assert.deepEqual(T.etatsDe("x5", contenu, { fixtureById: {} }), {}, "tout a venir : rien a ecrire");
  // Regle de Clement du 04/10/2026, 20 h : un buteur seulement sorti des titulaires probables du moteur (aucune
  // composition officielle, aucune absence annoncee) n'est plus marque « retire » : il reste affiche.
  const m = match(7, { v3_buteurs: [{ joueur_id: 2, joueur: "Autre", cote: "home", p_marque: 0.3 }] });
  const fx7 = { 7: fixture(NOW + 3600e3, "NS") };
  assert.deepEqual(T.etatsDe("buteur", { fixture_id: 7, joueur_id: 1, joueur: "Parti", cote: "home" }, { fixtureById: fx7, matchParId: { 7: m } }), {});
  assert.deepEqual(T.etatsDe("buteur", { fixture_id: 7, joueur_id: 2, joueur: "Autre", cote: "home" }, { fixtureById: fx7, matchParId: { 7: m } }), {});
  // Composition officielle publiee sans lui, ou absence annoncee pour ce match : retire ; la trace des remplacements reste.
  const onze = (debut) => Array.from({ length: 11 }, (_, i) => ({ id: debut + i, name: "Titulaire " + String.fromCharCode(65 + i) + "x" }));
  const compo = match(7, { lineups: { home: { startXI: onze(100) }, away: { startXI: onze(200) } } });
  const trace = [{ motif: "absent_composition", ancien: { joueur: "Avant" } }];
  assert.deepEqual(T.etatsDe("buteur", { fixture_id: 7, joueur_id: 1, joueur: "Parti", cote: "home" }, { fixtureById: fx7, matchParId: { 7: compo }, etatsActuels: { remplacements: trace } }), { joueur: "retire", remplacements: trace });
  const blesse = match(7, { injuries: [{ name: "Parti Joueur", player_id: 1, team: 70, type: "Missing Fixture" }] });
  assert.deepEqual(T.etatsDe("buteur", { fixture_id: 7, joueur_id: 1, joueur: "Parti Joueur", cote: "home" }, { fixtureById: fx7, matchParId: { 7: blesse } }), { joueur: "retire" });
  const incertain = match(7, { injuries: [{ name: "Parti Joueur", player_id: 1, team: 70, type: "Questionable" }] });
  assert.deepEqual(T.etatsDe("buteur", { fixture_id: 7, joueur_id: 1, joueur: "Parti Joueur", cote: "home" }, { fixtureById: fx7, matchParId: { 7: incertain } }), {}, "incertain : reste");
});

test("calcul complet du jour (regle du 06/10) : x5, x10, Selection en or et buteur a partir des candidats de chaque match", () => {
  const ms = [];
  const candidatsPar = {};
  // Grille des scores du moteur v3 (Poisson 1,8 / 0,9) : sert a la coherence entre le pari affiche et les selections.
  const pois = (l, k) => { let p = Math.exp(-l); for (let x = 1; x <= k; x++) p *= l / x; return p; };
  const grille = [];
  for (let h = 0; h <= 6; h++) for (let a = 0; a <= 6; a++) grille.push({ cle: "SCORE:" + h + "-" + a, probabilite: Math.round(pois(1.8, h) * pois(0.9, a) * 10000) / 100 });
  for (let i = 1; i <= 10; i++) {
    ms.push(match(i, { cote_rec: "1.55", chance_iashark: 62, v3_marches: grille }));
    // Jambe sure impliquee par le pari affiche (« Dom gagne » -> « Dom ou nul ») ; pari « valeur » qui va dans le meme
    // sens que lui (« plus de 2,5 buts » : plus probable quand Dom gagne, d'apres la grille).
    candidatsPar[String(i)] = [
      { market_id: "dc-1x", famille: "DC", cote: 1.25 + (i % 5) * 0.03, cote_anj: true, bookmaker: "Winamax", chance: 78, chance_affichee: 78 - (i % 3), fiabilite: "vérifiée", p_modele: 80, q: 78 },
      { market_id: "over-25", famille: "OU2.5", cote: 1.8 + i * 0.02, cote_anj: false, bookmaker: null, chance: 52, chance_affichee: 52, fiabilite: "vérifiée", p_modele: 52 + i, q: 52 },
      // Contraire du pari affiche (« Ext ou nul ») : jamais retenu.
      { market_id: "dc-x2", famille: "DC", cote: 1.3, cote_anj: true, bookmaker: "Winamax", chance: 75, chance_affichee: 75, fiabilite: "vérifiée", p_modele: 90, q: 75 },
    ];
  }
  ms[0].v3_buteurs = [{ joueur_id: 3, joueur: "Z", cote: "away", p_marque: 0.33 }];
  const w = monde(ms);
  const c = T.calculerDuJour(w.matchs, { jour: "2026-10-04", nowMs: NOW, fixtureById: w.fixtureById, configLigues: LIGUES, candidatsPar });
  assert.ok(c.x5 && c.x10 && c.or && c.buteur);
  assert.deepEqual(Object.keys(c.x5.meta).sort(), ["cote_totale", "nb_matchs"]);
  assert.deepEqual(Object.keys(c.or.meta), ["nb_paris"]);
  assert.deepEqual(c.buteur.meta, {});
  // Selection en or : les 3 plus grands ecarts (modele - cote sans marge), jamais l'ecart publie.
  assert.deepEqual(c.or.contenu.paris.map((p) => p.fixture_id), [10, 9, 8]);
  assert.ok(c.or.contenu.paris.every((p) => !("ecart" in p) && p.market_id === "over-25" && p.cote >= 1.7 && p.cote <= 2.5 && p.operateur === null && p.chance === 52));
  assert.equal(c.exclus.incoherent_pari_affiche, 10, "« Ext ou nul » contredit « Dom gagne » : jamais une jambe");
  // Combines : jambes sures (1,20-1,45), une par match.
  [c.x5, c.x10].forEach((t) => {
    assert.ok(t.contenu.jambes.every((j) => j.market_id === "dc-1x" && j.cote >= 1.2 && j.cote <= 1.45));
    assert.equal(new Set(t.contenu.jambes.map((j) => j.fixture_id)).size, t.contenu.jambes.length);
  });
  assert.ok([4, 5].includes(c.x5.contenu.nb_matchs)); assert.ok([7, 8].includes(c.x10.contenu.nb_matchs));
  assert.equal(c.buteur.contenu.chance, 30);
  assert.equal(T.premierCoupEnvoi("x5", c.x5.contenu), "2026-10-04T16:00:00.000Z");
});

test("verdict du mathematicien (04/10) : pas de coupe, de tournoi ni de coupe d'Europe ; pas de double chance d'Argentine", () => {
  const V = require("../config/verdicts-maths.json");
  const dc = { market_id: "dc-1x", pronostic: { market_id: "dc-1x", publie: true, fiabilite: "vérifiée" } };
  const ms = [match(1), match(2, { league_key: "coupe_de_france" }), match(3, { league_key: "ldc" }), match(4, { league_key: "libertadores" }),
    match(5, { league_key: "nations_league" }), match(6, Object.assign({ league_key: "argentina_liga_profesional" }, dc)), match(7, { league_key: "argentina_liga_profesional" })];
  const r = jambesDe(ms, { categoriesNoGo: V.categories_no_go, competitions: V.competitions_jambes });
  assert.deepEqual(r.jambes.map((j) => j.fixture_id), [1, 5, 7]);
  assert.equal(r.exclus.competition_non_mesuree, 3);
  assert.equal(r.exclus.categorie_no_go, 1);
  // Valeurs du depot (lues par defaut) : memes exclusions de competitions.
  assert.deepEqual(jambesDe(ms).jambes.map((j) => j.fixture_id), [1, 5, 6, 7]);
  const w = monde(ms);
  const c = T.calculerDuJour(ms, { jour: "2026-10-04", nowMs: NOW, fixtureById: w.fixtureById, configLigues: LIGUES, categoriesNoGo: V.categories_no_go, competitions: V.competitions_jambes });
  assert.ok(!c.or || c.or.contenu.paris.every((p) => [1, 5, 7].includes(p.fixture_id)));
  // Aucun facteur de dependance : chance = produit exact des chances affichees.
  assert.equal(require("node:fs").readFileSync(require.resolve("../lib/run-output/combo-math.js"), "utf8").includes("0.985"), false);
});
