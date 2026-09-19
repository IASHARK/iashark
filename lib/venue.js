(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkVenue = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  // STADE ET VILLE D'UN MATCH (audit SEO du 19/09/2026).
  //
  // Cause des villes fausses (« Allianz Field - Sao Paulo », « Dick's Sporting
  // Goods Park - Trade City », « Estadio de Mestalla - Valdivia ») : le pipeline
  // ecrivait stade.nom = fixture.venue.name + " - " + fixture.venue.city tel que
  // renvoye par api-football. Quand fixture.venue.id est null ou 0, la fiche du
  // match n'est rattachee a aucun stade de la base api-football et sa ville est
  // un texte libre, parfois traduit automatiquement (Saint Paul -> Sao Paulo,
  // Commerce City -> Trade City). La meteo etait ensuite cherchee dans cette
  // ville (Sao Paulo pour un match a Saint Paul, Minnesota).
  //
  // Depuis le 19/09/2026 le pipeline n'ecrit une ville que si le stade est
  // rattache (venue.id > 0) : stade.ville = ville verifiee, ou "" si inconnue,
  // et stade.nom = "<stade> - <ville>" seulement dans le premier cas.
  // Donnees anterieures (pas de champ ville) : la ville ne peut pas etre
  // verifiee, seul le stade est affiche. Jamais une ville devinee.
  //
  // "<equipe> (domicile)" = repli du pipeline sans stade connu : texte
  // francais, jamais un lieu -> aucun stade.

  function str(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }

  // { name, city } ou null. city = ville verifiee, sinon null.
  function venueParts(stade) {
    if (!stade || typeof stade !== "object") return null;
    var nom = str(stade.nom);
    if (!nom || /\(domicile\)\s*$/i.test(nom)) return null;
    if (typeof stade.ville === "string") {
      var city = str(stade.ville);
      var suffix = city ? " - " + city : null;
      var name = suffix && nom.length > suffix.length && nom.slice(-suffix.length) === suffix ? nom.slice(0, -suffix.length).trim() : nom;
      return { name: name, city: city };
    }
    // Ancien format : "<stade> - <ville non verifiee>" -> le stade seul.
    var i = nom.lastIndexOf(" - ");
    return { name: i > 0 ? nom.slice(0, i).trim() : nom, city: null };
  }

  // Libelle affiche : "<stade> - <ville>" si la ville est verifiee, sinon le stade.
  function venueLabel(stade) {
    var p = venueParts(stade);
    if (!p) return null;
    return p.city ? p.name + " - " + p.city : p.name;
  }

  // La meteo n'a de sens que pour une ville verifiee (elle est cherchee par ville).
  function hasVerifiedCity(stade) {
    var p = venueParts(stade);
    return !!(p && p.city);
  }

  // Ville d'une fiche api-football (fixture.venue) : seulement si le stade est
  // rattache a la base api-football (id > 0). Utilisee par le pipeline.
  function verifiedApiCity(venue) {
    if (!venue || typeof venue !== "object") return null;
    var id = Number(venue.id);
    return isFinite(id) && id > 0 ? str(venue.city) : null;
  }

  return { venueParts: venueParts, venueLabel: venueLabel, hasVerifiedCity: hasVerifiedCity, verifiedApiCity: verifiedApiCity };
});
