// IASHARK — MARCHES DU FLUX DE COTES API-FOOTBALL (03/10/2026). Logique PURE : aucun appel reseau,
// aucun module Node (charge aussi par l'Edge Function telegram-bot via canal-pro.mjs).
//
// Le flux de cotes d'API-Football (releve chaque jour, table odds_snapshots, raw_odds :
// bookmakers[].bets[].values[]) donne environ 70 marches par match. Ce module :
//   1. lit ce flux (lireFlux) ;
//   2. regroupe chaque marche en issues qui s'excluent et couvrent tous les cas (groupes) ;
//   3. retire la marge du bookmaker de REFERENCE (bet365) par la methode puissance, la meme que le
//      Canal Pro (canal-pro-menu.mjs#sansMargePuissance) ; double chance : somme de deux issues du
//      resultat du match sans marge (jamais la cote double chance « deviggee » seule) ;
//   4. controle face a Pinnacle quand Pinnacle cote le meme marche : ecart trop grand = selection ecartee ;
//   5. ne garde QUE les marches de la liste blanche config/marches-valides.json (remplie par le
//      mathematicien) ;
//   6. regle un pari de ces marches a partir des faits du match (score final, score a la pause,
//      corners, cartons) : reglerFlux.
// Aucun nouveau modele : la chance d'un pari est la cote sans marge du bookmaker de reference.
// La chance AFFICHEE (entier, %) est arrondie par lib/chance-iashark.js#chanceIashark chez l'appelant
// (canal-pro-menu.mjs, pipeline) : ce module rend des fractions.
// Buteur (« Anytime Goal Scorer ») : fonction a part chanceButeurFlux, DESACTIVEE tant que
// config/marches-valides.json#buteur_actif n'est pas vrai (validation du mathematicien).
// Tests : tests/marches-flux.test.mjs.

const ok = (x) => typeof x === "number" && isFinite(x);
const coteLue = (x) => { const v = Number(String(x ?? "").replace(",", ".")); return v > 1 && v < 200 ? v : NaN; };
const fr = (x) => String(Number(x)).replace(".", ",");
/** « Bet365 », « William Hill » -> « bet365 », « williamhill ». */
export const cleBookmaker = (nom) => String(nom ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Nom affiche d'un bookmaker du flux. */
export const NOMS_BOOKMAKERS = Object.freeze({ bet365: "bet365", pinnacle: "Pinnacle", betano: "Betano", williamhill: "William Hill", marathonbet: "Marathonbet", "1xbet": "1xBet", betfair: "Betfair", betvictor: "BetVictor", sbo: "SBO" });
export const nomBookmakerFlux = (cle) => NOMS_BOOKMAKERS[cle] || cle;

// ------------------------------------------------------------------ marge retiree (methode puissance)
/** Meme calcul que canal-pro-menu.mjs#sansMargePuissance : somme des (1/cote)^k = 1. */
export function sansMargePuissance(cotes) {
  if (!Array.isArray(cotes) || !cotes.every((o) => ok(o) && o > 1)) return null;
  const inv = cotes.map((o) => 1 / o);
  const f = (k) => inv.reduce((s, x) => s + x ** k, 0) - 1;
  let lo = 0.2, hi = 5;
  if (f(lo) < 0 || f(hi) > 0) return null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  const k = (lo + hi) / 2;
  return inv.map((x) => x ** k);
}
/** Exposant k de la methode puissance pour un marche (null si illisible). */
export function exposantPuissance(cotes) {
  const q = sansMargePuissance(cotes);
  if (!q) return null;
  return Math.log(q[0]) / Math.log(1 / cotes[0]);
}

// ------------------------------------------------------------------ catalogue des marches
// type : « issues » (liste fermee), « ligne » (Over/Under X.5 : seules les demi-lignes, jamais de
// remboursement), « resultat_ligne » (Home/Over 2.5…), « buts_btts » (o/yes 2.5…), « dc » (double
// chance tiree du resultat), « buteur » (fonction a part). periode : mt1, mt2 ou match (temps reglementaire).
// stat : buts, corners, cartons ; equipe : dom, ext, ou rien (les deux).
const I1N2 = ["Home", "Draw", "Away"], OUI_NON = ["Yes", "No"];
export const CATALOGUE = Object.freeze({
  1: { bet: "Match Winner", nom: "Résultat du match", type: "issues", issues: I1N2 },
  2: { bet: "Home/Away", nom: "Vainqueur (nul remboursé)", type: "issues", issues: ["Home", "Away"], nulRembourse: true },
  3: { bet: "Second Half Winner", nom: "Résultat de la 2e mi-temps", type: "issues", issues: I1N2, periode: "mt2" },
  13: { bet: "First Half Winner", nom: "Résultat de la 1re mi-temps", type: "issues", issues: I1N2, periode: "mt1" },
  8: { bet: "Both Teams Score", nom: "Les deux équipes marquent", type: "issues", issues: OUI_NON },
  34: { bet: "Both Teams Score - First Half", nom: "Les deux équipes marquent en 1re mi-temps", type: "issues", issues: OUI_NON, periode: "mt1" },
  35: { bet: "Both Teams To Score - Second Half", nom: "Les deux équipes marquent en 2e mi-temps", type: "issues", issues: OUI_NON, periode: "mt2" },
  21: { bet: "Odd/Even", nom: "Nombre de buts pair ou impair", type: "issues", issues: ["Odd", "Even"] },
  27: { bet: "Clean Sheet - Home", nom: "Domicile n'encaisse pas de but", type: "issues", issues: OUI_NON, equipe: "dom" },
  28: { bet: "Clean Sheet - Away", nom: "Extérieur n'encaisse pas de but", type: "issues", issues: OUI_NON, equipe: "ext" },
  24: { bet: "Results/Both Teams Score", nom: "Résultat et les deux équipes marquent", type: "issues", issues: ["Home/Yes", "Draw/Yes", "Away/Yes", "Home/No", "Draw/No", "Away/No"], memeMatch: true },
  12: { bet: "Double Chance", nom: "Double chance", type: "dc", base: 1 },
  20: { bet: "Double Chance - First Half", nom: "Double chance (1re mi-temps)", type: "dc", base: 13, periode: "mt1" },
  5: { bet: "Goals Over/Under", nom: "Nombre de buts", type: "ligne", stat: "buts" },
  6: { bet: "Goals Over/Under First Half", nom: "Nombre de buts en 1re mi-temps", type: "ligne", stat: "buts", periode: "mt1" },
  26: { bet: "Goals Over/Under - Second Half", nom: "Nombre de buts en 2e mi-temps", type: "ligne", stat: "buts", periode: "mt2" },
  16: { bet: "Total - Home", nom: "Buts de l'équipe à domicile", type: "ligne", stat: "buts", equipe: "dom" },
  17: { bet: "Total - Away", nom: "Buts de l'équipe à l'extérieur", type: "ligne", stat: "buts", equipe: "ext" },
  45: { bet: "Corners Over Under", nom: "Nombre de corners", type: "ligne", stat: "corners" },
  57: { bet: "Home Corners Over/Under", nom: "Corners de l'équipe à domicile", type: "ligne", stat: "corners", equipe: "dom" },
  58: { bet: "Away Corners Over/Under", nom: "Corners de l'équipe à l'extérieur", type: "ligne", stat: "corners", equipe: "ext" },
  80: { bet: "Cards Over/Under", nom: "Nombre de cartons", type: "ligne", stat: "cartons" },
  82: { bet: "Home Team Total Cards", nom: "Cartons de l'équipe à domicile", type: "ligne", stat: "cartons", equipe: "dom" },
  83: { bet: "Away Team Total Cards", nom: "Cartons de l'équipe à l'extérieur", type: "ligne", stat: "cartons", equipe: "ext" },
  25: { bet: "Result/Total Goals", nom: "Résultat et nombre de buts", type: "resultat_ligne", memeMatch: true },
  49: { bet: "Total Goals/Both Teams To Score", nom: "Nombre de buts et les deux équipes marquent", type: "buts_btts", memeMatch: true },
  92: { bet: "Anytime Goal Scorer", nom: "Buteur (à n'importe quel moment)", type: "buteur" },
});
/** Marches « meme match » : le bookmaker cote lui-meme la combinaison (jamais un produit de deux chances). */
export const MEME_MATCH = Object.freeze(Object.keys(CATALOGUE).filter((k) => CATALOGUE[k].memeMatch).map(Number));
/** Identifiant API-Football d'un marche, depuis son id ou son nom (« Result/Total Goals »). */
export function idMarche(x) {
  if (x == null) return null;
  if (CATALOGUE[Number(x)]) return Number(x);
  const n = String(x).trim().toLowerCase();
  const k = Object.keys(CATALOGUE).find((id) => CATALOGUE[id].bet.toLowerCase() === n);
  return k ? Number(k) : null;
}

// ------------------------------------------------------------------ lecture du flux
/** raw_odds (API-Football) -> { cleBookmaker: { betId: [{ value, odd }] } } (cotes hors ]1 ; 200[ ignorees). */
export function lireFlux(raw) {
  const out = {};
  const bks = Array.isArray(raw?.bookmakers) ? raw.bookmakers : Array.isArray(raw?.response?.[0]?.bookmakers) ? raw.response[0].bookmakers : [];
  for (const b of bks) {
    const cle = cleBookmaker(b?.name);
    if (!cle) continue;
    const rec = (out[cle] ||= {});
    for (const bet of b.bets || []) {
      const id = Number(bet?.id);
      if (!CATALOGUE[id] || CATALOGUE[id].bet.toLowerCase() !== String(bet.name || "").toLowerCase()) continue; // id et nom doivent concorder
      rec[id] = (bet.values || []).map((v) => ({ value: String(v?.value ?? "").trim(), odd: coteLue(v?.odd) })).filter((v) => v.value && ok(v.odd));
    }
  }
  return out;
}
const demiLigne = (l) => ok(l) && Math.abs(l * 2 - Math.round(l * 2)) < 1e-9 && Math.round(l * 2) % 2 === 1; // 2,5 oui ; 2 ou 2,25 non
/**
 * Un marche d'un bookmaker -> groupes d'issues completes : [{ ligne (ou null), issues: [{ value, odd }] }].
 * Un groupe incomplet (une issue manque) est ignore : on ne retire jamais la marge d'un marche partiel.
 */
export function groupes(betId, values) {
  const c = CATALOGUE[betId];
  if (!c || !Array.isArray(values)) return [];
  const par = (cle) => new Map(values.map((v) => [cle(v), v]));
  if (c.type === "issues") {
    const m = par((v) => v.value.toLowerCase());
    const is = c.issues.map((x) => m.get(x.toLowerCase()));
    return is.every(Boolean) ? [{ ligne: null, issues: is }] : [];
  }
  const lignes = new Map();
  const ajouter = (l, cle, v) => { if (!demiLigne(l)) return; if (!lignes.has(l)) lignes.set(l, new Map()); lignes.get(l).set(cle, v); };
  let ordre = null;
  if (c.type === "ligne") {
    ordre = ["over", "under"];
    for (const v of values) { const r = /^(over|under)\s+(\d+(?:\.\d+)?)$/i.exec(v.value); if (r) ajouter(Number(r[2]), r[1].toLowerCase(), v); }
  } else if (c.type === "resultat_ligne") {
    ordre = ["home/over", "draw/over", "away/over", "home/under", "draw/under", "away/under"];
    for (const v of values) { const r = /^(home|draw|away)\/(over|under)\s+(\d+(?:\.\d+)?)$/i.exec(v.value); if (r) ajouter(Number(r[3]), `${r[1]}/${r[2]}`.toLowerCase(), v); }
  } else if (c.type === "buts_btts") {
    ordre = ["o/yes", "o/no", "u/yes", "u/no"];
    for (const v of values) { const r = /^([ou])\/(yes|no)\s+(\d+(?:\.\d+)?)$/i.exec(v.value); if (r) ajouter(Number(r[3]), `${r[1]}/${r[2]}`.toLowerCase(), v); }
  } else return [];
  const out = [];
  for (const [l, m] of [...lignes.entries()].sort((a, b) => a[0] - b[0])) {
    const is = ordre.map((k) => m.get(k));
    if (is.every(Boolean)) out.push({ ligne: l, issues: is });
  }
  return out;
}
const DC_BASE = { "home/draw": [0, 1], "draw/away": [1, 2], "home/away": [0, 2] };
/**
 * Chances sans marge d'un bookmaker pour un marche : [{ value, ligne, odd, chance }], ou [].
 * Double chance : chance = somme de deux issues du resultat (marche « base ») sans marge ; cote = la VRAIE
 * cote double chance du bookmaker.
 */
export function chancesBookmaker(flux, bk, betId) {
  const c = CATALOGUE[betId], rec = flux?.[bk];
  if (!c || !rec) return [];
  if (c.type === "dc") {
    const base = groupes(c.base, rec[c.base])[0];
    const q = base ? sansMargePuissance(base.issues.map((v) => v.odd)) : null;
    if (!q) return [];
    return (rec[betId] || []).map((v) => { const ij = DC_BASE[v.value.toLowerCase()]; return ij ? { value: v.value, ligne: null, odd: v.odd, chance: q[ij[0]] + q[ij[1]] } : null; }).filter(Boolean);
  }
  if (c.type === "buteur") return [];
  const out = [];
  for (const g of groupes(betId, rec[betId])) {
    const q = sansMargePuissance(g.issues.map((v) => v.odd));
    if (q) g.issues.forEach((v, i) => out.push({ value: v.value, ligne: g.ligne, odd: v.odd, chance: q[i] }));
  }
  return out;
}

// ------------------------------------------------------------------ libelles en francais simple
const nomIssue = (x, dom, ext) => ({ home: `${dom} gagne`, draw: "match nul", away: `${ext} gagne` })[x];
const SUFFIXE = { mt1: " (1re mi-temps)", mt2: " (2e mi-temps)" };
const MOT_STAT = { buts: ["but", "buts"], corners: ["corner", "corners"], cartons: ["carton", "cartons"] };
/** Le pari en clair : « Lens gagne et plus de 2,5 buts dans le match ». */
export function libelleFlux(betId, value, dom = "Domicile", ext = "Extérieur") {
  const c = CATALOGUE[betId];
  if (!c) return String(value);
  const v = String(value).trim(), lv = v.toLowerCase();
  const suf = SUFFIXE[c.periode] || "";
  const eq = c.equipe === "dom" ? dom : c.equipe === "ext" ? ext : null;
  switch (c.type) {
    case "issues": {
      if (betId === 1 || betId === 3 || betId === 13) return `${nomIssue(lv, dom, ext)}${suf}`;
      if (betId === 2) return `${lv === "home" ? dom : ext} gagne (remboursé si match nul)`;
      if (betId === 8 || betId === 34 || betId === 35) return (lv === "yes" ? "les deux équipes marquent" : "au moins une équipe ne marque pas") + suf;
      if (betId === 21) return lv === "odd" ? "nombre de buts impair" : "nombre de buts pair";
      if (betId === 27 || betId === 28) return lv === "yes" ? `${eq} n'encaisse aucun but` : `${eq} encaisse au moins un but`;
      if (betId === 24) {
        const [r, b] = lv.split("/");
        if (r === "draw" && b === "no") return "match nul 0-0";
        return `${nomIssue(r, dom, ext)} et ${b === "yes" ? "les deux équipes marquent" : "au moins une équipe ne marque pas"}`;
      }
      return v;
    }
    case "dc": return `${({ "home/draw": `${dom} ou match nul`, "draw/away": `match nul ou ${ext}`, "home/away": `${dom} ou ${ext}` })[lv] || v}${suf}`;
    case "ligne": {
      const r = /^(over|under)\s+([\d.]+)$/.exec(lv);
      if (!r) return v;
      const [un, plusieurs] = MOT_STAT[c.stat];
      const l = Number(r[2]), mot = l < 2 ? un : plusieurs;
      const quoi = `${r[1] === "over" ? "plus" : "moins"} de ${fr(l)} ${mot}`;
      return eq ? `${eq} : ${quoi}${suf}` : `${quoi} dans le match${suf}`;
    }
    case "resultat_ligne": {
      const r = /^(home|draw|away)\/(over|under)\s+([\d.]+)$/.exec(lv);
      return r ? `${nomIssue(r[1], dom, ext)} et ${r[2] === "over" ? "plus" : "moins"} de ${fr(r[3])} buts dans le match` : v;
    }
    case "buts_btts": {
      const r = /^([ou])\/(yes|no)\s+([\d.]+)$/.exec(lv);
      return r ? `${r[1] === "o" ? "plus" : "moins"} de ${fr(r[3])} buts et ${r[2] === "yes" ? "les deux équipes marquent" : "au moins une équipe ne marque pas"}` : v;
    }
    case "buteur": return `${v} marque (à n'importe quel moment)`;
  }
  return v;
}
/** Code stable d'une selection du flux : « F25:Home/Over 2.5 ». */
export const codeFlux = (betId, value) => `F${betId}:${value}`;
export function lireCode(code) {
  const r = /^F(\d+):(.+)$/.exec(String(code ?? ""));
  return r && CATALOGUE[Number(r[1])] ? { bet_id: Number(r[1]), value: r[2] } : null;
}
/** Code du menu historique (1N2, double chance, buts 2,5) quand la selection existe aussi chez The Odds API. */
export function marcheMenu(betId, value, ligne) {
  const lv = String(value).toLowerCase();
  if (betId === 1) return { home: "1", draw: "N", away: "2" }[lv] || null;
  if (betId === 12) return { "home/draw": "1X", "draw/away": "X2", "home/away": "12" }[lv] || null;
  if (betId === 5 && Number(ligne) === 2.5) return lv.startsWith("over") ? "O25" : lv.startsWith("under") ? "U25" : null;
  return null;
}

// ------------------------------------------------------------------ liste blanche
/** Config (config/marches-valides.json) -> { reference, controle, ecart_max_pinnacle, marches: Map(betId -> { lignes, ligues }) }. */
export function lireConfig(config) {
  const c = config && typeof config === "object" ? config : {};
  const marches = new Map();
  for (const m of Array.isArray(c.marches) ? c.marches : []) {
    const id = idMarche(m?.bet_id ?? m?.bet ?? m);
    if (!id || CATALOGUE[id].type === "buteur") continue; // le buteur a sa propre fonction et son propre interrupteur
    // chance (facultatif) : [min, max] = seules tranches de chance validees par le mathematicien (ex. [0.5, 0.7]).
    const ch = Array.isArray(m?.chance) && m.chance.length === 2 && m.chance.every((x) => Number.isFinite(Number(x))) ? m.chance.map(Number) : null;
    marches.set(id, { lignes: Array.isArray(m?.lignes) ? m.lignes.map(Number).filter(ok) : null, ligues: Array.isArray(m?.ligues) ? m.ligues.map(String) : null, chance: ch });
  }
  return {
    reference: cleBookmaker(c.reference || "bet365"),
    controle: cleBookmaker(c.controle || "pinnacle"),
    ecart_max_pinnacle: ok(Number(c.ecart_max_pinnacle)) ? Number(c.ecart_max_pinnacle) : 0.08,
    age_max_releve_h: ok(Number(c.age_max_releve_h)) ? Number(c.age_max_releve_h) : 12,
    buteur_actif: c.buteur_actif === true,
    meme_match: { cote_min: Number(c.meme_match?.cote_min) || 1.4, cote_max: Number(c.meme_match?.cote_max) || 4 },
    marches,
  };
}

/**
 * Selections d'un match sur les marches de la liste blanche. Chance = cote sans marge du bookmaker de
 * reference (bet365) ; controle Pinnacle quand il cote le meme marche (ecart > ecart_max : ecartee).
 * -> { selections: [{ code, bet_id, bet, value, ligne, libelle, marche_menu, meme_match, bookmaker, cote,
 *      chance, pinnacle: { chance, cote } | null }], ecartees: [{ code, raison }] }.
 */
export function selectionsDuMatch(raw, { config, dom = "Domicile", ext = "Extérieur", ligue = null } = {}) {
  const cfg = config && config.marches instanceof Map ? config : lireConfig(config);
  const flux = lireFlux(raw);
  const selections = [], ecartees = [];
  if (!flux[cfg.reference]) return { selections, ecartees };
  for (const [betId, regle] of cfg.marches) {
    if (regle.ligues && ligue != null && !regle.ligues.includes(String(ligue))) continue;
    const pin = chancesBookmaker(flux, cfg.controle, betId);
    for (const s of chancesBookmaker(flux, cfg.reference, betId)) {
      if (regle.lignes && !regle.lignes.some((l) => Math.abs(l - s.ligne) < 1e-9)) continue;
      if (regle.chance && (s.chance < regle.chance[0] - 1e-12 || s.chance > regle.chance[1] + 1e-12)) continue; // hors des tranches validees
      const code = codeFlux(betId, s.value);
      const p = pin.find((x) => x.value === s.value && (x.ligne ?? null) === (s.ligne ?? null));
      if (p && Math.abs(p.chance - s.chance) > cfg.ecart_max_pinnacle + 1e-12) {
        ecartees.push({ code, raison: `écart trop grand avec Pinnacle (${Math.round(s.chance * 100)} % contre ${Math.round(p.chance * 100)} %)` });
        continue;
      }
      selections.push({ code, bet_id: betId, bet: CATALOGUE[betId].bet, value: s.value, ligne: s.ligne, libelle: libelleFlux(betId, s.value, dom, ext),
        marche_menu: marcheMenu(betId, s.value, s.ligne), meme_match: !!CATALOGUE[betId].memeMatch, bookmaker: cfg.reference, cote: s.odd, chance: s.chance,
        pinnacle: p ? { chance: p.chance, cote: p.odd } : null });
    }
  }
  return { selections, ecartees };
}
/** Cote actuelle d'une selection (dernier controle) : { cote, chance, pinnacle } ou null si le marche a disparu. */
export function etatSelection(raw, code, { config } = {}) {
  const cfg = config && config.marches instanceof Map ? config : lireConfig(config);
  const x = lireCode(code);
  if (!x) return null;
  const flux = lireFlux(raw);
  const s = chancesBookmaker(flux, cfg.reference, x.bet_id).find((v) => v.value === x.value);
  if (!s) return null;
  const p = chancesBookmaker(flux, cfg.controle, x.bet_id).find((v) => v.value === x.value);
  return { bookmaker: cfg.reference, cote: s.odd, chance: s.chance, pinnacle: p ? { chance: p.chance, cote: p.odd } : null,
    controle_ok: !p || Math.abs(p.chance - s.chance) <= cfg.ecart_max_pinnacle + 1e-12 };
}

// ------------------------------------------------------------------ buteur (DESACTIVE tant que non valide)
/**
 * Chance sans marge d'un buteur « Anytime Goal Scorer » chez le bookmaker de reference. Le marche buteur
 * n'est pas une liste fermee (plusieurs joueurs peuvent marquer) : la marge est retiree par la methode
 * puissance avec l'exposant du resultat du match du MEME bookmaker. PROVISOIRE : null tant que
 * config.buteur_actif n'est pas vrai (validation du mathematicien). Rend une fraction ; l'arrondi affiche
 * (vers le bas a 5 points, plafond 45 %, rien sous 10 %) est lib/chance-iashark.js#chanceButeur.
 */
export function chanceButeurFlux(raw, joueur, { config } = {}) {
  const cfg = config && config.marches instanceof Map ? config : lireConfig(config);
  if (!cfg.buteur_actif) return null;
  const flux = lireFlux(raw), rec = flux[cfg.reference];
  if (!rec || !rec[92]) return null;
  const nom = String(joueur ?? "").trim().toLowerCase();
  const v = rec[92].find((x) => x.value.toLowerCase() === nom);
  const base = groupes(1, rec[1])[0];
  const k = base ? exposantPuissance(base.issues.map((x) => x.odd)) : null;
  if (!v || !ok(k)) return null;
  const p = (1 / v.odd) ** k;
  return p > 0 && p < 1 ? p : null;
}

// ------------------------------------------------------------------ reglement
/**
 * Faits du match -> resultat d'une selection du flux : « gagne », « perdu », « rembourse » ou null (fait
 * manquant : on attend, jamais un resultat devine). faits = { ft: [dom, ext], ht: [dom, ext] | null,
 * corners: [dom, ext] | null, cartons: [dom, ext] | null } (temps reglementaire). Cartons : jaunes + rouges
 * (regle a confirmer par le trader de cotes, chaque bookmaker a la sienne).
 */
export function reglerFlux(code, faits) {
  const x = lireCode(code);
  if (!x || !faits) return null;
  const c = CATALOGUE[x.bet_id], lv = x.value.toLowerCase();
  const paire = (a) => (Array.isArray(a) && a.length === 2 && a.every((n) => Number.isInteger(n)) ? a : null);
  const ft = paire(faits.ft), ht = paire(faits.ht);
  let sc = null;
  if (c.stat === "corners") sc = paire(faits.corners);
  else if (c.stat === "cartons") sc = paire(faits.cartons);
  else if (c.periode === "mt1") sc = ht;
  else if (c.periode === "mt2") sc = ft && ht ? [ft[0] - ht[0], ft[1] - ht[1]] : null;
  else sc = ft;
  if (!sc) return null;
  const [d, e] = sc, t = d + e;
  const res = (b) => (b ? "gagne" : "perdu");
  const issue1n2 = d > e ? "home" : d === e ? "draw" : "away";
  switch (c.type) {
    case "issues":
      if ([1, 3, 13].includes(x.bet_id)) return res(lv === issue1n2);
      if (x.bet_id === 2) return d === e ? "rembourse" : res(lv === issue1n2);
      if ([8, 34, 35].includes(x.bet_id)) return res((d > 0 && e > 0) === (lv === "yes"));
      if (x.bet_id === 21) return res((t % 2 === 1) === (lv === "odd"));
      if (x.bet_id === 27) return res((e === 0) === (lv === "yes"));
      if (x.bet_id === 28) return res((d === 0) === (lv === "yes"));
      if (x.bet_id === 24) { const [r, b] = lv.split("/"); return res(r === issue1n2 && (d > 0 && e > 0) === (b === "yes")); }
      return null;
    case "dc": { const ij = { "home/draw": ["home", "draw"], "draw/away": ["draw", "away"], "home/away": ["home", "away"] }[lv]; return ij ? res(ij.includes(issue1n2)) : null; }
    case "ligne": {
      const r = /^(over|under)\s+([\d.]+)$/.exec(lv);
      if (!r) return null;
      const n = c.equipe === "dom" ? d : c.equipe === "ext" ? e : t;
      return res(r[1] === "over" ? n > Number(r[2]) : n < Number(r[2]));
    }
    case "resultat_ligne": {
      const r = /^(home|draw|away)\/(over|under)\s+([\d.]+)$/.exec(lv);
      return r ? res(r[1] === issue1n2 && (r[2] === "over" ? t > Number(r[3]) : t < Number(r[3]))) : null;
    }
    case "buts_btts": {
      const r = /^([ou])\/(yes|no)\s+([\d.]+)$/.exec(lv);
      return r ? res((r[1] === "o" ? t > Number(r[3]) : t < Number(r[3])) && (d > 0 && e > 0) === (r[2] === "yes")) : null;
    }
  }
  return null;
}
/** Le pari a besoin de quels faits ? (« buts », « corners », « cartons ») — pour aller chercher les statistiques. */
export const statDuCode = (code) => { const x = lireCode(code); return x ? CATALOGUE[x.bet_id].stat || "buts" : null; };
