#!/usr/bin/env node
// Envoie sur Telegram les messages prepares par build-posts.mjs.
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... node scripts/telegram/send-posts.mjs <dossier>
// Choix de Clement (28/09/2026) : il valide chaque publication d'un clic. Tout
// part donc dans SA conversation privee avec le robot, avec les boutons
// « Publier sur le canal » / « Ne pas publier ». Le clic est traite par
// l'Edge Function supabase/functions/telegram-bot, qui copie le message sur
// le canal @iasharkdata.
// TEST=1 (essais de la branche) : marque [TEST], sans bouton de publication.
// Publication automatique (plus tard, si Clement le decide) : TELEGRAM_AUTO=1
// et TELEGRAM_CHANNEL_ID renseigne.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] || "telegram-out");
const {TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: prive, TELEGRAM_CHANNEL_ID: canal, TEST, TELEGRAM_AUTO} = process.env;
if (!token || !prive) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID manquants");
const test = TEST === "1";
const auto = !test && TELEGRAM_AUTO === "1" && !!canal;
const chatId = auto ? canal : prive;
const validation = !test && !auto;
const api = (m) => `https://api.telegram.org/bot${token}/${m}`;

async function call(method, body) {
  const res = await fetch(api(method), body instanceof FormData ? {method: "POST", body} : {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`${method}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const clavier = (p) => {
  const rows = (p.boutons || []).map((b) => [{text: b.text, url: b.url}]);
  if (validation) rows.push([{text: "Publier sur le canal", callback_data: "pub"}, {text: "Ne pas publier", callback_data: "non"}]);
  return rows.length ? {inline_keyboard: rows} : undefined;
};
const prefixe = test ? "<b>[TEST — pas publié sur le canal]</b>\n" : "";

const {posts, date} = JSON.parse(fs.readFileSync(path.join(dir, "posts.json"), "utf8"));
if (!posts.length) { console.log("Aucun message a envoyer."); process.exit(0); }
console.log(`${test ? "TEST (conversation privee)" : auto ? "CANAL (automatique)" : "A VALIDER (conversation privee)"} — ${posts.length} message(s) du ${date}`);
for (const p of posts) {
  if (p.type === "text") {
    await call("sendMessage", {chat_id: chatId, text: prefixe + p.html, parse_mode: "HTML",
      link_preview_options: p.apercu ? {url: p.apercuUrl, prefer_large_media: true} : {is_disabled: true}, reply_markup: clavier(p)});
  } else if (p.type === "photo") {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", (prefixe + p.html).slice(0, 1024));
    form.append("parse_mode", "HTML");
    if (clavier(p)) form.append("reply_markup", JSON.stringify(clavier(p)));
    form.append("photo", new Blob([fs.readFileSync(p.image)], {type: "image/png"}), "match-gratuit.png");
    await call("sendPhoto", form);
  } else if (p.type === "poll") {
    if (test) await call("sendMessage", {chat_id: chatId, text: prefixe + "Sondage ci-dessous :", parse_mode: "HTML"});
    await call("sendPoll", {chat_id: chatId, question: p.question.slice(0, 300), options: p.options.map((t) => ({text: t.slice(0, 100)})),
      is_anonymous: true, reply_markup: clavier(p)});
  }
  // Trace de ce qui est VRAIMENT parti : le workflow ne memorise que ces messages
  // (un match gratuit non envoye reste a envoyer ce jour-la).
  fs.appendFileSync(path.join(dir, "envoyes.txt"), p.slot + "\n");
  console.log(`envoye : ${p.slot}`);
  await new Promise((r) => setTimeout(r, 3500));
}
