// IASHARK — messages Pro EN PRIVE, un a un (02/10/2026).
// DECISION DE CLEMENT : sur Telegram, PAS de canal Pro commun. Tout ce qui est reserve aux
// abonnes Pro (programme du jour, programme reporte, debriefs, bilan, Loto Foot) part en
// MESSAGE PRIVE, un a un, du robot IASHARK a chaque abonne Pro relie au robot, dans SA langue
// (user_preferences.language, sinon la langue de son Telegram, sinon le francais), avec les
// MEMES chiffres pour tous (une seule source : le meme pari, seuls les mots changent).
// Le canal gratuit @iasharkdata (public) ne change pas.
//
// Logique PURE : aucun appel reseau ni ecriture ici ; tout passe par les fonctions donnees
// (deps). Utilisee par le robot planifie (scripts/canal-pro/taches.mjs, Node) et par le robot
// Telegram (supabase/functions/telegram-bot, Deno) au clic « Envoyer aux abonnes Pro ».
// Tests : tests/canal-pro-prive.test.mjs.
//
// Regles d'envoi :
// - abonne Pro ACTIF ou en essai (users.plan 'pro' ou 'famille', ou administrateur), VERIFIE
//   AU MOMENT DE L'ENVOI : un abonnement termine = plus rien ;
// - jamais deux fois le meme message a la meme personne : cle « pro:<cle>:<user_id> » posee
//   dans pro_envois AVANT l'envoi ;
// - limites de Telegram : une pause entre deux messages (25 par seconde au plus) ; une erreur
//   429 attend le temps demande par Telegram (retry_after) puis reessaie ;
// - un abonne qui a bloque le robot (403) est marque (telegram_abonnes.bloque) et ne bloque pas
//   les autres ; un refus sur (400, 429 apres les reprises) rend la cle : nouvel essai au tour
//   suivant ; une erreur incertaine (502, coupure) garde la cle : jamais de doublon ;
// - garde-fou de l'abonne (limite du jour atteinte = plus rien) pour les messages qui donnent
//   des paris ; la nuit (23 h - 8 h), sans sonnerie sauf si l'abonne l'a demande ;
// - Clement (TELEGRAM_ADMIN_CHAT_ID) n'est jamais dans la liste : il a deja le registre.
// Aucune mise, unite, capital ni esperance ; aucune promesse de gain : les textes viennent tels
// quels de canal-pro.mjs et canal-pro-langues.mjs (memes regles, verifiees par leurs tests).
import { gardeFouAtteint, estLaNuit, preferencesEffectives, paris as heureDeParis, messageProgrammeAbonne, sectionCompetitions, PAYS_COTES_A_PART } from "./canal-pro.mjs";
import { choisirLangue, decouper } from "./canal-pro-langues.mjs";
import { rappelReglages } from "./canal-pro-accueil.mjs";

export const PLANS_PRO = Object.freeze(["pro", "famille"]);
/** Abonnement actif ou en essai (Stripe « trialing » donne aussi plan = 'pro'), ou administrateur. */
export const estAbonneActif = (u) => !!u && (PLANS_PRO.includes(u.plan) || u.role === "admin");
/** 40 ms entre deux messages : 25 messages par seconde au plus (Telegram : environ 30 au total). */
export const PAUSE_ENVOI_MS = 40;
/** Erreur 429 : jusqu'a 3 nouvelles tentatives apres l'attente demandee par Telegram. */
export const REPRISES_429 = 3;
const PREFIXE = "pro:";
/** Cle d'envoi d'un message a un abonne (pro_envois.cle). */
export const cleEnvoi = (cle, userId) => `${PREFIXE}${cle}:${userId}`;
/**
 * HEURE D'ENVOI CHOISIE (pro_preferences.heure_envoi, 0044, heure de Paris 8..22), 02/10/2026 :
 * un abonne qui a choisi une heure ne recoit PAS le programme du jour (programme commun, ajouts,
 * renvois) avant elle. Sa cle d'envoi est posee « differe » (jamais envoye tel quel ensuite) et une
 * marque « attente-heure » est posee pour le jour : a son heure, le robot planifie
 * (scripts/canal-pro/taches.mjs, messagesPersonnelsDifferes) lui envoie UNE fois le programme commun
 * reconstruit, sans les matchs deja commences (tout commence : pas de message).
 */
export const cleAttenteHeure = (jour, userId) => cleEnvoi(`attente-heure:${jour}`, userId);
/** Avant l'heure choisie par l'abonne (heure de Paris) ? Sans heure choisie : jamais. */
export function avantHeureChoisie(prefs, maintenant) {
  const h = prefs?.heure_envoi;
  if (h == null) return false;
  return Number(heureDeParis(maintenant).hm.slice(0, 2)) < Number(h);
}
/** Abonnes deja servis pour une diffusion, a partir des cles de pro_envois. */
export function servisDepuisCles(cle, cles) {
  const debut = `${PREFIXE}${cle}:`;
  return new Set([].concat(cles || []).map(String).filter((k) => k.startsWith(debut)).map((k) => k.slice(debut.length)));
}

/**
 * Destinataires des messages Pro : lignes telegram_abonnes reliees (chat_id), pas bloquees,
 * dont le compte est Pro actif ou en essai. Chacun avec ses reglages (pro_preferences) et sa langue.
 * lies : telegram_abonnes ; users : { id, plan, role } ; form : pro_preferences ; langues : user_preferences.
 * reglagesAFaire (03/10/2026) : pas de ligne pro_preferences = reglages obligatoires pas faits (ni sur le
 * site ni sur le robot). formLu = false (table illisible) : on ne le sait pas, donc aucun rappel.
 */
export function destinataires({ lies = [], users = [], form = [], langues = [], paysDefaut, formLu = true } = {}) {
  const actifs = new Set(users.filter(estAbonneActif).map((u) => String(u.id)));
  return lies.filter((l) => l.chat_id != null && !l.bloque && actifs.has(String(l.user_id))).map((l) => {
    const ligne = form.find((f) => String(f.user_id) === String(l.user_id));
    return {
      ...l,
      prefs: preferencesEffectives(ligne, paysDefaut === undefined ? {} : { paysDefaut }),
      langue: choisirLangue(langues.find((u) => String(u.user_id) === String(l.user_id))?.language, l.langue_telegram),
      reglagesAFaire: formLu && !ligne,
    };
  });
}
/** Rappel « Il te reste 1 minute de reglages » : une cle par abonne et par jour (heure de Paris). */
export const cleRappelReglages = (jour, userId) => cleEnvoi(`rappel-reglages:${jour}`, userId);

/**
 * Le texte d'un abonne : sa langue si elle est preparee, sinon le francais. Plusieurs blocs = un seul message
 * (coupe a 4 000 caracteres). Pays dont les cotes sont relevees a part (Espagne, 02/10/2026) : la version
 * « <PAYS>:<langue> » du programme (cotes de SES operateurs autorises), si elle existe.
 */
export function texteAbonne(textes, langue, pays = null) {
  const k = pays ? `${String(pays).toUpperCase()}:` : null;
  const local = k && Object.keys(textes || {}).some((x) => x.startsWith(k)) ? (textes[k + langue]?.length ? textes[k + langue] : textes[k + "fr"]) : null;
  const t = local?.length ? local : textes?.[langue]?.length ? textes[langue] : textes?.fr;
  return [].concat(t || []).filter(Boolean).join("\n\n");
}

/**
 * PROGRAMME DE CHAQUE ABONNE (03/10/2026, decision de Clement) : UN message par abonne, les MEMES paris et
 * les MEMES chances pour tous ; pour lui : son prenom, sa langue, la meilleure cote chez SES bookmakers (de
 * son pays), son heure. diffusion.programme = { jour, motifVide, tete, paris: { FR: [paris], ES: [paris…] },
 * avant: { langue: texte } } (paris deja vus depuis chaque pays : canal-pro.mjs#pariDuPays).
 * diffusion.infos = { cle, genre: 'jour' | 'hier', matchs } : a la fin, pour l'information seulement, les
 * matchs du jour (ou les resultats d'hier) de SES competitions preferees (canal-pro.mjs#sectionCompetitions) ;
 * une seule fois par abonne et par cle (« infos:<cle> »), meme si deux messages la portent.
 */
export function texteProgrammeAbonne(programme, a) {
  const pays = a.prefs?.pays;
  const paris = programme.paris?.[PAYS_COTES_A_PART.includes(pays) ? pays : "FR"] || programme.paris?.FR || [];
  const avant = programme.avant?.[a.langue] ?? programme.avant?.fr ?? "";
  return messageProgrammeAbonne(programme.jour, paris, a.prefs, { lang: a.langue, prenom: a.prenom || "", motifVide: programme.motifVide || "regles", tete: programme.tete !== false, avant });
}
export const cleInfos = (cle, userId) => cleEnvoi(`infos:${cle}`, userId);

const statut = (e) => Number(e?.status) || null;
const attente429 = (e) => Number(e?.retry_after ?? e?.parameters?.retry_after) || null;

/** Envoi d'un message ; 429 avec retry_after : attente puis nouvel essai (3 fois au plus). */
export async function envoyerAvecReprise(envoyer, chat, html, opts, attendre) {
  for (let essai = 0; ; essai++) {
    try { return await envoyer(chat, html, opts); }
    catch (e) {
      const s = attente429(e);
      if (statut(e) === 429 && s && essai < REPRISES_429) { await attendre((s + 1) * 1000); continue; }
      throw e;
    }
  }
}

/**
 * Envoie une diffusion a chaque abonne Pro qui ne l'a pas encore recue.
 * diffusion = { cle, type, textes: { fr: [html…], es: […], … }, garde (garde-fou applique), pays ('FR' : seulement
 * les abonnes de ce pays, ex. Loto Foot) }.
 * deps = { abonnes(), dejaFaits(cle) -> Set(user_id), poser(cleEnvoi, type) -> true si posee, rendre(cleEnvoi),
 *   noter(cleEnvoi, { user_id, statut, message_id, envoye_at }), bloquer(user_id), notes(user_id) -> nombre,
 *   envoyer(chat, html, { silencieux }) -> { message_id }, attendre(ms), maintenant() -> Date, log, admin, pause }.
 * diffusion.jour (programme du jour, ses ajouts et renvois) : l'abonne qui a choisi une heure d'envoi
 * ne le recoit pas avant elle (voir cleAttenteHeure) : compte dans « differes ».
 * Renvoie { envoyes, bloques, refuses, incertains, deja, ignores, differes }.
 */
export async function diffuser(deps, diffusion) {
  const { abonnes, dejaFaits = async () => new Set(), poser, rendre = async () => null, noter = async () => null, bloquer = async () => null,
    notes = async () => 0, envoyer, attendre = (ms) => new Promise((r) => setTimeout(r, ms)), maintenant = () => new Date(), log = () => {}, admin = null, pause = PAUSE_ENVOI_MS } = deps;
  const { cle, type = "pro", textes, garde = true, pays = null, jour = null } = diffusion;
  const bilan = { envoyes: 0, bloques: 0, refuses: 0, incertains: 0, deja: 0, ignores: 0, differes: 0 };
  if (!cle || (!textes && !diffusion.programme && !diffusion.infos)) return bilan;
  const servis = await dejaFaits(cle).catch(() => new Set());
  let premier = true;
  for (const a of await abonnes()) {
    const uid = String(a.user_id);
    if (servis.has(uid)) { bilan.deja++; continue; }
    if (admin != null && String(a.chat_id) === String(admin)) { bilan.ignores++; continue; } // Clement a le registre
    if (pays && a.prefs?.pays !== pays) { bilan.ignores++; continue; }
    if (jour && avantHeureChoisie(a.prefs, maintenant())) {
      // Pas avant son heure : cle « differe » (jamais envoye tel quel), marque du jour pour l'envoi a son heure.
      const k = cleEnvoi(cle, a.user_id);
      if (await poser(k, `pro-${type}`)) await noter(k, { user_id: a.user_id, statut: "differe", message_id: null, envoye_at: null }).catch(() => null);
      await poser(cleAttenteHeure(jour, a.user_id), "pro-attente-heure");
      bilan.differes++;
      continue;
    }
    let texte = diffusion.programme ? texteProgrammeAbonne(diffusion.programme, a) : texteAbonne(textes, a.langue, a.prefs?.pays);
    // Competitions preferees (information seulement) : la section, une seule fois par abonne et par jour.
    const section = diffusion.infos ? sectionCompetitions(diffusion.infos, a.prefs, { lang: a.langue, maintenant: maintenant() }) : "";
    if (!texte && !section) { bilan.ignores++; continue; }
    if (garde && gardeFouAtteint(a.prefs, await notes(a.user_id))) { bilan.ignores++; continue; }
    const k = cleEnvoi(cle, a.user_id);
    if (!(await poser(k, `pro-${type}`))) { bilan.deja++; continue; }
    const ki = section ? cleInfos(diffusion.infos.cle || cle, a.user_id) : null;
    const avecInfos = !!ki && await poser(ki, "pro-infos");
    if (avecInfos) texte = texte ? `${texte}\n\n${section}` : section;
    if (!texte) { await rendre(k).catch(() => null); bilan.ignores++; continue; }
    // Reglages obligatoires pas faits : le programme part quand meme (reglages par defaut), avec UNE ligne
    // courte, une fois par jour au plus (cle du jour posee dans pro_envois avant l'envoi).
    const kr = diffusion.programme && a.reglagesAFaire ? cleRappelReglages(heureDeParis(maintenant()).date, a.user_id) : null;
    const avecRappel = !!kr && await poser(kr, "pro-rappel-reglages");
    if (avecRappel) texte = `${texte}\n\n${rappelReglages(a.langue)}`;
    const silencieux = !a.prefs?.alertes?.nuit && estLaNuit(maintenant());
    let parti = null, morceaux = 0;
    try {
      for (const morceau of decouper(texte)) {
        if (!premier && pause > 0) await attendre(pause);
        premier = false;
        const r = await envoyerAvecReprise(envoyer, a.chat_id, morceau, { silencieux }, attendre);
        parti ||= r;
        morceaux++;
      }
      bilan.envoyes++;
      await noter(k, { user_id: a.user_id, statut: "envoye", message_id: parti?.message_id ?? null, envoye_at: maintenant().toISOString() }).catch(() => null);
    } catch (e) {
      const s = statut(e);
      if (s === 403) {
        // Le robot est bloque (ou le compte Telegram supprime) : marque, plus aucun envoi, les autres continuent.
        bilan.bloques++;
        await bloquer(a.user_id).catch(() => null);
        await noter(k, { user_id: a.user_id, statut: "bloque", message_id: null, envoye_at: null }).catch(() => null);
      } else if ((s === 400 || s === 429) && !morceaux) {
        // Refus sur : rien n'est parti, la cle est rendue (nouvel essai au tour suivant).
        bilan.refuses++;
        await rendre(k).catch(() => null);
        if (avecInfos) await rendre(ki).catch(() => null);
        if (avecRappel) await rendre(kr).catch(() => null);
      } else {
        // Incertain (502, coupure, ou une partie seulement est partie) : la cle reste, jamais de doublon.
        bilan.incertains++;
        await noter(k, { user_id: a.user_id, statut: "incertain", message_id: parti?.message_id ?? null, envoye_at: null }).catch(() => null);
      }
      log(`message Pro ${cle} a ${a.user_id} : ${e?.message || e}`);
    }
  }
  return bilan;
}

/**
 * Textes prepares (« pro_textes:<cle> », JSON) -> diffusion (« diffusion:<cle> », JSON) au moment de l'envoi :
 * la validite « duree_h » compte A PARTIR DE L'ENVOI (un bilan envoye le lendemain reste valable) ;
 * une heure fixe (« expire », ex. cloture du Loto Foot) est gardee.
 */
export function versDiffusion(valeur, maintenant) {
  let x;
  try { x = typeof valeur === "string" ? JSON.parse(valeur) : { ...valeur }; } catch { return null; }
  if (!x.expire) x.expire = new Date(new Date(maintenant).getTime() + (Number(x.duree_h) || 12) * 3600e3).toISOString();
  delete x.duree_h;
  return JSON.stringify(x);
}
/** Fin de validite d'une diffusion (rattrapage) : paris = premier coup d'envoi ; sinon 12 h. */
export function finDiffusion(maintenant, paris = []) {
  const kos = paris.map((p) => Date.parse(p.coup_envoi)).filter((x) => Number.isFinite(x));
  return new Date(kos.length ? Math.min(...kos) : new Date(maintenant).getTime() + 12 * 3600e3).toISOString();
}
/** « Envoyé à 3 abonnés Pro » (+ bloques, refus, incertains) : note INTERNE pour Clement. */
export function resumeDiffusion(b) {
  const pl = (n, s, p = s + "s") => `${n} ${n > 1 ? p : s}`;
  return `envoyé à ${pl(b.envoyes, "abonné")} Pro`
    + (b.bloques ? `, ${pl(b.bloques, "abonné")} ${b.bloques > 1 ? "ont" : "a"} bloqué le robot` : "")
    + (b.refuses ? `, ${b.refuses} refusé${b.refuses > 1 ? "s" : ""} par Telegram (nouvel essai au prochain tour)` : "")
    + (b.incertains ? `, ${b.incertains} incertain${b.incertains > 1 ? "s" : ""} (jamais renvoyé${b.incertains > 1 ? "s" : ""})` : "")
    + (b.differes ? `, ${pl(b.differes, "abonné")} à ${b.differes > 1 ? "leur" : "son"} heure d'envoi choisie` : "");
}
