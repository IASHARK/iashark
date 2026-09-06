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
  assert.match(wf, /var CHAMPS_PREMIUM=\['pari_rec','cote_rec','model_probability','markets_compared'\]/);
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

test("le pari n'est nomme dans le HTML SEO que pour l'analyse offerte", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /var pari=\(m\.is_free&&m\.pari_rec&&!m\.no_signal\)/,
    "nommer le pari de tous les matchs revenait a le publier dans un HTML indexe");
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
  assert.match(html, /mc-pari-locked-label/, "une mention honnete remplace le faux flou");
  assert.match(html, /m\.pari_rec\|\|m\.has_signal/,
    "la carte doit rester juste quand le pari n'est pas servi");
});
