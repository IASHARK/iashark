// Robots Telegram IASHARK. Deploye SANS verification JWT (Telegram n'en
// envoie pas) : chaque entree est donc authentifiee ici.
//
// DEUX ROBOTS (03/10/2026, decision de Clement ; logique pure dans _shared/robots.mjs) :
// - « IASHARK Pro » (TELEGRAM_BOT_TOKEN) ENVOIE seulement : programme, alertes, compositions,
//   debriefs, bilan ; accueil + questionnaire a boutons ; /start (liaison), /reglages, /langue
//   (/idioma…), /programme, /lotofoot ; toutes les commandes et boutons de Clement. On ne peut plus
//   lui poser de question : tout texte libre (hors Clement) recoit une reponse automatique dans la
//   langue de la personne, qui renvoie vers le robot Contact. RIEN n'est transfere a Clement.
// - « IASHARK Contact » (TELEGRAM_CONTACT_BOT_TOKEN, facultatif ; webhook « ?robot=contact » et son
//   propre secret TELEGRAM_CONTACT_WEBHOOK_SECRET) : seulement les questions. Tout message est
//   transfere a Clement ; sa reponse (« Repondre », dans la conversation du robot Contact) repart
//   chez la personne par le robot Contact (table telegram_contact_threads).
// Sans jeton Contact : le robot Pro marche seul, sa reponse automatique donne contact@iashark.com.
//
// MESSAGES PRO EN PRIVE (02/10/2026, decision de Clement) : il n'y a PLUS de canal Pro commun.
// Tout ce qui est reserve aux abonnes Pro part en message prive, un a un, du robot a chaque abonne
// Pro (actif ou en essai) relie au robot, dans SA langue, avec les memes chiffres pour tous
// (_shared/canal-pro-diffusion.mjs). Le canal gratuit @iasharkdata ne change pas.
//
// 1. Webhook Telegram (en-tete X-Telegram-Bot-Api-Secret-Token) :
//    - Canal gratuit (28/09) : « Publier sur le canal » / « Ne pas publier »
//      sous chaque message envoye en prive a Clement.
//    - Messages Pro : validation du programme du jour par Clement (Valider /
//      Modifier / Annuler) ; « Envoyer aux abonnés Pro » pour les messages
//      proposes (debriefs, bilan : obligatoires, un seul envoi meme s'ils ont ete
//      reproposes ; Loto Foot, programme reporte) ; /automatique (Clement allume
//      ou eteint l'envoi sans clic, type par type ; eteint par defaut) ;
//      /canalpro (rodage ou envois ouverts) ; preuve d'envoi retrouvee (Clement
//      transfere le message d'un pari depuis le registre, sa conversation avec le
//      robot) ; « Renvoyer » un pari a l'envoi incertain ; duel du jour (canal
//      gratuit) et ses votes.
//    - Robot personnel : un abonne Pro relie son compte (lien du site avec un code
//      a usage unique) ; le robot lui souhaite la bienvenue dans sa langue et lui
//      pose ses questions une par une, avec des boutons (_shared/canal-pro-accueil.mjs) ;
//      puis : /programme, /reglages, /langue, /lotofoot. Plus de tickets ni de cote du
//      tabac ecrits au robot (03/10 : texte libre = reponse automatique). Garde-fou. Seuls
//      les paris ENVOYES avec les envois Pro OUVERTS sont lus.
//    - Contact : robot IASHARK Contact (voir plus haut).
// 2. { action: "vip-link" } avec le jeton de session de l'abonne (page Compte) :
//    renvoie le lien du robot personnel (code a usage unique). Pro, famille et admin
//    seulement. Plus de lien d'entree a un canal.
// Les envois planifies (programme 8 h 45, rappel, envoi, alertes, debriefs…) sont
// faits par scripts/canal-pro/tourner.mjs. LANGUES : le robot repond a chaque abonne
// dans SA langue (user_preferences.language, sinon langue de son Telegram, sinon
// francais) ; /langue (/idioma, /language…) pour changer.
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as C from "../_shared/canal-pro.mjs";
import * as LG from "../_shared/canal-pro-langues.mjs";
import * as D from "../_shared/canal-pro-diffusion.mjs";
import * as A from "../_shared/canal-pro-accueil.mjs";
import * as RB from "../_shared/robots.mjs";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
const ADMIN = Number(Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") || 0);
const CANAL = Deno.env.get("TELEGRAM_PUBLIC_CHANNEL") || "@iasharkdata";
// Robot IASHARK Contact (facultatif) : son jeton et le secret de SON webhook (derive de son jeton).
const TOKEN_CONTACT = Deno.env.get("TELEGRAM_CONTACT_BOT_TOKEN") || "";
const SECRET_CONTACT = Deno.env.get("TELEGRAM_CONTACT_WEBHOOK_SECRET") || "";
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(SUPA_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CODE_DUREE_MS = 7 * 24 * 3600 * 1000;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

// deno-lint-ignore no-explicit-any
type Any = any;

async function appelTelegram(jeton: string, method: string, body: Record<string, unknown>): Promise<Any> {
  const res = await fetch(`https://api.telegram.org/bot${jeton}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) {
    // Code HTTP et attente demandee (429) gardes : le moteur d'envoi prive s'en sert (403 = robot bloque).
    const e: Any = new Error(`${method}: ${res.status} ${j.description || ""}`);
    e.status = res.status; e.retry_after = j.parameters?.retry_after ?? null;
    throw e;
  }
  return j.result;
}
/** Robot IASHARK Pro. */
const tg = (method: string, body: Record<string, unknown>) => appelTelegram(TOKEN, method, body);
/** Robot IASHARK Contact (seulement quand son jeton est installe). */
const tgc = (method: string, body: Record<string, unknown>) => appelTelegram(TOKEN_CONTACT, method, body);
const html = (chat_id: number | string, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });
const repondre = (cq: Any, text = "", alerte = false) => tg("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alerte }).catch(() => null);

async function reglage(key: string): Promise<string | null> {
  const { data } = await db.from("telegram_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function enregistrer(key: string, value: string) {
  await db.from("telegram_settings").upsert({ key, value, updated_at: new Date().toISOString() });
}
/** Envois Pro ouverts par Clement (/canalpro) ? Sinon (rodage), tout part chez Clement seul. Plus de canal a enregistrer. */
async function modeCanalPro() {
  return { ouvert: (await reglage("canal_pro_mode")) === "ouvert" };
}
// Noms d'utilisateur des robots, gardes en cache (telegram_settings) ; le deploiement efface ce cache
// (nouveau jeton = nouveau robot) : ils sont alors relus avec getMe.
async function nomDuRobot() {
  const deja = await reglage("bot_username");
  if (deja) return deja;
  const me = await tg("getMe", {});
  await enregistrer("bot_username", me.username);
  return me.username as string;
}
/** Nom du robot Contact (sans @), ou null sans robot Contact : la reponse automatique donne alors l'e-mail. */
async function nomContact(): Promise<string | null> {
  if (!TOKEN_CONTACT || !SECRET_CONTACT) return null;
  try {
    const deja = await reglage("bot_username_contact");
    if (RB.nomValide(deja)) return deja;
    const me = await tgc("getMe", {});
    if (!RB.nomValide(me?.username)) return null;
    await enregistrer("bot_username_contact", me.username);
    return me.username as string;
  } catch (e) {
    console.error("[telegram-bot] nom du robot Contact", (e as Error).message);
    return null;
  }
}
/** Reponse automatique du robot Pro a un texte libre (dans la langue de la personne) : rien n'est transfere a Clement. */
async function reponseAuto(chat: number, lang: string, avant = "") {
  await tg("sendMessage", { chat_id: chat, text: `${avant}${RB.reponseAutoPro(lang, await nomContact())}`, link_preview_options: { is_disabled: true } });
}
const heureParis = () => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date());

// ---------- 1a. Validation d'un clic (canal gratuit, messages Pro) ----------
// Garde les boutons-liens (« Voir le choix du modele »…), retire les boutons
// de validation.
function boutonsLiens(markup: Any) {
  const rows = (markup?.inline_keyboard || [])
    .map((r: Any[]) => r.filter((b) => b.url))
    .filter((r: Any[]) => r.length);
  return rows;
}

async function validation(cq: Any) {
  const msg = cq.message;
  if (!msg || cq.from?.id !== ADMIN || msg.chat?.id !== ADMIN) {
    await repondre(cq, "Action réservée.");
    return;
  }
  const liens = boutonsLiens(msg.reply_markup);
  if (cq.data === "fait") {
    await repondre(cq, "C'est déjà traité.");
    return;
  }
  if (cq.data === "non" || String(cq.data).startsWith("non:")) {
    // Message Pro pas envoye : ses textes prepares (toutes les langues) sont jetes.
    const cleNon = String(cq.data).slice(4);
    if (C.cleObligatoireValide(cleNon)) await db.from("telegram_settings").delete().eq("key", `pro_textes:${cleNon}`);
    await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: msg.message_id,
      reply_markup: { inline_keyboard: [...liens, [{ text: cleNon ? "Pas envoyé" : "Pas publié", callback_data: "fait" }]] } });
    await repondre(cq, cleNon ? "Pas envoyé." : "Pas publié.");
    return;
  }
  // Format : genre[:message_a_qui_repondre[:cle]] ; la cle est celle d'un message OBLIGATOIRE
  // (debrief, bilan, duel) qui a pu etre repropose en plusieurs copies.
  const [genre, cibleReponse, cleObligatoire] = String(cq.data).split(":");
  if (!["pub", "pubpro", "pubg"].includes(genre) || (cleObligatoire !== undefined && !C.cleObligatoireValide(cleObligatoire))) {
    await repondre(cq);
    return;
  }
  // « pub » : messages quotidiens du canal gratuit (scripts/telegram). « pubg » : duel (canal gratuit),
  // jamais publie en rodage. « pubpro » : message Pro, envoye EN PRIVE a chaque abonne (plus de canal Pro).
  if (genre === "pubpro") return envoyerProClic(cq, cleObligatoire, liens);
  const cible: string = CANAL, nomCible = "le canal";
  if (genre === "pubg") {
    const m = await modeCanalPro();
    if (!m.ouvert) {
      await repondre(cq, "Les envois Pro ne sont pas encore ouverts (rodage) : rien n'est publié.", true);
      return;
    }
  }
  const reponse = cibleReponse && /^\d+$/.test(cibleReponse) ? { reply_parameters: { message_id: Number(cibleReponse), allow_sending_without_reply: true } } : {};
  // Un double clic ne publie qu'une fois : la cle est posee AVANT l'envoi. Message obligatoire :
  // cle « publie:k:<cle> », la meme pour toutes ses copies (le robot planifie la lit pour arreter
  // de le reproposer).
  const garde = cleObligatoire ? `publie:k:${cleObligatoire}` : `publie:${msg.message_id}`;
  const { error } = await db.from("telegram_settings").insert({ key: garde, value: new Date().toISOString() });
  if (error) {
    await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: msg.message_id,
      reply_markup: { inline_keyboard: [...liens, [{ text: "Déjà publié", callback_data: "fait" }]] } }).catch(() => null);
    await repondre(cq, "C'est déjà publié.");
    return;
  }
  try {
    await tg("copyMessage", { chat_id: cible, from_chat_id: ADMIN, message_id: msg.message_id, ...reponse,
      ...(liens.length ? { reply_markup: { inline_keyboard: liens } } : {}) });
  } catch (e) {
    await db.from("telegram_settings").delete().eq("key", garde);
    await repondre(cq, "Pas publié : le robot n'est pas administrateur du canal gratuit, ou le canal est introuvable.", true);
    console.error("[telegram-bot] publication", (e as Error).message);
    return;
  }
  await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: msg.message_id,
    reply_markup: { inline_keyboard: [...liens, [{ text: `Publié sur ${nomCible} à ${heureParis()}`, callback_data: "fait" }]] } });
  await repondre(cq, `Publié sur ${nomCible}.`);
}

/**
 * « Envoyer aux abonnés Pro » : un message Pro (debrief, bilan, Loto Foot, programme reporte) part EN
 * PRIVE a chaque abonne Pro relie au robot, dans sa langue (memes chiffres). La cle « publie:k:<cle> »
 * est posee AVANT (double clic = un seul envoi) ; les textes prepares par le robot planifie
 * (« pro_textes:<cle> ») deviennent la diffusion (« diffusion:<cle> ») ; le robot planifie rattrape a
 * chaque tour ce qui n'a pas pu partir (cle d'envoi par abonne : jamais deux fois).
 */
async function envoyerProClic(cq: Any, cle: string | undefined, liens: Any[]) {
  const msg = cq.message;
  if (!cle || !C.cleObligatoireValide(cle)) { await repondre(cq, "Ce message date d'avant les envois en privé : rien n'est envoyé.", true); return; }
  if (!(await modeCanalPro()).ouvert) { await repondre(cq, "Les envois Pro ne sont pas encore ouverts (rodage) : rien n'est envoyé.", true); return; }
  const garde = `publie:k:${cle}`;
  const { error } = await db.from("telegram_settings").insert({ key: garde, value: new Date().toISOString() });
  if (error) {
    await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: msg.message_id,
      reply_markup: { inline_keyboard: [...liens, [{ text: "Déjà envoyé", callback_data: "fait" }]] } }).catch(() => null);
    await repondre(cq, "C'est déjà envoyé.");
    return;
  }
  if (!(await deplacerTextes(cle)) && !(await reglage(`diffusion:${cle}`))) {
    await db.from("telegram_settings").delete().eq("key", garde);
    await repondre(cq, "Ce message n'est plus d'actualité (ou ses textes sont introuvables) : rien n'est envoyé.", true);
    return;
  }
  await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: msg.message_id,
    reply_markup: { inline_keyboard: [...liens, [{ text: `Envoyé aux abonnés Pro à ${heureParis()}`, callback_data: "fait" }]] } }).catch(() => null);
  await repondre(cq, "Envoi en privé aux abonnés Pro lancé.");
  const travail = diffuserCle(cle)
    .then((b) => (b ? html(ADMIN, `<i>${C.esc(cle)} : ${D.resumeDiffusion(b)}.</i>`) : null))
    .catch((e) => console.error("[telegram-bot] envoi prive", cle, (e as Error).message));
  // Reponse rapide a Telegram : l'envoi continue en arriere-plan quand la plateforme le permet.
  const er = (globalThis as Any).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(travail); else await travail;
}
/** Textes prepares -> diffusion. La ligne est SUPPRIMEE d'abord : seul celui qui la supprime l'ecrit. */
async function deplacerTextes(cle: string): Promise<boolean> {
  const { data } = await db.from("telegram_settings").delete().eq("key", `pro_textes:${cle}`).select();
  const v = data?.[0] ? D.versDiffusion(data[0].value, new Date()) : null;
  if (v) await enregistrer(`diffusion:${cle}`, v);
  return !!v;
}
/** Fonctions du moteur d'envoi prive (rythme : D.PAUSE_ENVOI_MS entre deux messages, reprise des 429). */
async function depsDiffusion() {
  const paysDefaut = C.paysParDefaut(await reglage("pays_sans_formulaire"));
  return {
    abonnes: async () => {
      // Abonnement actif ou en essai VERIFIE AU MOMENT DE L'ENVOI (users.plan relu).
      const { data: lies } = await db.from("telegram_abonnes").select("*").not("chat_id", "is", null).eq("bloque", false);
      if (!lies?.length) return [];
      const ids = lies.map((l: Any) => l.user_id);
      const [{ data: users }, { data: form, error: erreurForm }, { data: langues }] = await Promise.all([
        db.from("users").select("id, plan, role").in("id", ids),
        db.from("pro_preferences").select("*").in("user_id", ids),
        db.from("user_preferences").select("user_id, language").in("user_id", ids),
      ]);
      return D.destinataires({ lies, users: users || [], form: form || [], langues: langues || [], paysDefaut, formLu: !erreurForm });
    },
    dejaFaits: async (cle: string) => {
      const { data } = await db.from("pro_envois").select("cle").like("cle", `${D.cleEnvoi(cle, "")}%`);
      return D.servisDepuisCles(cle, (data || []).map((r: Any) => r.cle));
    },
    poser: async (k: string, type: string) => {
      const { data, error } = await db.from("pro_envois").insert({ cle: k, type }).select("cle");
      return !error && !!data?.length;
    },
    rendre: async (k: string) => { await db.from("pro_envois").delete().eq("cle", k); },
    // Journal des envois (colonnes de la migration 0045) : sans elle, l'envoi marche quand meme.
    noter: async (k: string, x: Any) => { await db.from("pro_envois").update(x).eq("cle", k); },
    bloquer: async (userId: string) => { await db.from("telegram_abonnes").update({ bloque: true }).eq("user_id", userId); },
    notes: async (userId: string) => (await notesDuJour(userId)).length,
    envoyer: (chat: number | string, h: string, { silencieux }: Any = {}) => html(chat, h, silencieux ? { disable_notification: true } : {}),
    maintenant: () => new Date(), log: (t: string) => console.error("[telegram-bot]", t), admin: ADMIN, pause: D.PAUSE_ENVOI_MS,
  };
}
/** Envoie (ou rattrape) la diffusion « diffusion:<cle> ». */
async function diffuserCle(cle: string) {
  const v = await reglage(`diffusion:${cle}`);
  let x: Any = null;
  try { x = v ? JSON.parse(v) : null; } catch { return null; }
  if (!(x?.textes || x?.programme || x?.infos) || (x.expire && Date.parse(x.expire) <= Date.now())) return null;
  // programme / infos (03/10/2026) : le texte de chaque abonne est fait a l'envoi (memes paris, ses cotes, ses competitions).
  return D.diffuser(await depsDiffusion(), { cle, type: x.type, textes: x.textes, garde: !!x.garde, pays: x.pays || null, jour: x.jour || null,
    programme: x.programme || null, infos: x.infos || null });
}

// ---------- 1b. Programme du jour : Valider / Modifier / Annuler ----------
async function programmeClic(cq: Any) {
  const msg = cq.message;
  if (!msg || cq.from?.id !== ADMIN || msg.chat?.id !== ADMIN) { await repondre(cq, "Action réservée."); return; }
  const [, action, jour, rang] = String(cq.data).split(":");
  const { data: prog } = await db.from("pro_programmes").select("*").eq("jour", jour).maybeSingle();
  if (!prog) { await repondre(cq, "Programme introuvable."); return; }
  if (!["prepare", "attente"].includes(prog.statut)) {
    await repondre(cq, prog.statut === "valide" || prog.statut === "publie" ? "Déjà validé." : "Ce programme n'est plus modifiable.");
    return;
  }
  const hm = C.paris(new Date()).hm, auj = C.paris(new Date()).date;
  if (jour !== auj || hm >= "12:00") {
    await repondre(cq, "Trop tard : après 12 h, rien ne part ce jour-là.", true);
    return;
  }
  const lireParis = async () => (await db.from("pro_paris").select("*").eq("jour", jour).order("rang")).data || [];
  if (action === "ok") {
    const { data: maj } = await db.from("pro_programmes").update({ statut: "valide", valide_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("jour", jour).in("statut", ["prepare", "attente"]).select();
    if (!maj?.length) { await repondre(cq, "Déjà traité."); return; }
    const quand = hm >= "09:30" ? "publication dans les 15 minutes" : "publication à 9 h 30";
    await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: msg.message_id,
      reply_markup: { inline_keyboard: [[{ text: `Validé à ${heureParis()} · ${quand}`, callback_data: "fait" }]] } });
    await repondre(cq, `Validé : ${quand}.`);
    // Surveillant : le robot planifie (GitHub) doit avoir tourne recemment, sinon rien ne partira.
    const tour = await reglage("dernier_tour_canal_pro");
    if (!tour || Date.now() - Date.parse(tour) > 35 * 60000)
      await html(ADMIN, `<b>Attention</b> : le robot planifié n'a pas tourné depuis ${tour ? C.heureTxt(tour) : "longtemps"}. Ton programme est validé, mais il ne partira qu'au prochain tour du robot. S'il ne tourne plus (GitHub en panne), rien ne partira.`);
    return;
  }
  if (action === "no") {
    await db.from("pro_programmes").update({ statut: "annule", annule_at: new Date().toISOString() }).eq("jour", jour);
    await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: msg.message_id,
      reply_markup: { inline_keyboard: [[{ text: "Annulé : rien ne part aujourd'hui", callback_data: "fait" }]] } });
    await repondre(cq, "Annulé. Rien ne part aujourd'hui.");
    return;
  }
  if (action === "x") {
    const p = (await lireParis()).find((x: Any) => String(x.rang) === rang);
    if (p && !p.publie_at) await db.from("pro_paris").update({ retire: !p.retire }).eq("id", p.id);
  }
  const paris = await lireParis();
  const mode = action === "ret" ? "normal" : "modifier";
  await tg("editMessageText", { chat_id: ADMIN, message_id: msg.message_id, parse_mode: "HTML", link_preview_options: { is_disabled: true },
    text: C.messageValidation({ ...prog, paris }), reply_markup: C.clavierValidation({ jour, paris }, mode) }).catch(() => null);
  await repondre(cq, action === "x" ? "C'est noté." : "");
}

// ---------- 1c. Duel « la foule contre l'IA » ----------
async function duelPublier(cq: Any) {
  const msg = cq.message;
  if (!msg || cq.from?.id !== ADMIN || msg.chat?.id !== ADMIN) { await repondre(cq, "Action réservée."); return; }
  const [, action, jour] = String(cq.data).split(":");
  const { data: duel } = await db.from("duel_manches").select("*").eq("jour", jour).maybeSingle();
  if (!duel || duel.statut !== "propose") { await repondre(cq, "Déjà traité."); return; }
  if (action === "no") {
    await db.from("duel_manches").update({ statut: "refuse" }).eq("jour", jour);
    await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: msg.message_id, reply_markup: { inline_keyboard: [[{ text: "Pas de duel aujourd'hui", callback_data: "fait" }]] } });
    await repondre(cq, "Pas de duel aujourd'hui.");
    return;
  }
  if (Date.parse(duel.coup_envoi) <= Date.now()) { await repondre(cq, "Le match a commencé : trop tard.", true); return; }
  const m = await modeCanalPro();
  const chat = m.ouvert ? CANAL : ADMIN;
  const texte = (m.ouvert ? "" : "<b>[RODAGE · canal gratuit]</b>\n") + C.messageDuelOuverture(duel);
  const envoye = await html(chat, texte, { reply_markup: C.clavierDuel(duel) });
  await db.from("duel_manches").update({ statut: "ouvert", message_id: envoye.message_id, chat_id: String(chat) }).eq("jour", jour);
  await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: msg.message_id, reply_markup: { inline_keyboard: [[{ text: `Duel publié à ${heureParis()}`, callback_data: "fait" }]] } });
  await repondre(cq, "Duel publié.");
}
async function duelVote(cq: Any) {
  const [, jour, choix] = String(cq.data).split(":");
  if (!C.CHOIX_DUEL.includes(choix)) { await repondre(cq); return; }
  const { data: duel } = await db.from("duel_manches").select("*").eq("jour", jour).maybeSingle();
  if (!duel || duel.statut !== "ouvert" || Date.parse(duel.coup_envoi) <= Date.now()) {
    await repondre(cq, "Le vote est fermé : le match a commencé.");
    return;
  }
  await db.from("duel_votes").upsert({ jour, telegram_user_id: cq.from.id, prenom: cq.from.first_name || null, username: cq.from.username || null,
    choix, vote_at: new Date().toISOString() });
  await repondre(cq, `Vote enregistré : ${C.libelleChoix(choix, duel.dom, duel.ext)}. Tu peux changer jusqu'au coup d'envoi.`);
}

// ---------- 1d. Robot personnel ----------
async function abonneParChat(chatId: number) {
  const { data } = await db.from("telegram_abonnes").select("*").eq("chat_id", chatId).maybeSingle();
  if (!data) return null;
  const { data: u } = await db.from("users").select("plan, role").eq("id", data.user_id).maybeSingle();
  const actif = D.estAbonneActif(u); // actif ou en essai, relu a chaque message
  return { ...data, actif };
}
/** Langue de l'abonne : user_preferences.language, sinon langue de son Telegram, sinon francais. */
async function langueDe(ab: Any, from?: Any): Promise<string> {
  const { data } = await db.from("user_preferences").select("language").eq("user_id", ab.user_id).maybeSingle();
  return LG.choisirLangue(data?.language, ab.langue_telegram || from?.language_code);
}
/** Ligne pro_preferences de l'abonne : { form (null si pas de ligne), lisible (false si la table ne repond pas) }. */
async function ligneReglages(ab: Any) {
  const { data, error } = await db.from("pro_preferences").select("*").eq("user_id", ab.user_id).maybeSingle();
  return { form: error ? null : data, lisible: !error }; // table absente tant que le formulaire n'est pas en ligne : valeurs par defaut
}
async function prefsDe(ab: Any, ligne?: Any) {
  const { form } = ligne || await ligneReglages(ab);
  // Une seule source : pro_preferences (telegram_abonnes.reglages n'est plus lu).
  // Sans formulaire : francais par defaut, ou pays inconnu si Clement l'a choisi (reglage pays_sans_formulaire = 'aucun').
  return C.preferencesEffectives(form, { paysDefaut: C.paysParDefaut(await reglage("pays_sans_formulaire")) });
}
/**
 * REGLAGES OBLIGATOIRES (03/10/2026, decision de Clement) : langue, pays, bookmakers. Fiche complete =
 * ligne pro_preferences (site ou robot). Sinon : l'etape en attente (« lg », « py », « bk ») et le choix
 * en cours (telegram_settings « oblig:<user_id> »). Table illisible : on ne bloque personne (null).
 */
async function obligatoire(ab: Any, ligne?: Any) {
  const l = ligne || await ligneReglages(ab);
  const marque = A.lireMarque(await reglage(`oblig:${ab.user_id}`));
  return { ligne: l, marque, etape: l.lisible ? A.etapeObligatoire(l.form, marque) : null };
}
/** Reglages vus pendant les questions (pays et bookmakers en cours tant que la ligne n'existe pas). */
async function prefsQuestions(ab: Any, o: Any) {
  return A.prefsEnCours(await prefsDe(ab, o.ligne), o.ligne.form, o.marque);
}
/** Repose la question obligatoire en attente (nouveau message), precedee de « D'abord, 1 minute… ». */
async function reposerObligatoire(chat: number, ab: Any, lang: string, o: Any) {
  const q = A.question(o.etape, await prefsQuestions(ab, o), lang, { note: A.texteSimple(lang, "dabord") });
  await html(chat, q.text, { reply_markup: q.reply_markup });
}
/** Clic d'un abonne (tickets, reglages, langue…) alors que ses reglages obligatoires manquent : ramene a la question. */
async function rameneAuxReglages(cq: Any): Promise<boolean> {
  if (!clicPrive(cq)) return false;
  const ab = await abonneParChat(cq.from.id);
  if (!ab || !ab.actif) return false;
  const o = await obligatoire(ab);
  if (!o.etape) return false;
  const lang = await langueDe(ab, cq.from);
  await repondre(cq);
  await reposerObligatoire(cq.from.id, ab, lang, o);
  return true;
}

/** Paris envoyes avec les envois Pro OUVERTS (preuve d'envoi au registre), encore a venir (jamais ceux du rodage). */
async function parisOuverts() {
  const { data } = await db.from("pro_paris").select("*").eq("mode", "ouvert").not("canal_message_id", "is", null)
    .gt("coup_envoi", new Date().toISOString()).order("coup_envoi");
  return data || [];
}
/** Clic d'un abonne : seulement dans SA conversation privee avec le robot. */
function clicPrive(cq: Any) {
  return cq.message?.chat?.type === "private" && cq.message.chat.id === cq.from?.id;
}
async function notesDuJour(userId: string) {
  const { data } = await db.from("pro_tickets").select("*").eq("user_id", userId).eq("jour", C.paris(new Date()).date).eq("statut", "note");
  return data || [];
}

async function lierCompte(m: Any, code: string) {
  const { data: ab } = await db.from("telegram_abonnes").select("*").eq("code_liaison", code).maybeSingle();
  if (!ab || !ab.code_cree_at || Date.now() - Date.parse(ab.code_cree_at) > CODE_DUREE_MS) {
    await html(m.chat.id, LG.textes(LG.choisirLangue(null, m.from?.language_code)).robot.expire);
    return;
  }
  await db.from("telegram_abonnes").update({ chat_id: null }).eq("chat_id", m.chat.id).neq("user_id", ab.user_id);
  await db.from("telegram_abonnes").update({ chat_id: m.chat.id, prenom: m.from?.first_name || null, lie_at: new Date().toISOString(),
    code_liaison: null, bloque: false, updated_at: new Date().toISOString() }).eq("user_id", ab.user_id);
  // Langue de son Telegram (repli quand le compte n'a pas de langue) : colonne de la migration 0043,
  // ecrite a part (sans la migration, la liaison marche quand meme).
  const langueTg = LG.normaliserLangue(m.from?.language_code);
  if (langueTg) await db.from("telegram_abonnes").update({ langue_telegram: langueTg }).eq("user_id", ab.user_id).then(() => null, () => null);
  const lang = await langueDe(ab, m.from);
  const prenom = m.from?.first_name || "";
  const o = await obligatoire(ab);
  // Deja passe par l'accueil (il relie de nouveau son compte) : pas de nouveau questionnaire, SAUF les
  // reglages obligatoires s'ils manquent encore (la question en attente).
  // Repere dans telegram_settings (« accueil:<user_id> ») : telegram_abonnes.reglages n'est plus jamais lu ni ecrit.
  if (await reglage(`accueil:${ab.user_id}`)) {
    await html(m.chat.id, A.retour(lang, prenom));
    if (o.etape) await reposerObligatoire(m.chat.id, ab, lang, o);
    return;
  }
  await enregistrer(`accueil:${ab.user_id}`, `debut ${new Date().toISOString()}`);
  const ouvert = (await modeCanalPro()).ouvert;
  // Fiche deja remplie sur le site (ligne pro_preferences) : pas de doublon. Bienvenue,
  // puis le recapitulatif de SES reglages (et /reglages pour changer), sans reposer les questions.
  if (o.ligne.form) {
    await html(m.chat.id, A.bienvenue(lang, { prenom, ouvert, questions: false }));
    await html(m.chat.id, A.recap(await prefsDe(ab, o.ligne), lang));
    return;
  }
  // Bienvenue dans SA langue, puis les questions une par une (boutons seulement) : langue, pays,
  // bookmakers OBLIGATOIRES (sans « Plus tard »), puis competitions, alertes, heure (facultatives).
  await html(m.chat.id, A.bienvenue(lang, { prenom, ouvert }));
  const q = A.question(o.etape || "lg", await prefsQuestions(ab, o), lang);
  await html(m.chat.id, q.text, { reply_markup: q.reply_markup });
}

/**
 * Parcours d'accueil : clic « ac:<etape>:<valeur> » (ou « ac:x » = plus tard). Chaque reponse est
 * ecrite dans les memes tables que le questionnaire du site : user_preferences.language et
 * pro_preferences. Le message de la question est remplace par la question suivante, puis par le
 * recapitulatif. Une reponse qui ne s'enregistre pas (ex. colonne competitions sans la migration
 * 0045) n'arrete pas le parcours : on passe a la suite et on le dit.
 */
async function accueilClic(cq: Any) {
  if (!clicPrive(cq)) { await repondre(cq); return; }
  const ab = await abonneParChat(cq.from.id);
  if (!ab || !ab.actif) { await repondre(cq, LG.textes(LG.choisirLangue(null, cq.from?.language_code)).robot.nonRelie); return; }
  let lang = await langueDe(ab, cq.from);
  const [, etape, valeur] = String(cq.data).split(":");
  const editer = (text: string, reply_markup: Any = { inline_keyboard: [] }) => tg("editMessageText", { chat_id: cq.from.id, message_id: cq.message.message_id,
    parse_mode: "HTML", link_preview_options: { is_disabled: true }, text, reply_markup }).catch(() => null);
  const finir = async (texte: string) => {
    await enregistrer(`accueil:${ab.user_id}`, `fin ${new Date().toISOString()}`);
    await editer(texte);
  };
  const o = await obligatoire(ab);
  // Reglages obligatoires pas finis : pas de « Plus tard », pas de saut d'etape (un ancien bouton
  // ramene a la question en attente).
  if (o.etape && (!A.OBLIGATOIRES.includes(etape) || A.OBLIGATOIRES.indexOf(etape) > A.OBLIGATOIRES.indexOf(o.etape))) {
    const q = A.question(o.etape, await prefsQuestions(ab, o), lang);
    await editer(q.text, q.reply_markup);
    await repondre(cq);
    return;
  }
  if (etape === "x") { await finir(A.texteSimple(lang, "plusTardTxt")); await repondre(cq); return; }
  // « Refaire mes choix » (bouton de /reglages) : les questions reprennent a la premiere.
  if (etape === "go") { const q = A.question("lg", await prefsDe(ab), lang); await editer(q.text, q.reply_markup); await repondre(cq); return; }
  if (!A.ETAPES.includes(etape)) { await repondre(cq); return; }
  const ligne = o.ligne;
  const prefs = await prefsQuestions(ab, o);
  const r: Any = A.appliquer(etape, valeur, prefs);
  let note = "";
  // Pas encore de ligne (questions obligatoires) : le choix en cours est garde a part ; la ligne
  // pro_preferences n'est creee qu'avec le pays ET les bookmakers (ou un pays pas encore ouvert).
  const enCours = o.etape !== null;
  const marque: Any = { ...o.marque };
  const garderMarque = () => enregistrer(`oblig:${ab.user_id}`, JSON.stringify(marque));
  const creerLigne = async (x: Any) => {
    const { error } = await db.from("pro_preferences").upsert({ user_id: ab.user_id, ...x }, { onConflict: "user_id" });
    if (error) { note = A.texteSimple(lang, "reessaie"); r.reste = true; }
  };
  if (r.langue) {
    const { error } = await db.from("user_preferences").upsert({ user_id: ab.user_id, language: r.langue, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) note = A.texteSimple(lang, "pasEnregistre"); else lang = r.langue;
    if (enCours) { marque.lg = true; await garderMarque(); }
  }
  if (enCours && etape === "py" && r.patch) {
    if (A.paysOuvertCode(r.patch.pays)) { Object.assign(marque, { lg: true, pays: r.patch.pays, bookmakers: [] }); await garderMarque(); }
    else await creerLigne({ pays: r.patch.pays, bookmakers: [] });
  } else if (enCours && etape === "bk") {
    if (r.patch) { marque.bookmakers = r.patch.bookmakers; await garderMarque(); }
    else if (valeur === "ok") await creerLigne({ pays: marque.pays, bookmakers: marque.bookmakers || [] }); // « Valider »
  } else if (r.patch) {
    // Pas encore de ligne : creee avec le pays deja utilise (jamais un autre pays en silence).
    const base = ligne.form || r.patch.pays ? {} : { pays: prefs.pays === C.PAYS_INCONNU ? "autre" : String(prefs.pays).toLowerCase() };
    const { error } = ligne.lisible ? await db.from("pro_preferences").upsert({ user_id: ab.user_id, ...base, ...r.patch }, { onConflict: "user_id" }) : { error: true };
    if (error) { note = A.texteSimple(lang, "pasEnregistre"); r.reste = false; }
  }
  if (!note && r.note) note = A.texteSimple(lang, r.note);
  const ligne2 = await ligneReglages(ab);
  const p2 = A.prefsEnCours(await prefsDe(ab, ligne2), ligne2.form, marque);
  const suite = r.reste ? etape : A.suivante(etape, p2);
  if (!suite) { await finir(A.recap(p2, lang)); await repondre(cq, LG.textes(lang).robot.cestNote); return; }
  const q = A.question(suite, p2, lang, { note });
  await editer(q.text, q.reply_markup);
  await repondre(cq);
}

/** /langue : choisir sa langue ; le clic ecrit user_preferences.language (une seule source : la meme que le site). */
async function langueClic(cq: Any) {
  if (!clicPrive(cq)) { await repondre(cq); return; }
  const ab = await abonneParChat(cq.from.id);
  const lang0 = ab ? await langueDe(ab, cq.from) : LG.choisirLangue(null, cq.from?.language_code);
  if (!ab || !ab.actif) { await repondre(cq, LG.textes(lang0).robot.nonRelie); return; }
  const choix = String(cq.data).slice(3);
  if (choix === "menu") {
    await html(cq.from.id, LG.textes(lang0).robot.choisirLangue, { reply_markup: LG.clavierLangues(lang0) });
    await repondre(cq);
    return;
  }
  const lang = LG.normaliserLangue(choix);
  if (!lang) { await repondre(cq); return; }
  const { error } = await db.from("user_preferences").upsert({ user_id: ab.user_id, language: lang, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) { await repondre(cq, LG.textes(lang0).robot.langueErreur, true); return; }
  await tg("editMessageReplyMarkup", { chat_id: cq.from.id, message_id: cq.message.message_id, reply_markup: LG.clavierLangues(lang) }).catch(() => null);
  await html(cq.from.id, LG.textes(lang).robot.langueOk(LG.NOMS_LANGUES[lang]));
  await repondre(cq, LG.textes(lang).robot.cestNote);
}

async function robotPerso(m: Any, ab: Any) {
  const chat = m.chat.id;
  const texte = String(m.text || m.caption || "").trim();
  const lang = await langueDe(ab, m.from);
  const R = LG.textes(lang).robot;
  const cmd = LG.commande(texte);
  // Texte libre, photo, vocal… (tout sauf une commande) : reponse automatique, rien n'est transfere.
  if (!texte.startsWith("/") || !m.text) { await reponseAuto(chat, lang); return; }
  if (!ab.actif) {
    // Un ex-abonne : robot en pause ; pour une question, le robot Contact (ou l'e-mail).
    await tg("sendMessage", { chat_id: chat, text: RB.inactifPro(lang, await nomContact()), link_preview_options: { is_disabled: true } });
    return;
  }
  // Reglages obligatoires pas faits (ni sur le site ni ici) : toute commande ramene d'abord a la question en attente.
  const o = await obligatoire(ab);
  if (o.etape) { await reposerObligatoire(chat, ab, lang, o); return; }
  const prefs = await prefsDe(ab, o.ligne);
  // /canal (ancienne commande) : plus de canal a rejoindre, tout arrive ici en prive.
  if (/^\/canal\b/.test(texte)) { await html(chat, R.plusDeCanal); return; }
  if (cmd === "aide") { await aide(chat, lang); return; }
  if (cmd === "langue") { await html(chat, R.choisirLangue, { reply_markup: LG.clavierLangues(lang) }); return; }
  if (cmd === "reglages") { await html(chat, C.messageReglages(prefs, lang), { reply_markup: C.clavierReglages(prefs, "principal", lang) }); return; }
  if (cmd === "programme") {
    const jour = C.paris(new Date()).date;
    const notes = (await notesDuJour(ab.user_id)).length;
    if (C.gardeFouAtteint(prefs, notes)) { await html(chat, C.messageGardeFou(notes, prefs.limite_paris_jour, lang)); return; }
    const paris = await parisOuverts();
    if (!paris.length) {
      await html(chat, (await modeCanalPro()).ouvert ? R.programmeVide : R.programmeFerme);
      return;
    }
    // Les MEMES paris que tous (03/10/2026) ; pour lui : la meilleure cote chez SES bookmakers, de SON pays.
    let vus = paris;
    if (C.PAYS_COTES_A_PART.includes(prefs.pays)) {
      const { data: releves } = await db.from("pro_cotes_releves").select("*").in("pari_id", paris.map((p: Any) => p.id));
      vus = paris.map((p: Any) => C.pariDuPays(p, releves || [], prefs.pays, { jusqua: p.cote_vue_at }));
    }
    await html(chat, C.messageProgrammeAbonne(jour, vus, prefs, { prenom: ab.prenom || "", lang }));
    return;
  }
  if (/^\/lotofoot\b/.test(texte)) {
    // Notre grille Loto Foot a tenter (la meme que celle envoyee aux abonnes Pro de France), a la demande.
    // Jeu de la FDJ (France) : la grille reste en francais.
    const { data: grilles } = await db.from("loto_foot_grilles").select("*").gt("premier_match_at", new Date().toISOString()).order("premier_match_at");
    const g = (grilles || []).find((x: Any) => C.messageGrille(x));
    await html(chat, g ? C.messageGrille(g) : R.lotoVide);
    return;
  }
  // /equipe (ancienne commande « ecrire a l'equipe ») : les questions vont au robot Contact.
  if (/^\/equipe\b/.test(texte)) { await reponseAuto(chat, lang); return; }
  // Autre commande (dont /journal : plus de tickets ecrits au robot) : l'aide.
  await aide(chat, lang);
}
/** Aide du robot Pro, avec « Une question ? Écris à IASHARK Contact ». */
async function aide(chat: number, lang: string) {
  await html(chat, `${C.esc(C.aideRobot(lang))}\n• ${C.esc(RB.ligneQuestion(lang, await nomContact()))}`);
}

async function ticketClic(cq: Any) {
  if (!clicPrive(cq)) { await repondre(cq); return; }
  const ab = await abonneParChat(cq.from.id);
  const [, action, id] = String(cq.data).split(":");
  const lang = ab ? await langueDe(ab, cq.from) : LG.choisirLangue(null, cq.from?.language_code);
  const R = LG.textes(lang).robot;
  if (!ab || !ab.actif) { await repondre(cq, R.nonRelie); return; }
  const { data: t } = await db.from("pro_tickets").select("*").eq("id", id).eq("user_id", ab.user_id).maybeSingle();
  if (!t || t.statut !== "a_confirmer") { await repondre(cq, R.dejaTraite); return; }
  if (action === "no") {
    await db.from("pro_tickets").update({ statut: "annule" }).eq("id", id);
    await tg("editMessageReplyMarkup", { chat_id: cq.from.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    // Ancien ticket encore affiche (avant le 03/10, plus de tickets ecrits au robot) : rien n'est
    // transfere ; si c'etait une question, la reponse automatique indique le robot Contact.
    await reponseAuto(cq.from.id, lang, `${R.pasNoteCourt} `);
    await repondre(cq, R.pasNoteCourt);
    return;
  }
  let decision = null;
  const { data: p } = t.pari_id ? await db.from("pro_paris").select("*").eq("id", t.pari_id).maybeSingle() : { data: null };
  // Un ticket relie a un pari ne se note plus apres le coup d'envoi.
  if (p && Date.parse(p.coup_envoi) <= Date.now()) {
    await db.from("pro_tickets").update({ statut: "annule" }).eq("id", id);
    await tg("editMessageReplyMarkup", { chat_id: cq.from.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    await repondre(cq, R.tropTard, true);
    return;
  }
  if (p && t.mise) {
    const { data: d } = await db.from("betting_decisions").insert({ user_id: ab.user_id, fixture_id: p.fixture_id, match_label: `${p.dom} – ${p.ext}`.slice(0, 160),
      market: String(t.selection || p.selection).slice(0, 120), odds: t.cote, estimated_probability: Math.round(p.proba * 1000) / 10, stake: t.mise, kickoff_at: p.coup_envoi }).select("id").single();
    decision = d?.id || null;
  }
  await db.from("pro_tickets").update({ statut: "note", decision_id: decision }).eq("id", id);
  await tg("editMessageReplyMarkup", { chat_id: cq.from.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
  const prefs = await prefsDe(ab);
  const n = (await notesDuJour(ab.user_id)).length;
  await html(cq.from.id, `${R.note}${C.messageGardeFou(n, prefs.limite_paris_jour, lang)}`);
  await repondre(cq, R.noteCourt);
}

async function tabacClic(cq: Any) {
  // Faille corrigee : abonne actif, conversation privee, reponse a lui seul, pari ouvert et a venir.
  if (!clicPrive(cq)) { await repondre(cq); return; }
  const ab = await abonneParChat(cq.from.id);
  if (!ab?.actif) { await repondre(cq, LG.textes(LG.choisirLangue(null, cq.from?.language_code)).robot.reserve); return; }
  const lang = await langueDe(ab, cq.from);
  const [, numero, cote] = String(cq.data).split(":");
  const p = (await parisOuverts()).find((x: Any) => String(x.numero) === numero && x.famille === "simple");
  if (p && Number(cote) > 1) await html(cq.from.id, C.verdictTabac(p, Number(cote), lang));
  await repondre(cq);
}

async function reglageClic(cq: Any) {
  if (!clicPrive(cq)) { await repondre(cq); return; }
  const ab = await abonneParChat(cq.from.id);
  // Un ex-abonne (ancien clavier /reglages encore affiche) ne change plus rien.
  if (!ab || !ab.actif) { await repondre(cq, LG.textes(LG.choisirLangue(null, cq.from?.language_code)).robot.nonRelie); return; }
  const lang = await langueDe(ab, cq.from);
  const R = LG.textes(lang).robot;
  const ligne = await ligneReglages(ab);
  const prefs = await prefsDe(ab, ligne);
  let page = "principal";
  if (cq.data.startsWith("rg:p:")) page = cq.data.slice(5);
  else {
    // Une seule source : le clic ecrit dans pro_preferences, la meme ligne que le formulaire du site
    // (la derniere valeur ecrite compte, ici comme sur le site). Jamais telegram_abonnes.reglages.
    if (!ligne.lisible) { await repondre(cq, R.reglagesIndispo, true); return; }
    if (!ligne.form && prefs.pays === C.PAYS_INCONNU) { await repondre(cq, R.paysDabord, true); return; }
    const patch = C.appliquerReglage(prefs, cq.data);
    if (Object.keys(patch).length) {
      // Pas encore de ligne : on la cree avec le pays deja utilise (jamais un autre pays en silence).
      const { error } = await db.from("pro_preferences").upsert({ user_id: ab.user_id, ...(ligne.form ? {} : { pays: prefs.pays.toLowerCase() }), ...patch }, { onConflict: "user_id" });
      if (error) { await repondre(cq, R.pasEnregistre, true); return; }
    }
    if (cq.data.startsWith("rg:b:")) page = "bk";
  }
  const p2 = await prefsDe(ab);
  await tg("editMessageText", { chat_id: cq.from.id, message_id: cq.message.message_id, parse_mode: "HTML", text: C.messageReglages(p2, lang),
    reply_markup: C.clavierReglages(p2, page, lang) }).catch(() => null);
  await repondre(cq, R.cestNote);
}

// ---------- 1e. Robot IASHARK Contact (questions) ----------
const AIDE_ADMIN = "Robot IASHARK Pro.\n\n• Chaque message du canal gratuit vous arrive ici avec « Publier sur le canal ».\n• Le programme Pro arrive ici à 8 h 45 : Valider, Modifier ou Annuler. Sans clic à 12 h, rien ne part. Après votre clic, il part en privé à chaque abonné Pro relié au robot, dans sa langue (plus de canal Pro : rien à créer).\n• Ce robot ne reçoit plus de questions : un abonné qui lui écrit reçoit une réponse automatique qui l'envoie vers le robot IASHARK Contact. Les questions vous arrivent dans votre conversation avec IASHARK Contact : faites « Répondre » là-bas.\n• /canalpro : voir si les envois Pro sont en rodage ou ouverts, et les ouvrir.\n• Débriefs, bilan, Loto Foot et programme reporté vous sont proposés avec « Envoyer aux abonnés Pro » ; le duel avec « Publier ». Débriefs, bilan et duel sont obligatoires : pas de bouton pour ne pas les envoyer, ils reviennent toutes les 3 h tant qu'ils ne sont pas partis.\n• /automatique : envoyer sans votre clic, type par type (éteint par défaut).\n• Un pari « envoi incertain » : transférez-moi son message depuis cette conversation (marqué REGISTRE), ou cliquez « Renvoyer », au plus tard 70 min avant le match (avant les compositions) ; après, c'est refusé.";

/** Langue d'une personne qui ecrit au robot Contact : celle de son compte s'il est relie au robot Pro, sinon de son Telegram. */
async function langueContact(m: Any): Promise<string> {
  const { data: ab } = await db.from("telegram_abonnes").select("*").eq("chat_id", m.chat.id).maybeSingle();
  return ab ? langueDe(ab, m.from) : LG.choisirLangue(null, m.from?.language_code);
}

/** Message d'une personne au robot Contact : transfere a Clement (dans SA conversation avec le robot Contact). */
async function transfererAClement(m: Any, lang = LG.choisirLangue(null, m.from?.language_code)) {
  if (!ADMIN) return;
  // Accuse de reception une fois par periode de 6 h, pas a chaque message.
  const depuis = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { count } = await db.from("telegram_contact_threads").select("admin_message_id", { count: "exact", head: true })
    .eq("user_chat_id", m.chat.id).gte("created_at", depuis);
  const nom = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") + (m.from?.username ? ` (@${m.from.username})` : "");
  const entete = await tgc("sendMessage", { chat_id: ADMIN, text: `Message de ${nom || "quelqu'un"} (faites « Répondre » pour lui répondre) :` });
  const transfere = await tgc("forwardMessage", { chat_id: ADMIN, from_chat_id: m.chat.id, message_id: m.message_id });
  // upsert : une ancienne ligne au meme numero (ecrite par l'ancien robot unique) est remplacee,
  // jamais une reponse envoyee a la mauvaise personne.
  const maintenant = new Date().toISOString();
  await db.from("telegram_contact_threads").upsert([
    { admin_message_id: transfere.message_id, user_chat_id: m.chat.id, created_at: maintenant },
    { admin_message_id: entete.message_id, user_chat_id: m.chat.id, created_at: maintenant },
  ], { onConflict: "admin_message_id" });
  if (!count) await tgc("sendMessage", { chat_id: m.chat.id, text: LG.textes(lang).robot.recu });
}

/** Mise a jour recue par le robot Contact. */
async function messageContact(m: Any) {
  if (m.chat?.type !== "private") return;
  if (m.chat.id === ADMIN) {
    // Clement fait « Repondre » sur un message transfere : sa reponse repart chez la personne, par le robot Contact.
    const cible = m.reply_to_message?.message_id;
    if (cible) {
      const { data } = await db.from("telegram_contact_threads").select("user_chat_id").eq("admin_message_id", cible).maybeSingle();
      if (data) {
        await tgc("copyMessage", { chat_id: data.user_chat_id, from_chat_id: ADMIN, message_id: m.message_id });
        await tgc("sendMessage", { chat_id: ADMIN, text: "Réponse envoyée.", reply_parameters: { message_id: m.message_id } });
        return;
      }
    }
    await tgc("sendMessage", { chat_id: ADMIN, text: RB.AIDE_ADMIN_CONTACT });
    return;
  }
  const lang = await langueContact(m);
  if (/^\/start\b/.test(String(m.text || ""))) {
    await tgc("sendMessage", { chat_id: m.chat.id, text: RB.accueilContact(lang) });
    return;
  }
  // Tout le reste (texte, photo, vocal, document…) part a Clement.
  await transfererAClement(m, lang);
}

// ---------- 1g. Automatique (eteint par defaut) ----------
async function clavierAuto() {
  const rows = [];
  for (const [type, nom] of Object.entries(C.TYPES_PUBLICS)) {
    const auto = (await reglage(`auto_${type}`)) === "oui";
    rows.push([{ text: `${auto ? "Automatique" : "Avec ton clic"} · ${nom}`, callback_data: `au:${type}` }]);
  }
  return { inline_keyboard: rows };
}
async function autoClic(cq: Any) {
  if (cq.from?.id !== ADMIN || cq.message?.chat?.id !== ADMIN) { await repondre(cq, "Action réservée."); return; }
  const type = String(cq.data).slice(3);
  if (!(type in C.TYPES_PUBLICS)) { await repondre(cq); return; }
  const auto = (await reglage(`auto_${type}`)) === "oui";
  await enregistrer(`auto_${type}`, auto ? "non" : "oui");
  await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: cq.message.message_id, reply_markup: await clavierAuto() }).catch(() => null);
  await repondre(cq, auto ? "Retour au clic « Publier »." : "Automatique : ce type part sans ton clic.");
}

// ---------- 1h. Preuve d'envoi d'un pari (envoi incertain) ----------
/**
 * Clement transfere le message d'un pari depuis le REGISTRE (sa conversation avec le robot, message
 * marque REGISTRE) : la date de Telegram prouve l'envoi. Plus de canal Pro.
 */
async function preuveTransferee(m: Any): Promise<boolean> {
  const fo = m.forward_origin;
  if (fo?.type !== "user" || !fo.sender_user?.is_bot || String(fo.sender_user.username || "") !== await nomDuRobot()) return false;
  const numero = String(m.text || "").match(/N° PRO-(\d+)/)?.[1];
  if (!numero) return false; // un autre message du robot : traite comme d'habitude
  const { data: p } = await db.from("pro_paris").select("*").eq("numero", Number(numero)).maybeSingle();
  if (!p) { await html(ADMIN, `N° PRO-${numero} introuvable.`); return true; }
  if (p.canal_message_id != null) { await html(ADMIN, `N° PRO-${numero} a déjà sa preuve d'envoi.`); return true; }
  // Apres l'heure LIMITE (70 min avant le match, avant les compositions) : REFUSE. Sinon, en
  // connaissant les compositions, le mouvement des cotes ou le resultat, on pourrait choisir quels
  // paris comptent (pertes jamais cachees).
  if (Date.now() >= C.limitePreuve(p)) {
    await html(ADMIN, `Trop tard : l'heure limite pour N° PRO-${numero} était ${C.heureTxt(C.limitePreuve(p))} (${C.PREUVE_LIMITE_MIN} min avant le match, avant les compositions). Une preuve d'envoi transférée n'est plus acceptée après (on ne choisit pas après coup les paris qui comptent). Il reste « sans preuve d'envoi, pas compté », et le débrief le dit.`);
    return true;
  }
  const envoye = Number(fo.date) * 1000;
  if (!p.publie_at || !(envoye >= Date.parse(p.publie_at) - 60000 && envoye < Date.parse(p.coup_envoi))) {
    await html(ADMIN, `Ce message n'est pas daté entre l'archivage de N° PRO-${numero} et son coup d'envoi : rien n'est enregistré.`);
    return true;
  }
  // Preuve : la copie transferee dans la conversation de Clement (sa date d'origine est celle du registre).
  const idRegistre = Number(m.message_id);
  const { data: maj } = await db.from("pro_paris").update({ canal_message_id: idRegistre, envoye_at: new Date(envoye).toISOString(), envoi_tente_at: null })
    .eq("id", p.id).is("canal_message_id", null).gt("coup_envoi", new Date(Date.now() + C.PREUVE_LIMITE_MIN * 60000).toISOString()).select("id");
  if (!maj?.length) { await html(ADMIN, `N° PRO-${numero} : rien n'est enregistré (déjà enregistré, ou l'heure limite est passée).`); return true; }
  await html(ADMIN, `Preuve d'envoi enregistrée : N° PRO-${numero}, parti au registre à ${C.heureTxt(envoye)}. Il compte dans les débriefs et le bilan ; les abonnés le reçoivent au prochain tour du robot s'ils ne l'ont pas encore.`);
  return true;
}
/** « Renvoyer » : Clement a verifie que le pari n'est PAS dans le registre (sa conversation avec le robot). */
async function renvoiClic(cq: Any) {
  if (cq.from?.id !== ADMIN || cq.message?.chat?.id !== ADMIN) { await repondre(cq, "Action réservée."); return; }
  const id = String(cq.data).slice("ep:re:".length);
  const { data: p } = await db.from("pro_paris").select("*").eq("id", id).maybeSingle();
  if (!p || p.canal_message_id != null) { await repondre(cq, "Ce pari a déjà sa preuve d'envoi : rien à renvoyer."); return; }
  // Meme heure limite que le transfert de preuve (avant les compositions) : pas de choix apres coup.
  if (Date.now() >= C.limitePreuve(p)) { await repondre(cq, `Trop tard : l'heure limite était ${C.heureTxt(C.limitePreuve(p))} (avant les compositions). Il ne compte nulle part.`, true); return; }
  await db.from("pro_paris").update({ envoi_tente_at: null }).eq("id", p.id).is("canal_message_id", null);
  await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: cq.message.message_id,
    reply_markup: { inline_keyboard: [[{ text: `Renvoi demandé à ${heureParis()} : il part au prochain tour`, callback_data: "fait" }]] } }).catch(() => null);
  await repondre(cq, `Il repart au prochain tour du robot, s'il passe avant ${C.heureTxt(C.limitePreuve(p) - C.ENVOI_MARGE_MIN * 60000)} ; sinon, il ne compte nulle part.`);
}

async function adminCommande(m: Any, texte: string) {
  if (texte.startsWith("/automatique")) {
    await html(ADMIN, "<b>Publication automatique</b>\nPar défaut, chaque message public t'est proposé avec « Publier ». Tu peux passer un type en automatique : il part alors sans ton clic. Débriefs, bilan et duel restent obligatoires dans les deux cas. Appuie sur une ligne pour changer.",
      { reply_markup: await clavierAuto() });
    return true;
  }
  if (texte.startsWith("/canalpro")) {
    const mode = await modeCanalPro(), tour = await reglage("dernier_tour_canal_pro");
    const vuTour = `\nDernier tour du robot planifié : ${tour ? `${C.dateLongue(C.paris(tour).date)} à ${C.heureTxt(tour)}` : "jamais"}.`;
    const abonnes = await (await depsDiffusion()).abonnes().catch(() => []);
    const nb = `\nAbonnés Pro reliés au robot (abonnement actif ou en essai) : ${abonnes.filter((a: Any) => String(a.chat_id) !== String(ADMIN)).length}.`;
    await html(ADMIN, (mode.ouvert
      ? "Les envois Pro sont <b>ouverts</b> : le programme validé part en privé, un à un, à chaque abonné Pro relié au robot, dans sa langue (mêmes chiffres pour tous)."
      : "Les envois Pro sont en <b>rodage</b> : tout ce qui partirait aux abonnés Pro (ou au canal gratuit pour le duel) arrive ici seulement, marqué [RODAGE]. Aucun abonné ne reçoit rien.\nPlus de canal à créer : quand vous ouvrez, chaque abonné reçoit tout en privé.") + nb + vuTour,
      { reply_markup: { inline_keyboard: [[mode.ouvert ? { text: "Repasser en rodage", callback_data: "cp:rodage" } : { text: "Ouvrir les envois Pro", callback_data: "cp:ouvrir" }]] } });
    return true;
  }
  if (texte.startsWith("/start") || texte.startsWith("/aide")) { await tg("sendMessage", { chat_id: ADMIN, text: AIDE_ADMIN }); return true; }
  return false;
}
async function modeClic(cq: Any) {
  if (cq.from?.id !== ADMIN || cq.message?.chat?.id !== ADMIN) { await repondre(cq, "Action réservée."); return; }
  await enregistrer("canal_pro_mode", cq.data === "cp:ouvrir" ? "ouvert" : "rodage");
  await tg("editMessageReplyMarkup", { chat_id: ADMIN, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: cq.data === "cp:ouvrir" ? `Envois Pro ouverts à ${heureParis()}` : "Retour en rodage", callback_data: "fait" }]] } });
  await repondre(cq, cq.data === "cp:ouvrir" ? "Envois Pro ouverts : chaque abonné relié reçoit tout en privé." : "Rodage : tout arrive chez vous seul.");
}

/** Mise a jour recue par le robot Pro. */
async function message(m: Any) {
  if (m.chat?.type !== "private") return;
  const texte = String(m.text || "");
  if (m.chat.id === ADMIN) {
    // Plus de reponse aux questions ici : elles arrivent et se repondent dans le robot Contact.
    if (m.forward_origin && await preuveTransferee(m)) return;
    await adminCommande(m, texte);
    return;
  }
  const code = texte.match(/^\/start\s+([A-Za-z0-9_-]{16,64})$/)?.[1];
  if (code) return lierCompte(m, code);
  const ab = await abonneParChat(m.chat.id);
  if (ab) {
    // Il nous ecrit : il ne bloque donc plus le robot (les envois Pro reprennent).
    if (ab.bloque) await db.from("telegram_abonnes").update({ bloque: false }).eq("user_id", ab.user_id);
    return robotPerso(m, ab);
  }
  // Compte pas relie : une commande (/start…) recoit l'accueil du robot Pro, tout le reste la reponse
  // automatique. Rien n'est transfere a Clement.
  const lang = LG.choisirLangue(null, m.from?.language_code);
  if (m.text && texte.startsWith("/")) {
    await tg("sendMessage", { chat_id: m.chat.id, text: RB.accueilPro(lang, await nomContact()), link_preview_options: { is_disabled: true } });
    return;
  }
  await reponseAuto(m.chat.id, lang);
}

// ---------- 1f. Canal gratuit : le robot y est-il administrateur ? ----------
async function roleDuRobot(u: Any) {
  const chat = u.chat;
  if (chat?.type !== "channel" || u.from?.id !== ADMIN) return;
  const admin = u.new_chat_member?.status === "administrator";
  const nom = chat.title || "";
  // Plus de canal Pro (02/10/2026) : seul le canal gratuit compte ; tout autre canal est ignore.
  if (chat.username && `@${chat.username}`.toLowerCase() === CANAL.toLowerCase()) {
    await tg("sendMessage", { chat_id: ADMIN, text: admin
      ? `C'est bon : le robot peut publier sur le canal public « ${nom} ».`
      : `Attention : le robot n'est plus administrateur du canal public « ${nom} ». Les clics « Publier » ne marcheront plus.` });
  }
}

// ---------- 2. Lien personnel du robot (page Compte) ----------
async function lienRobot(userId: string): Promise<string> {
  const nom = await nomDuRobot();
  const { data: ab } = await db.from("telegram_abonnes").select("*").eq("user_id", userId).maybeSingle();
  if (ab?.chat_id && !ab.bloque) return `https://t.me/${nom}`;
  const code = ab?.code_liaison && ab.code_cree_at && Date.now() - Date.parse(ab.code_cree_at) < CODE_DUREE_MS - 3600e3
    ? ab.code_liaison
    : [...crypto.getRandomValues(new Uint8Array(18))].map((x) => x.toString(16).padStart(2, "0")).join("");
  await db.from("telegram_abonnes").upsert({ user_id: userId, code_liaison: code, code_cree_at: ab?.code_liaison === code ? ab.code_cree_at : new Date().toISOString(),
    updated_at: new Date().toISOString() });
  return `https://t.me/${nom}?start=${code}`;
}
/** Le lien « Ouvrir mon robot sur Telegram » relie le compte, et c'est tout : plus de lien d'entree a un canal. */
async function liensPersonnels(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "unauthorized" }, 401);
  const anon = createClient(SUPA_URL, SUPA_ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await anon.auth.getUser();
  if (authError || !auth.user) return json({ error: "unauthorized" }, 401);
  const userId = auth.user.id;
  const { data: profil } = await db.from("users").select("plan, role").eq("id", userId).maybeSingle();
  if (!profil || !D.estAbonneActif(profil)) return json({ ok: false, code: "not_pro" }, 403);
  return json({ ok: true, robot_url: await lienRobot(userId) });
}

/**
 * Etat de la liaison Telegram pour l'espace Pro du site (03/10/2026) : { ok, relie }. LECTURE SEULE :
 * aucun code de liaison cree (contrairement a vip-link), rien d'ecrit. Abonne Pro actif seulement.
 */
async function statutLiaison(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "unauthorized" }, 401);
  const anon = createClient(SUPA_URL, SUPA_ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await anon.auth.getUser();
  if (authError || !auth.user) return json({ error: "unauthorized" }, 401);
  const { data: profil } = await db.from("users").select("plan, role").eq("id", auth.user.id).maybeSingle();
  if (!profil || !D.estAbonneActif(profil)) return json({ ok: false, code: "not_pro" }, 403);
  const { data: ab } = await db.from("telegram_abonnes").select("chat_id, bloque").eq("user_id", auth.user.id).maybeSingle();
  return json({ ok: true, relie: !!(ab?.chat_id && !ab.bloque) });
}

async function clic(cq: Any) {
  const d = String(cq.data || "");
  if (d.startsWith("pp:")) return programmeClic(cq);
  if (d.startsWith("dp:")) return duelPublier(cq);
  if (d.startsWith("dv:")) return duelVote(cq);
  // Clics d'un abonne : d'abord ses reglages obligatoires s'ils manquent.
  if (["tk:", "tb:", "rg:", "lg:"].some((x) => d.startsWith(x)) && await rameneAuxReglages(cq)) return;
  if (d.startsWith("tk:")) return ticketClic(cq);
  if (d.startsWith("tb:")) return tabacClic(cq);
  if (d.startsWith("rg:")) return reglageClic(cq);
  if (d.startsWith("lg:")) return langueClic(cq);
  if (d.startsWith("ac:")) return accueilClic(cq);
  if (d.startsWith("cp:")) return modeClic(cq);
  if (d.startsWith("au:")) return autoClic(cq);
  if (d.startsWith("ep:re:")) return renvoiClic(cq);
  return validation(cq);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!TOKEN || !SECRET) return json({ error: "telegram_misconfigured" }, 500);

  // Quel robot ? Il faut le parametre de SON webhook (?robot=contact pour le Contact) ET SON secret.
  const robot = RB.quelRobot({
    parametre: new URL(req.url).searchParams.get("robot"),
    secretRecu: req.headers.get("x-telegram-bot-api-secret-token"),
    secretPro: SECRET, secretContact: SECRET_CONTACT, contactActif: !!TOKEN_CONTACT,
  });
  if (robot) {
    try {
      const u = await req.json();
      if (robot === RB.CONTACT) {
        // Robot Contact : seulement des messages (aucun bouton, aucun canal).
        if (u.message) await messageContact(u.message);
        else if (u.callback_query) await tgc("answerCallbackQuery", { callback_query_id: u.callback_query.id }).catch(() => null);
      } else if (u.callback_query) await clic(u.callback_query);
      else if (u.message) await message(u.message);
      else if (u.my_chat_member) await roleDuRobot(u.my_chat_member);
    } catch (e) {
      console.error("[telegram-bot]", robot, (e as Error).message);
    }
    // Toujours 200 : sinon Telegram renvoie la meme mise a jour en boucle.
    return json({ ok: true });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { /* corps vide */ }
  try {
    if (body.action === "vip-link") return await liensPersonnels(req);
    if (body.action === "statut") return await statutLiaison(req);
  } catch (e) {
    console.error("[telegram-bot]", body.action, (e as Error).message);
    return json({ error: "telegram_error" }, 500);
  }
  return json({ error: "unauthorized" }, 401);
});
