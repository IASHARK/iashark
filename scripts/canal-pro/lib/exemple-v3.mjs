// EXEMPLES FICTIFS pour les tests et la repetition generale du Canal Pro : une
// sortie du moteur v3 (contrat 1.1) et les cotes The Odds API qui vont avec.
// Les chances sont calculees avec la MEME grille des scores que le menu
// (Dixon-Coles) ; les cotes sont inventees (marge des bookmakers ajoutee). Aucun
// de ces chiffres n'est un vrai pronostic : ne jamais les publier.
import * as M from "../../../supabase/functions/_shared/canal-pro-menu.mjs";

const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;
export const SPORT = { SP1: "soccer_spain_la_liga", D1: "soccer_germany_bundesliga", I1: "soccer_italy_serie_a", F1: "soccer_france_ligue_one", N1: "soccer_netherlands_eredivisie", P1: "soccer_portugal_primeira_liga" };

/** Cotes d'un bookmaker a partir de chances justes : marge repartie en proportion. */
export const cotesAvecMarge = (p, marge) => p.map((x) => r2(1 / (x * marge)));

/**
 * Un match au format du contrat 1.1 du moteur v3.
 * ko : heure UTC ISO ; lh, la, rho : buts attendus et correction des petits scores ;
 * buteurs : [{ equipe, joueur, joueur_id, p_marque, statut? }].
 */
export function matchV3({ id, ligue_code, dom, ext, ko, lh, la, rho = -0.08, fixture, eligible = true, buteurs = [], marge = 1.055 }) {
  const g = M.grille(lh, la, rho);
  const { p1, pn, p2 } = M.probas1n2(g);
  const [o1, on, o2] = cotesAvecMarge([p1, pn, p2], marge);
  const dc = (a, b) => r2(1 / (1 / a + 1 / b));
  const mk = (cle, libelle, p, cote, famille) => ({ cle, famille, libelle_fr: libelle, probabilite: r4(p), cote_juste: r2(1 / p), cote_disponible: cote,
    source_cote: famille === "DC" ? "reconstituée depuis 1N2" : "moyenne bookmakers avant-match (football-data)", etiquette: "vérifié sur le passé",
    fiabilite_marche: "vérifié sur le passé", eligible_vip: eligible, avantage: "non prouvé" });
  return {
    match_id: id, ligue_code, ligue: M.MENU.ligues[ligue_code], competition_type: "championnat", date: ko.slice(0, 10), heure_source: ko.slice(11, 16),
    domicile: dom, exterieur: ext, ids_api_football: fixture ? { fixture, ligue: 0, domicile: 0, exterieur: 0 } : null,
    coup_envoi_utc: `${ko.slice(0, 10)} ${ko.slice(11, 19)}+00:00`, probabilite_source: "calcul IASHARK (modèle et cotes d'avant-match)", couverture: "vérifiée",
    fiabilite: { score: 90, niveau: "vérifié sur le passé", methode: "modèle + marché" }, eligible_vip: eligible,
    buts_attendus: { domicile: lh, exterieur: la, rho },
    marches: [mk("1N2:1", `Victoire ${dom}`, p1, o1, "1N2"), mk("1N2:N", "Match nul", pn, on, "1N2"), mk("1N2:2", `Victoire ${ext}`, p2, o2, "1N2"),
      mk("DC:1N", `${dom} ou nul`, p1 + pn, dc(o1, on), "DC"), mk("DC:12", `${dom} ou ${ext}`, p1 + p2, dc(o1, o2), "DC"), mk("DC:N2", `Nul ou ${ext}`, pn + p2, dc(on, o2), "DC")],
    buteurs: buteurs.map((b) => ({ poste: "F", minutes_probables: 85, statut: "titulaire probable", lambda: -Math.log(1 - b.p_marque), p_premier_buteur: null, tireur_penalty: false,
      etiquette: "logique installée, pas encore vérifié", ...b })),
  };
}
export function sortieV3(matchs, genere_le) {
  return { contrat_version: "1.1", moteur_version: "3.0.0+exemple", genere_le, reglages: {}, interrupteur_urgence: false, matchs };
}
const BOOKS = [["pinnacle", "Pinnacle", 1.03], ["betclic_fr", "Betclic (FR)", 1.075], ["winamax_fr", "Winamax (FR)", 1.065], ["unibet_fr", "Unibet (FR)", 1.08], ["pmu_fr", "PMU (FR)", 1.085], ["netbet_fr", "NetBet (FR)", 1.08]];
/**
 * Evenement The Odds API d'un match v3 : h2h chez Pinnacle et les 5 agrees suivis (chances du moteur,
 * leger decalage « marche » par bookmaker), et une vraie double chance chez les bookmakers de dcChez.
 */
export function evenementOdds(m, { dcChez = [], decal = 0, marches = ["h2h", "double_chance"] } = {}) {
  const g = M.grille(m.buts_attendus.domicile, m.buts_attendus.exterieur, m.buts_attendus.rho);
  const { p1, pn, p2 } = M.probas1n2(g);
  const bookmakers = BOOKS.map(([key, title, marge], i) => {
    const s = 1 + ((i % 3) - 1) * 0.012 + decal;
    const [o1, on, o2] = cotesAvecMarge([p1 * s, pn, p2 / s].map((x, _, a) => x / a.reduce((u, v) => u + v, 0)), marge);
    const mk = [];
    if (marches.includes("h2h")) mk.push({ key: "h2h", outcomes: [{ name: m.domicile, price: o1 }, { name: "Draw", price: on }, { name: m.exterieur, price: o2 }] });
    if (marches.includes("double_chance") && dcChez.includes(key)) {
      const dc = (a, b) => r2(1 / (1 / a + 1 / b) * 0.985);
      mk.push({ key: "double_chance", outcomes: [{ name: `${m.domicile}/Draw`, price: dc(o1, on) }, { name: `${m.domicile}/${m.exterieur}`, price: dc(o1, o2) }, { name: `Draw/${m.exterieur}`, price: dc(on, o2) }] });
    }
    return { key, title, markets: mk };
  });
  return { id: `ev-${m.match_id}`, sport_key: SPORT[m.ligue_code], commence_time: m.coup_envoi_utc.replace(" ", "T").replace("+00:00", "Z"), home_team: m.domicile, away_team: m.exterieur, bookmakers };
}
