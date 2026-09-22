"use strict";
// Blog Mexique (/mx/blog/) : guides dedies en espagnol du Mexique.
// Verrouille : une copie es-MX par guide publie, liens qui restent dans /mx/,
// hreflang es-MX sur toutes les copies, vocabulaire mexicain (momios, pas
// cuotas), aide mexicaine (Linea de la Vida), aucune licence affirmee pour un
// operateur, et le mapping du site /mx/ vers /mx/blog/.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const SITE = "https://iashark.com";
const GUIDES = fs.readdirSync(path.join(ROOT, "blog", "guides"))
  .filter((f) => f.endsWith(".html") && f !== "index.html");
const MX_FILES = ["mx/blog/index.html", "mx/blog/guides/index.html"].concat(GUIDES.map((g) => "mx/blog/guides/" + g));

test("chaque guide publie a sa version /mx/blog/", () => {
  assert.ok(GUIDES.length >= 6); // guide Coupe du monde retire le 22/09/2026
  MX_FILES.forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), f + " manquant"));
});

test("pages mx : lang es-MX, canonical mx, JSON-LD valide", () => {
  MX_FILES.forEach((f) => {
    const html = read(f);
    assert.match(html, /<html lang="es-MX"/, f);
    const canon = f === "mx/blog/guides/index.html" || f === "mx/blog/index.html"
      ? SITE + "/mx/blog/" : SITE + "/" + f;
    assert.ok(html.includes('<link rel="canonical" href="' + canon + '">'), f + " canonical");
    const blocs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocs.length >= 1, f + " sans JSON-LD");
    blocs.forEach((m) => {
      const ld = JSON.parse(m[1]);
      const txt = JSON.stringify(ld);
      assert.doesNotMatch(txt, /iashark\.com\/(es|fr)\//, f + " JSON-LD pointe hors mx");
    });
  });
});

test("pages mx : liens internes dans /mx/, vocabulaire et aide mexicains", () => {
  MX_FILES.forEach((f) => {
    const html = read(f);
    const hors = [...html.matchAll(/(?:href|src)="\/(fr|en|es|de|it|pt|gb|za)\/[^"]*"/g)].map((m) => m[0]);
    assert.deepEqual(hors, [], f + " : liens hors /mx/");
    assert.doesNotMatch(html, /cuota/i, f + " : 'cuota' au lieu de 'momio'");
    assert.doesNotMatch(html, /€|Joueurs Info Service|09 74 75 13 13/, f + " : euro ou aide France");
    assert.ok(html.includes("800 911 2000"), f + " : Línea de la Vida absente");
    assert.doesNotMatch(html, /apuesta (ahora|ya)\b/i, f + " : incitation");
  });
});

test("hreflang es-MX present sur toutes les copies du blog", () => {
  GUIDES.forEach((g) => {
    ["blog/guides/", "en/blog/guides/", "es/blog/guides/", "de/blog/guides/", "it/blog/guides/", "pt/blog/guides/", "mx/blog/guides/"].forEach((d) => {
      const html = read(d + g);
      assert.ok(html.includes('<link rel="alternate" hreflang="es-MX" href="' + SITE + "/mx/blog/guides/" + g + '">'), d + g);
      ["fr", "en", "es", "de", "it", "pt", "x-default"].forEach((h) => assert.ok(html.includes('hreflang="' + h + '"'), d + g + " " + h));
    });
  });
  ["blog.html", "en/blog/index.html", "es/blog/index.html", "de/blog/index.html", "it/blog/index.html", "pt/blog/index.html", "mx/blog/index.html"].forEach((f) => {
    assert.ok(read(f).includes('<link rel="alternate" hreflang="es-MX" href="' + SITE + '/mx/blog/">'), f);
  });
});

test("guide casas de apuestas mx : aucune licence ni classement affirme", () => {
  const html = read("mx/blog/guides/meilleurs-bookmakers-monde-2026.html");
  assert.doesNotMatch(html, /Betclic|Winamax|Bet365|Unibet|PMU|Betway|Pinnacle|Bwin|Caliente|Codere/i);
  assert.doesNotMatch(html, /licencia verificada|autorizad[oa]s? (por|en) (la )?SEGOB|⭐/i);
  assert.match(html, /SEGOB/);
  assert.doesNotMatch(read("mx/blog/guides/guide-paris-sportifs-debutant-complet.html"), /Betclic|Winamax|Bet365/);
});

test("le site /mx/ mene au blog /mx/blog/", () => {
  const markets = JSON.parse(read("config/markets.json"));
  assert.equal(markets._dirs.mx.blogDir, "mx");
  const builder = require("../scripts/build-locales.js");
  assert.equal(builder.mapPath("/blog.html", "mx"), "/mx/blog/");
  assert.equal(builder.mapPath("/blog/guides/" + GUIDES[0], "mx"), "/mx/blog/guides/" + GUIDES[0]);
  assert.equal(builder.mapPath("/blog.html", "es"), "/es/blog/");
  assert.match(read("bottom-navigation.js"), /mx:'mx'/);
  assert.match(read("i18n/i18n.js"), /market:"mx", blog:"mx"/);
  assert.match(read("mx/blog/index.html"), /'es-mx':'mx'/);
});
