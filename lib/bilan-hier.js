"use strict";
// BILAN D'HIER (etape 2 du plan de Clement du 21/10/2026 : « on ne montre pas les 100 paris du jour, seulement ce
// qu'on vend », et « pourquoi parler de X sur le site, il ne faut pas tout melanger ») : le pari offert et la
// Selection en or de la VEILLE, gagnes ET perdus, tous les jours, les bons comme les mauvais.
//
// Sources, le site seulement (jamais X) :
//   - quel match etait offert : preuves/matchs-offerts.json (entree du jour) ;
//   - le pari publie et gele de chaque match : match_premium_data LU A CE PASSAGE (le meme que results/,
//     lib/match-results.js), passe en parisPublies { "<fixture>": { pari, cote, market } } ;
//   - la Selection en or : la ligne publiee de la table tickets_du_jour (type « or ») du jour ;
//   - le resultat : results/<jour>.json (resultat du pari PUBLIE de chaque match).
// Garde-fous (controle de l'avocat du diable du 21/10/2026, verdict NO-GO corrige) :
//   - un pari n'est montre que s'il porte sur le pari publie LU A CE PASSAGE (meme market_id) : sans cette lecture
//     (base illisible), results/ pourrait regler un autre pari ; rien n'est montre ;
//   - la Selection en or n'est montree que si TOUS ses paris sont regles (gagne, perdu ou annule) : un pari absent de
//     results/ (pas encore regle, retire) ne fait jamais « 2 sur 2 » ; les annules sont dits ;
//   - deux matchs offerts le meme jour (ou une offre par pays) : le pari offert n'est pas montre (jamais deviner
//     lequel) ;
//   - aucun chiffre n'est retire : un mauvais jour s'affiche comme un bon.
// Fichier public preuves/bilan-hier.json : seulement des matchs de la veille, termines (plus rien a cacher).

const RESULTAT = { win: "gagne", loss: "perdu", void: "annule" };
const REGLES = ["gagne", "perdu", "annule"];

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

// opts : { jour (AAAA-MM-JJ, Paris), registre (preuves/matchs-offerts.json), ticketOr (ligne tickets_du_jour ou null),
// resultats (results/<jour>.json ou null), parisPublies, genereLe }.
// -> { version, jour, genere_le, offert: {...} | null, selection_or: {...} | null } (toujours un objet).
function construireBilan(opts) {
  const o = opts || {};
  const jour = texte(o.jour);
  const publies = estObjet(o.parisPublies) ? o.parisPublies : {};
  const entrees = (estObjet(o.registre) && Array.isArray(o.registre.matchs) ? o.registre.matchs : [])
    .filter(function (x) { return x && x.jour === jour && x.fixture_id != null; });
  let offert = null;
  if (entrees.length === 1) {
    const e = entrees[0];
    const pub = publies[String(e.fixture_id)] || null;
    const marche = pub && texte(pub.market);
    // Le pari publie lu a ce passage, et le meme marche que l'entree du registre quand elle est devoilee.
    if (marche && (!texte(e.market_id) || String(e.market_id) === marche)) {
      const pari = texte(pub.pari);
      const k = cote(pub.cote) || cote(e.cote_affichee);
      const resultat = resultatDe(o.resultats, e.fixture_id);
      if (pari && k && REGLES.indexOf(resultat) !== -1) offert = { fixture_id: Number(e.fixture_id), match: texte(e.match), pari: pari, cote: k, resultat: resultat };
    }
  }
  let selectionOr = null;
  // Raison d'une Selection en or absente (journal du calcul ; code sans match ni pari) : « aucun_ticket »,
  // « autre_marche » (pari qui n'est pas le pari publie) ou « pari_non_regle » (verdict absent de results/).
  let raisonSansOr = "aucun_ticket";
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
    const complet = paris.every(function (p) { return p.meme_pari && p.cote && REGLES.indexOf(p.resultat) !== -1; });
    if (!paris.every(function (p) { return p.meme_pari && p.cote; })) raisonSansOr = "autre_marche";
    else if (!complet) raisonSansOr = "pari_non_regle";
    if (complet) {
      const gagnes = paris.filter(function (p) { return p.resultat === "gagne"; }).length;
      const perdus = paris.filter(function (p) { return p.resultat === "perdu"; }).length;
      selectionOr = {
        paris: paris.map(function (p) { return { fixture_id: p.fixture_id, match: p.match, pari: p.pari, cote: p.cote, resultat: p.resultat }; }),
        gagnes: gagnes, regles: gagnes + perdus, annules: paris.length - gagnes - perdus, total: paris.length,
      };
    }
  }
  const bilan = { version: 1, jour: jour, genere_le: o.genereLe || null, offert: offert, selection_or: selectionOr };
  if (!selectionOr) bilan.selection_or_absente = raisonSansOr;
  return bilan;
}

// Jamais un bilan du jour remplace par un bilan plus pauvre (un passage sans acces a la base) : pour le meme jour,
// une partie deja montree est gardee si le nouveau calcul ne la retrouve pas.
function fusionnerAvecPrecedent(nouveau, precedent) {
  if (!estObjet(precedent) || !estObjet(nouveau) || precedent.jour !== nouveau.jour) return nouveau;
  const f = Object.assign({}, nouveau, {
    offert: nouveau.offert || precedent.offert || null,
    selection_or: nouveau.selection_or || precedent.selection_or || null,
  });
  if (f.selection_or) delete f.selection_or_absente;
  return f;
}

module.exports = { construireBilan, fusionnerAvecPrecedent, resultatDe };
