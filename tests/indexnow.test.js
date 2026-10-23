"use strict";
// IndexNow (23/10/2026, chantier GEO/SEO, action A2) : scripts/indexnow-ping.js
// et .github/workflows/indexnow.yml. Aucun appel reseau ici : selection des
// adresses du jour dans les sitemaps, cle publiee a la racine, workflow separe
// du pipeline et sans droit d'ecriture.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const IN = require("../scripts/indexnow-ping.js");

test("cle IndexNow : hexadecimale, publiee a la racine (<cle>.txt), listee dans PUBLIC_ROOT_FILES", () => {
  assert.match(IN.KEY, /^[0-9a-f]{32}$/);
  assert.equal(IN.KEY_FILE, IN.KEY + ".txt");
  assert.equal(read(IN.KEY_FILE).trim(), IN.KEY);
  assert.ok(read("scripts/build-public.js").includes('"' + IN.KEY_FILE + '"'), "fichier de cle absent de PUBLIC_ROOT_FILES");
  const p = IN.payload(["https://iashark.com/fr/"]);
  assert.deepEqual(p, { host: "iashark.com", key: IN.KEY, keyLocation: "https://iashark.com/" + IN.KEY_FILE, urlList: ["https://iashark.com/fr/"] });
});

test("adresses du jour : lastmod du jour seulement, du site seulement, sans doublon, sitemaps de l'index", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-indexnow-"));
  try {
    fs.writeFileSync(path.join(tmp, "sitemap.xml"), '<?xml version="1.0"?><sitemapindex>' +
      "<sitemap><loc>https://iashark.com/sitemap-a.xml</loc><lastmod>2026-10-23</lastmod></sitemap>" +
      "<sitemap><loc>https://iashark.com/sitemap-b.xml</loc></sitemap>" +
      "<sitemap><loc>https://ailleurs.example/sitemap-c.xml</loc></sitemap>" +
      "<sitemap><loc>https://iashark.com/sitemap-absent.xml</loc></sitemap></sitemapindex>");
    fs.writeFileSync(path.join(tmp, "sitemap-a.xml"), "<urlset>" +
      "<url><loc>https://iashark.com/fr/</loc><lastmod>2026-10-23</lastmod></url>" +
      "<url><loc>https://iashark.com/fr/methodologie.html</loc></url>" +
      "<url><loc>https://iashark.com/match/1.html</loc><lastmod>2026-10-22</lastmod></url>" +
      "<url><loc>https://iashark.com/match/2.html</loc><lastmod>2026-10-23T05:40:00+00:00</lastmod></url>" +
      "<url><loc>https://autre.example/x.html</loc><lastmod>2026-10-23</lastmod></url></urlset>");
    fs.writeFileSync(path.join(tmp, "sitemap-b.xml"), "<urlset>" +
      "<url><loc>https://iashark.com/fr/</loc><lastmod>2026-10-23</lastmod></url>" +
      "<url><loc>https://iashark.com/gb/</loc><lastmod>2026-10-23</lastmod></url></urlset>");
    assert.deepEqual(IN.urlsModifiedOn("2026-10-23", tmp),
      ["https://iashark.com/fr/", "https://iashark.com/match/2.html", "https://iashark.com/gb/"]);
    assert.deepEqual(IN.urlsModifiedOn("2026-01-01", tmp), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("sitemaps du depot : lisibles par le script (adresses du dernier jour publie)", () => {
  const days = (read("sitemap-fr.xml").match(/<lastmod>(\d{4}-\d{2}-\d{2})/g) || []).map((s) => s.slice(9)).sort();
  assert.ok(days.length, "sitemap-fr.xml sans lastmod");
  const urls = IN.urlsModifiedOn(days[days.length - 1]);
  assert.ok(urls.length > 0);
  urls.forEach((u) => assert.match(u, /^https:\/\/iashark\.com\//));
});

test("workflow indexnow.yml : quotidien, lecture seule, separe du pipeline, checkout reduit", () => {
  const wf = read(".github/workflows/indexnow.yml");
  assert.match(wf, /schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \*'/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /permissions:\s*\n\s*contents: read\s*\n/);
  assert.doesNotMatch(wf, /contents: write|git push|secrets\./);
  assert.match(wf, /node scripts\/indexnow-ping\.js/);
  assert.ok(wf.includes("/" + IN.KEY_FILE), "le checkout doit inclure le fichier de cle");
  assert.match(wf, /\/sitemap\*\.xml/);
  // Le pipeline quotidien reste intact : aucun appel IndexNow dedans.
  assert.doesNotMatch(read(".github/workflows/update-data.yml"), /indexnow/i);
});
