"use strict";
// « Le film du match » (controle historique-public du 24/10/2026). La page affichait
// « Tranche la plus fournie : 31-45+ min, 26 % ... Sur 51 buts marques par Arsenal et
// Everton lors de leurs 20 derniers matchs ». Recompte reel : 61 buts, tranche 76-90+.
// Causes : un match aux evenements vides (plafond d'appels, erreur) comptait quand meme,
// avec zero but ; un but annule pouvait rester dans les evenements ; et « 20 derniers
// matchs » etait en fait les 20 derniers matchs de CHAMPIONNAT.
// Ici on rejoue le VRAI code du pipeline (calcEventsPattern + evenementsPublics de
// update-data.yml) puis le rendu de la page.
//
// Tour 2 (historique-public ORANGE, avocat ORANGE, 24/10/2026) : egalite de tranches, retrait VAR
// nuisible, libelle « N de leurs M derniers matchs », FAQ des 15 premieres minutes, consigne du
// texte IA, meme seuil de 10 matchs controles partout, pages d'exemple.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vmNode = require("node:vm");

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
  // Tour 2 : 3 matchs ecartes sur 20 -> « 17 des 20 derniers », jamais « les 17 derniers ».
  assert.equal(eh.regardes, 20);
  assert.deepEqual(vm.editorial.goalTiming.regardes, { home: 20, away: 20 });
  // Tour 3 : elision (« d’Arsenal », « d’Everton »), jamais « de Arsenal ».
  assert.match(texte, /Buts par match, sur 17 des 20 derniers matchs de championnat d’Arsenal et 20 des 20 d’Everton\./);
  assert.ok(texte.includes("Sur " + butsAffiches + " buts marqués par Arsenal et Everton lors de 17 des 20 derniers matchs de championnat d’Arsenal et 20 des 20 d’Everton."), texte);
  assert.doesNotMatch(texte, /lors de leurs 20 derniers matchs\./, "plus jamais « 20 derniers matchs » sans le perimetre");
  assert.doesNotMatch(texte, /les 17 derniers|leurs 17 et 20 derniers/, "17 matchs retenus ne sont pas « les 17 derniers »");
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
  // But reste dans les evenements, en trop par rapport au score, ET annule par la VAR pour le
  // MEME joueur : retire, le reste colle au score.
  const j = (id) => ({ id, name: "Joueur " + id });
  const butDe = (eq, min, joueur) => Object.assign(but(eq, min), { player: joueur });
  const varDe = (eq, min, joueur) => ({ time: { elapsed: min }, team: { id: eq }, player: joueur, type: "Var", detail: "Goal cancelled" });
  const c = FILM.controlerMatch(fx(1, 0), [butDe(1, 13, j(7)), butDe(1, 40, j(9)), varDe(1, 14, j(7))]);
  assert.equal(c.ok, true);
  assert.equal(c.events.filter((e) => e.type === "Goal").length, 1);
  assert.equal(c.events.filter((e) => e.type === "Goal")[0].time.elapsed, 40, "le but du joueur de l'annulation est retire");
  // But en trop, mais l'annulation vise un AUTRE joueur : rien n'est retire, le match est ecarte.
  assert.equal(FILM.controlerMatch(fx(1, 0), [butDe(1, 13, j(7)), butDe(1, 40, j(9)), varDe(1, 14, j(5))]).raison, "score_different");
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
  // Consigne du texte IA : tranches CONTROLEES seulement, meme seuil que la page (tour 2).
  assert.match(SCRIPT, /slotSummary:FILM_DU_MATCH\.paireAffichable\(evPubH,evPubA\)\?calcSlotSummary\(evPubH,evPubA\):null,/);
  assert.doesNotMatch(SCRIPT, /slotSummary:calcSlotSummary\(evPatH,evPatA\)/);
  assert.match(SCRIPT, /p\.regardes=fixtures\.length;/);
  // Champs publies : comptes controles.
  assert.match(SCRIPT, /\}\)\(\):\(evPubH\|\|null\),/);
  assert.match(SCRIPT, /\}\)\(\):\(evPubA\|\|null\),/);
  assert.doesNotMatch(SCRIPT, /\}\)\(\):\(evPatH\|\|null\)/);
  assert.match(SCRIPT, /const FILM_DU_MATCH = require\('\.\/lib\/film-du-match\.js'\);/);
});

test("libelles : « de championnat » et ses variantes dans les 7 langues, dict et parts identiques", () => {
  const CLES_FILM = ["film_sample_last_same", "film_sample_last", "film_sample_comp_same", "film_sample_comp", "film_sample_all_same", "film_sample_all",
    "film_sample_last_same_part", "film_sample_last_part", "film_sample_comp_same_part", "film_sample_comp_part", "film_sample_all_same_part", "film_sample_all_part"];
  const CLES_SC = ["scenario_source_games_same", "scenario_source_games_each", "scenario_source_comp_same", "scenario_source_comp_each", "scenario_source_all_same", "scenario_source_all_each",
    "scenario_source_games_same_part", "scenario_source_games_each_part", "scenario_source_comp_same_part", "scenario_source_comp_each_part", "scenario_source_all_same_part", "scenario_source_all_each_part"];
  // Variables obligatoires des libelles « N de leurs M » (tour 2).
  const VARS = { same_part: ["{n}", "{m}"], part: ["{h}", "{hm}", "{a}", "{am}", "{home}", "{away}"] };
  const varsDe = (k) => (/same_part$/.test(k) ? VARS.same_part : /_part$/.test(k) ? VARS.part : []);
  const lire = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", f), "utf8"));
  for (const l of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = lire("dict/" + l + ".json"), p = lire("parts/matchv4." + l + ".json");
    for (const k of CLES_FILM) {
      assert.ok(d.match_v4[k], l + " : match_v4." + k);
      assert.equal(d.match_v4[k], p.match_v4[k], l + " : dict et parts differents pour " + k);
      assert.ok(/\{(n|h)\}/.test(d.match_v4[k]), l + " : " + k + " sans nombre de matchs");
    }
    for (const k of CLES_SC) assert.ok(d.match_page[k] && /^ /.test(d.match_page[k]), l + " : match_page." + k);
    for (const k of CLES_FILM) for (const v of varsDe(k)) assert.ok(d.match_v4[k].includes(v), l + " : match_v4." + k + " sans " + v);
    for (const k of CLES_SC) for (const v of varsDe(k)) assert.ok(d.match_page[k].includes(v), l + " : match_page." + k + " sans " + v);
    // Egalite de tranches et FAQ des 15 premieres minutes.
    assert.ok(d.match_page.scenario_peak_tie_prefix && d.match_page.scenario_peak_tie_prefix.trim(), l + " : scenario_peak_tie_prefix");
    assert.ok(d.match_page.scenario_peak_tie_suffix.includes("{pct}"), l + " : scenario_peak_tie_suffix sans {pct}");
    const mp = lire("parts/matchpage." + l + ".json");
    assert.equal(d.match_page.faq_first15_answer, mp.match_page.faq_first15_answer, l + " : faq_first15_answer differente entre dict et parts");
    for (const v of ["{share}", "{n}", "{total}", "{periode}"]) assert.ok(d.match_page.faq_first15_answer.includes(v), l + " : faq_first15_answer sans " + v);
    assert.notEqual(d.match_v4.film_sample_last_same, d.match_v4.film_sample_comp_same, l);
  }
  const fr = lire("dict/fr.json");
  assert.equal(fr.match_v4.film_sample_last_same, "Buts par match, sur leurs {n} derniers matchs de championnat.");
  assert.equal(fr.match_page.scenario_source_games_same, " lors de leurs {n} derniers matchs de championnat.");
  const en = lire("dict/en.json");
  assert.match(en.match_v4.film_sample_last_same, /league matches/);
  assert.equal(fr.match_v4.film_sample_last_same_part, "Buts par match, sur {n} de leurs {m} derniers matchs de championnat.");
  assert.equal(fr.match_page.scenario_source_games_same_part, " lors de {n} de leurs {m} derniers matchs de championnat.");
  assert.doesNotMatch(fr.match_page.faq_first15_answer, /saison/, "l'echantillon couvre deux saisons");
});

// =============================================================== tour 2 (24/10/2026)
// Rendu de match-page.js (carte « Scenario probable », FAQ) dans une langue : les VRAIES
// fonctions, extraites du fichier, avec le dictionnaire de la langue (comme
// tests/match-faq-sources-langues.test.js).
const LANGUES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = Object.fromEntries(LANGUES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", "dict", l + ".json"), "utf8"))]));
const INTL = vmNode.runInNewContext("(" + fs.readFileSync(path.join(ROOT, "i18n", "i18n.js"), "utf8").match(/var LOCALE_INTL = (\{[^}]*\})/)[1] + ")");
const lireCle = (o, cle) => cle.split(".").reduce((c, k) => (c == null ? null : c[k]), o);
const i18nDe = (l) => ({ locale: l, dict: DICTS[l], t: (k, fb) => { const v = lireCle(DICTS[l], k); return v != null ? v : fb != null ? fb : k; }, localeTag: () => INTL[l] });
const MP = fs.readFileSync(path.join(ROOT, "match-page.js"), "utf8");
function morceau(debut, fin) {
  const i = MP.indexOf(debut);
  assert.ok(i >= 0, "introuvable dans match-page.js : " + debut);
  const j = MP.indexOf(fin, i);
  assert.ok(j > i, "fin introuvable dans match-page.js : " + fin);
  return MP.slice(i, j);
}
const fonctionMP = (nom) => morceau("function " + nom + "(", "\n}\n") + "\n}\n";
const CODE_MP = [
  "const window=globalThis.__win;",
  morceau("function t(key,fallback)", "const img="),
  "const lucide=()=>'';const dateHeure=()=>({});const marcheFr=(vm,x)=>String(x);",
  fonctionMP("etatAnalyse"), fonctionMP("carteX"),
  // Libelles partages (tour 2) ; absents de l'ancien code : la carte et la FAQ tournent quand meme.
  MP.indexOf("const PERIODE_BUTS") >= 0 ? morceau("const PERIODE_BUTS", "function scenarioCarte(vm)") : "",
  fonctionMP("scenarioCarte"),
  // Comparatif des deux equipes (tour 3 : note avec le nombre de matchs de chaque groupe de lignes).
  fonctionMP("logoEquipe"), morceau("const CMP_SENS", "function comparatifCarte(vm)"), fonctionMP("comparatifCarte"),
  morceau("const SOURCES_CLES", "function faqCarte(vm)") + fonctionMP("faqCarte"),
  "globalThis.__faq=faqCarte;globalThis.__sc=scenarioCarte;globalThis.__cmp=comparatifCarte;",
].join("\n");
const decoder = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
const enTexte = (h) => decoder(h.replace(/<\/?(b|span|small|em|strong|i)\b[^>]*>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
// Page complete d'un match dans une langue : film (lib/match-sections.js), carte « Scenario
// probable » et FAQ (match-page.js), « Les deux equipes » (radar), view model.
function pageMatch(raw, l) {
  globalThis.I18N = i18nDe(l);
  try {
    const vm = buildMatchViewModel(raw);
    vm._raw = raw;
    const c = { raw, vm, vuePro: false, verrouPro: false, dit: MS.registre(), contenus: [], ailleurs: {} };
    const film = MS.film(c);
    const equipes = MS.equipes(Object.assign({}, c, { dit: MS.registre() }));
    const ctx = vmNode.createContext({ __win: { I18N: globalThis.I18N, IasharkComposants: null } });
    vmNode.runInContext(CODE_MP, ctx);
    const scenario = ctx.__sc(vm);
    const comparatifHtml = ctx.__cmp(vm);
    const faqH = ctx.__faq(Object.assign({}, vm, { model: Object.assign({}, vm.model, { recommendation: null, sources: [] }) }));
    const faq = [...faqH.matchAll(/<summary><span>(.*?)<\/span><\/summary><p>(.*?)<\/p>/g)].map((m) => [decoder(m[1]), enTexte(m[2])]);
    const note = (comparatifHtml.match(/<p class="cmp-note">([\s\S]*?)<\/p>/) || [])[1];
    return { vm, film: enTexte(film), filmHtml: film, equipes: enTexte(equipes), equipesHtml: equipes, scenario: enTexte(scenario), scenarioHtml: scenario, faq,
      comparatif: enTexte(comparatifHtml), comparatifNote: note == null ? null : enTexte(note) };
  } finally { delete globalThis.I18N; }
}
const slots6 = (l) => l.map((x, i) => ({ t: ["0-15", "15-30", "30-45", "45-60", "60-75", "75-90"][i], n: x }));
// Comptes controles tels que le pipeline les publie (controle_score, perimetre, regardes).
function comptes(pour, contre, games, regardes, extra) {
  return Object.assign({ source: "api-sports-fixture-events", games, regardes: regardes == null ? games : regardes, controle_score: true, perimetre: "championnat",
    ecartes: { sans_evenements: 0, sans_score: 0, score_different: (regardes == null ? games : regardes) - games },
    slots: slots6(pour), slots_against: slots6(contre), goals_avg: "1.50", conceded_avg: "1.20", yellow_per_game: "2.1", red_cards: 1 }, extra || {});
}
const CHELSEA = 49, TOTTENHAM = 47;
// Chelsea - Tottenham du 24/10 (cache reel, tour 2) : 1-15 et 31-45+ a 10 buts chacune sur 49.
function rawEgalite(gH, gA) {
  return { id: 1557439, date: "2026-10-24 16:00", league: "Premier League", league_id: 39, league_key: "premier",
    home: { id: CHELSEA, n: "Chelsea" }, away: { id: TOTTENHAM, n: "Tottenham" },
    events_home: comptes([8, 2, 5, 4, 5, 3], [2, 1, 5, 4, 4, 6], gH == null ? 20 : gH),
    events_away: comptes([2, 1, 5, 4, 4, 6], [8, 2, 5, 4, 5, 3], gA == null ? 20 : gA) };
}

test("egalite : deux tranches au meme maximum -> les deux, « à égalité », jamais une seule « tranche la plus fournie » (Chelsea - Tottenham)", () => {
  const raw = rawEgalite();
  const { vm, film, scenario, filmHtml } = pageMatch(raw, "fr");
  const g = vm.editorial.goalTiming;
  assert.equal(g.totalGoals, 49);
  assert.deepEqual(g.slots.map((s) => s.home + s.away), [10, 3, 10, 8, 9, 9]);
  assert.deepEqual((g.peaks || []).map((p) => g.slots.indexOf(p)), [0, 2], "les deux tranches a 10 buts");
  const attendu = "Tranches les plus fournies : 1-15 et 31-45+ min, à égalité — 20 % des buts des deux équipes sont tombés dans chacune.";
  assert.ok(film.includes(attendu), film);
  assert.ok(scenario.includes(attendu), "carte « Scenario probable » (match-page.js) : " + scenario);
  for (const x of [film, scenario]) assert.doesNotMatch(x, /Tranche la plus fournie/, "jamais une seule tranche quand deux sont a egalite");
  // Detail des onglets : la part n'est pas reecrite pour les tranches deja dans la ligne (1-15, 31-45+).
  const details = JSON.parse(decoder(filmHtml.match(/data-f-all="([^"]*)"/)[1]));
  assert.doesNotMatch(details[0], /Part des buts/);
  assert.doesNotMatch(details[2], /Part des buts/);
  assert.match(details[1], /Part des buts des deux équipes sur leurs derniers matchs : 6\s%/u);
  // 7 langues : la tournure « egalite » de la langue, jamais celle d'une tranche seule.
  for (const l of LANGUES) {
    const p = pageMatch(raw, l), d = DICTS[l].match_page;
    for (const x of [p.film, p.scenario]) {
      assert.ok(x.includes(d.scenario_peak_tie_prefix.trim()), l + " : " + x);
      assert.ok(!x.includes(d.scenario_peak_prefix.trim()), l + " : tranche seule ecrite malgre l'egalite : " + x);
      assert.ok(x.includes("1-15" + d.scenario_source_and + "31-45+"), l + " : " + x);
    }
  }
  // Trois tranches a egalite : les trois.
  const trois = rawEgalite();
  trois.events_home.slots = slots6([8, 2, 5, 4, 5, 4]);
  assert.ok(pageMatch(trois, "fr").film.includes("Tranches les plus fournies : 1-15, 31-45+ et 76-90+ min, à égalité — 20 % des buts des deux équipes sont tombés dans chacune."));
  // Une seule tranche en tete : la ligne habituelle, inchangee.
  const seul = rawEgalite();
  seul.events_home.slots = slots6([9, 2, 5, 4, 5, 3]);
  const u = pageMatch(seul, "fr");
  assert.ok(u.film.includes("Tranche la plus fournie : 1-15 min — 22 % des buts des deux équipes y sont tombés."), u.film);
  assert.ok(u.scenario.includes("Tranche la plus fournie : 1-15 min — 22 % des buts des deux équipes y sont tombés."), u.scenario);
});

test("VAR : l'annulation du but de Willock (45e+1) ne retire plus le but valable de Thiaw (45e) - Tottenham 1-2 Newcastle, match 1379227", () => {
  // Evenements reels (api-football, cache du controle du 24/10/2026).
  const fx = { fixture: { id: 1379227, status: { short: "FT" } }, teams: { home: { id: 47 }, away: { id: 34 } }, goals: { home: 1, away: 2 }, score: { fulltime: { home: 1, away: 2 } } };
  const ev = [
    { time: { elapsed: 45, extra: 1 }, team: { id: 34 }, player: { id: 1463, name: "Joe Willock" }, type: "Var", detail: "Goal cancelled" },
    { time: { elapsed: 45, extra: null }, team: { id: 34 }, player: { id: 163189, name: "M. Thiaw" }, type: "Goal", detail: "Normal Goal" },
    { time: { elapsed: 64, extra: null }, team: { id: 47 }, player: { id: 328089, name: "A. Gray" }, type: "Goal", detail: "Normal Goal" },
    { time: { elapsed: 68, extra: null }, team: { id: 34 }, player: { id: 19192, name: "J. Ramsey" }, type: "Goal", detail: "Normal Goal" }
  ];
  const c = FILM.controlerMatch(fx, ev);
  assert.equal(c.ok, true, "le match entre dans le compte : ses buts redonnent le score");
  assert.deepEqual(c.events.filter((e) => e.type === "Goal").map((e) => e.player.name), ["M. Thiaw", "A. Gray", "J. Ramsey"]);
  assert.equal(FILM.sansButsAnnules(ev, fx).length, ev.length, "rien n'est retire : la liste ne compte pas plus de buts que le score");
  // Meme cas, but annule de Willock reste dans la liste (3 buts de Newcastle pour 2 au score) : c'est
  // LUI qui est retire, pas Thiaw.
  const enTrop = ev.concat([{ time: { elapsed: 45, extra: 1 }, team: { id: 34 }, player: { id: 1463, name: "J. Willock" }, type: "Goal", detail: "Normal Goal" }]);
  const c2 = FILM.controlerMatch(fx, enTrop);
  assert.equal(c2.ok, true);
  assert.deepEqual(c2.events.filter((e) => e.type === "Goal").map((e) => e.player.name), ["M. Thiaw", "A. Gray", "J. Ramsey"]);
  // Sans joueur sur l'annulation : rien n'est retire, le match reste hors du compte (le controle
  // du score suffit).
  const anonyme = enTrop.map((e) => (e.type === "Var" ? Object.assign({}, e, { player: null }) : e));
  assert.equal(FILM.controlerMatch(fx, anonyme).raison, "score_different");
  // Sans le match (score inconnu) : rien n'est retire.
  assert.equal(FILM.sansButsAnnules(enTrop).length, enTrop.length);
});

test("libelle : un match ecarte des deux cotes -> « sur 19 de leurs 20 derniers matchs de championnat », 7 langues", () => {
  const raw = rawEgalite(19, 19);
  raw.events_home.regardes = 20; raw.events_away.regardes = 20;
  const p = pageMatch(raw, "fr");
  assert.ok(p.film.includes("Buts par match, sur 19 de leurs 20 derniers matchs de championnat."), p.film);
  assert.ok(p.film.includes("lors de 19 de leurs 20 derniers matchs de championnat. Fréquence observée"), p.film);
  assert.ok(p.scenario.includes("lors de 19 de leurs 20 derniers matchs de championnat."), p.scenario);
  assert.doesNotMatch(p.film + p.scenario, /leurs 19 derniers/);
  // Sans « regardes » (ancien format) : compte par les matchs ecartes.
  const sansCompteur = rawEgalite(19, 19);
  delete sansCompteur.events_home.regardes; delete sansCompteur.events_away.regardes;
  sansCompteur.events_home.ecartes = { sans_evenements: 1, sans_score: 0, score_different: 0 };
  sansCompteur.events_away.ecartes = { sans_evenements: 0, sans_score: 0, score_different: 1 };
  assert.ok(pageMatch(sansCompteur, "fr").film.includes("sur 19 de leurs 20 derniers matchs de championnat."));
  for (const l of LANGUES) {
    const x = pageMatch(raw, l), d = DICTS[l];
    const ech = d.match_v4.film_sample_last_same_part.replace("{n}", "19").replace("{m}", "20");
    const per = d.match_page.scenario_source_games_same_part.replace("{n}", "19").replace("{m}", "20");
    assert.ok(x.film.includes(ech), l + " : " + x.film);
    assert.ok(x.film.includes(per.trim()), l + " : " + x.film);
    assert.ok(x.scenario.includes(per.trim()), l + " : " + x.scenario);
  }
});

test("FAQ « 15 premieres minutes » : meme libelle que le film (derniers matchs de championnat, pas « la saison »), 7 langues, rien sous 10 matchs controles", () => {
  const q15 = (p) => p.faq.find((x) => x[0] === DICTS[p.l].match_page.faq_q_first15);
  const raw = rawEgalite();
  for (const l of LANGUES) {
    const p = Object.assign(pageMatch(raw, l), { l });
    const r = q15(p);
    assert.ok(r, l + " : question absente");
    const per = DICTS[l].match_page.scenario_source_games_same.replace("{n}", "20");
    assert.ok(r[1].includes(per.trim()), l + " : « " + r[1] + " » sans « " + per.trim() + " »");
    assert.ok(r[1].includes("49"), l + " : total des buts");
  }
  const fr = q15(Object.assign(pageMatch(raw, "fr"), { l: "fr" }))[1];
  assert.equal(fr, "20 % des buts marqués par ces deux équipes sont tombés dans le premier quart d’heure (10 sur 49) lors de leurs 20 derniers matchs de championnat. Fréquence observée, pas une prévision.");
  assert.doesNotMatch(fr, /saison/);
  // Un match ecarte : « 19 de leurs 20 ».
  const part = rawEgalite(19, 19); part.events_home.regardes = 20; part.events_away.regardes = 20;
  assert.match(q15(Object.assign(pageMatch(part, "fr"), { l: "fr" }))[1], /lors de 19 de leurs 20 derniers matchs de championnat\./);
  // 9 matchs controles pour une equipe : ni la question, ni « qui marque le plus tot ».
  const peu = Object.assign(pageMatch(rawEgalite(20, 9), "fr"), { l: "fr" });
  assert.equal(q15(peu), undefined);
  assert.equal(peu.faq.find((x) => x[0] === DICTS.fr.match_page.faq_q_early), undefined);
});

test("seuil : radar, FAQ cartons et fin de match, « Buts par match dans leurs derniers matchs », comparatif -> 10 matchs controles par equipe", () => {
  const STATS = { possession: 55, shots_on: 5, corners: 6, shots_total: 14, fouls: 11 };
  const base = (eh, ea) => Object.assign(rawEgalite(), { events_home: eh, events_away: ea, match_stats_home: STATS, match_stats_away: STATS,
    pari_rec: "Plus de 2.5 buts", cote_rec: 1.8, model_probability: 58, data_quality_score: 70 });
  const ok = comptes([2, 3, 3, 4, 4, 5], [1, 2, 2, 3, 4, 5], 10);
  const neuf = comptes([2, 3, 3, 4, 4, 5], [1, 2, 2, 3, 4, 5], 9, 20);
  const nonControle = Object.assign({}, ok, { controle_score: undefined });
  const cles = (raw) => {
    const p = pageMatch(raw, "fr"), f = p.vm.editorial.exclusiveFacts, cmp = p.vm.comparison;
    const raisons = (p.vm.editorial.signalReasons || []).concat(p.vm.editorial.signalRisks || []).map((x) => x.key);
    return {
      cartons: !!f.cartons, finDeMatch: !!f.encaisseFin, rouges: !!f.rouges,
      faqCartons: !!p.faq.find((x) => x[0] === DICTS.fr.match_page.faq_q_cards),
      faqFin: !!p.faq.find((x) => x[0] === DICTS.fr.match_page.faq_q_late),
      radarAttaque: /Attaque/.test(p.equipes), radarDiscipline: /Discipline/.test(p.equipes),
      butsParMatch: raisons.includes("goals_match_avg"),
      comparatifButs: !!(cmp && cmp.rows.find((r) => r.label === "Buts marqués")),
      echantillon: cmp ? cmp.sampleSize : null
    };
  };
  const avec = cles(base(ok, ok));
  assert.deepEqual(avec, { cartons: true, finDeMatch: true, rouges: true, faqCartons: true, faqFin: true, radarAttaque: true, radarDiscipline: true, butsParMatch: true, comparatifButs: true, echantillon: 10 });
  const sans = { cartons: false, finDeMatch: false, rouges: false, faqCartons: false, faqFin: false, radarAttaque: false, radarDiscipline: false, butsParMatch: false, comparatifButs: false, echantillon: null };
  assert.deepEqual(cles(base(ok, neuf)), sans, "9 matchs controles pour une equipe : aucun de ces chiffres");
  assert.deepEqual(cles(base(nonControle, nonControle)), sans, "comptes non controles : aucun de ces chiffres");
  // Rien n'est remplace par 0 : comptes absents -> ni « 0 % », ni « 0 rencontre ».
  const vide = cles(base(null, null));
  assert.equal(vide.finDeMatch, false);
  assert.equal(vide.echantillon, null);
});

test("consigne du texte IA : tranches controlees seulement, meme seuil que la page, sinon rien (code reel du pipeline)", () => {
  const ligne = SCRIPT.match(/\n\s*slotSummary:(.*),\n/);
  assert.ok(ligne, "slotSummary introuvable dans le pipeline");
  const calc = SCRIPT.slice(SCRIPT.indexOf("function calcSlotSummary(evPatH, evPatA) {"), SCRIPT.indexOf("async function genAnalyse(d) {"));
  const slotSummary = new Function("FILM_DU_MATCH", "evPatH", "evPatA", "evPubH", "evPubA", calc + "\nreturn " + ligne[1] + ";");
  const ok = comptes([2, 3, 3, 4, 4, 5], [1, 2, 2, 3, 4, 5], 12);
  const moteur = { slots: slots6([1, 1, 1, 1, 1, 1]), slots_against: slots6([1, 1, 1, 1, 1, 1]), games: 20 };
  const s = slotSummary(FILM, moteur, moteur, ok, ok);
  assert.ok(Array.isArray(s) && s.length === 6, "deux equipes controlees : les tranches partent");
  // Les tranches envoyees sont celles des comptes CONTROLES (pas celles du moteur, toutes a 1).
  assert.equal(s[5].pct_home_mark, Math.round(5 / 21 * 100));
  assert.equal(slotSummary(FILM, moteur, moteur, ok, comptes([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], 9)), null, "9 matchs controles : rien");
  assert.equal(slotSummary(FILM, moteur, moteur, ok, null), null, "aucun compte controle : rien");
  assert.equal(slotSummary(FILM, moteur, moteur, ok, Object.assign({}, ok, { perimetre: "toutes" })), null, "perimetres differents : rien");
  // Meme seuil que la page (lib/match-view-model.js) : les deux disent oui ou non ensemble.
  for (const [eh, ea] of [[ok, ok], [ok, comptes([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], 9)], [ok, Object.assign({}, ok, { controle_score: false })]]) {
    const page = !!buildMatchViewModel(Object.assign(rawEgalite(), { events_home: eh, events_away: ea })).editorial.goalTiming;
    assert.equal(FILM.paireAffichable(eh, ea), page);
  }
});

test("pages d'exemple (7 langues, donnees figees non controlees) : film, scenario et ses 2 reponses de FAQ retires proprement, aucune carte vide", () => {
  for (const f of ["exemple-analyse.html", "fr/exemple-analyse.html", "en/exemple-analyse.html", "es/exemple-analyse.html", "mx/exemple-analyse.html", "gb/exemple-analyse.html", "za/exemple-analyse.html"]) {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    const raw = JSON.parse(html.match(/var PRELOADED_MATCH = (\{.*?\});\n/s)[1]);
    // Donnees d'exemple du 04/09/2026 : comptees avant le controle, jamais marquees controlees.
    assert.notEqual(raw.events_home && raw.events_home.controle_score, true, f);
    const l = f.startsWith("en/") || f.startsWith("gb/") || f.startsWith("za/") ? "en" : f.startsWith("es/") ? "es" : f.startsWith("mx/") ? "es-mx" : "fr";
    const p = pageMatch(raw, l), d = DICTS[l].match_page;
    assert.equal(p.vm.editorial.goalTiming, null, f);
    assert.equal(p.filmHtml, "", f + " : pas de film");
    assert.equal(p.scenarioHtml, "", f + " : pas de carte « Scenario probable » (ni vide, ni cassee)");
    for (const q of [d.faq_q_first15, d.faq_q_early, d.faq_q_late, d.faq_q_cards]) assert.equal(p.faq.find((x) => x[0] === q), undefined, f + " : « " + q + " »");
    // Aucune reponse vide ni « 0 % » invente ; la FAQ garde ses autres questions.
    assert.ok(p.faq.length >= 2, f + " : FAQ");
    for (const [q, r] of p.faq) { assert.ok(r.trim(), f + " : reponse vide a « " + q + " »"); assert.doesNotMatch(r, /(^|\D)0 ?%/, f + " : « " + r + " »"); }
    // « Les deux equipes » : absente ou avec du contenu, jamais une carte vide.
    if (p.equipes) assert.ok(p.equipes.length > 40, f + " : carte « Les deux equipes » vide : " + p.equipes);
    // Comparatif : aucune ligne « Buts marques » a 0, pas de « sur 0 rencontre ».
    assert.equal(p.vm.comparison.rows.find((r) => r.label === "Buts marqués"), undefined, f);
    assert.equal(p.vm.comparison.sampleSize, null, f);
  }
});

// =============================================================== tour 3 (24/10/2026)
// Avocat du diable ORANGE sur la PR #200 : regle VAR sans limite de temps, nombre de matchs de la note
// du comparatif, elision du francais (« de Arsenal »), description des pages d'exemple.
const lireFichier = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("VAR (tour 3) : un but n'est retire que s'il est du MEME joueur et marque dans les 5 minutes AVANT l'annulation", () => {
  const fx = { fixture: { id: 7, status: { short: "FT" } }, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 1, away: 0 }, score: { fulltime: { home: 1, away: 0 } } };
  const P = { id: 77, name: "P" }, Q = { id: 88, name: "Q" };
  const but = (min, joueur, extra) => ({ time: { elapsed: min, extra: extra == null ? null : extra }, team: { id: 1 }, player: joueur, type: "Goal", detail: "Normal Goal" });
  const annul = (min, extra) => ({ time: { elapsed: min, extra: extra == null ? null : extra }, team: { id: 1 }, player: P, type: "Var", detail: "Goal cancelled" });
  assert.equal(FILM.FENETRE_VAR, 5);
  // Match invente par l'avocat : but sans joueur (10e), but valable de P (70e), but de P annule par la
  // VAR (85e), score 1-0. Avant : le but VALABLE de la 70e etait retire et le « fantome » de la 10e
  // gardait le match dans le compte. Maintenant : rien n'est retire, le controle du score l'ecarte.
  const invente = [but(10, null), but(70, P), annul(85)];
  assert.equal(FILM.sansButsAnnules(invente, fx).length, invente.length, "le but de la 70e (15 minutes avant) n'est pas retire");
  assert.equal(FILM.controlerMatch(fx, invente).raison, "score_different", "le match est ecarte, pas compte avec une minute fausse");
  // Dans la fenetre (3 minutes avant) : le but de P est retire, celui de Q reste.
  const dans = FILM.controlerMatch(fx, [but(10, Q), but(82, P), annul(85)]);
  assert.equal(dans.ok, true);
  assert.deepEqual(dans.events.filter((e) => e.type === "Goal").map((e) => e.time.elapsed), [10]);
  // Bornes : 5 minutes avant -> retire ; 6 minutes avant -> rien ; APRES l'annulation -> rien.
  assert.equal(FILM.controlerMatch(fx, [but(10, Q), but(80, P), annul(85)]).ok, true);
  assert.equal(FILM.controlerMatch(fx, [but(10, Q), but(79, P), annul(85)]).raison, "score_different");
  assert.equal(FILM.controlerMatch(fx, [but(10, Q), but(86, P), annul(85)]).raison, "score_different");
  // Arrets de jeu comptes : 90e+1 puis annulation 90e+4 (3 minutes) -> retire ; 90e+1 puis 90e+8
  // (7 minutes, alors que la « minute » vaut 90 des deux cotes) -> rien.
  assert.equal(FILM.controlerMatch(fx, [but(10, Q), but(90, P, 1), annul(90, 4)]).ok, true);
  assert.equal(FILM.controlerMatch(fx, [but(10, Q), but(90, P, 1), annul(90, 8)]).raison, "score_different");
  // Autre mi-temps (but a la 44e, annulation a la 46e) ou annulation sans minute : rien.
  assert.equal(FILM.controlerMatch(fx, [but(10, Q), but(44, P), annul(46)]).raison, "score_different");
  assert.equal(FILM.controlerMatch(fx, [but(10, Q), but(44, P), { team: { id: 1 }, player: P, type: "Var", detail: "Goal cancelled" }]).raison, "score_different");
});

// Statistiques de match (tirs, possession...) telles que le VRAI pipeline les publie : getWeightedXGStats
// et le bloc matchStatsH / matchStatsA de update-data.yml, avec une fausse API (statistics vides pour
// les matchs de `sansStats`).
async function statsDuPipeline(nbMatchs, sansStatsH, sansStatsA) {
  const code = SCRIPT.slice(SCRIPT.indexOf("async function getWeightedXGStats("), SCRIPT.indexOf("var clubEloCache=null;"));
  const d = SCRIPT.indexOf("var matchStatsH={");
  const bloc = SCRIPT.slice(d, SCRIPT.indexOf("await sleep(300);", d));
  assert.ok(code.length > 1000 && d > 0 && bloc.length > 300, "code du pipeline introuvable");
  const bloc1 = (team, adv) => [
    { team: { id: team }, statistics: [{ type: "Total Shots", value: 14 }, { type: "Shots on Goal", value: 5 }, { type: "Ball Possession", value: "55%" }, { type: "Corner Kicks", value: 6 },
      { type: "Fouls", value: 11 }, { type: "Offsides", value: 2 }, { type: "Goalkeeper Saves", value: 3 }, { type: "Passes %", value: "85%" }, { type: "expected_goals", value: "1.40" }] },
    { team: { id: adv }, statistics: [{ type: "Total Shots", value: 9 }, { type: "Shots on Goal", value: 3 }, { type: "expected_goals", value: "0.90" }] }];
  const fabrique = (team, sans) => new Function("get", "APS", "ttl", "sleep", code + "\nreturn getWeightedXGStats;")(
    async (url) => { const id = Number(url.split("fixture=")[1]); return { response: sans.includes(id) ? [] : bloc1(team, 999) }; }, {}, () => 0, async () => {});
  const ids = Array.from({ length: nbMatchs }, (_, i) => 9000 + i);
  const fixtures = (team) => ids.map((id) => ({ fixture: { id }, teams: { home: { id: team }, away: { id: 999 } } }));
  const xgH = await fabrique(ARSENAL, sansStatsH || [])(ARSENAL, ids.slice(0, 10), fixtures(ARSENAL), {});
  const xgA = await fabrique(EVERTON, sansStatsA || [])(EVERTON, ids.slice(0, 10), fixtures(EVERTON), {});
  const ligue = LEAGUES_CONFIG.leagues.find((l) => l.apiFootballId === 39);
  return new Function("xgH", "xgA", "last10IdsH_xg", "last10IdsA_xg", "FILM_DU_MATCH", "selMatchsH", "selMatchsA", "ligueFilm", bloc + "\nreturn { matchStatsH, matchStatsA };")(
    xgH, xgA, ids.slice(0, 10), ids.slice(0, 10), FILM, [], [], ligue);
}

test("comparatif (tour 3) : chaque groupe de lignes dit SON nombre de matchs (buts : matchs controles ; tirs, possession... : 10 au plus), jamais « sur 19 rencontres », 7 langues", async () => {
  // Pipeline : 20 matchs de championnat regardes, statistiques demandees pour les 10 derniers.
  const s = await statsDuPipeline(20);
  assert.deepEqual([s.matchStatsH.games, s.matchStatsH.regardes, s.matchStatsH.perimetre], [10, 10, "championnat"]);
  assert.equal(s.matchStatsH.shots_total, 14);
  // Les valeurs lues par le moteur et la page ne changent pas (seulement des champs en plus).
  assert.deepEqual(Object.keys(s.matchStatsH).slice(3), ["possession", "shots_total", "shots_on", "shots_off", "shots_blocked", "corners", "fouls", "offsides", "saves", "passes_pct", "xg", "xga"]);
  // Un match sans statistiques : 9 sur 10.
  const s9 = await statsDuPipeline(20, [9003]);
  assert.deepEqual([s9.matchStatsH.games, s9.matchStatsH.regardes, s9.matchStatsA.games], [9, 10, 10]);

  // Arsenal : buts sur 19 de ses 20 derniers matchs (un ecarte) ; Everton : 20 sur 20.
  const eh = comptes([2, 3, 3, 4, 4, 5], [1, 2, 2, 3, 4, 5], 19, 20), ea = comptes([2, 1, 5, 4, 4, 6], [3, 2, 5, 4, 5, 3], 20);
  const raw = rawPage(eh, ea, { match_stats_home: s.matchStatsH, match_stats_away: s.matchStatsA });
  const fr = pageMatch(raw, "fr");
  assert.equal(fr.comparatifNote,
    "Buts marqués et concédés : moyennes par match lors de 19 des 20 derniers matchs de championnat d’Arsenal et 20 des 20 d’Everton. "
    + "Autres statistiques : moyennes par match lors de leurs 10 derniers matchs de championnat. "
    + "Hors-jeu et arrêts sont donnés sans verdict : plus d'arrêts signifie surtout plus de tirs subis.");
  assert.doesNotMatch(fr.comparatifNote, /rencontre/);
  assert.deepEqual(fr.vm.comparison.samples.stats, { games: { home: 10, away: 10 }, regardes: { home: 10, away: 10 }, perimetre: "championnat" });
  for (const l of LANGUES) {
    const p = pageMatch(raw, l), d = DICTS[l].match_page;
    const remplir = (gabarit, v) => gabarit.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
    const buts = d.comparison_note_goals_prefix + remplir(d.scenario_source_games_each_part, { h: 19, hm: 20, a: 20, am: 20, home: "Arsenal", away: "Everton" });
    const stats = d.comparison_note_stats_prefix + remplir(d.scenario_source_games_same, { n: 10 });
    if (l !== "fr") assert.ok(p.comparatifNote.startsWith(buts + " " + stats), l + " : " + p.comparatifNote);
    else assert.ok(p.comparatifNote.includes(stats), p.comparatifNote);
    for (const x of ["19", "20"]) assert.ok(!p.comparatifNote.includes(d.comparison_note_with_sample_prefix + x), l + " : ancien libelle « sur " + x + " rencontres »");
  }
  // 9 statistiques sur 10 pour Arsenal : « 9 des 10 », jamais « leurs 9 derniers ».
  const p9 = pageMatch(rawPage(eh, ea, { match_stats_home: s9.matchStatsH, match_stats_away: s9.matchStatsA }), "fr");
  assert.ok(p9.comparatifNote.includes("Autres statistiques : moyennes par match lors de 9 des 10 derniers matchs de championnat d’Arsenal et 10 des 10 d’Everton."), p9.comparatifNote);
  // Donnees d'avant le 24/10 (statistiques sans compteur) : aucun nombre pour ces lignes, jamais
  // celui des buts.
  const sansCompteur = (ms) => { const c = Object.assign({}, ms); delete c.games; delete c.regardes; delete c.perimetre; return c; };
  const pv = pageMatch(rawPage(eh, ea, { match_stats_home: sansCompteur(s.matchStatsH), match_stats_away: sansCompteur(s.matchStatsA) }), "fr");
  assert.ok(pv.comparatifNote.includes(" Autres statistiques : moyennes par match. Hors-jeu"), pv.comparatifNote);
  assert.equal(pv.vm.comparison.samples.stats, null);
  // Sans buts controles : une seule phrase, celle des statistiques.
  const ps = pageMatch(rawPage(null, null, { match_stats_home: s.matchStatsH, match_stats_away: s.matchStatsA }), "fr");
  assert.ok(ps.comparatifNote.startsWith("Moyennes par match lors de leurs 10 derniers matchs de championnat. Hors-jeu"), ps.comparatifNote);
  // Echantillon court (4 matchs) : signale.
  const court = Object.assign({}, s.matchStatsH, { games: 4, regardes: 4 });
  const pc = pageMatch(rawPage(null, null, { match_stats_home: court, match_stats_away: court }), "fr");
  assert.ok(pc.comparatifNote.startsWith("Moyennes par match lors de leurs 4 derniers matchs de championnat — échantillon encore court."), pc.comparatifNote);
});

test("francais (tour 3) : elision devant voyelle ou h muet (« d’Arsenal », « d’Everton ») dans le film, la carte scenario, la FAQ et le comparatif ; rien ne change dans les autres langues", async () => {
  const s = await statsDuPipeline(20, [9003]);
  const eh = comptes([2, 3, 3, 4, 4, 5], [1, 2, 2, 3, 4, 5], 19, 20), ea = comptes([2, 1, 5, 4, 4, 6], [3, 2, 5, 4, 5, 3], 20);
  const raw = rawPage(eh, ea, { match_stats_home: s.matchStatsH, match_stats_away: s.matchStatsA });
  const p = pageMatch(raw, "fr");
  const tout = [p.film, decoder(p.filmHtml), p.scenario, p.comparatif, p.equipes, decoder(p.equipesHtml)].concat(p.faq.map((x) => x.join(" "))).join(" \n ");
  assert.doesNotMatch(tout, /(^|[^A-Za-zÀ-ÿ])(de|De|que|Que) (Arsenal|Everton)\b/, "plus jamais « de Arsenal » ni « de Everton »");
  const phrase = "lors de 19 des 20 derniers matchs de championnat d’Arsenal et 20 des 20 d’Everton.";
  assert.ok(p.film.includes("Buts par match, sur 19 des 20 derniers matchs de championnat d’Arsenal et 20 des 20 d’Everton."), p.film);
  assert.ok(p.film.includes(phrase), p.film);
  assert.ok(p.scenario.includes(phrase), p.scenario);
  const q15 = p.faq.find((x) => x[0] === DICTS.fr.match_page.faq_q_first15);
  assert.ok(q15 && q15[1].includes(phrase), q15 && q15[1]);
  assert.ok(p.comparatifNote.includes(phrase), p.comparatifNote);
  assert.ok(p.comparatifNote.includes("lors de 9 des 10 derniers matchs de championnat d’Arsenal et 10 des 10 d’Everton."), p.comparatifNote);
  // Meme regle dans les deux fonctions tf (lib/match-sections.js : film ; match-page.js : carte et
  // FAQ) : voyelle et accent elides, h muet de la liste elide, h aspire et consonne gardes.
  for (const [nom, attendu] of [["Arsenal", "d’Arsenal"], ["Olympique Lyonnais", "d’Olympique Lyonnais"], ["Énergie Cottbus", "d’Énergie Cottbus"], ["Inter", "d’Inter"],
    ["Hoffenheim", "d’Hoffenheim"], ["Hambourg", "de Hambourg"], ["Chelsea", "de Chelsea"], ["Young Boys", "de Young Boys"], ["1. FC Köln", "de 1. FC Köln"]]) {
    const r = rawPage(eh, ea);
    r.home = { id: ARSENAL, n: nom };
    const q = pageMatch(r, "fr");
    const attenduPhrase = "lors de 19 des 20 derniers matchs de championnat " + attendu + " et 20 des 20 d’Everton.";
    assert.ok(q.film.includes(attenduPhrase), nom + " (film, lib/match-sections.js) : " + q.film);
    assert.ok(q.scenario.includes(attenduPhrase), nom + " (carte, match-page.js) : " + q.scenario);
  }
  // Autres langues : texte inchange (« de Arsenal » est juste en espagnol).
  for (const l of LANGUES.filter((x) => x !== "fr")) {
    const x = pageMatch(raw, l), d = DICTS[l].match_page;
    const attendu = d.scenario_source_games_each_part.replace("{h}", "19").replace("{hm}", "20").replace("{a}", "20").replace("{am}", "20").replace("{home}", "Arsenal").replace("{away}", "Everton").trim();
    assert.ok(x.scenario.includes(attendu), l + " : " + x.scenario);
    assert.doesNotMatch(x.film + x.scenario, /’Arsenal|’Everton/, l);
  }
});

test("pages d'exemple (tour 3) : la description n'annonce plus le « scénario du match » (absent de la page), elle decrit ce qui reste, 7 langues", () => {
  const SCEN = /sc[ée]nario|escenario|cen[áa]rio|szenario/i;
  const PAGES = { "exemple-analyse.html": "fr", "fr/exemple-analyse.html": "fr", "en/exemple-analyse.html": "en", "gb/exemple-analyse.html": "en", "es/exemple-analyse.html": "es", "mx/exemple-analyse.html": "es-mx", "za/exemple-analyse.html": "en" };
  for (const [f, l] of Object.entries(PAGES)) {
    const html = lireFichier(f);
    const metas = [...html.matchAll(/<meta (?:name="description"|property="og:description") content="([^"]*)"/g)].map((m) => m[1]);
    assert.equal(metas.length, 2, f + " : meta description et og:description");
    for (const m of metas) assert.doesNotMatch(m, SCEN, f + " : « " + m + " »");
    // Ce que la description annonce est vraiment sur la page : comparatif des equipes et forme recente.
    const raw = JSON.parse(html.match(/var PRELOADED_MATCH = (\{.*?\});\n/s)[1]);
    const p = pageMatch(raw, l);
    assert.ok(p.vm.comparison && p.vm.comparison.rows.length >= 3 && p.comparatifNote, f + " : comparatif");
    assert.ok(p.vm.form && p.vm.form.home && p.vm.form.home.length && p.vm.form.away && p.vm.form.away.length, f + " : forme recente");
    assert.ok(p.comparatifNote.startsWith(DICTS[l].match_page.comparison_note_avg_prefix + ". "), f + " : note sans nombre devine : " + p.comparatifNote);
    assert.equal(p.scenarioHtml, "", f + " : la carte « Scenario » n'y est pas");
  }
  // Textes traduits de la page racine (geo.meta), demo_page et textes SEO par repertoire.
  for (const l of LANGUES) {
    const d = DICTS[l];
    assert.doesNotMatch(d.geo.meta["exemple-analyse"].description, SCEN, l + " : geo.meta");
    assert.doesNotMatch(d.demo_page.meta_description, SCEN, l + " : demo_page.meta_description");
    assert.equal(JSON.parse(lireFichier("i18n/parts/geo." + l + ".json")).geo.meta["exemple-analyse"].description, d.geo.meta["exemple-analyse"].description, l + " : dict et parts (geo)");
    assert.equal(JSON.parse(lireFichier("i18n/parts/site." + l + ".json")).demo_page.meta_description, d.demo_page.meta_description, l + " : dict et parts (site)");
  }
  for (const f of fs.readdirSync(path.join(ROOT, "i18n", "seo"))) {
    const s = JSON.parse(lireFichier("i18n/seo/" + f));
    assert.doesNotMatch(s.meta["exemple-analyse"].description, SCEN, "i18n/seo/" + f);
  }
  // Pages deja generees = texte SEO de leur repertoire (scripts/seo-pages.js).
  for (const dir of ["fr", "en", "gb", "es", "mx", "za"]) {
    const s = JSON.parse(lireFichier("i18n/seo/" + dir + ".json"));
    assert.ok(lireFichier(dir + "/exemple-analyse.html").includes('<meta name="description" content="' + s.meta["exemple-analyse"].description + '">'), dir);
  }
  assert.ok(lireFichier("exemple-analyse.html").includes('<meta name="description" content="' + DICTS.fr.geo.meta["exemple-analyse"].description + '"'), "page racine");
});
