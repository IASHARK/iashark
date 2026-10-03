// Robot Telegram et messages Pro (en prive) dans la langue de chaque abonne (02/10/2026).
// Donnees FICTIVES, base en memoire, faux Telegram : aucun vrai message n'est envoye.
// Ce qui est prouve ici :
//  1. la langue choisie (compte, sinon Telegram, sinon francais) ;
//  2. les messages traduits gardent EXACTEMENT les chiffres du message francais (une seule source) ;
//  3. les regles de contenu tiennent dans toutes les langues (ni mise, ni promesse, ni « risques ») ;
//  4. journee simulee : chaque abonne recoit en prive le programme dans sa langue (plus de canal Pro) ;
//     debrief envoye dans la langue de chacun apres le clic de Clement ;
//  5. robot personnel (Edge Function chargee avec une fausse base) : reponses en espagnol, /idioma.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import * as C from "../supabase/functions/_shared/canal-pro.mjs";
import * as M from "../supabase/functions/_shared/canal-pro-menu.mjs";
import * as LG from "../supabase/functions/_shared/canal-pro-langues.mjs";
import { BaseMemoire } from "../scripts/canal-pro/lib/base.mjs";
import * as T from "../scripts/canal-pro/taches.mjs";
import { matchV3, sortieV3 } from "../scripts/canal-pro/lib/exemple-v3.mjs";
import { chargerRobot } from "./helpers/faux-robot-telegram.mjs";

const ICI = path.dirname(fileURLToPath(import.meta.url));

// ---------- un pari d'exemple (fictif) ----------
const KO = "2026-10-10T13:00:00Z"; // samedi 10/10, 15 h a Paris
const pariSimple = {
  id: "p1", jour: "2026-10-10", famille: "simple", ligue: "Serie A", dom: "Torino", ext: "Udinese", coup_envoi: KO, marche: "1", ligne: null,
  proba: 0.55, meilleure_cote: 1.74, meilleur_bookmaker: "betclic", cotes: { betclic: 1.74, winamax: 1.7 }, cote_vue_at: "2026-10-10T07:25:00Z",
  numero: 12, publie_at: "2026-10-10T07:30:00Z", selection: "Torino gagne", selections: [],
};
const combine = {
  id: "p2", jour: "2026-10-10", famille: "combine", coup_envoi: KO, proba: 0.31, meilleure_cote: 2.88, meilleur_bookmaker: "winamax", cote_vue_at: "2026-10-10T07:25:00Z",
  numero: 13, publie_at: "2026-10-10T07:30:00Z", selections: [
    { ligue: "Liga", dom: "Real Madrid", ext: "Getafe", coup_envoi: KO, marche: "1", selection: "Real Madrid gagne", cote: 1.38 },
    { ligue: "Bundesliga", dom: "Bayern", ext: "Mainz", coup_envoi: "2026-10-10T16:30:00Z", marche: "1X", selection: "Bayern ou nul", cote: 1.12 },
  ],
};
const INTERDITS = /\bmise\b|unité|capital|espérance|\bstake\b|\bunits?\b|expected value|esperanza|\bunidad|garantiz|guarantee|garanti|sûr de gagner|seguro que ganas|comporte des risques|conlleva riesgos|involves risk|\bVIP\b|valeur|value bet|rentable|profitable/i;
const chiffres = (t) => (String(t).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(",", "."));

// ---------- 1. la langue ----------
test("langue : le compte d'abord, sinon Telegram, sinon francais", () => {
  assert.strictEqual(LG.choisirLangue("es", "fr"), "es");
  assert.strictEqual(LG.choisirLangue(null, "es-ES"), "es");
  assert.strictEqual(LG.choisirLangue(undefined, "pt-br"), "pt");
  assert.strictEqual(LG.choisirLangue(null, null), "fr");
  assert.strictEqual(LG.choisirLangue("xx", "zz"), "fr", "langue inconnue : francais");
  assert.strictEqual(LG.commande("/idioma"), "langue");
  assert.strictEqual(LG.commande("/programa@IasharkBot"), "programme");
  assert.strictEqual(LG.commande("/reglages"), "reglages");
  assert.strictEqual(LG.commande("/inconnue"), null);
});

test("francais : rien ne change (les textes d'origine sont gardes mot pour mot)", () => {
  const avant = C.messagesCanal("2026-10-10", [pariSimple]);
  assert.deepStrictEqual(C.messagesCanal("2026-10-10", [pariSimple], { lang: "fr" }), avant);
  assert.deepStrictEqual(C.messagesCanal("2026-10-10", [pariSimple], { lang: "xx" }), avant, "langue inconnue : repli en francais");
  assert.match(avant.paris[0].html, /Sélection : <b>Torino gagne<\/b>\nChance calculée par IASHARK : 55 %\.\nCote : <b>1,74<\/b> chez Betclic · relevée à 9 h 25\nN° PRO-12/);
  assert.strictEqual(C.heureTxt(KO), "15 h");
});

// ---------- 2. memes chiffres, autre langue ----------
test("traduction : memes chiffres, meme pari, meme bookmaker que le message francais, dans les 6 langues", () => {
  for (const p of [pariSimple, combine]) {
    const fr = C.messagesCanal("2026-10-10", [p]).paris[0].html;
    for (const lang of LG.LANGUES) {
      const t = C.messagesCanal("2026-10-10", [p], { lang }).paris[0].html;
      for (const n of ["1.74", "55", "12"].filter((x) => chiffres(fr).includes(x))) assert.ok(chiffres(t).includes(n), `${lang} : ${n} manque`);
      for (const n of p.famille === "combine" ? ["2.88", "1.38", "1.12", "31", "13"] : []) assert.ok(chiffres(t).includes(n), `${lang} : ${n} manque (combine)`);
      assert.ok(t.includes(p.famille === "combine" ? "Winamax" : "Betclic"), `${lang} : meme bookmaker`);
      for (const eq of p.famille === "combine" ? ["Real Madrid", "Getafe", "Bayern", "Mainz"] : ["Torino", "Udinese", "Serie A"]) assert.ok(t.includes(eq), `${lang} : noms d'equipes et de competitions gardes`);
    }
  }
  const es = C.messagesCanal("2026-10-10", [pariSimple], { lang: "es" });
  assert.match(es.paris[0].html, /Selección: <b>Gana Torino<\/b>\nProbabilidad calculada por IASHARK: 55 %\.\nCuota: <b>1,74<\/b> en Betclic · tomada a las 09:25\nN° PRO-12/);
  assert.match(es.paris[0].html, /15:00 \(hora de París\)/, "heure de Paris indiquee");
  assert.match(es.tete, /<b>Programa del sábado<\/b> · 1 simple\nJornada tranquila/);
  const en = C.messagesCanal("2026-10-10", [pariSimple], { lang: "en" }).paris[0].html;
  assert.match(en, /Odds: <b>1\.74<\/b> at Betclic/, "anglais : point decimal");
  assert.match(C.messagesCanal("2026-10-10", [combine], { lang: "es" }).paris[0].html, /Empate o Mainz|Bayern o empate/, "selection du combine recalculee dans la langue");
});

test("regles de contenu dans toutes les langues : ni mise, ni unite, ni esperance, ni promesse, ni « risques »", () => {
  const prefs = C.preferencesEffectives({ pays: "fr", bookmakers: ["winamax"] });
  const regle = { ...pariSimple, resultat: "perdu", score_dom: 0, score_ext: 1, faits: { dom: { xg: 1.9, tirs: 15 }, ext: { xg: 0.6, tirs: 5, arrets: 6 } } };
  for (const lang of LG.LANGUES.filter((l) => l !== "fr")) {
    const L = LG.textes(lang);
    const tout = [
      ...Object.values(C.messagesCanal("2026-10-10", [pariSimple, combine], { lang })).flat().map((x) => (typeof x === "string" ? x : x.html)),
      C.messagesCanal("2026-10-10", [], { lang, motifVide: "regles_partiel" }).tete,
      C.messageProgrammePerso("2026-10-10", [pariSimple, combine], prefs, { lang, prenom: "Ana", notes: 1 }),
      C.messageDebrief(C.titreDebrief("soir", "2026-10-10", lang), [regle], { lang }),
      C.messageBilanSemaine("2026-10-05", "2026-10-11", [regle], [regle], { lang }),
      C.MESSAGE_REPORTE("2026-10-10", "publication", "cotes", lang),
      C.messageReglages(prefs, lang), C.aideRobot(lang), C.messageGardeFou(4, 5, lang), C.messageGardeFou(0, 0, lang),
      ...Object.values(L.robot).map((v) => (typeof v === "function" ? v("x") : v)),
    ];
    for (const t of tout) assert.ok(!INTERDITS.test(t), `${lang} : mot interdit dans « ${String(t).slice(0, 120)} »`);
    assert.ok(tout.every((t) => t && !/undefined|NaN|\[object/.test(t)), `${lang} : aucun trou dans un message`);
  }
});

test("debrief, bilan, alertes, composition, meteo : memes faits, autre langue", () => {
  const regle = { ...pariSimple, resultat: "perdu", score_dom: 0, score_ext: 1, faits: { dom: { xg: 1.9, tirs: 15 }, ext: {} } };
  const es = C.messageDebrief(C.titreDebrief("soir", "2026-10-10", "es"), [regle], { lang: "es" });
  assert.match(es, /^<b>Resumen del sábado<\/b> · 1 apuesta: 0 ganadas, 1 perdida\.\n\nN° PRO-12 · Torino – Udinese 0-1: Gana Torino, perdida \(cuota 1,74\)\. Torino tuvo 1,9 goles esperados y 15 tiros\./);
  const fr = C.messageDebrief(C.titreDebrief("soir", "2026-10-10"), [regle]);
  assert.match(fr, /^<b>Débrief du samedi<\/b> · 1 pari : 0 gagné, 1 perdu\./, "francais inchange");
  const prefs = C.preferencesEffectives({ pays: "fr", bookmakers: ["winamax"] });
  const [al] = C.alertesCote(pariSimple, { winamax: 1.6, betclic: 1.72 }, prefs, new Set(), { maintenant: Date.parse("2026-10-10T09:00:00Z"), lang: "es" });
  assert.match(al.texte, /<b>Cuota a la baja<\/b>: Gana Torino \(Torino – Udinese\) ha pasado de 1,70 a 1,60 en Winamax\. En otra casa: 1,72 en Betclic/);
  const v = C.voyantComposition({ statut_match: "NS", equipes: [{ nom: "Torino", titulaires: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], precedent: { titulaires: [1, 2, 3, 4, 5, 6, 20, 21, 22, 23, 24] } }] });
  assert.strictEqual(v.voyant, "À SURVEILLER");
  assert.match(C.messageCompositionPerso(pariSimple, v, { cote: 1.7, bookmaker: "winamax" }, "FR", "es"), /alineación <b>A VIGILAR<\/b>\. Torino cambia 5 titulares respecto a su último partido\. La apuesta sigue, tú decides\.\nEn tus casas: 1,70 en Winamax\./);
  assert.match(C.messageMeteo(pariSimple, "Turin", C.meteoForte({ rain: { "3h": 10 }, wind: { speed: 12 } }, "es"), "es"), /lluvia fuerte y viento de 43 km\/h/);
  assert.strictEqual(C.meteoForte({ rain: { "3h": 10 } }), "forte pluie", "francais inchange");
});

test("ticket ecrit en espagnol : lu, relie au pari du programme, confirme en espagnol", () => {
  const t = C.lireTicketTexte("10 € a Gana Torino a 1,65 en Betclic", [pariSimple], "FR", "es");
  assert.ok(C.estUnTicket(t, "10 € a Gana Torino a 1,65 en Betclic"));
  assert.strictEqual(t.pari?.id, "p1", "meme pari que le programme");
  assert.strictEqual(C.messageTicket(t, "FR", "es"), "Ticket leído: 10 € a Gana Torino (Torino – Udinese) a 1,65 en Betclic.");
  assert.ok(!C.estUnTicket(C.lireTicketTexte("¿por qué perdió la de ayer a 1,85?", [pariSimple]), "¿por qué perdió la de ayer a 1,85?"), "une question part a l'equipe");
});

// ---------- 3. journee simulee (robot planifie) ----------
const TX = 8; // compte des messages dans le faux Telegram
function fauxTelegram() {
  let n = 100;
  const tg = async (methode, corps) => { tg.appels.push({ methode, corps }); return { message_id: ++n }; };
  tg.appels = [];
  return tg;
}
const messages = (tg, chat) => tg.appels.filter((a) => a.methode === "sendMessage" && (chat === undefined || String(a.corps.chat_id) === String(chat))).map((a) => a.corps.text);
function evenement(dom = "Torino", ext = "Udinese") {
  const h2h = (a, b, c) => [{ key: "h2h", outcomes: [{ name: dom, price: a }, { name: "Draw", price: b }, { name: ext, price: c }] }];
  return { id: "ev1", sport_key: "soccer_italy_serie_a", commence_time: KO, home_team: dom, away_team: ext, bookmakers: [
    { key: "pinnacle", title: "Pinnacle", markets: h2h(1.8, 3.7, 4.6) }, { key: "betclic_fr", title: "Betclic (FR)", markets: h2h(1.74, 3.5, 4.3) },
    { key: "winamax_fr", title: "Winamax (FR)", markets: h2h(1.7, 3.55, 4.35) }] };
}
function journee({ langueEs = "es" } = {}) {
  let heure = "2026-10-10T06:45:00Z";
  const db = new BaseMemoire({
    telegram_settings: [{ key: "canal_pro_mode", value: "ouvert" }],
    users: [{ id: "fr1", plan: "pro", role: "customer" }, { id: "es1", plan: "pro", role: "customer" }, { id: "en1", plan: "pro", role: "customer" }],
    telegram_abonnes: [
      { user_id: "fr1", chat_id: 555, prenom: "Karim", bloque: false },
      { user_id: "es1", chat_id: 777, prenom: "Lucía", bloque: false },
      // Sans ligne user_preferences : langue de son Telegram (anglais).
      { user_id: "en1", chat_id: 888, prenom: "Tom", bloque: false, langue_telegram: "en" },
    ],
    user_preferences: [{ user_id: "fr1", language: "fr" }, { user_id: "es1", language: langueEs }],
    pro_preferences: [{ user_id: "fr1", pays: "fr", bookmakers: ["winamax"] }, { user_id: "es1", pays: "fr", bookmakers: ["winamax"] }],
  });
  const tg = fauxTelegram();
  const m = { ...matchV3({ id: "I1-2026-10-10-Torino-Udinese", ligue_code: "I1", dom: "Torino", ext: "Udinese", ko: KO, lh: 1.75, la: 0.95, fixture: 77 }), ids_api_football: { fixture: 77 } };
  const src = {
    candidats: async (jour, d) => {
      const { debut, fin } = C.fenetreProgramme(jour);
      return M.construireMenu({ jour, matchsJour: M.matchsMenu(sortieV3([m], "2026-10-10T04:00:00Z"), debut, fin),
        cotesParMatch: { [m.match_id]: { event_id: "ev1", sport_key: "soccer_italy_serie_a", books: C.booksDepuisOddsApi(evenement()), releve_at: new Date(new Date(d).getTime() - 5 * 60000).toISOString() } } });
    },
    etatsParis: async (paris) => Object.fromEntries(paris.map((p) => [p.id, { cotes: { betclic_fr: 1.74, winamax_fr: 1.7 }, pinnacle_proba: 0.53, pinnacle_cote: 1.8 }])),
    composition: async () => null, meteo: async () => null, resultat: async () => ({ statut: "FT", bd: 2, be: 1, faits: null }), matchDuel: async () => null,
  };
  const deps = { db, tg, src, maintenant: () => new Date(heure), env: { ADMIN: 42, CANAL_GRATUIT: "@iasharkdata", ANCRE_FICHIER: path.join(os.tmpdir(), `ancre-${Math.random()}.txt`) }, log: () => {} };
  db.horloge = () => new Date(heure);
  return { db, tg, deps, a: (h) => { heure = h; }, valider: () => db.update("pro_programmes", { jour: "2026-10-10" }, { statut: "valide", valide_at: "2026-10-10T07:00:00Z" }) };
}

test("journee : chaque abonne Pro recoit EN PRIVE le programme dans sa langue, avec les memes chiffres (plus de canal Pro)", async () => {
  const j = journee();
  await T.tourner(j.deps); // 8 h 45 : programme propose a Clement
  await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps); // 9 h 30 : envoi
  // Le registre (conversation de Clement) : en-tete + 1 pari, en francais. Plus aucun canal.
  const reg = messages(j.tg, 42).filter((t) => t.startsWith(T.ETIQUETTE_REGISTRE)).map((t) => t.slice(T.ETIQUETTE_REGISTRE.length + 1));
  assert.strictEqual(reg.length, 2);
  assert.ok(!j.tg.appels.some((a) => String(a.corps.chat_id).startsWith("-100")), "aucun envoi dans un canal");
  // 03/10/2026 : UN message par abonne, SON programme : memes paris, memes chances ; la cote chez SES bookmakers.
  const es = messages(j.tg, 777);
  assert.strictEqual(es.length, 1, "un seul message");
  const prog = es[0];
  assert.match(prog, /^<b>Lucía, tu programa del sábado<\/b>/, "programme en espagnol, en prive, par son prenom");
  assert.match(prog, /<b>SIMPLE<\/b>\n/);
  assert.match(prog, /Probabilidad calculada por IASHARK: 55 %\./, "meme chance que le registre");
  assert.ok(reg[1].includes("Chance calculée par IASHARK : 55 %."));
  assert.ok(prog.includes("N° PRO-1"), "meme numero de pari");
  assert.match(prog, /Cuota: <b>1,70<\/b> en Winamax/, "elle a choisi Winamax : SA meilleure cote");
  const fr = messages(j.tg, 555);
  assert.strictEqual(fr.length, 1);
  assert.match(fr[0], /^<b>Karim, ton programme du samedi<\/b>[\s\S]*Sélection : <b>Torino gagne<\/b>\nChance calculée par IASHARK : 55 %\.\nCote : <b>1,70<\/b> chez Winamax/);
  // Sans ligne user_preferences : langue de son Telegram (anglais) ; aucun bookmaker choisi : tous ceux suivis (1,74 Betclic).
  assert.ok(messages(j.tg, 888).some((t) => /^<b>Tom, your programme for Saturday<\/b>[\s\S]*<b>1\.74<\/b> at Betclic/.test(t)), "repli sur la langue de Telegram");
  // Un seul envoi par abonne, meme si le tour repasse.
  j.a("2026-10-10T07:45:00Z"); await T.tourner(j.deps);
  assert.strictEqual(messages(j.tg, 777).filter((t) => /tu programa del sábado/.test(t)).length, 1);
});

test("plus de canal espagnol : TELEGRAM_CANAL_PRO_ES n'est plus lu nulle part", () => {
  for (const f of ["../scripts/canal-pro/taches.mjs", "../scripts/canal-pro/tourner.mjs", "../supabase/functions/telegram-bot/index.ts", "../.github/workflows/canal-pro.yml", "../.github/workflows/telegram-bot.yml"])
    assert.ok(!/CANAL_PRO_ES/.test(fs.readFileSync(new URL(f, import.meta.url), "utf8")), f);
});

test("journee : debrief propose a Clement, textes des 6 langues gardes, envoyes une seule fois apres son clic", async () => {
  const j = journee();
  await T.tourner(j.deps); await j.valider(); j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T21:30:00Z"); await T.tourner(j.deps); // 23 h 30 : pari regle, debrief propose
  const garde = (await j.db.select("telegram_settings", { key: ["like", "pro_textes:debrief-soir-*"] }))[0];
  assert.ok(garde, "textes gardes en attendant le clic de Clement");
  const x = JSON.parse(garde.value);
  // 6 langues, et pour chaque pays dont les cotes sont relevees a part (Espagne) sa version (« ES:es »…).
  assert.deepStrictEqual(Object.keys(x.textes).sort(), [...LG.LANGUES, ...C.PAYS_COTES_A_PART.flatMap((p) => LG.LANGUES.map((l) => `${p}:${l}`))].sort());
  assert.match(x.textes.es[0], /^<b>Resumen del sábado<\/b> · 1 apuesta: 1 ganada, 0 perdidas\./);
  assert.match(x.textes.fr[0], /^<b>Débrief du samedi<\/b> · 1 pari : 1 gagné, 0 perdu\./);
  assert.ok(!messages(j.tg, 777).some((t) => /Resumen/.test(t)), "rien avant le clic");
  // Clement clique « Envoyer aux abonnés Pro » (le robot Telegram pose publie:k:<cle>) ; le robot planifie rattrape l'envoi.
  await j.db.insert("telegram_settings", [{ key: "publie:k:debrief-soir-2026-10-10", value: "x" }]);
  j.a("2026-10-10T21:45:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T22:00:00Z"); await T.tourner(j.deps);
  const recu = messages(j.tg, 777).filter((t) => /Resumen del sábado/.test(t));
  assert.strictEqual(recu.length, 1, "debrief espagnol envoye une fois");
  assert.strictEqual(messages(j.tg, 555).filter((t) => /Débrief du samedi/.test(t)).length, 1, "debrief francais envoye une fois");
  const silencieux = j.tg.appels.find((a) => a.corps.chat_id === 777 && /Resumen/.test(a.corps.text)).corps.disable_notification;
  assert.strictEqual(silencieux, true, "la nuit : sans sonnerie");
  fs.rmSync(j.deps.env.ANCRE_FICHIER, { force: true }); // fichier temporaire de l'ancre du soir
});

// ---------- 4. robot personnel (Edge Function) avec une fausse base ----------
test("robot personnel : l'abonne espagnol recoit les reponses en espagnol ; /idioma change la langue (user_preferences)", async () => {
  const fetchAvant = globalThis.fetch;
  try {
    const r = await chargerRobot({
      telegram_abonnes: [{ user_id: "es1", chat_id: 777, prenom: "Lucía", bloque: false }],
      users: [{ id: "es1", plan: "pro", role: "customer" }],
      user_preferences: [{ user_id: "es1", language: "es" }],
      pro_preferences: [{ user_id: "es1", pays: "fr", bookmakers: ["winamax"] }],
      telegram_settings: [], pro_paris: [], pro_tickets: [],
    });
    const de = { id: 777, first_name: "Lucía", language_code: "es" };
    const texte = () => r.envoyes.filter((e) => e.methode === "sendMessage" && e.corps.chat_id === 777).at(-1)?.corps.text;
    await r.maj({ message: { message_id: 1, chat: { id: 777, type: "private" }, from: de, text: "/ayuda" } });
    assert.match(texte(), /^Soy tu robot IASHARK/);
    await r.maj({ message: { message_id: 2, chat: { id: 777, type: "private" }, from: de, text: "/programa" } });
    assert.strictEqual(texte(), "Los envíos Pro aún no están abiertos: por ahora no hay programa.");
    await r.maj({ message: { message_id: 3, chat: { id: 777, type: "private" }, from: de, text: "/ajustes" } });
    assert.match(texte(), /^<b>Tus ajustes<\/b>\nPaís: FR\nTus casas de apuestas: Winamax/);
    await r.maj({ message: { message_id: 4, chat: { id: 777, type: "private" }, from: de, text: "/idioma" } });
    assert.strictEqual(texte(), "Elige tu idioma:");
    await r.maj({ callback_query: { id: "c1", data: "lg:en", from: de, message: { message_id: 9, chat: { id: 777, type: "private" } } } });
    assert.strictEqual(r.base.tables.user_preferences[0].language, "en", "une seule source : la langue du compte (la meme que le site)");
    assert.match(texte(), /^Done: from now on I talk to you in English/);
    // Une personne non reliee, Telegram en espagnol : accueil en espagnol.
    await r.maj({ message: { message_id: 5, chat: { id: 999, type: "private" }, from: { id: 999, language_code: "es" }, text: "/start" } });
    assert.match(r.envoyes.at(-1).corps.text, /^Hola, aquí el equipo IASHARK/);
  } finally { globalThis.fetch = fetchAvant; }
});

test("robot personnel : au clic « Envoyer aux abonnés Pro » de Clement, le debrief part en prive, chacun dans sa langue, une seule fois", async () => {
  const fetchAvant = globalThis.fetch;
  try {
    const textes = { type: "debriefs", garde: false, duree_h: 12, textes: { fr: ["<b>Débrief du samedi</b> · 1 pari : 1 gagné, 0 perdu."], es: ["<b>Resumen del sábado</b> · 1 apuesta: 1 ganada, 0 perdidas."], en: ["<b>Saturday debrief</b>"] } };
    const r = await chargerRobot({
      telegram_abonnes: [{ user_id: "es1", chat_id: 777, bloque: false }, { user_id: "fr1", chat_id: 555, bloque: false }],
      users: [{ id: "es1", plan: "pro", role: "customer" }, { id: "fr1", plan: "pro", role: "customer" }],
      user_preferences: [{ user_id: "es1", language: "es" }, { user_id: "fr1", language: "fr" }],
      pro_preferences: [], pro_tickets: [], pro_paris: [], pro_envois: [],
      telegram_settings: [{ key: "canal_pro_mode", value: "ouvert" }, { key: "pro_textes:debrief-soir-2026-10-10", value: JSON.stringify(textes) }],
    });
    const clic = (id) => r.maj({ callback_query: { id, data: "pubpro::debrief-soir-2026-10-10", from: { id: 42 }, message: { message_id: 70, chat: { id: 42 }, reply_markup: { inline_keyboard: [] } } } });
    await clic("c1");
    assert.ok(!r.envoyes.some((e) => e.methode === "copyMessage"), "plus de copie dans un canal");
    const es = r.envoyes.filter((e) => e.methode === "sendMessage" && e.corps.chat_id === 777);
    assert.strictEqual(es.length, 1);
    assert.match(es[0].corps.text, /^<b>Resumen del sábado<\/b>/);
    const fr = r.envoyes.filter((e) => e.methode === "sendMessage" && e.corps.chat_id === 555);
    assert.deepStrictEqual(fr.map((e) => e.corps.text), ["<b>Débrief du samedi</b> · 1 pari : 1 gagné, 0 perdu."], "l'abonne francais recoit la version francaise");
    assert.ok(r.base.tables.pro_envois.some((x) => x.cle === "pro:debrief-soir-2026-10-10:es1"), "cle d'envoi par abonne (journal)");
    await clic("c2"); // double clic
    assert.strictEqual(r.envoyes.filter((e) => e.methode === "sendMessage" && e.corps.chat_id === 777).length, 1, "jamais deux fois");
  } finally { globalThis.fetch = fetchAvant; }
});

// ---------- 5. repetition sans envoi : les messages du jour en francais et en espagnol ----------
test("repetition sans envoi : programme du jour en francais et en espagnol (affiche avec REPETITION=1)", () => {
  const fr = C.messagesCanal("2026-10-10", [pariSimple, combine]);
  const es = C.messagesCanal("2026-10-10", [pariSimple, combine], { lang: "es" });
  if (process.env.REPETITION) {
    console.log("\n===== FR (message prive) =====\n" + [fr.tete, ...fr.paris.map((x) => x.html)].join("\n\n"));
    console.log("\n===== ES (message prive) =====\n" + [es.tete, ...es.paris.map((x) => x.html)].join("\n\n"));
  }
  assert.strictEqual(fr.paris.length, es.paris.length);
  assert.ok(TX > 0);
});
