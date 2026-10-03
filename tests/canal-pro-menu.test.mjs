// MENU du Canal Pro (REGLE-VIP.md, conditions du mathematicien, decision de Clement du 30/09/2026) :
// jour normal, jour creux, week-end, buteur, combine sans deux selections du meme match, double
// chance seulement avec une vraie cote, tickets, textes (ni mise, ni calcul, ni taux), regle d'arret.
// Donnees FICTIVES (scripts/canal-pro/lib/exemple-v3.mjs).
import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import * as C from "../supabase/functions/_shared/canal-pro.mjs";
import * as M from "../supabase/functions/_shared/canal-pro-menu.mjs";
import { matchV3, sortieV3, evenementOdds } from "../scripts/canal-pro/lib/exemple-v3.mjs";
import { creerSources, LIGUES_MENU } from "../scripts/canal-pro/lib/sources.mjs";
import { reduire } from "../scripts/canal-pro/deposer-sortie-v3.mjs";
const P = createRequire(import.meta.url)("../lib/telegram-posts.js");

// ---------- donnees fictives ----------
const JOUR = "2026-10-07"; // mercredi
const ko = (jour, hm) => C.parisVersDate(jour, hm).toISOString();
function lot(jour, { avecButeur = false } = {}) {
  return [
    matchV3({ id: `${jour}-a`, ligue_code: "SP1", dom: "Real Madrid", ext: "Getafe", ko: ko(jour, "21:00"), lh: 2.3, la: 0.7, fixture: 11,
      buteurs: avecButeur ? [{ equipe: "Real Madrid", joueur: "Joueur A", joueur_id: 901, p_marque: 0.46 }, { equipe: "Real Madrid", joueur: "Joueur B", joueur_id: 902, p_marque: 0.3 }] : [] }),
    matchV3({ id: `${jour}-b`, ligue_code: "D1", dom: "Bayern Munich", ext: "Mainz", ko: ko(jour, "15:30"), lh: 2.6, la: 0.8, fixture: 12 }),
    matchV3({ id: `${jour}-c`, ligue_code: "I1", dom: "Inter", ext: "Lecce", ko: ko(jour, "18:00"), lh: 2.0, la: 0.7, fixture: 13 }),
    matchV3({ id: `${jour}-d`, ligue_code: "F1", dom: "Lens", ext: "Nantes", ko: ko(jour, "17:00"), lh: 1.6, la: 0.9, fixture: 14 }),
    matchV3({ id: `${jour}-e`, ligue_code: "N1", dom: "PSV", ext: "Heracles", ko: ko(jour, "20:45"), lh: 2.4, la: 0.8, fixture: 15 }),
    matchV3({ id: `${jour}-f`, ligue_code: "P1", dom: "Benfica", ext: "Arouca", ko: ko(jour, "22:30"), lh: 2.1, la: 0.8, fixture: 16 }),
    matchV3({ id: `${jour}-g`, ligue_code: "SP1", dom: "Sevilla", ext: "Valencia", ko: ko(jour, "14:00"), lh: 1.4, la: 1.1, fixture: 17 }),
    matchV3({ id: `${jour}-h`, ligue_code: "D1", dom: "Leverkusen", ext: "Augsburg", ko: ko(jour, "15:30"), lh: 1.9, la: 0.9, fixture: 18 }),
  ];
}
const cotesDe = (ms, { dcChez = () => [] } = {}) => Object.fromEntries(ms.map((m) => [m.match_id, { event_id: `ev-${m.match_id}`, sport_key: "soccer_x",
  books: C.booksDepuisOddsApi(evenementOdds(m, { dcChez: dcChez(m) })), releve_at: ko(JOUR, "08:10") }]));
function menu(jour, ms, opts = {}) {
  const s = sortieV3(ms, ko(jour, "08:00"));
  const { debut, fin } = C.fenetreProgramme(jour);
  const fw = C.nomJour(jour) === "vendredi" ? M.fenetreWeekend(jour) : null;
  return M.construireMenu({ jour, matchsJour: M.matchsMenu(s, debut, fin), matchsWeekend: fw ? M.matchsMenu(s, fw.debut, fw.fin) : [], cotesParMatch: cotesDe(ms, opts) });
}
// Mots interdits dans TOUT message (conditions 1 et 2 du mathematicien, decision de Clement du 30/09).
const INTERDITS = /historique|archivé|empreinte|\bmise\b|unités?\b|il faut gagner|pour ne rien perdre|cote minimum|taux de réussite|réussite|chance réelle|les plus fiables|\bvaleur\b|avantage|rentable|\bVIP\b|espérance|en moyenne|perdent un peu|garanti|comporte des risques|1er buteur|premier buteur|% de (ta|la) cagnotte|capital/i;

// ---------- 1. jour normal ----------
test("jour normal : jusqu'a 3 simples (1,40-2,00, 6 championnats, les plus probables du v3), 1 combine du jour", () => {
  const ms = [...lot(JOUR), matchV3({ id: "usa", ligue_code: "USA", dom: "Austin", ext: "Dallas", ko: ko(JOUR, "20:00"), lh: 2.4, la: 0.6, fixture: 99 }),
    matchV3({ id: "nv", ligue_code: "I1", dom: "Roma", ext: "Como", ko: ko(JOUR, "20:45"), lh: 1.8, la: 0.9, fixture: 98, eligible: false })];
  const r = menu(JOUR, ms);
  const simples = r.candidats.filter((c) => c.famille === "simple");
  assert.ok(simples.length > 0 && simples.length <= 3);
  for (const s of simples) assert.ok(s.cote_moy >= 1.4 && s.cote_moy <= 2.0 && s.proba > 0);
  assert.ok(!r.candidats.some((c) => [c.dom, ...(c.selections || []).map((j) => j.dom)].includes("Austin")), "hors Europe : jamais");
  assert.ok(!r.candidats.some((c) => [c.dom, ...(c.selections || []).map((j) => j.dom)].includes("Roma")), "match non vérifié : jamais");
  // Les 3 plus probables parmi ceux de la fourchette, un seul pari par match.
  const toutes = M.jambesCandidates(M.matchsMenu(sortieV3(ms, ko(JOUR, "08:00")), ...Object.values(C.fenetreProgramme(JOUR))), cotesDe(ms)).jambes.filter((j) => j.cote_moy >= 1.4 && j.cote_moy <= 2);
  const meilleures = [...new Map([...toutes].sort((a, b) => b.proba - a.proba).reverse().map((j) => [j.match_id, j])).values()].sort((a, b) => b.proba - a.proba).slice(0, 3);
  assert.deepStrictEqual(simples.map((s) => s.match_id).sort(), meilleures.map((j) => j.match_id).sort());
  assert.strictEqual(new Set(simples.map((s) => s.match_id)).size, simples.length);
  const combo = r.candidats.filter((c) => c.famille === "combine");
  assert.strictEqual(combo.length, 1);
  const js = combo[0].selections;
  assert.ok(js.length >= 2 && js.length <= 3);
  for (const j of js) assert.ok(j.cote_moy >= 1.2 && j.cote_moy <= 1.5, j.selection);
  const total = js.reduce((a, j) => a * j.cote_moy, 1);
  assert.ok(total >= 1.8 && total <= 2.5, `cote totale ${total}`);
  assert.ok(!js.some((j) => simples.some((s) => s.match_id === j.match_id)), "jamais un match deja en simple");
  assert.ok(!r.candidats.some((c) => c.famille === "buteur" || C.estCombine(c) && c.famille !== "combine"), "mercredi : ni buteur ni ticket");
  // Le programme : tout passe le controleur, dans l'ordre simples, combine.
  const pr = C.preparerProgramme(r.candidats, { jour: JOUR, maintenant: ko(JOUR, "08:15") });
  assert.deepStrictEqual(pr.ecartes, []);
  assert.deepStrictEqual(pr.paris.map((p) => p.famille), [...simples.map(() => "simple"), "combine"]);
  assert.ok(pr.paris.every((p) => p.meilleure_cote > 1 && p.meilleur_bookmaker && p.cote_min === null), "aucune cote minimum");
});

// ---------- 2. jour creux ----------
test("jour creux : un seul pari -> « Journée calme… On ne force pas » ; aucun -> « Aucun pari ne passe nos critères aujourd'hui. On ne force pas »", () => {
  const mardi = "2026-10-06";
  const [un] = lot(mardi).filter((m) => m.domicile === "Leverkusen");
  const r = menu(mardi, [un]);
  assert.deepStrictEqual(r.candidats.map((c) => c.famille), ["simple"], "un match : un simple, pas de combine");
  const pr = C.preparerProgramme(r.candidats, { jour: mardi, maintenant: ko(mardi, "08:15") });
  const tete = C.messagesCanal(mardi, pr.paris).tete;
  assert.match(tete, /Programme du mardi<\/b> · 1 simple\nJournée calme : un seul pari passe nos critères aujourd'hui\. On ne force pas\./);
  assert.match(C.messageValidation({ jour: mardi, paris: pr.paris, ecartes: [], matchs_vus: 1 }), /Journée calme/);
  const vide = C.messagesCanal(mardi, [], { motifVide: C.motifVide({ matchs_vus: 3, non_evalues: [], ecartes: [] }, []) }).tete;
  assert.match(vide, /aucun pari\nAucun pari ne passe nos critères aujourd'hui\. On ne force pas\./);
  assert.match(C.MOTIFS_VIDE.regles_partiel, /On ne force pas/);
  // Un match hors fourchette seulement (gros favori a 1,26) : rien.
  const [bayern] = lot(mardi).filter((m) => m.domicile === "Bayern Munich");
  assert.deepStrictEqual(menu(mardi, [bayern]).candidats, []);
});

// ---------- 3. week-end ----------
test("week-end : vendredi -> tickets autour de 10 et de 25 (le 50-100 seulement le 1er week-end du mois) ; samedi et dimanche -> buteur", () => {
  const ven = "2026-10-02", sam = "2026-10-03", dim = "2026-10-04";
  assert.ok(M.premierWeekendDuMois(ven) && !M.premierWeekendDuMois("2026-10-09") && !M.premierWeekendDuMois(sam));
  assert.ok(!M.premierWeekendDuMois("2026-10-30") && M.premierWeekendDuMois("2026-11-06"), "vendredi 30/10 : samedi 31 ; vendredi 6/11 : samedi 7");
  const tous = [...lot(ven), ...lot(sam), ...lot(dim)];
  const r = menu(ven, tous);
  const t10 = r.candidats.find((c) => c.famille === "fun10"), t25 = r.candidats.find((c) => c.famille === "fun25"), reve = r.candidats.find((c) => c.famille === "reve");
  assert.ok(t10 && t25, JSON.stringify(r.candidats.map((c) => c.famille)));
  for (const [t, regle] of [[t10, M.MENU.fun10], [t25, M.MENU.fun25], ...(reve ? [[reve, M.MENU.reve]] : [])]) {
    const js = t.selections;
    assert.ok(js.length >= regle.k_min && js.length <= regle.k_max, `${t.famille} : ${js.length} selections`);
    assert.strictEqual(new Set(js.map((j) => j.match_id)).size, js.length, "matchs differents");
    for (const j of js) assert.ok(j.cote_moy >= 1.45 && j.cote_moy <= 1.9);
    assert.ok(js.reduce((a, j) => a * j.cote_moy, 1) >= regle.total_min);
    assert.ok(["vendredi", "samedi", "dimanche"].includes(C.nomJour(C.paris(js[0].coup_envoi).date)));
  }
  // Le 1er week-end d'octobre : le ticket 50-100 si les matchs le permettent ; jamais un autre vendredi.
  assert.ok(!menu("2026-10-09", [...lot("2026-10-09"), ...lot("2026-10-10"), ...lot("2026-10-11")]).candidats.some((c) => c.famille === "reve"));
  // Les tickets du vendredi passent le controleur (fenetre jusqu'au dimanche soir).
  const pr = C.preparerProgramme(r.candidats, { jour: ven, maintenant: ko(ven, "08:15") });
  assert.ok(pr.paris.some((p) => p.famille === "fun25"), JSON.stringify(pr.ecartes));
  // Samedi et dimanche : 1 « meme match avec buteur » ; jamais en semaine.
  assert.strictEqual(menu(sam, lot(sam, { avecButeur: true })).candidats.filter((c) => c.famille === "buteur").length, 1);
  assert.strictEqual(menu(dim, lot(dim, { avecButeur: true })).candidats.filter((c) => c.famille === "buteur").length, 1);
  assert.strictEqual(menu(JOUR, lot(JOUR, { avecButeur: true })).candidats.filter((c) => c.famille === "buteur").length, 0);
  assert.ok(!menu(sam, lot(sam)).candidats.some((c) => c.famille === "fun10"), "samedi : pas de nouveau ticket (envoyes le vendredi)");
});

// ---------- 4. buteur ----------
test("buteur : modele nomme et fige, chance lue dans la grille, arrondie vers le bas a 5 points, 45 % au plus, 1 chance sur N coherent", () => {
  assert.strictEqual(M.MODELE_BUTEUR, "buteurs du moteur v3, contrat 1.1 (champ p_marque), figé");
  assert.deepStrictEqual([0.449, 0.4, 0.399, 0.62, 0.12, 0.099].map(M.chanceButeurAffichee), [0.4, 0.4, 0.35, 0.45, 0.1, null]);
  // Grille : le joueur marque plus souvent quand son equipe marque beaucoup -> plus haut que le produit naif.
  const g = M.grille(2.3, 0.7, -0.08), { p1 } = M.probas1n2(g);
  const r = M.chanceMemeMatch(g, "1", 0.3);
  assert.ok(r.joint > p1 * 0.3 + 0.02, `grille ${r.joint} contre produit ${p1 * 0.3}`);
  let marg = 0; g.forEach((l, i) => l.forEach((x) => { marg += x * (1 - (1 - r.part) ** i); }));
  assert.ok(Math.abs(marg - 0.3) < 1e-6, "la chance du joueur est gardee exactement");
  const sam = "2026-10-03";
  const b = menu(sam, lot(sam, { avecButeur: true })).candidats.find((c) => c.famille === "buteur");
  assert.strictEqual(b.selections[0].joueur, "Joueur A", "le plus probable de marquer, titulaire probable");
  assert.ok(Math.abs(b.proba * 100 % 5) < 1e-9 && b.proba <= 0.45 && b.proba <= b.selections[0].p_grille + 1e-9);
  assert.match(b.source_proba, /figé/);
  const [p] = C.preparerProgramme([b], { jour: sam, maintenant: ko(sam, "08:15") }).paris;
  const html = C.messagesCanal(sam, [p]).paris[0].html;
  assert.match(html, /Sélection : <b>Real Madrid gagne \+ Joueur A marque \(à n'importe quel moment\)<\/b>/);
  const n = 1 / p.proba;
  assert.match(html, new RegExp(`environ ${Math.round(p.proba * 100)} % \\(1 chance sur ${C.fr(n, 1)}\\)`));
  assert.match(html, /Cote buteur : à voir chez ton bookmaker \(nous ne la relevons pas\)\./);
  assert.match(html, /chance calculée, cote à voir chez ton bookmaker/);
  assert.ok(!/Cote :/.test(html), "aucune cote buteur montree");
  assert.ok(!INTERDITS.test(html), html);
  // Reglement : le favori gagne ET le joueur marque ; il n'a pas joue : rembourse.
  assert.strictEqual(C.resultatButeur(p, 2, 0, { marque: true, a_joue: true }), "gagne");
  assert.strictEqual(C.resultatButeur(p, 1, 1, { marque: true, a_joue: true }), "perdu");
  assert.strictEqual(C.resultatButeur(p, 3, 0, { marque: false, a_joue: true }), "perdu");
  assert.strictEqual(C.resultatButeur(p, 3, 0, { marque: false, a_joue: false }), "rembourse");
  // Composition : le joueur titulaire, sur le banc, ou absent.
  const compo = (tit, banc) => ({ statut_match: "NS", equipes: [{ nom: "Real Madrid", titulaires: tit, remplacants: banc }] });
  assert.strictEqual(C.voyantButeur(p, compo([901], [])).voyant, "CONFIRMÉ");
  assert.match(C.voyantButeur(p, compo([], [901])).raison, /commence sur le banc/);
  assert.match(C.voyantButeur(p, compo([], [])).raison, /pas sur la feuille de match/);
});

// ---------- 5. combine du jour : jamais deux selections du meme match ----------
test("combine du jour : jamais deux selections du meme match (meme si c'etait la combinaison la plus probable)", () => {
  // Un match avec deux selections tres probables dans la fourchette 1,20-1,50 (1N2 et double chance) :
  const j = (id, marche, proba, cote) => ({ match_id: id, marche, proba, cote_moy: cote, coup_envoi: ko(JOUR, "20:00"), cotes: { winamax_fr: cote } });
  const pool = [j("X", "1", 0.78, 1.25), j("X", "1X", 0.9, 1.5), j("Y", "1", 0.72, 1.35), j("Z", "1", 0.7, 1.4)];
  const c = M.choisirCombine(pool);
  assert.ok(c);
  assert.strictEqual(new Set(c.jambes.map((x) => x.match_id)).size, c.jambes.length, JSON.stringify(c.jambes));
  // Sur des vraies journees : toujours des matchs differents, et jamais un match deja en simple.
  for (const jour of ["2026-10-03", "2026-10-04", JOUR]) {
    const r = menu(jour, lot(jour, { avecButeur: true }), { dcChez: () => ["winamax_fr", "betclic_fr"] });
    const combo = r.candidats.find((x) => x.famille === "combine");
    if (!combo) continue;
    const ids = combo.selections.map((x) => x.match_id);
    assert.strictEqual(new Set(ids).size, ids.length, jour);
    assert.ok(!r.candidats.filter((x) => x.famille === "simple").some((s) => ids.includes(s.match_id)), jour);
  }
  // Une seule source (01/10/2026) : chance d'un combine ou d'un ticket = produit des chances IASHARK
  // de ses selections (chacune deja le plus bas entre le v3 et la cote sans marge, posee par le pipeline).
  const t = M.choisirTicket([1, 2, 3, 4, 5, 6].map((k) => ({ match_id: `m${k}`, marche: "1", proba: 0.66, chance: 0.64, q_marche: 0.64, cote_moy: 1.6, coup_envoi: ko(JOUR, "20:00") })), M.MENU.fun10);
  assert.strictEqual(t.jambes.length, 5, "1,6^5 = 10,5 : la cote de 8 est atteinte a 5 selections");
  assert.ok(Math.abs(t.chance - 0.64 ** 5) < 1e-12 && t.chance < t.proba_v3, "produit des chances IASHARK");
  const t2 = M.choisirTicket([1, 2, 3, 4, 5].map((k) => ({ match_id: `m${k}`, marche: "1", proba: 0.62, chance: 0.62, q_marche: 0.66, cote_moy: 1.6, coup_envoi: ko(JOUR, "20:00") })), M.MENU.fun10);
  assert.ok(Math.abs(t2.chance - 0.62 ** 5) < 1e-12, "produit des chances IASHARK");
});

// ---------- 6. double chance : vraie cote seulement ----------
test("double chance : seulement avec une VRAIE cote double chance chez un agree suivi ; sinon repli sur le 1N2 (note interne)", () => {
  const [lens] = lot(JOUR).filter((m) => m.domicile === "Lens");
  // Sans vraie cote double chance : aucune selection double chance, le 1N2 du match reste possible.
  const sans = M.jambesCandidates([lens], cotesDe([lens]));
  assert.ok(sans.jambes.every((j) => ["1", "N", "2"].includes(j.marche)));
  assert.ok(sans.ecartes.some((e) => /pas de vraie cote double chance/.test(e.raison) && e.info && !e.donnees), "note interne, jamais « donnée manquante »");
  // La double chance calculee a partir du 1N2 n'est plus jamais une cote jouable.
  const books = C.booksDepuisOddsApi(evenementOdds(lens));
  assert.deepStrictEqual(C.cotesExecutables(books, "1X", null), {});
  // Avec une vraie cote chez Winamax : la double chance existe, a SA cote.
  const avec = M.jambesCandidates([lens], cotesDe([lens], { dcChez: () => ["winamax_fr"] }));
  const dc = avec.jambes.find((j) => j.marche === "1X");
  assert.ok(dc && Object.keys(dc.cotes).join() === "winamax_fr");
  assert.ok(!avec.ecartes.length);
  // Noms d'issues lus avec souplesse ; une issue illisible = pas de cote.
  const ev = { home_team: "Lens", away_team: "Nantes", bookmakers: [{ key: "winamax_fr", markets: [{ key: "double_chance", outcomes: [{ name: "Lens or Draw", price: 1.2 }, { name: "1X", price: 1.21 }, { name: "Nantes/Draw", price: 1.9 }, { name: "Autre", price: 3 }] }] }] };
  assert.deepStrictEqual(C.booksDepuisOddsApi(ev).winamax_fr.dc, { "1X": 1.21, X2: 1.9 });
  // Plus aucune mention « cote calculee a partir de son 1N2 ».
  assert.strictEqual(C.noteCoteCalculee({ marche: "1X" }), "");
});

// ---------- 7. textes : match, pari, cote, chance calculee par IASHARK ; rien d'autre ----------
test("textes : chaque pari = match, pari, cote, « chance calculée par IASHARK » ; ni mise, ni calcul, ni taux, ni mot interdit (Canal Pro, robot, canal gratuit)", () => {
  const ven = "2026-10-02";
  const tous = [...lot(ven), ...lot("2026-10-03", { avecButeur: true }), ...lot("2026-10-04")];
  const r = menu(ven, tous, { dcChez: () => ["winamax_fr"] });
  const sam = menu("2026-10-03", lot("2026-10-03", { avecButeur: true }), { dcChez: () => ["winamax_fr"] });
  const paris = [...C.preparerProgramme(r.candidats, { jour: ven, maintenant: ko(ven, "08:15") }).paris, ...C.preparerProgramme(sam.candidats, { jour: "2026-10-03", maintenant: ko("2026-10-03", "08:15") }).paris]
    .map((p, i) => ({ ...p, id: `p${i}`, numero: i + 1, publie_at: ko(ven, "09:30"), jour: ven }));
  assert.deepStrictEqual([...new Set(paris.map((p) => p.famille))].sort(), ["buteur", "combine", "fun10", "fun25", "reve", "simple"].sort().filter((f) => paris.some((p) => p.famille === f)));
  const mc = C.messagesCanal(ven, paris);
  for (const x of mc.paris) {
    assert.match(x.html, /Chance calculée par IASHARK : /);
    const p = paris.find((q) => q.id === x.id);
    if (p.famille !== "buteur") assert.match(x.html, /Cote( du (combiné|ticket))? : <b>\d+,\d\d<\/b> chez /);
    if (C.estCombine(p)) assert.match(x.html, /1 chance sur /, "combine et tickets : « 1 chance sur N », jamais un pourcentage seul");
  }
  const prefs = C.preferencesEffectives({ bookmakers: ["winamax"] }, {});
  const reglesP = paris.map((p, i) => ({ ...p, resultat: i % 3 ? "gagne" : "perdu", score_dom: 2, score_ext: 1, faits: C.estCombine(p) ? { jambes: p.selections.map(() => ({ score_dom: 1, score_ext: 0, resultat: "gagne" })) } : null }));
  const textes = [mc.tete, ...mc.paris.map((x) => x.html), C.messageValidation({ jour: ven, paris, ecartes: r.ecartes, matchs_vus: 24 }),
    C.messageProgrammePerso(ven, paris, prefs, { prenom: "Karim" }), C.messageProgrammePerso(ven, paris, C.preferencesEffectives({ strategie: "perso", familles: ["simple"], cote_min_perso: 1.5 }, {})),
    C.messageReglages(prefs), C.AIDE_ROBOT, C.verdictTabac(paris[0], 1.5), C.messageDebrief("Débrief du samedi", reglesP),
    C.messageBilanSemaine("2026-09-28", "2026-10-04", reglesP, reglesP), C.messageComposition(paris[0], { voyant: "CONFIRMÉ", raison: "x" }, { winamax: 1.5 }),
    ...C.alertesCote(paris[0], { winamax: 1.2 }, prefs, new Set(), { maintenant: Date.parse(paris[0].coup_envoi) - 3600e3 }).map((a) => a.texte),
    ...C.alertesCote(paris[0], { winamax: 2.2 }, prefs, new Set(), { maintenant: Date.parse(paris[0].coup_envoi) - 3600e3 }).map((a) => a.texte),
    C.messageGrille(JSON.parse(JSON.stringify({ id: "g", nom: "Loto Foot 7", premier_match_at: ko(ven, "20:00"), releve_at: ko(ven, "08:00"),
      matchs: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ n, dom: `A${n}`, ext: `B${n}`, cotes: [2.1, 3.3, 3.5], repartition: [60, 15, 25] })) }))),
    P.resultats({ day: "2026-10-02", matches: [{ result: "win", moteur: "v3" }, { result: "loss", moteur: "v3" }] }).html];
  for (const t of textes) assert.ok(!INTERDITS.test(t), `mot interdit : ${t.match(INTERDITS)?.[0]}\n${t}`);
  // Le canal gratuit : le match gratuit donne le pari, la cote et la chance calculee, jamais « ce que dit la cote ».
  const libre = { id: 1, is_free: true, status: "NS", analysis_tier: "FULL_ANALYSIS", date: "2026-10-03 18:00", league: "Ligue 1", home: { n: "Lens" }, away: { n: "Nantes" },
    // chance_iashark : la chance posee par le pipeline (une seule source, 01/10/2026).
    pari_rec: "Lens gagne", market_id: "1x2-home", model_probability: 58.2, chance_iashark: 58, cote_rec: 1.72, cote_source: "anj", cote_bookmaker: "Winamax", p1: 58, pn: 24, p2: 18, market_consensus_p1: 56, market_consensus_pN: 25, market_consensus_p2: 19,
    // Garde-fous de la fusion (30/09) : pari v3 « vérifié sur le passé », probabilite « modèle + cotes », jour verifie.
    v3_pari: { market_id: "1x2-home", etiquette: "vérifié sur le passé", fiabilite_marche: "vérifié sur le passé" }, moteur_v3: { source: "v3", origine_probabilite: "modèle + cotes" } };
  const g = P.matchGratuit({ matchs: [libre] }, null, "2026-10-03 10:00");
  assert.match(g.html, /Sélection : <b>Lens gagne<\/b>\nChance calculée par IASHARK : <b>58 %<\/b>\nCote chez Winamax : 1,72/);
  assert.ok(!INTERDITS.test(g.html) && !/sans la marge|selon la cote|Sur 100 matchs/.test(JSON.stringify(g)), g.html);
});

// ---------- 8. bilan et debrief : des nombres, rien d'autre (decision de Clement : ni historique public, ni archive citee) ----------
test("bilan du lundi et debrief : gagnes et perdus en nombre, rien d'autre ; ni lien, ni archive, ni empreinte, ni unite, ni taux", () => {
  const p = (famille, resultat, numero) => ({ famille, resultat, numero, proba: 0.6, dom: "A", ext: "B", selection: "A gagne", meilleure_cote: 1.6, meilleur_bookmaker: "winamax", selections: [] });
  const semaine = [p("simple", "gagne", 1), p("simple", "perdu", 2), p("simple", "gagne", 3), p("combine", "perdu", 4), p("buteur", "rembourse", 5)];
  const b = C.messageBilanSemaine("2026-09-28", "2026-10-04", semaine, semaine);
  assert.match(b, /<b>Simples<\/b> · 2 paris : 2 gagnés, 1 perdu|<b>Simples<\/b> · 3 paris : 2 gagnés, 1 perdu\./);
  assert.match(b, /<b>Combinés du jour<\/b> · 1 pari : 0 gagné, 1 perdu\./);
  assert.ok(!/historique|archiv|empreinte|<a href/i.test(b), b);
  assert.ok(!/%|unité|€|annoncée|réelle|marge d'erreur|attendu/.test(b), b);
  const d = C.messageDebrief("Débrief du samedi", semaine);
  assert.match(d, /Débrief du samedi<\/b> · 5 paris : 2 gagnés, 2 perdus, 1 remboursé\./);
  assert.ok(!/historique|archiv|empreinte|<a href|<code>/i.test(d), d);
  assert.ok(!/%|unité|€/.test(d), d);
  // Pari a plusieurs selections : chaque selection et son resultat.
  const combo = { ...p("combine", "perdu", 9), selections: [{ dom: "Bayern Munich", ext: "Mainz", selection: "Bayern Munich gagne" }, { dom: "Lens", ext: "Nantes", selection: "Lens gagne" }],
    faits: { jambes: [{ score_dom: 3, score_ext: 0, resultat: "gagne" }, { score_dom: 1, score_ext: 1, resultat: "perdu" }] } };
  assert.match(C.messageDebrief("Débrief", [combo]), /N° PRO-9 · Combiné du jour \(2 sélections\) : perdu \(cote 1,60\)\. Bayern Munich – Mainz 3-0 : Bayern Munich gagne, gagné ; Lens – Nantes 1-1 : Lens gagne, perdu\./);
  // Reglement d'un combine : une selection perdue = perdu ; un match reporte = selection retiree.
  assert.deepStrictEqual([["gagne", "gagne"], ["gagne", "perdu"], ["annule", "gagne"], ["annule", "annule"]].map(C.resultatCombine), ["gagne", "perdu", "gagne", "annule"]);
});

// ---------- 9. regle d'arret (interne) ----------
test("regle d'arret : INTERNE, apres 300 simples ; suspension si toute la fourchette de l'ecart est sous -3 points", () => {
  const serie = (n, pGagne, proba = 0.64) => Array.from({ length: n }, (_, i) => ({ famille: "simple", proba, resultat: i < Math.round(n * pGagne) ? "gagne" : "perdu" }));
  assert.deepStrictEqual([M.regleArret(serie(299, 0.4)).suspendre, M.regleArret(serie(299, 0.4)).alerte], [false, false], "avant 300 simples : rien");
  const juste = M.regleArret(serie(300, 0.64));
  assert.deepStrictEqual([juste.suspendre, juste.alerte], [false, false]);
  const limite = M.regleArret(serie(300, 0.6)); // ecart -4 points, fourchette ± 5,4 : alerte seulement
  assert.deepStrictEqual([limite.alerte, limite.suspendre], [true, false]);
  const mauvais = M.regleArret(serie(400, 0.52)); // ecart -12 points
  assert.deepStrictEqual([mauvais.alerte, mauvais.suspendre], [true, true]);
  assert.ok(mauvais.haut < -0.03);
  // Jamais affichee : aucun message public ne parle de l'ecart.
  assert.ok(!/écart|règle d'arrêt/.test(C.messageBilanSemaine("2026-09-28", "2026-10-04", serie(10, 0.5), serie(400, 0.52))));
});

// ---------- 10. sortie du moteur v3 et sources ----------
test("sortie du moteur v3 : contrat 1.1, 26 h au plus, interrupteur d'urgence ; reduite aux 6 championnats pour la base", () => {
  const s = sortieV3(lot(JOUR), ko(JOUR, "06:00"));
  assert.ok(M.verifierSortie(s, ko(JOUR, "08:15")).ok);
  assert.match(M.verifierSortie(s, ko("2026-10-08", "09:00")).raison, /périmée/);
  assert.match(M.verifierSortie({ ...s, contrat_version: "1.0" }, ko(JOUR, "08:15")).raison, /contrat/);
  assert.match(M.verifierSortie({ ...s, interrupteur_urgence: true }, ko(JOUR, "08:15")).raison, /urgence/);
  const r = reduire({ ...s, matchs: [...s.matchs, matchV3({ id: "usa", ligue_code: "USA", dom: "Austin", ext: "Dallas", ko: ko(JOUR, "20:00"), lh: 2, la: 1, fixture: 1 })] });
  assert.strictEqual(r.matchs.length, 8);
  assert.ok(r.matchs.every((m) => m.marches.every((x) => /^(1N2|DC):/.test(x.cle))));
  assert.ok(M.verifierSortie(r, ko(JOUR, "08:15")).ok);
  assert.ok(Math.abs(M.sansMargePuissance([1.9, 3.5, 4.2]).reduce((a, x) => a + x, 0) - 1) < 1e-9);
});

test("sources : la sortie du v3 d'abord (panne = aucun credit de cotes), 1 appel par championnat, vraie double chance par match", async () => {
  const dir = (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "iashark-v3-"));
  const fs = await import("node:fs");
  const ms = lot(JOUR);
  const urls = [];
  const vrai = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const url = new URL(String(u)); urls.push(url);
    const sport = url.pathname.split("/")[3];
    if (url.pathname.includes("/events/")) { const id = url.pathname.split("/")[5]; const m = ms.find((x) => `ev-${x.match_id}` === id); return new Response(JSON.stringify(evenementOdds(m, { dcChez: ["winamax_fr"], marches: ["double_chance"] })), { status: 200 }); }
    const evs = ms.filter((m) => evenementOdds(m).sport_key === sport).map((m) => evenementOdds(m));
    return new Response(JSON.stringify(evs), { status: 200, headers: { "x-requests-remaining": "9000" } });
  };
  try {
    const src = creerSources({ ODDS_API_KEY: "cle-de-test", MOTEUR_V3_SORTIE: dir, DATA_JSON: `${dir}/absent.json` }, { log: () => {} });
    await assert.rejects(src.candidats(JOUR, new Date(ko(JOUR, "08:15"))), /^Error: Moteur v3 : aucun fichier de sortie/);
    assert.strictEqual(urls.length, 0, "sortie absente : aucun appel de cotes");
    fs.writeFileSync(`${dir}/${JOUR}.json`, JSON.stringify(sortieV3(ms, ko(JOUR, "06:00"))));
    const r = await src.candidats(JOUR, new Date(ko(JOUR, "08:15")));
    const odds = urls.filter((u) => u.pathname.endsWith("/odds") && !u.pathname.includes("/events/"));
    assert.strictEqual(odds.length, 6, "un appel par championnat du menu");
    assert.ok(odds.every((u) => u.searchParams.get("markets") === "h2h" && u.searchParams.get("bookmakers") === "pinnacle,betclic_fr,netbet_fr,pmu_fr,unibet_fr,winamax_fr,williamhill,sport888,betsson,marathonbet"));
    assert.ok(urls.some((u) => u.pathname.includes("/events/") && u.searchParams.get("markets") === "double_chance"), "vraie double chance par match");
    assert.ok(r.candidats.some((c) => c.famille === "simple") && r.evenements === 8);
    assert.deepStrictEqual(LIGUES_MENU.map((l) => l.code), ["SP1", "D1", "I1", "F1", "N1", "P1"]);
    // Le releve d'un combine : 1 appel par championnat de ses selections.
    const combo = r.candidats.find((c) => c.famille === "combine");
    urls.length = 0;
    const etats = await src.etatsParis([{ ...combo, id: "k" }]);
    assert.strictEqual(etats.k.jambes.length, combo.selections.length);
    assert.ok(etats.k.jambes.every((e) => e && e.pinnacle_cote > 1));
  } finally { globalThis.fetch = vrai; fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- 11. robot personnel : detecteur de combine ----------
test("detecteur de combine : le combine du jour ecrit en texte est reconnu et relie ; un autre combine est note tel quel", () => {
  const r = menu(JOUR, lot(JOUR));
  const pr = C.preparerProgramme(r.candidats, { jour: JOUR, maintenant: ko(JOUR, "08:15") });
  const combo = { ...pr.paris.find((p) => p.famille === "combine"), id: "c1", numero: 14 };
  const noms = combo.selections.map((j) => j.dom).join(" + ");
  const t = C.lireTicketTexte(`${noms} à 2,00 chez Winamax 10 €`, [combo]);
  assert.strictEqual(t.pari?.id, "c1", noms);
  assert.ok(C.estUnTicket(t, `${noms} à 2,00 chez Winamax 10 €`));
  assert.match(C.messageTicket(t), /Ticket lu : 10 € sur le combiné du jour du programme \(.+\) à 2,00 chez Winamax\./);
  const autre = C.lireTicketTexte("Lille + Monaco à 3,10", [combo]);
  assert.strictEqual(autre.pari, null);
  assert.strictEqual(C.trouverPari("Inter gagne à 1,40", [combo]), null, "le tabac et les tickets simples ne visent jamais un combine");
});

// ---------- Fusion V3 (30/09/2026) : les ligues du menu = ligues VALIDEES de la config ----------
test("ligues du menu : seulement les ligues validees de config/leagues.json, jamais « en test » ni une selection", async () => {
  const fs = await import("node:fs");
  const cfg = JSON.parse(fs.readFileSync(new URL("../config/leagues.json", import.meta.url), "utf8"));
  const mot = JSON.parse(fs.readFileSync(new URL("../config/moteur-v3.json", import.meta.url), "utf8"));
  const validees = new Set(cfg.fiabilite.ligues_validees);
  const codeDe = (k) => mot.ligues[String(cfg.leagues.find((l) => l.key === k).apiFootballId)];
  for (const code of Object.keys(M.MENU.ligues)) {
    const l = cfg.leagues.find((x) => mot.ligues[String(x.apiFootballId)] === code);
    assert.ok(l && validees.has(l.key), code + " : ligue validee dans la config");
  }
  assert.deepStrictEqual(M.MENU.ligues, M.liguesValidees(cfg, mot), "le menu lit la config");
  // Une ligue retiree de la liste validee (« Fiabilite : en test ») sort du menu.
  const sansLiga = { ...cfg, fiabilite: { ...cfg.fiabilite, ligues_validees: cfg.fiabilite.ligues_validees.filter((k) => k !== "laliga") } };
  assert.equal(M.liguesValidees(sansLiga, mot)[codeDe("laliga")], undefined, "Liga « en test » : hors du menu");
  // Config illisible : aucune ligue (jamais une liste en dur).
  assert.deepStrictEqual(M.liguesValidees(null, null), {});
  // Selection nationale : jamais au menu, meme dans une ligue du menu.
  const sortie = { matchs: [{ ligue_code: "SP1", competition_type: "selections", coup_envoi_utc: "2026-10-03 18:00" }, { ligue_code: "SP1", competition_type: "championnat", coup_envoi_utc: "2026-10-03 18:00" }] };
  assert.equal(M.matchsMenu(sortie, "2026-10-03T00:00:00Z", "2026-10-04T00:00:00Z").length, 1);
});


// ---------- 02/10/2026 : voie « cotes du marche » (15 competitions verifiees, liste a part) ----------
const evMarche = ({ id, sport, dom, ext, ko: k, h2h, ou = null, dc = null }) => ({ id, sport_key: sport, commence_time: k, home_team: dom, away_team: ext,
  bookmakers: [["pinnacle", 1], ["winamax_fr", 0.97], ["betclic_fr", 0.96], ["williamhill", 0.98]].map(([key, f], i) => ({ key, title: key, markets: [
    { key: "h2h", outcomes: [{ name: dom, price: +(h2h[0] * f).toFixed(2) }, { name: "Draw", price: +(h2h[1] * f).toFixed(2) }, { name: ext, price: +(h2h[2] * f).toFixed(2) }] },
    ...(ou ? [{ key: "totals", outcomes: [{ name: "Over", point: 2.5, price: +(ou[0] * f).toFixed(2) }, { name: "Under", point: 2.5, price: +(ou[1] * f).toFixed(2) }] }] : []),
    ...(dc && key === "winamax_fr" ? [{ key: "double_chance", outcomes: [{ name: `${dom}/Draw`, price: dc[0] }, { name: `Draw/${ext}`, price: dc[1] }, { name: `${dom}/${ext}`, price: dc[2] }] }] : []),
  ] })) });
const siteMatch = (id, leagueId, dom, ext, hm) => ({ id, league_id: leagueId, status: "NS", home: { n: dom }, away: { n: ext }, date: `${JOUR} ${hm}` });

test("cotes du marche : liste a part dans la config (22 competitions, marches autorises) ; Premier League, MLS, Suede, Liga MX, Argentine ajoutees (temoins du 02/10) ; voie v3 jamais doublee ; selections : aucun pari", async () => {
  const fs = await import("node:fs");
  const cfg = JSON.parse(fs.readFileSync(new URL("../config/leagues.json", import.meta.url), "utf8"));
  const liste = cfg.fiabilite.ligues_validees_cotes_marche;
  assert.strictEqual(Object.keys(liste).length, 22);
  // Ajout du 03/10/2026 : EXACTEMENT les marches des lignes « temoin » de verif-cotes-marche-hors-v3/synthese.csv (02/10).
  assert.deepStrictEqual(liste.premier, ["1N2", "DC", "OU2.5"]);
  for (const k of ["mls", "suede", "liga_mx", "argentina_liga_profesional"]) assert.deepStrictEqual(liste[k], ["1N2", "DC"], k);
  assert.ok(cfg.fiabilite._readme_cotes_marche.some((l) => /synthese\.csv du 02\/10\/2026/.test(l) && /temoin/.test(l)), "source citee dans la config");
  // Bundesliga et Eredivisie : rien ne change (voie v3, pas dans la liste).
  assert.ok(!liste.bundesliga && !liste.eredivisie);
  // Les competitions de la VOIE V3 ne sont jamais dans la voie marche ; les validees hors menu v3 y sont.
  const v3 = Object.values(M.clesVoieV3(cfg, createRequire(import.meta.url)("../config/moteur-v3.json")));
  assert.deepStrictEqual(v3.sort(), ["bundesliga", "eredivisie", "laliga", "ligue1", "primeira", "seriea"]);
  for (const k of v3) assert.ok(!M.MENU.ligues_cotes_marche[k], k + " : voie v3 seulement");
  assert.deepStrictEqual(Object.keys(M.MENU.ligues_cotes_marche).sort(), Object.keys(liste).filter((k) => cfg.leagues.find((l) => l.key === k)).sort());
  assert.deepStrictEqual([...M.MENU.ligues_cotes_marche.championship.marches], ["1X", "X2", "12", "O25", "U25"]);
  assert.deepStrictEqual([...M.MENU.ligues_cotes_marche.premier.marches], ["1", "N", "2", "1X", "X2", "12", "O25", "U25"]);
  assert.deepStrictEqual([...M.MENU.ligues_cotes_marche.mls.marches], ["1", "N", "2", "1X", "X2", "12"]);
  // Sans config du moteur : prudence, toute competition validee reste exclue (ancien comportement).
  assert.ok(!M.liguesCotesMarche(cfg).premier);
  // MLS : maintenant dans la voie ; selections europeennes (Ligue des nations, eliminatoires du Mondial zone
  // Europe, VERIF-SELECTIONS.md du 02/10) : 1N2 et double chance ; amical international (id 10) : jamais.
  const { debut, fin } = C.fenetreProgramme(JOUR);
  const site = [siteMatch(1, 253, "Austin", "Dallas", "20:00"), siteMatch(2, 5, "France", "Italie", "20:45"), siteMatch(3, 32, "Espagne", "Suede", "20:45"), siteMatch(4, 10, "Bresil", "Japon", "20:00")];
  assert.deepStrictEqual(M.matchsCotesMarche(site, debut, fin).map((m) => m.ligue_cle), ["mls", "nations_league", "wcq_europe"]);
  assert.deepStrictEqual(cfg.fiabilite.selections_cotes_marche, ["nations_league", "wcq_europe"]);
  for (const k of cfg.fiabilite.selections_cotes_marche) assert.deepStrictEqual(liste[k], ["1N2", "DC"], k);
  // Une selection marquee dans une config, hors de selections_cotes_marche : jamais dans la voie.
  assert.deepStrictEqual(M.liguesCotesMarche({ fiabilite: { ligues_validees_cotes_marche: { x: ["1N2"] } }, leagues: [{ key: "x", kind: "nations", apiFootballId: 5 }] }), {});
  assert.deepStrictEqual(Object.keys(M.liguesCotesMarche({ fiabilite: { ligues_validees_cotes_marche: { x: ["1N2"] }, selections_cotes_marche: ["x"] }, leagues: [{ key: "x", kind: "nations", apiFootballId: 5, oddsSportKey: "s" }] })), ["x"]);
});

test("Ligue des nations avec cotes : eligible en 1N2 et double chance (jamais les buts) ; amical international : jamais", () => {
  const { debut, fin } = C.fenetreProgramme(JOUR);
  const site = [siteMatch(5001, 5, "Spain", "Georgia", "20:45"), siteMatch(5002, 10, "Brazil", "Japan", "20:45")];
  const ms = M.matchsCotesMarche(site, debut, fin);
  assert.deepStrictEqual(ms.map((m) => [m.ligue_cle, m.ligue]), [["nations_league", "Ligue des nations"]], "l'amical n'est jamais liste");
  const ev = evMarche({ id: "nl1", sport: "soccer_uefa_nations_league", dom: "Spain", ext: "Georgia", ko: ms[0].coup_envoi_utc, h2h: [1.5, 4.4, 7.5], ou: [1.6, 2.4], dc: [1.12, 2.6, 1.22] });
  const cotes = { [ms[0].match_id]: { event_id: "nl1", sport_key: "soccer_uefa_nations_league", books: C.booksDepuisOddsApi(ev), releve_at: ko(JOUR, "08:10") } };
  const { jambes } = M.jambesCotesMarche(ms, cotes);
  assert.ok(jambes.some((j) => j.marche === "1") && jambes.some((j) => j.marche === "1X"), "1N2 et double chance");
  assert.ok(!jambes.some((j) => ["O25", "U25"].includes(j.marche)), "jamais les buts 2,5 pour les selections");
  const r = M.construireMenu({ jour: JOUR, matchsJour: [], cotesParMatch: cotes, marcheJour: ms });
  const s = r.candidats.find((c) => c.famille === "simple");
  assert.deepStrictEqual([s.ligue, s.marche, s.source_proba], ["Ligue des nations", "1", C.SOURCE_COTES_MARCHE]);
});

test("Premier League eligible par la voie « cotes du marche » : 1N2, double chance et buts 2,5 ; libelle de chance inchange", () => {
  const { debut, fin } = C.fenetreProgramme(JOUR);
  const ms = M.matchsCotesMarche([siteMatch(39001, 39, "Liverpool", "Everton", "16:00")], debut, fin);
  assert.deepStrictEqual(ms.map((m) => [m.ligue_cle, m.ligue, m.voie]), [["premier", "Premier League", C.VOIE_COTES_MARCHE]]);
  const ev = evMarche({ id: "e39", sport: "soccer_epl", dom: "Liverpool", ext: "Everton", ko: ms[0].coup_envoi_utc, h2h: [1.52, 4.6, 6.8], ou: [1.7, 2.2] });
  const cotes = { [ms[0].match_id]: { event_id: "e39", sport_key: "soccer_epl", books: C.booksDepuisOddsApi(ev), releve_at: ko(JOUR, "08:10") } };
  assert.ok(M.jambesCotesMarche(ms, cotes).jambes.some((j) => j.marche === "O25"), "buts 2,5 autorises en Premier League");
  const r = M.construireMenu({ jour: JOUR, matchsJour: [], cotesParMatch: cotes, marcheJour: ms });
  const s = r.candidats.find((c) => c.famille === "simple");
  assert.ok(s, "un simple de Premier League");
  assert.deepStrictEqual([s.ligue, s.marche, s.voie], ["Premier League", "1", C.VOIE_COTES_MARCHE]);
  assert.strictEqual(s.source_proba, C.SOURCE_COTES_MARCHE);
  assert.match(C.chanceTxt({ ...s, famille: "simple" }), /^Chance calculée par IASHARK à partir des cotes du marché : \d+ %\.$/);
});

test("cotes du marche : marche autorise -> eligible, chance = probabilite sans marge (moyenne des cotes, methode puissance), libelle honnete ; marche NON autorise -> aucun pari", () => {
  const { debut, fin } = C.fenetreProgramme(JOUR);
  // Championship : DC et buts 2,5 autorises, PAS le 1N2 (Leeds a 1,62 serait pourtant dans la fourchette des simples).
  const site = [siteMatch(40001, 40, "Leeds", "Hull", "20:45")];
  const ms = M.matchsCotesMarche(site, debut, fin);
  assert.strictEqual(ms.length, 1);
  const ev = evMarche({ id: "e1", sport: "soccer_efl_champ", dom: "Leeds", ext: "Hull", ko: ms[0].coup_envoi_utc, h2h: [1.62, 4.0, 5.5], ou: [1.86, 1.96], dc: [1.16, 2.25, 1.26] });
  const cotes = { [ms[0].match_id]: { event_id: "e1", sport_key: "soccer_efl_champ", books: C.booksDepuisOddsApi(ev), releve_at: ko(JOUR, "08:10") } };
  const { jambes } = M.jambesCotesMarche(ms, cotes);
  assert.ok(jambes.length > 0);
  assert.ok(!jambes.some((j) => ["1", "N", "2"].includes(j.marche)), "1N2 non autorise en Championship : jamais");
  const o = jambes.find((j) => j.marche === "O25");
  assert.ok(o, "plus de 2,5 buts : autorise");
  // Chance attendue : moyenne des 4 bookmakers, marge retiree par la methode puissance.
  const books = C.booksDepuisOddsApi(ev);
  const moy = [0, 1].map((i) => Object.values(books).reduce((a, b) => a + b.ou[i], 0) / 4);
  const q = M.sansMargePuissance(moy)[0];
  assert.ok(Math.abs(o.proba - q) < 1e-12);
  // Affichee en % entier, meme arrondi que partout (lib/chance-iashark.js : une decimale, puis l'entier).
  assert.strictEqual(o.chance, createRequire(import.meta.url)("../lib/chance-iashark.js").chanceIashark(q * 100, null).chance / 100);
  assert.strictEqual(o.voie, C.VOIE_COTES_MARCHE);
  assert.deepStrictEqual(Object.keys(o.cotes).sort(), ["betclic_fr", "winamax_fr"], "seulement les agrees suivis (France)");
  const r = M.construireMenu({ jour: JOUR, matchsJour: [], cotesParMatch: cotes, marcheJour: ms });
  const simples = r.candidats.filter((c) => c.famille === "simple");
  assert.strictEqual(simples.length, 1);
  assert.ok(["O25", "U25"].includes(simples[0].marche));
  assert.strictEqual(simples[0].source_proba, C.SOURCE_COTES_MARCHE);
  const pr = C.preparerProgramme(r.candidats, { jour: JOUR, maintenant: ko(JOUR, "08:15") });
  assert.deepStrictEqual(pr.ecartes, []);
  const p = pr.paris[0];
  assert.match(C.chanceTxt(p), /^Chance calculée par IASHARK à partir des cotes du marché : \d+ %\.$/);
  assert.match(C.chanceTxt(p, "es"), /a partir de las cuotas del mercado/);
  assert.match(C.chanceTxt(p, "en"), /from market odds/);
  const t = C.messagesCanal(JOUR, [{ ...p, cote_vue_at: ko(JOUR, "08:15") }]);
  assert.match(t.tete, /à partir des cotes du marché/);
  assert.match(t.paris[0].html, /Championship · Leeds – Hull/);
  assert.ok(!INTERDITS.test(t.tete + t.paris[0].html));
  // Meme competition, rien d'autorise dans la fourchette : aucun pari.
  const ev2 = evMarche({ id: "e2", sport: "soccer_efl_champ", dom: "Leeds", ext: "Hull", ko: ms[0].coup_envoi_utc, h2h: [1.62, 4.0, 5.5] });
  const r2 = M.construireMenu({ jour: JOUR, matchsJour: [], cotesParMatch: { [ms[0].match_id]: { ...cotes[ms[0].match_id], books: C.booksDepuisOddsApi(ev2) } }, marcheJour: ms });
  assert.deepStrictEqual(r2.candidats.filter((c) => c.famille === "simple"), [], "1N2 a 1,62 non autorise, pas de buts ni de vraie double chance : aucun simple");
  // Sans Pinnacle ni 2 agrees : pas de cote de reference, pas de chance.
  const seul = { ...ev, bookmakers: ev.bookmakers.filter((b) => b.key === "winamax_fr") };
  assert.deepStrictEqual(M.chancesCotesMarche(C.booksDepuisOddsApi(seul)).q, {});
});
