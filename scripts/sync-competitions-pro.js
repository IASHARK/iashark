#!/usr/bin/env node
"use strict";
// COMPETITIONS PREFEREES des abonnes Pro (03/10/2026) : UNE seule liste, la meme pour le questionnaire
// du site (lib/pro-preferences.js, bloc @competitions) et pour le robot Telegram
// (supabase/functions/_shared/competitions-pro.mjs), generee depuis config/leagues.json :
//   - les competitions validees (fiabilite.ligues_validees) ;
//   - les competitions de la voie « cotes du marche » (fiabilite.ligues_validees_cotes_marche) ;
//   jamais une selection nationale. Cles = cles de config/leagues.json (« premier », « ligue1 »…), les
//   memes que les etoiles du site (user_metadata.fav_leagues) et que pro_preferences.competitions (0049).
// DECISION DE CLEMENT (03/10/2026) : les competitions preferees servent SEULEMENT a l'information (matchs
// du jour et resultats de ses competitions) : les paris sont les memes pour tous.
// A lancer apres chaque modification de config/leagues.json : node scripts/sync-competitions-pro.js
// tests/canal-pro-sur-mesure.test.mjs echoue si les fichiers ne sont plus identiques a la config.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LIB = path.join(ROOT, "lib/pro-preferences.js");
const ROBOT = path.join(ROOT, "supabase/functions/_shared/competitions-pro.mjs");

// Les 5 grands championnats, dans cet ordre (Premier League en tete).
const GRANDS = ["premier", "laliga", "seriea", "bundesliga", "ligue1"];
// Hors d'Europe (pays de config/leagues.json).
const PAYS_MONDE = ["USA/Canada", "Mexique", "Argentine", "Bresil", "Japon", "Colombie", "Perou", "Chili", "Afrique du Sud", "Arabie saoudite"];
const GROUPES = {
  grands: { fr: "Grands championnats", es: "Grandes ligas", en: "Top leagues", de: "Top-Ligen", it: "Grandi campionati", pt: "Grandes campeonatos" },
  selections: { fr: "Sélections européennes", es: "Selecciones europeas", en: "European national teams", de: "Europäische Nationalteams", it: "Nazionali europee", pt: "Seleções europeias" },
  coupes: { fr: "Coupes d'Europe", es: "Copas de Europa", en: "European cups", de: "Europapokale", it: "Coppe europee", pt: "Taças europeias" },
  europe: { fr: "Autres championnats d'Europe", es: "Otras ligas de Europa", en: "Other European leagues", de: "Weitere Ligen in Europa", it: "Altri campionati europei", pt: "Outros campeonatos europeus" },
  monde: { fr: "Amériques et reste du monde", es: "América y resto del mundo", en: "Americas and rest of the world", de: "Amerika und restliche Welt", it: "Americhe e resto del mondo", pt: "Américas e resto do mundo" },
};
// Noms des ligues de la voie v3 dans les paris (canal-pro-menu.mjs#LIGUES_REGLE_VIP), par code du moteur.
const NOMS_V3 = { SP1: "Liga", D1: "Bundesliga", I1: "Serie A", F1: "Ligue 1", N1: "Eredivisie", P1: "Liga Portugal" };

function groupeDe(l) {
  if (GRANDS.includes(l.key)) return "grands";
  if (l.kind === "nations" || l.kind === "wcq") return "selections";
  if (l.country === "UEFA") return "coupes";
  return PAYS_MONDE.includes(l.country) ? "monde" : "europe";
}

/** config/leagues.json (+ config/moteur-v3.json) -> { groupes, liste: [{ cle, nom, nom_en, groupe, api, alias? }], anciens } */
function donneesCompetitions(configLigues, configMoteur) {
  const f = configLigues.fiabilite || {};
  const retenues = new Set([...(f.ligues_validees || []), ...Object.keys(f.ligues_validees_cotes_marche || {})].map(String));
  const selOk = new Set((f.selections_cotes_marche || []).map(String));
  const codeParApi = (configMoteur && configMoteur.ligues) || {};
  const liste = [], anciens = {};
  for (const l of configLigues.leagues || []) {
    const selection = l.national === true || l.selections === true || l.kind === "nations" || l.kind === "wcq";
    if (!retenues.has(String(l.key)) || (selection && !selOk.has(String(l.key)))) continue;
    const code = codeParApi[String(l.apiFootballId)];
    const item = { cle: l.key, nom: (l.names && l.names.fr) || l.displayName || l.key, nom_en: l.displayName || l.key, groupe: groupeDe(l), api: Number(l.apiFootballId) || null };
    // Nom de la ligue dans les paris de la voie v3 (« Liga » pour La Liga) : pour relier un pari a sa competition.
    if (code && NOMS_V3[code]) { item.alias = NOMS_V3[code]; anciens[code] = l.key; }
    liste.push(item);
  }
  const ordre = Object.keys(GROUPES);
  liste.sort((a, b) => ordre.indexOf(a.groupe) - ordre.indexOf(b.groupe)
    || (a.groupe === "grands" ? GRANDS.indexOf(a.cle) - GRANDS.indexOf(b.cle) : 0));
  return { groupes: GROUPES, liste, anciens };
}

function lire(f) { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); }
function donneesDepuisConfig() { return donneesCompetitions(lire("config/leagues.json"), lire("config/moteur-v3.json")); }

/** Contenu du fichier du robot (Deno et Node : aucun import). */
function fichierRobot(d) {
  return "// GENERE par scripts/sync-competitions-pro.js depuis config/leagues.json : ne pas modifier a la main.\n"
    + "// Competitions preferees des abonnes Pro (information seulement : matchs du jour et resultats de SES\n"
    + "// competitions ; les paris sont les memes pour tous). Memes cles que le site (lib/pro-preferences.js).\n"
    + "export const DONNEES_COMPETITIONS = " + JSON.stringify(d) + ";\n";
}

if (require.main === module) {
  const d = donneesDepuisConfig();
  const lib = fs.readFileSync(LIB, "utf8");
  const re = /(\/\* @competitions-debut[^\n]*\n\s*var COMPETITIONS_PRO = )[^\n]*(;\n)/;
  if (!re.test(lib)) { console.error("bloc @competitions introuvable dans lib/pro-preferences.js"); process.exit(1); }
  fs.writeFileSync(LIB, lib.replace(re, function (m, a, b) { return a + JSON.stringify(d) + b; }));
  fs.writeFileSync(ROBOT, fichierRobot(d));
  console.log(`${d.liste.length} competitions : lib/pro-preferences.js et competitions-pro.mjs synchronises.`);
}

module.exports = { donneesCompetitions, donneesDepuisConfig, fichierRobot, GROUPES };
