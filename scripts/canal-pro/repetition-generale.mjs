#!/usr/bin/env node
// REPETITION GENERALE des messages Pro, SANS RIEN ENVOYER (30/09/2026 ; depuis le 02/10, plus de canal
// Pro : tout part en prive a chaque abonne, ici Karim).
// Tout est faux et local : base en memoire (lib/base.mjs#BaseMemoire), faux
// Telegram (il note chaque message au lieu de l'envoyer), faux Internet (The
// Odds API, API-Football, meteo), sortie du moteur v3 FICTIVE (lib/exemple-v3.mjs).
// Le vrai robot (taches.mjs#tourner), les vraies sources (lib/sources.mjs) et les
// vrais textes (canal-pro.mjs, telegram-posts.js) tournent toutes les 15 minutes,
// du vendredi 2 octobre 8 h au mardi 6 octobre minuit (heure de Paris). Les clics de
// Clement (Valider, Publier) et les messages d'un abonne (Karim) sont simules comme
// le ferait l'Edge Function telegram-bot.
//   node scripts/canal-pro/repetition-generale.mjs <sortie.json>
// Aucune cle, aucun reseau : globalThis.fetch est remplace pendant toute la repetition.
import fs from "node:fs";
import { createRequire } from "node:module";
import * as C from "../../supabase/functions/_shared/canal-pro.mjs";
import { BaseMemoire } from "./lib/base.mjs";
import { creerSources } from "./lib/sources.mjs";
import { matchV3, sortieV3, evenementOdds } from "./lib/exemple-v3.mjs";
import { reduire } from "./deposer-sortie-v3.mjs";
import * as T from "./taches.mjs";
const P = createRequire(import.meta.url)("../../lib/telegram-posts.js");

const ADMIN = 42, CANAL_GRATUIT = "@iasharkdata", KARIM = 555;
const t = (jour, hm) => C.parisVersDate(jour, hm).toISOString();

// ------------------------------------------------------------------ calendrier FICTIF (exemple)
// [jour, heure (Paris), code, domicile, exterieur, buts attendus dom, ext, score final, buteurs (joueurs n° qui marquent, equipe dom)]
const CAL = [
  ["2026-10-02", "20:30", "D1", "Leverkusen", "Augsburg", 1.9, 0.9, [2, 0]],
  ["2026-10-02", "20:45", "F1", "Lens", "Nantes", 1.6, 0.9, [1, 1]],
  ["2026-10-03", "14:00", "SP1", "Sevilla", "Valencia", 1.4, 1.1, [1, 0]],
  ["2026-10-03", "15:00", "I1", "Torino", "Udinese", 1.75, 0.95, [2, 1]],
  ["2026-10-03", "15:30", "D1", "Bayern Munich", "Mainz", 2.6, 0.8, [3, 0]],
  ["2026-10-03", "15:30", "D1", "Dortmund", "Freiburg", 1.95, 1.0, [2, 2]],
  ["2026-10-03", "17:00", "F1", "Marseille", "Angers", 2.0, 0.8, [2, 0]],
  ["2026-10-03", "18:00", "I1", "Inter", "Lecce", 2.1, 0.7, [1, 0]],
  ["2026-10-03", "18:45", "N1", "PSV Eindhoven", "Heracles", 2.4, 0.8, [4, 1]],
  ["2026-10-03", "20:30", "P1", "Benfica", "Arouca", 2.1, 0.8, [0, 1]],
  ["2026-10-03", "21:00", "SP1", "Real Madrid", "Getafe", 2.3, 0.7, [2, 0], [9]],
  ["2026-10-04", "14:00", "SP1", "Barcelona", "Alaves", 2.4, 0.7, [3, 1], [9]],
  ["2026-10-04", "15:00", "I1", "Napoli", "Cagliari", 1.9, 0.8, [1, 1]],
  ["2026-10-04", "15:30", "D1", "Leipzig", "Bochum", 2.2, 0.9, [2, 0]],
  ["2026-10-04", "17:00", "F1", "Monaco", "Le Havre", 2.0, 0.8, [2, 1]],
  ["2026-10-04", "17:30", "D1", "Stuttgart", "Heidenheim", 1.9, 0.9, [1, 2]],
  ["2026-10-04", "18:00", "P1", "Sporting CP", "Estoril", 2.3, 0.7, [3, 0]],
  ["2026-10-04", "20:45", "F1", "Paris SG", "Toulouse", 2.4, 0.7, [2, 0]],
  ["2026-10-04", "20:45", "N1", "Ajax", "Go Ahead Eagles", 2.0, 1.0, [2, 1]],
  ["2026-10-05", "21:00", "SP1", "Villarreal", "Mallorca", 1.7, 0.9, [1, 0]],
  ["2026-10-06", "21:15", "P1", "Braga", "Moreirense", 1.8, 0.9, [2, 1]],
];
const BUTEURS = { "Real Madrid": [["Joueur 9 (exemple)", 0.44], ["Joueur 7 (exemple)", 0.31]], Barcelona: [["Joueur 9 (exemple)", 0.43], ["Joueur 11 (exemple)", 0.3]],
  "Bayern Munich": [["Joueur 9 (exemple)", 0.47]], "Paris SG": [["Joueur 10 (exemple)", 0.36]] };
const MATCHS = CAL.map(([jour, hm, code, dom, ext, lh, la, score, marqueurs], i) => {
  const fixture = 5000 + i, idDom = fixture * 10 + 1;
  const b = (BUTEURS[dom] || []).map(([joueur, p], k) => ({ equipe: dom, joueur, joueur_id: idDom * 100 + [9, 7, 11, 10][k], p_marque: p }));
  const m = matchV3({ id: `${code}-${jour}-${dom}-${ext}`, ligue_code: code, dom, ext, ko: t(jour, hm), lh, la, fixture, buteurs: b });
  return { m, fixture, idDom, idExt: fixture * 10 + 2, score, marqueurs: (marqueurs || []).map((n) => idDom * 100 + n), ko: t(jour, hm) };
});
// Vraies cotes double chance (exemple) chez deux agrees, sur deux matchs seulement.
const DC_CHEZ = { Marseille: ["winamax_fr", "betclic_fr"], Monaco: ["winamax_fr", "betclic_fr"] };
// Mouvements de cotes (exemple) : decalage du marche sur un match a partir d'une heure donnee.
const MOUVEMENTS = [{ dom: "Marseille", des: t("2026-10-03", "11:00"), decal: 0.12 }, { dom: "Dortmund", des: t("2026-10-03", "12:00"), decal: -0.1 }];

// ------------------------------------------------------------------ faux Internet
let maintenant = t("2026-10-02", "08:00");
const etat = { panneCotes: false, credits: 0 };
const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { "x-requests-remaining": String(20000 - etat.credits) } });
function evenement(x, marches) {
  const d = MOUVEMENTS.filter((mv) => mv.dom === x.m.domicile && maintenant >= mv.des).reduce((a, mv) => a + mv.decal, 0);
  return evenementOdds(x.m, { dcChez: DC_CHEZ[x.m.domicile] || [], decal: d, marches });
}
const statut = (x) => (Date.parse(maintenant) < Date.parse(x.ko) ? "NS" : Date.parse(maintenant) < Date.parse(x.ko) + 110 * 60000 ? "2H" : "FT");
const onze = (id) => Array.from({ length: 11 }, (_, k) => id * 100 + k + 1);
async function fauxFetch(u) {
  const url = new URL(String(u));
  const q = Object.fromEntries(url.searchParams);
  if (url.hostname === "api.the-odds-api.com") {
    if (!(url.pathname.split("/")[4] === "events" && !url.pathname.split("/")[5])) etat.credits++; // /events : gratuit
    if (etat.panneCotes) return new Response("Service Unavailable (répétition : panne simulée)", { status: 503 });
    const parts = url.pathname.split("/"); // /v4/sports/{sport}/odds ou /v4/sports/{sport}/events/{id}/odds
    const sport = parts[3];
    // /v4/sports/{sport}/events (liste, GRATUITE, mode economie) : meme liste que les cotes, sans credit.
    if (parts[4] === "events" && parts[5]) { const x = MATCHS.find((y) => `ev-${y.m.match_id}` === parts[5]); return x ? json(evenement(x, ["double_chance"])) : json({ message: "event not found" }, 404); }
    let liste = MATCHS.filter((x) => evenementOdds(x.m).sport_key === sport && Date.parse(x.ko) > Date.parse(maintenant));
    if (q.eventIds) liste = liste.filter((x) => q.eventIds.split(",").includes(`ev-${x.m.match_id}`));
    if (q.commenceTimeFrom) liste = liste.filter((x) => x.ko >= q.commenceTimeFrom.replace("Z", ".000Z") && x.ko <= q.commenceTimeTo.replace("Z", ".000Z"));
    return json(liste.map((x) => evenement(x, ["h2h"])));
  }
  if (url.hostname === "v3.football.api-sports.io") {
    const ch = url.pathname.slice(1);
    const x = MATCHS.find((y) => String(y.fixture) === String(q.id || q.fixture)) || MATCHS.find((y) => String(y.fixture + 900) === String(q.fixture));
    if (ch === "fixtures" && q.team) return json({ errors: [], response: [{ fixture: { id: Number(String(q.team).slice(0, 4)) + 900 } }] });
    if (!x) return json({ errors: [], response: [] });
    if (ch === "fixtures") {
      const s = statut(x), fini = s === "FT";
      return json({ errors: [], response: [{ fixture: { id: x.fixture, status: { short: s }, venue: { city: `${x.m.domicile} (ville exemple)` } },
        teams: { home: { id: x.idDom, name: x.m.domicile }, away: { id: x.idExt, name: x.m.exterieur } }, score: { fulltime: { home: fini ? x.score[0] : null, away: fini ? x.score[1] : null } } }] });
    }
    if (ch === "fixtures/lineups") {
      const precedent = String(q.fixture) === String(x.fixture + 900);
      if (!precedent && Date.parse(maintenant) < Date.parse(x.ko) - 65 * 60000) return json({ errors: [], response: [] });
      const equipes = [[x.idDom, x.m.domicile], [x.idExt, x.m.exterieur]].filter(([id]) => !q.team || String(q.team) === String(id));
      return json({ errors: [], response: equipes.map(([id, nom]) => {
        // Dortmund change 6 titulaires (exemple) : voyant « À SURVEILLER ».
        const xi = !precedent && nom === "Dortmund" ? onze(id).map((p, k) => (k < 6 ? p + 50 : p)) : onze(id);
        return { team: { id, name: nom }, formation: "4-3-3", startXI: xi.map((p) => ({ player: { id: p } })), substitutes: [{ player: { id: id * 100 + 30 } }] };
      }) });
    }
    if (ch === "fixtures/statistics") return json({ errors: [], response: [[x.idDom, 1.6, 14, 2], [x.idExt, 1.1, 9, 5]].map(([id, xg, tirs, arrets]) => ({ team: { id }, statistics: [{ type: "expected_goals", value: String(xg) }, { type: "Total Shots", value: tirs }, { type: "Goalkeeper Saves", value: arrets }] })) });
    if (ch === "fixtures/players") return json({ errors: [], response: [x.idDom, x.idExt].map((id) => ({ team: { id }, players: onze(id).map((p) => ({ player: { id: p }, statistics: [{ games: { minutes: 90 }, goals: { total: x.marqueurs.includes(p) ? 1 : 0 } }] })) })) });
    return json({ errors: [], response: [] });
  }
  if (url.hostname === "api.openweathermap.org") {
    // Forte pluie (exemple) seulement a Dortmund ; ailleurs, rien a signaler.
    if (url.pathname.includes("/geo/")) return json([{ lat: /Dortmund/.test(q.q) ? 51.5 : 40.0, lon: 7.4 }]);
    const x = MATCHS.find((y) => Math.abs(Date.parse(y.ko) / 1000 - Date.parse(maintenant) / 1000 - 3 * 3600) < 2 * 3600) || MATCHS[0];
    return json({ list: [{ dt: Date.parse(x.ko) / 1000, rain: { "3h": q.lat === "51.5" ? 9 : 0 }, wind: { speed: 5 }, main: { temp: 14 } }] });
  }
  throw new Error(`répétition : appel réseau inattendu ${url.hostname}`);
}

// ------------------------------------------------------------------ fausse base, faux Telegram, journal des messages
const db = new BaseMemoire({
  telegram_settings: [{ key: "canal_pro_mode", value: "ouvert" }],
  users: [{ id: "u1", plan: "pro", role: "customer" }],
  telegram_abonnes: [{ user_id: "u1", chat_id: KARIM, prenom: "Karim", reglages: {}, bloque: false }],
  pro_preferences: [{ user_id: "u1", pays: "fr", bookmakers: ["winamax"], limite_paris_jour: 5, alertes: ["seuil", "hausse", "compositions", "meteo"] }],
  loto_foot_grilles: [{ id: "exemple-loto-foot-7-oct", nom: "Loto Foot 7 (exemple)", premier_match_at: t("2026-10-04", "15:00"), cloture_at: t("2026-10-04", "14:55"), releve_at: t("2026-10-03", "16:30"),
    source: "relevé FDJ (exemple)", matchs: [[1.8, 3.6, 4.5, 70, 15, 15], [2.6, 3.1, 2.9, 48, 14, 38], [2.1, 3.3, 3.6, 60, 18, 22], [3.2, 3.2, 2.3, 30, 20, 50], [1.5, 4.2, 6.5, 80, 10, 10], [2.4, 3.3, 3.0, 45, 25, 30], [2.9, 3.0, 2.6, 42, 16, 42]]
      .map(([a, b, c, r1, r2, r3], k) => ({ n: k + 1, dom: `Équipe ${String.fromCharCode(65 + 2 * k)}`, ext: `Équipe ${String.fromCharCode(66 + 2 * k)}`, cotes: [a, b, c], repartition: [r1, r2, r3] })) }],
});
db.horloge = () => new Date(maintenant);
const journal = [];
const qui = (chat) => (String(chat) === String(ADMIN) ? "clement" : String(chat) === CANAL_GRATUIT ? "canal_gratuit" : String(chat) === String(KARIM) ? "karim" : String(chat));
let nId = 1000;
const noter = (chat, html, extra = {}) => { const id = ++nId; journal.push({ id, t: maintenant, ou: qui(chat), de: "robot", html, ...extra }); return id; };
async function tg(methode, corps) {
  if (methode === "sendMessage") {
    const boutons = (corps.reply_markup?.inline_keyboard || []).flat().map((b) => ({ text: b.text, data: b.callback_data || null, url: b.url || null }));
    return { message_id: noter(corps.chat_id, corps.text, { boutons, reponseA: corps.reply_parameters?.message_id || null }) };
  }
  if (methode === "editMessageReplyMarkup") { const m = journal.find((x) => x.id === corps.message_id); if (m) m.bouton_final = (corps.reply_markup?.inline_keyboard || []).flat().map((b) => b.text).join(" · "); return true; }
  return true;
}
const clique = new Set();
/**
 * Clement clique « Publier » / « Envoyer aux abonnés Pro » (10 min apres, entre 8 h et 23 h). Canal gratuit :
 * copie + cle de publication (comme l'Edge Function). Message Pro : la cle « publie:k:<cle> » ; l'envoi
 * prive a Karim est fait par le robot planifie au tour suivant (tacheAPublier puis tacheDiffusions).
 */
async function clementPublie() {
  const hm = C.paris(maintenant).hm;
  if (hm < "08:00" || hm >= "23:00") return;
  for (const m of journal.filter((x) => x.ou === "clement" && !clique.has(x.id) && Date.parse(maintenant) - Date.parse(x.t) >= 10 * 60000)) {
    const b = (m.boutons || []).find((x) => /^pub(pro|g)?(:|$)/.test(x.data || ""));
    if (!b) continue;
    clique.add(m.id);
    const [genre, rep, cle] = b.data.split(":");
    if (cle && (await db.select("telegram_settings", { key: `publie:k:${cle}` })).length) continue;
    if (cle) await db.insert("telegram_settings", [{ key: `publie:k:${cle}`, value: maintenant }]);
    if (genre !== "pubpro") noter(CANAL_GRATUIT, m.html, { copie: m.id, reponseA: rep ? Number(rep) : null, boutons: (m.boutons || []).filter((x) => x.url) });
    m.bouton_final = genre === "pubpro" ? `Envoyé aux abonnés Pro à ${C.heureTxt(maintenant)}` : `Publié sur le canal à ${C.heureTxt(maintenant)}`;
    journal.push({ id: ++nId, t: maintenant, ou: "clement", de: "clic", html: `Clément clique « ${b.text} »` });
  }
  // Duel du jour : « Publier le duel » (comme duelPublier), puis quelques votes.
  for (const m of journal.filter((x) => x.ou === "clement" && !clique.has(x.id) && (x.boutons || []).some((b) => /^dp:ok:/.test(b.data || "")))) {
    clique.add(m.id);
    const jour = m.boutons.find((b) => /^dp:ok:/.test(b.data)).data.split(":")[2];
    const [duel] = await db.select("duel_manches", { jour });
    journal.push({ id: ++nId, t: maintenant, ou: "clement", de: "clic", html: "Clément clique « Publier le duel »" });
    const id = noter(CANAL_GRATUIT, C.messageDuelOuverture(duel), { boutons: C.clavierDuel(duel).inline_keyboard.flat().map((b) => ({ text: b.text, data: b.callback_data })) });
    await db.update("duel_manches", { jour }, { statut: "ouvert", message_id: id, chat_id: CANAL_GRATUIT });
    await db.insert("duel_votes", [["1", 41], ["N", 17], ["2", 12]].flatMap(([c, n]) => Array.from({ length: n }, (_, k) => ({ jour, telegram_user_id: Number(`${c === "1" ? 1 : c === "N" ? 2 : 3}${k}`), choix: c, vote_at: maintenant }))));
  }
}
/** Clic « Valider » sur le programme du jour (comme programmeClic). */
async function clementValide() {
  const jour = C.paris(maintenant).date;
  const [prog] = await db.select("pro_programmes", { jour });
  if (!prog || prog.statut !== "attente" || Date.parse(maintenant) - Date.parse(prog.demande_at) < 10 * 60000) return;
  await db.update("pro_programmes", { jour }, { statut: "valide", valide_at: maintenant });
  const m = journal.find((x) => x.id === prog.validation_message_id);
  if (m) m.bouton_final = `Validé à ${C.heureTxt(maintenant)} · ${C.paris(maintenant).hm >= "09:30" ? "publication dans les 15 minutes" : "publication à 9 h 30"}`;
  journal.push({ id: ++nId, t: maintenant, ou: "clement", de: "clic", html: "Clément clique « Valider »" });
}

// ------------------------------------------------------------------ robot personnel (ce que fait l'Edge Function telegram-bot, memes fonctions)
async function parisOuvertsBot() {
  return (await db.select("pro_paris", { mode: "ouvert", canal_message_id: ["not_is", null], coup_envoi: ["gt", maintenant] }, { ordre: "coup_envoi.asc" }));
}
async function karimEcrit(texte) {
  journal.push({ id: ++nId, t: maintenant, ou: "karim", de: "karim", html: C.esc(texte) });
  const prefs = C.preferencesEffectives((await db.select("pro_preferences", { user_id: "u1" }))[0]);
  const notes = (await db.select("pro_tickets", { user_id: "u1", jour: C.paris(maintenant).date, statut: "note" })).length;
  if (/^\/programme/.test(texte)) return noter(KARIM, C.messageProgrammePerso(C.paris(maintenant).date, await parisOuvertsBot(), prefs, { notes, prenom: "Karim" }));
  if (/^\/lotofoot/.test(texte)) {
    const g = (await db.select("loto_foot_grilles", { premier_match_at: ["gt", maintenant] })).find((x) => C.messageGrille(x));
    return noter(KARIM, g ? C.messageGrille(g) : "Pas de grille Loto Foot à tenter pour l'instant. Elle t'arrive ici la veille du premier match, à 18 h.");
  }
  const tk = C.lireTicketTexte(texte, await parisOuvertsBot(), prefs.pays);
  if (C.estUnTicket(tk, texte)) {
    const [ins] = await db.insert("pro_tickets", [{ user_id: "u1", jour: C.paris(maintenant).date, source: "texte", texte, pari_id: tk.pari?.id || null, selection: tk.selection, cote: tk.cote, mise: tk.mise, bookmaker: tk.bookmaker, combine: !!tk.combine, statut: "a_confirmer" }]);
    const noteCombine = tk.combine ? (tk.pari ? `\n(C'est le ${C.FAMILLES[tk.pari.famille]?.nom.toLowerCase()} du programme, ${C.etiquette(tk.pari)} : je le relie.)` : "\n(Ce combiné n'est pas celui du programme : je le note tel que tu l'as écrit.)") : "";
    noter(KARIM, `${C.messageTicket(tk)}${noteCombine}\nJe le note dans ton journal ?\n(Ce n'est pas un ticket ? Touche « Annuler » : ton message part à l'équipe, qui te répond ici.)`,
      { boutons: [{ text: "Noter", data: `tk:ok:${ins.id}` }, { text: "Annuler", data: `tk:no:${ins.id}` }] });
    journal.push({ id: ++nId, t: maintenant, ou: "karim", de: "clic", html: "Karim touche « Noter »" });
    await db.update("pro_tickets", { id: ins.id }, { statut: "note" });
    return noter(KARIM, `Noté dans ton journal. ${C.messageGardeFou(notes + 1, prefs.limite_paris_jour)}`);
  }
  return noter(ADMIN, `Message de Karim (faites « Répondre » pour lui répondre) :\n\n${C.esc(texte)}`);
}

// ------------------------------------------------------------------ canal gratuit (scripts/telegram : build-posts puis send-posts, validation d'un clic)
async function canalGratuit(jour) {
  const hier = C.jourSuivant(jour, -1);
  const res = P.resultats({ day: hier, matches: [["win", 7], ["loss", 3]].flatMap(([r, n]) => Array.from({ length: n }, () => ({ result: r, moteur: "v3" }))) });
  const x = MATCHS.find((y) => y.m.date === jour && ["Lens", "Marseille", "Braga", "Paris SG"].includes(y.m.domicile)) || MATCHS.find((y) => y.m.date === jour);
  const pm = x.m.marches.find((k) => k.cle === "1N2:1");
  const libre = { id: x.fixture, is_free: true, status: "NS", analysis_tier: "FULL_ANALYSIS", date: `${jour} ${C.paris(x.ko).hm}`, league: x.m.ligue, home: { n: x.m.domicile }, away: { n: x.m.exterieur },
    pari_rec: `Victoire ${x.m.domicile}`, market_id: "1x2-home", model_probability: Math.round(pm.probabilite * 1000) / 10, cote_rec: pm.cote_disponible,
    p1: Math.round(pm.probabilite * 100), pn: 25, p2: 100 - Math.round(pm.probabilite * 100) - 25, market_consensus_p1: Math.round(pm.probabilite * 100) - 2, market_consensus_pN: 26, market_consensus_p2: 100 - Math.round(pm.probabilite * 100) - 24,
    v3_pari: { market_id: "1x2-home" }, moteur_v3: { source: "v3" } };
  for (const p of [res, P.matchGratuit({ matchs: [libre] }, null, `${jour} 09:00`)].filter(Boolean)) {
    const boutons = [...(p.boutons || []).map((b) => ({ text: b.text, url: b.url })), { text: "Publier sur le canal", data: "pub" }, { text: "Ne pas publier", data: "non" }];
    noter(ADMIN, p.html, { boutons, photo: p.type === "photo" ? p.carte : null });
  }
}

// ------------------------------------------------------------------ la repetition
async function principal() {
  const vrai = globalThis.fetch;
  globalThis.fetch = fauxFetch;
  try {
    const src = creerSources({ ODDS_API_KEY: "repetition-sans-cle", APISPORTS_KEY: "repetition-sans-cle", OPENWEATHER_KEY: "repetition-sans-cle" }, { db, log: () => {} });
    src.matchDuel = async (jour) => {
      const x = MATCHS.find((y) => y.m.date === jour && ["Real Madrid", "Paris SG"].includes(y.m.domicile));
      return x ? { fixture_id: x.fixture, dom: x.m.domicile, ext: x.m.exterieur, competition: x.m.ligue, coup_envoi: x.ko, p1: 64, pn: 21, p2: 15 } : null;
    };
    const deps = { db, tg, src, maintenant: () => new Date(maintenant), env: { ADMIN, CANAL_GRATUIT, ANCRE_FICHIER: null }, log: () => {} };
    /** Depot quotidien de la sortie du moteur v3 (workflow « Update IASHARK Daily », etape Canal Pro). */
    const deposer = async (jour) => {
      const genere = t(jour, "08:40");
      const ms = MATCHS.filter((x) => x.ko > genere && Date.parse(x.ko) < Date.parse(genere) + 4 * 86400e3).map((x) => x.m);
      const s = reduire(sortieV3(ms, genere));
      await db.insert("moteur_v3_sorties", [{ genere_le: genere, moteur_version: s.moteur_version, contrat_version: s.contrat_version, sortie: s }], { conflit: "fusionner" });
    };
    await deposer("2026-10-01");
    // Scenario (heures de Paris, au quart d'heure : le robot tourne toutes les 15 min).
    const scenario = {
      "2026-10-03 09:00": () => canalGratuit("2026-10-03"),
      "2026-10-03 10:00": () => karimEcrit("/programme"),
      "2026-10-03 10:15": async () => {
        const combo = (await db.select("pro_paris", { famille: "combine", jour: "2026-10-03" }))[0];
        return karimEcrit(combo ? `${combo.selections.map((j) => j.dom).join(" + ")} à ${C.fr(combo.meilleure_cote)} chez Winamax 5 €` : "Bayern Munich + Inter à 1,90 chez Winamax 5 €");
      },
      "2026-10-03 18:30": () => karimEcrit("/lotofoot"),
      "2026-10-06 08:00": () => { etat.panneCotes = true; journal.push({ id: ++nId, t: maintenant, ou: "coulisses", de: "panne", html: "Panne simulée : The Odds API ne répond plus (503)." }); },
      "2026-10-06 09:00": () => canalGratuit("2026-10-06"),
      "2026-10-06 09:45": () => { etat.panneCotes = false; journal.push({ id: ++nId, t: maintenant, ou: "coulisses", de: "panne", html: "Fin de la panne simulée : The Odds API répond de nouveau." }); },
      "2026-10-06 10:30": () => karimEcrit("/programme"),
    };
    for (let ms = Date.parse(t("2026-10-02", "08:00")); ms <= Date.parse(t("2026-10-06", "23:45")); ms += 15 * 60000) {
      maintenant = new Date(ms).toISOString();
      const { date, hm } = C.paris(maintenant);
      if (hm === "08:45") await deposer(date);
      if (scenario[`${date} ${hm}`]) await scenario[`${date} ${hm}`]();
      await clementValide();
      const rapport = await T.tourner(deps);
      if (Object.values(rapport).some((x) => String(x).startsWith("ERREUR"))) journal.push({ id: ++nId, t: maintenant, ou: "coulisses", de: "rapport", html: `Tour du robot : ${Object.entries(rapport).filter(([, v]) => String(v).startsWith("ERREUR")).map(([k, v]) => `${k} → ${v}`).join(" ; ")}` });
      await clementPublie();
    }
  } finally { globalThis.fetch = vrai; }
  const paris = await db.select("pro_paris", {});
  return { journal, paris, releves: await db.select("pro_cotes_releves", {}), credits: etat.credits, chaine: await C.verifierChaine(paris.filter((p) => p.numero && p.empreinte)) };
}

const r = await principal();
const sortie = process.argv[2] || "repetition-generale.json";
fs.writeFileSync(sortie, JSON.stringify(r, null, 1));
console.log(`${r.journal.length} messages et clics notés (aucun envoyé), ${r.paris.length} paris, ${r.credits} appels de cotes simulés, chaîne d'empreintes : ${r.chaine.length ? r.chaine.join(" ; ") : "intacte"} -> ${sortie}`);
