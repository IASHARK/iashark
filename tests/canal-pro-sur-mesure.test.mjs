// Messages Pro « sur mesure » (03/10/2026, decision de Clement). Donnees FICTIVES, base en memoire, faux
// Telegram : aucun vrai message n'est envoye. Ce qui est prouve ici :
//  1. les MEMES paris et les MEMES chances pour tous ; pour chaque abonne UN message : sa langue, la meilleure
//     cote chez SES bookmakers (de son pays), son heure ; ses competitions preferees = information seulement ;
//  2. la liste des competitions est la meme pour le site et le robot, generee depuis config/leagues.json ;
//  3. aucun regulateur (ANJ, DGOJ…) dans les textes vus par les abonnes, dans les 6 langues ;
//  4. la journee type (vrai robot) : Lucas, Pablo, Marie recoivent les memes paris, l'info de leurs competitions.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { createRequire } from "node:module";
import * as C from "../supabase/functions/_shared/canal-pro.mjs";
import * as D from "../supabase/functions/_shared/canal-pro-diffusion.mjs";
import * as A from "../supabase/functions/_shared/canal-pro-accueil.mjs";
import * as LG from "../supabase/functions/_shared/canal-pro-langues.mjs";
import { DONNEES_COMPETITIONS } from "../supabase/functions/_shared/competitions-pro.mjs";

const require = createRequire(import.meta.url);
const lire = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const KO = "2026-10-10T14:00:00Z"; // samedi 10/10, 16 h a Paris
const pari = (x) => ({ famille: "simple", jour: "2026-10-10", coup_envoi: KO, marche: "1", ligne: null, proba: 0.69, cote_vue_at: "2026-10-10T07:30:00Z", publie_at: "2026-10-10T07:30:00Z", selections: [], ...x });
const LIVERPOOL = pari({ id: "p1", numero: 2, ligue: "Premier League", dom: "Liverpool", ext: "Everton", selection: "Liverpool gagne", voie: "cotes_marche",
  source_proba: C.SOURCE_COTES_MARCHE, meilleure_cote: 1.45, meilleur_bookmaker: "unibet", cotes: { unibet: 1.45, winamax: 1.41, betclic: 1.4 } });
const SEVILLA = pari({ id: "p2", numero: 3, ligue: "Liga", dom: "Sevilla", ext: "Valencia", selection: "Sevilla gagne", proba: 0.55, meilleure_cote: 1.75, meilleur_bookmaker: "winamax", cotes: { winamax: 1.75, betclic: 1.72 } });
const prefs = (x) => C.preferencesEffectives({ pays: "fr", ...x });

test("memes paris pour tous : UN message par abonne, sa cote chez SES bookmakers, jamais un pari en moins ni en plus", () => {
  const lucas = C.messageProgrammeAbonne("2026-10-10", [LIVERPOOL, SEVILLA], prefs({ bookmakers: ["winamax", "betclic"], competitions: ["premier"] }), { prenom: "Lucas" });
  const marie = C.messageProgrammeAbonne("2026-10-10", [LIVERPOOL, SEVILLA], prefs({ competitions: ["ligue1", "laliga"] }), { prenom: "Marie" });
  for (const t of [lucas, marie]) {
    assert.match(t, /Sélection : <b>Liverpool gagne<\/b>\nChance calculée par IASHARK à partir des cotes du marché : 69 %\./, "Premier League : libelle de chance inchange");
    assert.match(t, /Sélection : <b>Sevilla gagne<\/b>\nChance calculée par IASHARK : 55 %\./, "Lucas recoit aussi le pari de Liga (memes paris pour tous)");
    assert.match(t, /N° PRO-2[\s\S]*N° PRO-3/);
  }
  assert.match(lucas, /^<b>Lucas, ton programme du samedi<\/b> · 2 simples\n/);
  assert.match(lucas, /meilleure cote chez tes bookmakers \(Winamax, Betclic\)/);
  assert.match(lucas, /Liverpool – Everton[\s\S]*Cote : <b>1,41<\/b> chez Winamax/, "SA meilleure cote, pas celle d'Unibet");
  assert.match(marie, /Liverpool – Everton[\s\S]*Cote : <b>1,45<\/b> chez Unibet/, "sans bookmaker choisi : la meilleure chez tous ceux suivis de son pays");
  // Pas propose chez SES bookmakers : on le dit, avec la meilleure ailleurs (dans son pays).
  const pmu = C.messageProgrammeAbonne("2026-10-10", [SEVILLA], prefs({ bookmakers: ["pmu"] }));
  assert.match(pmu, /Cote : pas proposée chez tes bookmakers \(ailleurs : 1,75 chez Winamax\) · relevée à 9 h 30/);
  // Les choix d'avant (strategie perso, types, competitions) ne retirent plus aucun pari.
  const ancien = C.preferencesEffectives({ pays: "fr", strategie: "perso", familles: ["buteur"], competitions: ["F1"], cote_min_perso: 3 });
  assert.deepStrictEqual([ancien.strategie, ancien.competitions, ancien.cote_min_perso], ["iashark", ["ligue1"], null], "ancien code « F1 » relu comme « ligue1 »");
  assert.ok(C.pariPourAbonne(LIVERPOOL, ancien) && C.pariPourAbonne(SEVILLA, ancien));
  assert.match(C.messageProgrammeAbonne("2026-10-10", [LIVERPOOL, SEVILLA], ancien), /Liverpool gagne[\s\S]*Sevilla gagne/);
});

test("competitions preferees : seulement l'info (matchs du jour avec le lien d'analyse, sans pari ni chance) ; rien si pas de match ou « toutes »", () => {
  const site = [
    { id: 5100, league_id: 39, status: "NS", home: { n: "Arsenal" }, away: { n: "Chelsea" }, date: "2026-10-10 13:30", page_dirs: ["fr", "es", "en"] },
    { id: 5101, league_id: 140, status: "NS", home: { n: "Sevilla" }, away: { n: "Valencia" }, date: "2026-10-10 16:15" },
    { id: 5102, league_id: 39, status: "NS", home: { n: "Fulham" }, away: { n: "Wolves" }, date: "2026-10-11 15:00" }, // demain : pas aujourd'hui
    { id: 5103, league_id: 10, status: "NS", home: { n: "France" }, away: { n: "Italie" }, date: "2026-10-10 20:45" }, // amical international : hors liste
  ];
  const debut = "2026-10-10T07:30:00Z", fin = C.parisVersDate("2026-10-10", "23:59");
  const infos = { cle: "jour-2026-10-10", genre: "jour", matchs: C.matchsDesCompetitions(site, debut, fin) };
  assert.deepStrictEqual(infos.matchs.map((m) => m.cle), ["premier", "laliga"]);
  const lucas = C.sectionCompetitions(infos, prefs({ competitions: ["premier"] }), { maintenant: debut });
  assert.strictEqual(lucas, "<b>Aujourd'hui dans tes compétitions</b> · Pour info, sans pari.\n<i>Premier League</i>\n• 13 h 30 · Arsenal – Chelsea · <a href=\"https://iashark.com/match/5100.html\">analyse</a>");
  assert.ok(!/Sevilla|chance|cote|%/i.test(lucas), "ni pari, ni chance, ni cote");
  const es = C.sectionCompetitions(infos, C.preferencesEffectives({ pays: "es", competitions: ["laliga"] }), { lang: "es", maintenant: debut });
  assert.match(es, /^<b>Hoy en tus competiciones<\/b> \(hora de París\) · Solo para información, sin apuesta\.\n<i>La Liga<\/i>\n• 16:15 · Sevilla – Valencia · <a href="https:\/\/iashark\.com\/es\/match\.html\?id=5101">análisis<\/a>$/);
  assert.strictEqual(C.sectionCompetitions(infos, prefs({ competitions: ["ligue1"] }), { maintenant: debut }), "", "pas de match de ses competitions : rien");
  assert.strictEqual(C.sectionCompetitions(infos, prefs({ competitions: [] }), { maintenant: debut }), "", "« toutes » : pas de liste a part");
  assert.strictEqual(C.sectionCompetitions(infos, prefs({ competitions: ["premier"] }), { maintenant: "2026-10-10T12:00:00Z" }), "", "match deja commence : plus liste");
  // Le lendemain : les resultats, lus dans le registre des pages match du pipeline (score connu seulement).
  const registre = { matches: { 5100: { league_key: "premier", kickoff: "2026-10-10T12:30:00Z", snapshot: { home: { n: "Arsenal" }, away: { n: "Chelsea" } }, final_score: { home: 2, away: 1 } },
    5104: { league_key: "premier", kickoff: "2026-10-10T14:00:00Z", snapshot: { home: { n: "Liverpool" }, away: { n: "Everton" } } } } };
  const hier = { cle: "hier-2026-10-11", genre: "hier", matchs: C.resultatsDesCompetitions(registre, C.parisVersDate("2026-10-10"), C.parisVersDate("2026-10-11", "06:00")) };
  assert.strictEqual(C.sectionCompetitions(hier, prefs({ competitions: ["premier"] })), "<b>Hier dans tes compétitions</b> · Pour info, sans pari.\n<i>Premier League</i>\n• Arsenal 2-1 Chelsea");
});

test("diffusion : le programme de chacun + la section de ses competitions, une seule fois ; sans section pour « toutes »", async () => {
  const envoyes = [], poses = new Set();
  const abonnes = [
    { user_id: "lucas", chat_id: 1, prenom: "Lucas", langue: "fr", prefs: prefs({ bookmakers: ["winamax", "betclic"], competitions: ["premier"] }) },
    { user_id: "pablo", chat_id: 2, prenom: "Pablo", langue: "es", prefs: C.preferencesEffectives({ pays: "es" }) },
  ];
  const deps = { abonnes: async () => abonnes, poser: async (k) => (poses.has(k) ? false : (poses.add(k), true)), envoyer: async (chat, html) => { envoyes.push({ chat, html }); return { message_id: envoyes.length }; },
    maintenant: () => new Date("2026-10-10T07:30:00Z"), pause: 0 };
  const infos = { cle: "jour-2026-10-10", genre: "jour", matchs: [{ cle: "premier", id: 5100, dom: "Arsenal", ext: "Chelsea", ko: "2026-10-10T12:30:00Z" }] };
  const programme = { jour: "2026-10-10", motifVide: "regles", tete: true, paris: { FR: [LIVERPOOL], ES: [{ ...LIVERPOOL, cotes: { williamhill: 1.43 }, meilleure_cote: 1.43, meilleur_bookmaker: "williamhill" }] } };
  const b = await D.diffuser(deps, { cle: "programme-2026-10-10", type: "programme", programme, infos, textes: {} });
  assert.strictEqual(b.envoyes, 2);
  const [l, p] = envoyes;
  assert.match(l.html, /^<b>Lucas, ton programme du samedi<\/b>[\s\S]*1,41<\/b> chez Winamax[\s\S]*\n\n<b>Aujourd'hui dans tes compétitions<\/b>[\s\S]*Arsenal – Chelsea/);
  assert.match(p.html, /^<b>Pablo, tu programa del sábado<\/b>[\s\S]*1,43<\/b> en William Hill/);
  assert.ok(!/Hoy en tus competiciones|Winamax|Betclic|Unibet/.test(p.html), "Pablo : « toutes » (pas de liste), jamais un operateur francais");
  // Une liste seule (jour sans programme) ne repete jamais celle deja recue avec le programme.
  const seule = await D.diffuser(deps, { cle: "infos-jour-2026-10-10", type: "infos", infos, garde: false });
  assert.strictEqual(seule.envoyes, 0);
});

test("une seule liste de competitions pour le site et le robot, generee depuis config/leagues.json (Premier League en tete)", () => {
  const G = require("../scripts/sync-competitions-pro.js");
  const attendu = G.donneesDepuisConfig();
  assert.deepStrictEqual(DONNEES_COMPETITIONS, attendu, "robot : relancer node scripts/sync-competitions-pro.js");
  const P = require("../lib/pro-preferences.js");
  assert.deepStrictEqual(P.COMPETITIONS_PRO, attendu, "site : relancer node scripts/sync-competitions-pro.js");
  assert.strictEqual(lire("supabase/functions/_shared/competitions-pro.mjs"), G.fichierRobot(attendu));
  // Memes cles des deux cotes, regroupees, Premier League en tete ; toutes les competitions qui peuvent recevoir un pari y sont.
  assert.strictEqual(attendu.liste[0].cle, "premier");
  assert.deepStrictEqual(Object.keys(attendu.groupes), ["grands", "selections", "coupes", "europe", "monde"]);
  const cfg = require("../config/leagues.json");
  for (const k of [...Object.keys(cfg.fiabilite.ligues_validees_cotes_marche), "laliga", "bundesliga", "seriea", "ligue1", "eredivisie", "primeira"])
    assert.ok(C.COMPETITIONS[k], k);
  assert.deepStrictEqual(P.competitionsPro("fr").flatMap((g) => g.competitions.map((c) => c.cle)), C.COMPETITIONS_PRO.map((c) => c.cle), "site = robot");
  const robot = A.question("co", C.preferencesEffectives({ pays: "fr" }), "fr").reply_markup.inline_keyboard.flat().map((b) => b.callback_data).filter((d) => !/tout|g-|ok|^ac:x$/.test(d)).map((d) => d.slice(6));
  assert.deepStrictEqual(robot, C.COMPETITIONS_PRO.map((c) => c.cle), "robot : la meme liste, dans le meme ordre");
  // Le site enregistre la meme cle que le robot (pro_preferences.competitions, 0049 : plus de liste figee F1..P1).
  assert.deepStrictEqual(P.normaliser({ competitions: ["premier", "F1", "inconnue"] }).competitions, ["premier", "ligue1"]);
  assert.match(lire("supabase/migrations/0049_competitions_preferees.sql"), /drop constraint if exists pro_preferences_competitions_check/);
  assert.match(lire("pro-onboarding.js"), /P\.competitionsPro\(/);
  assert.doesNotMatch(lire("pro-onboarding.js"), /etapeStrategie|etapeMarches/, "plus de strategie ni de types de paris sur le site");
});

test("aucun regulateur cite dans les textes vus par les abonnes (robot dans les 6 langues, questionnaire du site, espace Pro)", () => {
  const REGULATEUR = /\bANJ\b|DGOJ|Autorité nationale des jeux|Ordenación del Juego|UKGC|Gambling Commission|\bGespa\b|SEGOB/;
  const sansCommentaires = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/ .*$/, "")).join("\n");
  for (const f of ["supabase/functions/_shared/canal-pro-langues.mjs", "supabase/functions/_shared/canal-pro-accueil.mjs", "supabase/functions/_shared/canal-pro.mjs",
    "supabase/functions/_shared/canal-pro-diffusion.mjs", "supabase/functions/telegram-bot/index.ts"]) {
    const m = sansCommentaires(lire(f)).match(REGULATEUR);
    assert.ok(!m, `${f} : « ${m && m[0]} »`);
  }
  // Textes produits dans les 6 langues (questions, aide, reglages, programme).
  for (const lang of LG.LANGUES) {
    const p = C.preferencesEffectives({ pays: lang === "es" ? "es" : "fr", bookmakers: [] });
    const textes = [...A.ETAPES.map((e) => A.question(e, p, lang)?.text || ""), A.bienvenue(lang, { ouvert: true }), A.recap(p, lang), C.messageReglages(p, lang), C.aideRobot(lang),
      C.messageProgrammeAbonne("2026-10-10", [LIVERPOOL], p, { lang, prenom: "X" }), JSON.stringify(LG.textes(lang))];
    for (const t of textes) assert.doesNotMatch(t, REGULATEUR, `${lang} : ${t.slice(0, 120)}`);
  }
  // Site : questionnaire et espace Pro, 7 langues.
  for (const l of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(lire(`i18n/dict/${l}.json`));
    for (const ns of ["pro_onboarding", "pro_space", "pro_perso"]) assert.doesNotMatch(JSON.stringify(d[ns] || {}), REGULATEUR, `${l}.${ns}`);
  }
});

test("journee type (vrai robot) : Lucas, Pablo et Marie recoivent les MEMES paris ; seules changent la langue, l'heure, leurs cotes, leurs alertes et l'info de leurs competitions", async () => {
  const { journeeType } = await import("../scripts/canal-pro/journee-type.mjs");
  const r = await journeeType();
  const recus = (k) => r.journal.filter((m) => m.ou === k && m.de === "robot");
  const prog = (k) => recus(k).find((m) => /programme du samedi|programa del sábado/.test(m.html));
  const numeros = (m) => (m.html.match(/N° PRO-\d+/g) || []).join(",");
  const [l, p, m] = ["lucas", "pablo", "marie"].map(prog);
  assert.ok(l && p && m, "chacun recoit son programme");
  assert.ok(numeros(l) && numeros(l) === numeros(p) && numeros(l) === numeros(m), "memes paris pour les trois");
  assert.ok(/Premier League · Liverpool – Everton/.test(l.html), "Premier League au programme (voie « cotes du marche »)");
  // Heures : Lucas et Marie a la publication (9 h 30), Pablo a son heure (12 h).
  assert.deepStrictEqual([l, m, p].map((x) => C.paris(x.t).hm), ["09:30", "09:30", "12:00"]);
  // Cotes : Lucas chez Winamax / Betclic seulement ; Pablo chez des operateurs d'Espagne seulement.
  assert.ok(!/chez (Unibet|PMU|NetBet)/.test(l.html));
  assert.ok(!/Winamax|Betclic|Unibet|PMU|NetBet/.test(p.html) && /en (Betsson|William Hill|888sport|Marathonbet)/.test(p.html));
  // Info : Lucas, la Premier League seulement ; Marie, Ligue 1 et Liga ; Pablo (« toutes ») : pas de liste.
  const info = (x) => (x.html.split(/<b>Aujourd'hui dans tes compétitions<\/b>/)[1] || "");
  assert.match(info(l), /<i>Premier League<\/i>/);
  assert.ok(!/<i>(La Liga|Ligue 1|Championship)<\/i>/.test(info(l)));
  assert.match(info(m), /<i>La Liga<\/i>[\s\S]*<i>Ligue 1<\/i>/);
  assert.strictEqual(info(p), "");
  // Alertes : Marie les a coupees ; Lucas et Pablo les recoivent.
  assert.ok(!recus("marie").some((x) => /Cote en baisse|composition|Météo/.test(x.html)));
  assert.ok(recus("lucas").some((x) => /Cote en baisse/.test(x.html)) && recus("pablo").some((x) => /Cuota a la baja/.test(x.html)));
  // Resultats d'hier le lendemain matin, debrief et bilan pour tous.
  assert.ok(recus("lucas").some((x) => /^<b>Hier dans tes compétitions<\/b>[\s\S]*Premier League/.test(x.html)));
  for (const k of ["lucas", "pablo", "marie"]) assert.ok(recus(k).some((x) => /Bilan de la semaine|Balance de la semana/.test(x.html)), k + " : bilan");
  // Premiers messages de Lucas (liaison vendredi soir, reglages deja remplis sur le site) : bienvenue (avec, UNE fois,
  // « pas des conseils de paris, aucune mise conseillee »), recapitulatif, puis son premier programme.
  const premiers = recus("lucas").filter((x) => x.premier).map((x) => x.html);
  assert.strictEqual(premiers.length, 2);
  assert.match(premiers[0], /^<b>C'est fait, Lucas : ton compte est relié\.<\/b>[\s\S]*ce ne sont pas des conseils de paris, aucune mise n'est jamais conseillée, et chacun décide seul\.$/);
  assert.match(premiers[1], /^<b>C'est réglé !<\/b> Récapitulatif :[\s\S]*Compétitions \(pour info\) : Premier League/);
  const AVERT = "IASHARK publie des analyses et des probabilités calculées : ce ne sont pas des conseils de paris, aucune mise n'est jamais conseillée, et chacun décide seul.";
  assert.strictEqual(recus("lucas").filter((x) => x.html.includes(AVERT)).length, 1, "une seule fois");
  // Le meme match avec buteur (samedi) est au programme de tous ; Ligue des nations (lundi) aussi.
  assert.match(l.html, /MÊME MATCH AVEC BUTEUR/);
  for (const k of ["lucas", "pablo", "marie"]) assert.ok(recus(k).some((x) => /Ligue des nations · Spain – Georgia/.test(x.html)), k + " : Ligue des nations");
  // Regles : aucun doublon, ni mise, ni conseil, ni promesse, ni « risques », ni regulateur (hors la phrase de bienvenue).
  for (const k of ["lucas", "pablo", "marie"]) {
    const t = recus(k).map((x) => x.html);
    assert.strictEqual(new Set(t).size, t.length, k + " : aucun doublon");
    for (const x of t) assert.doesNotMatch(x.replace(AVERT, ""), /\bmises?\b|conseil|unité|capital|espérance|garanti|comporte des risques|ANJ|DGOJ|historique|\bjoue\b|\bparie\b|aconsej|consejo/i, `${k} : ${x.slice(0, 80)}`);
  }
});
