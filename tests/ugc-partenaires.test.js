"use strict";
// Defile de videos UGC, avis Pro et pages partenaires (03/10/2026).
// - bandeau absent si la liste est vide ; mention « Image virtuelle » sur chaque
//   video IA, « Collaboration commerciale » sur chaque video d'affilie ; une video
//   sans type connu n'est jamais publiee ;
// - badge « note + avatars » seulement avec >= 20 vrais avis, chiffres arrondis vers le bas ;
// - pages formation/kit reservees aux affilies valides (public.affiliates.status = 'approved') ;
// - traductions completes dans les 7 langues.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const UGC = require("../assets/ugc-reel.js");
const BUILD = require("../scripts/build-ugc-videos.js");
const ACCES = require("../lib/affilie-acces.js");
const AVIS = require("../assets/avis-pro.js");
const PARTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/parts/ugc." + l + ".json"))]));
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));

const VIDEO = { id: "essai-1", src: "/assets/ugc/essai-1.mp4", poster: "/assets/ugc/essai-1.jpg", langue: "fr", auteur: "IASHARK", type: "image virtuelle" };

test("config vide = aucune video publiee, et le bandeau est cache par defaut dans les pages", () => {
  const cfg = JSON.parse(read("config/ugc-videos.json"));
  assert.deepEqual(BUILD.construire(cfg).videos, []);
  assert.deepEqual(UGC.pourPage([], "fr", "fr"), []);
  const pub = JSON.parse(read("assets/ugc-videos.json"));
  assert.deepEqual(pub.videos, BUILD.construire(cfg).videos, "assets/ugc-videos.json a jour (node scripts/build-ugc-videos.js)");
  for (const p of ["index.html", "fr/index.html", "en/index.html", "mx/index.html", "fr/leagues/ligue-1.html"]) {
    const html = read(p);
    assert.match(html, /<section data-ugc-reel hidden><\/section>/, p + " : emplacement cache par defaut");
    assert.match(html, /src="\/assets\/ugc-reel\.js"/, p);
  }
  // Le script ne montre le bandeau que s'il reste des videos pour la page.
  const js = read("assets/ugc-reel.js");
  assert.match(js, /if \(!videos\.length\) \{ el\.hidden = true; return; \}/);
});

test("types : « image virtuelle » et « affilié » reconnus, tout autre type refuse a la publication", () => {
  assert.equal(UGC.normaliserType("Image virtuelle"), "image_virtuelle");
  assert.equal(UGC.normaliserType("image_virtuelle"), "image_virtuelle");
  assert.equal(UGC.normaliserType("affilié"), "affilie");
  assert.equal(UGC.normaliserType("Affilie"), "affilie");
  for (const t of ["", "client", "temoignage", null, "ugc"]) assert.equal(UGC.normaliserType(t), null, String(t));
  const r = BUILD.construire({ videos: [Object.assign({}, VIDEO, { type: "temoignage" })] });
  assert.equal(r.videos.length, 0);
  assert.equal(r.erreurs.length, 1);
  assert.throws(() => { const v = UGC.valider(Object.assign({}, VIDEO, { src: "https://exemple.com/x.mp4" })); if (v.erreur) throw new Error(v.erreur); });
  assert.ok(UGC.valider(Object.assign({}, VIDEO, { src: "https://ksvjraqitxouwiabecai.supabase.co/storage/v1/object/public/ugc/a.mp4" })).video);
  assert.ok(UGC.valider(Object.assign({}, VIDEO, { type: "affilié", auteur: "IASHARK" })).erreur, "une video d'affilie porte le pseudo de l'affilie");
});

test("chaque video IA porte « Image virtuelle », chaque video d'affilie « Collaboration commerciale », dans les 7 langues", () => {
  for (const l of LOCALES) {
    const d = DICTS[l];
    const v = UGC.texteBadge("image virtuelle", l, d), a = UGC.texteBadge("affilié", l, d);
    assert.ok(v && v.length > 5, l);
    assert.equal(v, d.ugc_reel.badge_virtual, l);
    assert.equal(a, d.ugc_reel.badge_affiliate, l);
    // Repli sans dictionnaire : la mention ne manque jamais, et c'est la meme.
    assert.equal(UGC.texteBadge("image virtuelle", l, null), v, l + " repli");
    assert.equal(UGC.texteBadge("affilie", l, null), a, l + " repli");
  }
  assert.equal(DICTS.fr.ugc_reel.badge_virtual, "Image virtuelle");
  assert.equal(DICTS.fr.ugc_reel.badge_affiliate, "Collaboration commerciale");
  assert.equal(UGC.texteBadge("inconnu", "fr", DICTS.fr), null);
  // Le badge est dans chaque carte, copies du defile comprises.
  const js = read("assets/ugc-reel.js");
  assert.match(js, /'<span class="ugc-badge">' \+ esc\(badge\) \+ '<\/span>'/);
});

test("filtre langue et pays", () => {
  const l = [
    { id: "a", type: "image_virtuelle", langue: "fr", pays: [] },
    { id: "b", type: "affilie", langue: "es", pays: [] },
    { id: "c", type: "affilie", langue: "es-mx", pays: ["mx"] },
    { id: "d", type: "image_virtuelle", langue: "en", pays: ["gb"] },
    { id: "e", type: "inconnu", langue: "fr", pays: [] }
  ];
  const ids = (loc, m) => UGC.pourPage(l, loc, m).map((v) => v.id).join(",");
  assert.equal(ids("fr", "fr"), "a");
  assert.equal(ids("es", "fr"), "b");
  assert.equal(ids("es-mx", "mx"), "b,c");
  assert.equal(ids("en", "us"), "");
  assert.equal(ids("en", "gb"), "d");
});

test("videos muettes, defile sans fin, pas de defilement automatique si moins d'animations", () => {
  const js = read("assets/ugc-reel.js");
  assert.match(js, /muted playsinline loop preload="none"/);
  assert.doesNotMatch(js, /muted = false|\.muted = !|ugc-sound/, "jamais de son");
  assert.match(js, /if \(reduit \|\| typeof global\.requestAnimationFrame !== 'function'\) return;/);
  assert.match(js, /setAttribute\('src', v\.getAttribute\('data-src'\)\)/, "src donnee seulement a une carte visible");
  assert.ok(UGC.copiesNecessaires(300, 375) >= 2);
  assert.ok(UGC.copiesNecessaires(300, 375) * 300 >= 2 * 375);
  assert.equal(UGC.copiesNecessaires(0, 375), 2);
});

test("badge d'avis : rien sous 20 vrais avis, moyenne et inscrits arrondis vers le bas", () => {
  assert.equal(UGC.badgeAvis({ visible: false }), null);
  assert.equal(UGC.badgeAvis({ visible: true, avis: 19, moyenne: 5, inscrits: 400 }), null);
  assert.equal(UGC.badgeAvis({ visible: true, avis: 25, moyenne: 6, inscrits: 400 }), null);
  const b = UGC.badgeAvis({ visible: true, avis: 23, moyenne: 4.49, inscrits: 47 });
  assert.equal(b.moyenne, 4.4);
  assert.deepEqual(b.inscrits, { cle: "members_more_than", n: 40 });
  const cas = { 20: 10, 40: 30, 41: 40, 100: 90, 101: 100, 199: 100, 1001: 1000 };
  for (const n of Object.keys(cas)) {
    const x = UGC.libelleInscrits(Number(n));
    assert.equal(x.n, cas[n], n);
    assert.ok(x.n < Number(n), "« plus de » toujours vrai pour " + n);
  }
  assert.equal(UGC.libelleInscrits(199).cle, "members_more_than");
  assert.equal(UGC.libelleInscrits(200).cle, "members_hundreds");
  assert.equal(UGC.libelleInscrits(1000).cle, "members_hundreds");
  assert.equal(UGC.libelleInscrits(2000).cle, "members_thousands");
  const sql = read("supabase/migrations/0052_avis_pro.sql");
  assert.match(sql, /when a\.n >= 20 then/);
  assert.match(sql, /floor\(a\.m \* 10\) \/ 10/);
  assert.match(sql, /s\.status = 'active'\s+and s\.created_at <= now\(\) - interval '7 days'/);
  assert.match(sql, /revoke insert, update, delete on public\.avis_pro from anon, authenticated/);
});

test("demande d'avis Pro : seulement abonne Pro eligible (serveur), pas deja repondu, « plus tard » 7 jours", () => {
  const ctx = { session: {}, isPro: true };
  const maintenant = Date.parse("2026-10-10T12:00:00Z");
  assert.equal(AVIS.aMontrer(ctx, { eligible: true, avis: null }, null, maintenant), true);
  assert.equal(AVIS.aMontrer(ctx, { eligible: false, avis: null }, null, maintenant), false);
  assert.equal(AVIS.aMontrer(ctx, { eligible: true, avis: { note: 4 } }, null, maintenant), false);
  assert.equal(AVIS.aMontrer({ session: {}, isPro: false }, { eligible: true }, null, maintenant), false);
  assert.equal(AVIS.aMontrer(null, { eligible: true }, null, maintenant), false);
  assert.equal(AVIS.aMontrer(ctx, { eligible: true }, String(maintenant - 2 * 864e5), maintenant), false);
  assert.equal(AVIS.aMontrer(ctx, { eligible: true }, String(maintenant - 8 * 864e5), maintenant), true);
  assert.match(read("pro.html"), /<div data-avis-pro hidden><\/div>/);
  assert.match(read("pro.html"), /src="\/assets\/avis-pro\.js"/);
});

test("pages partenaires : acces ferme par defaut, ouvert au seul affilie valide (ou admin)", async () => {
  assert.equal(ACCES.CONTRAT.table, "affiliates");
  assert.equal(ACCES.decider(null).ok, false);
  assert.equal(ACCES.decider({ session: null }).raison, "non_connecte");
  const ctx = { session: {}, user: { id: "u1" } };
  assert.equal(ACCES.decider(ctx, null, null).raison, "non_affilie");
  for (const s of ["pending", "refused", "suspended", "", null]) assert.equal(ACCES.decider(ctx, { status: s }, null).ok, false, String(s));
  assert.equal(ACCES.decider(ctx, { status: "approved" }, null).ok, true);
  assert.equal(ACCES.decider(ctx, { status: "approved" }, { message: "x" }).ok, false, "erreur = refus");
  assert.equal(ACCES.decider(Object.assign({ isAdmin: true }, ctx), null, null).ok, true);

  const appli = (ctx2, ligne, erreur) => ({
    context: async () => ctx2,
    supabase: { from: (table) => ({ select: () => ({ eq: (col, val) => ({ maybeSingle: async () => {
      assert.equal(table, "affiliates"); assert.equal(col, "user_id"); assert.equal(val, "u1");
      return { data: ligne, error: erreur || null };
    } }) }) }) }
  });
  assert.equal((await ACCES.verifier(appli({ session: null }))).ok, false);
  assert.equal((await ACCES.verifier(appli(ctx, { status: "pending" }))).ok, false);
  assert.equal((await ACCES.verifier(appli(ctx, { status: "approved" }))).ok, true);
  assert.equal((await ACCES.verifier(appli(ctx, null, { message: "rls" }))).ok, false);
  assert.equal((await ACCES.verifier({ context: async () => { throw new Error("x"); } })).ok, false);
  assert.equal((await ACCES.verifier(undefined)).ok, false);

  for (const dir of ["", "fr/", "en/", "es/", "gb/", "mx/", "za/"]) {
    for (const page of ["partenaires-formation.html", "partenaires-kit.html"]) {
      const html = read(dir + page);
      assert.match(html, /<meta name="robots" content="noindex,nofollow">/, dir + page);
      const iAcces = html.indexOf('src="/lib/affilie-acces.js"'), iPage = html.indexOf('src="/partenaires-pages.js"');
      assert.ok(iAcces > 0 && iPage > iAcces, dir + page + " : controle d'acces charge avant la page");
      // Aucun contenu de formation dans le HTML : tout attend la verification.
      assert.doesNotMatch(html, /Choisis ton angle|Accroches prêtes/, dir + page);
    }
  }
  const js = read("partenaires-pages.js");
  assert.match(js, /if \(!res\[1\] \|\| !res\[1\]\.ok\) return refuser\(\);/);
  assert.match(js, /\}\)\.catch\(refuser\);/);
  for (const sm of fs.readdirSync(ROOT).filter((f) => /^sitemap.*\.xml$/.test(f))) {
    assert.doesNotMatch(read(sm), /partenaires-(formation|kit)/, sm);
  }
});

test("traductions completes : memes cles et memes listes dans les 7 langues, fusionnees dans les dictionnaires", () => {
  function forme(v) {
    if (Array.isArray(v)) return v.map(forme);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, forme(v[k])]));
    return typeof v;
  }
  function vides(v, p, out) {
    if (typeof v === "string") { if (!v.trim()) out.push(p); return out; }
    if (v && typeof v === "object") Object.keys(v).forEach((k) => vides(v[k], p + "." + k, out));
    return out;
  }
  const ref = forme(PARTS.fr);
  for (const l of LOCALES) {
    assert.deepEqual(forme(PARTS[l]), ref, l + " : structure identique au francais");
    assert.deepEqual(vides(PARTS[l], l, []), [], l + " : aucun texte vide");
    for (const ns of ["ugc_reel", "partenaires_pages", "avis_pro"]) assert.deepEqual(DICTS[l][ns], PARTS[l][ns], l + " " + ns + " fusionne");
    assert.equal(PARTS[l].partenaires_pages.formation.modules.length, 6, l);
  }
});

test("textes : aucune promesse de gain, aucune mise, regles presentes", () => {
  const fr = JSON.stringify(PARTS.fr);
  assert.doesNotMatch(fr, /gain garanti|gagner de l.argent|mise conseill|unité|capital|bankroll/i);
  assert.doesNotMatch(fr, /4,5\/5|des milliers d.inscrits/i);
  const regles = PARTS.fr.partenaires_pages.kit.rules.join(" ");
  for (const m of ["Collaboration commerciale", "18+", "Aucune promesse de gain", "faux témoignage", "Image virtuelle"]) assert.ok(regles.includes(m), m);
});
