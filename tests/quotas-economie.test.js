"use strict";
// MODE ECONOMIE (03/10/2026) : API-Football Pro (7 500 requetes par jour) et The Odds API
// (20 000 credits par mois). Reglages : config/quotas.json ; compteurs : lib/quotas.js ;
// client The Odds API du pipeline : lib/odds-api-econome.js. Aucun appel reseau reel ici.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const QUOTAS = require("../lib/quotas.js");
const ECO = require("../lib/odds-api-econome.js");
const POLICY = require("../lib/api-fetch-policy.js");
const CFG = require("../config/quotas.json");
const LIGUES = require("../config/leagues.json");
const MOTEUR = require("../config/moteur-v3.json");

const MAINTENANT = new Date("2026-10-10T08:00:00Z");
const entetes = (o) => ({ get: (k) => (o[k] == null ? null : String(o[k])) });

/** fetch simule de The Odds API : compte les appels gratuits (/events) et payants. */
function fauxOdds({ evenements = { soccer_epl: [{ id: "e1", home_team: "Arsenal", away_team: "Chelsea" }] }, utilises = 100, restants = 19900 } = {}) {
  const vus = [];
  let u = utilises;
  const f = async (url) => {
    const x = new URL(url);
    vus.push(x.pathname + "?" + x.searchParams.toString());
    const parts = x.pathname.split("/");
    const sport = parts[3];
    const gratuit = parts[4] === "events" && !parts[5];
    const cout = gratuit ? 0 : (x.searchParams.get("markets") || "").split(",").length;
    u += cout;
    const corps = gratuit ? (evenements[sport] || [])
      : parts[4] === "events" ? { id: parts[5], bookmakers: [] }
        : (evenements[sport] || []).map((e) => ({ ...e, bookmakers: [{ key: "pinnacle", markets: [{ key: "h2h", outcomes: [{ name: e.home_team, price: 2.1 }, { name: "Draw", price: 3.4 }, { name: e.away_team, price: 3.5 }] }, { key: "totals", outcomes: [{ name: "Over", point: 2.5, price: 1.9 }, { name: "Under", point: 2.5, price: 1.95 }] }] }] }));
    return { ok: true, status: 200, headers: entetes({ "x-requests-used": u, "x-requests-remaining": restants - (u - utilises), "x-requests-last": cout }), json: async () => corps };
  };
  return { f, vus };
}

test("config/quotas.json : les 2 abonnements, plafonds et seuils lisibles par Clement", () => {
  assert.strictEqual(CFG.api_football.quota_jour, 7500);
  assert.strictEqual(CFG.odds_api.quota_mois, 20000);
  assert.ok(CFG.api_football.plafond_jour < CFG.api_football.quota_jour);
  assert.strictEqual(CFG.api_football.alerte_pct, 70);
  assert.strictEqual(CFG.odds_api.alerte_pct, 70);
  assert.strictEqual(CFG.odds_api.minimum_pct, 95);
  assert.strictEqual(CFG.odds_api.marches_releve_general, "h2h,totals", "releve general : h2h + totals seulement");
  assert.strictEqual(QUOTAS.lireConfig(), CFG);
});

test("perimetre The Odds API : seulement les competitions qui peuvent entrer dans la selection Pro ; les 48 restent au site", () => {
  const p = QUOTAS.perimetreOddsApi(LIGUES, MOTEUR, CFG);
  for (const k of Object.keys(LIGUES.fiabilite.ligues_validees_cotes_marche)) assert.ok(p.has(k), k);
  for (const k of ["laliga", "bundesliga", "seriea", "ligue1", "eredivisie", "primeira"]) assert.ok(p.has(k), k + " (moteur v3)");
  for (const k of ["ldc", "jleague", "saudi_proleague", "fa_cup"]) assert.ok(!p.has(k), k + " hors perimetre");
  assert.strictEqual(LIGUES.leagues.length, 48, "aucune competition retiree du site");
  assert.strictEqual(QUOTAS.perimetreOddsApi(LIGUES, MOTEUR, { odds_api: { perimetre: "toutes" } }), null);
});

test("The Odds API : /events (gratuit) AVANT /odds ; aucun credit pour une competition sans match ; 1 seul appel payant par competition", async () => {
  const { f, vus } = fauxOdds();
  const c = ECO.creerClientOddsApi({ cle: "factice", fetchBrut: f, config: CFG, etat: QUOTAS.etatVide(), maintenant: MAINTENANT, bookmakers: "pinnacle,betclic_fr" });
  assert.deepStrictEqual(await c.cotesCompetition("soccer_spain_segunda_division"), [], "aucun match : rien a payer");
  assert.ok(vus.every((u) => /\/events\?/.test(u)), "seulement /events");
  const a = await c.cotesCompetition("soccer_epl");
  const b = await c.cotesCompetition("soccer_epl");
  assert.strictEqual(a, b);
  const payants = vus.filter((u) => /\/odds\?/.test(u));
  assert.strictEqual(payants.length, 1, "un seul appel payant par competition et par lancement");
  assert.ok(vus.indexOf(vus.find((u) => /soccer_epl\/events\?/.test(u))) < vus.indexOf(payants[0]), "/events d'abord");
  assert.match(payants[0], /markets=h2h%2Ctotals/);
  assert.match(payants[0], /bookmakers=pinnacle%2Cbetclic_fr/, "liste de bookmakers = 1 seule region facturee");
  assert.ok(!/regions=/.test(payants[0]));
  assert.strictEqual(c.rapport.credits, 2);
  assert.strictEqual(c.rapport.evites_sans_match, 1);
  assert.deepStrictEqual(ECO.pinnacleDepuisEvenement(a[0]), { c1: 2.1, cn: 3.4, c2: 3.5, over25: 1.9, under25: 1.95 });
});

test("The Odds API : plafond du jour respecte (au-dela, plus aucun appel payant non essentiel)", async () => {
  const etat = QUOTAS.etatVide();
  QUOTAS.noterOddsApi(etat, { utilises: 1000, restants: 19000, dernier: 0 }, MAINTENANT); // debut de journee
  QUOTAS.noterOddsApi(etat, { utilises: 1000 + CFG.odds_api.plafond_jour, restants: 19000 - CFG.odds_api.plafond_jour, dernier: 2 }, MAINTENANT);
  assert.strictEqual(QUOTAS.situation(etat, CFG, MAINTENANT).odds_api.utilises_jour, CFG.odds_api.plafond_jour);
  assert.strictEqual(QUOTAS.situation(etat, CFG, MAINTENANT).odds_api.mode, "plafond_jour");
  const { f, vus } = fauxOdds({ utilises: 1000 + CFG.odds_api.plafond_jour, restants: 19000 - CFG.odds_api.plafond_jour });
  const c = ECO.creerClientOddsApi({ cle: "factice", fetchBrut: f, config: CFG, etat, maintenant: MAINTENANT });
  assert.deepStrictEqual(await c.cotesCompetition("soccer_epl"), []);
  assert.strictEqual(vus.filter((u) => /\/odds\?/.test(u)).length, 0, "aucun credit");
  assert.strictEqual(await c.cotesEvenement("soccer_epl", "e1", "double_chance"), null);
  assert.strictEqual(c.rapport.refuses_plafond, 2);
  // Un appel ESSENTIEL passe toujours (le quota reel reste le garde-fou).
  assert.ok(QUOTAS.autorise("odds_api", etat, CFG, { essentiel: true, maintenant: MAINTENANT }));
});

test("The Odds API : autres marches par match plafonnes ; selections nationales plafonnees a part", async () => {
  const cfg = { ...CFG, odds_api: { ...CFG.odds_api, max_evenements_par_jour: 3, max_evenements_selections_nationales: 1 } };
  const { f } = fauxOdds();
  const c = ECO.creerClientOddsApi({ cle: "factice", fetchBrut: f, config: cfg, etat: QUOTAS.etatVide(), maintenant: MAINTENANT });
  assert.ok(await c.cotesEvenement("soccer_uefa_nations_league", "n1", "double_chance", { selectionNationale: true }));
  assert.strictEqual(await c.cotesEvenement("soccer_uefa_nations_league", "n2", "double_chance", { selectionNationale: true }), null, "plafond selections");
  assert.ok(await c.cotesEvenement("soccer_epl", "e1", "double_chance"));
  assert.ok(await c.cotesEvenement("soccer_epl", "e2", "double_chance"));
  assert.strictEqual(await c.cotesEvenement("soccer_epl", "e3", "double_chance"), null, "plafond par lancement");
  // Meme reponse servie a lib/cote-anj.js, sans credit de plus.
  const fj = c.fetchJsonCoteAnj(() => false);
  await fj("https://api.the-odds-api.com/v4/sports/soccer_epl/odds?apiKey=x&markets=h2h,totals");
  await fj("https://api.the-odds-api.com/v4/sports/soccer_epl/odds?apiKey=x&markets=h2h,totals");
  assert.strictEqual(c.rapport.appels_payants, 3 + 1);
  await assert.rejects(fj("https://api.the-odds-api.com/v4/sports/soccer_epl/events/e9/odds?markets=btts"), /plafond/);
});

test("alerte a 70 % (une fois par jour / par mois), mode minimum automatique a 95 %", () => {
  const etat = QUOTAS.etatVide();
  QUOTAS.noterApiFootball(etat, { limite: 7500, restantes: 7500 - 5300 }, MAINTENANT); // 70,7 %
  QUOTAS.noterOddsApi(etat, { utilises: 13900, restants: 6100, dernier: 2 }, MAINTENANT); // 69,5 %
  let a = QUOTAS.alertesDues(etat, CFG, MAINTENANT);
  assert.strictEqual(a.length, 1);
  assert.match(a[0].texte, /API-Football : 5 300 requêtes utilisées aujourd'hui sur 7 500 \(70\.7 %\)/);
  assert.deepStrictEqual(QUOTAS.alertesDues(etat, CFG, MAINTENANT), [], "jamais deux fois le meme jour");
  QUOTAS.noterOddsApi(etat, { utilises: 14100, restants: 5900, dernier: 2 }, MAINTENANT);
  a = QUOTAS.alertesDues(etat, CFG, MAINTENANT);
  assert.strictEqual(a.length, 1);
  assert.match(a[0].texte, /The Odds API : 14 100 crédits utilisés ce mois-ci sur 20 000 \(70\.5 %\)/);
  assert.strictEqual(QUOTAS.situation(etat, CFG, MAINTENANT).api_football.mode, "normal");
  // 95 % : mode minimum, une alerte de plus.
  QUOTAS.noterApiFootball(etat, { limite: 7500, restantes: 300 }, MAINTENANT);
  assert.strictEqual(QUOTAS.situation(etat, CFG, MAINTENANT).api_football.mode, "minimum");
  assert.strictEqual(QUOTAS.autorise("api_football", etat, CFG, { maintenant: MAINTENANT }), false);
  a = QUOTAS.alertesDues(etat, CFG, MAINTENANT);
  assert.strictEqual(a.length, 1);
  assert.match(a[0].texte, /Mode minimum automatique/);
  // Le lendemain : compteur API-Football remis a zero (minuit UTC).
  assert.strictEqual(QUOTAS.situation(etat, CFG, new Date("2026-10-11T08:00:00Z")).api_football.mode, "normal");
});

test("compteurs lus dans les en-tetes reels des API (jamais estimes) ; etat sans secret", () => {
  assert.deepStrictEqual(QUOTAS.entetesApiFootball({ "x-ratelimit-requests-limit": "7500", "x-ratelimit-requests-remaining": "7100" }), { limite: 7500, restantes: 7100 });
  assert.deepStrictEqual(QUOTAS.statusApiFootball({ response: { requests: { current: 420, limit_day: 7500 } } }), { limite: 7500, restantes: 7080 });
  assert.deepStrictEqual(QUOTAS.entetesOddsApi(entetes({ "x-requests-used": 12, "x-requests-remaining": 19988, "x-requests-last": 2 })), { utilises: 12, restants: 19988, dernier: 2 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quotas-"));
  const f = path.join(dir, "etat.json");
  const etat = QUOTAS.noterApiFootball(QUOTAS.etatVide(), { limite: 7500, restantes: 7000 }, MAINTENANT);
  QUOTAS.ecrireEtat(etat, f);
  const txt = fs.readFileSync(f, "utf8");
  assert.ok(!/apiKey|x-apisports-key|token/i.test(txt));
  assert.strictEqual(QUOTAS.lireEtat(f).api_football.utilisees_jour, 500);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("API-Football : plafond du jour (refus sans appel, sauf essentiel), cache disque des matchs termines", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "af-cache-"));
  let appels = 0, permis = true;
  const rep = { response: [{ type: "Goal" }] };
  const fetcher = POLICY.createThrottledFetcher(async (url) => { appels++; return url.includes("vide") ? { response: [] } : rep; },
    { minIntervalMs: 0, sleepFn: async () => {}, diskCache: POLICY.createDiskCache(dir), budget: () => permis });
  const r1 = await fetcher.fetchWithPolicy("https://v3.football.api-sports.io/fixtures/events?fixture=1", { ttlMs: 3600e3 });
  assert.strictEqual(r1.status, "OK");
  // Lancement suivant (nouveau fetcher, meme dossier) : lu sur le disque, aucune requete.
  const f2 = POLICY.createThrottledFetcher(async () => { appels++; return rep; }, { minIntervalMs: 0, sleepFn: async () => {}, diskCache: POLICY.createDiskCache(dir) });
  const r2 = await f2.fetchWithPolicy("https://v3.football.api-sports.io/fixtures/events?fixture=1", { ttlMs: 3600e3 });
  assert.deepStrictEqual(r2.parsed, rep);
  assert.strictEqual(appels, 1);
  assert.strictEqual(f2.stats.disk_hits, 1);
  // Reponse vide jamais gardee (donnee pas encore publiee).
  await fetcher.fetchWithPolicy("https://v3.football.api-sports.io/fixtures/events?fixture=vide", { ttlMs: 3600e3 });
  await f2.fetchWithPolicy("https://v3.football.api-sports.io/fixtures/events?fixture=vide", { ttlMs: 3600e3 });
  assert.strictEqual(appels, 3);
  // Plafond atteint : refus classe RATE_LIMIT (jamais « aucune donnee »), sauf appel essentiel.
  permis = false;
  const r3 = await fetcher.fetchWithPolicy("https://v3.football.api-sports.io/injuries?fixture=9");
  assert.strictEqual(r3.status, "RATE_LIMIT");
  assert.strictEqual(POLICY.classifyApiResponse(r3.parsed), "RATE_LIMIT");
  assert.strictEqual(appels, 3, "aucune requete");
  const r4 = await fetcher.fetchWithPolicy("https://v3.football.api-sports.io/fixtures?date=2026-10-10", { essentiel: true });
  assert.strictEqual(r4.status, "OK");
  assert.strictEqual(appels, 4);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("pipeline : matchs par date en 1 appel, caches, plafond, perimetre, etat publie et alerte Telegram", () => {
  const wf = fs.readFileSync(path.join(root, ".github/workflows/update-data.yml"), "utf8");
  assert.match(wf, /fixtures\?date='\+dates\[dd\]\+'&timezone=Europe%2FParis', APS, \{essentiel: true\}/);
  assert.match(wf, /teams\/statistics\?team='\+tid\+'&league='\+lgIdF\+'&season='/, "pre-chargement : meme URL que getTeamStats");
  assert.match(wf, /fixtures\/events\?fixture='\+fixtureId, APS, \{ttlMs: ttl\('match_termine'\)\}/);
  assert.match(wf, /standings\?league='\+lg\.id\+'&season='\+stSeason,APS,\{ttlMs: ttl\('journalier'\)\}/);
  assert.match(wf, /injuries\?fixture='\+fixtureId, APS, \{ttlMs: ttl\('journalier'\)\}/);
  assert.match(wf, /budget: function\(\)\{ return QUOTAS\.autorise\('api_football'/);
  assert.ok(!/regions=eu&markets=h2h,totals,btts/.test(wf), "plus de releve Pinnacle par match (3 credits a chaque match)");
  assert.match(wf, /fetchJsonAnj=oddsClient\(\)\.fetchJsonCoteAnj/);
  assert.match(wf, /path: \.cache-api-football/);
  assert.match(wf, /actions\/cache\/save@v4/);
  assert.match(wf, /LIFECYCLE_FILES="[^"]*data\/quotas-etat\.json"/);
  assert.match(wf, /TELEGRAM_CHAT_ID:\s+\$\{\{ secrets\.TELEGRAM_CHAT_ID \}\}/);
  assert.match(wf, /QUOTAS\.alertesDues\(QUOTA_ETAT, QUOTA_CFG\)/);
  assert.match(wf, /\/status', APS\)/, "compteur du jour lu sur /status (gratuit)");
});

test("cotes de cloture (archive) : plus 1 requete par match a chaque lancement ; 1 appel pour 20 matchs, fenetre courte", () => {
  const wf = fs.readFileSync(path.join(root, ".github/workflows/closing-odds.yml"), "utf8");
  assert.ok(!/fixtures\?id=' \+ fid/.test(wf));
  assert.match(wf, /fixtures\?ids=' \+ lot\.join\('-'\)/);
  assert.match(wf, /cloture\.fenetre_minutes/);
  assert.ok(CFG.api_football.cloture.fenetre_minutes <= 60);
});

test("Canal Pro : suivi des cotes seulement sur les paris de la selection, toutes les 55 min, reporte au-dela du plafond", async () => {
  const src = fs.readFileSync(path.join(root, "scripts/canal-pro/taches.mjs"), "utf8");
  // Les paris suivis sont ceux de la selection du jour (pro_paris ouverts), jamais tout le site.
  assert.match(src, /const tous = \(await parisOuverts\(ctx\)\)\.filter\(\(p\) => p\.famille !== "buteur"\);/);
  assert.match(src, /SUIVI_COTES_MIN \* MIN/);
  assert.match(src, /essentiel: force \|\| finals\.length > 0/);
  // Compositions heure par heure : seulement les paris de la selection (simples et buteur) proches du coup d'envoi.
  assert.match(src, /const paris = \(await parisOuverts\(ctx\)\)\.filter\(\(p\) => \["simple", "buteur"\]\.includes\(p\.famille\) && !p\.compo_voyant && p\.fixture_id/);
  const { creerSources } = await import("../scripts/canal-pro/lib/sources.mjs");
  const etatDir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-quotas-"));
  const fEtat = path.join(etatDir, "etat.json");
  const etat = QUOTAS.etatVide();
  QUOTAS.noterOddsApi(etat, { utilises: 19100, restants: 900, dernier: 0 }, MAINTENANT); // 95,5 % : minimum
  QUOTAS.ecrireEtat(etat, fEtat);
  let appels = 0;
  const s = creerSources({ ODDS_API_KEY: "factice", QUOTAS_ETAT: fEtat }, { log: () => {}, maintenant: () => MAINTENANT, fetchFn: async () => { appels++; return { ok: true, headers: entetes({}), json: async () => [] }; } });
  const pari = { id: "p1", famille: "simple", event_id: "e1", sport_key: "soccer_epl", marche: "1" };
  await assert.rejects(s.etatsParis([pari], MAINTENANT, { essentiel: false }), /mode économie/);
  assert.strictEqual(appels, 0, "aucun credit pour le suivi periodique en mode minimum");
  await s.etatsParis([pari], MAINTENANT, { essentiel: true });
  assert.strictEqual(appels, 1, "le releve de cloture d'un pari Pro passe toujours");
  assert.strictEqual(s.quotas().situation.odds_api.mode, "minimum");
  fs.rmSync(etatDir, { recursive: true, force: true });
});

test("couverture des ligues : verification sautee si le rapport est recent et complet (0 requete)", () => {
  const V = require("../scripts/verify-league-coverage.js");
  const leagues = [{ apiFootballId: 39 }, { apiFootballId: 61 }];
  const rapport = { generatedAt: "2026-10-08T00:00:00Z", leagues: [{ apiFootballId: 39, status: "VERIFIED" }, { apiFootballId: 61, status: "VERIFIED" }] };
  assert.strictEqual(V.rapportEncoreFrais(leagues, Date.parse("2026-10-10T00:00:00Z"), rapport, 7).frais, true);
  assert.strictEqual(V.rapportEncoreFrais(leagues, Date.parse("2026-10-20T00:00:00Z"), rapport, 7).frais, false, "trop vieux");
  assert.strictEqual(V.rapportEncoreFrais(leagues.concat({ apiFootballId: 78 }), Date.parse("2026-10-10T00:00:00Z"), rapport, 7).frais, false, "competition ajoutee");
});
