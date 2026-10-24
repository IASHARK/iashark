"use strict";
// « Le film du match » (controle historique-public du 24/10/2026). La page affichait
// « Tranche la plus fournie : 31-45+ min, 26 % ... Sur 51 buts marques par Arsenal et
// Everton lors de leurs 20 derniers matchs ». Recompte reel : 61 buts, tranche 76-90+.
// Causes : un match aux evenements vides (plafond d'appels, erreur) comptait quand meme,
// avec zero but ; un but annule pouvait rester dans les evenements ; et « 20 derniers
// matchs » etait en fait les 20 derniers matchs de CHAMPIONNAT.
// Ici on rejoue le VRAI code du pipeline (calcEventsPattern + evenementsPublics de
// update-data.yml) puis le rendu de la page.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FILM = require("../lib/film-du-match.js");
const MS = require("../lib/match-sections.js");
const { buildMatchViewModel } = require("../lib/match-view-model.js");
const LEAGUES_CONFIG = require("../config/leagues.json");

const ROOT = path.join(__dirname, "..");
const WF = fs.readFileSync(path.join(ROOT, ".github", "workflows", "update-data.yml"), "utf8");
const SCRIPT = (() => {
  const debut = WF.indexOf("cat > pipeline.js << 'JSEOF'\n");
  return WF.slice(debut, WF.indexOf("\n          JSEOF", debut)).split("\n").slice(1).map((l) => (l.startsWith("          ") ? l.slice(10) : l)).join("\n");
})();

// calcEventsPattern et evenementsPublics, tels qu'ecrits dans le pipeline.
function evenementsPublicsDuPipeline(lgId, international) {
  const calc = SCRIPT.slice(SCRIPT.indexOf("function calcEventsPattern(eventsArr,teamId){"), SCRIPT.indexOf("var evPatH=calcEventsPattern("));
  const pub = SCRIPT.slice(SCRIPT.indexOf("var ligueFilm="), SCRIPT.indexOf("var evPubH="));
  assert.ok(calc.length > 500 && pub.length > 300, "code du pipeline introuvable");
  const fabrique = new Function("isInternationalMatch", "LEAGUES_CONFIG", "lg", "FILM_DU_MATCH", "console", calc + pub + "\nreturn { calcEventsPattern, evenementsPublics };");
  return fabrique(!!international, LEAGUES_CONFIG, { id: lgId }, FILM, { log() {} });
}

// ---------------------------------------------------------------- donnees de test
const ARSENAL = 42, EVERTON = 45;
let prochainId = 1000;
// Un match joue par `equipe` : buts = [["eq" | "adv", minute, detail?], ...].
// Score a 90 minutes deduit des buts (hors penalty manque), sauf `opts.pourAuScore`.
function match(equipe, buts, opts) {
  const o = opts || {};
  const id = prochainId++;
  const adv = 5000 + id;
  const dom = id % 2 ? equipe : adv, ext = dom === equipe ? adv : equipe;
  const qui = (q) => (q === "eq" ? equipe : adv);
  const evs = buts.map(([q, min, detail]) => ({ time: { elapsed: min, extra: null }, team: { id: qui(q) }, player: { name: "X" }, type: "Goal", detail: detail || "Normal Goal" }));
  evs.push({ time: { elapsed: 62, extra: null }, team: { id: equipe }, type: "subst", detail: "Substitution 1" });
  const compte = (camp) => buts.filter(([q, , d]) => qui(q) === camp && d !== "Missed Penalty").length;
  const score = { home: compte(dom), away: compte(ext) };
  // Score officiel different des evenements (but annule reste dans les evenements).
  if (o.pourAuScore != null) score[dom === equipe ? "home" : "away"] = o.pourAuScore;
  return {
    fx: { fixture: { id, timestamp: 2e9 - id, status: { short: "FT" } }, teams: { home: { id: dom }, away: { id: ext } }, goals: score, score: { fulltime: score } },
    ev: o.vide ? [] : evs.concat(o.extra || []),
    // Buts reellement marques / encaisses par `equipe` sur ce match (temps reglementaire).
    pour: o.pourAuScore != null ? o.pourAuScore : compte(equipe), contre: compte(adv)
  };
}
// 20 matchs varies, minutes reparties sur les 6 tranches.
function saison(equipe, n, graine) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const m1 = 5 + ((i * 13 + graine) % 85), m2 = 5 + ((i * 29 + graine * 3) % 85), m3 = 5 + ((i * 7 + graine * 5) % 85);
    const buts = [["eq", m1]];
    if (i % 2 === 0) buts.push(["eq", m2]);
    if (i % 3 === 0) buts.push(["adv", m3]);
    out.push(match(equipe, buts));
  }
  return out;
}
const total = (ms, cle) => ms.reduce((s, m) => s + m[cle], 0);
const somme = (slots) => slots.reduce((s, x) => s + x.n, 0);

function rawPage(eh, ea, extra) {
  return Object.assign({ id: 1, date: "2026-10-24 16:00", league: "Premier League", league_id: 39, league_key: "premier",
    home: { id: ARSENAL, n: "Arsenal" }, away: { id: EVERTON, n: "Everton" }, events_home: eh, events_away: ea }, extra || {});
}
function rendreFilm(raw) {
  const vm = buildMatchViewModel(raw);
  const html = MS.film({ raw, vm, vuePro: false, verrouPro: false, dit: MS.registre(), contenus: [] });
  return { vm, html, texte: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
}

// ---------------------------------------------------------------- le cas du 24/10
test("film : un match aux evenements vides ou incoherents n'entre pas dans le compte (cas Arsenal - Everton du 24/10)", () => {
  const P = evenementsPublicsDuPipeline(39);
  const ars = saison(ARSENAL, 17, 1);
  // Deux matchs dont la liste d'evenements est revenue vide (plafond d'appels) : 2 et 3 buts perdus.
  ars.push(match(ARSENAL, [["eq", 10], ["eq", 80]], { vide: true }));
  ars.push(match(ARSENAL, [["eq", 20], ["eq", 50], ["eq", 88]], { vide: true }));
  // Un but annule reste dans les evenements : 2 buts dans les evenements, 1 au score.
  ars.push(match(ARSENAL, [["eq", 55], ["eq", 59]], { pourAuScore: 1 }));
  const eve = saison(EVERTON, 20, 4);

  // AVANT (meme code de comptage, sans le controle) : 20 matchs annonces, 5 buts disparus, 1 en trop.
  const ancien = P.calcEventsPattern(ars.map((m) => m.ev), ARSENAL);
  assert.equal(ancien.games, 20);
  const vraisButsArsenal = total(ars.slice(0, 17), "pour") + 2 + 3 + 1;
  assert.equal(somme(ancien.slots), vraisButsArsenal - 5 + 1, "le bug reproduit : buts perdus en silence, but annule compte");

  // APRES : seuls les 17 matchs controles comptent, et le total = buts de ces 17 matchs.
  const eh = P.evenementsPublics(ars.map((m) => m.fx), ars.map((m) => m.ev), ARSENAL, false, "Arsenal");
  const ea = P.evenementsPublics(eve.map((m) => m.fx), eve.map((m) => m.ev), EVERTON, false, "Everton");
  assert.equal(eh.games, 17);
  assert.deepEqual(eh.ecartes, { sans_evenements: 2, sans_score: 0, score_different: 1 });
  assert.equal(eh.controle_score, true);
  assert.equal(eh.perimetre, "championnat");
  assert.equal(somme(eh.slots), total(ars.slice(0, 17), "pour"));
  assert.equal(somme(eh.slots_against), total(ars.slice(0, 17), "contre"));
  assert.equal(ea.games, 20);
  assert.equal(somme(ea.slots), total(eve, "pour"));

  // La page : « de championnat », le nombre REEL de matchs de chaque equipe, le total des buts retenus.
  const { vm, texte } = rendreFilm(rawPage(eh, ea));
  const butsAffiches = total(ars.slice(0, 17), "pour") + total(eve, "pour");
  assert.equal(vm.editorial.goalTiming.totalGoals, butsAffiches);
  assert.deepEqual(vm.editorial.goalTiming.games, { home: 17, away: 20 });
  assert.match(texte, /Buts par match, sur les 17 derniers matchs de championnat de Arsenal et les 20 de Everton\./);
  assert.ok(texte.includes("Sur " + butsAffiches + " buts marqués par Arsenal et Everton lors de leurs 17 et 20 derniers matchs de championnat."), texte);
  assert.doesNotMatch(texte, /lors de leurs 20 derniers matchs\./, "plus jamais « 20 derniers matchs » sans le perimetre");
});

test("film : meme nombre de matchs des deux cotes -> « sur leurs N derniers matchs de championnat »", () => {
  const P = evenementsPublicsDuPipeline(39);
  const ars = saison(ARSENAL, 20, 2), eve = saison(EVERTON, 20, 7);
  const eh = P.evenementsPublics(ars.map((m) => m.fx), ars.map((m) => m.ev), ARSENAL, false, "Arsenal");
  const ea = P.evenementsPublics(eve.map((m) => m.fx), eve.map((m) => m.ev), EVERTON, false, "Everton");
  const { texte } = rendreFilm(rawPage(eh, ea));
  assert.match(texte, /Buts par match, sur leurs 20 derniers matchs de championnat\./);
  assert.match(texte, /lors de leurs 20 derniers matchs de championnat\. Fréquence observée/);
});

test("film : moins de 10 matchs controles pour une equipe -> pas de film, pas de chiffre", () => {
  const P = evenementsPublicsDuPipeline(39);
  const ars = saison(ARSENAL, 9, 3);
  for (let i = 0; i < 11; i++) ars.push(match(ARSENAL, [["eq", 30]], { vide: true }));
  const eve = saison(EVERTON, 20, 5);
  const eh = P.evenementsPublics(ars.map((m) => m.fx), ars.map((m) => m.ev), ARSENAL, false, "Arsenal");
  const ea = P.evenementsPublics(eve.map((m) => m.fx), eve.map((m) => m.ev), EVERTON, false, "Everton");
  assert.equal(eh.games, 9);
  const raw = rawPage(eh, ea);
  const { vm, html } = rendreFilm(raw);
  assert.equal(html, "", "film masque");
  assert.equal(vm.editorial.goalTiming, null, "ni tranche la plus fournie, ni total de buts");
  assert.equal(MS.contenusPro(raw).indexOf("film"), -1, "aucune promesse de film pour Pro");
  // Aucun match controle : aucune statistique d'evenements publiee (pas de 0 invente).
  const vide = saison(ARSENAL, 5, 1).map((m) => Object.assign(m, { ev: [] }));
  assert.equal(P.evenementsPublics(vide.map((m) => m.fx), vide.map((m) => m.ev), ARSENAL, false, "Arsenal"), null);
});

test("film : des comptes non controles (donnees d'avant le 24/10) ne s'affichent plus", () => {
  const ancien = (n) => ({ source: "api-sports-fixture-events", games: 20, slots: [4, 3, 8, 3, 5, 6].map((x) => ({ n: x * n })), slots_against: [1, 2, 2, 3, 3, 4].map((x) => ({ n: x })) });
  const raw = rawPage(ancien(1), ancien(1));
  const { vm, html } = rendreFilm(raw);
  assert.equal(html, "");
  assert.equal(vm.editorial.goalTiming, null);
});

// ---------------------------------------------------------------- regles du controle
test("controle : contre son camp range sous l'equipe qui en profite (api-football), match retenu", () => {
  // Arsenal 2-1 Chelsea du 01/03/2026 : « Chelsea, Own Goal, P. Hincapie » (joueur d'Arsenal).
  const fx = { fixture: { id: 1, status: { short: "FT" } }, teams: { home: { id: 42 }, away: { id: 49 } }, goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 } } };
  const ev = [
    { time: { elapsed: 21 }, team: { id: 42 }, type: "Goal", detail: "Normal Goal" },
    { time: { elapsed: 45 }, team: { id: 49 }, type: "Goal", detail: "Own Goal" },
    { time: { elapsed: 66 }, team: { id: 42 }, type: "Goal", detail: "Normal Goal" }
  ];
  assert.equal(FILM.controlerMatch(fx, ev).ok, true);
});

test("controle : penalty manque ignore, but annule par la VAR retire, prolongation hors compte", () => {
  const fx = (h, a, st, ft) => ({ fixture: { id: 1, status: { short: st || "FT" } }, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: h, away: a }, score: { fulltime: ft || { home: h, away: a } } });
  const but = (eq, min, detail) => ({ time: { elapsed: min }, team: { id: eq }, type: "Goal", detail: detail || "Normal Goal" });
  // Penalty manque : pas un but.
  assert.equal(FILM.controlerMatch(fx(1, 0), [but(1, 10), but(2, 56, "Missed Penalty")]).ok, true);
  // But reste dans les evenements mais annule par la VAR : retire, le reste colle au score.
  const c = FILM.controlerMatch(fx(1, 0), [but(1, 13), but(1, 40), { time: { elapsed: 14 }, team: { id: 1 }, type: "Var", detail: "Goal cancelled" }]);
  assert.equal(c.ok, true);
  assert.equal(c.events.filter((e) => e.type === "Goal").length, 1);
  assert.equal(c.events[0].time.elapsed, 40, "le but le plus proche de l'annulation est retire");
  // « Penalty cancelled » n'annule pas un but : 2 buts aux evenements, 1 au score -> ecarte.
  assert.deepEqual(FILM.controlerMatch(fx(0, 1), [but(2, 55), but(2, 59), { time: { elapsed: 55 }, team: { id: 2 }, type: "Var", detail: "Penalty cancelled" }]).raison, "score_different");
  // Prolongation : le but de la 105e n'est pas dans le score a 90 minutes.
  assert.equal(FILM.controlerMatch(fx(2, 1, "AET", { home: 1, away: 1 }), [but(1, 30), but(2, 70), but(1, 105)]).ok, true);
  // Sans score a 90 minutes connu (prolongation, pas de fulltime) : ecarte.
  const sansFt = fx(2, 1, "AET"); sansFt.score = {};
  assert.equal(FILM.controlerMatch(sansFt, [but(1, 30), but(2, 70), but(1, 105)]).raison, "sans_score");
  // Evenements vides ou absents : ecarte.
  assert.equal(FILM.controlerMatch(fx(1, 0), []).raison, "sans_evenements");
  assert.equal(FILM.controlerMatch(fx(1, 0), null).raison, "sans_evenements");
});

test("perimetre : championnat, competition du jour ou toutes competitions, et son libelle", () => {
  const ligue = (k) => LEAGUES_CONFIG.leagues.find((l) => l.key === k);
  assert.equal(FILM.perimetre({ ligue: ligue("premier") }), "championnat");
  assert.equal(FILM.perimetre({ ligue: ligue("championship") }), "championnat");
  assert.equal(FILM.perimetre({ ligue: ligue("ldc") }), "competition");
  assert.equal(FILM.perimetre({ ligue: ligue("fa_cup") }), "competition");
  assert.equal(FILM.perimetre({ ligue: ligue("libertadores") }), "competition");
  assert.equal(FILM.perimetre({ ligue: null }), "competition");
  assert.equal(FILM.perimetre({ selection: true, ligue: ligue("nations_league") }), "toutes");
  // Ligue des champions : « dans cette competition », jamais « de championnat ».
  const P = evenementsPublicsDuPipeline(2);
  const ars = saison(ARSENAL, 12, 2), eve = saison(EVERTON, 12, 3);
  const eh = P.evenementsPublics(ars.map((m) => m.fx), ars.map((m) => m.ev), ARSENAL, false, "Arsenal");
  const ea = P.evenementsPublics(eve.map((m) => m.fx), eve.map((m) => m.ev), EVERTON, false, "Everton");
  assert.equal(eh.perimetre, "competition");
  const { texte } = rendreFilm(rawPage(eh, ea, { league_id: 2, league_key: "ldc" }));
  assert.match(texte, /sur leurs 12 derniers matchs dans cette compétition\./);
  assert.doesNotMatch(texte, /championnat/);
  // Perimetres differents des deux cotes : pas de film plutot qu'un libelle faux.
  const { html } = rendreFilm(rawPage(eh, Object.assign({}, ea, { perimetre: "toutes" })));
  assert.equal(html, "");
});

// ---------------------------------------------------------------- garde-fous
test("pipeline : le moteur garde ses comptes, la page lit les comptes controles", () => {
  // Part de buts en 1re mi-temps du moteur : inchangee (evPatH / evPatA).
  assert.match(SCRIPT, /estimateFirstHalfShare\(\{forSlots:evPatH\.slots,opponentAgainstSlots:evPatA\.slots_against/);
  assert.match(SCRIPT, /slotSummary:calcSlotSummary\(evPatH,evPatA\)/);
  // Champs publies : comptes controles.
  assert.match(SCRIPT, /\}\)\(\):\(evPubH\|\|null\),/);
  assert.match(SCRIPT, /\}\)\(\):\(evPubA\|\|null\),/);
  assert.doesNotMatch(SCRIPT, /\}\)\(\):\(evPatH\|\|null\)/);
  assert.match(SCRIPT, /const FILM_DU_MATCH = require\('\.\/lib\/film-du-match\.js'\);/);
});

test("libelles : « de championnat » et ses variantes dans les 7 langues, dict et parts identiques", () => {
  const CLES_FILM = ["film_sample_last_same", "film_sample_last", "film_sample_comp_same", "film_sample_comp", "film_sample_all_same", "film_sample_all"];
  const CLES_SC = ["scenario_source_games_same", "scenario_source_games_each", "scenario_source_comp_same", "scenario_source_comp_each", "scenario_source_all_same", "scenario_source_all_each"];
  const lire = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", f), "utf8"));
  for (const l of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = lire("dict/" + l + ".json"), p = lire("parts/matchv4." + l + ".json");
    for (const k of CLES_FILM) {
      assert.ok(d.match_v4[k], l + " : match_v4." + k);
      assert.equal(d.match_v4[k], p.match_v4[k], l + " : dict et parts differents pour " + k);
      assert.ok(/\{(n|h)\}/.test(d.match_v4[k]), l + " : " + k + " sans nombre de matchs");
    }
    for (const k of CLES_SC) assert.ok(d.match_page[k] && /^ /.test(d.match_page[k]), l + " : match_page." + k);
    assert.notEqual(d.match_v4.film_sample_last_same, d.match_v4.film_sample_comp_same, l);
  }
  const fr = lire("dict/fr.json");
  assert.equal(fr.match_v4.film_sample_last_same, "Buts par match, sur leurs {n} derniers matchs de championnat.");
  assert.equal(fr.match_page.scenario_source_games_same, " lors de leurs {n} derniers matchs de championnat.");
  const en = lire("dict/en.json");
  assert.match(en.match_v4.film_sample_last_same, /league matches/);
});
