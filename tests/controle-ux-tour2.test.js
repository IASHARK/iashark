"use strict";
// Controle UX du 04/10/2026, tour 2 : corrections gardees par des tests.
//  - plus aucun dessin fait main sur le chemin de paiement (inscription, connexion, mot de passe)
//    ni dans le compte (etoile des competitions, en cyan : l'or est reserve a la Selection en or) ;
//  - bloc « Aujourd'hui » : un seul cadenas, pastille de chance sur la ligne de la cote, nom du
//    pari jamais coupe, note « meilleures cotes » une seule fois ;
//  - tiroir des marches : le focus reste dedans (aria-modal) ;
//  - inscription venue de l'abonnement : « etape 1 sur 2 », duree et prix de la configuration ;
//  - film du match : plus de graduation du milieu qui touchait l'etiquette d'un point ;
//  - liste de l'accueil : plus de point vert (vert reserve aux ecarts chiffres).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

global.window = undefined;
require("../lib/icones.js");
require("../lib/composants.js");
const AJ = require("../lib/aujourdhui.js");

const LANGUES = ["", "fr/", "en/", "es/", "gb/", "mx/", "za/"];
const LUCIDE_OEIL = 'd="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"';

test("pages d'authentification : chaque icone est une icone Lucide (trace d'origine), aucune tracee a la main", () => {
  for (const page of ["inscription.html", "connexion.html", "mot-de-passe-oublie.html", "reinitialiser-mot-de-passe.html"]) {
    for (const l of LANGUES) {
      const p = l + page;
      if (!fs.existsSync(path.join(ROOT, p))) continue;
      const svgs = read(p).match(/<svg[^>]*>/g) || [];
      for (const s of svgs) assert.match(s, /class="lucide lucide-[a-z-]+ /, p + " : icone sans origine Lucide : " + s.slice(0, 80));
    }
  }
  assert.ok(read("inscription.html").includes(LUCIDE_OEIL));
  const js = read("auth-pages.js");
  assert.ok(js.includes(LUCIDE_OEIL), "oeil Lucide");
  assert.ok(js.includes('d="m2 2 20 20"') && js.includes("lucide-eye-off"), "oeil barre Lucide");
  assert.doesNotMatch(js, /M2 12s3\.6-7 10-7|M3 3l18 18/, "anciens dessins faits main");
});

test("compte : etoile des competitions = Lucide « star », en cyan (plus d'ambre)", () => {
  const js = read("account-page.js");
  const etoile = /var ICONE_ETOILE = '([^']*)'/.exec(js)[1];
  assert.match(etoile, /class="lucide lucide-star acc-fav-star"/);
  assert.ok(etoile.includes('d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679'), "trace Lucide d'origine");
  const css = read("assets/account.css");
  const fav = css.split("\n").filter((l) => /\.acc-fav/.test(l)).join("\n");
  assert.doesNotMatch(fav, /f59e0b|245,158,11/, "aucun ambre dans les competitions");
  assert.match(fav, /\.acc-fav\.is-on \.acc-fav-ico\{color:#20d5ef\}/);
});

const JOUR = "2026-10-04";
const jambe = (fid, d, e, h, pari, cote, op, ch) => ({ fixture_id: fid, domicile: d, exterieur: e, ligue: "L1", coup_envoi: JOUR + " " + h, pari, market_id: "x", cote, operateur: op, chance: ch, etat: "a_venir" });
const X5 = { type: "x5", statut: "publie", verrou: null, nb_matchs: 3, cote_totale: 4.62, chance: 18, operateur_unique: null, sans_matchs_reportes: null,
  jambes: [jambe(1, "Lens", "Lille", "15:00", "Victoire Lens", 1.55, "Winamax", 64), jambe(2, "Monaco", "Nice", "17:00", "Les deux équipes marquent", 1.62, "Betclic", 62), jambe(3, "Porto", "Braga", "21:30", "Porto ou nul", 1.44, "Unibet", 66)] };

// 04/10/2026, 16 h (demande de Clement : petites cartes cote a cote) : chaque petite carte
// verrouillee porte SON cadenas (pastille HyperUI « Pro » ou « Gratuit ») ; le bloc de
// deverrouillage n'en ajoute pas (une ligne, un bouton).
test("Aujourd'hui : un cadenas par bloc verrouille (aucun dans « Ce que tu debloques »), une fausse ligne par liste floutee", () => {
  const verrou = (v) => ({ statut: "publie", verrou: v, nb_matchs: 4, cote_totale: 4.8 });
  const anonyme = AJ.html({ version: 1, jour: JOUR, niveau: "anonyme", tickets: [Object.assign({ type: "x5" }, verrou("compte")), Object.assign({ type: "x10" }, verrou("pro"))],
    selection_or: { statut: "publie", verrou: "pro", nb_paris: 3 }, buteur_du_jour: { statut: "publie", verrou: "compte" } }, {});
  assert.equal((anonyme.match(/lucide-lock/g) || []).length, 4, "x5, x10, buteur, Selection en or");
  assert.match(anonyme, /class="aj-unlock hs-gate-card"><p class="aj-unlock-t"><span>/);
  assert.doesNotMatch(anonyme.slice(anonyme.indexOf("aj-unlock")), /lucide-lock/, "aucun cadenas dans le bloc de deverrouillage");
  for (const ol of anonyme.match(/<ol class="tk-l aj-blur"[\s\S]*?<\/ol>/g)) assert.equal((ol.match(/<li /g) || []).length, 1, "une seule fausse ligne");
  const gratuit = AJ.html({ version: 1, jour: JOUR, niveau: "gratuit", tickets: [X5, Object.assign({ type: "x10" }, verrou("pro"))], selection_or: { statut: "publie", verrou: "pro", nb_paris: 3 }, buteur_du_jour: null }, {});
  assert.equal((gratuit.match(/lucide-lock/g) || []).length, 2, "x10 et Selection en or");
});

test("Aujourd'hui : pastille sur la ligne de la cote au telephone, nom du pari jamais coupe, note des cotes une seule fois", () => {
  const h = AJ.html({ version: 1, jour: JOUR, niveau: "pro", tickets: [X5, Object.assign({}, X5, { type: "x10", nb_matchs: 3, cote_totale: 9.6, chance: 9 })], selection_or: null, buteur_du_jour: null }, {});
  assert.match(h, /<small><span class="tk-th">15(:00|\s?h)\s·\s<\/span>Victoire Lens<\/small>/, "l'heure passe devant le pari quand sa colonne est masquee");
  assert.equal((h.match(/Meilleures cotes relevées/g) || []).length, 1, "une seule fois pour le bloc");
  const css = read("assets/aujourdhui.css");
  assert.doesNotMatch(css, /\.tk-m small\{[^}]*(nowrap|ellipsis)/, "le nom du pari passe a la ligne");
  // Carte etroite ou tiroir du telephone : pastille sur la ligne de la cote, heure devant le pari.
  const etroit = css.slice(css.indexOf("@container sc (max-width:330px)"));
  assert.match(etroit, /\.tk-leg\{grid-template-columns:minmax\(0,1fr\) auto auto;/);
  assert.match(etroit, /\.tk-th\{display:inline\}/);
  assert.doesNotMatch(etroit.slice(0, etroit.indexOf("}\n}")), /grid-column:2\/4/, "la pastille ne passe plus sur sa propre ligne");
  assert.doesNotMatch(read("lib/aujourdhui.js"), /aj-lock-s/);
});

test("tiroir des marches (Flowbite Drawer) : Tab et Maj+Tab restent dans le tiroir ouvert", () => {
  const src = read("lib/composants.js");
  const tiroir = src.slice(src.indexOf("function Tiroir("), src.indexOf("Tiroir.prototype.show"));
  assert.match(tiroir, /ev\.key !== "Tab"/);
  assert.match(tiroir, /ev\.shiftKey && \(!dedans \|\| actif === premier \|\| actif === el\)\) \{ ev\.preventDefault\(\); dernier\.focus\(\); \}/);
  assert.match(tiroir, /!ev\.shiftKey && \(!dedans \|\| actif === dernier\)\) \{ ev\.preventDefault\(\); premier\.focus\(\); \}/);
});

test("inscription venue de l'abonnement : etape 1 sur 2, duree en liste blanche, prix de la configuration", () => {
  const js = read("auth-pages.js");
  assert.match(js, /\/\^\\\/\(\?:\[a-z\]\{2\}\\\/\)\?abonnement\\\.html\\\?\(\?:\[\^#\]\*&\)\?duree=\(week\|month\|year\)\(\?:\[&#\]\|\$\)\/\.exec\(brut\)/);
  assert.match(js, /M\.proOffer\(\)/, "prix lu dans la configuration des marches");
  assert.doesNotMatch(js.slice(js.indexOf("function etapePaiement"), js.indexOf("/* ---------- Connexion")), /\d+,\d\d|199|19,95|6,99/, "aucun prix ecrit en dur");
  assert.match(read("inscription.html"), /<script src="\/lib\/market-config\.js"><\/script>/);
  // Tutoiement, comme le reste du site.
  const fr = JSON.parse(read("i18n/dict/fr.json")).auth;
  assert.equal(fr.signup_h1, "Commence gratuitement.");
  assert.equal(fr.pay_step_h1, "Étape 1 sur 2 : ton compte.");
  assert.match(fr.legal_prefix, /tu acceptes/);
});

test("film du match : echelle 0 et haut seulement, au moins 18 points au-dessus du plus haut point", () => {
  const src = read("lib/match-sections.js");
  assert.match(src, /Math\.max\.apply\(null, pcts\) \+ 18\) \/ 20\) \* 20/);
  assert.match(src, /ticks: \{ stepSize: haut, mirror: true/);
});

test("accueil : point de qualite des donnees en cyan (vert reserve aux ecarts chiffres) ; lien du compte Pro stylise", () => {
  assert.match(read("assets/home-list.css"), /\.hl-tag-q i\{[^}]*background:var\(--cyan,#20d5ef\)/);
  for (const l of LANGUES) assert.match(read(l + "index.html"), /<a class="op-alt op-alt--start" href=/, l + "index.html");
  assert.match(read("assets/offre-pro.css"), /\.op-alt--start\{justify-self:start;color:var\(--op-cyan\)\}/);
});
