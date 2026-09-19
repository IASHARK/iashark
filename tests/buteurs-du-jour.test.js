"use strict";
// BUTEURS DU JOUR (19/09/2026) : lib/buteurs-du-jour.js (classement, fichier
// public, chiffres Pro), home-scorers.js (section de l'accueil, rendue ici dans
// un faux navigateur vm), branchement dans index.html / i18n et pipeline
// (.github/workflows/update-data.yml).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const B = require("../lib/buteurs-du-jour.js");
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
const ids = (list) => list.map((p) => p.player_id);

// ------------------------------------------------------------ classement
test("classement : 3 joueurs, deterministe quel que soit l'ordre des matchs, jour de Paris respecte", () => {
  const ms = day();
  const a = B.topScorersOfDay(ms, { day: "2026-09-19" });
  assert.equal(a.length, 3);
  const b = B.topScorersOfDay(ms.slice().reverse(), { day: "2026-09-19" });
  const c = B.topScorersOfDay([ms[2], ms[0], ms[4], ms[3], ms[1]], { day: "2026-09-19" });
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.ok(!a.some((p) => p.match_id === 105), "jamais un match d'un autre jour");
  // Du plus probable au moins probable, meme calcul que la page match.
  const probs = a.map((p) => B.scorerNumbersFor(ms.find((m) => m.id === p.match_id), p.player_id).displayProbability);
  for (let i = 1; i < probs.length; i++) assert.ok(probs[i - 1] >= probs[i], probs.join(" >= "));
  // Le meilleur joueur de chaque match retenu est bien le premier « shown » de son match.
  a.forEach((p) => {
    const r = scorerModel.rankMatch(B.scorerInput(ms.find((m) => m.id === p.match_id)));
    assert.equal(r.shown[0].id, p.player_id);
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
});

test("un seul joueur par match, sauf s'il y a moins de 3 matchs avec un candidat", () => {
  const top = B.topScorersOfDay(day(), { day: "2026-09-19" });
  assert.equal(new Set(top.map((p) => p.match_id)).size, 3, "3 matchs differents");
  // Sans la regle, les 3 plus probables compteraient deux joueurs du meme match.
  const naif = day().filter((m) => m.date.startsWith("2026-09-19")).flatMap((m) => B.candidatesForMatch(m))
    .sort((a, b) => b.probability - a.probability).slice(0, 3);
  assert.ok(new Set(naif.map((x) => x.entry.match_id)).size < 3, "le jeu de donnees doit exercer la regle");
  const deux = B.topScorersOfDay(day().slice(0, 2), { day: "2026-09-19" });
  assert.equal(deux.length, 3, "2 matchs : on complete avec le suivant");
  assert.equal(new Set(deux.map((p) => p.match_id)).size, 2);
  assert.equal(new Set(ids(deux)).size, 3, "jamais deux fois le meme joueur");
  assert.deepEqual(B.topScorersOfDay([], { day: "2026-09-19" }), []);
  assert.deepEqual(B.topScorersOfDay(null), []);
});

test("titulaires probables uniquement : jamais un remplacant, jamais un gardien", () => {
  const ms = day();
  for (let limit = 1; limit <= 12; limit++) {
    const top = B.topScorersOfDay(ms, { day: "2026-09-19", limit });
    assert.ok(!top.some((p) => p.player_id === 1302), "remplacant jamais titularise");
    top.forEach((p) => {
      const r = scorerModel.rankMatch(B.scorerInput(ms.find((m) => m.id === p.match_id)));
      const c = r.shown.find((x) => x.id === p.player_id);
      assert.ok(c, p.name + " doit etre un candidat « shown » de la carte Marches joueurs");
      assert.ok(c.startProbability >= scorerModel.PARAMS.minStartProbability);
      assert.notEqual(c.position, "G");
    });
  }
});

test("absent annonce ou joueur sorti de l'effectif : jamais retenu", () => {
  const ms = day();
  const avant = B.topScorersOfDay(ms, { day: "2026-09-19" });
  const star = avant[0];
  const m = ms.find((x) => x.id === star.match_id);
  m.injuries = [{ team: star.team_id, name: star.name.toUpperCase() + " ", reason: "Genou", status: "Missing Fixture" }];
  const apres = B.topScorersOfDay(ms, { day: "2026-09-19" });
  assert.ok(!apres.some((p) => p.player_id === star.player_id), "blesse annonce exclu");
  assert.equal(B.scorerNumbersFor(m, star.player_id), null, "aucun chiffre pour un absent");
  // Effectif actuel connu (11 joueurs ou plus) sans lui : parti, exclu.
  m.injuries = [];
  const side = star.is_home ? "home" : "away";
  const autres = m.player_history[side].map((r) => r.player_id).filter((id, i, arr) => arr.indexOf(id) === i && id !== star.player_id);
  while (autres.length < 11) autres.push(990000 + autres.length);
  m.current_squads = { [side]: autres.map((id) => ({ player_id: id })) };
  const sansLui = B.topScorersOfDay(ms, { day: "2026-09-19" });
  assert.ok(!sansLui.some((p) => p.player_id === star.player_id), "joueur hors effectif exclu");
});

test("garde coup d'envoi : un match refuse par isEligible ne fournit aucun joueur ; une erreur du filtre n'est pas fatale", () => {
  const ms = day();
  const top = B.topScorersOfDay(ms, { day: "2026-09-19", isEligible: (m) => m.id !== 104 });
  assert.ok(!top.some((p) => p.match_id === 104));
  const boom = B.topScorersOfDay(ms, { day: "2026-09-19", isEligible: () => { throw new Error("x"); } });
  assert.deepEqual(boom, []);
});

// ------------------------------------------------------------ fichier public
const FORBIDDEN_KEYS = /prob|conf|lambda|edge|kelly|expected|starts|minutes|rate|share|pick|pari|cote|market/i;
function assertPublicFile(file, label) {
  assert.deepEqual(Object.keys(file).sort(), ["days", "generated_at"], label);
  Object.keys(file.days).forEach((d) => {
    assert.match(d, /^\d{4}-\d{2}-\d{2}$/, label);
    assert.ok(Array.isArray(file.days[d]) && file.days[d].length <= 3, label);
    file.days[d].forEach((p) => {
      assert.deepEqual(Object.keys(p).sort(), B.PUBLIC_FIELDS.slice().sort(), label + " : champs publics uniquement");
      Object.keys(p).forEach((k) => {
        assert.doesNotMatch(k, FORBIDDEN_KEYS, label + " : champ " + k);
        assert.ok(!PREMIUM.PREMIUM_FIELDS.includes(k) && !PREMIUM.DEEP_PREMIUM_KEYS.includes(k), label + " : champ premium " + k);
      });
      assert.ok(typeof p.name === "string" && p.name.trim(), label + " : joueur sans nom");
      assert.ok(Number.isFinite(p.player_id) && p.match_id != null, label);
      assert.equal(typeof p.is_home, "boolean");
    });
  });
  assert.deepEqual(PREMIUM.deepPremiumLeaks(file), [], label);
  assert.doesNotMatch(JSON.stringify(file), /probab|displayProbability|startProbability|expectedMinutes|lambda/i, label);
}

test("fichier public : aucune probabilite ni champ premium, jours de Paris aujourd'hui et demain", () => {
  const now = Date.parse("2026-09-19T08:00:00Z");
  const file = B.buildDailyFile(day(), { now });
  assert.deepEqual(Object.keys(file.days), ["2026-09-19", "2026-09-20"]);
  assert.equal(file.days["2026-09-19"].length, 3);
  assert.equal(file.days["2026-09-20"][0].player_id, 1901);
  assert.equal(file.generated_at, new Date(now).toISOString());
  assertPublicFile(file, "buildDailyFile");
  // 23:30 UTC le 19 = 01:30 a Paris le 20 : le fichier suit le jour de Paris.
  assert.deepEqual(Object.keys(B.buildDailyFile([], { now: Date.parse("2026-09-19T23:30:00Z") }).days), ["2026-09-20", "2026-09-21"]);
  assert.equal(B.parisDay(Date.parse("2026-09-19T21:59:00Z")), "2026-09-19");
  assert.equal(B.parisDay(Date.parse("2026-09-19T22:01:00Z")), "2026-09-20");
});

test("fichier public reel (buteurs-du-jour.json du depot) : format public, aucune fuite", () => {
  if (!fs.existsSync(path.join(ROOT, "buteurs-du-jour.json"))) return;
  assertPublicFile(JSON.parse(read("buteurs-du-jour.json")), "buteurs-du-jour.json");
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
    assert.ok(c, label + " : candidat public manquant");
    assert.equal(c.entry.name, p.name, label + " : meme nom que la carte");
    assert.equal(c.entry.photo, p.photo || null, label + " : meme photo que la carte");
    assert.equal(c.entry.team, p.team, label);
  });
  return threat.length;
}

test("abonne Pro : scorerNumbersFor rend exactement les chiffres de la carte « Marches joueurs » (lib/match-view-model.js)", () => {
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

test("abonne Pro : memes chiffres que la page match sur les vraies donnees publiques (data.json)", () => {
  if (!fs.existsSync(path.join(ROOT, "data.json"))) return;
  const matchs = (JSON.parse(read("data.json")).matchs || []).filter((m) => m && m.player_history);
  let n = 0;
  matchs.forEach((m) => { n += assertSameAsMatchPage(m, "data.json " + m.id); });
  assert.ok(n > 0, "aucun buteur compare");
});

// ------------------------------------------------------------ section d'accueil (faux navigateur)
function fakeNode() {
  const attrs = {};
  return { innerHTML: "", textContent: "", hidden: false, attrs,
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k] == null ? null : attrs[k]; } };
}
function browser({ file, isProServer = true, premiumFor = null, now = "2026-09-19T10:00:00Z", locale = "fr-FR" } = {}) {
  const list = fakeNode(), sub = fakeNode(), foot = fakeNode();
  const section = Object.assign(fakeNode(), {
    listeners: [],
    querySelector(sel) { return sel === "[data-hs-list]" ? list : sel === "[data-hs-sub]" ? sub : sel === "[data-hs-foot]" ? foot : null; },
    addEventListener(type, fn) { this.listeners.push(type); },
    ownerDocument: {},
  });
  const calls = { fetch: [], invoke: [] };
  const clock = { now: new Date(now) };
  const ctx = {
    console,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    fetch: (url) => { calls.fetch.push(url); return Promise.resolve({ ok: file != null, json: () => Promise.resolve(file) }); },
    I18N: { t: (k, fb) => fb, localeTag: () => locale, href: (p) => "/fr/" + p },
    IasharkApp: { supabase: { functions: { invoke: (name, opts) => {
      calls.invoke.push([name, opts && opts.body]);
      const id = opts && opts.body && opts.body.id;
      const raw = premiumFor ? premiumFor(id) : null;
      return Promise.resolve({ data: { isPro: isProServer, matchs: raw ? [raw] : [] }, error: null });
    } } } },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ["lib/match-time.js", "lib/league-names.js", "lib/insights.js", "lib/buteurs-du-jour.js", "home-scorers.js"].forEach((f) => {
    vm.runInContext(read(f), ctx, { filename: f });
  });
  const ctl = ctx.IasharkHomeScorers.mount(section, { helpers: { now: () => clock.now } });
  return { ctx, ctl, section, list, sub, foot, calls, clock };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const visible = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function fixtureFile() {
  return B.buildDailyFile(day(), { now: Date.parse("2026-09-19T08:00:00Z") });
}

test("accueil, visiteur ou compte gratuit : 3 joueurs, verrou Pro, aucun chiffre, aucune donnee premium demandee", async () => {
  const file = fixtureFile();
  for (const viewer of [{ session: null, isPro: false }, { session: { user: {} }, isPro: false }]) {
    const b = browser({ file });
    await b.ctl.ready;
    b.ctl.setViewer(viewer);
    await flush();
    assert.equal(b.section.hidden, false);
    assert.deepEqual(b.calls.fetch, ["/buteurs-du-jour.json"]);
    assert.deepEqual(b.calls.invoke, [], "jamais de match-data pour un non-abonne");
    const html = b.list.innerHTML;
    assert.equal((html.match(/<li class="hs-card"/g) || []).length, 3);
    file.days["2026-09-19"].forEach((p, i) => {
      assert.ok(html.includes(">" + p.name + "</h3>"), p.name);
      assert.ok(html.includes('href="/fr/match.html?id=' + p.match_id + '"'), "lien vers la page match");
      assert.ok(html.includes(">0" + (i + 1) + "</span>"), "rang " + (i + 1));
    });
    assert.equal((html.match(/Probabilité réservée aux abonnés Pro/g) || []).length, 3);
    assert.doesNotMatch(visible(html), /\d+(?:[.,]\d)?\s?%/, "aucun pourcentage");
    assert.doesNotMatch(html, /hs-prob-val|<i style="width/, "ni valeur ni jauge remplie");
    assert.equal((html.match(/class="hs-gauge is-empty"/g) || []).length, 3, "jauge vide, sans chiffre");
    assert.match(html, /<img class="hs-photo" src="https:\/\/media\.api-sports\.io\/football\/players\/\d+\.png" width="40" height="40" loading="lazy" decoding="async" alt="Photo de [^"]+"/);
    assert.match(html, /<time datetime="2026-09-19T\d\d:\d\d:00\.000Z">\d\d:\d\d<\/time>/, "heure du visiteur (lib/match-time.js)");
    assert.equal(b.list.getAttribute("aria-busy"), "false");
    assert.match(b.foot.innerHTML, /class="hs-cta" href="\/fr\/abonnement\.html" data-vente/);
    assert.match(b.sub.textContent, /aujourd’hui|aujourd'hui/);
    assert.ok(b.section.listeners.includes("error"), "photo introuvable : initiales");
  }
});

test("accueil, abonne Pro confirme : probabilite, titularisations et minutes identiques a la page match", async () => {
  const ms = day();
  const file = fixtureFile();
  const b = browser({ file, premiumFor: (id) => ms.find((m) => String(m.id) === String(id)) });
  await b.ctl.ready;
  await b.ctl.setViewer({ session: { user: {} }, isPro: true });
  await flush();
  assert.equal(b.calls.invoke.length, 3, "une demande match-data par match");
  b.calls.invoke.forEach(([name, body]) => { assert.equal(name, "match-data"); assert.match(String(body.id), /^\d+$/); });
  const html = b.list.innerHTML;
  assert.doesNotMatch(html, /réservée aux abonnés Pro/);
  file.days["2026-09-19"].forEach((p) => {
    const m = ms.find((x) => x.id === p.match_id);
    const card = buildMatchViewModel(m).players.scoringThreat.find((x) => x.id === p.player_id);
    const pct = (card.scoringProbability / 100).toLocaleString("fr-FR", { style: "percent", maximumFractionDigits: 1 });
    const li = html.split('<li class="hs-card"').find((x) => x.includes('data-hs-player="' + p.player_id + '"'));
    assert.ok(li.includes('<b class="hs-prob-val">' + pct + "</b>"), p.name + " : " + pct);
    assert.ok(li.includes("Titulaire <b>" + card.startsLast + "</b>/<b>" + card.teamMatchesLast + "</b>"), "titularisations");
    assert.ok(li.includes("≈<b>" + card.expectedMinutes + "</b> min"), "minutes attendues");
    assert.doesNotMatch(visible(li), /(^|\D)0\s?%/, "jamais 0 %");
  });
  assert.doesNotMatch(b.foot.innerHTML, /hs-cta/, "pas d'offre commerciale a un abonne");
  assert.match(b.foot.innerHTML, /Marchés joueurs/);
});

test("accueil, Pro : echec de match-data ou plan non confirme par le serveur -> verrou, jamais de chiffre ni de 0 %", async () => {
  const ms = day();
  const file = fixtureFile();
  for (const opts of [
    { premiumFor: () => null },
    { isProServer: false, premiumFor: (id) => ms.find((m) => String(m.id) === String(id)) },
  ]) {
    const b = browser(Object.assign({ file }, opts));
    await b.ctl.ready;
    await b.ctl.setViewer({ session: {}, isPro: true });
    await flush();
    const html = b.list.innerHTML;
    assert.equal((html.match(/hs-lock is-pro/g) || []).length, 3);
    assert.doesNotMatch(visible(html), /\d\s?%/);
  }
  // Probabilite nulle : jamais affichee.
  const ctx = browser({ file }).ctx;
  const zero = ctx.IasharkHomeScorers.renderZone("numbers", { displayProbability: 0, startsLast: 3, teamMatchesLast: 5, expectedMinutes: 70 });
  assert.doesNotMatch(zero, /0\s?%|hs-prob-val/);
  assert.equal(ctx.IasharkHomeScorers.usableNumbers({ displayProbability: null }), null);
});

test("accueil : section masquee sans donnees exploitables ; bascule seule sur le jour suivant a minuit", async () => {
  for (const file of [null, {}, { days: {} }, { days: { "2026-09-18": fixtureFile().days["2026-09-19"] } }, { days: { "2026-09-19": [{ name: "Sans id" }] } }]) {
    const b = browser({ file });
    await b.ctl.ready;
    assert.equal(b.section.hidden, true, JSON.stringify(file).slice(0, 60));
  }
  const file = fixtureFile();
  // Aujourd'hui vide : demain est montre, avec le sous-titre de demain.
  const vide = { days: { "2026-09-19": [], "2026-09-20": file.days["2026-09-20"] } };
  const b1 = browser({ file: vide });
  await b1.ctl.ready;
  assert.equal(b1.section.hidden, false);
  assert.match(b1.sub.textContent, /demain/);
  // Minuit a Paris : la liste du 20 remplace celle du 19, sans rechargement.
  const b2 = browser({ file });
  await b2.ctl.ready;
  assert.ok(b2.list.innerHTML.includes('data-hs-match="101"') || b2.list.innerHTML.includes('data-hs-match="104"'));
  b2.clock.now = new Date("2026-09-19T22:05:00Z");
  b2.ctl.render();
  assert.ok(b2.list.innerHTML.includes('data-hs-match="105"'));
  assert.match(b2.sub.textContent, /aujourd/);
  // Plus rien apres le dernier jour du fichier : masquee.
  b2.clock.now = new Date("2026-09-21T10:00:00Z");
  b2.ctl.render();
  assert.equal(b2.section.hidden, true);
});

test("accueil : textes et noms echappes, entree publique incomplete ignoree", async () => {
  const file = { days: { "2026-09-19": [
    { player_id: 7, name: "<img src=x onerror=alert(1)>", team: "A&B", opponent: "\"C\"", match_id: 55, kickoff: "2026-09-19 20:00" },
    { player_id: 8, name: "Sans match" },
    { player_id: 9, name: "Mauvais id", match_id: "../../x" },
  ] } };
  const b = browser({ file });
  await b.ctl.ready;
  b.ctl.setViewer({ isPro: false });
  const html = b.list.innerHTML;
  assert.equal((html.match(/<li class="hs-card"/g) || []).length, 1);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /A&amp;B/);
  assert.match(html, /photo|hs-avatar/, "sans photo : initiales");
});

// ------------------------------------------------------------ branchements
test("accueil (index.html) : section, squelette sans decalage, scripts et styles charges dans l'ordre", () => {
  const html = read("index.html");
  const sec = (html.match(/<section class="hs" id="buteurs-du-jour"[\s\S]*?<\/section>/) || [])[0];
  assert.ok(sec, "section Buteurs du jour");
  assert.ok(html.indexOf('id="buteurs-du-jour"') < html.indexOf('id="decisions"'), "avant la liste des matchs");
  assert.ok(html.indexOf('id="heroFeature"') < html.indexOf('id="buteurs-du-jour"'), "apres le match offert");
  assert.match(sec, /<h2 class="hs-title" id="hsTitle" data-i18n="home_scorers\.title">Buteurs du jour<\/h2>/);
  assert.match(sec, /aria-labelledby="hsTitle"/);
  assert.equal((sec.match(/<li class="hs-card" aria-hidden="true">/g) || []).length, 3, "squelette : 3 cartes");
  assert.doesNotMatch(sec, /\d\s?%/, "aucun chiffre dans le HTML statique");
  const pos = (s) => html.indexOf(s);
  assert.ok(pos('<script src="/lib/match-time.js">') < pos('<script src="/home-scorers.js">'));
  assert.ok(pos('<script src="/lib/insights.js">') < pos('<script src="/lib/buteurs-du-jour.js">'));
  assert.ok(pos('<script src="/lib/buteurs-du-jour.js">') < pos('<script src="/home-scorers.js">'));
  assert.match(html, /<link rel="stylesheet" href="\/assets\/home-scorers\.css">/);
  assert.match(html, /monterButeurs\(\);\n\s*if\(window\.IasharkApp\)\{try\{authCtx=await IasharkApp\.context\(\);\}catch\(e\)\{\}\}\n\s*if\(homeScorers\)homeScorers\.setViewer\(authCtx\);/);
  const js = read("home-scorers.js");
  assert.match(js, /FILE_URL='\/buteurs-du-jour\.json'/, "reference litterale : publiee par scripts/build-public.js");
  assert.doesNotMatch(js, /data\.json['"]/, "jamais data.json");
  assert.match(js, /res\.data\.isPro!==true/, "chiffres seulement si le serveur confirme le plan");
  const css = read("assets/home-scorers.css");
  assert.doesNotMatch(css, /filter:blur/, "rien de floute : aucune donnee cachee dans le DOM");
  assert.match(css, /\.hs-zone\{[^}]*min-height:/, "zone chiffree a hauteur fixe");
});

test("i18n : cles home_scorers identiques dans les 7 langues (dict et parts), regles du manifeste pour les textes statiques", () => {
  const LOCS = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
  const ref = Object.keys(JSON.parse(read("i18n/dict/fr.json")).home_scorers).sort();
  assert.ok(ref.length >= 15);
  LOCS.forEach((l) => {
    const d = JSON.parse(read("i18n/dict/" + l + ".json")).home_scorers;
    const p = JSON.parse(read("i18n/parts/scorers." + l + ".json")).home_scorers;
    assert.deepEqual(Object.keys(d).sort(), ref, l);
    assert.deepEqual(p, d, l + " : part et dictionnaire identiques");
    Object.keys(d).forEach((k) => assert.ok(String(d[k]).trim(), l + "." + k));
    ["subtitle_date", "photo_alt", "starts_recent", "expected_minutes", "opponent_line"].forEach((k) => {
      const vars = (JSON.parse(read("i18n/dict/fr.json")).home_scorers[k].match(/\{\w+\}/g) || []).sort();
      assert.deepEqual((d[k].match(/\{\w+\}/g) || []).sort(), vars, l + "." + k + " : variables");
    });
  });
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
