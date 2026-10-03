#!/usr/bin/env node
// « Ma semaine en image » (lundi 12 h 30) : une image par abonne relie au
// robot, avec SA semaine (paris notes dans son journal, gagnes et perdus parmi
// ceux du programme). Aucun chiffre d'IASHARK, AUCUN montant en euros (image
// faite pour etre gardee ou partagee) et pas de « cote de fin » tant qu'elle
// n'est pas validee. Rien n'est invente : sans pari note, pas d'image.
// En RODAGE, seule l'image du compte de Clement (s'il est relie) est envoyee.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaseRest } from "./lib/base.mjs";
import * as C from "../../supabase/functions/_shared/canal-pro.mjs";

export function resumeSemaine(tickets, parisParId) {
  const r = { notes: tickets.length, regles: 0, gagnes: 0, perdus: 0 };
  for (const t of tickets) {
    const p = t.pari_id ? parisParId[t.pari_id] : null;
    if (!p?.resultat || ["retire", "annule", "rembourse"].includes(p.resultat)) continue;
    r.regles++;
    if (["gagne", "moitie_gagne"].includes(p.resultat)) r.gagnes++; else r.perdus++;
  }
  return r;
}

export function carteHtml(prenom, du, au, r) {
  const e = C.esc;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>body{margin:0;width:1080px;height:1350px;background:#0b1117;color:#e6edf3;font-family:Inter,sans-serif;display:flex;flex-direction:column;padding:90px;box-sizing:border-box}
h1{font-size:64px;margin:0 0 10px;font-weight:800}.sous{color:#8b98a5;font-size:32px;margin-bottom:70px}.bloc{background:#121a22;border-left:6px solid #22d3ee;border-radius:18px;padding:40px 48px;margin-bottom:34px}
.chiffre{font-size:92px;font-weight:800;line-height:1}.legende{color:#8b98a5;font-size:30px;margin-top:12px}.pied{margin-top:auto;color:#8b98a5;font-size:28px}</style></head>
<body><h1>${prenom ? e(prenom) + ", ta" : "Ta"} semaine</h1><div class="sous">du ${e(C.dateLongue(du))} au ${e(C.dateLongue(au))}</div>
<div class="bloc"><div class="chiffre">${r.notes}</div><div class="legende">pari${r.notes > 1 ? "s" : ""} noté${r.notes > 1 ? "s" : ""} dans ton journal</div></div>
${r.regles ? `<div class="bloc"><div class="chiffre">${r.gagnes} · ${r.perdus}</div><div class="legende">gagné${r.gagnes > 1 ? "s" : ""} · perdu${r.perdus > 1 ? "s" : ""}, parmi les paris du programme que tu as notés</div></div>` : ""}
<div class="pied">Ton journal, rien que tes paris.</div></body></html>`;
}

async function principal() {
  const env = process.env;
  const db = new BaseRest(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const lundi = C.paris(new Date()).date, du = C.jourSuivant(lundi, -7), au = C.jourSuivant(lundi, -1);
  const reg = async (key) => (await db.select("telegram_settings", { key }))[0]?.value;
  // Envois Pro ouverts (/canalpro) : plus de canal a enregistrer (02/10/2026).
  const ouvert = (await reg("canal_pro_mode")) === "ouvert";
  let lies = await db.select("telegram_abonnes", { chat_id: ["not_is", null], bloque: false });
  const users = lies.length ? await db.select("users", { id: ["in", lies.map((l) => l.user_id)] }) : [];
  const actifs = new Set(users.filter((u) => ["pro", "famille"].includes(u.plan) || u.role === "admin").map((u) => u.id));
  lies = lies.filter((l) => actifs.has(l.user_id) && (ouvert || String(l.chat_id) === String(env.TELEGRAM_CHAT_ID)));
  const { chromium } = await import("@playwright/test");
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1080, height: 1350 } });
  let n = 0;
  for (const a of lies) {
    const tickets = (await db.select("pro_tickets", { user_id: a.user_id, statut: "note", jour: ["gte", du] })).filter((t) => t.jour <= au);
    if (!tickets.length) continue;
    const ids = [...new Set(tickets.map((t) => t.pari_id).filter(Boolean))];
    const paris = ids.length ? (await db.select("pro_paris", { id: ["in", ids] })).filter((p) => p.mode === "ouvert" && p.canal_message_id) : [];
    const r = resumeSemaine(tickets, Object.fromEntries(paris.map((p) => [p.id, p])));
    const cle = `semaine-image:${lundi}:${a.user_id}`;
    if (!(await db.insert("pro_envois", [{ cle, type: "semaine-image" }], { conflit: "ignorer", cle: "cle" })).length) continue;
    await page.setContent(carteHtml(a.prenom, du, au, r), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot();
    const form = new FormData();
    form.append("chat_id", String(a.chat_id));
    form.append("caption", "Ta semaine en image.");
    form.append("photo", new Blob([png], { type: "image/png" }), "ma-semaine.png");
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
    if (res.ok) n++; else console.log(`image ${a.user_id} : ${res.status}`);
    await new Promise((ok) => setTimeout(ok, 200));
  }
  await nav.close();
  console.log(`Ma semaine en image : ${n} image(s) envoyee(s)${ouvert ? "" : " (rodage : compte de Clement seulement)"}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await principal();
