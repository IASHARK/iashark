// IASHARK — deux robots Telegram (03/10/2026, decision de Clement).
// Logique PURE (aucun appel reseau) : utilisee par l'Edge Function telegram-bot (Deno) et par les tests (Node).
//
// 1. « IASHARK Pro » (jeton TELEGRAM_BOT_TOKEN) : il ENVOIE seulement (programme du jour, alertes,
//    compositions, debriefs, bilan), accueille l'abonne (questionnaire a boutons) et garde /start
//    (liaison du compte), /reglages, /langue (/idioma…). On ne peut PAS lui poser de question : tout
//    texte libre d'un utilisateur (hors Clement) recoit une reponse courte dans SA langue, qui renvoie
//    vers le robot Contact, et rien n'est transfere a Clement.
// 2. « IASHARK Contact » (jeton TELEGRAM_CONTACT_BOT_TOKEN, facultatif) : seulement pour les questions.
//    Tout message d'une personne est transfere a Clement ; sa reponse (« Repondre ») repart chez elle
//    par le robot Contact.
// Sans jeton Contact : le robot Pro marche seul, et sa reponse automatique donne l'adresse e-mail.
//
// Les deux robots arrivent sur la MEME Edge Function : chacun a son webhook (?robot=contact pour le
// Contact) ET son propre secret (derive de son jeton). Il faut les deux pour etre reconnu.
import { normaliserLangue } from "./canal-pro-langues.mjs";

export const EMAIL_CONTACT = "contact@iashark.com";
export const PRO = "pro";
export const CONTACT = "contact";

/**
 * Quel robot a recu cette mise a jour ? « pro », « contact », ou null (refusee).
 * parametre : ?robot= de l'adresse du webhook ; secretRecu : en-tete X-Telegram-Bot-Api-Secret-Token.
 */
export function quelRobot({ parametre, secretRecu, secretPro, secretContact, contactActif }) {
  const recu = String(secretRecu || "");
  if (!recu) return null;
  if (parametre === CONTACT) return contactActif && secretContact && recu === secretContact ? CONTACT : null;
  if (parametre) return null; // parametre inconnu : refuse
  return secretPro && recu === secretPro ? PRO : null;
}

/** Nom d'utilisateur Telegram valide (sans @) : 5 a 32 lettres, chiffres ou _. */
export const nomValide = (nom) => /^[A-Za-z0-9_]{5,32}$/.test(String(nom || ""));
/** Lien du robot Contact, ou null s'il n'y a pas de robot Contact. */
export const lienContact = (nom) => (nomValide(nom) ? `https://t.me/${nom}` : null);

const TEXTES = {
  fr: {
    seulement: "Ici je t'envoie seulement tes messages Pro.",
    question: (lien) => `Une question ? Écris à IASHARK Contact : ${lien}`,
    questionEmail: (email) => `Une question ? Écris-nous à ${email}`,
    accueilContact: "Bonjour, ici l'équipe IASHARK. Écris ta question ici, on te répond dans cette conversation.",
    accueilPro: "Bonjour, ici IASHARK Pro : ce robot envoie aux abonnés Pro leurs messages, en privé (programme du jour, alertes, débriefs).\n\nAbonné Pro ? Ouvre ton robot depuis la page Compte du site : ton compte est relié en un clic.",
    inactif: "Ton abonnement Pro n'est plus actif : le robot personnel est en pause (tu peux le reprendre depuis la page Compte du site).",
  },
  es: {
    seulement: "Aquí solo te envío tus mensajes Pro.",
    question: (lien) => `¿Una pregunta? Escribe a IASHARK Contact: ${lien}`,
    questionEmail: (email) => `¿Una pregunta? Escríbenos a ${email}`,
    accueilContact: "Hola, aquí el equipo IASHARK. Escribe tu pregunta aquí, te respondemos en esta conversación.",
    accueilPro: "Hola, aquí IASHARK Pro: este robot envía a los suscriptores Pro sus mensajes, en privado (programa del día, alertas, resúmenes).\n\n¿Eres suscriptor Pro? Abre tu robot desde la página Cuenta del sitio: tu cuenta se vincula en un clic.",
    inactif: "Tu suscripción Pro ya no está activa: el robot personal está en pausa (puedes reanudarlo desde la página Cuenta del sitio).",
  },
  en: {
    seulement: "Here I only send you your Pro messages.",
    question: (lien) => `A question? Write to IASHARK Contact: ${lien}`,
    questionEmail: (email) => `A question? Email us at ${email}`,
    accueilContact: "Hello, this is the IASHARK team. Write your question here, we'll reply in this conversation.",
    accueilPro: "Hello, this is IASHARK Pro: this robot sends Pro subscribers their messages, privately (programme of the day, alerts, debriefs).\n\nPro subscriber? Open your robot from the Account page of the site: your account is linked in one click.",
    inactif: "Your Pro subscription is no longer active: the personal robot is paused (you can resume it from the Account page of the site).",
  },
  de: {
    seulement: "Hier schicke ich dir nur deine Pro-Nachrichten.",
    question: (lien) => `Eine Frage? Schreib an IASHARK Contact: ${lien}`,
    questionEmail: (email) => `Eine Frage? Schreib uns an ${email}`,
    accueilContact: "Hallo, hier ist das IASHARK-Team. Schreib deine Frage hier, wir antworten dir in diesem Chat.",
    accueilPro: "Hallo, hier ist IASHARK Pro: dieser Roboter schickt Pro-Abonnenten ihre Nachrichten, privat (Programm des Tages, Alarme, Auswertungen).\n\nPro-Abonnent? Öffne deinen Roboter auf der Seite Konto der Website: dein Konto wird mit einem Klick verknüpft.",
    inactif: "Dein Pro-Abo ist nicht mehr aktiv: der persönliche Roboter pausiert (du kannst ihn auf der Seite Konto der Website wieder starten).",
  },
  it: {
    seulement: "Qui ti invio solo i tuoi messaggi Pro.",
    question: (lien) => `Una domanda? Scrivi a IASHARK Contact: ${lien}`,
    questionEmail: (email) => `Una domanda? Scrivici a ${email}`,
    accueilContact: "Ciao, qui è il team IASHARK. Scrivi la tua domanda qui, ti rispondiamo in questa conversazione.",
    accueilPro: "Ciao, qui è IASHARK Pro: questo robot invia agli abbonati Pro i loro messaggi, in privato (programma del giorno, avvisi, resoconti).\n\nSei abbonato Pro? Apri il tuo robot dalla pagina Account del sito: il tuo account si collega con un clic.",
    inactif: "Il tuo abbonamento Pro non è più attivo: il robot personale è in pausa (puoi riattivarlo dalla pagina Account del sito).",
  },
  pt: {
    seulement: "Aqui só te envio as tuas mensagens Pro.",
    question: (lien) => `Uma pergunta? Escreve ao IASHARK Contact: ${lien}`,
    questionEmail: (email) => `Uma pergunta? Escreve-nos para ${email}`,
    accueilContact: "Olá, aqui é a equipa IASHARK. Escreve a tua pergunta aqui, respondemos nesta conversa.",
    accueilPro: "Olá, aqui é o IASHARK Pro: este robot envia aos subscritores Pro as suas mensagens, em privado (programa do dia, alertas, resumos).\n\nÉs subscritor Pro? Abre o teu robot na página Conta do site: a tua conta fica ligada num clique.",
    inactif: "A tua subscrição Pro já não está ativa: o robot pessoal está em pausa (podes retomá-lo na página Conta do site).",
  },
};
const T = (lang) => TEXTES[normaliserLangue(lang) || "fr"];

/** « Une question ? Écris à IASHARK Contact : https://t.me/… » (sans robot Contact : l'adresse e-mail). */
export function ligneQuestion(lang, nomContact) {
  const lien = lienContact(nomContact);
  return lien ? T(lang).question(lien) : T(lang).questionEmail(EMAIL_CONTACT);
}
/** Reponse automatique du robot Pro a tout texte libre (texte simple, pas de HTML). */
export function reponseAutoPro(lang, nomContact) {
  return `${T(lang).seulement} ${ligneQuestion(lang, nomContact)}`;
}
/** /start au robot Pro d'une personne dont le compte n'est pas relie. */
export function accueilPro(lang, nomContact) {
  return `${T(lang).accueilPro}\n\n${ligneQuestion(lang, nomContact)}`;
}
/** /start au robot Contact. */
export const accueilContact = (lang) => T(lang).accueilContact;
/** Ex-abonne (abonnement termine) qui ecrit une commande au robot Pro. */
export function inactifPro(lang, nomContact) {
  return `${T(lang).inactif}\n\n${ligneQuestion(lang, nomContact)}`;
}

/** Aide de Clement dans sa conversation avec le robot Contact. */
export const AIDE_ADMIN_CONTACT = "Robot IASHARK Contact.\n\n• Quand quelqu'un écrit à ce robot, son message vous arrive ici : faites « Répondre » dessus, votre réponse lui est envoyée par ce robot.\n• Tout le reste (programme Pro, publication sur le canal gratuit, /canalpro, /automatique) se passe dans votre conversation avec le robot IASHARK Pro.";
