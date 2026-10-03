#!/usr/bin/env node
"use strict";
// Maintenance V3 (02/10/2026, accord de Clement « OK maintenance »).
// Lance APRES scripts/build-public.js (voir netlify.toml). Si config/maintenance.json#active
// vaut true, chaque page HTML PUBLIQUE de dist/ est remplacee par la page noire « retour samedi
// 3 octobre a 11 h » (noindex), dans la langue du dossier (fr, en/gb/za, es/mx).
// Restent intactes : connexion, inscription, compte, espace Pro, abonnement et paiement,
// mot de passe, pages legales, desinscription, admin, verification Google.
// Pour RETIRER la maintenance : mettre « active » a false dans config/maintenance.json, puis
// commit + push sur main (Netlify reconstruit le site normal).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "maintenance.json"), "utf8"));
if (!cfg.active) { console.log("Maintenance : inactive."); process.exit(0); }
if (!fs.existsSync(DIST)) { console.error("Maintenance : dist/ absent (lancer build-public.js avant)."); process.exit(1); }

const GARDEES = new Set(["connexion", "inscription", "compte", "pro", "accueil-pro", "abonnement", "checkout-succes",
  "checkout-annule", "mot-de-passe-oublie", "reinitialiser-mot-de-passe", "desinscription-email", "cgv",
  "mentions-legales", "confidentialite", "cookies", "jeu-responsable", "admin", "maintenance"]);
const RETOUR = cfg.retour; // ex. 2026-10-03T11:00:00+02:00

const T = {
  fr: { lang: "fr", titre: "IASHARK V3 · Retour samedi 3 octobre à 11 h", kicker: "Maintenance en cours",
    h1: "La V3 d'IASHARK arrive", date: "Samedi 3 octobre · 11 h (heure de Paris)",
    intro: "Le site est en pause le temps d'installer la nouvelle version. Les analyses reviennent samedi, plus complètes.",
    unites: ["jours", "heures", "min", "s"], bientot: "C'est l'heure : la V3 arrive dans quelques instants.",
    nouv: "Ce qui arrive", items: [
      ["Un moteur de calcul refait", "Des chances calculées qui correspondent à ce qui se passe vraiment sur le terrain."],
      ["Plus de compétitions", "32 compétitions suivies, en Europe et dans le monde."],
      ["Une page match enrichie", "Le match en 30 secondes, le piège, le chiffre fou, le film du match."],
      ["Vos messages Pro sur Telegram", "Le programme du jour en message privé, dans votre langue."],
      ["Un espace Pro à votre goût", "Vos compétitions, vos types de paris, vos réglages."],
      ["7 jours pour essayer", "Essai gratuit de 7 jours, annulable en un clic."]],
    tg: "Suivre le canal gratuit sur Telegram", compte: "Espace abonné · Connexion", pied: "18+" },
  en: { lang: "en", titre: "IASHARK V3 · Back on Saturday 3 October, 11:00", kicker: "Under maintenance",
    h1: "IASHARK V3 is coming", date: "Saturday 3 October · 11:00 (Paris time)",
    intro: "The site is paused while we install the new version. Analyses are back on Saturday, more complete.",
    unites: ["days", "hours", "min", "s"], bientot: "It's time: V3 is arriving in a few moments.",
    nouv: "What's coming", items: [
      ["A rebuilt calculation engine", "Calculated chances that match what really happens on the pitch."],
      ["More competitions", "32 competitions covered, in Europe and worldwide."],
      ["A richer match page", "The match in 30 seconds, the trap, the crazy stat, the match film."],
      ["Your Pro messages on Telegram", "The daily programme in a private message, in your language."],
      ["A Pro space made for you", "Your competitions, your bet types, your settings."],
      ["7 days to try", "7-day free trial, cancel in one click."]],
    tg: "Follow the free Telegram channel", compte: "Subscriber area · Log in", pied: "18+" },
  es: { lang: "es", titre: "IASHARK V3 · Volvemos el sábado 3 de octubre a las 11:00", kicker: "En mantenimiento",
    h1: "Llega la V3 de IASHARK", date: "Sábado 3 de octubre · 11:00 (hora de París)",
    intro: "La web está en pausa mientras instalamos la nueva versión. Los análisis vuelven el sábado, más completos.",
    unites: ["días", "horas", "min", "s"], bientot: "Es la hora: la V3 llega en unos instantes.",
    nouv: "Lo que llega", items: [
      ["Un motor de cálculo renovado", "Probabilidades calculadas que se corresponden con lo que pasa en el campo."],
      ["Más competiciones", "32 competiciones, en Europa y en el mundo."],
      ["Una página de partido más completa", "El partido en 30 segundos, la trampa, el dato loco, la película del partido."],
      ["Tus mensajes Pro en Telegram", "El programa del día por mensaje privado, en tu idioma."],
      ["Un espacio Pro a tu medida", "Tus competiciones, tus tipos de apuesta, tus ajustes."],
      ["7 días para probar", "Prueba gratuita de 7 días, cancelable en un clic."]],
    tg: "Seguir el canal gratuito de Telegram", compte: "Área de suscriptor · Iniciar sesión", pied: "18+" },
};
function langueDe(rel) {
  const d = rel.split("/")[0];
  if (["en", "gb", "za"].includes(d)) return { t: T.en, dir: d };
  if (["es", "mx"].includes(d)) return { t: T.es, dir: d };
  return { t: T.fr, dir: d === "fr" ? "fr" : "" };
}
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function page(t, dir) {
  const base = dir ? "/" + dir + "/" : "/fr/";
  const items = t.items.map(function (it, i) {
    return '<li style="--i:' + i + '"><b>' + esc(it[0]) + "</b><span>" + esc(it[1]) + "</span></li>";
  }).join("");
  return '<!doctype html>\n<html lang="' + t.lang + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">' +
    '<meta name="theme-color" content="#05080c"><title>' + esc(t.titre) + "</title>" +
    '<link rel="icon" href="/favicon-32x32.png">' +
    "<style>" +
    ":root{--fond:#05080c;--carte:#0c1219;--trait:#18222e;--texte:#e8eef4;--doux:#8b9aaa;--cyan:#22d3ee}" +
    "*{box-sizing:border-box;margin:0;padding:0}html,body{background:var(--fond);color:var(--texte)}" +
    "body{font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;overflow-x:hidden}" +
    ".halo{position:fixed;inset:-30% -10% auto;height:80vh;background:radial-gradient(closest-side,rgba(34,211,238,.16),transparent);filter:blur(10px);animation:respire 7s ease-in-out infinite;pointer-events:none}" +
    "@keyframes respire{50%{opacity:.55;transform:scale(1.06)}}" +
    ".w{position:relative;max-width:880px;margin:0 auto;padding:28px 16px 48px}" +
    ".logo{font-weight:900;letter-spacing:.02em;font-size:22px}.logo span{color:var(--cyan)}" +
    ".kick{display:inline-flex;align-items:center;gap:8px;margin-top:48px;font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan)}" +
    ".kick i{width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 12px var(--cyan);animation:pulse 1.6s infinite}" +
    "@keyframes pulse{50%{opacity:.3}}" +
    "h1{font-size:clamp(34px,7vw,64px);line-height:1.05;margin:14px 0 10px;font-weight:900;letter-spacing:-.02em}" +
    "h1 em{font-style:normal;color:var(--cyan)}.date{font-size:18px;font-weight:700}.intro{color:var(--doux);margin-top:10px;max-width:620px}" +
    ".cpt{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:32px 0 8px;max-width:560px}" +
    ".cpt div{background:var(--carte);border:1px solid var(--trait);border-radius:16px;padding:16px 8px;text-align:center}" +
    ".cpt b{display:block;font-size:clamp(30px,6vw,44px);font-weight:900;font-variant-numeric:tabular-nums;color:var(--cyan)}" +
    ".cpt small{color:var(--doux);font-size:12px;text-transform:uppercase;letter-spacing:.12em}" +
    "#fini{display:none;margin-top:24px;font-weight:700;color:var(--cyan)}" +
    "h2{margin:46px 0 14px;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--doux)}" +
    "ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:12px}" +
    "li{background:var(--carte);border:1px solid var(--trait);border-radius:16px;padding:16px 18px;opacity:0;transform:translateY(8px);animation:entre .6s ease forwards;animation-delay:calc(var(--i)*.08s)}" +
    "@keyframes entre{to{opacity:1;transform:none}}li b{display:block;font-size:16px}li span{color:var(--doux);font-size:14px}" +
    ".act{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:34px}" +
    ".tg{display:inline-flex;align-items:center;gap:10px;background:var(--cyan);color:#03141a;font-weight:800;text-decoration:none;padding:14px 20px;border-radius:14px}" +
    ".cpte{color:var(--doux);text-decoration:none;border-bottom:1px solid var(--trait);padding:4px 2px}" +
    ".pied{margin-top:46px;color:var(--doux);font-size:12px}" +
    "@media(max-width:640px){ul{grid-template-columns:1fr}.kick{margin-top:32px}}" +
    "@media (prefers-reduced-motion:reduce){*{animation:none!important}li{opacity:1;transform:none}}" +
    "</style></head><body><div class=\"halo\"></div><main class=\"w\">" +
    '<div class="logo">IA<span>SHARK</span></div>' +
    '<div class="kick"><i></i>' + esc(t.kicker) + "</div>" +
    "<h1>" + esc(t.h1).replace("V3", "<em>V3</em>") + "</h1>" +
    '<div class="date">' + esc(t.date) + '</div><p class="intro">' + esc(t.intro) + "</p>" +
    '<div class="cpt" id="cpt"><div><b id="j">0</b><small>' + t.unites[0] + '</small></div><div><b id="h">00</b><small>' + t.unites[1] +
    '</small></div><div><b id="m">00</b><small>' + t.unites[2] + '</small></div><div><b id="s">00</b><small>' + t.unites[3] + "</small></div></div>" +
    '<p id="fini">' + esc(t.bientot) + "</p>" +
    "<h2>" + esc(t.nouv) + "</h2><ul>" + items + "</ul>" +
    '<div class="act"><a class="tg" href="https://t.me/iasharkdata" rel="noopener">' + esc(t.tg) + " →</a>" +
    '<a class="cpte" href="' + base + 'connexion.html">' + esc(t.compte) + "</a></div>" +
    '<p class="pied">' + esc(t.pied) + "</p></main>" +
    "<script>(function(){var fin=new Date(" + JSON.stringify(RETOUR) + ").getTime();function p(n){return n<10?'0'+n:''+n}" +
    "function t(){var d=fin-Date.now();if(d<=0){document.getElementById('cpt').style.display='none';document.getElementById('fini').style.display='block';return}" +
    "var s=Math.floor(d/1000);document.getElementById('j').textContent=Math.floor(s/86400);document.getElementById('h').textContent=p(Math.floor(s%86400/3600));" +
    "document.getElementById('m').textContent=p(Math.floor(s%3600/60));document.getElementById('s').textContent=p(s%60);setTimeout(t,1000)}t()})();</script>" +
    "</body></html>\n";
}

let remplacees = 0, gardees = 0;
(function parcourir(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["assets", "i18n", "lib", "data"].includes(e.name)) parcourir(abs); return; }
    if (!/\.html$/.test(e.name)) return;
    const rel = path.relative(DIST, abs).split(path.sep).join("/");
    const nom = e.name.replace(/\.html$/, "");
    if (GARDEES.has(nom) || /^google[0-9a-f]+$/.test(nom)) { gardees++; return; }
    const l = langueDe(rel);
    fs.writeFileSync(abs, page(l.t, l.dir));
    remplacees++;
  });
})(DIST);
// Les en-tetes : aucune page de maintenance ne doit etre mise en cache longtemps.
const hdr = path.join(DIST, "_headers");
fs.appendFileSync(hdr, "\n# --- Maintenance V3 (scripts/build-maintenance.js) : pas de cache sur les pages HTML.\n/*.html\n  Cache-Control: no-cache\n  X-Robots-Tag: noindex\n");
console.log("Maintenance : " + remplacees + " page(s) remplacee(s), " + gardees + " page(s) gardee(s) ouvertes (compte, connexion, Pro, paiement, legal).");
