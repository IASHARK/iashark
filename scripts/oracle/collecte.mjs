// Collecte API-Football v3 pour une analyse ponctuelle (mission « Oracle » du 20/10/2026).
// Écrit tout dans OUT (artefact du workflow). Aucune donnée personnelle.
import fs from "node:fs";
import path from "node:path";
const KEY = process.env.APISPORTS_KEY;
const OUT = process.env.OUT || "oracle-out";
const JOUR = process.env.JOUR || "2026-10-20";
const BASE = "https://v3.football.api-sports.io";
fs.mkdirSync(OUT, {recursive: true});
let appels = 0;
async function api(p, params = {}) {
  const u = new URL(BASE + p);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let essai = 0; essai < 3; essai++) {
    appels++;
    const r = await fetch(u, {headers: {"x-apisports-key": KEY}});
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 1500)); continue; }
    const j = await r.json();
    return j;
  }
  return {response: [], errors: ["429"]};
}
async function toutesPages(p, params) {
  const premier = await api(p, params);
  let res = premier.response || [];
  const total = premier.paging?.total || 1;
  for (let page = 2; page <= total; page++) res = res.concat((await api(p, {...params, page})).response || []);
  return res;
}
const save = (nom, data) => fs.writeFileSync(path.join(OUT, nom), JSON.stringify(data));
const now = new Date().toISOString();
const fx = (await api("/fixtures", {date: JOUR, timezone: "Europe/Paris"})).response || [];
const garde = fx.filter((f) => [2, 40].includes(f.league.id) &&
  (f.league.id === 2 || /Wolverhampton|Wolves/i.test(f.teams.home.name)));
save("fixtures.json", {recupere_le: now, fixtures: garde});
console.log("matchs retenus", garde.length, garde.map((f) => `${f.fixture.id} ${f.teams.home.name}-${f.teams.away.name} ${f.fixture.status.short}`).join(" | "));
const equipes = new Map();
for (const f of garde) {
  const id = f.fixture.id;
  save(`odds_${id}.json`, {recupere_le: new Date().toISOString(), odds: await toutesPages("/odds", {fixture: id})});
  save(`predictions_${id}.json`, (await api("/predictions", {fixture: id})).response || []);
  save(`injuries_${id}.json`, (await api("/injuries", {fixture: id})).response || []);
  save(`lineups_${id}.json`, (await api("/fixtures/lineups", {fixture: id})).response || []);
  save(`h2h_${id}.json`, (await api("/fixtures/headtohead", {h2h: `${f.teams.home.id}-${f.teams.away.id}`, last: 6})).response || []);
  equipes.set(f.teams.home.id, f.league.id); equipes.set(f.teams.away.id, f.league.id);
}
const vus = new Set();
for (const [team] of equipes) {
  const derniers = (await api("/fixtures", {team, last: 10})).response || [];
  save(`last10_${team}.json`, derniers);
  for (const d of derniers) {
    const id = d.fixture.id;
    if (vus.has(id)) continue; vus.add(id);
    save(`fxstats_${id}.json`, (await api("/fixtures/statistics", {fixture: id})).response || []);
    save(`fxplayers_${id}.json`, (await api("/fixtures/players", {fixture: id})).response || []);
  }
  save(`players_${team}.json`, await toutesPages("/players", {team, season: 2026}));
}
save("bookmakers.json", (await api("/odds/bookmakers")).response || []);
save("bets.json", (await api("/odds/bets")).response || []);
console.log("appels API", appels);
