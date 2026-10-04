"use strict";
// Bloc « Aujourd'hui » (tickets x5 / x10, Selection en or, buteur du jour) et
// sections de la page match (04/10/2026, demande de Clement ; verdicts du
// mathematicien du 04/10). Ce que ces tests gardent :
//  - un bloc verrouille n'affiche JAMAIS ses vrais chiffres, meme si la reponse
//    en contenait (faux chiffres constants sous le flou) ;
//  - un cadenas, une ligne « Ce que tu debloques », UN bouton ;
//  - aucun mot interdit (sur, garanti, gagnant, mise, gain...) ;
//  - « Si ce match se jouait 10 000 fois » : comptes = pourcentage entier x 100,
//    jamais « rejoue » ni « tires au sort » ; pas de zone chaude (NO-GO) ;
//  - « Et si » arrondi a 5 points ; premier but cache dans les tranches fausses ;
//  - jumeaux : au moins 200, comptes bruts ;
//  - panneau Marches : marches_panneau seulement, chiffres jamais repetes ;
//  - assemblage du 04/10 : les sections lisent EXACTEMENT les champs du pipeline
//    (sim_resume, premier_but, sim_15min.si_affiche / tr_dom / tr_ext / minute
//    mediane, v3_premiers_buteurs, jumeaux { niveau, pct }), jamais de repli ;
//  - arbitre : rien sans le feu vert du mathematicien.
const { test } = require("node:test");
const assert = require("node:assert/strict");
global.window = undefined;
// Les modules du navigateur s'accrochent a globalThis : composants et icones d'abord.
require("../lib/icones.js");
require("../lib/composants.js");
const AJ = require("../lib/aujourdhui.js");
const MS = require("../lib/match-sections.js");
const OP = require("../lib/offre-pro.js");

// « pas une garantie » (mention obligatoire) n'est pas une promesse.
const INTERDITS = /\b(sûrs?|sure|gagnants?|ticket gagnant|mises?|gains?|gagner|unités?|capital|espérance|bankroll|derni[eè]re chance|offre limitée|recommandé)\b|(?<!pas une )\bgaranti(e|s|es)?\b/i;
const JOUR = "2026-10-04";
const jambe = (fid, d, e, h, pari, cote, op, ch) => ({ fixture_id: fid, domicile: d, exterieur: e, ligue: "L1", coup_envoi: JOUR + " " + h, pari, market_id: "x", cote, operateur: op, chance: ch, etat: "a_venir" });
const X5 = { type: "x5", statut: "publie", verrou: null, nb_matchs: 3, cote_totale: 4.62, chance: 18, operateur_unique: null, sans_matchs_reportes: null,
  jambes: [jambe(3, "Porto", "Braga", "21:30", "Porto ou nul", 1.44, "Unibet", 66), jambe(1, "Lens", "Lille", "15:00", "Victoire Lens", 1.55, "Winamax", 64), jambe(2, "Monaco", "Nice", "17:00", "Les deux équipes marquent", 1.62, "Betclic", 62)] };
const OR = { statut: "publie", verrou: null, nb_paris: 3, paris: [1, 2, 3].map((r) => Object.assign({ rang: r }, jambe(r, "Equipe" + r, "Autre" + r, "18:00", "Pari " + r, 1.41, "PMU", 70 - r))) };
const BUT = { statut: "publie", verrou: null, joueur: "J. David", joueur_id: 1, equipe: "Lille", adversaire: "Lens", fixture_id: 1, coup_envoi: JOUR + " 15:00", chance: 35, etat: "a_venir" };

test("Aujourd'hui, sans compte : en-tete vrai (nombre de matchs, cote totale), contenu FAUX, un seul bouton « compte gratuit »", () => {
  // Defense : meme si la reponse contenait les jambes, un bloc verrouille ne les montre pas.
  const fuite = Object.assign({}, X5, { verrou: "compte" });
  const rep = { version: 1, jour: JOUR, niveau: "anonyme", tickets: [fuite, Object.assign({}, X5, { type: "x10", verrou: "compte", nb_matchs: 6, cote_totale: 10.18 })],
    selection_or: Object.assign({}, OR, { verrou: "compte" }), buteur_du_jour: Object.assign({}, BUT, { verrou: "compte" }) };
  const h = AJ.html(rep, {});
  assert.match(h, /3 matchs · cote totale 4,62/);
  assert.match(h, /6 matchs · cote totale 10,18/);
  for (const vrai of ["Porto", "Lens", "Winamax", "1,44", "66", "J. David", "Equipe1", "Pari 1"]) assert.ok(!h.includes(vrai), "vrai chiffre ou nom sous le flou : " + vrai);
  assert.match(h, /aria-hidden="true" inert/);
  assert.equal((h.match(/class="aj-unlock hs-gate-card"/g) || []).length, 1, "un seul bloc de deverrouillage");
  assert.equal((h.match(/class="mu-shimmer aj-cta"/g) || []).length, 1, "un seul bouton");
  assert.match(h, /Ce que tu débloques : le ticket x5 et le buteur du jour, gratuitement\./);
  assert.match(h, /href="\/inscription\.html\?next=/);
  assert.doesNotMatch(h, INTERDITS);
  for (const l of AJ.FAUX_LIGNES) for (const x of l) assert.doesNotMatch(x, /\d/, "faux contenu sans chiffre : " + x);
});

test("Aujourd'hui, compte gratuit : ticket x5 et buteur complets, x10 et Selection en or flous, bouton « Passe Pro »", () => {
  const rep = { version: 1, jour: JOUR, niveau: "gratuit", tickets: [X5, { type: "x10", statut: "publie", verrou: "pro", nb_matchs: 6, cote_totale: 10.18 }],
    selection_or: { statut: "publie", verrou: "pro", nb_paris: 3 }, buteur_du_jour: BUT };
  const h = AJ.html(rep, {});
  assert.match(h, /Lens – Lille/);
  assert.match(h, /data-mu-gauge="35"/, "jauge Magic UI du buteur");
  assert.match(h, /Ce que tu débloques : le ticket x10 et la Sélection en or\./);
  assert.match(h, /href="\/abonnement\.html\?duree=month&amp;next=/);
  assert.equal((h.match(/class="mu-shimmer aj-cta"/g) || []).length, 1);
  // Lignes dans l'ordre des coups d'envoi.
  assert.ok(h.indexOf("Lens – Lille") < h.indexOf("Monaco – Nice") && h.indexOf("Monaco – Nice") < h.indexOf("Porto – Braga"));
  assert.doesNotMatch(h, INTERDITS);
});

test("Aujourd'hui, Pro : tout ouvert, aucun bouton de paiement ; Selection en or = le seul or (Shine Border)", () => {
  const rep = { version: 1, jour: JOUR, niveau: "pro", tickets: [X5, { type: "x10", statut: "aucun", verrou: null }], selection_or: OR, buteur_du_jour: BUT };
  const h = AJ.html(rep, {});
  assert.doesNotMatch(h, /aj-unlock|aj-cta/);
  assert.match(h, /On ne force jamais un ticket\./);
  assert.match(h, /<article class="or is-on"><span class="mu-shine" aria-hidden="true"><\/span>/);
  assert.equal((h.match(/mu-shine/g) || []).length, 1);
  assert.doesNotMatch(h, INTERDITS);
  const copie = AJ.texteCopie(X5, JOUR);
  assert.match(copie, /^Ticket x5 IASHARK · /);
  assert.match(copie, /Chance calculée du ticket : 18/);
  assert.match(copie, /Estimation statistique, pas une garantie\. 18\+\niashark\.com$/);
  assert.doesNotMatch(copie, INTERDITS);
});

test("Aujourd'hui : reponse illisible ou absente = bloc entier masque (aucun trou)", () => {
  assert.equal(AJ.html(null, {}), "");
  assert.equal(AJ.html({ version: 2, jour: JOUR, tickets: [] }, {}), "");
});

// ------------------------------------------------------------ page match
const vm = (o) => Object.assign({ id: 9, identity: { home: { name: "Almeria" }, away: { name: "Burgos" } }, model: { recommendation: { probability: 60 } }, editorial: { signalReasons: [] }, players: {} }, o || {});
const ligne = (id, libelle, chance, pari) => ({ id, libelle, chance, source: "modele", pari_avis: !!pari });
const PANNEAU = { v: "panneau-2", releve_at: "2026-10-04T07:12:00Z", nb: 9, familles: [
  { cle: "resultat", libelle: "Résultat", marches: [ligne("home-win", "Victoire Almeria", 60, true), ligne("draw", "Match nul", 24), ligne("away-win", "Victoire Burgos", 16), ligne("dc-1x", "Almeria ou match nul", 84)] },
  { cle: "score_exact", libelle: "Score exact", marches: [ligne("SCORE:1-0", "Score exact 1-0", 14), ligne("SCORE:2-0", "Score exact 2-0", 12), ligne("SCORE:1-1", "Score exact 1-1", 11), ligne("SCORE:autres", "Autres scores", 63)] },
  { cle: "corners", libelle: "Corners", marches: [ligne("x", "Plus de 8,5 corners", 54)] }] };
function ctx(raw, o) {
  const dit = MS.registre();
  const v = vm(o && o.vm);
  MS.clesAvis(v, raw, dit);
  return Object.assign({ raw, vm: v, vuePro: true, verrouPro: false, dit }, o || {});
}

// sim_resume tel que le pipeline le pose (lib/sections-match.js#resumeSur10000).
const RESUME = { v: "grille-v3-1", base: 10000, issues: { dom: 6000, nul: 2400, ext: 1600 },
  scores: [{ score: "1-0", n: 1400 }, { score: "2-0", n: 1200 }, { score: "1-1", n: 1100 }, { score: "0-0", n: 700 }],
  total_buts: [{ buts: "0", n: 700 }, { buts: "1", n: 2000 }, { buts: "2", n: 2900 }, { buts: "3", n: 2200 }, { buts: "4+", n: 2200 }] };
const specs = (h) => [...h.matchAll(/data-ch="([^"]*)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")));

test("« Si ce match se jouait 10 000 fois » : sim_resume seulement (% entier x 100), jamais de tirage annonce, l'issue de l'Avis renvoie a l'Avis", () => {
  const raw = { market_id: "home-win", chance_iashark: 60, p1: 58.9, pn: 24.3, p2: 16.8, sim_resume: RESUME, marches_panneau: PANNEAU };
  const c = ctx(raw);
  const h = MS.simulation(c);
  assert.match(h, /Si ce match se jouait 10 000 fois/);
  assert.doesNotMatch(h, /rejoué|tirés au sort|simulations/i);
  assert.match(h, /≈ 2\s400 fois/);
  assert.match(h, /≈ 1\s600 fois/);
  assert.doesNotMatch(h, /≈ 6\s000 fois/, "l'issue du pari est dans l'Avis : pas repetee");
  assert.match(h, /dans l’avis/);
  assert.deepEqual(c.base, [60, 24, 16]);
  assert.match(h, /Les scores les plus probables/);
  assert.match(h, /Le nombre de buts du match/);
  const [, sc, bu] = specs(h);
  assert.deepEqual(sc.data.datasets[0].data, [1400, 1200, 1100, 700]);
  // « 0 but » = le 0-0 deja ecrit dans les scores : la barre reste, son nombre n'est pas reecrit.
  assert.deepEqual(bu.data.labels, ["0", "1", "2", "3", "4+"]);
  assert.deepEqual(bu.data.datasets[0].data, [700, 2000, 2900, 2200, 2200]);
  assert.deepEqual(bu.data.datasets[0].datalabels.display, [false, true, true, true, true]);
  assert.match(h, /0 but = le score 0 – 0 ci-dessus\./);
  assert.doesNotMatch(h, /undefined|NaN/);
  // UNE SEULE SOURCE : sans sim_resume, rien (ni panneau, ni p1/pn/p2 recalcules ici).
  assert.equal(MS.simulation(ctx({ market_id: "dc-1x", chance_iashark: 66, p1: 44.1, pn: 23.2, p2: 32.7, marches_panneau: PANNEAU })), "");
  // Comptes incoherents (somme differente de 10 000) : issues masquees.
  const faux = MS.simulation(ctx({ sim_resume: Object.assign({}, RESUME, { issues: { dom: 6000, nul: 2400, ext: 1500 } }) }));
  assert.doesNotMatch(faux, /x-legend/);
});

test("film du match : pas de zone chaude (NO-GO), chances par quart d'heure en entiers, par equipe (tr_dom, tr_ext)", () => {
  const tr = (v) => v.map((x) => [x, x - 0.05, x + 0.05]);
  const raw = { sim_15min: { tr: [0.292, 0.314, 0.381, 0.352, 0.363, 0.468], tr_dom: [0.179, 0.186, 0.237, 0.219, 0.22, 0.293], tr_ext: [0.139, 0.158, 0.189, 0.173, 0.186, 0.247] },
    stats_iashark: { dom: { tout: { n: 58, tranches: { n: 58, pour: tr([0.2, 0.2, 0.3, 0.2, 0.3, 0.4]), contre: tr([0.1, 0.2, 0.1, 0.2, 0.2, 0.3]) } } }, ext: { tout: { n: 61, tranches: { n: 61, pour: tr([0.1, 0.1, 0.1, 0.2, 0.2, 0.2]), contre: tr([0.2, 0.2, 0.2, 0.2, 0.2, 0.3]) } } }, zone_chaude: { tranche: 5, net: true } } };
  const h = MS.film(ctx(raw));
  assert.doesNotMatch(h, /zone chaude|Zone chaude/i);
  const spec = specs(h)[0];
  assert.deepEqual(spec.data.datasets[4].data, [29, 31, 38, 35, 36, 47]);
  assert.match(h, /archive IASHARK/);
  assert.match(h, /Chance de marquer dans ce quart d’heure \(modèle\) : Almeria 29\s?%, Burgos 25\s?%\./);
  assert.doesNotMatch(require("fs").readFileSync(require("path").join(__dirname, "..", "lib/match-sections.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /zone_chaude/);
});

const PB = { dom: 55, ext: 37, aucun: 8, avant_pause: 69 };
const SI = { dom_premier: { p1: 80, pn: 15, p2: 5 }, ext_premier: { p1: 25, pn: 30, p2: 45 }, nul_pause: { p1: 45, pn: 35, p2: 20 } };
test("qui ouvre le score + Et si : premier_but et si_affiche du pipeline, tranches fausses cachees, premier buteur = une chance", () => {
  assert.deepEqual(MS.premierBut({ premier_but: PB }), [55, 8, 37]);
  assert.equal(MS.premierBut({ premier_but: { dom: 78, ext: 15, aucun: 7 } }), null, "exterieur entre 10 et 20 % : faux (verdict des marches)");
  assert.equal(MS.premierBut({ premier_but: { dom: 83, ext: 9, aucun: 8 } }), null, "domicile entre 80 et 90 % : hors tolerance");
  assert.equal(MS.premierBut({ premier_but: { dom: 55, ext: 37, aucun: 9 } }), null, "somme differente de 100 : rien");
  const raw = { premier_but: PB, sim_15min: { si: { dom_premier: { p1: 0.781, pn: 0.152, p2: 0.067 } }, si_affiche: SI, minute_mediane_premier_but: 29 },
    v3_premiers_buteurs: [{ joueur_id: 7, joueur: "L. Suarez", cote: "home", poste: "F", p_premier_buteur: 0.1191, chance: 12 }, { joueur_id: 8, joueur: "X. Y", cote: "away", poste: "M", p_premier_buteur: 0.07, chance: 7 }] };
  const c = ctx(raw); c.base = [60, 24, 16];
  const h = MS.premier(c);
  const scen = [...h.matchAll(/data-e="([^"]*)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"')));
  assert.deepEqual(scen, [[80, 15, 5], [25, 30, 45], [45, 35, 20]], "si_affiche tel quel (jamais recalcule)");
  assert.match(h, /arrondies à 5 points/);
  assert.match(h, /Premier but avant la pause : 69\s?%\./);
  assert.match(h, /Une fois sur deux, le premier but tombe avant la 29e minute\./);
  assert.match(h, /L\. Suarez/);
  assert.match(h, /à 12\s?%, c’est à peu près 1 fois sur 8\./);
  assert.doesNotMatch(h, /marquera|sera le premier|quart d’heure le plus probable/i);
  // Sans si_affiche : pas d'« Et si » (aucun arrondi refait ici).
  assert.doesNotMatch(MS.premier(ctx({ premier_but: PB, sim_15min: { si: raw.sim_15min.si } })), /data-e=/);
  // Compte gratuit (champs Pro absents) : ligne cadenas, aucun chiffre.
  const gratuit = MS.premier(ctx({}, { vuePro: false, verrouPro: true }));
  assert.match(gratuit, /: Pro\./);
  assert.doesNotMatch(gratuit.replace(/<[^>]*>/g, ""), /\d/);
  // Meme si la reponse contenait les champs Pro, un non-Pro ne les voit pas.
  assert.doesNotMatch(MS.premier(ctx(raw, { vuePro: false, verrouPro: true })), /Suarez|69/);
});

test("jumeaux : contrat du pipeline (niveau, pct), au moins 200, comptes bruts, periode, 3 exemples ; sinon rien", () => {
  const ok = { v: "jumeaux-1", resultat: { n: 281, depuis: 2012, niveau: "meme", dom: 76, nul: 82, ext: 123, pct: { dom: 27, nul: 29, ext: 44 }, exemples: [{ date: "2023-12-16", ligue: "Bundesliga", domicile: "Augsburg", exterieur: "Dortmund", score: "1-1" }] },
    buts: { n: 1049, depuis: 2019, plus_2_5: 671, btts: 637, pct: { plus_2_5: 64, btts: 61 } } };
  const h = MS.jumeaux(ctx({ jumeaux: ok }));
  assert.match(h, /281 matchs jumeaux depuis 2012/);
  assert.match(h, /123 \(44\s?%\)/);
  assert.match(h, /Même niveau/);
  assert.match(h, /Augsburg/);
  assert.match(h, /671 \(64\s?%\)/);
  assert.match(h, /637 \(61\s?%\)/);
  assert.match(MS.jumeaux(ctx({ jumeaux: { resultat: Object.assign({}, ok.resultat, { niveau: "tous" }), buts: null } })), /Tous championnats/);
  assert.doesNotMatch(h.replace(/<[^>]*>/g, "").replace(/2,5 buts/g, ""), /\d,\d/, "aucune decimale (hors la ligne « plus de 2,5 buts »)");
  assert.equal(MS.jumeaux(ctx({ jumeaux: { resultat: Object.assign({}, ok.resultat, { n: 150, dom: 50, nul: 50, ext: 50 }), buts: null } })), "");
});

test("arbitre : jamais sans le feu vert (stats_iashark.arbitre pose par le pipeline) ; le champ public arbitre n'est jamais lu", () => {
  assert.equal(MS.arbitre(ctx({ arbitre: { nom: "M. Dupont", cartons: 4.2, penaltys: 0.3, matchs: 40 } })), "");
  assert.equal(MS.arbitre(ctx({ arbitre: { nom: "M. Dupont" } }, { vuePro: false, verrouPro: true })), "", "aucune ligne cadenas pour un contenu que Pro n'a pas");
  assert.match(MS.arbitre(ctx({ stats_iashark_gratuit: { detail_pro: ["arbitre"] } }, { vuePro: false, verrouPro: true })), /: Pro\./);
  const a = { nom: "M. Dupont", n: 60, debut: "2024-08-01", fin: "2026-09-30", cartons: { m: [4.4, 4.1, 4.7], attendu: 4.0, ecart: [0.4, 0.1, 0.7] } };
  assert.match(MS.arbitre(ctx({ stats_iashark: { arbitre: a } })), /M\. Dupont[\s\S]*hu-stat/);
});

test("panneau Marches : marches_panneau seulement, pari de l'Avis et issues deja ecrites renvoyees, jamais de cote", () => {
  const raw = { market_id: "home-win", chance_iashark: 60, sim_resume: RESUME, marches_panneau: PANNEAU };
  const c = ctx(raw);
  MS.simulation(c);
  const p = MS.panneau(c);
  assert.equal(p.nb, 9);
  assert.match(p.html, /Victoire Almeria<\/span><span class="mk-r"><a class="mk-ref" href="#sec-avis">Pari de l’avis/);
  assert.match(p.html, /Match nul<\/span><span class="mk-r"><a class="mk-ref" href="#sec-sim">Dans « 10 000 matchs »/);
  assert.match(p.html, /Score exact 1-0<\/span><span class="mk-r"><a class="mk-ref" href="#sec-sim">/);
  assert.match(p.html, /Almeria ou match nul<\/span><span class="mk-r"><span class="hu-badge lv5">84\s?%/);
  assert.doesNotMatch(p.html, /cote|valeur|bet365|Pinnacle/i);
  assert.equal(MS.panneau(ctx({ marches_flux: { liste: [{ marche: "Résultat du match", selection: "Almeria gagne", chance: 61 }] } })), null, "aucune autre source que marches_panneau");
});

test("composant de paiement : textes sans mot interdit ni fausse urgence", () => {
  const plans = [{ interval: "week", amount: 6.99, text: "6,99 €" }, { interval: "month", amount: 19.95, text: "19,95 €", weeklyEquivalentText: "4,61 €" }, { interval: "year", amount: 199, text: "199 €", weeklyEquivalentText: "3,83 €", savingsPct: 16 }];
  for (const [mode, connecte, choisi, jours] of [["vitrine", false, "month", 7], ["paiement", true, "year", 0], ["paiement", false, "week", 7]]) {
    const h = OP.html({ mode, contexte: "match", plans, choisi, jours, connecte, uid: "u" });
    assert.doesNotMatch(h, INTERDITS, mode);
    assert.doesNotMatch(h, /plus que|dernières heures|compte à rebours|expire/i, "aucune fausse urgence");
    assert.match(h, /Passe Pro pour ouvrir ce match/);
  }
  assert.match(OP.html({ mode: "vitrine", contexte: "general", plans, choisi: "month", jours: 7, connecte: false, uid: "v" }), /Commencer mes 7 jours gratuits/);
});
