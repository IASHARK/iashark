#!/usr/bin/env node
// Page « journee type » des messages Pro (03/10/2026) a partir du journal de scripts/canal-pro/journee-type.mjs.
// Les bulles contiennent UNIQUEMENT le texte produit par le code (aucun texte ecrit a la main) ; le resume en
// tete est COMPTE a partir du journal.
//   node scripts/canal-pro/page-journee-type.mjs <journee.json> <page.html>
import fs from "node:fs";

const [, , entree = "journee-type.json", sortie = "43-JOURNEE-TYPE-PRO.html"] = process.argv;
const r = JSON.parse(fs.readFileSync(entree, "utf8"));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (t, o) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...o }).format(new Date(t));
const heure = (t) => { const [h, m] = fmt(t, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":"); return `${Number(h)} h${m === "00" ? "" : " " + m}`; };
const jourDe = (t) => fmt(t, { weekday: "long", day: "numeric", month: "long" });

/** Texte Telegram (HTML limite : b, i, a, code) -> HTML de la page. Toute autre balise est affichee telle quelle. */
function bulle(html) {
  const ok = /^<\/?(b|i|code)>$|^<a href="https:\/\/[^"<>]+">$|^<\/a>$/;
  return String(html).split(/(<[^>]*>)/).map((x) => (x.startsWith("<") ? (ok.test(x) ? x.replace(/^<a /, '<a target="_blank" rel="noopener" ') : esc(x)) : x)).join("").replace(/\n/g, "<br>");
}
function genre(m) {
  const h = m.html;
  if (/ton compte est relié|tu cuenta está vinculada/.test(h)) return "bienvenue";
  if (/^<b>(C'est réglé|¡Listo)/.test(h)) return "recap";
  if (/^<b>[^<]*(programme du|programa del)/i.test(h)) return "programme";
  if (/^<b>(Cote en baisse|Cuota a la baja)|^La cote de|^La cuota de/.test(h)) return "cote";
  if (/composition|alineación/.test(h)) return "compo";
  if (/^Météo prévue|^Tiempo previsto/.test(h)) return "meteo";
  if (/Débrief|Resumen/.test(h)) return "debrief";
  if (/Hier dans tes compétitions|Ayer en tus competiciones/.test(h)) return "resultats";
  if (/Bilan de la semaine|Balance de la semana/.test(h)) return "bilan";
  return "autre";
}
const NOMS = { bienvenue: "bienvenue", recap: "récapitulatif", programme: "programme du jour", cote: "alerte de cote", compo: "composition", meteo: "météo", debrief: "débrief", resultats: "résultats de ses compétitions", bilan: "bilan du lundi", autre: "autre" };
const PROFILS = {
  lucas: { titre: "Lucas", sous: "Français · France · Winamax + Betclic · Premier League · alertes oui · heure par défaut" },
  pablo: { titre: "Pablo", sous: "Espagnol · Espagne · bookmakers d'Espagne · toutes compétitions · alertes oui · 12 h" },
  marie: { titre: "Marie", sous: "Français · France · tous les bookmakers suivis · Ligue 1 + Liga · alertes non" },
};
const qui = Object.keys(PROFILS);
const recus = (k) => r.journal.filter((m) => m.ou === k && m.de === "robot");
const numeros = (m) => [...new Set((m.html.match(/N° PRO-\d+/g) || []))];

function resume(k) {
  const ms = recus(k);
  const n = (g) => ms.filter((m) => genre(m) === g);
  const prog = n("programme");
  const premier = prog[0];
  const paris = premier ? numeros(premier) : [];
  const cotes = premier ? [...premier.html.matchAll(/(?:Cote|Cuota)[^:]*:\s*<b>([\d,]+)<\/b> (?:chez|en) ([^·(\n]+)/g)].map((x) => `${x[1]} ${x[2].trim()}`) : [];
  const infosJour = ms.filter((m) => /Aujourd'hui dans tes compétitions|Hoy en tus competiciones/.test(m.html)).map((m) => (m.html.split(/Aujourd'hui dans tes compétitions|Hoy en tus competiciones/)[1].match(/\n• /g) || []).length);
  const alertes = n("cote").length + n("compo").length + n("meteo").length;
  return [
    `${ms.length} messages reçus du robot, tous en privé, en ${k === "pablo" ? "espagnol" : "français"}.`,
    premier ? `Programme du samedi reçu à ${heure(premier.t)} : ${paris.length} paris (${paris.join(", ")}), les mêmes que pour les deux autres.` : "Aucun programme reçu.",
    cotes.length ? `Ses cotes : ${cotes.join(" ; ")}.` : "Aucune cote affichée.",
    alertes ? `${alertes} alertes : ${n("cote").length} de cote, ${n("compo").length} de compositions, ${n("meteo").length} de météo.` : "Aucune alerte : coupées dans ses réglages.",
    infosJour.length || n("resultats").length
      ? `Info de ses compétitions : ${infosJour.reduce((a, x) => a + x, 0)} matchs listés avec le lien d'analyse (samedi et lundi), ${n("resultats").length ? "et les résultats d'hier dimanche matin" : "sans résultats le lendemain"}.`
      : "Pas de liste à part pour ses compétitions (« toutes »).",
  ];
}

function boutons(m) {
  const rangs = (m.boutons || []).filter((r) => r.length);
  if (!rangs.length) return m.bouton_final ? `<div class="kb"><div class="kr"><span class="kbtn done">${esc(m.bouton_final)}</span></div></div>` : "";
  return `<div class="kb">${rangs.map((rg) => `<div class="kr">${rg.map((b) => `<span class="kbtn">${esc(b.text)}</span>`).join("")}</div>`).join("")}${m.bouton_final ? `<div class="kr"><span class="kbtn done">${esc(m.bouton_final)}</span></div>` : ""}</div>`;
}
function fil(ms, { clement = false } = {}) {
  let jour = "", out = "";
  for (const m of ms) {
    const j = jourDe(m.t);
    if (j !== jour) { jour = j; out += `<div class="day">${esc(j)}</div>`; }
    if (m.de === "clic") { out += `<div class="clic">${esc(heure(m.t))} · ${esc(m.html)}</div>`; continue; }
    const g = genre(m);
    out += `<div class="msg${clement ? " adm" : ""}"><div class="meta"><span class="tag t-${g}">${esc(clement ? "robot → Clément" : NOMS[g])}</span><span class="h">${esc(heure(m.t))}</span></div>`
      + `<div class="txt">${bulle(m.html)}</div>${boutons(m)}</div>`;
  }
  return out;
}

const paris = r.paris.filter((p) => p.numero).sort((a, b) => a.numero - b.numero);
// Les premiers messages d'un nouvel abonne : de la liaison (vendredi soir) jusqu'a son premier programme.
const premiers = (() => {
  const ms = r.journal.filter((m) => m.ou === "lucas" && m.de === "robot");
  const i = ms.findIndex((m) => genre(m) === "programme");
  return i < 0 ? ms.filter((m) => m.premier) : ms.slice(0, i + 1);
})();
const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Journée type Pro</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#060b12;--surface:#0a1420;--panel:#0d1926;--cyan:#20d5ef;--cyan2:#06b6d4;--ink:#f4f7fb;--soft:#91a0b3;--line:rgba(141,179,211,.14);--bubble:#122335;--adm:#0f1d2b}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif}
.wrap{max-width:1320px;margin:0 auto;padding:20px 16px 60px}
h1{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:34px;letter-spacing:.5px;margin:6px 0 4px}h1 span{color:var(--cyan)}
.lead{color:var(--soft);max-width:860px;margin:0 0 18px}
.resume{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-bottom:18px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.card h2{margin:0 0 2px;font-size:18px}.card .sous{color:var(--soft);font-size:12.5px;margin-bottom:8px}
.card ol{margin:0;padding-left:18px}.card li{margin:3px 0;font-size:14px}
.premiers{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 14px 4px;margin-bottom:18px}
.premiers h2{margin:0;font-size:18px}.premiers .sous{color:var(--soft);font-size:13px;margin:4px 0 0}.premiers .chat{max-width:620px;padding:0}
.pareil{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin-bottom:22px;font-size:14px}
.pareil b{color:var(--cyan)}
.tabs{display:none;gap:8px;margin-bottom:12px;position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:2}
.tabs button{flex:1;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:10px;font:600 14px Inter,sans-serif}
.tabs button[aria-pressed=true]{background:var(--cyan);color:var(--bg);border-color:var(--cyan)}
.cols{display:grid;gap:14px;grid-template-columns:repeat(3,minmax(0,1fr))}
.col{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;min-width:0}
.col header{padding:12px 14px;border-bottom:1px solid var(--line);background:var(--panel)}
.col header b{font-size:16px}.col header div{color:var(--soft);font-size:12px}
.chat{padding:10px 10px 16px}
.day{text-align:center;margin:14px 0 8px;color:var(--soft);font-size:12px}
.day::before,.day::after{content:"";display:inline-block;width:18%;height:1px;background:var(--line);vertical-align:middle;margin:0 8px}
.msg{background:var(--bubble);border:1px solid var(--line);border-radius:4px 14px 14px 14px;padding:9px 11px;margin:8px 0;max-width:100%}
.msg.adm{background:var(--adm)}
.meta{display:flex;justify-content:space-between;gap:8px;margin-bottom:5px;font-size:11.5px;color:var(--soft)}
.tag{color:var(--cyan)}.h{white-space:nowrap}
.txt{font-size:13.5px;overflow-wrap:anywhere}.txt b{color:#fff}.txt a{color:var(--cyan)}.txt i{color:var(--soft)}
.kb{margin-top:8px;display:grid;gap:5px}.kr{display:flex;gap:5px;flex-wrap:wrap}
.kbtn{flex:1;text-align:center;background:rgba(32,213,239,.10);border:1px solid rgba(32,213,239,.35);color:var(--cyan);border-radius:9px;padding:6px 8px;font-size:12.5px;font-weight:600}
.kbtn.done{background:transparent;color:var(--soft);border-style:dashed}
.clic{margin:6px 0;color:var(--cyan2);font-size:12.5px;text-align:right}
details.adm-box{margin-top:22px;background:var(--surface);border:1px solid var(--line);border-radius:16px}
details.adm-box summary{cursor:pointer;padding:14px 16px;font-weight:800;font-size:16px}
details.adm-box .chat{max-width:760px}
.note{color:var(--soft);font-size:12.5px;margin-top:18px}
@media (max-width:900px){.tabs{display:flex}.cols{grid-template-columns:1fr}.col{display:none}.col.on{display:block}h1{font-size:28px}}
</style></head><body><div class="wrap">
<h1>IA<span>SHARK</span> · journée type Pro</h1>
<p class="lead">Samedi 3 octobre 2026, de 6 h à minuit, puis le dimanche matin et le lundi (bilan). Envois Pro ouverts, programme validé par Clément à 8 h 45. Données fictives réalistes ; chaque bulle est le texte exact produit par le vrai robot (aucun texte écrit à la main), avec l'heure et les boutons.</p>
<div class="resume">${qui.map((k) => `<div class="card"><h2>${esc(PROFILS[k].titre)}</h2><div class="sous">${esc(PROFILS[k].sous)}</div><ol>${resume(k).map((l) => `<li>${esc(l)}</li>`).join("")}</ol></div>`).join("")}</div>
<section class="premiers"><h2>Les premiers messages reçus</h2><p class="sous">Lucas relie son compte le vendredi soir (ses réglages sont déjà remplis sur le site) : bienvenue, récapitulatif, puis son premier programme le lendemain matin. Texte exact du robot.</p><div class="chat">${fil(premiers)}</div></section>
<div class="pareil"><b>Pareil pour les trois :</b> les mêmes paris (${paris.map((p) => `N° PRO-${p.numero}`).join(", ")}), les mêmes chances, le même débrief et le même bilan.
<b>Ce qui change :</b> la langue, l'heure d'envoi, la meilleure cote chez ses bookmakers (de son pays), ses alertes oui/non, et à la fin du programme la petite liste « Aujourd'hui dans tes compétitions » (sans pari), puis « Hier dans tes compétitions » le lendemain matin.</div>
<div class="tabs" role="tablist">${qui.map((k, i) => `<button type="button" data-k="${k}" aria-pressed="${i === 0}">${esc(PROFILS[k].titre)}</button>`).join("")}</div>
<div class="cols">${qui.map((k, i) => `<section class="col${i === 0 ? " on" : ""}" id="c-${k}"><header><b>${esc(PROFILS[k].titre)}</b><div>${esc(PROFILS[k].sous)}</div></header><div class="chat">${fil(r.journal.filter((m) => m.ou === k))}</div></section>`).join("")}</div>
<details class="adm-box"><summary>Ce que reçoit Clément (${recus("clement").length} messages : validation, registre, débrief et bilan à envoyer)</summary><div class="chat">${fil(r.journal.filter((m) => m.ou === "clement"), { clement: true })}</div></details>
<p class="note">Simulation faite avec scripts/canal-pro/journee-type.mjs (vrai robot, fausse base, faux Telegram, faux Internet) ; dimanche après 8 h 30 et lundi avant 6 h ne sont pas simulés. Aucun message n'a été envoyé.</p>
</div>
<script>
document.querySelectorAll(".tabs button").forEach(function(b){b.addEventListener("click",function(){
  document.querySelectorAll(".tabs button").forEach(function(x){x.setAttribute("aria-pressed",x===b?"true":"false")});
  document.querySelectorAll(".col").forEach(function(c){c.classList.toggle("on",c.id==="c-"+b.dataset.k)});});});
</script></body></html>
`;
fs.writeFileSync(sortie, html);
console.log(`page ecrite : ${sortie}`);
