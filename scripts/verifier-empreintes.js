#!/usr/bin/env node
"use strict";
// VERIFICATION PUBLIQUE DES EMPREINTES DES PARIS (controle historique-public du 23/10/2026).
//
// Refait, avec les seuls fichiers publics du depot, le calcul de chaque maillon de
// preuves/empreintes-paris.json dont le sel est revele :
//  - paris : historique.json + journees figees dans preuves/paris-scelles/ ;
//  - corrections : preuves/corrections.json (journal public, ajout seulement) ;
//  - journees documentees comme non verifiables, et paris ajoutes apres coup expliques :
//    notes de preuves/corrections.json.
// Appele seul sur historique.json, sans le journal, le verificateur signalerait a tort les
// maillons dont une correction publique explique l'ecart : ce script charge tout par defaut.
//
// Usage : node scripts/verifier-empreintes.js [dossier du depot]
// Sortie : resume lisible ; code 1 si un ecart est trouve.

const fs = require("fs");
const path = require("path");
const E = require("../lib/empreintes-paris.js");
const C = require("../lib/journal-corrections.js");

function lireJson(fichier, defaut) {
  if (!fs.existsSync(fichier)) return defaut;
  return JSON.parse(fs.readFileSync(fichier, "utf8"));
}

function donneesPubliques(racine) {
  const registre = lireJson(path.join(racine, "preuves/empreintes-paris.json"), E.vide());
  const journal = lireJson(path.join(racine, C.CHEMIN), C.journalVide());
  const historique = lireJson(path.join(racine, "historique.json"), { predictions: [] });
  const vus = {};
  const paris = [];
  (historique.predictions || []).forEach(function (p) {
    if (p && p.fixture_id != null) vus[String(p.fixture_id) + "|" + String(p.date || "").slice(0, 10)] = true;
    paris.push(p);
  });
  const dossier = path.join(racine, "preuves/paris-scelles");
  if (fs.existsSync(dossier)) {
    fs.readdirSync(dossier).filter(function (f) { return /^\d{4}-\d{2}-\d{2}\.json$/.test(f); }).sort().forEach(function (f) {
      (lireJson(path.join(dossier, f), {}).paris || []).forEach(function (p) {
        const k = String(p.fixture_id) + "|" + String(p.date || "").slice(0, 10);
        if (!vus[k]) { vus[k] = true; paris.push(p); }
      });
    });
  }
  return { registre: registre, journal: journal, paris: paris };
}

function verifierDepot(racine, nowMs) {
  const d = donneesPubliques(racine);
  return E.verifier(d.registre, d.paris, {
    corrections: C.pourVerification(d.journal),
    journeesNonVerifiables: C.journeesNonVerifiables(d.journal),
    parisNonScellesExpliques: C.parisNonScellesExpliques(d.journal),
    nowMs: nowMs,
  });
}

if (require.main === module) {
  const racine = path.resolve(process.argv[2] || path.join(__dirname, ".."));
  const v = verifierDepot(racine);
  const parRaison = {};
  v.non_verifiables.forEach(function (x) { (parRaison[x.raison] = parRaison[x.raison] || []).push(x.n === null ? x.jour : x.n); });
  console.log("Maillons verifies : " + (v.verifies.length ? v.verifies.join(", ") : "aucun"));
  Object.keys(parRaison).forEach(function (r) { console.log("Non verifiables (" + r + ") : " + parRaison[r].join(", ")); });
  v.avertissements.forEach(function (a) { console.log("Avertissement : " + a); });
  v.erreurs.forEach(function (e) { console.log("ECART : " + e); });
  console.log(v.ok ? "Resultat : aucun ecart." : "Resultat : " + v.erreurs.length + " ecart(s).");
  process.exit(v.ok ? 0 : 1);
}

module.exports = { donneesPubliques: donneesPubliques, verifierDepot: verifierDepot };
