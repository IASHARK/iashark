// Taches du robot planifie des messages Pro (appelees toutes les 15 min par
// scripts/canal-pro/tourner.mjs). Chaque tache est idempotente : un message
// n'est envoye qu'une fois (table pro_envois) et un tour manque est rattrape.
//
// deps = { db, tg, src, maintenant: () => Date, env: { ADMIN, CANAL_GRATUIT, ANCRE_FICHIER }, log }
//   db  : BaseRest ou BaseMemoire (lib/base.mjs)
//   tg  : (methode, corps) => resultat Bot API
//   src : sources de donnees (lib/sources.mjs) — candidats, etatsParis, compositions, meteo, resultats, duel
//
// MESSAGES PRO EN PRIVE (02/10/2026, decision de Clement) : il n'y a PLUS de canal Pro commun.
// Tout ce qui est reserve aux abonnes Pro part en MESSAGE PRIVE, un a un, du robot a chaque abonne
// Pro (actif ou en essai) relie au robot, dans SA langue, avec les memes chiffres pour tous
// (supabase/functions/_shared/canal-pro-diffusion.mjs). Le canal gratuit @iasharkdata ne change pas.
// Chaque pari part d'abord dans le REGISTRE (la conversation de Clement, marque « REGISTRE ») :
// l'identifiant de ce message est la preuve d'envoi (canal_message_id, nom de colonne garde) ;
// puis il part en prive a chaque abonne.
//
// MODE RODAGE (par defaut) : tant que Clement n'a pas ouvert les envois Pro (reglage
// canal_pro_mode = 'ouvert', commande /canalpro « Ouvrir les envois Pro »), le mode « rodage »
// est enregistre sur chaque pari : tous ses messages partent chez Clement SEUL, marques
// [RODAGE], sans numero PRO, et aucun abonne ne recoit rien.
//
// PUBLICATION : le programme part apres le clic de Clement. Tout AUTRE message Pro (debriefs,
// bilan, Loto Foot, programme reporte) ou du canal gratuit (duel) lui est d'abord propose avec un
// bouton (« Envoyer aux abonnés Pro » / « Publier sur le canal gratuit »), sauf si Clement a allume
// l'automatique pour ce type (reglage auto_<type> = 'oui', commande /automatique ; ETEINT par
// defaut). Les debriefs, le bilan, la revelation et le resultat du duel sont OBLIGATOIRES : pas de
// bouton « Ne pas envoyer », et ils sont reproposes toutes les 3 h (tacheAPublier) jusqu'a leur
// envoi. Les notes internes partent dans un 2e message, jamais copie.
// Compositions, alertes de cote et meteo : messages personnels (reglages de chaque abonne), sans clic.
//
// SUR MESURE (03/10/2026, decision de Clement) : les MEMES paris et les MEMES chances pour tous. Chaque
// abonne recoit UN programme du jour (plus de « programme commun + programme perso ») : son prenom, sa
// langue, la meilleure cote chez SES bookmakers (de son pays), a SON heure ; alertes, compositions et meteo
// selon SES reglages (oui / non). Ses competitions preferees servent seulement a l'information : a la fin du
// programme, « Aujourd'hui dans tes competitions » (matchs du jour, lien vers l'analyse, sans pari), et le
// lendemain matin, dans le debrief du matin (ou seul), « Hier dans tes competitions » (scores). Les jours sans
// programme publie, la liste du jour part seule (tacheInfos). Donnees : data.json, data-home.json et
// data/match-pages-registry.json du pipeline, rien d'autre.
//
// LANGUES : chaque message Pro est prepare dans les 6 langues (memes paris, memes chiffres) ; chaque
// abonne recoit la version de sa langue (user_preferences.language, sinon langue de son Telegram,
// sinon francais). Les textes prepares attendent le clic de Clement dans telegram_settings
// (« pro_textes:<cle> ») ; a l'envoi ils deviennent une diffusion (« diffusion:<cle> »), rattrapee a
// chaque tour (tacheDiffusions) jusqu'a sa fin de validite (abonne qui relie son compte entre-temps,
// refus de Telegram) : la cle d'envoi par abonne empeche tout doublon.
import fs from "node:fs";
import * as C from "../../supabase/functions/_shared/canal-pro.mjs";
import * as M from "../../supabase/functions/_shared/canal-pro-menu.mjs";
import * as LG from "../../supabase/functions/_shared/canal-pro-langues.mjs";
import * as D from "../../supabase/functions/_shared/canal-pro-diffusion.mjs";

const MIN = 60000;
// MODE ECONOMIE (03/10/2026) : intervalle du suivi des cotes des paris Pro (config/quotas.json,
// odds_api.canal_pro_suivi_cotes_minutes ; 25 min avant). Lu une fois, repli 55 min.
export const SUIVI_COTES_MIN = (() => {
  try { const v = Number(JSON.parse(fs.readFileSync(new URL("../../config/quotas.json", import.meta.url), "utf8")).odds_api.canal_pro_suivi_cotes_minutes); return v > 0 ? v : 55; }
  catch { return 55; }
})();
const TYPES_PUBLICS = Object.keys(C.TYPES_PUBLICS);
/** Etiquette du registre (conversation de Clement) quand les envois Pro sont ouverts. */
export const ETIQUETTE_REGISTRE = "<b>[REGISTRE · envoyé en privé aux abonnés Pro]</b>";

export function creerContexte(deps) {
  const { db, tg, env, log = console.log } = deps;
  const ctx = { ...deps, log };
  ctx.now = () => new Date(deps.maintenant ? deps.maintenant() : Date.now());
  ctx.reglage = async (key) => (await db.select("telegram_settings", { key }))[0]?.value ?? null;
  ctx.ecrireReglage = (key, value) => db.insert("telegram_settings", [{ key, value: String(value), updated_at: ctx.now().toISOString() }], { conflit: "fusionner", cle: "key" });
  /** Envois Pro ouverts par Clement (/canalpro) ? Sinon rodage. Plus aucun canal a enregistrer. */
  ctx.mode = async () => ({ mode: (await ctx.reglage("canal_pro_mode")) === "ouvert" ? "ouvert" : "rodage" });
  /** Pose une cle unique. true = premiere fois (on peut envoyer). */
  ctx.unique = async (cle, type) => (await db.insert("pro_envois", [{ cle, type }], { conflit: "ignorer", cle: "cle" })).length > 0;
  const brut = (chat, html, { clavier, reponseA, silencieux } = {}) => {
    const corps = { chat_id: chat, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } };
    if (clavier) corps.reply_markup = clavier;
    if (reponseA) corps.reply_parameters = { message_id: Number(reponseA), allow_sending_without_reply: true };
    if (silencieux) corps.disable_notification = true;
    return tg("sendMessage", corps);
  };
  ctx.admin = (html, opts = {}) => brut(env.ADMIN, html, opts);
  /** Envoi selon le mode d'un pari ou d'un message : en rodage, TOUJOURS chez Clement, marque. */
  ctx.envoyerMode = (mode, chat, html, { etiquette, ...opts } = {}) => mode === "ouvert"
    ? brut(chat, html, opts)
    : brut(env.ADMIN, `<b>[RODAGE${etiquette ? " · " + etiquette : ""}]</b>\n${html}`, { ...opts, reponseA: undefined });
  /**
   * Registre des paris (conversation de Clement) : ouvert, marque « REGISTRE » (puis envoi prive aux
   * abonnes) ; rodage, marque « RODAGE » (rien d'autre ne part). L'identifiant du message = preuve d'envoi.
   */
  ctx.registre = (mode, html) => (mode === "ouvert" ? brut(env.ADMIN, `${ETIQUETTE_REGISTRE}\n${html}`) : ctx.envoyerMode("rodage", null, html, { etiquette: "messages Pro" }));
  /** Automatique allume par Clement pour ce type (eteint par defaut). */
  ctx.auto = async (type) => (await ctx.reglage(`auto_${type}`)) === "oui";
  /**
   * Propose un message a Clement : une note a part, puis le texte EXACT (version francaise) avec le
   * bouton d'envoi. La cle part dans le bouton : un seul envoi, meme avec plusieurs copies proposees.
   * Obligatoire : pas de « Ne pas envoyer ».
   */
  ctx.proposer = async (type, cible, html, { reponseA, note, obligatoire = false, cle = null, rappel = 0 } = {}) => {
    const gratuit = cible === "gratuit";
    await ctx.admin(`<i>${rappel ? `Rappel n° ${rappel} : ce message n'est toujours pas ${gratuit ? "publié" : "envoyé"}. ` : ""}`
      + (gratuit ? `À publier ? (${type}, canal gratuit) Le message ci-dessous part tel quel si tu cliques « Publier ».`
        : `À envoyer ? (${type}, en privé à chaque abonné Pro, dans sa langue : mêmes chiffres) Le message ci-dessous est la version française ; il part si tu cliques « Envoyer aux abonnés Pro ».`)
      + (obligatoire ? ` Ce message est obligatoire (on montre aussi les pertes) : il n'y a pas de bouton pour ne pas l'${gratuit ? "publier" : "envoyer"}, et je te le repropose toutes les 3 h, de 8 h à 23 h, tant qu'il n'est pas ${gratuit ? "publié" : "envoyé"}.` : "")
      + `${note ? " " + note : ""}</i>`);
    const rangee = gratuit
      ? [{ text: "Publier sur le canal gratuit", callback_data: obligatoire ? `pubg:${reponseA ?? ""}:${cle}` : `pubg${reponseA ? ":" + reponseA : ""}` }]
      : [{ text: "Envoyer aux abonnés Pro", callback_data: `pubpro::${cle}` }];
    if (!obligatoire) rangee.push({ text: gratuit ? "Ne pas publier" : "Ne pas envoyer", callback_data: gratuit ? "non" : `non:${cle}` });
    return ctx.admin(html, { clavier: { inline_keyboard: [rangee] } });
  };
  /** Publication automatique d'un message obligatoire du canal gratuit : la cle « publie:k:<cle> » est posee AVANT (jamais deux fois). */
  ctx.publierGarde = async (cle, chat, html, reponseA) => {
    const garde = `publie:k:${cle}`;
    const [pose] = await db.insert("telegram_settings", [{ key: garde, value: ctx.now().toISOString(), updated_at: ctx.now().toISOString() }], { conflit: "ignorer", cle: "key" });
    if (!pose) return false; // deja publie
    try { await brut(chat, html, { reponseA: reponseA ?? undefined }); return true; }
    catch (e) { await db.delete("telegram_settings", { key: garde }).catch(() => null); throw e; }
  };
  /** Message obligatoire en attente d'envoi (repropose par tacheAPublier). */
  ctx.enAttente = (cle, x) => ctx.ecrireReglage(`a_publier:${cle}`, JSON.stringify(x));
  /** Textes d'un message Pro dans chaque langue : { fr: [html], es: [...], ... } (traduire(lang) -> html ou liste). */
  ctx.textesPro = (html, traduire) => Object.fromEntries(LG.LANGUES.map((l) => [l, l === "fr" || !traduire ? [].concat(html).filter(Boolean) : [].concat(traduire(l)).filter(Boolean)]));
  /**
   * Message Pro (cible « canal ») ou du canal gratuit (cible « gratuit », duel).
   * Rodage : chez Clement seul, marque. Ouvert, automatique allume par Clement pour ce type : envoye
   * (en prive aux abonnes Pro, ou publie sur le canal gratuit) ; sinon : propose a Clement avec le
   * bouton d'envoi (le message propose est EXACTEMENT le texte francais ; la note est a part).
   * Message Pro : cle obligatoire (une seule diffusion), textes dans toutes les langues (traduire),
   * garde = garde-fou de l'abonne applique (messages qui donnent des paris), pays = seulement ce pays.
   */
  ctx.publierOuProposer = async (type, mode, cible, html, { reponseA, note, obligatoire = false, cle = null, traduire = null, garde = false, pays = null, expire = null, dureeH = 12, infos = null, autresPays = null } = {}) => {
    if (!TYPES_PUBLICS.includes(type)) throw new Error(`type public inconnu : ${type}`);
    const gratuit = cible === "gratuit";
    if ((obligatoire || !gratuit) && !C.cleObligatoireValide(cle)) throw new Error(`message ${gratuit ? "obligatoire" : "Pro"} sans cle valide : ${type}`);
    if (mode !== "ouvert") return { rodage: await ctx.envoyerMode("rodage", null, html, { etiquette: `${gratuit ? "canal gratuit" : "messages Pro"} · ${type}` }) };
    const attente = { type, cible, html, reponseA: reponseA ?? null, note: note ?? null };
    if (gratuit) {
      const chat = env.CANAL_GRATUIT;
      if (await ctx.auto(type)) {
        if (!obligatoire) return { publie: await brut(chat, html, { reponseA }) };
        try { return { publie: await ctx.publierGarde(cle, chat, html, reponseA) }; }
        catch (e) {
          // Publication automatique ratee : le message reste en attente (nouvel essai au tour suivant).
          await ctx.enAttente(cle, { ...attente, message_id: null, propose_at: null, fois: 0 });
          log(`publication automatique ${cle} : ${e.message}`);
          return { attente: true };
        }
      }
      const r = await ctx.proposer(type, cible, html, { reponseA, note, obligatoire, cle });
      if (obligatoire) await ctx.enAttente(cle, { ...attente, message_id: r.message_id, propose_at: ctx.now().toISOString(), fois: 1 });
      return { propose: r };
    }
    // Message Pro : les textes de toutes les langues attendent l'envoi (clic de Clement ou automatique).
    // Validite : jusqu'a « expire » (heure fixe, ex. cloture du Loto Foot), sinon « dureeH » heures A PARTIR DE L'ENVOI.
    // autresPays : versions d'un pays dont les cotes sont relevees a part (« ES:es »… : cotes de SES operateurs).
    await ctx.ecrireReglage(`pro_textes:${cle}`, JSON.stringify({ type, textes: { ...ctx.textesPro(html, traduire), ...(autresPays || {}) }, garde, pays, expire, duree_h: expire ? null : dureeH, ...(infos ? { infos } : {}) }));
    if (await ctx.auto(type)) {
      try { return { publie: await ctx.lancerDiffusion(cle) }; }
      catch (e) {
        if (obligatoire) await ctx.enAttente(cle, { ...attente, message_id: null, propose_at: null, fois: 0 });
        log(`envoi automatique ${cle} : ${e.message}`);
        return { attente: true };
      }
    }
    const r = await ctx.proposer(type, cible, html, { note, obligatoire, cle });
    if (obligatoire) await ctx.enAttente(cle, { ...attente, message_id: r.message_id, propose_at: ctx.now().toISOString(), fois: 1 });
    return { propose: r };
  };
  /** Lignes de la base des abonnes relies au robot (non bloques), pour D.destinataires. */
  const lignesAbonnes = async () => {
    const lies = await db.select("telegram_abonnes", { chat_id: ["not_is", null], bloque: false });
    if (!lies.length) return null;
    const ids = lies.map((l) => l.user_id);
    const users = await db.select("users", { id: ["in", ids] });
    let form = [];
    try { form = await db.select("pro_preferences", { user_id: ["in", ids] }); } catch (e) { log(`preferences du formulaire illisibles (${e.status || e.message}) : valeurs par defaut`); }
    // Langue : user_preferences.language du compte, sinon celle de son Telegram (langue_telegram), sinon francais.
    let langues = [];
    try { langues = await db.select("user_preferences", { user_id: ["in", ids] }); } catch (e) { log(`langues illisibles (${e.status || e.message}) : francais`); }
    // Sans formulaire : francais par defaut, ou pays inconnu si Clement l'a choisi (reglage pays_sans_formulaire = 'aucun').
    // Une seule source : pro_preferences (les clics du robot y ecrivent aussi ; telegram_abonnes.reglages n'est plus lu).
    return { lies, users, form, langues, paysDefaut: C.paysParDefaut(await ctx.reglage("pays_sans_formulaire")) };
  };
  /**
   * Destinataires des messages personnels d'un pari selon SON mode. Rodage : Clement seul (exemple,
   * reglages par defaut). Ouvert : chaque abonne relie dont l'abonnement est actif ou en essai AU MOMENT
   * de l'envoi (users.plan relu a chaque fois).
   */
  ctx.abonnes = async (mode) => {
    if (mode !== "ouvert") return [{ user_id: "rodage", chat_id: env.ADMIN, prenom: "", rodage: true, prefs: C.preferencesEffectives(null), langue: "fr" }];
    const x = await lignesAbonnes();
    return x ? D.destinataires(x) : [];
  };
  ctx.notesDuJour = async (user_id, jour) => (user_id === "rodage" ? [] : db.select("pro_tickets", { user_id, jour, statut: "note" }));
  /** Fonctions donnees au moteur d'envoi prive (canal-pro-diffusion.mjs). Le rythme de Telegram est tenu par tg (lib/telegram.mjs). */
  ctx.depsDiffusion = () => ({
    abonnes: () => ctx.abonnes("ouvert"),
    dejaFaits: async (cle) => D.servisDepuisCles(cle, (await db.select("pro_envois", { cle: ["like", `${D.cleEnvoi(cle, "")}*`] })).map((r) => r.cle)),
    poser: (k, type) => ctx.unique(k, type),
    rendre: (k) => db.delete("pro_envois", { cle: k }),
    // Journal des envois (colonnes de la migration 0045) : sans la migration, l'envoi marche quand meme.
    noter: (k, x) => db.update("pro_envois", { cle: k }, x),
    bloquer: (user_id) => db.update("telegram_abonnes", { user_id }, { bloque: true }),
    notes: async (user_id) => (await ctx.notesDuJour(user_id, C.paris(ctx.now()).date)).length,
    envoyer: (chat, html, { silencieux } = {}) => brut(chat, html, { silencieux }),
    maintenant: ctx.now, log, admin: env.ADMIN, pause: deps.pauseEnvoi ?? 0,
  });
  /** Envoie (ou rattrape) la diffusion « diffusion:<cle> » ; null si elle n'existe pas ou n'est plus valable. */
  ctx.diffuserLigne = async (cle, x) => {
    if (!x?.textes) return null;
    if (x.expire && Date.parse(x.expire) <= ctx.now().getTime()) return null;
    return D.diffuser(ctx.depsDiffusion(), { cle, type: x.type, textes: x.textes, garde: !!x.garde, pays: x.pays || null, jour: x.jour || null,
      programme: x.programme || null, infos: x.infos || null });
  };
  /**
   * Message Pro a envoyer maintenant (clic de Clement deja fait par le robot Telegram, ou automatique) :
   * 1. cle « publie:k:<cle> » (plus de relance) ; 2. les textes prepares deviennent la diffusion ;
   * 3. envoi prive a chaque abonne. Idempotent : relance sans doublon (cle d'envoi par abonne).
   */
  ctx.lancerDiffusion = async (cle) => {
    const t = ctx.now().toISOString();
    await db.insert("telegram_settings", [{ key: `publie:k:${cle}`, value: t, updated_at: t }], { conflit: "ignorer", cle: "key" });
    await deplacerTextes(ctx, cle);
    const [d] = await db.select("telegram_settings", { key: `diffusion:${cle}` });
    if (!d) return null;
    let x;
    try { x = JSON.parse(d.value); } catch { return null; }
    return ctx.diffuserLigne(cle, x);
  };
  /** Diffusion d'un message Pro deja decide (programme valide, renvoi) : enregistree puis envoyee. */
  // jour : programme du jour (et ses ajouts, renvois) : l'abonne qui a choisi une heure d'envoi le recoit a son heure.
  ctx.diffuserPro = async (mode, cle, { type, textes = {}, garde = true, pays = null, expire = null, jour = null, programme = null, infos = null }) => {
    if (mode !== "ouvert") return null; // rodage : Clement a deja tout, rien ne part aux abonnes
    const x = { type, textes, garde, pays, expire: expire || new Date(ctx.now().getTime() + 12 * 3600e3).toISOString(), ...(jour ? { jour } : {}),
      ...(programme ? { programme } : {}), ...(infos ? { infos } : {}) };
    await ctx.ecrireReglage(`diffusion:${cle}`, JSON.stringify(x));
    return ctx.diffuserLigne(cle, x);
  };
  /** Envoi a un abonne (message personnel) ; un abonne qui a bloque le robot est marque (plus d'envoi). */
  ctx.envoyerAbonne = async (a, html, opts = {}) => {
    try {
      if (a.rodage) return await ctx.envoyerMode("rodage", null, html, { ...opts, etiquette: "message personnel (exemple, réglages par défaut)" });
      return await brut(a.chat_id, html, opts);
    } catch (e) {
      if (e.status === 403 && !a.rodage) await db.update("telegram_abonnes", { user_id: a.user_id }, { bloque: true });
      log(`envoi abonne ${a.user_id} : ${e.message}`);
      return null;
    }
  };
  ctx.suspendues = async () => String((await ctx.reglage("familles_suspendues")) || "").split(",").map((x) => x.trim()).filter(Boolean);
  /** Paris PARTIS dont la preuve (canal_message_id) n'a pas encore pu etre ecrite : jamais renvoyes. */
  ctx.preuves = new Map();
  return ctx;
}
/**
 * Textes prepares (« pro_textes:<cle> ») -> diffusion (« diffusion:<cle> »). La ligne est SUPPRIMEE
 * d'abord : seul celui qui la supprime l'ecrit (le robot Telegram fait de meme a un clic d'envoi).
 */
async function deplacerTextes(ctx, cle) {
  const [ligne] = await ctx.db.delete("telegram_settings", { key: `pro_textes:${cle}` }).catch(() => []);
  if (ligne) await ctx.ecrireReglage(`diffusion:${cle}`, D.versDiffusion(ligne.value, ctx.now()));
  return !!ligne;
}
/** Paris reellement envoyes (canal_message_id = preuve d'envoi) dont un match reste a jouer. */
async function parisOuverts(ctx) {
  return ctx.db.select("pro_paris", { publie_at: ["not_is", null], canal_message_id: ["not_is", null], resultat: ["is", null], fin_coup_envoi: ["gt", ctx.now().toISOString()] });
}
/** Releves archives de ces paris (pour leur version dans un autre pays : C.pariDuPays). */
async function relevesDe(ctx, paris) {
  const ids = [...new Set((paris || []).map((p) => p.id).filter(Boolean))];
  if (!ids.length || !C.PAYS_COTES_A_PART.length) return [];
  try { return await ctx.db.select("pro_cotes_releves", { pari_id: ["in", ids] }); }
  catch (e) { ctx.log(`releves illisibles (${e.message}) : pas de cote des autres pays`); return []; }
}
/** Les paris vus depuis le pays d'un abonne (Espagne : cotes de SES operateurs, releve de publication). */
const parisDuPays = (paris, releves, pays) => (C.PAYS_COTES_A_PART.includes(pays) ? paris.map((p) => C.pariDuPays(p, releves, pays, { jusqua: p.cote_vue_at })) : paris);
/** Textes d'un programme pour chaque langue, et pour chaque pays dont les cotes sont relevees a part (« ES:es »…). */
function textesProgramme(jour, paris, releves, { motifVide, tete = true, avant = [] } = {}) {
  const out = {};
  for (const pays of ["FR", ...C.PAYS_COTES_A_PART]) {
    const ps = parisDuPays(paris, releves, pays);
    for (const lang of LG.LANGUES) {
      const t = C.messagesCanal(jour, ps, { motifVide, lang, pays });
      out[pays === "FR" ? lang : `${pays}:${lang}`] = [...avant.map((x) => (typeof x === "function" ? x(lang) : x)), tete ? t.tete : null, ...t.paris.map((x) => x.html)].filter(Boolean);
    }
  }
  return out;
}
/**
 * Programme de chaque abonne (03/10/2026) : les paris vus depuis chaque pays (France, et chaque pays dont les
 * cotes sont relevees a part), le motif d'un jour sans pari, et un texte avant (« Ajout a ton programme »).
 * Le texte de chacun est fait a l'envoi (canal-pro-diffusion.mjs#texteProgrammeAbonne) : memes paris pour tous.
 */
function programmeDiffusion(jour, paris, releves, { motifVide = "regles", tete = true, avant = null } = {}) {
  const leger = (p) => { const { empreinte, empreinte_precedente, ...x } = p; return x; };
  const parPays = {};
  for (const pays of ["FR", ...C.PAYS_COTES_A_PART]) parPays[pays] = parisDuPays(paris, releves, pays).map(leger);
  return { jour, motifVide, tete, paris: parPays, ...(avant ? { avant: Object.fromEntries(LG.LANGUES.map((l) => [l, avant(l)])) } : {}) };
}
/** Matchs du jour des competitions preferees (information) : data.json du pipeline, via les sources. */
async function infosDuJour(ctx, jour) {
  try { return ctx.src.infosJour ? await ctx.src.infosJour(jour, ctx.now()) : null; }
  catch (e) { ctx.log(`matchs du jour des competitions : ${e.message}`); return null; }
}
/** Selections d'un pari : [pari] pour un simple, ses selections pour un combine ou un ticket, [] pour le buteur. */
const jambesDe = (p) => (p.famille === "buteur" ? [] : C.estCombine(p) ? p.selections || [] : [p]);
/** Etat d'une selection (k) dans le releve d'un pari. */
const etatJambe = (e, p, k) => (C.estCombine(p) ? e?.jambes?.[k] : e);
/**
 * Cotes des seuls agrees suivis, dans un etat du marche, SANS celles qui depassent de plus de 25 %
 * la cote Pinnacle de la meme selection (coquille probable ; sans Pinnacle : aucune). Releves,
 * alertes et compositions ne voient jamais une cote ecartee.
 */
function cotesSuivies(etat) {
  return C.cotesVerifiees(etat).cotes;
}
/**
 * Chaque releve est archive (ajout seulement) : les agrees suivis, et Pinnacle avec
 * sa chance sans marge (matiere de la CLV). Seulement avant le coup d'envoi.
 */
async function enregistrerReleves(ctx, paris, etats, d) {
  const lignes = [];
  for (const p of paris) {
    jambesDe(p).forEach((j, k) => {
      const e = etatJambe(etats[p.id], p, k);
      if (!e || Date.parse(j.coup_envoi) <= d.getTime()) return;
      const jambe = C.estCombine(p) ? k : null; // selection d'un combine ou d'un ticket (null = simple)
      for (const [bk, cote] of Object.entries(cotesSuivies(e))) lignes.push({ pari_id: p.id, jambe, bookmaker: bk, cote, proba_sans_marge: null, releve_at: d.toISOString() });
      // Autres pays ouverts (Espagne) : cotes de LEURS operateurs autorises, marquees « es:<cle> » (jamais melangees
      // aux cotes francaises du pari : cote de fin et reglement ne lisent que les cles sans prefixe).
      for (const pays of C.PAYS_COTES_A_PART) for (const [bk, cote] of Object.entries(C.cotesVerifiees(e, pays).cotes))
        lignes.push({ pari_id: p.id, jambe, bookmaker: `${C.prefixeReleve(pays)}${bk}`, cote, proba_sans_marge: null, releve_at: d.toISOString() });
      if (e.pinnacle_cote > 1) lignes.push({ pari_id: p.id, jambe, bookmaker: "pinnacle", cote: e.pinnacle_cote, proba_sans_marge: e.pinnacle_proba ?? null, releve_at: d.toISOString() });
    });
  }
  if (lignes.length) {
    try { await ctx.db.insert("pro_cotes_releves", lignes); }
    catch (e) { ctx.log(`releves de cotes non archives : ${e.message}`); return 0; }
  }
  return lignes.length;
}

// ------------------------------------------------------------------ 1. programme du jour
export async function tacheProgramme(ctx) {
  const { db } = ctx, d = ctx.now(), jour = C.paris(d).date;
  let prog = (await db.select("pro_programmes", { jour }))[0] || null;
  let action = C.actionProgramme(prog, d);
  if (action === "preparer") {
    const hm = C.paris(d).hm;
    // Apres une preparation ou AUCUN match n'a pu etre evalue, un seul nouvel essai par heure
    // (chaque essai coute de 6 a 26 credits The Odds API : 1 par championnat, 1 par vraie double chance).
    const incomplet = await ctx.reglage(`preparation_incomplete:${jour}`);
    if (incomplet && d.getTime() - Date.parse(incomplet) < 55 * MIN) return "attente du prochain essai (cotes incompletes)";
    let res;
    try { res = await ctx.src.candidats(jour, d); }
    catch (e) {
      // Sortie du moteur v3 absente ou perimee, API des cotes en panne ou sans credits : rien n'est prepare
      // (jamais « aucun pari ne passe nos criteres »).
      if (hm >= "08:45" && await ctx.unique(`programme-panne:${jour}`, "panne"))
        await ctx.admin(`<b>Programme reporté</b> : ${C.sourceEnPanne(e)} (${C.esc(e.message).slice(0, 200)}). Rien n'est préparé. Je réessaie tous les quarts d'heure jusqu'à 12 h ; s'il y a un programme, il faudra encore ton clic avant 12 h.`);
      // A l'heure de la publication, toujours rien : « programme reporte » propose (un seul par jour).
      if (hm >= "09:30" && await ctx.unique(`programme-reporte:${jour}`, "reporte"))
        await ctx.publierOuProposer("reporte", (await ctx.mode()).mode, "canal", C.MESSAGE_REPORTE(jour, "preparation", C.causeReport(e)),
          { cle: `reporte-${jour}`, traduire: (lang) => C.MESSAGE_REPORTE(jour, "preparation", C.causeReport(e), lang) });
      return `candidats impossibles : ${e.message}`;
    }
    // Liste simple (ancien format) : sans compte des matchs.
    const candidats = Array.isArray(res) ? res : res.candidats || [];
    const nonEvalues = Array.isArray(res) ? [] : res.nonEvalues || [];
    const vus = Array.isArray(res) ? null : res.evenements ?? null;
    if (vus && nonEvalues.length >= vus) {
      // AUCUN match evalue (ex. aucun match du moteur v3 retrouve chez The Odds API) : c'est une panne
      // de donnees, jamais « aucun pari ne passe nos criteres ». Rien n'est prepare.
      await ctx.ecrireReglage(`preparation_incomplete:${jour}`, d.toISOString());
      if (await ctx.unique(`programme-incomplet:${jour}`, "panne"))
        await ctx.admin(`<b>Programme reporté</b> : ${vus > 1 ? `aucun des ${vus} matchs n'a pu être évalué` : "le seul match trouvé n'a pas pu être évalué"} (${C.esc(C.resumeNonEvalues(nonEvalues))}). Rien n'est préparé. Je réessaie une fois par heure jusqu'à 12 h (environ 6 à 26 crédits par essai) ; s'il y a un programme, il faudra encore ton clic avant 12 h.`);
      // Texte public NEUTRE : la cause peut etre les cotes (pas de Pinnacle) OU API-Football (cotes la).
      if (hm >= "09:30" && await ctx.unique(`programme-reporte:${jour}`, "reporte"))
        await ctx.publierOuProposer("reporte", (await ctx.mode()).mode, "canal", C.MESSAGE_REPORTE(jour, "preparation", "donnees"),
          { cle: `reporte-${jour}`, traduire: (lang) => C.MESSAGE_REPORTE(jour, "preparation", "donnees", lang) });
      return `aucun match evalue (${vus} matchs, ${nonEvalues.length} non evalues)`;
    }
    const r = C.preparerProgramme(candidats, { jour, maintenant: d, suspendues: await ctx.suspendues() });
    // Ecarts du menu (ex. double chance sans vraie cote chez un agree : repli sur le 1N2), puis ceux du controleur.
    const ecartes = [...(Array.isArray(res) ? [] : res.ecartes || []), ...r.ecartes];
    [prog] = await db.insert("pro_programmes", [{ jour, statut: "prepare", ecartes, non_evalues: nonEvalues, matchs_vus: vus, prepare_at: d.toISOString() }], { conflit: "ignorer", cle: "jour" });
    if (!prog) return "deja prepare";
    if (r.paris.length) await db.insert("pro_paris", r.paris.map((p) => ({ ...p, jour, retire: false })));
    ctx.log(`programme ${jour} prepare : ${r.paris.length} paris (${C.compteFamilles(r.paris) || "aucun"}), ${ecartes.length} ecartes`);
    action = C.actionProgramme(prog, d);
  }
  if (!action) return null;
  const paris = await db.select("pro_paris", { jour }, { ordre: "rang.asc" });
  if (action === "demander" || action === "rappeler") {
    const rappel = action === "rappeler";
    if (!(await ctx.unique(`programme-${action}:${jour}`, action))) return null;
    const msg = await ctx.admin(C.messageValidation({ ...prog, paris }, { rappel }), { clavier: C.clavierValidation({ jour, paris }) });
    if (rappel && prog.validation_message_id) await ctx.tg("editMessageReplyMarkup", { chat_id: ctx.env.ADMIN, message_id: prog.validation_message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    await db.update("pro_programmes", { jour }, rappel ? { statut: "attente", rappel_at: d.toISOString(), validation_message_id: msg.message_id }
      : { statut: "attente", demande_at: d.toISOString(), validation_message_id: msg.message_id });
    return action;
  }
  if (action === "expirer") {
    await db.update("pro_programmes", { jour }, { statut: "expire" });
    if (prog.validation_message_id) await ctx.tg("editMessageReplyMarkup", { chat_id: ctx.env.ADMIN, message_id: prog.validation_message_id, reply_markup: { inline_keyboard: [[{ text: "Pas validé à 12 h : rien n'est parti", callback_data: "fait" }]] } }).catch(() => null);
    if (await ctx.unique(`programme-expire:${jour}`, "expire")) await ctx.admin(`Pas de clic avant 12 h : le programme du ${C.dateLongue(jour)} n'est pas parti. Rien n'est publié aujourd'hui.`);
    return "expire";
  }
  if (action === "publier") return publierProgramme(ctx, prog, paris);
  return null;
}

/** Ecrit la preuve d'envoi gardee en memoire (3 essais). true = ecrite. */
async function ecrirePreuve(ctx, id) {
  const preuve = ctx.preuves.get(id);
  if (!preuve) return true;
  for (let essai = 0; essai < 3; essai++) {
    try { await ctx.db.update("pro_paris", { id }, preuve); ctx.preuves.delete(id); return true; }
    catch (e) { ctx.log(`preuve d'envoi du pari ${id} (essai ${essai + 1}) : ${e.message}`); }
  }
  return false;
}
/**
 * Envoi d'un pari archive dans le REGISTRE (conversation de Clement ; en rodage, marque RODAGE).
 * C'est la preuve d'envoi ; l'envoi prive aux abonnes suit (diffusion). Renvoie { parti, incertain }.
 * 1. « envoi_tente_at » est ecrit AVANT l'envoi (base en panne : on n'envoie pas).
 * 2. Telegram refuse SUREMENT (400, 403 ou 429 : C.envoiRefuse) : pas parti, envoi_tente_at remis
 *    a vide -> renvoi possible. Toute autre erreur (502, 504, 200 illisible, coupure reseau) :
 *    envoi INCERTAIN, envoi_tente_at garde -> jamais renvoye tout seul, Clement verifie.
 * 3. Parti : l'identifiant du message est GARDE (ctx.preuves) et la preuve est reecrite jusqu'a
 *    3 fois ; il n'est JAMAIS renvoye. Si la preuve n'est toujours pas ecrite a la fin du tour, le
 *    tour suivant voit « envoi_tente_at » sans preuve : envoi incertain, jamais renvoye tout seul.
 */
async function envoyerPari(ctx, p, { retard = false } = {}) {
  let html = C.messagesCanal(p.jour, [p]).paris[0].html;
  if (retard) html += `\n(Envoi retardé : parti à ${C.heureTxt(ctx.now())}.)`;
  const maintenant = ctx.now().toISOString();
  try { await ctx.db.update("pro_paris", { id: p.id }, { envoi_tente_at: maintenant }); }
  catch (e) { ctx.log(`pari ${p.id} pas envoye (base indisponible) : ${e.message}`); return { parti: false, incertain: false }; }
  let r;
  try { r = await ctx.registre(p.mode, html); }
  catch (e) {
    const refuse = C.envoiRefuse(e); // 400, 403, 429 : Telegram a refuse, le message n'est pas parti
    const maj = { ...(p.envoi_echec_at ? {} : { envoi_echec_at: maintenant }), ...(refuse ? { envoi_tente_at: null } : {}) };
    await ctx.db.update("pro_paris", { id: p.id }, maj).catch(() => null);
    ctx.log(`envoi du pari ${p.id} ${refuse ? "refuse" : "INCERTAIN"} : ${e.message}`);
    return { parti: false, incertain: !refuse };
  }
  p.canal_message_id = r.message_id;
  ctx.preuves.set(p.id, { canal_message_id: r.message_id, envoye_at: maintenant, envoi_tente_at: null });
  if (!(await ecrirePreuve(ctx, p.id)))
    await ctx.admin(`<b>${C.esc(C.etiquette(p))}</b> (${C.esc(C.matchTxt(p))}) est parti (message ${r.message_id}), mais la base n'a pas enregistré la preuve d'envoi. Je réessaie l'écriture ; il ne sera pas renvoyé.`).catch(() => null);
  return { parti: true, incertain: false };
}
/**
 * Programme des abonnes qui ont choisi une heure d'envoi (0044) : a chaque tour, une fois leur heure
 * venue, UNE fois, SON programme (les memes paris que tous, ses cotes, sa langue, puis les matchs du jour
 * de ses competitions), s'il a ete retenu avant son heure (marque D.cleAttenteHeure posee par
 * canal-pro-diffusion.mjs) : reconstruit avec les seuls paris PARTIS dont le match n'a pas commence
 * (cle « programme-heure-<jour> »).
 * Tous les matchs deja commences : aucun message (jamais « aucun pari » a la place). Jour sans pari
 * publie : le message « aucun pari » du programme.
 */
export async function messagesPersonnelsDifferes(ctx) {
  const d = ctx.now(), { date: jour, hm } = C.paris(d);
  if (hm < "08:00" || hm >= "23:00") return 0;
  const prog = (await ctx.db.select("pro_programmes", { jour }))[0];
  if (!prog || prog.statut !== "publie" || !prog.mode) return 0;
  const archives = (await ctx.db.select("pro_paris", { jour, retire: false })).filter((p) => p.publie_at);
  const partis = archives.filter((p) => p.canal_message_id);
  const avenir = partis.filter((p) => Date.parse(p.coup_envoi) > d.getTime()).sort((a, b) => Date.parse(a.coup_envoi) - Date.parse(b.coup_envoi));
  // Des paris archives mais pas (encore) partis, ou tous deja commences : rien (jamais « aucun pari » a la place).
  if (archives.length && !avenir.length) return 0;
  return prog.mode === "ouvert" ? programmeCommunDiffere(ctx, jour, avenir, prog) : 0;
}
/** Programme commun retenu avant l'heure choisie : envoye a l'heure de chaque abonne, une fois, sans les matchs commences. */
async function programmeCommunDiffere(ctx, jour, avenir, prog) {
  const d = ctx.now();
  let n = 0, releves = null, infos = null;
  for (const a of await ctx.abonnes("ouvert")) {
    if (a.prefs?.heure_envoi == null || D.avantHeureChoisie(a.prefs, d)) continue;
    if (!(await ctx.db.select("pro_envois", { cle: D.cleAttenteHeure(jour, a.user_id) })).length) continue; // rien de retenu pour lui
    releves ??= await relevesDe(ctx, avenir);
    infos ??= (await infosDuJour(ctx, jour)) || false;
    const programme = programmeDiffusion(jour, avenir, releves, { motifVide: prog.motif_vide || "regles" });
    const b = await D.diffuser({ ...ctx.depsDiffusion(), abonnes: async () => [a] }, { cle: `programme-heure-${jour}`, type: "programme", textes: {}, programme, infos: infos || null, garde: true });
    n += b.envoyes;
  }
  return n;
}

export async function publierProgramme(ctx, prog, parisJour) {
  const { db } = ctx, d = ctx.now(), jour = prog.jour;
  const m = await ctx.mode();
  // Plus de canal : le registre (preuve d'envoi) est la conversation de Clement, puis chaque abonne en prive.
  const destination = String(ctx.env.ADMIN);
  const aPublier = parisJour.filter((p) => !p.retire && !p.publie_at);
  // Reprise d'une publication interrompue (base en panne ou tour coupe APRES l'archivage) : des paris du
  // jour ont deja leur heure de publication. Alors JAMAIS d'en-tete (surtout pas « aucun pari ») ni de
  // motif « jour sans pari » : les paris deja archives restent le programme du jour.
  const dejaPublies = parisJour.filter((p) => !p.retire && p.publie_at);
  // Le controleur : cotes et chance Pinnacle relevees de nouveau juste avant la publication.
  let etats = {};
  if (aPublier.length) {
    try { etats = await ctx.src.etatsParis(aPublier, d); }
    catch (e) {
      await db.update("pro_programmes", { jour }, { statut: "reporte" });
      if (await ctx.unique(`programme-reporte:${jour}`, "reporte")) {
        await ctx.admin(`<b>Programme reporté</b> : l'API des cotes est en panne ou sans crédits (${C.esc(e.message).slice(0, 200)}). Rien n'est publié. Je réessaie à chaque tour : si elle revient à temps, le programme part (sans nouveau clic de ta part), sans les matchs qui commencent dans moins de ${C.PREUVE_LIMITE_MIN + C.ENVOI_MARGE_MIN} min.`);
        await ctx.publierOuProposer("reporte", m.mode, "canal", C.MESSAGE_REPORTE(jour, "publication", C.causeReport(e)),
          { cle: `reporte-${jour}`, traduire: (lang) => C.MESSAGE_REPORTE(jour, "publication", C.causeReport(e), lang) });
      }
      return "reporte";
    }
  }
  const ecartes = [...(prog.ecartes || [])];
  const gardes = [];
  for (const p of aPublier) {
    const r = C.controlePublication(p, etats[p.id], d);
    if (r.raison) { await db.update("pro_paris", { id: p.id }, { retire: true }); ecartes.push({ match: C.matchTxt(p), famille: p.famille, raison: r.raison }); continue; }
    gardes.push({ ...p, ...r.maj });
  }
  // Motif public d'un jour sans pari : toujours vrai (C.motifVide). Jamais « aucun match ne passe nos
  // regles » quand un match n'a pas pu etre verifie jusqu'au bout (cotes incompletes, API-Football en
  // panne, match non relie aux resultats) ; texte a part un jour sans aucun match ; texte neutre quand
  // tout est retire au dernier controle.
  const motifVide = C.motifVide(prog, parisJour);
  // L'archiviste : numero (Canal ouvert seulement), heure posee par la base, puis empreinte chainee, AVANT tout envoi.
  const dernier = (await db.select("pro_paris", { numero: ["not_is", null] }, { ordre: "numero.desc", limite: 1 }))[0];
  let numero = dernier?.numero || 0, prec = dernier?.empreinte || null;
  gardes.sort((a, b) => Date.parse(a.coup_envoi) - Date.parse(b.coup_envoi));
  for (const p of gardes) {
    // La cote prise (et, pour un pari a plusieurs selections, la cote de chaque selection chez ce bookmaker) est archivee avec le pari.
    const maj = { cotes: p.cotes, meilleure_cote: p.meilleure_cote, meilleur_bookmaker: p.meilleur_bookmaker, selections: p.selections,
      cote_vue_at: p.cote_vue_at, explication: p.explication, mode: m.mode, destination, publie_at: d.toISOString() };
    if (m.mode === "ouvert") maj.numero = ++numero;
    const [lu] = await db.update("pro_paris", { id: p.id }, maj);
    Object.assign(p, lu);
    if (m.mode === "ouvert") {
      const empreinte = await C.empreintePari(lu, prec);
      await db.update("pro_paris", { id: p.id }, { empreinte, empreinte_precedente: prec });
      p.empreinte = empreinte; p.empreinte_precedente = prec; prec = empreinte;
    }
  }
  // Le releve du dernier controle est archive (cote Pinnacle et chance sans marge comprises) ;
  // il compte comme releve du guetteur (pas de 2e appel payant dans le meme tour).
  if (await enregistrerReleves(ctx, gardes, etats, d)) await ctx.ecrireReglage("dernier_releve_cotes", d.toISOString());
  // Le diffuseur : en-tete puis un message par pari ; chaque envoi reel est enregistre.
  let tete = null;
  if (!dejaPublies.length) {
    try { tete = await ctx.registre(m.mode, C.messagesCanal(jour, gardes, { motifVide }).tete); }
    catch (e) { ctx.log(`en-tete du programme : ${e.message}`); }
  }
  const echecs = [], incertains = [];
  for (const p of gardes) {
    const r = await envoyerPari(ctx, p);
    if (!r.parti) (r.incertain ? incertains : echecs).push(p);
  }
  // Envoi PRIVE a chaque abonne Pro (JUSTE apres le registre, avant toute autre ecriture : une base
  // en panne ensuite ne le bloque pas), dans sa langue : l'en-tete (s'il est parti) et les paris PARTIS
  // (ceux du registre), en UN message (coupe seulement au-dela de 4 000 caracteres). Memes chiffres pour tous.
  const partisCeTour = gardes.filter((p) => p.canal_message_id);
  let bilanPrive = null;
  // En-tete seul : seulement un jour SANS pari (sinon il attend ses paris, qui suivront au renvoi).
  if (partisCeTour.length || (tete && !gardes.length)) {
    const releves = await relevesDe(ctx, partisCeTour);
    const textes = textesProgramme(jour, partisCeTour, releves, { motifVide, tete: !!tete });
    // UN message par abonne : le meme programme, ses cotes, sa langue ; puis les matchs du jour de SES competitions.
    const programme = programmeDiffusion(jour, partisCeTour, releves, { motifVide, tete: !!tete, ...(dejaPublies.length ? { avant: (lang) => LG.textes(lang).perso.ajout } : {}) });
    const cle = `programme-${jour}${dejaPublies.length ? `-ajout-${partisCeTour.map((p) => p.numero ?? p.rang).join("-")}` : ""}`;
    bilanPrive = await ctx.diffuserPro(m.mode, cle, { type: "programme", textes, programme, infos: await infosDuJour(ctx, jour), garde: true, jour,
      expire: partisCeTour.length ? D.finDiffusion(d, partisCeTour) : C.parisVersDate(jour, "23:00").toISOString() })
      .catch((e) => { ctx.log(`envoi prive du programme : ${e.message}`); return null; });
  }
  // Le programme est parti : un « programme reporte » encore propose a Clement n'est plus d'actualite
  // (son clic n'enverra rien).
  if (tete || partisCeTour.length) await db.delete("telegram_settings", { key: `pro_textes:reporte-${jour}` }).catch(() => null);
  const tous = [...dejaPublies, ...gardes];
  await db.update("pro_programmes", { jour }, { statut: "publie", mode: m.mode, motif_vide: tous.length ? null : motifVide, publie_at: d.toISOString(),
    canal_message_id: tete?.message_id ?? prog.canal_message_id ?? null, ecartes });
  const envoyes = tous.filter((p) => p.canal_message_id);
  await ctx.admin(`Programme du ${C.dateLongue(jour)} ${m.mode === "ouvert" ? `envoyé en privé (${D.resumeDiffusion(bilanPrive || { envoyes: 0 })} : un message chacun, les mêmes paris, ses cotes, sa langue)` : "envoyé en RODAGE (chez toi seul, aucun abonné ne reçoit rien)"} : ${envoyes.length} pari${envoyes.length > 1 ? "s" : ""} au registre.`
    + (ecartes.length > (prog.ecartes || []).length ? `\nRetirés au dernier contrôle : ${ecartes.slice((prog.ecartes || []).length).map((e) => `${C.esc(e.match)} (${C.esc(e.raison)})`).join(" ; ")}` : "")
    + (echecs.length ? `\n<b>${echecs.length} pari${echecs.length > 1 ? "s" : ""} pas parti${echecs.length > 1 ? "s" : ""}</b> (${echecs.map((p) => C.esc(C.matchTxt(p))).join(" ; ")}). Je réessaie à chaque tour jusqu'à ${C.PREUVE_LIMITE_MIN + C.ENVOI_MARGE_MIN} min avant le match (heure limite de la preuve : ${C.PREUVE_LIMITE_MIN} min) ; un pari jamais parti ne compte nulle part.` : "")
    + (incertains.length ? `\n<b>Envoi incertain</b> pour ${incertains.map((p) => `${C.esc(C.matchTxt(p))}`).join(" ; ")} : Telegram n'a pas répondu clairement. Je ne renvoie pas tout seul (pas de doublon) : regarde le message « Envoi incertain » qui suit.` : "")
    + (dejaPublies.length ? `\nReprise d'une publication interrompue : ${dejaPublies.length} pari${dejaPublies.length > 1 ? "s" : ""} déjà archivé${dejaPublies.length > 1 ? "s" : ""} au tour précédent ; en-tête pas renvoyé (jamais « aucun pari » après un vrai pari).` : "")
    + (tete || dejaPublies.length ? "" : "\nL'en-tête du programme n'est pas parti."));
  return "publie";
}

/**
 * Renvoi des paris archives mais pas partis, tant que le match n'a pas commence. Un pari PARTI
 * dont la preuve n'est pas ecrite n'est jamais renvoye : on reecrit sa preuve. Un envoi incertain
 * (tente sans preuve, ou reponse de Telegram qui ne prouve pas un refus) n'est jamais renvoye tout
 * seul : Clement verifie le registre (sa conversation), puis soit il transfere le message du pari au robot, soit il
 * clique « Renvoyer », AVANT l'heure limite (C.limitePreuve : 70 min avant le match, avant les
 * compositions ; refuse apres, sinon on choisirait apres coup les paris qui comptent). Sans preuve
 * au coup d'envoi : compte nulle part, et le debrief et le bilan le disent (« sans preuve d'envoi »).
 */
export async function tacheRenvoi(ctx) {
  const d = ctx.now(), out = [];
  for (const id of [...ctx.preuves.keys()]) if (await ecrirePreuve(ctx, id)) out.push(`preuve ecrite ${id}`);
  const enAttente = await ctx.db.select("pro_paris", { publie_at: ["not_is", null], canal_message_id: ["is", null], retire: false });
  const partis = [];
  for (const p of enAttente) {
    if (ctx.preuves.has(p.id)) continue; // parti dans ce tour : preuve pas encore ecrite, jamais renvoye
    const incertain = !!p.envoi_tente_at;
    if (Date.parse(p.coup_envoi) - d.getTime() < 5 * MIN) {
      if (await ctx.unique(`jamais-parti:${p.id}`, "echec"))
        await ctx.admin(incertain
          ? `<b>${C.esc(C.etiquette(p))}</b> (${C.esc(C.matchTxt(p))}) n'a pas de preuve d'envoi à l'approche du coup d'envoi (${C.heureTxt(p.coup_envoi)}), et l'heure limite pour la donner (${C.heureTxt(C.limitePreuve(p))}, avant les compositions) est passée : il ne compte nulle part (ni résultat, ni bilan), et le débrief l'indique : « sans preuve d'envoi, pas compté ».`
          : `<b>${C.esc(C.etiquette(p))}</b> (${C.esc(C.matchTxt(p))}) n'est jamais parti avant le coup d'envoi : il ne compte nulle part (ni résultat, ni bilan), et le débrief l'indique.`);
      continue;
    }
    if (incertain) {
      const limite = C.limitePreuve(p);
      if (await ctx.unique(`envoi-incertain:${p.id}:${p.envoi_tente_at}`, "echec"))
        await ctx.admin(d.getTime() >= limite
          ? `<b>Envoi incertain</b> : ${C.esc(C.etiquette(p))} (${C.esc(C.matchTxt(p))}) est peut-être parti, mais je n'en ai pas la preuve. Je ne le renvoie pas tout seul (pas de doublon). L'heure limite pour transférer la preuve ou le renvoyer (${C.heureTxt(limite)}, avant les compositions) est passée : il ne compte nulle part (ni résultat, ni bilan), et le débrief l'indique.`
          : `<b>Envoi incertain</b> : ${C.esc(C.etiquette(p))} (${C.esc(C.matchTxt(p))}) est peut-être parti, mais je n'en ai pas la preuve. Je ne le renvoie pas tout seul (pas de doublon). Regarde le registre (ici, message marqué « REGISTRE ») :\n• s'il y est, transfère-moi son message : je l'enregistre comme envoyé ;\n• s'il n'y est pas, clique « Renvoyer ».\nL'un ou l'autre AVANT ${C.heureTxt(limite)} (${C.PREUVE_LIMITE_MIN} min avant le match, avant les compositions) : après, je refuse, et il ne compte nulle part.`,
          d.getTime() >= limite ? {} : { clavier: { inline_keyboard: [[{ text: "Renvoyer", callback_data: `ep:re:${p.id}` }]] } });
      continue;
    }
    // Plus le temps d'ecrire la preuve avant l'heure limite (la base la refuserait) : il ne part plus.
    if (!C.envoiPossible(p, d)) {
      if (await ctx.unique(`jamais-parti:${p.id}`, "echec"))
        await ctx.admin(`<b>${C.esc(C.etiquette(p))}</b> (${C.esc(C.matchTxt(p))}) n'est pas parti avant l'heure limite (${C.heureTxt(C.limitePreuve(p))}, ${C.PREUVE_LIMITE_MIN} min avant le match) : il ne part plus et ne compte nulle part (ni résultat, ni bilan), et le débrief l'indique.`);
      continue;
    }
    if ((await envoyerPari(ctx, p, { retard: true })).parti) { partis.push(p); out.push(C.etiquette(p)); }
  }
  for (const [jour, ps] of Object.entries(Object.groupBy ? Object.groupBy(partis, (p) => `${p.mode}|${p.jour}`) : partis.reduce((a, p) => ((a[`${p.mode}|${p.jour}`] ||= []).push(p), a), {}))) {
    const [mode, j] = jour.split("|");
    // Envoi prive des paris rattrapes (memes textes que le registre, dans la langue de chacun).
    const rel = await relevesDe(ctx, ps);
    await ctx.diffuserPro(mode, `renvoi-${ps.map((p) => p.numero ?? p.id).join("-")}`, { type: "programme", garde: true, jour: j, expire: D.finDiffusion(ctx.now(), ps),
      textes: textesProgramme(j, ps, rel, { tete: false, avant: [(lang) => LG.textes(lang).perso.ajout.trim()] }),
      programme: programmeDiffusion(j, ps, rel, { tete: false, avant: (lang) => LG.textes(lang).perso.ajout }) })
      .catch((e) => ctx.log(`envoi prive du renvoi : ${e.message}`));
    await ctx.admin(`Envoi rattrapé : ${ps.map((p) => C.esc(C.etiquette(p))).join(", ")}.`);
  }
  // Programme du matin a l'heure choisie par l'abonne (0044).
  const differes = await messagesPersonnelsDifferes(ctx).catch((e) => { ctx.log(`programme a l'heure choisie : ${e.message}`); return 0; });
  if (differes) out.push(`programme a l'heure choisie : ${differes}`);
  return out.length ? `renvoyes : ${out.join(", ")}` : null;
}

// ------------------------------------------------------------------ 2. guetteur de cotes et alertes
export async function tacheCotes(ctx, { force = false } = {}) {
  const d = ctx.now();
  const tous = (await parisOuverts(ctx)).filter((p) => p.famille !== "buteur"); // pas de cote buteur a relever
  if (!tous.length) return null;
  // Suivi des cotes (SEULEMENT les paris de la selection du jour, deja en base) : toutes les
  // SUIVI_COTES_MIN minutes (mode economie : 55 min, config/quotas.json), d'apres l'heure du DERNIER
  // releve (un tour GitHub en retard ne fait rien sauter).
  const dernier = await ctx.reglage("dernier_releve_cotes");
  const du = force || !dernier || d.getTime() - Date.parse(dernier) >= SUIVI_COTES_MIN * MIN;
  // Entre deux releves : un DERNIER releve pour chaque selection dont le match commence dans les 20 min
  // (cote Pinnacle de cloture, matiere de la CLV), une seule fois par selection.
  const paris = [], finals = [];
  for (const p of tous) {
    let proche = false;
    for (const [k, j] of jambesDe(p).entries()) {
      const t = Date.parse(j.coup_envoi) - d.getTime();
      const cle = C.estCombine(p) ? `releve-final:${p.id}:${k}` : `releve-final:${p.id}`;
      if (t > 0 && t <= 20 * MIN && await ctx.unique(cle, "releve")) { proche = true; finals.push(cle); }
    }
    if (proche || du) paris.push(p);
  }
  if (!paris.length) return null;
  // Dernier releve rate (API en panne, match absent de la reponse, base en panne) : le verrou est
  // rendu, pour un nouvel essai au tour suivant tant que le match n'a pas commence.
  const rendre = (cles) => Promise.all(cles.map((cle) => ctx.db.delete("pro_envois", { cle }).catch(() => null)));
  let etats;
  // Essentiel : le DERNIER releve avant le match (cote de cloture des paris Pro) ou un releve force.
  // Le suivi periodique (alertes) ne l'est pas : au-dela du plafond du jour, il attend (mode economie).
  try { etats = await ctx.src.etatsParis(paris, d, { essentiel: force || finals.length > 0 }); }
  catch (e) {
    await rendre(finals);
    if (e.plafond) { ctx.log(`cotes : ${e.message}`); return "suivi des cotes reporté (mode économie)"; }
    if (await ctx.unique(`cotes-panne:${C.paris(d).date}`, "panne")) await ctx.admin(`Le relevé des cotes ne marche pas (${C.esc(e.message).slice(0, 200)}) : pas d'alerte de cote tant qu'il ne revient pas.`);
    throw e;
  }
  if (du) await ctx.ecrireReglage("dernier_releve_cotes", d.toISOString());
  const nLignes = await enregistrerReleves(ctx, paris, etats, d);
  await rendre(finals.filter((cle) => {
    const [, id, k] = cle.split(":");
    const p = paris.find((x) => String(x.id) === id);
    return !nLignes || !(etatJambe(etats[id], p, Number(k || 0))?.pinnacle_cote > 1);
  }));
  const cotesDe = (p) => cotesSuivies(etats[p.id]);
  const douteusesDe = (p) => C.cotesVerifiees(etats[p.id]).ecartees;
  let envoyees = 0;
  for (const mode of ["ouvert", "rodage"]) {
    // Alertes de cote : seulement les simples (des faits de cote chez SES bookmakers, jamais un calcul).
    const ps = paris.filter((p) => p.mode === mode && p.famille === "simple" && Date.parse(p.coup_envoi) > d.getTime());
    if (!ps.length) continue;
    let relevesPays = null;
    for (const a of await ctx.abonnes(mode)) {
      const notes = await ctx.notesDuJour(a.user_id, C.paris(d).date);
      // Espagne : cotes de SES operateurs (releve de publication -> releve du moment), jamais celles de France.
      const aPart = C.PAYS_COTES_A_PART.includes(a.prefs.pays);
      if (aPart) relevesPays ??= await relevesDe(ctx, ps);
      for (const p0 of ps) {
        const p = aPart ? C.pariDuPays(p0, relevesPays, a.prefs.pays, { jusqua: p0.cote_vue_at }) : p0;
        // Programme du jour pas encore recu (heure d'envoi choisie, 0044) : aucune alerte sur ses paris avant.
        if (p.jour === C.paris(d).date && D.avantHeureChoisie(a.prefs, d)) continue;
        const v = aPart ? C.cotesVerifiees(etats[p.id], a.prefs.pays) : null;
        const now = v ? v.cotes : cotesDe(p);
        if (!Object.keys(now).length) continue;
        const dejaJoue = notes.some((t) => t.pari_id === p.id);
        for (const al of C.alertesCote(p, now, a.prefs, new Set(), { maintenant: d.getTime(), notesAujourdhui: notes.length, dejaJoue, douteuses: v ? v.ecartees : douteusesDe(p), lang: a.langue })) {
          if (await ctx.unique(`alerte:${al.type}:${p.id}:${a.user_id}`, "alerte") && await ctx.envoyerAbonne(a, al.texte)) envoyees++;
        }
      }
    }
  }
  return `${nLignes} cotes, ${envoyees} alertes`;
}

// ------------------------------------------------------------------ 3. compositions (releve H-65, vers H-55) : simples et buteur
async function personnelsPour(ctx, p, type, texte) {
  const d = ctx.now();
  for (const a of await ctx.abonnes(p.mode)) {
    if (!a.prefs.alertes[type] || (!a.prefs.alertes.nuit && C.estLaNuit(d)) || !C.pariPourAbonne(p, a.prefs)) continue;
    // Programme du jour pas encore recu (heure d'envoi choisie, 0044) : aucune alerte sur ses paris avant.
    if (p.jour === C.paris(d).date && D.avantHeureChoisie(a.prefs, d)) continue;
    const notes = await ctx.notesDuJour(a.user_id, C.paris(d).date);
    if (C.gardeFouAtteint(a.prefs, notes.length)) continue;
    if (await ctx.unique(`perso-${type}:${p.id}:${a.user_id}`, `perso-${type}`)) await ctx.envoyerAbonne(a, typeof texte === "function" ? texte(a) : texte);
  }
}
export async function tacheCompositions(ctx) {
  const d = ctx.now(), t = d.getTime();
  const paris = (await parisOuverts(ctx)).filter((p) => ["simple", "buteur"].includes(p.famille) && !p.compo_voyant && p.fixture_id
    && Date.parse(p.coup_envoi) - t <= 70 * MIN && Date.parse(p.coup_envoi) - t >= 25 * MIN);
  let n = 0;
  for (const p of paris) {
    let compo;
    try { compo = await ctx.src.composition(p.fixture_id); }
    catch (e) { ctx.log(`composition ${p.id} : ${e.message}`); continue; } // API-Football en panne : on repassera
    if (!compo) continue; // pas encore publiee : on repassera
    const v = p.famille === "buteur" ? C.voyantButeur(p, compo) : C.voyantComposition(compo);
    let cotes = {}, etatCompo = null;
    if (p.famille === "simple") {
      try {
        const etats = await ctx.src.etatsParis([p], d);
        etatCompo = etats[p.id] || null;
        cotes = cotesSuivies(etats[p.id]);
        await enregistrerReleves(ctx, [p], etats, d);
      } catch (e) { ctx.log(`cotes composition : ${e.message}`); }
    }
    await ctx.db.update("pro_paris", { id: p.id }, { compo_voyant: v.voyant, compo_at: d.toISOString() });
    if (!(await ctx.unique(`compo:${p.id}`, "compo"))) continue;
    // Plus de canal commun : la composition part en prive, a chaque abonne (sa langue, sa meilleure cote
    // chez SES bookmakers, ses reglages d'alerte, sans sonnerie la nuit). En rodage : chez Clement seul.
    await personnelsPour(ctx, p, "compositions", (a) => {
      const aPart = C.PAYS_COTES_A_PART.includes(a.prefs.pays);
      const sesCotes = aPart ? (etatCompo ? C.cotesVerifiees(etatCompo, a.prefs.pays).cotes : {}) : cotes;
      return C.messageCompositionPerso(p, v, C.meilleure(sesCotes, C.sesBookmakers(a.prefs)), aPart ? a.prefs.pays : "FR", a.langue);
    });
    n++;
  }
  return n ? `${n} compositions` : null;
}

// ------------------------------------------------------------------ 4. meteo (H-3, seulement si elle est forte ; message personnel)
export async function tacheMeteo(ctx) {
  const d = ctx.now(), t = d.getTime();
  const paris = (await parisOuverts(ctx)).filter((p) => ["simple", "buteur"].includes(p.famille) && !p.meteo_at && p.fixture_id
    && Date.parse(p.coup_envoi) - t <= 195 * MIN && Date.parse(p.coup_envoi) - t >= 150 * MIN);
  let n = 0;
  for (const p of paris) {
    let m;
    try { m = await ctx.src.meteo(p.fixture_id, p.coup_envoi); }
    catch (e) { ctx.log(`meteo ${p.id} : ${e.message}`); continue; } // on repassera au tour suivant
    const phrase = m ? C.meteoForte(m.prevision) : null;
    await ctx.db.update("pro_paris", { id: p.id }, { meteo_at: d.toISOString(), meteo: phrase || "" });
    if (!phrase) continue;
    await personnelsPour(ctx, p, "meteo", (a) => C.messageMeteo(p, m.ville, C.meteoForte(m.prevision, a.langue) || phrase, a.langue));
    n++;
  }
  return n ? `${n} alertes meteo` : null;
}

// ------------------------------------------------------------------ 5. regleur (paris envoyes seulement)
/** Releves d'une selection (k) avant son coup d'envoi : { fin (meilleure cote agreee), pin (dernier releve Pinnacle) }. */
function cloture(releves, jambe, ko) {
  const avant = releves.filter((x) => (x.jambe ?? null) === jambe && Date.parse(x.releve_at) <= Date.parse(ko));
  const fin = C.meilleure(C.dernieresCotes(avant.filter((x) => x.bookmaker !== "pinnacle" && !String(x.bookmaker).includes(":"))));
  const pin = avant.filter((x) => x.bookmaker === "pinnacle").sort((a, b) => Date.parse(b.releve_at) - Date.parse(a.releve_at))[0];
  return { fin, pin };
}
export async function tacheRegler(ctx) {
  const d = ctx.now();
  // Un pari se regle quand son DERNIER match est fini (110 min apres son coup d'envoi).
  const paris = await ctx.db.select("pro_paris", { publie_at: ["not_is", null], canal_message_id: ["not_is", null], resultat: ["is", null], fin_coup_envoi: ["lt", new Date(d.getTime() - 110 * MIN).toISOString()] });
  let n = 0;
  for (const p of paris) {
    let maj;
    try { maj = await reglement(ctx, p); }
    catch (e) { ctx.log(`resultat ${p.id} : ${e.message}`); continue; } // API-Football en panne : on repassera
    if (!maj) continue;
    await ctx.db.update("pro_paris", { id: p.id }, { ...maj, regle_at: d.toISOString() });
    n++;
  }
  if (n) await regleArret(ctx).catch((e) => ctx.log(`regle d'arret : ${e.message}`));
  return n ? `${n} paris regles` : null;
}
const FINI = ["FT", "AET", "PEN"], ANNULE = ["PST", "CANC", "ABD", "AWD", "WO"];
/** Reglement d'un pari : colonnes a ecrire, ou null (pas encore fini). */
async function reglement(ctx, p) {
  if (C.estCombine(p)) {
    const releves = await ctx.db.select("pro_cotes_releves", { pari_id: p.id });
    const jambes = [];
    for (const [k, j] of (p.selections || []).entries()) {
      if (!j.fixture_id) return null;
      const r = await ctx.src.resultat(j.fixture_id);
      if (!r) return null;
      const { pin } = cloture(releves, k, j.coup_envoi);
      const clot = { pinnacle_proba_fin: pin?.proba_sans_marge != null ? Number(pin.proba_sans_marge) : null, pinnacle_fin_at: pin ? new Date(pin.releve_at).toISOString() : null };
      if (ANNULE.includes(r.statut)) jambes.push({ resultat: "annule", ...clot });
      else if (FINI.includes(r.statut) && Number.isInteger(r.bd) && Number.isInteger(r.be)) jambes.push({ score_dom: r.bd, score_ext: r.be, resultat: C.resultatPari(j, r.bd, r.be), ...clot });
      else return null;
    }
    const resultat = C.resultatCombine(jambes.map((j) => j.resultat));
    const q = jambes.every((j) => j.resultat === "annule" || j.pinnacle_proba_fin != null) ? jambes.filter((j) => j.resultat !== "annule").reduce((a, j) => a * j.pinnacle_proba_fin, 1) : null;
    return { resultat, faits: { jambes }, pinnacle_proba_fin: resultat === "annule" ? null : q };
  }
  if (!p.fixture_id) return null;
  const r = await ctx.src.resultat(p.fixture_id);
  if (!r) return null;
  if (ANNULE.includes(r.statut)) return { resultat: "annule" };
  if (!(FINI.includes(r.statut) && Number.isInteger(r.bd) && Number.isInteger(r.be))) return null;
  if (p.famille === "buteur") {
    // Sans preuve : aucune cote buteur, donc ni cote de fin ni CLV. Le joueur n'a pas joue : rembourse.
    const b = p.selections?.[0] || {};
    const j = await ctx.src.buteursDuMatch(p.fixture_id);
    if (!j) return null; // statistiques des joueurs pas encore la : on repassera
    const id = Number(b.joueur_id);
    const resultat = C.resultatButeur(p, r.bd, r.be, { marque: j.marqueurs.map(Number).includes(id), a_joue: j.joueurs.length ? j.joueurs.map(Number).includes(id) : null });
    return { resultat, score_dom: r.bd, score_ext: r.be, faits: { ...(r.faits || {}), buteur: { joueur_id: id, marque: j.marqueurs.map(Number).includes(id) } } };
  }
  const releves = await ctx.db.select("pro_cotes_releves", { pari_id: p.id, releve_at: ["lte", new Date(p.coup_envoi).toISOString()] });
  const { fin, pin } = cloture(releves, null, p.coup_envoi);
  // pinnacle_fin_at : heure du releve Pinnacle retenu (un releve de plus de 30 min avant le match ne compte pas dans la CLV : C.clvPari).
  return { resultat: C.resultatPari(p, r.bd, r.be), score_dom: r.bd, score_ext: r.be, cote_fin: fin ? fin.cote : null,
    pinnacle_cote_fin: pin ? Number(pin.cote) : null, pinnacle_proba_fin: pin?.proba_sans_marge != null ? Number(pin.proba_sans_marge) : null,
    pinnacle_fin_at: pin ? new Date(pin.releve_at).toISOString() : null, faits: r.faits || null };
}
/**
 * Regle d'arret (condition du mathematicien, INTERNE, jamais affichee) : apres 300 simples regles du
 * Canal Pro ouvert, si la fourchette a 95 % de l'ecart (reel - annonce) est entierement sous -3 points,
 * les simples sont suspendus (reglage familles_suspendues) et Clement est prevenu. Alerte a Clement,
 * sans suspension, des que l'ecart lui-meme passe sous -3 points.
 */
async function regleArret(ctx) {
  const simples = await ctx.db.select("pro_paris", { famille: "simple", mode: "ouvert", canal_message_id: ["not_is", null], resultat: ["not_is", null] });
  const r = M.regleArret(simples);
  if (!r.alerte && !r.suspendre) return;
  const pts = (x) => `${x >= 0 ? "+" : ""}${C.fr(x * 100, 1)}`;
  const chiffres = `${r.n} simples : chance annoncée ${C.fr(r.annonce * 100, 1)} %, réussite ${C.fr(r.reel * 100, 1)} %, écart ${pts(r.ecart)} points (fourchette jusqu'à ${pts(r.haut)}).`;
  if (r.suspendre) {
    const sus = await ctx.suspendues();
    if (!sus.includes("simple")) await ctx.ecrireReglage("familles_suspendues", [...sus, "simple"].join(","));
    if (await ctx.unique(`arret-simples:${r.n >= 300 ? "300" : r.n}`, "arret"))
      await ctx.admin(`<b>Règle d'arrêt : les simples sont suspendus</b> (note interne, rien n'est publié). ${chiffres} Toute la fourchette est sous −3 points. Il faut l'avis du mathématicien avant de les reprendre (réglage familles_suspendues).`);
  } else if (await ctx.unique(`arret-alerte:${C.paris(ctx.now()).date}`, "arret")) {
    await ctx.admin(`<b>À surveiller</b> (note interne) : ${chiffres} L'écart est sous −3 points, mais pas encore toute la fourchette : pas de suspension.`);
  }
}

// ------------------------------------------------------------------ 6. debriefs (8 h 30 et 23 h 30, dimanche 23 h 15)
async function derniereEmpreinte(ctx) {
  return (await ctx.db.select("pro_paris", { numero: ["not_is", null], empreinte: ["not_is", null] }, { ordre: "numero.desc", limite: 1 }))[0]?.empreinte || null;
}
export async function tacheDebrief(ctx, moment) {
  const d = ctx.now(), jour = C.paris(d).date;
  const aDire = await ctx.db.select("pro_paris", { resultat: ["not_is", null], canal_message_id: ["not_is", null], debrief: ["is", null] }, { ordre: "coup_envoi.asc" });
  // Paris archives (numero donne en Canal ouvert) mais sans preuve d'envoi au coup d'envoi : ils ne
  // comptent nulle part, et le debrief le dit (un pari visible dans le canal ne disparait pas sans explication).
  const sansPreuve = (await ctx.db.select("pro_paris", { publie_at: ["not_is", null], canal_message_id: ["is", null], retire: false, debrief: ["is", null],
    coup_envoi: ["lt", d.toISOString()] }, { ordre: "coup_envoi.asc" }));
  if (!aDire.length && !sansPreuve.length) return null;
  if (!(await ctx.unique(`debrief-${moment}:${jour}`, "debrief"))) return null;
  const titre = C.titreDebrief(moment, jour);
  let infos;
  for (const mode of ["ouvert", "rodage"]) {
    const ps = aDire.filter((p) => p.mode === mode), sp = sansPreuve.filter((p) => p.mode === mode);
    const texte = C.messageDebrief(titre, ps, { sansPreuve: sp });
    if (!texte) continue;
    // Debrief du matin : a la fin, pour chaque abonne, les resultats d'hier de SES competitions (information).
    infos ??= moment === "matin" ? await resultatsDeLaVeille(ctx, jour) : null;
    // Obligatoire : un debrief perdant ne peut pas etre cache (pas de « Ne pas publier », repropose jusqu'a publication).
    // Abonnes d'un pays dont les cotes sont relevees a part (Espagne) : la cote prise chez SES operateurs.
    const autresPays = {};
    if (C.PAYS_COTES_A_PART.length && ps.length) {
      const rel = await relevesDe(ctx, ps);
      for (const pays of C.PAYS_COTES_A_PART) {
        const vus = ps.map((p) => C.pariDuPays(p, rel, pays, { jusqua: p.cote_vue_at }));
        for (const lang of LG.LANGUES) autresPays[`${pays}:${lang}`] = [C.messageDebrief(C.titreDebrief(moment, jour, lang), vus, { sansPreuve: sp, lang })].filter(Boolean);
      }
    }
    await ctx.publierOuProposer("debriefs", mode, "canal", texte, { obligatoire: true, cle: `debrief-${moment}-${jour}`, garde: false, infos, autresPays,
      traduire: (lang) => C.messageDebrief(C.titreDebrief(moment, jour, lang), ps, { sansPreuve: sp, lang }) });
    for (const p of [...ps, ...sp]) await ctx.db.update("pro_paris", { id: p.id }, { debrief: `${moment}:${jour}` });
  }
  return `debrief ${moment} : ${aDire.length} paris${sansPreuve.length ? `, ${sansPreuve.length} sans preuve d'envoi` : ""}`;
}

/** Resultats de la veille des competitions preferees (registre des pages match du pipeline), via les sources. */
async function resultatsDeLaVeille(ctx, jour) {
  try { const x = ctx.src.resultatsHier ? await ctx.src.resultatsHier(jour) : null; return x?.matchs?.length ? x : null; }
  catch (e) { ctx.log(`resultats d'hier des competitions : ${e.message}`); return null; }
}

// ------------------------------------------------------------------ 6 bis. competitions preferees : information seule
/**
 * Competitions preferees (information, 03/10/2026) :
 * - le matin (8 h 30 - 11 h), s'il n'y a pas de debrief du matin : « Hier dans tes competitions » part seul ;
 * - un jour SANS programme publie (pas valide, reporte, aucun programme), a partir de 12 h 15 : « Aujourd'hui
 *   dans tes competitions » part seul.
 * Chaque abonne ne recoit chaque liste qu'une fois (cle « infos:<cle> », la meme que dans le debrief et le
 * programme). Rien pour un abonne sans competition choisie, ni si ses competitions n'ont pas de match.
 * Envois Pro ouverts seulement (en rodage, rien ne part aux abonnes).
 */
export async function tacheInfos(ctx) {
  const d = ctx.now(), { date: jour, hm } = C.paris(d);
  if ((await ctx.mode()).mode !== "ouvert") return null;
  const out = [];
  if (hm >= "08:30" && hm < "11:00" && !(await ctx.db.select("pro_envois", { cle: `debrief-matin:${jour}` })).length && await ctx.unique(`infos-hier:${jour}`, "infos")) {
    const infos = await resultatsDeLaVeille(ctx, jour);
    if (infos) {
      const b = await ctx.diffuserPro("ouvert", `resultats-${jour}`, { type: "infos", infos, garde: false, expire: C.parisVersDate(jour, "12:00").toISOString() });
      if (b) out.push(`resultats d'hier : ${D.resumeDiffusion(b)}`);
    }
  }
  if (hm >= "12:15" && hm < "21:00") {
    const prog = (await ctx.db.select("pro_programmes", { jour }))[0];
    if ((!prog || !["publie", "valide", "reporte"].includes(prog.statut) || (prog.statut === "reporte" && hm >= "15:00")) && await ctx.unique(`infos-jour:${jour}`, "infos")) {
      const infos = await infosDuJour(ctx, jour);
      if (infos?.matchs?.length) {
        const b = await ctx.diffuserPro("ouvert", `infos-jour-${jour}`, { type: "infos", infos, garde: false, expire: C.parisVersDate(jour, "23:00").toISOString() });
        if (b) out.push(`matchs du jour : ${D.resumeDiffusion(b)}`);
      }
    }
  }
  return out.join(" ; ") || null;
}

// ------------------------------------------------------------------ 7. ancre publique quotidienne de la chaine
/**
 * Chaque soir (23 h 30 et 23 h 45, dimanche des 23 h 15) : l'empreinte du dernier pari est ecrite
 * dans ANCRE_FICHIER ; le workflow la publie dans la branche Git canal-pro-ancre. Pas de cle
 * « deja fait » ici : si la publication Git echoue, le tour suivant reessaie ; c'est le workflow
 * qui ne publie qu'une ligne par jour (il regarde si la date est deja dans la branche).
 */
export async function tacheAncre(ctx) {
  const d = ctx.now(), jour = C.paris(d).date;
  const e = await derniereEmpreinte(ctx);
  if (!e || !ctx.env.ANCRE_FICHIER) return null;
  const [dernier] = await ctx.db.select("pro_paris", { empreinte: e });
  fs.writeFileSync(ctx.env.ANCRE_FICHIER, `${jour} PRO-${dernier.numero} ${e}\n`);
  return `ancre ${jour} PRO-${dernier.numero}`;
}

// ------------------------------------------------------------------ 8. bilan de la semaine (lundi 12 h 30) : obligatoire et cumule
export async function tacheBilanSemaine(ctx) {
  const d = ctx.now(), { date: lundi } = C.paris(d);
  const du = C.jourSuivant(lundi, -7), au = C.jourSuivant(lundi, -1);
  const { mode } = await ctx.mode();
  if (!(await ctx.unique(`bilan:${lundi}`, "bilan"))) return null;
  const envoyes = (await ctx.db.select("pro_paris", { publie_at: ["not_is", null], canal_message_id: ["not_is", null], mode }));
  const semaine = envoyes.filter((p) => String(p.jour).slice(0, 10) >= du && String(p.jour).slice(0, 10) <= au);
  const nonRegles = envoyes.filter((p) => !p.resultat && Date.parse(p.coup_envoi) < d.getTime() - 3 * 3600e3).length;
  // Paris de la semaine archives mais sans preuve d'envoi au coup d'envoi : hors bilan, et le bilan le rappelle.
  // Et depuis le n° 1 : combien de paris sont hors bilan (le cumul le dit aussi).
  const sansPreuveTotal = (await ctx.db.select("pro_paris", { publie_at: ["not_is", null], canal_message_id: ["is", null], retire: false, mode }, { ordre: "coup_envoi.asc" }))
    .filter((p) => Date.parse(p.coup_envoi) < d.getTime());
  const sansPreuve = sansPreuveTotal.filter((p) => String(p.jour).slice(0, 10) >= du && String(p.jour).slice(0, 10) <= au);
  // Obligatoire : pas de « Ne pas publier » ; repropose toutes les 3 h (tacheAPublier) jusqu'a sa publication.
  await ctx.publierOuProposer("bilan", mode, "canal", C.messageBilanSemaine(du, au, semaine, envoyes, { nonRegles, sansPreuve, sansPreuveTotal }),
    { obligatoire: true, cle: `bilan-${lundi}`, garde: false, dureeH: 24, note: "Chiffres tirés de l'archive des paris envoyés (gagnés et perdus, en nombre).",
      traduire: (lang) => C.messageBilanSemaine(du, au, semaine, envoyes, { nonRegles, sansPreuve, sansPreuveTotal, lang }) });
  return "bilan";
}

// ------------------------------------------------------------------ 9. Loto Foot : notre grille a tenter
export async function tacheLotoFoot(ctx) {
  const d = ctx.now(), { date, hm } = C.paris(d);
  const grilles = await ctx.db.select("loto_foot_grilles", { premier_match_at: ["gt", d.toISOString()] });
  const { mode } = await ctx.mode();
  let n = 0;
  for (const g of grilles) {
    const cloture = g.cloture_at || g.premier_match_at;
    const jourPremier = C.paris(g.premier_match_at).date;
    const due = (jourPremier === C.jourSuivant(date) && hm >= "18:00") || jourPremier === date;
    if (!due || Date.parse(cloture) <= d.getTime()) continue;
    const texte = C.messageGrille(g);
    if (!texte) {
      if (await ctx.unique(`loto-incomplete:${g.id}`, "loto")) await ctx.admin(`La grille ${C.esc(g.nom)} est incomplète : elle n'est pas envoyée (${C.esc(C.problemesGrille(g).join(" ; "))}).`);
      continue;
    }
    const id = String(g.id).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const loto = { garde: true, pays: "FR", expire: new Date(Date.parse(cloture)).toISOString() };
    if (await ctx.unique(`loto:${g.id}`, "loto")) { await ctx.publierOuProposer("loto", mode, "canal", texte, { ...loto, cle: `loto-${id}` }); n++; }
    const reste = Date.parse(cloture) - d.getTime();
    if (reste <= 120 * MIN && await ctx.unique(`loto-rappel:${g.id}`, "loto")) {
      await ctx.publierOuProposer("loto", mode, "canal", `Rappel : la grille ${C.esc(g.nom)} ferme à ${C.heureTxt(cloture)}. Notre grille à tenter est plus haut dans cette conversation.`, { ...loto, cle: `loto-rappel-${id}` });
      n++;
    }
  }
  return n ? `${n} messages loto` : null;
}

// ------------------------------------------------------------------ 10. duel « la foule contre l'IA » (canal gratuit, sans lot)
// DECISION CLEMENT / JURISTE : pas de lot ni de classement nominatif tant qu'un
// reglement n'est pas ecrit et relu (18 ans et plus, un compte par personne).
export async function tacheDuel(ctx) {
  const d = ctx.now(), { date, hm } = C.paris(d), out = [];
  // Ouverture : proposee a Clement a 10 h, SANS lui montrer le choix de l'IA (sinon il pourrait choisir quels duels publier).
  if (hm >= "10:00" && hm < "18:00" && !(await ctx.db.select("duel_manches", { jour: date })).length) {
    const m = await ctx.src.matchDuel(date, d);
    const choix = m ? C.choixIA(m) : null;
    if (choix) {
      const sel = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const duel = { jour: date, fixture_id: m.fixture_id, dom: m.dom, ext: m.ext, competition: m.competition, coup_envoi: m.coup_envoi, choix_ia: choix, sel, empreinte: await C.sha256(`${choix}|${sel}`), statut: "propose" };
      const [ins] = await ctx.db.insert("duel_manches", [duel], { conflit: "ignorer", cle: "jour" });
      if (ins) {
        await ctx.admin(`<i>Duel du jour à publier ? (canal gratuit, sans lot) Le choix de l'IA est scellé : même toi, tu ne le vois qu'au coup d'envoi.</i>`);
        await ctx.admin(C.messageDuelOuverture(duel), { clavier: { inline_keyboard: [[{ text: "Publier le duel", callback_data: `dp:ok:${date}` }, { text: "Pas aujourd'hui", callback_data: `dp:no:${date}` }]] } });
        out.push("duel propose");
      }
    }
  }
  const modeDuel = (duel) => (String(duel.chat_id) === String(ctx.env.ADMIN) ? "rodage" : "ouvert");
  // Au coup d'envoi : vote ferme (automatique), revelation proposee a Clement.
  for (const duel of await ctx.db.select("duel_manches", { statut: "ouvert", coup_envoi: ["lte", d.toISOString()] })) {
    const votes = await ctx.db.select("duel_votes", { jour: duel.jour });
    await ctx.db.update("duel_manches", { jour: duel.jour }, { statut: "revele" });
    if (duel.message_id && duel.chat_id) await ctx.tg("editMessageReplyMarkup", { chat_id: duel.chat_id, message_id: duel.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => null);
    await ctx.publierOuProposer("duel", modeDuel(duel), "gratuit", C.messageDuelRevelation(duel, votes), { reponseA: duel.message_id, obligatoire: true, cle: `duel-revele-${duel.jour}` });
    out.push("duel revele");
  }
  // Resultat le lendemain a 9 h, propose a Clement.
  if (hm >= "09:00") {
    for (const duel of await ctx.db.select("duel_manches", { statut: "revele", jour: ["lt", date] })) {
      let r = null;
      try { r = duel.fixture_id ? await ctx.src.resultat(duel.fixture_id) : null; }
      catch (e) { ctx.log(`resultat du duel ${duel.jour} : ${e.message}`); continue; }
      if (!r) continue;
      if (["PST", "CANC", "ABD"].includes(r.statut)) { await ctx.db.update("duel_manches", { jour: duel.jour }, { statut: "regle" }); continue; }
      if (!["FT", "AET", "PEN"].includes(r.statut)) continue;
      const reel = r.bd > r.be ? "1" : r.bd < r.be ? "2" : "N";
      const votes = await ctx.db.select("duel_votes", { jour: duel.jour });
      await ctx.db.update("duel_manches", { jour: duel.jour }, { statut: "regle", resultat: reel, score: `${r.bd}-${r.be}` });
      // Obligatoire : un duel « rate » par l'IA ne peut pas etre cache.
      await ctx.publierOuProposer("duel", modeDuel(duel), "gratuit", C.messageDuelResultat(duel, votes, r.bd, r.be), { obligatoire: true, cle: `duel-resultat-${duel.jour}` });
      out.push("duel regle");
    }
  }
  return out.join(", ") || null;
}

// ------------------------------------------------------------------ 11. messages obligatoires pas encore publies
/**
 * Debriefs, bilan, duel : tant qu'un message obligatoire n'est pas publie, il est repropose a
 * Clement toutes les 3 h (8 h - 23 h), l'ancienne copie perd son bouton. Si Clement allume
 * l'automatique pour ce type, il part tout seul. En rodage : rien (il attend l'ouverture).
 */
export async function tacheAPublier(ctx) {
  const d = ctx.now(), hm = C.paris(d).hm, out = [];
  const lignes = await ctx.db.select("telegram_settings", { key: ["like", "a_publier:*"] });
  if (!lignes.length) return null;
  const m = await ctx.mode();
  for (const l of lignes) {
    const cle = l.key.slice("a_publier:".length);
    let x;
    try { x = JSON.parse(l.value); } catch { ctx.log(`${l.key} illisible`); continue; }
    const enleverBouton = (texte) => (x.message_id ? ctx.tg("editMessageReplyMarkup", { chat_id: ctx.env.ADMIN, message_id: x.message_id,
      reply_markup: { inline_keyboard: [[{ text: texte, callback_data: "fait" }]] } }).catch(() => null) : null);
    if ((await ctx.db.select("telegram_settings", { key: `publie:k:${cle}` })).length) {
      await ctx.db.delete("telegram_settings", { key: l.key });
      // Envoye par le clic de Clement : le robot Telegram a deja fait la diffusion (sinon, elle est
      // preparee ici et tacheDiffusions l'envoie, sans doublon).
      if (x.cible !== "gratuit") await deplacerTextes(ctx, cle).catch((e) => ctx.log(`diffusion ${cle} : ${e.message}`));
      out.push(`${cle} publie`);
      continue;
    }
    if (m.mode !== "ouvert") continue;
    if (await ctx.auto(x.type)) {
      try {
        if (x.cible === "gratuit") await ctx.publierGarde(cle, ctx.env.CANAL_GRATUIT, x.html, x.reponseA);
        else await ctx.lancerDiffusion(cle);
        await ctx.db.delete("telegram_settings", { key: l.key });
        await enleverBouton(`${x.cible === "gratuit" ? "Publié" : "Envoyé"} automatiquement à ${C.heureTxt(d)}`);
        out.push(`${cle} publie (automatique)`);
      } catch (e) { ctx.log(`publication automatique ${cle} : ${e.message}`); }
      continue;
    }
    if (hm < "08:00" || hm >= "23:00") continue;
    if (x.propose_at && d.getTime() - Date.parse(x.propose_at) < (C.REPROPOSER_APRES_MIN - 5) * MIN) continue;
    await enleverBouton("Reproposé plus bas");
    const r = await ctx.proposer(x.type, x.cible, x.html, { reponseA: x.reponseA, note: x.note, obligatoire: true, cle, rappel: x.fois || 0 });
    await ctx.enAttente(cle, { ...x, message_id: r.message_id, propose_at: d.toISOString(), fois: (x.fois || 0) + 1 });
    out.push(`${cle} repropose`);
  }
  return out.join(", ") || null;
}

// ------------------------------------------------------------------ 12. messages Pro en prive : rattrapage
/**
 * Chaque diffusion Pro (« diffusion:<cle> ») est reprise a chaque tour jusqu'a sa fin de validite :
 * abonnes que Telegram a refuses (nouvel essai), abonne qui relie son compte entre-temps, tour coupe.
 * La cle d'envoi par abonne (pro_envois) empeche tout doublon ; un abonnement termine ne recoit plus
 * rien (verifie a chaque envoi). Rodage : rien (les envois Pro ne sont pas ouverts).
 */
export async function tacheDiffusions(ctx) {
  // Textes dont l'envoi a ete clique (cle « publie:k:<cle> ») mais pas encore devenus une diffusion
  // (robot Telegram coupe entre les deux) ; textes a heure fixe perimes : supprimes.
  for (const l of await ctx.db.select("telegram_settings", { key: ["like", "pro_textes:*"] })) {
    const cle = l.key.slice("pro_textes:".length);
    if ((await ctx.db.select("telegram_settings", { key: `publie:k:${cle}` })).length) { await deplacerTextes(ctx, cle); continue; }
    let x = null;
    try { x = JSON.parse(l.value); } catch { /* illisible : supprime */ }
    if (!x || (x.expire && Date.parse(x.expire) <= ctx.now().getTime())) await ctx.db.delete("telegram_settings", { key: l.key });
  }
  const lignes = await ctx.db.select("telegram_settings", { key: ["like", "diffusion:*"] });
  if (!lignes.length) return null;
  const ouvert = (await ctx.mode()).mode === "ouvert";
  const out = [];
  for (const l of lignes) {
    const cle = l.key.slice("diffusion:".length);
    let x = null;
    try { x = JSON.parse(l.value); } catch { ctx.log(`${l.key} illisible`); }
    if (!x || (x.expire && Date.parse(x.expire) <= ctx.now().getTime())) { await ctx.db.delete("telegram_settings", { key: l.key }); continue; }
    if (!ouvert) continue;
    const b = await ctx.diffuserLigne(cle, x);
    if (b && (b.envoyes || b.bloques || b.refuses || b.incertains)) out.push(`${cle} : ${D.resumeDiffusion(b)}`);
  }
  return out.join(" ; ") || null;
}

// ------------------------------------------------------------------ tour complet
// ------------------------------------------------------------------ mode economie : alerte quotas
/**
 * Alerte a Clement (conversation admin) quand un abonnement API passe 70 % (API-Football : du jour ;
 * The Odds API : du mois), puis 95 % (mode minimum automatique). Chiffres lus dans les en-tetes des
 * API pendant ce tour (lib/quotas.js) ; une seule fois par seuil et par periode (pro_envois).
 */
export async function tacheQuotas(ctx) {
  const q = ctx.src.quotas ? ctx.src.quotas() : null;
  if (!q) return null;
  const QUOTAS = await import("../../lib/quotas.js").then((m) => m.default || m);
  let n = 0;
  for (const a of QUOTAS.alertesDues(q.etat, q.config, ctx.now())) {
    if (await ctx.unique(`quota:${a.cle}`, "quota")) { await ctx.admin(C.esc(a.texte)); n++; }
  }
  return n ? `${n} alerte(s) quotas` : null;
}

export async function tourner(deps) {
  const ctx = creerContexte(deps);
  const d = ctx.now(), taches = C.tachesDues(d), hm = C.paris(d).hm, rapport = {};
  const lancer = async (nom, f) => {
    if (!taches.includes(nom)) return;
    try { const r = await f(); if (r) rapport[nom] = r; }
    catch (e) { rapport[nom] = `ERREUR ${e.message}`; ctx.log(`[canal-pro] ${nom} : ${e.stack || e.message}`); }
  };
  await lancer("regler", () => tacheRegler(ctx));
  await lancer("debrief_matin", () => tacheDebrief(ctx, "matin"));
  await lancer("programme", () => tacheProgramme(ctx));
  await lancer("renvoi", () => tacheRenvoi(ctx));
  await lancer("infos", () => tacheInfos(ctx));
  await lancer("cotes", () => tacheCotes(ctx));
  await lancer("compositions", () => tacheCompositions(ctx));
  await lancer("meteo", () => tacheMeteo(ctx));
  await lancer("debrief_soir", () => tacheDebrief(ctx, "soir"));
  await lancer("ancre", () => tacheAncre(ctx));
  await lancer("bilan_semaine", () => tacheBilanSemaine(ctx));
  await lancer("loto_foot", () => tacheLotoFoot(ctx));
  await lancer("duel", () => tacheDuel(ctx));
  await lancer("a_publier", () => tacheAPublier(ctx));
  await lancer("diffusions", () => tacheDiffusions(ctx));
  // A chaque tour (pas une tache horaire) : alerte quotas si un seuil est passe pendant ce tour.
  try { const r = await tacheQuotas(ctx); if (r) rapport.quotas = r; } catch (e) { ctx.log(`[canal-pro] quotas : ${e.message}`); }
  await ctx.ecrireReglage("dernier_tour_canal_pro", d.toISOString()).catch(() => null);
  ctx.log(`[canal-pro] ${C.paris(d).date} ${hm} ${JSON.stringify(rapport)}`);
  return rapport;
}
