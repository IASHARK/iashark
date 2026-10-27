"use strict";
// CORRECTIONS DE CONVERSION DU 27/10/2026 (diagnostic CONVERSION-27-10.md, sections C1 a C7).
//   C1 : sortie gratuite sur le cadenas Pro (match offert du jour, meme source que l'accueil) ;
//   C4 : bouton d'essai « 0 € aujourd'hui » et date du premier prelevement, sans rappel promis ;
//   C5 : page d'inscription qui dit ce qu'on recoit ;
//   C6 : un seul nombre de competitions, textes vrais (match offert, combines) ;
//   C7 : l'offre Pro juste apres la liste des matchs, le programme partenaires plus bas.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const OP = require("../lib/offre-pro.js");
const FM = require("../lib/free-match.js");

const PLANS = [
  { interval: "week", amount: 4.99, text: "4,99 €" },
  { interval: "month", amount: 14.99, text: "14,99 €", weeklyEquivalentText: "3,46 €" },
  { interval: "year", amount: 99, text: "99 €", weeklyEquivalentText: "1,91 €", savingsPct: 44 },
];
const MARDI = Date.parse("2026-10-27T10:00:00+01:00");

test("C4 : bouton d'essai « 0 € aujourd'hui », premier prelevement date juste dessous, sans rappel promis", () => {
  const h = OP.html({ mode: "vitrine", contexte: "match", plans: PLANS, choisi: "month", jours: 7, connecte: false, uid: "c4", maintenant: MARDI });
  assert.match(h, /Essayer 7 jours : 0 € aujourd’hui/);
  assert.match(h, /Premier prélèvement : 14,99 € le 3 novembre, seulement si tu ne résilies pas avant\. Résiliation en ligne depuis Mon compte\./);
  // La ligne d'essai suit le bouton, avant la facon de payer et les avantages.
  assert.ok(h.indexOf("op-cta") < h.indexOf("data-op-trial") && h.indexOf("data-op-trial") < h.indexOf("data-op-pay"));
  // Aucun rappel par e-mail : aucune tache planifiee ne l'envoie (trial-reminder / 0042 absents).
  assert.doesNotMatch(h, /e-mail te pr[ée]vient|rappel/i);
  assert.ok(!fs.existsSync(path.join(ROOT, "supabase/functions/trial-reminder")), "si le rappel existe un jour, la phrase peut etre ajoutee");
  // Semaine et annee : jamais d'essai annonce, la ligne est cachee.
  const an = OP.html({ mode: "vitrine", contexte: "general", plans: PLANS, choisi: "year", jours: 7, connecte: false, uid: "c4b", maintenant: MARDI });
  assert.doesNotMatch(an, /0 € aujourd’hui/);
  assert.match(an, /data-op-trial hidden/);
  // Les 2 cases avant paiement ne changent pas (mode paiement connecte).
  assert.match(OP.html({ mode: "paiement", contexte: "general", plans: PLANS, choisi: "month", jours: 7, connecte: true, uid: "c4c" }), /id="checkoutConsent"/);
});

test("C4 : date du premier prelevement = aujourd'hui + n jours, dans la langue de la page", () => {
  assert.equal(OP.datePrelevement(7, MARDI), "3 novembre");
  assert.equal(OP.datePrelevement(7, Date.parse("2026-12-28T12:00:00+01:00")), "4 janvier");
});

test("C1 : sortie gratuite sous le bouton d'essai, seulement avec un match offert du jour", () => {
  const sortie = { href: "/fr/match.html?id=1550174", match: "Sassuolo – Lazio" };
  const h = OP.html({ mode: "vitrine", contexte: "match", plans: PLANS, choisi: "month", jours: 7, connecte: false, uid: "c1", sortie, maintenant: MARDI });
  assert.match(h, /<a class="op-sortie" href="\/fr\/match\.html\?id=1550174" data-track="match_gate_free_exit"><span>Pas maintenant : le match offert du jour est gratuit avec un compte\.<\/span> <b>Sassuolo – Lazio<\/b>/);
  assert.ok(h.indexOf("op-cta") < h.indexOf("op-sortie"), "sous le bouton");
  assert.doesNotMatch(OP.html({ mode: "vitrine", contexte: "match", plans: PLANS, choisi: "month", jours: 7, connecte: false, uid: "c1b" }), /op-sortie/, "sans match offert : rien");
  // Page match : la sortie vient de lib/free-match.js#offertDuJour (meme source que l'accueil), jamais en dur.
  const js = read("match-page.js");
  const f = js.slice(js.indexOf("function sortieGratuite(raw,list)"), js.indexOf("function renderProWall(raw,ctx)"));
  assert.match(f, /IasharkFreeMatch\.offertDuJour\(list,null,/);
  assert.match(f, /String\(m\.id\)===String\(raw&&raw\.id\)\)return null/);
  assert.match(js, /sortie:sortieGratuite\(raw,listeDuJour\)/);
});

test("C1 : offertDuJour = le choix de l'accueil, mais jamais un match d'un autre jour", () => {
  const horloge = { day: "2026-10-27", now: "2026-10-27 10:00" };
  const auj = { id: 1, date: "2026-10-27 18:30", is_free: true, home: { n: "Sassuolo" }, away: { n: "Lazio" } };
  const dem = { id: 2, date: "2026-10-28 20:45", is_free: true, home: { n: "A" }, away: { n: "B" } };
  assert.equal(FM.offertDuJour([auj, dem], horloge).id, 1);
  assert.equal(FM.pickFreeMatch([dem], horloge).id, 2, "l'accueil montre celui de demain faute de mieux");
  assert.equal(FM.offertDuJour([dem], horloge), null, "mais ce n'est pas « le match offert du jour »");
  assert.equal(FM.offertDuJour([], horloge), null);
});

test("C5 : inscription, ce qu'on recoit, tutoiement, retour sur le match offert", () => {
  const fr = JSON.parse(read("i18n/dict/fr.json")).auth;
  assert.equal(fr.signup_h1, "Ton pari offert du jour, gratuit");
  assert.equal(fr.signup_intro, "Avec un compte gratuit : l’analyse complète du match offert, chaque jour, et le Petit combiné. Sans carte bancaire.");
  assert.equal(fr.signup_submit, "Voir mon pari offert");
  assert.equal(fr.email_placeholder, "ton@email.com");
  // Petit combine : seulement la ou il est servi (marche francais) ; en (gb, za, us) et es-mx n'en parlent pas.
  assert.doesNotMatch(JSON.parse(read("i18n/dict/en.json")).auth.signup_intro, /combo|accumulator/i);
  assert.doesNotMatch(JSON.parse(read("i18n/dict/es-mx.json")).auth.signup_intro, /parlay|combinad/i);
  // Aucune connexion Google tant qu'elle n'est pas branchee (Supabase : external.google = false).
  assert.doesNotMatch(read("inscription.html") + read("auth-pages.js"), /signInWithOAuth|Continuer avec Google/);
  const html = read("inscription.html");
  assert.ok(html.indexOf('src="/lib/free-match.js"') > 0 && html.indexOf('src="/lib/free-match.js"') < html.indexOf('src="/auth-pages.js"'));
  const js = read("auth-pages.js");
  assert.match(js, /F\.offertDuJour\(liste, null,/);
  assert.match(js, /if \(dest === localHref\('compte\.html'\) && offertDuJour\) dest = localHref\('match\.html\?id=' \+ offertDuJour\);/);
});

test("C6 : un seul nombre de competitions sur l'accueil, celui de config/leagues.json", () => {
  const nb = JSON.parse(read("config/leagues.json")).leagues.length;
  const LN = require("../lib/league-names.js");
  assert.equal(Object.keys(LN.LEAGUES).length, nb, "lib/league-names.js recopie config/leagues.json");
  for (const f of ["index.html", "fr/index.html", "en/index.html", "es/index.html", "gb/index.html", "mx/index.html", "za/index.html"]) {
    const html = read(f);
    const nombres = (html.match(/data-nb-competitions[^>]*>(\d+)</g) || []).map((m) => Number(/>(\d+)</.exec(m)[1]));
    assert.equal(nombres.length, 3, f + " : bandeau, chiffre, FAQ");
    nombres.forEach((n) => assert.equal(n, nb, f));
  }
  assert.match(read("index.html"), /function nbCompetitions\(\)\{\n\s*var L=window\.IasharkLeagueNames&&window\.IasharkLeagueNames\.LEAGUES;/);
});

test("C6 : textes vrais sous le match offert et sur la page Combinés (config/tickets.json)", () => {
  assert.equal(JSON.parse(read("i18n/dict/fr.json")).home_list.band_note, "Estimation du modèle, pas une garantie. Le match offert s’ouvre avec un compte gratuit ; les autres matchs avec Pro.");
  const T = JSON.parse(read("config/tickets.json"));
  const v = (x) => x.toFixed(2).replace(".", ",");
  const c = JSON.parse(read("i18n/dict/fr.json")).combines_page;
  assert.equal(c.rule_small, T.x5.jambes[0] + " à " + T.x5.jambes[T.x5.jambes.length - 1] + " matchs, cote totale entre " + v(T.x5.cote_min) + " et " + v(T.x5.cote_max) + ". Ouvert avec un compte gratuit.");
  assert.equal(c.rule_big, T.x10.jambes[0] + " à " + T.x10.jambes[T.x10.jambes.length - 1] + " matchs, cote totale entre " + v(T.x10.cote_min) + " et " + v(T.x10.cote_max) + ". Avec Pro.");
  assert.match(c.rules_note, new RegExp("entre " + v(T.jambe.cote_min) + " et " + v(T.jambe.cote_max) + " et au moins " + T.jambe.chance_min + " %"));
  // /en/ reste en dollars (marche us).
  assert.equal(JSON.parse(read("config/markets.json")).us.currency, "USD");
});

test("C7 : l'offre Pro juste apres la liste des matchs, le programme partenaires plus bas", () => {
  for (const f of ["index.html", "fr/index.html", "en/index.html"]) {
    const html = read(f);
    const liste = html.indexOf('<section class="decisions" id="decisions">');
    const offre = html.indexOf('<section id="acces"');
    const partenaires = html.indexOf('<section class="home-partner"');
    const methode = html.indexOf('<section id="methode"');
    assert.ok(liste > 0 && offre > liste && methode > offre && partenaires > methode, f);
    // Rien entre la liste et l'offre (hormis un commentaire).
    const entre = html.slice(html.indexOf("</section>", html.indexOf('<div id="homeList">')) + 10, offre).replace(/<!--[\s\S]*?-->/g, "").trim();
    assert.equal(entre, "", f);
  }
});
