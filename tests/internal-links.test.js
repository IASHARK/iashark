"use strict";
// Maillage interne du site CONSTRUIT (scripts/build-public.js), tel qu'un robot
// le parcourt : liens <a href> du HTML statique, _redirects applique
// (scripts/seo-site-audit.js). Audit SEO du 15/09/2026 : 0 lien entrant vers
// /en/clubs, /es/equipos, /gb/articles, /za/articles ; 58 pages indexables
// inaccessibles depuis l'accueil de leur version.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { ROOT, buildSite } = require("./helpers/built-site.js");
const AUDIT = require("../scripts/seo-site-audit.js");
const C = require("../scripts/seo-common.js");
const ARTICLES = require("../scripts/build-local-articles.js");

let site, report;
before(() => { site = buildSite(); report = AUDIT.audit(site.dir); });
after(() => { if (site) site.cleanup(); });

const read = (rel) => fs.readFileSync(path.join(site.dir, rel), "utf8");
const hrefs = (html) => new Set([...html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)].map((m) => m[1]));

test("site construit : aucune section orpheline, aucun lien interne casse", () => {
  assert.ok(report.indexable > 100, "site construit incomplet (" + report.indexable + " pages indexables)");
  assert.deepEqual(report.orphanSections, [], "sections sans lien entrant depuis le reste du site");
  for (const s of ["/gb/clubs/", "/za/clubs/", "/en/clubs/", "/es/equipos/", "/mx/equipos/", "/gb/articles/", "/za/articles/", "/gb/leagues/"]) {
    assert.ok(report.sections[s] && report.sections[s].inbound > 0, s + " : aucun lien entrant");
  }
  assert.deepEqual(report.broken, [], "liens internes vers une page absente");
});

test("site construit : toute page indexable a <= 3 clics de l'accueil de sa version", () => {
  for (const v of AUDIT.DIR_CODES) {
    const r = report.versions[v];
    assert.ok(r.indexable > 0, v + " : aucune page indexable");
    assert.deepEqual(r.unreachable, [], v + " : pages indexables inaccessibles depuis /" + v + "/");
    assert.deepEqual(r.tooDeep, [], v + " : pages a plus de " + AUDIT.MAX_DEPTH + " clics");
  }
});

test("accueil et pied de page de chaque version : hubs ligue du perimetre, clubs, articles, methodologie", () => {
  for (const dir of C.DIR_CODES) {
    const home = read(dir + "/index.html");
    const links = hrefs(home);
    const nav = C.versionNav(dir, site.dir);
    const expected = nav.leagues.map((x) => x.href).concat(nav.sections.map((x) => x.href));
    for (const key of C.leaguesInScope(dir).map((l) => l.key)) {
      const hub = C.leagueHubPath(dir, key);
      if (fs.existsSync(path.join(site.dir, hub.slice(1)))) assert.ok(links.has(hub), dir + " : accueil sans lien vers " + hub);
    }
    const clubs = C.clubsHubPath(dir, site.dir), arts = C.articlesHubPath(dir, site.dir), meth = C.methodologyPath(dir, site.dir);
    [clubs, arts, meth].filter(Boolean).forEach((p) => assert.ok(links.has(p), dir + " : accueil sans lien vers " + p));
    if (["gb", "za", "mx", "fr", "en", "es"].includes(dir)) assert.ok(clubs, dir + " : hub clubs attendu");
    if (["gb", "za", "mx", "fr", "es"].includes(dir)) assert.ok(arts, dir + " : hub articles attendu");
    // Hub hors perimetre (noindex) : jamais mis en avant depuis l'accueil.
    const inScope = new Set(C.leaguesInScope(dir).map((l) => C.leagueHubPath(dir, l.key)));
    [...links].filter((h) => h.indexOf("/" + dir + "/leagues/") === 0).forEach((h) => assert.ok(inScope.has(h), dir + " : lien d'accueil vers un hub hors perimetre " + h));
    // Pied de page : meme navigation sur l'accueil, une page legale, un hub ligue.
    const samples = [dir + "/index.html", dir + "/cookies.html", C.leagueHubPath(dir, C.leaguesInScope(dir)[0].key).slice(1)];
    if (clubs) samples.push(clubs.slice(1) + "index.html");
    if (arts) samples.push(arts.slice(1) + "index.html");
    for (const rel of samples) {
      const html = read(rel);
      const block = (html.match(/<!--SEO_FOOTER_NAV-->([\s\S]*?)<!--\/SEO_FOOTER_NAV-->/) || [])[1];
      assert.ok(block, rel + " : navigation de pied de page absente");
      const inBlock = hrefs(block);
      expected.forEach((h) => assert.ok(inBlock.has(h), rel + " : pied de page sans " + h));
    }
  }
});

test("articles -> hub ligue ou page club ; pages match -> club et derby quand ils existent", () => {
  for (const m of ARTICLES.loadManifests()) {
    for (const a of m.articles) {
      const rel = (a.related || []).map((r) => r.href);
      assert.ok(rel.some((h) => /\/(leagues|clubs|equipos)\//.test(h)), m.dir + "/" + a.slug + " : aucun lien vers un hub ligue ou une page club");
    }
  }
  let clubLinks = 0;
  for (const dir of C.DIR_CODES) {
    const folder = dir === C.X_DEFAULT_DIR ? "match" : dir + "/match";
    if (!fs.existsSync(path.join(site.dir, folder))) continue;
    for (const f of fs.readdirSync(path.join(site.dir, folder)).filter((x) => /^\d+\.html$/.test(x))) {
      const id = f.replace(".html", "");
      let src = null;
      try { src = JSON.parse(fs.readFileSync(path.join(ROOT, "match", id + ".json"), "utf8")); } catch (e) { continue; }
      const html = read(folder + "/" + f);
      for (const t of [src.home, src.away]) {
        const club = t && t.id != null ? C.clubPageFor(t.id, dir, site.dir) : null;
        if (!club) continue;
        clubLinks++;
        assert.ok(hrefs(html).has(club.path), folder + "/" + f + " : pas de lien vers la page club " + club.path);
      }
    }
  }
  assert.ok(clubLinks > 0, "aucune page match avec un club suivi : verification vide");
});
