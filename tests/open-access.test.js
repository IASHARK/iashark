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
// Aucun outil n'est cache purement et simplement (le visiteur doit comprendre
// ce qu'on lui propose). Cote juste, simulateur de capital et calculateur de
// mise sont retires (30/09/2026, decision de Clement : aucune mise ni
// esperance sur le site).
// Refonte du 03/09/2026 : la page Outils devient un TOOL CENTER. L'ancien
// verrou etait un voile CSS pose PAR-DESSUS de vraies donnees premium chargees
// dans le navigateur - c'etait une protection de facade. Ce test verifie
// desormais la vraie propriete : un visiteur gratuit voit et comprend les cinq
// outils, mais le client ne recoit AUCUNE donnee de match premium.
test("l'espace Pro (ancienne page Outils) expose le tableau de bord, mon combine et le detecteur d'ecarts, sans donnee premium cote client", () => {
  const source = read("pro.html");
  const script = read("tools-page.js");

  // 1. Tri du 29/09/2026, puis decision de Clement du 30/09/2026 (plus aucune
  //    mise ni esperance sur le site) : tableau de bord + mon combine (chance
  //    calculee, sans esperance) + detecteur d'ecarts. Tous atteignables.
  // Lancement du 3/10 (avocat du diable, 01/10/2026) : le tableau de bord (journal, garde-fou)
  // depend de 0040/0041, pas encore appliquees : cache (ni onglet, ni panneau) ; combine et detecteur.
  for (const outil of ["combo", "scanner"]) {
    assert.match(source, new RegExp('data-tool="' + outil + '"'), outil + " doit etre atteignable");
    assert.match(source, new RegExp('data-panel="' + outil + '"'), outil + " doit avoir son espace de travail");
  }
  for (const d of ["", "fr/", "en/", "es/", "gb/", "mx/", "za/"]) {
    assert.doesNotMatch(read(d + "pro.html"), /data-tool="tableau"|data-panel="tableau"/, d + "pro.html : tableau de bord cache pour le lancement");
  }
  assert.match(script, /var TABLEAU_OUVERT = !!\(window\.IASHARK_OUVERTURE && window\.IASHARK_OUVERTURE\.tableauPro === true\);/);
  // Retires : cote juste, simulateur de capital, journal (devenu « Mes paris »
  // du tableau de bord) et calculateur de mise (30/09/2026). Leurs anciennes
  // ancres menent au tableau de bord, dans les 7 pages de l'espace Pro.
  const RENDUS = { fair: "Fair", bankroll: "Bankroll", journal: "Journal", stake: "Stake" };
  for (const outil of Object.keys(RENDUS)) {
    for (const d of ["", "fr/", "en/", "es/", "gb/", "mx/", "za/"]) {
      const page = read(d + "pro.html");
      assert.doesNotMatch(page, new RegExp('data-tool="' + outil + '"'), d + "pro.html : " + outil + " retire");
      assert.doesNotMatch(page, new RegExp('data-panel="' + outil + '"'), d + "pro.html : panneau " + outil + " retire");
    }
    assert.doesNotMatch(script, new RegExp("function rendre" + RENDUS[outil] + "\\("), outil + " : code retire");
  }
  assert.match(script, /ANCIENNES_ANCRES = \{ fair: DEFAUT, bankroll: DEFAUT, journal: DEFAUT, stake: DEFAUT, tableau: DEFAUT \}/);
  assert.match(script, /var ORDRE = TABLEAU_OUVERT \? \['tableau', 'combo', 'scanner'\] : \['combo', 'scanner'\];/);
  assert.doesNotMatch(script, /sidebar_capital_label|profile\.capital/, "plus de capital dans la barre laterale");

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
  // Portee legere { scope: 'list' } (14/09/2026) : la fonction Edge lit
  // data-home.json et ajoute les champs premium pour un abonne confirme.
  assert.match(script, /functions\.invoke\('match-data', \{ body: \{ scope: 'list' \} \}\)/,
    "les donnees de match doivent passer par la fonction autorisee, en portee liste");
  assert.match(script, /if \(!ctx\.isPro\) return Promise\.resolve\(null\)/,
    "un visiteur non-abonne ne doit declencher aucun chargement de match");

  // 4. Les donnees de demonstration sont explicitement identifiees comme telles.
  assert.match(script, /MODE D\u00c9MONSTRATION|MODE DÉMONSTRATION/,
    "les donnees de demonstration doivent etre signalees");
  assert.match(script, /Club A – Club B/,
    "les exemples doivent etre fictifs et reconnaissables comme tels");
});

test("l'espace Pro n'annonce pas de fonctionnalite dont la donnee n'existe pas", () => {
  const script = read("tools-page.js");
  // Qualite des cotes (ma cote / cote de fin) : aucune source aujourd'hui
  // (controle de l'avocat du diable, 30/09/2026 : closing_odds retiree de la
  // migration, personne ne la remplissait). Le tableau de bord dit
  // « Bientot » et ne calcule aucun chiffre.
  assert.doesNotMatch(script, /closing_odds|closingOdds/i, "la page d'outils ne calcule aucune qualite de cote");
  assert.doesNotMatch(read("lib/pro-dashboard-model.js"), /closing_odds|qualiteCotes/);
  assert.match(read("pro-dashboard.js"), /pro_space\.quality_soon/);
  const sql = read("supabase/migrations/0041_pro_accueil.sql");
  const grantInsert = sql.match(/grant insert \(([^)]*)\)\s+on public\.betting_decisions to authenticated/);
  const grantUpdate = sql.match(/grant update \(([^)]*)\)\s+on public\.betting_decisions to authenticated/);
  assert.ok(grantInsert && grantUpdate);
  assert.doesNotMatch(grantInsert[1] + grantUpdate[1], /closing_odds|settled_at/, "l'abonne ne peut pas ecrire la cote de fin");
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
