"use strict";
// MATCHS A PENALTY (06/11/2026) : le registre des matchs termines de nos 12 championnats, avec ou sans penalty
// (preuves/penalties-championnats.json : { f: fixture, d: date, l: championnat, p: 1 si au moins un penalty, 0 sinon }).
// Penalty = but sur penalty ou penalty manque, temps reglementaire et prolongation ; tirs au but exclus.
// Mis a jour a chaque calcul avec les matchs termines des derniers jours (API-Sports : 1 appel par jour + 1 par
// lot de 20 matchs). Seuls des matchs termines entrent : aucune donnee du futur. Garde 400 jours.
const LIGUES_ID = { premier: 39, laliga: 140, seriea: 135, bundesliga: 78, ligue1: 61, eredivisie: 88, primeira: 94, mls: 253,
  suede: 113, jleague: 98, liga_mx: 262, argentina_liga_profesional: 128 };
const FINIS = ["FT", "AET", "PEN"];
const GARDE_JOURS = 400;

function ajouterJours(jour, n) { const d = new Date(jour + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function avecPenalty(events) {
  return (Array.isArray(events) ? events : []).some(function (e) {
    const pen = (e && e.type === "Goal" && e.detail === "Penalty") || (e && e.detail === "Missed Penalty");
    const tirs = e && (e.comments === "Penalty Shootout" || (e.time && e.time.elapsed > 120));
    return pen && !tirs;
  }) ? 1 : 0;
}
// get(url) -> Promise<reponse JSON API-Sports>. jour = aujourd'hui (Paris) : on lit les « jours » jours d'avant.
async function mettreAJour(lignes, opts) {
  const get = opts.get, jour = opts.jour, jours = opts.jours || 3;
  const idVersCle = {}; Object.keys(LIGUES_ID).forEach((k) => { idVersCle[LIGUES_ID[k]] = k; });
  const vus = new Set((lignes || []).map((x) => x.f));
  const out = (lignes || []).slice(), aLire = [];
  for (let i = jours; i >= 1; i--) {
    const r = await get("https://v3.football.api-sports.io/fixtures?date=" + ajouterJours(jour, -i) + "&timezone=Europe/Paris");
    (r && Array.isArray(r.response) ? r.response : []).forEach(function (f) {
      const cle = idVersCle[f && f.league && f.league.id];
      if (!cle || FINIS.indexOf(f.fixture && f.fixture.status && f.fixture.status.short) === -1 || vus.has(f.fixture.id)) return;
      aLire.push({ f: f.fixture.id, d: String(f.fixture.date).slice(0, 10), l: cle });
    });
  }
  for (let i = 0; i < aLire.length; i += 20) {
    const lot = aLire.slice(i, i + 20);
    const r = await get("https://v3.football.api-sports.io/fixtures?ids=" + lot.map((x) => x.f).join("-"));
    const parId = {}; (r && Array.isArray(r.response) ? r.response : []).forEach((f) => { parId[f.fixture.id] = f; });
    lot.forEach(function (x) {
      const f = parId[x.f];
      if (!f || !Array.isArray(f.events) || !f.events.length) return; // evenements absents : match ignore, jamais compte « sans penalty »
      out.push({ f: x.f, d: x.d, l: x.l, p: avecPenalty(f.events) }); vus.add(x.f);
    });
  }
  const debut = ajouterJours(jour, -GARDE_JOURS);
  return out.filter((x) => x.d >= debut).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.f - b.f));
}
module.exports = { LIGUES_ID, avecPenalty, mettreAJour, GARDE_JOURS };
