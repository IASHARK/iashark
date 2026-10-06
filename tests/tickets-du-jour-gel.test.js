"use strict";
// TICKETS DU JOUR : gel, archivage avant match, pannes (regles-tickets.md §2.7, §4.1, tests 12-13).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const T = require("../lib/tickets-du-jour.js");
const LIGUES = require("../config/leagues.json");

const NOW = Date.parse("2026-10-04T06:00:00Z");
const GO = { tickets: { chance_ticket: "GO", selection_or: "GO", buteur_du_jour: "GO" }, categories_no_go: [] };
const SUPA = { url: "https://essai.supabase.co", cle: "cle-de-test" };

function match(id, o) {
  return Object.assign({
    id: id, home: { n: "Dom" + id }, away: { n: "Ext" + id }, date: "2026-10-04 18:00", league: "Ligue 1", league_key: "ligue1", league_id: 61,
    pari_rec: "Victoire Domicile", market_id: "home-win", no_signal: false, cote_rec: (1.4 + (id % 4) * 0.08).toFixed(2),
    cote_source: "anj", cote_bookmaker: "Winamax", chance_iashark: 55 + id,
    pronostic: { market_id: "home-win", publie: true, fiabilite: "vérifiée" },
  }, o || {});
}
// Regle du 06/10/2026 : candidats de chaque match (lib/pronostic.js#marchesCandidats) = une jambe sure impliquee par
// le pari affiche (« Dom ou nul ») et un pari « valeur » qui va dans le meme sens (« plus de 2,5 buts », grille v3).
const pois = (l, k) => { let p = Math.exp(-l); for (let x = 1; x <= k; x++) p *= l / x; return p; };
const GRILLE = [];
for (let h = 0; h <= 6; h++) for (let a = 0; a <= 6; a++) GRILLE.push({ cle: "SCORE:" + h + "-" + a, probabilite: Math.round(pois(1.8, h) * pois(0.9, a) * 10000) / 100 });
function jour(n) {
  const ms = []; for (let i = 1; i <= n; i++) ms.push(match(i, { v3_marches: GRILLE }));
  ms[0].v3_buteurs = [{ joueur_id: 3, joueur: "Z", cote: "away", p_marque: 0.33 }];
  const fixtureById = {}; ms.forEach((m) => { fixtureById[String(m.id)] = { fixture: { timestamp: Date.parse("2026-10-04T16:00:00Z") / 1000, status: { short: "NS" } } }; });
  const candidatsPar = {};
  ms.forEach((m, k) => {
    const i = k + 1;
    candidatsPar[String(m.id)] = [
      { market_id: "dc-1x", famille: "DC", cote: 1.25 + (i % 5) * 0.03, cote_anj: true, bookmaker: "Winamax", chance: 78, chance_affichee: 78 - (i % 3), fiabilite: "vérifiée", p_modele: 80, q: 78 },
      { market_id: "over-25", famille: "OU2.5", cote: 1.8 + i * 0.02, cote_anj: false, bookmaker: null, chance: 52, chance_affichee: 52, fiabilite: "vérifiée", p_modele: 52 + i, q: 52 },
    ];
  });
  return { matchs: ms, fixtureById, candidatsPar };
}
// Faux PostgREST : enregistre les appels, rend les lignes donnees.
function fauxFetch(opts) {
  opts = opts || {};
  const appels = [];
  const f = async function (url, init) {
    init = init || {};
    appels.push({ url: url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null, prefer: init.headers && init.headers.Prefer });
    if ((init.method || "GET") === "GET") {
      if (opts.lecture === "absente") return { ok: false, status: 404, json: async () => ({ code: "PGRST205" }) };
      if (opts.lecture === "panne") throw new Error("ECONNRESET");
      return { ok: true, status: 200, json: async () => opts.lignes || [] };
    }
    if (init.method === "POST" && /tickets_du_jour\?/.test(url)) {
      const corps = JSON.parse(init.body)[0];
      return { ok: true, status: 201, json: async () => (opts.dejaPris && opts.dejaPris.includes(corps.type) ? [] : [corps]) };
    }
    return { ok: true, status: 204, json: async () => null };
  };
  f.appels = appels;
  return f;
}
async function lancer(w, f, extra) {
  const avert = [], err = [];
  const r = await T.publierTicketsDuJour(Object.assign({ matchs: w.matchs, fixtureById: w.fixtureById, candidatsPar: w.candidatsPar, nowMs: NOW, configLigues: LIGUES, verdicts: GO, supabase: SUPA, fetch: f, snapshotTime: "2026-10-04T06:00:00.000Z",
    avertir: (t) => avert.push(t), erreur: (t) => err.push(t) }, extra || {}));
  return { r, avert, err };
}

test("publication : chaque type ecrit une fois (insert ignore-duplicates), statut du calcul note", async () => {
  const w = jour(10), f = fauxFetch();
  const { r } = await lancer(w, f);
  assert.equal(r.x5, "publie"); assert.equal(r.x10, "publie"); assert.equal(r.or, "publie"); assert.equal(r.buteur, "publie");
  const inserts = f.appels.filter((a) => a.method === "POST" && /tickets_du_jour\?on_conflict=jour,type/.test(a.url));
  assert.equal(inserts.length, 4);
  inserts.forEach((a) => {
    assert.match(a.prefer, /resolution=ignore-duplicates/);
    assert.doesNotMatch(a.prefer, /merge-duplicates/, "jamais un upsert qui ecrase");
    const l = a.body[0];
    assert.equal(l.jour, "2026-10-04");
    assert.equal(l.premier_coup_envoi, "2026-10-04T16:00:00.000Z");
    assert.equal(l.publie_a, undefined, "l'heure de publication est posee par la base");
  });
  const calc = f.appels.find((a) => /tickets_du_jour_calculs/.test(a.url));
  assert.deepEqual(calc.body[0].statuts, { x5: "publie", x10: "publie", or: "publie", buteur: "publie" });
  assert.deepEqual(r.daily_combos.combos.map((c) => [c.combo_id, c.status]), [["TICKET_X5", "GENERATED"], ["TICKET_X10", "GENERATED"]]);
});

test("12. ligne existante -> aucun recalcul ni ecriture du contenu ; seuls les etats evoluent", async () => {
  const w = jour(10);
  const contenu = { nb_matchs: 3, cote_totale: 4.62, chance: 20, jambes: [{ fixture_id: 2, market_id: "home-win", cote: Number(w.matchs[1].cote_rec), chance: 57 }, { fixture_id: 3, market_id: "home-win", cote: Number(w.matchs[2].cote_rec), chance: 58 }, { fixture_id: 4, market_id: "home-win", cote: Number(w.matchs[3].cote_rec), chance: 59 }] };
  const lignes = [{ type: "x5", meta: { nb_matchs: 3, cote_totale: 4.62 }, contenu: contenu, etats: {} }];
  w.fixtureById["3"].fixture.status.short = "PST";
  const f = fauxFetch({ lignes });
  const { r, err } = await lancer(w, f);
  assert.equal(r.x5, "deja_publie");
  assert.ok(!f.appels.some((a) => a.method === "POST" && a.body && a.body[0] && a.body[0].type === "x5"), "x5 jamais reecrit");
  const patch = f.appels.find((a) => a.method === "PATCH");
  assert.match(patch.url, /type=eq\.x5/);
  assert.deepEqual(Object.keys(patch.body), ["etats"], "seuls les etats sont envoyes");
  assert.equal(patch.body.etats.jambes["3"], "reporte");
  assert.equal(err.length, 0);
  // Deuxieme passage avec les memes etats : rien a ecrire.
  const f2 = fauxFetch({ lignes: [Object.assign({}, lignes[0], { etats: JSON.parse(JSON.stringify(patch.body.etats)) })] });
  await lancer(w, f2);
  assert.ok(!f2.appels.some((a) => a.method === "PATCH"));
});

test("12b. lecture impossible (table absente, panne) : aucune ecriture, avertissement, le calcul continue", async () => {
  for (const lecture of ["absente", "panne"]) {
    const f = fauxFetch({ lecture });
    const { r, avert } = await lancer(jour(10), f);
    assert.deepEqual([r.x5, r.x10, r.or, r.buteur], ["indisponible", "indisponible", "indisponible", "indisponible"], lecture);
    assert.ok(!f.appels.some((a) => a.method !== "GET"), lecture + " : aucune ecriture");
    assert.match(avert.join(" "), /table indisponible/);
    assert.deepEqual(r.daily_combos.combos.map((c) => c.status), ["UNAVAILABLE", "UNAVAILABLE"]);
  }
  // Sans cle Supabase : rien lu, rien ecrit.
  const { r, avert } = await lancer(jour(10), fauxFetch(), { supabase: null });
  assert.equal(r.x5, "indisponible");
  assert.match(avert[0], /cle Supabase absente/);
});

test("12c. feu vert du mathematicien absent : rien n'est lu, calcule ni ecrit", async () => {
  const f = fauxFetch();
  const { r } = await lancer(jour(10), f, { verdicts: { tickets: { chance_ticket: "en_attente", selection_or: "NO-GO", buteur_du_jour: "en_attente" } } });
  assert.deepEqual([r.x5, r.x10, r.or, r.buteur], ["non_go", "non_go", "non_go", "non_go"]);
  assert.equal(f.appels.length, 0);
  assert.deepEqual(r.daily_combos.combos.map((c) => c.status), ["NOT_VALIDATED", "NOT_VALIDATED"]);
  // Le fichier du depot : rien n'est GO tant que le mathematicien ne l'a pas ecrit.
  const v = require("../config/verdicts-maths.json");
  ["chance_ticket", "selection_or", "buteur_du_jour"].forEach((k) => assert.ok(["GO", "NO-GO", "en_attente"].includes(v.tickets[k]), k));
});

test("12d. aucun ticket possible : rien d'ecrit (un calcul plus tard le meme jour pourra publier), statut « aucun »", async () => {
  const w = jour(2);
  const f = fauxFetch();
  const { r } = await lancer(w, f);
  assert.equal(r.x5, "aucun"); assert.equal(r.x10, "aucun"); assert.equal(r.or, "aucun");
  assert.ok(!f.appels.some((a) => a.method === "POST" && /tickets_du_jour\?/.test(a.url) && a.body[0].type !== "buteur"));
  const calc = f.appels.find((a) => /tickets_du_jour_calculs/.test(a.url));
  assert.equal(calc.body[0].statuts.x5, "aucun");
  assert.match(calc.prefer, /merge-duplicates/, "le statut du calcul, lui, se met a jour");
});

test("12e. course entre deux calculs : ligne deja prise -> deja_publie, rien d'ecrase", async () => {
  const f = fauxFetch({ dejaPris: ["x5"] });
  const { r } = await lancer(jour(10), f);
  assert.equal(r.x5, "deja_publie");
  assert.equal(r.ecrits, 3);
});

test("13. jambe figee differente du pari affiche sur sa page : alerte (compteur seulement), ticket inchange", async () => {
  const w = jour(10);
  const contenu = { jambes: [{ fixture_id: 2, market_id: "away-win", cote: 1.6, chance: 57 }, { fixture_id: 3, market_id: "home-win", cote: 9.99, chance: 58 }, { fixture_id: 4, market_id: "home-win", cote: Number(w.matchs[3].cote_rec), chance: 59 }] };
  const f = fauxFetch({ lignes: [{ type: "x10", meta: {}, contenu: contenu, etats: {} }] });
  const { r, err } = await lancer(w, f);
  assert.equal(r.alertes, 2);
  assert.equal(err.length, 1);
  assert.doesNotMatch(err[0], /away-win|home-win|Dom|Ext|1\.6|9\.99/, "jamais un match, un pari ou une cote dans le journal");
  assert.ok(!f.appels.some((a) => a.method === "POST" && a.body && a.body[0] && a.body[0].type === "x10"));
});

test("journal : statuts et compteurs seulement", async () => {
  const { r } = await lancer(jour(10), fauxFetch());
  const ligne = T.ligneJournal(r);
  assert.match(ligne, /^\[TICKETS\] jour=2026-10-04 x5=publie x10=publie or=publie buteur=publie jambes=10 /);
  assert.doesNotMatch(ligne, /Dom|Ext|Winamax|home-win|Victoire|\d+ ?%/);
});

test("pipeline : bloc des tickets apres la publication des paris, avant la protection du fichier public, jamais bloquant", () => {
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github/workflows/update-data.yml"), "utf8");
  const option = wf.indexOf("PRONOSTIC.poserOptionCote(allMatchsData");
  const tickets = wf.indexOf("TICKETS_DU_JOUR.publierTicketsDuJour(");
  const protection = wf.indexOf("// ================= PROTECTION DU FICHIER PUBLIC");
  const publics = wf.indexOf("var matchsPublics=allMatchsData.map(");
  assert.ok(option !== -1 && tickets > option && tickets < protection && protection < publics);
  const bloc = wf.slice(wf.lastIndexOf("try{", tickets), wf.indexOf("}catch(e){", tickets) + 200);
  assert.match(bloc, /\}catch\(e\)\{ console\.log\('::warning title=Tickets::tickets non calcules/);
  assert.match(bloc, /runOutput\.DAILY_COMBOS=rapportTickets\.daily_combos;/);
  assert.match(bloc, /console\.log\('  '\+TICKETS_DU_JOUR\.ligneJournal\(rapportTickets\)\);/);
  assert.doesNotMatch(bloc, /console\.log\([^)]*(jambes\b|\.contenu|cote_totale|chance)/, "jamais un ticket dans le journal");
});

test("migration 0050 : table fermee, gel, heure posee par la base, ticket refuse apres le coup d'envoi", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "supabase/migrations/0050_tickets_du_jour.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.tickets_du_jour \(/);
  assert.match(sql, /primary key \(jour, type\)/);
  assert.match(sql, /check \(type in \('x5', 'x10', 'or', 'buteur'\)\)/);
  assert.match(sql, /alter table public\.tickets_du_jour enable row level security;/);
  assert.match(sql, /revoke all on public\.tickets_du_jour from anon, authenticated;/);
  assert.match(sql, /revoke all on public\.tickets_du_jour_calculs from anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy/i, "aucune policy : service role seulement");
  assert.match(sql, /new\.publie_a := now\(\);/);
  assert.match(sql, /now\(\) >= new\.premier_coup_envoi/);
  for (const k of ["jour", "type", "regle_version", "meta", "contenu", "premier_coup_envoi", "publie_a", "pipeline_sha"]) assert.match(sql, new RegExp("new\\." + k + " := old\\." + k + ";"), k);
  assert.doesNotMatch(sql, /new\.etats := old/, "les etats evoluent");
  assert.match(sql, /suppression refusee/);
  assert.match(sql, /NE PAS APPLIQUER sans l'accord de Clement/);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "supabase/tests/0050_tickets_du_jour.test.sql")));
  // Numero libre : aucune autre migration 0050.
  assert.equal(fs.readdirSync(path.join(__dirname, "..", "supabase/migrations")).filter((f) => f.startsWith("0050_")).length, 1);
});

// ETATS TOUTE LA JOURNEE (controle de l'ingenieur donnees du 04/10/2026) : le releve de cloture (toutes les
// 30 min, statuts deja lus, aucun appel en plus) marque un match reporte ou annule d'un ticket deja publie.
test("actualiserEtats : match reporte dans la journee -> etat et « sans ce match » ; jamais de retour a « a venir » ; aucun ticket recalcule", async () => {
  const w = jour(10), f0 = fauxFetch();
  await lancer(w, f0);
  const ecrit = (type) => f0.appels.find((a) => a.method === "POST" && a.body && a.body[0] && a.body[0].type === type).body[0];
  const x5 = ecrit("x5");
  const fid = String(x5.contenu.jambes[0].fixture_id);
  // Releve de 16:00 : le premier match du ticket est reporte (PST), les autres a venir.
  const vus = {}; x5.contenu.jambes.forEach((j) => { vus[String(j.fixture_id)] = { fixture: { status: { short: "NS" } } }; });
  vus[fid] = { fixture: { status: { short: "PST" } } };
  const f = fauxFetch({ lignes: [{ jour: "2026-10-04", type: "x5", meta: x5.meta, contenu: x5.contenu, etats: {}, publie_a: "2026-10-04T06:00:00Z" }] });
  const r = await T.actualiserEtats({ fixtureById: vus, nowMs: Date.parse("2026-10-04T14:00:00Z"), supabase: SUPA, fetch: f });
  assert.deepEqual([r.lus, r.mis_a_jour], [1, 1]);
  const patch = f.appels.find((a) => a.method === "PATCH");
  assert.match(patch.url, /tickets_du_jour\?jour=eq\.2026-10-04&type=eq\.x5/);
  assert.equal(patch.body.etats.jambes[fid], "reporte");
  assert.ok(patch.body.etats.sans_matchs_reportes && patch.body.etats.sans_matchs_reportes.nb_matchs === x5.contenu.jambes.length - 1);
  assert.ok(!f.appels.some((a) => a.method === "POST"), "jamais un ticket recalcule ni reecrit");
  // Releve suivant : le match n'est plus dans la fenetre (aucun statut lu) -> l'etat « reporte » reste.
  const f2 = fauxFetch({ lignes: [{ jour: "2026-10-04", type: "x5", meta: x5.meta, contenu: x5.contenu, etats: patch.body.etats }] });
  const r2 = await T.actualiserEtats({ fixtureById: {}, nowMs: Date.parse("2026-10-04T14:30:00Z"), supabase: SUPA, fetch: f2 });
  assert.deepEqual([r2.lus, r2.mis_a_jour], [1, 0]);
  // Table illisible : rien, jamais d'exception.
  const r3 = await T.actualiserEtats({ fixtureById: vus, supabase: SUPA, fetch: fauxFetch({ lecture: "panne" }) });
  assert.equal(r3.mis_a_jour, 0);
  // Le releve de cloture l'appelle avec les statuts deja lus.
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "closing-odds.yml"), "utf8");
  assert.match(wf, /if \(fid != null\) statutsVus\[String\(fid\)\] = fx;/);
  assert.match(wf, /TICKETS\.actualiserEtats\(\{ fixtureById: statutsVus, supabase: \{ url: SUPA_URL, cle: SUPA_KEY \}/);
});
