// Marches du flux API-Football (03/10/2026) : retrait de marge, etiquette du bookmaker, choix du menu
// avec plusieurs marches, « meme match » (marche combine du bookmaker), reglement, buteur desactive.
import test from "node:test";
import assert from "node:assert/strict";
import * as F from "../supabase/functions/_shared/marches-flux.mjs";
import * as M from "../supabase/functions/_shared/canal-pro-menu.mjs";
import * as C from "../supabase/functions/_shared/canal-pro.mjs";

const v = (value, odd) => ({ value, odd: String(odd) });
const bet = (id, name, values) => ({ id, name, values });
function raw({ b365 = {}, pin = null } = {}) {
  const betsB365 = [
    bet(1, "Match Winner", [v("Home", b365.h ?? 1.5), v("Draw", 4.2), v("Away", 6.5)]),
    bet(12, "Double Chance", [v("Home/Draw", 1.12), v("Home/Away", 1.25), v("Draw/Away", 2.6)]),
    bet(5, "Goals Over/Under", [v("Over 1.5", 1.22), v("Under 1.5", 4.0), v("Over 2.5", b365.o25 ?? 1.75), v("Under 2.5", 2.05), v("Over 2.25", 1.6), v("Under 2.25", 2.3)]),
    bet(8, "Both Teams Score", [v("Yes", 1.9), v("No", 1.85)]),
    bet(25, "Result/Total Goals", [v("Home/Over 2.5", b365.rtg ?? 2.2), v("Draw/Over 2.5", 15), v("Away/Over 2.5", 13), v("Home/Under 2.5", 4.5), v("Draw/Under 2.5", 5.5), v("Away/Under 2.5", 12)]),
    bet(45, "Corners Over Under", [v("Over 8.5", 1.83), v("Under 8.5", 1.83)]),
    bet(92, "Anytime Goal Scorer", [v("Jonathan David", 2.6), v("Remy Labeau", 3.4)]),
  ];
  const bks = [{ id: 8, name: "Bet365", bets: betsB365 }];
  if (pin) bks.push({ id: 4, name: "Pinnacle", bets: [bet(1, "Match Winner", [v("Home", pin.h), v("Draw", pin.n), v("Away", pin.a)]), bet(45, "Corners Over Under", [v("Over 8.5", pin.co ?? 1.9), v("Under 8.5", pin.cu ?? 1.9)])] });
  return { fixture: { id: 1 }, bookmakers: bks };
}
const config = (marches, extra = {}) => F.lireConfig({ reference: "bet365", controle: "pinnacle", ecart_max_pinnacle: 0.08, marches, ...extra });

test("retrait de marge : methode puissance, somme = 1, la meme que le Canal Pro ; double chance = somme de deux issues du 1N2", () => {
  const q = F.sansMargePuissance([1.5, 4.2, 6.5]);
  assert.ok(Math.abs(q.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(q[0] < 1 / 1.5 && q[0] > 0.6, "la marge est retiree : chance < 1/cote");
  assert.equal(M.sansMargePuissance, F.sansMargePuissance, "une seule implementation pour le robot et le flux");
  const dc = F.chancesBookmaker(F.lireFlux(raw()), "bet365", 12).find((x) => x.value === "Home/Draw");
  assert.ok(Math.abs(dc.chance - (q[0] + q[1])) < 1e-12);
  assert.equal(dc.odd, 1.12, "cote affichee = la vraie cote double chance de bet365");
  // Ligne entiere ou quart de ligne (2,25) : jamais (remboursement possible), seulement les demi-lignes.
  const ou = F.chancesBookmaker(F.lireFlux(raw()), "bet365", 5);
  assert.deepEqual([...new Set(ou.map((x) => x.ligne))], [1.5, 2.5]);
  // Marche incomplet : aucune chance (jamais une marge retiree sur une partie du marche).
  assert.deepEqual(F.groupes(1, [{ value: "Home", odd: 1.5 }, { value: "Draw", odd: 4 }]), []);
});

test("liste blanche : vide = aucune selection ; seuls les marches et lignes listes ; le buteur n'y entre jamais", () => {
  assert.deepEqual(F.selectionsDuMatch(raw(), { config: config([]) }).selections, []);
  const s = F.selectionsDuMatch(raw(), { config: config([{ bet_id: 5, lignes: [2.5] }, { bet: "Both Teams Score" }, { bet_id: 92 }]), dom: "Lens", ext: "Nantes" }).selections;
  assert.deepEqual(s.map((x) => x.code).sort(), ["F5:Over 2.5", "F5:Under 2.5", "F8:No", "F8:Yes"]);
  assert.equal(s.find((x) => x.code === "F5:Over 2.5").marche_menu, "O25", "relie au marche The Odds API (cote des agrees)");
  assert.equal(s.find((x) => x.code === "F8:Yes").libelle, "les deux équipes marquent");
});

test("controle Pinnacle : ecart de plus de 8 points -> selection ecartee ; Pinnacle absent -> bet365 seul", () => {
  const cfg = config([{ bet_id: 1 }, { bet_id: 45 }]);
  const proche = F.selectionsDuMatch(raw({ pin: { h: 1.52, n: 4.4, a: 7.0 } }), { config: cfg });
  assert.equal(proche.ecartees.length, 0);
  assert.ok(proche.selections.find((x) => x.code === "F1:Home").pinnacle);
  const loin = F.selectionsDuMatch(raw({ pin: { h: 1.52, n: 4.4, a: 7.0, co: 1.4, cu: 3.0 } }), { config: cfg });
  assert.deepEqual(loin.ecartees.map((x) => x.code).sort(), ["F45:Over 8.5", "F45:Under 8.5"]);
  assert.match(loin.ecartees[0].raison, /Pinnacle/);
});

test("etiquette du bookmaker : « Cote bet365 : 1,75 », puis la cote d'un agree suivi qui propose le meme pari ; aucun lien", () => {
  const p = { famille: "simple", dom: "Lens", ext: "Nantes", ligue: "Ligue 1", coup_envoi: "2026-10-04T15:00:00Z", marche: "O25", proba: 0.55,
    source_proba: C.SOURCE_FLUX, voie: C.VOIE_FLUX, cotes: { winamax: 1.78 }, meilleure_cote: 1.78, meilleur_bookmaker: "winamax",
    composantes: { ref: { bookmaker: "bet365", cote: 1.75, releve_at: "2026-10-04T05:10:00Z" } }, cote_vue_at: "2026-10-04T07:00:00Z" };
  const texte = (ps) => { const m = C.messagesCanal("2026-10-04", ps); return [m.tete, ...m.paris.map((x) => x.html)].join("\n"); };
  const t = texte([p]);
  assert.match(t, /Cote bet365 : <b>1,75<\/b>/);
  assert.match(t, /Cote Winamax : <b>1,78<\/b>/);
  assert.match(t, /à partir de la cote bet365/);
  assert.doesNotMatch(t, /https?:|href|mise|espérance|gagn(er|ez) à coup sûr/i);
  // Sans agree : la cote bet365 seule, jamais « pas de cote ».
  const seul = C.messagesCanal("2026-10-04", [{ ...p, marche: "F45:Over 8.5", cotes: {}, meilleure_cote: 1.75, meilleur_bookmaker: "bet365" }]).paris[0].html;
  assert.match(seul, /Cote bet365 : <b>1,75<\/b>/);
  assert.match(seul, /plus de 8,5 corners dans le match/);
  assert.doesNotMatch(seul, /Winamax|pas encore relevée/);
});

// ---------- menu ----------
const KO = "2026-10-04T15:00:00.000Z", MAINTENANT = Date.parse("2026-10-04T07:00:00Z");
const matchV3 = (fx, dom, ext) => ({ match_id: `m${fx}`, ligue_code: "F1", domicile: dom, exterieur: ext, coup_envoi_utc: KO, eligible_vip: true, ids_api_football: { fixture: fx }, marches: [] });
const flux = (r) => ({ raw: r, captured_at: "2026-10-04T05:00:00Z" });

test("menu : plusieurs marches -> simples les plus probables en 1,40-2,00, UN seul pari par match, combine 2-3 jambes", () => {
  const cfg = config([{ bet_id: 1 }, { bet_id: 12 }, { bet_id: 5, lignes: [2.5] }, { bet_id: 8 }, { bet_id: 45 }]);
  const ms = [matchV3(101, "Lens", "Nantes"), matchV3(102, "Lyon", "Brest"), matchV3(103, "Lille", "Metz"), matchV3(104, "Nice", "Reims"), matchV3(105, "Rennes", "Lorient"), matchV3(106, "Toulouse", "Angers")];
  const fl = { 101: flux(raw()), 102: flux(raw({ b365: { o25: 1.45 } })), 103: flux(raw({ b365: { h: 1.62 } })), 104: flux(raw({ b365: { h: 1.3 } })), 105: flux(raw({ b365: { h: 1.25 } })), 106: flux(raw({ b365: { h: 1.38 } })) };
  const j = M.jambesFlux(M.matchsFlux(ms, []), fl, {}, { config: cfg, maintenant: MAINTENANT }).jambes;
  assert.ok(j.length > 20 && new Set(j.map((x) => x.flux.bet_id)).size === 5, "toutes les familles de marches sont candidates");
  const simples = M.choisirSimples(j);
  assert.ok(simples.length === 3);
  assert.equal(new Set(simples.map(M.cleMatch)).size, 3, "un seul pari par match");
  for (const s of simples) {
    assert.ok(s.cote_moy >= 1.4 && s.cote_moy <= 2.0, "fourchette sur la cote bet365");
    const memeMatch = j.filter((x) => M.cleMatch(x) === M.cleMatch(s) && x.cote_moy >= 1.4 && x.cote_moy <= 2.0);
    assert.ok(memeMatch.every((x) => x.proba <= s.proba), "le plus probable du match");
    assert.equal(s.ref.bookmaker, "bet365");
  }
  const menu = M.construireMenu({ jour: "2026-10-04", matchsJour: ms, cotesParMatch: {}, fluxParFixture: fl, configFlux: cfg, maintenant: MAINTENANT });
  const combo = menu.candidats.find((c) => c.famille === "combine");
  assert.ok(combo && combo.selections.length >= 2 && combo.selections.length <= 3);
  assert.ok(combo.ref && combo.ref.cote >= 1.8 && combo.ref.cote <= 2.5, "cote bet365 du combine dans 1,80-2,50");
  assert.ok(!combo.selections.some((x) => menu.candidats.filter((c) => c.famille === "simple").some((s) => M.cleMatch(s) === M.cleMatch(x))), "jamais un match deja en simple");
  // Le programme garde la cote bet365 meme sans agree (contrainte de la base : meilleure_cote non nulle).
  const prog = C.preparerProgramme(menu.candidats, { jour: "2026-10-04", maintenant: MAINTENANT });
  assert.ok(prog.paris.length >= 4);
  for (const p of prog.paris) { assert.ok(p.meilleure_cote > 1 && p.meilleur_bookmaker && p.cote_vue_at); assert.equal(C.refDe(p).bookmaker, "bet365"); }
  // Liste blanche vide : rien du flux (le robot garde ses voies actuelles).
  assert.deepEqual(M.construireMenu({ jour: "2026-10-04", matchsJour: ms, cotesParMatch: {}, fluxParFixture: fl, configFlux: config([]), maintenant: MAINTENANT }).candidats, []);
});

test("meme match (week-end) : marche combine du bookmaker (Result/Total Goals), jamais un produit de deux chances", async () => {
  const cfg = config([{ bet_id: 25, lignes: [2.5] }]);
  const r = raw({ b365: { rtg: 2.2 } });
  const ms = [matchV3(201, "PSG", "Auxerre")];
  const menu = M.construireMenu({ jour: "2026-10-04", matchsJour: ms, cotesParMatch: {}, fluxParFixture: { 201: flux(r) }, configFlux: cfg, maintenant: MAINTENANT });
  const mm = menu.candidats.find((c) => c.famille === "meme_match");
  assert.ok(mm, JSON.stringify(menu.candidats.map((c) => c.famille)));
  assert.equal(mm.flux.code, "F25:Home/Over 2.5");
  assert.equal(mm.cote_moy, 2.2, "cote bet365 de la combinaison");
  const q = F.sansMargePuissance([2.2, 15, 13, 4.5, 5.5, 12]);
  const CH = (await import("node:module")).createRequire(import.meta.url)("../lib/chance-iashark.js");
  assert.equal(mm.proba, CH.chanceIashark(q[0] * 100, null).chance / 100, "chance affichee = cote combinee sans marge, arrondie par lib/chance-iashark.js");
  const pGagne = F.chancesBookmaker(F.lireFlux(r), "bet365", 1)[0].chance, pPlus = F.chancesBookmaker(F.lireFlux(r), "bet365", 5).find((x) => x.value === "Over 2.5").chance;
  assert.ok(Math.abs(mm.proba - pGagne * pPlus) > 0.01, "pas le produit des deux chances");
  assert.equal(mm.selection ?? C.selectionTxt(mm), "PSG gagne et plus de 2,5 buts dans le match");
  assert.ok(!menu.candidats.some((c) => c.famille === "buteur"), "un seul « meme match » par jour");
  // En semaine : pas de « meme match ».
  assert.ok(!M.construireMenu({ jour: "2026-10-06", matchsJour: [{ ...ms[0], coup_envoi_utc: "2026-10-06T19:00:00Z" }], cotesParMatch: {}, fluxParFixture: { 201: flux(r) }, configFlux: cfg, maintenant: Date.parse("2026-10-06T07:00:00Z") }).candidats.some((c) => c.famille === "meme_match"));
});

test("reglement des marches du flux : score, mi-temps, corners, cartons ; fait manquant -> on attend", () => {
  const f = { ft: [2, 1], ht: [0, 1], corners: [6, 4], cartons: [2, 3] };
  assert.equal(F.reglerFlux("F25:Home/Over 2.5", f), "gagne");
  assert.equal(F.reglerFlux("F24:Home/Yes", f), "gagne");
  assert.equal(F.reglerFlux("F24:Draw/No", { ft: [0, 0] }), "gagne");
  assert.equal(F.reglerFlux("F13:Away", f), "gagne");
  assert.equal(F.reglerFlux("F3:Home", f), "gagne", "2e mi-temps 2-0");
  assert.equal(F.reglerFlux("F45:Over 8.5", f), "gagne");
  assert.equal(F.reglerFlux("F80:Under 4.5", f), "perdu");
  assert.equal(F.reglerFlux("F2:Home", { ft: [1, 1] }), "rembourse");
  assert.equal(F.reglerFlux("F45:Over 8.5", { ft: [2, 1] }), null, "corners pas encore connus");
  assert.equal(C.resultatPari({ marche: "F49:o/yes 2.5" }, 2, 1, { ht: null }), "gagne");
  assert.equal(C.resultatPari({ marche: "O25" }, 2, 1), "gagne", "anciens marches inchanges");
});

test("buteur « Anytime Goal Scorer » : fonction a part, DESACTIVEE par defaut ; chance arrondie vers le bas a 5 points une fois activee", async () => {
  assert.equal(F.chanceButeurFlux(raw(), "Jonathan David", { config: config([]) }), null);
  assert.equal(M.CONFIG_FLUX.buteur_actif, false, "config/marches-valides.json : buteur_actif false tant que le mathematicien n'a pas valide");
  const p = F.chanceButeurFlux(raw(), "Jonathan David", { config: config([], { buteur_actif: true }) });
  assert.ok(p > 0 && p < 1 / 2.6, "marge retiree");
  const CH = (await import("node:module")).createRequire(import.meta.url)("../lib/chance-iashark.js");
  assert.equal(CH.chanceButeur(p) % 5, 0);
});
