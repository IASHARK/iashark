"use strict";
// Guide "choisir un bookmaker" (blog/guides/meilleurs-bookmakers-monde-2026.html)
// exact par version / pays (regles publicitaires Google Ads, CAP/ASA, ANJ,
// SEGOB, NGB) :
//   - fr            : ANJ, 18+, Joueurs Info Service ;
//   - gb / za       : pas de blog propre, /gb/blog/* et /za/blog/* redirigent
//                     vers /en/blog/* (_redirects) : la page en porte donc une
//                     section Grande-Bretagne (UKGC, GAMSTOP, BeGambleAware) et
//                     Afrique du Sud (NGB, boards provinciaux, NRGP) ;
//   - mx            : permisos SEGOB (Direccion General de Juegos y Sorteos) ;
//   - en/es/de/it/pt: texte neutre "regulateur de votre pays", sans ANJ.
// Aucune version ne parle de bonus / offre de bienvenue ni ne nomme d'operateur.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const GUIDE = "blog/guides/meilleurs-bookmakers-monde-2026.html";
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const PAGES = { fr: GUIDE, en: "en/" + GUIDE, es: "es/" + GUIDE, de: "de/" + GUIDE, it: "it/" + GUIDE, pt: "pt/" + GUIDE, mx: "mx/" + GUIDE };
const html = Object.fromEntries(Object.entries(PAGES).map(([k, f]) => [k, read(f)]));

// gb et za n'ont pas de copie du blog : on suit la redirection declaree.
function servedFor(dir) {
  const rule = read("_redirects").split("\n").map((l) => l.trim().split(/\s+/))
    .find((p) => p[0] === "/" + dir + "/blog/*");
  assert.ok(rule, "/" + dir + "/blog/* sans redirection");
  assert.equal(rule[1], "/en/blog/:splat", "/" + dir + "/blog/* ne mene plus au blog en");
  return html.en;
}

test("aucune version non fr ne mentionne l'ANJ ni un agrement francais", () => {
  for (const [k, h] of Object.entries(html)) {
    if (k === "fr") continue;
    assert.doesNotMatch(h, /\bANJ\b|anj\.fr|Autorit[ée] nationale des jeux|agr[ée]{2}s? en France|Joueurs Info Service|09 74 75 13 13/i, k + " cite l'ANJ / la France");
  }
});

test("aucune version ne parle de bonus ni d'offre de bienvenue", () => {
  const interdit = /bonus|\bboni\b|b[oó]nus|\bbonos?\b|welcome offer|offres? de bienvenue|bono de bienvenida|willkommens|di benvenuto|de boas-vindas|free bets?|paris? gratuits?|freebet/i;
  for (const [k, h] of Object.entries(html)) assert.doesNotMatch(h, interdit, k + " parle de bonus");
});

test("aucune version ne nomme ni ne classe un operateur, ni ne promet de gains", () => {
  const marques = /Betclic|Winamax|Bet365|Unibet|PMU|Betway|Pinnacle|Bwin|Caliente|Codere|Parions ?Sport|Hollywoodbets|Supabets|William Hill|Paddy Power|Sky Bet|⭐/i;
  const promesses = /gains? assur[ée]s|guaranteed profit|ganancias aseguradas|gewinn garantiert|vincita sicura|lucro garantido/i;
  for (const [k, h] of Object.entries(html)) {
    assert.doesNotMatch(h, marques, k + " nomme un operateur");
    assert.doesNotMatch(h, promesses, k + " promet des gains");
  }
});

test("fr : ANJ, 18+ et Joueurs Info Service", () => {
  assert.match(html.fr, /Autorité nationale des jeux \(ANJ\)/);
  assert.match(html.fr, /anj\.fr\/offre-de-jeu-et-marche\/operateurs-agrees/);
  assert.match(html.fr, /18\+/);
  assert.match(html.fr, /Joueurs Info Service/);
  assert.match(html.fr, /09 74 75 13 13/);
});

test("gb (page servie /en/) : UK Gambling Commission, 18+, BeGambleAware, GAMSTOP", () => {
  const h = servedFor("gb");
  assert.match(h, /UK Gambling Commission/);
  assert.match(h, /gamblingcommission\.gov\.uk\/public-register/);
  assert.match(h, /GAMSTOP/);
  assert.match(h, /BeGambleAware|GambleAware/);
  assert.match(h, /0808 8020 133/);
  assert.match(h, /18\+/);
});

test("za (page servie /en/) : National Gambling Board, boards provinciaux, 18+, NRGP", () => {
  const h = servedFor("za");
  assert.match(h, /National Gambling Board/);
  assert.match(h, /provincial licensing authorities/i);
  assert.match(h, /ngb\.org\.za\/verified-operators/);
  assert.match(h, /National Responsible Gambling Programme \(NRGP\)/);
  assert.match(h, /0800 006 008/);
  assert.match(h, /under 18/);
});

test("mx : permisos SEGOB (Direccion General de Juegos y Sorteos), 18+", () => {
  assert.match(html.mx, /SEGOB/);
  assert.match(html.mx, /Dirección General de Juegos y Sorteos/);
  assert.match(html.mx, /juegosysorteos\.gob\.mx/);
  assert.match(html.mx, /18\+|mayores de 18/);
  assert.doesNotMatch(html.mx, /UK Gambling Commission|Malta Gaming Authority/);
});

test("en/es/de/it/pt : texte neutre, renvoi au regulateur et a l'aide du pays", () => {
  const neutre = {
    en: /authorised by your own country's regulator/,
    es: /autorizado por el regulador de tu país/,
    de: /von der Aufsichtsbehörde Ihres Landes zugelassen/,
    it: /autorizzato dall'autorità di regolamentazione del tuo paese/,
    pt: /autorizado pelo regulador do seu país/,
  };
  for (const [k, re] of Object.entries(neutre)) {
    const h = html[k];
    assert.match(h, re, k + " sans renvoi au regulateur national");
    assert.match(h, /18\+/, k + " sans 18+");
    assert.ok(h.includes('href="/' + k + '/jeu-responsable.html"'), k + " sans renvoi vers l'aide au jeu responsable");
    assert.ok(fs.existsSync(path.join(ROOT, k, "jeu-responsable.html")), k + "/jeu-responsable.html absent");
  }
  // Les versions langue ne listent pas les regulateurs d'autres pays.
  for (const k of ["es", "de", "it", "pt"]) {
    assert.doesNotMatch(html[k], /DGOJ|\bGGL\b|\bADM\b|\bSRIJ\b|Gambling Commission|GAMSTOP/, k + " cite un regulateur national");
  }
});

test("JSON-LD valide et FAQ structuree identique a la FAQ visible", () => {
  for (const [k, h] of Object.entries(html)) {
    const blocs = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const faq = blocs.find((b) => b["@type"] === "FAQPage");
    assert.ok(faq, k + " sans FAQPage");
    const visibles = [...h.matchAll(/<div class="faq-q">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
    assert.deepEqual(faq.mainEntity.map((q) => q.name), visibles, k + " : FAQ JSON-LD differente de la FAQ visible");
  }
});
