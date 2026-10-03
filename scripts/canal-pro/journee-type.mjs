#!/usr/bin/env node
// JOURNEE TYPE des messages Pro (03/10/2026), SANS RIEN ENVOYER.
// Le VRAI robot (taches.mjs#tourner, toutes les 15 min), les VRAIES sources (lib/sources.mjs), les VRAIS
// textes (canal-pro.mjs, canal-pro-langues.mjs) tournent sur une base en memoire, un faux Telegram (qui note
// chaque message au lieu de l'envoyer) et un faux Internet (The Odds API, API-Football, meteo). Donnees
// FICTIVES mais realistes (samedi 3 octobre 2026 : Premier League, Liga, Ligue 1, Championship ; lundi 5 :
// bilan). Envois Pro OUVERTS ; Clement valide le programme a 8 h 45 et clique « Envoyer aux abonnes Pro »
// sur les debriefs et le bilan (comme l'Edge Function telegram-bot : l'envoi part tout de suite).
// 3 abonnes relies :
//   Lucas (fr, France, Premier League seulement, Winamax + Betclic, alertes oui, heure par defaut) ;
//   Pablo (es, Espagne, toutes competitions, alertes oui, heure 12 h) ;
//   Marie (fr, France, Ligue 1 + Liga, alertes non).
// DECISION DE CLEMENT (03/10/2026) : les MEMES paris pour tous ; seules changent la langue, l'heure, les
// cotes de SES bookmakers, ses alertes oui/non et l'info « Aujourd'hui / Hier dans tes competitions ».
//   node scripts/canal-pro/journee-type.mjs <sortie.json>
// Aucune cle, aucun reseau : globalThis.fetch est remplace pendant toute la journee.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as C from "../../supabase/functions/_shared/canal-pro.mjs";
import * as M from "../../supabase/functions/_shared/canal-pro-menu.mjs";
import { BaseMemoire } from "./lib/base.mjs";
import { creerSources } from "./lib/sources.mjs";
import { matchV3, sortieV3, cotesAvecMarge } from "./lib/exemple-v3.mjs";
import { reduire } from "./deposer-sortie-v3.mjs";
import * as T from "./taches.mjs";
import { chargerRobot } from "../../tests/helpers/faux-robot-telegram.mjs";

const ADMIN = 42;
const ABONNES = { lucas: { chat: 1001, user: "u-lucas", prenom: "Lucas" }, pablo: { chat: 1002, user: "u-pablo", prenom: "Pablo" }, marie: { chat: 1003, user: "u-marie", prenom: "Marie" } };
const t = (jour, hm) => C.parisVersDate(jour, hm).toISOString();
const SAM = "2026-10-03", DIM = "2026-10-04", LUN = "2026-10-05";

// ------------------------------------------------------------------ calendrier FICTIF (exemple realiste)
// [jour, heure (Paris), competition, domicile, exterieur, buts attendus dom, ext, score final, buteurs (n° des joueurs dom qui marquent)]
// competition : code du moteur v3 (SP1, F1) ou identifiant API-Football (39 Premier League, 40 Championship, 135 Serie A, 5 Ligue des nations).
const CAL = [
  [SAM, "13:30", 39, "Arsenal", "Chelsea", 1.55, 1.1, [2, 1]],
  [SAM, "13:30", 40, "Leeds", "Hull City", 1.7, 0.85, [1, 0]],
  [SAM, "14:00", "SP1", "Real Madrid", "Getafe", 2.3, 0.65, [3, 0], [9]],
  [SAM, "15:00", 135, "Inter", "Lecce", 2.1, 0.7, [2, 0]],
  [SAM, "16:00", 39, "Liverpool", "Everton", 2.05, 0.75, [2, 0]],
  [SAM, "16:00", 39, "Manchester City", "Brighton", 2.15, 0.85, [1, 1]],
  [SAM, "16:00", 40, "Norwich", "Middlesbrough", 1.35, 1.25, [0, 2]],
  [SAM, "16:15", "SP1", "Sevilla", "Valencia", 1.4, 1.1, [1, 0]],
  [SAM, "17:00", "F1", "Marseille", "Angers", 2.0, 0.8, [2, 0]],
  [SAM, "18:30", 39, "Newcastle", "Aston Villa", 1.5, 1.2, [1, 2]],
  [SAM, "19:00", "F1", "Lens", "Nantes", 1.6, 0.9, [1, 1]],
  [SAM, "21:00", "SP1", "Barcelona", "Alaves", 2.4, 0.7, [3, 1], [9]],
  [SAM, "21:05", "F1", "Paris SG", "Toulouse", 2.4, 0.7, [2, 0]],
  [LUN, "20:45", 5, "Spain", "Georgia", 1.95, 0.7, [2, 0]], // Ligue des nations (voie « cotes du marche », VERIF-SELECTIONS.md du 02/10)
  [LUN, "21:00", 39, "Fulham", "Wolverhampton", 1.5, 1.05, [2, 1]],
  [LUN, "21:00", "SP1", "Villarreal", "Mallorca", 1.7, 0.9, [1, 0]],
];
const BUTEURS = { "Real Madrid": [["K. Mbappé (exemple)", 0.44], ["Vinícius Jr (exemple)", 0.33]], Barcelona: [["R. Lewandowski (exemple)", 0.42], ["Raphinha (exemple)", 0.3]] };
const LIGUE_API = { SP1: 140, F1: 61 };
const SPORT_API = { 5: "soccer_uefa_nations_league", 39: "soccer_epl", 40: "soccer_efl_champ", 135: "soccer_italy_serie_a", 140: "soccer_spain_la_liga", 61: "soccer_france_ligue_one" };
const MATCHS = CAL.map(([jour, hm, comp, dom, ext, lh, la, score, marqueurs], i) => {
  const fixture = 5100 + i, idDom = fixture * 10 + 1, ko = t(jour, hm);
  const v3 = typeof comp === "string";
  const api = v3 ? LIGUE_API[comp] : comp;
  const b = (BUTEURS[dom] || []).map(([joueur, p], k) => ({ equipe: dom, joueur, joueur_id: idDom * 100 + [9, 7][k], p_marque: p }));
  const m = v3 ? matchV3({ id: `${comp}-${jour}-${dom}`, ligue_code: comp, dom, ext, ko, lh, la, fixture, buteurs: b })
    : { domicile: dom, exterieur: ext, buts_attendus: { domicile: lh, exterieur: la, rho: -0.08 } };
  return { v3, api, sport: SPORT_API[api], m, dom, ext, jour, hm, fixture, idDom, idExt: fixture * 10 + 2, score, marqueurs: (marqueurs || []).map((n) => idDom * 100 + n), ko };
});
// Mouvements de cotes (exemple) : la cote de Manchester City baisse des 11 h ; celle de Liverpool monte des 12 h.
const MOUVEMENTS = [{ dom: "Manchester City", des: t(SAM, "11:00"), decal: 0.12 }, { dom: "Liverpool", des: t(SAM, "12:00"), decal: -0.06 }];
// Un bookmaker un peu plus genereux sur un match (exemple) : Unibet et William Hill sur Liverpool, Betclic sur Norwich.
const BONUS = { Liverpool: { unibet_fr: 0.94, williamhill: 0.95 }, Norwich: { betclic_fr: 0.95 } };
// Compositions : Liverpool change 6 titulaires (« À SURVEILLER ») ; meteo : forte pluie a Manchester.
const ROTATION = new Set(["Liverpool"]);

// ------------------------------------------------------------------ faux Internet
let maintenant = t(SAM, "06:00");
const r2 = (x) => Math.round(x * 100) / 100;
const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { "x-requests-remaining": "19000" } });
// Bookmakers : Pinnacle (reference), les 5 agrees francais suivis, les 4 operateurs suivis en Espagne (flux « eu »).
const BOOKS = [["pinnacle", "Pinnacle", 1.025, 0], ["betclic_fr", "Betclic (FR)", 1.075, 1], ["winamax_fr", "Winamax (FR)", 1.062, -1], ["unibet_fr", "Unibet (FR)", 1.08, 0],
  ["pmu_fr", "PMU (FR)", 1.085, 1], ["netbet_fr", "NetBet (FR)", 1.08, -1], ["williamhill", "William Hill", 1.07, 0], ["sport888", "888sport", 1.075, 1],
  ["betsson", "Betsson", 1.058, -1], ["marathonbet", "Marathonbet", 1.052, 0]];
const DC_CHEZ = new Set(["pinnacle", "winamax_fr", "betclic_fr", "unibet_fr", "williamhill", "betsson"]);
function evenement(x, marches) {
  const g = M.grille(x.m.buts_attendus.domicile, x.m.buts_attendus.exterieur, x.m.buts_attendus.rho);
  const { p1, pn, p2 } = M.probas1n2(g);
  let o25 = 0; g.forEach((r, i) => r.forEach((p, j) => { if (i + j > 2.5) o25 += p; }));
  const decal = MOUVEMENTS.filter((mv) => mv.dom === x.dom && maintenant >= mv.des).reduce((a, mv) => a + mv.decal, 0);
  const bookmakers = BOOKS.map(([key, title, marge, k]) => {
    const s = (1 + k * 0.01 + decal) * (BONUS[x.dom]?.[key] ?? 1);
    const q = [p1 * s, pn, p2 / s]; const tot = q.reduce((a, v) => a + v, 0);
    const [o1, on, o2] = cotesAvecMarge(q.map((v) => v / tot), marge);
    const mk = [];
    if (marches.includes("h2h")) mk.push({ key: "h2h", outcomes: [{ name: x.dom, price: o1 }, { name: "Draw", price: on }, { name: x.ext, price: o2 }] });
    if (marches.includes("totals")) { const [ov, un] = cotesAvecMarge([o25, 1 - o25], marge); mk.push({ key: "totals", outcomes: [{ name: "Over", point: 2.5, price: ov }, { name: "Under", point: 2.5, price: un }] }); }
    if (marches.includes("double_chance") && DC_CHEZ.has(key)) {
      const dc = (a, b) => r2(1 / (1 / a + 1 / b) * 0.985);
      mk.push({ key: "double_chance", outcomes: [{ name: `${x.dom}/Draw`, price: dc(o1, on) }, { name: `${x.dom}/${x.ext}`, price: dc(o1, o2) }, { name: `Draw/${x.ext}`, price: dc(on, o2) }] });
    }
    return { key, title, markets: mk };
  });
  return { id: `ev-${x.fixture}`, sport_key: x.sport, commence_time: x.ko.replace(".000Z", "Z"), home_team: x.dom, away_team: x.ext, bookmakers };
}
const statut = (x) => (Date.parse(maintenant) < Date.parse(x.ko) ? "NS" : Date.parse(maintenant) < Date.parse(x.ko) + 110 * 60000 ? "2H" : "FT");
const onze = (id) => Array.from({ length: 11 }, (_, k) => id * 100 + k + 1);
async function fauxFetch(u) {
  const url = new URL(String(u));
  const q = Object.fromEntries(url.searchParams);
  if (url.hostname === "api.the-odds-api.com") {
    const parts = url.pathname.split("/");
    const sport = parts[3];
    // /v4/sports/{sport}/events (liste, GRATUITE, mode economie) : meme liste que les cotes, sans credit.
    if (parts[4] === "events" && parts[5]) { const x = MATCHS.find((y) => `ev-${y.fixture}` === parts[5]); return x ? json(evenement(x, ["double_chance"])) : json({ message: "event not found" }, 404); }
    let liste = MATCHS.filter((x) => x.sport === sport && Date.parse(x.ko) > Date.parse(maintenant));
    if (q.eventIds) liste = liste.filter((x) => q.eventIds.split(",").includes(`ev-${x.fixture}`));
    if (q.commenceTimeFrom) liste = liste.filter((x) => x.ko >= q.commenceTimeFrom.replace("Z", ".000Z") && x.ko <= q.commenceTimeTo.replace("Z", ".000Z"));
    return json(liste.map((x) => evenement(x, String(q.markets || "h2h").split(","))));
  }
  if (url.hostname === "v3.football.api-sports.io") {
    const ch = url.pathname.slice(1);
    if (ch === "fixtures" && q.team) return json({ errors: [], response: [{ fixture: { id: Number(String(q.team).slice(0, 4)) + 900 } }] });
    const x = MATCHS.find((y) => String(y.fixture) === String(q.id || q.fixture)) || MATCHS.find((y) => String(y.fixture + 900) === String(q.fixture));
    if (!x) return json({ errors: [], response: [] });
    if (ch === "fixtures") {
      const s = statut(x), fini = s === "FT";
      return json({ errors: [], response: [{ fixture: { id: x.fixture, status: { short: s }, venue: { city: { "Manchester City": "Manchester", Liverpool: "Liverpool", Norwich: "Norwich" }[x.dom] || x.dom } },
        teams: { home: { id: x.idDom, name: x.dom }, away: { id: x.idExt, name: x.ext } }, score: { fulltime: { home: fini ? x.score[0] : null, away: fini ? x.score[1] : null } } }] });
    }
    if (ch === "fixtures/lineups") {
      const precedent = String(q.fixture) === String(x.fixture + 900);
      if (!precedent && Date.parse(maintenant) < Date.parse(x.ko) - 65 * 60000) return json({ errors: [], response: [] });
      const equipes = [[x.idDom, x.dom], [x.idExt, x.ext]].filter(([id]) => !q.team || String(q.team) === String(id));
      return json({ errors: [], response: equipes.map(([id, nom]) => {
        const xi = !precedent && ROTATION.has(nom) ? onze(id).map((p, k) => (k < 6 ? p + 50 : p)) : onze(id);
        return { team: { id, name: nom }, formation: "4-3-3", startXI: xi.map((p) => ({ player: { id: p } })), substitutes: [{ player: { id: id * 100 + 30 } }] };
      }) });
    }
    // Statistiques (exemple) coherentes avec le score : buts attendus et tirs selon les buts marques.
    if (ch === "fixtures/statistics") return json({ errors: [], response: [[x.idDom, r2(0.6 + 0.5 * x.score[0]), 7 + 3 * x.score[0], 1 + x.score[1]], [x.idExt, r2(0.5 + 0.5 * x.score[1]), 5 + 3 * x.score[1], 2 + x.score[0]]].map(([id, xg, tirs, arrets]) => ({ team: { id }, statistics: [{ type: "expected_goals", value: String(xg) }, { type: "Total Shots", value: tirs }, { type: "Goalkeeper Saves", value: arrets }] })) });
    if (ch === "fixtures/players") return json({ errors: [], response: [x.idDom, x.idExt].map((id) => ({ team: { id }, players: onze(id).map((p) => ({ player: { id: p }, statistics: [{ games: { minutes: 90 }, goals: { total: x.marqueurs.includes(p) ? 1 : 0 } }] })) })) });
    return json({ errors: [], response: [] });
  }
  if (url.hostname === "api.openweathermap.org") {
    if (url.pathname.includes("/geo/")) return json([{ lat: /Manchester/.test(q.q) ? 53.48 : 45.0, lon: -2.24 }]);
    const x = MATCHS.filter((y) => Date.parse(y.ko) > Date.parse(maintenant)).sort((a, b) => Math.abs(Date.parse(a.ko) - Date.parse(maintenant) - 3 * 3600e3) - Math.abs(Date.parse(b.ko) - Date.parse(maintenant) - 3 * 3600e3))[0] || MATCHS[0];
    return json({ list: [{ dt: Date.parse(x.ko) / 1000, rain: { "3h": q.lat === "53.48" ? 9.5 : 0 }, wind: { speed: q.lat === "53.48" ? 12 : 4 }, main: { temp: 13 } }] });
  }
  throw new Error(`journee type : appel reseau inattendu ${url.hostname}`);
}

// ------------------------------------------------------------------ fichiers du pipeline (fictifs) : data.json, data-home.json, registre des pages
let TMP = null, DATA_JSON = null, DATA_HOME = null, REGISTRE = null;
const ligneSite = (x) => ({ id: x.fixture, league_id: x.api, status: statut(x), home: { n: x.dom }, away: { n: x.ext }, date: `${x.jour} ${x.hm}` });
function ecrirePipeline() {
  fs.writeFileSync(DATA_JSON, JSON.stringify({ matchs: MATCHS.filter((x) => statut(x) === "NS").map(ligneSite) }));
  // Pages d'analyse publiees (page_dirs) : en francais, espagnol et anglais.
  fs.writeFileSync(DATA_HOME, JSON.stringify({ matchs: MATCHS.filter((x) => statut(x) === "NS").map((x) => ({ ...ligneSite(x), page_dirs: ["fr", "es", "en"] })) }));
  const cle = { 5: "nations_league", 39: "premier", 40: "championship", 135: "seriea", 140: "laliga", 61: "ligue1" };
  fs.writeFileSync(REGISTRE, JSON.stringify({ version: 1, matches: Object.fromEntries(MATCHS.filter((x) => statut(x) === "FT").map((x) => [String(x.fixture),
    { id: String(x.fixture), kickoff: x.ko.replace(".000Z", "Z"), league_key: cle[x.api], snapshot: { home: { n: x.dom }, away: { n: x.ext } }, final_score: { home: x.score[0], away: x.score[1], source: "historique" } }])) }));
}

// ------------------------------------------------------------------ fausse base, faux Telegram, journal
const db = new BaseMemoire({
  telegram_settings: [{ key: "canal_pro_mode", value: "ouvert" }],
  users: Object.values(ABONNES).map((a) => ({ id: a.user, plan: "pro", role: "customer" })),
  telegram_abonnes: Object.values(ABONNES).map((a) => ({ user_id: a.user, chat_id: a.chat, prenom: a.prenom, reglages: {}, bloque: false })),
  user_preferences: [{ user_id: "u-lucas", language: "fr" }, { user_id: "u-pablo", language: "es" }, { user_id: "u-marie", language: "fr" }],
  pro_preferences: [
    { user_id: "u-lucas", pays: "fr", bookmakers: ["winamax", "betclic"], limite_paris_jour: 5, alertes: ["seuil", "hausse", "compositions", "meteo"], competitions: ["premier"], heure_envoi: null },
    { user_id: "u-pablo", pays: "es", bookmakers: [], limite_paris_jour: 5, alertes: ["seuil", "hausse", "compositions", "meteo"], competitions: [], heure_envoi: 12 },
    { user_id: "u-marie", pays: "fr", bookmakers: [], limite_paris_jour: 5, alertes: [], competitions: ["ligue1", "laliga"], heure_envoi: null },
  ],
});
db.horloge = () => new Date(maintenant);
const journal = [];
const qui = (chat) => (String(chat) === String(ADMIN) ? "clement" : Object.keys(ABONNES).find((k) => String(ABONNES[k].chat) === String(chat)) || String(chat));
let nId = 1000;
async function tg(methode, corps) {
  if (methode === "sendMessage") {
    const boutons = (corps.reply_markup?.inline_keyboard || []).map((r) => r.map((b) => ({ text: b.text, data: b.callback_data || null, url: b.url || null })));
    const id = ++nId;
    journal.push({ id, t: maintenant, ou: qui(corps.chat_id), de: "robot", html: corps.text, boutons, silencieux: !!corps.disable_notification });
    return { message_id: id };
  }
  if (methode === "editMessageReplyMarkup") { const m = journal.find((x) => x.id === corps.message_id); if (m) m.bouton_final = (corps.reply_markup?.inline_keyboard || []).flat().map((b) => b.text).join(" · "); return true; }
  return true;
}
const clic = (texte) => journal.push({ id: ++nId, t: maintenant, ou: "clement", de: "clic", html: texte });

// ------------------------------------------------------------------ les premiers messages (vendredi soir)
/**
 * Lucas relie son compte le vendredi 2 octobre au soir (clic « Ouvrir mon robot sur Telegram », reglages deja
 * remplis sur le site) : la VRAIE Edge Function telegram-bot (chargee avec une fausse base, comme les tests)
 * lui envoie la bienvenue puis le recapitulatif de ses reglages. Ses messages sont notes dans le journal.
 */
async function premiersMessages() {
  const avant = globalThis.fetch;
  try {
    const r = await chargerRobot({
      telegram_abonnes: [{ user_id: "u-lucas", code_liaison: "codeLucas0123456789", code_cree_at: new Date().toISOString(), chat_id: null, bloque: false }],
      users: [{ id: "u-lucas", plan: "pro", role: "customer" }], user_preferences: [{ user_id: "u-lucas", language: "fr" }],
      pro_preferences: [(await db.select("pro_preferences", { user_id: "u-lucas" }))[0]], telegram_settings: [{ key: "canal_pro_mode", value: "ouvert" }],
      pro_envois: [], pro_tickets: [], pro_paris: [],
    });
    await r.maj({ message: { message_id: 1, chat: { id: ABONNES.lucas.chat, type: "private" }, from: { id: ABONNES.lucas.chat, first_name: "Lucas", language_code: "fr" }, text: "/start codeLucas0123456789" } });
    const quand = t("2026-10-02", "20:12");
    for (const e of r.envoyes.filter((x) => x.methode === "sendMessage" && String(x.corps.chat_id) === String(ABONNES.lucas.chat))) {
      journal.push({ id: ++nId, t: quand, ou: "lucas", de: "robot", html: e.corps.text, premier: true,
        boutons: (e.corps.reply_markup?.inline_keyboard || []).map((rg) => rg.map((b) => ({ text: b.text, data: b.callback_data || null, url: b.url || null }))) });
    }
  } finally { globalThis.fetch = avant; }
}

// ------------------------------------------------------------------ la journee
async function principal() {
  await premiersMessages();
  const vrai = globalThis.fetch;
  globalThis.fetch = fauxFetch;
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-journee-"));
  [DATA_JSON, DATA_HOME, REGISTRE] = ["data.json", "data-home.json", "match-pages-registry.json"].map((f) => path.join(TMP, f));
  try {
    ecrirePipeline();
    const src = creerSources({ ODDS_API_KEY: "journee-sans-cle", APISPORTS_KEY: "journee-sans-cle", OPENWEATHER_KEY: "journee-sans-cle", DATA_JSON, DATA_HOME_JSON: DATA_HOME, REGISTRE_PAGES: REGISTRE }, { db, log: () => {} });
    src.matchDuel = async () => null; // le duel du canal gratuit n'est pas dans cette journee
    const deps = { db, tg, src, maintenant: () => new Date(maintenant), env: { ADMIN, CANAL_GRATUIT: "@iasharkdata", ANCRE_FICHIER: null }, log: () => {}, pauseEnvoi: 0 };
    const ctx = T.creerContexte(deps);
    const deposer = async (jour) => {
      const genere = t(jour, "06:40");
      const ms = MATCHS.filter((x) => x.v3 && x.ko > genere && Date.parse(x.ko) < Date.parse(genere) + 4 * 86400e3).map((x) => x.m);
      const s = reduire(sortieV3(ms, genere));
      await db.insert("moteur_v3_sorties", [{ genere_le: genere, moteur_version: s.moteur_version, contrat_version: s.contrat_version, sortie: s }], { conflit: "fusionner" });
    };
    const cliques = new Set();
    /** Clement : « Valider » des que le programme lui est demande (8 h 45) ; « Envoyer aux abonnés Pro » 10 min apres une proposition. */
    const clement = async () => {
      const { date: jour, hm } = C.paris(maintenant);
      const [prog] = await db.select("pro_programmes", { jour });
      if (prog?.statut === "attente" && !cliques.has(`v-${jour}`)) {
        cliques.add(`v-${jour}`);
        await db.update("pro_programmes", { jour }, { statut: "valide", valide_at: maintenant });
        const m = journal.find((x) => x.id === prog.validation_message_id);
        if (m) m.bouton_final = `Validé à ${C.heureTxt(maintenant)} · publication à 9 h 30`;
        clic("Clément clique « Valider »");
      }
      if (hm < "08:00") return;
      for (const m of journal.filter((x) => x.ou === "clement" && x.de === "robot" && !cliques.has(x.id) && Date.parse(maintenant) - Date.parse(x.t) >= 10 * 60000)) {
        const b = (m.boutons || []).flat().find((x) => /^pubpro::/.test(x.data || ""));
        if (!b) continue;
        cliques.add(m.id);
        const cle = b.data.split(":")[2];
        if ((await db.select("telegram_settings", { key: `publie:k:${cle}` })).length) continue;
        m.bouton_final = `Envoyé aux abonnés Pro à ${C.heureTxt(maintenant)}`;
        clic("Clément clique « Envoyer aux abonnés Pro »");
        // Comme l'Edge Function au clic : la diffusion part tout de suite (une seule fois par abonne).
        await ctx.lancerDiffusion(cle);
      }
    };
    const tour = async () => {
      const { date, hm } = C.paris(maintenant);
      if (hm === "06:45") await deposer(date);
      if (hm === "06:00") ecrirePipeline(); // mise a jour quotidienne du pipeline (data.json, registre)
      const rapport = await T.tourner(deps);
      const err = Object.entries(rapport).filter(([, v]) => String(v).startsWith("ERREUR"));
      if (err.length) journal.push({ id: ++nId, t: maintenant, ou: "coulisses", de: "rapport", html: err.map(([k, v]) => `${k} → ${v}`).join(" ; ") });
      await clement();
    };
    // Samedi 6 h -> dimanche 8 h 30 (resultats d'hier) ; lundi 6 h -> 13 h (bilan). Le reste du dimanche : pas simule.
    for (const [de, a] of [[t(SAM, "06:00"), t(DIM, "08:30")], [t(LUN, "06:00"), t(LUN, "13:00")]]) {
      for (let ms = Date.parse(de); ms <= Date.parse(a); ms += 15 * 60000) { maintenant = new Date(ms).toISOString(); await tour(); }
    }
  } finally { globalThis.fetch = vrai; fs.rmSync(TMP, { recursive: true, force: true }); }
  return { journal, paris: await db.select("pro_paris", {}), abonnes: ABONNES, prefs: await db.select("pro_preferences", {}) };
}

/** La journee (une seule fois par processus : etat en memoire). Utilisee aussi par tests/canal-pro-sur-mesure.test.mjs. */
export const journeeType = principal;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const r = await principal();
  const sortie = process.argv[2] || "journee-type.json";
  fs.writeFileSync(sortie, JSON.stringify(r, null, 1));
  const n = (k) => r.journal.filter((x) => x.ou === k && x.de === "robot").length;
  console.log(`journee type : Lucas ${n("lucas")}, Pablo ${n("pablo")}, Marie ${n("marie")}, Clement ${n("clement")} messages ; ${r.paris.length} paris -> ${sortie}`);
}
