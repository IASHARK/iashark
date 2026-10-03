// Deux robots Telegram (03/10/2026, decision de Clement) :
// - « IASHARK Pro » envoie seulement ; tout texte libre d'un utilisateur recoit une reponse automatique
//   dans sa langue (lien vers le robot Contact, ou l'e-mail sans robot Contact) ; RIEN n'est transfere.
// - « IASHARK Contact » : tout message est transfere a Clement ; sa reponse repart par le robot Contact.
// Edge Function chargee dans Node avec une fausse base et un faux Telegram (aucun vrai message envoye).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chargerRobot, JETON_CONTACT } from "./helpers/faux-robot-telegram.mjs";
import * as RB from "../supabase/functions/_shared/robots.mjs";

const AVEC_CONTACT = { TELEGRAM_CONTACT_BOT_TOKEN: JETON_CONTACT, TELEGRAM_CONTACT_WEBHOOK_SECRET: "secret-contact" };
const base = (extra = {}) => ({
  telegram_abonnes: [{ user_id: "es1", chat_id: 777, bloque: false }],
  users: [{ id: "es1", plan: "pro", role: "customer" }],
  user_preferences: [{ user_id: "es1", language: "es" }],
  pro_preferences: [], pro_tickets: [], pro_paris: [], pro_envois: [], telegram_settings: [], telegram_contact_threads: [],
  ...extra,
});
const LUCIA = { id: 777, first_name: "Lucía", language_code: "es" };
const msg = (id, chat, from, extra) => ({ message: { message_id: id, chat: { id: chat, type: "private" }, from, ...extra } });
async function avecRobot(tables, opts, f) {
  const avant = globalThis.fetch;
  try { return await f(await chargerRobot(tables, opts)); } finally { globalThis.fetch = avant; }
}
const versClement = (r) => r.envoyes.filter((e) => e.corps.chat_id === 42 || e.methode === "forwardMessage");

test("aiguillage : il faut le parametre ET le secret du bon robot", () => {
  const s = { secretPro: "p", secretContact: "c", contactActif: true };
  assert.equal(RB.quelRobot({ ...s, parametre: null, secretRecu: "p" }), "pro");
  assert.equal(RB.quelRobot({ ...s, parametre: "contact", secretRecu: "c" }), "contact");
  assert.equal(RB.quelRobot({ ...s, parametre: "contact", secretRecu: "p" }), null, "secret du Pro sur l'adresse du Contact : refuse");
  assert.equal(RB.quelRobot({ ...s, parametre: null, secretRecu: "c" }), null, "secret du Contact sur l'adresse du Pro : refuse");
  assert.equal(RB.quelRobot({ ...s, parametre: "autre", secretRecu: "p" }), null);
  assert.equal(RB.quelRobot({ ...s, parametre: null, secretRecu: "" }), null);
  assert.equal(RB.quelRobot({ ...s, contactActif: false, parametre: "contact", secretRecu: "c" }), null, "sans jeton Contact : rien");
  assert.equal(RB.quelRobot({ secretPro: "p", secretContact: "", contactActif: true, parametre: "contact", secretRecu: "" }), null);
});

test("textes : reponse automatique et accueil du Contact dans les 6 langues, lien Contact ou e-mail", () => {
  assert.equal(RB.reponseAutoPro("fr", "IasharkContactBot"), "Ici je t'envoie seulement tes messages Pro. Une question ? Écris à IASHARK Contact : https://t.me/IasharkContactBot");
  assert.equal(RB.reponseAutoPro("fr", null), "Ici je t'envoie seulement tes messages Pro. Une question ? Écris-nous à contact@iashark.com");
  assert.equal(RB.accueilContact("fr"), "Bonjour, ici l'équipe IASHARK. Écris ta question ici, on te répond dans cette conversation.");
  const vus = new Set();
  for (const l of ["fr", "es", "en", "de", "it", "pt"]) {
    assert.ok(RB.reponseAutoPro(l, "IasharkContactBot").endsWith("https://t.me/IasharkContactBot"), l);
    assert.ok(RB.reponseAutoPro(l, null).endsWith("contact@iashark.com"), l);
    vus.add(RB.reponseAutoPro(l, "X_bot")).add(RB.accueilContact(l));
  }
  assert.equal(vus.size, 12, "une vraie traduction par langue");
  assert.equal(RB.reponseAutoPro("xx", "IasharkContactBot"), RB.reponseAutoPro("fr", "IasharkContactBot"), "langue inconnue : francais");
  assert.equal(RB.lienContact("mauvais nom!"), null, "jamais un lien vers un nom invalide");
});

test("robot Pro : texte libre d'un abonne -> reponse automatique dans SA langue, lien du Contact, rien de transfere a Clement", async () => {
  await avecRobot(base(), { env: AVEC_CONTACT }, async (r) => {
    await r.maj(msg(1, 777, LUCIA, { text: "¿por qué perdió la apuesta de ayer a 1,85?" }));
    await r.maj(msg(2, 777, LUCIA, { text: "10 € a Gana Torino a 1,65 en Betclic" })); // ancien « ticket »
    await r.maj(msg(3, 777, LUCIA, { photo: [{ file_id: "f" }], caption: "mi ticket" }));
    await r.maj(msg(4, 777, LUCIA, { text: "/equipe hola" }));
    const aLucia = r.envoyes.filter((e) => e.methode === "sendMessage" && e.corps.chat_id === 777);
    assert.equal(aLucia.length, 4);
    for (const e of aLucia) {
      assert.equal(e.robot, "pro");
      assert.equal(e.corps.text, "Aquí solo te envío tus mensajes Pro. ¿Una pregunta? Escribe a IASHARK Contact: https://t.me/IasharkContactBot");
    }
    assert.deepEqual(versClement(r), [], "rien n'est transfere a Clement");
    assert.deepEqual(r.base.tables.telegram_contact_threads, []);
    assert.deepEqual(r.base.tables.pro_tickets, [], "plus de ticket note");
    assert.equal(r.base.tables.telegram_settings.find((x) => x.key === "bot_username_contact")?.value, "IasharkContactBot", "nom du Contact lu par getMe, garde en cache");
  });
});

test("robot Pro : les commandes restent (/ayuda, /ajustes, /idioma), l'aide indique le robot Contact", async () => {
  await avecRobot(base(), { env: AVEC_CONTACT }, async (r) => {
    const dernier = () => r.envoyes.filter((e) => e.methode === "sendMessage" && e.corps.chat_id === 777).at(-1).corps.text;
    await r.maj(msg(1, 777, LUCIA, { text: "/ayuda" }));
    assert.match(dernier(), /^Soy tu robot IASHARK/);
    assert.match(dernier(), /• ¿Una pregunta\? Escribe a IASHARK Contact: https:\/\/t\.me\/IasharkContactBot$/);
    assert.ok(!/ticket|equipo IASHARK, que te responde/.test(dernier()));
    await r.maj(msg(2, 777, LUCIA, { text: "/ajustes" }));
    assert.match(dernier(), /^<b>Tus ajustes<\/b>/);
    await r.maj(msg(3, 777, LUCIA, { text: "/idioma" }));
    assert.equal(dernier(), "Elige tu idioma:");
    assert.deepEqual(versClement(r), []);
  });
});

test("robot Pro : personne non reliee -> /start = accueil Pro, texte = reponse automatique ; ex-abonne : pause + Contact", async () => {
  await avecRobot(base({ users: [{ id: "es1", plan: "free", role: "customer" }] }), { env: AVEC_CONTACT }, async (r) => {
    const inconnu = { id: 999, language_code: "de" };
    await r.maj(msg(1, 999, inconnu, { text: "/start" }));
    assert.match(r.envoyes.at(-1).corps.text, /^Hallo, hier ist IASHARK Pro[\s\S]*Eine Frage\? Schreib an IASHARK Contact: https:\/\/t\.me\/IasharkContactBot$/);
    await r.maj(msg(2, 999, inconnu, { text: "Hallo, wie viel kostet Pro?" }));
    assert.equal(r.envoyes.at(-1).corps.text, "Hier schicke ich dir nur deine Pro-Nachrichten. Eine Frage? Schreib an IASHARK Contact: https://t.me/IasharkContactBot");
    // Lucia n'est plus abonnee : une commande -> robot en pause + Contact ; un texte -> reponse automatique.
    await r.maj(msg(3, 777, LUCIA, { text: "/programa" }));
    assert.match(r.envoyes.at(-1).corps.text, /^Tu suscripción Pro ya no está activa[\s\S]*Escribe a IASHARK Contact/);
    await r.maj(msg(4, 777, LUCIA, { text: "quiero volver" }));
    assert.match(r.envoyes.at(-1).corps.text, /^Aquí solo te envío tus mensajes Pro\./);
    assert.deepEqual(versClement(r), []);
  });
});

test("sans jeton Contact : le robot Pro marche seul, la reponse automatique donne l'e-mail ; l'adresse ?robot=contact est refusee", async () => {
  await avecRobot(base(), {}, async (r) => {
    await r.maj(msg(1, 777, LUCIA, { text: "hola" }));
    assert.equal(r.envoyes.at(-1).corps.text, "Aquí solo te envío tus mensajes Pro. ¿Una pregunta? Escríbenos a contact@iashark.com");
    assert.ok(!r.envoyes.some((e) => e.methode === "getMe"), "pas de robot Contact a chercher");
    const n = r.envoyes.length;
    await r.maj(msg(2, 777, LUCIA, { text: "hola" }), { robot: "contact", secret: "secret" });
    assert.equal(r.envoyes.length, n, "mise a jour refusee : rien ne part");
    assert.deepEqual(versClement(r), []);
  });
});

test("robot Contact : /start = accueil dans sa langue ; un message (texte, photo) est transfere a Clement par le robot Contact", async () => {
  await avecRobot(base(), { env: AVEC_CONTACT }, async (r) => {
    const contact = { robot: "contact", secret: "secret-contact" };
    const inconnu = { id: 888, first_name: "Marco", username: "marco88", language_code: "it" };
    await r.maj(msg(1, 888, inconnu, { text: "/start" }), contact);
    assert.equal(r.envoyes.at(-1).corps.text, "Ciao, qui è il team IASHARK. Scrivi la tua domanda qui, ti rispondiamo in questa conversazione.");
    assert.equal(r.envoyes.at(-1).robot, "contact");
    assert.deepEqual(versClement(r), [], "/start n'est pas transfere");
    await r.maj(msg(2, 888, inconnu, { text: "Quanto costa Pro?" }), contact);
    await r.maj(msg(3, 888, inconnu, { photo: [{ file_id: "f" }] }), contact);
    const fw = r.envoyes.filter((e) => e.methode === "forwardMessage");
    assert.deepEqual(fw.map((e) => [e.robot, e.corps.chat_id, e.corps.from_chat_id, e.corps.message_id]), [["contact", 42, 888, 2], ["contact", 42, 888, 3]]);
    assert.ok(r.envoyes.filter((e) => e.corps.chat_id === 42).every((e) => e.robot === "contact"), "tout passe par le robot Contact");
    assert.match(r.envoyes.find((e) => e.methode === "sendMessage" && e.corps.chat_id === 42).corps.text, /^Message de Marco \(@marco88\)/);
    const recu = r.envoyes.filter((e) => e.methode === "sendMessage" && e.corps.chat_id === 888 && /Messaggio ricevuto/.test(e.corps.text));
    assert.equal(recu.length, 1, "accuse de reception une seule fois");
    assert.ok(r.base.tables.telegram_contact_threads.every((t) => t.user_chat_id === 888) && r.base.tables.telegram_contact_threads.length === 4);
    // Un abonne relie (Lucia) ecrit au Contact : transfere aussi, accuse dans SA langue (celle de son compte).
    await r.maj(msg(4, 777, { id: 777, first_name: "Lucía", language_code: "en" }, { text: "una pregunta" }), contact);
    assert.ok(r.envoyes.some((e) => e.corps.chat_id === 777 && e.robot === "contact" && /^Mensaje recibido/.test(e.corps.text)));
  });
});

test("robot Contact : la reponse de Clement (« Répondre ») repart chez la personne par le robot Contact ; une ancienne ligne au meme numero est remplacee", async () => {
  // Ligne ecrite par l'ancien robot unique au numero 501 (celui que le faux Telegram donnera au transfert) : jamais la mauvaise personne.
  await avecRobot(base({ telegram_contact_threads: [{ admin_message_id: 502, user_chat_id: 123456, created_at: "2026-09-01T00:00:00Z" }] }), { env: AVEC_CONTACT }, async (r) => {
    const contact = { robot: "contact", secret: "secret-contact" };
    await r.maj(msg(5, 888, { id: 888, first_name: "Marco", language_code: "it" }, { text: "Quanto costa Pro?" }), contact);
    const transfere = r.envoyes.findIndex((e) => e.methode === "forwardMessage");
    const idTransfere = 501 + transfere; // le faux Telegram numerote chaque appel
    assert.equal(r.base.tables.telegram_contact_threads.find((t) => t.admin_message_id === idTransfere)?.user_chat_id, 888);
    await r.maj(msg(900, 42, { id: 42 }, { text: "29,99 € al mese.", reply_to_message: { message_id: idTransfere } }), contact);
    const copie = r.envoyes.find((e) => e.methode === "copyMessage");
    assert.deepEqual([copie.robot, copie.corps.chat_id, copie.corps.from_chat_id, copie.corps.message_id], ["contact", 888, 42, 900]);
    assert.equal(r.envoyes.at(-1).corps.text, "Réponse envoyée.");
    assert.equal(r.envoyes.at(-1).robot, "contact");
    // Clement ecrit au Contact sans repondre a un message : son aide, rien ne part ailleurs.
    await r.maj(msg(901, 42, { id: 42 }, { text: "/start" }), contact);
    assert.match(r.envoyes.at(-1).corps.text, /^Robot IASHARK Contact\./);
  });
});

test("robot Pro : Clement garde ses commandes ; « Répondre » dans le robot Pro ne renvoie plus rien a personne", async () => {
  await avecRobot(base({ telegram_contact_threads: [{ admin_message_id: 70, user_chat_id: 888 }] }), { env: AVEC_CONTACT }, async (r) => {
    await r.maj(msg(1, 42, { id: 42 }, { text: "/start" }));
    assert.match(r.envoyes.at(-1).corps.text, /^Robot IASHARK Pro\.[\s\S]*IASHARK Contact/);
    await r.maj(msg(2, 42, { id: 42 }, { text: "/canalpro" }));
    assert.match(r.envoyes.at(-1).corps.text, /rodage/);
    assert.equal(r.envoyes.at(-1).corps.reply_markup.inline_keyboard[0][0].callback_data, "cp:ouvrir");
    await r.maj(msg(3, 42, { id: 42 }, { text: "/automatique" }));
    assert.match(r.envoyes.at(-1).corps.text, /Publication automatique/);
    await r.maj(msg(4, 42, { id: 42 }, { text: "bonjour", reply_to_message: { message_id: 70 } }));
    assert.ok(!r.envoyes.some((e) => e.methode === "copyMessage" || e.corps.chat_id === 888), "plus de reponse depuis le robot Pro");
    await r.maj({ callback_query: { id: "c1", data: "cp:ouvrir", from: { id: 42 }, message: { message_id: 9, chat: { id: 42 } } } });
    assert.equal(r.base.tables.telegram_settings.find((x) => x.key === "canal_pro_mode").value, "ouvert");
    assert.ok(r.envoyes.every((e) => e.robot === "pro"));
  });
});

test("deploiement (telegram-bot.yml) : deux jetons, deux webhooks, chacun son secret ; cache des noms efface ; repli sans Contact", () => {
  const wf = fs.readFileSync(new URL("../.github/workflows/telegram-bot.yml", import.meta.url), "utf8");
  assert.match(wf, /TELEGRAM_CONTACT_BOT_TOKEN: \$\{\{ secrets\.TELEGRAM_CONTACT_BOT_TOKEN \}\}/);
  assert.match(wf, /iashark-webhook:\$TELEGRAM_CONTACT_BOT_TOKEN/, "secret du Contact derive de SON jeton");
  assert.match(wf, /TELEGRAM_CONTACT_WEBHOOK_SECRET="\$CONTACT_SECRET"/);
  assert.match(wf, /\$URL_FONCTION\?robot=contact/);
  assert.match(wf, /supabase secrets unset[^\n]*TELEGRAM_CONTACT_BOT_TOKEN/, "Contact retire : repli sur l'e-mail");
  assert.match(wf, /node scripts\/telegram\/presentation-robots\.mjs/);
  assert.match(wf, /key=in\.\(bot_username,bot_username_contact\)/, "cache des noms efface");
  assert.ok(!/ANTHROPIC_API_KEY=/.test(wf));
  for (const f of ["supabase/functions/_shared/robots.mjs", "scripts/telegram/presentation-robots.mjs", "config/telegram.json"]) assert.ok(wf.includes(`'${f}'`), f);
  const cfg = JSON.parse(fs.readFileSync(new URL("../config/telegram.json", import.meta.url), "utf8"));
  assert.ok(RB.nomValide(cfg.contact) && RB.nomValide(cfg.pro));
});

test("site : la page Compte invite a poser une question au robot Contact (nom de config/telegram.json) ; la pastille ouvre toujours le robot Pro", () => {
  const cfg = JSON.parse(fs.readFileSync(new URL("../config/telegram.json", import.meta.url), "utf8"));
  const compte = fs.readFileSync(new URL("../account-page.js", import.meta.url), "utf8");
  assert.equal(compte.match(/var ROBOT_CONTACT = '([^']+)';/)?.[1], cfg.contact, "meme nom que config/telegram.json");
  const carte = compte.slice(compte.indexOf("function carteVip()"), compte.indexOf("async function rejoindreVip"));
  assert.equal((carte.match(/ligneContact\(\)/g) || []).length, 2, "carte « bientot » et carte ouverte");
  for (const l of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../i18n/dict/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d.compte_page.contact_telegram_prefix && d.compte_page.contact_telegram_suffix, l);
  }
  const pastille = fs.readFileSync(new URL("../assets/telegram-pill.js", import.meta.url), "utf8");
  assert.match(pastille, /action: 'vip-link'/, "« Mes messages Pro » : le robot Pro (lien donne par le serveur)");
  assert.ok(!pastille.includes(cfg.contact));
});

test("presentation des robots : noms, descriptions fr/es/en, commandes du Pro (/start, /reglages, /langue…), Contact sans commande sauf /start", async () => {
  const P = await import("../scripts/telegram/presentation-robots.mjs");
  const LG = await import("../supabase/functions/_shared/canal-pro-langues.mjs");
  for (const robot of ["pro", "contact"]) {
    const a = P.presentation(robot, { admin: "42" });
    assert.deepEqual(a[0], { methode: "setMyName", corps: { name: robot === "pro" ? "IASHARK Pro" : "IASHARK Contact" } });
    for (const m of ["setMyShortDescription", "setMyDescription"])
      assert.deepEqual(a.filter((x) => x.methode === m).map((x) => x.corps.language_code || ""), ["", "es", "en"], `${robot} ${m}`);
    for (const x of a.filter((x) => x.methode === "setMyShortDescription")) assert.ok(x.corps.short_description.length <= 120);
    for (const x of a.filter((x) => x.methode === "setMyDescription")) assert.ok(x.corps.description.length <= 512);
    assert.ok(a.findIndex((x) => x.methode === "deleteMyCommands") < a.findIndex((x) => x.methode === "setMyCommands"), "anciennes commandes effacees d'abord");
    const cmds = a.filter((x) => x.methode === "setMyCommands");
    for (const c of cmds) for (const k of c.corps.commands) assert.match(k.command, /^[a-z0-9_]{1,32}$/);
    if (robot === "contact") assert.ok(cmds.every((c) => c.corps.commands.length === 1 && c.corps.commands[0].command === "start"), "Contact : seulement /start");
    else {
      // Chaque commande proposee est comprise par le robot (memes alias que LG.COMMANDES).
      for (const c of cmds.filter((c) => !c.corps.scope)) for (const k of c.corps.commands) assert.ok(LG.commande(`/${k.command}`), k.command);
      assert.deepEqual(cmds.filter((c) => !c.corps.scope).map((c) => c.corps.commands.map((k) => LG.commande(`/${k.command}`)).join(",")), Array(6).fill("aide,reglages,langue"));
      const admin = cmds.find((c) => c.corps.scope);
      assert.deepEqual(admin.corps.scope, { type: "chat", chat_id: 42 });
      assert.ok(["canalpro", "automatique"].every((k) => admin.corps.commands.some((x) => x.command === k)), "Clement garde ses commandes");
    }
  }
});
