#!/usr/bin/env node
// Envoie sur Telegram les messages prepares par build-posts.mjs.
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... node scripts/telegram/send-posts.mjs <dossier>
// Tant que TELEGRAM_AUTO n'est pas a 1 : tout part dans la conversation privee de Clement, avec les
// boutons « Publier sur le canal » / « Ne pas publier » (le clic est traite par le robot deploye).
// TEST=1 (essais) : marque [TEST], sans bouton de publication.
// Publication automatique (accord de Clement du 03/11/2026, reglage pose a la main) : TELEGRAM_AUTO=1 et
// TELEGRAM_CHANNEL_ID = numero de la chaine privee (-100...). L'ancienne adresse @iasharkdata appartient
// depuis le 26/10/2026 a un petit canal de renvoi : elle est refusee, et toute chaine publique aussi.
//   node scripts/telegram/send-posts.mjs --verifier : dit si le reglage vise bien la chaine privee, sans afficher de valeur.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
const P = createRequire(import.meta.url)("../../lib/telegram-posts.js");

const verifier = process.argv[2] === "--verifier";
const dir = path.resolve(verifier ? "." : process.argv[2] || "telegram-out");
const {TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: prive, TELEGRAM_CHANNEL_ID: canal, TEST, TELEGRAM_AUTO} = process.env;
if (!token || (!prive && !verifier)) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID manquants");
const test = TEST === "1";
const auto = !test && TELEGRAM_AUTO === "1" && !!canal;
if (!test && TELEGRAM_AUTO === "1" && !canal) console.log("::warning title=Telegram::TELEGRAM_AUTO=1 mais TELEGRAM_CHANNEL_ID absent : les messages restent a valider d'un clic.");
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

// La chaine visee : verdict sans aucune valeur secrete.
async function verdictChaine() {
  if (!canal) return null;
  if (!/^-100\d+$/.test(canal)) return {adresse: false};
  const chat = await call("getChat", {chat_id: canal});
  const moi = await call("getMe", {});
  const membre = await call("getChatMember", {chat_id: canal, user_id: moi.result.id});
  return {adresse: true, ...P.verdictChaine(chat.result, membre.result)};
}
if (verifier) {
  const v = await verdictChaine();
  if (!v) { console.log("TELEGRAM_CHANNEL_ID : absent. Rien ne peut partir en automatique."); process.exit(1); }
  if (!v.adresse) { console.log("TELEGRAM_CHANNEL_ID : ce n'est pas un numero -100... (ancienne adresse ?). A corriger."); process.exit(1); }
  const oui = (x) => (x === null ? "non lisible" : x ? "oui" : "non");
  console.log(`Titre : ${v.titre}\nChaine : ${oui(v.chaine)}\nPrivee : ${oui(v.privee)}\nRobot administrateur : ${oui(v.robotAdmin)}\nMeme lien d'invitation que le plan : ${oui(v.lienIdentique)}`);
  process.exit(v.chaine && v.privee && v.robotAdmin ? 0 : 1);
}
if (auto) {
  const v = await verdictChaine();
  if (!v.adresse) throw new Error("TELEGRAM_CHANNEL_ID doit etre le numero de la chaine privee (-100...) : rien n'est envoye.");
  if (!v.privee || !v.robotAdmin) throw new Error("TELEGRAM_CHANNEL_ID ne vise pas une chaine privee ou le robot n'y est pas administrateur : rien n'est envoye.");
}

const {posts, date} = JSON.parse(fs.readFileSync(path.join(dir, "posts.json"), "utf8"));
if (!posts.length) { console.log("Aucun message a envoyer."); process.exit(0); }
console.log(`${test ? "TEST (conversation privee)" : auto ? "CHAINE (automatique)" : "A VALIDER (conversation privee)"} — ${posts.length} message(s) du ${date}`);
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
  } else if (p.type === "video") {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", (prefixe + p.html).slice(0, 1024));
    form.append("parse_mode", "HTML");
    form.append("supports_streaming", "true");
    if (clavier(p)) form.append("reply_markup", JSON.stringify(clavier(p)));
    form.append("video", new Blob([fs.readFileSync(p.image)], {type: "video/mp4"}), "video.mp4");
    await call("sendVideo", form);
  }
  // Trace de ce qui est VRAIMENT parti : le workflow ne memorise que ces messages
  // (un match gratuit non envoye reste a envoyer ce jour-la).
  fs.appendFileSync(path.join(dir, "envoyes.txt"), p.slot + "\n");
  console.log(`envoye : ${p.slot}`);
  await new Promise((r) => setTimeout(r, 3500));
}
