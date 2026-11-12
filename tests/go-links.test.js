"use strict";
// Liens d'affiliation /go/<site>/<source> (09/11/2026) : netlify/edge-functions/lib/go-links.mjs.
const test = require("node:test");
const assert = require("node:assert");

test("go : 1win par source, source inconnue = site, site inconnu = accueil", async () => {
  const { resolveGo, goResponse, GO_LINKS } = await import("../netlify/edge-functions/lib/go-links.mjs");
  assert.strictEqual(resolveGo("/go/1win/site").location, GO_LINKS["1win"].site);
  assert.strictEqual(resolveGo("/go/1win/x").location, GO_LINKS["1win"].x);
  assert.strictEqual(resolveGo("/go/1win/telegram").location, GO_LINKS["1win"].telegram);
  assert.strictEqual(resolveGo("/go/1win").location, GO_LINKS["1win"].site);
  assert.strictEqual(resolveGo("/go/1WIN/inconnu").location, GO_LINKS["1win"].site);
  assert.strictEqual(resolveGo("/go/autre/site").location, "/");
  assert.strictEqual(resolveGo("/go/__proto__/site").location, "/");
  const r = goResponse("/go/1win/x");
  assert.strictEqual(r.status, 302);
  assert.match(r.headers["Cache-Control"], /no-store/);
  // 1win retire le 10/11 : ses anciens liens menent chez Lolly Bet (11/11).
  for (const s of ["site", "x", "telegram"]) assert.strictEqual(GO_LINKS["1win"][s], GO_LINKS.lolly[s]);
});

test("go : Vavada (10/11) pour le site, X et Telegram", async () => {
  const { resolveGo, GO_LINKS } = await import("../netlify/edge-functions/lib/go-links.mjs");
  for (const s of ["site", "x", "telegram"]) {
    assert.strictEqual(resolveGo("/go/vavada/" + s).location, GO_LINKS.vavada[s]);
    assert.match(GO_LINKS.vavada[s], /^https:\/\/standarttrack\.com\/\?promo=[0-9a-f-]{36}&target=register$/);
  }
});

test("go : Lolly Bet (11/11), une campagne par source", async () => {
  const { resolveGo } = await import("../netlify/edge-functions/lib/go-links.mjs");
  for (const s of ["site", "x", "telegram"]) {
    assert.strictEqual(resolveGo("/go/lolly/" + s).location, "https://www.lolly-bet888.com?faff=1258&sub=" + s);
  }
  assert.strictEqual(resolveGo("/go/lolly").location, "https://www.lolly-bet888.com?faff=1258&sub=site");
});

test("go : declaree dans netlify.toml", () => {
  const toml = require("fs").readFileSync(require("path").join(__dirname, "..", "netlify.toml"), "utf8");
  assert.match(toml, /path = "\/go\/\*"\s*\n\s*function = "go"/);
});

test("page match : bouton 1win sous l'Avis, pour tous les pays, clic suivi", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "match-page.js"), "utf8");
  assert.match(src, /querySelectorAll\('.signal-card.avis'\)/);
  assert.match(src, /href="\/go\/\$\{bk\}\/site"/);
  assert.match(src, /rel="sponsored noopener"/);
  assert.doesNotMatch(src, /BK_PAYS_FERMES/);
  assert.match(src, /remplirBoutonsParieur\(root,vm\._raw\)/);
  const ft = require("fs").readFileSync(require("path").join(__dirname, "..", "funnel-track.js"), "utf8");
  assert.match(ft, /bookmaker_1win: true/);
  assert.match(ft, /bookmaker_vavada: true, bookmaker_vavada_mur: true, bookmaker_vavada_direct: true/);
  assert.match(ft, /bookmaker_lolly: true, bookmaker_lolly_mur: true, bookmaker_lolly_direct: true/);
  assert.match(src, /const BK_ACTIF='lolly';/);
  // Logo officiel du site de paris dans le bouton quand on l'a (fichier publie avec assets/), sinon le nom.
  assert.match(src, /src="\/assets\/bk\/\$\{L\.f\}"/);
  assert.match(src, /'lolly':\{f:'lolly\.svg'/);
  assert.ok(require("fs").existsSync(require("path").join(__dirname, "..", "assets", "bk", "lolly.svg")));
  assert.match(src, /bk-cta-nom/);
  assert.ok(require("fs").existsSync(require("path").join(__dirname, "..", "assets", "bk", "1win.png")));
});

test("page match : bouton 1win aussi sur les matchs fermes et en direct, rien apres le match", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "match-page.js"), "utf8");
  const mur = src.slice(src.indexOf("function renderProWall(raw,ctx)"), src.indexOf("function renderAuthWall"));
  // 12/11/2026 (Clement) : plus de bouton bookmaker sous le cadenas ; le Pro offert (Lolly Bet, partenaire) passe en premier.
  assert.ok(mur.indexOf("boutonParieurHtml(") === -1);
  assert.ok(mur.indexOf("['prooffert',") < mur.indexOf("['offre',"));
  assert.match(src, /remplirBoutonsParieur\(root,vm\._raw\)/);
  assert.match(src, /if\(moment==='fini'\)return;/);
  const ft = require("fs").readFileSync(require("path").join(__dirname, "..", "funnel-track.js"), "utf8");
  assert.match(ft, /bookmaker_1win_mur: true, bookmaker_1win_direct: true/);
  for (const l of ["fr", "en", "de", "it", "es", "es-mx", "pt"]) {
    const d = require("../i18n/dict/" + l + ".json").match_page;
    assert.match(d.bk_cta_live, /\{match\}.*\{book\}|\{book\}.*\{match\}/, l + " bk_cta_live");
    assert.match(d.bk_cta_mur, /\{book\}/, l + " bk_cta_mur");
    assert.doesNotMatch(d.bk_cta_mur, /\{match\}/, l + " bk_cta_mur sans match (une ligne)");
  }
});

test("page match : moment du bouton (avant, direct, fini)", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "match-page.js"), "utf8");
  const bloc = src.slice(src.indexOf("var STATUTS_FINIS"), src.indexOf("function matchTermine")) +
    src.slice(src.indexOf("function matchTermine"), src.indexOf("// Lien vers la page Methodologie") > src.indexOf("function matchTermine") ? src.indexOf("// Lien vers la page Methodologie") : src.indexOf("const BK_NOMS")) +
    src.slice(src.indexOf("function momentParieur"), src.indexOf("function boutonParieurHtml"));
  const now = Date.now();
  const fn = new Function("window", "Date", bloc + ";return momentParieur;");
  const MT = { matchTimestamp: m => m.ts };
  const D = { now: () => now };
  const moment = fn({ IasharkMatchTime: MT }, D);
  assert.strictEqual(moment({ ts: now + 3600e3, status: "NS" }), "avant");
  assert.strictEqual(moment({ ts: now - 1800e3, status: "1H" }), "direct");
  assert.strictEqual(moment({ ts: now - 1800e3, status: "PST" }), "avant");
  assert.strictEqual(moment({ ts: now - 1800e3, status: "FT" }), "fini");
  assert.strictEqual(moment({ ts: now - 5 * 3600e3, status: "" }), "fini");
  assert.strictEqual(moment({ ts: Infinity }), "avant");
});

test("page match : bloc partenaire sous le pari (12/11/2026) : un cadre, la banniere cliquable en francais, une phrase d'appel douce, Pro offert hors abonnes", () => {
  const fs = require("fs"), path = require("path");
  const ROOT = path.join(__dirname, "..");
  const src = fs.readFileSync(path.join(ROOT, "match-page.js"), "utf8");
  const bloc = src.slice(src.indexOf("const BK_NOMS="), src.indexOf("// « Pro offert 1 mois » (11/11/2026, decision de Clement)"));
  const dict = (l) => require("../i18n/dict/" + l + ".json");
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // La vraie fonction de la page, avec les textes de la langue demandee.
  const rendu = (langue) => {
    const d = dict(langue);
    const t = (k, fb) => k.split(".").reduce((o, x) => (o ? o[x] : undefined), d) || fb;
    const tf = (k, fb, v) => String(t(k, fb)).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m));
    return new Function("esc", "t", "tf", "suivi", "lien", "estFr", "matchTermine", "STATUTS_BLOQUANTS", bloc + "; return boutonParieurHtml;")(
      esc, t, tf, (k) => ' data-track="' + k + '" data-track-kind="' + k + '"', (p) => "/" + (langue === "fr" ? "fr" : "en") + "/" + p, () => langue === "fr", () => false, []);
  };
  const fr = rendu("fr");
  const gratuit = fr("Lens – Lille", "avant", false);
  // Un seul cadre, dans l'ordre : partenaire et 18+, banniere, phrase d'appel, Pro offert.
  assert.match(gratuit, /^<div class="bk-cta bk-offre po-carte"/);
  const ordre = ['class="bk-offre-tete"', "notre partenaire", ">18+<", 'class="bk-offre-img" href="/go/lolly/site"', 'src="/assets/bk/lolly-bienvenue-fr.webp"', 'class="bk-offre-btn bk-offre-btn--doux" href="/go/lolly/site"', "Parier ce match chez Lolly Bet", 'href="/fr/lolly.html#pro-offert"', "1 mois de Pro offert à l’inscription"];
  let avant = -1;
  for (const r of ordre) { const i = gratuit.indexOf(r); assert.ok(i > avant, "ordre ou partie manquante : " + r); avant = i; }
  // La banniere : cliquable avec notre lien, mesuree, sans saut de mise en page ; l'offre n'est plus ecrite en gros.
  assert.match(gratuit, /<a class="bk-offre-img" href="\/go\/lolly\/site" target="_blank" rel="sponsored noopener" data-track="bookmaker_lolly_banniere"/);
  assert.match(gratuit, /alt="Lolly Bet : 1er pari remboursé jusqu’à 100 €" width="1428" height="428" loading="lazy"/);
  assert.doesNotMatch(gratuit, /po-titre|class="po-btn/, "avec la banniere : ni titre en gros ni aplat cyan");
  assert.equal((gratuit.match(/bk-offre-btn/g) || []).length, 2, "une seule phrase d'appel (bk-offre-btn + sa variante douce)");
  assert.match(gratuit, /data-track="bookmaker_lolly"/);
  assert.match(gratuit, /data-track="lolly_pro_offert_avis"/);
  assert.match(gratuit, /<img class="po-logo" src="\/assets\/bk\/lolly\.svg" alt="Lolly Bet"/);
  assert.ok(fs.existsSync(path.join(ROOT, "assets/bk/lolly-bienvenue-fr.webp")));
  // Abonne Pro : pas de « Pro offert ». En direct : la phrase le dit, et le clic est suivi a part.
  const pro = fr("Lens – Lille", "avant", true);
  assert.doesNotMatch(pro, /pro-offert|bk-offre-pro/);
  assert.match(pro, /bk-offre-img/);
  const direct = fr("Lens – Lille", "direct", true);
  assert.match(direct, /Parier en direct chez Lolly Bet/);
  assert.match(direct, /data-track="bookmaker_lolly_direct"/);
  // Autre langue : pas de banniere (son texte est en francais), le bouton reste (jamais cache selon le pays).
  const en = rendu("en")("Lens – Lille", "avant", false);
  assert.doesNotMatch(en, /bk-offre-img|lolly-bienvenue|refunded|remboursé/);
  assert.match(en, /<a class="po-btn bk-offre-btn" href="\/go\/lolly\/site"/);
  assert.match(en, /Bet on this match at Lolly Bet/);
  assert.match(en, /our partner/);
  assert.match(en, /href="\/en\/lolly\.html#pro-offert"/);
  // Aucune phrase sur « la meilleure cote » (aucune cote du partenaire n'est relevee), aucune urgence.
  assert.doesNotMatch(bloc, /bk_cta_mur/);
  for (const h of [gratuit, pro, direct, en]) {
    assert.doesNotMatch(h, /100 € offerts|meilleure cote|best odds|gagn|garanti|sans risque|plus que|expire|dépos/i);
    assert.doesNotMatch(h, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  }
  // Abonne Pro connu avant le rendu ; clics suivis ; textes dans les 7 langues ; style sans majuscules espacees.
  assert.match(src, /visiteurPro=!!ctx\.isPro;/);
  assert.match(src, /boutonParieurHtml\(m,moment,visiteurPro\)/);
  const ft = fs.readFileSync(path.join(ROOT, "funnel-track.js"), "utf8");
  for (const k of ["bookmaker_lolly_banniere", "lolly_pro_offert_avis"]) assert.match(ft, new RegExp(k + ": true"));
  for (const l of ["fr", "en", "de", "it", "es", "es-mx", "pt"]) {
    const d = dict(l).match_page, part = require("../i18n/parts/lolly." + l + ".json").match_page;
    for (const k of ["bk_partner", "bk_offer", "bk_btn", "bk_btn_live", "bk_pro_link"]) {
      assert.ok(typeof d[k] === "string" && d[k].trim(), l + " match_page." + k);
      assert.equal(part[k], d[k], l + " match_page." + k);
    }
    assert.match(d.bk_btn, /\{book\}/, l);
    assert.match(d.bk_btn_live, /\{book\}/, l);
  }
  assert.equal(dict("fr").match_page.bk_offer, "1er pari remboursé jusqu’à 100 €");
  const css = fs.readFileSync(path.join(ROOT, "assets/match-page.css"), "utf8");
  const regles = css.split("\n").filter((x) => /^\.bk-offre/.test(x)).join("\n");
  assert.match(regles, /\.bk-offre-img\{[^}]*aspect-ratio:1428\/428/);
  assert.doesNotMatch(regles, /uppercase|monospace|#(22c55e|ef4444)/i);
});
