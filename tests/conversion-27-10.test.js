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

// ---------------------------------------------------------------------------------------------
// C3 : « Nos chances face a la cote » compare TOUJOURS a la cote marge retiree (affichage seulement).
const VM = require("../lib/match-view-model.js");
const CHANCE = require("../lib/chance-iashark.js");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];

test("C3 : le chiffre sans marge du calcul d'abord (meme regle que lib/chance-iashark.js#sansMargeDuPari)", () => {
  const cas = [
    { market_id: "under-25", cote_rec: "1.62", cote_source: "anj", sans_marge_anj: { "under-25": 55.4 }, markets_compared: [], co25: "2.4", cu25: "1.6" },
    { market_id: "dc-x2", cote_rec: "1.4", cote_source: "indicative", markets_compared: [{ id: "dc-x2", consensus: 68.7 }], cdc2x: "1.4", c1: "3.2" },
    { market_id: "home-win", cote_rec: "1.41", cote_source: "anj", sans_marge_anj: { "home-win": 65.5 }, markets_compared: [{ id: "home-win", consensus: 66 }] },
  ];
  for (const r of cas) {
    assert.equal(VM.recommendedFair(r).value, CHANCE.sansMargeDuPari(r), r.market_id);
    assert.equal(VM.recommendedFair(r).source, "calcul");
  }
});

test("C3 : sinon l'issue opposee cotee du meme marche ; sinon aucune comparaison, jamais 1 / cote", () => {
  const paire = (a, b) => Math.round((1 / a) / (1 / a + 1 / b) * 1000) / 10;
  // Exemple du diagnostic (/fr/match.html?id=1493205) : moins de 2,5 buts a 1,40 ; 1 / 1,40 = 71,4 %.
  const u25 = VM.recommendedFair({ market_id: "under-25", cote_rec: "1.4", co25: "2.88", cu25: "1.40" });
  assert.deepEqual(u25, { value: paire(1.4, 2.88), source: "issues" });
  assert.ok(u25.value < 71.4 - 3, "la marge n'est plus comptee comme une chance du bookmaker");
  assert.equal(VM.recommendedFair({ market_id: "over-15", co15: "1.40", cu15: "2.75" }).value, paire(1.4, 2.75));
  assert.equal(VM.recommendedFair({ market_id: "under-35", co35: "2.62", cu35: "1.50" }).value, paire(1.5, 2.62));
  assert.equal(VM.recommendedFair({ market_id: "btts-no", cbtts: "1.67", cbtts_non: "2.05" }).value, paire(2.05, 1.67));
  // Double chance face a l'issue restante du 1N2.
  assert.equal(VM.recommendedFair({ market_id: "dc-1x", cdc1x: "1.40", c2: "2.79" }).value, paire(1.4, 2.79));
  assert.equal(VM.recommendedFair({ market_id: "dc-x2", dc2x: "1.53", c1: "2.39" }).value, paire(1.53, 2.39));
  // 1N2 : consensus sans marge du calcul, sinon les trois cotes.
  assert.equal(VM.recommendedFair({ market_id: "home-win", market_consensus_p1: "64.1", c1: "1.5", cn: "4.2", c2: "6.5" }).value, 64.1);
  const trois = [1.5, 4.2, 6.5].map((c) => 1 / c), s = trois[0] + trois[1] + trois[2];
  assert.equal(VM.recommendedFair({ market_id: "home-win", c1: "1.5", cn: "4.2", c2: "6.5" }).value, Math.round(trois[0] / s * 1000) / 10);
  // Aucune issue opposee cotee : null (la page dit que la cote contient sa marge).
  for (const r of [{ market_id: "home-team-over-05", cote_rec: "1.4" }, { market_id: "under-25", cote_rec: "1.4", cu25: "1.4" }, { market_id: "F29:No", cote_rec: "1.5" }, { cote_rec: "1.5" }]) {
    assert.equal(VM.recommendedFair(r).value, null, JSON.stringify(r));
  }
  const vm = VM.buildMatchViewModel({ id: 1, date: "2026-10-27 20:45", home: { id: 1, n: "A" }, away: { id: 2, n: "B" }, data_quality_score: 80, model_output_available: true,
    p1: 48, pn: 27, p2: 25, market_id: "home-team-over-05", pari_rec: "Domicile plus de 0.5 but", cote_rec: "1.4", model_probability: 66 });
  if (vm.model.recommendation) assert.equal(vm.model.recommendedImplied, null);
});

test("C3 : textes de la carte, dans les 7 langues, sans mot interdit", () => {
  const js = read("match-page.js");
  assert.doesNotMatch(js.slice(js.indexOf("function signalCard(vm)"), js.indexOf("// Alertes d'absence du pipeline")), /100\s*\/\s*cote|1\s*÷/);
  assert.match(js, /if\(r<=1\)return\{cls:'flat'/);
  assert.match(js, /tf\('match_page\.sig2_no_fair','Cote du bookmaker : \{odds\}\. Elle contient sa marge : on ne la compare pas à notre calcul\.'/);
  const fr = JSON.parse(read("i18n/dict/fr.json")).match_page;
  assert.equal(fr.proba_model_label, "Notre calcul");
  assert.equal(fr.proba_market_label, "La cote, marge retirée");
  assert.equal(fr.proba_gap_flat, "Les deux disent la même chose.");
  assert.equal(fr.proba_gap_neg, "Le bookmaker voit plus de chances que nous sur ce pari");
  for (const l of LOCALES) {
    const d = JSON.parse(read("i18n/dict/" + l + ".json")).match_page;
    for (const k of ["proba_model_label", "proba_market_label", "proba_gap_flat", "proba_gap_pos", "proba_gap_neg", "proba_help_implied", "sig2_plain", "sig2_plain_model", "sig2_no_fair", "label_colon"]) {
      assert.ok(typeof d[k] === "string" && d[k].length, l + " " + k);
      assert.doesNotMatch(d[k], /esp[ée]rance|\bvalue\b|\bmise\b|\bstake\b|garanti[ e]/i, l + " " + k);
    }
    assert.match(d.sig2_no_fair, /\{odds\}/);
  }
});

test("C3 : plus aucune phrase « sans les cotes » ; la phrase vraie sur l'accueil, la landing et « La méthode en bref »", () => {
  const faux = /sans les cotes|sans jamais utiliser les cotes|never us(es|ing) the odds|without the odds|nunca usa|sin usar nunca|nie die Quoten|ohne jemals|non usa mai|senza mai|sem nunca|nunca usa as odds/i;
  for (const d of ["fr", "en", "es", "gb", "mx", "za"]) {
    for (const f of ["index.html", "landing.html"]) if (fs.existsSync(path.join(ROOT, d, f))) assert.doesNotMatch(read(d + "/" + f), faux, d + "/" + f);
  }
  for (const d of ["fr", "en", "es", "gb", "mx", "za", "de", "it", "pt"]) assert.doesNotMatch(read("i18n/seo/" + d + ".json"), faux, d);
  assert.match(read("fr/index.html"), /on la compare à la probabilité des cotes, marge retirée, et on garde le chiffre le plus prudent\. Le pari retenu suit une règle fixe/);
  assert.match(read("fr/index.html"), /Buts attendus et probabilité de chaque score, puis de chaque marché, comparée aux cotes du marché, marge retirée\./);
});

// ---------------------------------------------------------------------------------------------
// C2 : « Hier, publies avant les matchs : X gagnes, Y perdus. » pres des boutons de paiement.
const BH = require("../lib/bilan-hier.js");
const ligne = (fid, result, pub, ko, type) => ({ fixture_id: fid, result, published_at: pub, kickoff_at: ko, type: type === undefined ? "single" : type });

test("C2 : bilan des paris simples de la veille, calcule une fois (lib/bilan-hier.js), meme source que la bande", () => {
  const J = "2026-10-26";
  const lignes = [
    ligne(1, "win", "2026-10-25T05:00:00Z", "2026-10-26T18:00:00Z"),
    ligne(2, "loss", "2026-10-26T05:00:00Z", "2026-10-26T22:30:00Z"), // 23 h 30 a Paris : la veille
    ligne(3, "win", "2026-10-26T19:00:00Z", "2026-10-26T18:00:00Z"), // publie APRES le coup d'envoi : jamais compte
    ligne(4, "scheduled", "2026-10-26T05:00:00Z", "2026-10-26T20:00:00Z"), // pas encore regle : dit a part
    ligne(5, "void", "2026-10-26T05:00:00Z", "2026-10-26T16:00:00Z"),
    ligne(6, "win", "2026-10-26T05:00:00Z", "2026-10-26T23:30:00Z"), // 00 h 30 a Paris : le lendemain
    ligne(7, "loss", "2026-10-26T05:00:00Z", "2026-10-26T15:00:00Z", "x5"), // jambe d'un combine : pas un pari simple
    ligne(8, "no_signal", "2026-10-26T05:00:00Z", "2026-10-26T15:00:00Z"),
    ligne(1, "win", "2026-10-25T05:00:00Z", "2026-10-26T18:00:00Z"), // doublon
  ];
  const b = BH.bilanParisSimples(lignes, J);
  assert.deepEqual({ g: b.gagnes, p: b.perdus, a: b.annules, e: b.en_attente }, { g: 1, p: 1, a: 1, e: 1 });
  assert.equal(BH.bilanParisSimples(null, J), null, "archive illisible : rien d'invente");
  const bilan = BH.construireBilan({ jour: J, registre: null, ticketOr: null, resultats: null, parisPublies: {}, parisSimples: lignes });
  assert.equal(bilan.paris_simples.gagnes, 1);
  // Un passage sans acces a l'archive ne remplace pas le bilan deja calcule pour ce jour.
  const pauvre = BH.construireBilan({ jour: J, registre: null, ticketOr: null, resultats: null, parisPublies: {}, parisSimples: null });
  assert.equal(BH.fusionnerAvecPrecedent(pauvre, bilan).paris_simples.gagnes, 1);
  // Le calcul quotidien lit predictions_archive (paris simples publies) et passe les lignes au bilan.
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /predictions_archive\?select=fixture_id,result,published_at,kickoff_at,type&type=eq\.single&published_at=not\.is\.null/);
  assert.match(wf, /BILAN_HIER\.construireBilan\(\{jour:HIER,[^}]*parisSimples:parisSimplesHier\}\)/);
});

test("C2 : la ligne « Hier » : veille a Paris et pour le visiteur, gagnes ET perdus, sans pourcentage ni lien", () => {
  const MARDI_MATIN = Date.parse("2026-10-27T10:00:00+01:00");
  const b = (g, p, e, jour) => ({ jour: jour || "2026-10-26", paris_simples: { jour: jour || "2026-10-26", gagnes: g, perdus: p, annules: 0, en_attente: e || 0 } });
  assert.equal(OP.lignePreuve(b(7, 3), MARDI_MATIN), "Hier, publiés avant les matchs : <b>7 gagnés</b>, <b>3 perdus</b>.");
  assert.equal(OP.lignePreuve(b(1, 0), MARDI_MATIN), "Hier, publiés avant les matchs : <b>1 gagné</b>, <b>0 perdu</b>.");
  assert.equal(OP.lignePreuve(b(67, 32, 1), MARDI_MATIN), "Hier, publiés avant les matchs : <b>67 gagnés</b>, <b>32 perdus</b>, <b>1 en attente de résultat</b>.");
  assert.equal(OP.lignePreuve(b(0, 0, 3), MARDI_MATIN), "", "aucun resultat : rien");
  assert.equal(OP.lignePreuve(b(7, 3, 0, "2026-10-25"), MARDI_MATIN), "", "vieux bilan : rien");
  assert.equal(OP.lignePreuve({ jour: "2026-10-26", offert: null }, MARDI_MATIN), "", "donnee absente : rien");
  assert.equal(OP.lignePreuve(null, MARDI_MATIN), "");
  // Rendu dans le composant : sous le bouton, jamais de % ni de lien, place cachee tant que rien n'est lu.
  const h = OP.html({ mode: "vitrine", contexte: "general", plans: PLANS, choisi: "month", jours: 7, connecte: false, uid: "c2", preuve: OP.lignePreuve(b(7, 3), MARDI_MATIN), maintenant: MARDI_MATIN });
  const p = h.slice(h.indexOf('class="op-preuve"'), h.indexOf("</p>", h.indexOf('class="op-preuve"')));
  assert.ok(h.indexOf("op-cta") < h.indexOf('class="op-preuve"'));
  assert.doesNotMatch(p, /%|<a |href|vert|rouge|green|red/);
  assert.match(OP.html({ mode: "vitrine", contexte: "general", plans: PLANS, choisi: "month", jours: 7, connecte: false, uid: "c2b" }), /data-op-preuve hidden>/);
  // Lu une fois par page dans le fichier du calcul quotidien (jamais recalcule ici).
  const src = read("lib/offre-pro.js");
  assert.match(src, /G\.fetch\("\/preuves\/bilan-hier\.json", \{ cache: "no-cache" \}\)/);
  for (const l of LOCALES) {
    const d = JSON.parse(read("i18n/dict/" + l + ".json")).preuve_simples;
    for (const k of ["line", "line_pending", "won_one", "won_other", "lost_one", "lost_other", "pending_one", "pending_other"]) assert.ok(d && d[k], l + " " + k);
    assert.doesNotMatch(JSON.stringify(d), /%|garanti|gain|esp[ée]rance/i, l);
  }
});
