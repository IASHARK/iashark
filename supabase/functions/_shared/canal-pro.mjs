// IASHARK — messages Pro (en prive, un a un depuis le 02/10/2026 : plus de canal Pro commun) et
// robot personnel Telegram (V3, 30/09/2026 ; MENU du Canal Pro branche le
// 30/09 : iashark-strategies/REGLE-VIP.md, conditions du mathematicien, decision de Clement).
// Logique PURE : aucun appel reseau, aucune ecriture. Utilisee a la fois par
// l'Edge Function supabase/functions/telegram-bot (Deno) et par le robot
// planifie scripts/canal-pro/tourner.mjs (Node, GitHub Actions). Le choix des
// paris (le menu) est dans canal-pro-menu.mjs.
// Tests : tests/canal-pro.test.mjs et tests/canal-pro-menu.test.mjs.
//
// Regles non negociables (verifiees par les tests) :
// - chaque message de pari donne le match, le pari, la cote et la « chance
//   calculee par IASHARK » ; RIEN d'autre : aucune mise (ni unite, ni % du
//   capital), aucune esperance, aucune ligne « il faut gagner X % pour ne rien
//   perdre », aucune « cote minimum » affichee (decision de Clement, 30/09) ;
// - jamais de taux de reussite, « chance reelle », « les plus fiables »,
//   « valeur », « avantage », « rentable » ni « VIP » dans un message ;
// - debriefs et bilan : des nombres (gagnes, perdus), rien d'autre ; l'archive
//   (empreinte, cote prise, cloture) reste interne, jamais citee ;
// - seulement les bookmakers agrees du pays de l'abonne (France : ANJ) ;
// - aucune promesse de gain, et pas de mention « jouer comporte des risques »
//   (decision de Clement) ;
// - aucune donnee inventee : une donnee absente = pas de phrase ;
// - garde-fou : a la limite (et a 0), plus rien de la journee ;
// - alertes coupees la nuit (23 h - 8 h) sauf choix de l'abonne.

import { textes, estFrancais, surMesure } from "./canal-pro-langues.mjs";
import { DONNEES_COMPETITIONS } from "./competitions-pro.mjs";
// Langues (02/10/2026) : chaque fonction de message accepte une langue ('fr' par defaut). En
// francais, le texte est EXACTEMENT celui d'avant ; dans une autre langue, seuls les mots changent :
// les chiffres (chance, cote, bookmaker, heure) viennent du meme pari (une seule source).

// ------------------------------------------------------------------ heures (Paris)
const FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
});
const JOURS_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Date -> { date: 'AAAA-MM-JJ', hm: 'HH:MM', dow: 0..6, jourMois } en heure de Paris. */
export function paris(d) {
  const p = Object.fromEntries(FMT.formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, dow: JOURS_EN[p.weekday], jourMois: Number(p.day) };
}
/** 'AAAA-MM-JJ' + 'HH:MM' (heure de Paris) -> Date (UTC). */
export function parisVersDate(date, hm = "00:00") {
  const [y, m, j] = date.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  let t = Date.UTC(y, m - 1, j, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = paris(t);
    const vu = Date.UTC(...p.date.split("-").map((x, k) => (k === 1 ? Number(x) - 1 : Number(x))), ...p.hm.split(":").map(Number));
    t += Date.UTC(y, m - 1, j, h, mi) - vu;
  }
  return new Date(t);
}
export function jourSuivant(date, n = 1) {
  const [y, m, j] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, j + n)).toISOString().slice(0, 10);
}
/** '20 h 45' / '15 h'. */
export function heureTxt(d, lang = "fr") {
  if (!estFrancais(lang)) return textes(lang).heure(d);
  const [h, m] = paris(d).hm.split(":");
  return `${Number(h)} h${m === "00" ? "" : " " + m}`;
}
export function dateLongue(date, lang = "fr") {
  if (!estFrancais(lang)) return textes(lang).dateLongue(date);
  const [y, m, j] = date.split("-").map(Number);
  return `${JOURS[new Date(Date.UTC(y, m - 1, j)).getUTCDay()]} ${j} ${MOIS[m - 1]}`;
}
export function nomJour(date, lang = "fr") {
  if (!estFrancais(lang)) return textes(lang).nomJour(date);
  const [y, m, j] = date.split("-").map(Number);
  return JOURS[new Date(Date.UTC(y, m - 1, j)).getUTCDay()];
}
/** Nuit = 23 h - 8 h : pas d'alerte personnelle, sauf si l'abonne l'a demande. */
export function estLaNuit(d) {
  const hm = paris(d).hm;
  return hm >= "23:00" || hm < "08:00";
}

// ------------------------------------------------------------------ nombres
export const fr = (x, n = 2) => (x == null || !isFinite(x) ? "" : Number(x).toFixed(n).replace(".", ","));
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ok = (x) => typeof x === "number" && isFinite(x);
const pct = (p) => Math.round(p * 100);
const pluriel = (n, s, p = s + "s") => `${n} ${n > 1 ? p : s}`;
/** Somme compensee de Neumaier : la meme que sum() de Python 3.12 (regles.py). */
export function somme(v) {
  let s = 0, c = 0;
  for (const x of v) {
    const t = s + x;
    c += Math.abs(s) >= Math.abs(x) ? (s - t) + x : (x - t) + s;
    s = t;
  }
  return s + c;
}
/** regles.py#f : une cote n'est lue que si 1 < cote < 200. */
const coteLue = (x) => { const v = Number(x); return v > 1 && v < 200 ? v : NaN; };

// ------------------------------------------------------------------ le menu du Canal Pro (REGLE-VIP.md, 30/09/2026)
// Les paris viennent du MENU (canal-pro-menu.mjs), calcule sur la sortie du moteur v3 : chaque jour
// jusqu'a 3 simples et 1 combine du jour ; samedi et dimanche 1 « meme match avec buteur » ; le vendredi,
// les tickets du week-end (autour de 10, autour de 25) et, le 1er week-end du mois, le ticket 50-100.
// DECISION DE CLEMENT (30/09, soir) : pas de page « historique public » ; l'archivage (empreinte, cote
// prise, cloture) reste INTERNE et n'est jamais mentionne dans un message.
// DECISION DE CLEMENT (30/09) : AUCUNE mise (ni unite, ni % du capital, ni conseil de mise), aucune
// esperance, aucune ligne « il faut gagner X % pour ne rien perdre », aucune « cote minimum ». Chaque
// message donne le match, le pari, la cote et la « chance calculee par IASHARK ». La preuve, c'est
// l'archive interne (jamais citee dans les messages).
export const REGLES = {
  version: "menu-2026-09-30",
  // Garde-fou des cotes (portage de iashark-preuve/regles.py) : une cote a plus de 2 fois la moyenne est ignoree.
  garde_fou_cote_max_sur_moyenne: 2.0,
};
// Les cles sont celles de pro_paris.famille (migration 0040).
export const FAMILLES = {
  simple: { nom: "Simple", titre: "SIMPLE", pref: "simple" },
  combine: { nom: "Combiné du jour", titre: "COMBINÉ DU JOUR", pref: "combine" },
  buteur: { nom: "Même match avec buteur", titre: "MÊME MATCH AVEC BUTEUR", pref: "buteur", plaisir: "chance calculée, cote à voir chez ton bookmaker" },
  fun10: { nom: "Ticket autour de 10", titre: "TICKET AUTOUR DE 10", pref: "fun", plaisir: "pour le plaisir" },
  fun25: { nom: "Ticket autour de 25", titre: "TICKET AUTOUR DE 25", pref: "fun", plaisir: "pour le plaisir" },
  reve: { nom: "Ticket 50-100 du mois", titre: "TICKET 50-100 DU MOIS", pref: "fun", plaisir: "pour le plaisir" },
};
export const ORDRE_FAMILLES = ["simple", "combine", "buteur", "fun10", "fun25", "reve"];
/** Paris a plusieurs selections (matchs differents) : combine du jour et tickets du week-end. */
export const COMBINES = ["combine", "fun10", "fun25", "reve"];
export const estCombine = (p) => COMBINES.includes(p?.famille);
/** Choix de l'abonne (pro_preferences.familles) : simple, combine, buteur, fun (les 3 tickets). */
export const CHOIX_FAMILLES = { simple: "Simples", combine: "Combiné du jour", buteur: "Même match avec buteur", fun: "Tickets pour le plaisir" };
export const MENTION_MENU = "Chances calculées par IASHARK (moteur v3).";
/** En-tete d'un programme qui contient un pari de la voie « cotes du marche ». */
export const NOTE_MARCHE = "Quand c'est écrit « à partir des cotes du marché », la chance vient des cotes des bookmakers, marge retirée.";
/**
 * COMPETITIONS PREFEREES (03/10/2026, decision de Clement) : SEULEMENT pour l'information. Les paris sont
 * les MEMES pour tous ; a la fin du programme du jour, l'abonne voit les matchs du jour de SES competitions
 * (heure et lien vers l'analyse, sans pari ni chance), et le lendemain matin leurs resultats.
 * Une seule liste, la meme que le site : competitions-pro.mjs, genere par scripts/sync-competitions-pro.js
 * depuis config/leagues.json (cles « premier », « ligue1 »…). pro_preferences.competitions (0045, 0049) :
 * vide = toutes (pas de liste a part). Les anciens codes du robot (« F1 », « SP1 »…) sont relus.
 */
export const COMPETITIONS_PRO = Object.freeze(DONNEES_COMPETITIONS.liste.map((c) => Object.freeze({ ...c })));
export const GROUPES_COMPETITIONS = DONNEES_COMPETITIONS.groupes;
export const COMPETITIONS = Object.freeze(Object.fromEntries(COMPETITIONS_PRO.map((c) => [c.cle, c.nom])));
/** Cle d'une competition (ou ancien code du robot « F1 ») -> cle de la liste, sinon null. */
export const cleCompetition = (x) => (COMPETITIONS[x] ? x : DONNEES_COMPETITIONS.anciens[x] || null);
/** Nom d'une competition dans une langue (francais : nom francais ; autres : nom international). */
export const nomCompetition = (cle, lang = "fr") => { const c = COMPETITIONS_PRO.find((x) => x.cle === cle); return c ? (estFrancais(lang) ? c.nom : c.nom_en) : cle; };
/** Identifiant API-Football d'une ligue -> cle de la liste. */
const CLE_PAR_API = new Map(COMPETITIONS_PRO.filter((c) => c.api).map((c) => [Number(c.api), c.cle]));
export const cleParApi = (id) => CLE_PAR_API.get(Number(id)) || null;
export const familleDeStrategie = (x) => (FAMILLES[x] ? x : null);

// ------------------------------------------------------------------ bookmakers agrees
// France : SEULS les operateurs agrees par l'ANJ. Liste alignee sur anj.fr
// (page des operateurs agrees, lue par le trader de cotes le 29/09/2026) :
// ZEbet, Barriere Bet et Parions Sport en ligne n'y sont plus ; bet365,
// Betsson, Circus, DAZN Bet et Yesorno y sont. A REVERIFIER A L'OEIL avant
// l'ouverture. « suivi » = The Odds API en donne les cotes (cle *_fr) :
// seuls ceux-la sont proposes dans /reglages et comptent pour « la meilleure
// cote ». Un bookmaker absent de la liste n'est JAMAIS montre.
export const BOOKMAKERS_AGREES = {
  FR: [
    { cle: "betclic", nom: "Betclic", suivi: true },
    { cle: "netbet", nom: "NetBet", suivi: true },
    { cle: "pmu", nom: "PMU", suivi: true },
    { cle: "unibet", nom: "Unibet", suivi: true },
    { cle: "winamax", nom: "Winamax", suivi: true },
    { cle: "bet365", nom: "bet365" },
    { cle: "betsson", nom: "Betsson" },
    { cle: "bwin", nom: "Bwin" },
    { cle: "circus", nom: "Circus" },
    { cle: "daznbet", nom: "DAZN Bet" },
    { cle: "feelingbet", nom: "Feelingbet" },
    { cle: "genybet", nom: "Genybet" },
    { cle: "olybet", nom: "Olybet" },
    { cle: "pokerstars", nom: "PokerStars Sports" },
    { cle: "vbet", nom: "Vbet" },
    { cle: "yesorno", nom: "Yesorno" },
  ],
  // ESPAGNE (02/10/2026) : SEULS des operateurs titulaires d'une licence de la DGOJ (Direccion General
  // de Ordenacion del Juego), liste publique relue le 02/10/2026 :
  // https://www.ordenacionjuego.es/operadores-juego/operadores-licencia/operadores
  // (William Hill : WHG Ceuta SA, williamhill.es ; 888sport : 888 Online Games Espana SA, 888sport.es ;
  // Betsson : Premiere Megaplex PLC, betsson.es ; Marathonbet : Marathonbet Spain SA, marathonbet.es).
  // « suivi » = The Odds API en donne les cotes : il n'existe pas de flux « .es » chez The Odds API ;
  // « odds » = la cle du flux EUROPEEN de l'operateur (region eu), le meme groupe que son site .es.
  // A FAIRE VERIFIER A L'OEIL par le trader de cotes (cote du site .es = cote du flux ?) avant
  // l'ouverture. Ecartes : Betfair (bourse espagnole separee de la bourse « eu »), Winamax, LeoVegas,
  // Codere, Unibet (flux d'un autre pays seulement), 1xBet (flux international). Licence DGOJ mais pas
  // dans nos sources de cotes : listes « non suivis » (jamais montres tant qu'ils ne sont pas suivis).
  ES: [
    { cle: "williamhill", nom: "William Hill", suivi: true, odds: "williamhill" },
    { cle: "888sport", nom: "888sport", suivi: true, odds: "sport888" },
    { cle: "betsson", nom: "Betsson", suivi: true, odds: "betsson" },
    { cle: "marathonbet", nom: "Marathonbet", suivi: true, odds: "marathonbet" },
    { cle: "bet365", nom: "bet365" },
    { cle: "bwin", nom: "bwin" },
    { cle: "betfair", nom: "Betfair" },
    { cle: "betway", nom: "Betway" },
    { cle: "codere", nom: "Codere" },
    { cle: "sportium", nom: "Sportium" },
    { cle: "marca_apuestas", nom: "Marca Apuestas" },
    { cle: "winamax", nom: "Winamax" },
    { cle: "leovegas", nom: "LeoVegas" },
    { cle: "luckia", nom: "Luckia" },
    { cle: "kirolbet", nom: "Kirolbet" },
    { cle: "retabet", nom: "Retabet" },
    { cle: "pokerstars", nom: "PokerStars Sports" },
    { cle: "daznbet", nom: "DAZN Bet" },
    { cle: "interwetten", nom: "Interwetten" },
    { cle: "olybet", nom: "Olybet" },
    { cle: "tonybet", nom: "TonyBet" },
    { cle: "versus", nom: "Versus" },
  ],
};
export const bookmakersSuivis = (pays = "FR") => (BOOKMAKERS_AGREES[pays] || []).filter((b) => b.suivi).map((b) => b.cle);
/** Pays ouverts dont les cotes sont relevees A PART (en plus de la France, qui fait le programme commun). */
export const PAYS_COTES_A_PART = Object.freeze(Object.keys(BOOKMAKERS_AGREES).filter((p) => p !== "FR"));
/** Cles The Odds API a relever : France (« <cle>_fr ») et flux des autres pays ouverts. */
export const clesOddsApi = () => [...bookmakersSuivis("FR").map((b) => `${b}_fr`),
  ...PAYS_COTES_A_PART.flatMap((p) => (BOOKMAKERS_AGREES[p] || []).filter((b) => b.suivi && b.odds).map((b) => b.odds))];
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/**
 * Cle ou titre d'un bookmaker (The Odds API) -> cle agreee du pays, sinon null. France : seulement les
 * flux « _fr » (les versions .com / _eu ne comptent pas). Espagne : la cle exacte du flux (« odds »).
 */
export function bookmakerAgree(cleOuTitre, pays = "FR") {
  const liste = BOOKMAKERS_AGREES[pays];
  if (!liste) return null;
  if (pays !== "FR") return liste.find((b) => b.suivi && b.odds && b.odds === String(cleOuTitre ?? "").trim().toLowerCase())?.cle ?? null;
  const s = norm(cleOuTitre).replace(/\s+/g, "");
  let base;
  if (s.endsWith("_fr")) base = s.slice(0, -3);
  else if (s.includes("(fr)")) base = s.replace("(fr)", "");
  else return null;
  base = base.replace(/[^a-z0-9]/g, "");
  const b = liste.find((x) => base === x.cle || base === x.cle + "sports" || base === x.cle + "sport");
  return b ? b.cle : null;
}
export function nomBookmaker(cle, pays = "FR") {
  return (BOOKMAKERS_AGREES[pays] || []).find((b) => b.cle === cle)?.nom || cle;
}
/** { cleBrute: cote } -> { cleAgreee: cote } (meilleure cote si doublon). */
export function cotesAgreees(cotes, pays = "FR") {
  const out = {};
  for (const [k, v] of Object.entries(cotes || {})) {
    const c = bookmakerAgree(k, pays);
    if (c && ok(v) && v > 1 && (!out[c] || v > out[c])) out[c] = v;
  }
  return out;
}
export function meilleure(cotes, parmi = null) {
  let best = null;
  for (const [bk, c] of Object.entries(cotes || {})) {
    if (parmi && !parmi.includes(bk)) continue;
    if (ok(c) && (!best || c > best.cote)) best = { bookmaker: bk, cote: c };
  }
  return best;
}

// ------------------------------------------------------------------ The Odds API -> cotes par bookmaker
/**
 * Evenement The Odds API -> books { cle: { nom, '1x2':[h,d,a], dc:{'1X','X2','12'}, ou:[o,u], ah: Map(ligneDom -> [h,a]) } }.
 * Comme regles.py : une cote hors de ]1 ; 200[ est ignoree, et avec elle tout le marche du bookmaker.
 * Double chance (marche « double_chance », endpoint /events/{id}/odds) : VRAIE cote du bookmaker
 * (condition 4 du mathematicien). Noms d'issues lus avec souplesse (« Torino/Draw », « Draw or Udinese »,
 * « 1X »…) : FORMAT A CONFIRMER par l'ingenieur donnees avec la cle payante ; une issue illisible = pas de cote.
 */
export function booksDepuisOddsApi(ev) {
  const books = {};
  const nd = (x) => norm(x).replace(/[^a-z0-9]+/g, " ").trim();
  const dom = nd(ev.home_team), ext = nd(ev.away_team);
  const issueDc = (nom) => {
    const n = nd(nom);
    if (["1x", "x2", "12"].includes(n.replace(/ /g, ""))) return n.replace(/ /g, "").toUpperCase();
    const d = dom && n.includes(dom), e = ext && n.includes(ext), x = /\bdraw\b|\bnul\b|\bx\b/.test(n);
    if (d && x && !e) return "1X";
    if (e && x && !d) return "X2";
    if (d && e && !x) return "12";
    return null;
  };
  for (const b of ev.bookmakers || []) {
    const rec = { nom: b.title || b.key };
    for (const m of b.markets || []) {
      const o = m.outcomes || [];
      if (m.key === "h2h") {
        const v = [o.find((x) => x.name === ev.home_team)?.price, o.find((x) => x.name === "Draw")?.price, o.find((x) => x.name === ev.away_team)?.price].map(coteLue);
        if (v.every(ok)) rec["1x2"] = v;
      } else if (m.key === "double_chance") {
        const dcs = {};
        for (const x of o) { const k = issueDc(x.name), c = coteLue(x.price); if (k && ok(c)) dcs[k] = c; }
        if (Object.keys(dcs).length) rec.dc = dcs;
      } else if (m.key === "totals") {
        const v = [o.find((x) => x.name === "Over" && x.point === 2.5)?.price, o.find((x) => x.name === "Under" && x.point === 2.5)?.price].map(coteLue);
        if (v.every(ok)) rec.ou = v;
      } else if (m.key === "spreads") {
        const h = o.find((x) => x.name === ev.home_team), a = o.find((x) => x.name === ev.away_team);
        const v = [coteLue(h?.price), coteLue(a?.price)];
        // Les 2 cotes ne vont ensemble que sur la MEME ligne (exterieur = -domicile) ; sinon, marche ignore.
        if (h && a && v.every(ok) && ok(h.point) && ok(a.point) && a.point === -h.point) (rec.ah ||= new Map()).set(h.point, v);
      }
    }
    if (rec["1x2"] || rec.dc || rec.ou || rec.ah) books[b.key] = rec;
  }
  return books;
}
const mean = (v) => { const w = v.filter(ok); return w.length ? somme(w) / w.length : NaN; };
function fair(...o) {
  if (!o.every(ok)) return o.map(() => NaN);
  const inv = o.map((x) => 1 / x), s = somme(inv);
  return inv.map((x) => x / s);
}
const dc = (a, b) => (ok(a) && ok(b) ? 1 / (1 / a + 1 / b) : NaN);
const DC_ISSUES = { "1X": [0, 1], X2: [1, 2], 12: [0, 2] };
/**
 * Cotes REELLES d'une selection, bookmaker par bookmaker. Double chance : seulement la VRAIE cote double
 * chance du bookmaker (plus jamais une cote calculee a partir de son 1N2 : condition 4 du mathematicien).
 */
export function cotesExecutables(books, marche, ligne, guard = REGLES.garde_fou_cote_max_sur_moyenne) {
  let out = {};
  for (const [bk, r] of Object.entries(books)) {
    let o = NaN;
    if (["1", "N", "2"].includes(marche) && r["1x2"]) o = r["1x2"][{ 1: 0, N: 1, 2: 2 }[marche]];
    else if (DC_ISSUES[marche] && r.dc) o = r.dc[marche];
    else if (["O25", "U25"].includes(marche) && r.ou) o = r.ou[marche === "O25" ? 0 : 1];
    else if (["AHH", "AHA"].includes(marche) && r.ah) {
      const base = marche === "AHH" ? ligne : -ligne;
      if (r.ah.has(base)) o = r.ah.get(base)[marche === "AHH" ? 0 : 1];
    }
    if (ok(o)) out[bk] = o;
  }
  // Garde-fou « cote > 2 x la moyenne » sur TOUS les marches (comme regles.py#executable_odds).
  if (Object.keys(out).length >= 3) { const av = mean(Object.values(out)); out = Object.fromEntries(Object.entries(out).filter(([, o]) => o <= guard * av)); }
  return out;
}
/**
 * Coquille chez PINNACLE (contre-controle ronde 4.1, sim9-coquille-pinnacle : 1,38 tape 13,8) : la
 * somme des 1/cote de Pinnacle sur un marche doit rester dans une fourchette normale. Hors fourchette,
 * Pinnacle compte comme absent (dernier controle, releves, alertes : aucune cote gardee).
 * BORNES PROVISOIRES (1,00 a 1,10) : A FIXER PAR LE TRADER DE COTES.
 */
export const MARGE_PINNACLE = Object.freeze({ min: 1.0, max: 1.1 });
export function margePinnacle(cotes) {
  return Array.isArray(cotes) && cotes.length && cotes.every((x) => ok(x) && x > 1) ? somme(cotes.map((x) => 1 / x)) : NaN;
}
export const margePinnacleNormale = (cotes, b = MARGE_PINNACLE) => { const m = margePinnacle(cotes); return ok(m) && m >= b.min - 1e-9 && m <= b.max + 1e-9; };
/** Pinnacle present au 1N2 mais hors fourchette : raison, sinon null. */
export function pinnacleDouteux(books) {
  const v = books.pinnacle?.["1x2"];
  if (!v || margePinnacleNormale(v)) return null;
  return `cote Pinnacle douteuse au 1N2 (somme des 1/cote ${fr(margePinnacle(v), 3)}, hors ${fr(MARGE_PINNACLE.min)} à ${fr(MARGE_PINNACLE.max)} : erreur de cote probable)`;
}
/**
 * Chance Pinnacle sans marge de la selection (matiere de la cloture et de la CLV), et cote Pinnacle
 * de reference (filtre de coherence). Double chance : chance tiree de son 1N2 ; cote = sa vraie cote
 * double chance si elle existe, sinon celle tiree de son 1N2 (seulement comme reference du filtre).
 */
export function referencePinnacle(books, marche, ligne) {
  const pin = books.pinnacle;
  if (!pin) return { proba: null, cote: null };
  let v = null, k = null;
  if (["1", "N", "2"].includes(marche) || DC_ISSUES[marche]) v = pin["1x2"];
  else if (["O25", "U25"].includes(marche)) { v = pin.ou; k = marche === "O25" ? 0 : 1; }
  else if (pin.ah && ["AHH", "AHA"].includes(marche)) { v = pin.ah.get(marche === "AHH" ? ligne : -ligne); k = marche === "AHH" ? 0 : 1; }
  if (!v) return { proba: null, cote: null };
  if (!margePinnacleNormale(v)) return { proba: null, cote: null, douteuse: true };
  const f = fair(...v);
  if (DC_ISSUES[marche]) { const [i, j] = DC_ISSUES[marche]; return { proba: f[i] + f[j], cote: pin.dc?.[marche] ?? dc(v[i], v[j]) }; }
  if (k === null) k = { 1: 0, N: 1, 2: 2 }[marche];
  return { proba: f[k], cote: v[k] };
}
/** Etat d'une selection a un instant : cotes jouables, reference Pinnacle. */
export function etatMarche(books, marche, ligne) {
  const cotes = cotesExecutables(books, marche, ligne, REGLES.garde_fou_cote_max_sur_moyenne);
  return { cotes, ...Object.fromEntries(Object.entries(referencePinnacle(books, marche, ligne)).map(([k, v]) => [`pinnacle_${k}`, v])) };
}
/**
 * Filtre de coherence face a Pinnacle (contre-controle ronde 4, sim7-coquille.mjs) : une cote agreee
 * qui depasse de plus de 25 % la cote Pinnacle de la MEME selection est ecartee (coquille probable).
 * Applique au dernier controle, aux releves et aux alertes. Il ne fait que retirer des cotes.
 * Sans cote Pinnacle, rien n'est verifiable : aucune cote n'est gardee.
 * SEUIL PROVISOIRE (25 %) : A CONFIRMER PAR LE TRADER DE COTES.
 */
export const ECART_MAX_PINNACLE = 0.25;
export function filtrePinnacle(cotes, pinnacleCote, ecartMax = ECART_MAX_PINNACLE) {
  const gardees = {}, ecartees = [];
  const pin = Number(pinnacleCote);
  for (const [bk, c] of Object.entries(cotes || {})) {
    if (ok(pin) && pin > 1 && ok(c) && c <= pin * (1 + ecartMax) + 1e-9) gardees[bk] = c;
    else ecartees.push(bk);
  }
  return { cotes: gardees, ecartees };
}
/** Etat du marche -> cotes des agrees SUIVIS du pays, verifiees face a Pinnacle (dernier controle, releves, alertes). */
export function cotesVerifiees(etat, pays = "FR") {
  const suivis = bookmakersSuivis(pays);
  const agrees = Object.fromEntries(Object.entries(cotesAgreees(etat?.cotes || {}, pays)).filter(([bk]) => suivis.includes(bk)));
  return filtrePinnacle(agrees, etat?.pinnacle_cote);
}

// ------------------------------------------------------------------ programme du jour
export function selectionTxt(p, lang = "fr") {
  if (!estFrancais(lang)) {
    const L = textes(lang);
    const ln = p.ligne == null ? "" : (Number(p.ligne) > 0 ? "+" : "") + (L.code === "en" ? String(Number(p.ligne)) : String(Number(p.ligne)).replace(".", ","));
    return L.marches[p.marche] ? L.marches[p.marche](p, ln) : p.marche;
  }
  const l = p.ligne == null ? "" : (Number(p.ligne) > 0 ? "+" : "") + String(Number(p.ligne)).replace(".", ",");
  return ({ 1: `${p.dom} gagne`, N: "match nul", 2: `${p.ext} gagne`, "1X": `${p.dom} ou nul`, X2: `nul ou ${p.ext}`, 12: `${p.dom} ou ${p.ext}`,
    O25: "plus de 2,5 buts", U25: "moins de 2,5 buts", AHH: `${p.dom} (handicap ${l})`, AHA: `${p.ext} (handicap ${l})` })[p.marche] || p.marche;
}
/** « Torino – Udinese », ou « Combiné du jour (2 sélections) » pour un pari a plusieurs matchs. */
export function matchTxt(p, lang = "fr") {
  if (!estFrancais(lang) && estCombine(p)) { const L = textes(lang), n = (p.selections || []).length; return `${L.familles[p.famille]?.nom || p.famille}${n ? ` (${L.nSelections(n)})` : ""}`; }
  if (estCombine(p)) { const n = (p.selections || []).length; return `${FAMILLES[p.famille]?.nom || p.famille}${n ? ` (${n} sélections)` : ""}`; }
  return `${p.dom} – ${p.ext}`;
}
/** Le pari en clair. Buteur : « X marque (à n'importe quel moment) », jamais « 1er buteur » (condition 3). */
/** Selection d'une jambe (combine, ticket) : recalculee dans la langue si son marche est connu. */
export function selectionJambe(j, lang = "fr") {
  if (estFrancais(lang)) return j.selection || selectionTxt(j);
  return j.marche ? selectionTxt(j, lang) : (j.selection || "");
}
export function pariTxt(p, lang = "fr") {
  if (!estFrancais(lang)) {
    const L = textes(lang);
    if (p.famille === "buteur") { const b = p.selections?.[0] || {}; return L.buteurPari(b.equipe, b.joueur); }
    if (estCombine(p)) return (p.selections || []).map((j) => selectionJambe(j, lang)).join(" + ");
    return selectionTxt(p, lang);
  }
  if (p.famille === "buteur") { const b = p.selections?.[0] || {}; return `${b.equipe} gagne + ${b.joueur} marque (à n'importe quel moment)`; }
  if (estCombine(p)) return (p.selections || []).map((j) => j.selection || selectionTxt(j)).join(" + ");
  return selectionTxt(p);
}
const pct1 = (p, lang = "fr") => { const x = p * 100; return x >= 10 ? String(Math.round(x)) : textes(lang).n(x, 1); };
/** « 1 chance sur N » avec N = 1 / chance affichee (coherent avec le pourcentage montre). */
export function uneSurN(p, lang = "fr") { const n = 1 / p; return n < 10 ? textes(lang).n(n, 1) : String(Math.round(n)); }
/**
 * VOIE « COTES DU MARCHE » (02/10/2026) : competitions de config/leagues.json#fiabilite.ligues_validees_cotes_marche
 * (verifiees le 02/10/2026 pour la chance TIREE DES COTES, pas pour un modele). La chance d'une de leurs
 * selections est la probabilite sans marge des cotes du marche, et elle le DIT : libelle honnete.
 */
export const SOURCE_COTES_MARCHE = "chance calculée par IASHARK à partir des cotes du marché";
export const VOIE_COTES_MARCHE = "cotes_marche";
/** D'ou vient la chance d'un pari : « v3 », « marche » (cotes du marche) ou « mixte » (combine des deux). */
export function voieChance(p) {
  if (!p || p.famille === "buteur") return "v3";
  if (estCombine(p)) {
    const s = p.selections || [];
    const n = s.filter((j) => j.voie === VOIE_COTES_MARCHE).length;
    return !n ? "v3" : n === s.length ? "marche" : "mixte";
  }
  return p.voie === VOIE_COTES_MARCHE || String(p.source_proba || "").startsWith(SOURCE_COTES_MARCHE) ? "marche" : "v3";
}
/** La chance, toujours « calculée par IASHARK » (conditions 2 et 3). Jamais de taux de reussite ni d'esperance. */
export function chanceTxt(p, lang = "fr") {
  const voie = voieChance(p);
  if (!estFrancais(lang)) {
    const L = textes(lang);
    if (p.famille === "buteur") return L.chanceButeur(pct1(p.proba, lang), uneSurN(p.proba, lang));
    if (estCombine(p)) return voie === "v3" ? L.chanceCombine(uneSurN(p.proba, lang), pct1(p.proba, lang)) : L.chanceCombineMarche(uneSurN(p.proba, lang), pct1(p.proba, lang), voie === "mixte");
    return voie === "marche" ? L.chanceMarche(pct(p.proba)) : L.chanceSimple(pct(p.proba));
  }
  if (p.famille === "buteur") return `Chance calculée par IASHARK : environ ${pct1(p.proba)} % (1 chance sur ${uneSurN(p.proba)}), lue dans la grille des scores du match.`;
  // Une seule source (01/10/2026) : produit des chances IASHARK des selections, chacune la meme
  // que sur la page match (le plus bas entre le moteur v3 et la cote sans marge).
  const quoi = voie === "marche" ? " à partir des cotes du marché" : voie === "mixte" ? " (moteur v3 et cotes du marché)" : "";
  if (estCombine(p)) return `Chance calculée par IASHARK${quoi} : environ 1 chance sur ${uneSurN(p.proba)} (${pct1(p.proba)} %), toutes les sélections doivent passer.`;
  return `Chance calculée par IASHARK${quoi} : ${pct(p.proba)} %.`;
}
export const SANS_PREUVE_BUTEUR = "Cote buteur : à voir chez ton bookmaker (nous ne la relevons pas).";
/** Texte archive avec le pari (dans l'empreinte). */
export function explication(p) {
  return chanceTxt(p) + (p.famille === "buteur" ? ` ${SANS_PREUVE_BUTEUR}` : "");
}
/** Note utilisee par l'espace Pro derriere chaque cote de double chance : les cotes montrees sont desormais de VRAIES cotes (condition 4), donc rien. */
export const noteCoteCalculee = () => "";
/** Fenetre du programme du jour J : matchs de J 12 h a J+1 11 h 59 (Paris). */
export function fenetreProgramme(jour) {
  return { debut: parisVersDate(jour, "12:00"), fin: parisVersDate(jourSuivant(jour), "11:59") };
}
const produit = (v) => v.reduce((a, x) => a * x, 1);
const arrondi2 = (x) => Math.round(x * 100) / 100;
/**
 * Paris du menu (canal-pro-menu.mjs#construireMenu) -> programme. Le « controleur » ecarte : type
 * suspendu (regle d'arret), match non relie aux resultats, cote de plus d'1 h, match dans moins de
 * 30 min, aucune cote chez les bookmakers agrees suivis. Aucune « cote minimum » : la regle a deja
 * choisi le pari sur la cote moyenne du moteur v3 (comme dans le rejeu).
 */
export function preparerProgramme(candidats, { jour, maintenant, pays = "FR", ageMaxMin = 60, suspendues = [] } = {}) {
  const now = new Date(maintenant).getTime();
  const { debut, fin } = fenetreProgramme(jour);
  const paris = [], ecartes = [];
  const vus = new Set();
  const suivis = bookmakersSuivis(pays);
  const rangType = (c) => { const i = ORDRE_FAMILLES.indexOf(c.famille); return i < 0 ? 99 : i; };
  const tri = [...candidats].sort((a, b) => rangType(a) - rangType(b) || Date.parse(a.coup_envoi) - Date.parse(b.coup_envoi));
  for (const c of tri) {
    const fam = familleDeStrategie(c.famille);
    const label = matchTxt(c);
    // donnees = true : le pari n'a pas pu etre verifie jusqu'au bout (donnee manquante), ce n'est
    // PAS un refus de nos regles ; un jour sans pari ne dira alors jamais « aucun pari ne passe nos criteres ».
    const ecarte = (raison, donnees = false) => ecartes.push({ match: label, famille: fam || c.famille, raison, ...(donnees ? { donnees: true } : {}) });
    if (!fam) { ecarte("type de pari inconnu"); continue; }
    const ko = Date.parse(c.coup_envoi);
    const finF = c.fin_fenetre ? Date.parse(c.fin_fenetre) : fin.getTime();
    if (!(ko >= debut.getTime() && ko <= finF)) continue; // hors fenetre : un autre jour
    if (suspendues.includes(fam)) { ecarte("type de pari suspendu (règle d'arrêt)"); continue; }
    const jambes = estCombine(c) ? c.selections || [] : [c];
    if (!jambes.length || jambes.some((j) => !j.fixture_id)) { ecarte("match non relié aux résultats : il ne pourrait pas être réglé", true); continue; }
    if (ko - now < 30 * 60000) { ecarte("le match commence trop tôt"); continue; }
    let best = null, agrees = {};
    if (fam !== "buteur") {
      if (!c.releve_at || now - Date.parse(c.releve_at) > ageMaxMin * 60000) { ecarte("cote relevée il y a plus d'1 h", true); continue; }
      agrees = Object.fromEntries(Object.entries(cotesAgreees(c.cotes, pays)).filter(([bk]) => suivis.includes(bk)));
      best = meilleure(agrees);
      if (!best) { ecarte(estCombine(c) ? "aucun bookmaker agréé suivi ne propose toutes les sélections" : "aucune cote chez les bookmakers agréés suivis", true); continue; }
    }
    const cle = `${fam}|${jambes.map((j) => `${j.match_id || j.event_id || label}|${j.marche}`).join("+")}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const p = { famille: fam, event_id: c.event_id || null, sport_key: c.sport_key || null, fixture_id: c.fixture_id ?? null, ligue: c.ligue || "",
      dom: c.dom, ext: c.ext, coup_envoi: new Date(ko).toISOString(), fin_coup_envoi: new Date(Date.parse(c.fin_coup_envoi || c.coup_envoi)).toISOString(),
      marche: c.marche, ligne: c.ligne ?? null, proba: c.proba, source_proba: c.source_proba || null, cote_min: null,
      meilleure_cote: best ? best.cote : null, meilleur_bookmaker: best ? best.bookmaker : null, cotes: agrees, composantes: {},
      selections: c.selections || [], cote_vue_at: fam === "buteur" ? null : c.releve_at, regles: REGLES.version };
    p.selection = pariTxt(p);
    p.explication = explication(p);
    paris.push(p);
  }
  paris.forEach((p, i) => { p.rang = i + 1; });
  return { jour, paris, ecartes };
}
/**
 * Dernier controle avant publication : nouvel etat des cotes -> pari mis a jour (meilleure cote, et
 * pour un pari a plusieurs selections la cote prise de chaque selection chez ce bookmaker), ou raison
 * du retrait. La chance, elle, ne change pas (celle du moteur v3, figee a la preparation).
 * etat : etatMarche() pour un simple ; { jambes: [etatMarche()...] } pour un combine ou un ticket.
 */
export function controlePublication(p, etat, maintenant, pays = "FR") {
  // Publier seulement s'il reste le temps d'ecrire la preuve d'envoi avant l'heure limite (70 min avant le 1er match).
  if (!envoiPossible(p, maintenant)) return { raison: "match trop proche au moment de la publication" };
  if (p.famille === "buteur") return { maj: {} }; // pas de cote buteur : rien a relever (sans preuve)
  if (!etat) return { raison: "cote impossible à relever au moment de la publication" };
  const n = estCombine(p) ? (p.selections || []).length : 1;
  const etats = estCombine(p) ? etat.jambes || [] : [etat];
  if (etats.length !== n || etats.some((e) => !e)) return { raison: "cote impossible à relever au moment de la publication (une sélection manque)" };
  const verif = [];
  for (const e of etats) {
    if (!ok(e.pinnacle_proba)) return { raison: e.pinnacle_douteuse ? "cote Pinnacle douteuse au dernier contrôle (somme des 1/cote hors de la fourchette normale : erreur de cote probable)" : "plus de cote Pinnacle au dernier contrôle" };
    // Cotes des agrees suivis, SANS celles qui depassent de plus de 25 % la cote Pinnacle (coquille probable).
    const v = cotesVerifiees(e, pays);
    if (!Object.keys(v.cotes).length) return { raison: v.ecartees.length ? "cotes des agréés trop éloignées de celle de Pinnacle au dernier contrôle (erreur de cote probable)" : "plus aucune cote chez les agréés au dernier contrôle" };
    verif.push(v.cotes);
  }
  // Un pari a plusieurs selections se joue chez UN bookmaker qui les propose toutes.
  const bks = Object.keys(verif[0]).filter((bk) => verif.every((c) => ok(c[bk])));
  if (!bks.length) return { raison: "aucun bookmaker agréé ne propose toutes les sélections au dernier contrôle" };
  const cotes = Object.fromEntries(bks.map((bk) => [bk, n > 1 ? arrondi2(produit(verif.map((c) => c[bk]))) : verif[0][bk]]));
  const best = meilleure(cotes);
  const maj = { cotes, meilleure_cote: best.cote, meilleur_bookmaker: best.bookmaker, cote_vue_at: new Date(maintenant).toISOString() };
  if (estCombine(p)) maj.selections = p.selections.map((j, k) => ({ ...j, cote: verif[k][best.bookmaker] }));
  maj.explication = explication({ ...p, ...maj });
  return { maj };
}
const NOMS_PLURIEL = { simple: ["simple", "simples"], combine: ["combiné du jour", "combinés du jour"], buteur: ["même match avec buteur", "même match avec buteur"],
  fun10: ["ticket autour de 10", "tickets autour de 10"], fun25: ["ticket autour de 25", "tickets autour de 25"], reve: ["ticket 50-100 du mois", "tickets 50-100 du mois"] };
/** « 3 simples, 1 combiné du jour, 1 même match avec buteur ». */
export function compteFamilles(paris, lang = "fr") {
  const n = {};
  for (const p of paris) n[p.famille] = (n[p.famille] || 0) + 1;
  const noms = estFrancais(lang) ? NOMS_PLURIEL : textes(lang).pluriels;
  return ORDRE_FAMILLES.filter((f) => n[f]).map((f) => `${n[f]} ${noms[f][n[f] > 1 ? 1 : 0]}`).join(", ");
}
/** « N° PRO-12 » pour un pari publie ; en rodage, jamais de numero PRO. */
export function etiquette(p, lang = "fr") {
  if (!estFrancais(lang)) return p.numero ? `N° PRO-${p.numero}` : textes(lang).rodage(p.rang ?? "", p.jour ? dateLongue(String(p.jour).slice(0, 10), lang) : "").trim();
  return p.numero ? `N° PRO-${p.numero}` : `Rodage · pari ${p.rang ?? ""} du ${p.jour ? dateLongue(String(p.jour).slice(0, 10)) : ""}`.trim();
}
/** Heure d'une selection ; pour les tickets du week-end, avec le jour (« samedi 15 h »). */
function quandJambe(j, p, lang = "fr") {
  return p.famille === "combine" ? heureTxt(j.coup_envoi, lang) : `${nomJour(paris(j.coup_envoi).date, lang)} ${heureTxt(j.coup_envoi, lang)}`;
}
/** Version d'un pays (Espagne) d'un pari sans cote chez ses operateurs autorises : on le dit, jamais un operateur d'un autre pays. */
export const SANS_COTE_PAYS = "Cote : pas encore relevée chez les opérateurs autorisés dans ton pays.";
/**
 * Un pari vu depuis un pays dont les cotes sont relevees a part (PAYS_COTES_A_PART, ex. Espagne) : cotes et
 * meilleure cote chez les operateurs autorises de CE pays, lues dans les releves archives
 * (pro_cotes_releves, bookmaker « es:<cle> »), jusqu'a « jusqua » (ex. l'heure du releve de publication).
 * Sans cote dans ce pays : meilleure_cote = null (le message le dit, SANS_COTE_PAYS). France : le pari tel quel.
 */
export const prefixeReleve = (pays) => `${String(pays).toLowerCase()}:`;
export function pariDuPays(p, releves, pays, { jusqua = null } = {}) {
  if (!p || pays === "FR" || !PAYS_COTES_A_PART.includes(pays) || p.famille === "buteur") return p;
  const pre = prefixeReleve(pays), lim = jusqua ? Date.parse(jusqua) : Infinity;
  const rs = (releves || []).filter((r) => String(r.pari_id) === String(p.id) && String(r.bookmaker).startsWith(pre) && Date.parse(r.releve_at) <= lim);
  const n = estCombine(p) ? (p.selections || []).length : 1;
  const parJambe = Array.from({ length: n }, (_, k) => {
    const c = dernieresCotes(rs.filter((r) => (estCombine(p) ? Number(r.jambe) === k : r.jambe == null)));
    return Object.fromEntries(Object.entries(c).map(([bk, v]) => [bk.slice(pre.length), v]));
  });
  const bks = Object.keys(parJambe[0] || {}).filter((bk) => parJambe.every((c) => ok(c[bk])));
  const cotes = Object.fromEntries(bks.map((bk) => [bk, n > 1 ? arrondi2(produit(parJambe.map((c) => c[bk]))) : parJambe[0][bk]]));
  const best = meilleure(cotes);
  const vue = rs.map((r) => r.releve_at).sort().at(-1) || null;
  return { ...p, cotes, meilleure_cote: best?.cote ?? null, meilleur_bookmaker: best?.bookmaker ?? null, cote_vue_at: best ? vue : p.cote_vue_at,
    ...(estCombine(p) && best ? { selections: p.selections.map((j, k) => ({ ...j, cote: parJambe[k][best.bookmaker] })) } : {}),
    ...(estCombine(p) && !best ? { selections: p.selections.map((j) => ({ ...j, cote: null })) } : {}) };
}
/** Le message d'un pari : match, pari, chance calculee par IASHARK, cote. Rien d'autre (decision de Clement). */
function blocPari(p, { pays = "FR", lang = "fr" } = {}) {
  if (!estFrancais(lang)) return blocPariTraduit(p, pays, lang);
  const f = FAMILLES[p.famille] || { titre: String(p.famille || "").toUpperCase() };
  let t = `<b>${f.titre}</b>${f.plaisir ? ` · ${f.plaisir}` : ""}\n`;
  if (estCombine(p)) {
    if (p.famille !== "combine") t += "Matchs du week-end (vendredi à dimanche)\n";
    (p.selections || []).forEach((j, k) => {
      t += `${k + 1}. ${esc(j.ligue)}${j.ligue ? " · " : ""}${esc(j.dom)} – ${esc(j.ext)} · ${quandJambe(j, p)} : <b>${esc(j.selection || selectionTxt(j))}</b>${ok(Number(j.cote)) ? ` (${fr(Number(j.cote))})` : ""}\n`;
    });
  } else {
    t += `${esc(p.ligue)}${p.ligue ? " · " : ""}${esc(p.dom)} – ${esc(p.ext)} · ${heureTxt(p.coup_envoi)}\nSélection : <b>${esc(p.selection || pariTxt(p))}</b>\n`;
  }
  t += `${esc(chanceTxt(p))}\n`;
  if (p.famille === "buteur") t += SANS_PREUVE_BUTEUR;
  else if (!(Number(p.meilleure_cote) > 1)) t += SANS_COTE_PAYS; // version d'un pays (ex. Espagne) : pas de cote chez ses operateurs
  else if (p._ailleurs) t += `${estCombine(p) ? `Cote du ${p.famille === "combine" ? "combiné" : "ticket"}` : "Cote"} : ${p._ailleurs} · relevée à ${heureTxt(p.cote_vue_at)}`;
  else t += `${estCombine(p) ? `Cote du ${p.famille === "combine" ? "combiné" : "ticket"}` : "Cote"} : <b>${fr(Number(p.meilleure_cote))}</b> chez ${esc(nomBookmaker(p.meilleur_bookmaker, pays))}`
    + `${estCombine(p) ? " (toutes les sélections chez lui)" : ""} · relevée à ${heureTxt(p.cote_vue_at)}`;
  if (p.publie_at) t += `\n${etiquette(p)}`;
  return t;
}
/** blocPari dans une autre langue : memes champs du meme pari (chance, cote, bookmaker, heures), autres mots. */
function blocPariTraduit(p, pays, lang) {
  const L = textes(lang);
  const f = L.familles[p.famille] || { titre: String(p.famille || "").toUpperCase() };
  let t = `<b>${f.titre}</b>${f.plaisir ? ` · ${f.plaisir}` : ""}\n`;
  if (estCombine(p)) {
    if (p.famille !== "combine") t += `${L.weekend}\n`;
    (p.selections || []).forEach((j, k) => {
      t += `${k + 1}. ${esc(j.ligue)}${j.ligue ? " · " : ""}${esc(j.dom)} – ${esc(j.ext)} · ${quandJambe(j, p, lang)}: <b>${esc(selectionJambe(j, lang))}</b>${ok(Number(j.cote)) ? ` (${L.n(Number(j.cote))})` : ""}\n`;
    });
    t += `${L.perso.heures}\n`;
  } else {
    t += `${esc(p.ligue)}${p.ligue ? " · " : ""}${esc(p.dom)} – ${esc(p.ext)} · ${heureTxt(p.coup_envoi, lang)} ${L.tz}\n${L.pari}: <b>${esc(pariTxt(p, lang))}</b>\n`;
  }
  t += `${esc(chanceTxt(p, lang))}\n`;
  if (p.famille === "buteur") t += L.sansPreuveButeur;
  else if (!(Number(p.meilleure_cote) > 1)) t += L.sansCotePays;
  else if (p._ailleurs) t += `${L.cote(estCombine(p) ? (p.famille === "combine" ? "combine" : "ticket") : "simple")}: ${p._ailleurs} · ${L.relevee(heureTxt(p.cote_vue_at, lang))}`;
  else t += `${L.cote(estCombine(p) ? (p.famille === "combine" ? "combine" : "ticket") : "simple")}: <b>${L.n(Number(p.meilleure_cote))}</b> ${L.chez} ${esc(nomBookmaker(p.meilleur_bookmaker, pays))}`
    + `${estCombine(p) ? L.chezLui : ""} · ${L.relevee(heureTxt(p.cote_vue_at, lang))}`;
  if (p.publie_at) t += `\n${etiquette(p, lang)}`;
  return t;
}
/** Message prive a Clement : le programme a valider. Aucune note interne ne doit etre copiee ailleurs. */
export function messageValidation(prog, { rappel = false } = {}) {
  const paris = prog.paris.filter((p) => !p.retire);
  const retires = prog.paris.filter((p) => p.retire);
  let t = rappel ? "<b>Rappel : le programme attend ton clic.</b> Sans clic à 12 h, rien ne part aujourd'hui.\n\n" : "";
  t += `<b>Programme du ${dateLongue(prog.jour)} à valider</b>\n`;
  t += paris.length ? `${compteFamilles(paris)}${paris.length === 1 ? ". Journée calme : les abonnés Pro liront « un seul pari passe nos critères aujourd'hui. On ne force pas. »" : ""}\n\n`
    : `Aucun pari aujourd'hui. Si tu valides, les abonnés Pro recevront en privé : « ${MOTIFS_VIDE[motifVide(prog, prog.paris)]} »\n\n`;
  paris.forEach((p) => { t += `${p.rang}. ${blocPari({ ...p, publie_at: null })}\n\n`; });
  if (retires.length) t += `Retirés par toi : ${retires.map((p) => `${p.rang}. ${esc(matchTxt(p))}`).join(" ; ")}\n\n`;
  if (prog.ecartes?.length) {
    t += `Écartés (${prog.ecartes.length}) :\n` + prog.ecartes.slice(0, 8).map((e) => `• ${esc(e.match)} (${esc(FAMILLES[e.famille]?.nom || e.famille)}) : ${esc(e.raison)}${e.donnees ? " [donnée manquante, pas un refus de nos règles]" : e.info ? " [information]" : ""}`).join("\n")
      + (prog.ecartes.length > 8 ? `\n• et ${prog.ecartes.length - 8} autres` : "") + "\n\n";
  }
  const nonEv = prog.non_evalues || [];
  const faute = (prog.ecartes || []).filter((e) => e?.donnees).length; // ecartes faute de donnee
  if (prog.matchs_vus === 0) {
    t += "<b>Aucun match trouvé</b> dans nos championnats pour cette fenêtre (le moteur v3 n'en donne aucun). Normal un jour de trêve ou l'été ; sinon, c'est peut-être une panne : dans le doute, clique « Annuler ».\n\n";
  } else if (prog.matchs_vus != null || nonEv.length) {
    t += `Matchs examinés : ${prog.matchs_vus ?? "?"}.`
      + (nonEv.length ? ` <b>Non évalués (données incomplètes) : ${nonEv.length}</b> (${esc(resumeNonEvalues(nonEv))}). Ils ne sont pas comptés comme « ne passent pas nos critères ».` : "")
      + (faute ? ` <b>Paris écartés faute de donnée : ${faute}</b> (pas un refus de nos règles).` : "")
      + (!nonEv.length && !faute ? " Tous ont été évalués." : "")
      + "\n\n";
  }
  t += "Après ton clic : dernier contrôle des cotes, puis envoi en privé à chaque abonné Pro, dans sa langue, à 9 h 30 (ou dans le quart d'heure s'il est plus tard). Sans clic à 12 h, rien ne part.";
  return t.slice(0, 4000);
}
export function clavierValidation(prog, mode = "normal") {
  const j = prog.jour;
  if (mode === "modifier") {
    const rows = prog.paris.map((p) => [{ text: `${p.retire ? "Remettre" : "Retirer"} ${p.rang} · ${matchTxt(p)}`.slice(0, 60), callback_data: `pp:x:${j}:${p.rang}` }]);
    rows.push([{ text: "Valider", callback_data: `pp:ok:${j}` }, { text: "Retour", callback_data: `pp:ret:${j}` }]);
    return { inline_keyboard: rows };
  }
  return { inline_keyboard: [[{ text: "Valider", callback_data: `pp:ok:${j}` }, { text: "Modifier", callback_data: `pp:mod:${j}` }, { text: "Annuler", callback_data: `pp:no:${j}` }]] };
}
/** Matchs non evalues -> « pas de cotes des bookmakers agréés pour ce match : 2 ». */
export function resumeNonEvalues(liste) {
  const n = new Map();
  for (const x of liste || []) n.set(x.raison || "raison inconnue", (n.get(x.raison || "raison inconnue") || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([r, k]) => `${r} : ${k}`).join(" ; ");
}
/**
 * Programme du jour (envoye en prive a chaque abonne Pro, dans sa langue) : un en-tete, puis un bloc par pari.
 * motifVide (le seul texte public d'un jour sans pari, toujours vrai) :
 *   'regles'         tous les matchs examines ont ete verifies jusqu'au bout et aucun ne passe les criteres ;
 *   'regles_partiel' une partie des matchs n'a pas pu etre verifiee jusqu'au bout ;
 *   'aucun_match'    le moteur v3 ne donne aucun match de nos championnats pour la fenetre ;
 *   'controle'       tout a ete retire au dernier controle (raisons variees : texte neutre) ;
 *   'retires'        retires par Clement.
 * Jour creux (REGLE-VIP §6) : « On ne force pas. »
 */
export const MOTIFS_VIDE = {
  regles: "Aucun pari ne passe nos critères aujourd'hui. On ne force pas.",
  regles_partiel: "Aucun pari aujourd'hui : parmi les matchs que nous avons pu vérifier jusqu'au bout, aucun ne passe nos critères. Les autres n'ont pas pu être vérifiés (données incomplètes). On ne force pas.",
  aucun_match: "Aucun match de nos championnats n'a été trouvé pour ce programme (matchs de 12 h à demain 11 h 59) : pas de pari aujourd'hui.",
  controle: "Au dernier contrôle, aucun pari ne remplissait plus nos conditions : aucun pari aujourd'hui.",
  retires: "Pas de pari aujourd'hui.",
};
export const JOURNEE_CALME = "Journée calme : un seul pari passe nos critères aujourd'hui. On ne force pas.";
/**
 * Motif d'un jour sans pari (programme de la base + ses paris). « regles » seulement si TOUS les
 * matchs ont ete verifies jusqu'au bout : aucun non evalue, aucun ecart pour donnee manquante.
 */
export function motifVide(prog, parisJour = []) {
  if (!parisJour.length) {
    if (prog?.matchs_vus === 0) return "aucun_match";
    const incomplet = (prog?.non_evalues || []).length > 0 || (prog?.ecartes || []).some((e) => e?.donnees);
    return incomplet ? "regles_partiel" : "regles";
  }
  return parisJour.some((p) => !p.retire && !p.publie_at) ? "controle" : "retires";
}
export function messagesCanal(jour, paris, { pays = "FR", motifVide = "regles", lang = "fr" } = {}) {
  const actifs = paris.filter((p) => !p.retire);
  const suivis = bookmakersSuivis(pays).map((b) => nomBookmaker(b, pays)).join(", ");
  const weekend = actifs.some((p) => estCombine(p) && p.famille !== "combine");
  // Voie « cotes du marche » : l'en-tete le dit (chaque pari dit d'ou vient sa chance).
  const marche = actifs.some((p) => voieChance(p) !== "v3");
  if (!estFrancais(lang)) {
    const L = textes(lang);
    const tete = actifs.length
      ? L.tete(nomJour(jour, lang), compteFamilles(actifs, lang), actifs.length === 1, weekend, suivis) + (marche ? ` ${L.noteMarche}` : "")
      : L.teteVide(nomJour(jour, lang), L.motifs[motifVide] || L.motifs.retires);
    return { tete, paris: actifs.map((p) => ({ id: p.id, numero: p.numero, html: blocPari(p, { pays, lang }) })) };
  }
  const vide = MOTIFS_VIDE[motifVide] || MOTIFS_VIDE.retires;
  const tete = actifs.length
    ? `<b>Programme du ${nomJour(jour)}</b> · ${compteFamilles(actifs)}${actifs.length === 1 ? `\n${JOURNEE_CALME}` : ""}\n`
      + `Matchs de 12 h à demain 11 h 59${weekend ? " ; tickets du week-end : matchs de vendredi à dimanche" : ""}. Pour chaque pari : la chance calculée par IASHARK (moteur v3) et la meilleure cote relevée chez les bookmakers agréés que nous suivons (${suivis}).`
      + (marche ? ` ${NOTE_MARCHE}` : "")
    : `<b>Programme du ${nomJour(jour)}</b> · aucun pari\n${vide}`;
  return { tete, paris: actifs.map((p) => ({ id: p.id, numero: p.numero, html: blocPari(p, { pays }) })) };
}
/**
 * « Programme reporte ». etape = 'publication' : le programme est deja valide, le robot le publie
 * des que les cotes reviennent (avant les matchs). etape = 'preparation' : rien n'est prepare ; il
 * faut encore une preparation avant 12 h ET le clic de Clement : on ne promet donc rien.
 * cause = 'cotes' seulement quand c'est SUR (l'API des cotes a echoue) ; sinon 'donnees', texte
 * neutre (ex. API-Football en panne alors que les cotes sont la : jamais « les cotes manquent »).
 * A la publication, seule l'API des cotes est appelee : 'cotes' par defaut.
 */
const QUOI_REPORTE = {
  cotes: ["Les cotes des bookmakers ne sont pas disponibles pour l'instant", "cotes vérifiées"],
  donnees: ["Une partie de nos données n'est pas disponible pour l'instant", "données vérifiées"],
};
export const MESSAGE_REPORTE = (jour, etape = "publication", cause = etape === "publication" ? "cotes" : "donnees", lang = "fr") => {
  if (!estFrancais(lang)) return textes(lang).reporte(nomJour(jour, lang), etape, cause, PREUVE_LIMITE_MIN + ENVOI_MARGE_MIN);
  const [quoi, sans] = QUOI_REPORTE[cause] || QUOI_REPORTE.donnees;
  return `<b>Programme du ${nomJour(jour)} reporté</b>\n`
    + (etape === "preparation"
      ? `${quoi} : rien n'est préparé sans ${sans}. Si elles reviennent dans la matinée, le programme peut encore arriver ici ; sinon, il n'y a pas de programme aujourd'hui.`
      : `${quoi} : rien n'est publié sans ${sans}. Si elles reviennent à temps, le programme part, sans les matchs qui commencent dans moins de ${PREUVE_LIMITE_MIN + ENVOI_MARGE_MIN} min ; sinon, il n'y a pas de programme aujourd'hui.`);
};
/** Cause d'une erreur de preparation : 'cotes' seulement si l'erreur vient surement de l'API des cotes. */
export const causeReport = (e) => (/^(The Odds API|ODDS_API_KEY)/.test(String(e?.message || "")) ? "cotes" : "donnees");
/** Texte INTERNE (a Clement) : quelle source ne repond pas. La sortie du moteur v3 est lue AVANT les cotes. */
export function sourceEnPanne(e) {
  const m = String(e?.message || "");
  if (/^(The Odds API|ODDS_API_KEY)/.test(m)) return "l'API des cotes ne répond pas";
  if (/^Moteur v3/.test(m)) return "le moteur v3 n'a pas de sortie utilisable (aucune cote demandée : aucun crédit de cotes dépensé)";
  if (/^(API-Football|APISPORTS_KEY)/.test(m)) return "API-Football ne répond pas (aucune cote demandée : aucun crédit de cotes dépensé)";
  return "une de nos sources de données ne répond pas";
}

// ------------------------------------------------------------------ preferences de l'abonne
// CONTRAT (source de verite pour les autres branches : migration 0040 et
// CONTRAT-TABLES-PRO.md) : table public.pro_preferences, une ligne par abonne,
// ecrite par le site (formulaire de l'espace Pro, l'abonne sur SA ligne), lue
// par le robot (cle de service). Colonnes :
//   pays text ('fr' | 'be' | 'ch' | 'es' | 'gb' | 'mx' | 'za' | 'autre') ; seul 'fr' est ouvert
//   (be, ch, es : migration 0044, aucun bookmaker : pays pas encore ouvert) ;
//   bookmakers text[] (cles de BOOKMAKERS_AGREES du pays : 'betclic', 'netbet'…) ;
//   strategie text ('iashark' | 'perso') ; familles text[] ('simple', 'combine', 'buteur', 'fun') ;
//   (les anciennes cles 'sure', 'valeur', 'nuls' sont ignorees : formulaire de l'espace Pro a mettre a jour) ;
//   cote_min_perso numeric ; limite_paris_jour int 0..50 (0 = plus rien de la journee) ;
//   programme_prive boolean ; alertes text[] parmi ('seuil','hausse','compositions','meteo','nuit') ;
//   heure_envoi smallint 8..22 ou null (0044) : heure de Paris a partir de laquelle part le
//   programme du matin (null = des sa publication ; scripts/canal-pro/taches.mjs#messagesPersonnels) ;
//   marches text[] (0044) : types de paris mis en avant sur le site, jamais lus par le robot.
// UNE SEULE SOURCE (contre-controle ronde 4) : les clics de /reglages dans le robot ecrivent
// AUSSI dans pro_preferences (appliquerReglage). telegram_abonnes.reglages n'est plus lu : un
// ancien clic « Garde-fou +1 » ne passe plus jamais par-dessus la limite reglee sur le site.
// Pas de ligne = valeurs par defaut.
export const ALERTES = ["seuil", "hausse", "compositions", "meteo", "nuit"];
export const PREFS_DEFAUT = Object.freeze({
  pays: "FR", bookmakers: [], strategie: "iashark", familles: ["simple", "combine", "buteur", "fun"], cote_min_perso: null,
  limite_paris_jour: 5, programme_prive: true,
  alertes: Object.freeze({ seuil: true, hausse: true, compositions: true, meteo: true, nuit: false }),
});
const bool = (v, d) => (typeof v === "boolean" ? v : d);
/**
 * DECISION CLEMENT (reglage telegram_settings « pays_sans_formulaire ») : un abonne SANS ligne
 * pro_preferences (formulaire pas rempli) est-il traite comme francais ? 'fr' ou absent (defaut,
 * comme aujourd'hui) : oui. 'aucun' (option la plus prudente, eteinte) : pays inconnu, aucun
 * bookmaker montre tant qu'il n'a pas donne son pays. Reversible a tout moment.
 */
export const PAYS_INCONNU = "INCONNU";
export const paysParDefaut = (reglage) => (String(reglage || "").toLowerCase() === "aucun" ? null : PREFS_DEFAUT.pays);
/** Ligne pro_preferences (ou rien) -> reglages effectifs. Une seule source : pro_preferences. */
export function preferencesEffectives(formulaire, { paysDefaut = PREFS_DEFAUT.pays } = {}) {
  const f = formulaire || {};
  const pick = (...v) => v.find((x) => x !== undefined && x !== null);
  const pays = String(pick(f.pays, paysDefaut) ?? PAYS_INCONNU).toUpperCase();
  const agr = (BOOKMAKERS_AGREES[pays] || []).map((b) => b.cle), suivis = bookmakersSuivis(pays);
  const bk = pick(f.bookmakers, []);
  const choisis = (Array.isArray(bk) ? bk : []).filter((x) => agr.includes(x));
  // Liste des alertes voulues (text[]).
  const af = Array.isArray(f.alertes) ? Object.fromEntries(ALERTES.map((k) => [k, f.alertes.includes(k)])) : {};
  const alertes = {};
  for (const k of ALERTES) alertes[k] = bool(af[k], PREFS_DEFAUT.alertes[k]);
  // Choix de la strategie et des types de paris retires (03/10/2026, decision de Clement) : memes paris pour tous.
  const competitions = [...new Set([].concat(pick(f.competitions, []) || []).map(cleCompetition).filter(Boolean))];
  const lim = Number(pick(f.limite_paris_jour, PREFS_DEFAUT.limite_paris_jour));
  const h = Number(pick(f.heure_envoi));
  return {
    pays,
    bookmakers: choisis.filter((x) => suivis.includes(x)),
    bookmakers_non_suivis: choisis.filter((x) => !suivis.includes(x)),
    strategie: "iashark",
    familles: [...PREFS_DEFAUT.familles],
    competitions,
    cote_min_perso: null,
    limite_paris_jour: Number.isInteger(lim) && lim >= 0 && lim <= 50 ? lim : PREFS_DEFAUT.limite_paris_jour,
    programme_prive: bool(pick(f.programme_prive), true),
    alertes,
    heure_envoi: Number.isInteger(h) && h >= 8 && h <= 22 ? h : null,
  };
}
/** Garde-fou : limite atteinte (0 = plus rien aujourd'hui). S'applique a TOUS les envois personnels. */
export function gardeFouAtteint(prefs, notes) {
  return Number.isInteger(prefs.limite_paris_jour) && notes >= prefs.limite_paris_jour;
}
/** Les bookmakers de l'abonne (parmi ceux que nous suivons) ; s'il n'en a coche aucun : tous les suivis de son pays. */
export function sesBookmakers(prefs) {
  return prefs.bookmakers.length ? prefs.bookmakers : bookmakersSuivis(prefs.pays);
}
/**
 * Un pari vu par un abonne : le MEME pari pour tous (03/10/2026, decision de Clement : aucun filtre par
 * competition ni par type) ; « chez » = sa meilleure cote chez SES bookmakers (de son pays).
 */
export function pariPourAbonne(p, prefs) {
  const chez = p.famille === "buteur" ? null : meilleure(p.cotes, sesBookmakers(prefs));
  return { ...p, chez };
}
/**
 * Un pari tel que l'abonne le lit : la cote affichee est SA meilleure cote (ses bookmakers) ; s'ils ne le
 * proposent pas, la meilleure ailleurs dans son pays (« ailleurs »). Pays inconnu ou pas ouvert : aucune cote.
 */
function pariAffiche(p, prefs) {
  if (!BOOKMAKERS_AGREES[prefs.pays]) return { ...p, meilleure_cote: null, meilleur_bookmaker: null };
  if (p.famille === "buteur" || !(Number(p.meilleure_cote) > 1)) return p;
  const x = pariPourAbonne(p, prefs);
  // Combine chez un autre bookmaker que le meilleur : la cote de chaque selection chez lui n'est pas connue ici (pas affichee).
  if (x.chez) return { ...p, meilleure_cote: x.chez.cote, meilleur_bookmaker: x.chez.bookmaker,
    ...(estCombine(p) && x.chez.bookmaker !== p.meilleur_bookmaker ? { selections: (p.selections || []).map((j) => ({ ...j, cote: null })) } : {}) };
  return { ...p, _ailleurs: true };
}
/**
 * LE message du programme du jour d'un abonne (03/10/2026) : UN seul message, les MEMES paris et les MEMES
 * chances pour tous ; pour lui : son prenom, sa langue, la meilleure cote chez SES bookmakers (de son pays).
 * Jour sans pari : le motif (toujours vrai, comme le programme commun). infos : section « Aujourd'hui dans
 * tes competitions » (sectionCompetitions), ajoutee par l'appelant.
 */
export function messageProgrammeAbonne(jour, paris, prefs, { lang = "fr", prenom = "", motifVide = "regles", tete = true, avant = "" } = {}) {
  const S = surMesure(lang), fra = estFrancais(lang);
  const actifs = paris.filter((p) => !p.retire);
  const pre = prenom ? esc(prenom) : "";
  const jourTxt = nomJour(jour, lang);
  if (!actifs.length) {
    if (!tete) return "";
    const motif = fra ? MOTIFS_VIDE[motifVide] || MOTIFS_VIDE.retires : textes(lang).motifs[motifVide] || textes(lang).motifs.retires;
    return S.teteVide(pre, jourTxt, motif);
  }
  const ouvert = !!BOOKMAKERS_AGREES[prefs.pays];
  const tes = prefs.bookmakers.length > 0;
  const bks = sesBookmakers(prefs).map((b) => nomBookmaker(b, prefs.pays)).join(", ");
  const weekend = actifs.some((p) => estCombine(p) && p.famille !== "combine");
  const marche = actifs.some((p) => voieChance(p) !== "v3");
  const compte = compteFamilles(actifs, lang);
  let t = avant || "";
  if (tete) {
    t += ouvert ? S.tete(pre, jourTxt, compte, actifs.length === 1, weekend, esc(bks), tes) : S.teteSansPays(pre, jourTxt, compte);
    if (marche) t += ` ${fra ? NOTE_MARCHE : textes(lang).noteMarche}`;
  }
  for (const p of actifs) {
    const x = pariAffiche(p, prefs);
    // Pas propose chez SES bookmakers : on le dit, avec la meilleure cote ailleurs dans son pays.
    if (x._ailleurs) x._ailleurs = S.ailleurs(fra ? fr(Number(p.meilleure_cote)) : textes(lang).n(Number(p.meilleure_cote)), esc(nomBookmaker(p.meilleur_bookmaker, prefs.pays)));
    t += `${t ? "\n\n" : ""}${blocPari(x, { pays: ouvert ? prefs.pays : "FR", lang })}`;
  }
  return t;
}
/** Ancien nom (robot /programme, tests) : le programme de l'abonne. */
export const messageProgrammePerso = (jour, paris, prefs, { prenom = "", lang = "fr", motifVide = "regles" } = {}) => messageProgrammeAbonne(jour, paris, prefs, { prenom, lang, motifVide });

// ------------------------------------------------------------------ competitions preferees : information seulement
/** Langue -> repertoire du site (versions publiees : fr, es, en). */
const DIR_SITE = { fr: "fr", es: "es", en: "en", de: "en", it: "en", pt: "en" };
export const SITE = "https://iashark.com";
/**
 * Lien vers l'analyse d'un match sur le site, dans la langue de l'abonne : page statique quand le pipeline
 * l'a ecrite (page_dirs, comme lib/telegram-posts.js#lienMatch), sinon la page dynamique (repli).
 */
export function lienAnalyse(m, lang = "fr") {
  const dir = DIR_SITE[estFrancais(lang) ? "fr" : textes(lang).code] || "fr";
  const id = String(m?.id ?? "");
  if (!/^\d{1,12}$/.test(id)) return null;
  const pages = Array.isArray(m.dirs) ? m.dirs : [];
  if (pages.includes(dir)) return `${SITE}${dir === "fr" ? "" : "/" + dir}/match/${id}.html`;
  return `${SITE}/${dir}/match.html?id=${id}`;
}
/**
 * Matchs du site (data.json, data-home.json du pipeline) -> matchs des competitions de la liste, dans la
 * fenetre (pas commences) : [{ cle, id, dom, ext, ko, dirs }]. Aucune autre source.
 */
export function matchsDesCompetitions(matchsSite, debut, fin) {
  const d = new Date(debut).getTime(), f = new Date(fin).getTime();
  const nom = (e) => (e && typeof e === "object" ? e.n || e.name : e) || "";
  const out = [];
  for (const m of matchsSite || []) {
    const cle = cleParApi(m?.league_id) || (COMPETITIONS[m?.league_key] ? m.league_key : null);
    if (!cle || !m.id || (m.status && m.status !== "NS")) continue;
    const ko = m.kickoff_utc ? Date.parse(m.kickoff_utc) : m.date ? parisVersDate(String(m.date).slice(0, 10), String(m.date).slice(11, 16)).getTime() : NaN;
    if (!isFinite(ko) || ko < d || ko > f) continue;
    out.push({ cle, id: Number(m.id), dom: nom(m.home), ext: nom(m.away), ko: new Date(ko).toISOString(), ...(Array.isArray(m.page_dirs) ? { dirs: m.page_dirs } : {}) });
  }
  return out.sort((a, b) => Date.parse(a.ko) - Date.parse(b.ko));
}
/**
 * Registre des pages match du pipeline (data/match-pages-registry.json : coup d'envoi, ligue, score final)
 * -> resultats des competitions de la liste joues dans la fenetre : [{ cle, id, dom, ext, ko, score }].
 * Score inconnu : le match n'est pas cite (jamais de score invente).
 */
export function resultatsDesCompetitions(registre, debut, fin) {
  const d = new Date(debut).getTime(), f = new Date(fin).getTime();
  const nom = (e) => (e && typeof e === "object" ? e.n || e.name : e) || "";
  const out = [];
  for (const [id, e] of Object.entries(registre?.matches || {})) {
    const cle = COMPETITIONS[e?.league_key] ? e.league_key : cleParApi(e?.snapshot?.league_id);
    const ko = Date.parse(e?.kickoff);
    const sc = e?.final_score;
    if (!cle || !isFinite(ko) || ko < d || ko > f || !sc || !Number.isInteger(sc.home) || !Number.isInteger(sc.away)) continue;
    const dom = nom(e.snapshot?.home), ext = nom(e.snapshot?.away);
    if (!dom || !ext) continue;
    out.push({ cle, id: Number(id), dom, ext, ko: new Date(ko).toISOString(), score: [sc.home, sc.away] });
  }
  return out.sort((a, b) => Date.parse(a.ko) - Date.parse(b.ko));
}
const MAX_LIGNES_INFOS = 20;
/**
 * Section « Aujourd'hui dans tes competitions » (genre « jour » : heure + lien vers l'analyse, matchs pas
 * encore commences a « maintenant ») ou « Hier dans tes competitions » (genre « hier » : scores). Pour
 * l'information seulement : ni pari, ni chance. Rien si l'abonne n'a pas choisi de competitions (« toutes ») ou
 * si elles n'ont pas de match.
 */
export function sectionCompetitions(infos, prefs, { lang = "fr", maintenant = Date.now() } = {}) {
  const mes = prefs?.competitions || [];
  if (!infos || !Array.isArray(infos.matchs) || !mes.length) return "";
  const S = surMesure(lang), fra = estFrancais(lang);
  const hier = infos.genre === "hier";
  const now = new Date(maintenant).getTime();
  const ms = infos.matchs.filter((m) => mes.includes(m.cle) && (hier || Date.parse(m.ko) > now));
  if (!ms.length) return "";
  const ordre = COMPETITIONS_PRO.map((c) => c.cle);
  const cles = [...new Set(ms.map((m) => m.cle))].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
  let t = `<b>${hier ? S.infosHier : S.infosJour}</b>${!hier && !fra ? ` ${textes(lang).tz}` : ""} · ${S.infosNote}`;
  let n = 0;
  for (const cle of cles) {
    const lignes = ms.filter((m) => m.cle === cle);
    if (n >= MAX_LIGNES_INFOS) break;
    t += `\n<i>${esc(nomCompetition(cle, lang))}</i>`;
    for (const m of lignes) {
      if (n >= MAX_LIGNES_INFOS) break;
      n++;
      if (hier) t += `\n• ${esc(m.dom)} ${m.score[0]}-${m.score[1]} ${esc(m.ext)}`;
      else {
        const lien = lienAnalyse(m, lang);
        t += `\n• ${heureTxt(m.ko, lang)} · ${esc(m.dom)} – ${esc(m.ext)}${lien ? ` · <a href="${esc(lien)}">${S.analyse}</a>` : ""}`;
      }
    }
  }
  if (ms.length > n) t += `\n${S.autres(ms.length - n)}`;
  return t;
}

// ------------------------------------------------------------------ alertes de cotes
/** Derniere cote de chaque bookmaker (releves tries du plus ancien au plus recent). */
export function dernieresCotes(releves) {
  const out = {};
  for (const r of [...releves].sort((a, b) => Date.parse(a.releve_at) - Date.parse(b.releve_at))) out[r.bookmaker] = Number(r.cote);
  return out;
}
/**
 * Alertes d'un SIMPLE pour un abonne : { type, texte } (au plus 1 de chaque type par pari, garanti par
 * l'appelant). Seulement des faits de cote (baisse, hausse de 0,05 ou plus chez SES bookmakers) : aucun
 * seuil ni calcul. Rien la nuit (sauf choix), rien apres la limite du garde-fou.
 */
export function alertesCote(p, cotesNow, prefs, dejaEnvoyees = new Set(), { maintenant = Date.now(), notesAujourdhui = 0, dejaJoue = false, douteuses = [], lang = "fr" } = {}) {
  const out = [];
  if (p.famille !== "simple" || dejaJoue) return out;
  if (!prefs.alertes.nuit && estLaNuit(maintenant)) return out;
  if (gardeFouAtteint(prefs, notesAujourdhui)) return out;
  if (Date.parse(p.coup_envoi) <= maintenant) return out;
  if (!BOOKMAKERS_AGREES[prefs.pays]) return out; // pays inconnu ou pas ouvert : aucun bookmaker montre
  const x = pariPourAbonne(p, prefs); if (!x) return out;
  const mes = sesBookmakers(prefs);
  // Cote d'un de SES bookmakers ecartee a ce releve (trop loin de Pinnacle, ou Pinnacle absent) : aucune alerte.
  if (mes.some((b) => douteuses.includes(b))) return out;
  const avant = meilleure(p.cotes, mes), maint = meilleure(cotesNow, mes);
  const match = `${esc(p.dom)} – ${esc(p.ext)}`, nom = (b) => esc(nomBookmaker(b, prefs.pays)), sel = esc(p.selection);
  const ailleurs = meilleure(Object.fromEntries(Object.entries(cotesNow).filter(([bk]) => !mes.includes(bk))));
  if (!estFrancais(lang)) {
    const L = textes(lang), sl = esc(pariTxt(p, lang));
    if (prefs.alertes.seuil && avant && (!maint || maint.cote <= avant.cote - 0.05 + 1e-9) && !dejaEnvoyees.has("seuil"))
      out.push({ type: "seuil", texte: L.alerte.baisse(sl, match, L.n(avant.cote), maint ? L.n(maint.cote) : null, maint ? nom(maint.bookmaker) : null)
        + (ailleurs && (!maint || ailleurs.cote > maint.cote) ? L.alerte.ailleurs(L.n(ailleurs.cote), nom(ailleurs.bookmaker)) : "") });
    if (prefs.alertes.hausse && avant && maint && maint.cote >= avant.cote + 0.05 - 1e-9 && !dejaEnvoyees.has("hausse"))
      out.push({ type: "hausse", texte: L.alerte.hausse(sl, match, L.n(avant.cote), L.n(maint.cote), nom(maint.bookmaker)) });
    return out;
  }
  if (prefs.alertes.seuil && avant && (!maint || maint.cote <= avant.cote - 0.05 + 1e-9) && !dejaEnvoyees.has("seuil")) {
    out.push({ type: "seuil", texte: `<b>Cote en baisse</b> : ${sel} (${match}) ${maint ? `est passé de ${fr(avant.cote)} à ${fr(maint.cote)} chez ${nom(maint.bookmaker)}` : "n'est plus coté chez tes bookmakers"}.`
      + (ailleurs && (!maint || ailleurs.cote > maint.cote) ? ` Ailleurs : ${fr(ailleurs.cote)} chez ${nom(ailleurs.bookmaker)}, si tu y as un compte.` : "") });
  }
  if (prefs.alertes.hausse && avant && maint && maint.cote >= avant.cote + 0.05 - 1e-9 && !dejaEnvoyees.has("hausse")) {
    out.push({ type: "hausse", texte: `La cote de ${sel} (${match}) est montée de ${fr(avant.cote)} à ${fr(maint.cote)} chez ${nom(maint.bookmaker)}.` });
  }
  return out;
}

// ------------------------------------------------------------------ compositions
/**
 * Voyant de composition. entree = { statut_match, equipes: [{ nom, titulaires:[ids], remplacants:[ids], formation, precedent:{ titulaires:[ids], formation } }] }.
 * CONFIRMÉ : comparaison faite, rien de notable. À SURVEILLER : 5 changements ou plus, ou systeme change.
 * RETIRÉ : match reporte ou annule. PUBLIÉE : composition publiee mais comparaison impossible (jamais « CONFIRMÉ » sans comparaison).
 */
// Chaque voyant garde aussi ses faits (« faits ») : la raison est reecrite dans la langue de l'abonne (raisonVoyant).
export function voyantComposition(entree) {
  if (["PST", "CANC", "ABD", "SUSP"].includes(entree.statut_match)) return { voyant: "RETIRÉ", raison: "Le match est reporté ou annulé : le pari ne tient plus.", faits: { retire: true } };
  const notes = [], sans = [], faits = [];
  let compare = 0;
  for (const e of entree.equipes || []) {
    if (!e.precedent?.titulaires?.length || !e.titulaires?.length) { sans.push(e.nom); continue; }
    compare++;
    const ch = e.titulaires.filter((id) => !e.precedent.titulaires.includes(id)).length;
    if (ch >= 5) { notes.push(`${e.nom} change ${ch} titulaires par rapport à son dernier match`); faits.push({ type: "changements", nom: e.nom, n: ch }); }
    else if (e.formation && e.precedent.formation && e.formation !== e.precedent.formation) { notes.push(`${e.nom} passe de ${e.precedent.formation} à ${e.formation}`); faits.push({ type: "systeme", nom: e.nom, de: e.precedent.formation, a: e.formation }); }
  }
  if (notes.length) return { voyant: "À SURVEILLER", raison: notes.join(" ; ") + ". Le pari reste, à toi de décider.", faits: { notes: faits } };
  if (!compare) return { voyant: "PUBLIÉE", raison: "Composition officielle publiée. Comparaison impossible avec le match précédent.", faits: {} };
  return { voyant: "CONFIRMÉ", raison: "Rien de notable dans les compositions." + (sans.length ? ` (Comparaison impossible pour ${sans.join(", ")}.)` : ""), faits: { sans } };
}
/** Meme match avec buteur : le joueur est-il titulaire ? */
export function voyantButeur(p, entree) {
  if (["PST", "CANC", "ABD", "SUSP"].includes(entree.statut_match)) return { voyant: "RETIRÉ", raison: "Le match est reporté ou annulé : le pari ne tient plus." };
  const b = p.selections?.[0] || {}, id = Number(b.joueur_id);
  const dans = (cle) => (entree.equipes || []).some((e) => (e[cle] || []).map(Number).includes(id));
  if (!id) return { voyant: "PUBLIÉE", raison: "Composition officielle publiée.", faits: { court: true } };
  if (dans("titulaires")) return { voyant: "CONFIRMÉ", raison: `${b.joueur} est titulaire.`, faits: { joueur: b.joueur, etat: "titulaire" } };
  if (dans("remplacants")) return { voyant: "À SURVEILLER", raison: `${b.joueur} commence sur le banc. Le pari reste, à toi de décider.`, faits: { joueur: b.joueur, etat: "banc" } };
  return { voyant: "À SURVEILLER", raison: `${b.joueur} n'est pas sur la feuille de match. Le pari reste, à toi de décider.`, faits: { joueur: b.joueur, etat: "absent" } };
}
/** Raison d'un voyant dans une langue (le francais : la raison d'origine). Sans faits : la raison francaise. */
export function raisonVoyant(v, lang = "fr") {
  if (estFrancais(lang) || !v.faits) return v.raison;
  const K = textes(lang).compo, f = v.faits;
  if (f.retire) return K.retire;
  if (f.notes?.length) return f.notes.map((x) => (x.type === "changements" ? K.changements(x.nom, x.n) : K.systeme(x.nom, x.de, x.a))).join("; ") + "." + K.decider;
  if (f.etat === "titulaire") return K.titulaire(f.joueur);
  if (f.etat) return K[f.etat](f.joueur) + K.decider;
  if (f.court) return K.publieeCourt;
  if (v.voyant === "PUBLIÉE") return K.publiee;
  return K.confirme + (f.sans?.length ? K.sans(f.sans.join(", ")) : "");
}
export const voyantTxt = (v, lang = "fr") => (estFrancais(lang) ? v.voyant : textes(lang).voyants[v.voyant] || v.voyant);
export function messageComposition(p, v, cotesNow, pays = "FR", lang = "fr") {
  const b = meilleure(cotesNow);
  if (!estFrancais(lang)) {
    const K = textes(lang).compo;
    let t = K.canal(etiquette(p, lang), voyantTxt(v, lang), esc(raisonVoyant(v, lang)));
    if (v.voyant !== "RETIRÉ" && b && p.famille === "simple") t += K.coteMaint(textes(lang).n(b.cote), esc(nomBookmaker(b.bookmaker, pays)));
    return t;
  }
  let t = `${etiquette(p)} · Composition <b>${v.voyant}</b>. ${esc(v.raison)}`;
  if (v.voyant !== "RETIRÉ" && b && p.famille === "simple") t += `\nCote relevée maintenant : ${fr(b.cote)} chez ${esc(nomBookmaker(b.bookmaker, pays))}.`;
  return t;
}

/** Message personnel de composition (« chez toi » = meilleure cote chez SES bookmakers, calculee par l'appelant). */
export function messageCompositionPerso(p, v, mes, pays = "FR", lang = "fr") {
  if (!estFrancais(lang)) {
    const L = textes(lang), K = L.compo;
    // Heure dans une parenthese : « 16:00, hora de París » (jamais deux parentheses imbriquees).
    return K.perso(esc(matchTxt(p, lang)), `${heureTxt(p.coup_envoi, lang)}${L.tz ? `, ${L.tz.replace(/[()]/g, "")}` : ""}`, voyantTxt(v, lang), esc(raisonVoyant(v, lang)))
      + (mes && v.voyant !== "RETIRÉ" ? K.chezToi(L.n(mes.cote), esc(nomBookmaker(mes.bookmaker, pays))) : "");
  }
  return `${esc(matchTxt(p))} (${heureTxt(p.coup_envoi)}) : composition <b>${v.voyant}</b>. ${esc(v.raison)}`
    + (mes && v.voyant !== "RETIRÉ" ? `\nChez toi : ${fr(mes.cote)} chez ${esc(nomBookmaker(mes.bookmaker))}.` : "");
}

// ------------------------------------------------------------------ meteo
/** Prevision OpenWeather (element de /forecast) -> phrase si la meteo est forte, sinon null. */
export function meteoForte(f, lang = "fr") {
  if (!f) return null;
  const mots = [];
  const W = estFrancais(lang) ? { orages: "orages", neige: "neige", pluie: "forte pluie", vent: (v) => `vent à ${v} km/h`, chaleur: (t) => `grosse chaleur (${t} °C)`, et: " et " } : textes(lang).meteo;
  const pluie3h = f.rain?.["3h"] ?? 0, neige = f.snow?.["3h"] ?? 0, vent = (f.wind?.speed ?? 0) * 3.6, temp = f.main?.temp, orage = (f.weather || []).some((w) => w.main === "Thunderstorm");
  if (orage) mots.push(W.orages);
  if (neige >= 1) mots.push(W.neige);
  if (pluie3h >= 7.5) mots.push(W.pluie);
  if (vent >= 40) mots.push(W.vent(Math.round(vent)));
  if (ok(temp) && temp >= 32) mots.push(W.chaleur(Math.round(temp)));
  return mots.length ? mots.join(", ").replace(/, ([^,]*)$/, `${W.et}$1`) : null;
}
export function messageMeteo(p, ville, phrase, lang = "fr") {
  if (!estFrancais(lang)) { const L = textes(lang); return L.meteo.message(esc(ville), `${esc(p.dom)} – ${esc(p.ext)}`, `${heureTxt(p.coup_envoi, lang)}${L.tz ? ` ${L.tz.replace(/[()]/g, "")}` : ""}`, esc(phrase)); }
  return `Météo prévue à ${esc(ville)} (${esc(p.dom)} – ${esc(p.ext)}, ${heureTxt(p.coup_envoi)}) : ${esc(phrase)}. C'est une information : ton pari reste le même.`;
}

// ------------------------------------------------------------------ reglement
function ahSettle(marge, ligne) {
  const q = Math.round(ligne * 4), quart = Math.abs(q) % 2 === 1;
  const ls = quart ? [ligne - 0.25, ligne + 0.25] : [ligne, ligne];
  let w = 0, l = 0;
  for (const x of ls) { const r = marge + x; w += 0.5 * (r > 1e-9); l += 0.5 * (r < -1e-9); }
  return [w, l];
}
/** (part gagnee, part perdue) — portage de regles.py#issue. */
export function issue(marche, ligne, bd, be) {
  const t = bd + be;
  const x = (c) => (c ? [1, 0] : [0, 1]);
  switch (marche) {
    case "1": return x(bd > be); case "2": return x(be > bd); case "N": return x(bd === be);
    case "1X": return x(bd >= be); case "X2": return x(be >= bd); case "12": return x(bd !== be);
    case "O25": return x(t > 2.5); case "U25": return x(t < 2.5);
    case "AHH": return ahSettle(bd - be, Number(ligne)); case "AHA": return ahSettle(be - bd, Number(ligne));
  }
  throw new Error(`marche inconnu : ${marche}`);
}
export function resultatPari(p, bd, be) {
  const [w, l] = issue(p.marche, p.ligne, bd, be);
  if (w === 1) return "gagne"; if (l === 1) return "perdu";
  if (w === 0 && l === 0) return "rembourse";
  return w > l ? "moitie_gagne" : "moitie_perdu";
}
/**
 * Pari a plusieurs selections (matchs differents) : resultat de chaque selection -> resultat du pari.
 * Une selection dont le match est reporte ou annule est retiree du pari (comptee a 1,00, pratique
 * courante des bookmakers : A CONFIRMER PAR LE TRADER DE COTES) ; toutes retirees = pari retire.
 */
export function resultatCombine(resultats) {
  if (resultats.some((r) => r === "perdu")) return "perdu";
  const restants = resultats.filter((r) => r !== "annule");
  if (!restants.length) return "annule";
  return restants.every((r) => r === "gagne") ? "gagne" : "perdu";
}
/** Meme match avec buteur : le favori gagne ET le joueur marque (a n'importe quel moment). Le joueur n'a pas joue : rembourse. */
export function resultatButeur(p, bd, be, { marque = false, a_joue = null } = {}) {
  const b = p.selections?.[0] || {};
  if (a_joue === false) return "rembourse";
  const gagne = b.cote_equipe === "2" ? be > bd : bd > be;
  return gagne && marque ? "gagne" : "perdu";
}
const MOT_RESULTAT = { gagne: "gagné", perdu: "perdu", rembourse: "remboursé", moitie_gagne: "à moitié gagné", moitie_perdu: "à moitié perdu", retire: "retiré", annule: "retiré (match reporté)" };
/** Faits du match (API-Football /fixtures/statistics) -> phrase courte, sans excuse inventee. */
export function faitsDuMatch(p, faits, lang = "fr") {
  if (!faits || estCombine(p)) return "";
  const d = faits.dom || {}, e = faits.ext || {};
  const bouts = [];
  if (!estFrancais(lang)) {
    const L = textes(lang), F = L.faits;
    const x = (s) => [ok(s.xg) && F.xg(L.n(s.xg, 1)), ok(s.tirs) && F.tirs(s.tirs)].filter(Boolean).join(F.et);
    if (x(d)) bouts.push(F.aEu(p.dom, x(d)));
    if (x(e)) bouts.push(bouts.length ? F.deux(p.ext, x(e)) : F.aEu(p.ext, x(e)));
    if (ok(e.arrets) && e.arrets >= 5) bouts.push(F.arrets(p.ext, e.arrets));
    if (ok(d.arrets) && d.arrets >= 5) bouts.push(F.arrets(p.dom, d.arrets));
    return bouts.length ? " " + bouts.join(", ").replace(/^./, (c) => c.toUpperCase()) + "." : "";
  }
  const eq = (nom, s) => {
    const x = [];
    if (ok(s.xg)) x.push(`${fr(s.xg, 1)} buts attendus`);
    if (ok(s.tirs)) x.push(`${s.tirs} tirs`);
    return x.length ? `${nom} a eu ${x.join(" et ")}` : "";
  };
  const a = eq(p.dom, d), b = eq(p.ext, e);
  if (a) bouts.push(a); if (b) bouts.push(b.replace(" a eu ", " : "));
  if (ok(e.arrets) && e.arrets >= 5) bouts.push(`le gardien de ${p.ext} a fait ${e.arrets} arrêts`);
  if (ok(d.arrets) && d.arrets >= 5) bouts.push(`le gardien de ${p.dom} a fait ${d.arrets} arrêts`);
  return bouts.length ? " " + bouts.join(", ").replace(/^./, (c) => c.toUpperCase()) + "." : "";
}
/** Une ligne de debrief pour un pari regle. */
function ligneDebrief(p, lang = "fr") {
  if (!estFrancais(lang)) {
    const L = textes(lang), R = L.resultats;
    const mot = R[p.resultat] || p.resultat;
    const cote = ["retire", "annule"].includes(p.resultat) || (p.famille !== "buteur" && !(Number(p.meilleure_cote) > 1)) ? "" : p.famille === "buteur" ? ` ${L.sansCote}` : ` ${L.coteDebrief(L.n(Number(p.meilleure_cote)))}`;
    if (estCombine(p)) {
      const js = (p.faits?.jambes || []).map((j, k) => {
        const s = p.selections?.[k] || {};
        return `${esc(s.dom)} – ${esc(s.ext)}${j.score_dom != null ? ` ${j.score_dom}-${j.score_ext}` : ""}: ${esc(selectionJambe(s, lang))}, ${R[j.resultat] || j.resultat || "?"}`;
      });
      return `${etiquette(p, lang)} · ${esc(matchTxt(p, lang))}: ${mot}${cote}.${js.length ? " " + js.join("; ") + "." : ""}`;
    }
    const score = p.score_dom != null ? ` ${p.score_dom}-${p.score_ext}` : "";
    let t = `${etiquette(p, lang)} · ${esc(p.dom)} – ${esc(p.ext)}${score}: ${esc(pariTxt(p, lang))}, ${mot}${cote}.`;
    if (p.resultat === "perdu" || p.resultat === "moitie_perdu") t += esc(faitsDuMatch(p, p.faits, lang));
    return t;
  }
  const mot = MOT_RESULTAT[p.resultat] || p.resultat;
  const cote = ["retire", "annule"].includes(p.resultat) || (p.famille !== "buteur" && !(Number(p.meilleure_cote) > 1)) ? "" : p.famille === "buteur" ? " (sans cote)" : ` (cote ${fr(Number(p.meilleure_cote))})`;
  if (estCombine(p)) {
    const js = (p.faits?.jambes || []).map((j, k) => {
      const s = p.selections?.[k] || {};
      return `${esc(s.dom)} – ${esc(s.ext)}${j.score_dom != null ? ` ${j.score_dom}-${j.score_ext}` : ""} : ${esc(s.selection)}, ${MOT_RESULTAT[j.resultat] || j.resultat || "?"}`;
    });
    return `${etiquette(p)} · ${esc(matchTxt(p))} : ${mot}${cote}.${js.length ? " " + js.join(" ; ") + "." : ""}`;
  }
  const score = p.score_dom != null ? ` ${p.score_dom}-${p.score_ext}` : "";
  let t = `${etiquette(p)} · ${esc(p.dom)} – ${esc(p.ext)}${score} : ${esc(p.selection)}, ${mot}${cote}.`;
  if (p.resultat === "perdu" || p.resultat === "moitie_perdu") t += esc(faitsDuMatch(p, p.faits));
  return t;
}
/** « 3 gagnés, 2 perdus, 1 remboursé » : des nombres, rien d'autre (decision de Clement). */
function compteResultats(regles, lang = "fr") {
  const n = (...r) => regles.filter((p) => r.includes(p.resultat)).length;
  const g = n("gagne"), pe = n("perdu"), mg = n("moitie_gagne"), mp = n("moitie_perdu"), rb = n("rembourse"), rt = n("retire", "annule");
  if (!estFrancais(lang)) return textes(lang).compte({ g, pe, mg, mp, rb, rt });
  return [pluriel(g, "gagné"), pluriel(pe, "perdu"), mg && `${mg} à moitié ${mg > 1 ? "gagnés" : "gagné"}`, mp && `${mp} à moitié ${mp > 1 ? "perdus" : "perdu"}`,
    rb && pluriel(rb, "remboursé"), rt && pluriel(rt, "retiré")].filter(Boolean).join(", ");
}
/**
 * Debrief : seulement des paris ENVOYES et regles, en nombre (gagnes, perdus). Ni lien, ni archive, ni
 * empreinte citee ; aucun resultat en unites ni en argent (decision de Clement). sansPreuve = paris archives sans preuve d'envoi : comptes nulle part, et dit.
 */
/** Titre d'un debrief : 'matin' ou 'soir' (jour 'AAAA-MM-JJ'). */
export function titreDebrief(moment, jour, lang = "fr") {
  if (!estFrancais(lang)) return textes(lang).titreDebrief(moment, nomJour(jour, lang));
  return moment === "matin" ? "Débrief du matin (les matchs de la nuit)" : `Débrief du ${nomJour(jour)}`;
}
export function messageDebrief(titre, paris, { sansPreuve = [], lang = "fr" } = {}) {
  const regles = paris.filter((p) => p.resultat);
  if (!regles.length && !sansPreuve.length) return null;
  if (!estFrancais(lang)) {
    const L = textes(lang);
    let t = regles.length ? `<b>${esc(titre)}</b> · ${L.nParis(regles.length)}: ${compteResultats(regles, lang)}.\n` : `<b>${esc(titre)}</b>\n`;
    for (const p of regles) t += `\n${ligneDebrief(p, lang)}`;
    if (sansPreuve.length) t += `\n\n${L.debriefSansPreuve(sansPreuve.map((p) => `${etiquette(p, lang)} (${esc(matchTxt(p, lang))})`).join("; "))}`;
    return t.slice(0, 4000);
  }
  let t = regles.length ? `<b>${esc(titre)}</b> · ${pluriel(regles.length, "pari")} : ${compteResultats(regles)}.\n` : `<b>${esc(titre)}</b>\n`;
  for (const p of regles) t += `\n${ligneDebrief(p)}`;
  if (sansPreuve.length) t += `\n\nSans preuve d'envoi avant le match, donc comptés nulle part (ni résultat, ni bilan) : ${sansPreuve.map((p) => `${etiquette(p)} (${esc(matchTxt(p))})`).join(" ; ")}.`;
  return t.slice(0, 4000);
}
/**
 * Statistiques d'un type de pari (usage INTERNE : regle d'arret, controles). Un demi-resultat compte
 * pour moitie ; rembourses et retires ne comptent pas. Jamais affiche dans un message (decision de Clement).
 */
const POIDS_RESULTAT = { gagne: [1, 1], perdu: [1, 0], moitie_gagne: [0.5, 0.5], moitie_perdu: [0.5, 0] };
export function statsFamille(paris) {
  const comptes = paris.filter((p) => POIDS_RESULTAT[p.resultat]);
  const c = (r) => paris.filter((p) => p.resultat === r).length;
  const base = { paris: comptes.length, gagnes: c("gagne"), perdus: c("perdu"), moitie_gagnes: c("moitie_gagne"), moitie_perdus: c("moitie_perdu"), rembourses: c("rembourse") };
  const n = somme(comptes.map((p) => POIDS_RESULTAT[p.resultat][0]));
  const g = somme(comptes.map((p) => POIDS_RESULTAT[p.resultat][1]));
  if (!n) return { ...base, n: 0, g: 0 };
  const annonce = somme(comptes.map((p) => POIDS_RESULTAT[p.resultat][0] * Number(p.proba))) / n;
  return { ...base, n, g, annonce, reel: g / n, marge: 1.96 * Math.sqrt(annonce * (1 - annonce) / n) };
}
const NOMS_BILAN = { simple: "Simples", combine: "Combinés du jour", buteur: "Même match avec buteur", fun10: "Tickets autour de 10", fun25: "Tickets autour de 25", reve: "Tickets 50-100 du mois" };
function lignesBilan(paris, lang = "fr") {
  let t = "";
  for (const f of ORDRE_FAMILLES) {
    const x = paris.filter((p) => p.famille === f && p.resultat);
    if (!x.length) continue;
    if (!estFrancais(lang)) { const L = textes(lang); t += `\n<b>${L.bilanNoms[f]}</b> · ${L.nParis(x.length)}: ${compteResultats(x, lang)}.`; continue; }
    t += `\n<b>${NOMS_BILAN[f]}</b> · ${pluriel(x.length, "pari")} : ${compteResultats(x)}.`;
  }
  return t;
}
/**
 * Bilan du lundi : la semaine ET le cumul depuis le n° 1, en nombre (gagnes, perdus), rien d'autre
 * (ni lien, ni archive citee). Aucun taux, aucune unite, aucun argent (decision de Clement). Paris non envoyes
 * jamais comptes (filtre fait par l'appelant). sansPreuve : paris archives sans preuve d'envoi, hors bilan.
 */
export function messageBilanSemaine(du, au, semaine, cumul, { nonRegles = 0, sansPreuve = [], sansPreuveTotal = [], lang = "fr" } = {}) {
  if (!estFrancais(lang)) {
    const B = textes(lang).bilan;
    let t = B.titre(dateLongue(du, lang), dateLongue(au, lang));
    t += semaine.some((p) => p.resultat) ? lignesBilan(semaine, lang) : `\n${B.rienSemaine}`;
    if (sansPreuve.length) t += `\n${B.horsBilan(sansPreuve.map((p) => `${etiquette(p, lang)} (${esc(matchTxt(p, lang))})`).join("; "))}`;
    const nums = [...cumul, ...sansPreuveTotal].map((p) => Number(p.numero)).filter((n) => Number.isInteger(n) && n > 0);
    t += `\n\n${B.depuis(nums.length ? Math.min(...nums) : null)}`;
    t += cumul.some((p) => p.resultat) ? lignesBilan(cumul, lang) : `\n${B.rien}`;
    if (sansPreuveTotal.length) t += `\n${B.horsTotal(sansPreuveTotal.length, sansPreuveTotal.slice(0, 10).map((p) => etiquette(p, lang)).join(", ") + (sansPreuveTotal.length > 10 ? "…" : ""))}`;
    if (nonRegles) t += `\n\n${B.nonRegles(nonRegles)}`;
    return t.slice(0, 4000);
  }
  let t = `<b>Bilan de la semaine</b> (du ${dateLongue(du)} au ${dateLongue(au)})`;
  const regleS = semaine.filter((p) => p.resultat);
  t += regleS.length ? lignesBilan(semaine) : "\nAucun pari réglé cette semaine.";
  if (sansPreuve.length) t += `\nHors bilan, sans preuve d'envoi : ${sansPreuve.map((p) => `${etiquette(p)} (${esc(matchTxt(p))})`).join(" ; ")}.`;
  // Premier numero : parmi TOUS les paris numerotes (hors bilan compris), sinon « depuis le n° PRO-2 » cacherait le n° 1.
  const nums = [...cumul, ...sansPreuveTotal].map((p) => Number(p.numero)).filter((n) => Number.isInteger(n) && n > 0);
  const premier = nums.length ? Math.min(...nums) : null;
  t += `\n\n<b>Depuis le début</b>${premier ? ` (depuis le n° PRO-${premier})` : ""}`;
  t += cumul.some((p) => p.resultat) ? lignesBilan(cumul) : "\nAucun pari réglé.";
  if (sansPreuveTotal.length) {
    const liste = sansPreuveTotal.slice(0, 10).map((p) => etiquette(p)).join(", ") + (sansPreuveTotal.length > 10 ? "…" : "");
    t += `\nHors bilan depuis le début, sans preuve d'envoi : ${pluriel(sansPreuveTotal.length, "pari")} (${liste}).`;
  }
  if (nonRegles) t += `\n\n${pluriel(nonRegles, "pari")} pas encore ${nonRegles > 1 ? "réglés" : "réglé"}.`;
  return t.slice(0, 4000);
}

// ------------------------------------------------------------------ tickets et tabac
function motsEquipe(nom, min = 4) { return norm(nom).split(/[^a-z0-9]+/).filter((m) => m.length >= min && !["united", "city", "club", "football", "sporting", "real", "olympique"].includes(m)); }
/** Le simple du programme dont une equipe est nommee dans le texte (un seul possible), sinon null. */
export function trouverPari(texte, paris) {
  const n = norm(texte);
  const touches = paris.filter((p) => (!p.famille || p.famille === "simple") && [...motsEquipe(p.dom), ...motsEquipe(p.ext)].some((m) => n.includes(m)));
  return touches.length === 1 ? touches[0] : null;
}
/**
 * Detecteur de combine : un texte « A + B (+ C) » dont CHAQUE morceau nomme une equipe d'une selection
 * differente du MEME pari a plusieurs selections du programme (combine du jour ou ticket), et qui en
 * couvre toutes les selections -> ce pari. Sinon null (le ticket est note tel que l'abonne l'a ecrit).
 */
export function trouverCombine(texte, paris) {
  const morceaux = norm(texte).split("+").map((x) => x.trim()).filter(Boolean);
  if (morceaux.length < 2) return null;
  const ok1 = paris.filter((p) => estCombine(p) && (p.selections || []).length === morceaux.length).filter((p) => {
    const pris = new Set();
    for (const m of morceaux) {
      const mots = m.split(/[^a-z0-9]+/);
      const k = p.selections.findIndex((j, i) => !pris.has(i) && [...motsEquipe(j.dom, 3), ...motsEquipe(j.ext, 3)].some((w) => (w.length >= 4 ? m.includes(w) : mots.includes(w))));
      if (k < 0) return false;
      pris.add(k);
    }
    return pris.size === p.selections.length;
  });
  return ok1.length === 1 ? ok1[0] : null;
}
/** Selection ecrite par l'abonne, lue sur le texte (jamais remplacee par celle du programme). null = illisible. */
export function marcheEcrit(texte, p) {
  const n = norm(texte);
  if (/\b(1x|x2|12)\b/.test(n)) return n.match(/\b(1x|x2|12)\b/)[1].toUpperCase();
  const pos = (nom) => Math.max(-1, ...motsEquipe(nom).map((m) => n.indexOf(m)));
  const pd = p ? pos(p.dom) : -1, pe = p ? pos(p.ext) : -1;
  if (/ou nul|nul ou|double chance|o empate|empate o|doble oportunidad|or draw|draw or|oder unentschieden|o pareggio|pareggio o|doppia chance|ou empate|empate ou/.test(n)) {
    if (pd >= 0 && pe < 0) return "1X";
    if (pe >= 0 && pd < 0) return "X2";
    return null;
  }
  if (/handicap/.test(n)) return null;
  if (/\b(nul|empate|draw|unentschieden|remis|pareggio)\b/.test(n)) return "N";
  if (/plus de 2[.,]5|\+ ?2[.,]5 buts|over 2[.,]5|mas de 2[.,]5|uber 2[.,]5|mais de 2[.,]5/.test(n)) return "O25";
  if (/moins de 2[.,]5|- ?2[.,]5 buts|under 2[.,]5|menos de 2[.,]5|unter 2[.,]5/.test(n)) return "U25";
  const k = n.search(/gagne|victoire|vainqueur|gana|\bwins?\b|to win|gewinnt|sieg|vince|vittoria|vence|vitoria/);
  if (k >= 0 && p) {
    const avant = (x) => (x >= 0 && x <= k ? k - x : Infinity), apres = (x) => (x > k ? x - k : Infinity);
    const d = Math.min(avant(pd), apres(pd)), e = Math.min(avant(pe), apres(pe));
    if (d !== e) return d < e ? "1" : "2";
  }
  return null;
}
/** Texte d'un ticket -> { cote, mise, bookmaker, selection (celle de l'abonne), pari (seulement si c'est LE meme pari) } ou null. */
export function lireTicketTexte(texte, parisDuJour = [], pays = "FR", lang = "fr") {
  const s = String(texte || "");
  const n = norm(s);
  const mise = (n.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|e\b|eur|euros?)/) || [])[1];
  const sansMise = n.replace(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|e\b|eur|euros?)/g, " ");
  const cotes = [...sansMise.matchAll(/(?:^|[\s@(:])(\d{1,2}[.,]\d{1,2})(?!\d|\s*buts?)/g)].map((m) => Number(m[1].replace(",", "."))).filter((x) => x > 1 && x < 100);
  if (!cotes.length) return null;
  let bookmaker = null;
  for (const b of BOOKMAKERS_AGREES[pays] || []) if (n.replace(/[\s.'-]/g, "").includes(b.cle) || n.includes(norm(b.nom))) { bookmaker = b.cle; break; }
  const combine = s.includes("+");
  if (combine) {
    // Detecteur de combine : le combine du jour (ou un ticket) du programme, s'il est reconnu en entier.
    const c = trouverCombine(sansMise.replace(/(?:^|[\s@(:])(\d{1,2}[.,]\d{1,2})(?!\d)/g, " "), parisDuJour);
    return { cote: cotes[0], mise: mise ? Number(mise.replace(",", ".")) : null, bookmaker, combine, pari: c,
      selection: c ? c.selection : s.replace(/\s+/g, " ").trim().slice(0, 80), match: c ? matchTxt(c) : null };
  }
  const candidat = trouverPari(n, parisDuJour);
  const marche = marcheEcrit(n, candidat);
  const memePari = candidat && marche && marche === candidat.marche && candidat.ligne == null;
  const selection = candidat && marche ? selectionTxt({ ...candidat, marche, ligne: null }, lang) : s.replace(/\s+/g, " ").trim().slice(0, 80);
  return { cote: cotes[0], mise: mise ? Number(mise.replace(",", ".")) : null, bookmaker, combine,
    pari: memePari ? candidat : null, selection, match: candidat ? `${candidat.dom} – ${candidat.ext}` : null };
}
/**
 * Un texte avec un nombre a virgule n'est PAS forcement un ticket (« pourquoi le pari d'hier a 1,85
 * a perdu ? », « rien depuis 2,5 jours », « j'ai perdu 20 € sur le nul a 3,10, je veux resilier »).
 * C'est un ticket seulement s'il n'y a ni question, ni mot de support (resilier, rembourser, hier,
 * perdu, bilan…), et qu'on y reconnait un match du programme, un bookmaker, une mise ou des mots de
 * pari. Dans le doute, le message part a l'equipe (support) : un ticket pris pour une question se
 * reecrit, une question prise pour un ticket se perdrait. Filet : « Annuler » transmet aussi le texte.
 * Seulement des mots FORTS : jamais de politesse ni de mot qu'on trouve sur un vrai ticket (bonjour,
 * merci, svp, stp, salut, vous, votre, vos, compte, question, aide), sinon de vrais tickets partent au
 * support et le garde-fou ne les compte plus (contre-controle ronde 3, sim5 : 6 tickets sur 7 perdus).
 */
export const MOTS_SUPPORT = /\b(pourquoi|comment|resili\w*|desabonn\w*|abonnement|abonne|rembours\w*|arnaque\w*|escroc\w*|plainte|probleme\w*|bug\w*|marche pas|fonctionne pas|contact\w*|hier|avant-hier|perdu|perdus|perdue|perte\w*|regle|reglee?s?|bilan|cancelar|baja|reembols\w*|estafa|ayer|cancel\w*|refund\w*|scam|yesterday|kundig\w*|erstatt\w*|gestern|disdire|rimbors\w*|truffa|ieri|reembolso|ontem|burla)\b/;
export function estUnTicket(t, texte) {
  if (!t) return false;
  const n = norm(texte);
  if (n.includes("?") || MOTS_SUPPORT.test(n)) return false;
  return !!(t.match || t.bookmaker || t.mise || t.combine || /gagne|victoire|vainqueur|\bnul\b|\bbuts?\b|handicap|double chance|\bover\b|\bunder\b|gana|empate|goles|\bwins?\b|\bdraw\b|goals|gewinnt|unentschieden|tore|vince|pareggio|\bgol\b|vence|golos/.test(n));
}
export function messageTicket(t, pays = "FR", lang = "fr") {
  if (!estFrancais(lang)) {
    const L = textes(lang), K = L.ticket;
    const bk = t.bookmaker ? ` ${L.chez} ${esc(nomBookmaker(t.bookmaker, pays))}` : "";
    const mise = t.mise ? K.sur(L.n(t.mise, t.mise % 1 ? 2 : 0)) : "";
    if (t.combine && t.pari) return K.lu + mise + K.combineProg(esc((L.familles[t.pari.famille]?.nom || L.familles.combine.nom).toLowerCase()), esc(t.pari.famille ? pariTxt(t.pari, lang) : t.selection), L.n(t.cote), bk);
    if (t.match) return K.lu + mise + K.match(esc(t.selection), esc(t.match), L.n(t.cote), bk);
    return K.lu + mise + K.autre(t.combine, L.n(t.cote), bk, esc(String(t.selection || "").slice(0, 80)));
  }
  const bk = t.bookmaker ? ` chez ${esc(nomBookmaker(t.bookmaker, pays))}` : "";
  const mise = t.mise ? `${fr(t.mise, t.mise % 1 ? 2 : 0)} € sur ` : "";
  if (t.combine && t.pari) return `Ticket lu : ${mise}le ${esc(FAMILLES[t.pari.famille]?.nom.toLowerCase() || "combiné")} du programme (${esc(t.selection)}) à ${fr(t.cote)}${bk}.`;
  if (t.match) return `Ticket lu : ${mise}${esc(t.selection)} (${esc(t.match)}) à ${fr(t.cote)}${bk}.`;
  return `Ticket lu : ${mise}${t.combine ? "un combiné" : "un pari"} à ${fr(t.cote)}${bk} (« ${esc(String(t.selection || "").slice(0, 80))} »).`;
}
/** « J'ai 3,20 au tabac » -> cote, ou null. */
export function coteTabac(texte) {
  const n = norm(texte);
  if (!/tabac|bureau|point de vente|fdj/.test(n)) return null;
  const m = n.match(/(\d{1,2}[.,]\d{1,2})/);
  return m ? Number(m[1].replace(",", ".")) : null;
}
/** Cote vue au tabac : on la met a cote de la meilleure cote relevee chez les agrees. Aucun calcul, aucun avis. */
export function verdictTabac(p, cote, lang = "fr") {
  if (!estFrancais(lang)) {
    const L = textes(lang);
    const best = ok(Number(p.meilleure_cote)) ? L.tabacBest(L.n(Number(p.meilleure_cote)), esc(nomBookmaker(p.meilleur_bookmaker)), p.cote_vue_at ? heureTxt(p.cote_vue_at, lang) : "") : "";
    return L.tabac(esc(pariTxt(p, lang)), `${esc(p.dom)} – ${esc(p.ext)}`, L.n(cote), best, esc(chanceTxt(p, lang)));
  }
  const best = ok(Number(p.meilleure_cote)) ? ` Meilleure cote relevée chez les bookmakers agréés : ${fr(Number(p.meilleure_cote))} chez ${esc(nomBookmaker(p.meilleur_bookmaker))}${p.cote_vue_at ? ` (à ${heureTxt(p.cote_vue_at)})` : ""}.` : "";
  return `Pour ${esc(p.selection)} (${esc(p.dom)} – ${esc(p.ext)}) : tu vois ${fr(cote)} au tabac.${best} ${esc(chanceTxt(p))} La cote au tabac peut différer de celle d'internet et bouger d'ici le match.`;
}
export function messageGardeFou(notes, limite, lang = "fr") {
  if (!Number.isInteger(limite)) return "";
  if (!estFrancais(lang)) {
    const G = textes(lang).gardeFou;
    if (limite === 0) return G.zero;
    if (notes >= limite) return G.atteint(notes);
    if (notes === limite - 1) return G.unDeplus(notes, limite);
    return G.simple(notes, limite);
  }
  if (limite === 0) return "Garde-fou à 0 : je ne t'envoie plus rien aujourd'hui (ni programme, ni alerte). Tu peux changer ta limite dans /reglages.";
  if (notes >= limite) return `Garde-fou : tu as noté ${pluriel(notes, "pari")} aujourd'hui, ta limite. Je ne t'envoie plus rien aujourd'hui (ni programme, ni alerte). Tu peux changer ta limite dans /reglages.`;
  if (notes === limite - 1) return `Garde-fou : ${notes} pari${notes > 1 ? "s" : ""} sur ${limite} aujourd'hui. Encore un, et je m'arrête pour la journée.`;
  return `${notes} pari${notes > 1 ? "s" : ""} sur ${limite} aujourd'hui.`;
}

// ------------------------------------------------------------------ Loto Foot : notre grille a tenter
/** Une grille incomplete n'est jamais envoyee : liste des problemes (vide = complete). */
export function problemesGrille(g) {
  const err = [];
  if (!g?.id || !g.nom) err.push("id et nom obligatoires");
  if (!Date.parse(g?.premier_match_at)) err.push("premier_match_at (date ISO) obligatoire");
  if (g?.cloture_at && !(Date.parse(g.cloture_at) <= Date.parse(g.premier_match_at))) err.push("la clôture doit être avant le 1er match");
  if (!Date.parse(g?.releve_at)) err.push("heure du relevé de la répartition obligatoire");
  if (!Array.isArray(g?.matchs) || g.matchs.length < 7) err.push("au moins 7 matchs");
  const nums = new Set();
  for (const [i, m] of (g?.matchs || []).entries()) {
    if (!Number.isInteger(m.n) || nums.has(m.n)) err.push(`match ${i + 1} : numéro n de la grille FDJ obligatoire et unique`);
    nums.add(m.n);
    if (!m.dom || !m.ext) err.push(`match ${i + 1} : équipes`);
    if (!Array.isArray(m.cotes) || m.cotes.length !== 3 || m.cotes.some((c) => !(Number(c) > 1))) err.push(`match ${i + 1} : 3 cotes 1 N 2`);
    if (!Array.isArray(m.repartition) || m.repartition.length !== 3 || m.repartition.some((r) => !(Number(r) > 0)) || Math.abs(m.repartition.reduce((a, b) => a + Number(b), 0) - 100) > 2) err.push(`match ${i + 1} : répartition 1 N 2 en % (total 100)`);
  }
  return err;
}
/**
 * Anti-foule : on part du plus probable, et on met le NUL la ou il est nettement moins
 * joue que sa chance (au plus 3 nuls). Doubles : sur les matchs les plus incertains.
 * Seuils (27 %, 1,2) de bon sens, NON calibres : a valider par le mathematicien.
 */
export function grilleATenter(grille, { doubles = 0, maxNuls = 3, chanceNulMin = 0.27 } = {}) {
  const pb = problemesGrille(grille);
  if (pb.length) throw new Error(`grille incomplète : ${pb.join(" ; ")}`);
  const lignes = grille.matchs.map((m) => ({ ...m, p: fair(...m.cotes.map(Number)), r: m.repartition.map((x) => Number(x) / 100) }));
  const idx = (c) => "1N2".indexOf(c);
  const choix = lignes.map((m) => [["1", "N", "2"][m.p.indexOf(Math.max(...m.p))]]);
  const candidatsNul = lignes.map((m, i) => ({ i, rapport: m.p[1] / m.r[1], pN: m.p[1] }))
    .filter((x) => x.pN >= chanceNulMin && x.rapport >= 1.2 && choix[x.i][0] !== "N").sort((a, b) => b.rapport - a.rapport).slice(0, maxNuls);
  for (const x of candidatsNul) choix[x.i] = ["N"];
  const incertains = lignes.map((m, i) => ({ i, max: Math.max(...m.p) })).sort((a, b) => a.max - b.max).slice(0, doubles);
  for (const x of incertains) {
    const m = lignes[x.i], deja = choix[x.i][0];
    const ordre = [0, 1, 2].sort((a, b) => m.p[b] - m.p[a]).map((k) => ["1", "N", "2"][k]).filter((c) => c !== deja);
    choix[x.i] = [deja, ordre[0]].sort((a, b) => idx(a) - idx(b));
  }
  // Chiffres calcules (modele simplifie : matchs independants) : chance que la grille passe, part de la foule sur la meme grille.
  const produit = (f) => lignes.reduce((a, m, i) => a * f(m, i), 1);
  const pGrille = produit((m, i) => choix[i].reduce((s, c) => s + m.p[idx(c)], 0));
  const pFavoris = produit((m) => Math.max(...m.p));
  const fGrille = produit((m, i) => choix[i].reduce((s, c) => s + m.r[idx(c)], 0));
  const fFavoris = produit((m) => m.r[m.p.indexOf(Math.max(...m.p))]);
  return { lignes: lignes.map((m, i) => ({ n: m.n, dom: m.dom, ext: m.ext, choix: choix[i] })), nuls_anti_foule: candidatsNul.length,
    combinaisons: 2 ** incertains.length, pGrille, pFavoris, fGrille, fFavoris };
}
/** Message de la grille, ou null si la grille est incomplete. Aucune phrase non calculee. */
export function messageGrille(grille) {
  if (problemesGrille(grille).length) return null;
  const simple = grilleATenter(grille), avec3 = grilleATenter(grille, { doubles: 3 });
  const lg = (g) => g.lignes.map((l) => `${l.n}. ${esc(l.dom)} – ${esc(l.ext)} : <b>${l.choix.join(" ou ")}</b>`).join("\n");
  const cloture = grille.cloture_at || grille.premier_match_at;
  let t = `<b>Notre grille à tenter</b> · ${esc(grille.nom)} · clôture ${nomJour(paris(cloture).date)} à ${heureTxt(cloture)}\n\n`;
  t += `<b>Grille simple</b> (1 combinaison)\n${lg(simple)}\n\n<b>Avec 3 doubles</b> (${avec3.combinaisons} combinaisons)\n${lg(avec3)}\n\n`;
  if (simple.nuls_anti_foule && simple.pGrille < simple.pFavoris) {
    const moinsSouvent = simple.pFavoris / simple.pGrille, moinsJouee = simple.fFavoris / simple.fGrille;
    t += `Nous avons mis ${pluriel(simple.nuls_anti_foule, "nul")} là où la foule en met peu. D'après les cotes, cette grille passe environ ${fr(moinsSouvent, 1)} fois moins souvent que la grille des favoris ; d'après la répartition relevée ${nomJour(paris(grille.releve_at).date)} à ${heureTxt(grille.releve_at)}, environ ${Math.round(moinsJouee)} fois moins de joueurs ont cette grille (calcul simplifié, la répartition bouge jusqu'à la clôture).\n`;
  }
  t += `Avec 3 doubles (${avec3.combinaisons} combinaisons), d'après les cotes, la grille passe environ ${fr(avec3.pGrille / simple.pGrille, 1)} fois plus souvent que la grille simple.`;
  return t;
}

// ------------------------------------------------------------------ duel « la foule contre l'IA » (canal gratuit)
// DECISION CLEMENT / JURISTE : aucun lot, aucun classement nominatif publie tant
// qu'un reglement (18 ans et plus, un compte par personne, pseudos) n'est pas
// ecrit et relu. Le duel se joue donc sans lot.
export const CHOIX_DUEL = ["1", "N", "2"];
export function libelleChoix(c, dom, ext) { return c === "1" ? dom : c === "2" ? ext : "Match nul"; }
/** Choix de l'IA : l'issue la plus probable du modele (p1, pn, p2 en %). */
export function choixIA(m) {
  const p = [Number(m.p1), Number(m.pn), Number(m.p2)];
  if (!p.every(ok)) return null;
  return CHOIX_DUEL[p.indexOf(Math.max(...p))];
}
export function messageDuelOuverture(d) {
  return `<b>Le duel du jour : la foule contre l'IA</b>\n${esc(d.dom)} – ${esc(d.ext)} · ${esc(d.competition || "")}${d.competition ? " · " : ""}${heureTxt(d.coup_envoi)}\n\n1, N ou 2 ? Vote avec les boutons (tu peux changer d'avis jusqu'au coup d'envoi). Pour le plaisir : pas de lot.\nL'IA a déjà choisi. Son choix est scellé et sera révélé au coup d'envoi, pour ne pas influencer le vote. Empreinte SHA-256 :\n<code>${esc(d.empreinte)}</code>`;
}
export function clavierDuel(d) {
  return { inline_keyboard: [CHOIX_DUEL.map((c) => ({ text: c === "N" ? "N · nul" : `${c} · ${libelleChoix(c, d.dom, d.ext)}`.slice(0, 30), callback_data: `dv:${d.jour}:${c}` }))] };
}
export function repartitionVotes(votes) {
  const n = { 1: 0, N: 0, 2: 0 };
  for (const v of votes) n[v.choix] = (n[v.choix] || 0) + 1;
  return { n, total: votes.length };
}
export function messageDuelRevelation(d, votes) {
  const { n, total } = repartitionVotes(votes);
  let t = `<b>Coup d'envoi du duel</b> · ${esc(d.dom)} – ${esc(d.ext)}\nL'IA a choisi : <b>${esc(libelleChoix(d.choix_ia, d.dom, d.ext))}</b> (${d.choix_ia}).\nPreuve : le texte « ${d.choix_ia}|${esc(d.sel)} » donne l'empreinte SHA-256 annoncée ce matin :\n<code>${esc(d.empreinte)}</code>`;
  if (total) {
    const contre = total - (n[d.choix_ia] || 0);
    t += `\n${total} votant${total > 1 ? "s" : ""} : 1 ${Math.round(100 * n[1] / total)} %, N ${Math.round(100 * n.N / total)} %, 2 ${Math.round(100 * n[2] / total)} %. ${Math.round(100 * contre / total)} % ont choisi autre chose que l'IA.`;
  }
  return t;
}
export function messageDuelResultat(d, votes, bd, be) {
  const reel = bd > be ? "1" : bd < be ? "2" : "N";
  const { n, total } = repartitionVotes(votes);
  return `<b>Duel d'hier</b> · ${esc(d.dom)} – ${esc(d.ext)} ${bd}-${be}\nL'IA avait choisi ${esc(libelleChoix(d.choix_ia, d.dom, d.ext))} : ${d.choix_ia === reel ? "trouvé" : "raté"}.`
    + (total ? `\nLa foule : ${Math.round(100 * (n[reel] || 0) / total)} % des ${total} votants avaient trouvé.` : "");
}
/** Classement du mois (NON UTILISE : decision Clement / juriste). */
export function classementDuel(votes, manches) {
  const reel = Object.fromEntries(manches.filter((m) => m.resultat).map((m) => [m.jour, m.resultat]));
  const par = new Map();
  for (const v of votes) {
    if (!reel[v.jour]) continue;
    const x = par.get(v.telegram_user_id) || { telegram_user_id: v.telegram_user_id, bons: 0, votes: 0, premier: v.vote_at };
    x.votes++; if (v.choix === reel[v.jour]) x.bons++;
    if (v.vote_at < x.premier) x.premier = v.vote_at;
    par.set(v.telegram_user_id, x);
  }
  return [...par.values()].sort((a, b) => b.bons - a.bons || String(a.premier).localeCompare(String(b.premier)));
}

// ------------------------------------------------------------------ archive : empreinte chainee, recalculable depuis la base
export function canon(o) {
  if (Array.isArray(o)) return `[${o.map(canon).join(",")}]`;
  if (o && typeof o === "object") return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
  return JSON.stringify(o ?? null);
}
export async function sha256(texte) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export const CHAMPS_ARCHIVE = ["numero", "jour", "famille", "event_id", "fixture_id", "ligue", "dom", "ext", "coup_envoi", "fin_coup_envoi", "marche", "ligne", "selection", "selections", "proba", "cote_min", "meilleure_cote", "meilleur_bookmaker", "cotes", "cote_vue_at", "publie_at", "regles", "explication"];
const HEURES = new Set(["coup_envoi", "fin_coup_envoi", "cote_vue_at", "publie_at"]);
const NOMBRES = new Set(["numero", "fixture_id", "ligne", "proba", "cote_min", "meilleure_cote"]);
/**
 * Forme unique d'un pari, quelle que soit sa provenance (script ou base) : heures en
 * 'AAAA-MM-JJTHH:MM:SS.mmmZ' (Postgres renvoie '+00:00'), nombres en nombres, jour en 'AAAA-MM-JJ'.
 */
export function pariCanonique(p) {
  const x = {};
  for (const k of CHAMPS_ARCHIVE) {
    let v = p[k] ?? null;
    if (v !== null && HEURES.has(k)) v = new Date(v).toISOString();
    else if (v !== null && NOMBRES.has(k)) v = Number(v);
    else if (v !== null && k === "jour") v = String(v).slice(0, 10);
    else if (v !== null && k === "cotes") v = Object.fromEntries(Object.entries(v).map(([b, c]) => [b, Number(c)]));
    else if (k === "selections") v = (Array.isArray(v) ? v : []).map((j) => Object.fromEntries(Object.entries(j).map(([a, b]) => [a, a === "coup_envoi" && b ? new Date(b).toISOString() : b])));
    x[k] = v;
  }
  return x;
}
export async function empreintePari(p, precedente) {
  return sha256(`${precedente || "0".repeat(64)}|${canon(pariCanonique(p))}`);
}
/** Rejoue la chaine (paris publies, tries par numero) : liste des problemes (vide = chaine intacte). */
export async function verifierChaine(paris) {
  const pb = [];
  let prec = null;
  for (const p of [...paris].sort((a, b) => a.numero - b.numero)) {
    if ((p.empreinte_precedente || null) !== prec) pb.push(`n° ${p.numero} : empreinte précédente ne suit pas la chaîne`);
    if (await empreintePari(p, prec) !== p.empreinte) pb.push(`n° ${p.numero} : empreinte ne correspond pas au contenu`);
    prec = p.empreinte;
  }
  return pb;
}

// ------------------------------------------------------------------ planning (heure de Paris)
/** Taches dues a cet instant (le robot tourne toutes les 15 min ; chaque tache est idempotente et rattrape un tour manque). */
export function tachesDues(d) {
  const { hm, dow } = paris(d);
  const t = ["regler", "renvoi", "compositions", "programme", "loto_foot", "duel", "a_publier", "diffusions"];
  if (hm >= "08:00" && hm < "23:00") t.push("cotes", "meteo", "infos");
  if (hm >= "08:30" && hm < "11:00") t.push("debrief_matin");
  if (hm >= (dow === 0 ? "23:15" : "23:30")) t.push("debrief_soir", "ancre");
  if (dow === 1 && hm >= "12:30") t.push("bilan_semaine");
  return t;
}
/** Etat du programme du jour -> action a faire maintenant. */
export function actionProgramme(prog, d) {
  const { hm } = paris(d);
  if (!prog) return hm >= "08:15" && hm < "12:00" ? "preparer" : null;
  if (prog.statut === "prepare") return hm >= "12:00" ? "expirer" : hm >= "08:45" ? "demander" : null;
  if (prog.statut === "attente") {
    if (hm >= "12:00") return "expirer";
    if (hm >= "10:30" && !prog.rappel_at) return "rappeler";
    return null;
  }
  if (prog.statut === "valide" || prog.statut === "reporte") return hm >= "09:30" ? "publier" : null;
  return null;
}

// ------------------------------------------------------------------ publication des messages publics
// Tous les messages publics autres que le programme (qui a son propre clic « Valider »). Par
// defaut chacun est PROPOSE a Clement avec « Publier ». Debriefs, bilan, revelation et resultat
// du duel sont OBLIGATOIRES : pas de bouton « Ne pas publier », et ils lui sont reproposes toutes
// les 3 h (8 h - 23 h) jusqu'a leur publication (on montre aussi les pertes). L'automatique
// (reglage auto_<type> = 'oui', commande /automatique du robot) est une option ETEINTE par defaut.
// Messages Pro EN PRIVE (02/10/2026) : debriefs, bilan, Loto Foot et programme reporte partent en prive a
// chaque abonne Pro ; le duel reste sur le canal gratuit. Les compositions sont des messages personnels.
export const TYPES_PUBLICS = {
  debriefs: "Débriefs (matin et soir)", bilan: "Bilan du lundi", duel: "Duel (révélation et résultat)",
  loto: "Grille Loto Foot", reporte: "Programme reporté",
};
/** Cle d'un message propose (dans le bouton d'envoi : 56 caracteres au plus, sans « : » ; 64 octets avec « pubpro:: »). */
export const cleObligatoireValide = (cle) => /^[a-z0-9-]{1,56}$/.test(String(cle ?? ""));
export const REPROPOSER_APRES_MIN = 180;
/**
 * Erreur d'envoi Telegram -> le message n'est SUREMENT pas parti ? Seuls 400 (requete refusee),
 * 403 (robot bloque ou pas administrateur) et 429 (trop de messages) le prouvent. Tout le reste
 * (502, 504, reponse 200 illisible, coupure reseau) : envoi INCERTAIN, jamais renvoye tout seul.
 */
export const TELEGRAM_PAS_PARTI = Object.freeze([400, 403, 429]);
export const envoiRefuse = (e) => TELEGRAM_PAS_PARTI.includes(Number(e?.status));
/**
 * Envoi incertain : heure LIMITE pour que Clement transfere la preuve ou clique « Renvoyer » =
 * 70 min avant le coup d'envoi, AVANT les compositions (releve des compositions a H-70). Plus tard,
 * il connaitrait les compositions et le mouvement des cotes : il pourrait choisir quels paris comptent.
 * (Le robot, lui, peut encore ecrire la preuve d'un message qu'il vient d'envoyer : pas de choix.)
 */
export const PREUVE_LIMITE_MIN = 70;
export const limitePreuve = (p) => Date.parse(p.coup_envoi) - PREUVE_LIMITE_MIN * 60000;
/**
 * La BASE refuse aussi toute preuve apres cette heure limite (trigger de 0040, contre-controle
 * ronde 4 : la cle de service ne permet plus de choisir apres coup). Le robot n'envoie donc plus
 * rien (publication, renvoi) s'il ne reste pas 5 min pour ecrire la preuve avant l'heure limite.
 */
export const ENVOI_MARGE_MIN = 5;
export const envoiPossible = (p, maintenant) => new Date(maintenant).getTime() < limitePreuve(p) - ENVOI_MARGE_MIN * 60000;

// ------------------------------------------------------------------ CLV (critere du protocole du Canal Pro)
/**
 * CLV d'un pari = cote publiee x chance Pinnacle sans marge du DERNIER releve avant le match - 1.
 * null (pari compte A PART, jamais dans le critere) : pas de releve Pinnacle de fin, ou releve
 * pris plus de 30 min avant le coup d'envoi (pinnacle_fin_at).
 */
export const RELEVE_FIN_MAX_MIN = 30;
export function clvPari(p) {
  const c = Number(p.meilleure_cote);
  if (!(c > 1)) return null;
  if (estCombine(p)) {
    // Chaque selection : chance Pinnacle sans marge de SON dernier releve, pris 30 min au plus avant SON match.
    const js = (p.faits?.jambes || []).filter((j) => j.resultat !== "annule");
    if (!js.length || js.length !== (p.faits?.jambes || []).length) return null;
    let q = 1;
    for (const [k, j] of (p.faits.jambes).entries()) {
      const qq = Number(j.pinnacle_proba_fin), t = Date.parse(j.pinnacle_fin_at), ko = Date.parse(p.selections?.[k]?.coup_envoi);
      if (!(qq > 0 && qq < 1) || !isFinite(t) || !isFinite(ko) || t > ko || ko - t > RELEVE_FIN_MAX_MIN * 60000) return null;
      q *= qq;
    }
    return c * q - 1;
  }
  const q = Number(p.pinnacle_proba_fin);
  const t = Date.parse(p.pinnacle_fin_at), ko = Date.parse(p.coup_envoi);
  if (!(q > 0 && q < 1) || !isFinite(t) || !isFinite(ko) || t > ko || ko - t > RELEVE_FIN_MAX_MIN * 60000) return null;
  return c * q - 1;
}

// ------------------------------------------------------------------ robot personnel : reglages
const NOMS_ALERTES = { seuil: "Cote qui baisse", hausse: "Cote qui monte", compositions: "Compositions", meteo: "Météo forte", nuit: "Alertes la nuit (23 h - 8 h)" };
export function messageReglages(prefs, lang = "fr") {
  if (!estFrancais(lang)) {
    const L = textes(lang), R = L.reglages;
    const bks = !BOOKMAKERS_AGREES[prefs.pays] ? R.aucunBk
      : prefs.bookmakers.length ? prefs.bookmakers.map((b) => nomBookmaker(b, prefs.pays)).join(", ") : R.tousBk(bookmakersSuivis(prefs.pays).map((b) => nomBookmaker(b, prefs.pays)).join(", "));
    return R.message(prefs.pays === PAYS_INCONNU ? R.paysInconnu : esc(prefs.pays), esc(bks),
      prefs.competitions?.length ? R.tesChoix(prefs.competitions.map((k) => nomCompetition(k, lang)).join(", ")) : R.complet,
      prefs.limite_paris_jour === 0 ? R.gf0 : R.gf(prefs.limite_paris_jour), L.mention);
  }
  const bks = !BOOKMAKERS_AGREES[prefs.pays] ? "aucun tant que ton pays n'est pas ouvert ou pas indiqué"
    : prefs.bookmakers.length ? prefs.bookmakers.map((b) => nomBookmaker(b, prefs.pays)).join(", ") : `tous ceux que nous suivons (${bookmakersSuivis(prefs.pays).map((b) => nomBookmaker(b, prefs.pays)).join(", ")})`;
  return `<b>Tes réglages</b>\nPays : ${prefs.pays === PAYS_INCONNU ? "pas encore indiqué (formulaire de ton espace Pro)" : esc(prefs.pays)}\nTes bookmakers : ${esc(bks)}\nTes compétitions (pour info) : ${prefs.competitions?.length ? esc(prefs.competitions.map((k) => nomCompetition(k)).join(", ")) : "toutes (pas de liste à part)"}\nGarde-fou : ${prefs.limite_paris_jour === 0 ? "0 (plus rien aujourd'hui)" : `${pluriel(prefs.limite_paris_jour, "pari")} par jour`}\n\n${MENTION_MENU}\n\nAppuie sur un bouton pour changer.`;
}
/** Bouton de /reglages qui relance les questions de l'accueil (pays, bookmakers, competitions, types, alertes). */
const REFAIRE = { fr: "Refaire mes choix (pays, bookmakers, compétitions, alertes, heure)", es: "Rehacer mis elecciones (país, casas, competiciones, alertas, hora)", en: "Redo my choices (country, bookmakers, competitions, alerts, time)",
  de: "Auswahl neu treffen (Land, Buchmacher, Wettbewerbe, Hinweise, Uhrzeit)", it: "Rifai le mie scelte (paese, bookmaker, competizioni, avvisi, orario)", pt: "Refazer as minhas escolhas (país, casas, competições, alertas, hora)" };
export function clavierReglages(prefs, page = "principal", lang = "fr") {
  const k = clavierReglagesBase(prefs, page, lang);
  if (page !== "bk") k.inline_keyboard.push([{ text: REFAIRE[estFrancais(lang) ? "fr" : textes(lang).code] || REFAIRE.fr, callback_data: "ac:go" }]);
  return k;
}
function clavierReglagesBase(prefs, page = "principal", lang = "fr") {
  const R = estFrancais(lang) ? null : textes(lang).reglages;
  if (page === "bk") {
    const rows = (BOOKMAKERS_AGREES[prefs.pays] || []).filter((b) => b.suivi).map((b) => ({ text: `${prefs.bookmakers.includes(b.cle) ? "✓ " : ""}${b.nom}`, callback_data: `rg:b:${b.cle}` }));
    const out = [];
    for (let i = 0; i < rows.length; i += 2) out.push(rows.slice(i, i + 2));
    out.push([{ text: R ? R.termine : "Terminé", callback_data: "rg:p:principal" }]);
    return { inline_keyboard: out };
  }
  if (R) {
    const rows = Object.keys(NOMS_ALERTES).map((k) => [{ text: `${prefs.alertes[k] ? R.oui : R.non} · ${R.alertes[k]}`, callback_data: `rg:a:${k}` }]);
    rows.push([{ text: R.gfMoins, callback_data: "rg:l:-" }, { text: R.parJour(prefs.limite_paris_jour), callback_data: "rg:p:principal" }, { text: R.gfPlus, callback_data: "rg:l:+" }]);
    rows.push([{ text: R.mesBk, callback_data: "rg:p:bk" }]);
    rows.push([{ text: R.langue, callback_data: "lg:menu" }]);
    return { inline_keyboard: rows };
  }
  const rows = Object.keys(NOMS_ALERTES).map((k) => [{ text: `${prefs.alertes[k] ? "Oui" : "Non"} · ${NOMS_ALERTES[k]}`, callback_data: `rg:a:${k}` }]);
  rows.push([{ text: "Garde-fou −1", callback_data: "rg:l:-" }, { text: `${prefs.limite_paris_jour} / jour`, callback_data: "rg:p:principal" }, { text: "Garde-fou +1", callback_data: "rg:l:+" }]);
  rows.push([{ text: "Mes bookmakers", callback_data: "rg:p:bk" }]);
  rows.push([{ text: "Langue : Français", callback_data: "lg:menu" }]);
  return { inline_keyboard: rows };
}
/**
 * Applique un clic de reglage : renvoie les colonnes de pro_preferences a ecrire (format du
 * formulaire du site : alertes et bookmakers en listes). Une seule source : ce que l'abonne change
 * ici ou sur le site est la MEME valeur, et la derniere ecrite compte. {} = rien a ecrire.
 */
export function appliquerReglage(prefs, data) {
  const patch = {};
  const [, t, v] = String(data).split(":");
  if (t === "a" && v in prefs.alertes) patch.alertes = ALERTES.filter((k) => (k === v ? !prefs.alertes[k] : prefs.alertes[k]));
  if (t === "l") patch.limite_paris_jour = Math.max(0, Math.min(50, prefs.limite_paris_jour + (v === "+" ? 1 : -1)));
  // Les bookmakers agrees que nous ne suivons pas encore (choisis sur le site) sont gardes.
  if (t === "b" && bookmakersSuivis(prefs.pays).includes(v))
    patch.bookmakers = [...(prefs.bookmakers.includes(v) ? prefs.bookmakers.filter((x) => x !== v) : [...prefs.bookmakers, v]), ...(prefs.bookmakers_non_suivis || [])];
  // « rg:s » (ancien bouton « Suivre mes choix ») : ignore, la strategie n'existe plus (memes paris pour tous).
  return patch;
}
export const AIDE_ROBOT = "Je suis ton robot IASHARK. Ce que je sais faire :\n"
  + "• /programme : ton programme du jour, avec tes bookmakers\n"
  + "• /reglages : tes bookmakers, tes alertes, ton garde-fou\n"
  + "• /lotofoot : notre grille Loto Foot à tenter, quand il y en a une\n"
  + "• /langue : changer de langue (Español, English, Deutsch, Italiano, Português)";
/** Aide du robot dans la langue de l'abonne. */
export const aideRobot = (lang = "fr") => (estFrancais(lang) ? AIDE_ROBOT : textes(lang).aide);
