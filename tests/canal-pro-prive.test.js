// Messages Pro EN PRIVE, un a un (02/10/2026, decision de Clement : plus de canal Pro commun),
// et parcours d'accueil du robot Telegram. Donnees FICTIVES, base en memoire, faux Telegram :
// aucun vrai message n'est envoye, aucune ecriture en base de production.
// Ce qui est prouve ici :
//  1. 3 abonnes relies (fr, es, en) : chacun recoit UN message prive dans sa langue, memes chiffres ;
//  2. abonnement termine (ou jamais actif) : rien, verifie au moment de chaque envoi ;
//  3. un abonne qui a bloque le robot (403) est marque et les autres recoivent quand meme ;
//  4. rodage : seul Clement recoit (marque RODAGE) ;
//  5. limites de Telegram : pause entre deux messages, attente sur 429, refus 400 rattrape, jamais deux fois ;
//  6. accueil du robot : bienvenue dans la langue de l'abonne (espagnol), pas de nouveau questionnaire au retour ;
//  7. questionnaire : chaque reponse enregistree dans user_preferences et pro_preferences.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

let modules = null;
async function charger() {
  if (modules) return modules;
  modules = {
    C: await import("../supabase/functions/_shared/canal-pro.mjs"),
    M: await import("../supabase/functions/_shared/canal-pro-menu.mjs"),
    D: await import("../supabase/functions/_shared/canal-pro-diffusion.mjs"),
    T: await import("../scripts/canal-pro/taches.mjs"),
    B: await import("../scripts/canal-pro/lib/base.mjs"),
    EX: await import("../scripts/canal-pro/lib/exemple-v3.mjs"),
    R: await import("./helpers/faux-robot-telegram.mjs"),
  };
  return modules;
}

const KO = "2026-10-10T13:00:00Z"; // samedi 10/10, 15 h a Paris
const ABONNES = [
  { user_id: "fr1", chat_id: 555, prenom: "Karim", bloque: false },
  { user_id: "es1", chat_id: 777, prenom: "Lucía", bloque: false },
  { user_id: "en1", chat_id: 888, prenom: "Tom", bloque: false, langue_telegram: "en" },
];
const messages = (tg, chat) => tg.appels.filter((a) => a.methode === "sendMessage" && (chat === undefined || String(a.corps.chat_id) === String(chat))).map((a) => a.corps.text);

/** Journee simulee du robot planifie : 3 abonnes relies (fr, es, en), reglages par defaut. */
async function journee({ ouvert = true, plans = {}, bloques = [], reglages = [] } = {}) {
  const { C, M, T, B, EX } = await charger();
  let heure = "2026-10-10T06:45:00Z";
  const db = new B.BaseMemoire({
    telegram_settings: [...(ouvert ? [{ key: "canal_pro_mode", value: "ouvert" }] : []), ...reglages],
    users: ABONNES.map((a) => ({ id: a.user_id, plan: plans[a.user_id] || "pro", role: "customer" })),
    telegram_abonnes: ABONNES.map((a) => ({ ...a })),
    user_preferences: [{ user_id: "fr1", language: "fr" }, { user_id: "es1", language: "es" }], // en1 : langue de son Telegram
  });
  let n = 100;
  const tg = async (methode, corps) => {
    tg.appels.push({ methode, corps });
    if (methode === "sendMessage" && bloques.includes(corps.chat_id)) { const e = new Error("sendMessage: 403 Forbidden: bot was blocked by the user"); e.status = 403; throw e; }
    return { message_id: ++n };
  };
  tg.appels = [];
  const m = { ...EX.matchV3({ id: "I1-2026-10-10-Torino-Udinese", ligue_code: "I1", dom: "Torino", ext: "Udinese", ko: KO, lh: 1.75, la: 0.95, fixture: 77 }), ids_api_football: { fixture: 77 } };
  const h2h = (a, b, c) => [{ key: "h2h", outcomes: [{ name: "Torino", price: a }, { name: "Draw", price: b }, { name: "Udinese", price: c }] }];
  const ev = { id: "ev1", sport_key: "soccer_italy_serie_a", commence_time: KO, home_team: "Torino", away_team: "Udinese", bookmakers: [
    { key: "pinnacle", title: "Pinnacle", markets: h2h(1.8, 3.7, 4.6) }, { key: "betclic_fr", title: "Betclic (FR)", markets: h2h(1.74, 3.5, 4.3) },
    { key: "winamax_fr", title: "Winamax (FR)", markets: h2h(1.7, 3.55, 4.35) }] };
  const src = {
    candidats: async (jour, d) => {
      const { debut, fin } = C.fenetreProgramme(jour);
      return M.construireMenu({ jour, matchsJour: M.matchsMenu(EX.sortieV3([m], "2026-10-10T04:00:00Z"), debut, fin),
        cotesParMatch: { [m.match_id]: { event_id: "ev1", sport_key: "soccer_italy_serie_a", books: C.booksDepuisOddsApi(ev), releve_at: new Date(new Date(d).getTime() - 5 * 60000).toISOString() } } });
    },
    etatsParis: async (paris) => Object.fromEntries(paris.map((p) => [p.id, { cotes: { betclic_fr: 1.74, winamax_fr: 1.7 }, pinnacle_proba: 0.53, pinnacle_cote: 1.8 }])),
    composition: async () => null, meteo: async () => null, resultat: async () => ({ statut: "FT", bd: 2, be: 1, faits: null }), matchDuel: async () => null,
  };
  const deps = { db, tg, src, maintenant: () => new Date(heure), env: { ADMIN: 42, CANAL_GRATUIT: "@iasharkdata", ANCRE_FICHIER: path.join(os.tmpdir(), `iashark-ancre-prive-${process.pid}.txt`) }, log: () => {} };
  db.horloge = () => new Date(heure);
  const valider = () => db.update("pro_programmes", { jour: "2026-10-10" }, { statut: "valide", valide_at: "2026-10-10T07:00:00Z" });
  const a = (h) => { heure = h; };
  /** 8 h 45 programme propose, clic de Clement, 9 h 30 envoi. */
  const publier = async () => { await T.tourner(deps); await valider(); a("2026-10-10T07:30:00Z"); await T.tourner(deps); };
  return { db, tg, deps, a, publier, T };
}

test("3 abonnes relies (fr, es, en) : chacun recoit UN message prive dans sa langue, avec les memes chiffres", async () => {
  const j = await journee();
  await j.publier();
  const reg = messages(j.tg, 42).filter((t) => t.startsWith(j.T.ETIQUETTE_REGISTRE));
  assert.strictEqual(reg.length, 2, "registre de Clement : en-tete + 1 pari (preuve d'envoi)");
  assert.ok(!j.tg.appels.some((x) => String(x.corps.chat_id).startsWith("-100") || String(x.corps.chat_id).startsWith("@")), "aucun canal");
  const [fr, es, en] = [messages(j.tg, 555), messages(j.tg, 777), messages(j.tg, 888)];
  assert.deepStrictEqual([fr.length, es.length, en.length], [1, 1, 1], "un seul message prive chacun (reglages par defaut : pas de programme perso en double)");
  // 03/10/2026 : SON programme, par son prenom ; le bloc du pari est celui du registre (memes chiffres pour tous).
  assert.match(fr[0], /^<b>Karim, ton programme du samedi<\/b>/);
  assert.ok(fr[0].includes(reg[1].slice(j.T.ETIQUETTE_REGISTRE.length + 1)), "francais : le bloc exact du pari du registre");
  assert.match(es[0], /^<b>Lucía, tu programa del sábado<\/b>/);
  assert.match(en[0], /^<b>Tom, your programme for Saturday<\/b>/);
  // Memes chiffres pour tous : chance, cote, bookmaker, numero du pari.
  assert.match(fr[0], /Chance calculée par IASHARK : 55 %\.[\s\S]*Cote : <b>1,74<\/b> chez Betclic[\s\S]*N° PRO-1/);
  assert.match(es[0], /Probabilidad calculada por IASHARK: 55 %\.[\s\S]*Cuota: <b>1,74<\/b> en Betclic[\s\S]*N° PRO-1/);
  assert.match(en[0], /Chance calculated by IASHARK: 55%\.[\s\S]*Odds: <b>1\.74<\/b> at Betclic[\s\S]*N° PRO-1/);
  for (const t of [fr[0], es[0], en[0]]) assert.ok(!/\bmise\b|unité|capital|espérance|garanti|comporte des risques|stake|apuesta segura/i.test(t), t);
  // Le tour suivant ne renvoie rien ; le journal garde une cle par abonne.
  j.a("2026-10-10T07:45:00Z"); await j.T.tourner(j.deps);
  assert.deepStrictEqual([555, 777, 888].map((c) => messages(j.tg, c).length), [1, 1, 1], "jamais deux fois");
  const journal = await j.db.select("pro_envois", { cle: ["like", "pro:programme-2026-10-10:*"] });
  assert.deepStrictEqual(journal.map((x) => [x.user_id, x.statut]).sort(), [["en1", "envoye"], ["es1", "envoye"], ["fr1", "envoye"]]);
});

test("abonnement termine ou jamais actif : rien, verifie au moment de chaque envoi", async () => {
  const j = await journee({ plans: { en1: "free" }, reglages: [{ key: "auto_debriefs", value: "oui" }] });
  await j.publier();
  assert.strictEqual(messages(j.tg, 888).length, 0, "compte gratuit : rien");
  assert.strictEqual(messages(j.tg, 777).length, 1);
  // L'abonnement de Lucia se termine dans la journee : le debrief du soir ne lui part plus.
  await j.db.update("users", { id: "es1" }, { plan: "free" });
  j.a("2026-10-10T15:00:00Z"); await j.T.tourner(j.deps); // reglement
  j.a("2026-10-10T21:30:00Z"); await j.T.tourner(j.deps); // debrief (automatique allume)
  assert.strictEqual(messages(j.tg, 555).filter((t) => /Débrief du samedi/.test(t)).length, 1, "l'abonne actif recoit le debrief");
  assert.ok(!messages(j.tg, 777).some((t) => /Resumen/.test(t)), "abonnement termine : plus aucun envoi");
  j.a("2026-10-10T21:45:00Z"); await j.T.tourner(j.deps); // rattrapage : toujours rien
  assert.ok(!messages(j.tg, 777).some((t) => /Resumen/.test(t)));
  fs.rmSync(j.deps.env.ANCRE_FICHIER, { force: true }); // fichier temporaire de l'ancre du soir
});

test("erreur 403 (robot bloque) : l'abonne est marque, les autres recoivent quand meme", async () => {
  const j = await journee({ bloques: [777] });
  await j.publier();
  assert.strictEqual(messages(j.tg, 555).length, 1);
  assert.strictEqual(messages(j.tg, 888).length, 1);
  const [es] = await j.db.select("telegram_abonnes", { user_id: "es1" });
  assert.strictEqual(es.bloque, true, "marque : plus d'envoi");
  const [k] = await j.db.select("pro_envois", { cle: "pro:programme-2026-10-10:es1" });
  assert.strictEqual(k.statut, "bloque", "journal des envois");
  const tentatives = () => j.tg.appels.filter((x) => x.corps.chat_id === 777).length;
  const avant = tentatives();
  j.a("2026-10-10T07:45:00Z"); await j.T.tourner(j.deps);
  assert.strictEqual(tentatives(), avant, "plus aucune tentative vers un abonne qui a bloque le robot");
});

test("rodage : seul Clement recoit (marque RODAGE), aucun abonne", async () => {
  const j = await journee({ ouvert: false });
  await j.publier();
  j.a("2026-10-10T07:45:00Z"); await j.T.tourner(j.deps);
  assert.ok(j.tg.appels.filter((x) => x.methode === "sendMessage").every((x) => x.corps.chat_id === 42), "tout chez Clement");
  assert.ok(messages(j.tg, 42).some((t) => t.startsWith("<b>[RODAGE · messages Pro]</b>")));
  assert.ok(!messages(j.tg, 42).some((t) => t.startsWith(j.T.ETIQUETTE_REGISTRE)));
  assert.strictEqual((await j.db.select("telegram_settings", { key: ["like", "diffusion:*"] })).length, 0, "aucune diffusion enregistree");
});

test("limites de Telegram : pause entre deux messages, attente sur 429, refus 400 rattrape, jamais deux fois", async () => {
  const { C, D } = await charger();
  const prefs = C.preferencesEffectives(null);
  const abonnes = [{ user_id: "a", chat_id: 1, langue: "fr", prefs }, { user_id: "b", chat_id: 2, langue: "es", prefs }, { user_id: "c", chat_id: 3, langue: "en", prefs }];
  const cles = new Set(), attentes = [], envois = [];
  let refus400 = true, rate429 = true;
  const deps = {
    abonnes: async () => abonnes, poser: async (k) => (cles.has(k) ? false : (cles.add(k), true)), rendre: async (k) => cles.delete(k),
    attendre: async (ms) => attentes.push(ms), maintenant: () => new Date("2026-10-10T08:00:00Z"),
    envoyer: async (chat, html) => {
      if (chat === 1 && rate429) { rate429 = false; const e = new Error("429"); e.status = 429; e.retry_after = 1; throw e; }
      if (chat === 3 && refus400) { const e = new Error("400"); e.status = 400; throw e; }
      envois.push([chat, html]); return { message_id: envois.length };
    },
  };
  const diffusion = { cle: "test", type: "programme", textes: { fr: ["Bonjour"], es: ["Hola"], en: ["Hello"] }, garde: false };
  const b1 = await D.diffuser(deps, diffusion);
  assert.deepStrictEqual([b1.envoyes, b1.refuses], [2, 1]);
  assert.ok(attentes.includes(2000), "429 : attente de retry_after (+1 s) puis nouvel essai");
  assert.ok(attentes.includes(D.PAUSE_ENVOI_MS) && D.PAUSE_ENVOI_MS >= 1000 / 30, "pause entre deux messages (30 par seconde au plus)");
  assert.deepStrictEqual(envois.map((x) => x[1]), ["Bonjour", "Hola"], "chacun dans sa langue");
  assert.ok(!cles.has("pro:test:c"), "refus 400 : cle rendue");
  refus400 = false;
  const b2 = await D.diffuser(deps, diffusion);
  assert.deepStrictEqual([b2.envoyes, b2.deja], [1, 2], "au tour suivant : seul le refuse repart");
  assert.deepStrictEqual(envois.map((x) => x[0]), [1, 2, 3], "jamais deux fois le meme message a la meme personne");
});

// ---------- robot Telegram (Edge Function chargee avec une fausse base) : parcours d'accueil ----------
function abonneALier(code, extra = {}) {
  return { user_id: "es1", code_liaison: code, code_cree_at: new Date().toISOString(), chat_id: null, bloque: false, ...extra };
}
const DE = { id: 777, first_name: "Lucía", language_code: "es" };
const lier = (r, code) => r.maj({ message: { message_id: 1, chat: { id: 777, type: "private" }, from: DE, text: `/start ${code}` } });
const clic = (r, data) => r.maj({ callback_query: { id: `c-${data}`, data, from: DE, message: { message_id: 50, chat: { id: 777, type: "private" } } } });

test("accueil : bienvenue chaleureuse en espagnol, 1re question avec des boutons ; au retour, pas de nouveau questionnaire", async () => {
  const { R } = await charger();
  const fetchAvant = globalThis.fetch;
  try {
    const r = await R.chargerRobot({
      telegram_abonnes: [abonneALier("codeAccueil0123456789")], users: [{ id: "es1", plan: "pro", role: "customer" }],
      user_preferences: [{ user_id: "es1", language: "es" }], pro_preferences: [], telegram_settings: [], pro_envois: [], pro_tickets: [], pro_paris: [],
    });
    await lier(r, "codeAccueil0123456789");
    const recus = r.envoyes.filter((e) => e.methode === "sendMessage" && e.corps.chat_id === 777);
    assert.strictEqual(recus.length, 2, "bienvenue, puis la 1re question");
    const bienvenue = recus[0].corps.text;
    assert.match(bienvenue, /^<b>Hecho, Lucía: tu cuenta está vinculada\.<\/b> ¡Bienvenido\/a y gracias por confiar en IASHARK!/);
    assert.match(bienvenue, /en privado y en español/);
    assert.match(bienvenue, /el programa del día, hacia las 9:30 \(hora de París\)/);
    assert.match(bienvenue, /alineaciones y los movimientos de cuota/);
    assert.match(bienvenue, /resúmenes/);
    assert.match(bienvenue, /No hay ningún canal al que unirse/);
    assert.match(bienvenue, /Los envíos Pro abren muy pronto/, "rodage : aucune promesse d'envoi tout de suite");
    assert.ok(!/garantiz|ganar seguro|apuesta segura|riesgo|\bmise\b/i.test(bienvenue));
    assert.match(recus[1].corps.text, /^1\/6 · Tu idioma: te escribo en español\. ¿Lo mantenemos\?/);
    const boutons = recus[1].corps.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    assert.deepStrictEqual([boutons[0], boutons.at(-1)], ["ac:lg:es", "ac:x"], "garder sa langue, ou « Más tarde »");
    // Il relie de nouveau son compte (nouveau code) : un mot, pas de questionnaire.
    Object.assign(r.base.tables.telegram_abonnes[0], { code_liaison: "codeRetour0123456789", code_cree_at: new Date().toISOString() });
    await lier(r, "codeRetour0123456789");
    const apres = r.envoyes.filter((e) => e.methode === "sendMessage" && e.corps.chat_id === 777);
    assert.strictEqual(apres.length, 3);
    assert.match(apres[2].corps.text, /^Hola de nuevo Lucía: tu cuenta sigue vinculada\./);
    assert.ok(!apres[2].corps.reply_markup, "pas de question");
  } finally { globalThis.fetch = fetchAvant; }
});

test("questionnaire : chaque reponse est enregistree (user_preferences, pro_preferences), recapitulatif, pays pas ouvert honnete ; ni strategie ni types de paris", async () => {
  const { R } = await charger();
  const fetchAvant = globalThis.fetch;
  try {
    const r = await R.chargerRobot({
      telegram_abonnes: [abonneALier(null, { chat_id: 777 })], users: [{ id: "es1", plan: "pro", role: "customer" }],
      user_preferences: [{ user_id: "es1", language: "es" }], pro_preferences: [], telegram_settings: [], pro_envois: [], pro_tickets: [], pro_paris: [],
    });
    const derniere = () => r.envoyes.filter((e) => e.methode === "editMessageText").at(-1).corps;
    for (const d of ["ac:lg:es", "ac:py:fr", "ac:bk:winamax", "ac:bk:ok"]) await clic(r, d);
    // Competitions : la MEME liste que le site, regroupee, Premier League en tete ; un bouton par groupe.
    const co = derniere();
    assert.match(co.text, /^4\/6 · Tus competiciones preferidas, solo para información/);
    const bt = co.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    assert.deepStrictEqual(bt.slice(0, 3), ["ac:co:tout", "ac:co:g-grands", "ac:co:premier"]);
    assert.ok(bt.includes("ac:co:mls") && bt.includes("ac:co:g-monde"));
    for (const d of ["ac:co:seriea", "ac:co:g-monde", "ac:co:ok"]) await clic(r, d);
    assert.match(derniere().text, /^5\/6 · ¿Te aviso cuando tu cuota cambie/);
    await clic(r, "ac:al:non");
    assert.match(derniere().text, /^6\/6 · ¿A qué hora quieres recibir tu programa\?/);
    await clic(r, "ac:hr:12");
    const p = r.base.tables.pro_preferences.find((x) => x.user_id === "es1");
    assert.deepStrictEqual([p.pays, p.bookmakers, p.competitions, p.alertes, p.heure_envoi],
      ["fr", ["winamax"], ["seriea", "mls", "jleague", "liga_mx", "argentina_liga_profesional", "brazil_seriea"], [], 12]);
    assert.ok(!("familles" in p) && !("strategie" in p), "plus de choix de types de paris ni de strategie");
    assert.strictEqual(r.base.tables.user_preferences.find((x) => x.user_id === "es1").language, "es");
    const fin = derniere();
    assert.match(fin.text, /^<b>¡Listo!<\/b> Resumen:\nIdioma: Español\nPaís: Francia\nCasas de apuestas: Winamax\nCompeticiones \(solo información\): Serie A, MLS, J1 League, Liga MX, Liga Profesional Argentina, Brasileirao Serie A\nAlertas: No\nHora del programa: 12:00\n\n\/ajustes para cambiarlo cuando quieras\.$/);
    assert.deepStrictEqual(fin.reply_markup.inline_keyboard, [], "fin : plus de bouton");
    assert.match(r.base.tables.telegram_settings.find((x) => x.key === "accueil:es1").value, /^fin /);
    // Les competitions ne filtrent AUCUN pari (memes paris pour tous) : seulement l'info.
    const { C } = await charger();
    const prefs = C.preferencesEffectives(p);
    assert.ok(C.pariPourAbonne({ famille: "simple", ligue: "Liga", cotes: {}, dom: "A", ext: "B" }, prefs), "un pari de Liga reste dans son programme");
    // « Refaire mes choix » (/ajustes), pays pas encore ouvert : message honnete, pas de bookmaker, une etape de moins.
    await clic(r, "ac:go");
    assert.match(derniere().text, /^1\/6 · Tu idioma/);
    await clic(r, "ac:lg:es");
    await clic(r, "ac:py:be");
    assert.match(derniere().text, /^Tu país aún no está abierto: por ahora no te muestro ninguna casa de apuestas[\s\S]*\n\n3\/5 · Tus competiciones preferidas/);
    const p2 = r.base.tables.pro_preferences.find((x) => x.user_id === "es1");
    assert.deepStrictEqual([p2.pays, p2.bookmakers], ["autre", []], "aucun bookmaker d'un autre pays garde");
    await clic(r, "ac:x");
    assert.match(derniere().text, /^Sin problema: podrás ajustarlo todo más tarde con \/ajustes\./);
  } finally { globalThis.fetch = fetchAvant; }
});

test("accueil du robot : questionnaire deja rempli sur le site = pas de doublon ; aucun regulateur cite (« autorises dans ton pays »)", async () => {
  const A = await import("../supabase/functions/_shared/canal-pro-accueil.mjs");
  const C = await import("../supabase/functions/_shared/canal-pro.mjs");
  const sans = A.bienvenue("fr", { prenom: "Lucas", ouvert: true, questions: false });
  assert.ok(!/Quelques questions/.test(sans), "sans les questions");
  assert.match(A.bienvenue("fr", { ouvert: true }), /Quelques questions/);
  const es = C.preferencesEffectives({ pays: "es" });
  assert.match(A.question("bk", es, "es").text, /autorizadas en tu país/);
  assert.match(A.question("bk", C.preferencesEffectives({ pays: "fr" }), "fr").text, /autorisés dans ton pays/);
  for (const lang of ["fr", "es", "en", "de", "it", "pt"]) for (const pays of ["fr", "es"]) {
    const t = A.question("bk", C.preferencesEffectives({ pays }), lang).text;
    assert.ok(!/ANJ|DGOJ|Autorité nationale|Ordenación/.test(t), `${lang}/${pays} : ${t}`);
  }
});
