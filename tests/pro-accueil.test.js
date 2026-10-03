"use strict";
// Espace Pro : formulaire d'accueil, tableau de bord personnel (gratuit et
// Pro), essai. Ronde 2 du contre-controle de l'avocat du diable (30/09/2026) :
// contrat des tables de la branche canal-pro (0040), un test par cas prouve.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DIRS = ["fr", "en", "es", "gb", "mx", "za"];
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
const CONTRAT = JSON.parse(read("tests/fixtures/contrat-pro-tables.json"));
// Fusion V3 (30/09/2026) : la migration 0040 du Canal Pro est dans ce depot ; sinon, la copie iashark-canal-pro.
const CANAL_PRO = fs.existsSync(path.join(ROOT, "supabase/migrations/0040_canal_pro.sql")) ? ROOT : path.join(ROOT, "..", "iashark-canal-pro");
const P = require("../lib/pro-preferences.js");
const M = require("../lib/pro-dashboard-model.js");
const get = (d, k) => k.split(".").reduce((o, x) => o && o[x], d);

/* ---------------- Bookmakers et preferences (pro_preferences, 0040) ---------------- */

test("bookmakers : copie publiee = config (date comprise), seulement les 5 suivis parmi les agrees ANJ", () => {
  const { donneesPubliques } = require("../scripts/sync-bookmakers.js");
  assert.deepEqual(P.donneesAgrees(), donneesPubliques(), "lancer node scripts/sync-bookmakers.js");
  const conf = JSON.parse(read("config/bookmakers-agrees.json"));
  // « Liste verifiee le » = date de la config (controle 30/09 : le site disait 30/09, la config 29/09).
  assert.equal(P.VERIFIE_LE, conf.verifie_le);
  assert.equal(conf.pays.fr.regulateur, "ANJ");
  assert.deepEqual(P.bookmakersDuPays("fr").map((b) => b.id).sort(), ["betclic", "netbet", "pmu", "unibet", "winamax"]);
  const agrees = conf.pays.fr.bookmakers.map((b) => b.id);
  P.bookmakersDuPays("fr").forEach((b) => assert.ok(agrees.includes(b.id), b.id));
  // Pays pas encore ouverts : aucune liste devinee, aucun nom francais.
  ["gb", "mx", "za", "autre"].forEach((c) => {
    assert.deepEqual(P.bookmakersDuPays(c), [], c);
    assert.equal(P.paysOuvert(c), false, c);
    assert.equal(P.nomBookmaker("winamax", c), null, c + " : jamais un bookmaker francais");
  });
  assert.equal(P.nomBookmaker("winamax", "fr"), "Winamax");
});

test("preferences : colonnes et valeurs = contrat de pro_preferences (0040), rien d'autre n'est envoye", () => {
  const c = CONTRAT.pro_preferences;
  assert.equal(P.TABLE, "pro_preferences");
  assert.deepEqual(["user_id"].concat(P.COLONNES, ["created_at", "updated_at"]).sort(), c.colonnes.slice().sort());
  assert.deepEqual(P.PAYS, c.pays);
  assert.deepEqual(P.FAMILLES, c.familles);
  assert.deepEqual(P.ALERTES.concat(["nuit"]), c.alertes);
  assert.equal(P.LIMITE_MAX, c.limite_paris_jour.max);
  // 0044 (02/10/2026) : types de paris et heure d'envoi, memes valeurs que la migration.
  assert.deepEqual(P.MARCHES, c.marches);
  const sql44 = read("supabase/migrations/0044_pro_langue.sql");
  assert.match(sql44, new RegExp("marches <@ array\\[" + c.marches.map((m) => "'" + m + "'").join(", ") + "\\]"));
  assert.match(sql44, new RegExp("heure_envoi between " + c.heure_envoi.min + " and " + c.heure_envoi.max));
  assert.match(sql44, new RegExp("pays in \\(" + c.pays.map((x) => "'" + x + "'").join(", ") + "\\)"));
  P.HEURES_ENVOI.forEach((h) => assert.ok(h === null || (h >= c.heure_envoi.min && h <= c.heure_envoi.max), "heure proposee " + h));
  assert.deepEqual(P.COLONNES_BASE.concat(P.COLONNES_0044), P.COLONNES);
  const d = P.normaliser({});
  assert.equal(d.strategie, "iashark");
  assert.equal(d.limite_paris_jour, c.limite_paris_jour.defaut);
  assert.deepEqual(d.familles, c.familles_defaut);
  assert.deepEqual(d.alertes, c.alertes_defaut, "nuit coupee par defaut");
  assert.equal(d.programme_prive, c.programme_prive_defaut);
  const ligne = P.versLigne({ pays: "fr", bookmakers: ["winamax"], perte_max_jour: 50, canal: "site", termine_le: "x", point_de_vente: true }, "u1");
  assert.deepEqual(Object.keys(ligne).sort(), ["user_id"].concat(P.COLONNES).sort(), "seules les colonnes du contrat partent");
});

test("preferences : un bookmaker non suivi, non agree ou d'un autre pays n'est jamais enregistre", () => {
  assert.deepEqual(P.normaliser({ pays: "fr", bookmakers: ["winamax", "stake", "bet365", "winamax", "<script>"] }).bookmakers, ["winamax"]);
  assert.deepEqual(P.normaliser({ pays: "gb", bookmakers: ["winamax"] }).bookmakers, []);
  // 03/10/2026 : plus de choix de types de paris (memes paris pour tous) : toujours la valeur par defaut.
  assert.deepEqual(P.normaliser({ familles: ["chasseur_nuls", "nuls"] }).familles, P.FAMILLES);
});

test("formulaire : les cles d'erreur de lib/pro-preferences.js sont celles qu'attend pro-onboarding.js (cas prouve)", () => {
  const onb = read("pro-onboarding.js");
  const m = onb.match(/var ERREURS_ETAPE = (\{[^;]*\});/);
  assert.ok(m, "ERREURS_ETAPE introuvable");
  const etapes = Function("return " + m[1])();
  const ok = { pays: "fr", limite_paris_jour: 5 };
  assert.deepEqual(P.erreurs(ok), []);
  assert.deepEqual(P.erreurs({ ...ok, limite_paris_jour: 60 }), ["limite_paris_jour"]);
  assert.ok(!("garde_fou" in etapes), "plus d'etape garde-fou dans le questionnaire");
  assert.ok(!("strategie" in etapes), "plus d'etape strategie (03/10/2026)");
  assert.equal(P.versLigne({ ...ok, limite_paris_jour: 60 }, "u1").limite_paris_jour, 5);
  assert.deepEqual(P.erreurs({ ...ok, limite_paris_jour: -1 }), ["limite_paris_jour"]);
  assert.deepEqual(P.erreurs({ ...ok, limite_paris_jour: 0 }), [], "0 = plus rien de la journee, autorise");
  ["pays", "limite_paris_jour"].forEach((k) => LOCALES.forEach((l) => assert.ok(get(DICTS[l], "pro_onboarding.err_" + k), l + " err_" + k)));
  assert.match(DICTS.fr.pro_onboarding.err_limite_paris_jour, /0 et 50/);
});

test("preferences : plus de strategie ni de types de paris (03/10/2026) : la ligne envoyee dit toujours « iashark », sans cote minimum", () => {
  const l = P.versLigne({ pays: "fr", strategie: "perso", cote_min_perso: "2,00", familles: ["valeur"] }, "u");
  assert.deepEqual([l.strategie, l.cote_min_perso, l.familles], ["iashark", null, P.FAMILLES]);
  assert.deepEqual(P.choixNonTestes({ strategie: "perso", cote_min_perso: 2, familles: ["valeur"] }), []);
});

/* ---------------- Calculs du tableau de bord ---------------- */

const JOUR = "2026-10-03T10:00:00Z"; // samedi, 12 h a Paris
const paris = [
  { id: 1, status: "won", stake: 10, odds: 2.0, famille: "valeur", created_at: "2026-09-21T10:00:00Z", kickoff_at: "2026-09-21T18:00:00Z", match_label: "A – B" },
  { id: 2, status: "lost", stake: 10, odds: 3.4, famille: "nuls", created_at: "2026-09-22T10:00:00Z", kickoff_at: "2026-09-22T18:00:00Z", match_label: "C – D" },
  { id: 3, status: "void", stake: 10, odds: 1.5, famille: "sure", created_at: "2026-09-23T10:00:00Z", kickoff_at: "2026-09-23T18:00:00Z", match_label: "E – F" },
  { id: 4, status: "won", stake: 20, odds: 1.5, famille: "sure", created_at: "2026-09-27T10:00:00Z", kickoff_at: "2026-09-27T18:00:00Z", match_label: "G – H" },
  { id: 5, status: "lost", stake: 15, odds: 2.1, created_at: "2026-10-03T08:00:00Z", kickoff_at: "2026-10-03T09:00:00Z", match_label: "I – J" },
  { id: 6, status: "pending", stake: 10, odds: 1.9, created_at: "2026-10-03T09:00:00Z", kickoff_at: "2026-10-03T19:00:00Z", match_label: "K – L" }
];

test("tableau de bord : chaque fonction du modele et des preferences appelee par la page existe (cas prouve : M.qualiteCotes)", () => {
  // Controle du 30/09 : pro-dashboard.js appelait M.qualiteCotes et
  // M.meilleursBookmakers, retirees du modele -> « TypeError » pour tous les abonnes Pro.
  const compte = read("account-page.js");
  const reglages = compte.slice(compte.indexOf("function reglagesPro()"), compte.indexOf("/* ---------- Charpente"));
  const appels = (js, re) => [...new Set([...js.matchAll(re)].map((m) => m[1]))];
  // M = lib/pro-dashboard-model.js dans pro-dashboard.js ; P = lib/pro-preferences.js.
  appels(read("pro-dashboard.js"), /\bM\.([A-Za-z_]+)/g).forEach((f) => assert.ok(f in M, "M." + f + " n'existe pas dans lib/pro-dashboard-model.js"));
  appels(read("pro-dashboard.js") + read("pro-onboarding.js") + reglages, /\bP\.([A-Za-z_]+)/g).forEach((f) => assert.ok(f in P, "P." + f + " n'existe pas dans lib/pro-preferences.js"));
  assert.doesNotMatch(read("pro-dashboard.js"), /qualiteCotes|meilleursBookmakers|auDessusCoteFin/);
});

test("tableau de bord : aucune ancienne table (preferences_pro, contenus_pro, alertes_pro) ni « select * » sur une table Pro", () => {
  ["pro-dashboard.js", "account-page.js", "pro-onboarding.js", "tools-page.js"].forEach((f) => {
    const js = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(js, /preferences_pro|contenus_pro|alertes_pro/, f);
    assert.doesNotMatch(js, /from\((?:'|")(?:pro_preferences|pro_programmes|pro_paris|pro_tickets)(?:'|")\)\.select\((?:'|")\*(?:'|")\)/, f + " : select * interdit");
  });
  const dash = read("pro-dashboard.js");
  assert.match(dash, /sb\.from\(P\.TABLE\)\.select\(P\.COLONNES\.join\(','\)\)/);
  assert.match(dash, /sb\.from\('pro_programmes'\)\.select\(M\.COLONNES_PROGRAMME\)/);
  assert.match(dash, /sb\.from\('pro_paris'\)\.select\(M\.COLONNES_PARIS\)/);
  assert.match(dash, /sb\.from\('pro_tickets'\)\.select\(M\.COLONNES_TICKETS\)/);
  // Colonnes lues = colonnes que la base laisse lire au site (grant de 0040).
  assert.deepEqual(M.COLONNES_PROGRAMME.split(",").sort(), CONTRAT.pro_programmes.lisibles.slice().sort());
  M.COLONNES_PARIS.split(",").forEach((c) => assert.ok(CONTRAT.pro_paris.lisibles.includes(c), "pro_paris." + c + " n'est pas lisible par le site"));
  // Tri : seulement par une colonne lisible (rang ne l'est pas).
  [...dash.matchAll(/from\('pro_paris'\)[^\n]*?\.order\('(\w+)'/g)].forEach((m) => assert.ok(CONTRAT.pro_paris.lisibles.includes(m[1]), "tri par " + m[1]));
  assert.deepEqual(M.MOTIFS_VIDE, CONTRAT.pro_programmes.motif_vide);
});

test("contrat : la copie du contrat = la migration 0040 de la branche canal-pro (quand elle est sur la machine)", { skip: !fs.existsSync(path.join(CANAL_PRO, "supabase/migrations/0040_canal_pro.sql")) && "copie iashark-canal-pro absente" }, () => {
  const sql = fs.readFileSync(path.join(CANAL_PRO, "supabase/migrations/0040_canal_pro.sql"), "utf8");
  const bloc = (re) => { const m = sql.match(re); assert.ok(m, String(re)); return m[1].split(",").map((x) => x.trim()).filter(Boolean); };
  assert.deepEqual(bloc(/grant select \(([^)]*)\) on public\.pro_paris to authenticated/).sort(), CONTRAT.pro_paris.lisibles.slice().sort());
  assert.deepEqual(bloc(/grant select \(([^)]*)\) on public\.pro_programmes to authenticated/).sort(), CONTRAT.pro_programmes.lisibles.slice().sort());
  const motifs = sql.match(/motif_vide in \(([^)]*)\)/);
  assert.ok(motifs);
  assert.deepEqual(motifs[1].replace(/'/g, "").split(",").map((x) => x.trim()), CONTRAT.pro_programmes.motif_vide);
  assert.match(sql, /pays text not null default 'fr' check \(pays in \('fr','gb','mx','za','autre'\)\)/);
  assert.match(sql, /limite_paris_jour int not null default 5 check \(limite_paris_jour between 0 and 50\)/);
  assert.match(sql, /cote_min_perso numeric check \(cote_min_perso is null or \(cote_min_perso > 1 and cote_min_perso <= 50\)\)/);
  assert.match(sql, /grant select on public\.pro_tickets to authenticated;/, "le site lit SES tickets (garde-fou)");
  // Textes des jours sans pari : ceux du robot.
  const mjs = fs.readFileSync(path.join(CANAL_PRO, "supabase/functions/_shared/canal-pro.mjs"), "utf8");
  Object.entries(CONTRAT.pro_programmes.motifs_vide_fr).forEach(([k, v]) => {
    assert.ok(mjs.includes(k + ': "' + v + '"'), "MOTIFS_VIDE." + k + " different du robot");
    assert.equal(DICTS.fr.pro_space["motif_" + k], v, "texte affiche du motif " + k);
  });
});

test("tableau de bord : « Aujourd'hui » = programme publie (pro_programmes + pro_paris), jamais une cote inventee", () => {
  const prog = [{ jour: "2026-10-03", statut: "publie", mode: "ouvert", motif_vide: null }];
  const lignes = [
    { id: "b", numero: 12, jour: "2026-10-03", famille: "valeur", dom: "C", ext: "D", coup_envoi: "2026-10-03T19:00:00Z", marche: "1X", selection: "C ou nul", cote_min: 1.4, cotes: { winamax: 1.5, betclic: "x", stake: 9 }, cote_vue_at: "2026-10-03T07:00:00Z", compo_voyant: "À SURVEILLER" },
    { id: "a", numero: 11, jour: "2026-10-03", famille: "sure", dom: "A", ext: "B", coup_envoi: "2026-10-03T15:00:00Z", marche: "1", selection: "A", cote_min: 1.3, cotes: { unibet: 1.35 }, compo_voyant: "CONFIRMÉ" }
  ];
  const r = M.programmeDuJour(prog, lignes, new Date(JOUR));
  assert.equal(r.etat, "paris");
  assert.deepEqual(r.paris.map((p) => p.ref), ["PRO-11", "PRO-12"], "tries par coup d'envoi, nommes PRO-<numero>");
  assert.deepEqual(r.paris[1].cotes, { winamax: { cote: 1.5, releve_le: "2026-10-03T07:00:00Z" }, stake: { cote: 9, releve_le: "2026-10-03T07:00:00Z" } }, "cote illisible ecartee");
  assert.equal(r.paris[1].cote_calculee, true, "double chance : cote calculee");
  assert.equal(r.paris[1].composition, "a_surveiller");
  assert.equal(r.paris[0].composition, "confirme");
  assert.equal(M.programmeDuJour([], lignes, new Date(JOUR)).etat, "aucun");
  assert.equal(M.programmeDuJour([{ ...prog[0], mode: "rodage" }], lignes, new Date(JOUR)).etat, "aucun", "jamais le rodage");
  const vide = M.programmeDuJour([{ ...prog[0], motif_vide: "aucun_match" }], [], new Date(JOUR));
  assert.deepEqual([vide.etat, vide.motif], ["vide", "aucun_match"]);
  // Avant midi (Paris), le programme de la veille couvre encore les matchs.
  assert.deepEqual(M.joursDuProgramme(new Date("2026-10-03T08:00:00Z")), ["2026-10-03", "2026-10-02"]);
  assert.deepEqual(M.joursDuProgramme(new Date(JOUR)), ["2026-10-03"]);
});

test("tableau de bord : meilleure cote chez SES bookmakers de SON pays ; hors de France, aucun bookmaker (cas prouve)", () => {
  const pari = M.pariDuProgramme({ cote_min: 3.2, cotes: { winamax: 3.3, betclic: 3.15, unibet: 3.45, stake: 4.0 } });
  const suivis = P.bookmakersDuPays("fr").map((b) => b.id);
  const r = M.pariPourMoi(pari, ["winamax", "betclic"], suivis);
  assert.equal(r.chezMoi.id, "winamax");
  assert.equal(r.jouable, true);
  assert.equal(r.marche.id, "unibet", "jamais un bookmaker non suivi ou non agree (stake)");
  assert.equal(r.ailleursMieux, true);
  assert.equal(M.pariPourMoi(pari, ["betclic"], suivis).jouable, false);
  // Cote minimum perso : compte seulement si elle depasse celle du pari (comme le robot).
  assert.equal(M.pariPourMoi(pari, ["winamax"], suivis, { strategie: "perso", cote_min_perso: 3.4 }).jouable, false);
  assert.equal(M.coteMinPourMoi(pari, { strategie: "perso", cote_min_perso: 2 }), 3.2);
  // Royaume-Uni (liste vide) : ni « chez moi » ni « marche », meme avec des cotes francaises.
  const gb = M.pariPourMoi(pari, ["winamax"], P.bookmakersDuPays("gb").map((b) => b.id));
  assert.equal(gb.chezMoi, null);
  assert.equal(gb.marche, null);
  assert.equal(M.pariPourMoi(pari, ["winamax"], null).chezMoi, null, "liste absente = aucun bookmaker");
  // La page passe toujours la liste du pays (bouton « Je l'ai joue » compris).
  const js = read("pro-dashboard.js");
  const appels = [...js.matchAll(/M\.pariPourMoi\(([^;]*?)\);/g)].map((m) => m[1]);
  assert.ok(appels.length >= 2);
  appels.forEach((a) => assert.match(a, /agreesDuPays\(\)/, "pariPourMoi(" + a + ")"));
  assert.match(js, /function nomBk\(id\) \{ return \(id && P\.nomBookmaker\(id, prefs\(\)\.pays\)\) \|\| ''; \}/, "nom cherche seulement dans la liste du pays");
  assert.match(js, /if \(!paysOuvert\(\)\) contenu \+= vide\(tr\('pro_space\.country_closed'\)\)/);
  assert.match(js, /bookmaker: P\.bookmakersValides\(prefs\(\)\.pays, \[/, "journal : bookmaker du pays seulement");
});

test("tableau de bord : gain d'un pari (gagne, perdu, rembourse, en cours)", () => {
  assert.equal(M.gain(paris[0]), 10);
  assert.equal(M.gain(paris[1]), -10);
  assert.equal(M.gain(paris[2]), 0);
  assert.equal(M.gain(paris[5]), null);
  assert.equal(M.gain({ status: "won", result_pnl: 7.5, stake: 10, odds: 2 }), 7.5, "le reglement enregistre prime");
});

test("garde-fou : journal du jour + tickets Telegram pas encore dans le journal ; jamais « meme regle que le robot » (cas prouve)", () => {
  const g = M.gardeFou({ limite_paris_jour: 2 }, paris, new Date(JOUR));
  assert.equal(g.parisNotes, 2);
  assert.equal(g.perteDuJour, 15);
  assert.equal(g.atteint, true);
  assert.equal(M.gardeFou({ limite_paris_jour: 5 }, paris, new Date(JOUR)).atteint, false, "la perte n'est pas une limite");
  assert.equal(M.gardeFou({ limite_paris_jour: 0 }, [], new Date(JOUR)).atteint, true, "0 = plus rien de la journee");
  assert.equal(M.gardeFou({ limite_paris_jour: 99 }, [], new Date(JOUR)).parisMax, 5, "hors de 0..50 : defaut");
  const tickets = [
    { jour: "2026-10-03", statut: "note", decision_id: null },
    { jour: "2026-10-03", statut: "note", decision_id: 6 },
    { jour: "2026-10-03", statut: "a_confirmer", decision_id: null },
    { jour: "2026-10-02", statut: "note", decision_id: null }
  ];
  const t = M.gardeFou({ limite_paris_jour: 3 }, paris, new Date(JOUR), null, tickets);
  assert.deepEqual([t.duJournal, t.deTelegram, t.parisNotes, t.atteint], [2, 1, 3, true], "un ticket deja dans le journal n'est pas compte deux fois");
  // Textes : aucune phrase ne pretend que le site et le robot comptent pareil.
  const code = read("pro-dashboard.js") + read("lib/pro-dashboard-model.js");
  assert.doesNotMatch(code.replace(/meme calcul que le robot/g, ""), /m[eê]me r[eè]gle que le robot/i);
  LOCALES.forEach((l) => {
    const ps = DICTS[l].pro_space;
    assert.ok(ps.guard_count_both.includes("{journal}") && ps.guard_count_both.includes("{telegram}"), l);
    assert.ok(ps.guard_robot_note && ps.guard_count_site, l);
  });
  assert.match(DICTS.fr.pro_space.guard_robot_note, /seulement les tickets notés dans Telegram/);
  assert.doesNotMatch(DICTS.fr.pro_onboarding.guard_help, /Quand tu l'atteins, le robot ne t'envoie plus rien/);
});

test("controle des chiffres publics (30/09/2026) : espace Pro sans mise, sans cagnotte, sans gains, sans taux ; journal = match, pari, cote, resultat", async () => {
  const js = read("pro-dashboard.js");
  const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /fpMise|label_stake|results_|week_img|bilan_text|bilan_title|guard_loss|chart_aria|argent\(|blocBilan|blocSemaine|dessinerCourbe|dessinerSemaine/);
  // La colonne stake reste obligatoire en base (0010) : valeur fixe, jamais saisie ni affichee.
  assert.match(code, /stake: 1,/);
  LOCALES.forEach((l) => {
    const ps = DICTS[l].pro_space;
    ["label_stake", "results_capital", "results_gain", "results_rate", "results_yield", "week_img_gain", "week_img_best", "bilan_text", "guard_loss_label"].forEach((k) => assert.equal(ps[k], undefined, l + " : " + k));
    assert.doesNotMatch(JSON.stringify(ps), /archive vérifiée|verified archive/i, l);
  });
  const { html } = await rendreTableau({ pro: true, pays: "fr", donnees: baseDonnees("fr") });
  assert.match(html, /id="bParis"/);
  assert.doesNotMatch(html, /€|Cagnotte|Réussite|Rendement|Gains|id="fpMise"/);
  const gratuit = await rendreTableau({ pro: false, dir: "fr", donnees: { ...baseDonnees("fr"), pro_preferences: () => ({ data: null, error: null }) } });
  assert.doesNotMatch(gratuit.html, /€|Cagnotte|Réussite|Rendement|id="fpMise"|id="bBilan"/);
});

test("plus aucune mise conseillee (decision de Clement du 30/09/2026 : il n'est pas conseiller)", () => {
  assert.equal(M.PART_MISE, undefined);
  assert.equal(M.miseConseillee, undefined);
  const js = read("pro-dashboard.js");
  assert.doesNotMatch(js, /guard_stake|miseConseillee|PART_MISE/, "garde-fou : plus de case « Mise conseillee »");
  assert.doesNotMatch(js, /profil_risque/);
  LOCALES.forEach((l) => assert.doesNotMatch(DICTS[l].pro_onboarding.guard_capital_help, /mise|stake|importe|monto|Einsatz|puntata|montante/i, l + " : la cagnotte ne sert plus a une mise"));
});

test("tableau de bord : bilan (seulement les paris de l'abonne), serie, par strategie, courbe", () => {
  const b = M.bilan(paris, 500);
  assert.equal(b.total, 6);
  assert.equal(b.regles, 5);
  assert.equal(b.gagnes, 2);
  assert.equal(b.perdus, 2);
  assert.equal(b.reussite, 50);
  assert.equal(b.gain, -5); // +10 -10 +0 +10 -15
  assert.equal(b.capital, 495);
  assert.deepEqual(b.serie, { type: "lost", n: 1 });
  assert.equal(b.parFamille.sure.gain, 10);
  assert.equal(b.parFamille.nuls.gain, -10);
  assert.equal(b.parFamille.perso.gain, -15);
  assert.equal(b.points.length, 5);
  assert.equal(b.points[b.points.length - 1].valeur, 495);
});

test("tableau de bord : ses choix filtrent, les paris de notre strategie restent visibles a cote", () => {
  const prog = [{ famille: "valeur" }, { famille: "sure" }, { famille: "nuls" }];
  assert.equal(M.selonMesChoix(prog, { strategie: "iashark" }).pourMoi.length, 3);
  const s = M.selonMesChoix(prog, { strategie: "perso", familles: ["valeur", "nuls"] });
  assert.equal(s.pourMoi.length, 2);
  assert.equal(s.horsChoix.length, 1);
});

test("tableau de bord : ma semaine en image = la semaine derniere, lundi a dimanche, sans « cote de fin »", () => {
  const s = M.semaineEnImage(paris, new Date(JOUR));
  assert.equal(s.debut, "2026-09-21");
  assert.equal(s.fin, "2026-09-27");
  assert.equal(s.paris, 4);
  assert.equal(s.gain, 10);
  assert.equal(s.meilleureCote.cote, 2.0);
  assert.doesNotMatch(read("pro-dashboard.js"), /week_img_above/);
});

test("tableau de bord : qualite des cotes et alertes = « Bientot », aucun chiffre sans donnee ; ni Loto Foot ni duel", () => {
  const js = read("pro-dashboard.js");
  assert.match(js, /function blocBientot\(\)[\s\S]{0,600}pro_space\.quality_soon/);
  const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /closing_odds|contenus_pro|lotofoot_|duel_|blocJeux|blocAlertes|blocQualite/);
  assert.match(DICTS.fr.pro_space.quality_soon, /Pas encore disponible/);
  assert.match(DICTS.fr.pro_space.locked_alerts, /^Bientôt/);
  assert.match(DICTS.fr.pro_space.locked_comparator, /^Bientôt/);
  assert.match(DICTS.fr.pro_space.locked_today, /^Bientôt/);
});

test("courbe de « Mon bilan » : monotone, ne depasse jamais les vraies valeurs (pas de bosse inventee)", () => {
  const pts = [{ x: 0, y: 100 }, { x: 10, y: 40 }, { x: 20, y: 45 }, { x: 30, y: 44 }, { x: 40, y: 90 }, { x: 50, y: 90 }, { x: 60, y: 10 }];
  const d = M.courbeMonotone(pts);
  const segs = d.split(" C").slice(1).map((s) => s.trim().split(/\s+/).map(Number));
  assert.equal(segs.length, pts.length - 1);
  segs.forEach((c, i) => {
    const lo = Math.min(pts[i].y, pts[i + 1].y) - 1e-6, hi = Math.max(pts[i].y, pts[i + 1].y) + 1e-6;
    [c[1], c[3]].forEach((y) => assert.ok(y >= lo && y <= hi, "segment " + i + " : point de controle " + y + " hors de [" + lo + "," + hi + "]"));
  });
  // La page ne dessine plus la courbe de la cagnotte (controle des chiffres publics, 30/09/2026).
  assert.doesNotMatch(read("pro-dashboard.js"), /M\.courbeMonotone|courbeBilan/);
});

/* ---------------- Essai de 7 jours ---------------- */

test("essai : 7 jours, une seule fois, carte demandee, arret si la carte manque", async () => {
  const t = await import(pathToFileURL(path.join(ROOT, "supabase/functions/create-checkout-session/trial.ts")).href);
  // 02/10/2026 : essai remis (TRIAL_DAYS absent = 7) avec l'article 6 bis des
  // CGV ; "0" le recoupe sans redeploiement.
  assert.equal(t.TRIAL_DAYS_DEFAULT, 7);
  assert.equal(t.trialDays(() => undefined), 7);
  assert.equal(t.trialDays(() => ""), 7);
  assert.equal(t.trialDays(() => "7"), 7);
  assert.equal(t.trialDays(() => "0"), 0);
  assert.equal(t.trialDays(() => "99"), 30);
  assert.deepEqual(t.trialDecision({ days: 7, interval: "month", priorSubscriptionCount: 0, stripeHasHistory: false }), { trial: true, days: 7 });
  assert.equal(t.trialDecision({ days: 7, interval: "month", priorSubscriptionCount: 1, stripeHasHistory: false }).trial, false);
  assert.equal(t.trialDecision({ days: 7, interval: "month", priorSubscriptionCount: 0, stripeHasHistory: true }).trial, false);
  assert.equal(t.trialDecision({ days: 0, interval: "month", priorSubscriptionCount: 0, stripeHasHistory: false }).trial, false);
  // 02/10/2026 (soir) : abonnement mensuel seulement.
  assert.deepEqual(t.trialDecision({ days: 7, interval: "week", priorSubscriptionCount: 0, stripeHasHistory: false }), { trial: false, reason: "interval_not_eligible" });
  assert.deepEqual(t.trialDecision({ days: 7, interval: "year", priorSubscriptionCount: 0, stripeHasHistory: false }), { trial: false, reason: "interval_not_eligible" });
  const s = t.trialSessionParams(7, { market: "fr" });
  assert.equal(s.payment_method_collection, "always");
  assert.equal(s.subscription_data.trial_period_days, 7);
  assert.equal(s.subscription_data.trial_settings.end_behavior.missing_payment_method, "cancel");
  assert.equal(s.subscription_data.metadata.market, "fr");
  // Branche dans la fonction de paiement, prix inchanges.
  const idx = read("supabase/functions/create-checkout-session/index.ts");
  assert.match(idx, /import \{ isLiveStatus, TRIAL_INTERVALS, trialAllowedForInterval, trialDays, trialForAccount, trialSessionParams \} from "\.\/trial\.ts";/);
  assert.match(idx, /const statuses: string\[\] \| null = pastError \? null :/, "lecture impossible = pas d'essai");
  assert.match(idx, /trialForAccount\(\{ days: trialDays\(getEnv\), interval: usedInterval, statuses, stripeHasHistory \}\)/);
  const conf = JSON.parse(read("config/markets.json")).fr.prices.pro;
  assert.deepEqual([conf.week.amount, conf.month.amount, conf.year.amount], [6.99, 19.95, 199]);
});

test("essai : rappel 2 jours avant la fin, une seule fois, montant exact, 7 langues", async () => {
  const h = await import(pathToFileURL(path.join(ROOT, "supabase/functions/trial-reminder/handler.ts")).href);
  assert.equal(h.WINDOW_FROM_HOURS, 36);
  assert.equal(h.WINDOW_TO_HOURS, 60);
  const row = { stripe_subscription_id: "sub_1", email: "x@example.com", market: "fr", billing_interval: "month", current_period_end: "2026-10-10T08:00:00Z" };
  const m = h.renderReminder(row, "https://iashark.com");
  assert.match(m.text, /19,95\s€ par mois/);
  assert.match(m.text, /1 clic/);
  assert.match(m.link, /\/fr\/compte\.html#abonnement$/);
  assert.equal(h.renderReminder({ ...row, billing_interval: "decade" }, "https://iashark.com"), null, "jamais un montant invente");
  assert.equal(h.localeFor({ market: "mx", locale: "es" }), "es-mx");
  LOCALES.forEach((l) => {
    const t = h.TEXTS[l];
    assert.ok(t && t.subject && t.amount.includes("{amount}") && t.ends.includes("{date}"), l);
    assert.doesNotMatch(JSON.stringify(t), /risque|risk|riesgo|Risiko|rischio|garanti|guarantee|gagner|winnings/i, l);
  });
  // Handler : secret obligatoire, reservation avant envoi, une seule fois.
  const envoyes = [], reserves = new Set();
  const deps = {
    env: (k) => ({ EMAIL_INTERNAL_SECRET: "s3cret", RESEND_API_KEY: "re_x", EMAIL_FROM: "IASHARK <a@b.c>" })[k],
    fetch: async (url, init) => { envoyes.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); },
    now: () => new Date("2026-10-08T08:00:00Z"),
    log: { info() {}, warn() {}, error() {} },
    db: {
      listDue: async () => [row, row],
      reserve: async (id) => { if (reserves.has(id)) return false; reserves.add(id); return true; },
      release: async () => {}
    }
  };
  const refus = await h.handleRequest(new Request("https://x", { method: "POST", headers: { "x-internal-secret": "faux" } }), deps);
  assert.equal(refus.status, 401);
  const ok = await h.handleRequest(new Request("https://x", { method: "POST", headers: { "x-internal-secret": "s3cret" }, body: "{}" }), deps);
  const j = await ok.json();
  assert.equal(j.sent, 1, "un seul e-mail par abonnement");
  assert.equal(envoyes.length, 1);
});

test("essai : annulation en 1 clic, par l'abonne lui-meme, a la fin de la periode", () => {
  const f = read("supabase/functions/cancel-subscription/index.ts");
  assert.match(f, /sb\.auth\.getUser\(\)/, "identite verifiee cote serveur");
  assert.match(f, /\.from\("subscriptions"\)[\s\S]*\.eq\("user_id", userData\.user\.id\)/, "seulement SON abonnement");
  assert.match(f, /cancel_at_period_end: !undo/);
  assert.match(f, /PAYMENT_PROVIDER !== "stripe"/);
  const compte = read("account-page.js");
  assert.match(compte, /\/functions\/v1\/cancel-subscription/);
  assert.match(compte, /pro_trial\.cancel_trial_btn/);
});

test("essai remis (02/10/2026) : annonce sur la page d'abonnement, seulement si le serveur et le compte le confirment ; textes du compte", () => {
  // CGV du 02/10/2026 (article 6 bis) : l'encart revient, cache dans le HTML,
  // montre par abonnement-page.js#majEssai seulement si trial_days > 0 et
  // compte jamais abonne (ni abonne actif, ni ancien abonne).
  const html = read("abonnement.html");
  assert.match(html, /<div class="trial-box" id="proTrialInfo" hidden>/);
  assert.match(html, /data-i18n="pro_trial\.line2"/);
  const page = read("abonnement-page.js");
  assert.match(page, /var ANNONCE_ESSAI=true;/);
  assert.match(page, /var ok=ANNONCE_ESSAI&&!essai\.pro&&essai\.offreOuverte&&essai\.serveur>0&&essai\.compte===true&&DUREES_ESSAI\.indexOf\(dureeChoisie\(\)\)!==-1;/);
  assert.match(read("account-page.js"), /function blocEssai\(\)/);
  assert.match(DICTS.fr.pro_trial.line1, /0 €/);
  assert.match(DICTS.fr.pro_trial.line2, /2 jours avant/);
  assert.match(DICTS.fr.pro_trial.line3, /1 clic/);
});

test("resiliation : e-mail de confirmation (L215-1-1) en 7 langues, date de fin, rien sans Resend, un seul par demande", async () => {
  const c = await import(pathToFileURL(path.join(ROOT, "supabase/functions/cancel-subscription/confirmation.ts")).href);
  const base = { email: "x@example.com", market: "fr", requestedAt: "2026-10-01T09:30:12Z", endsAt: "2026-10-08T09:30:00Z", trial: false };
  const fr = c.renderCancellation(base, "https://iashark.com");
  assert.match(fr.text, /8 octobre 2026/);
  assert.match(fr.text, /Aucun nouveau prélèvement/);
  assert.match(fr.text, /L215-1-1/, "mention du droit francais pour le marche francais");
  assert.match(c.renderCancellation({ ...base, trial: true }, "https://iashark.com").text, /Rien ne sera prélevé/);
  assert.doesNotMatch(c.renderCancellation({ ...base, market: "gb" }, "https://iashark.com").text, /L215-1-1/);
  assert.equal(c.renderCancellation({ ...base, endsAt: null }, "https://iashark.com"), null, "jamais une date inventee");
  LOCALES.forEach((l) => {
    const t = c.TEXTS[l];
    assert.ok(t && t.subject && t.endsPaid.includes("{date}") && t.endsTrial.includes("{date}") && t.received.includes("{requested}"), l);
    assert.doesNotMatch(JSON.stringify(t), /risque|risk|riesgo|Risiko|rischio|gagner|winnings|garanti/i, l);
  });
  assert.equal(c.idempotencyKey("sub_1", "2026-10-01T09:30:12Z"), c.idempotencyKey("sub_1", "2026-10-01T09:30:59Z"), "double clic = un seul e-mail");
  assert.notEqual(c.idempotencyKey("sub_1", "2026-10-01T09:30:12Z"), c.idempotencyKey("sub_1", "2026-10-01T09:31:00Z"));
  const envois = [];
  const deps = (env) => ({ env: (k) => env[k], fetch: async (u, init) => { envois.push(init); return new Response("{}", { status: 200 }); }, log: { info() {}, warn() {}, error() {} } });
  assert.deepEqual(await c.sendCancellation(deps({}), { ...base, subscriptionId: "sub_1" }), { sent: false, reason: "email_not_configured" });
  assert.equal(envois.length, 0, "sans Resend, rien ne part");
  assert.deepEqual(await c.sendCancellation(deps({ RESEND_API_KEY: "re_x", EMAIL_FROM: "IASHARK <a@b.c>" }), { ...base, subscriptionId: "sub_1" }), { sent: true });
  assert.equal(envois.length, 1);
  // Branche : la fonction renvoie email_sent, la page Compte ne l'annonce que s'il est vrai.
  assert.match(read("supabase/functions/cancel-subscription/index.ts"), /email_sent: email\.sent/);
  const compte = read("account-page.js");
  assert.match(compte, /j\.email_sent === true\s*\? tr\('pro_trial\.cancel_email_sent'/);
  assert.match(compte, /'x-iashark-locale'/);
  LOCALES.forEach((l) => assert.ok(DICTS[l].pro_trial.cancel_email_sent && DICTS[l].pro_trial.cancel_email_failed, l));
  // La note sous les boutons ne dit plus que la resiliation se fait chez le prestataire.
  LOCALES.forEach((l) => assert.doesNotMatch(DICTS[l].compte_page.billing_portal_note, /résiliation|cancellation|cancelación|Kündigung|disdetta|cancelamento/i, l));
  // E-mail d'achat : la confirmation est promise pour le bouton du site seulement.
  assert.match(read("emails/templates/purchase-confirmation.fr.txt"), /Avec ce bouton, un email vous confirme ensuite la résiliation/);
  assert.match(read("emails/templates/purchase-confirmation.gb.txt"), /With this button, we then email you to confirm the cancellation/);
});

test("essai : rappel 2 jours avant la fin ecrit (fonction + tache planifiee 0042), non applique ; a mettre en route AVANT la fonction de paiement", () => {
  const cron = read("supabase/migrations/0042_schedule_trial_reminder.sql");
  assert.match(cron, /ECRITE, PAS APPLIQUEE/);
  assert.match(cron, /cron\.schedule\(\s*'trial-reminder'/);
  assert.match(cron, /1\. appliquer 0041_pro_accueil\.sql[\s\S]*2\. mettre en ligne la fonction trial-reminder[\s\S]*4\. appliquer CETTE migration[\s\S]*5\. seulement ensuite : mettre en ligne create-checkout-session/);
  assert.ok(exists("supabase/functions/trial-reminder/handler.ts"));
  // Essai remis (02/10/2026) : encart present (cache) dans toutes les versions de la page.
  ["abonnement.html"].concat(DIRS.map((d) => d + "/abonnement.html")).forEach((f) => {
    assert.match(read(f), /id="proTrialInfo" hidden/, f);
    assert.match(read(f), /data-i18n="pro_trial\.line1"/, f);
  });
});

test("paiement reussi : titre neutre par defaut ; « Essai active, rien n'a ete preleve » seulement apres lecture de l'abonnement (cas prouve)", () => {
  ["checkout-succes.html"].concat(DIRS.map((d) => d + "/checkout-succes.html")).forEach((f) => {
    const html = read(f);
    const titre = html.match(/<div class="title" id="successTitle" data-i18n="([^"]+)">([^<]*)<\/div>/);
    assert.ok(titre, f);
    assert.equal(titre[1], "pro_trial.success_title_wait", f + " : titre neutre");
    const onglet = html.match(/<title[^>]*>([^<]*)<\/title>/)[1];
    assert.doesNotMatch(onglet + " " + titre[2], /Paiement confirmé|Payment confirmed|Pago confirmado|essai gratuit a commencé|free trial has started/i, f);
    assert.match(html, /trial:\['pro_trial\.success_title_trial'/, f);
    assert.match(html, /abo\.status==='trialing'&&abo\.current_period_end\)return 'trial'/, f);
    assert.match(html, /document\.title='IASHARK — '\+texte/, f + " : titre de l'onglet aussi");
  });
  assert.equal(DICTS.fr.pro_trial.success_title_trial, "Essai activé, rien n'a été prélevé");
  LOCALES.forEach((l) => assert.doesNotMatch(DICTS[l].geo.meta["checkout-succes"].title, /confirm|bestätigt|confermato/i, l));
});

/* ---------------- Base de donnees (migration 0041, non appliquee) ---------------- */

test("migration 0041 : plus aucune table a elle (preferences_pro, alertes_pro, contenus_pro), apres 0040, numero unique", () => {
  assert.ok(!exists("supabase/migrations/0033_pro_accueil.sql"), "ancienne 0033 retiree (doublon de 0033_telegram)");
  const sql = read("supabase/migrations/0041_pro_accueil.sql");
  const code = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  assert.doesNotMatch(code, /preferences_pro|alertes_pro|contenus_pro|closing_odds|settled_at/);
  assert.match(sql, /ECRITE, PAS APPLIQUEE/);
  assert.match(sql, /APRES 0040_canal_pro\.sql/);
  // Famille et reference : memes valeurs que pro_paris (0040).
  assert.match(code, /famille in \('sure', 'valeur', 'nuls', 'perso'\)/);
  assert.match(code, /programme_ref ~ '\^PRO-\[0-9\]\{1,9\}\$'/);
  // Chacun ne voit et n'ecrit que ses lignes ; l'abonne n'ecrit jamais une cote de fin.
  assert.match(code, /create policy betting_decisions_insert_own[^;]*\(select auth\.uid\(\)\) = user_id\);/);
  const ins = code.match(/grant insert \(([^)]*)\)\s+on public\.betting_decisions to authenticated/)[1];
  // Le journal ecrit par la page n'utilise que des colonnes autorisees.
  const dash = read("pro-dashboard.js");
  const ligne = dash.slice(dash.indexOf("var ligne = {"), dash.indexOf("};", dash.indexOf("var ligne = {")));
  [...ligne.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).concat(["estimated_probability"]).forEach((c) => assert.ok(ins.split(",").map((x) => x.trim()).includes(c), "colonne " + c + " non autorisee a l'insertion"));
  // Numero libre dans toutes les copies de la machine (iashark-*).
  const parent = path.join(ROOT, "..");
  const pris = {};
  fs.readdirSync(parent).filter((d) => /^iashark(-|$)/.test(d)).forEach((d) => {
    const dir = path.join(parent, d, "supabase/migrations");
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((f) => { const n = f.slice(0, 4); (pris[n] = pris[n] || new Set()).add(f); });
  });
  ["0041", "0042"].forEach((n) => assert.ok(!pris[n] || pris[n].size === 1, n + " pris par : " + [...(pris[n] || [])].join(", ")));
});

/* ---------------- Pages, traductions, textes ---------------- */

test("i18n : tous les textes de l'espace Pro existent dans les 7 langues, memes marqueurs", () => {
  const cles = (o, pre) => Object.keys(o).flatMap((k) => typeof o[k] === "object" ? cles(o[k], pre + k + ".") : [pre + k]);
  ["pro_space", "pro_onboarding", "pro_trial"].forEach((ns) => {
    const ref = cles(DICTS.fr[ns], ns + ".");
    assert.ok(ref.length >= 15, ns);
    LOCALES.forEach((l) => ref.forEach((k) => {
      const v = get(DICTS[l], k);
      assert.ok(typeof v === "string" && v.trim(), l + " : " + k);
      assert.deepEqual((v.match(/\{\w+\}/g) || []).sort(), (get(DICTS.fr, k).match(/\{\w+\}/g) || []).sort(), l + " : marqueurs de " + k);
    }));
  });
  // Chaque cle appelee par le code existe en francais (cles completes + cles construites).
  const code = read("pro-dashboard.js") + read("pro-onboarding.js");
  const appelees = [...code.matchAll(/tr\('((?:pro_space|pro_onboarding|pro_trial)\.[a-z_]*[a-z])'/g)].map((m) => m[1]);
  P.FAMILLES.concat(["perso"]).forEach((f) => appelees.push("pro_space.family_" + f));
  P.ALERTES.concat(["nuit"]).forEach((a) => appelees.push("pro_onboarding.alert_" + a, "pro_space.alert_" + a));
  P.PAYS.forEach((c) => appelees.push("pro_onboarding.country_" + c));
  M.MOTIFS_VIDE.forEach((m) => appelees.push("pro_space.motif_" + m));
  ["pays", "cote_min_perso", "limite_paris_jour", "capital"].forEach((e) => appelees.push("pro_onboarding.err_" + e));
  ["confirme", "a_surveiller", "publiee", "retire", "pending"].forEach((v) => appelees.push("pro_space.lineup_" + v));
  appelees.forEach((k) => assert.ok(typeof get(DICTS.fr, k) === "string", "cle manquante : " + k));
});

test("i18n : aucune cle des parts pro_space n'est ecrasee a la fusion des dictionnaires (cas prouve : pro_offer par site.*.json)", () => {
  // scripts/merge-i18n-parts.js : parts triees, la derniere gagne. Le
  // « Bientot » mis dans pro_space.*.json etait ecrase par site.*.json.
  const flat = (o, p = "", out = {}) => { for (const k of Object.keys(o)) { const v = o[k]; const kk = p ? p + "." + k : k; if (v && typeof v === "object" && !Array.isArray(v)) flat(v, kk, out); else out[kk] = v; } return out; };
  const parts = fs.readdirSync(path.join(ROOT, "i18n/parts")).filter((f) => f.endsWith(".json"));
  LOCALES.forEach((l) => {
    const suf = "." + l + ".json";
    const mine = parts.filter((f) => f.endsWith(suf) && !f.slice(0, -suf.length).includes(".")).sort();
    const pro = flat(JSON.parse(read("i18n/parts/pro_space" + suf)));
    const apres = mine.slice(mine.indexOf("pro_space" + suf) + 1);
    apres.forEach((f) => {
      const x = flat(JSON.parse(read("i18n/parts/" + f)));
      Object.keys(pro).forEach((k) => assert.ok(!(k in x) || x[k] === pro[k], l + " : " + k + " de pro_space ecrase par " + f));
    });
    // Le dictionnaire servi = les parts (fusion faite).
    Object.keys(pro).forEach((k) => assert.deepEqual(get(DICTS[l], k), pro[k], l + " : " + k + " (lancer node scripts/merge-i18n-parts.js)"));
    assert.ok(!("pro_offer" in JSON.parse(read("i18n/parts/pro_space" + suf))), l + " : la liste de l'offre n'a qu'une source (site.*.json)");
  });
});

test("offre et Google : rien d'annonce qui n'existe pas ; aucun bookmaker ni « qualite des cotes » promis (cas prouve : i18n/seo)", () => {
  const PROMESSE = /meilleure cote chez|best odds at your|mejor (cuota|momio) en tus|beste Quote bei|quota migliore sui|melhor odd nas|qualité de tes cotes|quality of your odds|calidad de tus (cuotas|momios)|Qualität deiner Quoten|qualità delle tue quote|qualidade das tuas odds/i;
  fs.readdirSync(path.join(ROOT, "i18n/seo")).filter((f) => f.endsWith(".json")).forEach((f) => {
    const m = JSON.parse(read("i18n/seo/" + f)).meta.pro;
    assert.doesNotMatch(m.title + " " + m.description, PROMESSE, f);
    assert.doesNotMatch(m.title, /programme du jour|today's programme|programa del día|Tagesprogramm|programma del giorno|programa do dia/i, f + " : le programme n'est pas ouvert");
    assert.ok(m.title.length <= 60 && m.description.length <= 155, f);
    if (["gb.json", "za.json", "mx.json"].includes(f)) assert.doesNotMatch(m.description, /bookmaker|casas|programme|programa|soon|pronto/i, f + " : aucun bookmaker ni programme annonce hors de France");
  });
  DIRS.concat([""]).forEach((d) => {
    const html = read((d ? d + "/" : "") + "pro.html");
    const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
    assert.doesNotMatch(desc, PROMESSE, (d || "racine") + "/pro.html");
  });
  LOCALES.forEach((l) => {
    assert.doesNotMatch(DICTS[l].geo.meta.pro.description, PROMESSE, l + " geo.meta.pro");
    // Liste de l'offre : le groupe « outils » dit « bientot » (grille de prix).
    assert.ok(DICTS[l].pro_offer.group_tools.toLowerCase().includes(DICTS[l].pricing_grid.tag_soon.toLowerCase()), l);
  });
  assert.doesNotMatch(DICTS["es-mx"].tools_page.static_hero_sub + DICTS.en.tools_page.static_hero_sub, /Soon|Pronto/, "gb, za, mx : rien d'annonce");
});

test("textes : aucune promesse de gain, aucun « jouer comporte des risques », vocabulaire du controle du Canal Pro", () => {
  const INTERDIT = /jouer comporte des risques|gain garanti|gagner à coup sûr|sans risque|guaranteed win|risk-free|paie plus que sa chance|prends-le maintenant|recommandée parce|parce qu.elle est testée|\bvalidée\b|vaut le coup/i;
  LOCALES.forEach((l) => ["pro_space", "pro_onboarding", "pro_trial"].forEach((ns) => {
    assert.doesNotMatch(JSON.stringify(DICTS[l][ns]), INTERDIT, l + " " + ns);
  }));
  assert.equal(DICTS.fr.pro_space.family_sure, "Prudent", "« Sure » s'appelle « Prudent »");
  assert.equal(DICTS.fr.pro_space.family_nuls, "Chasseur de nuls");
  assert.match(DICTS.fr.pro_onboarding.strat_ours_text, /en test sur les nouveaux matchs/i);
  assert.match(DICTS.fr.pro_space.playable, /au-dessus de ta cote minimum/i);
  assert.doesNotMatch(JSON.stringify(DICTS.fr.pro_space) + JSON.stringify(DICTS.fr.pro_onboarding), /photo du ticket|photos? de tickets?/i, "photos de tickets retirees");
});

test("espace Pro : « Outils » devient « Pro » dans les 7 langues, anciennes adresses redirigees", () => {
  LOCALES.forEach((l) => {
    assert.equal(DICTS[l].nav.tools, "PRO", l);
    assert.equal(DICTS[l].site_header.nav_tools, "Pro", l);
    assert.doesNotMatch(DICTS[l].geo.meta.pro.title, /OUTILS|TOOLS|HERRAMIENTAS|STRUMENTI|FERRAMENTAS/i, l);
  });
  const red = read("_redirects");
  assert.match(red, /^\/outils\s+\/fr\/pro\.html\s+301!$/m);
  DIRS.forEach((d) => assert.match(red, new RegExp("^/" + d + "/outils\\.html\\s+/" + d + "/pro\\.html\\s+301!$", "m"), d));
  assert.match(red, /^\/accueil-pro\.html\s+\/fr\/accueil-pro\.html\s+301!$/m);
  assert.match(read("pro.html"), /<title>Espace Pro — IASHARK<\/title>/);
});

test("pages : formulaire d'accueil genere dans chaque version, noindex, lien depuis le paiement et le compte", () => {
  DIRS.forEach((d) => {
    const html = read(d + "/accueil-pro.html");
    assert.match(html, /noindex/, d);
    assert.match(html, /\/pro-onboarding\.js/, d);
    assert.match(html, /\/lib\/pro-preferences\.js/, d);
  });
  // Lancement du 3/10 : apres le paiement, le bouton mene a l'espace Pro (reglages caches).
  assert.match(read("checkout-succes.html"), /href="\/pro\.html" data-href="pro\.html" id="ctaSetup"/);
  assert.doesNotMatch(read("checkout-succes.html"), /accueil-pro\.html/);
  assert.match(read("account-page.js"), /id: 'reglages-pro'/);
  assert.match(read("compte.html"), /\/lib\/pro-preferences\.js/);
});

test("compte : « Mes reglages Pro » lit pro_preferences (colonnes nommees) ; l'export RGPD contient les reglages et les tickets", () => {
  const js = read("account-page.js");
  assert.match(js, /sb\.from\('pro_preferences'\)\.select\(window\.IasharkProPreferences \? window\.IasharkProPreferences\.COLONNES\.join\(','\)/);
  const reg = js.slice(js.indexOf("function reglagesPro()"), js.indexOf("/* ---------- Charpente"));
  assert.match(reg, /var rempli = !!\(prefsPro && P\)/, "ligne presente = rempli (pas de termine_le)");
  assert.doesNotMatch(reg, /termine_le|point_de_vente|perte_max_jour|paris_max_jour|alertes_debut|nuit_autorisee|p\.canal/);
  assert.match(reg, /P\.nomBookmaker\(id, p\.pays\)/, "noms cherches dans la liste du pays");
  const exp = js.slice(js.indexOf("async function exporter"), js.indexOf("function brancherDialogues"));
  assert.match(exp, /sb\.from\('pro_preferences'\)\.select\('user_id,pays,bookmakers,strategie,familles,cote_min_perso,limite_paris_jour,programme_prive,alertes,marches,heure_envoi,competitions,created_at,updated_at'\)/);
  // Base sans 0044 : relecture sans les deux colonnes (jamais un export sans reglages).
  assert.match(js, /function exportReglagesSans0044\(r\)[\s\S]*?PP\.COLONNES_BASE\.join/);
  assert.match(exp, /sb\.from\('pro_tickets'\)\.select\('id,jour,/);
  CONTRAT.pro_preferences.colonnes.forEach((c) => assert.match(exp, new RegExp("pro_preferences'\\)\\.select\\('[^']*\\b" + c + "\\b"), "export : " + c));
});

test("tableau de bord gratuit : jamais de donnee Pro chargee, apercu fictif, programme annonce seulement en France", () => {
  const js = read("pro-dashboard.js");
  const charger = js.slice(js.indexOf("async function charger()"), js.indexOf("function connexion("));
  const avant = charger.slice(0, charger.indexOf("if (estPro()) {"));
  assert.doesNotMatch(avant, /pro_programmes|pro_paris|pro_tickets/);
  assert.match(charger, /if \(estPro\(\)\) \{\s*var jours = M\.joursDuProgramme/);
  assert.match(js, /\[Équipe A\] – \[Équipe B\]/);
  assert.match(js, /pro_space\.locked_example/);
  assert.match(js, /\(paysOuvert\(\) \? verrou\('bAujourdhui'/);
  assert.match(js, /if \(paysOuvert\(\)\) items\.push\(\['M4 12h3l3-8 4 16 3-8h3', tr\('pro_space\.comparator_title'\)/);
  // Controle des chiffres publics (30/09/2026) : plus d'annonce d'un bilan IASHARK.
  assert.doesNotMatch(js, /blocBilanIashark|pro_space\.bilan_text/);
  assert.doesNotMatch(js, /predictions_archive|historique\.json/);
  // Le reglage Pro n'est propose qu'a un abonne Pro (un compte gratuit ne peut pas l'ecrire).
  assert.match(js, /if \(estPro\(\) && !d\.prefsRemplies\)/);
  assert.match(js, /var action = estPro\(\) \? lienAction\(lien\('accueil-pro\.html\?modifier=1&etape=garde_fou'\)/);
});

/* ---------------- Rendu reel du tableau de bord (sans navigateur) ----------------
   Cas prouve du 30/09 : la page plantait (« TypeError: M.qualiteCotes is not a
   function ») pour tous les abonnes Pro. On execute les vrais fichiers
   (lib/pro-preferences.js, lib/pro-dashboard-model.js, pro-dashboard.js) avec
   une base simulee, et on regarde le HTML produit. */
const vm = require("node:vm");
// Vrai marche d'une version du site (lib/market-config.js#build), comme dans
// le navigateur : code, langue, devise.
const MARCHES = (() => { const w = {}; new Function("window", read("lib/market-config.js"))(w); return w.IasharkMarketConfig; })();
function rendreTableau({ pro, pays, marche, donnees, dir, profil }) {
  const appels = [];
  const requete = (table) => {
    const q = { table, filtres: [] };
    const fin = () => {
      appels.push(q);
      const r = (donnees[table] || (() => ({ data: null, error: { message: "absente" } })))(q);
      return Promise.resolve(r);
    };
    const chaine = {};
    ["select", "eq", "in", "order", "limit", "lte", "gte"].forEach((m) => { chaine[m] = (...a) => { q.filtres.push([m, ...a]); return chaine; }; });
    chaine.maybeSingle = () => { q.single = true; return chaine; };
    chaine.single = chaine.maybeSingle;
    chaine.then = (ok, ko) => fin().then(ok, ko);
    return chaine;
  };
  const market = dir !== undefined ? MARCHES.build(dir) : { code: marche || "fr", locale: "fr", currency: "EUR" };
  const dict = DICTS[market.locale] || DICTS.fr;
  const win = {
    I18N: { t: (k, f) => { const v = get(dict, k); return typeof v === "string" ? v : f; }, href: (p) => "/fr/" + p, localeTag: () => "fr-FR", locale: market.locale },
    IASHARK_MARKET: market,
    IasharkApp: { supabase: { from: requete } },
    matchMedia: () => ({ matches: true }),
    addEventListener() {}
  };
  const ctx = vm.createContext({
    window: win, console, Intl, Date, Math, JSON, Promise, setTimeout, clearTimeout, URL,
    requestAnimationFrame: (f) => f(),
    fetch: async () => ({ ok: false, json: async () => null }),
    document: { getElementById: () => null, createElement: () => ({}), body: { appendChild() {} } }
  });
  win.window = win;
  ["lib/pro-preferences.js", "lib/pro-dashboard-model.js", "pro-dashboard.js"].forEach((f) => vm.runInContext(read(f).replace(/typeof window !== 'undefined' \? window : this/, "window"), ctx, { filename: f }));
  // Les modules s'exposent sur window (pas de module.exports dans ce contexte).
  const panneau = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null };
  const contexte = { user: { id: "u1" }, isPro: !!pro, profile: profil || { capital: 500 } };
  win.IasharkProDashboard.render(panneau, contexte);
  // Texte lisible : on defait l'echappement HTML (esc) avant de chercher les phrases.
  const texte = (h) => h.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return new Promise((r) => setTimeout(() => r({ html: texte(panneau.innerHTML), appels }), 60)).then((x) => { void pays; return x; });
}
const AUJ = M.jour(new Date());
const baseDonnees = (pays) => ({
  pro_preferences: () => ({ data: { pays, bookmakers: ["winamax"], strategie: "iashark", familles: ["sure", "valeur", "nuls"], cote_min_perso: null, limite_paris_jour: 3, programme_prive: true, alertes: ["seuil"] }, error: null }),
  betting_decisions: () => ({ data: [{ id: 9, status: "pending", stake: 10, odds: 2, match_label: "X – Y", market: "X gagne", bookmaker: "winamax", created_at: new Date().toISOString() }], error: null }),
  subscriptions: () => ({ data: null, error: null }),
  pro_programmes: () => ({ data: [{ jour: AUJ, statut: "publie", mode: "ouvert", motif_vide: null, publie_at: new Date().toISOString() }], error: null }),
  pro_paris: () => ({ data: [{ id: "p1", numero: 7, jour: AUJ, famille: "valeur", ligue: "Ligue 1", dom: "Lens", ext: "Nantes", coup_envoi: new Date(Date.now() + 5 * 3600e3).toISOString(), marche: "1", selection: "Lens gagne", cote_min: 2, cotes: { winamax: 2.1, betclic: 2.05 }, cote_vue_at: new Date().toISOString(), explication: "Texte du robot.", compo_voyant: null }], error: null }),
  pro_tickets: () => ({ data: [{ jour: AUJ, statut: "note", decision_id: null }], error: null })
});

test("rendu reel : le tableau de bord Pro s'affiche sans planter (France), avec les tables du contrat", async () => {
  const { html, appels } = await rendreTableau({ pro: true, pays: "fr", donnees: baseDonnees("fr") });
  assert.match(html, /id="bAujourdhui"/, "le rendu s'est arrete (erreur JS ?)");
  ["bParis", "bComparateur", "bGardeFou", "bStrategie", "bBientot"].forEach((id) => assert.match(html, new RegExp('id="' + id + '"'), id));
  // Controle des chiffres publics (30/09/2026) : ni « Mon bilan », ni « Ma semaine en image », ni bilan IASHARK.
  ["bBilan", "bSemaine", "bBilanIashark"].forEach((id) => assert.doesNotMatch(html, new RegExp('id="' + id + '"'), id));
  assert.match(html, /Lens – Nantes/);
  assert.match(html, /Winamax/);
  assert.match(html, /PRO-7/);
  assert.match(html, /Pas encore disponible/, "qualite des cotes : bientot");
  assert.match(html, /1 dans ton journal et 1 dans Telegram/, "garde-fou : journal + tickets");
  const tables = appels.map((a) => a.table).sort();
  assert.deepEqual([...new Set(tables)], ["betting_decisions", "pro_paris", "pro_preferences", "pro_programmes", "pro_tickets", "subscriptions"]);
  appels.filter((a) => /^pro_/.test(a.table)).forEach((a) => {
    const sel = a.filtres.find((f) => f[0] === "select");
    assert.ok(sel && sel[1] && sel[1] !== "*", a.table + " : colonnes nommees");
  });
});

test("rendu reel : abonne Pro au Royaume-Uni = aucun bookmaker francais, ni cote, ni pari", async () => {
  const { html } = await rendreTableau({ pro: true, pays: "gb", marche: "gb", donnees: baseDonnees("gb") });
  assert.match(html, /id="bGardeFou"/, "le rendu s'est arrete");
  assert.match(html, /Le programme du jour n'est pas proposé dans ton pays/);
  ["Winamax", "Betclic", "NetBet", "PMU", "Unibet", "winamax"].forEach((n) => assert.doesNotMatch(html, new RegExp(n), n + " affiche hors de France"));
  assert.doesNotMatch(html, /Lens – Nantes/);
});

test("rendu reel : compte gratuit = aucune table Pro lue, apercu fictif en France, rien annonce au Royaume-Uni", async () => {
  const fr = await rendreTableau({ pro: false, pays: "fr", donnees: { ...baseDonnees("fr"), pro_preferences: () => ({ data: null, error: null }) } });
  assert.match(fr.html, /id="bGardeFou"/);
  assert.match(fr.html, /\[Équipe A\] – \[Équipe B\]/);
  assert.deepEqual(fr.appels.filter((a) => /pro_programmes|pro_paris|pro_tickets/.test(a.table)), []);
  const gb = await rendreTableau({ pro: false, pays: "gb", marche: "gb", donnees: { ...baseDonnees("gb"), pro_preferences: () => ({ data: null, error: null }) } });
  assert.match(gb.html, /id="bGardeFou"/);
  assert.doesNotMatch(gb.html, /id="bAujourdhui"|Le comparateur|Winamax|winamax/);
});

test("rendu reel : tables Pro absentes (0040 pas encore appliquee) = valeurs par defaut, jamais une erreur a l'ecran", async () => {
  const donnees = { betting_decisions: () => ({ data: [], error: null }), subscriptions: () => ({ data: null, error: null }) };
  const { html } = await rendreTableau({ pro: true, pays: "fr", donnees });
  assert.match(html, /id="bAujourdhui"/);
  assert.match(html, /Pas de programme publié pour l'instant/);
  assert.match(html, /Règle ton espace en 2 minutes/, "reglages pas encore faits");
});

/* ---------------- Ronde 3 du contre-controle (30/09/2026) : un test par preuve ----------------
   Preuves de l'avocat du diable (scratchpad : scenario1c.js, scenario1b.js,
   scenario3.js, scenarios.js) rejouees sur les vrais fichiers. */
const BK_FR = /Winamax|Betclic|NetBet|PMU|Unibet|winamax|betclic/;
const optionsBookmakers = (html) => [...html.matchAll(/<option value="([a-z0-9_]+)">/g)].map((m) => m[1]);
const sansReglages = (extra) => Object.assign(baseDonnees("fr"), { pro_preferences: () => ({ data: null, error: null }), pro_tickets: () => ({ data: [], error: null }) }, extra || {});

test("pays : un marche inconnu (us, es...) ne donne JAMAIS la France ni ses bookmakers (cas prouve : lib/pro-preferences.js#paysConnu)", () => {
  assert.equal(P.normaliser({ pays: "us" }).pays, "autre");
  // Espagne (0044) : pays ouvert le 02/10/2026 avec SES operateurs DGOJ suivis, jamais un bookmaker francais.
  assert.equal(P.normaliser({ pays: "es" }).pays, "es");
  assert.deepEqual(P.normaliser({ pays: "es", bookmakers: ["winamax", "betclic"] }).bookmakers, []);
  assert.deepEqual(P.normaliser({ pays: "es", bookmakers: ["williamhill", "betclic"] }).bookmakers, ["williamhill"]);
  assert.equal(P.paysOuvert("es"), true);
  assert.deepEqual(P.bookmakersDuPays("es").map((b) => b.id), ["williamhill", "888sport", "betsson", "marathonbet"]);
  assert.equal(P.nomBookmaker("winamax", "es"), null, "Espagne : jamais un bookmaker francais");
  // Belgique et Suisse : pas encore ouvertes (aucune verification de licence).
  ["be", "ch"].forEach((c) => { assert.equal(P.paysOuvert(c), false, c); assert.deepEqual(P.bookmakersDuPays(c), [], c); });
  assert.equal(P.normaliser({}).pays, "autre", "pays absent : aucun bookmaker");
  assert.deepEqual(P.normaliser({ pays: "us", bookmakers: ["winamax"] }).bookmakers, []);
  assert.deepEqual(P.bookmakersDuPays("us"), []);
  assert.equal(P.paysOuvert("us"), false);
  assert.equal(P.nomBookmaker("winamax", "us"), null);
  // Pays d'une page (compte sans reglages) : la France seulement sur les pages francaises.
  const attendu = { "": "fr", fr: "fr", en: "autre", es: "es", gb: "gb", mx: "mx", za: "za" };
  Object.entries(attendu).forEach(([dir, pays]) => assert.equal(P.paysDuMarche(MARCHES.build(dir)), pays, "/" + dir + "/"));
  assert.equal(P.paysDuMarche(undefined), "autre", "marche absent");
  assert.equal(P.paysDuMarche({ code: "us" }), "autre");
  assert.equal(P.paysDuMarche({ code: "fr" }), "autre", "langue inconnue : pas la France");
  // La ligne ecrite par un abonne garde son pays (la base met 'fr' par defaut).
  assert.equal(P.normaliser({ pays: "fr" }).pays, "fr");
  assert.equal(P.DEFAUTS.pays, "fr", "defaut de la colonne (0040), inchange");
});

test("rendu reel : /en/ sans reglages, gratuit comme Pro = aucun bookmaker, ni apercu du programme, ni comparateur, ni « bientot » ; /es/ = operateurs DGOJ seulement (cas prouve)", async () => {
  // Espagne ouverte (02/10/2026) : seulement ses operateurs DGOJ suivis, jamais un bookmaker francais.
  for (const pro of [false, true]) {
    const es = await rendreTableau({ pro, dir: "es", donnees: sansReglages() });
    assert.match(es.html, /id="bGardeFou"/, "es : le rendu s'est arrete");
    assert.deepEqual(optionsBookmakers(es.html), ["williamhill", "888sport", "betsson", "marathonbet"], "es : operateurs DGOJ suivis");
    assert.doesNotMatch(es.html, BK_FR, "es : jamais un bookmaker francais");
  }
  for (const dir of ["en"]) {
    const gratuit = await rendreTableau({ pro: false, dir, donnees: sansReglages() });
    assert.match(gratuit.html, /id="bGardeFou"/, dir + " : le rendu s'est arrete");
    assert.deepEqual(optionsBookmakers(gratuit.html), [], dir + " gratuit : bookmakers dans « Noter un pari »");
    assert.doesNotMatch(gratuit.html, BK_FR, dir + " gratuit : bookmaker francais");
    assert.doesNotMatch(gratuit.html, /id="bAujourdhui"/, dir + " gratuit : apercu du programme");
    assert.doesNotMatch(gratuit.html, /M4 12h3l3-8 4 16 3-8h3/, dir + " gratuit : comparateur annonce");
    assert.doesNotMatch(gratuit.html, /M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3/, dir + " gratuit : alertes Telegram annoncees");
    assert.doesNotMatch(gratuit.html, /9:30|9 h 30/, dir + " gratuit : heure du programme");
    const pro = await rendreTableau({ pro: true, dir, donnees: sansReglages() });
    assert.match(pro.html, /id="bGardeFou"/, dir + " Pro : le rendu s'est arrete");
    assert.deepEqual(optionsBookmakers(pro.html), [], dir + " Pro : bookmakers dans « Noter un pari »");
    assert.doesNotMatch(pro.html, BK_FR, dir + " Pro : bookmaker ou meilleure cote francaise");
    assert.doesNotMatch(pro.html, /Lens – Nantes/, dir + " Pro : pari du programme francais");
    assert.doesNotMatch(pro.html, /id="bBientot"/, dir + " Pro : bloc « Bientot »");
    const dict = DICTS[MARCHES.build(dir).locale];
    assert.ok(pro.html.includes(dict.pro_space.sub_pro_closed), dir + " Pro : sous-titre sans « bientot »");
    assert.ok(!pro.html.includes(dict.pro_space.guard_robot_note), dir + " Pro : note sur le robot Telegram");
    assert.ok(!pro.html.includes(dict.pro_space.strategy_telegram), dir + " Pro : programme Telegram (bientot)");
  }
  // Pages francaises : rien ne change.
  const fr = await rendreTableau({ pro: false, dir: "fr", donnees: sansReglages() });
  assert.deepEqual(optionsBookmakers(fr.html), ["betclic", "netbet", "pmu", "unibet", "winamax"]);
  assert.match(fr.html, /id="bAujourdhui"/);
  const racine = await rendreTableau({ pro: true, dir: "", donnees: sansReglages() });
  assert.match(racine.html, /Lens – Nantes/);
  assert.match(racine.html, /id="bBientot"/);
  // Un abonne de /en/ qui a choisi la France dans le formulaire la garde.
  const choisi = await rendreTableau({ pro: true, dir: "en", donnees: baseDonnees("fr") });
  assert.match(choisi.html, /Winamax/);
});

test("journal : un pari note avec « Je l'ai joue » (source programme) se regle comme un pari note a la main (cas prouve)", async () => {
  const hier = new Date(Date.now() - 3 * 86400e3).toISOString();
  const dec = [
    { id: 11, status: "pending", stake: 10, odds: 2.1, match_label: "Lens – Nantes", market: "Lens gagne", source: "programme", programme_ref: "PRO-7", famille: "sure", created_at: hier, kickoff_at: hier },
    { id: 12, status: "pending", stake: 10, odds: 1.8, match_label: "A – B", market: "A gagne", source: "site", created_at: hier },
    { id: 13, status: "won", stake: 10, odds: 1.5, match_label: "C – D", market: "C gagne", source: "programme", programme_ref: "PRO-6", created_at: hier }
  ];
  const { html } = await rendreTableau({ pro: true, pays: "fr", donnees: { ...baseDonnees("fr"), betting_decisions: () => ({ data: dec, error: null }) } });
  assert.deepEqual([...html.matchAll(/data-regler="won" data-id="(\d+)"/g)].map((m) => m[1]), ["11", "12"], "Gagne/Perdu sur tous les paris en cours, jamais sur un pari regle");
  assert.deepEqual([...html.matchAll(/data-regler="lost" data-id="(\d+)"/g)].map((m) => m[1]), ["11", "12"]);
  // Une fois regle, il entre dans le bilan.
  assert.equal(M.bilan([{ ...dec[0], status: "lost" }], 500).regles, 1);
});

test("garde-fou : un meme pari note sur le site ET dans Telegram compte une fois (cas prouve)", async () => {
  const auj = "2026-10-03", t = new Date(JOUR);
  const refs = [{ id: "p7", ref: "PRO-7" }, { id: "p8", ref: "PRO-8" }];
  const site = { id: "d1", status: "lost", stake: 10, odds: 2, source: "programme", programme_ref: "PRO-7", created_at: "2026-10-03T08:00:00Z" };
  // Ticket Telegram sans ligne du journal, meme pari, meme mise et meme cote lues.
  let g = M.gardeFou({ limite_paris_jour: 5 }, [site], t, null, [{ jour: auj, statut: "note", decision_id: null, pari_id: "p7", mise: 10, cote: 2 }], refs);
  assert.deepEqual([g.parisNotes, g.duJournal, g.deTelegram], [1, 1, 0], "ticket (mise et cote lues) + « Je l'ai joue »");
  // Ronde 4.2 : ticket SANS mise (rien ne prouve que c'est le meme pari) : il compte a part.
  g = M.gardeFou({ limite_paris_jour: 5 }, [site], t, null, [{ jour: auj, statut: "note", decision_id: null, pari_id: "p7" }], refs);
  assert.deepEqual([g.parisNotes, g.duJournal, g.deTelegram], [2, 1, 1], "ticket sans mise : compte a part");
  // Ticket avec mise : le robot a ecrit une 2e ligne du journal (d2) pour le meme pari.
  const robot = { id: "d2", status: "lost", stake: 10, odds: 2, source: "site", created_at: "2026-10-03T08:05:00Z" };
  g = M.gardeFou({ limite_paris_jour: 5 }, [site, robot], t, null, [{ jour: auj, statut: "note", decision_id: "d2", pari_id: "p7" }], refs);
  assert.deepEqual([g.parisNotes, g.doublons, g.perteDuJour], [1, 1, 10], "ligne du robot = copie : comptee une fois, perte comptee une fois");
  // Deux paris differents, ou un ticket sans pari relie : comptes tous les deux.
  g = M.gardeFou({ limite_paris_jour: 5 }, [site], t, null, [{ jour: auj, statut: "note", decision_id: null, pari_id: "p8" }], refs);
  assert.equal(g.parisNotes, 2, "autre pari");
  g = M.gardeFou({ limite_paris_jour: 5 }, [site], t, null, [{ jour: auj, statut: "note", decision_id: null, pari_id: null }], refs);
  assert.equal(g.parisNotes, 2, "ticket sans pari relie : ne peut pas etre rapproche, il compte");
  // Deux tickets pour UN pari note une fois sur le site : un seul rapprochement.
  g = M.gardeFou({ limite_paris_jour: 5 }, [site], t, null, [{ jour: auj, statut: "note", decision_id: null, pari_id: "p7", mise: 10, cote: 2 }, { jour: auj, statut: "note", decision_id: null, pari_id: "p7", mise: 10, cote: 2 }], refs);
  assert.equal(g.parisNotes, 2);
  // La page lit pari_id et passe les paris lus au calcul.
  assert.match(M.COLONNES_TICKETS, /\bpari_id\b/);
  const js = read("pro-dashboard.js");
  assert.equal((js.match(/M\.gardeFou\([^;]*d\.tickets, d\.refsParis\)/g) || []).length, 2);
  const AUJ2 = M.jour(new Date());
  const donnees = { ...baseDonnees("fr"),
    betting_decisions: () => ({ data: [{ id: 21, status: "pending", stake: 10, odds: 2.1, match_label: "Lens – Nantes", market: "Lens gagne", source: "programme", programme_ref: "PRO-7", created_at: new Date().toISOString() }], error: null }),
    pro_tickets: () => ({ data: [{ jour: AUJ2, statut: "note", decision_id: null, pari_id: "p1", mise: 10, cote: 2.1 }], error: null }) };
  const { html } = await rendreTableau({ pro: true, pays: "fr", donnees });
  assert.match(html, /1 dans ton journal et 0 dans Telegram/, "rendu reel : le ticket du meme pari n'est pas recompte");
});

/* Formulaire d'accueil (pro-onboarding.js) execute pour de vrai, avec une page
   minimale : on lit le HTML produit, on remplit les champs, on clique. */
function lancerFormulaire({ search, dir, ligne, capital, pro, ferme }) {
  const appels = [];
  let version = 0, html = "";
  const cache = {};
  function element(id) {
    const cle = version + ":" + id;
    if (!cache[cle]) {
      const m = html.match(new RegExp('<input id="' + id + '"[^>]*value="([^"]*)"'));
      cache[cle] = { id, value: m ? m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&") : "", hidden: false, textContent: "", className: "", disabled: false, ecouteurs: {},
        addEventListener(t, f) { this.ecouteurs[t] = f; }, setAttribute() {}, focus() {} };
    }
    return cache[cle];
  }
  const racine = {
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; version++; },
    querySelectorAll(sel) {
      const m = sel.match(/^input\[name="([^"]+)"\](:checked)?$/);
      if (m) return [...html.matchAll(new RegExp('<input type="(?:radio|checkbox)" name="' + m[1] + '" value="([^"]*)"( checked)?', "g"))].filter((x) => !m[2] || x[2]).map((x) => ({ value: x[1], addEventListener() {} }));
      if (sel === "[data-aller]") return [...html.matchAll(/data-aller="(\d+)"/g)].map((x) => element("aller" + x[1]));
      return [];
    },
    querySelector: (sel) => (sel === "h2" ? { setAttribute() {}, focus() {} } : null)
  };
  const requete = (table) => {
    const q = { table };
    const chaine = {
      select() { return chaine; }, eq() { return chaine; }, maybeSingle() { return chaine; },
      upsert(data) { q.op = "upsert"; q.data = data; return chaine; },
      update(data) { q.op = "update"; q.data = data; return chaine; },
      then(ok, ko) { appels.push(q); return Promise.resolve(q.op ? { data: null, error: null } : { data: table === "pro_preferences" ? ligne : null, error: null }).then(ok, ko); }
    };
    return chaine;
  };
  const market = MARCHES.build(dir || "fr");
  const dict = DICTS[market.locale];
  const win = {
    I18N: { t: (k, f) => { const v = get(dict, k); return typeof v === "string" ? v : f; }, href: (p) => "/" + (dir || "fr") + "/" + p, localeTag: () => "fr-FR" },
    IASHARK_MARKET: market,
    // Lancement du 3/10 : le formulaire est cache par defaut (0040/0041 pas appliquees) ; ces
    // tests verifient qu'il est pret pour l'ouverture (interrupteur pose a la main).
    IASHARK_OUVERTURE: ferme ? undefined : { reglagesPro: true },
    IasharkApp: { supabase: { from: requete }, context: async () => ({ user: { id: "u1" }, isPro: pro !== false, profile: { capital: capital === undefined ? 500 : capital } }) },
    scrollTo() {}
  };
  const ctx = vm.createContext({
    window: win, console, Intl, Date, Math, JSON, Promise, setTimeout, URLSearchParams,
    location: { search: search || "", pathname: "/" + (dir || "fr") + "/accueil-pro.html", replace() {} },
    document: { getElementById: (id) => (id === "accueilPro" ? racine : html.includes('id="' + id + '"') ? element(id) : null), querySelector: () => null }
  });
  win.window = win;
  vm.runInContext(read("lib/pro-preferences.js").replace(/typeof window !== 'undefined' \? window : this/, "window"), ctx, { filename: "lib/pro-preferences.js" });
  vm.runInContext(read("lib/langue-compte.js").replace(/typeof window !== 'undefined' \? window : this/, "window"), ctx, { filename: "lib/langue-compte.js" });
  vm.runInContext(read("pro-onboarding.js"), ctx, { filename: "pro-onboarding.js" });
  const attendre = () => new Promise((r) => setTimeout(r, 30));
  const cliquer = async (id) => { const el = ctx.document.getElementById(id); assert.ok(el, "bouton " + id + " absent"); await (el.ecouteurs.click || el.ecouteurs.submit)({ preventDefault() {} }); await attendre(); };
  const lisible = () => html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return { appels, dict, attendre, cliquer, html: () => html, texte: lisible, champ: (id) => ctx.document.getElementById(id), envoyer: async () => { await ctx.document.getElementById("formEtape").ecouteurs.submit({ preventDefault() {} }); await attendre(); } };
}
const LIGNE_FR = { pays: "fr", bookmakers: [], strategie: "iashark", familles: ["sure", "valeur", "nuls"], cote_min_perso: null, limite_paris_jour: 5, programme_prive: true, alertes: ["seuil"] };

test("formulaire : plus de « Ma cagnotte » (avocat du diable, 01/10/2026) ni d'etape garde-fou (« Bientôt », 02/10/2026) ; jamais la cagnotte ni la limite ecrites", async () => {
  const f = lancerFormulaire({ search: "?modifier=1&etape=garde_fou", ligne: { ...LIGNE_FR, limite_paris_jour: 3 }, capital: 500 });
  await f.attendre();
  assert.doesNotMatch(f.html(), /id="limite"|id="cagnotte"/, "ni garde-fou ni cagnotte");
  assert.match(f.html(), /name="langue"/, "lien vers une etape retiree : premiere etape");
  await f.cliquer("enregistrerTout");
  assert.deepEqual(f.appels.filter((a) => a.table === "users" && a.op), [], "la cagnotte n'est jamais ecrite");
  const up = f.appels.find((a) => a.table === "pro_preferences" && a.op === "upsert");
  assert.equal(up.data.limite_paris_jour, 3, "la limite deja reglee n'est jamais changee");
  assert.doesNotMatch(read("pro-onboarding.js"), /from\('users'\)|lireCapital/);
});

test("lancement du 3/10 : sans l'interrupteur, la page des reglages Pro dit seulement « Bientôt » et mene a l'espace Pro", async () => {
  const f = lancerFormulaire({ search: "", ligne: LIGNE_FR, ferme: true });
  await f.attendre();
  assert.match(f.texte(), new RegExp(f.dict.lancement.settings_soon_title));
  assert.match(f.html(), /href="\/fr\/pro\.html"/);
  assert.doesNotMatch(f.html(), /name="pays"|id="formEtape"/, "aucun formulaire");
  assert.deepEqual(f.appels, [], "aucune lecture de pro_preferences");
});

test("formulaire : /en/ ne coche plus la France ; hors de France, aucun « bientot » dans les aides (cas prouve : paysParDefaut)", async () => {
  const en = lancerFormulaire({ dir: "en", search: "?etape=pays", ligne: null });
  await en.attendre();
  assert.match(en.html(), /name="pays" value="autre" checked/, "/en/ : « Autre pays » coche");
  assert.doesNotMatch(en.html(), /name="pays" value="fr" checked/, "/en/ : jamais la France par defaut");
  const fr = lancerFormulaire({ dir: "fr", search: "?etape=pays", ligne: null });
  await fr.attendre();
  assert.match(fr.html(), /name="pays" value="fr" checked/);
  // Royaume-Uni (pays choisi) : bookmakers = « pas encore disponible dans ton pays », sans « bientot ».
  const gb = lancerFormulaire({ dir: "gb", search: "?modifier=1&etape=bookmakers", ligne: { ...LIGNE_FR, pays: "gb" } });
  await gb.attendre();
  const d = gb.dict.pro_onboarding;
  assert.ok(gb.texte().includes(d.not_available_title) && gb.texte().includes(d.not_available_text), "pas encore disponible");
  assert.doesNotMatch(gb.html(), /name="bookmakers"/, "aucun bookmaker propose");
  // 03/10/2026 : hors des pays ouverts, 4 etapes ; les competitions preferees sont la derniere (ni alertes ; plus de strategie ni de types de paris).
  const gbFin = lancerFormulaire({ dir: "gb", search: "?modifier=1&etape=competitions", ligne: { ...LIGNE_FR, pays: "gb" } });
  await gbFin.attendre();
  assert.ok(gbFin.texte().includes(d.step.replace("{n}", "4").replace("{total}", "4")), "competitions = etape 4 sur 4");
  await gbFin.envoyer();
  assert.doesNotMatch(gbFin.html(), /name="alertes"|name="programme_prive"|name="strategie"|name="marches"/, "etapes alertes, strategie et types sautees");
  assert.ok(gbFin.appels.some((a) => a.table === "pro_preferences" && a.op === "upsert"), "reglages enregistres apres les competitions");
  for (const l of LOCALES) {
    const o = DICTS[l].pro_onboarding;
    ["guard_help_closed", "alerts_help_closed", "telegram_help_closed"].forEach((k) => assert.ok(o[k] && !/bientôt|soon|pronto|bald|presto|em breve/i.test(o[k]), l + "." + k));
    assert.ok(DICTS[l].pro_space.sub_pro_closed && !/bientôt|soon|pronto|bald|presto|em breve/i.test(DICTS[l].pro_space.sub_pro_closed), l + ".sub_pro_closed");
  }
});

test("offre : aucun « bientot » la ou il ne sera pas tenu (gb, mx, za, /en/, /es/) ; plus d'heure promise (cas prouve : gb/abonnement.html, grille de prix)", () => {
  // Pages d'abonnement generees : le groupe « bientot » n'existe que sur les pages francaises.
  for (const dir of ["gb", "mx", "za", "en", "es"]) {
    const html = read(dir + "/abonnement.html");
    assert.doesNotMatch(html, /data-group="tools"|pro_offer\.group_tools|Coming soon|Próximamente|feature-list soon/, dir + "/abonnement.html");
  }
  // Grille de prix remise au propre (30/09/2026) : plus de liste « Tout ce que Pro debloque »
  // sous la grille (elle repetait la carte Pro) ; le « bientot » vit dans la carte Pro (France seulement, ci-dessous).
  for (const f of ["abonnement.html", "fr/abonnement.html"]) assert.doesNotMatch(read(f), /data-group="tools"|pro_offer\.group_tools/, f);
  const BL = require("../scripts/build-locales.js");
  assert.equal(BL.stripFranceOnly('<p>a</p>\n  <div class="x" data-france-seulement><h3>b</h3><ul><li>c</li></ul></div>\n<p>d</p>', "gb"), "<p>a</p>\n<p>d</p>");
  assert.equal(BL.stripFranceOnly('<div data-france-seulement>b</div>', "fr"), '<div data-france-seulement>b</div>');
  // Grille de prix : fonctions « bientot » (programme, qualite, alertes, Canal Pro, robot) en France seulement.
  const w = {}; new Function("window", read("assets/pricing-grid.js"))(w);
  const G = w.IasharkPricingGrid;
  for (const dir of ["", "fr", "gb", "mx", "za", "en", "es"]) {
    const soon = G.offerModel(MARCHES.build(dir), { annual: true }).features.filter((f) => f.tag === "soon").map((f) => f.key);
    if (dir === "" || dir === "fr") assert.ok(soon.includes("f_programme") && soon.includes("f_robot"), "/" + dir + "/ : annonce en France");
    // Seule exception : la simulation quand son interrupteur est sur « bientot »
    // (decision 6, retour arriere) ; elle existe deja partout sur les matchs du moteur v3.
    else assert.deepEqual(soon, G.SIMULATION === "mention" || G.SIMULATION === "ouverte" ? [] : ["f_scenario"], "/" + dir + "/ : rien d'annonce");
  }
  // Compte : la carte de la grille (meme regle « France seulement », ci-dessus) ;
  // plus de liste propre au compte (controle des captures du 30/09/2026).
  assert.match(read("account-page.js"), /window\.IasharkPricingGrid\.mount\(el, Object\.assign\(\{ variant: 'complet'/);
  assert.doesNotMatch(read("account-page.js"), /pro_offer\.group_tools/);
  // /es/ : public international (decision de Clement a confirmer), plus de « Pronto ».
  assert.doesNotMatch(read("es/pro.html"), /Pronto/);
  // « chaque matin a 9 h 30 » : trop fort (rien ne part sans le clic de Clement avant 12 h).
  for (const l of LOCALES) {
    const txt = JSON.stringify([DICTS[l].pro_space, DICTS[l].pro_offer, DICTS[l].pricing_grid, DICTS[l].pro_onboarding]);
    assert.doesNotMatch(txt, /9 ?h ?30|9:30|9\.30/, l + " : heure du programme promise");
  }
  assert.doesNotMatch(read("assets/pricing-grid.js") + read("account-page.js") + read("abonnement.html"), /chaque matin à 9 h 30/);
});

test("reglages : une seule source (pro_preferences) ; le site ne lit ni n'ecrit les reglages du robot ; plus de « pris en compte des le prochain programme »", () => {
  const site = ["pro-dashboard.js", "pro-onboarding.js", "account-page.js", "lib/pro-preferences.js", "lib/pro-dashboard-model.js"].map(read).join("\n");
  assert.doesNotMatch(site, /telegram_abonnes|localStorage[^;]*(pays|bookmakers|limite)/, "reglages lus ou ecrits ailleurs que dans pro_preferences");
  assert.match(read("pro-onboarding.js"), /sb\.from\(P\.TABLE\)\.upsert\(P\.versLigne\(etat\.prefs, ctx\.user\.id, \{ sans0044: etat\.sans0044 \}\), \{ onConflict: 'user_id' \}\)/);
  assert.equal(P.TABLE, "pro_preferences");
  for (const l of LOCALES) assert.doesNotMatch(DICTS[l].pro_onboarding.edit_sub, /programme|program|programma|Programm/i, l + " : promesse sur le prochain programme");
  // pari_id est lisible par le site (grant select sur pro_tickets, 0040) quand la copie canal-pro est la.
  const sql = path.join(CANAL_PRO, "supabase/migrations/0040_canal_pro.sql");
  if (fs.existsSync(sql)) assert.match(fs.readFileSync(sql, "utf8"), /create table if not exists public\.pro_tickets \([\s\S]*?pari_id uuid[\s\S]*?decision_id uuid/);
});

/* ---------------- Ronde 4.1 du contre-controle (30/09/2026) : un test par preuve ----------------
   Preuves de l'avocat du diable (scratchpad avocat-pro-r4 : preuve2-journal.js,
   preuve3-compte.js, preuve4-deux-mises.js, gb-pro.txt) rejouees sur les vrais
   fichiers. Regle de fusion : lib/pro-dashboard-model.js#fusionnerNotes. */
const T41 = new Date("2026-10-03T12:00:00Z"); // 14 h a Paris
const J41 = "2026-10-03";
const REFS7 = [{ id: "p1", ref: "PRO-7" }];
const noteSite = (o) => ({ id: "d-site", status: "lost", stake: 10, odds: 2.1, bookmaker: "winamax", source: "programme", programme_ref: "PRO-7", famille: "sure", match_label: "Lens – Nantes", created_at: "2026-10-03T10:00:00Z", kickoff_at: "2026-10-03T19:00:00Z", ...o });
const noteRobot = (o) => ({ id: "d-robot", status: "lost", stake: 10, odds: 2.1, source: "site", programme_ref: null, famille: null, match_label: "Lens – Nantes", created_at: "2026-10-03T10:30:00Z", kickoff_at: "2026-10-03T19:00:00Z", ...o });
const ticketRobot = (o) => [{ jour: J41, statut: "note", decision_id: "d-robot", pari_id: "p1", mise: 10, cote: 2.1, ...o }];

test("garde-fou : deux VRAIS paris sur PRO-7 (10 EUR sur le site + 20 EUR dans Telegram) = 2 paris, 30 EUR, limite atteinte (cas prouve : preuve4)", () => {
  const robot = noteRobot({ stake: 20, odds: 2.05 });
  const g = M.gardeFou({ limite_paris_jour: 2 }, [noteSite(), robot], T41, null, ticketRobot({ mise: 20, cote: 2.05 }), REFS7);
  assert.deepEqual([g.parisNotes, g.perteDuJour, g.atteint, g.doublons], [2, 30, true, 0], "avant : 1 pari, 10 EUR, limite pas atteinte");
  // Meme mise, autre cote : deux paris aussi.
  assert.equal(M.gardeFou({ limite_paris_jour: 5 }, [noteSite(), noteRobot({ odds: 2.05 })], T41, null, ticketRobot({ cote: 2.05 }), REFS7).parisNotes, 2);
  // Ticket sans ligne du journal dont la mise lue contredit celle du site : deux paris.
  const g3 = M.gardeFou({ limite_paris_jour: 5 }, [noteSite()], T41, null, [{ jour: J41, statut: "note", decision_id: null, pari_id: "p1", mise: 20, cote: 2.1 }], REFS7);
  assert.deepEqual([g3.parisNotes, g3.deTelegram], [2, 1]);
  // Meme pari (meme PRO-7, meme mise, meme cote) : compte une fois, sa perte une fois.
  const g4 = M.gardeFou({ limite_paris_jour: 2 }, [noteSite(), noteRobot()], T41, null, ticketRobot(), REFS7);
  assert.deepEqual([g4.parisNotes, g4.perteDuJour, g4.atteint, g4.doublons], [1, 10, false, 1]);
  // La page lit la mise et la cote des tickets (grant select sur pro_tickets, 0040).
  assert.match(M.COLONNES_TICKETS, /\bmise\b/);
  assert.match(M.COLONNES_TICKETS, /\bcote\b/);
});

test("garde-fou : une perte reglee sur UNE seule copie n'est jamais cachee ; deux reglements differents = le plus prudent (cas prouve : preuve2, cas C)", () => {
  const cas = (site, robot) => M.gardeFou({ limite_paris_jour: 5 }, [noteSite(site), noteRobot(robot)], T41, null, ticketRobot(), REFS7);
  assert.deepEqual([cas({ status: "pending" }, { status: "lost" }).perteDuJour, cas({ status: "pending" }, { status: "lost" }).parisNotes], [10, 1], "robot perdu, site en cours : avant 0 EUR");
  assert.equal(cas({ status: "lost" }, { status: "pending" }).perteDuJour, 10, "site perdu, robot en cours");
  assert.equal(cas({ status: "won" }, { status: "lost" }).perteDuJour, 10, "gagne d'un cote, perdu de l'autre : la perte");
  assert.equal(cas({ status: "pending" }, { status: "pending" }).perteDuJour, 0);
  // Un meme pari note hier sur le site et aujourd'hui dans Telegram compte aujourd'hui (mieux vaut un pari de trop).
  assert.equal(cas({ created_at: "2026-10-02T20:00:00Z" }, {}).parisNotes, 1);
});

test("Mon bilan et Ma semaine : un pari note sur le site ET dans Telegram compte une fois, avec la famille du site (cas prouve : preuve2, cas B)", async () => {
  const b = M.bilan([noteSite(), noteRobot()], 500, ticketRobot(), REFS7);
  assert.deepEqual([b.regles, b.perdus, b.gain, b.capital], [1, 1, -10, 490], "avant : 2 paris, -20 EUR, 480 EUR");
  // Seule la copie du robot est reglee : le resultat vient d'elle, la famille du site.
  const b2 = M.bilan([noteSite({ status: "pending" }), noteRobot()], 500, ticketRobot(), REFS7);
  assert.deepEqual([b2.regles, b2.gain, Object.keys(b2.parFamille)], [1, -10, ["sure"]]);
  // Deux vrais paris (mises differentes) : deux lignes dans le bilan.
  assert.equal(M.bilan([noteSite(), noteRobot({ stake: 20 })], 500, ticketRobot({ mise: 20 }), REFS7).regles, 2);
  // Ma semaine (image a partager) : la semaine derniere, gagne des deux cotes.
  const lundiDernier = "2026-09-21";
  const dans = (o) => ({ ...o, status: "won", created_at: lundiDernier + "T18:00:00Z", kickoff_at: lundiDernier + "T19:00:00Z" });
  const s = M.semaineEnImage([dans(noteSite()), dans(noteRobot())], T41, [{ jour: lundiDernier, statut: "note", decision_id: "d-robot", pari_id: "p1" }], REFS7);
  assert.deepEqual([s.paris, s.gagnes, s.gain], [1, 1, 11], "avant : 2 paris, 2 gagnes");
  // Controle des chiffres publics (30/09/2026) : la page n'affiche plus ni « Mon bilan » ni
  // « Ma semaine en image » (aucun taux, aucun argent) ; le modele reste teste ci-dessus.
  const js = read("pro-dashboard.js");
  assert.doesNotMatch(js, /M\.bilan\(|M\.semaineEnImage\(/);
  // Rendu reel : ticket d'un ANCIEN pari (pas du jour) -> la page lit encore son numero (id, numero),
  // pour le garde-fou ; aucun montant affiche.
  const avantHier = new Date(Date.now() - 2 * 86400e3).toISOString();
  const donnees = { ...baseDonnees("fr"),
    betting_decisions: () => ({ data: [noteSite({ programme_ref: "PRO-5", created_at: avantHier, kickoff_at: avantHier }), noteRobot({ created_at: avantHier, kickoff_at: avantHier })], error: null }),
    pro_tickets: () => ({ data: [{ jour: M.jour(avantHier), statut: "note", decision_id: "d-robot", pari_id: "p-ancien", mise: 10, cote: 2.1 }], error: null }),
    pro_paris: (q) => (q.filtres.some((f) => f[0] === "select" && f[1] === "id,numero")
      ? { data: [{ id: "p-ancien", numero: 5 }], error: null }
      : baseDonnees("fr").pro_paris()) };
  const { html, appels } = await rendreTableau({ pro: true, pays: "fr", donnees });
  assert.doesNotMatch(html, /id="bBilan"|id="bSemaine"/);
  assert.doesNotMatch(html, /490,00|480,00|€/, "aucun montant");
  const lu = appels.find((a) => a.table === "pro_paris" && a.filtres.some((f) => f[0] === "select" && f[1] === "id,numero"));
  assert.ok(lu && lu.filtres.some((f) => f[0] === "in" && f[1] === "id" && f[2].includes("p-ancien")), "numero de l'ancien pari lu");
  const t = appels.find((a) => a.table === "pro_tickets");
  assert.ok(t.filtres.some((f) => f[0] === "eq" && f[1] === "statut" && f[2] === "note"), "tickets notes, pas seulement du jour");
  assert.ok(!t.filtres.some((f) => f[0] === "eq" && f[1] === "jour"));
});

/* Rend le VRAI reglagesPro() de account-page.js (fonctions extraites telles quelles). */
function rendreReglagesCompte(dir, pays, pro) {
  const src = read("account-page.js");
  const extraire = (nom) => {
    const i = src.indexOf("function " + nom + "(");
    assert.ok(i >= 0, "fonction absente : " + nom);
    let n = 0, k = src.indexOf("{", i);
    for (; k < src.length; k++) { if (src[k] === "{") n++; else if (src[k] === "}") { n--; if (n === 0) break; } }
    return src.slice(i, k + 1);
  };
  const market = MARCHES.build(dir);
  const dict = DICTS[market.locale];
  const win = { IASHARK_MARKET: market, I18N: { t: (k, f) => { const v = get(dict, k); return typeof v === "string" ? v : f; }, href: (p) => "/" + p } };
  const c = vm.createContext({ window: win, console, JSON, Math, String, Number, Array, Object });
  vm.runInContext(read("lib/pro-preferences.js").replace(/typeof window !== 'undefined' \? window : this/, "window"), c);
  const code = "var ctx = { isPro: " + (pro !== false) + ", user: { id: 'u1' } }; var prefsPro = " + JSON.stringify(pays ? { ...LIGNE_FR, pays, alertes: ["seuil", "compositions"] } : null) + ";\n"
    + "var favStore = null; var prefs = {};\n"
    + ["esc", "lien", "tr", "carte", "titreSection", "ligneResume", "favoris", "nomCompetition", "langueDeLaPage", "langueDuCompte", "reglagesPro"].map(extraire).join("\n") + "\nreglagesPro();";
  return { dict, texte: vm.runInContext(code, c).replace(/&#39;/g, "'").replace(/&amp;/g, "&") };
}

test("compte : hors de France, « Mes reglages Pro » ne promet plus ni alertes ni programme Telegram « bientot » (cas prouve : preuve3)", () => {
  // /es/ : un compte qui a choisi « autre » reste ferme ; un compte pas regle prend l'Espagne (ouverte le 02/10/2026).
  for (const [dir, pays] of [["gb", "gb"], ["en", "autre"], ["es", "autre"], ["mx", "mx"], ["za", "za"]]) {
    const { dict, texte } = rendreReglagesCompte(dir, pays);
    assert.ok(!texte.includes(dict.pro_space.strategy_alerts), dir + " : alertes (bientot)");
    assert.ok(!texte.includes(dict.pro_space.strategy_telegram), dir + " : programme Telegram (bientot)");
    assert.doesNotMatch(texte, /bientôt|soon|pronto|\(bald\)|presto|em breve/i, dir);
    assert.ok(texte.includes(dict.pro_space.country_closed), dir + " : pays pas ouvert, dit sans futur");
    assert.ok(texte.includes(dict.pro_onboarding.account_text_closed) && !texte.includes(dict.pro_onboarding.account_text), dir + " : sous-titre sans alertes ni Telegram");
    // Pas encore regle : le pays de la page decide (Espagne : ouverte).
    if (dir === "es") continue;
    const vide = rendreReglagesCompte(dir, null);
    assert.ok(vide.texte.includes(dict.pro_onboarding.account_text_closed) && !vide.texte.includes(dict.pro_onboarding.account_text), dir + " : compte pas regle");
  }
  const fr = rendreReglagesCompte("fr", "fr");
  assert.ok(fr.texte.includes(fr.dict.pro_space.strategy_alerts) && fr.texte.includes(fr.dict.pro_space.strategy_telegram), "France : inchange");
  assert.ok(fr.texte.includes(fr.dict.pro_onboarding.account_text), "France : sous-titre complet");
  assert.ok(rendreReglagesCompte("fr", null).texte.includes(fr.dict.pro_onboarding.account_text));
});

test("hors de France : aucun futur dans ce que voit l'abonne (7 langues) ; ni comparateur ni annonce du bilan ; formulaire en 3 etapes (cas prouve : gb-pro.txt, ronde 4.2)", async () => {
  // Textes montres hors de France : aucune promesse (« bientot », « a l'ouverture de ton pays »...).
  const FUTUR = { fr: /bientôt|arriver|ouverture|pas encore|seront|sera\b|pour l'instant/i, en: /soon|will|yet|opens|for now/i, es: /pronto|llegar|todavía|aún|abra\b|añadirán/i,
    "es-mx": /pronto|llegar|todavía|aún|abra\b|agregarán/i, de: /bald|noch nicht|kommen|öffnet|vorerst/i, it: /presto|ancora|arriver|apertura|saranno|per ora/i, pt: /em breve|ainda|chega|abrir|serão|por agora/i };
  const CLES = ["pro_space.country_closed", "pro_space.comparator_country_soon", "pro_space.sub_pro_closed", "pro_onboarding.bookmakers_help_other",
    "pro_onboarding.alerts_help_closed", "pro_onboarding.telegram_help_closed", "pro_onboarding.guard_help_closed"];
  for (const l of LOCALES) CLES.forEach((k) => { const v = get(DICTS[l], k); assert.ok(v, l + "." + k); assert.doesNotMatch(v, FUTUR[l], l + "." + k + " : " + v); });
  // Tableau de bord Pro : ni comparateur (comme la carte gratuite), ni « Bientot », ni annonce du bilan IASHARK.
  for (const dir of ["gb", "mx", "za", "en", "es"]) {
    const pays = { gb: "gb", mx: "mx", za: "za", en: "autre", es: "autre" }[dir];
    const pro = await rendreTableau({ pro: true, dir, donnees: baseDonnees(pays) });
    assert.match(pro.html, /id="bGardeFou"/, dir + " : le rendu s'est arrete");
    assert.doesNotMatch(pro.html, /id="bComparateur"|id="bBientot"|id="bBilanIashark"/, dir);
    const dict = DICTS[MARCHES.build(dir).locale];
    ["Le bilan IASHARK arrivera", dict.pro_space.comparator_country_soon, "Le programme arrivera", "will come once", "when your country opens"].forEach((t) => assert.ok(!pro.html.includes(t), dir + " : " + t));
    const gratuit = await rendreTableau({ pro: false, dir, donnees: { ...baseDonnees(pays), pro_preferences: () => ({ data: null, error: null }) } });
    assert.doesNotMatch(gratuit.html, /id="bBilanIashark"/, dir + " gratuit");
  }
  const fr = await rendreTableau({ pro: true, pays: "fr", donnees: baseDonnees("fr") });
  assert.match(fr.html, /id="bComparateur"/, "France : comparateur garde");
  assert.doesNotMatch(fr.html, /id="bBilanIashark"/, "France : plus d'annonce du bilan IASHARK (controle du 30/09/2026)");
  // Formulaire : « {n} questions » = le vrai nombre d'etapes (6 en France, 3 ailleurs depuis la ronde 4.2).
  for (const l of LOCALES) assert.match(DICTS[l].pro_onboarding.sub, /^\{n\} /, l);
  // 03/10/2026 : 5 etapes en France (langue, pays, bookmakers, competitions, alertes), 4 ailleurs
  // (sans alertes) ; plus de types de paris ni de strategie (memes paris pour tous).
  const fForm = lancerFormulaire({ dir: "fr", ligne: null });
  await fForm.attendre();
  assert.ok(fForm.texte().includes(fForm.dict.pro_onboarding.step.replace("{n}", "1").replace("{total}", "5")));
  const gForm = lancerFormulaire({ dir: "gb", ligne: null });
  await gForm.attendre();
  assert.ok(gForm.texte().includes(gForm.dict.pro_onboarding.sub.replace("{n}", "4")), "gb : 4 questions");
  assert.ok(gForm.texte().includes(gForm.dict.pro_onboarding.step.replace("{n}", "1").replace("{total}", "4")));
  // Lien direct vers une etape sautee : on revient au debut, jamais une etape vide.
  const lien = lancerFormulaire({ dir: "gb", search: "?modifier=1&etape=alertes", ligne: { ...LIGNE_FR, pays: "gb" } });
  await lien.attendre();
  assert.match(lien.html(), /name="langue"/);
});

test("estimated_probability : un seul sens (100 / cote, marge comprise), pose par la base, jamais la probabilite du modele (contrat)", () => {
  const sql = read("supabase/migrations/0041_pro_accueil.sql");
  const code = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  assert.match(code, /create or replace function public\.betting_decisions_proba_de_la_cote\(\)[\s\S]*?set search_path = ''[\s\S]*?new\.estimated_probability := least\(99, greatest\(1, round\(1000 \/ new\.odds\) \/ 10\)\);/);
  assert.match(code, /create trigger betting_decisions_proba_de_la_cote\s+before insert or update of odds, estimated_probability on public\.betting_decisions\s+for each row execute function public\.betting_decisions_proba_de_la_cote\(\);/);
  // Meme calcul que la base, sur toutes les cotes a 2 decimales (arrondi exact, comme numeric).
  for (let c = 101; c <= 10000; c++) {
    const q = Math.floor(100000 / c), r = 100000 - q * c, base = Math.min(990, Math.max(10, 2 * r >= c ? q + 1 : q)) / 10;
    assert.equal(M.probaDeLaCote(c / 100), base, "cote " + c / 100);
  }
  assert.equal(M.probaDeLaCote(2.5), 40);
  assert.equal(M.probaDeLaCote(1), null);
  // La page ecrit ce meme sens (et plus une autre formule).
  const dash = read("pro-dashboard.js");
  assert.match(dash, /ligne\.estimated_probability = M\.probaDeLaCote\(ligne\.odds\);/);
  assert.doesNotMatch(dash + read("lib/pro-dashboard-model.js"), /estimated_probability[^\n]*(calibr|clv|closing)/i);
  // Contrat : la copie du site et le resume de la machine disent la meme chose.
  assert.match(CONTRAT.betting_decisions.estimated_probability.sens, /100 \/ odds/);
  assert.deepEqual(CONTRAT.betting_decisions.estimated_probability.jamais_pour, ["calibration", "valeur de cloture", "avantage du modele"]);
  const md = path.join(ROOT, "..", "CONTRAT-TABLES-PRO.md");
  if (fs.existsSync(md)) assert.match(fs.readFileSync(md, "utf8"), /`betting_decisions\.estimated_probability`[\s\S]*?`100 \/ odds`[\s\S]*?betting_decisions_proba_de_la_cote/);
});

/* ---------------- Ronde 4.2 du contre-controle (30/09/2026) : un test par preuve ----------------
   Preuves de l'avocat du diable (scratchpad avocat-pro-r41 : p1-fusion.js,
   p2-compte-gratuit.js, p3-formulaire-gb.js, p4-tableau-gratuit-gb.txt)
   rejouees sur les vrais fichiers. */
// Pages hors de France pour chaque langue (de, it, pt : pages de langue du marche euro, pays « autre »).
const HORS_FRANCE = [["gb", "gb"], ["en", "autre"], ["za", "za"], ["es", "autre"], ["mx", "mx"], ["de", "autre"], ["it", "autre"], ["pt", "autre"]];
const PROGRAMME_MOT = /programme|program|programa|programma|Programm|Canal Pro|Pro Channel|Pro-Kanal|Canale Pro/i;

test("hors de France : un compte gratuit ne lit plus « le programme du Canal Pro » (compte, formulaire, carte « Avec Pro »), 7 langues (cas prouve : p2, p4)", async () => {
  // Textes : un texte neutre dans les 7 langues, sans programme ni futur.
  for (const l of LOCALES) {
    const v = DICTS[l].pro_onboarding.pro_only_text_closed;
    assert.ok(v, l + ".pro_only_text_closed");
    assert.doesNotMatch(v, PROGRAMME_MOT, l + " : " + v);
    assert.doesNotMatch(v, /bientôt|soon|pronto|bald|presto|em breve|arriv|llegar|kommen|chega/i, l + " : " + v);
    assert.doesNotMatch(DICTS[l].pro_onboarding.account_text_closed, /strat/i, l + " : sous-titre du compte sans strategie");
  }
  const vus = new Set();
  for (const [dir, pays] of HORS_FRANCE) {
    const dict = DICTS[MARCHES.build(dir).locale];
    vus.add(MARCHES.build(dir).locale);
    // /es/ sans reglages = l'Espagne, OUVERTE le 02/10/2026 (operateurs DGOJ) : comme la France, plus « hors de France ».
    if (dir === "es") continue;
    // 1. Page Compte d'un compte gratuit (p2) : texte neutre, jamais pro_only_text.
    const compte = rendreReglagesCompte(dir, null, false).texte;
    assert.ok(compte.includes(dict.pro_onboarding.pro_only_text_closed), dir + " compte gratuit : texte neutre");
    assert.ok(!compte.includes(dict.pro_onboarding.pro_only_text), dir + " compte gratuit : « Ces reglages servent au programme du Canal Pro »");
    // Compte Pro regle hors de France : pas de ligne « Ma strategie » (reglage du programme).
    const comptePro = rendreReglagesCompte(dir, pays).texte;
    assert.ok(!comptePro.includes(dict.pro_space.strategy_title), dir + " compte Pro : « Ma strategie »");
    // 2. Formulaire ouvert par un compte gratuit : meme texte neutre.
    const f = lancerFormulaire({ dir, ligne: null, pro: false });
    await f.attendre();
    assert.ok(f.texte().includes(dict.pro_onboarding.pro_only_text_closed), dir + " formulaire gratuit : texte neutre");
    assert.ok(!f.texte().includes(dict.pro_onboarding.pro_only_text), dir + " formulaire gratuit : programme du Canal Pro");
    // 3. Carte « Avec Pro, tu as aussi » (p4) : ni « Ma strategie », ni son texte ; la ligne
    // « toutes les analyses » (grille de prix) reste ; « Ma semaine en image » est retiree (30/09/2026).
    const t = await rendreTableau({ pro: false, dir, donnees: { ...baseDonnees(pays), pro_preferences: () => ({ data: null, error: null }) } });
    assert.match(t.html, /id="bProEnPlus"/, dir + " : le rendu s'est arrete");
    assert.ok(!t.html.includes(dict.pro_space.locked_strategy), dir + " : « tes reglages pour le programme »");
    assert.doesNotMatch(t.html, /M12 3v18M3 12h18/, dir + " : ligne « Ma strategie » dans la carte");
    assert.ok(t.html.includes(dict.pricing_grid.f_all_matches), dir + " : ligne « toutes les analyses »");
    assert.doesNotMatch(t.html, /id="bSemaine"|imgSemaine/, dir + " : plus d'image de la semaine");
  }
  assert.deepEqual([...vus].sort(), LOCALES.filter((l) => l !== "fr").sort(), "les 6 autres langues rendues");
  // France : inchange.
  const fr = rendreReglagesCompte("fr", null, false);
  assert.ok(fr.texte.includes(fr.dict.pro_onboarding.pro_only_text));
  assert.ok(!rendreReglagesCompte("fr", "fr").texte.includes(fr.dict.pro_space.strategy_title), "03/10/2026 : plus de « Ma strategie » (memes paris pour tous)");
  const tFr = await rendreTableau({ pro: false, dir: "fr", donnees: { ...baseDonnees("fr"), pro_preferences: () => ({ data: null, error: null }) } });
  assert.ok(tFr.html.includes(DICTS.fr.pro_space.locked_strategy), "France : « Ma strategie » garde");
  const fFr = lancerFormulaire({ dir: "fr", ligne: null, pro: false });
  await fFr.attendre();
  assert.ok(fFr.texte().includes(DICTS.fr.pro_onboarding.pro_only_text));
});

test("hors de France : le formulaire saute l'etape Strategie et enregistre programme Telegram = non, aucune alerte (cas prouve : p3)", async () => {
  for (const [dir, pays] of [["gb", "gb"], ["mx", "mx"], ["en", "autre"], ["de", "autre"]]) {
    const f = lancerFormulaire({ dir, ligne: null });
    await f.attendre();
    const d = f.dict.pro_onboarding;
    const vus = [];
    for (let i = 0; i < 8 && !f.appels.some((a) => a.op === "upsert"); i++) { vus.push(f.texte()); await f.envoyer(); }
    assert.equal(vus.length, 4, dir + " : 4 ecrans (langue, pays, bookmakers, competitions)");
    const tout = vus.join("\n");
    [d.q_strategy, d.strat_perso_text, d.strat_ours_text, d.q_alerts, d.q_telegram].forEach((x) => assert.ok(!tout.includes(x), dir + " : " + x));
    const up = f.appels.find((a) => a.op === "upsert");
    assert.equal(up.data.pays, pays, dir);
    assert.equal(up.data.programme_prive, false, dir + " : « programme Telegram : oui » enregistre sans question (avant)");
    assert.deepEqual(JSON.parse(JSON.stringify(up.data.alertes)), [], dir + " : 4 alertes enregistrees sans question (avant)");
  }
  // France : 5 etapes, les reglages choisis partent tels quels.
  const fr = lancerFormulaire({ dir: "fr", ligne: null });
  await fr.attendre();
  let n = 0;
  for (; n < 9 && !fr.appels.some((a) => a.op === "upsert"); n++) await fr.envoyer();
  assert.equal(n, 5);
  const upFr = fr.appels.find((a) => a.op === "upsert");
  assert.equal(upFr.data.programme_prive, true);
  assert.deepEqual(JSON.parse(JSON.stringify(upFr.data.alertes)), CONTRAT.pro_preferences.alertes_defaut);
  // Regle pure, quel que soit l'ecran qui ecrit : pays ferme = non + aucune alerte ; France inchangee.
  assert.deepEqual([P.versLigne({ pays: "gb", programme_prive: true, alertes: ["seuil", "nuit"] }, "u1").programme_prive, P.versLigne({ pays: "gb", alertes: ["seuil"] }, "u1").alertes], [false, []]);
  assert.deepEqual([P.versLigne({ pays: "fr", programme_prive: true, alertes: ["seuil"] }, "u1").programme_prive, P.versLigne({ pays: "fr", alertes: ["seuil"] }, "u1").alertes], [true, ["seuil"]]);
});

test("garde-fou, Mon bilan : deux bookmakers connus et differents = deux paris ; un ticket sans mise ou sans cote n'est jamais rapproche (cas prouve : p1, cas B, C, D)", () => {
  // Cas B : 10 EUR a 2,10 chez Winamax (site) + 10 EUR a 2,10 chez Betclic (Telegram), limite 2, perdus.
  const b = M.gardeFou({ limite_paris_jour: 2 }, [noteSite(), noteRobot()], T41, null, ticketRobot({ bookmaker: "betclic" }), REFS7);
  assert.deepEqual([b.parisNotes, b.perteDuJour, b.atteint, b.doublons], [2, 20, true, 0], "avant : 1 pari, 10 EUR, limite pas atteinte");
  const bb = M.bilan([noteSite(), noteRobot()], 500, ticketRobot({ bookmaker: "betclic" }), REFS7);
  assert.deepEqual([bb.regles, bb.gain, bb.capital], [2, -20, 480], "Mon bilan : deux vrais paris");
  // Nom lu sur une photo (« Betclic Sport ») = la cle « betclic » : meme bookmaker, meme pari.
  assert.equal(M.gardeFou({ limite_paris_jour: 2 }, [noteSite({ bookmaker: "betclic" }), noteRobot()], T41, null, ticketRobot({ bookmaker: "Betclic Sport" }), REFS7).parisNotes, 1);
  // Bookmaker inconnu d'un cote (« Autre ou en boutique », ou pas lu) : ne contredit rien.
  assert.equal(M.gardeFou({ limite_paris_jour: 2 }, [noteSite({ bookmaker: null }), noteRobot()], T41, null, ticketRobot({ bookmaker: "betclic" }), REFS7).parisNotes, 1);
  assert.equal(M.gardeFou({ limite_paris_jour: 2 }, [noteSite(), noteRobot()], T41, null, ticketRobot({ bookmaker: null }), REFS7).parisNotes, 1);
  // Cas C : ticket sans mise (Betclic 2,10, pas de ligne du journal) + site Winamax 2,10 en cours, limite 2.
  const c = M.gardeFou({ limite_paris_jour: 2 }, [noteSite({ status: "pending" })], T41, null, [{ jour: J41, statut: "note", decision_id: null, pari_id: "p1", mise: null, cote: 2.1, bookmaker: "betclic" }], REFS7);
  assert.deepEqual([c.parisNotes, c.deTelegram, c.atteint], [2, 1, true], "avant : 1 pari, limite pas atteinte");
  // Meme sans bookmaker contradictoire : une mise absente ne prouve pas que c'est le meme pari.
  assert.equal(M.gardeFou({ limite_paris_jour: 2 }, [noteSite({ status: "pending" })], T41, null, [{ jour: J41, statut: "note", decision_id: null, pari_id: "p1", mise: null, cote: 2.1, bookmaker: "winamax" }], REFS7).parisNotes, 2);
  // Cas D : ticket sans mise ni cote + site, limite 2.
  const dd = M.gardeFou({ limite_paris_jour: 2 }, [noteSite({ status: "pending" })], T41, null, [{ jour: J41, statut: "note", decision_id: null, pari_id: "p1", mise: null, cote: null }], REFS7);
  assert.deepEqual([dd.parisNotes, dd.atteint], [2, true], "avant : 1 pari");
  // Ticket complet (mise et cote lues, meme bookmaker) : le meme pari, compte une fois.
  assert.equal(M.gardeFou({ limite_paris_jour: 2 }, [noteSite({ status: "pending" })], T41, null, [{ jour: J41, statut: "note", decision_id: null, pari_id: "p1", mise: 10, cote: 2.1, bookmaker: "winamax" }], REFS7).parisNotes, 1);
  // Ticket complet mais autre bookmaker : deux paris.
  assert.equal(M.gardeFou({ limite_paris_jour: 2 }, [noteSite({ status: "pending" })], T41, null, [{ jour: J41, statut: "note", decision_id: null, pari_id: "p1", mise: 10, cote: 2.1, bookmaker: "betclic" }], REFS7).parisNotes, 2);
  // La page lit le bookmaker des tickets (colonne de pro_tickets, 0040).
  assert.match(M.COLONNES_TICKETS, /\bbookmaker\b/);
  const sql = path.join(CANAL_PRO, "supabase/migrations/0040_canal_pro.sql");
  if (fs.existsSync(sql)) assert.match(fs.readFileSync(sql, "utf8"), /create table if not exists public\.pro_tickets \([\s\S]*?bookmaker text,/);
});

test("« Je l'ai joue » : un pari deja note (ticket Telegram ou ligne du journal) affiche « Deja note » (cas prouve : p1, cas A)", async () => {
  const pari = { id: "p1", ref: "PRO-7" };
  assert.equal(M.dejaNote(pari, [], []), false);
  assert.equal(M.dejaNote(pari, [], [{ statut: "note", pari_id: "p1" }]), true, "ticket Telegram de ce pari");
  assert.equal(M.dejaNote(pari, [{ id: 1, programme_ref: "PRO-7" }], []), true, "ligne du journal de ce pari");
  assert.equal(M.dejaNote(pari, [{ id: 1, programme_ref: "PRO-8" }], [{ statut: "note", pari_id: "p2" }]), false, "autre pari");
  assert.equal(M.dejaNote(pari, [], [{ statut: "annule", pari_id: "p1" }]), false, "ticket annule");
  for (const l of LOCALES) assert.ok(DICTS[l].pro_space.played_already, l + ".played_already");
  // Rendu reel (France) : le bouton qui pre-remplit la cote du matin disparait.
  const libre = await rendreTableau({ pro: true, pays: "fr", donnees: baseDonnees("fr") });
  assert.match(libre.html, /data-jouer="p1"/, "pas encore note : « Je l'ai joue »");
  const parTicket = await rendreTableau({ pro: true, pays: "fr", donnees: { ...baseDonnees("fr"), pro_tickets: () => ({ data: [{ jour: AUJ, statut: "note", decision_id: null, pari_id: "p1", mise: 10, cote: 2.05, bookmaker: "betclic" }], error: null }) } });
  assert.doesNotMatch(parTicket.html, /data-jouer="p1"/, "ticket Telegram : plus de « Je l'ai joue »");
  assert.match(parTicket.html, /data-deja-note="p1"/);
  assert.ok(parTicket.html.includes(DICTS.fr.pro_space.played_already));
  const parJournal = await rendreTableau({ pro: true, pays: "fr", donnees: { ...baseDonnees("fr"), betting_decisions: () => ({ data: [{ id: 5, status: "pending", stake: 10, odds: 2.1, match_label: "Lens – Nantes", market: "Lens gagne", source: "programme", programme_ref: "PRO-7", created_at: new Date().toISOString() }], error: null }) } });
  assert.doesNotMatch(parJournal.html, /data-jouer="p1"/, "deja dans le journal : plus de « Je l'ai joue »");
  assert.match(parJournal.html, /data-deja-note="p1"/);
});

test("migration 0041 : la source 'robot' est acceptee (seul le robot l'ecrit) ; « Mes paris » affiche « robot » pour sa ligne", async () => {
  const code = read("supabase/migrations/0041_pro_accueil.sql").split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  assert.match(code, /add constraint betting_decisions_source_check\s+check \(source in \('site', 'programme', 'robot'\)\);/, "avant : 'robot' refuse par la base");
  // L'abonne n'ecrit jamais 'robot' (politique d'ajout), et ne change pas la source ensuite.
  assert.match(code, /create policy betting_decisions_insert_own[^;]*with check \(source in \('site', 'programme'\) and \(select auth\.uid\(\)\) = user_id\);/);
  const upd = code.match(/grant update \(([^)]*)\)\s+on public\.betting_decisions to authenticated/)[1];
  assert.ok(!upd.split(",").map((x) => x.trim()).includes("source"));
  for (const l of LOCALES) assert.ok(DICTS[l].pro_space.source_robot, l + ".source_robot");
  assert.deepEqual(CONTRAT.betting_decisions.source.valeurs, ["site", "programme", "robot"], "copie du contrat a jour pour la branche canal-pro");
  // Ligne du robot : reconnue par son ticket (decision_id), ou par sa source une fois 0041 appliquee.
  assert.equal(M.sourceDuPari({ id: "d-robot", source: "site" }, [{ decision_id: "d-robot" }]), "robot");
  assert.equal(M.sourceDuPari({ id: "x", source: "robot" }, []), "robot");
  assert.equal(M.sourceDuPari({ id: "x", source: "programme" }, [{ decision_id: "autre" }]), "programme");
  assert.equal(M.sourceDuPari({ id: "x" }, null), "site");
  const { html } = await rendreTableau({ pro: true, pays: "fr", donnees: { ...baseDonnees("fr"),
    betting_decisions: () => ({ data: [{ id: "d-robot", status: "pending", stake: 10, odds: 2.05, match_label: "Lens – Nantes", market: "Lens gagne", source: "site", created_at: new Date().toISOString() }], error: null }),
    pro_tickets: () => ({ data: [{ jour: AUJ, statut: "note", decision_id: "d-robot", pari_id: "p1", mise: 10, cote: 2.05 }], error: null }) } });
  assert.match(html, /· robot<\/p>/, "avant : « site »");
  assert.doesNotMatch(html, /· site<\/p>/);
});

/* ---------------- 02/10/2026 : langue du compte, une seule source ---------------- */
test("questionnaire : la langue est demandee en premier et enregistree dans user_preferences.language (la source du site, des e-mails et du robot)", async () => {
  for (const [dir, langue] of [["es", "es"], ["mx", "es"], ["gb", "en"], ["fr", "fr"]]) {
    const f = lancerFormulaire({ dir, ligne: null });
    await f.attendre();
    assert.match(f.html(), new RegExp('name="langue" value="' + langue + '" checked'), dir + " : langue de la page cochee");
    for (let i = 0; i < 9 && !f.appels.some((a) => a.op === "upsert" && a.table === "user_preferences"); i++) await f.envoyer();
    const up = f.appels.find((a) => a.table === "user_preferences" && a.op === "upsert");
    assert.ok(up, dir + " : langue enregistree");
    assert.deepEqual(Object.keys(up.data).sort(), ["language", "user_id"], dir + " : seulement la langue (jamais le reste des preferences)");
    assert.equal(up.data.language, langue, dir);
    assert.ok(f.appels.some((a) => a.table === "pro_preferences" && a.op === "upsert"), dir + " : reglages Pro enregistres aussi");
  }
});

test("questionnaire : base sans 0044 (marches, heure_envoi absentes) = relecture et enregistrement sans elles, jamais une erreur", () => {
  const onb = read("pro-onboarding.js");
  assert.match(onb, /P\.erreurColonneAbsente\(r\.error\)[\s\S]*?P\.COLONNES_BASE\.join/);
  assert.match(onb, /etat\.sans0044 = true;\s*r = await sb\.from\(P\.TABLE\)\.upsert\(P\.versLigne\(etat\.prefs, ctx\.user\.id, \{ sans0044: true \}\)/);
  assert.deepEqual(Object.keys(P.versLigne({ pays: "fr", marches: ["buts"], heure_envoi: 12 }, "u", { sans0044: true })).sort(), ["user_id"].concat(P.COLONNES_BASE).sort());
  assert.ok(P.erreurColonneAbsente({ code: "PGRST204", message: "Could not find the 'marches' column" }));
  assert.ok(P.erreurColonneAbsente({ code: "42703", message: "column pro_preferences.heure_envoi does not exist" }));
  assert.ok(!P.erreurColonneAbsente({ code: "42501", message: "permission denied" }));
});

test("types de paris : chaque identifiant moteur connu tombe dans un groupe, aucun groupe sans texte (7 langues)", () => {
  const exemples = { "home-win": "resultat", "dc-x2": "resultat", "over-25": "buts", "under-35": "buts", "btts-yes": "btts", "fh-under-15": "mi_temps",
    "total-corners-over-9_5": "corners_cartons", "total-cards-under-4_5": "corners_cartons", "total-shots-on-target-under-11_5": "tirs" };
  Object.entries(exemples).forEach(([id, g]) => assert.equal(P.groupeDuMarche(id), g, id));
  assert.equal(P.groupeDuMarche(""), null);
  for (const l of LOCALES) P.MARCHES.forEach((m) => assert.ok(get(DICTS[l], "pro_onboarding.market_" + m), l + " market_" + m));
});
