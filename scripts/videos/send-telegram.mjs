#!/usr/bin/env node
// Envoie sur Telegram les videos listees dans manifest.json (build-daily-videos.mjs).
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... node scripts/videos/send-telegram.mjs <dossier>
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] || "remotion-score-template/out/daily");
const {TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId} = process.env;
if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID manquants");
const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function call(method, body) {
  const res = await fetch(api(method), {method: "POST", body});
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`${method}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const text = (t) => call("sendMessage", new URLSearchParams({chat_id: chatId, text: t}));

const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const done = manifest.videos.filter((v) => fs.existsSync(v.output));
const detail = manifest.videos.length ? ` (${manifest.pulse ?? 0} Match Pulse, ${manifest.simule ?? 0} Match simulé)` : "";
await text(`🎬 IASHARK — vidéos du ${manifest.date}\n${done.length} vidéo(s) prête(s) sur ${manifest.videos.length}${detail}` +
  (manifest.skipped.length ? `\nPas de vidéo aujourd'hui pour : ${manifest.skipped.join(", ")}` : ""));

let failed = 0;
for (const v of manifest.videos) {
  if (!fs.existsSync(v.output)) { failed++; await text(`⚠️ ${v.slug} : le rendu a échoué`); continue; }
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", v.caption.slice(0, 1024));
  form.append("supports_streaming", "true");
  form.append("video", new Blob([fs.readFileSync(v.output)], {type: "video/mp4"}), path.basename(v.output));
  await call("sendVideo", form);
  await new Promise((r) => setTimeout(r, 3500)); // Telegram limite ~20 messages/minute dans un groupe
  console.log(`envoyé : ${v.slug}`);
}
if (failed) process.exitCode = 1;
