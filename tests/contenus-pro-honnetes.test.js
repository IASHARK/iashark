// Controle UX du 04/10/2026, tour 2 : « le flou n'est pas honnete et la page fait une fausse
// promesse ». Ce qu'on fait miroiter (apercu flou du match bloque, lignes cadenas du match offert,
// avantages du composant de paiement) doit etre ce que Pro aura VRAIMENT sur CE match.
//  - le calcul quotidien publie pro_sections (liste publique, aucun chiffre) avec les memes regles
//    que la page (lib/match-sections.js#contenusPro, lib/sections-match.js#poserContenusPro) ;
//  - l'apercu flou, les lignes cadenas et les avantages ne montrent que ce qui est dans la liste ;
//  - le panneau Marches n'affiche plus les deux faces d'une meme ligne (plus / moins, oui / non).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MS = require("../lib/match-sections.js");
const SM = require("../lib/sections-match.js");
const OP = require("../lib/offre-pro.js");
const PREMIUM = require("../lib/premium-fields.js");

const VM = { identity: { home: { name: "Reading" }, away: { name: "Bradford" } }, model: null, editorial: {} };
function ctx(raw, o) { return Object.assign({ raw, vm: VM, vuePro: false, verrouPro: true, dit: MS.registre(), contenus: [] }, o || {}); }
const EV = (n) => ({ games: 10, slots: [1, 2, 3, 2, 3, 4].map((x) => ({ n: x * n })), slots_against: [1, 1, 2, 2, 2, 3].map((x) => ({ n: x })) });
const PUBLIC = { events_home: EV(1), events_away: EV(1) };
const RESUME = { v: "grille-v3-1", base: 10000, issues: { dom: 4500, nul: 2700, ext: 2800 }, scores: [{ score: "1-0", n: 1100 }], total_buts: null };
const TR = [0.31, 0.34, 0.41, 0.38, 0.39, 0.5];
const SI = { dom_premier: { p1: 80, pn: 15, p2: 5 }, ext_premier: { p1: 25, pn: 30, p2: 45 }, nul_pause: { p1: 45, pn: 35, p2: 20 } };
const ARB = { nom: "M. Dupont", n: 60, debut: "2024-08-01", fin: "2026-09-30", cartons: { m: [4.4, 4.1, 4.7], attendu: 4.0, ecart: [0.4, 0.1, 0.7] } };
const JUM = { resultat: { n: 281, depuis: 2012, niveau: "meme", dom: 76, nul: 82, ext: 123, pct: { dom: 27, nul: 29, ext: 44 }, exemples: [] }, buts: null };
const PANNEAU = { v: "panneau-2", nb: 2, familles: [{ cle: "buts", libelle: "Buts", marches: [{ id: "TOTAL:plus4.5", libelle: "Plus de 4,5 buts", chance: 18 }, { id: "TOTAL:moins4.5", libelle: "Moins de 4,5 buts", chance: 82 }] }] };

test("contenusPro : chaque section n'est listee que si elle s'affichera pour un abonne", () => {
  assert.deepEqual(MS.contenusPro(null), []);
  assert.deepEqual(MS.contenusPro({}), []);
  assert.deepEqual(MS.contenusPro(PUBLIC), ["film"], "hors perimetre du v3 : le film (donnees publiques) seulement");
  assert.deepEqual(MS.contenusPro({ sim_15min: { tr: TR } }), [], "la chance d'un but par quart d'heure vit DANS le film : sans film, rien");
  const plein = Object.assign({}, PUBLIC, {
    sim_resume: RESUME, sim_15min: { tr: TR, si_affiche: SI, minute_mediane_premier_but: 29 }, premier_but: { dom: 55, ext: 37, aucun: 8, avant_pause: 69 },
    jumeaux: JUM, v3_buteurs: [{ joueur_id: 1, joueur: "A. B", cote: "home", poste: "F", p_marque: 0.3, chance: 30 }], stats_iashark: { arbitre: ARB }, marches_panneau: PANNEAU });
  assert.deepEqual(MS.contenusPro(plein), ["sim", "sim_scores", "film", "film_modele", "premier", "et_si", "jumeaux", "joueurs", "arbitre", "marches"]);
  // 04/10/2026, soir : « 10 000 fois » tire des cotes du marche (hors du v3) = victoire / nul /
  // victoire seulement : « sim » sans « sim_scores » (l'offre ne promet pas de scores).
  const parCotes = Object.assign({}, PUBLIC, { sim_resume: { v: "cotes-marche-1", base: 10000, source: "cotes", issues: { dom: 6400, nul: 2000, ext: 1600 }, scores: [], total_buts: null } });
  assert.deepEqual(MS.contenusPro(parCotes), ["sim", "film"]);
  // Memes seuils que les sections : moins de 200 jumeaux, buteur hors 10-45 %, arbitre sur 20 matchs : rien.
  const faible = Object.assign({}, PUBLIC, { jumeaux: { resultat: Object.assign({}, JUM.resultat, { n: 150, dom: 50, nul: 50, ext: 50 }), buts: null },
    v3_buteurs: [{ joueur: "A. B", cote: "home", chance: 8 }], stats_iashark: { arbitre: Object.assign({}, ARB, { n: 20 }) } });
  assert.deepEqual(MS.contenusPro(faible), ["film"]);
});

test("pipeline : pro_sections publique, sans chiffre, posee sur chaque match (et retiree si vide)", () => {
  const a = Object.assign({ id: 1, sim_resume: RESUME }, PUBLIC), b = { id: 2, pro_sections: ["sim"] };
  assert.equal(SM.poserContenusPro([a, b, null]), 1);
  assert.deepEqual(a.pro_sections, ["sim", "sim_scores", "film"]);
  assert.equal("pro_sections" in b, false, "liste vide : champ retire (rien d'annonce)");
  assert.ok(!PREMIUM.PREMIUM_FIELDS.includes("pro_sections") && !PREMIUM.PRO_ONLY_FIELDS.includes("pro_sections"), "champ public, comme nb_marches");
  assert.deepEqual(PREMIUM.stripPremium(Object.assign({}, a)).pro_sections, ["sim", "sim_scores", "film"], "garde dans la copie publique");
  assert.ok(a.pro_sections.every((k) => MS.CONTENUS.includes(k) && !/\d/.test(k)), "des noms de sections, jamais un chiffre");
  const yml = fs.readFileSync(path.join(__dirname, "..", ".github/workflows/update-data.yml"), "utf8");
  const iJ = yml.indexOf("JUMEAUX.poserJumeaux"), iC = yml.indexOf("SECTIONS_MATCH.poserContenusPro(allMatchsData)"), iP = yml.indexOf("PROTECTION DU FICHIER PUBLIC");
  assert.ok(iJ > 0 && iC > iJ && iP > iC, "apres toutes les sections (jumeaux compris), avant le retrait des champs payants");
});

test("apercu flou : seulement ce que le visiteur aura une fois debloque (faux chiffres constants)", () => {
  assert.equal(MS.apercuFlou({ contenus: [], pari: false }), "", "rien a montrer : aucun apercu");
  const seulPari = MS.apercuFlou({ contenus: [] });
  assert.match(seulPari, /ap-slip/);
  assert.doesNotMatch(seulPari, /ap-row/, "ni anneau ni frise quand Pro n'aura ni « 10 000 matchs » ni film");
  // L'anneau ne figure que si « sim » est dans la liste. Match offert (decision de Clement du
  // 04/10/2026) : un compte gratuit y voit toutes les sections sauf le panneau Marches, donc
  // l'anneau aussi quand « 10 000 matchs » existe sur ce match.
  const src = fs.readFileSync(path.join(__dirname, "..", "lib/match-sections.js"), "utf8");
  assert.match(src, /var anneau = l\.indexOf\("sim"\) !== -1, frise = l\.indexOf\("film"\) !== -1/);
});

test("lignes cadenas du match offert : seulement pour un contenu que Pro aura sur CE match", () => {
  const film = (contenus) => MS.film(ctx(PUBLIC, { contenus }));
  assert.match(film([]), /Le film du match/);
  assert.doesNotMatch(film([]), /x-lock/, "pas de « chance d'un but par quart d'heure : Pro » sans le modele");
  assert.match(film(["film", "film_modele"]), /La chance d’un but par quart d’heure \(modèle\) : Pro\./);
  assert.equal(MS.premier(ctx({}, { contenus: ["film"] })), "");
  assert.match(MS.premier(ctx({}, { contenus: ["et_si", "premier"] })), /: Pro\./);
});

test("panneau Marches : une seule ligne par paire de contraires, le contraire nomme sans chiffre", () => {
  const l = MS.unirContraires([
    { id: "over-25", libelle: "Plus de 2,5 buts", chance: 57, pari: true }, { id: "under-25", libelle: "Moins de 2,5 buts", chance: 43 },
    { id: "TOTAL:moins4.5", libelle: "Moins de 4,5 buts", chance: 82 }, { id: "TOTAL:plus4.5", libelle: "Plus de 4,5 buts", chance: 18 },
    { id: "under-35", libelle: "Moins de 3,5 buts", chance: 65, pari: true }, { id: "TOTAL:plus3.5", libelle: "Plus de 3,5 buts", chance: 35 },
    { id: "EQUIPE_DOM:plus0.5", libelle: "Reading : plus de 0,5 but", chance: 78 }, { id: "btts-no", libelle: "Les deux marquent : non", chance: 41 }, { id: "BTTS:oui", libelle: "Les deux marquent : oui", chance: 59 }]);
  assert.deepEqual(l.map((x) => x.id), ["over-25", "TOTAL:plus4.5", "under-35", "EQUIPE_DOM:plus0.5", "BTTS:oui"]);
  assert.equal(l[0].contraire, "Moins de 2,5 buts", "le pari de l'Avis garde sa ligne, son contraire n'a plus de chiffre");
  assert.equal(l[2].contraire, "Plus de 3,5 buts", "pari « moins de » : c'est lui qui reste");
  assert.equal(l[3].contraire, undefined);
  const raw = { marches_panneau: PANNEAU };
  const p = MS.panneau({ raw, vm: VM, dit: MS.registre() });
  assert.match(p.html, /Plus de 4,5 buts<small class="mk-inv">contraire : moins de 4,5 buts<\/small>/);
  assert.doesNotMatch(p.html, /82\s?%/, "le chiffre du contraire n'est jamais ecrit");
  assert.match(p.html, /data-mk-txt="plus de 4,5 buts moins de 4,5 buts buts"/, "la recherche « moins de » trouve la ligne");
});

test("composant de paiement : avantages vrais pour CE match ; 3 ou 4 phrases ailleurs, dans chaque langue", () => {
  const txt = (l) => l.map((x) => x[1]).join(" | ");
  const vide = OP.avantages({ contexte: "match", contenus: [] });
  assert.equal(vide.length, 2);
  assert.doesNotMatch(txt(vide), /scores les plus probables|film du match|marchés|ouvre le score/, "aucune promesse que Pro ne tiendra pas sur ce match");
  const riche = OP.avantages({ contexte: "match", contenus: ["sim", "sim_scores", "film", "film_modele", "premier", "et_si", "marches"], nbMarches: 52 });
  assert.equal(riche.length, 4);
  assert.match(txt(riche), /Les 52 marchés de ce match/);
  assert.match(txt(riche), /scores les plus probables/);
  // « 10 000 fois » sans grille de scores (cotes du marche, hors du v3) : jamais « scores les plus probables ».
  const parCotes = OP.avantages({ contexte: "match", contenus: ["sim", "film", "marches"], nbMarches: 8 });
  assert.doesNotMatch(txt(parCotes), /scores les plus probables/);
  assert.match(txt(parCotes), /combien de fois chaque équipe gagne/);
  assert.deepEqual(OP.avantages({ contexte: "match", contenus: ["film"] }).map((x) => x[0]), ["chart-column", "calendar-days", "clapperboard"]);
  const fr = OP.avantages({ contexte: "general" });
  assert.ok(fr.length >= 3 && fr.length <= 4, "accueil, abonnement, compte : 3 ou 4 phrases");
  assert.match(txt(fr), /championnats les mieux mesurés/, "les contenus du v3 sont annonces avec leur condition");
  assert.doesNotMatch(txt(fr), /Chaque match du jour ouvert : le pari, sa chance et les scores/, "ancienne promesse retiree");
  const avant = globalThis.I18N;
  globalThis.I18N = { locale: "en", t: (k, fb) => fb };
  try { const en = OP.avantages({ contexte: "general" }); assert.ok(en.length >= 3, "en anglais aussi (controle UX : 2 seulement)"); } finally { globalThis.I18N = avant; }
  // Comment on paie : juste sous le bouton, avant les avantages.
  const plans = [{ interval: "month", text: "19,95 €", amount: 19.95 }];
  const h = OP.html({ mode: "paiement", contexte: "general", plans, choisi: "month", connecte: true, uid: "t" });
  assert.ok(h.indexOf('class="op-pay"') > h.indexOf("subscribeButton") && h.indexOf('class="op-pay"') < h.indexOf('class="op-benefits"'));
  const mp = fs.readFileSync(path.join(__dirname, "..", "match-page.js"), "utf8");
  assert.match(mp, /suivi:'match_gate_unlock',contenus,nbMarches:n\(pub\.nb_marches\)\}/, "le match bloque passe ses contenus au composant");
});

test("textes nouveaux : presents dans les 7 dictionnaires", () => {
  const cles = { offre_pro: ["benefit_pick", "benefit_every_match", "benefit_markets_n", "benefit_sim", "benefit_sim_issues", "benefit_first_whatif", "benefit_first", "benefit_film_model", "benefit_film_teams", "benefit_scorers", "benefit_all_matches", "benefit_v3"],
    match_v4: ["first_lock_only", "panel_inverse"], auth: ["pay_step_eyebrow", "pay_step_h1", "pay_step_intro", "pay_step_intro_noprice", "pay_step_week", "pay_step_month", "pay_step_year"] };
  for (const l of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "i18n/dict", l + ".json"), "utf8"));
    for (const ns of Object.keys(cles)) for (const k of cles[ns]) assert.ok(typeof (d[ns] || {})[k] === "string" && d[ns][k].trim(), l + " : " + ns + "." + k);
    assert.ok(!("benefit_match" in d.offre_pro) && !("benefit_film" in d.offre_pro), l + " : anciennes promesses retirees");
  }
});
