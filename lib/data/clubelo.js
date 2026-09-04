"use strict";
// Item 4 (audit 2026-09-04) - ClubElo POINT-IN-TIME, architecture prete
// pour M3 (SPEC LAB PRO v1.0, covariate Elo) - donnees historiques
// reelles PAS ENCORE collectees, M3 reste BLOCKED_DATA. Ce module NE
// remplace PAS loadClubElo() dans .github/workflows/update-data.yml (qui
// reste correct pour son propre usage : une prediction LIVE du jour meme
// veut legitimement les ratings du jour meme). Ce module sert
// exclusivement le LABORATOIRE (walk-forward historique) : un replay sur
// un cutoff de 2024 ne doit JAMAIS recevoir les ratings ACTUELS (2026) -
// ce serait une fuite de donnees aussi grave qu'un score de match futur.
//
// Cache : raw_api/clubelo/YYYY-MM-DD/ratings.json - UN fichier par DATE
// (pas par hash de parametres comme lib/data/cache.js : ClubElo n'a
// qu'un seul parametre pertinent, la date). Immuable une fois ecrit -
// les ratings ClubElo d'une date deja passee ne sont jamais reecrits
// retroactivement par ce module (ClubElo peut corriger le jour meme,
// jamais une date ancienne une fois figee en cache).

const fs = require("node:fs");
const path = require("node:path");

const RAW_API_ROOT = path.join(__dirname, "..", "..", "raw_api");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(referenceDate) {
  return typeof referenceDate === "string" && DATE_RE.test(referenceDate);
}

function cachePath(referenceDate) {
  return path.join(RAW_API_ROOT, "clubelo", referenceDate, "ratings.json");
}

function readCache(referenceDate) {
  const p = cachePath(referenceDate);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return null;
  }
}

function writeCache(referenceDate, ratings) {
  const dir = path.join(RAW_API_ROOT, "clubelo", referenceDate);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath(referenceDate), JSON.stringify({ reference_date: referenceDate, captured_at: new Date().toISOString(), ratings }, null, 2));
}

// Format CSV reel de api.clubelo.com/{date} : Rank,Club,Country,Level,Elo,From,To
function parseClubEloCsv(csv) {
  const ratings = {};
  const lines = (csv || "").split("\n").slice(1);
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length >= 5) {
      const name = (parts[1] || "").trim();
      const elo = parseFloat(parts[4]);
      if (name && !isNaN(elo)) ratings[name.toLowerCase()] = elo;
    }
  }
  return ratings;
}

// referenceDate : OBLIGATOIRE (YYYY-MM-DD), AUCUNE valeur par defaut -
// TODAY/Date.now() sont delibrement absents de la signature. Un appelant
// qui ne fournit pas de date explicite pendant un backtest DOIT planter,
// jamais recevoir silencieusement les ratings du jour par accident.
//
// options.fetcher : fonction injectable (referenceDate) -> Promise<string CSV>,
// utilisee UNIQUEMENT si rien n'est en cache. Absente par defaut - sans
// fetcher fourni explicitement par l'appelant, ce module ne fait JAMAIS
// d'appel reseau lui-meme (coherent avec "aucun besoin d'appeler l'API
// pour ecrire l'architecture" - la collecte reelle reste un futur GATE
// separe, comme B1 pour les fixtures).
async function loadClubElo(referenceDate, options) {
  options = options || {};
  if (!isValidDate(referenceDate)) {
    throw new Error(
      `loadClubElo: referenceDate obligatoire au format YYYY-MM-DD (recu: ${JSON.stringify(referenceDate)}) - ` +
      `un replay historique sans date explicite est refuse pour eviter toute fuite vers les ratings actuels`
    );
  }

  const cached = readCache(referenceDate);
  if (cached) return { ratings: cached.ratings, source: "cache", reference_date: referenceDate };

  if (!options.fetcher) {
    // Rien en cache et aucun fetcher fourni -> indisponible PROPREMENT :
    // jamais un repli sur une autre date (ex: TODAY) pour "depanner".
    return { ratings: {}, source: "unavailable", reference_date: referenceDate };
  }

  try {
    const csv = await options.fetcher(referenceDate);
    const ratings = parseClubEloCsv(csv);
    writeCache(referenceDate, ratings);
    return { ratings, source: "fetched", reference_date: referenceDate };
  } catch (e) {
    return { ratings: {}, source: "unavailable", reference_date: referenceDate, error: e.message };
  }
}

// Lecture exacte (pas de fuzzy-match ici) - le fuzzy-match par distance de
// Levenshtein reste une fonctionnalite de production (getElo dans
// update-data.yml), hors perimetre de cet item architecture point-in-time.
function getEloForTeam(ratings, teamName) {
  if (!ratings || !teamName) return null;
  const nameLow = teamName.toLowerCase();
  return ratings[nameLow] != null ? ratings[nameLow] : null;
}

module.exports = { loadClubElo, parseClubEloCsv, getEloForTeam, cachePath, isValidDate, RAW_API_ROOT };
