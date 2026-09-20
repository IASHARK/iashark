"use strict";
// Onglet « Hier » de l'accueil (home-list.js, docs/SPEC_RESULTATS_HIER.md,
// decision du proprietaire du 20/09/2026). Rendu teste en Node, sans navigateur :
//   - la preuve ne vient QUE du flux de resultats (matchs termines et regles) ;
//   - aucun champ payant d'un match n'est lu pour produire un verdict ;
//   - void et pending sortent du compte du bandeau ;
//   - la source de la cote est dite telle qu'elle est ;
//   - le verdict n'est jamais porte par la couleur seule ;
//   - les onglets glissent d'un jour a minuit (heure du visiteur).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const HL = require("../home-list.js");
const MT = require("../lib/match-time.js");
const PREMIUM = require("../lib/premium-fields.js");

function helpers(extra) {
  return Object.assign(HL.defaultHelpers(), {
    heure: (m) => MT.formatTime(m, "fr-FR", { timeZone: "Europe/Paris" }),
    matchDay: (m) => MT.matchDay(m, "Europe/Paris"),
    matchTimestamp: (m) => MT.matchTimestamp(m),
    leagueName: (m) => m.league || m.league_key,
    lien: (p) => "/gb/" + p,
  }, extra || {});
}
// Entree du flux telle que le lot R1 l'ecrit (results/<jour>.json).
const entry = (extra) => Object.assign({
  id: 1575507, home: "Nacional", away: "Famalicão", league: "Primeira Liga", league_key: "primeira",
  kickoff: "2026-09-19 21:30", score: "2-1", pick: "Plus de 1.5 buts", market_id: "over15",
  cote: 1.32, odds_source: "pinnacle", result: "win", href: "/match/nacional-famalicao-1575507.html",
}, extra || {});
const file = (list) => ({ day: "2026-09-19", matches: list });
const strip = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ");

const ctxBase = (extra) => Object.assign({
  isPro: false, freeMatchId: null, simulations: 5000, nowTs: Date.parse("2026-09-20T06:00:00Z"),
  favorites: { has: () => false, list: () => [] }, favMatches: { has: () => false, list: () => [] },
  collapsed: {}, lockedHref: "match", upsellAfter: 3, results: null,
}, extra || {});
const withResults = (list, extra) => {
  const map = {};
  list.forEach((e) => { map[e.id] = e; });
  return ctxBase(Object.assign({ results: map }, extra || {}));
};

// Demande du proprietaire (20/09/2026) : « la page d'hier doit etre structuree
// exactement pareil que pour aujourd'hui et demain, juste la il y a la couleur
// qui change et le resultat ». L'onglet Hier passe donc par renderDayBody.
test("onglet Hier : exactement la structure d'Aujourd'hui (competitions, en-tetes, etoiles, lignes)", () => {
  const H = helpers();
  const list = HL.cleanResults(file([entry(), entry({ id: 2, league: "La Liga", league_key: "laliga", home: "Alavés", away: "Valencia", kickoff: "2026-09-19 18:00", score: "0-1", pick: "Moins de 2.5 buts", cote: 1.9, odds_source: "moyenne", result: "loss", href: null })]));
  const ctx = withResults(list, { favMatches: { has: () => false, list: () => [] } });
  const html = HL.renderResultsDay(list, ctx, H);
  // Le corps est celui de la liste habituelle, rendu par le meme code.
  assert.equal(html.indexOf(HL.renderDayBody(list.map(HL.resultAsMatch), ctx, H)) > 0, true, "l'onglet Hier n'utilise pas le rendu commun");
  assert.match(html, /<div class="hl-leagues">/);
  assert.match(html, /<section class="hl-league" data-league="laliga">[\s\S]*<div class="hl-league-head">/);
  assert.match(html, /<button type="button" class="hl-league-toggle"/);
  assert.match(html, /<button type="button" class="hl-star"/, "etoile de competition absente");
  assert.match(html, /<ul class="hl-rows">/);
  assert.match(html, /class="hl-mstar" data-hl-mfav="1575507"/, "etoile de match absente");
  // Ligne : la grille commune, plus la couleur et le resultat.
  assert.match(html, /class="hl-row hl-grid is-result hl-rrow is-win cd-finished"/);
  assert.match(html, /class="hl-row hl-grid is-result hl-rrow is-loss cd-finished"/);
  assert.match(html, /<span class="hl-tname">Nacional<\/span><b class="hl-rscore">2<\/b>/);
  assert.match(html, /<span class="hl-tname">Famalicão<\/span><b class="hl-rscore">1<\/b>/);
  assert.match(html, /<span class="hl-kick">21:30<\/span>/);
  assert.match(html, /<span class="hl-rpick">Plus de 1\.5 buts<\/span>/);
  assert.match(html, /<span class="hl-rodds">1,32 <small>\(Pinnacle\)<\/small><\/span>/);
  assert.match(html, /hl-tag-time is-finished"[^>]*>Terminé</);
  // Lien : celui du flux quand il existe, sinon la regle habituelle du site.
  assert.match(html, /href="\/match\/nacional-famalicao-1575507\.html"/);
  assert.match(html, /href="\/gb\/match\.html\?id=2"/);
  assert.doesNotMatch(html, /href="null"|href=""/);
  // Aucune vue separee : pas de liste ni de ligne specifiques a Hier.
  assert.doesNotMatch(html, /hl-rlist|hl-tag-league/, "mise en page specifique a l'onglet Hier");
  // Un match regle n'est plus verrouille : ni cadenas, ni rappel Pro.
  assert.doesNotMatch(html, /is-locked|hl-lockpill|hl-upsell/);
  // Verdict : jamais la couleur seule (WCAG 1.4.1). Libelle texte ET icone
  // dans le badge, bordure + fond teinte portes par la classe de la ligne.
  const badge = html.match(/<span class="hl-verdict is-win">[\s\S]*?<\/span><\/span>/)[0];
  assert.match(badge, /<svg class="hl-v-ico"/, "icone du verdict absente");
  assert.match(badge, /<span class="hl-verdict-t">Gagné<\/span>/);
  assert.match(html, /<span class="hl-verdict-t">Perdu<\/span>/, "les pertes sont publiees comme les gains");
  const css = fs.readFileSync(path.join(root, "assets/home-list.css"), "utf8");
  assert.match(css, /\.hl-rrow\.is-win\{box-shadow:inset 3px 0 0 var\(--hl-win\);background:var\(--hl-win-wash\)/);
  assert.match(css, /\.hl-rrow\.is-loss\{box-shadow:inset 3px 0 0 var\(--hl-loss\);background:var\(--hl-loss-wash\)/);
  assert.match(css, /--hl-win:#34d399;--hl-win-wash:rgba\(52,211,153,\.10\)/);
  assert.match(css, /--hl-loss:#fb8a8a;--hl-loss-wash:rgba\(251,138,138,\.10\)/);
});

test("onglet Hier : une ligne d'hier = la ligne du jour + le verdict, rien d'autre", () => {
  const H = helpers();
  const e = HL.cleanResult(entry({ href: null }));
  const hier = HL.renderMatchRow(HL.resultAsMatch(e), ctxBase(), H, 0);
  // Le meme match, mais du cote « aujourd'hui » : ligne ordinaire, sans flux.
  const jour = { id: e.id, league: e.league, league_key: e.league_key, home: { n: e.home }, away: { n: e.away }, date: e.kickoff, status: "FT", has_signal: true };
  const aujourdhui = HL.renderMatchRow(jour, ctxBase(), H, 0);
  // Meme squelette : seuls la classe de la ligne, le score, la zone de droite
  // et l'aria changent. Tout le reste (heure, equipes, puces, etoile) est
  // rendu par le meme code, donc identique au caractere pres.
  const squelette = (html) => html
    .replace(/<span class="hl-zone[\s\S]*?<\/a>/, "</a>")
    .replace(/<b class="hl-rscore">\d+<\/b>/g, "")
    .replace(/ aria-label="[^"]*"/, "")
    .replace(/ data-track="[^"]*" data-track-kind="[^"]*"/, "")
    .replace(/class="hl-row hl-grid [^"]*"/, "");
  assert.equal(squelette(hier), squelette(aujourdhui), "la ligne d'hier n'a pas la meme structure que celle du jour");
  assert.match(hier, /class="hl-row hl-grid is-result hl-rrow is-win cd-finished"/);
  assert.match(aujourdhui, /is-locked/, "le meme match, sans flux de resultats, reste verrouille");
});

test("onglet Hier : no_signal et entrees sans marche retenu retirees", () => {
  const list = HL.cleanResults(file([
    entry(),
    entry({ id: 2, pick: null }),
    entry({ id: 3, no_signal: true }),
    entry({ id: null }),
    entry({ id: "1570383abc" }),
  ]));
  assert.deepEqual(list.map((e) => e.id), ["1575507"], "seul un marche retenu entre dans l'onglet Hier");
  assert.equal(HL.cleanResult({ id: 7, pick: "Plus de 2.5", href: "javascript:alert(1)" }).href, null, "lien non absolu refuse");
  assert.equal(HL.cleanResult({ id: 7, pick: "Plus de 2.5", href: "//evil.example/x" }).href, null, "domaine externe refuse");
  assert.equal(HL.cleanResult({ id: 7, pick: "x", result: "peut-etre" }).result, "pending", "resultat inconnu : en attente, jamais gagne");
});

test("bandeau : « N marchés sur M réalisés » (void et pending hors du compte), mention obligatoire et lien", () => {
  const H = helpers();
  const list = HL.cleanResults(file([
    entry({ id: 1, result: "win" }), entry({ id: 2, result: "win" }), entry({ id: 3, result: "win" }),
    entry({ id: 4, result: "loss" }),
    entry({ id: 5, result: "void" }),
    entry({ id: 6, result: "pending", score: null }),
  ]));
  assert.deepEqual(HL.resultTotals(list), { won: 3, lost: 1, voided: 1, pending: 1, settled: 4 });
  const banner = HL.renderResultsBanner(list, H);
  assert.match(banner, /Résultats d’hier : 3 marchés sur 4 réalisés/);
  assert.match(banner, /1 match annulé, hors décompte\./);
  assert.match(banner, /1 marché en attente de règlement, hors décompte\./);
  // Mention obligatoire, a cote du bilan.
  assert.match(banner, /Les résultats passés ne préjugent pas des résultats futurs\./);
  assert.match(banner, /<a class="hl-rbanner-cta" href="\/gb\/resultats\/"[^>]*>Voir tous les résultats/);
  // Jamais de promesse, jamais de pourcentage, jamais « 0 % ».
  assert.doesNotMatch(strip(banner), /%|ROI|gagnez|garanti/i);
  // Un jour a 0/5 s'affiche comme un jour a 5/5 : rien n'est masque.
  const perdus = HL.cleanResults(file([entry({ id: 1, result: "loss" }), entry({ id: 2, result: "loss" })]));
  assert.match(HL.renderResultsBanner(perdus, H), /Résultats d’hier : 0 marché sur 2 réalisé/);
  // Aucun marche regle : un constat, pas un vide trompeur.
  const attente = HL.cleanResults(file([entry({ id: 1, result: "pending", score: null })]));
  assert.match(HL.renderResultsBanner(attente, H), /aucun marché réglé pour le moment/);
});

test("source de la cote : « (Pinnacle) » seulement quand elle vient de Pinnacle", () => {
  const H = helpers();
  const pin = HL.renderResultsDay(HL.cleanResults(file([entry({ odds_source: "pinnacle" })])), ctxBase(), H);
  assert.match(pin, /1,32 <small>\(Pinnacle\)<\/small>/);
  for (const src of ["moyenne", "average", "", undefined, "PINNACLE_PLUS"]) {
    const html = HL.renderResultsDay(HL.cleanResults(file([entry({ odds_source: src })])), ctxBase(), H);
    assert.match(html, /<small>\(cotes moyennes\)<\/small>/, "source " + src);
    assert.doesNotMatch(html, /\(Pinnacle\)/, "Pinnacle annonce a tort pour la source " + src);
  }
  // Cote absente : ni cote ni source inventees, le verdict reste.
  const sans = HL.renderResultsDay(HL.cleanResults(file([entry({ cote: null })])), ctxBase(), H);
  assert.doesNotMatch(sans, /hl-rodds/);
  assert.match(sans, /hl-verdict is-win/);
});

test("aucun pari d'un match non termine : entree sans score finale = « En attente », sans marche ni cote", () => {
  const H = helpers();
  const html = HL.renderResultsDay(HL.cleanResults(file([entry({ result: "pending", score: null })])), ctxBase(), H);
  assert.match(html, /hl-rrow is-pending/);
  assert.match(html, /<span class="hl-verdict-t">En attente<\/span>/);
  assert.doesNotMatch(html, /hl-rpick|hl-rodds|Plus de 1\.5 buts|1,32/, "pari affiche sans score final");
  // Un resultat annonce sans score ne devient jamais un verdict.
  assert.equal(HL.isSettled(HL.cleanResult(entry({ score: null }))), false);
  assert.equal(HL.isSettled(HL.cleanResult(entry({ score: "2-1" }))), true);
  assert.equal(HL.isSettled(HL.cleanResult(entry({ score: "à venir" }))), false);
});

test("ligne du jour : verdict seulement pour un match regle, et AUCUN champ premium lu", () => {
  const SECRET = { conf: 7.7, pari_rec: "Over 2.5", market_id: "over-25", cote_rec: 1.93, model_probability: 77.4, edge: 9.1, marche: "TOTAL_BUTS" };
  const H = helpers({ heure: () => "21:30" });
  const reads = [];
  const target = Object.assign({
    id: 1575507, league_key: "primeira", league: "Primeira Liga", home: { n: "Nacional" }, away: { n: "Famalicão" },
    date: "2026-09-20 21:30", has_signal: true, status: "FT",
  }, SECRET);
  const m = new Proxy(target, { get(t, k) { if (typeof k === "string" && PREMIUM.PREMIUM_FIELDS.includes(k)) reads.push(k); return t[k]; } });
  const settled = HL.cleanResult(entry({ kickoff: "2026-09-20 21:30" }));
  const ctx = (extra) => Object.assign({ isPro: false, freeMatchId: null, simulations: 5000, nowTs: Date.parse("2026-09-20T23:00:00Z"), collapsed: {}, lockedHref: "match" }, extra || {});

  const row = HL.renderMatchRow(m, ctx({ results: { 1575507: settled } }), H, 0);
  assert.deepEqual(reads, [], "champ premium lu pour une ligne a verdict : " + reads.join(","));
  assert.match(row, /class="hl-row hl-grid is-result hl-rrow is-win/);
  assert.match(row, /<span class="hl-rpick">Plus de 1\.5 buts<\/span>/);
  assert.match(row, /<span class="hl-verdict-t">Gagné<\/span>/);
  assert.match(row, /<b class="hl-rscore">2<\/b>/);
  // Le pari du flux, pas celui du match : aucune valeur premium dans le HTML.
  assert.doesNotMatch(row, /Over 2\.5|over-25|7[,.]7|77[,.]4|1[,.]93|TOTAL_BUTS/);

  // Meme match, entree du flux non reglee : la ligne redevient verrouillee,
  // et toujours aucun champ premium lu.
  reads.length = 0;
  const attente = HL.renderMatchRow(m, ctx({ results: { 1575507: HL.cleanResult(entry({ result: "pending", score: null })) } }), H, 0);
  assert.deepEqual(reads, []);
  assert.match(attente, /class="hl-row hl-grid is-locked/);
  assert.doesNotMatch(attente, /hl-verdict|hl-rpick|hl-rscore/);
  // Sans flux du tout : comportement d'avant, a l'identique.
  reads.length = 0;
  const sansFlux = HL.renderMatchRow(m, ctx(), H, 0);
  assert.deepEqual(reads, []);
  assert.match(sansFlux, /class="hl-row hl-grid is-locked/);
  assert.doesNotMatch(sansFlux, /hl-verdict/);
  // Un match d'un AUTRE jour ne recupere jamais le verdict d'un homonyme.
  const autre = HL.renderMatchRow(Object.assign({}, target, { id: 999 }), ctx({ results: { 1575507: settled } }), H, 0);
  assert.doesNotMatch(autre, /hl-verdict/);
});

test("minuit (heure du visiteur) : les onglets glissent d'un jour, le flux de la veille sort de l'onglet Hier", () => {
  const H = helpers();
  const matchs = [{ id: 1, date: "2026-09-20 21:00" }, { id: 2, date: "2026-09-21 18:00" }];
  const veille = { "2026-09-19": [entry(), entry({ id: 2 })] };
  const avant = HL.buildDays(matchs, H, { day: "2026-09-20", tomorrow: "2026-09-21" }, veille);
  assert.deepEqual(avant.map((d) => [d.day, d.count, d.results]), [["2026-09-19", 2, true], ["2026-09-20", 1, false], ["2026-09-21", 1, false]]);
  // 00 h 05 : le jour du visiteur a change, l'onglet Hier vise le 20.
  const apres = HL.buildDays(matchs, H, { day: "2026-09-21", tomorrow: "2026-09-22" }, veille);
  assert.deepEqual(apres.map((d) => [d.day, d.count]), [["2026-09-20", 0], ["2026-09-21", 1], ["2026-09-22", 0]]);
  assert.equal(apres[0].results, true, "l'onglet Hier reste le premier, sur le nouveau jour");
  // Le flux du 19 n'est plus affiche : il n'est pas recycle en « hier ».
  assert.equal((veille["2026-09-20"] || []).length, 0);
});

test("i18n : les libelles de resultats existent dans les 7 langues, sans promesse", () => {
  const fr = JSON.parse(fs.readFileSync(path.join(root, "i18n/dict/fr.json"), "utf8")).home_list;
  const cles = ["day_yesterday", "res_count", "res_count_one", "res_count_none", "res_void_one", "res_void_many",
    "res_pending_one", "res_pending_many", "res_banner_aria", "res_disclaimer", "res_all", "res_won", "res_lost",
    "res_void", "res_wait", "res_src_pinnacle", "res_src_avg", "res_aria_pick", "res_aria_odds", "res_row_aria",
    "res_no_score", "res_empty_title", "res_empty_text", "res_cta_home"];
  // Aucune promesse : ni ROI, ni taux de reussite, ni « gagnez », ni
  // pourcentage. La negation (« ne préjugent pas », « nunca una garantía »)
  // reste, elle, obligatoire.
  const INTERDIT = /\bROI\b|taux de réussite|success rate|win rate|\bgagnez\b|\bganar[aá]s?\b|\d\s?%/i;
  for (const loc of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(fs.readFileSync(path.join(root, "i18n/dict/" + loc + ".json"), "utf8")).home_list;
    for (const k of cles) {
      assert.equal(typeof d[k], "string", loc + " : home_list." + k + " absent");
      assert.ok(d[k].trim(), loc + " : home_list." + k + " vide");
      const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
      assert.equal(ph(d[k]), ph(fr[k]), loc + " : placeholders de home_list." + k);
      assert.doesNotMatch(d[k], INTERDIT, loc + " : home_list." + k);
      // « Pinnacle » est un nom propre : partout le meme (verifie plus bas).
      if (loc !== "fr" && k !== "res_src_pinnacle") assert.notEqual(d[k], fr[k], loc + " : home_list." + k + " est encore en français");
    }
    // La mention obligatoire est traduite partout.
    assert.ok(d.res_disclaimer.length > 20, loc + " : mention des resultats passes trop courte");
  }
  // « Pinnacle » est un nom propre : il reste identique partout.
  for (const loc of ["en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(fs.readFileSync(path.join(root, "i18n/dict/" + loc + ".json"), "utf8")).home_list;
    assert.equal(d.res_src_pinnacle, "Pinnacle");
  }
});
