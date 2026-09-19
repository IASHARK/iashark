"use strict";
// BUTEURS DU JOUR (19/09/2026) : lib/buteurs-du-jour.js (classement, fichier
// public, resolution Pro), home-scorers.js (section de l'accueil, rendue ici
// dans un faux navigateur vm), branchement dans index.html / i18n et pipeline
// (.github/workflows/update-data.yml).
//
// Tunnel de vente (decision du proprietaire, 19/09/2026) : un visiteur ou un
// compte gratuit ne doit PAS savoir qui sont les 3 joueurs. Le fichier public
// ne porte que {match_id, match_rank, league, league_key, league_id, kickoff} ;
// seul un abonne Pro confirme par le serveur (match-data) retrouve le joueur
// avec resolvePick(), memes chiffres que la carte « Marches joueurs ».
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const B = require("../lib/buteurs-du-jour.js");
const MT = require("../lib/match-time.js");
const { scorerModel } = require("../lib/insights.js");
const { buildMatchViewModel } = require("../lib/match-view-model.js");
const PREMIUM = require("../lib/premium-fields.js");

// ------------------------------------------------------------ jeux de donnees
// 10 matchs d'equipe, du plus recent (0) au plus ancien.
const FIX = (seed) => Array.from({ length: 10 }, (_, i) => ({ id: seed * 1000 + i, date: "2026-09-" + String(14 - i).padStart(2, "0") }));
function history(teamId, players, seed) {
  const rows = [];
  FIX(seed).forEach((f, i) => {
    players.forEach((p) => {
      const s = p.spec(i);
      if (!s) return;
      rows.push({ fixture_id: f.id, date: f.date, player_id: p.id, team_id: teamId, name: p.name, position: p.position,
        photo: "https://media.api-sports.io/football/players/" + p.id + ".png",
        starter: s.starter, minutes: s.minutes, goals: s.goals || 0, shots_on: s.shots_on == null ? null : s.shots_on,
        team_goals: 1, is_current_season: i < 4 });
    });
  });
  return rows;
}
const regular = (id, name, position, shotsOn) => ({ id, name, position, spec: () => ({ starter: true, minutes: 90, goals: 0, shots_on: shotsOn || null }) });
function eleven(teamId) {
  return [
    regular(teamId * 1000 + 1, "Gardien " + teamId, "Goalkeeper"),
    regular(teamId * 1000 + 2, "Def A " + teamId, "Defender"), regular(teamId * 1000 + 3, "Def B " + teamId, "Defender"),
    regular(teamId * 1000 + 4, "Def C " + teamId, "Defender"), regular(teamId * 1000 + 5, "Def D " + teamId, "Defender"),
    regular(teamId * 1000 + 6, "Milieu A " + teamId, "Midfielder"), regular(teamId * 1000 + 7, "Milieu B " + teamId, "Midfielder", 1),
  ];
}
// Attaquant titulaire : buts tous les `every` matchs, `sot` tirs cadres par match.
const striker = (id, name, every, sot) => ({ id, name, position: "Attacker", spec: (i) => ({ starter: true, minutes: 85, goals: i % every === 0 ? 1 : 0, shots_on: sot }) });
// Remplacant jamais titulaire, un but en quelques minutes (le cas Alysson Edward).
const lucky = (id, name) => ({ id, name, position: "Attacker", spec: (i) => (i < 4 ? { starter: false, minutes: i === 0 ? 30 : 19, goals: i === 1 ? 1 : 0, shots_on: i === 1 ? 1 : null } : null) });

function match(o) {
  const h = o.home, a = o.away;
  const hp = eleven(h.id).concat(o.homeExtra || []), ap = eleven(a.id).concat(o.awayExtra || []);
  const out = {
    id: o.id, date: o.date || "2026-09-19 21:00", league: o.league || "Premier League", league_key: o.league_key || "premier", league_id: 39,
    home: { id: h.id, n: h.n }, away: { id: a.id, n: a.n },
    data_quality_score: o.dqs == null ? 80 : o.dqs, model_output_available: true,
    lambda_h: o.lambda_h == null ? 1.5 : o.lambda_h, lambda_a: o.lambda_a == null ? 1.2 : o.lambda_a,
    injuries: o.injuries || [],
    player_history: { home: history(h.id, hp, o.id % 97), away: history(a.id, ap, (o.id % 97) + 1) },
  };
  if (o.squads) out.current_squads = o.squads;
  return out;
}
function day() {
  return [
    match({ id: 101, date: "2026-09-19 21:00", home: { id: 11, n: "Alpha" }, away: { id: 12, n: "Beta" },
      homeExtra: [striker(1101, "Buteur Alpha", 2, 2), striker(1102, "Second Alpha", 3, 2)], awayExtra: [striker(1201, "Buteur Beta", 4, 1)] }),
    match({ id: 102, date: "2026-09-19 18:00", home: { id: 13, n: "Gamma" }, away: { id: 14, n: "Delta" },
      homeExtra: [striker(1301, "Buteur Gamma", 3, 2), lucky(1302, "Remplacant Gamma")], awayExtra: [striker(1401, "Buteur Delta", 2, 3)] }),
    match({ id: 103, date: "2026-09-19 15:00", home: { id: 15, n: "Epsilon" }, away: { id: 16, n: "Zeta" }, lambda_h: 1.1, lambda_a: 1.0,
      homeExtra: [striker(1501, "Buteur Epsilon", 5, 1)], awayExtra: [striker(1601, "Buteur Zeta", 6, 1)] }),
    match({ id: 104, date: "2026-09-19 20:00", home: { id: 17, n: "Eta" }, away: { id: 18, n: "Theta" }, lambda_h: 2.2, lambda_a: 0.7,
      homeExtra: [striker(1701, "Buteur Eta", 2, 3)], awayExtra: [striker(1801, "Buteur Theta", 6, 1)] }),
    // Autre jour : jamais melange.
    match({ id: 105, date: "2026-09-20 21:00", home: { id: 19, n: "Iota" }, away: { id: 20, n: "Kappa" }, lambda_h: 3,
      homeExtra: [striker(1901, "Buteur Iota", 1, 3)] }),
  ];
}
const rawOf = (ms, e) => ms.find((m) => String(m.id) === String(e.match_id));
// Identite des joueurs designes par des entrees publiques, retrouvee comme le
// fait un abonne Pro (resolvePick sur les donnees premium de chaque match).
function who(ms, entries, label) {
  return entries.map((e) => {
    const r = B.resolvePick(rawOf(ms, e), e.match_rank);
    assert.ok(r, (label || "") + " : entree " + JSON.stringify(e) + " non resolue");
    return r;
  });
}
// Tout ce qui permettrait d'identifier un joueur du jeu de donnees : noms des
// joueurs (toutes les feuilles) et des equipes.
function fixtureSecrets(ms) {
  const names = new Set();
  ms.forEach((m) => {
    ["home", "away"].forEach((s) => m.player_history[s].forEach((r) => names.add(r.name)));
    names.add(m.home.n); names.add(m.away.n);
  });
  return [...names];
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function assertNoSecret(html, secrets, label) {
  secrets.forEach((s) => assert.doesNotMatch(html, new RegExp("(^|[^\\w])" + escRe(s) + "($|[^\\w])"), label + " : « " + s + " » visible"));
}
const RESOLVED_KEYS = ["player_id", "name", "photo", "team", "team_id", "opponent", "match_id", "league", "league_key", "league_id",
  "kickoff", "is_home", "displayProbability", "startsLast", "teamMatchesLast", "expectedMinutes"];

// ------------------------------------------------------------ classement
test("classement : 3 entrees publiques, deterministe quel que soit l'ordre des matchs, jour de Paris respecte ; les bons joueurs", () => {
  const ms = day();
  const a = B.topScorersOfDay(ms, { day: "2026-09-19" });
  assert.equal(a.length, 3);
  const b = B.topScorersOfDay(ms.slice().reverse(), { day: "2026-09-19" });
  const c = B.topScorersOfDay([ms[2], ms[0], ms[4], ms[3], ms[1]], { day: "2026-09-19" });
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  a.forEach((e) => assert.deepEqual(Object.keys(e), B.PUBLIC_FIELDS, "entree publique uniquement"));
  assert.ok(!a.some((e) => e.match_id === 105), "jamais un match d'un autre jour");
  // Qui a ete retenu (identite retrouvee comme un abonne Pro).
  const players = who(ms, a, "top");
  assert.deepEqual(players.map((p) => p.name), ["Buteur Eta", "Buteur Gamma", "Buteur Beta"]);
  assert.deepEqual(players.map((p) => p.player_id), [1701, 1301, 1201]);
  assert.deepEqual(a.map((e) => e.match_id), [104, 102, 101]);
  // Du plus probable au moins probable (probabilite non arrondie, puis affichee).
  const probs = a.map((e) => B.candidatesForMatch(rawOf(ms, e))[e.match_rank].probability);
  for (let i = 1; i < probs.length; i++) assert.ok(probs[i - 1] >= probs[i], probs.join(" >= "));
  for (let i = 1; i < players.length; i++) assert.ok(players[i - 1].displayProbability >= players[i].displayProbability);
  // Le joueur retenu de chaque match est le premier « shown » de son match (rang 0).
  a.forEach((e, i) => {
    assert.equal(e.match_rank, 0);
    const r = scorerModel.rankMatch(B.scorerInput(rawOf(ms, e)));
    assert.equal(r.shown[0].id, players[i].player_id);
  });
});

test("classement : egalite parfaite departagee par coup d'envoi puis identifiant, jamais par l'ordre d'entree", () => {
  const base = { home: { id: 21, n: "Clone A" }, away: { id: 22, n: "Clone B" }, homeExtra: [striker(2101, "Clone", 2, 2)] };
  const tot = match(Object.assign({ id: 902, date: "2026-09-19 15:00" }, base));
  const tard = match(Object.assign({ id: 901, date: "2026-09-19 21:00" }, base));
  // Memes joueurs, memes feuilles : seules les dates de coup d'envoi different.
  tard.player_history = JSON.parse(JSON.stringify(tot.player_history));
  const out1 = B.topScorersOfDay([tard, tot], { day: "2026-09-19", limit: 1 });
  const out2 = B.topScorersOfDay([tot, tard], { day: "2026-09-19", limit: 1 });
  assert.deepEqual(out1, out2);
  assert.equal(out1[0].match_id, 902, "coup d'envoi le plus tot d'abord");
  assert.equal(B.resolvePick(tot, out1[0].match_rank).name, "Clone");
});

test("rang dans le match : candidatesForMatch trie (compareCandidates) et numerote ; resolvePick retrouve exactement ce joueur, sinon null", () => {
  let n = 0;
  day().forEach((raw) => {
    const list = B.candidatesForMatch(raw);
    assert.ok(list.length >= 2, "match " + raw.id);
    list.forEach((x, i) => {
      n++;
      assert.equal(x.entry.match_rank, i, "rang " + i);
      if (i) assert.ok(list[i - 1].probability >= x.probability, "trie du plus probable au moins probable");
      assert.ok(typeof x.entry.name === "string" && x.entry.name && Number.isFinite(x.entry.player_id), "identite conservee en interne");
      const r = B.resolvePick(raw, i);
      assert.ok(r, "match " + raw.id + " rang " + i);
      assert.deepEqual(Object.keys(r).sort(), RESOLVED_KEYS.slice().sort());
      ["player_id", "name", "photo", "team", "team_id", "opponent", "match_id", "league", "league_key", "league_id", "kickoff", "is_home"]
        .forEach((k) => assert.equal(r[k], x.entry[k], "match " + raw.id + " rang " + i + " : " + k));
      const num = B.scorerNumbersFor(raw, x.entry.player_id);
      assert.equal(r.displayProbability, num.displayProbability);
      assert.equal(r.startsLast, num.startsLast);
      assert.equal(r.teamMatchesLast, num.teamMatchesLast);
      assert.equal(r.expectedMinutes, num.expectedMinutes);
      assert.ok(r.displayProbability > 0, "jamais 0 %");
    });
    // Rang invalide ou hors liste : null, jamais un autre joueur.
    [-1, 1.5, "x", undefined, NaN, Infinity, list.length, 99].forEach((bad) => {
      assert.equal(B.resolvePick(raw, bad), null, "rang " + String(bad));
    });
  });
  assert.ok(n > 10);
  assert.equal(B.resolvePick(null, 0), null);
  assert.equal(B.resolvePick({}, 0), null);
  assert.equal(B.resolvePick("x", 0), null);
  assert.equal(B.resolvePick({ id: 1, home: { id: 1, n: "A" }, away: { id: 2, n: "B" }, player_history: {} }, 0), null, "aucune feuille : aucun joueur");
});

test("un seul joueur par match, sauf s'il y a moins de 3 matchs avec un candidat", () => {
  const ms = day();
  const top = B.topScorersOfDay(ms, { day: "2026-09-19" });
  assert.equal(new Set(top.map((e) => e.match_id)).size, 3, "3 matchs differents");
  // Sans la regle, les 3 plus probables compteraient deux joueurs du meme match.
  const naif = ms.filter((m) => m.date.startsWith("2026-09-19")).flatMap((m) => B.candidatesForMatch(m))
    .sort((a, b) => b.probability - a.probability).slice(0, 3);
  assert.ok(new Set(naif.map((x) => x.entry.match_id)).size < 3, "le jeu de donnees doit exercer la regle");
  assert.ok(naif.some((x) => x.entry.name === "Buteur Delta"), "Buteur Delta serait retenu sans la regle");
  assert.ok(!who(ms, top).some((p) => p.name === "Buteur Delta"), "second joueur du meme match ecarte");
  // 2 matchs : on complete avec le suivant (rang 1 d'un des deux matchs).
  const deux = B.topScorersOfDay(ms.slice(0, 2), { day: "2026-09-19" });
  assert.equal(deux.length, 3, "2 matchs : on complete avec le suivant");
  assert.equal(new Set(deux.map((e) => e.match_id)).size, 2);
  assert.equal(new Set(deux.map((e) => e.match_id + "|" + e.match_rank)).size, 3, "3 references distinctes");
  const joueurs = who(ms, deux, "deux");
  assert.equal(new Set(joueurs.map((p) => p.player_id)).size, 3, "jamais deux fois le meme joueur");
  assert.deepEqual(joueurs.map((p) => p.name), ["Buteur Gamma", "Buteur Delta", "Buteur Beta"]);
  assert.deepEqual(deux.map((e) => e.match_rank), [0, 1, 0]);
  assert.deepEqual(B.topScorersOfDay([], { day: "2026-09-19" }), []);
  assert.deepEqual(B.topScorersOfDay(null), []);
});

test("titulaires probables uniquement : jamais un remplacant, jamais un gardien", () => {
  const ms = day();
  for (let limit = 1; limit <= 12; limit++) {
    const top = B.topScorersOfDay(ms, { day: "2026-09-19", limit });
    assert.equal(top.length, limit);
    who(ms, top, "limit " + limit).forEach((p) => {
      assert.notEqual(p.player_id, 1302, "remplacant jamais titularise");
      assert.doesNotMatch(p.name, /^Gardien /);
      const r = scorerModel.rankMatch(B.scorerInput(ms.find((m) => m.id === p.match_id)));
      const c = r.shown.find((x) => x.id === p.player_id);
      assert.ok(c, p.name + " doit etre un candidat « shown » de la carte Marches joueurs");
      assert.ok(c.startProbability >= scorerModel.PARAMS.minStartProbability);
      assert.notEqual(c.position, "G");
    });
  }
  assert.ok(!B.candidatesForMatch(ms[1]).some((x) => x.entry.player_id === 1302), "aucun rang pour le remplacant");
});

test("absent annonce ou joueur sorti de l'effectif : jamais retenu, jamais resolu", () => {
  const ms = day();
  const avant = B.topScorersOfDay(ms, { day: "2026-09-19" });
  const star = who(ms, avant)[0];
  assert.equal(star.name, "Buteur Eta");
  const m = ms.find((x) => x.id === star.match_id);
  m.injuries = [{ team: star.team_id, name: star.name.toUpperCase() + " ", reason: "Genou", status: "Missing Fixture" }];
  const apres = B.topScorersOfDay(ms, { day: "2026-09-19" });
  assert.ok(!who(ms, apres).some((p) => p.player_id === star.player_id), "blesse annonce exclu");
  assert.equal(B.scorerNumbersFor(m, star.player_id), null, "aucun chiffre pour un absent");
  assert.ok(!B.candidatesForMatch(m).some((x) => x.entry.player_id === star.player_id), "aucun rang pour un absent");
  for (let i = 0; i < 5; i++) {
    const r = B.resolvePick(m, i);
    assert.ok(!r || r.player_id !== star.player_id, "resolvePick ne rend jamais l'absent");
  }
  // Effectif actuel connu (11 joueurs ou plus) sans lui : parti, exclu.
  m.injuries = [];
  const side = star.is_home ? "home" : "away";
  const autres = m.player_history[side].map((r) => r.player_id).filter((id, i, arr) => arr.indexOf(id) === i && id !== star.player_id);
  while (autres.length < 11) autres.push(990000 + autres.length);
  m.current_squads = { [side]: autres.map((id) => ({ player_id: id })) };
  const sansLui = B.topScorersOfDay(ms, { day: "2026-09-19" });
  assert.ok(!who(ms, sansLui).some((p) => p.player_id === star.player_id), "joueur hors effectif exclu");
  assert.ok(!B.candidatesForMatch(m).some((x) => x.entry.player_id === star.player_id));
});

test("garde coup d'envoi : un match refuse par isEligible ne fournit aucun joueur ; une erreur du filtre n'est pas fatale", () => {
  const ms = day();
  const top = B.topScorersOfDay(ms, { day: "2026-09-19", isEligible: (m) => m.id !== 104 });
  assert.ok(!top.some((p) => p.match_id === 104));
  assert.equal(top.length, 3);
  const boom = B.topScorersOfDay(ms, { day: "2026-09-19", isEligible: () => { throw new Error("x"); } });
  assert.deepEqual(boom, []);
});

// ------------------------------------------------------------ fichier public
const FORBIDDEN_KEYS = /prob|conf|lambda|edge|kelly|expected|starts|minutes|rate|share|pick|pari|cote|market|name|player|photo|team|opponent|home/i;
function allKeys(v, out = []) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object") Object.keys(v).forEach((k) => { out.push(k); allKeys(v[k], out); });
  return out;
}
function assertPublicFile(file, label, secrets = []) {
  assert.deepEqual(Object.keys(file).sort(), ["days", "generated_at"], label);
  assert.match(file.generated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, label);
  Object.keys(file.days).forEach((d) => {
    assert.match(d, /^\d{4}-\d{2}-\d{2}$/, label);
    const list = file.days[d];
    assert.ok(Array.isArray(list) && list.length <= B.DEFAULT_LIMIT, label);
    const refs = new Set();
    list.forEach((p) => {
      assert.deepEqual(Object.keys(p).sort(), B.PUBLIC_FIELDS.slice().sort(), label + " : champs publics uniquement");
      assert.ok(Number.isInteger(p.match_id) && p.match_id > 0, label + " : match_id " + p.match_id);
      assert.ok(Number.isInteger(p.match_rank) && p.match_rank >= 0 && p.match_rank < B.DEFAULT_LIMIT, label + " : match_rank " + p.match_rank);
      assert.ok(p.league === null || typeof p.league === "string", label);
      assert.ok(p.league_key === null || typeof p.league_key === "string", label);
      assert.ok(p.league_id === null || Number.isInteger(p.league_id), label);
      assert.match(String(p.kickoff), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/, label);
      assert.equal(String(p.kickoff).slice(0, 10), d, label + " : coup d'envoi du jour de la cle");
      Object.keys(p).forEach((k) => {
        assert.ok(!PREMIUM.PREMIUM_FIELDS.includes(k) && !PREMIUM.DEEP_PREMIUM_KEYS.includes(k), label + " : champ premium " + k);
      });
      const ref = p.match_id + "|" + p.match_rank;
      assert.ok(!refs.has(ref), label + " : reference en double " + ref);
      refs.add(ref);
    });
  });
  // Aucune cle d'identite ni de chiffre, a aucun niveau.
  allKeys(file).filter((k) => !/^\d{4}-\d{2}-\d{2}$/.test(k) && !["days", "generated_at"].includes(k)).forEach((k) => {
    assert.ok(B.PUBLIC_FIELDS.includes(k), label + " : cle " + k);
    if (!["match_id", "match_rank", "league_key", "league_id"].includes(k)) assert.doesNotMatch(k, FORBIDDEN_KEYS, label + " : cle " + k);
  });
  assert.deepEqual(PREMIUM.deepPremiumLeaks(file), [], label);
  const json = JSON.stringify(file);
  assert.doesNotMatch(json, /probab|displayProbability|startProbability|expectedMinutes|lambda|media\.api-sports\.io|"(?:name|player_id|photo|team|team_id|opponent|is_home)"/i, label);
  assertNoSecret(json, secrets, label);
}

test("PUBLIC_FIELDS : match, rang dans le match, competition, heure ; rien d'autre (decision du 19/09/2026)", () => {
  assert.deepEqual(B.PUBLIC_FIELDS, ["match_id", "match_rank", "league", "league_key", "league_id", "kickoff"]);
  const e = B.publicEntry({ match_id: 1, match_rank: 0, name: "X", player_id: 2, photo: "p", team: "T", team_id: 3, opponent: "O", is_home: true, probability: 0.4 });
  assert.deepEqual(Object.keys(e), B.PUBLIC_FIELDS);
  assert.deepEqual(e, { match_id: 1, match_rank: 0, league: null, league_key: null, league_id: null, kickoff: null });
});

test("fichier public : aucun joueur, aucune equipe, aucune probabilite ; jours de Paris aujourd'hui et demain", () => {
  const ms = day();
  const now = Date.parse("2026-09-19T08:00:00Z");
  const file = B.buildDailyFile(ms, { now });
  assert.deepEqual(Object.keys(file.days), ["2026-09-19", "2026-09-20"]);
  assert.equal(file.days["2026-09-19"].length, 3);
  assert.deepEqual(file.days["2026-09-19"], B.topScorersOfDay(ms, { day: "2026-09-19" }));
  // Demain : un seul match, donc ses 3 meilleurs, rangs 0/1/2.
  assert.deepEqual(file.days["2026-09-20"].map((e) => [e.match_id, e.match_rank]), [[105, 0], [105, 1], [105, 2]]);
  assert.equal(who(ms, file.days["2026-09-20"])[0].player_id, 1901);
  assert.equal(file.generated_at, new Date(now).toISOString());
  assertPublicFile(file, "buildDailyFile", fixtureSecrets(ms));
  // 23:30 UTC le 19 = 01:30 a Paris le 20 : le fichier suit le jour de Paris.
  assert.deepEqual(Object.keys(B.buildDailyFile([], { now: Date.parse("2026-09-19T23:30:00Z") }).days), ["2026-09-20", "2026-09-21"]);
  assert.equal(B.parisDay(Date.parse("2026-09-19T21:59:00Z")), "2026-09-19");
  assert.equal(B.parisDay(Date.parse("2026-09-19T22:01:00Z")), "2026-09-20");
});

test("fichier public reel (buteurs-du-jour.json du depot) : format public, aucune fuite", () => {
  if (!fs.existsSync(path.join(ROOT, "buteurs-du-jour.json"))) return;
  const file = JSON.parse(read("buteurs-du-jour.json"));
  assertPublicFile(file, "buteurs-du-jour.json");
  assert.ok(Object.values(file.days).some((l) => l.length > 0), "exemple non vide");
});

// ------------------------------------------------------------ chiffres Pro = page match
function assertSameAsMatchPage(raw, label) {
  const threat = buildMatchViewModel(raw).players.scoringThreat;
  threat.forEach((p) => {
    const n = B.scorerNumbersFor(raw, p.id);
    assert.ok(n, label + " : " + p.name + " introuvable");
    assert.equal(n.displayProbability, p.scoringProbability, label + " : probabilite " + p.name);
    assert.equal(n.startsLast, p.startsLast, label);
    assert.equal(n.teamMatchesLast, p.teamMatchesLast, label);
    assert.equal(n.expectedMinutes, p.expectedMinutes, label);
    assert.equal(n.shown, true);
    const c = B.candidatesForMatch(raw).find((x) => x.entry.player_id === p.id);
    assert.ok(c, label + " : candidat manquant");
    assert.equal(c.entry.name, p.name, label + " : meme nom que la carte");
    assert.equal(c.entry.photo, p.photo || null, label + " : meme photo que la carte");
    assert.equal(c.entry.team, p.team, label);
    // Ce que voit l'abonne Pro sur l'accueil (resolvePick) = la carte du match.
    const r = B.resolvePick(raw, c.entry.match_rank);
    if (p.scoringProbability > 0) {
      assert.ok(r, label + " : " + p.name + " non resolu");
      assert.equal(r.player_id, p.id, label);
      assert.equal(r.name, p.name, label);
      assert.equal(r.displayProbability, p.scoringProbability, label + " : probabilite resolue " + p.name);
      assert.equal(r.startsLast, p.startsLast, label);
      assert.equal(r.teamMatchesLast, p.teamMatchesLast, label);
      assert.equal(r.expectedMinutes, p.expectedMinutes, label);
    } else {
      assert.equal(r, null, label + " : probabilite nulle jamais resolue");
    }
  });
  return threat.length;
}

test("abonne Pro : scorerNumbersFor et resolvePick rendent exactement les chiffres de la carte « Marches joueurs » (lib/match-view-model.js)", () => {
  let n = 0;
  day().forEach((m) => { n += assertSameAsMatchPage(m, "match " + m.id); });
  // Sortie du moteur non fiable : lambda ignore des deux cotes, memes chiffres encore.
  day().forEach((m) => { m.data_quality_score = 0; n += assertSameAsMatchPage(m, "non fiable " + m.id); });
  assert.ok(n > 10);
  // Joueur inconnu, match vide : null, jamais d'exception ni de 0 %.
  assert.equal(B.scorerNumbersFor(day()[0], 424242), null);
  assert.equal(B.scorerNumbersFor({}, 1), null);
  assert.equal(B.scorerNumbersFor(null, 1), null);
});

test("abonne Pro : memes chiffres que la page match sur les vraies donnees (data.json)", () => {
  if (!fs.existsSync(path.join(ROOT, "data.json"))) return;
  const matchs = (JSON.parse(read("data.json")).matchs || []).filter((m) => m && m.player_history);
  let n = 0;
  matchs.forEach((m) => { n += assertSameAsMatchPage(m, "data.json " + m.id); });
  assert.ok(n > 0, "aucun buteur compare");
});

// ------------------------------------------------------------ section d'accueil (faux navigateur)
function fakeNode(extra) {
  const attrs = {};
  const classes = new Set();
  return Object.assign({ innerHTML: "", textContent: "", hidden: false, attrs,
    classList: {
      toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
      contains(c) { return classes.has(c); }, add(c) { classes.add(c); }, remove(c) { classes.delete(c); },
    },
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k] == null ? null : attrs[k]; } }, extra || {});
}
// respond(id) : reponse de match-data (defaut : { data: { isPro, matchs }, error: null }).
// hold : promesse a attendre avant de repondre (chargement en cours).
function browser({ file, isProServer = true, premiumFor = null, respond = null, hold = null, helpers = {}, now = "2026-09-19T10:00:00Z", locale = "fr-FR" } = {}) {
  const list = fakeNode(), sub = fakeNode(), foot = fakeNode(), gate = fakeNode({ hidden: true });
  const section = fakeNode({
    listeners: [],
    querySelector(sel) {
      return { "[data-hs-list]": list, "[data-hs-sub]": sub, "[data-hs-foot]": foot, "[data-hs-gate]": gate }[sel] || null;
    },
    addEventListener(type) { this.listeners.push(type); },
    ownerDocument: {},
  });
  const calls = { fetch: [], invoke: [] };
  const timers = [];
  const clock = { now: new Date(now) };
  const ctx = {
    console,
    setTimeout: (fn, ms) => { timers.push({ kind: "timeout", fn, ms }); return timers.length; },
    clearTimeout: () => {},
    setInterval: (fn, ms) => { timers.push({ kind: "interval", fn, ms }); return timers.length; },
    clearInterval: () => {},
    fetch: (url) => { calls.fetch.push(url); return Promise.resolve({ ok: file != null, json: () => Promise.resolve(file) }); },
    I18N: { t: (k, fb) => fb, localeTag: () => locale, href: (p) => "/fr/" + p },
    IasharkApp: { supabase: { functions: { invoke: (name, opts) => {
      calls.invoke.push([name, opts && opts.body]);
      const id = opts && opts.body && opts.body.id;
      return Promise.resolve(hold).then(() => {
        if (respond) return respond(id);
        const raw = premiumFor ? premiumFor(id) : null;
        return { data: { isPro: isProServer, matchs: raw ? [raw] : [] }, error: null };
      });
    } } } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ["lib/match-time.js", "lib/league-names.js", "lib/insights.js", "lib/buteurs-du-jour.js", "home-scorers.js"].forEach((f) => {
    vm.runInContext(read(f), ctx, { filename: f });
  });
  const ctl = ctx.IasharkHomeScorers.mount(section, { helpers: Object.assign({ now: () => clock.now }, helpers) });
  // Tic de l'horloge de la page (setInterval de 60 s) ou delai des droits (setTimeout).
  const fire = (kind) => timers.filter((x) => x.kind === kind).forEach((x) => x.fn());
  return { ctx, ctl, section, list, sub, foot, gate, calls, clock, timers, fire };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const visible = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const count = (html, re) => (html.match(re) || []).length;
const rows = (html) => html.split(/(?=<li class="hs-card)/).filter((x) => x.startsWith("<li"));
const isoOf = (e) => MT.matchDate({ date: e.kickoff }).toISOString();

function fixtureFile() {
  return B.buildDailyFile(day(), { now: Date.parse("2026-09-19T08:00:00Z") });
}

// Non-abonne : lignes floutees FACTICES, panneau « Débloquer », zero donnee du joueur.
function assertLocked(b, file, dayKey, label) {
  const ms = day();
  const secrets = fixtureSecrets(ms);
  const entries = file.days[dayKey];
  const html = b.list.innerHTML;
  assert.equal(b.section.hidden, false, label);
  assert.equal(count(html, /<li class="hs-card is-locked"><a class="hs-link" href="\/fr\/abonnement\.html" data-vente data-track="home_scorers_locked_row" data-track-kind="home_scorers_locked_row">/g), entries.length, label + " : lignes -> offre Pro");
  assert.equal(count(html, /<li class="hs-card/g), entries.length, label);
  // Rang, heure (visiteur, lib/match-time.js) et competition lisibles, dans l'ordre du fichier.
  entries.forEach((e, i) => assert.ok(html.includes(">0" + (i + 1) + "</span>"), label + " : rang " + (i + 1)));
  assert.deepEqual([...html.matchAll(/<time datetime="([^"]+)">(?:[^<]* · )?\d\d:\d\d<\/time>/g)].map((m) => m[1]), entries.map(isoOf), label + " : heures");
  assert.equal(count(html, /<span class="hs-league">Premier League<\/span>/g), entries.length, label + " : competition");
  assert.equal(count(html, /class="hs-photo hs-ghost" aria-hidden="true"><svg/g), entries.length, label + " : silhouette");
  assert.equal(count(html, /<span class="sr-only">Joueur réservé aux abonnés Pro<\/span>/g), entries.length, label);
  assert.equal(count(html, /<span class="hs-lock sr-only">Probabilité réservée aux abonnés Pro<\/span>/g), entries.length, label);
  // Faux texte floute : uniquement des caracteres de remplissage.
  const fakes = [...html.matchAll(/class="[^"]*hs-blurred[^"]*" aria-hidden="true">([^<]*)</g)].map((m) => m[1]);
  assert.equal(fakes.length, entries.length * 3, label + " : nom, adversaire, probabilite factices");
  fakes.forEach((f) => assert.match(f, /^[Xx?,.% ]+$/, label + " : faux texte « " + f + " »"));
  assert.equal(count(html, /<span class="hs-prob-fake hs-blurred" aria-hidden="true">\?\?,\? %<\/span>/g), entries.length, label);
  // Zero donnee reelle : ni nom, ni equipe, ni photo, ni blason, ni chiffre, ni lien match.
  assertNoSecret(html, secrets, label);
  assert.doesNotMatch(html, /hs-prob-val|<i style="width|data-hs-player|<h3|<img|media\.api-sports\.io|match\.html|contre |Titulaire|≈/, label);
  assert.doesNotMatch(visible(html), /\d\s?%/, label + " : aucun pourcentage");
  assert.doesNotMatch(html.replace(/<span class="hs-prob-fake[^>]*>[^<]*<\/span>/g, ""), /%/, label + " : aucun % hors faux texte");
  assert.equal(b.list.getAttribute("aria-busy"), "false", label);
  // Panneau « Débloquer ».
  assert.equal(b.section.classList.contains("is-locked"), true, label + " : section verrouillee");
  assert.equal(b.gate.hidden, false, label + " : panneau visible");
  const g = b.gate.innerHTML;
  assert.match(g, /<p class="hs-gate-title">Débloque les 3 buteurs du jour<\/p>/, label);
  assert.match(g, /<a class="hs-gate-cta" href="\/fr\/abonnement\.html" data-vente data-track="home_scorers_unlock" data-track-kind="home_scorers_unlock">Débloquer avec Pro/, label);
  assert.match(g, /<p class="hs-gate-small">Résiliable à tout moment depuis ton compte\.<\/p>/, label);
  assertNoSecret(g, secrets, label + " (panneau)");
  // Pied : l'avertissement seul, l'offre est dans le panneau.
  assert.equal(b.foot.innerHTML, '<p class="hs-note">Estimation avant les compositions officielles, jamais une garantie.</p>', label);
  assertNoSecret(b.sub.textContent + b.foot.innerHTML, secrets, label);
  // Rien de calcule ni de demande pour lui.
  assert.deepEqual(b.calls.invoke, [], label + " : jamais de match-data pour un non-abonne");
  assert.deepEqual(Object.keys(b.ctl.state.numbers), [], label);
}

// Abonne Pro dont le joueur n'a pas pu etre confirme : renvoi vers le match, rien de devine.
function assertUnavailable(b, entries, label, secrets) {
  const html = b.list.innerHTML;
  assert.equal(count(html, /<li class="hs-card">/g), entries.length, label);
  entries.forEach((e) => {
    assert.ok(html.includes('<a class="hs-link" href="/fr/match.html?id=' + e.match_id + '" data-track="home_scorers_card"'), label + " : lien vers le match " + e.match_id);
  });
  assert.equal(count(html, /<span class="hs-name">Probabilité à voir sur la page du match<\/span>/g), entries.length, label);
  assert.doesNotMatch(html, /hs-prob-val|<i style="width|data-hs-player|<h3|<img|media\.api-sports\.io|abonnement|data-vente|hs-blurred|Titulaire|≈/, label);
  assert.doesNotMatch(visible(html), /\d\s?%/, label + " : jamais de chiffre ni de 0 %");
  assertNoSecret(html, secrets, label);
  assert.equal(b.section.classList.contains("is-locked"), false, label);
  assert.equal(b.gate.hidden, true, label);
  assert.equal(b.gate.innerHTML, "", label);
  assert.equal(b.list.getAttribute("aria-busy"), "false", label);
}

test("accueil, visiteur ou compte gratuit : lignes verrouillees factices, panneau « Débloquer », aucune donnee de joueur, aucun appel match-data", async () => {
  const file = fixtureFile();
  const viewers = [
    { session: null, isPro: false },
    { session: { user: {} }, isPro: false },
    { session: { user: {} }, isPro: "true" }, // seul true (booleen) vaut Pro
    { session: { user: {} } },
  ];
  for (const viewer of viewers) {
    const label = JSON.stringify(viewer);
    const b = browser({ file, premiumFor: (id) => day().find((m) => String(m.id) === String(id)) });
    await b.ctl.ready;
    await b.ctl.setViewer(viewer);
    await flush();
    assert.deepEqual(b.calls.fetch, ["/buteurs-du-jour.json"], label);
    assertLocked(b, file, "2026-09-19", label);
    assert.match(b.sub.textContent, /aujourd’hui|aujourd'hui/);
    assert.ok(b.section.listeners.includes("error"), "photo introuvable : initiales");
  }
});

test("accueil, droits pas encore connus : 3 lignes d'attente sans lien ; sans reponse sur les droits, verrou standard", async () => {
  const file = fixtureFile();
  const b = browser({ file });
  await b.ctl.ready;
  const html = b.list.innerHTML;
  assert.equal(count(html, /<li class="hs-card" aria-hidden="true"><div class="hs-link">/g), 3, "lignes d'attente masquees aux lecteurs d'ecran");
  assert.equal(count(html, /<span class="hs-sk hs-sk-n" aria-hidden="true"><\/span>/g), 3, "nom en squelette");
  assert.doesNotMatch(html, /<a |href=|hs-blurred|hs-prob-val|data-hs-player|<img/, "ni lien ni donnee");
  assert.deepEqual([...html.matchAll(/<time datetime="([^"]+)">/g)].map((m) => m[1]), file.days["2026-09-19"].map(isoOf), "heure visible");
  assert.equal(count(html, /<span class="hs-league">Premier League<\/span>/g), 3, "competition visible");
  assertNoSecret(html, fixtureSecrets(day()), "attente");
  assert.equal(b.list.getAttribute("aria-busy"), "true");
  assert.equal(b.gate.hidden, true);
  assert.equal(b.section.classList.contains("is-locked"), false);
  assert.deepEqual(b.calls.invoke, []);
  // Aucune reponse de IasharkApp.context() : au bout du delai, verrou standard.
  const delai = b.timers.find((x) => x.kind === "timeout");
  assert.ok(delai && delai.ms > 0 && delai.ms <= 10000, "delai des droits borne");
  b.fire("timeout");
  await flush();
  assertLocked(b, file, "2026-09-19", "delai depasse");
});

test("accueil, abonne Pro confirme : vrais joueurs, probabilite, titularisations et minutes identiques a la page match", async () => {
  const ms = day();
  const file = fixtureFile();
  let release;
  const hold = new Promise((r) => { release = r; });
  const b = browser({ file, hold, premiumFor: (id) => ms.find((m) => String(m.id) === String(id)) });
  await b.ctl.ready;
  const done = b.ctl.setViewer({ session: { user: {} }, isPro: true });
  await flush();
  // Chargement des donnees premium : lignes d'attente, aucun nom, aucun verrou.
  let html = b.list.innerHTML;
  assert.equal(count(html, /<li class="hs-card" aria-hidden="true">/g), 3, "attente pendant match-data");
  assert.doesNotMatch(html, /<a |hs-prob-val|data-hs-player|hs-blurred/);
  assert.equal(b.list.getAttribute("aria-busy"), "true");
  assert.equal(b.gate.hidden, true, "jamais de panneau pour un abonne");
  assert.deepEqual(b.calls.invoke.map(([name, body]) => [name, body.id]), [["match-data", "104"], ["match-data", "102"], ["match-data", "101"]], "une demande par match");
  release();
  await done;
  await flush();
  html = b.list.innerHTML;
  const expected = who(ms, file.days["2026-09-19"], "Pro");
  assert.deepEqual(expected.map((p) => p.name), ["Buteur Eta", "Buteur Gamma", "Buteur Beta"]);
  assert.equal(count(html, /<li class="hs-card" data-hs-player=/g), 3);
  // Ordre : du plus probable au moins probable (egalite : ordre du fichier).
  const order = [...html.matchAll(/data-hs-player="(\d+)"/g)].map((m) => Number(m[1]));
  const sorted = expected.map((p, i) => ({ p, i })).sort((a, c) => c.p.displayProbability - a.p.displayProbability || a.i - c.i).map((x) => x.p.player_id);
  assert.deepEqual(order, sorted);
  expected.forEach((r) => {
    const raw = rawOf(ms, r);
    const card = buildMatchViewModel(raw).players.scoringThreat.find((x) => x.id === r.player_id);
    assert.ok(card, r.name + " sur la carte Marches joueurs");
    const li = rows(html).find((x) => x.includes('data-hs-player="' + r.player_id + '"'));
    assert.ok(li.includes('data-hs-match="' + r.match_id + '"'));
    assert.ok(li.includes('<a class="hs-link" href="/fr/match.html?id=' + r.match_id + '"'), "lien vers la page match");
    assert.ok(li.includes('<h3 class="hs-name">' + card.name + "</h3>"), "meme nom que la carte : " + card.name);
    assert.ok(li.includes('<img class="hs-photo" src="' + card.photo + '" width="40" height="40" loading="lazy" decoding="async" alt="Photo de ' + card.name + '"'), "photo");
    assert.ok(li.includes('<img class="hs-crest" src="https://media.api-sports.io/football/teams/' + r.team_id + '.png"'), "blason");
    assert.ok(li.includes('<span class="hs-vs">contre ' + r.opponent + "</span>"), "adversaire");
    assert.ok(li.includes('<span class="hs-teams">' + card.team + "</span>"), "club");
    assert.match(li, new RegExp('<time datetime="' + escRe(isoOf(r)) + '">\\d\\d:\\d\\d</time>'), "heure");
    const pct = (card.scoringProbability / 100).toLocaleString("fr-FR", { style: "percent", maximumFractionDigits: 1 });
    assert.ok(li.includes('<b class="hs-prob-val">' + pct + "</b>"), r.name + " : " + pct);
    assert.ok(li.includes('<i style="width:' + card.scoringProbability + '%"></i>'), "jauge");
    assert.ok(li.includes("Titulaire <b>" + card.startsLast + "</b>/<b>" + card.teamMatchesLast + "</b>"), "titularisations");
    assert.ok(li.includes("≈<b>" + card.expectedMinutes + "</b> min"), "minutes attendues");
    assert.doesNotMatch(visible(li), /(^|\D)0\s?%/, "jamais 0 %");
  });
  assert.doesNotMatch(html, /réservée aux abonnés Pro|hs-blurred|abonnement\.html|data-vente/);
  assert.equal(b.list.getAttribute("aria-busy"), "false");
  assert.equal(b.gate.hidden, true);
  assert.equal(b.gate.innerHTML, "");
  assert.equal(b.section.classList.contains("is-locked"), false);
  assert.doesNotMatch(b.foot.innerHTML, /hs-cta|abonnement/, "pas d'offre commerciale a un abonne");
  assert.match(b.foot.innerHTML, /Marchés joueurs/);
  assert.equal(b.calls.invoke.length, 3, "aucune demande supplementaire");
});

test("accueil, Pro : echec de match-data, plan non confirme, joueur introuvable ou 0 % -> renvoi vers le match, jamais un nom devine", async () => {
  const ms = day();
  const file = fixtureFile();
  const entries = file.days["2026-09-19"];
  const secrets = fixtureSecrets(ms);
  const real = (id) => ms.find((m) => String(m.id) === String(id));
  const bestOf = (raw, rank) => B.resolvePick(raw, rank);
  const cases = [
    ["match-data vide", { premiumFor: () => null }],
    ["plan non confirme par le serveur", { isProServer: false, premiumFor: real }],
    ["erreur match-data", { respond: () => ({ data: null, error: { message: "401" } }) }],
    ["reseau en panne", { respond: () => { throw new Error("offline"); } }],
    ["autre match renvoye", { premiumFor: () => real(105) }],
    ["probabilite 0", { premiumFor: real, helpers: { resolve: (raw, rank) => Object.assign({}, bestOf(raw, rank), { displayProbability: 0 }) } }],
    ["probabilite absente", { premiumFor: real, helpers: { resolve: (raw, rank) => Object.assign({}, bestOf(raw, rank), { displayProbability: null }) } }],
    ["joueur sans nom", { premiumFor: real, helpers: { resolve: (raw, rank) => Object.assign({}, bestOf(raw, rank), { name: " " }) } }],
    ["resolution en erreur", { premiumFor: real, helpers: { resolve: () => { throw new Error("x"); } } }],
  ];
  for (const [label, opts] of cases) {
    const b = browser(Object.assign({ file }, opts));
    await b.ctl.ready;
    await b.ctl.setViewer({ session: {}, isPro: true });
    await flush();
    assert.equal(b.calls.invoke.length, 3, label);
    assertUnavailable(b, entries, label, secrets);
  }
  // Rang absent des donnees premium (joueur introuvable) : resolvePick rend null.
  const loin = { days: { "2026-09-19": [
    Object.assign({}, entries[0], { match_rank: 2 }),
    Object.assign({}, entries[1], { match_rank: 9 }),
    Object.assign({}, entries[2], { match_rank: 2 }),
  ] } };
  const b = browser({ file: loin, premiumFor: real });
  await b.ctl.ready;
  await b.ctl.setViewer({ session: {}, isPro: true });
  await flush();
  const html = b.list.innerHTML;
  assert.equal(count(html, /<li class="hs-card" data-hs-player=/g), 2, "rangs 2 retrouves");
  assert.equal(count(html, /<span class="hs-name">Probabilité à voir sur la page du match<\/span>/g), 1, "rang 9 : introuvable");
  assert.ok(html.includes('href="/fr/match.html?id=' + entries[1].match_id + '"'));
  // Ordre du fichier conserve quand un joueur manque (pas de tri partiel).
  assert.deepEqual([...html.matchAll(/href="\/fr\/match\.html\?id=(\d+)"/g)].map((m) => Number(m[1])), loin.days["2026-09-19"].map((e) => e.match_id));
  // Un match en echec, les deux autres affiches.
  const b2 = browser({ file, premiumFor: (id) => (String(id) === "102" ? null : real(id)) });
  await b2.ctl.ready;
  await b2.ctl.setViewer({ session: {}, isPro: true });
  await flush();
  const h2 = b2.list.innerHTML;
  assert.equal(count(h2, /class="hs-prob-val"/g), 2);
  assert.ok(h2.includes(">Buteur Eta</h3>") && h2.includes(">Buteur Beta</h3>"));
  assert.doesNotMatch(h2, /Buteur Gamma|Buteur Delta/, "jamais le joueur du match en echec");
  const li102 = rows(h2).find((x) => x.includes('href="/fr/match.html?id=102"'));
  assert.match(li102, /Probabilité à voir sur la page du match/);
  // Rendu unitaire : une probabilite nulle n'est jamais affichee.
  const H = b.ctx.IasharkHomeScorers;
  const zero = H.renderZone("numbers", { name: "X", displayProbability: 0, startsLast: 3, teamMatchesLast: 5, expectedMinutes: 70 });
  assert.doesNotMatch(zero, /0\s?%|hs-prob-val/);
  assert.equal(H.usableNumbers({ name: "X", displayProbability: null }), null);
  assert.equal(H.usableNumbers({ name: "X", displayProbability: 0 }), null);
  assert.equal(H.usableNumbers({ displayProbability: 12 }), null, "jamais un chiffre sans joueur");
  assert.ok(H.usableNumbers({ name: "X", displayProbability: 12 }));
});

test("accueil : section masquee sans donnees exploitables ; bascule seule sur le jour suivant a minuit", async () => {
  const file = fixtureFile();
  const e0 = file.days["2026-09-19"][0];
  for (const f of [
    null, {}, { days: {} },
    { days: { "2026-09-18": file.days["2026-09-19"] } },
    { days: { "2026-09-19": [{ match_id: 101 }] } }, // sans rang
    { days: { "2026-09-19": [{ player_id: 1701, name: "Buteur Eta", match_id: 104 }] } }, // ancien format : ignore
    { days: { "2026-09-19": [Object.assign({}, e0, { match_id: "../../x" })] } },
    { days: { "2026-09-19": [Object.assign({}, e0, { match_id: "1234567890123" })] } },
    { days: { "2026-09-19": [Object.assign({}, e0, { match_rank: -1 })] } },
    { days: { "2026-09-19": [Object.assign({}, e0, { match_rank: 1.5 })] } },
    { days: { "2026-09-19": [Object.assign({}, e0, { match_rank: null })] } },
  ]) {
    const b = browser({ file: f });
    await b.ctl.ready;
    b.ctl.setViewer({ isPro: false });
    assert.equal(b.section.hidden, true, JSON.stringify(f).slice(0, 80));
  }
  // Aujourd'hui vide : demain est montre, avec le sous-titre de demain.
  const vide = { days: { "2026-09-19": [], "2026-09-20": file.days["2026-09-20"] } };
  const b1 = browser({ file: vide });
  await b1.ctl.ready;
  b1.ctl.setViewer({ isPro: false });
  assert.equal(b1.section.hidden, false);
  assert.match(b1.sub.textContent, /demain/);
  assertLocked(b1, vide, "2026-09-20", "demain");
  // Minuit a Paris (visiteur) : la liste du 20 remplace celle du 19, sans rechargement.
  const b2 = browser({ file });
  await b2.ctl.ready;
  b2.ctl.setViewer({ isPro: false });
  assertLocked(b2, file, "2026-09-19", "19");
  const tic = b2.timers.find((x) => x.kind === "interval");
  assert.ok(tic && tic.ms <= 60000, "verification au moins chaque minute");
  b2.clock.now = new Date("2026-09-19T22:05:00Z");
  b2.fire("interval");
  await flush();
  assertLocked(b2, file, "2026-09-20", "20");
  assert.match(b2.sub.textContent, /aujourd/);
  // Plus rien apres le dernier jour du fichier : masquee.
  b2.clock.now = new Date("2026-09-21T10:00:00Z");
  b2.fire("interval");
  assert.equal(b2.section.hidden, true);
  // Minuit pour un abonne Pro : nouveaux matchs demandes, nouveaux joueurs.
  const ms = day();
  const b3 = browser({ file, premiumFor: (id) => ms.find((m) => String(m.id) === String(id)) });
  await b3.ctl.ready;
  await b3.ctl.setViewer({ session: {}, isPro: true });
  await flush();
  assert.ok(b3.list.innerHTML.includes(">Buteur Eta</h3>"));
  b3.clock.now = new Date("2026-09-19T22:05:00Z");
  b3.fire("interval");
  await flush();
  assert.deepEqual(b3.calls.invoke.map(([, body]) => body.id), ["104", "102", "101", "105"], "le match du 20 demande une fois");
  const names = who(ms, file.days["2026-09-20"]).map((p) => p.name);
  assert.equal(names[0], "Buteur Iota");
  const h3 = b3.list.innerHTML;
  names.forEach((n) => assert.ok(h3.includes(">" + n + "</h3>"), n));
  assert.doesNotMatch(h3, /Buteur Eta|Buteur Gamma|Buteur Beta/, "plus aucun joueur de la veille");
  assert.equal(count(h3, /data-hs-match="105"/g), 3);
});

test("accueil : textes echappes, champs d'identite du fichier ignores, entrees invalides ignorees", async () => {
  const file = { days: { "2026-09-19": [
    // Un fichier qui porterait encore une identite : jamais affichee (cleanEntry).
    { match_id: 55, match_rank: 0, league: "<img src=x onerror=alert(1)>", kickoff: "2026-09-19 20:00",
      name: "Nom Secret", player_id: 7, photo: "https://media.api-sports.io/football/players/7.png", team: "Equipe Secrete", probability: 0.42 },
    { match_id: 56, match_rank: 1, league: "A&B \"C\"", kickoff: "2026-09-19 21:00" },
    { match_id: "../../x", match_rank: 0, league: "Mauvais id" },
    { match_id: 57, league: "Sans rang" },
  ] } };
  const b = browser({ file });
  await b.ctl.ready;
  await b.ctl.setViewer({ isPro: false });
  const html = b.list.innerHTML;
  assert.equal(count(html, /<li class="hs-card is-locked">/g), 2);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /<span class="hs-league">&lt;img src=x onerror=alert\(1\)&gt;<\/span>/);
  assert.match(html, /<span class="hs-league">A&amp;B &quot;C&quot;<\/span>/);
  assert.doesNotMatch(html, /Nom Secret|Equipe Secrete|players\/7|42|Mauvais id|Sans rang/);
  assert.deepEqual(JSON.parse(JSON.stringify(b.ctx.IasharkHomeScorers.cleanEntry(file.days["2026-09-19"][0]))),
    { match_id: "55", match_rank: 0, league: "<img src=x onerror=alert(1)>", league_key: null, league_id: null, kickoff: "2026-09-19 20:00" },
    "seuls les champs publics sont gardes");
  // Abonne Pro : identite venue des donnees premium, toujours echappee.
  const bad = { player_id: 7, name: "<img src=x onerror=alert(1)>", photo: "https://x/\"onerror=\"alert(1).png", team: "A&B", team_id: 3,
    opponent: "\"C\"", match_id: 55, league: "L<i>", league_key: null, league_id: null, kickoff: "2026-09-19 20:00", is_home: true,
    displayProbability: 12.3, startsLast: 3, teamMatchesLast: 5, expectedMinutes: 70 };
  const p = browser({ file: { days: { "2026-09-19": [file.days["2026-09-19"][0]] } }, premiumFor: (id) => ({ id: Number(id) }), helpers: { resolve: () => bad } });
  await p.ctl.ready;
  await p.ctl.setViewer({ session: {}, isPro: true });
  await flush();
  const ph = p.list.innerHTML;
  assert.doesNotMatch(ph, /<img src=x|"onerror="|<i>/);
  assert.match(ph, /<h3 class="hs-name">&lt;img src=x onerror=alert\(1\)&gt;<\/h3>/);
  assert.match(ph, /src="https:\/\/x\/&quot;onerror=&quot;alert\(1\)\.png"/);
  assert.match(ph, /<span class="hs-teams">A&amp;B<\/span>/);
  assert.match(ph, /contre &quot;C&quot;/);
  assert.match(ph, /L&lt;i&gt;/);
  assert.match(ph, /<b class="hs-prob-val">12,3\s?%<\/b>/);
});

test("home-scorers.js : exports du tunnel (cleanEntry, renderTeaser, renderGate), plus de cleanPlayer / zoneState / orderPlayers", () => {
  const HS = require("../home-scorers.js");
  ["mount", "pickDay", "cleanEntry", "renderCard", "renderZone", "renderTeaser", "renderGate", "renderList", "renderFoot", "usableNumbers"]
    .forEach((k) => assert.equal(typeof HS[k], "function", k));
  ["cleanPlayer", "zoneState", "orderPlayers"].forEach((k) => assert.equal(HS[k], undefined, k));
  assert.equal(HS.FILE_URL, "/buteurs-du-jour.json");
  assert.equal(HS.cleanEntry({ match_id: 1, match_rank: 0 }).match_id, "1");
  [null, "x", {}, { match_id: 1 }, { match_rank: 0 }, { match_id: "a1", match_rank: 0 }, { match_id: 1, match_rank: "" }]
    .forEach((v) => assert.equal(HS.cleanEntry(v), null, JSON.stringify(v)));
  const gate = HS.renderGate();
  assert.match(gate, /href="\/abonnement\.html"/);
  assert.match(gate, /data-track="home_scorers_unlock"/);
  // Ligne verrouillee rendue seule : aucune donnee autre que heure et competition.
  const H = HS.defaultHelpers();
  const row = HS.renderTeaser({ match_id: "101", match_rank: 0, league: "Ligue X", kickoff: "2026-09-19 20:00" }, 0, "locked", H, null);
  assert.match(row, /^<li class="hs-card is-locked"><a class="hs-link" href="\/abonnement\.html" data-vente data-track="home_scorers_locked_row"/);
  assert.doesNotMatch(row, /101|match\.html/, "ni identifiant ni lien du match");
  assert.match(row, /Ligue X/);
});

// ------------------------------------------------------------ branchements
test("accueil (index.html) : section, plateau (liste + panneau), squelette sans decalage, scripts et styles charges dans l'ordre", () => {
  const html = read("index.html");
  const sec = (html.match(/<section class="hs" id="buteurs-du-jour"[\s\S]*?<\/section>/) || [])[0];
  assert.ok(sec, "section Buteurs du jour");
  assert.ok(html.indexOf('id="buteurs-du-jour"') < html.indexOf('id="decisions"'), "avant la liste des matchs");
  assert.ok(html.indexOf('id="heroFeature"') < html.indexOf('id="buteurs-du-jour"'), "apres le match offert");
  assert.match(sec, /<h2 class="hs-title" id="hsTitle" data-i18n="home_scorers\.title">Buteurs du jour<\/h2>/);
  assert.match(sec, /aria-labelledby="hsTitle"/);
  // Plateau : la liste puis le panneau « Débloquer » (cache), dans le meme cadre.
  assert.match(sec, /<div class="hs-board">\s*<ol class="hs-list" data-hs-list aria-busy="true"[^>]*>[\s\S]*?<\/ol>\s*<div class="hs-gate" data-hs-gate hidden><\/div>\s*<\/div>\s*<div class="hs-foot" data-hs-foot>/);
  const ol = (sec.match(/<ol class="hs-list"[\s\S]*?<\/ol>/) || [""])[0];
  assert.equal(count(ol, /<li class="hs-card" aria-hidden="true">/g), 3, "squelette : 3 lignes");
  assert.equal(count(ol, /<li/g), 3);
  assert.doesNotMatch(ol, /<a |href=|<h3|<img|hs-blurred/, "squelette : ni lien ni joueur");
  assert.doesNotMatch(sec, /\d\s?%/, "aucun chiffre dans le HTML statique");
  const pos = (s) => html.indexOf(s);
  assert.ok(pos('<script src="/lib/match-time.js">') < pos('<script src="/home-scorers.js">'));
  assert.ok(pos('<script src="/lib/league-names.js">') < pos('<script src="/home-scorers.js">'));
  assert.ok(pos('<script src="/lib/insights.js">') < pos('<script src="/lib/buteurs-du-jour.js">'));
  assert.ok(pos('<script src="/lib/buteurs-du-jour.js">') < pos('<script src="/home-scorers.js">'));
  assert.match(html, /<link rel="stylesheet" href="\/assets\/home-scorers\.css">/);
  assert.match(html, /monterButeurs\(\);\n\s*if\(window\.IasharkApp\)\{try\{authCtx=await IasharkApp\.context\(\);\}catch\(e\)\{\}\}\n\s*if\(homeScorers\)homeScorers\.setViewer\(authCtx\);/);
  const js = read("home-scorers.js");
  assert.match(js, /FILE_URL='\/buteurs-du-jour\.json'/, "reference litterale : publiee par scripts/build-public.js");
  assert.doesNotMatch(js, /data\.json['"]/, "jamais data.json");
  assert.match(js, /res\.data\.isPro!==true/, "joueurs seulement si le serveur confirme le plan");
  assert.match(js, /B\.resolvePick\(raw,rank\)/, "meme resolution que lib/buteurs-du-jour.js");
  const css = read("assets/home-scorers.css");
  assert.match(css, /\.hs-zone\{[^}]*min-height:/, "zone chiffree a hauteur fixe");
  assert.match(css, /\.hs-board\{position:relative;\}/, "panneau pose sur la liste");
  assert.match(css, /\.hs-gate\{position:absolute;inset:0;/);
  assert.match(css, /\.hs-gate\[hidden\]\{display:none;\}/, "panneau cache pour un abonne");
  // Le flou n'habille que du contenu factice ou verrouille (aucune vraie donnee dans le DOM).
  const blurred = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^}]*filter:blur/g)].map((m) => m[1].trim());
  assert.ok(blurred.length > 0);
  blurred.forEach((s) => assert.ok([".hs-blurred", ".hs.is-locked .hs-list .hs-link"].includes(s), "flou hors verrou : " + s));
});

test("i18n : cles home_scorers identiques dans les 7 langues (dict et parts), regles du manifeste pour les textes statiques", () => {
  const LOCS = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
  const fr = JSON.parse(read("i18n/dict/fr.json")).home_scorers;
  const ref = Object.keys(fr).sort();
  assert.ok(ref.length >= 20);
  ["gate_title", "gate_text", "gate_cta", "gate_small", "hidden_player"].forEach((k) => assert.ok(ref.includes(k), k));
  assert.equal(fr.starts_recent, "Titulaire {n}/{total}");
  assert.equal(fr.expected_minutes, "≈{n} min");
  LOCS.forEach((l) => {
    const d = JSON.parse(read("i18n/dict/" + l + ".json")).home_scorers;
    const p = JSON.parse(read("i18n/parts/scorers." + l + ".json")).home_scorers;
    assert.deepEqual(Object.keys(d).sort(), ref, l);
    assert.deepEqual(p, d, l + " : part et dictionnaire identiques");
    Object.keys(d).forEach((k) => assert.ok(String(d[k]).trim(), l + "." + k));
    ["subtitle_date", "photo_alt", "starts_recent", "expected_minutes", "opponent_line"].forEach((k) => {
      const vars = (fr[k].match(/\{\w+\}/g) || []).sort();
      assert.deepEqual((d[k].match(/\{\w+\}/g) || []).sort(), vars, l + "." + k + " : variables");
    });
  });
  // Textes de repli de home-scorers.js = dictionnaire francais (a l'apostrophe pres).
  const js = read("home-scorers.js");
  const re = /\bt[f]?(?:Html)?\('home_scorers\.(\w+)','((?:[^'\\]|\\.)*)'/g;
  let m, n = 0;
  while ((m = re.exec(js))) {
    n++;
    assert.ok(fr[m[1]] != null, "cle absente du dictionnaire : " + m[1]);
    assert.equal(m[2].replace(/’/g, "'"), fr[m[1]].replace(/’/g, "'"), "repli " + m[1]);
  }
  assert.ok(n >= 20);
  const manifest = require("../scripts/i18n-manifest.js");
  const rules = manifest.find((p) => p.file === "index.html").replacements;
  const html = read("index.html");
  const mine = rules.filter((r) => /hs-|home_scorers|Buteurs du jour/.test(r.find));
  assert.equal(mine.length, 5);
  mine.forEach((r) => {
    assert.equal(html.split(r.find).length - 1, 1, "une occurrence : " + r.find.slice(0, 60));
    LOCS.forEach((l) => {
      const v = r.build(JSON.parse(read("i18n/dict/" + l + ".json")), l, (s) => s);
      assert.ok(v && !/undefined/.test(v), l + " : " + r.find.slice(0, 40));
    });
  });
});

test("pipeline : fichier ecrit apres la garde coup d'envoi, avant la copie publique, ajoute au commit, jamais bloquant", () => {
  const wf = read(".github/workflows/update-data.yml");
  const fn = wf.slice(wf.indexOf("function ecrireButeursDuJour("), wf.indexOf("// sitemap-fr.xml ne liste plus"));
  assert.ok(fn.length > 100, "fonction ecrireButeursDuJour");
  assert.match(fn, /try\{\s*var BUTEURS_LIB=require\('\.\/lib\/buteurs-du-jour\.js'\);/);
  assert.match(fn, /fs\.writeFileSync\(FICHIER_BUTEURS,JSON\.stringify\(fichierButeurs,null,2\)\)/);
  assert.match(fn, /var FICHIER_BUTEURS='buteurs-du-jour\.json';/);
  assert.match(fn, /\}catch\(e\)\{\s*console\.log\('  \[BUTEURS\] ERREUR/);
  assert.match(fn, /console\.log\('  \[BUTEURS\] buteurs-du-jour\.json : '/);
  const main = wf.slice(wf.indexOf("async function main(){"));
  const guard = main.indexOf("GARDE COUP D'ENVOI, SECOND PASSAGE");
  const call = main.indexOf("ecrireButeursDuJour(allMatchsData,");
  const gratuit = main.indexOf("(function designerMatchGratuit(){");
  const publics = main.indexOf("var matchsPublics=allMatchsData.map(");
  assert.ok(guard !== -1 && call > guard && call > gratuit && call < publics, "apres la garde et avant le retrait des champs premium");
  assert.match(main.slice(call - 200, call + 250), /kickoffGate\(FIXTURE_BY_ID\[String\(m\.id\)\],BUTEURS_MS,\{marginMinutes:KICKOFF_MARGIN_MINUTES\}\)\.open/);
  assert.match(main, /injectHomeSeoSummary\(\[\]\);\n\s*ecrireButeursDuJour\(\[\], null\);/, "jour sans match : fichier vide mais present");
  const outputs = (wf.match(/OUTPUTS="([^"]+)"/) || [])[1] || "";
  assert.ok(outputs.split(/\s+/).includes("buteurs-du-jour.json"), "ajoute au git add du commit quotidien");
  assert.match(wf, /git add \$OUTPUTS /);
});
