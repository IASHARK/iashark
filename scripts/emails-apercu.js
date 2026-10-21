#!/usr/bin/env node
"use strict";
// Apercus des e-mails automatiques (cycle de vie + fin d'essai). N'ENVOIE RIEN.
//
// 1. Depuis les reponses des fonctions (workflow .github/workflows/emails-automatiques.yml) :
//      node scripts/emails-apercu.js --reponses <dossier> --sortie <dossier>
//    mode apercu : <sortie>/<version>/<campagne>.html|.txt, <sortie>/index.html,
//    <sortie>/resume.txt ; mode test : resume des envois au patron (aucun fichier).
//    Le journal du workflow est PUBLIC (depot public) : rien d'autre que des
//    comptes, des sujets et des statuts n'y est ecrit.
// 2. En local, avec le module (aucun appel reseau, aucun secret) :
//      node scripts/emails-apercu.js --local --donnees data-home.json[,autre.json] --sortie <dossier>
//           [--maintenant 2026-10-21T08:00:00Z] [--versions fr,gb]
//    Une seule version demandee : un fichier par campagne directement dans <sortie>.

const fs = require("node:fs");
const path = require("node:path");

const L = require("../lib/lifecycle-email.js");
const build = require("../lib/lifecycle-email-build.js");

const FONCTIONS = ["send-lifecycle-emails", "trial-reminder"];

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function ecrireApercus(sortie, apercus, plat) {
  for (const a of apercus) {
    const dossier = plat ? sortie : path.join(sortie, a.dir);
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(path.join(dossier, a.campaign + ".html"), a.html);
    fs.writeFileSync(path.join(dossier, a.campaign + ".txt"), "Sujet : " + a.subject + "\n\n" + a.text);
  }
  const lignes = apercus.map((a) => {
    const lien = plat ? a.campaign + ".html" : a.dir + "/" + a.campaign + ".html";
    return "<tr><td>" + esc(a.dir) + "</td><td>" + esc(a.campaign) + "</td><td><a href=\"" + esc(lien) + "\">" + esc(a.subject) + "</a></td></tr>";
  });
  fs.writeFileSync(path.join(sortie, "index.html"), "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><title>Apercu des e-mails IASHARK</title>"
    + "<style>body{font-family:Arial,sans-serif;margin:24px;color:#1f2d3a}td,th{padding:6px 10px;border-bottom:1px solid #dfe4ea;text-align:left}a{color:#0a6d8f}</style></head><body>"
    + "<h1>Apercu des e-mails automatiques</h1><p>Rien n'a ete envoye. Compte fictif : le lien de desinscription ne desinscrit personne.</p>"
    + "<table><tr><th>Version</th><th>Campagne</th><th>Sujet</th></tr>" + lignes.join("") + "</table></body></html>\n");
}

function depuisReponses(dossier, sortie) {
  const resume = [];
  const apercus = [];
  let mode = null;
  let ok = true;
  for (const f of FONCTIONS) {
    const fichier = path.join(dossier, f + ".json");
    if (!fs.existsSync(fichier)) { resume.push(f + " : pas de reponse"); ok = false; continue; }
    let r;
    try { r = JSON.parse(fs.readFileSync(fichier, "utf8")); } catch (_e) { resume.push(f + " : reponse illisible"); ok = false; continue; }
    mode = r.mode || mode;
    if (r.ok === false) ok = false;
    if (r.error) resume.push(f + " : erreur " + r.error + (r.missing ? " (manque : " + r.missing.join(", ") + ")" : ""));
    if (r.pret) resume.push(f + " : pret = " + JSON.stringify(r.pret));
    if (r.mode === "apercu") {
      for (const a of r.apercus || []) apercus.push(a);
      for (const n of r.non_rendus || []) resume.push(f + " : non rendu " + n.campaign + "/" + n.dir + " (" + n.raison + ")");
      const vrais = r.candidats || r.essais;
      if (vrais) resume.push(f + " : si l'envoi reel etait lance maintenant (dryRun, aucune adresse) = " + JSON.stringify(vrais));
    }
    if (r.mode === "test") {
      resume.push(f + " : " + (r.envoyes || 0) + " e-mail(s) de test envoye(s) au patron (adresse fixe dans le code)" + (r.compte_trouve === false ? ", compte du patron introuvable" : ""));
      for (const x of r.results || []) resume.push("  " + x.campaign + " : " + x.status + (x.reason ? " (" + x.reason + ")" : ""));
      if (r.identite_expediteur_manquante && r.identite_expediteur_manquante.length) resume.push("  identite de l'expediteur absente : " + r.identite_expediteur_manquante.join(", ") + " (les e-mails clients ne partiront pas sans elle)");
    }
  }
  if (JSON.stringify(resume).indexOf("no_weekend_matches") !== -1) {
    resume.push("Les 2 e-mails du week-end (inactive_7d, pro_weekly_summary) ont besoin des matchs du samedi et du dimanche,"
      + " publies sur le site a partir du jeudi : relancer un jeudi, vendredi ou samedi pour les recevoir aussi.");
  }
  if (mode === "apercu" && sortie) {
    fs.mkdirSync(sortie, { recursive: true });
    ecrireApercus(sortie, apercus, false);
    resume.unshift(apercus.length + " e-mail(s) rendu(s) dans " + sortie + " (artefact emails-apercu)");
    fs.writeFileSync(path.join(sortie, "resume.txt"), resume.join("\n") + "\n");
  }
  console.log(resume.join("\n"));
  return ok;
}

function localement(opts) {
  const bundle = build.loadBundle();
  const now = opts.maintenant ? new Date(opts.maintenant) : new Date();
  if (isNaN(now.getTime())) throw new Error("--maintenant invalide");
  const listes = String(opts.donnees || "").split(",").filter(Boolean).map((f) => {
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    return Array.isArray(d) ? d : (Array.isArray(d.matchs) ? d.matchs : []);
  });
  const list = listes.length ? [].concat.apply([], listes) : null;
  const versions = opts.versions ? String(opts.versions).split(",") : L.DIRS.slice();
  const company = { operatorName: process.env.COMPANY_OPERATOR_NAME || null, address: process.env.COMPANY_ADDRESS || null };
  const apercus = [];
  const manquants = [];
  for (const dir of versions) {
    const ctx = L.siteContext(bundle.markets, dir);
    const variants = Object.keys(L.CAMPAIGNS).map((c) => [c, c, true]);
    variants.splice(1, 0, ["welcome", "welcome-sans-accord", false]);
    for (const [campaign, nom, accord] of variants) {
      const prepared = L.campaignData(campaign, list, now, ctx, { marketingOptIn: accord, trial: L.sampleTrial(ctx, now) });
      if (!prepared.data) { manquants.push(dir + "/" + nom + " : " + prepared.reason); continue; }
      const r = L.renderLifecycleEmail(bundle, campaign, dir, prepared.data, { company, now, unsubscribeUrl: L.SITE_URL + "/" + dir + "/desinscription-email.html#t=APERCU" });
      apercus.push({ campaign: nom, dir, subject: r.subject, html: r.html, text: r.text });
    }
  }
  fs.mkdirSync(opts.sortie, { recursive: true });
  ecrireApercus(opts.sortie, apercus, versions.length === 1);
  console.log(apercus.length + " apercu(s) dans " + opts.sortie + (manquants.length ? "\nnon rendus : " + manquants.join(" ; ") : ""));
  return true;
}

if (require.main === module) {
  const opts = args(process.argv.slice(2));
  let ok;
  if (opts.local) {
    if (!opts.sortie) { console.error("--sortie obligatoire"); process.exit(2); }
    ok = localement(opts);
  } else if (opts.reponses) {
    ok = depuisReponses(opts.reponses, opts.sortie || null);
  } else {
    console.error("usage : --reponses <dossier> --sortie <dossier> | --local --donnees <json> --sortie <dossier>");
    process.exit(2);
  }
  process.exit(ok ? 0 : 1);
}

module.exports = { depuisReponses, localement, ecrireApercus };
