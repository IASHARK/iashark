"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("la page match n’insère plus de mur PRO", () => {
  const source = read("match.html");
  assert.doesNotMatch(source, /var proWall=/);
  assert.doesNotMatch(source, /\+proWall/);
});

// Decision produit revisee le 02/09/2026 : les outils qui exploitent le
// modele deviennent reserves aux abonnes. Refonte du 03/09/2026 : l'ancien
// verrou etait un voile CSS pose PAR-DESSUS de vraies donnees premium chargees
// dans le navigateur - c'etait une protection de facade.
// 21/10/2026 (36 visites en 5 semaines, 2 abonnes ; carte blanche de Clement pour
// vendre) : un visiteur non abonne voit une PAGE DE VENTE (lib/pro-vente.js), plus
// aucun outil ni ligne fictive « Club A – Club B » ; un abonne voit QUATRE outils.
// Le calculateur de mise et le simulateur de capital sont retires (regle de Clement :
// ni mise, ni capital, ni esperance). La vraie propriete reste verifiee : le client
// non abonne ne recoit AUCUNE donnee de match premium.
test("page Pro : vente pour un non-abonne, quatre outils pour un abonne, aucune donnee premium cote client", () => {
  const source = read("pro.html");
  const script = read("tools-page.js");

  // 1. Quatre outils pour l'abonne ; calculateur de mise et simulateur de capital retires.
  for (const outil of ["scanner", "fair", "combo", "journal"]) {
    assert.match(source, new RegExp('data-tool="' + outil + '"'), outil + " doit etre atteignable");
    assert.match(source, new RegExp('data-panel="' + outil + '"'), outil + " doit avoir son espace de travail");
  }
  for (const outil of ["stake", "bankroll"]) {
    assert.doesNotMatch(source, new RegExp('data-(tool|panel)="' + outil + '"'), outil + " retire");
  }
  assert.doesNotMatch(script, /rendreStake|rendreBankroll|calculateStake|simulateVariance|sidebarFoot/);
  assert.doesNotMatch(read("lib/tools-domain.js"), /function (calculateStake|simulateVariance)|return\{[^}]*(calculateStake|simulateVariance)/);

  // 2. Les outils sont caches tant que le serveur n'a pas dit « Pro » ; la vente est
  //    visible par defaut (sans JS aussi).
  assert.match(source, /<div id="proOutils" hidden>/);
  assert.match(source, /<div id="proVente" class="pv">/);
  assert.match(script, /if \(ctx\.isPro\) \{\s*montrer\('outils'\);/);
  assert.match(script, /window\.IasharkProVente\.mount\(document\.getElementById\('proVente'\)/);

  // 3. L'ancien verrou de facade ne revient pas.
  assert.doesNotMatch(source, /pro-veil/, "le voile CSS pose sur de vraies donnees ne doit pas revenir");
  assert.doesNotMatch(source, /data-locked/, "le verrou par attribut ne doit pas revenir");
  assert.doesNotMatch(script, /pro-veil/);

  // 4. SECURITE : la page ne lit jamais le data.json public. Les donnees de
  //    match passent uniquement par la fonction Edge qui applique
  //    l'autorisation cote serveur.
  // On vise l'APPEL, pas la chaine : le fichier contient un commentaire qui
  // explique justement qu'on ne lit jamais data.json.
  assert.doesNotMatch(script, /fetch\([^)]*data\.json/,
    "la page Outils ne doit jamais aller chercher le fichier public data.json");
  // Portee legere { scope: 'list' } (14/09/2026) : la fonction Edge lit
  // data-home.json et ajoute les champs premium pour un abonne confirme.
  assert.match(script, /functions\.invoke\('match-data', \{ body: \{ scope: 'list' \} \}\)/,
    "les donnees de match doivent passer par la fonction autorisee, en portee liste");
  assert.match(script, /if \(!ctx\.isPro\) return Promise\.resolve\(null\)/,
    "un visiteur non-abonne ne doit declencher aucun chargement de match");

  // 5. Plus aucune ligne de demonstration fictive.
  assert.doesNotMatch(script, /MODE D\u00c9MONSTRATION|MODE DÉMONSTRATION|Club A – Club B|DEMO_SCAN|DEMO_COMBO/);
});

test("la page Outils n'annonce pas de fonctionnalite dont la donnee n'existe pas", () => {
  const script = read("tools-page.js");
  // Les cotes de cloture ne sont pas collectees : aucun CLV ne doit etre calcule.
  assert.doesNotMatch(script, /clvMoyen|calculClv|closingOdds/i,
    "le CLV ne doit pas etre calcule tant que les cotes de cloture n'existent pas");
  assert.match(script, /closing line value/,
    "l'absence de CLV doit etre dite explicitement a l'utilisateur");
  // Aucun coefficient de correlation invente.
  assert.match(script, /Nous ne disposons pas de mesure de d\u00e9pendance|pas de mesure de dépendance/,
    "l'absence de mesure de correlation doit etre dite");
});

test("toutes les pages SEO de match utilisent la nouvelle structure sans mur PRO", () => {
  const files = fs.readdirSync(path.join(root, "match")).filter((file) => file.endsWith(".html"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = read(path.join("match", file));
    assert.match(source, /id="matchRoot"/);
    // Page conservee (match sorti du run, scripts/match-lifecycle.js) : fiche
    // statique depuis l'instantane public, sans script de page ni donnees de match.
    if (/class="match-archived"/.test(source)) {
      assert.doesNotMatch(source, /PRELOADED_MATCH|FIXED_MATCH_ID/);
      assert.match(source, /<script type="application\/ld\+json">/);
      assert.doesNotMatch(source, /var proWall=/);
      continue;
    }
    assert.match(source, /match-page\.js/);
    assert.match(source, /match-view-model\.js/);
    assert.match(source, /<script type="application\/ld\+json">/);
    assert.doesNotMatch(source, /var proWall=/);
  }
});
