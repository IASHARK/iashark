"use strict";
// Guides du blog (fr, en, es, mx) : ni mise, ni bankroll, ni operateur non agree,
// ni chiffre invérifiable (23/10/2026, PR #194). Les versions en/es/mx des guides
// value bet et debutant parlaient de Kelly, de pourcentages de bankroll, de
// Pinnacle et des bookmakers crypto, de « 97 % des parieurs perdent », de
// « 200+ variables » et de cotes « en temps reel » : rien de cela n'est vrai ni
// autorise. Le controle porte sur la page entiere (texte visible, balises meta)
// et sur chaque bloc JSON-LD (FAQ comprise).
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const GUIDES = fs.readdirSync(path.join(ROOT, "blog", "guides"))
  .filter((f) => f.endsWith(".html") && f !== "index.html");
const DIRS = ["blog/guides/", "en/blog/guides/", "es/blog/guides/", "mx/blog/guides/"];

const INTERDITS = [
  ["Kelly", /kelly/i],
  ["bankroll", /bank\s*roll/i],
  ["crypto", /crypto|cripto/i],
  ["Pinnacle", /pinnacle/i],
  ["Betclic", /betclic/i],
  ["97 %", /\b97\s*%/],
  ["200+", /\b200\s*\+/],
  ["temps reel", /real[\s-]time|tiempo real/i],
  // Pourcentage de mise, sous toutes ses formes.
  ["pourcentage de mise", /\d+(?:[.,]\d+)?\s*%\s*(?:de (?:la |votre |sa |ta )?|of (?:the |your )?|del? (?:tu |su )?)?(?:bankroll|capital|banca|mises?|stakes?|apuestas?)\b/i],
  ["pourcentage de mise", /(?:mises?|stakes?|apuestas?|importe|monto)\s*\(\s*%\s*\)/i],
  ["pourcentage de mise", /(?:entre|between)\s+\d+\s*%?\s*(?:et|à|and|to|y|a)\s+\d+\s*%/i],
  // « mise maximale » seule designe une regle de l'operateur (guide des bookmakers) :
  // seule une mise maximale chiffree (« mise max 4 € ») est un conseil de mise.
  ["mise conseillee", /\b(?:mises?|stakes?|importe|monto)\s+(?:max(?:imum|imale)?\.?\s*(?:de\s+|of\s+)?\d|recommand\w*|conseill\w*|optimal\w*|sugerid\w*|recomendad\w*|suggested|recommended)/i],
  ["mise conseillee", /\b(?:suggested|recommended|optimal) stakes?\b|\bmise optimale\b/i],
];

// Dette connue, a solder dans un chantier dedie (traduction fidele du guide
// francais, comme pour le value bet et le debutant) : prediction-ia-football-guide-2026
// en/es/mx parle encore de mise suggeree selon Kelly et de cotes « en temps reel »
// de 5 bookmakers. Retirer chaque entree des que la page est corrigee.
const A_REVOIR = {
  "en/blog/guides/prediction-ia-football-guide-2026.html": ["Kelly", "mise conseillee", "temps reel"],
  "es/blog/guides/prediction-ia-football-guide-2026.html": ["Kelly", "mise conseillee", "temps reel"],
  "mx/blog/guides/prediction-ia-football-guide-2026.html": ["Kelly", "mise conseillee", "temps reel"],
};
const SANS_EXCEPTION = ["value-bet-guide-complet-2026.html", "guide-paris-sportifs-debutant-complet.html"];
Object.keys(A_REVOIR).forEach((f) => assert.ok(!SANS_EXCEPTION.some((g) => f.endsWith("/" + g)), f));

const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const texte = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, "")).replace(/\s+/g, " ");
const metas = (html) => [...html.matchAll(/<(?:title)>([\s\S]*?)<\/title>|<meta [^>]*content="([^"]*)"/g)]
  .map((m) => decode(m[1] || m[2] || "")).join(" \n ");
const jsonLd = (f, html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
  const ld = JSON.parse(m[1]); // JSON-LD invalide = echec
  const textes = [];
  (function parcourir(v) {
    if (typeof v === "string") textes.push(v);
    else if (v && typeof v === "object") Object.values(v).forEach(parcourir);
  })(ld);
  return textes.join(" \n ");
}).join(" \n ");

test("guides fr/en/es/mx : ni Kelly, ni bankroll, ni crypto, ni Pinnacle, ni Betclic, ni chiffre invérifiable, ni pourcentage de mise", () => {
  assert.ok(GUIDES.includes("value-bet-guide-complet-2026.html"));
  assert.ok(GUIDES.includes("guide-paris-sportifs-debutant-complet.html"));
  const fautes = [];
  DIRS.forEach((d) => GUIDES.forEach((g) => {
    const f = d + g;
    const html = read(f);
    const zones = { page: texte(html), meta: metas(html), "JSON-LD": jsonLd(f, html) };
    INTERDITS.forEach(([nom, re]) => {
      if ((A_REVOIR[f] || []).includes(nom)) return;
      Object.entries(zones).forEach(([zone, txt]) => {
        const m = txt.match(re);
        if (m) fautes.push(f + " (" + zone + ") : " + nom + " -> « " + m[0] + " »");
      });
    });
  }));
  assert.deepEqual(fautes, []);
});

test("guides value bet et debutant : l'exemple de la cote 3.00 est juste (40 %, perd environ 6 fois sur 10)", () => {
  const attendu = {
    "blog/guides/": /cote 3\.00 estimé à 40 % perd environ 6 fois sur 10/,
    "en/blog/guides/": /odds of 3\.00 estimated at 40% loses about 6 times out of 10/,
    "es/blog/guides/": /cuota 3\.00 estimada en un 40 % pierde unas 6 veces de cada 10/,
    "mx/blog/guides/": /momio 3\.00 estimada en un 40 % pierde unas 6 veces de cada 10/,
  };
  // 0,40 x 3,00 - 1 = +0,20 : ecart positif ; 1 - 0,40 = 0,60 : perd 6 fois sur 10.
  assert.ok(Math.abs(0.40 * 3.00 - 1 - 0.20) < 1e-9);
  Object.entries(attendu).forEach(([d, re]) => {
    const html = read(d + "value-bet-guide-complet-2026.html");
    assert.match(texte(html), re, d);
    assert.doesNotMatch(texte(html), /7 (fois sur|times out of|veces de cada) 10/, d + " : ancien exemple faux");
  });
});

test("page exemple d'analyse : aucune mise ni pourcentage de bankroll (demo_data.stake)", () => {
  ["fr", "en", "es", "es-mx", "de", "it", "pt"].forEach((l) => {
    const dict = JSON.parse(read("i18n/dict/" + l + ".json"));
    const stake = dict.demo_data && dict.demo_data.stake;
    assert.ok(stake, l + " : demo_data.stake absent");
    assert.doesNotMatch(stake, /%|\d|bankroll/i, l + " : " + stake);
  });
  ["exemple-analyse.html", "fr/exemple-analyse.html", "en/exemple-analyse.html", "es/exemple-analyse.html",
    "mx/exemple-analyse.html", "gb/exemple-analyse.html", "za/exemple-analyse.html"].forEach((f) => {
    if (!fs.existsSync(path.join(ROOT, f))) return;
    assert.doesNotMatch(read(f), /"mise": "[^"]*(%|bankroll)/i, f);
  });
});
