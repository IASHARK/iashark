"use strict";
// Pages de resultats indexables (scripts/results-pages.js, lot R3 de
// docs/SPEC_RESULTATS_HIER.md) : balises completes et uniques, hreflang
// reciproques, comptes justes, aucune donnee d'un match non termine, aucune
// journee vide indexee, et non-regression des sitemaps existants.
//
// Les journees de test sont construites a partir de historique.json (paris
// REELLEMENT publies, avec leur resultat reel) : aucun resultat invente. Seules
// les lignes de garde (match non termine, match annule, nom d'equipe hostile)
// sont fabriquees - elles servent justement a verifier ce qui ne doit JAMAIS
// sortir dans le HTML.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const RP = require("../scripts/results-pages.js");
const C = require("../scripts/seo-common.js");
const SITEMAPS = require("../scripts/i18n-sitemaps.js");
const DIRS = C.DIR_CODES;
const SITE = "https://iashark.com";
const TODAY = "2026-09-20";

const HISTORIQUE = JSON.parse(fs.readFileSync(path.join(ROOT, "historique.json"), "utf8"));
// Deux journees reelles : la plus recente qui a au moins 5 marches regles, et
// la precedente (chaine precedent/suivant).
function realDays() {
  const byDay = {};
  for (const p of HISTORIQUE.predictions || []) {
    if (!RP.isDayKey(p.date) || !["win", "loss", "void"].includes(p.result)) continue;
    (byDay[p.date] = byDay[p.date] || []).push({
      id: p.fixture_id, home: p.home, away: p.away, league: p.league, league_key: p.league_key,
      kickoff: p.date + " 20:00", score: p.score, pick: p.prediction, market_id: p.market,
      cote: p.cote, odds_source: p.has_pinnacle === true ? "pinnacle" : "moyenne", result: p.result
    });
  }
  return Object.keys(byDay).sort().reverse()
    .filter((d) => byDay[d].filter((m) => m.result !== "void").length >= 5)
    .slice(0, 2).reverse()
    .map((day) => ({ day: day, generated_at: "2026-09-20T06:00:00.000Z", matches: byDay[day] }));
}
const REAL = realDays();
assert.ok(REAL.length === 2, "historique.json : deux journees reglees attendues pour les tests");

// Lignes de garde ajoutees a la journee la plus recente.
const XSS_TEAM = 'Ath"letic <script>alert(1)</script> & Co';
const PENDING = {
  id: 999000001, home: "Equipe En Cours", away: "Equipe Adverse", league: "Serie A", league_key: "seriea",
  kickoff: REAL[1].day + " 22:45", score: null, pick: "Plus de 2.5 buts", market_id: "over-25",
  cote: 1.77, odds_source: "pinnacle", result: "pending"
};
const VOID = {
  id: 999000002, home: "Equipe Annulee", away: "Equipe Reportee", league: "Ligue 1", league_key: "ligue1",
  kickoff: REAL[1].day + " 21:00", score: null, pick: "Moins de 3.5 buts", market_id: "under-35",
  cote: 1.42, odds_source: "pinnacle", result: "void"
};
const XSS = {
  id: 999000003, home: XSS_TEAM, away: "Rival & Fils", league: "La Liga", league_key: "laliga",
  kickoff: REAL[1].day + " 19:00", score: "1-0", pick: "Moins de 2.5 buts", market_id: "under-25",
  cote: 1.61, odds_source: "moyenne", result: "win"
};
// Journee sans aucun marche regle : rien a montrer, donc aucune page.
const EMPTY_DAY = "2026-09-19";

function fixtureDays() {
  const last = JSON.parse(JSON.stringify(REAL[1]));
  last.matches = last.matches.concat([PENDING, VOID, XSS]);
  last.scorers = [
    { match_id: XSS.id, match: XSS_TEAM + " - Rival & Fils", player: "Buteur <b>Reel</b>", goals: 1, result: "win" },
    { match_id: REAL[1].matches[0].id, match: REAL[1].matches[0].home + " - " + REAL[1].matches[0].away, player: "Autre Joueur", goals: 0, result: "loss" },
    { match_id: PENDING.id, match: "Equipe En Cours - Equipe Adverse", player: "Joueur En Attente", goals: 0, result: "pending" }
  ];
  return [REAL[0], last, { day: EMPTY_DAY, matches: [PENDING, VOID] }];
}

let site = null;
function build() {
  if (site) return site;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-resultats-"));
  fs.mkdirSync(path.join(dir, "results"), { recursive: true });
  for (const d of fixtureDays()) fs.writeFileSync(path.join(dir, "results", d.day + ".json"), JSON.stringify(d));
  const report = RP.writeResultsPages({ root: dir, limit: 30, today: TODAY, now: new Date(TODAY + "T06:00:00Z") });
  const read = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
  site = { dir: dir, report: report, read: read, days: [REAL[0].day, REAL[1].day] };
  return site;
}
const head = (html) => html.split(/<\/head>/i)[0];
const tag = (html, re) => (head(html).match(re) || []).length;
const alternates = (html) => [...head(html).matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => ({ hl: m[1], href: m[2] }));
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const urlsOf = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

// ---------------------------------------------------------------------------
test("normalizeDay : les matchs non termines sortent, les annules ne comptent pas, le compte est celui des lignes affichees", () => {
  const raw = fixtureDays()[1];
  const d = RP.normalizeDay(raw, raw.day);
  const settledIn = raw.matches.filter((m) => m.result === "win" || m.result === "loss").length;
  assert.equal(d.counts.settled, settledIn, "settled = gagnes + perdus");
  assert.equal(d.counts.won + d.counts.lost, d.counts.settled);
  assert.equal(d.counts.void, 1, "un match annule dans la journee de test");
  assert.equal(d.matches.length, settledIn + 1, "les annules restent affiches, les non termines non");
  assert.ok(!d.matches.some((m) => m.result === "pending"), "un match non termine ne devient jamais une ligne");
  // Un match annule perd son pari et sa cote : il peut n'avoir jamais ete joue.
  const vd = d.matches.find((m) => m.result === "void");
  assert.equal(vd.pick, null);
  assert.equal(vd.cote, null);
  // Les buteurs non regles sortent aussi.
  assert.ok(!d.scorers.some((s) => s.player === "Joueur En Attente"));
  // Ordre : coup d'envoi, jamais le resultat (la journee de test commence par
  // un match perdant ou gagnant selon l'heure, pas par les gagnants groupes).
  const results = d.matches.map((m) => m.result);
  const grouped = results.slice().sort().join("") === results.join("");
  assert.ok(!grouped || new Set(results).size === 1, "les gagnants ne sont pas regroupes en tete");
  // Une journee sans marche regle n'est pas publiable.
  const empty = RP.normalizeDay({ day: EMPTY_DAY, matches: [PENDING, VOID] }, EMPTY_DAY);
  assert.equal(empty.counts.settled, 0);
});

test("pages ecrites : index + une page par journee reglee dans les 9 repertoires, aucune journee vide", () => {
  const s = build();
  for (const dir of DIRS) {
    assert.ok(fs.existsSync(path.join(s.dir, dir, "resultats", "index.html")), dir + " : index manquant");
    for (const day of s.days) assert.ok(fs.existsSync(path.join(s.dir, dir, "resultats", day + ".html")), dir + "/" + day);
    assert.ok(!fs.existsSync(path.join(s.dir, dir, "resultats", EMPTY_DAY + ".html")), dir + " : journee vide publiee");
    const files = fs.readdirSync(path.join(s.dir, dir, "resultats")).sort();
    assert.deepEqual(files, ["index.html"].concat(s.days.map((d) => d + ".html")).sort(), dir + " : fichiers inattendus");
  }
  assert.equal(s.report.pages, DIRS.length * (1 + s.days.length));
});

test("balises : title, description et canonical uniques par page, uniques par jour ET par pays", () => {
  const s = build();
  const titles = new Set(), descriptions = new Set(), canonicals = new Set();
  for (const dir of DIRS) {
    for (const rel of ["index.html"].concat(s.days.map((d) => d + ".html"))) {
      const html = s.read(dir + "/resultats/" + rel);
      const ctx = dir + "/" + rel;
      assert.equal(tag(html, /<title>/g), 1, ctx + " : un seul <title>");
      assert.equal(tag(html, /<meta name="description"/g), 1, ctx + " : une seule description");
      assert.equal(tag(html, /<link rel="canonical"/g), 1, ctx + " : un seul canonical");
      const title = html.match(/<title>([^<]+)<\/title>/)[1];
      const desc = head(html).match(/<meta name="description" content="([^"]*)">/)[1];
      const canonical = head(html).match(/<link rel="canonical" href="([^"]+)">/)[1];
      assert.ok(title.trim().length > 10, ctx + " : titre vide");
      assert.ok(desc.trim().length > 40, ctx + " : description vide");
      assert.ok(!titles.has(title), ctx + " : titre en double (" + title + ")");
      assert.ok(!descriptions.has(desc), ctx + " : description en double");
      titles.add(title); descriptions.add(desc); canonicals.add(canonical);
      const expected = SITE + (rel === "index.html" ? RP.hubPath(dir) : RP.dayPath(dir, rel.replace(".html", "")));
      assert.equal(canonical, expected, ctx + " : canonical non auto-referent");
      assert.equal(head(html).match(/<meta property="og:url" content="([^"]+)">/)[1], expected, ctx + " : og:url");
      for (const t of ['<meta property="og:type"', '<meta property="og:title"', '<meta property="og:description"',
        '<meta property="og:image"', '<meta name="twitter:card"', '<meta name="twitter:title"']) {
        assert.ok(head(html).includes(t), ctx + " : " + t + " manquant");
      }
      assert.match(html, /<html lang="[a-zA-Z-]+">/, ctx + " : lang");
      assert.ok(head(html).includes('<meta name="iashark-market" content="' + C.DIRS[dir].market + '">'), ctx + " : marche");
    }
  }
  assert.equal(titles.size, DIRS.length * (1 + s.days.length), "un titre distinct par page");
  assert.equal(canonicals.size, DIRS.length * (1 + s.days.length));
});

test("hreflang : les 9 versions + x-default, reciproques, vers des pages reellement ecrites", () => {
  const s = build();
  for (const rel of ["index.html"].concat(s.days.map((d) => d + ".html"))) {
    const perDir = {};
    for (const dir of DIRS) perDir[dir] = alternates(s.read(dir + "/resultats/" + rel));
    for (const dir of DIRS) {
      const alts = perDir[dir];
      const codes = alts.map((a) => a.hl);
      for (const d2 of DIRS) assert.ok(codes.includes(C.DIRS[d2].hreflang), dir + "/" + rel + " : hreflang " + C.DIRS[d2].hreflang + " manquant");
      assert.ok(codes.includes("x-default"), dir + "/" + rel + " : x-default manquant");
      assert.equal(new Set(codes).size, codes.length, dir + "/" + rel + " : hreflang en double");
      const self = alts.find((a) => a.hl === C.DIRS[dir].hreflang);
      assert.equal(self.href, SITE + (rel === "index.html" ? RP.hubPath(dir) : RP.dayPath(dir, rel.replace(".html", ""))), dir + " : auto-reference");
      for (const a of alts) {
        const file = a.href.slice(SITE.length + 1).replace(/\/$/, "/index.html");
        assert.ok(fs.existsSync(path.join(s.dir, file)), dir + "/" + rel + " : hreflang vers une page absente (" + a.href + ")");
        // Reciprocite : la cible declare la meme URL pour ce repertoire.
        if (a.hl === "x-default") continue;
        const target = DIRS.find((d2) => C.DIRS[d2].hreflang === a.hl);
        assert.ok(perDir[target].some((b) => b.hl === C.DIRS[dir].hreflang && b.href === self.href),
          a.hl + " ne renvoie pas vers " + self.href);
      }
    }
  }
});

test("aucune donnee premium d'un match non termine, et rien de premium sur un match annule", () => {
  const s = build();
  for (const dir of DIRS) {
    for (const rel of ["index.html"].concat(s.days.map((d) => d + ".html"))) {
      const html = s.read(dir + "/resultats/" + rel);
      const ctx = dir + "/" + rel;
      assert.ok(!html.includes(PENDING.home) && !html.includes(PENDING.away), ctx + " : match non termine publie");
      assert.ok(!html.includes("1.77"), ctx + " : cote d'un match non termine publiee");
      assert.ok(!html.includes("Joueur En Attente"), ctx + " : buteur non regle publie");
      // Le match annule reste visible (transparence) mais sans pari ni cote :
      // on relit SA ligne, pas la page entiere (d'autres matchs reels de la
      // journee portent legitimement le meme marche).
      if (rel !== "index.html" && html.includes(VOID.home)) {
        const start = html.indexOf('<li class="rr void">');
        assert.ok(start !== -1, ctx + " : ligne du match annule introuvable");
        const cell = html.slice(start, html.indexOf("</li>", start));
        assert.ok(cell.includes(VOID.home), ctx + " : mauvaise ligne relue");
        assert.ok(!cell.includes("1.42"), ctx + " : cote d'un match annule publiee");
        assert.ok(!cell.includes('class="rr-m"'), ctx + " : pari d'un match annule publie");
        assert.ok(!/1[.,]42|3[.,]5/.test(cell), ctx + " : pari ou cote d'un match annule publie");
      }
      // Aucune donnee reservee : ni note de confiance, ni probabilite du modele.
      assert.ok(!/data-conf|"conf"|model_probability|PRELOADED_MATCH/.test(html), ctx + " : champ reserve dans la page");
    }
  }
});

test("compte du jour : gagnes sur regles, void et pending exclus, et aucun cumul multi-journees", () => {
  const s = build();
  const days = RP.loadDays({ root: s.dir, limit: 30 });
  assert.equal(days.length, 2, "seules les journees reglees sont publiees");
  const totalWon = days.reduce((n, d) => n + d.counts.won, 0);
  const totalSettled = days.reduce((n, d) => n + d.counts.settled, 0);
  for (const dir of DIRS) {
    const index = s.read(dir + "/resultats/index.html");
    for (const d of days) {
      const count = RP.countLabel(d, dir);
      const page = s.read(dir + "/resultats/" + d.day + ".html");
      assert.ok(page.includes(count), dir + "/" + d.day + " : compte du jour absent (" + count + ")");
      assert.ok(index.includes(count), dir + " : compte de la journee absent de l'index");
      // Le compte ne prend ni les annules ni les non termines.
      assert.equal(d.counts.settled, d.counts.won + d.counts.lost);
      assert.ok(page.includes(String(d.counts.lost)), dir + " : les perdants ne sont pas montres");
    }
    // Decision du proprietaire (20/09/2026) : aucun agregat multi-journees.
    const cumul = C.fill(C.get(C.dictFor(dir), "results_page.day_count"), { won: totalWon, total: totalSettled });
    assert.ok(!index.includes(cumul), dir + " : bilan cumule sur l'index");
    assert.ok(!/\bROI\b|\brendement\b|taux de r[eé]ussite|\bwin ?rate\b|\bprofit\b/i.test(index), dir + " : promesse de gain sur l'index");
  }
});

test("verdicts : bordure + fond + libelle + icone (jamais la couleur seule), source de la cote exacte", () => {
  const s = build();
  const day = RP.loadDays({ root: s.dir, limit: 30 }).find((d) => d.day === s.days[1]);
  const html = s.read("fr/resultats/" + day.day + ".html");
  const t = C.get(C.dictFor("fr"), "results_page");
  assert.match(html, /<li class="rr win">/, "une ligne gagnante");
  assert.match(html, /<li class="rr loss">/, "une ligne perdante");
  assert.ok(html.includes('<span class="vb win"><i aria-hidden="true">✓</i>' + t.verdict_win), "badge gagne");
  assert.ok(html.includes('<span class="vb loss"><i aria-hidden="true">✗</i>' + t.verdict_loss), "badge perdu");
  assert.match(html, /--res-win:#34d399/, "jeton de couleur de la specification");
  assert.match(html, /\.rr\.win\{border-left-color:var\(--res-win\);background:var\(--res-win-bg\)\}/, "bordure + fond teinte");
  // « (Pinnacle) » uniquement quand la cote vient vraiment de Pinnacle.
  const pinnacle = day.matches.filter((m) => m.odds_source === "pinnacle").length;
  assert.equal((html.match(/\(Pinnacle\)/g) || []).length, pinnacle, "source Pinnacle annoncee a tort ou oubliee");
  assert.equal((html.match(/\(cotes moyennes\)/g) || []).length, day.matches.filter((m) => m.cote != null && m.odds_source !== "pinnacle").length);
  assert.ok(html.includes(t.disclaimer), "mention resultats passes");
  for (const dir of DIRS) {
    const other = s.read(dir + "/resultats/" + day.day + ".html");
    assert.ok(other.includes(C.get(C.dictFor(dir), "results_page.disclaimer")), dir + " : mention absente");
  }
});

test("noms d'equipe echappes : aucune balise injectee dans le HTML", () => {
  const s = build();
  for (const dir of DIRS) {
    const html = s.read(dir + "/resultats/" + s.days[1] + ".html");
    assert.ok(!html.includes("<script>alert(1)</script>"), dir + " : script injecte");
    assert.ok(html.includes("Ath&quot;letic &lt;script&gt;alert(1)&lt;/script&gt; &amp; Co"), dir + " : nom d'equipe non echappe");
    assert.ok(html.includes("Buteur &lt;b&gt;Reel&lt;/b&gt;"), dir + " : nom de joueur non echappe");
    // Un seul <script> par bloc JSON-LD + les scripts de fin de page : aucun
    // script inline supplementaire venu des donnees.
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    for (const attrs of scripts) assert.ok(/type="application\/ld\+json"|src="\//.test(attrs), dir + " : script inattendu (" + attrs + ")");
  }
});

test("JSON-LD : BreadcrumbList + ItemList honnete, aucun balisage Review/Rating", () => {
  const s = build();
  for (const dir of DIRS) {
    for (const rel of ["index.html"].concat(s.days.map((d) => d + ".html"))) {
      const html = s.read(dir + "/resultats/" + rel);
      const blocks = ldBlocks(html);
      const ctx = dir + "/" + rel;
      assert.equal(blocks.length, 2, ctx + " : deux blocs JSON-LD attendus");
      assert.equal(blocks[0]["@type"], "BreadcrumbList", ctx);
      assert.ok(blocks[0].itemListElement.length >= 2, ctx + " : fil d'Ariane incomplet");
      assert.equal(blocks[1]["@type"], "CollectionPage", ctx);
      assert.equal(blocks[1].inLanguage, C.DIRS[dir].htmlLang, ctx);
      assert.equal(blocks[1].mainEntity["@type"], "ItemList", ctx);
      assert.equal(blocks[1].mainEntity.numberOfItems, blocks[1].mainEntity.itemListElement.length, ctx);
      assert.ok(!/"@type":"(Review|Rating|AggregateRating|Product|Offer)"/.test(html), ctx + " : balisage faux");
    }
    // ItemList d'une journee = les matchs affiches, dans le meme ordre.
    const day = RP.loadDays({ root: s.dir, limit: 30 })[0];
    const ld = ldBlocks(s.read(dir + "/resultats/" + day.day + ".html"))[1];
    assert.equal(ld.mainEntity.numberOfItems, day.matches.length, dir + " : ItemList decalee de la page");
  }
});

test("pagination semantique : prev/next entre journees publiees, reciproques", () => {
  const s = build();
  const [older, newer] = s.days;
  for (const dir of DIRS) {
    const o = s.read(dir + "/resultats/" + older + ".html");
    const n = s.read(dir + "/resultats/" + newer + ".html");
    assert.ok(!/<link rel="prev"/.test(head(o)), dir + " : la plus ancienne journee n'a pas de precedent");
    assert.ok(head(o).includes('<link rel="next" href="' + SITE + RP.dayPath(dir, newer) + '">'), dir + " : next manquant");
    assert.ok(head(n).includes('<link rel="prev" href="' + SITE + RP.dayPath(dir, older) + '">'), dir + " : prev manquant");
    assert.ok(!/<link rel="next"/.test(head(n)), dir + " : la plus recente journee n'a pas de suivant");
    assert.ok(o.includes('<a rel="next" href="' + RP.dayPath(dir, newer) + '"'), dir + " : lien visible suivant");
    assert.ok(n.includes('<a rel="prev" href="' + RP.dayPath(dir, older) + '"'), dir + " : lien visible precedent");
    // Maillage : chaque page renvoie vers l'index de SA version, l'index vers chaque journee.
    assert.ok(n.includes('href="' + RP.hubPath(dir) + '"'), dir + " : retour a l'index");
    const index = s.read(dir + "/resultats/index.html");
    for (const day of s.days) assert.ok(index.includes('href="' + RP.dayPath(dir, day) + '"'), dir + " : index sans lien vers " + day);
    // Aucun lien vers une autre version (hors hreflang du <head>).
    const body = n.split(/<\/head>/i)[1];
    const foreign = [...body.matchAll(/href="\/([a-z]{2})\/resultats\//g)].map((m) => m[1]).filter((d2) => d2 !== dir);
    assert.deepEqual(foreign, [], dir + " : lien vers les resultats d'une autre version");
  }
});

test("sitemap-resultats.xml : les pages ecrites, lastmod reel, aucune journee vide", () => {
  const s = build();
  assert.equal(s.report.sitemap, "sitemap-resultats.xml");
  const xml = s.read("sitemap-resultats.xml");
  const urls = urlsOf(xml);
  assert.equal(urls.length, DIRS.length * (1 + s.days.length), "une URL par page indexable");
  for (const dir of DIRS) {
    assert.ok(urls.includes(SITE + RP.hubPath(dir)), dir + " : index absent du sitemap");
    for (const day of s.days) assert.ok(urls.includes(SITE + RP.dayPath(dir, day)), dir + "/" + day + " absent du sitemap");
  }
  assert.ok(!xml.includes(EMPTY_DAY), "journee vide dans le sitemap");
  assert.equal(new Set(urls).size, urls.length, "URL en double");
  for (const m of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/);
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/, "hreflang du sitemap");
  assert.equal((xml.match(/<url>/g) || []).length, (xml.match(/<\/url>/g) || []).length);
  // lastmod stable tant que la page ne change pas (registre seo-lastmod.json).
  const again = RP.writeResultsPages({ root: s.dir, limit: 30, today: "2026-09-25", now: new Date("2026-09-25T06:00:00Z") });
  assert.equal(again.sitemap, "sitemap-resultats.xml");
  assert.deepEqual(urlsOf(s.read("sitemap-resultats.xml")).sort(), urls.slice().sort());
  assert.equal(s.read("sitemap-resultats.xml"), xml, "lastmod change sans changement de page");
});

test("sitemaps existants : aucune regression, aucune URL /resultats/ dans les sitemaps par repertoire", () => {
  const LOCALES = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/locales.json"), "utf8"));
  const PAGES = require(path.join(ROOT, "scripts/i18n-manifest.js"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-sitemaps-"));
  try {
    const files = SITEMAPS.generateLocalizedSitemaps(LOCALES, PAGES, TODAY, out);
    assert.equal(files.length, SITEMAPS.sitemapDirs(LOCALES).length, "nombre de sitemaps par repertoire modifie");
    for (const f of files) {
      const xml = fs.readFileSync(path.join(out, f), "utf8");
      assert.ok(!xml.includes("/resultats/"), f + " : page de resultats ajoutee a un sitemap existant");
      assert.ok(xml.includes("<urlset") && xml.includes("</urlset>"), f);
    }
    // Sans page de resultats sur le disque : aucun fichier vide publie.
    assert.equal(SITEMAPS.generateResultsSitemap(TODAY, out, out), null);
    assert.ok(!fs.existsSync(path.join(out, "sitemap-resultats.xml")));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("textes : 9 versions completes dans i18n/seo, 7 locales completes dans i18n/dict, aucune promesse", () => {
  const seoKeys = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/seo/fr.json"), "utf8")).results).sort();
  assert.ok(seoKeys.length >= 12, "section results incomplete");
  for (const dir of DIRS) {
    const r = C.seoConf(dir).results;
    assert.ok(r, dir + " : section results absente de i18n/seo/" + dir + ".json");
    assert.deepEqual(Object.keys(r).sort(), seoKeys, dir + " : cles differentes de fr");
    for (const k of seoKeys) assert.ok(typeof r[k] === "string" && r[k].trim(), dir + "." + k + " vide");
    assert.ok(r.day_title.includes("{date}") && r.day_h1.includes("{date}"), dir + " : titre du jour sans date");
    assert.ok(r.day_description.includes("{count}"), dir + " : description du jour sans le compte du jour");
  }
  const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
  const ref = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/parts/resultats.fr.json"), "utf8")).results_page).sort();
  for (const loc of LOCALES) {
    const part = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/parts/resultats." + loc + ".json"), "utf8")).results_page;
    assert.deepEqual(Object.keys(part).sort(), ref, "i18n/parts/resultats." + loc + ".json : cles differentes de fr");
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/dict/" + loc + ".json"), "utf8")).results_page;
    assert.ok(dict, loc + " : merge-i18n-parts.js non lance");
    for (const k of ref) {
      assert.ok(typeof part[k] === "string" && part[k].trim(), loc + ".results_page." + k + " vide");
      assert.equal(dict[k], part[k], loc + ".results_page." + k + " : dictionnaire desynchronise");
    }
    assert.ok(part.day_count.includes("{won}") && part.day_count.includes("{total}"), loc + " : compte du jour sans variables");
  }
  const banned = /guarantee[ds]? (win|profit)|sure bets?|bet now|garanti[es]* (de )?gain|gains? assur|apuesta segura|apuesta ya|sichere tipps|jetzt wetten|scommetti ora|aposta segura|aposte já|\bROI\b/i;
  for (const dir of DIRS) assert.doesNotMatch(JSON.stringify(C.seoConf(dir).results), banned, dir);
  for (const loc of LOCALES) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "i18n/parts/resultats." + loc + ".json"), "utf8"), banned, loc);
});

test("nettoyage : une journee qui sort de la fenetre perd ses pages et ses URL", () => {
  const s = build();
  const days = RP.loadDays({ root: s.dir, limit: 30 }).filter((d) => d.day === s.days[1]);
  const rep = RP.writeResultsPages({ root: s.dir, days: days, today: TODAY, now: new Date(TODAY + "T06:00:00Z") });
  assert.equal(rep.removed, DIRS.length, "une page par version a retirer");
  for (const dir of DIRS) assert.ok(!fs.existsSync(path.join(s.dir, dir, "resultats", s.days[0] + ".html")), dir);
  assert.ok(!s.read("sitemap-resultats.xml").includes(s.days[0]), "URL perimee encore dans le sitemap");
  fs.rmSync(s.dir, { recursive: true, force: true });
  site = null;
});

// Regle produit (proprietaire, 20/09/2026) : le site ne publie QUE la journee
// de la veille. Pas d'historique jour par jour, pas d'archive consultable.
test("par defaut : une seule journee publiee, celle de la veille", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-resultats-veille-"));
  fs.mkdirSync(path.join(dir, "results"), { recursive: true });
  for (const d of fixtureDays()) fs.writeFileSync(path.join(dir, "results", d.day + ".json"), JSON.stringify(d));
  assert.equal(RP.loadDays({ root: dir }).length, 1, "plus d'une journee publiee par defaut");
  const report = RP.writeResultsPages({ root: dir, today: TODAY, now: new Date(TODAY + "T06:00:00Z") });
  assert.equal(report.days, 1);
  const pages = fs.readdirSync(path.join(dir, "fr", "resultats")).filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f));
  assert.equal(pages.length, 1, "fr/resultats : " + pages.join(", "));
  fs.rmSync(dir, { recursive: true, force: true });
});
