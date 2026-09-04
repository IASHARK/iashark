"use strict";
// Fiche joueur.
// Ces tests verrouillent surtout la regle la plus importante de la page :
// une donnee absente ne devient jamais un zero, et rien n'est affiche qui ne
// vienne pas reellement du projet.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const lire = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const html = lire("joueur.html");
const js = lire("player-page.js");
const css = lire("assets/player-page.css");
const picker = lire("lib/markets/top-scorer-picker.js");
const workflow = lire(".github/workflows/update-data.yml");

test("la page est un shell leger qui rend un squelette avant les donnees", () => {
  assert.match(html, /id="squelette"/);
  assert.match(html, /id="playerRoot" hidden/);
  assert.match(html, /aria-busy="true"/);
  // Pas de rond qui tourne au milieu de l'ecran : le squelette calque la
  // vraie mise en page.
  assert.match(html, /animate-pulse/);
  assert.ok(!/Chargement de la fiche joueur…<\/p>/.test(html), "ancien indicateur de chargement encore present");
});

// La regle la plus importante du brief.
test("une donnee absente affiche 'Donnée indisponible', jamais un zero", () => {
  assert.match(js, /Donnée indisponible/);
  assert.match(js, /function ou\(/);
  // n() doit rejeter null et la chaine vide, sinon Number(null) vaut 0 et
  // une absence se transforme silencieusement en zero.
  const nDef = js.slice(js.indexOf("function n(v)"), js.indexOf("function n(v)") + 160);
  assert.match(nDef, /v !== null/);
  assert.match(nDef, /v !== ''/);
});

test("le score de menace est lisible autrement que par l'anneau", () => {
  // Valeur ecrite en clair, et l'anneau porte un role et un libelle.
  assert.match(js, /role="img" aria-label="Score de menace de but : ' \+ score \+ ' sur 100"/);
  assert.match(js, /\/ 100/);
});

// Le detail du score doit venir du moteur, jamais d'une reconstruction
// approximative cote navigateur : deux composantes sont relatives au pool de
// joueurs du match, que le client ne recoit pas.
test("le detail du score n'est affiche que si le moteur l'a fourni", () => {
  assert.match(js, /if \(!c \|\| n\(c\.shotsOnNorm\) === null\)/);
  assert.match(js, /Le détail chiffré de chaque composante sera disponible/);
  // Le moteur expose bien ces composantes, et le pipeline les publie.
  assert.match(picker, /scoreComponents = \{/);
  assert.match(picker, /shotsOnNorm/);
  assert.match(workflow, /score_components:p\.scoreComponents/);
  assert.match(workflow, /reliability:p\.reliability/);
  assert.match(workflow, /baseline_conversion:p\.baselineConversion/);
  assert.match(workflow, /minutes:p\.minutes/);
});

test("les poids affiches sont ceux du moteur, pas des valeurs recopiees", () => {
  // La page lit c.weights plutot que d'ecrire 0.5 / 0.25 / 0.25 en dur : si
  // la ponderation change dans le moteur, l'ecran suit.
  assert.match(js, /c\.weights\.shotsOn/);
  assert.match(js, /c\.weights\.shotsTotal/);
  assert.match(js, /c\.weights\.conversion/);
  assert.ok(!/0\.5 \* c\.shotsOnNorm/.test(js), "les poids sont recopies en dur dans la page");
});

// La probabilite d'etre titulaire a ete retiree du produit le 04/09/2026 :
// c'etait une frequence passee presentee comme une prevision.
test("aucune probabilite de titularisation n'est affichee ni recalculee", () => {
  assert.ok(!/startProbability/.test(js));
  assert.ok(!/[Pp]robabilité de titularisation\s*<|Probabilité d'être titulaire/.test(js));
  assert.match(js, /Nous ne publions pas de probabilité de titularisation/);
  // Le champ ne doit pas non plus revenir dans le modele de donnees.
  assert.ok(!/startProbability/.test(lire("lib/match-view-model.js")));
});

test("aucune donnee absente du projet n'est simulee", () => {
  // Ni xG/xA joueur, ni carte de tirs, ni percentiles : rien de tout cela
  // n'existe dans les donnees du projet.
  //
  // On lit le code SANS ses commentaires : l'en-tete du fichier liste
  // justement ces donnees pour dire qu'elles n'existent pas, et faire porter
  // la verification sur le fichier brut reviendrait a signaler la
  // documentation de l'absence.
  const rendu = js.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  for (const motif of [/\bxG\b/, /\bxA\b/, /percentile/i, /shot.?map/i, /carte des tirs/i,
                       /touches? dans la surface/i, /valeur marchande/i, /pied fort/i, /top \d+ ?%/i]) {
    assert.ok(!motif.test(rendu), `la fiche affiche ${motif}, absent du projet`);
  }
});

test("le statut de disponibilite ne conclut jamais sans donnee", () => {
  assert.match(js, /Statut indisponible/);
  // Une absence d'information de blessure ne doit pas etre presentee comme
  // une disponibilite.
  assert.match(js, /Cela ne signifie pas qu’il est disponible/);
  // Les trois etats reels, et rien d'autre.
  assert.match(js, /Absence signalée/);
  assert.match(js, /Blessure signalée/);
});

test("le titre 'pourquoi il est a surveiller' n'apparait que pour un joueur reellement retenu", () => {
  const bloc = js.slice(js.indexOf("function pourquoi("), js.indexOf("function pourquoi(") + 400);
  assert.match(bloc, /if \(!ts\) return '';/);
});

test("la page passe par match-data, qui decide ce qu'un visiteur recoit", () => {
  assert.match(js, /functions\.invoke\('match-data'\)/);
  // Le repli direct sur le fichier public n'existe que si la fonction est
  // injoignable, jamais comme chemin normal pour un visiteur sans session.
  const bloc = js.slice(js.indexOf("async function charger"), js.indexOf("async function charger") + 1200);
  assert.ok(bloc.indexOf("functions.invoke") < bloc.indexOf("fetch('/data.json"),
    "le fichier public est lu avant la fonction protegee");
});

test("les images reservent leur place et le mouvement est optionnel", () => {
  const images = [...js.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
  for (const img of images) {
    assert.match(img, /width="\d+"/, "image sans largeur : " + img.slice(0, 70));
    assert.match(img, /height="\d+"/, "image sans hauteur : " + img.slice(0, 70));
  }
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test("les chiffres sont alignes en colonne", () => {
  assert.match(css, /\.chiffres\{font-variant-numeric:tabular-nums\}/);
  assert.match(js, /class="chiffres/);
});

test("aucune bibliotheque n'est chargee pour un anneau et quelques barres", () => {
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of scripts) {
    assert.ok(src.startsWith("/") || src.includes("supabase"), `script inattendu : ${src}`);
  }
  assert.ok(!/chart\.js|d3|framer|gsap|three/i.test(html + js));
});

test("la page n'est pas indexee : son contenu depend d'un match precis", () => {
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
});
