"use strict";
// Item 4 (audit 2026-09-04) - architecture ClubElo point-in-time. M3
// reste BLOCKED_DATA (aucun rating historique reel collecte), mais ces
// tests prouvent que le mecanisme lui-meme n'est plus dangereux pour un
// futur backtest, sans jamais appeler le vrai reseau (fetcher injecte
// uniquement, ou absent).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadClubElo, parseClubEloCsv, getEloForTeam, cachePath, isValidDate, RAW_API_ROOT } = require("../lib/data/clubelo.js");

// Dates de test dediees, hors de toute plage reelle vraisemblable, pour ne
// jamais collisionner avec un vrai cache futur.
const TEST_DATES = ["2024-03-10", "2024-03-11", "2026-01-01", "1999-12-31"];

test.afterEach(() => {
  for (const d of TEST_DATES) {
    const dir = path.join(RAW_API_ROOT, "clubelo", d);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

const SAMPLE_CSV_2024 =
  "Rank,Club,Country,Level,Elo,From,To\n" +
  "1,Manchester City,ENG,1,2023.5,2024-03-04,2024-03-11\n" +
  "2,Real Madrid,ESP,1,1998.2,2024-03-04,2024-03-11\n";

const SAMPLE_CSV_2026 =
  "Rank,Club,Country,Level,Elo,From,To\n" +
  "1,Manchester City,ENG,1,2150.9,2026-01-01,2026-01-08\n" + // valeur volontairement TRES differente
  "2,Real Madrid,ESP,1,2100.1,2026-01-01,2026-01-08\n";

test("1) un cutoff 2024-03-10 demande bien le rating de 2024-03-10 (jamais une autre date)", async () => {
  const fetcher = async (referenceDate) => {
    assert.equal(referenceDate, "2024-03-10", "le fetcher doit recevoir EXACTEMENT la date demandee, jamais TODAY ou une autre");
    return SAMPLE_CSV_2024;
  };
  const res = await loadClubElo("2024-03-10", { fetcher });
  assert.equal(res.reference_date, "2024-03-10");
  assert.equal(res.source, "fetched");
  assert.ok(Math.abs(res.ratings["manchester city"] - 2023.5) < 1e-9);
});

test("2) un changement des donnees 2026 ne modifie AUCUNE prediction basee sur le cache 2024 (immutabilite par date)", async () => {
  const fetcher2024 = async () => SAMPLE_CSV_2024;
  const fetcher2026 = async () => SAMPLE_CSV_2026;

  const res2024Before = await loadClubElo("2024-03-10", { fetcher: fetcher2024 });
  assert.equal(res2024Before.ratings["manchester city"], 2023.5);

  // Ecrit une date COMPLETEMENT differente (2026) avec des valeurs tres
  // differentes - ne doit jamais toucher au fichier 2024-03-10 deja en cache.
  await loadClubElo("2026-01-01", { fetcher: fetcher2026 });

  const res2024After = await loadClubElo("2024-03-10", { fetcher: fetcher2024 });
  assert.equal(res2024After.ratings["manchester city"], 2023.5, "le rating 2024 ne doit pas avoir bouge apres l'ecriture du cache 2026");
  assert.deepEqual(res2024After.ratings, res2024Before.ratings, "le cache 2024 doit rester byte-identique");
});

test("3) le cache date est utilise si present - le fetcher n'est PAS rappele une seconde fois", async () => {
  let callCount = 0;
  const fetcher = async () => { callCount++; return SAMPLE_CSV_2024; };

  await loadClubElo("2024-03-11", { fetcher });
  assert.equal(callCount, 1);

  const res2 = await loadClubElo("2024-03-11", { fetcher });
  assert.equal(callCount, 1, "le fetcher ne doit pas etre rappele : le cache existant doit etre utilise");
  assert.equal(res2.source, "cache");
});

test("4) indisponibilite -> Elo null proprement (jamais une exception, jamais un objet fabrique)", async () => {
  // Cas A : pas de fetcher du tout et rien en cache.
  const resNoFetcher = await loadClubElo("1999-12-31", {});
  assert.equal(resNoFetcher.source, "unavailable");
  assert.deepEqual(resNoFetcher.ratings, {});
  assert.equal(getEloForTeam(resNoFetcher.ratings, "Manchester City"), null);

  // Cas B : fetcher fourni mais qui echoue reellement (reseau down, etc.)
  const failingFetcher = async () => { throw new Error("ETIMEDOUT"); };
  const resFailing = await loadClubElo("1999-12-31", { fetcher: failingFetcher });
  assert.equal(resFailing.source, "unavailable");
  assert.deepEqual(resFailing.ratings, {});
  assert.ok(resFailing.error);
});

test("5) JAMAIS de fallback silencieux vers TODAY pendant un backtest - referenceDate absente/invalide fait planter explicitement", async () => {
  await assert.rejects(() => loadClubElo(undefined, {}), /referenceDate obligatoire/);
  await assert.rejects(() => loadClubElo(null, {}), /referenceDate obligatoire/);
  await assert.rejects(() => loadClubElo("", {}), /referenceDate obligatoire/);
  await assert.rejects(() => loadClubElo("2024-3-10", {}), /referenceDate obligatoire/); // format non conforme (pas de zero-padding) - refuse plutot que mal interprete
  await assert.rejects(() => loadClubElo(new Date().toISOString(), {}), /referenceDate obligatoire/); // horodatage complet, pas une date simple - refuse explicitement
});

test("isValidDate: accepte YYYY-MM-DD, rejette tout le reste", () => {
  assert.equal(isValidDate("2024-03-10"), true);
  assert.equal(isValidDate("2024-3-10"), false);
  assert.equal(isValidDate(""), false);
  assert.equal(isValidDate(undefined), false);
  assert.equal(isValidDate("today"), false);
});

test("parseClubEloCsv: extrait nom/elo en minuscule, ignore les lignes malformees", () => {
  const ratings = parseClubEloCsv(SAMPLE_CSV_2024);
  assert.equal(Object.keys(ratings).length, 2);
  assert.ok(Math.abs(ratings["real madrid"] - 1998.2) < 1e-9);
});

test("cachePath: suit exactement raw_api/clubelo/YYYY-MM-DD/ratings.json", () => {
  const p = cachePath("2024-03-10");
  assert.ok(p.endsWith(path.join("raw_api", "clubelo", "2024-03-10", "ratings.json")));
});

test("getEloForTeam: null si equipe ou ratings absents, jamais une exception", () => {
  assert.equal(getEloForTeam(null, "Arsenal"), null);
  assert.equal(getEloForTeam({}, null), null);
  assert.equal(getEloForTeam({ arsenal: 1900 }, "Arsenal"), 1900);
  assert.equal(getEloForTeam({ arsenal: 1900 }, "Chelsea"), null);
});
