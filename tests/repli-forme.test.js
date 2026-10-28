"use strict";
// REPLI DES MATCHS DE COUPE SANS PARI : CALCUL A BLANC (lib/repli-forme.js, demande de Clement et controles du 28/10/2026).
// Aucune publication tant que config/verdicts-maths.json#repli_coupes n'est pas « GO » ; archivage prive des deux
// variantes (forme, marche) ; zero fuite du futur ; jamais sous 1,40, jamais une cote inventee.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const RF = require("../lib/repli-forme.js");
const P = require("../lib/pronostic.js");
const MP = require("../lib/marches-paris.js");
const CFG = require("../config/leagues.json");
const VERDICTS = require("../config/verdicts-maths.json");
const ROOT = path.join(__dirname, "..");

const KO = "2026-10-28T19:00:00+00:00";
let idMatch = 1;
function fx(date, ligue, dom, ext, bd, be, opts) {
  opts = opts || {};
  return { fixture: { id: idMatch++, date: date, status: { short: opts.statut || "FT" } }, league: { id: ligue, name: opts.nom || "Ligue " + ligue },
    teams: { home: { id: dom, name: "Club " + dom }, away: { id: ext, name: "Club " + ext } },
    goals: { home: bd + (opts.prol || 0), away: be }, score: { fulltime: { home: bd, away: be } } };
}
// 10 matchs de championnat d'un club (buts marques / encaisses par match), du 01/09 au 28/09/2026.
function saison(club, ligue, bm, be) {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const d = "2026-09-" + String(1 + i * 3).padStart(2, "0") + "T18:00:00+00:00";
    out.push(i % 2 ? fx(d, ligue, club, 9000 + i, bm, be) : fx(d, ligue, 9000 + i, club, be, bm));
  }
  return out;
}
function bookmaker(nom, bets) { return { name: nom, bets: bets }; }
const B = {
  resultat: (h, n, a) => ({ id: 1, name: "Match Winner", values: [{ value: "Home", odd: h }, { value: "Draw", odd: n }, { value: "Away", odd: a }] }),
  buts: (lignes) => ({ id: 5, name: "Goals Over/Under", values: lignes.flatMap((l) => [{ value: "Over " + l[0], odd: l[1] }, { value: "Under " + l[0], odd: l[2] }]) }),
  ext: (lignes) => ({ id: 17, name: "Total - Away", values: lignes.flatMap((l) => [{ value: "Over " + l[0], odd: l[1] }, { value: "Under " + l[0], odd: l[2] }]) }),
};
// Petit club de Tercera RFEF (niveau 5) qui recoit un club de Liga (niveau 1), Coupe du Roi.
function matchCoupe(extra) {
  return Object.assign({ id: 777, league_id: 143, league_key: "copa_del_rey", date: "2026-10-28 20:00", status: "NS",
    home: { n: "Petit Club", id: 1 }, away: { n: "Gros Club", id: 2 }, data_quality_score: 15, model_output_available: false,
    no_signal: true, no_signal_reason: "AUCUN_MARCHE_AVEC_COTE_REELLE", no_signal_label: "Aucun signal clair sur ce match", pari_rec: "", market_id: null }, extra || {});
}
const DONNEES = { dom: saison(1, 445, 2, 1), ext: saison(2, 140, 1.6, 1) };
const ODDS = { bookmakers: [
  bookmaker("Bet365", [B.resultat("9.00", "5.50", "1.30"), B.buts([[1.5, "1.18", "4.80"], [2.5, "1.55", "2.40"], [3.5, "2.30", "1.60"], [4.5, "2.60", "1.50"]]), B.ext([[1.5, "1.62", "2.25"], [2.5, "2.60", "1.48"]])]),
  bookmaker("Betano", [B.resultat("8.50", "5.25", "1.32"), B.buts([[2.5, "1.57", "2.35"], [3.5, "2.25", "1.62"]])]),
  bookmaker("William Hill", [B.resultat("9.50", "5.00", "1.30"), B.buts([[2.5, "1.53", "2.45"], [3.5, "2.35", "1.58"]])]),
] };
const RELEVE = "2026-10-28T05:40:00.000Z";
const opts = (extra) => Object.assign({ configLigues: CFG, figes: {}, koIso: { 777: KO }, donnees: { 777: Object.assign({}, DONNEES, { odds: ODDS, odds_releve_a: RELEVE }) }, nowIso: "2026-10-28T06:00:00Z" }, extra || {});

test("verrou : config/verdicts-maths.json#repli_coupes = NO-GO pour les deux variantes ; seule la valeur « GO » ouvre la publication", () => {
  assert.deepEqual(VERDICTS.repli_coupes, { forme: "NO-GO", marche: "NO-GO",
    source: "validation du 28/10/2026 : forme 13/27 pour 59,3 % ; marché seul 12/29 pour 60,4 % sur 30 matchs de coupe à cotes réelles ; calcul à blanc jusqu'à 300 paris", date: "2026-10-28" });
  assert.deepEqual(RF.verdict(VERDICTS), { forme: "NO-GO", marche: "NO-GO" });
  assert.deepEqual(RF.verdict({}), { forme: "NO-GO", marche: "NO-GO" });
  assert.deepEqual(RF.verdict({ repli_coupes: { forme: "go", marche: "en_attente" } }), { forme: "NO-GO", marche: "NO-GO" });
  assert.deepEqual(RF.verdict({ repli_coupes: { forme: "GO" } }), { forme: "GO", marche: "NO-GO" });
});

test("NO-GO : publierRepli ne touche a rien (matchs et lignes premium identiques), meme avec un pari calculable", () => {
  const m = matchCoupe();
  const row = { fixture_id: 777, raw_response: {} };
  const avant = JSON.stringify([m, row]);
  const r = RF.publierRepli([m], [row], opts());
  assert.deepEqual([r.publies, r.bloque], [0, "NO-GO"]);
  assert.equal(JSON.stringify([m, row]), avant);
  // Le calcul existe pourtant : seul le verrou empeche la publication.
  assert.ok(RF.calculerBlanc([m], opts()).lignes.length >= 1);
});

test("calcul a blanc : les matchs ne sont jamais modifies ; une ligne par variante, cote reelle 1,40-2,00, chance affichee finale >= 50, heure du releve gardee", () => {
  const m = matchCoupe();
  const avant = JSON.stringify(m);
  const r = RF.calculerBlanc([m], opts({ pipelineSha: "abc" }));
  assert.equal(JSON.stringify(m), avant, "le calcul a blanc ne modifie pas le match");
  assert.equal(r.candidats, 1);
  const p = RF.lireParametres(CFG);
  assert.deepEqual(r.lignes.map((l) => l.variante).sort(), ["forme", "marche"]);
  r.lignes.forEach((l) => {
    assert.ok(l.cote >= 1.4 && l.cote >= p.cote_min && l.cote <= p.cote_max, l.variante + " cote " + l.cote);
    assert.ok(l.chance >= p.chance_min, l.variante + " chance " + l.chance);
    assert.equal(l.cote_releve_a, RELEVE, "heure du releve (captured_at), jamais une cote de cloture");
    assert.equal(l.coup_envoi, KO);
    assert.equal(l.fixture_id, 777);
    assert.equal(l.marche, MP.CATALOGUE[l.market_id].marche);
    assert.equal(l.cote_source, "marche");
    assert.equal(l.pipeline_sha, "abc");
    assert.equal(l.regle_version, RF.REGLE_VERSION);
  });
  const forme = r.lignes.find((l) => l.variante === "forme"), marche = r.lignes.find((l) => l.variante === "marche");
  assert.ok(RF.MARCHES_REPLI.includes(forme.market_id) && !p.marches_exclus.includes(forme.market_id));
  assert.ok(RF.MARCHES_MARCHE.includes(marche.market_id));
  // Forme : chance au plus le plus bas entre la forme et la cote sans marge.
  assert.ok(forme.chance <= Math.round(forme.details.sans_marge) && forme.chance <= Math.round(forme.details.p_forme));
});

test("variante marche : mediane, sur les bookmakers du releve, de la chance sans marge ; jamais le nul, jamais les deux marquent", () => {
  const ch = RF.chancesMediane(ODDS);
  assert.equal(ch["away-win"].n, 3);
  const un = (o) => { const q = require("../lib/flux-paris.js").puissance(o); return q.p; };
  const p = [un([9, 5.5, 1.3])[2], un([8.5, 5.25, 1.32])[2], un([9.5, 5, 1.3])[2]].map((x) => x * 100).sort((a, b) => a - b)[1];
  assert.ok(Math.abs(ch["away-win"].chance - p) < 1e-9);
  assert.ok(!ch.draw && !ch["btts-yes"] && !ch["btts-no"]);
  ["draw", "btts-yes", "btts-no"].forEach((id) => assert.ok(!RF.MARCHES_MARCHE.includes(id)));
});

test("zero fuite du futur et donnees perimees : avant le coup d'envoi, 365 derniers jours, amicaux exclus, 90 minutes", () => {
  const avant = fx("2026-10-20T18:00:00+00:00", 140, 2, 50, 1, 0);
  const meme = fx(KO, 140, 2, 51, 7, 0);
  const apres = fx("2026-10-30T18:00:00+00:00", 140, 2, 52, 9, 0);
  const vieux = fx("2025-09-01T18:00:00+00:00", 140, 2, 56, 4, 0); // plus de 365 jours
  const amical = fx("2026-10-10T18:00:00+00:00", 667, 2, 53, 8, 0, { nom: "Friendlies Clubs" });
  const prol = fx("2026-10-01T18:00:00+00:00", 143, 2, 54, 1, 1, { statut: "AET", prol: 2 });
  const enCours = fx("2026-10-27T18:00:00+00:00", 140, 2, 55, 3, 0, { statut: "2H" });
  const ms = RF.matchsAvant([apres, meme, avant, vieux, amical, prol, enCours], 2, KO, 365);
  assert.deepEqual(ms.map((x) => x.id), [avant.fixture.id, prol.fixture.id]);
  assert.equal(ms[1].bd, 1, "prolongation : le score du temps reglementaire");
  // Un match d'apres le coup d'envoi ne change pas la decision.
  const m = matchCoupe();
  const base = RF.calculerBlanc([m], opts()).lignes;
  const futur = { dom: DONNEES.dom.concat([fx("2026-10-29T18:00:00+00:00", 445, 1, 70, 9, 0)]), ext: DONNEES.ext.concat([fx("2026-10-29T18:00:00+00:00", 140, 2, 71, 0, 9)]), odds: ODDS, odds_releve_a: RELEVE };
  assert.deepEqual(RF.calculerBlanc([matchCoupe()], opts({ donnees: { 777: futur } })).lignes, base);
});

test("division : celle du dernier match de championnat ; moins de 5 matchs de championnat dans l'annee -> REPLI_FORME_DONNEES_PERIMEES", () => {
  // Montee recente : dernier match en Segunda (niveau 2) apres des matchs de Primera RFEF (niveau 3).
  const club = saison(3, 435, 1, 1).concat([fx("2026-10-12T18:00:00+00:00", 141, 3, 80, 1, 0)]);
  const d = RF.divisionDuClub(club, 3, KO, 365);
  assert.deepEqual([d.ligue, d.niveau, d.n_championnat], [141, 2, 11]);
  // Seulement des matchs de coupe : division inconnue -> donnees perimees.
  const coupe = [0, 1, 2, 3, 4, 5].map((i) => fx("2026-10-0" + (i + 1) + "T18:00:00+00:00", 143, 4, 90 + i, 2, 0));
  const r = RF.choisirForme(matchCoupe({ home: { n: "X", id: 4 } }), { dom: coupe, ext: DONNEES.ext, odds: ODDS }, { params: RF.lireParametres(CFG), avantIso: KO });
  assert.equal(r.raison, "REPLI_FORME_DONNEES_PERIMEES");
  // Championnat d'il y a plus d'un an : perime aussi.
  const ancien = saison(5, 445, 2, 1).map((f) => Object.assign({}, f, { fixture: Object.assign({}, f.fixture, { date: f.fixture.date.replace("2026", "2025") }) }));
  assert.equal(RF.choisirForme(matchCoupe({ home: { n: "Y", id: 5 } }), { dom: ancien, ext: DONNEES.ext, odds: ODDS }, { params: RF.lireParametres(CFG), avantIso: KO }).raison, "REPLI_FORME_DONNEES_PERIMEES");
  // Tables : 5 pays, niveaux 1 et 2 presents partout.
  ["ES", "DE", "EN", "IT", "FR"].forEach((pays) => [1, 2].forEach((n) => assert.ok(Object.values(RF.NIVEAUX).some((x) => x.pays === pays && x.niveau === n), pays + " " + n)));
});

test("refus de l'API compte a part (REPLI_FORME_API_ERREUR), aucune cote reelle -> rien d'invente, heure du releve inconnue -> rien d'archive", () => {
  const r = RF.calculerBlanc([matchCoupe()], opts({ donnees: { 777: { dom: [], ext: [], erreur_api: true, odds: ODDS, odds_releve_a: RELEVE } } }));
  assert.equal(r.raisons.forme.REPLI_FORME_API_ERREUR, 1);
  const r2 = RF.calculerBlanc([matchCoupe()], opts({ donnees: { 777: Object.assign({}, DONNEES, { odds: null, odds_releve_a: null }) } }));
  assert.equal(r2.lignes.length, 0);
  assert.equal(r2.raisons.forme.AUCUN_MARCHE_AVEC_COTE_REELLE, 1);
  assert.equal(r2.raisons.marche.AUCUN_MARCHE_AVEC_COTE_REELLE, 1);
  const r3 = RF.calculerBlanc([matchCoupe()], opts({ donnees: { 777: Object.assign({}, DONNEES, { odds: ODDS, odds_releve_a: null }) } }));
  assert.equal(r3.lignes.length, 0);
  assert.ok(r3.raisons.forme.REPLI_HEURE_DU_RELEVE_INCONNUE >= 1);
});

test("jamais sous 1,40 : aucune cote dans la fourchette -> aucune ligne", () => {
  const bas = { bookmakers: [bookmaker("Bet365", [B.resultat("15.0", "8.00", "1.10"), B.buts([[1.5, "1.05", "9.00"], [2.5, "1.25", "3.80"], [3.5, "1.38", "2.90"]])])] };
  const r = RF.calculerBlanc([matchCoupe()], opts({ donnees: { 777: Object.assign({}, DONNEES, { odds: bas, odds_releve_a: RELEVE }) } }));
  assert.equal(r.lignes.length, 0);
});

test("seuil du trader : la chance AFFICHEE FINALE (apres prudence et corrections) doit atteindre chance_min", () => {
  const cfg = JSON.parse(JSON.stringify(CFG));
  cfg.fiabilite.repli_forme.chance_min = 99;
  const r = RF.calculerBlanc([matchCoupe()], opts({ configLigues: cfg }));
  assert.equal(r.lignes.length, 0);
  assert.equal(r.raisons.forme.REPLI_CHANCE_TROP_BASSE, 1);
});

test("matchs concernes : jamais un pari fige, un match avec pari, un match commence ou ferme, un championnat", () => {
  const tous = [matchCoupe({ id: 1 }), matchCoupe({ id: 2, no_signal: false, no_signal_reason: undefined, pari_rec: "Over 2.5", market_id: "over-25" }),
    matchCoupe({ id: 3, status: "1H" }), matchCoupe({ id: 4, no_signal_reason: "KICKOFF_IMMINENT" }), matchCoupe({ id: 5, league_id: 140, league_key: "laliga" })];
  assert.deepEqual(RF.matchsARepli(tous, { configLigues: CFG, figes: { 1: true } }), []);
});

test("GO (essai seulement) : la variante GO est publiee avec les champs du pari normal ; un pari fige ne change pas", () => {
  const m = matchCoupe();
  const fige = matchCoupe({ id: 778 });
  const row = { fixture_id: 777, raw_response: {} };
  const o = opts({ verdicts: { repli_coupes: { forme: "GO", marche: "NO-GO" } }, figes: { 778: true }, koIso: { 777: KO, 778: KO },
    donnees: { 777: Object.assign({}, DONNEES, { odds: ODDS, odds_releve_a: RELEVE }), 778: Object.assign({}, DONNEES, { odds: ODDS, odds_releve_a: RELEVE }) } });
  const avantFige = JSON.stringify(fige);
  const r = RF.publierRepli([m, fige], [row], o);
  assert.deepEqual([r.publies, r.variante], [1, "forme"]);
  assert.equal(JSON.stringify(fige), avantFige);
  assert.equal(m.no_signal, false);
  assert.ok(Number(m.cote_rec) >= 1.4);
  assert.equal(m.pronostic.fiabilite, "en test");
  assert.equal(row.pari_rec, m.pari_rec);
});

test("reglement : score a 90 minutes (prolongation ignoree), match reporte ou annule -> « annule » ; chaque marche se regle comme il se lit", () => {
  const f = (st, h, a, gh, ga) => ({ fixture: { id: 1, status: { short: st } }, score: { fulltime: { home: h, away: a } }, goals: { home: gh, away: ga } });
  assert.deepEqual(RF.reglerLigne({ market_id: "away-win" }, f("AET", 1, 1, 1, 2)), { resultat: "perdu", score_90: "1-1" });
  assert.deepEqual(RF.reglerLigne({ market_id: "under-45" }, f("FT", 0, 3, 0, 3)), { resultat: "gagne", score_90: "0-3" });
  assert.deepEqual(RF.reglerLigne({ market_id: "over-15" }, f("PST", null, null, null, null)), { resultat: "annule", score_90: null });
  assert.equal(RF.reglerLigne({ market_id: "over-15" }, f("NS", null, null, null, null)), null);
  const R = require("../lib/resolvers.js");
  Array.from(new Set(RF.MARCHES_REPLI.concat(RF.MARCHES_MARCHE))).forEach((id) => {
    const d = MP.CATALOGUE[id];
    [[0, 0], [1, 0], [0, 1], [2, 3], [3, 2], [1, 4], [5, 0], [2, 2], [0, 6]].forEach(([h, a]) => assert.equal(R.resolveMarketWin(d.marche, h, a, {}), d.test({ h1: h, a1: a, h2: 0, a2: 0 }), id + " " + h + "-" + a));
  });
});

test("archivage prive : insert ligne par ligne sans ecraser (ignore-duplicates), reglement par PATCH ; rien ailleurs", async () => {
  const appels = [];
  const fakeFetch = async (url, init) => {
    appels.push({ url: url, init: init || {} });
    if (init && init.method === "POST") return { ok: true, json: async () => JSON.parse(init.body) };
    if (!init || !init.method) return { ok: true, json: async () => [{ fixture_id: 777, variante: "forme", market_id: "away-win" }] };
    return { ok: true, json: async () => [] };
  };
  const lignes = RF.calculerBlanc([matchCoupe()], opts()).lignes;
  const a = await RF.archiver(lignes, { supabase: { url: "https://x.supabase.co", cle: "k" }, fetch: fakeFetch });
  assert.deepEqual(a, { nouvelles: lignes.length, refus: 0 });
  appels.forEach((c) => {
    assert.match(c.url, /\/rest\/v1\/repli_coupes_blanc\?on_conflict=fixture_id,variante$/);
    assert.match(c.init.headers.Prefer, /resolution=ignore-duplicates/);
  });
  appels.length = 0;
  const n = await RF.reglerArchive({ supabase: { url: "https://x.supabase.co", cle: "k" }, fetch: fakeFetch, nowMs: Date.parse("2026-10-29T08:00:00Z"),
    matchsParIds: async () => [{ fixture: { id: 777, status: { short: "FT" } }, score: { fulltime: { home: 0, away: 2 } } }] });
  assert.equal(n, 1);
  const patch = appels.find((c) => c.init.method === "PATCH");
  assert.match(patch.url, /repli_coupes_blanc\?fixture_id=eq\.777&variante=eq\.forme/);
  assert.equal(JSON.parse(patch.init.body).resultat, "gagne");
  assert.equal(await RF.archiver(lignes, {}), null, "sans base : rien");
});

test("migration 0059 : table privee (RLS sans policy, revoke anon et authenticated), decision avant le coup d'envoi, gel", () => {
  const sql = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "0059_repli_coupes_blanc.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.repli_coupes_blanc/);
  assert.match(sql, /alter table public\.repli_coupes_blanc enable row level security;/);
  assert.match(sql, /revoke all on public\.repli_coupes_blanc from anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /primary key \(fixture_id, variante\)/);
  assert.match(sql, /now\(\) >= new\.coup_envoi/);
  assert.match(sql, /cote_releve_a is null or new\.cote_releve_a > now\(\)/);
  assert.match(sql, /check \(cote >= 1\.40\)/);
});

test("pipeline : calcul a blanc APRES publierPronostics et AVANT l'alignement ; publication seulement sous feu GO ; aucun 2e appel /odds ; cache et refus de l'API", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github", "workflows", "update-data.yml"), "utf8");
  const iPub = wf.indexOf("PRONOSTIC.publierPronostics(allMatchsData");
  const iBlanc = wf.indexOf("REPLI_FORME.calculerBlanc(");
  const iAlign = wf.indexOf("PRONOSTIC.alignerChancesAffichees(allMatchsData");
  assert.ok(iPub > 0 && iBlanc > iPub && iAlign > iBlanc, [iPub, iBlanc, iAlign].join(" "));
  const debut = wf.lastIndexOf("// ================= REPLI DES MATCHS DE COUPE", iBlanc), fin = wf.indexOf("var rapportAlign=", iBlanc);
  // Code seulement (les commentaires disent justement ce qui n'est jamais fait).
  const bloc = wf.slice(debut, fin).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.doesNotMatch(bloc, /getOdds\(|\/odds\?/, "jamais un 2e appel /odds");
  assert.match(bloc, /ttlMs:REPLI_FORME\.CACHE_MS/);
  assert.match(bloc, /__ia_status/);
  assert.match(bloc, /figes:GEL_FIGES/);
  assert.doesNotMatch(bloc, /predictions_archive|pari_rec\s*=|telegram/i);
  // Seul appel qui publie : sous le feu GO.
  const iPubRepli = bloc.indexOf("REPLI_FORME.publierRepli(");
  assert.ok(iPubRepli > bloc.indexOf("if(FEU_REPLI.forme==='GO'||FEU_REPLI.marche==='GO'){"));
  assert.doesNotMatch(bloc, /console\.log\([^)]*(cote_rec|model_probability|\.cote\b|\.chance\b)/);
  // Releve /odds du calcul garde en memoire avec son heure.
  assert.match(wf, /if\(oddsRaw\) ODDS_DU_RUN\[String\(f\.id\)\]=/);
});
