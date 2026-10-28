"use strict";
// FAUSSE TABLE tickets_du_jour POUR LES TESTS : recopie en JavaScript des VRAIES regles de gel de la base
// (supabase/migrations/0050_tickets_du_jour.sql, 0051_tickets_buteur_remplacement.sql, 0058_tickets_deux_buteurs.sql),
// pour que les tests du remplacement des buteurs voient ce que la base renverrait vraiment (remplace_a pose par la
// base, trace recopiee a l'identique, contenu remis quand la regle refuse). Controle de l'avocat du diable du
// 28/10/2026 : l'ancienne fausse base gardait tout ce qu'on lui envoyait, un 2e remplacement refuse par la vraie base
// passait les tests.
//
// mode : « 0050 » (gel seul : contenu jamais change), « 0051 » (un joueur, regle du 04/10/2026), « 0058 » (deux
// buteurs ; un ancien contenu a un joueur suit la regle de 0051).

const MOTIFS = ["absent_composition", "absent_annonce", "hors_effectif"];
const FIGES = ["jour", "type", "regle_version", "meta", "publie_a", "pipeline_sha"];
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const objet = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
const egal = (a, b) => stable(a) === stable(b);
const txt = (v) => (v === null || v === undefined ? "" : String(v));
const memeJoueur = (a, b) => txt(a && a.joueur_id) === txt(b && b.joueur_id) && txt(a && a.joueur) === txt(b && b.joueur);
const nonVide = (v) => typeof v === "string" && v.trim() !== "";

// old : ligne en base ; corps : colonnes envoyees par PATCH. -> nouvelle ligne (ce que la base garde).
function appliquerGel(old, corps, nowMs, mode) {
  const nw = Object.assign({}, clone(old), clone(corps));
  const anciens = objet(old.etats) && Array.isArray(old.etats.remplacements) ? old.etats.remplacements : [];
  const nouveaux = objet(nw.etats) ? nw.etats.remplacements : undefined;
  let valide = false, premier = null;
  if (mode !== "0050" && old.type === "buteur" && !egal(nw.contenu, old.contenu) && objet(nw.contenu)
    && Array.isArray(nouveaux) && nouveaux.length === anciens.length + 1 && egal(nouveaux.slice(0, -1), anciens)) {
    const d = nouveaux[nouveaux.length - 1];
    const trace = objet(d) && MOTIFS.indexOf(d.motif) !== -1 && egal(d.ancien, old.contenu);
    const deux = mode === "0058" && objet(old.contenu) && Array.isArray(old.contenu.buteurs) && old.contenu.buteurs.length > 0;
    if (!deux) {
      const ko = Number(nw.contenu.coup_envoi_ms);
      valide = trace && nonVide(nw.contenu.joueur) && nw.contenu.fixture_id != null && Number.isFinite(ko) && ko > nowMs && !memeJoueur(nw.contenu, old.contenu);
      premier = ko;
    } else {
      const ob = old.contenu.buteurs;
      const nb = Array.isArray(nw.contenu.buteurs) ? nw.contenu.buteurs : [];
      const rang = /^[0-9]+$/.test(txt(objet(d) ? d.rang : "")) ? Number(d.rang) : -1;
      if (nb.length === ob.length && rang >= 0 && rang < ob.length) {
        const nj = nb[rang];
        const ko = Number(nj && nj.coup_envoi_ms);
        const haut = Object.assign({}, nw.contenu); delete haut.buteurs;
        valide = trace && objet(nj) && nonVide(nj.joueur) && nj.fixture_id != null && Number.isFinite(ko) && ko > nowMs && !memeJoueur(nj, ob[rang])
          && egal(haut, nb[0]) && nb.every((x, i) => i === rang || (egal(x, ob[i]) && txt(x && x.fixture_id) !== txt(nj.fixture_id)));
        if (valide) premier = Math.min.apply(null, nb.map((x) => Number(x && x.coup_envoi_ms)).filter(Number.isFinite));
      }
    }
  }
  if (valide) {
    nw.premier_coup_envoi = new Date(premier).toISOString();
    nw.etats.remplacements[nw.etats.remplacements.length - 1].remplace_a = new Date(nowMs).toISOString();
  } else {
    nw.contenu = clone(old.contenu);
    nw.premier_coup_envoi = old.premier_coup_envoi;
    if (mode !== "0050") {
      nw.etats = objet(nw.etats) ? nw.etats : {};
      if (anciens.length) nw.etats.remplacements = clone(anciens); else delete nw.etats.remplacements;
    }
  }
  FIGES.forEach((k) => { nw[k] = clone(old[k]); });
  return nw;
}

// Faux PostgREST d'une seule ligne : GET -> [ligne] ; PATCH -> regles de gel, renvoie [ligne gardee].
// opts : { mode (« 0058 » par defaut), nowMs }. f.ligne() : la ligne en base ; f.appels : les appels.
function fausseBase(ligne, opts) {
  opts = opts || {};
  const mode = opts.mode || "0058";
  let row = ligne ? clone(ligne) : null;
  const appels = [];
  const f = async function (url, init) {
    init = init || {};
    const corps = init.body ? JSON.parse(init.body) : null;
    appels.push({ url, method: init.method || "GET", body: corps });
    if ((init.method || "GET") === "GET") return { ok: true, status: 200, json: async () => (row ? [clone(row)] : []) };
    if (init.method === "PATCH" && /tickets_du_jour\?jour=eq\./.test(url) && row) {
      row = appliquerGel(row, corps, opts.nowMs, mode);
      return { ok: true, status: 200, json: async () => [clone(row)] };
    }
    return { ok: true, status: 204, json: async () => null };
  };
  f.appels = appels;
  f.ligne = () => clone(row);
  return f;
}

module.exports = { appliquerGel, fausseBase, egal };
