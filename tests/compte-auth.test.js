"use strict";
// Parcours compte et authentification.
// Ces tests verrouillent surtout des promesses de HONNETETE : ne pas afficher
// une fonctionnalite que le projet n'a pas, et ne jamais faire reposer une
// autorisation sur le navigateur.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const lire = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const connexion = lire("connexion.html");
const inscription = lire("inscription.html");
const oubli = lire("mot-de-passe-oublie.html");
const reinit = lire("reinitialiser-mot-de-passe.html");
const compte = lire("compte.html");
const authJs = lire("auth-pages.js");
const compteJs = lire("account-page.js");
const suppression = lire("supabase/functions/delete-account/index.ts");
const pages = { connexion, inscription, oubli, reinit, compte };

test("les quatre pages d'authentification existent et sont autonomes", () => {
  for (const [nom, html] of Object.entries(pages)) {
    assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/, nom);
    assert.match(html, /assets\/account\.css/, nom);
    assert.match(html, /app-client\.js/, nom);
  }
});

// Aucun fournisseur OAuth n'est configure sur le projet : /auth/v1/settings
// renvoie false pour google, apple, github, discord et tous les autres. Un
// bouton social afficherait donc une promesse qui echoue au clic.
test("aucun bouton de connexion sociale n'est propose", () => {
  for (const [nom, html] of Object.entries(pages)) {
    for (const fournisseur of ["Google", "Apple", "GitHub", "Discord", "Facebook", "Continuer avec"]) {
      assert.ok(!html.includes(fournisseur), `${nom} propose ${fournisseur}, qui n'est pas configure`);
    }
  }
});

// La verification d'email est desactivee (mailer_autoconfirm). Une inscription
// ouvre une session immediatement : dire "verifiez votre boite mail" apres une
// inscription serait faux.
test("l'inscription ne promet pas d'email de verification", () => {
  assert.ok(!/v[eé]rifiez votre bo[iî]te/i.test(inscription), "l'inscription promet un email de verification inexistant");
  // La page de mot de passe oublie, elle, envoie bien un vrai email.
  assert.match(oubli, /V[eé]rifiez votre bo[iî]te mail/i);
});

test("le mot de passe peut etre affiche, et les champs portent le bon autocomplete", () => {
  assert.match(connexion, /autocomplete="current-password"/);
  assert.match(inscription, /autocomplete="new-password"/);
  assert.match(reinit, /autocomplete="new-password"/);
  for (const html of [connexion, inscription, reinit]) {
    assert.match(html, /id="oeil"/);
    assert.match(html, /aria-pressed="false"/);
  }
  assert.match(authJs, /function brancherOeil/);
});

test("chaque champ a un label lie et une zone d'erreur qui lui est propre", () => {
  for (const [nom, html] of Object.entries({ connexion, inscription, oubli, reinit })) {
    const labels = html.match(/<label for="([a-zA-Z0-9]+)"/g) || [];
    assert.ok(labels.length >= 1, nom + " n'a aucun label lie");
    for (const l of labels) {
      const id = l.match(/for="([a-zA-Z0-9]+)"/)[1];
      assert.ok(html.includes('id="' + id + '"'), `${nom} : le label pointe sur #${id}, absent de la page`);
    }
  }
});

// Le message brut du fournisseur ("AuthApiError: Invalid login credentials")
// ne doit jamais atteindre l'ecran.
test("les erreurs du fournisseur sont traduites, jamais affichees brutes", () => {
  assert.match(authJs, /function messageLisible/);
  assert.match(authJs, /Email ou mot de passe incorrect\./);
  assert.ok(!/error\.message\s*\)?\s*;?\s*$/m.test(authJs.split("function messageLisible")[0]),
    "un message brut est affiche avant meme la fonction de traduction");
  assert.match(compteJs, /function lisible/);
});

// ?next= ne doit jamais permettre d'envoyer quelqu'un hors du site apres une
// connexion reussie (redirection ouverte).
test("la redirection apres connexion refuse toute destination externe", () => {
  const bloc = authJs.slice(authJs.indexOf("function destination"), authJs.indexOf("function destination") + 500);
  assert.match(bloc, /charAt\(0\) !== '\/'/);
  assert.match(bloc, /charAt\(1\) === '\/'/);
  assert.match(bloc, /indexOf\('\\\\'\)/);
});

test("le bouton de soumission est desactive pendant l'appel, pas de double envoi", () => {
  assert.match(authJs, /function occuper/);
  assert.match(authJs, /btn\.disabled = true/);
  assert.match(compteJs, /btn\.disabled = true/);
});

// Le coeur du brief : le compte doit vraiment changer selon le plan.
test("un abonne et un administrateur ne voient aucun appel a s'abonner", () => {
  const bloc = compteJs.slice(compteJs.indexOf("function abonnement"), compteJs.indexOf("function preferences"));
  const pro = bloc.slice(bloc.indexOf("if (t === 'pro')"), bloc.indexOf("// Gratuit"));
  const admin = bloc.slice(bloc.indexOf("if (t === 'admin')"), bloc.indexOf("if (t === 'pro')"));
  for (const [nom, part] of [["pro", pro], ["admin", admin]]) {
    assert.ok(part.length > 100, nom + " : bloc introuvable");
    assert.ok(!/D[ée]couvrir Pro|Passer [àa] Pro|Upgrade|S'abonner/i.test(part),
      `le compte ${nom} affiche un appel a s'abonner`);
  }
  assert.match(admin, /Acc[èe]s administrateur/);
});

test("tous les statuts d'abonnement reellement possibles sont traites", () => {
  const contrainte = lire("supabase/migrations/0006_billing_scaffold.sql");
  const statuts = (contrainte.match(/status text not null check \(status in \(([^)]+)\)/) || [])[1] || "";
  const attendus = statuts.split(",").map((s) => s.trim().replace(/'/g, "")).filter(Boolean);
  assert.ok(attendus.length >= 6, "statuts introuvables dans la migration");
  const bloc = compteJs.slice(compteJs.indexOf("function etatAbonnement"), compteJs.indexOf("var TON"));
  for (const s of attendus) {
    assert.ok(bloc.includes("'" + s + "'"), `le statut ${s} existe en base mais n'est pas traite`);
  }
  // Une annulation programmee ne doit pas etre presentee comme un compte
  // gratuit tant que la periode payee court encore.
  assert.match(bloc, /cancel_at_period_end/);
  assert.match(bloc, /reste actif jusqu/);
});

// Le plan et le role ne sont jamais decides ni modifies cote navigateur.
test("la page ne tente jamais d'ecrire le plan ou le role", () => {
  assert.ok(!/update\(\{[^}]*\bplan\b/.test(compteJs), "la page tente d'ecrire users.plan");
  assert.ok(!/update\(\{[^}]*\brole\b/.test(compteJs), "la page tente d'ecrire users.role");
  // La colonne capital est la seule que le client a le droit de modifier,
  // avec email et updated_at (cf 0001_users_table.sql).
  const grant = lire("supabase/migrations/0001_users_table.sql");
  assert.match(grant, /grant update \(email, capital, updated_at\) on public\.users to authenticated/);
  assert.match(grant, /revoke update on public\.users from authenticated/);
});

test("aucune donnee absente du projet n'est inventee dans le compte", () => {
  // On cible ce qui ne pourrait exister QU'EN etant fabrique, pas les mots.
  // Le SDK Supabase n'expose ni la liste des sessions, ni l'appareil, ni la
  // localisation : une section de ce genre serait forcement inventee.
  // (Le bouton de deconnexion, lui, parle bien de "cet appareil" - c'est
  // exactement ce qu'il fait, et cela ne suppose aucune donnee.)
  assert.ok(!/>\s*Sessions actives/i.test(compteJs), "une liste de sessions est affichee");
  assert.ok(!/D[ée]connecter (les )?autres appareils/i.test(compteJs), "une deconnexion des autres appareils est promise");
  assert.ok(!/Paris, France|Derni[èe]re connexion depuis/i.test(compteJs), "une localisation est fabriquee");
  // Pas de statut de verification d'email : elle est desactivee sur le
  // projet, tous les comptes sont confirmes d'office.
  assert.ok(!/Email (non )?v[ée]rifi[ée]|Confirmer mon adresse/i.test(compteJs));
  // Pas de factures listees dans la page : c'est le portail du prestataire
  // qui les porte.
  assert.ok(!/>\s*Factures/i.test(compteJs));
});

test("la suppression de compte est reelle, confirmee, et faite cote serveur", () => {
  // Plus de mailto: qui promettait une suppression que rien n'executait.
  assert.ok(!/mailto:[^"']*suppression/i.test(compteJs));
  assert.match(compteJs, /functions\/v1\/delete-account/);
  assert.match(compteJs, /!== 'SUPPRIMER'/);
  // Cote serveur : jeton verifie, confirmation exigee, abonnement resilie
  // AVANT la suppression.
  assert.match(suppression, /auth\.getUser\(\)/);
  assert.match(suppression, /!== "SUPPRIMER"/);
  assert.ok(suppression.indexOf("stripe.subscriptions.cancel") < suppression.indexOf("admin.auth.admin.deleteUser"),
    "le compte est supprime avant la resiliation de l'abonnement");
  // Aucun identifiant d'utilisateur n'est lu depuis la requete : rien a
  // falsifier pour supprimer le compte d'autrui.
  assert.ok(!/body\.user_id|body\.userId|body\.email/.test(suppression));
});

test("la page compte n'affiche jamais un plan avant de le connaitre", () => {
  assert.match(compte, /id="chargement"/);
  assert.match(compte, /id="compte" hidden/);
  assert.ok(!/GRATUIT|PRO<|ADMIN</.test(compte), "un plan est ecrit en dur dans le squelette");
});

test("les interrupteurs sont accessibles au clavier et annoncent leur etat", () => {
  assert.match(compteJs, /role="switch"/);
  assert.match(compteJs, /aria-checked="/);
  assert.match(compteJs, /<button type="button" role="switch"/);
  const css = lire("assets/account.css");
  assert.match(css, /\.sw\[aria-checked="true"\]/);
  // L'etat est porte par la position du curseur, pas seulement par la couleur.
  assert.match(css, /transform:translateX/);
});

test("les preferences ecrivent dans les vraies colonnes de user_preferences", () => {
  const schema = lire("supabase/migrations/0010_user_workspace.sql");
  for (const colonne of ["display_name", "favorite_leagues", "language", "timezone", "notify_match_analysis", "notify_weekly_recap"]) {
    assert.ok(schema.includes(colonne), `${colonne} absente du schema`);
    assert.ok(compteJs.includes(colonne), `${colonne} jamais ecrite par la page`);
  }
  // Les six langues proposees sont exactement celles que la contrainte CHECK
  // accepte : en proposer une septieme ferait echouer l'enregistrement.
  const langues = (schema.match(/language text not null default 'fr' check \(language in \(([^)]+)\)/) || [])[1];
  for (const l of langues.split(",").map((s) => s.trim().replace(/'/g, ""))) {
    assert.ok(compteJs.includes("['" + l + "',"), `la langue ${l} est acceptee en base mais absente du selecteur`);
  }
});

test("la bankroll n'a qu'une source de verite", () => {
  // Elle vit dans users.capital, lue par les outils. La page compte ne doit
  // pas en garder une seconde copie dans user_preferences.
  assert.match(compteJs, /update\(\{ capital: capital \}\)/);
  assert.ok(!/bankroll:/.test(compteJs.slice(compteJs.indexOf("var ligne = {"), compteJs.indexOf("var ligne = {") + 400)));
});
