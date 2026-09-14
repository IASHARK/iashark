// /api/geo : localisation APPROXIMATIVE du visiteur deduite du reseau par
// Netlify (context.geo), pour les statistiques anonymes du tableau de bord.
// Declaree dans netlify.toml ([[edge_functions]]).
//
// Renvoie seulement { country, countryName, subdivision, city, timezone }.
// Aucune adresse IP, aucune coordonnee, aucun code postal ; rien n'est
// journalise ni stocke ici. Reponse jamais mise en cache (private, no-store).
// Logique pure : ./lib/geo-payload.mjs (tests/geo-edge.test.js).
import { geoResponse } from "./lib/geo-payload.mjs";

export default (request: Request, context: { geo?: unknown }) => {
  let r;
  try {
    r = geoResponse(request.method, context && context.geo);
  } catch (_e) {
    r = geoResponse(request.method, null);
  }
  return new Response(r.body, { status: r.status, headers: r.headers });
};
