"use strict";
// JOURNAL DES CORRECTIONS DES PARIS (integrite des empreintes, 23/10/2026).
//
// Constat de l'enquete du 23/10 : le 19/10 et le 20/10, la version du moteur de 4 paris
// a ete reecrite en silence avant leur coup d'envoi (lib/pick-freeze.js#alignPendingPrediction),
// alors que les paris eux-memes n'avaient pas change. Desormais :
//  - le moteur et sa version sont figes a la premiere publication du pari ;
//  - si un pari change VRAIMENT avant son coup d'envoi (exception au gel, buteur absent
//    de la composition...), la ligne d'historique garde la trace : corrections[] =
//    { le, motif, champs, ancien, nouveau }. Rien n'est ecrase en silence ;
//  - la trace est publiee dans preuves/corrections.json (journal public, ajout
//    seulement). Avant le coup d'envoi, les valeurs du pari (pronostic, cote, chance,
//    marche) restent secretes : seuls l'heure, le motif, les champs changes et le moteur
//    sont publics ; les valeurs sont completees apres le coup d'envoi.
//
// Secret avant le match : dans historique.json (public), les valeurs secretes d'une
// correction sont CHIFFREES (AES-256-GCM, cle derivee du secret du pipeline et du match).
// Le pipeline les dechiffre au run suivant (dechiffrerCorrections) : la trace n'est
// jamais perdue, et personne d'autre ne peut la lire avant le coup d'envoi.

const crypto = require("crypto");

// Champs d'un pari suivis par la trace.
const CHAMPS_PARI = ["prediction", "cote", "model_probability", "market", "moteur", "moteur_version"];
// Secrets jusqu'au coup d'envoi (meme liste que lib/premium-fields.js PENDING_REDACTED_FIELDS).
const SECRETS = ["prediction", "cote", "model_probability", "market"];
const CHEMIN = "preuves/corrections.json";

function copieChamps(p, champs) {
  const o = {};
  (champs || CHAMPS_PARI).forEach(function (k) { o[k] = p && p[k] !== undefined ? p[k] : null; });
  return o;
}
function egal(a, b) {
  const na = typeof a === "string" && a.trim() !== "" && Number.isFinite(Number(a)) ? Number(a) : a;
  const nb = typeof b === "string" && b.trim() !== "" && Number.isFinite(Number(b)) ? Number(b) : b;
  return (na === undefined ? null : na) === (nb === undefined ? null : nb);
}

// Entree de trace entre deux etats du pari ; null si rien n'a change.
function entree(avant, apres, motif, le) {
  const champs = CHAMPS_PARI.filter(function (k) { return !egal(avant[k], apres[k]); });
  if (!champs.length) return null;
  return { le: le, motif: String(motif || "pari realigne sur le pari publie avant le coup d'envoi"), champs: champs, ancien: copieChamps(avant), nouveau: copieChamps(apres) };
}

function cle(secret, fixtureId) {
  const h = crypto.createHmac("sha256", String(secret)).update("iashark-corrections|" + String(fixtureId)).digest();
  return crypto.createHash("sha256").update(h).digest();
}
// Chiffrement deterministe (iv derive du contenu) : le fichier public ne change pas a
// chaque run si la trace ne change pas.
function chiffrer(obj, secret, fixtureId) {
  const k = cle(secret, fixtureId);
  const texte = Buffer.from(JSON.stringify(obj), "utf8");
  const iv = crypto.createHmac("sha256", k).update(texte).digest().subarray(0, 12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const corps = Buffer.concat([c.update(texte), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), corps]).toString("base64");
}
function dechiffrer(b64, secret, fixtureId) {
  try {
    const buf = Buffer.from(String(b64), "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", cle(secret, fixtureId), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"));
  } catch (e) { return null; }
}

function sansSecrets(o) {
  const r = {};
  Object.keys(o || {}).forEach(function (k) { if (SECRETS.indexOf(k) === -1) r[k] = o[k]; });
  return r;
}

// Version publique des corrections d'un pari pas encore joue : valeurs secretes
// chiffrees (secret fourni) ou retirees. Ne modifie pas l'entree.
function masquerCorrections(corrections, secret, fixtureId) {
  if (!Array.isArray(corrections)) return corrections;
  return corrections.map(function (c) {
    if (!c || c.masque === true) return c;
    const o = Object.assign({}, c, { ancien: sansSecrets(c.ancien), nouveau: sansSecrets(c.nouveau), masque: true });
    if (secret) o.chiffre = chiffrer({ ancien: c.ancien, nouveau: c.nouveau }, secret, fixtureId);
    return o;
  });
}

// Dechiffre EN PLACE les corrections masquees (pipeline). -> nombre dechiffre.
function dechiffrerCorrections(predictions, secret) {
  let n = 0;
  if (!secret) return 0;
  (predictions || []).forEach(function (p) {
    if (!p || !Array.isArray(p.corrections)) return;
    p.corrections = p.corrections.map(function (c) {
      if (!c || c.masque !== true || !c.chiffre) return c;
      const v = dechiffrer(c.chiffre, secret, p.fixture_id);
      if (!v) return c;
      n++;
      const o = Object.assign({}, c, { ancien: v.ancien, nouveau: v.nouveau });
      delete o.masque; delete o.chiffre;
      return o;
    });
  });
  return n;
}

function journalVide() {
  return {
    version: 1,
    explication: "Journal public des corrections des paris publies (ajout seulement). Chaque entree dit quand, pourquoi et quels champs ont change, avec l'ancienne et la nouvelle valeur. "
      + "Avant le coup d'envoi, les valeurs du pari (pronostic, cote, chance, marche) restent secretes : elles sont ajoutees apres. "
      + "Ce journal sert aussi a verifier les empreintes (preuves/empreintes-paris.json) : l'etat des paris a l'heure d'un maillon s'obtient en defaisant les corrections posterieures.",
    notes: [],
    corrections: [],
  };
}

function idEntree(fixtureId, le) { return String(fixtureId) + "|" + String(le); }

// Ajoute au journal public les corrections portees par les lignes d'historique
// (predictions COMPLETES, dechiffrees). Avant le coup d'envoi : sans valeurs secretes
// (masque: true) ; apres : valeurs completes. Une entree existante n'est jamais
// reecrite, seulement completee (valeurs ajoutees apres le coup d'envoi).
// -> { ajoutees, completees }
function mettreAJourJournal(journal, predictions, nowMs) {
  const now = nowMs != null ? nowMs : Date.now();
  const parId = {};
  journal.corrections = journal.corrections || [];
  journal.corrections.forEach(function (e) { if (e && e.id) parId[e.id] = e; });
  let ajoutees = 0, completees = 0;
  (predictions || []).forEach(function (p) {
    if (!p || p.fixture_id == null || !Array.isArray(p.corrections)) return;
    const ko = Date.parse(String(p.kickoff_at || ""));
    const joue = Number.isFinite(ko) && now >= ko;
    p.corrections.forEach(function (c) {
      if (!c || !c.le || c.masque === true) return;
      const id = idEntree(p.fixture_id, c.le);
      const existante = parId[id];
      if (!existante) {
        const e = { id: id, type: "pari", jour: String(p.date || "").slice(0, 10), fixture_id: Number(p.fixture_id), match: p.match || ((p.home || "") + " - " + (p.away || "")), le: c.le, motif: c.motif, champs: c.champs };
        if (joue) { e.ancien = c.ancien; e.nouveau = c.nouveau; }
        else { e.ancien = sansSecrets(c.ancien); e.nouveau = sansSecrets(c.nouveau); e.masque = true; }
        journal.corrections.push(e);
        parId[id] = e;
        ajoutees++;
      } else if (existante.masque === true && joue) {
        existante.ancien = c.ancien; existante.nouveau = c.nouveau;
        delete existante.masque;
        existante.complete_le = new Date(now).toISOString();
        completees++;
      }
    });
  });
  return { ajoutees: ajoutees, completees: completees };
}

// Corrections du journal utilisables pour verifier les empreintes (lib/empreintes-paris.js#etatAu).
function pourVerification(journal) {
  return ((journal && journal.corrections) || []).filter(function (e) { return e && e.fixture_id != null && (e.le || e.au_plus_tard); });
}

module.exports = {
  CHAMPS_PARI: CHAMPS_PARI, SECRETS: SECRETS, CHEMIN: CHEMIN,
  copieChamps: copieChamps, entree: entree, chiffrer: chiffrer, dechiffrer: dechiffrer,
  masquerCorrections: masquerCorrections, dechiffrerCorrections: dechiffrerCorrections,
  journalVide: journalVide, mettreAJourJournal: mettreAJourJournal, pourVerification: pourVerification,
};
