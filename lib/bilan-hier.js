"use strict";
// BILAN D'HIER (etape 2 du plan de Clement du 21/10/2026 : « on ne montre pas les 100 paris du jour, seulement ce
// qu'on vend », et « pourquoi parler de X sur le site, il ne faut pas tout melanger ») : le pari offert et la
// Selection en or de la VEILLE, gagnes ET perdus, tous les jours, les bons comme les mauvais.
//
// Sources, le site seulement (jamais X) :
//   - quel match etait offert : preuves/matchs-offerts.json (entree du jour) ;
//   - le pari publie et gele de chaque match : match_premium_data (le meme que results/, lib/match-results.js), passe
//     en parisPublies { "<fixture>": { pari, cote, market } } ; il sert aussi quand l'entree du registre est encore
//     masquee (le devoilement du registre a lieu plus tard dans le meme calcul) ;
//   - la Selection en or : la ligne publiee de la table tickets_du_jour (type « or ») du jour ;
//   - le resultat : results/<jour>.json (resultat du pari PUBLIE de chaque match).
// Garde-fous :
//   - un pari de la Selection en or n'est compte que s'il porte sur le pari publie de son match (regle du 21/10 : la
//     Selection en or reprend le pari affiche). Sinon (regle d'avant, autre marche), le resultat du fichier ne le
//     regle pas : la Selection en or de ce jour n'est PAS affichee, jamais un chiffre faux ;
//   - un pari sans resultat reste « en_attente » et ne compte pas ; un match annule ou reporte est « annule » et ne
//     compte pas ;
//   - aucun chiffre n'est retire : un mauvais jour s'affiche comme un bon.
// Fichier public preuves/bilan-hier.json : seulement des matchs de la veille, termines (plus rien a cacher).

const RESULTAT = { win: "gagne", loss: "perdu", void: "annule" };

function texte(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }
function cote(v) {
  const x = Number(String(v == null ? "" : v).replace(",", "."));
  return Number.isFinite(x) && x > 1 ? Math.round(x * 100) / 100 : null;
}
function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

// Resultat du pari publie d'un match dans results/<jour>.json -> « gagne » | « perdu » | « annule » | « en_attente ».
function resultatDe(fichier, id) {
  const liste = estObjet(fichier) && Array.isArray(fichier.matches) ? fichier.matches : [];
  const m = liste.find(function (x) { return x && String(x.id) === String(id); });
  return m && RESULTAT[m.result] ? RESULTAT[m.result] : "en_attente";
}

function compter(paris) {
  const regles = paris.filter(function (p) { return p.resultat === "gagne" || p.resultat === "perdu"; });
  return { gagnes: regles.filter(function (p) { return p.resultat === "gagne"; }).length, regles: regles.length };
}

// opts : { jour (AAAA-MM-JJ, Paris), registre (preuves/matchs-offerts.json), ticketOr (ligne tickets_du_jour ou null),
// resultats (results/<jour>.json ou null), parisPublies, genereLe }.
// -> { version, jour, genere_le, offert: {...} | null, selection_or: {...} | null } (toujours un objet : le fichier
// du jour remplace celui de la veille, meme vide).
function construireBilan(opts) {
  const o = opts || {};
  const jour = texte(o.jour);
  const publies = estObjet(o.parisPublies) ? o.parisPublies : {};
  const entrees = (estObjet(o.registre) && Array.isArray(o.registre.matchs) ? o.registre.matchs : [])
    .filter(function (x) { return x && x.jour === jour && x.fixture_id != null; });
  let offert = null;
  if (entrees.length) {
    const e = entrees[0];
    const pub = publies[String(e.fixture_id)] || null;
    const pari = texte(e.pari) || (pub && texte(pub.pari));
    const k = cote(e.cote_affichee) || (pub && cote(pub.cote));
    if (pari && k) offert = { fixture_id: Number(e.fixture_id), match: texte(e.match), pari: pari, cote: k, resultat: resultatDe(o.resultats, e.fixture_id) };
  }
  let selectionOr = null;
  const contenu = estObjet(o.ticketOr) && estObjet(o.ticketOr.contenu) ? o.ticketOr.contenu : null;
  const brut = contenu && Array.isArray(contenu.paris) ? contenu.paris : [];
  if (brut.length) {
    const paris = brut.map(function (p) {
      const pub = publies[String(p && p.fixture_id)] || null;
      return {
        fixture_id: Number(p.fixture_id),
        match: [texte(p.domicile), texte(p.exterieur)].filter(Boolean).join(" - ") || null,
        pari: texte(p.pari), cote: cote(p.cote),
        // Meme pari que celui publie sur la page du match : seul cas ou results/ le regle.
        meme_pari: !!(pub && texte(pub.market) && String(pub.market) === String(p.market_id)),
        resultat: resultatDe(o.resultats, p.fixture_id),
      };
    });
    if (paris.every(function (p) { return p.meme_pari && p.cote; })) {
      const c = compter(paris);
      selectionOr = {
        paris: paris.map(function (p) { return { fixture_id: p.fixture_id, match: p.match, pari: p.pari, cote: p.cote, resultat: p.resultat }; }),
        gagnes: c.gagnes, regles: c.regles, total: paris.length,
      };
    }
  }
  return { version: 1, jour: jour, genere_le: o.genereLe || null, offert: offert, selection_or: selectionOr };
}

module.exports = { construireBilan, resultatDe };
