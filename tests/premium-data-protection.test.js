"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pickFreeMatch } = require("../lib/free-match.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// FAILLE CORRIGEE le 03/09/2026. L'architecture de protection existait deja
// (match_premium_data + Edge Function match-data qui verifie le plan), mais elle
// ne couvrait que des metriques secondaires : kelly, edge, verdict_shark,
// facteur_x, dropping_odds, player_markets. Le PRODUIT LUI-MEME - le marche
// recommande, sa cote, la probabilite du modele - n'a jamais ete classe premium.
// Il partait donc en clair dans https://iashark.com/data.json (18 Mo, public,
// sans compte) et dans le HTML des pages match payantes.
const CHAMPS = ["pari_rec", "cote_rec", "model_probability", "markets_compared"];

test("la fonction Edge classe le pari recommande comme premium", () => {
  const fn = read("supabase/functions/match-data/index.ts");
  const bloc = fn.slice(fn.indexOf("const PREMIUM_FIELDS"), fn.indexOf("];", fn.indexOf("const PREMIUM_FIELDS")));
  for (const champ of CHAMPS) {
    assert.match(bloc, new RegExp('"' + champ + '"'), champ + " doit etre protege cote serveur");
  }
});

test("la fonction Edge laisse passer l'analyse offerte du jour", () => {
  const fn = read("supabase/functions/match-data/index.ts");
  assert.match(fn, /is_free === true/, "le match offert doit etre reconnu");
  assert.match(fn, /if \(estGratuit\(m\)\) return m;/, "il ne doit subir aucun retrait");
});

test("le pipeline retire ces champs du fichier public et des pages match", () => {
  const wf = read(".github/workflows/update-data.yml");
  // Depuis le 14/09/2026 : liste unique lib/premium-fields.js (toutes les sorties du modele).
  assert.match(wf, /var PREMIUM_FIELDS_LIB=require\('\.\/lib\/premium-fields\.js'\);/);
  assert.match(wf, /var CHAMPS_PREMIUM=PREMIUM_FIELDS_LIB\.PREMIUM_FIELDS\.slice\(\);/);
  const { PREMIUM_FIELDS } = require("../lib/premium-fields.js");
  for (const c of ["pari_rec", "cote_rec", "model_probability", "markets_compared", "market_id", "marche"]) assert.ok(PREMIUM_FIELDS.includes(c), c);
  // Depuis le branchement RUN_OUTPUT_ENGINE (2026-09-06), data.json est
  // serialise depuis dataJsonPayload (qui ajoute run_output/legacy_output
  // a cote) plutot qu'un objet litteral inline - mais son champ `matchs`
  // doit TOUJOURS venir de la copie assainie matchsPublics, jamais de
  // allMatchsData brut (la garantie de securite reste identique).
  assert.match(wf, /var dataJsonPayload = \{\s*matchs: matchsPublics,/,
    "data.json doit etre ecrit depuis la copie assainie (matchsPublics)");
  assert.match(wf, /fs\.writeFileSync\('data\.json',JSON\.stringify\(dataJsonPayload/,
    "data.json doit etre serialise depuis dataJsonPayload (qui porte matchs:matchsPublics)");
  assert.match(wf, /generateMatchPages\(matchsPublics\)/,
    "les pages match doivent etre generees depuis la copie assainie");
});

// Sans la cle service role, writePremiumData() n'ecrit rien. Retirer quand meme
// les champs du fichier public laisserait les analyses NULLE PART : un abonne
// payant ne verrait plus aucun pari. Une fuite connue vaut mieux qu'un produit
// casse pour les clients qui paient.
test("le pipeline ne retire rien s'il ne peut pas persister ailleurs", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /var PEUT_PROTEGER=!!\(SUPA_URL_PIPELINE&&SUPA_SERVICE_KEY\)/);
  assert.match(wf, /if\(!m\|\|m\.is_free\|\|!PEUT_PROTEGER\)return m;/,
    "sans table protegee accessible, le fichier public reste inchange");
});

// 16/09/2026 (audit du site en ligne) : plus aucun pari nomme dans le resume SEO
// statique, meme pour l'analyse offerte (le HTML est lu sans compte, alors que
// l'analyse offerte exige un compte gratuit).
test("le pari n'est jamais nomme dans le HTML SEO de l'accueil, meme offert", () => {
  const wf = read(".github/workflows/update-data.yml");
  const resume = wf.slice(wf.indexOf("function seoHomeSummaryHtml("), wf.indexOf("function injectHomeSeoSummary("));
  assert.match(resume, /var pari='';/, "nommer le pari revenait a le publier dans un HTML indexe");
  assert.doesNotMatch(resume, /seo_ai_pick|data-market-label|m\.pari_rec|m\.conf/);
});

// Le site, la page match et la fonction Edge doivent designer LE MEME match.
test("la designation serveur du match offert fait autorite cote client", () => {
  const liste = [
    { id: 1, date: "2026-09-02 20:00", pari_rec: "A", conf: 9 },
    { id: 2, date: "2026-09-02 21:00", has_signal: true, conf: 3, is_free: true }
  ];
  const choisi = pickFreeMatch(liste, { day: "2026-09-02", now: "2026-09-02 10:00" });
  assert.equal(choisi.id, 2, "is_free doit primer sur l'heuristique de confiance");
});

test("un match dont le pari est retire reste reconnu comme analyse", () => {
  const liste = [{ id: 7, date: "2026-09-02 20:00", has_signal: true, conf: 6 }];
  const choisi = pickFreeMatch(liste, { day: "2026-09-02", now: "2026-09-02 10:00" });
  assert.equal(choisi.id, 7, "has_signal remplace pari_rec quand celui-ci est protege");
});

test("la page d'accueil ne floute plus une donnee premium", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /filter:blur\(7px\)/,
    "flouter une vraie donnee en CSS n'est pas une protection : elle reste lisible dans le DOM");
  // Liste des matchs (home-list.js) : la pilule floutee de la ligne verrouillee
  // est faite de barres CSS abstraites, identiques sur toutes les lignes, sans
  // aucun texte ni chiffre (ni vrai ni faux).
  const list = read("home-list.js");
  assert.match(list, /<span class="hl-ghost"><i class="g1"><\/i><i class="g2"><\/i><i class="g3"><\/i><i class="g4"><\/i><\/span>/);
  const css = read("assets/home-list.css");
  const blurred = css.match(/[^{}]+\{[^}]*filter:blur\([^)]*\)[^}]*\}/g) || [];
  blurred.forEach((rule) => assert.match(rule, /^\s*\.hl-ghost\{/, "flou reserve aux barres abstraites : " + rule.trim()));
  assert.match(list, /m\.has_signal\|\|m\.pari_rec\|\|m\.market_id/,
    "la ligne doit rester juste quand le pari n'est pas servi");
});

// 14/09/2026 : l'analyse offerte du jour est le match qui a le plus de valeur
// (probabilite modele x cote - 1), quel que soit le championnat. Plus d'offre
// pays : aucun free_markets n'est publie.
test("le pipeline designe l'offre du jour par la valeur, sans offre pays", () => {
  const wf = read(".github/workflows/update-data.yml");
  const debut = wf.indexOf("(function designerMatchGratuit(){");
  const bloc = wf.slice(debut, wf.indexOf("})();", debut));
  assert.match(bloc, /return \(p\/100\)\*o-1;/, "valeur = probabilite modele x cote - 1");
  assert.match(bloc, /var PROBA_MIN=45;/);
  assert.doesNotMatch(bloc, /OFFRES_PAYS|league_key===o\.league_key/, "plus d'offre par championnat");
  assert.match(bloc, /delete m\.free_markets;/);
});

test("une offre pays reste publique cote client pour son marche, l'offre generale ailleurs", () => {
  const liste = [
    { id: 1, date: "2026-09-02 21:00", has_signal: true, conf: 9, is_free: true, free_markets: ["default"] },
    // 23:00 : a 10:00 un match de 03:00 est deja joue et n'est plus jamais offert (16/09/2026).
    { id: 2, date: "2026-09-02 23:00", pari_rec: "Over 2.5", conf: 5, is_free: true, free_markets: ["mx"] },
    { id: 3, date: "2026-09-02 20:00", has_signal: true, conf: 8 }
  ];
  const h = { day: "2026-09-02", now: "2026-09-02 10:00" };
  assert.equal(pickFreeMatch(liste, h, "mx").id, 2);
  assert.equal(pickFreeMatch(liste, h, "za").id, 1, "sans offre PSL, l'Afrique du Sud retombe sur l'offre generale");
  assert.equal(pickFreeMatch(liste, h).id, 1);
});

// 14/09/2026 (audit QA) : market_id et marche nomment le marche recommande.
// Ils etaient publics dans data.json alors que pari_rec etait protege.
test("market_id et marche sont premium : retires du fichier public, ecrits dans la table protegee, servis aux abonnes", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /var CHAMPS_PREMIUM=PREMIUM_FIELDS_LIB\.PREMIUM_FIELDS\.slice\(\);/);
  const LISTE = require("../lib/premium-fields.js").PREMIUM_FIELDS;
  assert.ok(LISTE.includes("market_id") && LISTE.includes("marche"));
  assert.match(wf, /market_id:pickedMarket\?pickedMarket\.id:null,\n\s*marche:pickedMarket\?categorizeMarket\(pickedMarket\.market\):null,/);
  assert.match(wf, /lignePremiumSafePick\.market_id=matchCibleSafePick\.market_id;/);
  const fn = read("supabase/functions/match-data/index.ts");
  const bloc = fn.slice(fn.indexOf("const PREMIUM_FIELDS"), fn.indexOf("];", fn.indexOf("const PREMIUM_FIELDS")));
  assert.match(bloc, /"market_id", "marche"/);
  assert.match(fn, /market_id: premium\.market_id \?\? m\.market_id \?\? null/);
});
