"use strict";
// EMPREINTE QUOTIDIENNE DES PARIS PUBLIES (historique-public, 29/09/2026).
//
// Chaque jour, le pipeline publie dans preuves/empreintes-paris.json une
// empreinte SHA-256 des paris du jour, chainee a la precedente (comme le
// registre du test cache, iashark-preuve/registre). Modifier un pari apres coup,
// ou retirer un maillon, casse la chaine : n'importe qui peut le verifier.
//
// Secret des paris payants : l'empreinte des paris d'un jour est calculee avec un
// SEL propre a ce jour (HMAC du secret du pipeline). Sans le sel, personne ne
// peut retrouver les paris en essayant toutes les combinaisons avant les matchs.
// Le sel est REVELE (sel_revele) des que tous les matchs de ce jour sont joues
// (deux jours plus tard) : chacun peut alors refaire le calcul a partir de
// historique.json. Le sel n'entre pas dans l'empreinte du maillon : le reveler ne
// change rien a la chaine.
//
// Un jour dont un pari est encore masque (pas relu depuis l'archive) n'est pas
// empreint : jamais une empreinte sur des paris incomplets.

const crypto = require("crypto");

const GENESE = "0".repeat(64);
// Version 2 (30/09/2026, contre-controle de l'avocat du diable) : la probabilite
// annoncee du pari (model_probability) entre dans l'empreinte. Aucune chaine en
// version 1 n'a ete publiee (preuves/ n'existait pas encore).
const VERSION = 2;
// Champs d'un pari empreint : tous publics une fois le match joue (historique.json).
// model_probability : la chance annoncee ne peut plus etre retouchee apres coup
// sans casser la chaine (un 55 % devenu 70 % se verrait).
const CHAMPS = ["fixture_id", "home", "away", "prediction", "cote", "model_probability", "market", "moteur", "moteur_version", "published_at", "kickoff_at"];

function sha(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }

// JSON canonique : cles triees, sans espaces. Meme entree -> meme texte.
function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}

function sel(secret, jour) {
  return crypto.createHmac("sha256", String(secret)).update("iashark-empreinte-paris|" + jour).digest("hex");
}

// -> { paris, incomplet } : paris simples publies ce jour (date = jour de publication).
function parisDuJour(predictions, jour) {
  const du = (predictions || []).filter(function (p) {
    return p && p.fixture_id != null && (p.type || "single") === "single" && String(p.date || "").slice(0, 10) === jour;
  });
  const incomplet = du.some(function (p) { return p.redacted === true || !p.prediction; });
  const paris = du.map(function (p) {
    const o = {};
    CHAMPS.forEach(function (k) { o[k] = p[k] === undefined ? null : p[k]; });
    o.fixture_id = Number(o.fixture_id);
    return o;
  }).sort(function (a, b) { return a.fixture_id - b.fixture_id; });
  return { paris: paris, incomplet: incomplet };
}

function empreinteParis(paris, selDuJour) { return sha(selDuJour + "\n" + canon(paris)); }

function empreinteMaillon(m) {
  return sha(m.precedente + "\n" + canon({ n: m.n, jour: m.jour, genere_le: m.genere_le, nb_paris: m.nb_paris, empreinte_paris: m.empreinte_paris }));
}

function vide() {
  return {
    version: VERSION,
    explication: "Empreinte SHA-256 des paris publies chaque jour, chainee a la precedente. Un pari modifie apres coup ou un maillon retire casse la chaine. Le sel de chaque jour est revele deux jours plus tard : empreinte_paris = SHA-256(sel + saut de ligne + JSON canonique des paris du jour, tries par fixture_id, champs " + CHAMPS.join(", ") + ").",
    chaine: [],
  };
}

// Ajoute un maillon pour `jour` si ses paris ont change depuis le dernier maillon
// de ce jour (un nouveau maillon ne remplace jamais l'ancien : la revision se voit).
// -> { ajoute, raison, maillon }
function ajouter(registre, jour, predictions, secret, genereLe) {
  if (!secret) return { ajoute: false, raison: "secret absent" };
  const lu = parisDuJour(predictions, jour);
  if (!lu.paris.length) return { ajoute: false, raison: "aucun pari" };
  if (lu.incomplet) return { ajoute: false, raison: "pari masque non relu" };
  const chaine = registre.chaine;
  const ep = empreinteParis(lu.paris, sel(secret, jour));
  const dernierDuJour = chaine.filter(function (m) { return m.jour === jour; }).pop();
  if (dernierDuJour && dernierDuJour.empreinte_paris === ep) return { ajoute: false, raison: "inchange" };
  const prec = chaine.length ? chaine[chaine.length - 1].empreinte : GENESE;
  const m = { n: chaine.length + 1, jour: jour, genere_le: genereLe || new Date().toISOString(), nb_paris: lu.paris.length, empreinte_paris: ep, precedente: prec };
  m.empreinte = empreinteMaillon(m);
  chaine.push(m);
  return { ajoute: true, raison: dernierDuJour ? "revision" : "nouveau", maillon: m };
}

// Revele le sel des jours <= jourLimite (tous leurs matchs sont joues).
function revelerSels(registre, secret, jourLimite) {
  let n = 0;
  if (!secret) return 0;
  registre.chaine.forEach(function (m) {
    if (!m.sel_revele && m.jour <= jourLimite) { m.sel_revele = sel(secret, m.jour); n++; }
  });
  return n;
}

// Rejoue la chaine ; si predictions est fourni, recalcule aussi l'empreinte des
// paris des jours dont le sel est revele (dernier maillon de chaque jour).
// -> { ok, erreurs }
function verifier(registre, predictions) {
  const erreurs = [];
  let prec = GENESE;
  (registre.chaine || []).forEach(function (m, i) {
    if (m.n !== i + 1) erreurs.push("maillon " + (i + 1) + " : numero " + m.n);
    if (m.precedente !== prec) erreurs.push("maillon " + m.n + " : chaine rompue");
    if (empreinteMaillon(m) !== m.empreinte) erreurs.push("maillon " + m.n + " : empreinte fausse");
    prec = m.empreinte;
  });
  if (predictions) {
    const derniers = {};
    (registre.chaine || []).forEach(function (m) { derniers[m.jour] = m; });
    Object.keys(derniers).forEach(function (jour) {
      const m = derniers[jour];
      if (!m.sel_revele) return;
      const lu = parisDuJour(predictions, jour);
      if (lu.incomplet || !lu.paris.length) return;
      if (empreinteParis(lu.paris, m.sel_revele) !== m.empreinte_paris) erreurs.push(jour + " : les paris ne correspondent plus a l'empreinte publiee");
    });
  }
  return { ok: !erreurs.length, erreurs: erreurs };
}

module.exports = { GENESE: GENESE, CHAMPS: CHAMPS, canon: canon, sel: sel, parisDuJour: parisDuJour, empreinteParis: empreinteParis, vide: vide, ajouter: ajouter, revelerSels: revelerSels, verifier: verifier };
