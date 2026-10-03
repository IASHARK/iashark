"use strict";
// UNE SEULE SOURCE DE CHIFFRES (regle de Clement, 01/10/2026).
// Le client Pro vient du site : il doit voir EXACTEMENT les memes chiffres sur la page match,
// dans l'espace Pro (combine, detecteur d'ecarts, accueil Pro), dans le Canal Pro, dans le
// canal gratuit Telegram et sur l'image a partager.
//
// Ce test rejoue une journee fictive de bout en bout, dans l'ordre du pipeline :
//   1. sortie du moteur v3 (contrat 1.1, donnees FICTIVES de scripts/canal-pro/lib/exemple-v3.mjs) ;
//   2. calcul du site (lib/moteur-v3.js puis lib/chance-iashark.js#poserChance, comme
//      .github/workflows/update-data.yml) ;
//   3. depot de la sortie pour le Canal Pro (scripts/canal-pro/deposer-sortie-v3.mjs#reduire) ;
// puis il GENERE la page match (match-page.js execute pour de vrai), l'espace Pro
// (lib/tools-domain.js, home-list.js, lib/buteurs-du-jour.js), les messages du Canal Pro
// (canal-pro.mjs), le message du canal gratuit (lib/telegram-posts.js) et son image
// (scripts/telegram/card.tpl), et verifie que chaque chiffre d'un meme pari est identique partout.
// Aucun de ces chiffres n'est un vrai pronostic.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vmLib = require("node:vm");

const root = path.join(__dirname, "..");
const V3 = require("../lib/moteur-v3.js");
const CHANCE = require("../lib/chance-iashark.js");
const COTE = require("../lib/cote-anj.js");
const MVM = require("../lib/match-view-model.js");
const D = require("../lib/tools-domain.js");
const P = require("../lib/telegram-posts.js");
const BDJ = require("../lib/buteurs-du-jour.js");
const PREMIUM = require("../lib/premium-fields.js");
const CONFIG = JSON.parse(fs.readFileSync(path.join(root, "config", "moteur-v3.json"), "utf8"));

const JOUR = "2026-10-07"; // mercredi
const VERIFIE = "vérifié sur le passé";
const texte = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/&[#a-z0-9]+;/gi, " ").replace(/ | /g, " ").replace(/\s+/g, " ");
const pctFr = (x) => `${x} %`;
const coteFr = (x) => Number(x).toFixed(2).replace(".", ",");

// Bookmakers agrees ANJ qui cotent la double chance dans le releve fictif (tous les suivis).
const DC_CHEZ = ["winamax_fr", "betclic_fr", "unibet_fr", "pmu_fr", "netbet_fr"];

// ---------------------------------------------------------------------------
// Donnees fictives : 4 matchs europeens (ligues du menu), avec buteurs.
// « sansMarge » : la cote sans marge que le SITE calcule pour chaque marche (API-Football,
// marge retiree) ; volontairement differente de la probabilite du moteur, pour que le
// « plus bas des deux » compte vraiment (plus bas que le moteur sur certains marches, plus
// haut sur d'autres).
async function journee() {
  const C = await import("../supabase/functions/_shared/canal-pro.mjs");
  const M = await import("../supabase/functions/_shared/canal-pro-menu.mjs");
  const EX = await import("../scripts/canal-pro/lib/exemple-v3.mjs");
  const DEP = await import("../scripts/canal-pro/deposer-sortie-v3.mjs");
  const ko = (hm) => C.parisVersDate(JOUR, hm).toISOString();
  const defs = [
    { id: "a", ligue_code: "D1", league: 78, dom: "Bayern Munich", ext: "Mainz", ko: ko("15:30"), lh: 2.6, la: 0.8, fixture: 9101, ecart: -4.3,
      buteurs: [{ equipe: "Bayern Munich", joueur: "Avant-centre A", joueur_id: 7001, p_marque: 0.53 }, { equipe: "Bayern Munich", joueur: "Ailier B", joueur_id: 7002, p_marque: 0.377 },
        { equipe: "Mainz", joueur: "Attaquant C", joueur_id: 7003, p_marque: 0.211 }, { equipe: "Mainz", joueur: "Remplacant D", joueur_id: 7004, p_marque: 0.3, statut: "remplaçant probable" }] },
    { id: "b", ligue_code: "F1", league: 61, dom: "Lens", ext: "Nantes", ko: ko("17:00"), lh: 1.6, la: 0.9, fixture: 9102, ecart: 3.2,
      buteurs: [{ equipe: "Lens", joueur: "Buteur E", joueur_id: 7005, p_marque: 0.349 }, { equipe: "Nantes", joueur: "Buteur F", joueur_id: 7006, p_marque: 0.12 }] },
    { id: "c", ligue_code: "I1", league: 135, dom: "Inter", ext: "Lecce", ko: ko("18:00"), lh: 2.0, la: 0.7, fixture: 9103, ecart: -2.55, buteurs: [] },
    { id: "d", ligue_code: "SP1", league: 140, dom: "Sevilla", ext: "Valencia", ko: ko("21:00"), lh: 1.4, la: 1.1, fixture: 9104, ecart: -6.05, buteurs: [] },
    { id: "e", ligue_code: "N1", league: 88, dom: "PSV", ext: "Heracles", ko: ko("20:45"), lh: 2.4, la: 0.8, fixture: 9105, ecart: -1.15, buteurs: [] },
    { id: "f", ligue_code: "P1", league: 94, dom: "Benfica", ext: "Arouca", ko: ko("22:30"), lh: 2.1, la: 0.8, fixture: 9106, ecart: 2.45, buteurs: [] },
    { id: "g", ligue_code: "D1", league: 78, dom: "Leverkusen", ext: "Augsburg", ko: ko("15:30"), lh: 1.9, la: 0.9, fixture: 9107, ecart: -3.35, buteurs: [] },
    { id: "h", ligue_code: "SP1", league: 140, dom: "Real Madrid", ext: "Getafe", ko: ko("21:00"), lh: 2.3, la: 0.7, fixture: 9108, ecart: -0.45, buteurs: [] },
  ];
  const matchs = defs.map((d) => {
    const m = EX.matchV3({ id: `${JOUR}-${d.id}`, ligue_code: d.ligue_code, dom: d.dom, ext: d.ext, ko: d.ko, lh: d.lh, la: d.la, fixture: d.fixture, buteurs: d.buteurs });
    m.api_football_fixture_id = d.fixture;
    m.ids_api_football = { fixture: d.fixture, ligue: d.league, domicile: null, exterieur: null };
    return m;
  });
  // Le pari publie par le moteur (« plus sur ») : pour chaque match, le marche que le Canal Pro
  // prendrait en simple (s'il y en a un), sinon le 1N2 le plus probable. Ainsi le meme pari
  // est affiche sur le site ET dans le Canal Pro.
  const cotesDe = (ms) => Object.fromEntries(ms.map((m) => [m.match_id, { event_id: `ev-${m.match_id}`, sport_key: EX.SPORT[m.ligue_code],
    books: C.booksDepuisOddsApi(EX.evenementOdds(m, { dcChez: DC_CHEZ })), releve_at: ko("08:10") }]));
  const { debut, fin } = C.fenetreProgramme(JOUR);
  const avant = M.construireMenu({ jour: JOUR, matchsJour: M.matchsMenu(EX.sortieV3(matchs, ko("08:00")), debut, fin), cotesParMatch: cotesDe(matchs) });
  const simples = avant.candidats.filter((c) => c.famille === "simple");
  for (const m of matchs) {
    const s = simples.find((x) => x.match_id === m.match_id);
    const cle = s ? s.cle_v3 : ["1N2:1", "1N2:2"].sort((a, b) => m.marches.find((x) => x.cle === b).probabilite - m.marches.find((x) => x.cle === a).probabilite)[0];
    const mk = m.marches.find((x) => x.cle === cle);
    m.selections = { plus_sur: { cle, libelle_fr: mk.libelle_fr, probabilite: mk.probabilite, confiance: "normale", eligible_vip: true, raisons: ["Raison fictive 1.", "Raison fictive 2.", "Raison fictive 3."] } };
  }
  const sortie = EX.sortieV3(matchs, ko("08:00"));
  return { C, M, EX, DEP, defs, matchs, sortie, cotesDe, ko, simplesAvant: simples };
}

// Le calcul du site pour un match (meme ordre que update-data.yml).
function calculSite(b, d, m) {
  const id = d.fixture;
  // Cotes du site par marche (API-Football) et cote sans marge (colonne consensus).
  const siteId = { "1N2:1": "home-win", "1N2:N": "draw", "1N2:2": "away-win", "DC:1N": "dc-1x", "DC:N2": "dc-x2", "DC:12": "dc-12" };
  const candidats = m.marches.filter((x) => siteId[x.cle]).map((x) => {
    const p = x.probabilite * 100;
    const fair = Math.max(1, Math.min(99, p + (x.cle === m.selections.plus_sur.cle ? d.ecart : 1.1)));
    return { id: siteId[x.cle], market: V3.cleVersSite(x.cle).market, cote: String(Number((1 / (fair / 100) / 1.05).toFixed(2))), prob: Math.round(p * 10) / 10, marketProb: fair };
  });
  const consensusDe = (idSite) => { const c = candidats.find((x) => x.id === idSite); return c ? Math.round(c.marketProb * 10) / 10 : null; };
  const choix = b.choisirPourFixture({ fixtureId: id, leagueId: d.league, kickoff: d.ko, home: d.dom, away: d.ext, homeId: null, awayId: null, candidats, ancien: null });
  assert.ok(choix.remplace && choix.pickedMarket, `pari du moteur v3 pour ${d.dom} : ${choix.raison}`);
  const pm = choix.pickedMarket;
  const comparatif = candidats.map((c) => ({ id: c.id, market: c.market, probability: c.prob, consensus: consensusDe(c.id), edge: Math.round((c.prob - consensusDe(c.id)) * 10) / 10 }));
  const matchObj = {
    id, sport: "football", league_id: d.league, league: M_LIGUE[d.ligue_code], home: { n: d.dom, id: id * 10 + 1 }, away: { n: d.ext, id: id * 10 + 2 },
    date: `${JOUR} ${new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(d.ko))}`, status: "NS",
    analysis_tier: "FULL_ANALYSIS", model_output_available: true, data_quality_score: 80, data_quality_label: "Bonne",
    model_probability: Math.round(pm.prob * 10) / 10, cote_rec: String(pm.cote), market_id: pm.id, pari_rec: pm.market, no_signal: false,
    markets_compared: comparatif, reliability: { label: "Moyenne" },
    market_consensus_p1: consensusDe("home-win"), market_consensus_pN: consensusDe("draw"), market_consensus_p2: consensusDe("away-win"),
    c1: candidats[0].cote, cn: candidats[1].cote, c2: candidats[2].cote, injuries: [], player_history: {}, current_squads: {},
  };
  b.completerMatch(matchObj, null, id, { consensusDe });
  return matchObj;
}
const M_LIGUE = { D1: "Bundesliga", F1: "Ligue 1", I1: "Serie A", SP1: "La Liga", N1: "Eredivisie", P1: "Primeira Liga" };

// Page match executee pour de vrai (meme faux navigateur que tests/fiabilite-ecart-masque.test.js), vue Pro.
function pageMatch() {
  const src = fs.readFileSync(path.join(root, "match-page.js"), "utf8");
  const i = src.lastIndexOf("init();");
  const code = src.slice(0, i) + "VUE_PRO=true;window.__MP={signalCard,marketsCard,faqCard,resumeCard,buteursCard,threatsCard,outputsCard,viewModel};\n" + src.slice(i + "init();".length);
  const el = { innerHTML: "", addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} };
  const win = { IasharkMatchViewModel: MVM, IasharkMarketLabels: require("../lib/market-labels.js"), location: { search: "", href: "" }, matchMedia: () => ({ matches: false }), addEventListener() {} };
  const ctx = { window: win, IasharkMatchViewModel: MVM, document: { getElementById: () => el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el, documentElement: el, body: el },
    console, setTimeout, clearTimeout, URLSearchParams, Intl, navigator: {} };
  vmLib.createContext(ctx);
  vmLib.runInContext(code, ctx);
  return win.__MP;
}
// Accueil (liste des matchs) : la note sur 10 d'un abonne Pro.
const HL = require("../home-list.js");

async function toutGenerer() {
  const J = await journee();
  const b = V3.creerBranchement({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: `sortie/${JOUR}.json` }, config: CONFIG, nowMs: Date.parse(J.ko("08:30")), lireFichier: () => JSON.stringify(J.sortie) });
  assert.equal(b.actif, true, b.raison);
  const site = J.defs.map((d, k) => calculSite(b, d, J.matchs[k]));
  // UNE SEULE COTE (lib/cote-anj.js, comme update-data.yml, avant la chance) : le releve des
  // bookmakers agrees ANJ, le MEME que celui du Canal Pro (J.cotesDe), pose sur le pari du site.
  // Le dernier match n'a aucune cote ANJ : il garde la cote du pipeline, « cote indicative ».
  site.forEach((m, k) => {
    if (k === site.length - 1) { COTE.marquerIndicative(m); return; }
    const ev = J.EX.evenementOdds(J.matchs[k], { dcChez: DC_CHEZ });
    assert.ok(COTE.poserCoteAnj(m, null, COTE.booksDepuisEvenement(ev), J.ko("08:10")), `cote ANJ pour ${m.home.n}`);
  });
  // Pipeline, apres le gel : la chance du pari est posee UNE fois.
  site.forEach((m) => CHANCE.poserChance(m));
  const chances = JSON.parse(JSON.stringify(b.chancesPourCanal(site)));
  // Depot de la sortie pour le Canal Pro, puis le menu et les messages du Canal Pro.
  const depot = J.DEP.reduire(J.sortie, chances);
  const { debut, fin } = J.C.fenetreProgramme(JOUR);
  const menu = J.M.construireMenu({ jour: JOUR, matchsJour: J.M.matchsMenu(depot, debut, fin), cotesParMatch: J.cotesDe(depot.matchs) });
  const prog = J.C.preparerProgramme(menu.candidats, { jour: JOUR, maintenant: J.ko("08:15") });
  const canal = J.C.messagesCanal(JOUR, prog.paris);
  return { J, b, site, chances, depot, menu, prog, canal };
}

test("1. la chance du pari retenu est calculee UNE fois : le plus bas entre le modele et la cote sans marge, en % entier", async () => {
  const { site } = await toutGenerer();
  for (const m of site) {
    const fair = CHANCE.sansMargeDuPari(m);
    assert.ok(fair !== null, "cote sans marge connue");
    assert.equal(m.chance_iashark, Math.round(Math.min(m.model_probability, fair)), `${m.home.n} : min(${m.model_probability}, ${fair})`);
    assert.ok(Number.isInteger(m.chance_iashark));
  }
  // Les deux cas se presentent : cote sans marge plus basse ET plus haute que le modele.
  assert.ok(site.some((m) => CHANCE.sansMargeDuPari(m) < m.model_probability) && site.some((m) => CHANCE.sansMargeDuPari(m) > m.model_probability));
  // Sans cote sans marge : le modele (arrondi a l'entier), et la probabilite du moteur n'est jamais touchee.
  assert.deepEqual(CHANCE.chanceIashark(61.5, null), { chance: 62, modele: 61.5, sans_marge: null, source: CHANCE.SOURCE_MODELE });
  const m0 = site[0], avant = m0.model_probability;
  CHANCE.poserChance(m0);
  assert.equal(m0.model_probability, avant, "aucune probabilite du moteur modifiee");
  // Champ premium : jamais dans le fichier public d'un match non offert.
  assert.ok(PREMIUM.PREMIUM_FIELDS.includes("chance_iashark") && PREMIUM.PREMIUM_FIELDS.includes("v3_buteurs"));
  assert.equal(PREMIUM.stripPremium(m0).chance_iashark, undefined);
});

test("2. page match, espace Pro, Canal Pro, canal gratuit et image : la meme chance et la meme cote pour le meme pari", async () => {
  const { J, site, depot, prog, canal } = await toutGenerer();
  const MP = pageMatch();
  const simples = prog.paris.filter((p) => p.famille === "simple");
  assert.ok(simples.length >= 2, "au moins deux simples du Canal Pro rejoues");
  let communs = 0;
  for (const m of site) {
    const chance = m.chance_iashark;
    const vm = MP.viewModel(JSON.parse(JSON.stringify(m)));
    // --- Page match : l'avis (« Notre estimation »), le tableau « Probabilites et cotes » (ligne du pari), la FAQ.
    assert.equal(vm.model.recommendation.probability, chance, "vue de la page");
    const avis = texte(MP.signalCard(vm));
    assert.match(avis, new RegExp(`Notre estimation ${chance} %`), `avis : ${avis.slice(0, 400)}`);
    assert.match(avis, new RegExp(`Cote utilisée ${coteFr(m.cote_rec)} ${m.cote_source === "anj" ? `chez ${m.cote_bookmaker}` : "cote indicative"}`));
    const ligne = vm.model.marketTable.find((r) => r.recommended);
    assert.equal(ligne.model, chance, "tableau : ligne du pari retenu");
    const tableau = texte(MP.marketsCard(vm));
    assert.match(tableau, new RegExp(`Pari conseillé cote ${coteFr(m.cote_rec)} Notre estimation ${chance} %`), tableau.slice(0, 300));
    const faq = texte(MP.faqCard(vm));
    assert.match(faq, new RegExp(`cote ${coteFr(m.cote_rec)}, probabilité estimée ${chance} %`), "FAQ");
    // Aucun autre pourcentage de ce pari : la probabilite brute du modele n'apparait jamais dans l'avis.
    if (Math.round(m.model_probability) !== chance) assert.doesNotMatch(avis, new RegExp(`Notre estimation ${Math.round(m.model_probability)} %`));
    // --- Espace Pro : « Mon combiné » et le detecteur d'ecarts.
    const sel = D.comboSelections([m]).find((s) => s.marketId === m.market_id);
    assert.equal(sel.probability, chance, "combine : meme chance");
    assert.equal(sel.odds, Number(m.cote_rec), "combine : meme cote");
    assert.equal(vm.model.recommendedOdds, Number(m.cote_rec), "page : la cote du pari est cote_rec, rien d'autre");
    const scan = D.scanValue([m], { minEdge: -100 }).find((r) => r.chanceIashark);
    assert.equal(scan.modelProbability, chance, "detecteur : ligne du pari retenu");
    // --- Accueil Pro : note sur 10 = chance / 10.
    const st = HL.analysisFor(m, { isPro: true, hasAccount: true, freeMatchId: null }, { hasReliableModelOutput: () => true, translateMarket: (x) => x, marketIdLabel: () => null });
    assert.equal(st.state, "open");
    assert.equal(st.probNum, chance / 10, "accueil Pro : note sur 10 = chance / 10");
    // --- Canal Pro : un simple sur ce match et ce marche -> meme chance.
    const p = simples.find((x) => x.fixture_id === m.id);
    if (p) {
      communs++;
      assert.equal(V3.cleVersSite(depot.matchs.find((x) => Number(x.ids_api_football.fixture) === m.id).marches.find((x) => ({ "1": "1N2:1", N: "1N2:N", "2": "1N2:2", "1X": "DC:1N", X2: "DC:N2", "12": "DC:12" })[p.marche] === x.cle).cle).id, m.market_id, "meme pari");
      assert.equal(Math.round(p.proba * 100), chance, "Canal Pro : proba archivee = chance du site");
      const msg = texte((canal.paris.find((x) => x.html.includes(`${p.dom} – ${p.ext}`)) || {}).html || "");
      assert.match(msg, new RegExp(`${p.dom} – ${p.ext}[^]*Chance calculée par IASHARK : ${chance} %`), "message du Canal Pro");
      // UNE SEULE COTE : meme releve ANJ -> meme cote et meme bookmaker que le site et Telegram.
      assert.equal(m.cote_source, "anj", "pari commun : cote ANJ");
      assert.equal(p.meilleure_cote, Number(m.cote_rec), `Canal Pro : meme cote que le site (${m.home.n})`);
      assert.equal(J.C.nomBookmaker(p.meilleur_bookmaker), m.cote_bookmaker, "Canal Pro : meme bookmaker");
      assert.match(msg, new RegExp(`Cote : ${coteFr(m.cote_rec)} chez ${m.cote_bookmaker}`), "message du Canal Pro : cote et bookmaker");
    }
  }
  assert.ok(communs >= 2, "au moins deux paris communs au site et au Canal Pro");
  // --- Canal gratuit + image : le match offert du jour.
  const offert = site.find((m) => m.id === simples[0].fixture_id);
  const home = { matchs: site.map((m) => Object.assign({}, m, { is_free: m === offert })) };
  const post = P.matchGratuit(home, home, `${JOUR} 08:00`);
  assert.equal(post.type, "photo", "le match offert part avec sa chance");
  assert.equal(offert.cote_source, "anj");
  assert.match(texte(post.html), new RegExp(`Chance calculée par IASHARK : ${offert.chance_iashark} % Cote chez ${offert.cote_bookmaker} : ${coteFr(offert.cote_rec)}`));
  assert.equal(post.carte.coteTxt, coteFr(offert.cote_rec), "image : meme cote");
  assert.equal(post.carte.estimation, offert.chance_iashark);
  // Le pari, ecrit pareil sur la page et dans le canal gratuit.
  const echap = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const libellePage = (texte(MP.signalCard(MP.viewModel(JSON.parse(JSON.stringify(offert))))).match(new RegExp(`Pari recommandé (.+) ${echap(MVM.nomCourt(offert.home.n))} – ${echap(MVM.nomCourt(offert.away.n))}`)) || [])[1];
  assert.ok(libellePage, "libelle du pari sur la page");
  assert.equal(post.carte.pari, libellePage);
  assert.match(texte(post.html), new RegExp(`Sélection : ${echap(libellePage)} Chance`));
  const tpl = fs.readFileSync(path.join(root, "scripts/telegram/card.tpl"), "utf8").replaceAll("{{ESTIMATION}}", String(post.carte.estimation)).replace("{{COTE}}", post.carte.coteTxt).replace("{{COTE_LIBELLE}}", post.carte.coteLibelle);
  assert.match(texte(tpl), new RegExp(`Cote chez ${offert.cote_bookmaker} ${coteFr(offert.cote_rec)}`), "image : cote et bookmaker");
  assert.match(texte(tpl), new RegExp(`Chance calculée par IASHARK ${offert.chance_iashark} %`), "image du canal gratuit");
  assert.ok(tpl.includes(coteFr(offert.cote_rec)));
  // Le meme match sur la page (avis) : meme chance, meme cote.
  const avisOffert = texte(MP.signalCard(MP.viewModel(JSON.parse(JSON.stringify(offert)))));
  assert.match(avisOffert, new RegExp(`Notre estimation ${offert.chance_iashark} %[^]*`));
});

test("3. combine du jour et tickets du Canal Pro : produit des chances IASHARK de leurs selections, comme « Mon combiné »", async () => {
  const { depot, prog } = await toutGenerer();
  const combo = prog.paris.find((p) => p.famille === "combine");
  assert.ok(combo, "un combine du jour");
  const chanceDe = (j) => { const m = depot.matchs.find((x) => x.match_id === j.match_id); const cle = { "1": "1N2:1", N: "1N2:N", "2": "1N2:2", "1X": "DC:1N", X2: "DC:N2", "12": "DC:12" }[j.marche]; return m.marches.find((x) => x.cle === cle).chance_iashark; };
  const attendu = combo.selections.reduce((a, j) => a * chanceDe(j) / 100, 1);
  assert.ok(Math.abs(combo.proba - Math.round(attendu * 10000) / 10000) < 1e-9, `${combo.proba} contre ${attendu}`);
  // « Mon combiné » de l'espace Pro, avec les memes chances : meme produit.
  const r = D.combo(combo.selections.map((j) => ({ probability: chanceDe(j), odds: 1.3 })));
  assert.equal(r.probability, Number((attendu * 100).toFixed(2)));
});

test("4. buteurs : un seul calcul (moteur v3), vers le bas a 5 points, 45 % au plus, rien sous 10 %, partout", async () => {
  const { J, site, depot } = await toutGenerer();
  const MP = pageMatch();
  const bayern = site.find((m) => m.home.n === "Bayern Munich");
  // Pipeline : v3_buteurs = titulaires probables, chance du moteur arrondie une fois.
  assert.deepEqual(bayern.v3_buteurs.map((x) => [x.joueur, x.chance]), [["Avant-centre A", 45], ["Ailier B", 35], ["Attaquant C", 20]], "0,53 -> 45 (plafond) ; 0,377 -> 35 ; 0,211 -> 20 ; le remplacant n'y est pas");
  const lens = site.find((m) => m.home.n === "Lens");
  assert.deepEqual(lens.v3_buteurs.map((x) => [x.joueur, x.chance]), [["Buteur E", 30], ["Buteur F", 10]], "0,349 -> 30 ; 0,12 -> 10 (plancher de 10 % atteint)");
  // La meme regle que le Canal Pro (canal-pro-menu.mjs#chanceButeurAffichee).
  for (const p of [0.53, 0.377, 0.211, 0.12, 0.099, 0.45, 0.4499]) assert.equal(CHANCE.chanceButeur(p) === null ? null : CHANCE.chanceButeur(p) / 100, J.M.chanceButeurAffichee(p));
  // Page match (Pro) : « Le match en 30 secondes », « Les 2 buteurs », « Marchés joueurs ».
  const vm = MP.viewModel(JSON.parse(JSON.stringify(bayern)));
  assert.deepEqual(vm.plus.buteurs.map((x) => [x.name, x.chance]), [["Avant-centre A", 45], ["Ailier B", 35]]);
  assert.match(texte(MP.resumeCard(vm)), /Avant-centre A Bayern Munich 45 %[^]*Ailier B Bayern Munich 35 %/);
  assert.match(texte(MP.buteursCard(vm)), /Avant-centre A[^]*45 %[^]*Ailier B[^]*35 %/);
  assert.match(texte(MP.threatsCard(vm)), /Avant-centre A[^]*45 %/);
  // Accueil Pro (buteurs du jour) : meme joueur, meme chance.
  const r = BDJ.resolvePick(bayern, 0);
  assert.equal(r.name, "Avant-centre A");
  assert.equal(r.displayProbability, 45);
  // Canal Pro : le deposé garde les buteurs du moteur (p_marque), lus avec la meme fonction.
  const dep = depot.matchs.find((x) => x.domicile === "Bayern Munich");
  assert.equal(CHANCE.chanceButeur(dep.buteurs.find((x) => x.joueur === "Avant-centre A").p_marque), 45);
  // Sans v3_buteurs : aucune chance de marquer affichee (plus de calcul buteur du site).
  const sans = Object.assign(JSON.parse(JSON.stringify(bayern)), { v3_buteurs: undefined });
  assert.equal(MP.viewModel(sans).plus.buteurs, null);
  assert.equal(BDJ.resolvePick(sans, 0), null);
});

test("5. buts attendus : la meme donnee et le meme arrondi dans « L'histoire du match », « Ce que dit le modèle » et l'image a partager", async () => {
  const MP = pageMatch();
  for (const [lh, la] of [[1.45, 0.85], [2.049999, 0.95], [1.25, 1.35], [0.65, 2.15]]) {
    const raw = { id: 1, home: { n: "Equipe A", id: 1 }, away: { n: "Equipe B", id: 2 }, league: "Ligue 1", date: `${JOUR} 21:00`, model_output_available: true, data_quality_score: 80, lambda_h: lh, lambda_a: la };
    const vm = MP.viewModel(raw);
    const a = CHANCE.arrondi1(lh), b = CHANCE.arrondi1(la);
    assert.deepEqual([vm.model.expectedGoals.home, vm.model.expectedGoals.away], [a, b]);
    assert.equal(MVM.arrondi1(lh), a, "meme arrondi que lib/chance-iashark.js");
    const fr = (x) => x.toFixed(1).replace(".", ",");
    const histoire = vm.plus.histoire.replace(/\u00a0/g, " ");
    assert.ok(histoire.includes(fr(Math.max(a, b))) && histoire.includes(fr(Math.min(a, b))), histoire);
    assert.ok(histoire.includes(`${fr(CHANCE.arrondi1(a + b))} buts attendus au total`), histoire);
    assert.equal(vm.plus.partage.histoire, vm.plus.histoire, "image a partager : la meme phrase");
    const bloc = texte(MP.outputsCard(vm));
    assert.match(bloc, new RegExp(`${fr(a)}[^]*${fr(b)}`), bloc);
  }
  // Moitie vers le haut sur l'ecriture decimale (1,45 -> 1,5), jamais 1,4 d'un cote et 1,5 de l'autre.
  assert.equal(CHANCE.arrondi1(1.45), 1.5);
  assert.equal(CHANCE.arrondi1(2.05), 2.1);
});

test("6. scores probables : lus tels quels dans la sortie du moteur (pourcentage entier), un seul arrondi", async () => {
  const { site } = await toutGenerer();
  const MP = pageMatch();
  for (const m of site) {
    const vm = MP.viewModel(JSON.parse(JSON.stringify(m)));
    assert.deepEqual(vm.model.scores.map((s) => s.probability), (m.mc_scores || []).slice(0, 3).map((s) => s.pct));
    for (const s of vm.model.scores) assert.ok(Number.isInteger(s.probability));
  }
});
