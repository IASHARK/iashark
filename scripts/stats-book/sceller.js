#!/usr/bin/env node
"use strict";
// Range les profils de stats-book/ (ecrits par export_stats_book.py) dans UN
// fichier chiffre DATE, stats-book/scelles/<date du calcul>.json, seul type de
// fichier de stats-book/ suivi par git (le depot GitHub est PUBLIC : le detail Pro
// ne doit jamais y etre lisible).
//
// Lancement (machine de Clement, apres l'export) :
//   node scripts/stats-book/sceller.js
// puis commiter le nouveau fichier de stats-book/scelles/ (JAMAIS modifier ni
// supprimer un ancien : chaque scelle reste la preuve datee de ce qui a ete publie).
//
// Cle (32 octets, base64) : variable STATS_BOOK_CLE, sinon fichier
// ~/.iashark/stats-book.cle. S'il n'existe pas, le script le cree (droits 600)
// et n'affiche JAMAIS la cle. Il faut ensuite la copier une fois dans le secret
// GitHub STATS_BOOK_CLE (sans l'afficher) :
//   gh secret set STATS_BOOK_CLE < ~/.iashark/stats-book.cle
//
// Controles AVANT de sceller (sinon arret, rien n'est ecrit) :
//  - archive seulement : aucun match apres la fin du registre_site du Book (regle
//    « un chiffre public = une source dans l'archive », historique-public du 30/09/2026) ;
//  - empreinte des sources presente ;
//  - seuils de matchs (equipe 15, chaque cas « a la pause » 30, arbitre 30, ligue 30) ;
//  - chaque profil d'equipe range dans SON championnat (ou « selections ») ;
//  - chaque profil termine au plus tard a la fin de la periode, periode anterieure au calcul ;
//  - aucun scelle plus recent deja present, aucun scelle reecrit.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const S = require("../../lib/stats-book.js");

function cle() {
  if (process.env.STATS_BOOK_CLE) return process.env.STATS_BOOK_CLE;
  const f = path.join(os.homedir(), ".iashark", "stats-book.cle");
  if (!fs.existsSync(f)) {
    fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
    fs.writeFileSync(f, crypto.randomBytes(32).toString("base64") + "\n", { mode: 0o600 });
    console.log("Cle creee dans " + f + " (non affichee). A copier une fois dans GitHub :");
    console.log("  gh secret set STATS_BOOK_CLE < " + f);
  }
  return fs.readFileSync(f, "utf8").trim();
}

const triplet = x => Array.isArray(x) && x.length === 3 && x.every(v => typeof v === "number" && isFinite(v) && v >= 0) && x[1] <= x[0] && x[0] <= x[2];

// Renvoie la liste des problemes (vide = fichiers conformes).
function controler(manifeste, ligues) {
  const pb = [];
  if (!manifeste || !manifeste.seuils || !manifeste.periode) return ["manifeste incomplet"];
  const s = Object.assign({ sous_groupe: 30 }, manifeste.seuils), per = manifeste.periode, fin = per.fin;
  if (!(fin < String(manifeste.calcule_le).slice(0, 10))) pb.push("periode.fin doit etre avant le jour du calcul");
  if (per.recent_inclus || (per.fin_book && fin > per.fin_book)) {
    pb.push(`matchs apres le ${per.fin_book || "30/06/2025"} : hors de l'archive (registre_site du Book), a integrer au registre avant toute publication`);
  }
  if (!/^[0-9a-f]{64}$/.test(String(manifeste.empreinte_sources || ""))) pb.push("empreinte des sources absente");
  if (!Array.isArray(manifeste.championnats) || !manifeste.championnats.length) pb.push("liste des championnats absente");
  const championnats = new Set((manifeste.championnats || []).map(String));
  for (const [id, c] of Object.entries(ligues)) {
    for (const [tid, p] of Object.entries(c.equipes || {})) {
      if (p.championnat === "selections") {
        if (championnats.has(String(id))) pb.push(`ligue ${id} equipe ${tid} : selection rangee dans un championnat`);
      } else if (String(p.championnat) !== String(id) || !championnats.has(String(id))) {
        pb.push(`ligue ${id} equipe ${tid} : profil d'un autre championnat (${p.championnat})`);
      }
      for (const k of ["tout", "dom", "ext"]) {
        const x = p[k];
        if (!x) continue;
        if (!(x.n >= s.equipe)) pb.push(`ligue ${id} equipe ${tid} ${k} : ${x.n} matchs < ${s.equipe}`);
        if (!(x.fin <= fin)) pb.push(`ligue ${id} equipe ${tid} ${k} : fin ${x.fin} apres ${fin}`);
        for (const [cas, g] of Object.entries(x.pause || {})) if (!(g.n >= s.sous_groupe)) pb.push(`ligue ${id} equipe ${tid} ${k} pause ${cas} : ${g.n} < ${s.sous_groupe}`);
        const t = x.tranches;
        if (t && !([].concat(t.pour, t.contre).length === 12 && [].concat(t.pour, t.contre).every(triplet))) pb.push(`ligue ${id} equipe ${tid} ${k} : tranches sans marge`);
      }
    }
    for (const [a, p] of Object.entries(c.arbitres || {})) {
      if (!(p.n >= s.arbitre)) pb.push(`ligue ${id} arbitre ${a} : ${p.n} < ${s.arbitre}`);
      if (!(p.fin <= fin)) pb.push(`ligue ${id} arbitre ${a} : fin apres ${fin}`);
      for (const k of ["cartons", "rouges", "penaltys"]) if (p[k] && !triplet(p[k].m)) pb.push(`ligue ${id} arbitre ${a} ${k} : marge invalide`);
    }
    if (c.ligue) {
      if (!(c.ligue.n >= s.ligue)) pb.push(`ligue ${id} : ${c.ligue.n} < ${s.ligue}`);
      if (!(c.ligue.fin <= fin)) pb.push(`ligue ${id} : fin apres ${fin}`);
      const t = c.ligue.tranches;
      if (t && !(Array.isArray(t.buts) && t.buts.length === 6 && t.buts.every(triplet))) pb.push(`ligue ${id} : tranches sans marge`);
    }
  }
  return pb;
}

function lireDossier(dossier) {
  const manifeste = S.chargerManifeste(dossier);
  if (!manifeste) return null;
  const ligues = {};
  for (const f of fs.readdirSync(dossier).filter(x => /^ligue-\d+\.json$/.test(x))) {
    ligues[f.match(/\d+/)[0]] = JSON.parse(fs.readFileSync(path.join(dossier, f), "utf8"));
  }
  return { manifeste, ligues };
}

// Ecrit le scelle SANS JAMAIS ecraser un fichier existant (lien dur : echoue si la cible existe).
function ecrireSansEcraser(dest, texte) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, texte);
  try { fs.linkSync(tmp, dest); } finally { fs.unlinkSync(tmp); }
}

function main() {
  const dossier = process.argv[2] || S.DOSSIER;
  const c = lireDossier(dossier);
  if (!c) { console.error("Aucun manifeste.json dans " + dossier + " : lancer d'abord export_stats_book.py."); process.exit(1); }
  const pb = controler(c.manifeste, c.ligues);
  if (pb.length) { console.error(pb.length + " probleme(s), rien n'est scelle :\n  " + pb.slice(0, 20).join("\n  ")); process.exit(1); }
  const nom = S.nomScelle(c.manifeste.calcule_le);
  if (!nom) { console.error("date de calcul illisible, rien n'est scelle"); process.exit(1); }
  const dernier = S.dernierScelle();
  if (dernier && path.basename(dernier) >= nom) { console.error("un scelle aussi recent existe deja (" + path.basename(dernier) + ") : rien n'est ecrit"); process.exit(1); }
  const k = cle();
  const scelle = S.sceller(c, k);
  if (!S.ouvrirScelle(scelle, k)) { console.error("relecture impossible, rien n'est ecrit"); process.exit(1); }
  const dest = path.join(S.DOSSIER_SCELLES, nom);
  ecrireSansEcraser(dest, JSON.stringify(scelle) + "\n");
  console.log("OK : " + Object.keys(c.ligues).length + " ligues, matchs jusqu'au " + c.manifeste.periode.fin
    + ", " + Math.round(fs.statSync(dest).size / 1024) + " Ko -> " + path.relative(process.cwd(), dest));
  console.log("En clair (a verifier par tous) : empreinte des sources " + scelle.empreinte_sources
    + ", SHA-256 du contenu " + scelle.sha256_clair + ", SHA-256 des chiffres gratuits " + scelle.sha256_gratuit + ".");
}

if (require.main === module) main();
module.exports = { controler, lireDossier, ecrireSansEcraser };
