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
  // Meme phrase que Mon compte (PR #222) : la date, puis le prix de chaque mois, la carte demandee ; essai reserve a un
  // premier abonnement (avocat du diable, 27/10/2026 : un ancien abonne paie tout de suite).
  assert.ok(h.includes("Premier prélèvement : 14,99 € le 3 novembre, puis 14,99 € chaque mois, seulement si tu ne résilies pas avant. Carte demandée ; résiliation en ligne depuis Mon compte. Essai réservé à un premier abonnement."), h);
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

test("C4 : date dans le fuseau du visiteur, jamais avant le vrai prelevement Stripe ; meme phrase dans les 7 langues", () => {
  const { spawnSync } = require("child_process");
  // 27/10 23:30 UTC : deja le 28 a Paris, encore le 27 a Los Angeles.
  const date = (tz, ms) => spawnSync(process.execPath, ["-e", "process.stdout.write(require(" + JSON.stringify(path.join(ROOT, "lib/offre-pro.js")) + ").datePrelevement(7," + ms + "))"], { env: Object.assign({}, process.env, { TZ: tz }) }).stdout.toString();
  const T0 = Date.parse("2026-10-27T23:30:00Z");
  assert.equal(date("Europe/Paris", T0), "4 novembre");
  assert.equal(date("America/Los_Angeles", T0), "3 novembre");
  assert.equal(date("Pacific/Auckland", T0), "4 novembre");
  // Stripe commence l'essai au paiement (trial_period_days, jamais une date fixe) : le prelevement tombe au plus tot
  // 7 x 24 h apres un paiement qui suit l'affichage, donc le jour affiche ou plus tard.
  const trial = read("supabase/functions/create-checkout-session/trial.ts");
  assert.match(trial, /trial_period_days: days/);
  assert.doesNotMatch(trial, /trial_end\s*:/);
  for (const tz of ["Europe/Paris", "America/Mexico_City", "Africa/Johannesburg", "Pacific/Auckland"]) {
    for (const h of [0, 7, 13, 23.9]) {
      const affiche = T0 + h * 3600000, paiement = affiche + 15 * 60000, prelevement = paiement + 7 * 86400000;
      const jour = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
      assert.ok(jour(affiche + 7 * 86400000) <= jour(prelevement), tz + " " + h);
    }
  }
  // Meme phrase que Mon compte (PR #222), prix du mois deux fois, puis « essai reserve a un premier abonnement »,
  // dans les 7 langues.
  const PREMIER = { fr: "Essai réservé à un premier abonnement.", en: "Trial for a first subscription only.", es: "Prueba solo para una primera suscripción.",
    "es-mx": "Prueba solo para una primera suscripción.", de: "Testphase nur beim ersten Abo.", it: "Prova riservata a un primo abbonamento.", pt: "Teste reservado a uma primeira subscrição." };
  for (const l of Object.keys(PREMIER)) {
    const v = JSON.parse(read("i18n/dict/" + l + ".json")).offre_pro.trial_first_charge;
    assert.equal((v.match(/\{price\}/g) || []).length, 2, l);
    assert.match(v, /\{date\}/, l);
    assert.ok(v.endsWith(" " + PREMIER[l]), l + " : essai reserve a un premier abonnement");
    assert.doesNotMatch(v, /rappel|reminder|recordatorio|Erinnerung|promemoria|lembrete/i, l);
  }
  assert.equal(JSON.parse(read("i18n/dict/en.json")).offre_pro.trial_first_charge, "First charge: {price} on {date}, then {price} every month, only if you don’t cancel before then. Card required; cancel online from your account. Trial for a first subscription only.");
});

test("C4 : un ancien abonne (Mon compte) ne voit jamais d'essai ni « 0 € aujourd'hui »", () => {
  // Composant : sansEssai coupe l'essai annonce par la disponibilite du serveur.
  const src = read("lib/offre-pro.js");
  assert.match(src, /var jours = opts\.sansEssai \? 0 : essaiOuvert\(etat\.dispo\);/);
  // Rendu sans essai (jours = 0) : ni bouton « 0 € aujourd'hui », ni date de premier prelevement d'essai.
  const h = OP.html({ mode: "paiement", contexte: "general", plans: PLANS, choisi: "month", jours: 0, connecte: true, uid: "anc", maintenant: MARDI });
  assert.doesNotMatch(h, /0 € aujourd’hui|Premier prélèvement|jours d’essai/);
  assert.match(h, /Payer 14,99 €/);
  // Mon compte : une ligne dans subscriptions (quel que soit son statut) = deja abonne une fois.
  assert.match(read("account-page.js"), /window\.IasharkOffrePro\.mount\(\$\('offreCompte'\), \{ mode: 'paiement', contexte: 'general', connecte: true, sansEssai: !!abo \}\);/);
  // Meme regle que le serveur : ancien abonne ou ancien essai, meme annule : pas d'essai.
  assert.match(read("supabase/functions/create-checkout-session/trial.ts"), /ancien abonne ou ancien essai, meme\n\/\/   annule : paiement direct, sans essai/);
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
  // Chemin du paiement (inscription?next=/abonnement.html?duree=...) : le bouton dit ou il mene (avocat du diable, 27/10/2026).
  const etape = js.slice(js.indexOf("function etapePaiement()"), js.indexOf("if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', etapePaiement)"));
  assert.match(etape, /fixer\('submit', t\('auth\.pay_step_submit', 'Créer mon compte et continuer'\)\);/);
  assert.match(html, /<button type="submit" id="submit"[^>]*data-i18n="auth\.signup_submit"/, "le bouton est bien celui que fixer('submit') retrouve");
  const CTA = { fr: "Créer mon compte et continuer", en: "Create my account and continue", es: "Crear mi cuenta y continuar", "es-mx": "Crear mi cuenta y continuar",
    de: "Konto erstellen und weiter", it: "Crea il mio account e continua", pt: "Criar a minha conta e continuar" };
  for (const l of Object.keys(CTA)) assert.equal(JSON.parse(read("i18n/dict/" + l + ".json")).auth.pay_step_submit, CTA[l], l);
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
// C3 : « Nos chances face a la cote » (affichage seulement), avec le controle trader-de-cotes du 27/10/2026 : jamais
// 1 / cote, jamais des cotes plus recentes que la publication, jamais la cote comparee a elle-meme.
const VM = require("../lib/match-view-model.js");
const P = require("../lib/pronostic.js");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];

test("C3 : chance tiree des cotes = rien a comparer ; chance du modele = comparee au chiffre sans marge de la publication", () => {
  const pro = (src, sm, id, ch) => ({ market_id: "under-25", cote_rec: "1.4", model_probability: ch == null ? 67 : ch, co25: "2.88", cu25: "1.40", pronostic: { market_id: id || "under-25", source_chance: src, sans_marge: sm } });
  const rien = { source: null, sansMarge: null, abaissee: null };
  assert.deepEqual(VM.comparaisonPari(pro("marche", 67.3)), { source: "marche", sansMarge: null, abaissee: null }, "la cote ne se compare pas a elle-meme");
  assert.deepEqual(VM.comparaisonPari(pro("marche", 67.3, null, 70)), { source: "modele", sansMarge: 67.3, abaissee: null }, "« marche » mais pas le chiffre des cotes : compare, jamais etiquete « tiree des cotes »");
  assert.deepEqual(VM.comparaisonPari(pro("marche", null)), rien, "« marche » sans chiffre publie (voie inconnue) : rien d'affirme");
  assert.deepEqual(VM.comparaisonPari(pro("modele", 67.3, null, 64)), { source: "modele", sansMarge: 67.3, abaissee: null });
  assert.deepEqual(VM.comparaisonPari(pro("modele", null)), { source: "modele", sansMarge: null, abaissee: null }, "publication plus ancienne : aucune comparaison (jamais les cotes du moment)");
  assert.deepEqual(VM.comparaisonPari(pro("modele", 55, "over-25")), rien, "pronostic d'un autre pari : jamais melange");
  assert.deepEqual(VM.comparaisonPari({ market_id: "under-25", cote_rec: "1.4", co25: "2.88", cu25: "1.40" }), rien, "origine inconnue : aucune comparaison");
  // La page ne retire plus aucune marge elle-meme : ni 1 / cote, ni paire d'issues, ni proportionnelle.
  const src = read("lib/match-view-model.js");
  const bloc = src.slice(src.indexOf("function comparaisonPari(raw)"), src.indexOf("function marketTable("));
  assert.doesNotMatch(bloc, /100 \/ |1 \/ |co25|cu25|cdc|sansMarge\(\[/);
  const vm = VM.buildMatchViewModel({ id: 1, date: "2026-10-27 20:45", home: { id: 1, n: "A" }, away: { id: 2, n: "B" }, data_quality_score: 80, model_output_available: true,
    p1: 48, pn: 27, p2: 25, market_id: "under-25", pari_rec: "Under 2.5", cote_rec: "1.4", model_probability: 64, co25: "2.88", cu25: "1.40",
    pronostic: { market_id: "under-25", source_chance: "modele", sans_marge: 67.3 } });
  assert.equal(vm.model.chanceSource, "modele");
  assert.equal(vm.model.recommendedImplied, 67.3);
  assert.equal(vm.model.recommendedEdge, -3.3);
  const row = vm.model.marketTable.find((r) => r.recommended);
  assert.deepEqual([row.market, row.chanceSource], [67.3, "modele"], "tableau : memes chiffres que la carte");
});

test("C3 : le calcul enregistre a la publication le chiffre sans marge qu'il a utilise (un champ en plus, rien d'autre)", () => {
  assert.equal(P.sansMargeUtilise({ q: 63.456, source_chance: "modele" }), 63.5);
  assert.equal(P.sansMargeUtilise({ brute: 61.04, source_chance: "marche" }), 61);
  assert.equal(P.sansMargeUtilise({ brute: 61, source_chance: "modele" }), null, "modele seul : aucun chiffre");
  assert.equal(P.sansMargeUtilise({ q: 0 }), null);
  const src = read("lib/pronostic.js");
  assert.match(src, /source_chance: b\.source_chance \|\| SOURCE_CHANCE\.MARCHE,\n[\s\S]{0,400}sans_marge: sansMargeUtilise\(b\),\n    \};/);
});

test("C3 : textes de la carte, dans les 7 langues, sans mot interdit", () => {
  const js = read("match-page.js");
  const carte = js.slice(js.indexOf("function signalCard(vm)"), js.indexOf("// Alertes d'absence du pipeline"));
  assert.doesNotMatch(carte, /100\s*\/\s*cote|1\s*÷/);
  assert.match(carte, /const source=vm\.model\.chanceSource===undefined\?null:vm\.model\.chanceSource;/);
  assert.match(js, /if\(r<=1\)return\{cls:'flat'/);
  assert.match(js, /const m=n\(o\.model\),k=o\.source==='marche'&&!ab\?null:marcheValide\(o\.market\)/, "chance tiree des cotes (non abaissee) : aucune barre bookmaker");
  const fr = JSON.parse(read("i18n/dict/fr.json")).match_page;
  assert.equal(fr.proba_market_chance_label, "Chance tirée des cotes du marché, marge retirée");
  assert.equal(fr.proba_model_label, "Notre calcul");
  assert.equal(fr.sig2_no_fair, "Cote du bookmaker : {odds}. Elle contient sa marge : on ne la compare pas à notre calcul.");
  for (const l of LOCALES) {
    const d = JSON.parse(read("i18n/dict/" + l + ".json")).match_page;
    for (const k of ["proba_model_label", "proba_market_label", "proba_market_chance_label", "proba_chance_label", "proba_gap_flat", "proba_gap_pos", "proba_gap_neg", "proba_help_implied",
      "sig2_plain", "sig2_plain_model", "sig2_plain_market", "sig2_plain_unknown", "sig2_market_only", "sig2_no_fair", "label_colon"]) {
      assert.ok(typeof d[k] === "string" && d[k].length, l + " " + k);
      assert.doesNotMatch(d[k], /esp[ée]rance|\bvalue\b|\bmise\b|\bstake\b|garanti[ e]/i, l + " " + k);
    }
  }
});

test("C3 : la phrase de methode du trader partout ; plus de « sans les cotes » ni de promesse d'ecart systematique", () => {
  const faux = /sans les cotes|sans jamais utiliser les cotes|never us(es|ing) the odds|without the odds|nunca usa|sin usar nunca|nie die Quoten|ohne jemals|non usa mai|senza mai|sem nunca|L’écart s’affiche même quand il te dessert|l’écart mesuré avec le prix du marché|l’écart détecté avec le marché réel|The gap shows even when it hurts you|so any gap between the two is visible/i;
  for (const d of ["fr", "en", "es", "gb", "mx", "za"]) {
    for (const f of ["index.html", "landing.html"]) if (fs.existsSync(path.join(ROOT, d, f))) assert.doesNotMatch(read(d + "/" + f), faux, d + "/" + f);
  }
  for (const d of ["fr", "en", "es", "gb", "mx", "za", "de", "it", "pt"]) assert.doesNotMatch(read("i18n/seo/" + d + ".json"), faux, d);
  const phrase = "La chance vient des cotes du marché, marge retirée, ou du plus prudent entre le modèle et ces cotes ; le pari retenu est la plus forte chance dans la fourchette 1,40-2,20.";
  assert.ok(read("fr/index.html").includes(phrase), "bloc « La méthode en bref » et FAQ");
  assert.ok(JSON.parse(read("i18n/seo/fr.json")).home.paragraphs[0].endsWith(phrase));
  // La fourchette citee est celle qui choisit le pari (lib/pronostic.js#choisirPariFourchette).
  assert.deepEqual(JSON.parse(read("config/leagues.json")).fiabilite.fourchette_pari, { cote_min: 1.4, cote_max: 2.2, marge_sans_agree: 0 });
  assert.match(read("lib/pronostic.js"), /const dedans = evalues\.filter\(function \(c\) \{ return c\.dedans; \}\)\.sort\(ordre\);/);
});

test("C3 : sur chaque marche du catalogue, meme regle (buteur, mi-temps et codes « F… » compris)", () => {
  const MP = require("../lib/marches-paris.js");
  const ids = Object.keys(MP.CATALOGUE).concat(["anytime-scorer-21393", "F29:No", "F5:Over 2.5"]);
  assert.ok(ids.length > 150, ids.length + " marches");
  // Cotes du releve presentes partout : la page ne s'en sert jamais pour comparer.
  const releve = { co15: "1.30", cu15: "3.40", co25: "1.90", cu25: "1.95", co35: "3.1", cu35: "1.35", cbtts: "1.7", cbtts_non: "2.1", c1: "2.1", cn: "3.3", c2: "3.6", cdc1x: "1.3", cdc2x: "1.7", cdc12: "1.3" };
  for (const id of ids) {
    const r = (pro, extra) => VM.comparaisonPari(Object.assign({ market_id: id, cote_rec: "1.6", model_probability: 58 }, releve, extra || {}, pro ? { pronostic: pro } : {}));
    const rien = { source: null, sansMarge: null, abaissee: null };
    assert.deepEqual(r({ market_id: id, source_chance: "modele", sans_marge: 58.4 }), { source: "modele", sansMarge: 58.4, abaissee: null }, id + " : chiffre de la publication");
    assert.deepEqual(r({ market_id: id, source_chance: "marche", sans_marge: 58.4 }), { source: "marche", sansMarge: null, abaissee: null }, id + " : la cote ne se compare pas a elle-meme");
    // Chance des cotes abaissee par prudence : les deux chiffres, jamais l'etiquette « tiree des cotes » sur 55.
    assert.deepEqual(r({ market_id: id, source_chance: "marche", sans_marge: 58.4 }, { model_probability: 55, chance_correction: { calculee: 58, points: -3 } }), { source: "marche", sansMarge: 58.4, abaissee: { points: 3 } }, id + " : abaissee");
    assert.deepEqual(r({ market_id: id, source_chance: "modele" }), { source: "modele", sansMarge: null, abaissee: null }, id + " : sans chiffre publie, aucune comparaison");
    assert.deepEqual(r(null), rien, id + " : origine inconnue");
    assert.deepEqual(r({ market_id: id === "over-25" ? "under-25" : "over-25", source_chance: "modele", sans_marge: 58.4 }), rien, id + " : pronostic d'un autre pari");
  }
});

// 2e controle trader-de-cotes du 27/10/2026 (ROUGE) : la chance des « moins de X buts » est abaissee de 3 points par
// prudence (lib/pronostic.js#alignerChancesAffichees) ; la page ecrivait « Chance tiree des cotes du marche, marge
// retiree : 62 % » alors que les cotes disaient 65 % (n° 1556693, moins de 3,5 buts a 1,50).
const MP_JS = read("match-page.js");
function duoBarsDeLaPage() {
  // duoBars et ses aides, tels quels, avec des traductions de repli (francais).
  const vmod = require("node:vm");
  const code = MP_JS.slice(MP_JS.indexOf("const marcheValide="), MP_JS.indexOf("// ---- Niveau public prob_band"));
  const n = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  const ctx = { Math, Number, String, Object, n,
    t: (k, fb) => fb,
    tf: (k, fb, v) => String(fb).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m)),
    esc: (x) => String(x), pct: (v) => (v === null ? "—" : Math.round(v) + " %"), clamp: (v) => Math.max(0, Math.min(100, v || 0)),
    odds: (c) => Number(c).toFixed(2).replace(".", ",") };
  vmod.createContext(ctx);
  vmod.runInContext(code + "\nthis.duoBars = duoBars;", ctx);
  return ctx.duoBars;
}
const texteDe = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("C3 : chance abaissee par prudence (comme n° 1556693) : les deux chiffres, jamais « tiree des cotes » sur le chiffre abaisse", () => {
  // Donnees du 27/10 (match_premium_data) : moins de 3,5 buts a 1,50, chance 62, avant prudence 65, voie « cotes du marche ».
  const raw = (pro) => ({ id: 1556693, date: "2026-10-27 20:45", home: { id: 1, n: "A" }, away: { id: 2, n: "B" }, data_quality_score: 80, model_output_available: true,
    p1: 40, pn: 30, p2: 30, market_id: "under-35", pari_rec: "Under 3.5", cote_rec: "1.5", model_probability: 62, conf: 6.2,
    chance_correction: { calculee: 65, points: -3, source: "Verdict du mathematicien du 06/10/2026" }, pronostic: Object.assign({ market_id: "under-35", source_chance: "marche", moteur: "cotes_marche", chance: 62 }, pro || {}) });
  // Publication d'avant ce controle (sans pronostic.sans_marge) : le chiffre des cotes = la chance avant prudence (voie des cotes).
  assert.deepEqual(VM.comparaisonPari(raw()), { source: "marche", sansMarge: 65, abaissee: { points: 3 } });
  // Publication suivante (sans_marge enregistre) : le meme affichage, avec le chiffre publie.
  assert.deepEqual(VM.comparaisonPari(raw({ sans_marge: 65.2 })), { source: "marche", sansMarge: 65.2, abaissee: { points: 3 } });
  // Voie du moteur v3 sans chiffre publie : rien d'affirme sur l'origine, seulement la prudence.
  assert.deepEqual(VM.comparaisonPari(raw({ moteur: "v3" })), { source: null, sansMarge: null, abaissee: { points: 3 } });
  const vm = VM.buildMatchViewModel(raw());
  assert.deepEqual([vm.model.chanceSource, vm.model.recommendedImplied, vm.model.chanceLowered], ["marche", 65, { points: 3 }]);
  const row = vm.model.marketTable.find((r) => r.recommended);
  assert.deepEqual([row.model, row.market, row.chanceSource, row.chanceLowered], [62, 65, "marche", { points: 3 }], "tableau : memes chiffres que la carte");
  // Rendu de la carte (duoBars de match-page.js) : deux barres, la phrase de prudence, jamais « Chance tiree des cotes ».
  const duo = duoBarsDeLaPage();
  const carte = texteDe(duo({ model: 62, market: 65, odds: 1.5, edge: -3, kind: "odds", source: "marche", abaissee: { points: 3 } }));
  assert.match(carte, /Notre chance, abaissée par prudence 62 %/);
  assert.match(carte, /Cotes du marché, marge retirée 1,50 → 65 %/);
  assert.match(carte, /Par prudence, nous affichons 3 points de moins que les cotes du marché sur ce type de pari\./);
  assert.doesNotMatch(carte, /Chance tirée des cotes|Le bookmaker voit plus/);
  // Sans prudence : une seule barre, « tiree des cotes » (chiffre egal a celui des cotes).
  const seul = texteDe(duo({ model: 65, market: null, odds: 1.5, kind: "odds", source: "marche", sansMarge: "Cette chance vient des cotes du marché : pas d’écart à montrer." }));
  assert.match(seul, /^Chance tirée des cotes du marché, marge retirée 65 %/);
  assert.doesNotMatch(seul, /Cotes du marché, marge retirée/);
  // Prudence sans chiffre des cotes : la barre le dit, aucune barre bookmaker inventee.
  const sansChiffre = texteDe(duo({ model: 62, market: null, odds: 1.5, kind: "odds", source: null, abaissee: { points: 3 }, sansMarge: "Abaissée de 3 points par prudence sur ce type de pari." }));
  assert.match(sansChiffre, /^Notre chance, abaissée par prudence 62 % Abaissée de 3 points par prudence sur ce type de pari\.$/);
  // La phrase « Sur 100 matchs » nomme le chiffre qu'elle cite : la chance abaissee, puis celui des cotes.
  const carteJs = MP_JS.slice(MP_JS.indexOf("function signalCard(vm)"), MP_JS.indexOf("// Alertes d'absence du pipeline"));
  assert.match(carteJs, /const plain=prob===null\?''\n    :ab&&implied!==null\?tf\('match_page\.sig2_plain_lowered'/);
  assert.match(carteJs, /:ab\?tf\('match_page\.sig2_plain_lowered_only'/);
  const fr = JSON.parse(read("i18n/dict/fr.json")).match_page;
  assert.equal(fr.sig2_plain_lowered.replace("{model}", 62).replace("{market}", 65), "Sur 100 matchs comme celui-ci, ce pari passerait environ 62 fois selon notre chance, abaissée par prudence ; les cotes du marché, marge retirée, en supposent 65.");
  for (const l of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(read("i18n/dict/" + l + ".json")).match_page;
    for (const k of ["proba_lowered_label", "proba_market_odds_label", "proba_lowered_gap", "sig2_plain_lowered", "sig2_plain_lowered_only", "sig2_lowered_note"]) assert.ok(typeof d[k] === "string" && d[k].length, l + " " + k);
    assert.match(d.sig2_plain_lowered, /\{model\}[\s\S]*\{market\}/, l);
    assert.match(d.proba_lowered_gap, /\{gap\}/, l);
  }
});

test("C3 : voie du moteur v3 inchangee (controle trader 27/10 : le moteur ne bouge pas, c'est la page qui compare les chiffres)", () => {
  const P3 = require("../lib/pronostic.js");
  const CFG = JSON.parse(read("config/leagues.json"));
  const V = "vérifié sur le passé";
  // Arsenal - Burnley a 1,45 / 4,60 / 7,50 : victoire d'Arsenal a 67,7 % sans marge (lib/pronostic.js#sansMargeDesCotes).
  const publier = (ch) => {
    const m = { id: 200, league_key: "premier", league_id: 39, league: "Premier League", league_reliability: "validee", date: "2026-10-30 20:45",
      home: { n: "Arsenal", id: 42 }, away: { n: "Burnley", id: 44 }, c1: "1.45", cn: "4.60", c2: "7.50", cdc1x: "1.10", cdc2x: "3.00", cdc12: "1.20", co25: "1.30", cu25: "3.40",
      pari_rec: "", market_id: null, no_signal: true, data_quality_score: 60, moteur_v3: { source: "v3" }, v3_fiabilite: { couverture: "vérifiée" },
      v3_marches: [{ cle: "1N2:1", market_id: "home-win", probabilite: 72, fiabilite_marche: V, etiquette: V }, { cle: "DC:1N", market_id: "dc-1x", probabilite: 86.5, fiabilite_marche: V, etiquette: V }] };
    P3.publierPronostics([m], [], { configLigues: CFG, figes: {}, chancesV3Par: { 200: { marches: { "1N2:1": ch, "DC:1N": 84 } } } });
    return [m.market_id, m.model_probability, m.pronostic.moteur, m.pronostic.source_chance, m.pronostic.sans_marge];
  };
  // Chance du Canal Pro 70, cotes sans marge 67,7 : source_chance reste « marche » (regle du moteur inchangee : la passer a
  // « modele » declenchait la correction Argentine double chance -13 et changeait le pari retenu). L'affichage
  // (lib/match-view-model.js#comparaisonPari) voit 70 =/= 67,7 sans prudence et presente une chance calculee, comparee aux cotes.
  assert.deepEqual(publier(70), ["home-win", 70, "v3", "marche", 67.7]);
  // Chance 68 = le chiffre des cotes (meme entier) : « marche ».
  assert.deepEqual(publier(68), ["home-win", 68, "v3", "marche", 67.7]);
  // Chance 66, sous les cotes : « modele » (inchange).
  assert.deepEqual(publier(66), ["home-win", 66, "v3", "modele", 67.7]);
  assert.match(read("lib/pronostic.js"), /const sourceChance = q !== null && q > 0 && q < 100 && Math\.round\(q\) <= Math\.round\(ch\) \? SOURCE_CHANCE\.MARCHE : SOURCE_CHANCE\.MODELE;/);
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
  const b = (g, p, e, jour, a) => ({ jour: jour || "2026-10-26", paris_simples: { jour: jour || "2026-10-26", gagnes: g, perdus: p, annules: a || 0, en_attente: e || 0 } });
  assert.equal(OP.lignePreuve(b(7, 3), MARDI_MATIN), "Hier, publiés avant les matchs : <b>7 gagnés</b>, <b>3 perdus</b>.");
  assert.equal(OP.lignePreuve(b(1, 0), MARDI_MATIN), "Hier, publiés avant les matchs : <b>1 gagné</b>, <b>0 perdu</b>.");
  assert.equal(OP.lignePreuve(b(67, 32, 1), MARDI_MATIN), "Hier, publiés avant les matchs : <b>67 gagnés</b>, <b>32 perdus</b>, <b>1 en attente de résultat</b>.");
  // Annules dits des qu'il y en a (controle historique-public du 27/10/2026).
  assert.equal(OP.lignePreuve(b(64, 46, 0, null, 2), MARDI_MATIN), "Hier, publiés avant les matchs : <b>64 gagnés</b>, <b>46 perdus</b>, <b>2 annulés</b>.");
  assert.equal(OP.lignePreuve(b(5, 2, 12, null, 1), MARDI_MATIN), "Hier, publiés avant les matchs : <b>5 gagnés</b>, <b>2 perdus</b>, <b>1 annulé</b>, <b>12 en attente de résultat</b>.");
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
    for (const k of ["line", "won_one", "won_other", "lost_one", "lost_other", "void_one", "void_other", "pending_one", "pending_other"]) assert.ok(d && d[k], l + " " + k);
    assert.ok(d.line.includes("{list}"), l + " : gabarit");
    assert.doesNotMatch(JSON.stringify(d), /%|garanti|gain|esp[ée]rance/i, l);
  }
});
