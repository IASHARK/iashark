#!/usr/bin/env node
// Presentation des deux robots Telegram (03/10/2026, decision de Clement) : nom, description courte,
// description, liste des commandes. Lance par .github/workflows/telegram-bot.yml a chaque installation.
//   TELEGRAM_BOT_TOKEN=... [TELEGRAM_CONTACT_BOT_TOKEN=...] [TELEGRAM_CHAT_ID=...] node scripts/telegram/presentation-robots.mjs
// - « IASHARK Pro » : envoie seulement ; commandes /start, /reglages, /langue (et leurs equivalents
//   es/en/de/it/pt) ; dans la conversation de Clement, ses commandes d'administration.
// - « IASHARK Contact » : seulement pour les questions ; aucune commande sauf /start.
// presentation() est PURE (testee) ; seul le lancement en ligne de commande appelle Telegram.
import { pathToFileURL } from "node:url";

export const NOMS = { pro: "IASHARK Pro", contact: "IASHARK Contact" };

const PRO = {
  courte: {
    "": "Tes messages Pro IASHARK, en privé : programme du jour, alertes, compositions, débriefs.",
    es: "Tus mensajes Pro de IASHARK, en privado: programa del día, alertas, alineaciones, resúmenes.",
    en: "Your IASHARK Pro messages, privately: programme of the day, alerts, line-ups, debriefs.",
  },
  longue: {
    "": "IASHARK Pro t'envoie tes messages Pro, en privé et dans ta langue : le programme du jour, les alertes, les compositions, les débriefs et le bilan.\n\nPour relier ton compte : page Compte du site iashark.com, « Ouvrir mon robot sur Telegram ».\n\nCe robot envoie seulement. Une question ? Écris à IASHARK Contact.",
    es: "IASHARK Pro te envía tus mensajes Pro, en privado y en tu idioma: el programa del día, las alertas, las alineaciones, los resúmenes y el balance.\n\nPara vincular tu cuenta: página Cuenta del sitio iashark.com, «Abrir mi robot en Telegram».\n\nEste robot solo envía. ¿Una pregunta? Escribe a IASHARK Contact.",
    en: "IASHARK Pro sends you your Pro messages, privately and in your language: the programme of the day, alerts, line-ups, debriefs and the review.\n\nTo link your account: Account page on iashark.com, “Open my robot on Telegram”.\n\nThis robot only sends. A question? Write to IASHARK Contact.",
  },
  // Commandes du robot (LG.COMMANDES dans _shared/canal-pro-langues.mjs) : start, reglages, langue.
  commandes: {
    "": [["start", "Relier mon compte / revoir l'aide"], ["reglages", "Mes réglages"], ["langue", "Changer de langue"]],
    es: [["start", "Vincular mi cuenta / ver la ayuda"], ["ajustes", "Mis ajustes"], ["idioma", "Cambiar de idioma"]],
    en: [["start", "Link my account / see help"], ["settings", "My settings"], ["language", "Change language"]],
    de: [["start", "Konto verknüpfen / Hilfe"], ["einstellungen", "Meine Einstellungen"], ["sprache", "Sprache ändern"]],
    it: [["start", "Collegare il mio account / aiuto"], ["impostazioni", "Le mie impostazioni"], ["lingua", "Cambiare lingua"]],
    pt: [["start", "Ligar a minha conta / ajuda"], ["definicoes", "As minhas definições"], ["idioma", "Mudar de idioma"]],
  },
  // Conversation de Clement seulement.
  admin: [["canalpro", "Envois Pro : rodage ou ouverts"], ["automatique", "Envoi sans clic, type par type"], ["aide", "Aide du robot"]],
};
const CONTACT = {
  courte: {
    "": "Une question pour l'équipe IASHARK ? Écris ici, on te répond dans cette conversation.",
    es: "¿Una pregunta para el equipo IASHARK? Escribe aquí, te respondemos en esta conversación.",
    en: "A question for the IASHARK team? Write here, we reply in this conversation.",
  },
  longue: {
    "": "Le contact de l'équipe IASHARK : abonnement, compte, question sur un pari. Écris ta question ici, on te répond dans cette conversation.\n\nTes messages Pro (programme du jour, alertes, débriefs) arrivent dans l'autre robot : IASHARK Pro.",
    es: "El contacto del equipo IASHARK: suscripción, cuenta, pregunta sobre una apuesta. Escribe tu pregunta aquí, te respondemos en esta conversación.\n\nTus mensajes Pro (programa del día, alertas, resúmenes) llegan al otro robot: IASHARK Pro.",
    en: "The IASHARK team contact: subscription, account, a question about a bet. Write your question here, we reply in this conversation.\n\nYour Pro messages (programme of the day, alerts, debriefs) arrive in the other robot: IASHARK Pro.",
  },
  commandes: {
    "": [["start", "Écrire à l'équipe IASHARK"]],
    es: [["start", "Escribir al equipo IASHARK"]],
    en: [["start", "Write to the IASHARK team"]],
  },
};
// Langues pour lesquelles d'anciennes commandes peuvent rester : elles sont toujours effacees d'abord.
const TOUTES = ["", "fr", "es", "en", "de", "it", "pt"];

/** Liste des appels Telegram pour presenter un robot : [{ methode, corps }]. */
export function presentation(robot, { admin } = {}) {
  const P = robot === "contact" ? CONTACT : PRO;
  const lang = (l) => (l ? { language_code: l } : {});
  const appels = [{ methode: "setMyName", corps: { name: NOMS[robot] } }];
  for (const [l, t] of Object.entries(P.courte)) appels.push({ methode: "setMyShortDescription", corps: { short_description: t, ...lang(l) } });
  for (const [l, t] of Object.entries(P.longue)) appels.push({ methode: "setMyDescription", corps: { description: t, ...lang(l) } });
  for (const l of TOUTES) appels.push({ methode: "deleteMyCommands", corps: { ...lang(l) } });
  for (const [l, c] of Object.entries(P.commandes)) appels.push({ methode: "setMyCommands", corps: { commands: c.map(([command, description]) => ({ command, description })), ...lang(l) } });
  if (robot === "pro" && admin) {
    const c = [...P.commandes[""], ...P.admin].map(([command, description]) => ({ command, description }));
    appels.push({ methode: "setMyCommands", corps: { commands: c, scope: { type: "chat", chat_id: Number(admin) } } });
  }
  return appels;
}

async function appeler(jeton, { methode, corps }) {
  const r = await fetch(`https://api.telegram.org/bot${jeton}/${methode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
  const j = await r.json().catch(() => ({}));
  // setMyName est limite par Telegram (429 si trop souvent) : on continue, le nom est deja en place.
  if (!j.ok) console.log(`  ${methode}${corps.language_code ? ` (${corps.language_code})` : ""} : ${r.status} ${j.description || ""}`);
  return !!j.ok;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const robots = [["pro", process.env.TELEGRAM_BOT_TOKEN], ["contact", process.env.TELEGRAM_CONTACT_BOT_TOKEN]].filter(([, j]) => j);
  for (const [robot, jeton] of robots) {
    let ok = 0;
    const appels = presentation(robot, { admin: process.env.TELEGRAM_CHAT_ID });
    for (const a of appels) ok += (await appeler(jeton, a)) ? 1 : 0;
    console.log(`${NOMS[robot]} : ${ok}/${appels.length} réglages de présentation appliqués.`);
  }
}
