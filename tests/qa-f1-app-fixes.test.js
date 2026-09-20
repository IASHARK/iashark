"use strict";
// Correctifs QA du 14/09/2026 (agent F1) : pages app du site en 9 versions.
// Liens de match dans le repertoire, heures locales, ligne d'aide par
// repertoire, marche de marches.html, selecteur de langue, prix MXN,
// compteur de competitions, noms de ligues, coherence market_id / pari_rec.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const MT = require("../lib/match-time.js");
const { pickFreeMatch, pickFreeMatchId } = require("../lib/free-match.js");
const builder = require("../scripts/build-locales.js");

// ---------------------------------------------------------------------------
test("match-time : heure de Paris -> instant reel, changements d'heure compris", () => {
  assert.equal(MT.parseParis("2026-09-14 21:00").toISOString(), "2026-09-14T19:00:00.000Z", "ete : UTC+2");
  assert.equal(MT.parseParis("2026-01-10 21:00").toISOString(), "2026-01-10T20:00:00.000Z", "hiver : UTC+1");
  assert.equal(MT.parseParis("2026-03-29 03:30").toISOString(), "2026-03-29T01:30:00.000Z", "juste apres le passage a l'heure d'ete");
  assert.equal(MT.parseParis("2026-10-25 04:00").toISOString(), "2026-10-25T03:00:00.000Z", "juste apres le retour a l'heure d'hiver");
  assert.equal(MT.parseParis("n'importe quoi"), null);
  const m = { date: "2026-09-15 01:00" };
  assert.equal(MT.matchDay(m, "America/Mexico_City"), "2026-09-14", "01:00 a Paris = veille au soir a Mexico");
  assert.equal(MT.matchClock(m, "Europe/London"), "2026-09-15 00:00");
  assert.equal(MT.matchDay(m, "Africa/Johannesburg"), "2026-09-15");
  assert.equal(MT.formatTime({ date: "2026-09-14 21:00" }, "en-GB", { timeZone: "Europe/London" }), "20:00");
  const clock = MT.localClock(new Date("2026-09-14T23:30:00Z"), "America/Mexico_City");
  assert.deepEqual([clock.day, clock.tomorrow, clock.now, clock.tz], ["2026-09-14", "2026-09-15", "2026-09-14 17:30", "America/Mexico_City"]);
  assert.equal(MT.addDays("2026-12-31", 1), "2027-01-01");
});

test("match-time : ordre des matchs stable et deterministe", () => {
  const liste = [
    { id: 3, date: "2026-09-14 21:00", league: "Serie A", home: { n: "B" }, away: { n: "X" } },
    { id: 1, date: "2026-09-14 21:00", league: "Premier League", home: { n: "Z" }, away: { n: "Y" } },
    { id: 2, date: "2026-09-14 18:00", league: "Serie A", home: { n: "A" }, away: { n: "W" } },
    { id: 4, date: "2026-09-14 21:00", league: "Serie A", home: { n: "A" }, away: { n: "V" } }
  ];
  const ids = (l) => l.slice().sort(MT.compareMatches).map((m) => m.id);
  assert.deepEqual(ids(liste), [2, 1, 4, 3]);
  assert.deepEqual(ids(liste.slice().reverse()), [2, 1, 4, 3], "meme ordre quel que soit l'ordre d'entree");
});

test("free-match : jour LOCAL du visiteur, mode historique (Paris) inchange", () => {
  const liste = [
    { id: 10, date: "2026-09-14 20:00", is_free: true, pari_rec: "A" },
    { id: 11, date: "2026-09-15 02:00", is_free: true, pari_rec: "B" }
  ];
  // Mexico, 14/09 a 14:00 : les deux analyses tombent le 14 (heure locale) ;
  // celle qui n'a pas commence et la plus proche est retenue.
  const mexico = MT.localClock(new Date("2026-09-14T20:00:00Z"), "America/Mexico_City");
  assert.equal(pickFreeMatchId(liste, mexico), 11);
  const paris = MT.localClock(new Date("2026-09-14T10:00:00Z"), "Europe/Paris");
  assert.equal(pickFreeMatchId(liste, paris), 10);
  // Horloge historique sans tz : comparaison des chaines de Paris.
  assert.equal(pickFreeMatchId(liste, { day: "2026-09-14", now: "2026-09-14 10:00" }), 10);
  // Horloge par defaut (locale) : liste datee dans le futur ; une designation
  // d'un jour passe n'est jamais offerte (le match du jour, lui, l'est jusqu'a minuit).
  const demain = new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10);
  assert.ok(pickFreeMatch([{ id: 12, date: demain + " 20:00", is_free: true, pari_rec: "C" }]), "horloge par defaut (locale) sans erreur");
  assert.equal(pickFreeMatch(liste), null, "analyses offertes deja jouees : aucun match offert");
});

// ---------------------------------------------------------------------------
test("accueil / outils : les cartes de match restent dans le repertoire (match.html?id=)", () => {
  const home = read("index.html");
  assert.doesNotMatch(home, /lien\('match\/'/, "plus aucun lien vers la page statique FR /match/<id>.html");
  assert.equal((home.match(/lien\('match\.html\?id='\+encodeURIComponent\(/g) || []).length, 2);
  // Lignes de la liste des matchs (home-list.js) : lien() d'index.html, page match du repertoire.
  assert.match(read("home-list.js"), /H\.lien\('match\.html\?id='\+encodeURIComponent\(m\.id\)\)/);
  assert.doesNotMatch(read("home-list.js"), /lien\('match\/'/);
  assert.doesNotMatch(read("tools-page.js"), /lien\('match\/'/);
  ["gb", "za", "mx", "en", "fr"].forEach((d) => {
    const html = read(d + "/index.html");
    assert.doesNotMatch(html, /\/match\/'\s*\+/, d);
    assert.match(html, /lien\('match\.html\?id='/, d);
  });
  assert.match(home, /src="\/lib\/match-time\.js"/);
  assert.match(home, /src="\/lib\/league-names\.js"/);
});

test("i18n.js : liens des pages sans prefixe, locale imposee, <html lang>, promesse du dictionnaire", async () => {
  function load(pathname, opts) {
    opts = opts || {};
    const store = Object.assign({}, opts.store);
    let fetches = 0;
    const doc = {
      documentElement: { getAttribute: (k) => (k === "lang" ? (opts.lang || null) : null), setAttribute() {} },
      querySelector: (sel) => (sel === 'meta[name="iashark-force-locale"]' && opts.force ? { getAttribute: () => opts.force } : null),
      querySelectorAll: () => []
    };
    const win = {
      location: { pathname, search: "", hash: "" },
      document: doc,
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
      fetch: () => { fetches++; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); }
    };
    win.window = win;
    vm.runInContext(read("i18n/i18n.js"), vm.createContext({ window: win, document: doc, fetch: win.fetch }));
    return { I: win.I18N, store, fetches: () => fetches };
  }
  // Blog FR : locale imposee meme apres une visite de /mx/, liens vers /fr/.
  const blog = load("/blog.html", { force: "fr", lang: "fr", store: { iashark_lang: "es-mx", iashark_dir: "mx" } });
  assert.equal(blog.I.locale, "fr");
  assert.equal(blog.I.href("compte.html"), "/fr/compte.html");
  // Page statique /match/<id>.html : langue de la page, liens vers la version memorisee.
  const statique = load("/match/123.html", { lang: "fr", store: { iashark_lang: "en", iashark_dir: "gb" } });
  assert.equal(statique.I.locale, "fr");
  assert.equal(statique.I.href("pro.html"), "/gb/pro.html");
  assert.equal(statique.I.href(""), "/gb/");
  // init() sur une page sans prefixe n'ecrase jamais le choix du visiteur, et
  // le dictionnaire n'est telecharge qu'une fois malgre trois appels.
  await Promise.all([statique.I.init(), statique.I.init(), statique.I.init()]);
  assert.equal(statique.fetches(), 1);
  assert.equal(statique.store.iashark_dir, "gb");
  assert.equal(statique.store.iashark_lang, "en");
  // Page prefixee : inchange.
  const gb = load("/gb/match.html", {});
  assert.equal(gb.I.href("pro.html"), "/gb/pro.html");
});

test("pages match / joueur / outils : selecteur langue-pays, mention 18+ et ligne d'aide", () => {
  ["match.html", "joueur.html", "pro.html"].forEach((f) => {
    const html = read(f);
    assert.match(html, /id="langSwitchSlot"/, f);
    assert.match(html, /<script src="\/lang-switcher\.js"><\/script>/, f);
    assert.match(html, /IasharkLangSwitcher\.mount\('#langSwitchSlot'\)/, f);
    assert.match(html, /\/assets\/lang-switcher\.css/, f);
    assert.match(html, /data-market-helpline="url"/, f);
    assert.match(html, /data-market-helpline-if="phone"/, f);
  });
  assert.match(read("pro.html"), /data-i18n="player_page\.footer_disclaimer"/, "outils (calculateur de mise) : mention 18+ / risque");
  assert.doesNotMatch(read("assets/match-page.css"), /\.legal-footer\{display:none\}/, "mention 18+ visible sur la page match");
  const match = read("match.html");
  assert.match(match, /data-back-link/);
  assert.doesNotMatch(match, /javascript:history\.back\(\)/);
  assert.match(read("match-page.js"), /function bindBackLink\(\)/);
});

test("ligne d'aide : ressource du repertoire, jamais la ligne francaise hors /fr/", () => {
  const help = (d) => builder.helplineFor(d);
  assert.match(help("fr").name, /Joueurs Info Service/);
  assert.equal(help("gb").phone, "0808 8020 133");
  assert.equal(help("za").phone, "0800 006 008");
  assert.equal(help("mx").phone, "800 911 2000");
  ["en", "es", "de", "it", "pt"].forEach((d) => {
    assert.equal(help(d).name, "Gambling Therapy", d);
    assert.equal(help(d).phone, null, d);
  });
  ["gb", "za", "mx", "en", "es", "de", "it", "pt"].forEach((d) => {
    ["index.html", "marches.html", "match.html", "joueur.html", "pro.html"].forEach((f) => {
      const html = read(d + "/" + f);
      assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ""), /09 74 75 13 13|joueurs-info-service/, d + "/" + f);
    });
  });
  const dicts = ["en", "es", "es-mx", "de", "it", "pt"].map((l) => JSON.parse(read("i18n/dict/" + l + ".json")));
  dicts.forEach((d) => assert.doesNotMatch(d.footer.disclaimer_help_label, /\(/, "plus de '(France)' dans le libelle"));
});

test("prix : MX$ pour le peso, prix du marche ecrit dans le HTML genere", () => {
  assert.equal(builder.formatPrice("mx", "pro"), "MX$199");
  assert.match(builder.formatPrice("za", "pro"), /^R\s?199$/);
  assert.equal(builder.formatPrice("gb", "pro"), "£14.99");
  const src = '<p><b data-market-price="pro">19,95 €</b><span data-market-price="pro.year">x</span></p>';
  assert.equal(builder.bakeMarket(src, "mx"), '<p><b data-market-price="pro">MX$199</b><span data-market-price="pro.year">MX$1,990</span></p>');
  // Duree non vendue (annuel ZA) : texte intact et attribut, jamais un prix invente.
  assert.match(builder.bakeMarket(src, "za"), /data-market-price="pro\.year" data-market-price-unavailable="">x</);
  assert.match(read("mx/abonnement.html"), /data-market-price="pro\.month"[^>]*>MX\$199</);
  assert.match(read("gb/abonnement.html"), /data-market-price="pro\.month"[^>]*>£14\.99</);
  assert.doesNotMatch(read("gb/index.html"), /id="heroPrice"[^>]*>[^<]*€/);
});

test("accueil : 19 competitions partout, analyse gratuite honnete (compte gratuit)", () => {
  ["fr", "gb", "za", "en", "mx", "es", "de", "it", "pt"].forEach((d) => {
    const visible = read(d + "/index.html").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
    assert.doesNotMatch(visible, /\b13\b[^<]{0,3}(championnats|compet|Wettbewerbe|competizioni|competições|competiciones)|Treize|Thirteen|Trece|Dreizehn|Tredici/i, d);
    assert.match(visible, /tabular-nums">19<\/b>/, d);
  });
  assert.match(read("gb/index.html"), /with a free account/);
  assert.match(read("fr/index.html"), /avec un compte gratuit/);
});

test("noms de competitions : un seul nom par ligue, synchronise depuis config/leagues.json", () => {
  const LN = require("../lib/league-names.js");
  const conf = JSON.parse(read("config/leagues.json")).leagues;
  assert.deepEqual(LN.LEAGUES, builder.leagueNamesData(), "bloc perime : relancer node scripts/build-locales.js");
  conf.forEach((l) => assert.equal(LN.displayName(l.key), l.displayName, l.key));
  assert.equal(LN.displayName("inconnue", "Brut"), "Brut");
  const home = read("index.html");
  assert.doesNotMatch(home, />LaLiga</);
  assert.doesNotMatch(home, /m\.ligue_icon\|\|/, "le code ligue 'FB' n'est jamais affiche comme drapeau");
});

test("marches.html : filtre et libelle depuis market_id, jamais une sous-chaine du texte", () => {
  const html = read("marches.html");
  const code = html.match(/var MARKET_ID_KEYS=[\s\S]*?\nfunction getMarketKey\(m\)\{[\s\S]*?\n\}/)[0];
  const ctx = vm.createContext({});
  vm.runInContext(code + ";this.getMarketKey=getMarketKey;", ctx);
  assert.equal(ctx.getMarketKey({ market_id: "away-team-under-15", pari_rec: "Exterieur moins de 1.5 but" }), "");
  assert.equal(ctx.getMarketKey({ pari_rec: "Exterieur moins de 1.5 but" }), "", "plus de victoire exterieure par sous-chaine");
  assert.equal(ctx.getMarketKey({ market_id: "away-win" }), "victoire_ext");
  assert.equal(ctx.getMarketKey({ market_id: "over-25" }), "over25");
  assert.equal(ctx.getMarketKey({ pari_rec: "BTTS Oui" }), "btts_oui");
  assert.match(html, /function marketLabelFor\(m\)/);
  assert.match(read("fr/marches.html"), /label:'Remboursé si match nul'/);
});

test("pipeline : SAFE_PICK coherent (market_id, marche, ligne premium) et pages statiques sans lien racine", () => {
  const src = read(".github/workflows/update-data.yml");
  assert.match(src, /matchCibleSafePick\.market_id=Object\.keys\(LEGACY_VERS_CANONIQUE\)/);
  assert.match(src, /matchCibleSafePick\.marche=/);
  assert.match(src, /lignePremiumSafePick\.pari_rec=matchCibleSafePick\.pari_rec/);
  const fn = src.match(/function liensVersionFr\(html\)\{[\s\S]*?\n {10}\}/)[0];
  const ctx = vm.createContext({});
  vm.runInContext(fn + ";this.f=liensVersionFr;", ctx);
  const out = ctx.f('<a href="/">a</a><a href="/pro.html">b</a><a href="/blog.html">c</a><link href="/assets/x.css">');
  assert.equal(out, '<a href="/fr/">a</a><a href="/fr/pro.html">b</a><a href="/blog.html">c</a><link href="/assets/x.css">');
  assert.match(src, /var tpl=liensVersionFr\(fs\.readFileSync\('match\.html','utf8'\)\);/);
  // Resume SEO : date localisee + mention du fuseau + nom de ligue unique.
  assert.match(src, /<time data-seo-date datetime="'\+escHtml\(TODAY\)\+'">/);
  assert.match(src, /home_app\.seo_times_paris/);
  assert.match(src, /escHtml\(seoLeagueName\(m\)\)/);
  // Le mapping canonique -> market_id est bien l'inverse du mapping legacy.
  const { LEGACY_TO_CANONICAL_SCORE_MARKET: map } = require("../lib/run-output/build-legacy-score-candidates.js");
  assert.equal(Object.keys(map).find((k) => map[k].market === "FT_TEAM_TOTAL_AWAY_1.5_UNDER"), "away-team-under-15");
});

test("resume SEO de l'accueil : libelle de marche dans la langue du repertoire", () => {
  const gb = read("gb/index.html"), mx = read("mx/index.html");
  const label = (h) => (h.match(/<span data-market-label="[^"]*"[^>]*>([^<]*)</) || [])[1];
  if (label(read("index.html")) === undefined) return; // aucun pari nomme ce jour-la
  assert.doesNotMatch(label(gb), /buts|match nul|équipe/i);
  assert.doesNotMatch(label(mx), /buts|match nul|équipe/i);
});

test("landings : hreflang complets, y compris les landings pays maintenues a la main", () => {
  ["gb", "za", "mx"].forEach((d) => {
    const html = read(d + "/landing.html");
    ["fr", "en", "en-GB", "en-ZA", "es-MX", "x-default"].forEach((hl) => assert.match(html, new RegExp('hreflang="' + hl + '"'), d + " " + hl));
    assert.match(html, new RegExp('<link rel="canonical" href="https://iashark\\.com/' + d + '/landing\\.html">'), d);
  });
  ["en-GB", "en-ZA", "es-MX"].forEach((hl) => assert.match(read("en/landing.html"), new RegExp('hreflang="' + hl + '"'), hl));
});
