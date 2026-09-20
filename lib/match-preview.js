"use strict";
// PAGES MATCH EN APERCU, 7 A 10 JOURS AVANT LE COUP D'ENVOI (decision du
// proprietaire du 19/09/2026, plans SEO fr/us/gb/za/mx de la meme date).
//
// Constat : 161 pages match sur 201 naissaient 2 jours avant le coup d'envoi
// (fenetre du run quotidien), trop tard pour un domaine jeune. Desormais le
// pipeline lit AUSSI, une fois par jour et par competition de
// config/leagues.json, les rencontres des jours J+3 a J+10 (un seul appel
// api-football /fixtures?league&season&from&to par competition) et publie pour
// chacune une page « apercu » a l'URL definitive de la page match
// (/match/<id>.html, /<dir>/match/<id>.html) : equipes, heure locale, stade
// (lib/venue.js), journee, et les faits publics connus (classement, forme et
// buts du classement, confrontations en cache). AUCUNE sortie du modele : ni
// marche, ni probabilite, ni niveau prob_band, ni pari. La page annonce la
// date de publication de l'analyse ; la meme URL devient la page d'analyse
// complete quand le match entre dans le run (J-2).
//
// Ce module est PUR (aucune E/S, aucun reseau) : fenetre, URL de l'appel,
// normalisation d'une fiche api-football, date d'ouverture de l'analyse,
// lecture de la journee. Utilise par le pipeline
// (.github/workflows/update-data.yml#chargerApercus), scripts/match-lifecycle.js
// (registre), scripts/seo-pages.js et scripts/seo-hubs.js.
const MATCH_TIME = require("./match-time.js");
const VENUE = require("./venue.js");

// Le run quotidien analyse les fixtures des dates TODAY, TODAY+1 et TODAY+2
// (update-data.yml#getFixtures, dates au sens de Paris) : un match du jour D
// entre dans le run le jour D-2. tests/seo-wave2.test.js verifie que
// getFixtures garde bien ces trois dates.
const ANALYSIS_LEAD_DAYS = 2;
// Premier et dernier jour d'apercu (apres la fenetre d'analyse).
const PREVIEW_FIRST_DAY = ANALYSIS_LEAD_DAYS + 1;
const PREVIEW_LAST_DAY = 10;
// Heure UTC du run quotidien (cron '0 6 * * *' de update-data.yml).
const PIPELINE_RUN_UTC_HOUR = 6;
// Statuts api-football retenus : programme a une heure connue. TBD (heure a
// definir) est exclu : une heure provisoire ne serait pas un fait.
const PREVIEW_STATUSES = ["NS"];
const PARIS = "Europe/Paris";

function str(v, max) { return typeof v === "string" && v.trim() ? v.trim().slice(0, max || 120) : null; }
function num(v) { var n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN); return isFinite(n) ? n : null; }
function pad(n) { return (n < 10 ? "0" : "") + n; }

// Fenetre d'apercu d'un run (jours de Paris, AAAA-MM-JJ).
function previewWindow(today) {
  return { from: MATCH_TIME.addDays(today, PREVIEW_FIRST_DAY), to: MATCH_TIME.addDays(today, PREVIEW_LAST_DAY) };
}
// Appel unique par competition et par jour (budget du proprietaire : environ
// un appel /fixtures par competition et par jour).
function fixturesUrl(leagueId, season, win) {
  return "https://v3.football.api-sports.io/fixtures?league=" + encodeURIComponent(leagueId) + "&season=" + encodeURIComponent(season) +
    "&from=" + win.from + "&to=" + win.to + "&timezone=Europe%2FParis";
}

// Fiche api-football (/fixtures) -> rencontre d'apercu, ou null. Champs
// publics seulement, meme forme que les matchs du run (date = heure de Paris
// "AAAA-MM-JJ HH:MM", home/away {id, n}, stade {nom, ville}, round).
function normalizeFixture(f, leagueKey) {
  if (!f || !f.fixture || f.fixture.id == null || !f.teams || !f.teams.home || !f.teams.away) return null;
  if (!/^\d{1,12}$/.test(String(f.fixture.id))) return null;
  var status = str(f.fixture.status && f.fixture.status.short, 8) || "";
  if (PREVIEW_STATUSES.indexOf(status) === -1) return null;
  var t = Date.parse(f.fixture.date);
  if (!isFinite(t)) return null;
  var home = { id: num(f.teams.home.id), n: str(f.teams.home.name) };
  var away = { id: num(f.teams.away.id), n: str(f.teams.away.name) };
  if (!home.n || !away.n || home.id == null || away.id == null) return null;
  var out = {
    id: String(f.fixture.id), league_key: str(leagueKey, 60), league: str(f.league && f.league.name),
    date: MATCH_TIME.clockKey(new Date(t), PARIS), status: status, home: home, away: away
  };
  var round = str(f.league && f.league.round, 60);
  if (round) out.round = round;
  var venueName = str(f.fixture.venue && f.fixture.venue.name);
  // Ville seulement si le stade est rattache a la base api-football (lib/venue.js).
  var city = VENUE.verifiedApiCity(f.fixture.venue);
  if (venueName) out.stade = { nom: city ? venueName + " - " + city : venueName, ville: city || "" };
  return out;
}

// Instant d'ouverture de l'analyse : run quotidien du jour (de Paris) D-2.
// kickoff : Date. null si invalide.
function analysisOpensAt(kickoff) {
  if (!(kickoff instanceof Date) || !isFinite(kickoff.getTime())) return null;
  var day = MATCH_TIME.addDays(MATCH_TIME.dayKey(kickoff, PARIS), -ANALYSIS_LEAD_DAYS);
  return day ? new Date(Date.parse(day + "T" + pad(PIPELINE_RUN_UTC_HOUR) + ":00:00Z")) : null;
}

// Journee api-football -> { n, phase, key } (journees numerotees seulement),
// sinon null (tours a elimination directe, amicaux, formats inconnus : jamais
// devines). phase : Apertura / Clausura (noms propres, non traduits).
var ROUND_RE = /^(Regular Season|League Stage|Apertura|Clausura)\s*-\s*(\d{1,2})$/i;
function parseRound(round) {
  var m = ROUND_RE.exec(String(round == null ? "" : round).trim());
  if (!m) return null;
  var n = Number(m[2]);
  if (!(n >= 1 && n <= 60)) return null;
  var p = m[1].toLowerCase();
  var phase = p === "apertura" ? "Apertura" : p === "clausura" ? "Clausura" : null;
  return { n: n, phase: phase, key: (phase || "round") + "-" + n };
}

module.exports = {
  ANALYSIS_LEAD_DAYS: ANALYSIS_LEAD_DAYS, PREVIEW_FIRST_DAY: PREVIEW_FIRST_DAY, PREVIEW_LAST_DAY: PREVIEW_LAST_DAY,
  PIPELINE_RUN_UTC_HOUR: PIPELINE_RUN_UTC_HOUR, PREVIEW_STATUSES: PREVIEW_STATUSES,
  previewWindow: previewWindow, fixturesUrl: fixturesUrl, normalizeFixture: normalizeFixture,
  analysisOpensAt: analysisOpensAt, parseRound: parseRound
};
