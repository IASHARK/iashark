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
// modele (scanner de value, combine, variance) deviennent reserves aux
// abonnes, un visiteur gratuit devant les VOIR sans pouvoir s'en servir.
// Le calculateur de mise, lui, reste ouvert a tous - c'est ce que ce test
// continue de garantir, avec le fait qu'aucun outil n'est cache purement
// et simplement (le visiteur doit comprendre ce qu'on lui propose).
// Refonte du 03/09/2026 : la page Outils devient un TOOL CENTER. L'ancien
// verrou etait un voile CSS pose PAR-DESSUS de vraies donnees premium chargees
// dans le navigateur - c'etait une protection de facade. Ce test verifie
// desormais la vraie propriete : un visiteur gratuit voit et comprend les six
// outils, mais le client ne recoit AUCUNE donnee de match premium.
test("la page Outils expose les six outils sans mur, et sans donnee premium cote client", () => {
  const source = read("pro.html");
  const script = read("tools-page.js");

  // 1. Les six outils sont accessibles : personne ne doit rester devant un cadenas.
  for (const outil of ["scanner", "fair", "stake", "bankroll", "combo", "journal"]) {
    assert.match(source, new RegExp('data-tool="' + outil + '"'), outil + " doit etre atteignable");
    assert.match(source, new RegExp('data-panel="' + outil + '"'), outil + " doit avoir son espace de travail");
  }

  // 2. L'ancien verrou de facade ne revient pas.
  assert.doesNotMatch(source, /pro-veil/, "le voile CSS pose sur de vraies donnees ne doit pas revenir");
  assert.doesNotMatch(source, /data-locked/, "le verrou par attribut ne doit pas revenir");
  assert.doesNotMatch(script, /pro-veil/);

  // 3. SECURITE : la page ne lit jamais le data.json public. Les donnees de
  //    match passent uniquement par la fonction Edge qui applique
  //    l'autorisation cote serveur.
  // On vise l'APPEL, pas la chaine : le fichier contient un commentaire qui
  // explique justement qu'on ne lit jamais data.json.
  assert.doesNotMatch(script, /fetch\([^)]*data\.json/,
    "la page Outils ne doit jamais aller chercher le fichier public data.json");
  assert.match(script, /functions\.invoke\('match-data'\)/,
    "les donnees de match doivent passer par la fonction autorisee");
  assert.match(script, /if \(!ctx\.isPro\) return Promise\.resolve\(null\)/,
    "un visiteur non-abonne ne doit declencher aucun chargement de match");

  // 4. Les donnees de demonstration sont explicitement identifiees comme telles.
  assert.match(script, /MODE D\u00c9MONSTRATION|MODE DÉMONSTRATION/,
    "les donnees de demonstration doivent etre signalees");
  assert.match(script, /Club A – Club B/,
    "les exemples doivent etre fictifs et reconnaissables comme tels");
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
    assert.match(source, /match-page\.js/);
    assert.match(source, /match-view-model\.js/);
    assert.match(source, /<script type="application\/ld\+json">/);
    assert.doesNotMatch(source, /var proWall=/);
  }
});
