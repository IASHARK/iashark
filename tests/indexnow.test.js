"use strict";
// IndexNow (23/10/2026, chantier GEO/SEO, action A2) : scripts/indexnow-ping.js
// et .github/workflows/indexnow.yml. Aucun appel reseau ici : le site en ligne
// et l'API IndexNow sont simules (fetch remplace). Verifie : plan du site lu
// en ligne (index puis sous-sitemaps, aucune page verifiee une par une),
// pages du jour ET de la veille, lots limites, cle publiee a la racine,
// workflow separe du pipeline et sans droit d'ecriture.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const IN = require("../scripts/indexnow-ping.js");

// Faux site en ligne : { "https://iashark.com/x": texte } (absent = 404).
// Note chaque requete ; les POST IndexNow repondent `postStatus`.
function fakeWeb(pages, postStatus) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const method = (opts && opts.method) || "GET";
    calls.push({ url: url, method: method, body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (method === "POST") return { status: postStatus || 200, text: async () => "" };
    const has = Object.prototype.hasOwnProperty.call(pages, url);
    return { status: has ? 200 : 404, text: async () => (has ? pages[url] : "not found") };
  };
  return { fetch: fetchImpl, calls: calls };
}
const urlset = (rows) => "<urlset>" + rows.map((r) => "<url><loc>" + r[0] + "</loc>" + (r[1] ? "<lastmod>" + r[1] + "</lastmod>" : "") + "</url>").join("") + "</urlset>";
const index = (locs) => '<?xml version="1.0"?><sitemapindex>' + locs.map((l) => "<sitemap><loc>" + l + "</loc></sitemap>").join("") + "</sitemapindex>";
const quiet = () => {};

test("cle IndexNow : hexadecimale, publiee a la racine (<cle>.txt), listee dans PUBLIC_ROOT_FILES", () => {
  assert.match(IN.KEY, /^[0-9a-f]{32}$/);
  assert.equal(IN.KEY_FILE, IN.KEY + ".txt");
  assert.equal(read(IN.KEY_FILE).trim(), IN.KEY);
  assert.ok(read("scripts/build-public.js").includes('"' + IN.KEY_FILE + '"'), "fichier de cle absent de PUBLIC_ROOT_FILES");
  const p = IN.payload(["https://iashark.com/fr/"]);
  assert.deepEqual(p, { host: "iashark.com", key: IN.KEY, keyLocation: "https://iashark.com/" + IN.KEY_FILE, urlList: ["https://iashark.com/fr/"] });
});

test("veille : calendrier UTC, changements de mois et d'annee", () => {
  assert.equal(IN.previousDay("2026-10-23"), "2026-10-22");
  assert.equal(IN.previousDay("2026-03-01"), "2026-02-28");
  assert.equal(IN.previousDay("2026-01-01"), "2025-12-31");
});

test("selection : lastmod du jour puis de la veille, du site seulement, sans doublon", () => {
  const a = urlset([
    ["https://iashark.com/fr/", "2026-10-23"],
    ["https://iashark.com/fr/methodologie.html", null],
    ["https://iashark.com/match/1.html", "2026-10-22"],
    ["https://iashark.com/match/0.html", "2026-10-21"],
    ["https://iashark.com/match/2.html", "2026-10-23T05:40:00+00:00"],
    ["https://autre.example/x.html", "2026-10-23"],
  ]);
  const b = urlset([
    ["https://iashark.com/fr/", "2026-10-23"],
    ["https://iashark.com/gb/", "2026-10-22"],
    ["https://iashark.com/za/", "2026-10-23"],
  ]);
  assert.deepEqual(IN.selectUrls([a, b], ["2026-10-23", "2026-10-22"]), [
    "https://iashark.com/fr/", "https://iashark.com/match/2.html", "https://iashark.com/za/",
    "https://iashark.com/match/1.html", "https://iashark.com/gb/",
  ]);
  assert.deepEqual(IN.selectUrls([a, b], ["2026-01-01", "2025-12-31"]), []);
});

test("plan du site lu EN LIGNE : index puis sous-sitemaps du site, aucune page verifiee une par une", async () => {
  const web = fakeWeb({
    "https://iashark.com/sitemap.xml": index([
      "https://iashark.com/sitemap-a.xml",
      "https://iashark.com/sitemap-b.xml",
      "https://iashark.com/sitemap-a.xml",
      "https://ailleurs.example/sitemap-c.xml",
      "https://iashark.com/match/1.html",
      "https://iashark.com/sitemap-absent.xml",
    ]),
    "https://iashark.com/sitemap-a.xml": urlset([["https://iashark.com/fr/", "2026-10-23"], ["https://iashark.com/match/1.html", "2026-10-22"]]),
    "https://iashark.com/sitemap-b.xml": urlset([["https://iashark.com/gb/", "2026-10-20"]]),
  });
  const r = await IN.urlsModifiedOnline(["2026-10-23", "2026-10-22"], { fetch: web.fetch });
  assert.deepEqual(r.urls, ["https://iashark.com/fr/", "https://iashark.com/match/1.html"]);
  assert.equal(r.sitemaps, 3);
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /sitemap-absent\.xml \(reponse 404\)/);
  assert.deepEqual(web.calls.map((c) => c.url), [
    "https://iashark.com/sitemap.xml", "https://iashark.com/sitemap-a.xml",
    "https://iashark.com/sitemap-b.xml", "https://iashark.com/sitemap-absent.xml",
  ]);
  await assert.rejects(IN.urlsModifiedOnline(["2026-10-23"], { fetch: fakeWeb({}).fetch }), /plan du site illisible en ligne/);
});

test("envoi complet : une douzaine de requetes, lots de MAX_PER_REQUEST au plus, jour et veille", async () => {
  assert.ok(IN.MAX_PER_REQUEST <= 1000 && IN.MAX_PER_RUN <= 10000, "limites raisonnables");
  const n = IN.MAX_PER_REQUEST + 5;
  const pages = { "https://iashark.com/sitemap.xml": index(Array.from({ length: 11 }, (_, i) => "https://iashark.com/sitemap-" + i + ".xml")) };
  for (let i = 0; i < 11; i++) pages["https://iashark.com/sitemap-" + i + ".xml"] = urlset([]);
  pages["https://iashark.com/sitemap-0.xml"] = urlset(Array.from({ length: n }, (_, i) => ["https://iashark.com/match/" + i + ".html", i % 2 ? "2026-10-22" : "2026-10-23"]));
  pages["https://iashark.com/" + IN.KEY_FILE] = IN.KEY + "\n";
  const web = fakeWeb(pages, 202);
  const sent = await IN.main(["node", "x", "--date", "2026-10-23"], { fetch: web.fetch, log: quiet });
  assert.equal(sent, n);
  const gets = web.calls.filter((c) => c.method === "GET");
  const posts = web.calls.filter((c) => c.method === "POST");
  assert.equal(gets.length, 1 + 11 + 1, "index + sous-sitemaps + cle, rien d'autre");
  assert.ok(gets.every((c) => /\/sitemap[\w-]*\.xml$|\.txt$/.test(c.url)), "aucune page match ou HTML interrogee");
  assert.equal(posts.length, 2);
  posts.forEach((p) => {
    assert.equal(p.url, IN.ENDPOINT);
    assert.ok(p.body.urlList.length <= IN.MAX_PER_REQUEST);
    assert.equal(p.body.key, IN.KEY);
  });
  const all = posts[0].body.urlList.concat(posts[1].body.urlList);
  assert.equal(new Set(all).size, n);
  // Les pages du jour passent avant celles de la veille.
  const firstVeille = all.findIndex((u) => Number(u.match(/(\d+)\.html$/)[1]) % 2 === 1);
  assert.ok(all.slice(firstVeille).every((u) => Number(u.match(/(\d+)\.html$/)[1]) % 2 === 1));
});

test("envoi : --dry-run n'envoie rien ; cle absente en ligne = arret ; sous-sitemap illisible = workflow en rouge", async () => {
  const base = {
    "https://iashark.com/sitemap.xml": index(["https://iashark.com/sitemap-a.xml", "https://iashark.com/sitemap-b.xml"]),
    "https://iashark.com/sitemap-a.xml": urlset([["https://iashark.com/fr/", "2026-10-23"]]),
  };
  const dry = fakeWeb(Object.assign({}, base, { "https://iashark.com/sitemap-b.xml": urlset([]) }));
  assert.equal(await IN.main(["node", "x", "--date", "2026-10-23", "--dry-run"], { fetch: dry.fetch, log: quiet }), 0);
  assert.ok(dry.calls.every((c) => c.method === "GET" && c.url !== "https://iashark.com/" + IN.KEY_FILE));

  const sansCle = fakeWeb(Object.assign({}, base, { "https://iashark.com/sitemap-b.xml": urlset([]) }));
  await assert.rejects(IN.main(["node", "x", "--date", "2026-10-23"], { fetch: sansCle.fetch, log: quiet }), /cle IndexNow introuvable en ligne/);
  assert.equal(sansCle.calls.filter((c) => c.method === "POST").length, 0);

  const partiel = fakeWeb(Object.assign({}, base, { ["https://iashark.com/" + IN.KEY_FILE]: IN.KEY }));
  await assert.rejects(IN.main(["node", "x", "--date", "2026-10-23"], { fetch: partiel.fetch, log: quiet }), /1 sous-sitemap\(s\) illisible\(s\)/);
  const posts = partiel.calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 1, "les adresses lisibles partent quand meme");
  assert.deepEqual(posts[0].body.urlList, ["https://iashark.com/fr/"]);

  await assert.rejects(IN.main(["node", "x", "--date", "23/10/2026"], { fetch: dry.fetch, log: quiet }), /AAAA-MM-JJ/);
});

test("sitemaps du depot (copie de ce qui est en ligne) : lisibles par le script", async () => {
  // Faux site servi depuis les fichiers du depot.
  const pages = {};
  fs.readdirSync(ROOT).filter((f) => /^sitemap[\w-]*\.xml$/.test(f)).forEach((f) => { pages["https://iashark.com/" + f] = read(f); });
  const days = (read("sitemap-fr.xml").match(/<lastmod>(\d{4}-\d{2}-\d{2})/g) || []).map((s) => s.slice(9)).sort();
  assert.ok(days.length, "sitemap-fr.xml sans lastmod");
  const last = days[days.length - 1];
  const r = await IN.urlsModifiedOnline([last, IN.previousDay(last)], { fetch: fakeWeb(pages).fetch });
  assert.deepEqual(r.failures, []);
  assert.ok(r.sitemaps >= 5 && r.sitemaps <= 20, "une douzaine de sous-sitemaps attendue, " + r.sitemaps + " lues");
  assert.ok(r.urls.length > 0);
  r.urls.forEach((u) => assert.match(u, /^https:\/\/iashark\.com\//));
});

test("workflow indexnow.yml : quotidien a 09:15 UTC, lecture seule, separe du pipeline, checkout reduit", () => {
  const wf = read(".github/workflows/indexnow.yml");
  assert.match(wf, /schedule:\s*\n\s*- cron: '15 9 \* \* \*'/);
  assert.match(wf, /09:15 UTC/);
  assert.doesNotMatch(wf, /06:45|45 6 \* \* \*/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /permissions:\s*\n\s*contents: read\s*\n/);
  assert.doesNotMatch(wf, /contents: write|git push|secrets\./);
  assert.match(wf, /node scripts\/indexnow-ping\.js/);
  assert.ok(wf.includes("/" + IN.KEY_FILE), "le checkout doit inclure le fichier de cle");
  // Le plan du site est lu en ligne : plus besoin des sitemaps du depot.
  assert.doesNotMatch(wf, /\/sitemap\*\.xml/);
  // Le pipeline quotidien reste intact : aucun appel IndexNow dedans.
  assert.doesNotMatch(read(".github/workflows/update-data.yml"), /indexnow/i);
});
