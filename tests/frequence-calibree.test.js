"use strict";
// Contre-controle ronde 4 (30/09/2026). Preuve de l'avocat : sur main depuis le
// 15/09, la page match ecrit « Sur 100 matchs comme celui-ci, notre modele s'attend
// a voir ce pari passer environ X fois » avec l'ANCIEN moteur, trop sur de lui
// (CURRENT_ENGINE_CALIBRATION_REPORT.md : 6,1 a 9,5 points d'ecart au 1N2).
// Desormais : la phrase seulement avec un pari du moteur v3 calibre, sinon rien.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildMatchViewModel, frequenceCalibree } = require("../lib/match-view-model.js");
// Une seule source (01/10/2026) : chaque match porte la chance posee par le pipeline
// (le plus bas entre le modele et la cote sans marge) ; la page n'affiche qu'elle.
const CHANCE = require("../lib/chance-iashark.js");
const avecChance = (raw) => { CHANCE.poserChance(raw); return raw; };

const VERIFIE = "vérifié sur le passé";
// Match avec un pari publie par l'ancien moteur (champs tels que servis aux Pro).
const ancien = {
  id: 1, home: { id: 1, n: "Lens" }, away: { id: 2, n: "Lille" }, league: "Ligue 1",
  data_quality_score: 80, model_output_available: true,
  market_id: "home-win", pari_rec: "Victoire Domicile", model_probability: 66, cote_rec: 1.8,
  p1: 66, pn: 20, p2: 14, reliability: { label: "Élevée" },
};
avecChance(ancien);
const v3 = Object.assign({}, ancien, {
  // Ligue 1 : championnat europeen, probabilite « modèle + cotes » (lib/moteur-v3.js#origineProbabilite).
  moteur_v3: { source: "v3", version_moteur: "3.0.0", origine_probabilite: "modèle + cotes" },
  v3_pari: { cle: "1N2:1", market_id: "home-win", probabilite: 66, etiquette: VERIFIE, fiabilite_marche: VERIFIE },
});

test("ancien moteur : pas de « Sur 100 matchs » (preuve rejouee)", () => {
  const vm = buildMatchViewModel(ancien);
  assert.ok(vm.model.recommendation, "le pari reste affiche");
  assert.equal(vm.model.frequencyCalibrated, false);
  assert.equal(frequenceCalibree(ancien), false);
});

test("pari v3 calibre, meme marche, meme probabilite : la phrase est permise", () => {
  assert.equal(buildMatchViewModel(v3).model.frequencyCalibrated, true);
});

test("tout autre cas : rien", () => {
  const cas = {
    "repli sur l'ancien moteur": Object.assign({}, v3, { moteur_v3: { source: "ancien moteur (repli)" } }),
    "sans moteur_v3": Object.assign({}, v3, { moteur_v3: undefined }),
    "pari v3 sur un autre marche": Object.assign({}, v3, { v3_pari: Object.assign({}, v3.v3_pari, { market_id: "over-25" }) }),
    "marche pas encore verifie": Object.assign({}, v3, { v3_pari: Object.assign({}, v3.v3_pari, { etiquette: "logique installée, pas encore vérifié" }) }),
    "competition non verifiee": Object.assign({}, v3, { v3_pari: Object.assign({}, v3.v3_pari, { fiabilite_marche: "non vérifié sur le passé / données limitées" }) }),
    "probabilite affichee differente": Object.assign({}, v3, { model_probability: 71 }),
    "probabilite v3 absente": Object.assign({}, v3, { v3_pari: Object.assign({}, v3.v3_pari, { probabilite: null }) }),
    "aucun pari affiche": Object.assign({}, v3, { pari_rec: null, market_id: null }),
  };
  for (const [nom, raw] of Object.entries(cas)) assert.equal(buildMatchViewModel(raw).model.frequencyCalibrated, false, nom);
});

test("page match : la phrase depend de frequencyCalibrated, rien d'autre ne l'affiche", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "match-page.js"), "utf8");
  const bloc = js.slice(js.indexOf("function signalCard(vm)"), js.indexOf("function marketsCard"));
  assert.match(bloc, /const plain=vm\.model\.frequencyCalibrated===true&&prob!==null&&implied!==null\n\s+\?tf\('match_page\.sig2_plain'/);
  assert.equal(js.split("match_page.sig2_plain").length - 1, 1, "une seule source de la phrase");
  assert.equal(js.split("Sur 100 matchs").length - 1, 1);
});

// ===========================================================================
// CONDITION 1 DU MATHEMATICIEN ET DE L'AVOCAT DU DIABLE (30/09/2026)
// Hors d'Europe, le moteur v3 calcule seul, sans la cote. Quand son estimation
// depasse la cote sans marge : 77,0 % annonces, 69,6 % passes (549 paris jamais
// vus). Preuve de l'avocat (avocat-r6/condition1.js) : un pari MLS a 80 %, face a
// une cote sans marge a 72 %, affichait « Sur 100 matchs… environ 80 fois » et
// « Le modèle voit plus de chances que le bookmaker : +8 points ».
// ===========================================================================
const vmLib = require("node:vm");
// Page match executee pour de vrai (match-page.js dans un faux navigateur) :
// on recupere signalCard et marketsCard, rendus en francais (repli sans I18N).
function pageMatch() {
  const src = fs.readFileSync(path.join(__dirname, "..", "match-page.js"), "utf8");
  const i = src.lastIndexOf("init();");
  assert.ok(i > 0, "appel init() introuvable dans match-page.js");
  const code = src.slice(0, i) + "window.__MP={signalCard,marketsCard,viewModel};\n" + src.slice(i + "init();".length);
  const el = { innerHTML: "", addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} };
  const win = { IasharkMatchViewModel: require("../lib/match-view-model.js"), location: { search: "", href: "" }, matchMedia: () => ({ matches: false }), addEventListener() {} };
  const ctx = { window: win, IasharkMatchViewModel: win.IasharkMatchViewModel, document: { getElementById: () => el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el, documentElement: el, body: el },
    console, setTimeout, clearTimeout, URLSearchParams, Intl, navigator: {} };
  vmLib.createContext(ctx);
  vmLib.runInContext(code, ctx);
  return win.__MP;
}
const MP = pageMatch();
const texte = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/&[#a-z0-9]+;/gi, " ").replace(/\s+/g, " ");
const rendu = (raw) => { const vm = MP.viewModel(raw); return { vm, avis: texte(MP.signalCard(vm)), marches: texte(MP.marketsCard(vm)) }; };

const mls = {
  id: 999, league: "Major League Soccer", league_key: "mls", home: { id: 10, n: "Austin" }, away: { id: 11, n: "Dallas" }, date: "2026-10-03 23:30", status: "NS",
  pari_rec: "Victoire Domicile", market_id: "home-win", model_probability: 80, cote_rec: "1.30", model_output_available: true, data_quality_score: 80,
  markets_compared: [{ id: "home-win", market: "Victoire Domicile", probability: 80, consensus: 72, edge: 8 }, { id: "over-25", market: "Over 2.5", probability: 61, consensus: 55, edge: 6 }],
  v3_pari: { market_id: "home-win", probabilite: 80, etiquette: VERIFIE, fiabilite_marche: VERIFIE },
  moteur_v3: { source: "v3", origine_probabilite: "modèle seul", couverture: "vérifiée", fiabilite_niveau: VERIFIE },
  reliability: { label: "Élevée" }, p1: 80, pn: 12, p2: 8, c1: 1.30, cn: 5.5, c2: 9.0, analysis_tier: "FULL_ANALYSIS",
  market_consensus_p1: 72, market_consensus_pN: 17, market_consensus_p2: 11,
};
avecChance(mls);
const avec = (raw, champs) => avecChance(Object.assign({}, raw, champs));
const origine = (raw, o) => avec(raw, { moteur_v3: Object.assign({}, raw.moteur_v3, { origine_probabilite: o }) });
const INTERDIT_ECART = /voit plus de chances|\+\s*\d+\s*points?|Écart favorable/;

test("preuve de l'avocat rejouee : pari MLS a 80 % (modele seul) face a une cote sans marge a 72 %, ni « Sur 100 » ni « +8 points »", () => {
  assert.equal(frequenceCalibree(mls), false);
  const r = rendu(mls);
  assert.equal(r.vm.model.frequencyCalibrated, false);
  assert.equal(r.vm.model.positiveGapHidden, true);
  assert.equal(r.vm.model.probabilitySource, "modèle seul");
  assert.ok(r.vm.model.recommendation, "le pari reste affiche");
  assert.doesNotMatch(r.avis, /Sur 100 matchs/);
  assert.doesNotMatch(r.avis, INTERDIT_ECART);
  // Une seule source (01/10/2026) : la chance affichee est le plus bas des deux (72 %), la meme que
  // l'espace Pro et Telegram ; les 80 % du modele seul ne sont plus jamais affiches.
  assert.match(r.avis, /Notre estimation 72\s?%/);
  assert.match(r.avis, /Ce que dit la cote 1,30 → 72\s?%/);
  assert.match(r.avis, /Notre estimation et la cote disent la même chose\./);
  assert.doesNotMatch(r.avis, /80\s?%/);
  // Tableau des marches : aucune ligne ne dit « voit plus de chances » ni « Écart favorable ».
  assert.doesNotMatch(r.marches, INTERDIT_ECART);
  assert.match(r.marches, /Estimation du modèle seul/);
  // Ni dans les risques (« écart faible avec le marché (+x pts) »).
  assert.doesNotMatch(r.avis, /écart faible avec le marché/);
});

test("meme regle sans origine publiee (donnees d'avant le correctif) et pour l'ancien moteur", () => {
  const sansOrigine = avec(mls, { moteur_v3: { source: "v3", couverture: "vérifiée" } });
  const ancienMoteur = avec(mls, { moteur_v3: { source: "ancien moteur (repli)" }, v3_pari: undefined });
  const inconnue = origine(mls, "modele et cotes");
  for (const [nom, raw] of Object.entries({ sansOrigine, ancienMoteur, inconnue })) {
    const r = rendu(raw);
    assert.equal(r.vm.model.frequencyCalibrated, false, nom);
    assert.equal(r.vm.model.positiveGapHidden, true, nom);
    assert.doesNotMatch(r.avis + r.marches, INTERDIT_ECART, nom);
    assert.doesNotMatch(r.avis, /Sur 100 matchs/, nom);
  }
});

test("modele + cotes (Europe) : la phrase et l'ecart restent, comme valides par le mathematicien", () => {
  const europe = origine(mls, "modèle + cotes");
  assert.equal(frequenceCalibree(europe), true);
  const r = rendu(europe);
  assert.equal(r.vm.model.positiveGapHidden, false);
  // La phrase reste (pari v3 calibre), avec la chance affichee : le plus bas des deux (72).
  assert.match(r.avis, /Sur 100 matchs comme celui-ci, notre modèle s’attend à voir ce pari passer environ 72 fois ; la cote en suppose 72\./);
  assert.match(r.avis, /Notre estimation et la cote disent la même chose\./);
});

test("modele seul SOUS la cote sans marge : phrase permise ; sans cote sans marge connue : rien", () => {
  const dessous = avec(mls, { model_probability: 70, v3_pari: Object.assign({}, mls.v3_pari, { probabilite: 70 }), p1: 70 });
  assert.equal(frequenceCalibree(dessous), true);
  const r = rendu(dessous);
  assert.match(r.avis, /Sur 100 matchs comme celui-ci, notre modèle s’attend à voir ce pari passer environ 70 fois ; la cote en suppose 72\./);
  assert.match(r.avis, /Le modèle voit moins de chances que le bookmaker : −2 points/);
  const egal = avec(dessous, { model_probability: 72, v3_pari: Object.assign({}, mls.v3_pari, { probabilite: 72 }) });
  assert.equal(frequenceCalibree(egal), true, "egal a la cote sans marge : permis");
  const auDessus = avec(dessous, { model_probability: 72.2, v3_pari: Object.assign({}, mls.v3_pari, { probabilite: 72.2 }) });
  assert.equal(frequenceCalibree(auDessus), false, "a peine au-dessus : rien");
  // Pas de ligne de comparatif (cote sans marge inconnue, seulement 1/cote avec la marge).
  assert.equal(frequenceCalibree(avec(dessous, { markets_compared: [] })), false);
  assert.equal(frequenceCalibree(avec(dessous, { markets_compared: [{ id: "home-win", market: "Victoire Domicile", probability: 70, consensus: null }] })), false);
});

test("etiquette « Faible » visible : Colombie sans pari, et coupe hors 1N2", () => {
  // Colombie (donnees limitees, jamais verifiee sur le passe) : aucun pari, les
  // probabilites du modele restent affichees plus bas.
  const nonVerifie = "logique installée, pas encore vérifié";
  const col = {
    id: 1549712, league: "Primera A", league_key: "colombia_primera_a", home: { id: 1, n: "Junior" }, away: { id: 2, n: "Medellin" }, date: "2026-10-03 03:20", status: "NS",
    pari_rec: "", market_id: null, model_probability: null, no_signal: true, model_output_available: true, data_quality_score: 60,
    p1: 48, pn: 28, p2: 24, po25: 44, market_consensus_p1: 45, market_consensus_pN: 29, market_consensus_p2: 26, c1: 2.1, cn: 3.2, c2: 3.6,
    markets_compared: [{ id: "home-win", market: "Victoire Domicile", probability: 48, consensus: 45, edge: 3 }, { id: "over-25", market: "Over 2.5", probability: 44, consensus: 47, edge: -3 }],
    reliability: { label: "Faible", historical_calibration: "NOT_AVAILABLE_YET", source: "moteur_v3" },
    moteur_v3: { source: "v3", origine_probabilite: "modèle seul", couverture: "données limitées", fiabilite_niveau: "non vérifié sur le passé / données limitées" },
    v3_marches: [{ cle: "1N2:1", market_id: "home-win", probabilite: 48, etiquette: nonVerifie }, { cle: "TOTAL:plus2.5", market_id: "over-25", probabilite: 44, etiquette: nonVerifie }],
  };
  const r = rendu(col);
  assert.match(r.avis, /Pas de pari retenu par le modèle sur ce match/);
  assert.match(r.avis, /Fiabilité faible/);
  assert.match(r.marches, /Fiabilité faible/);
  assert.doesNotMatch(r.marches, INTERDIT_ECART, "Colombie : modele seul, aucun ecart favorable dit");
  // Coupe (1N2 verifie, autres marches non) : l'etiquette sur les seules lignes hors 1N2.
  const coupe = avec(mls, {
    league: "UEFA Champions League", league_key: "ldc", reliability: { label: "Élevée" },
    moteur_v3: { source: "v3", origine_probabilite: "modèle seul", couverture: "vérifiée", fiabilite_niveau: VERIFIE },
    v3_marches: [{ cle: "1N2:1", market_id: "home-win", probabilite: 80, etiquette: VERIFIE }, { cle: "TOTAL:plus2.5", market_id: "over-25", probabilite: 61, etiquette: nonVerifie }],
  });
  const lignes = MP.viewModel(coupe).model.marketTable;
  assert.equal(lignes.find((l) => l.id === "home-win").unverified, undefined, "1N2 verifie : pas d'etiquette");
  assert.equal(lignes.find((l) => l.id === "over-25").unverified, true, "hors 1N2 : « Fiabilité faible »");
  const html = MP.marketsCard(MP.viewModel(coupe));
  const ligneBut = html.split('<li class="pr-row').find((x) => /Over 2\.5|plus de 2,5|2,5 buts/i.test(x));
  assert.ok(ligneBut && /Fiabilité faible/.test(ligneBut), "ligne « plus de 2,5 buts » sans « Fiabilité faible »");
  const ligneVictoire = html.split('<li class="pr-row').find((x) => /is-signal/.test(x));
  assert.ok(ligneVictoire && !/Fiabilité faible/.test(ligneVictoire));
});

test("aucun mot « valeur » ou « avantage », aucun taux de reussite dans l'avis et le tableau v3", () => {
  for (const raw of [mls, origine(mls, "modèle + cotes"), avec(mls, { moteur_v3: { source: "v3" } })]) {
    const r = rendu(raw);
    assert.doesNotMatch(r.avis + " " + r.marches, /valeur|avantage|\bvalue\b|taux de réussite|\d\s?% de réussite|réussite de \d/i);
  }
});

test("texte « Estimation du modèle seul » : dans les 7 langues, parts = dictionnaire, vraiment traduit, sans promesse", () => {
  const root = path.join(__dirname, "..");
  const vus = new Set();
  for (const loc of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(fs.readFileSync(path.join(root, "i18n/dict/" + loc + ".json"), "utf8")).match_page.proba_gap_model_only;
    const p = JSON.parse(fs.readFileSync(path.join(root, "i18n/parts/matchpage." + loc + ".json"), "utf8")).match_page.proba_gap_model_only;
    assert.ok(typeof d === "string" && d.trim(), loc);
    assert.equal(p, d, loc + " : parts et dictionnaire differents");
    assert.doesNotMatch(d, /gagn|garanti|sûr|valeur|avantage|win|guarant|value|edge/i, loc);
    vus.add(d);
  }
  assert.ok(vus.size >= 6, "pas traduit");
  const js = fs.readFileSync(path.join(root, "match-page.js"), "utf8");
  assert.ok(js.includes("t('match_page.proba_gap_model_only','Estimation du modèle seul, sans la cote : écart non affiché.')"));
});

// ===========================================================================
// DERNIERS POINTS « AVANT » DE L'AVOCAT DU DIABLE (30/09/2026, ronde 7)
// 1. « À surveiller » disait encore « même avec un écart favorable » (en anglais
//    « even with a positive edge ») juste sous « écart non affiché ». Preuve :
//    pari MLS « modèle seul » a 70 %, cote sans marge a 60 %, cote 1,62.
// 2. « Estimation du modèle seul, sans la cote » etait ecrit aussi pour l'ancien
//    moteur, dont le chiffre vient a 80 % de la cote sans marge (lib/decision.js).
//    Seul un chiffre du moteur v3 d'origine « modèle seul » peut le dire ; sinon
//    « Écart non affiché. »
// ===========================================================================
const LANGUES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const dictDe = (loc) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "i18n/dict/" + loc + ".json"), "utf8"));
// Page match executee dans une langue donnee (dictionnaire du site, comme i18n.js).
function pageMatchEn(loc) {
  const D = dictDe(loc);
  const I18N = { locale: loc, localeTag: () => loc, href: (p) => "/" + p,
    t: (k, f) => { const v = k.split(".").reduce((o, x) => (o ? o[x] : undefined), D); return typeof v === "string" ? v : f; } };
  const src = fs.readFileSync(path.join(__dirname, "..", "match-page.js"), "utf8");
  const i = src.lastIndexOf("init();");
  const code = src.slice(0, i) + "window.__MP={signalCard,marketsCard,viewModel};\n" + src.slice(i + "init();".length);
  const el = { innerHTML: "", addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} };
  const win = { I18N, IasharkMatchViewModel: require("../lib/match-view-model.js"), location: { search: "", href: "" }, matchMedia: () => ({ matches: false }), addEventListener() {} };
  const ctx = { window: win, I18N, IasharkMatchViewModel: win.IasharkMatchViewModel, document: { getElementById: () => el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el, documentElement: el, body: el },
    console, setTimeout, clearTimeout, URLSearchParams, Intl, navigator: {} };
  vmLib.createContext(ctx);
  vmLib.runInContext(code, ctx);
  return { MP: win.__MP, D };
}
// Preuve de l'avocat (avocat-r7/defaut-risque.js) : MLS 70 % face a 60 %, cote 1,62
// (pas de « cote basse »), aucun absent, modeles d'accord : aucun autre risque.
const mls70 = avec(mls, {
  model_probability: 70, cote_rec: "1.62", p1: 70, pn: 18, p2: 12, c1: 1.62, cn: 4.0, c2: 5.5,
  market_consensus_p1: 60, market_consensus_pN: 23, market_consensus_p2: 17,
  markets_compared: [{ id: "home-win", market: "Victoire Domicile", probability: 70, consensus: 60, edge: 10 }, { id: "over-25", market: "Over 2.5", probability: 61, consensus: 55, edge: 6 }],
  v3_pari: Object.assign({}, mls.v3_pari, { probabilite: 70 }),
});
const FAVORABLE = /écart favorable|positive edge|\bedge\b|diferencia favorable|positiver Abweichung|scarto favorevole|diferença favorável|avantage|advantage|ventaja|Vorteil|vantaggio|vantagem/i;

test("« À surveiller » : plus jamais « même avec un écart favorable » (MLS 70 % face a 60 %, cote 1,62), 7 langues", () => {
  for (const loc of LANGUES) {
    const { MP, D } = pageMatchEn(loc);
    const defaut = D.match_page.sig_risk_default;
    assert.doesNotMatch(defaut, FAVORABLE, loc + " : texte du dictionnaire");
    for (const o of ["modèle seul", "modèle + cotes"]) {
      const raw = origine(mls70, o);
      const avis = texte(MP.signalCard(MP.viewModel(raw)));
      // Page francaise (fusion V3, 30/09/2026) : « Le piege du match » (une vraie stat du
      // Book, ou une absence reelle, sinon rien) remplace « A surveiller ».
      if (loc === "fr") assert.ok(!avis.includes("À surveiller"), loc + " / " + o + " : le piege remplace « A surveiller »");
      else assert.ok(avis.includes(defaut), loc + " / " + o + " : la phrase par defaut doit rester affichee");
      assert.doesNotMatch(avis, FAVORABLE, loc + " / " + o);
    }
  }
  const js = fs.readFileSync(path.join(__dirname, "..", "match-page.js"), "utf8");
  assert.ok(js.includes("t('match_page.sig_risk_default','un seul match reste très aléatoire')"), "texte de repli de la page");
  assert.ok(!js.includes("même avec un écart favorable"));
  assert.equal(dictDe("fr").match_page.sig_risk_default, "un seul match reste très aléatoire");
  for (const loc of LANGUES) {
    const part = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "i18n/parts/match." + loc + ".json"), "utf8")).match_page.sig_risk_default;
    assert.equal(part, dictDe(loc).match_page.sig_risk_default, loc + " : parts et dictionnaire differents");
  }
});

test("« Estimation du modèle seul » seulement si source v3 ET origine « modèle seul » ; sinon « Écart non affiché. »", () => {
  const MODELE_SEUL = /Estimation du modèle seul/;
  const r = rendu(mls70);
  assert.equal(r.vm.model.modelOnlyV3, true);
  // Une seule source (01/10/2026) : la chance du pari est le plus bas des deux (60 %), elle ne
  // depasse jamais la cote sans marge. Les phrases d'ecart masque vivent sur les AUTRES marches
  // du tableau (ici « plus de 2,5 buts », 61 % face a 55 %).
  assert.match(r.avis, /Notre estimation 60 % Ce que dit la cote 1,62 → 60 % Notre estimation et la cote disent la même chose\./);
  assert.match(r.marches, /Estimation du modèle seul, sans la cote : écart non affiché\./);
  const cas = {
    "ancien moteur (80 % de cote sans marge)": avec(mls70, { moteur_v3: { source: "ancien moteur (repli)" }, v3_pari: undefined }),
    "ancien moteur qui ecrirait « modèle seul »": avec(mls70, { moteur_v3: { source: "ancien moteur (repli)", origine_probabilite: "modèle seul" }, v3_pari: undefined }),
    "sans moteur_v3 (pari fige avant l'allumage)": avec(mls70, { moteur_v3: undefined, v3_pari: undefined }),
    "v3 sans origine publiee": avec(mls70, { moteur_v3: { source: "v3", couverture: "vérifiée" } }),
    "v3 origine inconnue": origine(mls70, "modele et cotes"),
  };
  for (const [nom, raw] of Object.entries(cas)) {
    const x = rendu(raw);
    assert.equal(x.vm.model.positiveGapHidden, true, nom);
    assert.equal(x.vm.model.modelOnlyV3, false, nom);
    assert.doesNotMatch(x.avis + x.marches, MODELE_SEUL, nom);
    assert.match(x.marches, /Écart non affiché\./, nom);
    assert.doesNotMatch(x.avis + x.marches, INTERDIT_ECART, nom);
    assert.doesNotMatch(x.avis, /Sur 100 matchs/, nom);
  }
  // Europe (« modèle + cotes ») : l'ecart reste dit, ni l'une ni l'autre phrase.
  const eu = rendu(origine(mls70, "modèle + cotes"));
  assert.equal(eu.vm.model.modelOnlyV3, false);
  assert.doesNotMatch(eu.avis + eu.marches, /Écart non affiché|Estimation du modèle seul/);
  assert.match(eu.marches, /Le modèle voit plus de chances que le bookmaker : \+6 points/);
  // Meme regle en anglais.
  const { MP } = pageMatchEn("en");
  const en = (raw) => texte(MP.marketsCard(MP.viewModel(raw)));
  assert.match(en(mls70), /Model-only estimate, odds not included: gap not shown\./);
  assert.match(en(cas["ancien moteur (80 % de cote sans marge)"]), /Gap not shown\./);
  assert.doesNotMatch(en(cas["ancien moteur (80 % de cote sans marge)"]), /Model-only/);
});

test("texte « Écart non affiché. » : 7 langues, parts = dictionnaire, vraiment traduit, sans promesse", () => {
  const root = path.join(__dirname, "..");
  const vus = new Set();
  for (const loc of LANGUES) {
    const d = dictDe(loc).match_page.proba_gap_hidden;
    const p = JSON.parse(fs.readFileSync(path.join(root, "i18n/parts/matchpage." + loc + ".json"), "utf8")).match_page.proba_gap_hidden;
    assert.ok(typeof d === "string" && d.trim(), loc);
    assert.equal(p, d, loc + " : parts et dictionnaire differents");
    assert.doesNotMatch(d, /gagn|garanti|sûr|valeur|avantage|win|guarant|value|edge|modèle seul|model-only|cote|odds/i, loc);
    vus.add(d);
  }
  assert.ok(vus.size >= 6, "pas traduit");
  const js = fs.readFileSync(path.join(root, "match-page.js"), "utf8");
  assert.ok(js.includes("t('match_page.proba_gap_hidden','Écart non affiché.')"));
});
