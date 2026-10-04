(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkSelectionsNationales = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null), function () {
  "use strict";
  // MATCHS DE SELECTIONS NATIONALES (decision de Clement du 30/09/2026, apres l'avis
  // ORANGE du mathematicien sur le modele des selections) : Ligue des nations, matchs
  // amicaux internationaux, qualifications (Coupe du monde, Euro...), phases finales.
  // Sur le site : jamais eligibles au VIP ni au Canal Pro (aucun pari publie),
  // « Fiabilité : en test », seulement le 1N2 et la double chance, jamais « vérifié
  // sur le passé », jamais le match offert. Les probabilites du moteur ne changent pas.
  // Identifiants API-Football des competitions de selections.
  var IDS = [1, 4, 5, 6, 7, 9, 10, 29, 30, 31, 32, 33, 34, 37, 666, 960];
  var NOMS = /nations\s+league|ligue\s+des\s+nations|friendl|amicaux?\s+internationa|world\s+cup|coupe\s+du\s+monde|qualification|qualifiers?|euro\s+championship|championnat\s+d['’]europe|copa\s+am[ée]rica|africa\s+cup|coupe\s+d['’]afrique|asian\s+cup|gold\s+cup/i;
  function estSelectionNationale(m) {
    if (!m || typeof m !== "object") return false;
    var id = m.league_id != null ? m.league_id : (m.leagueId != null ? m.leagueId : null);
    if (id !== null && id !== "" && IDS.indexOf(Number(id)) !== -1) return true;
    var nom = typeof m.league === "string" ? m.league : (m.league && typeof m.league.name === "string" ? m.league.name : "");
    // Coupes de clubs (« Champions League », « Europa League »...) : jamais des selections.
    return !!nom && NOMS.test(nom) && !/champions|europa|conference|libertadores|sudamericana|club/i.test(nom);
  }
  // Marches affiches pour une selection : 1N2 et double chance seulement (ids du site).
  var MARCHES = ["home-win", "draw", "away-win", "dc-1x", "dc-x2", "dc-12"];
  function marcheAutorise(id) { return MARCHES.indexOf(String(id || "").toLowerCase()) !== -1; }
  return { IDS: IDS, estSelectionNationale: estSelectionNationale, marcheAutorise: marcheAutorise };
});
