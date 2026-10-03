// IASHARK — parcours d'accueil du robot Telegram (02/10/2026, demande de Clement).
// Quand un abonne Pro relie son compte (clic « Ouvrir mon robot sur Telegram » dans son espace),
// le robot lui souhaite la bienvenue dans SA langue, puis lui pose ses questions UNE PAR UNE,
// avec des boutons seulement : langue, pays, bookmakers (autorises dans son pays seulement),
// competitions preferees (pour l'information seulement), alertes, heure du programme. Chaque reponse
// est ecrite dans les MEMES tables que le questionnaire du site : user_preferences.language et
// pro_preferences (pays, bookmakers, alertes, heure_envoi ; competitions : 0045 et 0049). « Plus tard »
// a chaque etape.
// DECISION DE CLEMENT (03/10/2026) : plus de choix de strategie ni de types de paris (les paris sont les
// MEMES pour tous) ; les competitions preferees servent seulement a l'info (matchs du jour, resultats).
// Aucun regulateur cite : « autorises dans ton pays ».
// A la fin : recapitulatif et « /reglages pour changer a tout moment ». Un abonne deja passe par
// l'accueil (telegram_abonnes.reglages.accueil) ne refait pas le questionnaire.
//
// Ce que le robot NE demande PAS, parce que le code ne s'en sert pas (pas de fausse promesse) : les
// marches, les types de paris, une strategie : le menu choisit les paris, les memes pour tous.
// Pays : 'fr' et 'es' (ouverts : bookmakers autorises du pays) ; Belgique et Suisse sont enregistrees
// 'autre' (pas encore ouvertes), avec un message honnete. Aucune mise, aucune promesse de gain, seulement des bookmakers agrees.
// Logique PURE (aucun appel reseau) : utilisee par supabase/functions/telegram-bot (Deno).
import { BOOKMAKERS_AGREES, COMPETITIONS, COMPETITIONS_PRO, GROUPES_COMPETITIONS, nomCompetition, esc } from "./canal-pro.mjs";
import { LANGUES, NOMS_LANGUES, normaliserLangue, textes } from "./canal-pro-langues.mjs";

/** Etapes, dans l'ordre. bk : seulement si le pays est ouvert (France, Espagne). hr : heure du programme. */
export const ETAPES = Object.freeze(["lg", "py", "bk", "co", "al", "hr"]);
/** Heures proposees (heure de Paris), les memes que le site (lib/pro-preferences.js#HEURES_ENVOI) ; 0 = des qu'il est pret. */
export const HEURES_ACCUEIL = Object.freeze([0, 9, 10, 11, 12, 14, 17]);
export const PAYS_ACCUEIL = Object.freeze(["fr", "be", "ch", "es", "autre"]);
/**
 * Pays choisi -> valeur de pro_preferences.pays. Pays OUVERT (bookmakers agrees du pays : France, et
 * Espagne depuis le 02/10/2026, operateurs DGOJ) : son code (« es » demande la migration 0044) ; sinon
 * « autre » (Belgique, Suisse : pas encore ouverts).
 */
export const paysEnBase = (c) => (BOOKMAKERS_AGREES[String(c).toUpperCase()] ? c : "autre");
export const ALERTES_OUI = Object.freeze(["seuil", "hausse", "compositions", "meteo"]);
const paysOuvert = (prefs) => !!BOOKMAKERS_AGREES[prefs?.pays];
export const etapesPour = (prefs) => ETAPES.filter((e) => e !== "bk" || paysOuvert(prefs));

const T = {
  fr: {
    bienvenue: (prenom, langue, ouvert) => `<b>C'est fait${prenom ? `, ${prenom}` : ""} : ton compte est relié.</b> Bienvenue, et merci de faire confiance à IASHARK !\n\n`
      + `Ici, en privé et en ${langue}, tu recevras :\n• le programme du jour, vers 9 h 30, après sa validation (les jours où il y en a un) ;\n• les compositions et les mouvements de cote de tes paris (jamais la nuit, sauf si tu le demandes) ;\n• les débriefs (matin et soir) et le bilan du lundi.\nPas de canal à rejoindre : tout arrive dans cette conversation.`
      // Une seule fois, a la bienvenue (demande de Clement, 03/10/2026) : pas des conseils, aucune mise conseillee.
      + "\n\nIASHARK publie des analyses et des probabilités calculées : ce ne sont pas des conseils de paris, aucune mise n'est jamais conseillée, et chacun décide seul."
      + (ouvert ? "" : "\n\nLes envois Pro ouvrent très bientôt : d'ici là, je ne t'envoie rien.")
      + "\n\nQuelques questions rapides pour tout régler (tu peux passer avec « Plus tard »).",
    retour: (prenom) => `Re-bonjour${prenom ? ` ${prenom}` : ""} : ton compte est toujours relié. Tout arrive ici, en privé. /reglages pour changer tes réglages à tout moment.`,
    num: (i, n) => `${i}/${n} · `,
    lg: (langue) => `Ta langue : je t'écris en ${langue}. On garde ?`, garder: (langue) => `Garder ${langue}`,
    py: "Ton pays ? (pour te montrer seulement les bookmakers autorisés chez toi)",
    pays: { fr: "France", be: "Belgique", ch: "Suisse", es: "Espagne", autre: "Autre pays" },
    pasOuvert: "Ton pays n'est pas encore ouvert : je ne te montre aucun bookmaker pour l'instant (seulement ceux autorisés chez toi, dès qu'ils seront prêts). Tu reçois quand même le programme, les débriefs et le bilan.",
    bk: "Tes bookmakers (autorisés dans ton pays) : coche ceux où tu as un compte, puis « Valider ». Aucun coché = tous ceux que nous suivons.",
    co: "Tes compétitions préférées, pour info : à la fin du programme, je te liste leurs matchs du jour (avec le lien vers l'analyse), et le lendemain matin leurs résultats. Les paris, eux, sont les mêmes pour tous. Coche-les, puis « Valider » (« Toutes » = pas de liste à part).",
    hr: "À quelle heure veux-tu recevoir ton programme ? (heure de Paris ; « Dès qu'il est prêt » = vers 9 h 30, après sa validation)", pret: "Dès qu'il est prêt", heure: (h) => `${h} h`,
    al: "Je te préviens quand ta cote bouge, quand les compositions tombent et quand la météo est forte (jamais la nuit) ?",
    valider: "Valider", toutes: "Toutes", oui: "Oui", non: "Non", plusTard: "Plus tard",
    plusTardTxt: "Pas de souci : tu pourras tout régler plus tard avec /reglages. En attendant, tu reçois tout par défaut (tous les bookmakers agréés que nous suivons, toutes les compétitions, alertes allumées).",
    fin: "<b>C'est réglé !</b> Récapitulatif :", finPied: "/reglages pour changer à tout moment.",
    r: { langue: "Langue", pays: "Pays", bk: "Bookmakers", co: "Compétitions (pour info)", al: "Alertes", hr: "Heure du programme" },
    tousBk: "tous ceux que nous suivons", aucunBk: "aucun tant que ton pays n'est pas ouvert", toutesCo: "toutes",
    pasEnregistre: "Pas enregistré : on passe à la suite (tu pourras le régler avec /reglages).",
  },
  es: {
    bienvenue: (prenom, langue, ouvert) => `<b>Hecho${prenom ? `, ${prenom}` : ""}: tu cuenta está vinculada.</b> ¡Bienvenido/a y gracias por confiar en IASHARK!\n\n`
      + `Aquí, en privado y en ${langue}, recibirás:\n• el programa del día, hacia las 9:30 (hora de París), después de su validación (los días en que haya uno);\n• las alineaciones y los movimientos de cuota de tus apuestas (nunca de noche, salvo que lo pidas);\n• los resúmenes (mañana y noche) y el balance del lunes.\nNo hay ningún canal al que unirse: todo llega a esta conversación.`
      // Une seule fois, a la bienvenue (demande de Clement, 03/10/2026) : pas des conseils, aucune mise conseillee.
      + "\n\nIASHARK publica análisis y probabilidades calculadas: no son consejos de apuestas, nunca se aconseja ningún importe y cada uno decide por sí mismo."
      + (ouvert ? "" : "\n\nLos envíos Pro abren muy pronto: hasta entonces no te envío nada.")
      + "\n\nUnas preguntas rápidas para ajustarlo todo (puedes saltarlas con «Más tarde»).",
    retour: (prenom) => `Hola de nuevo${prenom ? ` ${prenom}` : ""}: tu cuenta sigue vinculada. Todo llega aquí, en privado. /ajustes para cambiar tus ajustes cuando quieras.`,
    num: (i, n) => `${i}/${n} · `,
    lg: (langue) => `Tu idioma: te escribo en ${langue}. ¿Lo mantenemos?`, garder: (langue) => `Mantener ${langue}`,
    py: "¿Tu país? (para mostrarte solo las casas de apuestas autorizadas allí)",
    pays: { fr: "Francia", be: "Bélgica", ch: "Suiza", es: "España", autre: "Otro país" },
    pasOuvert: "Tu país aún no está abierto: por ahora no te muestro ninguna casa de apuestas (solo las autorizadas allí, en cuanto estén listas). Aun así recibes el programa, los resúmenes y el balance.",
    bk: "Tus casas de apuestas (autorizadas en tu país): marca aquellas en las que tienes cuenta y pulsa «Validar». Ninguna marcada = todas las que seguimos.",
    co: "Tus competiciones preferidas, solo para información: al final del programa te listo sus partidos del día (con el enlace al análisis) y, a la mañana siguiente, sus resultados. Las apuestas son las mismas para todos. Márcalas y pulsa «Validar» («Todas» = sin lista aparte).",
    hr: "¿A qué hora quieres recibir tu programa? (hora de París; «En cuanto esté listo» = hacia las 9:30, después de su validación)", pret: "En cuanto esté listo", heure: (h) => `${h}:00`,
    al: "¿Te aviso cuando tu cuota cambie, cuando salgan las alineaciones y cuando haga un tiempo extremo (nunca de noche)?",
    valider: "Validar", toutes: "Todas", oui: "Sí", non: "No", plusTard: "Más tarde",
    plusTardTxt: "Sin problema: podrás ajustarlo todo más tarde con /ajustes. Mientras tanto lo recibes todo por defecto (todas las casas autorizadas que seguimos, todas las competiciones, alertas activadas).",
    fin: "<b>¡Listo!</b> Resumen:", finPied: "/ajustes para cambiarlo cuando quieras.",
    r: { langue: "Idioma", pays: "País", bk: "Casas de apuestas", co: "Competiciones (solo información)", al: "Alertas", hr: "Hora del programa" },
    tousBk: "todas las que seguimos", aucunBk: "ninguna mientras tu país no esté abierto", toutesCo: "todas",
    pasEnregistre: "No guardado: pasamos a lo siguiente (podrás ajustarlo con /ajustes).",
  },
  en: {
    bienvenue: (prenom, langue, ouvert) => `<b>Done${prenom ? `, ${prenom}` : ""}: your account is linked.</b> Welcome, and thank you for trusting IASHARK!\n\n`
      + `Here, privately and in ${langue}, you will receive:\n• the programme of the day, around 9:30 (Paris time), after it is approved (on days when there is one);\n• line-ups and odds movements for your bets (never at night, unless you ask);\n• the debriefs (morning and evening) and Monday's weekly summary.\nNo channel to join: everything comes to this chat.`
      // Une seule fois, a la bienvenue (demande de Clement, 03/10/2026) : pas des conseils, aucune mise conseillee.
      + "\n\nIASHARK publishes analyses and calculated probabilities: they are not betting advice, no stake is ever suggested, and everyone decides for themselves."
      + (ouvert ? "" : "\n\nPro messages open very soon: until then, I send you nothing.")
      + "\n\nA few quick questions to set everything up (you can skip with “Later”).",
    retour: (prenom) => `Hello again${prenom ? ` ${prenom}` : ""}: your account is still linked. Everything comes here, privately. /settings to change your settings at any time.`,
    num: (i, n) => `${i}/${n} · `,
    lg: (langue) => `Your language: I write to you in ${langue}. Keep it?`, garder: (langue) => `Keep ${langue}`,
    py: "Your country? (so I only show you the bookmakers licensed there)",
    pays: { fr: "France", be: "Belgium", ch: "Switzerland", es: "Spain", autre: "Other country" },
    pasOuvert: "Your country is not open yet: I show you no bookmaker for now (only the ones licensed there, as soon as they are ready). You still get the programme, the debriefs and the weekly summary.",
    bk: "Your bookmakers (licensed in your country): tick the ones where you have an account, then “Confirm”. None ticked = all the ones we follow.",
    co: "Your favourite competitions, for information: at the end of the programme I list their matches of the day (with the link to the analysis), and the next morning their results. The bets are the same for everyone. Tick them, then “Confirm” (“All” = no separate list).",
    hr: "What time do you want to receive your programme? (Paris time; “As soon as it's ready” = around 9:30, after approval)", pret: "As soon as it's ready", heure: (h) => `${h}:00`,
    al: "Shall I tell you when your odds move, when line-ups come out and when the weather is extreme (never at night)?",
    valider: "Confirm", toutes: "All", oui: "Yes", non: "No", plusTard: "Later",
    plusTardTxt: "No problem: you can set everything later with /settings. Meanwhile you get everything by default (all the licensed bookmakers we follow, all competitions, alerts on).",
    fin: "<b>All set!</b> Summary:", finPied: "/settings to change it at any time.",
    r: { langue: "Language", pays: "Country", bk: "Bookmakers", co: "Competitions (for information)", al: "Alerts", hr: "Programme time" },
    tousBk: "all the ones we follow", aucunBk: "none while your country is not open", toutesCo: "all",
    pasEnregistre: "Not saved: moving on (you can set it with /settings).",
  },
  de: {
    bienvenue: (prenom, langue, ouvert) => `<b>Erledigt${prenom ? `, ${prenom}` : ""}: dein Konto ist verknüpft.</b> Willkommen, und danke für dein Vertrauen in IASHARK!\n\n`
      + `Hier bekommst du privat und auf ${langue}:\n• das Tagesprogramm, gegen 9:30 (Pariser Zeit), nach der Freigabe (an Tagen mit Programm);\n• Aufstellungen und Quotenbewegungen deiner Wetten (nie nachts, außer du willst es);\n• die Auswertungen (morgens und abends) und die Wochenbilanz am Montag.\nKein Kanal zum Beitreten: alles kommt in diesen Chat.`
      // Une seule fois, a la bienvenue (demande de Clement, 03/10/2026) : pas des conseils, aucune mise conseillee.
      + "\n\nIASHARK veröffentlicht Analysen und berechnete Wahrscheinlichkeiten: Das sind keine Wetttipps, es wird nie ein Einsatz empfohlen, und jeder entscheidet selbst."
      + (ouvert ? "" : "\n\nDie Pro-Nachrichten starten sehr bald: bis dahin schicke ich dir nichts.")
      + "\n\nEin paar kurze Fragen, um alles einzustellen (mit „Später“ kannst du sie überspringen).",
    retour: (prenom) => `Hallo nochmal${prenom ? ` ${prenom}` : ""}: dein Konto ist weiterhin verknüpft. Alles kommt hier privat an. /einstellungen, um deine Einstellungen jederzeit zu ändern.`,
    num: (i, n) => `${i}/${n} · `,
    lg: (langue) => `Deine Sprache: ich schreibe dir auf ${langue}. Beibehalten?`, garder: (langue) => `${langue} behalten`,
    py: "Dein Land? (damit ich dir nur die dort zugelassenen Buchmacher zeige)",
    pays: { fr: "Frankreich", be: "Belgien", ch: "Schweiz", es: "Spanien", autre: "Anderes Land" },
    pasOuvert: "Dein Land ist noch nicht freigeschaltet: im Moment zeige ich dir keinen Buchmacher (nur die dort zugelassenen, sobald sie bereit sind). Programm, Auswertungen und Wochenbilanz bekommst du trotzdem.",
    bk: "Deine Buchmacher (in deinem Land zugelassen): markiere die, bei denen du ein Konto hast, dann „Bestätigen“. Keiner markiert = alle, die wir verfolgen.",
    co: "Deine Lieblingswettbewerbe, nur zur Info: am Ende des Programms liste ich ihre Spiele des Tages auf (mit Link zur Analyse) und am nächsten Morgen ihre Ergebnisse. Die Wetten sind für alle gleich. Markiere sie, dann „Bestätigen“ („Alle“ = keine eigene Liste).",
    hr: "Um wie viel Uhr möchtest du dein Programm bekommen? (Pariser Zeit; „Sobald es fertig ist“ = gegen 9:30, nach der Freigabe)", pret: "Sobald es fertig ist", heure: (h) => `${h}:00`,
    al: "Soll ich dir Bescheid geben, wenn sich deine Quote bewegt, wenn die Aufstellungen kommen und wenn das Wetter extrem ist (nie nachts)?",
    valider: "Bestätigen", toutes: "Alle", oui: "Ja", non: "Nein", plusTard: "Später",
    plusTardTxt: "Kein Problem: du kannst alles später mit /einstellungen festlegen. Bis dahin bekommst du alles mit den Standardwerten (alle zugelassenen Buchmacher, die wir verfolgen, alle Wettbewerbe, Hinweise an).",
    fin: "<b>Fertig!</b> Zusammenfassung:", finPied: "/einstellungen, um es jederzeit zu ändern.",
    r: { langue: "Sprache", pays: "Land", bk: "Buchmacher", co: "Wettbewerbe (nur zur Info)", al: "Hinweise", hr: "Uhrzeit des Programms" },
    tousBk: "alle, die wir verfolgen", aucunBk: "keiner, solange dein Land nicht freigeschaltet ist", toutesCo: "alle",
    pasEnregistre: "Nicht gespeichert: weiter geht's (du kannst es mit /einstellungen festlegen).",
  },
  it: {
    bienvenue: (prenom, langue, ouvert) => `<b>Fatto${prenom ? `, ${prenom}` : ""}: il tuo account è collegato.</b> Benvenuto/a, e grazie di fidarti di IASHARK!\n\n`
      + `Qui, in privato e in ${langue}, riceverai:\n• il programma del giorno, verso le 9:30 (ora di Parigi), dopo la convalida (nei giorni in cui c'è);\n• le formazioni e i movimenti di quota delle tue scommesse (mai di notte, salvo tua richiesta);\n• i resoconti (mattina e sera) e il bilancio del lunedì.\nNessun canale a cui unirsi: tutto arriva in questa chat.`
      // Une seule fois, a la bienvenue (demande de Clement, 03/10/2026) : pas des conseils, aucune mise conseillee.
      + "\n\nIASHARK pubblica analisi e probabilità calcolate: non sono consigli di scommessa, non viene mai consigliata nessuna puntata e ognuno decide da sé."
      + (ouvert ? "" : "\n\nGli invii Pro aprono molto presto: fino ad allora non ti invio nulla.")
      + "\n\nQualche domanda veloce per sistemare tutto (puoi saltarle con «Più tardi»).",
    retour: (prenom) => `Ciao di nuovo${prenom ? ` ${prenom}` : ""}: il tuo account è ancora collegato. Tutto arriva qui, in privato. /impostazioni per cambiare le tue impostazioni quando vuoi.`,
    num: (i, n) => `${i}/${n} · `,
    lg: (langue) => `La tua lingua: ti scrivo in ${langue}. La teniamo?`, garder: (langue) => `Tieni ${langue}`,
    py: "Il tuo paese? (per mostrarti solo i bookmaker autorizzati lì)",
    pays: { fr: "Francia", be: "Belgio", ch: "Svizzera", es: "Spagna", autre: "Altro paese" },
    pasOuvert: "Il tuo paese non è ancora aperto: per ora non ti mostro nessun bookmaker (solo quelli autorizzati lì, appena saranno pronti). Ricevi comunque il programma, i resoconti e il bilancio.",
    bk: "I tuoi bookmaker (autorizzati nel tuo paese): seleziona quelli dove hai un conto, poi «Conferma». Nessuno selezionato = tutti quelli che seguiamo.",
    co: "Le tue competizioni preferite, solo per informazione: alla fine del programma ti elenco le loro partite del giorno (con il link all'analisi) e la mattina dopo i risultati. Le scommesse sono le stesse per tutti. Selezionale, poi «Conferma» («Tutte» = nessuna lista a parte).",
    hr: "A che ora vuoi ricevere il tuo programma? (ora di Parigi; «Appena è pronto» = verso le 9:30, dopo la convalida)", pret: "Appena è pronto", heure: (h) => `${h}:00`,
    al: "Ti avviso quando la tua quota cambia, quando escono le formazioni e quando il meteo è estremo (mai di notte)?",
    valider: "Conferma", toutes: "Tutte", oui: "Sì", non: "No", plusTard: "Più tardi",
    plusTardTxt: "Nessun problema: potrai sistemare tutto più tardi con /impostazioni. Intanto ricevi tutto con le impostazioni predefinite (tutti i bookmaker autorizzati che seguiamo, tutte le competizioni, avvisi attivi).",
    fin: "<b>Fatto!</b> Riepilogo:", finPied: "/impostazioni per cambiarlo quando vuoi.",
    r: { langue: "Lingua", pays: "Paese", bk: "Bookmaker", co: "Competizioni (solo informazione)", al: "Avvisi", hr: "Ora del programma" },
    tousBk: "tutti quelli che seguiamo", aucunBk: "nessuno finché il tuo paese non è aperto", toutesCo: "tutte",
    pasEnregistre: "Non salvato: passiamo oltre (potrai sistemarlo con /impostazioni).",
  },
  pt: {
    bienvenue: (prenom, langue, ouvert) => `<b>Feito${prenom ? `, ${prenom}` : ""}: a tua conta está ligada.</b> Bem-vindo/a, e obrigado por confiares na IASHARK!\n\n`
      + `Aqui, em privado e em ${langue}, vais receber:\n• o programa do dia, por volta das 9:30 (hora de Paris), depois da validação (nos dias em que houver);\n• os onzes e os movimentos de odds das tuas apostas (nunca à noite, salvo se pedires);\n• os resumos (manhã e noite) e o balanço de segunda-feira.\nNão há canal para entrar: tudo chega a esta conversa.`
      // Une seule fois, a la bienvenue (demande de Clement, 03/10/2026) : pas des conseils, aucune mise conseillee.
      + "\n\nA IASHARK publica análises e probabilidades calculadas: não são conselhos de apostas, nunca é aconselhado nenhum valor de aposta e cada um decide por si."
      + (ouvert ? "" : "\n\nOs envios Pro abrem muito em breve: até lá, não te envio nada.")
      + "\n\nAlgumas perguntas rápidas para acertar tudo (podes saltar com «Mais tarde»).",
    retour: (prenom) => `Olá de novo${prenom ? ` ${prenom}` : ""}: a tua conta continua ligada. Tudo chega aqui, em privado. /definicoes para mudar as tuas definições a qualquer momento.`,
    num: (i, n) => `${i}/${n} · `,
    lg: (langue) => `A tua língua: escrevo-te em ${langue}. Mantemos?`, garder: (langue) => `Manter ${langue}`,
    py: "O teu país? (para te mostrar só as casas de apostas autorizadas aí)",
    pays: { fr: "França", be: "Bélgica", ch: "Suíça", es: "Espanha", autre: "Outro país" },
    pasOuvert: "O teu país ainda não está aberto: por agora não te mostro nenhuma casa de apostas (só as autorizadas aí, assim que estiverem prontas). Recebes na mesma o programa, os resumos e o balanço.",
    bk: "As tuas casas de apostas (autorizadas no teu país): marca aquelas onde tens conta e depois «Confirmar». Nenhuma marcada = todas as que seguimos.",
    co: "As tuas competições preferidas, só para informação: no fim do programa listo os jogos do dia (com o link para a análise) e, na manhã seguinte, os resultados. As apostas são as mesmas para todos. Marca-as e depois «Confirmar» («Todas» = sem lista à parte).",
    hr: "A que horas queres receber o teu programa? (hora de Paris; «Assim que estiver pronto» = por volta das 9:30, depois da validação)", pret: "Assim que estiver pronto", heure: (h) => `${h}:00`,
    al: "Aviso-te quando a tua odd mexer, quando saírem os onzes e quando o tempo for extremo (nunca à noite)?",
    valider: "Confirmar", toutes: "Todas", oui: "Sim", non: "Não", plusTard: "Mais tarde",
    plusTardTxt: "Sem problema: podes acertar tudo mais tarde com /definicoes. Entretanto recebes tudo por defeito (todas as casas licenciadas que seguimos, todas as competições, alertas ligados).",
    fin: "<b>Está feito!</b> Resumo:", finPied: "/definicoes para mudar a qualquer momento.",
    r: { langue: "Língua", pays: "País", bk: "Casas de apostas", co: "Competições (só informação)", al: "Alertas", hr: "Hora do programa" },
    tousBk: "todas as que seguimos", aucunBk: "nenhuma enquanto o teu país não estiver aberto", toutesCo: "todas",
    pasEnregistre: "Não guardado: seguimos em frente (podes acertar isso com /definicoes).",
  },
};
const tx = (lang) => T[normaliserLangue(lang) || "fr"];
/** Nom de la langue dans une phrase (« en français », « en español », mais « in English », « auf Deutsch »). */
const nomDansPhrase = (lg) => (["en", "de"].includes(lg) ? NOMS_LANGUES[lg] : NOMS_LANGUES[lg].toLowerCase());
const coche = (oui, nom) => `${oui ? "✓ " : ""}${nom}`;
const lignes = (boutons, n = 2) => { const out = []; for (let i = 0; i < boutons.length; i += n) out.push(boutons.slice(i, i + n)); return out; };
const plusTard = (lang) => [{ text: tx(lang).plusTard, callback_data: "ac:x" }];

/** Message de bienvenue (avant la 1re question). ouvert = envois Pro ouverts par Clement. */
export function bienvenue(lang, { prenom = "", ouvert = false, questions = true } = {}) {
  const texte = tx(lang).bienvenue(prenom ? esc(prenom) : "", nomDansPhrase(normaliserLangue(lang) || "fr"), ouvert);
  // questions = false : reglages deja remplis sur le site (questionnaire Pro) : on retire la derniere
  // phrase (« Quelques questions rapides… ») et le robot envoie le recapitulatif a la place.
  return questions ? texte : texte.slice(0, texte.lastIndexOf("\n\n"));
}
/** Abonne qui relie de nouveau son compte apres l'accueil : pas de nouveau questionnaire. */
export const retour = (lang, prenom = "") => tx(lang).retour(prenom ? esc(prenom) : "");
export const texteSimple = (lang, cle) => tx(lang)[cle];

/** Question d'une etape : { text, reply_markup }. note = phrase avant la question (ex. pays pas encore ouvert). */
export function question(etape, prefs, lang, { note = "" } = {}) {
  const L = tx(lang), liste = etapesPour(prefs), i = liste.indexOf(etape) + 1;
  const tete = `${note ? note + "\n\n" : ""}${L.num(i, liste.length)}`;
  const lg = normaliserLangue(lang) || "fr";
  if (etape === "lg") {
    const autres = LANGUES.filter((l) => l !== lg).map((l) => ({ text: NOMS_LANGUES[l], callback_data: `ac:lg:${l}` }));
    return { text: tete + L.lg(nomDansPhrase(lg)), reply_markup: { inline_keyboard: [[{ text: L.garder(NOMS_LANGUES[lg]), callback_data: `ac:lg:${lg}` }], ...lignes(autres, 3), plusTard(lang)] } };
  }
  if (etape === "py") {
    return { text: tete + L.py, reply_markup: { inline_keyboard: [...lignes(PAYS_ACCUEIL.map((c) => ({ text: L.pays[c], callback_data: `ac:py:${c}` })), 2), plusTard(lang)] } };
  }
  if (etape === "bk") {
    const bks = (BOOKMAKERS_AGREES[prefs.pays] || []).filter((b) => b.suivi).map((b) => ({ text: coche(prefs.bookmakers.includes(b.cle), b.nom), callback_data: `ac:bk:${b.cle}` }));
    // Aucun regulateur cite (decision de Clement, 03/10/2026) : « autorises dans ton pays ».
    return { text: tete + L.bk, reply_markup: { inline_keyboard: [...lignes(bks, 2), [{ text: L.valider, callback_data: "ac:bk:ok" }], plusTard(lang)] } };
  }
  if (etape === "co") {
    // La MEME liste que le site, regroupee (competitions-pro.mjs) ; un bouton de groupe coche ou decoche tout le groupe.
    const mes = prefs.competitions || [];
    const rangs = [[{ text: coche(!mes.length, L.toutes), callback_data: "ac:co:tout" }]];
    for (const g of Object.keys(GROUPES_COMPETITIONS)) {
      const cs = COMPETITIONS_PRO.filter((c) => c.groupe === g);
      if (!cs.length) continue;
      const tous = cs.every((c) => mes.includes(c.cle));
      rangs.push([{ text: `${tous ? "✓ " : ""}— ${GROUPES_COMPETITIONS[g][lg] || GROUPES_COMPETITIONS[g].fr} —`, callback_data: `ac:co:g-${g}` }]);
      rangs.push(...lignes(cs.map((c) => ({ text: coche(mes.includes(c.cle), nomCompetition(c.cle, lg)), callback_data: `ac:co:${c.cle}` })), 2));
    }
    return { text: tete + L.co, reply_markup: { inline_keyboard: [...rangs, [{ text: L.valider, callback_data: "ac:co:ok" }], plusTard(lang)] } };
  }
  if (etape === "hr") {
    const h = prefs.heure_envoi ?? 0;
    const bt = HEURES_ACCUEIL.map((x) => ({ text: coche(h === x, x ? L.heure(x) : L.pret), callback_data: `ac:hr:${x}` }));
    return { text: tete + L.hr, reply_markup: { inline_keyboard: [[bt[0]], ...lignes(bt.slice(1), 3), plusTard(lang)] } };
  }
  if (etape === "al") {
    return { text: tete + L.al, reply_markup: { inline_keyboard: [[{ text: L.oui, callback_data: "ac:al:oui" }, { text: L.non, callback_data: "ac:al:non" }], plusTard(lang)] } };
  }
  return null;
}
/** Etape suivante (null = fin), d'apres les reglages a jour (pays). */
export function suivante(etape, prefs) {
  const liste = etapesPour(prefs);
  const i = liste.indexOf(etape);
  return i < 0 ? liste[0] : liste[i + 1] || null;
}

/**
 * Clic « ac:<etape>:<valeur> » -> ce qu'il faut ecrire et ou aller.
 * Renvoie { langue?, patch? (colonnes de pro_preferences), reste (true = meme etape, coche/decoche), note? }.
 * prefs = reglages effectifs (C.preferencesEffectives) AVANT le clic.
 */
export function appliquer(etape, valeur, prefs) {
  if (etape === "lg") { const l = normaliserLangue(valeur); return l ? { langue: l } : { reste: true }; }
  if (etape === "py") {
    if (!PAYS_ACCUEIL.includes(valeur)) return { reste: true };
    const pays = paysEnBase(valeur);
    // Changement de pays : les bookmakers d'un autre pays ne sont jamais gardes.
    return { patch: { pays, ...(pays !== String(prefs.pays).toLowerCase() || pays === "autre" ? { bookmakers: [] } : {}) }, note: pays === "autre" ? "pasOuvert" : "" };
  }
  if (etape === "bk") {
    if (valeur === "ok") return {};
    const suivis = (BOOKMAKERS_AGREES[prefs.pays] || []).filter((b) => b.suivi).map((b) => b.cle);
    if (!suivis.includes(valeur)) return { reste: true };
    const bk = prefs.bookmakers.includes(valeur) ? prefs.bookmakers.filter((x) => x !== valeur) : [...prefs.bookmakers, valeur];
    return { patch: { bookmakers: [...bk, ...(prefs.bookmakers_non_suivis || [])] }, reste: true };
  }
  if (etape === "co") {
    if (valeur === "ok") return {};
    const mes = prefs.competitions || [];
    // « Toutes » : pas de liste a part (vide). Les competitions ne changent jamais les paris (memes pour tous).
    if (valeur === "tout") return { patch: { competitions: [] }, reste: true };
    const ordre = (liste) => COMPETITIONS_PRO.map((c) => c.cle).filter((k) => liste.includes(k));
    if (String(valeur).startsWith("g-")) {
      const cs = COMPETITIONS_PRO.filter((c) => c.groupe === String(valeur).slice(2)).map((c) => c.cle);
      if (!cs.length) return { reste: true };
      const tous = cs.every((k) => mes.includes(k));
      return { patch: { competitions: ordre(tous ? mes.filter((k) => !cs.includes(k)) : [...mes, ...cs]) }, reste: true };
    }
    if (!COMPETITIONS[valeur]) return { reste: true };
    return { patch: { competitions: ordre(mes.includes(valeur) ? mes.filter((x) => x !== valeur) : [...mes, valeur]) }, reste: true };
  }
  if (etape === "hr") {
    const h = Number(valeur);
    if (!HEURES_ACCUEIL.includes(h)) return { reste: true };
    return { patch: { heure_envoi: h || null } };
  }
  if (etape === "al") {
    if (!["oui", "non"].includes(valeur)) return { reste: true };
    return { patch: { alertes: [...(valeur === "oui" ? ALERTES_OUI : []), ...(prefs.alertes?.nuit ? ["nuit"] : [])] } };
  }
  return { reste: true };
}

/** Recapitulatif de fin. */
export function recap(prefs, lang) {
  const L = tx(lang), lg = normaliserLangue(lang) || "fr";
  const bks = !paysOuvert(prefs) ? L.aucunBk
    : prefs.bookmakers.length ? prefs.bookmakers.map((b) => (BOOKMAKERS_AGREES[prefs.pays] || []).find((x) => x.cle === b)?.nom || b).join(", ") : L.tousBk;
  const al = prefs.alertes && Object.entries(prefs.alertes).some(([k, v]) => k !== "nuit" && v);
  const d = lg === "fr" ? " : " : ": "; // ponctuation francaise
  return `${L.fin}\n${L.r.langue}${d}${NOMS_LANGUES[lg]}\n${L.r.pays}${d}${paysOuvert(prefs) ? L.pays[String(prefs.pays).toLowerCase()] || L.pays.fr : L.pays.autre}\n${L.r.bk}${d}${esc(bks)}`
    + `\n${L.r.co}${d}${prefs.competitions?.length ? esc(prefs.competitions.map((k) => nomCompetition(k, lg)).join(", ")) : L.toutesCo}`
    + `\n${L.r.al}${d}${al ? L.oui : L.non}`
    + `\n${L.r.hr}${d}${prefs.heure_envoi ? L.heure(prefs.heure_envoi) : L.pret}\n\n${L.finPied}`;
}
