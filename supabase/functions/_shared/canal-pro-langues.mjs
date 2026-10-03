// IASHARK — langues du robot Telegram et des messages Pro envoyes en prive (02/10/2026).
// Logique PURE (aucun appel reseau). Utilisee par canal-pro.mjs (messages), par
// l'Edge Function telegram-bot (Deno) et par le robot planifie (Node).
//
// REGLE DE CLEMENT : une seule source de chiffres. Ce fichier ne contient QUE des
// mots : les chiffres (chance, cote, bookmaker, heure) viennent toujours du meme
// objet pari que le message francais ; seule la langue change.
// Vocabulaire repris des traductions du site (i18n/dict/*.json) : « double chance »,
// « Probabilidad calculada por IASHARK », « casas de apuestas autorizadas »,
// « combinada », « goleador », « alineaciones », « Canal Pro »…
// Regles de contenu identiques au francais : aucune mise, unite, capital ni
// esperance ; aucune promesse de gain ; pas de « jouer comporte des risques ».
//
// Langue d'un abonne : user_preferences.language du compte relie, sinon la langue
// de son application Telegram (language_code), sinon le francais.

export const LANGUES = ["fr", "es", "en", "de", "it", "pt"];
export const NOMS_LANGUES = { fr: "Français", es: "Español", en: "English", de: "Deutsch", it: "Italiano", pt: "Português" };
const LOCALES = { fr: "fr-FR", es: "es-ES", en: "en-GB", de: "de-DE", it: "it-IT", pt: "pt-PT" };

/** 'es-MX', 'ES', 'pt-br' -> 'es', 'es', 'pt' ; inconnu -> null. */
export function normaliserLangue(code) {
  const c = String(code || "").trim().toLowerCase().slice(0, 2);
  return LANGUES.includes(c) ? c : null;
}
/** Preference du compte (user_preferences.language), sinon Telegram (language_code), sinon francais. */
export function choisirLangue(preference, telegram) {
  return normaliserLangue(preference) || normaliserLangue(telegram) || "fr";
}

const virgule = (x, n) => Number(x).toFixed(n).replace(".", ",");
const point = (x, n) => Number(x).toFixed(n);
const parts = (date) => { const [y, m, j] = String(date).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, j, 12)); };
const pariz = (d, lang) => new Intl.DateTimeFormat(LOCALES[lang], { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));
const jourLong = (date, lang) => new Intl.DateTimeFormat(LOCALES[lang], { timeZone: "UTC", weekday: "long" }).format(parts(date));
const dateL = (date, lang) => new Intl.DateTimeFormat(LOCALES[lang], { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(parts(date));
const pl1 = (n, un, plus) => `${n} ${n === 1 ? un : plus}`;

// ------------------------------------------------------------------ francais (textes d'origine, inchanges)
const FR = {
  code: "fr",
  n: (x, d = 2) => (x == null || !isFinite(x) ? "" : virgule(x, d)),
  pct: (x) => `${x} %`,
  // heure, dateLongue et nomJour francais restent ceux de canal-pro.mjs (« 20 h 45 », « samedi 10 octobre »).
  heure: null, dateLongue: null, nomJour: null,
  pl: (n, s, p = s + "s") => `${n} ${n > 1 ? p : s}`,
  tz: "",
  // Textes du robot personnel (Edge Function telegram-bot) : ceux d'avant le 02/10, inchanges.
  robot: {
    expire: "Ce lien a expiré. Retourne sur la page Compte du site et clique de nouveau sur « Ouvrir mon robot sur Telegram ».",
    bonjour: (prenom) => `Bonjour${prenom ? " " + prenom : ""}, ton robot IASHARK est prêt.\n\n`,
    plusDeCanal: "Il n'y a plus de canal à rejoindre : tout ce qui est réservé aux abonnés Pro t'arrive ici, en privé (programme du jour, débriefs, bilan, alertes).",
    programmeVide: "Pas de pari à venir pour l'instant. Les jours où il y a un programme, il t'arrive ici vers 9 h 30, après validation.",
    programmeFerme: "Les envois Pro ne sont pas encore ouverts : pas de programme pour l'instant.",
    lotoVide: "Pas de grille Loto Foot à tenter pour l'instant. Elle t'arrive ici la veille du premier match, à 18 h.",
    journal: "<b>Ton journal d'aujourd'hui</b>", journalVide: "Aucun pari noté aujourd'hui. Écris-moi ton ticket ou envoie sa photo pour le noter.",
    tabacAucun: "Aucun simple du programme n'est encore à venir aujourd'hui.", quelPari: "Pour quel pari ?",
    nonRelie: "Compte non relié ou abonnement inactif.", dejaTraite: "Déjà traité.",
    pasNote: "Pas noté. Si c'était un message pour l'équipe, il lui est transmis : on te répond ici.", pasNoteCourt: "Pas noté.",
    tropTard: "Trop tard : le match a commencé, ce ticket n'est pas noté.", note: "Noté dans ton journal. ", noteCourt: "Noté.",
    reserve: "Réservé aux abonnés Pro.", reglagesIndispo: "Réglages indisponibles pour l'instant : change-les dans ton espace Pro (page Compte du site).",
    paysDabord: "Indique d'abord ton pays dans le formulaire de ton espace Pro (page Compte du site).", pasEnregistre: "Pas enregistré : réessaie dans un moment, ou change-le dans ton espace Pro.",
    cestNote: "C'est noté.", photoNon: "Je ne lis pas les photos. Écris-moi ton ticket en texte : « 10 € sur le nul Torino Udinese à 3,30 chez Betclic ».",
    photoIllisible: "Je n'arrive pas à lire ce ticket. Écris-le-moi en texte : « 10 € sur le nul Torino Udinese à 3,30 chez Betclic ».", photoCote: "Je n'arrive pas à lire la cote de ce ticket. Écris-le-moi en texte.",
    recu: "Message bien reçu, on vous répond ici rapidement.",
    choisirLangue: "Choisis ta langue :", langueOk: (nom) => `C'est noté : je te parle désormais en ${nom}. (C'est aussi la langue de ton compte sur le site.)`,
    langueErreur: "Je n'ai pas pu enregistrer ta langue. Réessaie dans un moment, ou change-la sur la page Compte du site.",
  },
  ticket: { noter: "Noter", annuler: "Annuler", illisible: "Je n'ai pas pu lire ce ticket. Réessaie en texte : « 10 € sur le nul Torino Udinese à 3,30 chez Betclic ».",
    relie: (nom, etiq) => `\n(C'est le ${nom} du programme, ${etiq} : je le relie.)`, pasCeCombine: "\n(Ce combiné n'est pas celui du programme : je le note tel que tu l'as écrit.)",
    pasCePari: "\n(Ce n'est pas le pari du programme : je le note tel que tu l'as écrit.)",
    question: "\nJe le note dans ton journal ?\n(Ce n'est pas un ticket ? Touche « Annuler » : ton message part à l'équipe, qui te répond ici.)" },
  perso: { ajout: "<b>Ajout à ton programme</b> (envoi retardé)\n" },
  reglages: { langue: "Langue : Français" },
};

// ------------------------------------------------------------------ espagnol
const ES = {
  code: "es",
  n: (x, d = 2) => (x == null || !isFinite(x) ? "" : virgule(x, d)),
  pct: (x) => `${x} %`,
  heure: (d) => pariz(d, "es"),
  dateLongue: (date) => dateL(date, "es"),
  nomJour: (date) => jourLong(date, "es"),
  pl: (n, s, p = s + "s") => pl1(n, s, p),
  tz: "(hora de París)",
  familles: {
    simple: { nom: "Simple", titre: "SIMPLE" },
    combine: { nom: "Combinada del día", titre: "COMBINADA DEL DÍA" },
    meme_match: { nom: "Mismo partido", titre: "MISMO PARTIDO" },
    buteur: { nom: "Mismo partido con goleador", titre: "MISMO PARTIDO CON GOLEADOR", plaisir: "probabilidad calculada, cuota en tu casa de apuestas" },
    fun10: { nom: "Ticket de cuota cercana a 10", titre: "TICKET DE CUOTA CERCANA A 10", plaisir: "por diversión" },
    fun25: { nom: "Ticket de cuota cercana a 25", titre: "TICKET DE CUOTA CERCANA A 25", plaisir: "por diversión" },
    reve: { nom: "Ticket 50-100 del mes", titre: "TICKET 50-100 DEL MES", plaisir: "por diversión" },
  },
  pluriels: { simple: ["simple", "simples"], combine: ["combinada del día", "combinadas del día"], meme_match: ["mismo partido", "mismo partido"], buteur: ["mismo partido con goleador", "mismo partido con goleador"],
    fun10: ["ticket de cuota cercana a 10", "tickets de cuota cercana a 10"], fun25: ["ticket de cuota cercana a 25", "tickets de cuota cercana a 25"], reve: ["ticket 50-100 del mes", "tickets 50-100 del mes"] },
  bilanNoms: { simple: "Simples", combine: "Combinadas del día", meme_match: "Mismo partido", buteur: "Mismo partido con goleador", fun10: "Tickets de cuota cercana a 10", fun25: "Tickets de cuota cercana a 25", reve: "Tickets 50-100 del mes" },
  choixFamilles: { simple: "Simples", combine: "Combinada del día", buteur: "Mismo partido con goleador", fun: "Tickets por diversión" },
  marches: { 1: (d) => `Gana ${d.dom}`, N: () => "Empate", 2: (d) => `Gana ${d.ext}`, "1X": (d) => `${d.dom} o empate`, X2: (d) => `Empate o ${d.ext}`, 12: (d) => `${d.dom} o ${d.ext}`,
    O25: () => "Más de 2,5 goles", U25: () => "Menos de 2,5 goles", AHH: (d, l) => `${d.dom} (hándicap ${l})`, AHA: (d, l) => `${d.ext} (hándicap ${l})` },
  buteurPari: (eq, j) => `Gana ${eq} + ${j} marca (en cualquier momento)`,
  nSelections: (n) => `${n} ${n === 1 ? "selección" : "selecciones"}`,
  chanceSimple: (p) => `Probabilidad calculada por IASHARK: ${p} %.`,
  chanceCombine: (n, p) => `Probabilidad calculada por IASHARK: alrededor de 1 entre ${n} (${p} %); todas las selecciones deben acertarse.`,
  chanceMarche: (p) => `Probabilidad calculada por IASHARK a partir de las cuotas del mercado: ${p} %.`,
  chanceCombineMarche: (n, p, mixte) => `Probabilidad calculada por IASHARK ${mixte ? "(motor v3 y cuotas del mercado)" : "a partir de las cuotas del mercado"}: alrededor de 1 entre ${n} (${p} %); todas las selecciones deben acertarse.`,
  noteMarche: "Cuando dice «a partir de las cuotas del mercado», la probabilidad viene de las cuotas de las casas de apuestas, sin su margen.",
  sansCotePays: "Cuota: aún no tomada en los operadores autorizados en tu país.",
  chanceButeur: (p, n) => `Probabilidad calculada por IASHARK: alrededor del ${p} % (1 entre ${n}), obtenida de la tabla de marcadores del partido.`,
  sansPreuveButeur: "Cuota de goleador: consúltala en tu casa de apuestas (no la registramos).",
  mention: "Probabilidades calculadas por IASHARK (motor v3).",
  weekend: "Partidos del fin de semana (viernes a domingo)",
  pari: "Selección",
  cote: (genre) => (genre === "combine" ? "Cuota de la combinada" : genre === "ticket" ? "Cuota del ticket" : "Cuota"),
  chez: "en",
  chezLui: " (todas las selecciones en esa casa)",
  relevee: (h) => `tomada a las ${h}`,
  rodage: (rang, date) => `Prueba · apuesta ${rang} del ${date}`,
  tete: (jour, compte, calme, weekend, suivis) => `<b>Programa del ${jour}</b> · ${compte}${calme ? "\nJornada tranquila: hoy solo una apuesta cumple nuestros criterios. No forzamos." : ""}\n`
    + `Partidos de las 12:00 a mañana a las 11:59 (hora de París)${weekend ? "; tickets del fin de semana: partidos de viernes a domingo" : ""}. Para cada apuesta: la probabilidad calculada por IASHARK (motor v3) y la mejor cuota encontrada en las casas de apuestas autorizadas que seguimos (${suivis}).`,
  teteVide: (jour, motif) => `<b>Programa del ${jour}</b> · ninguna apuesta\n${motif}`,
  motifs: {
    regles: "Hoy ninguna apuesta cumple nuestros criterios. No forzamos.",
    regles_partiel: "Ninguna apuesta hoy: entre los partidos que pudimos verificar hasta el final, ninguno cumple nuestros criterios. Los demás no se pudieron verificar (datos incompletos). No forzamos.",
    aucun_match: "No hemos encontrado ningún partido de nuestras ligas para este programa (partidos de las 12:00 a mañana a las 11:59, hora de París): ninguna apuesta hoy.",
    controle: "En el último control, ninguna apuesta cumplía ya nuestras condiciones: ninguna apuesta hoy.",
    retires: "Ninguna apuesta hoy.",
  },
  reporte: (jour, etape, cause, minutes) => {
    const [quoi, sans] = cause === "cotes" ? ["Las cuotas de las casas de apuestas no están disponibles por ahora", "cuotas verificadas"] : ["Parte de nuestros datos no está disponible por ahora", "datos verificados"];
    return `<b>Programa del ${jour} aplazado</b>\n` + (etape === "preparation"
      ? `${quoi}: no se prepara nada sin ${sans}. Si vuelven durante la mañana, el programa aún puede llegar aquí; si no, hoy no hay programa.`
      : `${quoi}: no se publica nada sin ${sans}. Si vuelven a tiempo, el programa sale, sin los partidos que empiezan en menos de ${minutes} min; si no, hoy no hay programa.`);
  },
  resultats: { gagne: "ganada", perdu: "perdida", rembourse: "reembolsada", moitie_gagne: "medio ganada", moitie_perdu: "medio perdida", retire: "retirada", annule: "retirada (partido aplazado)" },
  compte: (c) => [pl1(c.g, "ganada", "ganadas"), pl1(c.pe, "perdida", "perdidas"), c.mg && pl1(c.mg, "medio ganada", "medio ganadas"), c.mp && pl1(c.mp, "medio perdida", "medio perdidas"),
    c.rb && pl1(c.rb, "reembolsada", "reembolsadas"), c.rt && pl1(c.rt, "retirada", "retiradas")].filter(Boolean).join(", "),
  nParis: (n) => pl1(n, "apuesta", "apuestas"),
  coteDebrief: (c) => `(cuota ${c})`, sansCote: "(sin cuota)",
  titreDebrief: (moment, jour) => (moment === "matin" ? "Resumen de la mañana (los partidos de la noche)" : `Resumen del ${jour}`),
  debriefSansPreuve: (liste) => `Sin prueba de envío antes del partido, así que no cuentan en ningún sitio (ni resultado, ni balance): ${liste}.`,
  faits: { xg: (v) => `${v} goles esperados`, tirs: (n) => `${n} tiros`, et: " y ", aEu: (nom, x) => `${nom} tuvo ${x}`, deux: (nom, x) => `${nom}: ${x}`, arrets: (eq, n) => `el portero del ${eq} hizo ${n} paradas` },
  bilan: {
    titre: (du, au) => `<b>Balance de la semana</b> (del ${du} al ${au})`, rienSemaine: "Ninguna apuesta resuelta esta semana.", horsBilan: (l) => `Fuera del balance, sin prueba de envío: ${l}.`,
    depuis: (premier) => `<b>Desde el inicio</b>${premier ? ` (desde el N° PRO-${premier})` : ""}`, rien: "Ninguna apuesta resuelta.",
    horsTotal: (n, l) => `Fuera del balance desde el inicio, sin prueba de envío: ${pl1(n, "apuesta", "apuestas")} (${l}).`, nonRegles: (n) => `${pl1(n, "apuesta", "apuestas")} aún sin resolver.`,
  },
  perso: {
    paysInconnu: "Indica tu país en el formulario de tu espacio Pro (página Cuenta del sitio): mientras no lo indiques, no te muestro ninguna casa de apuestas. El programa completo te llega aquí, en el mensaje «Programa del día».",
    paysFerme: "Tu país aún no está abierto: el programa personal llegará cuando tengamos allí las casas de apuestas autorizadas. Las apuestas del día te llegan aquí, en el mensaje «Programa del día».",
    titre: (prenom, jour, n) => `<b>${prenom ? `${prenom}, tu` : "Tu"} programa del ${jour}</b>: ${pl1(n, "apuesta", "apuestas")}.`,
    aucunChoix: "\nNinguna apuesta del día corresponde a tus elecciones. El programa completo está en el mensaje «Programa del día».", aucun: "\nNinguna apuesta hoy.",
    taCote: (c, bk, lui) => ` Tu mejor cuota: <b>${c}</b> en ${bk}${lui ? " (todas las selecciones en esa casa)" : ""}.`,
    meilleure: (c, bk) => ` Mejor cuota en las casas autorizadas: ${c} en ${bk}.`,
    pasCote: (c, bk) => ` No disponible en tus casas de apuestas. En las autorizadas: ${c} en ${bk}.`,
    sous: (c) => `Por debajo de la cuota que te has fijado (${c}), aparte:`, pasCoteCourt: "no disponible en tus casas de apuestas",
    nonSuivis: (l) => `Aún no registramos las cuotas de: ${l}.`, perso: "Sigues tus elecciones. El programa completo sigue en el mensaje «Programa del día».",
    gardeFou: (lim, notes) => `Tu límite diario: ${pl1(lim, "apuesta", "apuestas")} por día. Has anotado ${notes}.`, tabac: "",
    heures: "Horas de París.", ajout: "<b>Añadido a tu programa</b> (envío con retraso)\n",
  },
  alerte: {
    baisse: (sel, match, avant, maint, bk) => `<b>Cuota a la baja</b>: ${sel} (${match}) ${maint ? `ha pasado de ${avant} a ${maint} en ${bk}` : "ya no está disponible en tus casas de apuestas"}.`,
    ailleurs: (c, bk) => ` En otra casa: ${c} en ${bk}, si tienes cuenta allí.`,
    hausse: (sel, match, avant, maint, bk) => `La cuota de ${sel} (${match}) ha subido de ${avant} a ${maint} en ${bk}.`,
  },
  voyants: { "CONFIRMÉ": "CONFIRMADA", "À SURVEILLER": "A VIGILAR", "RETIRÉ": "RETIRADA", "PUBLIÉE": "PUBLICADA" },
  compo: {
    retire: "El partido se ha aplazado o anulado: la apuesta ya no vale.", decider: " La apuesta sigue, tú decides.",
    changements: (nom, n) => `${nom} cambia ${n} titulares respecto a su último partido`, systeme: (nom, a, b) => `${nom} pasa de ${a} a ${b}`,
    publiee: "Alineación oficial publicada. No se puede comparar con el partido anterior.", publieeCourt: "Alineación oficial publicada.",
    confirme: "Nada destacable en las alineaciones.", sans: (l) => ` (No se puede comparar para ${l}.)`,
    titulaire: (j) => `${j} es titular.`, banc: (j) => `${j} empieza en el banquillo.`, absent: (j) => `${j} no está en la convocatoria.`,
    canal: (etiq, v, raison) => `${etiq} · Alineación <b>${v}</b>. ${raison}`, coteMaint: (c, bk) => `\nCuota actual: ${c} en ${bk}.`,
    perso: (match, h, v, raison) => `${match} (${h}): alineación <b>${v}</b>. ${raison}`, chezToi: (c, bk) => `\nEn tus casas: ${c} en ${bk}.`,
  },
  meteo: { orages: "tormentas", neige: "nieve", pluie: "lluvia fuerte", vent: (v) => `viento de ${v} km/h`, chaleur: (t) => `mucho calor (${t} °C)`, et: " y ",
    message: (ville, match, h, phrase) => `Tiempo previsto en ${ville} (${match}, ${h}): ${phrase}. Es solo una información: tu apuesta sigue igual.` },
  reglages: {
    aucunBk: "ninguna mientras tu país no esté abierto o indicado", tousBk: (l) => `todas las que seguimos (${l})`,
    message: (pays, bks, strat, gf, mention) => `<b>Tus ajustes</b>\nPaís: ${pays}\nTus casas de apuestas: ${bks}\nTus competiciones (solo información): ${strat}\nLímite diario: ${gf}\n\n${mention}\n\nPulsa un botón para cambiar.`,
    paysInconnu: "aún no indicado (formulario de tu espacio Pro)", tesChoix: (l) => l, complet: "todas (sin lista aparte)",
    gf0: "0 (nada más hoy)", gf: (n) => `${pl1(n, "apuesta", "apuestas")} por día`,
    alertes: { seuil: "Cuota que baja", hausse: "Cuota que sube", compositions: "Alineaciones", meteo: "Tiempo extremo", nuit: "Alertas de noche (23:00 - 8:00)" },
    oui: "Sí", non: "No", gfMoins: "Límite −1", gfPlus: "Límite +1", parJour: (n) => `${n} / día`, mesBk: "Mis casas de apuestas",
    revenir: "Volver al programa completo", suivre: "Seguir mis elecciones", termine: "Hecho", langue: "Idioma: Español",
  },
  gardeFou: {
    zero: "Límite diario en 0: hoy ya no te envío nada (ni programa, ni alertas). Puedes cambiar tu límite en /ajustes.",
    atteint: (n) => `Límite diario: hoy has anotado ${pl1(n, "apuesta", "apuestas")}, tu límite. Hoy ya no te envío nada (ni programa, ni alertas). Puedes cambiar tu límite en /ajustes.`,
    unDeplus: (n, lim) => `Límite diario: ${pl1(n, "apuesta", "apuestas")} de ${lim} hoy. Una más y paro por hoy.`,
    simple: (n, lim) => `${pl1(n, "apuesta", "apuestas")} de ${lim} hoy.`,
  },
  aide: "Soy tu robot IASHARK. Esto es lo que sé hacer:\n"
    + "• /programa: tu programa del día, con tus casas de apuestas\n"
    + "• /ajustes: tus casas de apuestas, tus alertas, tu límite diario\n"
    + "• /idioma: cambiar de idioma\n"
    + "• Todo lo reservado a los suscriptores Pro te llega aquí, en privado y en español (mismos datos que en francés).",
  ticket: {
    lu: "Ticket leído: ", sur: (m) => `${m} € a `, combineProg: (nom, sel, c, bk) => `la ${nom} del programa (${sel}) a ${c}${bk}.`,
    match: (sel, match, c, bk) => `${sel} (${match}) a ${c}${bk}.`, autre: (combine, c, bk, sel) => `${combine ? "una combinada" : "una apuesta"} a ${c}${bk} («${sel}»).`,
    relie: (nom, etiq) => `\n(Es la ${nom} del programa, ${etiq}: la vinculo.)`, pasCeCombine: "\n(Esta combinada no es la del programa: la anoto tal como la escribiste.)",
    pasCePari: "\n(No es la apuesta del programa: la anoto tal como la escribiste.)",
    question: "\n¿La anoto en tu diario?\n(¿No es un ticket? Pulsa «Cancelar»: tu mensaje va al equipo, que te responde aquí.)",
    noter: "Anotar", annuler: "Cancelar", illisible: "No he podido leer este ticket. Inténtalo de nuevo en texto: «10 € a Gana Torino a 1,65 en Betclic».",
  },
  tabac: (sel, match, cote, best, chance) => `Para ${sel} (${match}): ves ${cote} en el punto de venta.${best} ${chance} La cuota del punto de venta puede ser distinta de la de internet y moverse antes del partido.`,
  tabacBest: (c, bk, h) => ` Mejor cuota encontrada en las casas autorizadas: ${c} en ${bk}${h ? ` (a las ${h})` : ""}.`,
  robot: {
    expire: "Este enlace ha caducado. Vuelve a la página Cuenta del sitio y pulsa de nuevo «Abrir mi robot en Telegram».",
    bonjour: (prenom) => `Hola${prenom ? " " + prenom : ""}, tu robot IASHARK está listo.\n\n`,
    plusDeCanal: "Ya no hay ningún canal al que unirse: todo lo reservado a los suscriptores Pro te llega aquí, en privado (programa del día, resúmenes, balance, alertas).",
    programmeVide: "Por ahora no hay ninguna apuesta por venir. Los días en que hay programa, te llega aquí hacia las 9:30 (hora de París), después de su validación.",
    programmeFerme: "Los envíos Pro aún no están abiertos: por ahora no hay programa.",
    lotoVide: "El Loto Foot es un juego de la FDJ (Francia): la parrilla solo se envía en francés, a los suscriptores de Francia.",
    journal: "<b>Tu diario de hoy</b>", journalVide: "Ninguna apuesta anotada hoy. Escríbeme tu ticket para anotarlo.",
    tabacAucun: "Hoy ya no queda ninguna apuesta simple del programa por jugar.", quelPari: "¿Para qué apuesta?",
    nonRelie: "Cuenta no vinculada o suscripción inactiva.", dejaTraite: "Ya está hecho.",
    pasNote: "No anotado. Si era un mensaje para el equipo, se lo hemos enviado: te responderemos aquí.", pasNoteCourt: "No anotado.",
    tropTard: "Demasiado tarde: el partido ha empezado, este ticket no se anota.", note: "Anotado en tu diario. ", noteCourt: "Anotado.",
    reserve: "Reservado a los suscriptores Pro.", reglagesIndispo: "Ajustes no disponibles por ahora: cámbialos en tu espacio Pro (página Cuenta del sitio).",
    paysDabord: "Indica primero tu país en el formulario de tu espacio Pro (página Cuenta del sitio).", pasEnregistre: "No guardado: inténtalo dentro de un momento, o cámbialo en tu espacio Pro.",
    cestNote: "Hecho.", photoNon: "No leo fotos. Escríbeme tu ticket en texto: «10 € a Gana Torino a 1,65 en Betclic».",
    photoIllisible: "No consigo leer este ticket. Escríbemelo en texto: «10 € a Gana Torino a 1,65 en Betclic».", photoCote: "No consigo leer la cuota de este ticket. Escríbemelo en texto.",
    recu: "Mensaje recibido, te respondemos aquí enseguida.",
    choisirLangue: "Elige tu idioma:", langueOk: (nom) => `Hecho: a partir de ahora te hablo en ${nom}. (Es también el idioma de tu cuenta en el sitio.)`,
    langueErreur: "No he podido guardar tu idioma. Inténtalo dentro de un momento, o cámbialo en la página Cuenta del sitio.",
  },
};

// ------------------------------------------------------------------ anglais
const EN = {
  code: "en",
  n: (x, d = 2) => (x == null || !isFinite(x) ? "" : point(x, d)),
  pct: (x) => `${x}%`,
  heure: (d) => pariz(d, "en"),
  dateLongue: (date) => dateL(date, "en"),
  nomJour: (date) => jourLong(date, "en"),
  pl: (n, s, p = s + "s") => pl1(n, s, p),
  tz: "(Paris time)",
  familles: {
    simple: { nom: "Single", titre: "SINGLE" },
    combine: { nom: "Accumulator of the day", titre: "ACCUMULATOR OF THE DAY" },
    meme_match: { nom: "Same game", titre: "SAME GAME" },
    buteur: { nom: "Same game with goalscorer", titre: "SAME GAME WITH GOALSCORER", plaisir: "calculated chance, check the odds at your bookmaker" },
    fun10: { nom: "Ticket at around 10", titre: "TICKET AT AROUND 10", plaisir: "just for fun" },
    fun25: { nom: "Ticket at around 25", titre: "TICKET AT AROUND 25", plaisir: "just for fun" },
    reve: { nom: "50-100 ticket of the month", titre: "50-100 TICKET OF THE MONTH", plaisir: "just for fun" },
  },
  pluriels: { simple: ["single", "singles"], combine: ["accumulator of the day", "accumulators of the day"], meme_match: ["same game", "same game"], buteur: ["same game with goalscorer", "same games with goalscorer"],
    fun10: ["ticket at around 10", "tickets at around 10"], fun25: ["ticket at around 25", "tickets at around 25"], reve: ["50-100 ticket of the month", "50-100 tickets of the month"] },
  bilanNoms: { simple: "Singles", combine: "Accumulators of the day", meme_match: "Same game", buteur: "Same game with goalscorer", fun10: "Tickets at around 10", fun25: "Tickets at around 25", reve: "50-100 tickets of the month" },
  choixFamilles: { simple: "Singles", combine: "Accumulator of the day", buteur: "Same game with goalscorer", fun: "Tickets just for fun" },
  marches: { 1: (d) => `${d.dom} to win`, N: () => "Draw", 2: (d) => `${d.ext} to win`, "1X": (d) => `${d.dom} or draw`, X2: (d) => `Draw or ${d.ext}`, 12: (d) => `${d.dom} or ${d.ext}`,
    O25: () => "Over 2.5 goals", U25: () => "Under 2.5 goals", AHH: (d, l) => `${d.dom} (handicap ${l})`, AHA: (d, l) => `${d.ext} (handicap ${l})` },
  buteurPari: (eq, j) => `${eq} to win + ${j} to score (anytime)`,
  nSelections: (n) => `${n} ${n === 1 ? "selection" : "selections"}`,
  chanceSimple: (p) => `Chance calculated by IASHARK: ${p}%.`,
  chanceCombine: (n, p) => `Chance calculated by IASHARK: about 1 in ${n} (${p}%); every selection must win.`,
  chanceMarche: (p) => `Chance calculated by IASHARK from market odds: ${p}%.`,
  chanceCombineMarche: (n, p, mixte) => `Chance calculated by IASHARK ${mixte ? "(v3 engine and market odds)" : "from market odds"}: about 1 in ${n} (${p}%); every selection must win.`,
  noteMarche: "Where it says “from market odds”, the chance comes from the bookmakers' odds, with their margin removed.",
  sansCotePays: "Odds: not yet recorded at the operators licensed in your country.",
  chanceButeur: (p, n) => `Chance calculated by IASHARK: about ${p}% (1 in ${n}), read from the match's scoreline grid.`,
  sansPreuveButeur: "Goalscorer odds: check them at your bookmaker (we do not record them).",
  mention: "Chances calculated by IASHARK (v3 engine).",
  weekend: "Weekend matches (Friday to Sunday)",
  pari: "Pick",
  cote: (genre) => (genre === "combine" ? "Accumulator odds" : genre === "ticket" ? "Ticket odds" : "Odds"),
  chez: "at",
  chezLui: " (all selections with that bookmaker)",
  relevee: (h) => `checked at ${h}`,
  rodage: (rang, date) => `Trial run · bet ${rang} of ${date}`,
  tete: (jour, compte, calme, weekend, suivis) => `<b>Programme for ${jour}</b> · ${compte}${calme ? "\nQuiet day: only one bet meets our criteria today. We don't force it." : ""}\n`
    + `Matches from 12:00 to 11:59 tomorrow (Paris time)${weekend ? "; weekend tickets: Friday to Sunday matches" : ""}. For each bet: the chance calculated by IASHARK (v3 engine) and the best odds found at the licensed bookmakers we follow (${suivis}).`,
  teteVide: (jour, motif) => `<b>Programme for ${jour}</b> · no bets\n${motif}`,
  motifs: {
    regles: "No bet meets our criteria today. We don't force it.",
    regles_partiel: "No bets today: among the matches we could fully check, none meets our criteria. The others could not be checked (incomplete data). We don't force it.",
    aucun_match: "We found no match from our leagues for this programme (matches from 12:00 to 11:59 tomorrow, Paris time): no bets today.",
    controle: "At the final check, no bet met our conditions any more: no bets today.",
    retires: "No bets today.",
  },
  reporte: (jour, etape, cause, minutes) => {
    const [quoi, sans] = cause === "cotes" ? ["Bookmaker odds are not available for now", "checked odds"] : ["Part of our data is not available for now", "checked data"];
    return `<b>${jour} programme postponed</b>\n` + (etape === "preparation"
      ? `${quoi}: nothing is prepared without ${sans}. If they come back during the morning, the programme can still arrive here; otherwise there is no programme today.`
      : `${quoi}: nothing is published without ${sans}. If they come back in time, the programme goes out, without matches starting in less than ${minutes} min; otherwise there is no programme today.`);
  },
  resultats: { gagne: "won", perdu: "lost", rembourse: "void", moitie_gagne: "half won", moitie_perdu: "half lost", retire: "withdrawn", annule: "withdrawn (match postponed)" },
  compte: (c) => [`${c.g} won`, `${c.pe} lost`, c.mg && `${c.mg} half won`, c.mp && `${c.mp} half lost`, c.rb && `${c.rb} void`, c.rt && `${c.rt} withdrawn`].filter(Boolean).join(", "),
  nParis: (n) => pl1(n, "bet", "bets"),
  coteDebrief: (c) => `(odds ${c})`, sansCote: "(no odds)",
  titreDebrief: (moment, jour) => (moment === "matin" ? "Morning debrief (overnight matches)" : `${jour} debrief`),
  debriefSansPreuve: (liste) => `No proof of sending before the match, so they count nowhere (no result, no record): ${liste}.`,
  faits: { xg: (v) => `${v} expected goals`, tirs: (n) => `${n} shots`, et: " and ", aEu: (nom, x) => `${nom} had ${x}`, deux: (nom, x) => `${nom}: ${x}`, arrets: (eq, n) => `the ${eq} goalkeeper made ${n} saves` },
  bilan: {
    titre: (du, au) => `<b>Weekly record</b> (${du} to ${au})`, rienSemaine: "No bet settled this week.", horsBilan: (l) => `Outside the record, no proof of sending: ${l}.`,
    depuis: (premier) => `<b>Since the start</b>${premier ? ` (since N° PRO-${premier})` : ""}`, rien: "No bet settled.",
    horsTotal: (n, l) => `Outside the record since the start, no proof of sending: ${pl1(n, "bet", "bets")} (${l}).`, nonRegles: (n) => `${pl1(n, "bet", "bets")} not settled yet.`,
  },
  perso: {
    paysInconnu: "Enter your country in the form of your Pro space (Account page of the site): until you do, I show you no bookmaker. The full programme comes to you here, in the programme of the day message.",
    paysFerme: "Your country is not open yet: your personal programme will come once we have the licensed bookmakers there. Today's bets reach you here, in the programme of the day message.",
    titre: (prenom, jour, n) => `<b>${prenom ? `${prenom}, your` : "Your"} programme for ${jour}</b>: ${pl1(n, "bet", "bets")}.`,
    aucunChoix: "\nNo bet today matches your choices. The full programme is in the programme of the day message.", aucun: "\nNo bets today.",
    taCote: (c, bk, lui) => ` Your best odds: <b>${c}</b> at ${bk}${lui ? " (all selections with that bookmaker)" : ""}.`,
    meilleure: (c, bk) => ` Best odds at licensed bookmakers: ${c} at ${bk}.`,
    pasCote: (c, bk) => ` Not offered by your bookmakers. At licensed bookmakers: ${c} at ${bk}.`,
    sous: (c) => `Below the odds you set yourself (${c}), listed separately:`, pasCoteCourt: "not offered by your bookmakers",
    nonSuivis: (l) => `We don't track the odds of these yet: ${l}.`, perso: "You follow your own choices. The full programme stays in the programme of the day message.",
    gardeFou: (lim, notes) => `Your daily limit: ${pl1(lim, "bet", "bets")} per day. You have logged ${notes}.`, tabac: "",
    heures: "Paris time.", ajout: "<b>Added to your programme</b> (late sending)\n",
  },
  alerte: {
    baisse: (sel, match, avant, maint, bk) => `<b>Odds dropping</b>: ${sel} (${match}) ${maint ? `went from ${avant} to ${maint} at ${bk}` : "is no longer offered by your bookmakers"}.`,
    ailleurs: (c, bk) => ` Elsewhere: ${c} at ${bk}, if you have an account there.`,
    hausse: (sel, match, avant, maint, bk) => `The odds for ${sel} (${match}) went up from ${avant} to ${maint} at ${bk}.`,
  },
  voyants: { "CONFIRMÉ": "CONFIRMED", "À SURVEILLER": "TO WATCH", "RETIRÉ": "WITHDRAWN", "PUBLIÉE": "PUBLISHED" },
  compo: {
    retire: "The match is postponed or cancelled: the bet no longer stands.", decider: " The bet stands, it's your call.",
    changements: (nom, n) => `${nom} changes ${n} starters from its last match`, systeme: (nom, a, b) => `${nom} switches from ${a} to ${b}`,
    publiee: "Official line-up published. No comparison possible with the previous match.", publieeCourt: "Official line-up published.",
    confirme: "Nothing notable in the line-ups.", sans: (l) => ` (No comparison possible for ${l}.)`,
    titulaire: (j) => `${j} is starting.`, banc: (j) => `${j} starts on the bench.`, absent: (j) => `${j} is not in the matchday squad.`,
    canal: (etiq, v, raison) => `${etiq} · Line-up <b>${v}</b>. ${raison}`, coteMaint: (c, bk) => `\nOdds now: ${c} at ${bk}.`,
    perso: (match, h, v, raison) => `${match} (${h}): line-up <b>${v}</b>. ${raison}`, chezToi: (c, bk) => `\nAt your bookmakers: ${c} at ${bk}.`,
  },
  meteo: { orages: "thunderstorms", neige: "snow", pluie: "heavy rain", vent: (v) => `wind at ${v} km/h`, chaleur: (t) => `great heat (${t} °C)`, et: " and ",
    message: (ville, match, h, phrase) => `Weather forecast in ${ville} (${match}, ${h}): ${phrase}. This is information only: your bet stays the same.` },
  reglages: {
    aucunBk: "none while your country is not open or not entered", tousBk: (l) => `all those we follow (${l})`,
    message: (pays, bks, strat, gf, mention) => `<b>Your settings</b>\nCountry: ${pays}\nYour bookmakers: ${bks}\nYour competitions (for information): ${strat}\nDaily limit: ${gf}\n\n${mention}\n\nTap a button to change.`,
    paysInconnu: "not entered yet (form of your Pro space)", tesChoix: (l) => l, complet: "all (no separate list)",
    gf0: "0 (nothing more today)", gf: (n) => `${pl1(n, "bet", "bets")} per day`,
    alertes: { seuil: "Odds dropping", hausse: "Odds rising", compositions: "Line-ups", meteo: "Severe weather", nuit: "Night alerts (23:00 - 8:00)" },
    oui: "Yes", non: "No", gfMoins: "Limit −1", gfPlus: "Limit +1", parJour: (n) => `${n} / day`, mesBk: "My bookmakers",
    revenir: "Back to the full programme", suivre: "Follow my choices", termine: "Done", langue: "Language: English",
  },
  gardeFou: {
    zero: "Daily limit at 0: I send you nothing more today (no programme, no alerts). You can change your limit in /settings.",
    atteint: (n) => `Daily limit: you have logged ${pl1(n, "bet", "bets")} today, your limit. I send you nothing more today (no programme, no alerts). You can change your limit in /settings.`,
    unDeplus: (n, lim) => `Daily limit: ${n} of ${lim} bets today. One more and I stop for the day.`,
    simple: (n, lim) => `${n} of ${lim} bets today.`,
  },
  aide: "I'm your IASHARK robot. Here is what I can do:\n"
    + "• /program: your programme for today, with your bookmakers\n"
    + "• /settings: your bookmakers, your alerts, your daily limit\n"
    + "• /language: change language\n"
    + "• Everything reserved for Pro subscribers comes to you here, privately and in English (same figures as in French).",
  ticket: {
    lu: "Ticket read: ", sur: (m) => `€${m} on `, combineProg: (nom, sel, c, bk) => `the programme's ${nom} (${sel}) at ${c}${bk}.`,
    match: (sel, match, c, bk) => `${sel} (${match}) at ${c}${bk}.`, autre: (combine, c, bk, sel) => `${combine ? "an accumulator" : "a bet"} at ${c}${bk} ("${sel}").`,
    relie: (nom, etiq) => `\n(It's the programme's ${nom}, ${etiq}: I link it.)`, pasCeCombine: "\n(This accumulator is not the programme's: I log it as you wrote it.)",
    pasCePari: "\n(This is not the programme's bet: I log it as you wrote it.)",
    question: "\nShall I log it in your journal?\n(Not a ticket? Tap \"Cancel\": your message goes to the team, who will reply here.)",
    noter: "Log it", annuler: "Cancel", illisible: "I couldn't read this ticket. Try again as text: \"€10 on Torino to win at 1.65 at Betclic\".",
  },
  tabac: (sel, match, cote, best, chance) => `For ${sel} (${match}): you see ${cote} in the shop.${best} ${chance} Shop odds can differ from online odds and move before the match.`,
  tabacBest: (c, bk, h) => ` Best odds found at licensed bookmakers: ${c} at ${bk}${h ? ` (at ${h})` : ""}.`,
  robot: {
    expire: "This link has expired. Go back to the Account page of the site and click \"Open my robot on Telegram\" again.",
    bonjour: (prenom) => `Hello${prenom ? " " + prenom : ""}, your IASHARK robot is ready.\n\n`,
    plusDeCanal: "There is no channel to join any more: everything reserved for Pro subscribers comes to you here, privately (programme of the day, debriefs, weekly summary, alerts).",
    programmeVide: "No upcoming bet for now. On days with a programme, it comes to you here around 9:30 (Paris time), after approval.",
    programmeFerme: "Pro messages are not open yet: no programme for now.",
    lotoVide: "Loto Foot is a French FDJ game: the grid is only sent in French, to subscribers in France.",
    journal: "<b>Your journal for today</b>", journalVide: "No bet logged today. Write me your ticket to log it.",
    tabacAucun: "No single from the programme is still to come today.", quelPari: "Which bet?",
    nonRelie: "Account not linked or subscription inactive.", dejaTraite: "Already done.",
    pasNote: "Not logged. If it was a message for the team, it has been passed on: we will reply here.", pasNoteCourt: "Not logged.",
    tropTard: "Too late: the match has started, this ticket is not logged.", note: "Logged in your journal. ", noteCourt: "Logged.",
    reserve: "For Pro subscribers only.", reglagesIndispo: "Settings unavailable right now: change them in your Pro space (Account page of the site).",
    paysDabord: "First enter your country in the form of your Pro space (Account page of the site).", pasEnregistre: "Not saved: try again in a moment, or change it in your Pro space.",
    cestNote: "Done.", photoNon: "I don't read photos. Write me your ticket as text: \"€10 on Torino to win at 1.65 at Betclic\".",
    photoIllisible: "I can't read this ticket. Write it to me as text: \"€10 on Torino to win at 1.65 at Betclic\".", photoCote: "I can't read the odds on this ticket. Write it to me as text.",
    recu: "Message received, we'll reply here shortly.",
    choisirLangue: "Choose your language:", langueOk: (nom) => `Done: from now on I talk to you in ${nom}. (It is also your account's language on the site.)`,
    langueErreur: "I couldn't save your language. Try again in a moment, or change it on the Account page of the site.",
  },
};

// ------------------------------------------------------------------ allemand
const DE = {
  code: "de",
  n: (x, d = 2) => (x == null || !isFinite(x) ? "" : virgule(x, d)),
  pct: (x) => `${x} %`,
  heure: (d) => pariz(d, "de"),
  dateLongue: (date) => dateL(date, "de"),
  nomJour: (date) => jourLong(date, "de"),
  pl: (n, s, p = s + "en") => pl1(n, s, p),
  tz: "(Pariser Zeit)",
  familles: {
    simple: { nom: "Einzelwette", titre: "EINZELWETTE" },
    combine: { nom: "Kombiwette des Tages", titre: "KOMBIWETTE DES TAGES" },
    meme_match: { nom: "Gleiches Spiel", titre: "GLEICHES SPIEL" },
    buteur: { nom: "Gleiches Spiel mit Torschütze", titre: "GLEICHES SPIEL MIT TORSCHÜTZE", plaisir: "berechnete Chance, Quote bei deinem Buchmacher" },
    fun10: { nom: "Ticket um Quote 10", titre: "TICKET UM QUOTE 10", plaisir: "nur zum Spaß" },
    fun25: { nom: "Ticket um Quote 25", titre: "TICKET UM QUOTE 25", plaisir: "nur zum Spaß" },
    reve: { nom: "50-100-Ticket des Monats", titre: "50-100-TICKET DES MONATS", plaisir: "nur zum Spaß" },
  },
  pluriels: { simple: ["Einzelwette", "Einzelwetten"], combine: ["Kombiwette des Tages", "Kombiwetten des Tages"], meme_match: ["gleiches spiel", "gleiches spiel"], buteur: ["gleiches Spiel mit Torschütze", "gleiche Spiele mit Torschütze"],
    fun10: ["Ticket um Quote 10", "Tickets um Quote 10"], fun25: ["Ticket um Quote 25", "Tickets um Quote 25"], reve: ["50-100-Ticket des Monats", "50-100-Tickets des Monats"] },
  bilanNoms: { simple: "Einzelwetten", combine: "Kombiwetten des Tages", meme_match: "Gleiches Spiel", buteur: "Gleiches Spiel mit Torschütze", fun10: "Tickets um Quote 10", fun25: "Tickets um Quote 25", reve: "50-100-Tickets des Monats" },
  choixFamilles: { simple: "Einzelwetten", combine: "Kombiwette des Tages", buteur: "Gleiches Spiel mit Torschütze", fun: "Tickets zum Spaß" },
  marches: { 1: (d) => `Sieg ${d.dom}`, N: () => "Unentschieden", 2: (d) => `Sieg ${d.ext}`, "1X": (d) => `${d.dom} oder Unentschieden`, X2: (d) => `Unentschieden oder ${d.ext}`, 12: (d) => `${d.dom} oder ${d.ext}`,
    O25: () => "Über 2,5 Tore", U25: () => "Unter 2,5 Tore", AHH: (d, l) => `${d.dom} (Handicap ${l})`, AHA: (d, l) => `${d.ext} (Handicap ${l})` },
  buteurPari: (eq, j) => `Sieg ${eq} + ${j} trifft (jederzeit)`,
  nSelections: (n) => `${n} ${n === 1 ? "Tipp" : "Tipps"}`,
  chanceSimple: (p) => `Von IASHARK berechnete Chance: ${p} %.`,
  chanceCombine: (n, p) => `Von IASHARK berechnete Chance: etwa 1 zu ${n} (${p} %); alle Tipps müssen aufgehen.`,
  chanceMarche: (p) => `Von IASHARK aus den Marktquoten berechnete Chance: ${p} %.`,
  chanceCombineMarche: (n, p, mixte) => `Von IASHARK ${mixte ? "(Motor v3 und Marktquoten)" : "aus den Marktquoten"} berechnete Chance: etwa 1 zu ${n} (${p} %); alle Tipps müssen aufgehen.`,
  noteMarche: "Wo „aus den Marktquoten“ steht, kommt die Chance aus den Quoten der Buchmacher, ohne deren Marge.",
  sansCotePays: "Quote: bei den in deinem Land zugelassenen Anbietern noch nicht erfasst.",
  chanceButeur: (p, n) => `Von IASHARK berechnete Chance: etwa ${p} % (1 zu ${n}), aus dem Ergebnisraster des Spiels.`,
  sansPreuveButeur: "Torschützenquote: bei deinem Buchmacher ansehen (wir erfassen sie nicht).",
  mention: "Chancen von IASHARK berechnet (Engine v3).",
  weekend: "Spiele am Wochenende (Freitag bis Sonntag)",
  pari: "Auswahl",
  cote: (genre) => (genre === "combine" ? "Quote der Kombiwette" : genre === "ticket" ? "Quote des Tickets" : "Quote"),
  chez: "bei",
  chezLui: " (alle Tipps bei diesem Anbieter)",
  relevee: (h) => `erfasst um ${h}`,
  rodage: (rang, date) => `Testlauf · Wette ${rang} vom ${date}`,
  tete: (jour, compte, calme, weekend, suivis) => `<b>Programm für ${jour}</b> · ${compte}${calme ? "\nRuhiger Tag: heute erfüllt nur eine Wette unsere Kriterien. Wir erzwingen nichts." : ""}\n`
    + `Spiele von 12:00 bis morgen 11:59 (Pariser Zeit)${weekend ? "; Wochenend-Tickets: Spiele von Freitag bis Sonntag" : ""}. Für jede Wette: die von IASHARK berechnete Chance (Engine v3) und die beste Quote bei den zugelassenen Buchmachern, die wir verfolgen (${suivis}).`,
  teteVide: (jour, motif) => `<b>Programm für ${jour}</b> · keine Wette\n${motif}`,
  motifs: {
    regles: "Heute erfüllt keine Wette unsere Kriterien. Wir erzwingen nichts.",
    regles_partiel: "Heute keine Wette: unter den Spielen, die wir vollständig prüfen konnten, erfüllt keines unsere Kriterien. Die anderen konnten nicht geprüft werden (unvollständige Daten). Wir erzwingen nichts.",
    aucun_match: "Für dieses Programm haben wir kein Spiel unserer Ligen gefunden (Spiele von 12:00 bis morgen 11:59, Pariser Zeit): heute keine Wette.",
    controle: "Bei der letzten Kontrolle erfüllte keine Wette mehr unsere Bedingungen: heute keine Wette.",
    retires: "Heute keine Wette.",
  },
  reporte: (jour, etape, cause, minutes) => {
    const [quoi, sans] = cause === "cotes" ? ["Die Quoten der Buchmacher sind im Moment nicht verfügbar", "geprüfte Quoten"] : ["Ein Teil unserer Daten ist im Moment nicht verfügbar", "geprüfte Daten"];
    return `<b>Programm für ${jour} verschoben</b>\n` + (etape === "preparation"
      ? `${quoi}: ohne ${sans} wird nichts vorbereitet. Kommen sie im Laufe des Vormittags zurück, kann das Programm noch hier ankommen; sonst gibt es heute kein Programm.`
      : `${quoi}: ohne ${sans} wird nichts veröffentlicht. Kommen sie rechtzeitig zurück, geht das Programm raus, ohne die Spiele, die in weniger als ${minutes} Min. beginnen; sonst gibt es heute kein Programm.`);
  },
  resultats: { gagne: "gewonnen", perdu: "verloren", rembourse: "erstattet", moitie_gagne: "halb gewonnen", moitie_perdu: "halb verloren", retire: "zurückgezogen", annule: "zurückgezogen (Spiel verlegt)" },
  compte: (c) => [`${c.g} gewonnen`, `${c.pe} verloren`, c.mg && `${c.mg} halb gewonnen`, c.mp && `${c.mp} halb verloren`, c.rb && `${c.rb} erstattet`, c.rt && `${c.rt} zurückgezogen`].filter(Boolean).join(", "),
  nParis: (n) => pl1(n, "Wette", "Wetten"),
  coteDebrief: (c) => `(Quote ${c})`, sansCote: "(ohne Quote)",
  titreDebrief: (moment, jour) => (moment === "matin" ? "Rückblick am Morgen (die Spiele der Nacht)" : `Rückblick ${jour}`),
  debriefSansPreuve: (liste) => `Ohne Sendenachweis vor dem Spiel, daher nirgends gezählt (weder Ergebnis noch Bilanz): ${liste}.`,
  faits: { xg: (v) => `${v} erwartete Tore`, tirs: (n) => `${n} Schüsse`, et: " und ", aEu: (nom, x) => `${nom} hatte ${x}`, deux: (nom, x) => `${nom}: ${x}`, arrets: (eq, n) => `der Torwart von ${eq} hielt ${n} Schüsse` },
  bilan: {
    titre: (du, au) => `<b>Wochenbilanz</b> (${du} bis ${au})`, rienSemaine: "Diese Woche wurde keine Wette abgerechnet.", horsBilan: (l) => `Außerhalb der Bilanz, ohne Sendenachweis: ${l}.`,
    depuis: (premier) => `<b>Seit Beginn</b>${premier ? ` (seit N° PRO-${premier})` : ""}`, rien: "Keine Wette abgerechnet.",
    horsTotal: (n, l) => `Außerhalb der Bilanz seit Beginn, ohne Sendenachweis: ${pl1(n, "Wette", "Wetten")} (${l}).`, nonRegles: (n) => `${pl1(n, "Wette", "Wetten")} noch nicht abgerechnet.`,
  },
  perso: {
    paysInconnu: "Gib dein Land im Formular deines Pro-Bereichs an (Seite Konto der Website): solange es fehlt, zeige ich dir keinen Buchmacher. Das vollständige Programm kommt hier, in der Nachricht mit dem Tagesprogramm.",
    paysFerme: "Dein Land ist noch nicht freigeschaltet: das persönliche Programm kommt, sobald wir dort die zugelassenen Buchmacher haben. Die Wetten des Tages bekommst du hier, in der Nachricht mit dem Tagesprogramm.",
    titre: (prenom, jour, n) => `<b>${prenom ? `${prenom}, dein` : "Dein"} Programm für ${jour}</b>: ${pl1(n, "Wette", "Wetten")}.`,
    aucunChoix: "\nKeine Wette des Tages passt zu deiner Auswahl. Das vollständige Programm steht in der Nachricht mit dem Tagesprogramm.", aucun: "\nHeute keine Wette.",
    taCote: (c, bk, lui) => ` Deine beste Quote: <b>${c}</b> bei ${bk}${lui ? " (alle Tipps bei diesem Anbieter)" : ""}.`,
    meilleure: (c, bk) => ` Beste Quote bei den zugelassenen Buchmachern: ${c} bei ${bk}.`,
    pasCote: (c, bk) => ` Bei deinen Buchmachern nicht im Angebot. Bei den zugelassenen: ${c} bei ${bk}.`,
    sous: (c) => `Unter der Quote, die du dir gesetzt hast (${c}), separat:`, pasCoteCourt: "bei deinen Buchmachern nicht im Angebot",
    nonSuivis: (l) => `Die Quoten dieser Anbieter erfassen wir noch nicht: ${l}.`, perso: "Du folgst deiner Auswahl. Das vollständige Programm bleibt in der Nachricht mit dem Tagesprogramm.",
    gardeFou: (lim, notes) => `Dein Tageslimit: ${pl1(lim, "Wette", "Wetten")} pro Tag. Notiert: ${notes}.`, tabac: "",
    heures: "Pariser Zeit.", ajout: "<b>Ergänzung zu deinem Programm</b> (verspätet gesendet)\n",
  },
  alerte: {
    baisse: (sel, match, avant, maint, bk) => `<b>Quote fällt</b>: ${sel} (${match}) ${maint ? `ist von ${avant} auf ${maint} bei ${bk} gefallen` : "wird bei deinen Buchmachern nicht mehr angeboten"}.`,
    ailleurs: (c, bk) => ` Anderswo: ${c} bei ${bk}, falls du dort ein Konto hast.`,
    hausse: (sel, match, avant, maint, bk) => `Die Quote für ${sel} (${match}) ist von ${avant} auf ${maint} bei ${bk} gestiegen.`,
  },
  voyants: { "CONFIRMÉ": "BESTÄTIGT", "À SURVEILLER": "BEOBACHTEN", "RETIRÉ": "ZURÜCKGEZOGEN", "PUBLIÉE": "VERÖFFENTLICHT" },
  compo: {
    retire: "Das Spiel ist verlegt oder abgesagt: die Wette gilt nicht mehr.", decider: " Die Wette bleibt, du entscheidest.",
    changements: (nom, n) => `${nom} wechselt ${n} Stammspieler gegenüber dem letzten Spiel`, systeme: (nom, a, b) => `${nom} stellt von ${a} auf ${b} um`,
    publiee: "Offizielle Aufstellung veröffentlicht. Kein Vergleich mit dem vorigen Spiel möglich.", publieeCourt: "Offizielle Aufstellung veröffentlicht.",
    confirme: "Nichts Auffälliges in den Aufstellungen.", sans: (l) => ` (Kein Vergleich möglich für ${l}.)`,
    titulaire: (j) => `${j} steht in der Startelf.`, banc: (j) => `${j} beginnt auf der Bank.`, absent: (j) => `${j} steht nicht im Spieltagskader.`,
    canal: (etiq, v, raison) => `${etiq} · Aufstellung <b>${v}</b>. ${raison}`, coteMaint: (c, bk) => `\nAktuelle Quote: ${c} bei ${bk}.`,
    perso: (match, h, v, raison) => `${match} (${h}): Aufstellung <b>${v}</b>. ${raison}`, chezToi: (c, bk) => `\nBei deinen Buchmachern: ${c} bei ${bk}.`,
  },
  meteo: { orages: "Gewitter", neige: "Schnee", pluie: "starker Regen", vent: (v) => `Wind mit ${v} km/h`, chaleur: (t) => `große Hitze (${t} °C)`, et: " und ",
    message: (ville, match, h, phrase) => `Wettervorhersage in ${ville} (${match}, ${h}): ${phrase}. Nur zur Information: deine Wette bleibt gleich.` },
  reglages: {
    aucunBk: "keiner, solange dein Land nicht freigeschaltet oder angegeben ist", tousBk: (l) => `alle, die wir verfolgen (${l})`,
    message: (pays, bks, strat, gf, mention) => `<b>Deine Einstellungen</b>\nLand: ${pays}\nDeine Buchmacher: ${bks}\nDeine Wettbewerbe (nur zur Info): ${strat}\nTageslimit: ${gf}\n\n${mention}\n\nTippe auf eine Schaltfläche, um etwas zu ändern.`,
    paysInconnu: "noch nicht angegeben (Formular deines Pro-Bereichs)", tesChoix: (l) => l, complet: "alle (keine eigene Liste)",
    gf0: "0 (heute nichts mehr)", gf: (n) => `${pl1(n, "Wette", "Wetten")} pro Tag`,
    alertes: { seuil: "Quote fällt", hausse: "Quote steigt", compositions: "Aufstellungen", meteo: "Extremes Wetter", nuit: "Nachtalarme (23:00 - 8:00)" },
    oui: "Ja", non: "Nein", gfMoins: "Limit −1", gfPlus: "Limit +1", parJour: (n) => `${n} / Tag`, mesBk: "Meine Buchmacher",
    revenir: "Zurück zum vollständigen Programm", suivre: "Meiner Auswahl folgen", termine: "Fertig", langue: "Sprache: Deutsch",
  },
  gardeFou: {
    zero: "Tageslimit auf 0: heute schicke ich dir nichts mehr (weder Programm noch Alarme). Du kannst dein Limit unter /einstellungen ändern.",
    atteint: (n) => `Tageslimit: du hast heute ${pl1(n, "Wette", "Wetten")} notiert, dein Limit. Heute schicke ich dir nichts mehr (weder Programm noch Alarme). Du kannst dein Limit unter /einstellungen ändern.`,
    unDeplus: (n, lim) => `Tageslimit: ${n} von ${lim} Wetten heute. Noch eine, dann höre ich für heute auf.`,
    simple: (n, lim) => `${n} von ${lim} Wetten heute.`,
  },
  aide: "Ich bin dein IASHARK-Roboter. Das kann ich:\n"
    + "• /programm: dein Tagesprogramm, mit deinen Buchmachern\n"
    + "• /einstellungen: deine Buchmacher, deine Alarme, dein Tageslimit\n"
    + "• /sprache: Sprache ändern\n"
    + "• Alles, was Pro-Abonnenten vorbehalten ist, kommt hier privat und auf Deutsch zu dir (gleiche Zahlen wie auf Französisch).",
  ticket: {
    lu: "Ticket gelesen: ", sur: (m) => `${m} € auf `, combineProg: (nom, sel, c, bk) => `die ${nom} aus dem Programm (${sel}) zu ${c}${bk}.`,
    match: (sel, match, c, bk) => `${sel} (${match}) zu ${c}${bk}.`, autre: (combine, c, bk, sel) => `${combine ? "eine Kombiwette" : "eine Wette"} zu ${c}${bk} („${sel}“).`,
    relie: (nom, etiq) => `\n(Das ist die ${nom} aus dem Programm, ${etiq}: ich verknüpfe sie.)`, pasCeCombine: "\n(Diese Kombiwette ist nicht die aus dem Programm: ich notiere sie so, wie du sie geschrieben hast.)",
    pasCePari: "\n(Das ist nicht die Wette aus dem Programm: ich notiere sie so, wie du sie geschrieben hast.)",
    question: "\nSoll ich es in deinem Tagebuch notieren?\n(Kein Ticket? Tippe auf „Abbrechen“: deine Nachricht geht an das Team, das dir hier antwortet.)",
    noter: "Notieren", annuler: "Abbrechen", illisible: "Ich konnte dieses Ticket nicht lesen. Versuche es noch einmal als Text: „10 € auf Sieg Torino zu 1,65 bei Betclic“.",
  },
  tabac: (sel, match, cote, best, chance) => `Für ${sel} (${match}): du siehst ${cote} in der Annahmestelle.${best} ${chance} Die Quote in der Annahmestelle kann von der Online-Quote abweichen und sich bis zum Spiel ändern.`,
  tabacBest: (c, bk, h) => ` Beste Quote bei den zugelassenen Buchmachern: ${c} bei ${bk}${h ? ` (um ${h})` : ""}.`,
  robot: {
    expire: "Dieser Link ist abgelaufen. Geh zurück auf die Seite Konto der Website und klicke erneut auf „Meinen Roboter auf Telegram öffnen“.",
    bonjour: (prenom) => `Hallo${prenom ? " " + prenom : ""}, dein IASHARK-Roboter ist bereit.\n\n`,
    plusDeCanal: "Es gibt keinen Kanal mehr zum Beitreten: alles, was Pro-Abonnenten vorbehalten ist, kommt hier privat zu dir (Tagesprogramm, Auswertungen, Wochenbilanz, Hinweise).",
    programmeVide: "Im Moment keine anstehende Wette. An Tagen mit Programm kommt es hier gegen 9:30 (Pariser Zeit), nach der Freigabe.",
    programmeFerme: "Die Pro-Nachrichten sind noch nicht freigeschaltet: im Moment kein Programm.",
    lotoVide: "Loto Foot ist ein Spiel der FDJ (Frankreich): der Spielschein wird nur auf Französisch an Abonnenten in Frankreich geschickt.",
    journal: "<b>Dein Tagebuch von heute</b>", journalVide: "Heute keine Wette notiert. Schreib mir dein Ticket, um es zu notieren.",
    tabacAucun: "Heute steht keine Einzelwette aus dem Programm mehr an.", quelPari: "Für welche Wette?",
    nonRelie: "Konto nicht verknüpft oder Abo nicht aktiv.", dejaTraite: "Bereits erledigt.",
    pasNote: "Nicht notiert. Falls es eine Nachricht an das Team war, wurde sie weitergeleitet: wir antworten dir hier.", pasNoteCourt: "Nicht notiert.",
    tropTard: "Zu spät: das Spiel hat begonnen, dieses Ticket wird nicht notiert.", note: "In deinem Tagebuch notiert. ", noteCourt: "Notiert.",
    reserve: "Nur für Pro-Abonnenten.", reglagesIndispo: "Einstellungen gerade nicht verfügbar: ändere sie in deinem Pro-Bereich (Seite Konto der Website).",
    paysDabord: "Gib zuerst dein Land im Formular deines Pro-Bereichs an (Seite Konto der Website).", pasEnregistre: "Nicht gespeichert: versuche es gleich noch einmal oder ändere es in deinem Pro-Bereich.",
    cestNote: "Erledigt.", photoNon: "Ich lese keine Fotos. Schreib mir dein Ticket als Text: „10 € auf Sieg Torino zu 1,65 bei Betclic“.",
    photoIllisible: "Ich kann dieses Ticket nicht lesen. Schreib es mir als Text: „10 € auf Sieg Torino zu 1,65 bei Betclic“.", photoCote: "Ich kann die Quote dieses Tickets nicht lesen. Schreib es mir als Text.",
    recu: "Nachricht erhalten, wir antworten dir hier bald.",
    choisirLangue: "Wähle deine Sprache:", langueOk: (nom) => `Erledigt: ab jetzt spreche ich ${nom} mit dir. (Das ist auch die Sprache deines Kontos auf der Website.)`,
    langueErreur: "Ich konnte deine Sprache nicht speichern. Versuche es gleich noch einmal oder ändere sie auf der Seite Konto der Website.",
  },
};

// ------------------------------------------------------------------ italien
const IT = {
  code: "it",
  n: (x, d = 2) => (x == null || !isFinite(x) ? "" : virgule(x, d)),
  pct: (x) => `${x}%`,
  heure: (d) => pariz(d, "it"),
  dateLongue: (date) => dateL(date, "it"),
  nomJour: (date) => jourLong(date, "it"),
  pl: (n, s, p = s) => pl1(n, s, p),
  tz: "(ora di Parigi)",
  familles: {
    simple: { nom: "Singola", titre: "SINGOLA" },
    combine: { nom: "Multipla del giorno", titre: "MULTIPLA DEL GIORNO" },
    meme_match: { nom: "Stessa partita", titre: "STESSA PARTITA" },
    buteur: { nom: "Stessa partita con marcatore", titre: "STESSA PARTITA CON MARCATORE", plaisir: "probabilità calcolata, quota dal tuo bookmaker" },
    fun10: { nom: "Schedina a quota circa 10", titre: "SCHEDINA A QUOTA CIRCA 10", plaisir: "per divertimento" },
    fun25: { nom: "Schedina a quota circa 25", titre: "SCHEDINA A QUOTA CIRCA 25", plaisir: "per divertimento" },
    reve: { nom: "Schedina 50-100 del mese", titre: "SCHEDINA 50-100 DEL MESE", plaisir: "per divertimento" },
  },
  pluriels: { simple: ["singola", "singole"], combine: ["multipla del giorno", "multiple del giorno"], meme_match: ["stessa partita", "stessa partita"], buteur: ["stessa partita con marcatore", "stessa partita con marcatore"],
    fun10: ["schedina a quota circa 10", "schedine a quota circa 10"], fun25: ["schedina a quota circa 25", "schedine a quota circa 25"], reve: ["schedina 50-100 del mese", "schedine 50-100 del mese"] },
  bilanNoms: { simple: "Singole", combine: "Multiple del giorno", meme_match: "Stessa partita", buteur: "Stessa partita con marcatore", fun10: "Schedine a quota circa 10", fun25: "Schedine a quota circa 25", reve: "Schedine 50-100 del mese" },
  choixFamilles: { simple: "Singole", combine: "Multipla del giorno", buteur: "Stessa partita con marcatore", fun: "Schedine per divertimento" },
  marches: { 1: (d) => `Vince ${d.dom}`, N: () => "Pareggio", 2: (d) => `Vince ${d.ext}`, "1X": (d) => `${d.dom} o pareggio`, X2: (d) => `Pareggio o ${d.ext}`, 12: (d) => `${d.dom} o ${d.ext}`,
    O25: () => "Over 2,5 gol", U25: () => "Under 2,5 gol", AHH: (d, l) => `${d.dom} (handicap ${l})`, AHA: (d, l) => `${d.ext} (handicap ${l})` },
  buteurPari: (eq, j) => `Vince ${eq} + ${j} segna (in qualsiasi momento)`,
  nSelections: (n) => `${n} ${n === 1 ? "selezione" : "selezioni"}`,
  chanceSimple: (p) => `Probabilità calcolata da IASHARK: ${p}%.`,
  chanceCombine: (n, p) => `Probabilità calcolata da IASHARK: circa 1 su ${n} (${p}%); tutte le selezioni devono passare.`,
  chanceMarche: (p) => `Probabilità calcolata da IASHARK a partire dalle quote di mercato: ${p}%.`,
  chanceCombineMarche: (n, p, mixte) => `Probabilità calcolata da IASHARK ${mixte ? "(motore v3 e quote di mercato)" : "a partire dalle quote di mercato"}: circa 1 su ${n} (${p}%); tutte le selezioni devono passare.`,
  noteMarche: "Dove è scritto «a partire dalle quote di mercato», la probabilità viene dalle quote dei bookmaker, senza il loro margine.",
  sansCotePays: "Quota: non ancora rilevata presso gli operatori autorizzati nel tuo paese.",
  chanceButeur: (p, n) => `Probabilità calcolata da IASHARK: circa ${p}% (1 su ${n}), letta nella griglia dei risultati della partita.`,
  sansPreuveButeur: "Quota marcatore: guardala dal tuo bookmaker (non la registriamo).",
  mention: "Probabilità calcolate da IASHARK (motore v3).",
  weekend: "Partite del weekend (da venerdì a domenica)",
  pari: "Selezione",
  cote: (genre) => (genre === "combine" ? "Quota della multipla" : genre === "ticket" ? "Quota della schedina" : "Quota"),
  chez: "su",
  chezLui: " (tutte le selezioni su questo bookmaker)",
  relevee: (h) => `rilevata alle ${h}`,
  rodage: (rang, date) => `Prova · scommessa ${rang} di ${date}`,
  tete: (jour, compte, calme, weekend, suivis) => `<b>Programma di ${jour}</b> · ${compte}${calme ? "\nGiornata tranquilla: oggi solo una scommessa rispetta i nostri criteri. Non forziamo." : ""}\n`
    + `Partite dalle 12:00 a domani alle 11:59 (ora di Parigi)${weekend ? "; schedine del weekend: partite da venerdì a domenica" : ""}. Per ogni scommessa: la probabilità calcolata da IASHARK (motore v3) e la migliore quota rilevata presso i bookmaker autorizzati che seguiamo (${suivis}).`,
  teteVide: (jour, motif) => `<b>Programma di ${jour}</b> · nessuna scommessa\n${motif}`,
  motifs: {
    regles: "Oggi nessuna scommessa rispetta i nostri criteri. Non forziamo.",
    regles_partiel: "Nessuna scommessa oggi: tra le partite che abbiamo potuto verificare fino in fondo, nessuna rispetta i nostri criteri. Le altre non sono state verificabili (dati incompleti). Non forziamo.",
    aucun_match: "Non abbiamo trovato nessuna partita dei nostri campionati per questo programma (partite dalle 12:00 a domani alle 11:59, ora di Parigi): nessuna scommessa oggi.",
    controle: "All'ultimo controllo nessuna scommessa rispettava più le nostre condizioni: nessuna scommessa oggi.",
    retires: "Nessuna scommessa oggi.",
  },
  reporte: (jour, etape, cause, minutes) => {
    const [quoi, sans] = cause === "cotes" ? ["Le quote dei bookmaker non sono disponibili per ora", "quote verificate"] : ["Una parte dei nostri dati non è disponibile per ora", "dati verificati"];
    return `<b>Programma di ${jour} rinviato</b>\n` + (etape === "preparation"
      ? `${quoi}: senza ${sans} non si prepara nulla. Se tornano in mattinata, il programma può ancora arrivare qui; altrimenti oggi non c'è programma.`
      : `${quoi}: senza ${sans} non si pubblica nulla. Se tornano in tempo, il programma parte, senza le partite che iniziano tra meno di ${minutes} min; altrimenti oggi non c'è programma.`);
  },
  resultats: { gagne: "vinta", perdu: "persa", rembourse: "rimborsata", moitie_gagne: "vinta a metà", moitie_perdu: "persa a metà", retire: "ritirata", annule: "ritirata (partita rinviata)" },
  compte: (c) => [pl1(c.g, "vinta", "vinte"), pl1(c.pe, "persa", "perse"), c.mg && pl1(c.mg, "vinta a metà", "vinte a metà"), c.mp && pl1(c.mp, "persa a metà", "perse a metà"),
    c.rb && pl1(c.rb, "rimborsata", "rimborsate"), c.rt && pl1(c.rt, "ritirata", "ritirate")].filter(Boolean).join(", "),
  nParis: (n) => pl1(n, "scommessa", "scommesse"),
  coteDebrief: (c) => `(quota ${c})`, sansCote: "(senza quota)",
  titreDebrief: (moment, jour) => (moment === "matin" ? "Resoconto del mattino (le partite della notte)" : `Resoconto di ${jour}`),
  debriefSansPreuve: (liste) => `Senza prova d'invio prima della partita, quindi non contano da nessuna parte (né risultato, né bilancio): ${liste}.`,
  faits: { xg: (v) => `${v} gol attesi`, tirs: (n) => `${n} tiri`, et: " e ", aEu: (nom, x) => `${nom} ha avuto ${x}`, deux: (nom, x) => `${nom}: ${x}`, arrets: (eq, n) => `il portiere del ${eq} ha fatto ${n} parate` },
  bilan: {
    titre: (du, au) => `<b>Bilancio della settimana</b> (da ${du} a ${au})`, rienSemaine: "Nessuna scommessa regolata questa settimana.", horsBilan: (l) => `Fuori bilancio, senza prova d'invio: ${l}.`,
    depuis: (premier) => `<b>Dall'inizio</b>${premier ? ` (dal N° PRO-${premier})` : ""}`, rien: "Nessuna scommessa regolata.",
    horsTotal: (n, l) => `Fuori bilancio dall'inizio, senza prova d'invio: ${pl1(n, "scommessa", "scommesse")} (${l}).`, nonRegles: (n) => `${pl1(n, "scommessa", "scommesse")} non ancora ${n === 1 ? "regolata" : "regolate"}.`,
  },
  perso: {
    paysInconnu: "Indica il tuo paese nel modulo del tuo spazio Pro (pagina Account del sito): finché non lo indichi, non ti mostro nessun bookmaker. Il programma completo ti arriva qui, nel messaggio del programma del giorno.",
    paysFerme: "Il tuo paese non è ancora aperto: il programma personale arriverà quando avremo lì i bookmaker autorizzati. Le scommesse del giorno ti arrivano qui, nel messaggio del programma del giorno.",
    titre: (prenom, jour, n) => `<b>${prenom ? `${prenom}, il tuo` : "Il tuo"} programma di ${jour}</b>: ${pl1(n, "scommessa", "scommesse")}.`,
    aucunChoix: "\nNessuna scommessa del giorno corrisponde alle tue scelte. Il programma completo è nel messaggio del programma del giorno.", aucun: "\nNessuna scommessa oggi.",
    taCote: (c, bk, lui) => ` La tua quota migliore: <b>${c}</b> su ${bk}${lui ? " (tutte le selezioni su questo bookmaker)" : ""}.`,
    meilleure: (c, bk) => ` Quota migliore presso i bookmaker autorizzati: ${c} su ${bk}.`,
    pasCote: (c, bk) => ` Non quotata dai tuoi bookmaker. Presso gli autorizzati: ${c} su ${bk}.`,
    sous: (c) => `Sotto la quota che ti sei fissato (${c}), a parte:`, pasCoteCourt: "non quotata dai tuoi bookmaker",
    nonSuivis: (l) => `Non rileviamo ancora le quote di: ${l}.`, perso: "Segui le tue scelte. Il programma completo resta nel messaggio del programma del giorno.",
    gardeFou: (lim, notes) => `Il tuo limite giornaliero: ${pl1(lim, "scommessa", "scommesse")} al giorno. Ne hai annotate ${notes}.`, tabac: "",
    heures: "Ora di Parigi.", ajout: "<b>Aggiunta al tuo programma</b> (invio in ritardo)\n",
  },
  alerte: {
    baisse: (sel, match, avant, maint, bk) => `<b>Quota in calo</b>: ${sel} (${match}) ${maint ? `è passata da ${avant} a ${maint} su ${bk}` : "non è più quotata dai tuoi bookmaker"}.`,
    ailleurs: (c, bk) => ` Altrove: ${c} su ${bk}, se hai un conto lì.`,
    hausse: (sel, match, avant, maint, bk) => `La quota di ${sel} (${match}) è salita da ${avant} a ${maint} su ${bk}.`,
  },
  voyants: { "CONFIRMÉ": "CONFERMATA", "À SURVEILLER": "DA SEGUIRE", "RETIRÉ": "RITIRATA", "PUBLIÉE": "PUBBLICATA" },
  compo: {
    retire: "La partita è rinviata o annullata: la scommessa non vale più.", decider: " La scommessa resta, decidi tu.",
    changements: (nom, n) => `${nom} cambia ${n} titolari rispetto all'ultima partita`, systeme: (nom, a, b) => `${nom} passa dal ${a} al ${b}`,
    publiee: "Formazione ufficiale pubblicata. Confronto impossibile con la partita precedente.", publieeCourt: "Formazione ufficiale pubblicata.",
    confirme: "Niente di rilevante nelle formazioni.", sans: (l) => ` (Confronto impossibile per ${l}.)`,
    titulaire: (j) => `${j} è titolare.`, banc: (j) => `${j} parte dalla panchina.`, absent: (j) => `${j} non è tra i convocati.`,
    canal: (etiq, v, raison) => `${etiq} · Formazione <b>${v}</b>. ${raison}`, coteMaint: (c, bk) => `\nQuota attuale: ${c} su ${bk}.`,
    perso: (match, h, v, raison) => `${match} (${h}): formazione <b>${v}</b>. ${raison}`, chezToi: (c, bk) => `\nDai tuoi bookmaker: ${c} su ${bk}.`,
  },
  meteo: { orages: "temporali", neige: "neve", pluie: "pioggia forte", vent: (v) => `vento a ${v} km/h`, chaleur: (t) => `gran caldo (${t} °C)`, et: " e ",
    message: (ville, match, h, phrase) => `Meteo prevista a ${ville} (${match}, ${h}): ${phrase}. È solo un'informazione: la tua scommessa resta la stessa.` },
  reglages: {
    aucunBk: "nessuno finché il tuo paese non è aperto o indicato", tousBk: (l) => `tutti quelli che seguiamo (${l})`,
    message: (pays, bks, strat, gf, mention) => `<b>Le tue impostazioni</b>\nPaese: ${pays}\nI tuoi bookmaker: ${bks}\nLe tue competizioni (solo informazione): ${strat}\nLimite giornaliero: ${gf}\n\n${mention}\n\nTocca un pulsante per cambiare.`,
    paysInconnu: "non ancora indicato (modulo del tuo spazio Pro)", tesChoix: (l) => l, complet: "tutte (nessuna lista a parte)",
    gf0: "0 (niente più oggi)", gf: (n) => `${pl1(n, "scommessa", "scommesse")} al giorno`,
    alertes: { seuil: "Quota in calo", hausse: "Quota in aumento", compositions: "Formazioni", meteo: "Meteo estremo", nuit: "Avvisi di notte (23:00 - 8:00)" },
    oui: "Sì", non: "No", gfMoins: "Limite −1", gfPlus: "Limite +1", parJour: (n) => `${n} / giorno`, mesBk: "I miei bookmaker",
    revenir: "Torna al programma completo", suivre: "Segui le mie scelte", termine: "Fatto", langue: "Lingua: Italiano",
  },
  gardeFou: {
    zero: "Limite giornaliero a 0: oggi non ti invio più nulla (né programma, né avvisi). Puoi cambiare il limite in /impostazioni.",
    atteint: (n) => `Limite giornaliero: oggi hai annotato ${pl1(n, "scommessa", "scommesse")}, il tuo limite. Oggi non ti invio più nulla (né programma, né avvisi). Puoi cambiare il limite in /impostazioni.`,
    unDeplus: (n, lim) => `Limite giornaliero: ${n} scommesse su ${lim} oggi. Ancora una e mi fermo per oggi.`,
    simple: (n, lim) => `${n} scommesse su ${lim} oggi.`,
  },
  aide: "Sono il tuo robot IASHARK. Ecco cosa so fare:\n"
    + "• /programma: il tuo programma del giorno, con i tuoi bookmaker\n"
    + "• /impostazioni: i tuoi bookmaker, i tuoi avvisi, il tuo limite giornaliero\n"
    + "• /lingua: cambiare lingua\n"
    + "• Tutto ciò che è riservato agli abbonati Pro ti arriva qui, in privato e in italiano (stessi dati del francese).",
  ticket: {
    lu: "Schedina letta: ", sur: (m) => `${m} € su `, combineProg: (nom, sel, c, bk) => `la ${nom} del programma (${sel}) a ${c}${bk}.`,
    match: (sel, match, c, bk) => `${sel} (${match}) a ${c}${bk}.`, autre: (combine, c, bk, sel) => `${combine ? "una multipla" : "una scommessa"} a ${c}${bk} («${sel}»).`,
    relie: (nom, etiq) => `\n(È la ${nom} del programma, ${etiq}: la collego.)`, pasCeCombine: "\n(Questa multipla non è quella del programma: la annoto come l'hai scritta.)",
    pasCePari: "\n(Non è la scommessa del programma: la annoto come l'hai scritta.)",
    question: "\nLa annoto nel tuo diario?\n(Non è una schedina? Tocca «Annulla»: il tuo messaggio va al team, che ti risponde qui.)",
    noter: "Annota", annuler: "Annulla", illisible: "Non sono riuscito a leggere questa schedina. Riprova in testo: «10 € su Vince Torino a 1,65 su Betclic».",
  },
  tabac: (sel, match, cote, best, chance) => `Per ${sel} (${match}): vedi ${cote} in ricevitoria.${best} ${chance} La quota in ricevitoria può essere diversa da quella online e cambiare prima della partita.`,
  tabacBest: (c, bk, h) => ` Quota migliore rilevata presso i bookmaker autorizzati: ${c} su ${bk}${h ? ` (alle ${h})` : ""}.`,
  robot: {
    expire: "Questo link è scaduto. Torna alla pagina Account del sito e clicca di nuovo su «Apri il mio robot su Telegram».",
    bonjour: (prenom) => `Ciao${prenom ? " " + prenom : ""}, il tuo robot IASHARK è pronto.\n\n`,
    plusDeCanal: "Non c'è più nessun canale a cui unirsi: tutto ciò che è riservato agli abbonati Pro ti arriva qui, in privato (programma del giorno, resoconti, bilancio, avvisi).",
    programmeVide: "Per ora nessuna scommessa in arrivo. Nei giorni con un programma, ti arriva qui verso le 9:30 (ora di Parigi), dopo la convalida.",
    programmeFerme: "Gli invii Pro non sono ancora aperti: per ora nessun programma.",
    lotoVide: "Il Loto Foot è un gioco della FDJ (Francia): la griglia è inviata solo in francese, agli abbonati in Francia.",
    journal: "<b>Il tuo diario di oggi</b>", journalVide: "Nessuna scommessa annotata oggi. Scrivimi la tua schedina per annotarla.",
    tabacAucun: "Oggi non c'è più nessuna singola del programma da giocare.", quelPari: "Per quale scommessa?",
    nonRelie: "Account non collegato o abbonamento non attivo.", dejaTraite: "Già fatto.",
    pasNote: "Non annotata. Se era un messaggio per il team, gli è stato inoltrato: ti rispondiamo qui.", pasNoteCourt: "Non annotata.",
    tropTard: "Troppo tardi: la partita è iniziata, questa schedina non viene annotata.", note: "Annotata nel tuo diario. ", noteCourt: "Annotata.",
    reserve: "Riservato agli abbonati Pro.", reglagesIndispo: "Impostazioni non disponibili per ora: cambiale nel tuo spazio Pro (pagina Account del sito).",
    paysDabord: "Indica prima il tuo paese nel modulo del tuo spazio Pro (pagina Account del sito).", pasEnregistre: "Non salvato: riprova tra un attimo, o cambialo nel tuo spazio Pro.",
    cestNote: "Fatto.", photoNon: "Non leggo le foto. Scrivimi la tua schedina in testo: «10 € su Vince Torino a 1,65 su Betclic».",
    photoIllisible: "Non riesco a leggere questa schedina. Scrivimela in testo: «10 € su Vince Torino a 1,65 su Betclic».", photoCote: "Non riesco a leggere la quota di questa schedina. Scrivimela in testo.",
    recu: "Messaggio ricevuto, ti rispondiamo qui a breve.",
    choisirLangue: "Scegli la tua lingua:", langueOk: (nom) => `Fatto: da ora ti parlo in ${nom}. (È anche la lingua del tuo account sul sito.)`,
    langueErreur: "Non sono riuscito a salvare la tua lingua. Riprova tra un attimo, o cambiala nella pagina Account del sito.",
  },
};

// ------------------------------------------------------------------ portugais
const PT = {
  code: "pt",
  n: (x, d = 2) => (x == null || !isFinite(x) ? "" : virgule(x, d)),
  pct: (x) => `${x}%`,
  heure: (d) => pariz(d, "pt"),
  dateLongue: (date) => dateL(date, "pt"),
  nomJour: (date) => jourLong(date, "pt"),
  pl: (n, s, p = s + "s") => pl1(n, s, p),
  tz: "(hora de Paris)",
  familles: {
    simple: { nom: "Simples", titre: "SIMPLES" },
    combine: { nom: "Múltipla do dia", titre: "MÚLTIPLA DO DIA" },
    meme_match: { nom: "Mesmo jogo", titre: "MESMO JOGO" },
    buteur: { nom: "Mesmo jogo com marcador", titre: "MESMO JOGO COM MARCADOR", plaisir: "probabilidade calculada, odd na tua casa de apostas" },
    fun10: { nom: "Bilhete com odd perto de 10", titre: "BILHETE COM ODD PERTO DE 10", plaisir: "por diversão" },
    fun25: { nom: "Bilhete com odd perto de 25", titre: "BILHETE COM ODD PERTO DE 25", plaisir: "por diversão" },
    reve: { nom: "Bilhete 50-100 do mês", titre: "BILHETE 50-100 DO MÊS", plaisir: "por diversão" },
  },
  pluriels: { simple: ["simples", "simples"], combine: ["múltipla do dia", "múltiplas do dia"], meme_match: ["mesmo jogo", "mesmo jogo"], buteur: ["mesmo jogo com marcador", "mesmos jogos com marcador"],
    fun10: ["bilhete com odd perto de 10", "bilhetes com odd perto de 10"], fun25: ["bilhete com odd perto de 25", "bilhetes com odd perto de 25"], reve: ["bilhete 50-100 do mês", "bilhetes 50-100 do mês"] },
  bilanNoms: { simple: "Simples", combine: "Múltiplas do dia", meme_match: "Mesmo jogo", buteur: "Mesmo jogo com marcador", fun10: "Bilhetes com odd perto de 10", fun25: "Bilhetes com odd perto de 25", reve: "Bilhetes 50-100 do mês" },
  choixFamilles: { simple: "Simples", combine: "Múltipla do dia", buteur: "Mesmo jogo com marcador", fun: "Bilhetes por diversão" },
  marches: { 1: (d) => `${d.dom} vence`, N: () => "Empate", 2: (d) => `${d.ext} vence`, "1X": (d) => `${d.dom} ou empate`, X2: (d) => `Empate ou ${d.ext}`, 12: (d) => `${d.dom} ou ${d.ext}`,
    O25: () => "Mais de 2,5 golos", U25: () => "Menos de 2,5 golos", AHH: (d, l) => `${d.dom} (handicap ${l})`, AHA: (d, l) => `${d.ext} (handicap ${l})` },
  buteurPari: (eq, j) => `${eq} vence + ${j} marca (em qualquer momento)`,
  nSelections: (n) => `${n} ${n === 1 ? "seleção" : "seleções"}`,
  chanceSimple: (p) => `Probabilidade calculada pela IASHARK: ${p}%.`,
  chanceCombine: (n, p) => `Probabilidade calculada pela IASHARK: cerca de 1 em ${n} (${p}%); todas as seleções têm de acertar.`,
  chanceMarche: (p) => `Probabilidade calculada pela IASHARK a partir das odds do mercado: ${p}%.`,
  chanceCombineMarche: (n, p, mixte) => `Probabilidade calculada pela IASHARK ${mixte ? "(motor v3 e odds do mercado)" : "a partir das odds do mercado"}: cerca de 1 em ${n} (${p}%); todas as seleções têm de acertar.`,
  noteMarche: "Quando diz «a partir das odds do mercado», a probabilidade vem das odds das casas de apostas, sem a sua margem.",
  sansCotePays: "Odd: ainda não registada nos operadores licenciados no teu país.",
  chanceButeur: (p, n) => `Probabilidade calculada pela IASHARK: cerca de ${p}% (1 em ${n}), lida na grelha de resultados do jogo.`,
  sansPreuveButeur: "Odd de marcador: vê-a na tua casa de apostas (não a registamos).",
  mention: "Probabilidades calculadas pela IASHARK (motor v3).",
  weekend: "Jogos do fim de semana (sexta a domingo)",
  pari: "Seleção",
  cote: (genre) => (genre === "combine" ? "Odd da múltipla" : genre === "ticket" ? "Odd do bilhete" : "Odd"),
  chez: "na",
  chezLui: " (todas as seleções nessa casa)",
  relevee: (h) => `registada às ${h}`,
  rodage: (rang, date) => `Ensaio · aposta ${rang} de ${date}`,
  tete: (jour, compte, calme, weekend, suivis) => `<b>Programa de ${jour}</b> · ${compte}${calme ? "\nDia calmo: hoje só uma aposta cumpre os nossos critérios. Não forçamos." : ""}\n`
    + `Jogos das 12:00 até amanhã às 11:59 (hora de Paris)${weekend ? "; bilhetes do fim de semana: jogos de sexta a domingo" : ""}. Para cada aposta: a probabilidade calculada pela IASHARK (motor v3) e a melhor odd registada nas casas de apostas licenciadas que seguimos (${suivis}).`,
  teteVide: (jour, motif) => `<b>Programa de ${jour}</b> · nenhuma aposta\n${motif}`,
  motifs: {
    regles: "Hoje nenhuma aposta cumpre os nossos critérios. Não forçamos.",
    regles_partiel: "Nenhuma aposta hoje: entre os jogos que conseguimos verificar até ao fim, nenhum cumpre os nossos critérios. Os outros não puderam ser verificados (dados incompletos). Não forçamos.",
    aucun_match: "Não encontrámos nenhum jogo dos nossos campeonatos para este programa (jogos das 12:00 até amanhã às 11:59, hora de Paris): nenhuma aposta hoje.",
    controle: "No último controlo, nenhuma aposta cumpria ainda as nossas condições: nenhuma aposta hoje.",
    retires: "Nenhuma aposta hoje.",
  },
  reporte: (jour, etape, cause, minutes) => {
    const [quoi, sans] = cause === "cotes" ? ["As odds das casas de apostas não estão disponíveis de momento", "odds verificadas"] : ["Parte dos nossos dados não está disponível de momento", "dados verificados"];
    return `<b>Programa de ${jour} adiado</b>\n` + (etape === "preparation"
      ? `${quoi}: nada é preparado sem ${sans}. Se voltarem durante a manhã, o programa ainda pode chegar aqui; caso contrário, hoje não há programa.`
      : `${quoi}: nada é publicado sem ${sans}. Se voltarem a tempo, o programa sai, sem os jogos que começam em menos de ${minutes} min; caso contrário, hoje não há programa.`);
  },
  resultats: { gagne: "ganha", perdu: "perdida", rembourse: "reembolsada", moitie_gagne: "meio ganha", moitie_perdu: "meio perdida", retire: "retirada", annule: "retirada (jogo adiado)" },
  compte: (c) => [pl1(c.g, "ganha", "ganhas"), pl1(c.pe, "perdida", "perdidas"), c.mg && pl1(c.mg, "meio ganha", "meio ganhas"), c.mp && pl1(c.mp, "meio perdida", "meio perdidas"),
    c.rb && pl1(c.rb, "reembolsada", "reembolsadas"), c.rt && pl1(c.rt, "retirada", "retiradas")].filter(Boolean).join(", "),
  nParis: (n) => pl1(n, "aposta", "apostas"),
  coteDebrief: (c) => `(odd ${c})`, sansCote: "(sem odd)",
  titreDebrief: (moment, jour) => (moment === "matin" ? "Resumo da manhã (os jogos da noite)" : `Resumo de ${jour}`),
  debriefSansPreuve: (liste) => `Sem prova de envio antes do jogo, por isso não contam em lado nenhum (nem resultado, nem balanço): ${liste}.`,
  faits: { xg: (v) => `${v} golos esperados`, tirs: (n) => `${n} remates`, et: " e ", aEu: (nom, x) => `${nom} teve ${x}`, deux: (nom, x) => `${nom}: ${x}`, arrets: (eq, n) => `o guarda-redes do ${eq} fez ${n} defesas` },
  bilan: {
    titre: (du, au) => `<b>Balanço da semana</b> (de ${du} a ${au})`, rienSemaine: "Nenhuma aposta resolvida esta semana.", horsBilan: (l) => `Fora do balanço, sem prova de envio: ${l}.`,
    depuis: (premier) => `<b>Desde o início</b>${premier ? ` (desde o N° PRO-${premier})` : ""}`, rien: "Nenhuma aposta resolvida.",
    horsTotal: (n, l) => `Fora do balanço desde o início, sem prova de envio: ${pl1(n, "aposta", "apostas")} (${l}).`, nonRegles: (n) => `${pl1(n, "aposta", "apostas")} ainda por resolver.`,
  },
  perso: {
    paysInconnu: "Indica o teu país no formulário do teu espaço Pro (página Conta do site): enquanto não o indicares, não te mostro nenhuma casa de apostas. O programa completo chega-te aqui, na mensagem do programa do dia.",
    paysFerme: "O teu país ainda não está aberto: o programa pessoal chega quando tivermos lá as casas de apostas licenciadas. As apostas do dia chegam-te aqui, na mensagem do programa do dia.",
    titre: (prenom, jour, n) => `<b>${prenom ? `${prenom}, o teu` : "O teu"} programa de ${jour}</b>: ${pl1(n, "aposta", "apostas")}.`,
    aucunChoix: "\nNenhuma aposta do dia corresponde às tuas escolhas. O programa completo está na mensagem do programa do dia.", aucun: "\nNenhuma aposta hoje.",
    taCote: (c, bk, lui) => ` A tua melhor odd: <b>${c}</b> na ${bk}${lui ? " (todas as seleções nessa casa)" : ""}.`,
    meilleure: (c, bk) => ` Melhor odd nas casas licenciadas: ${c} na ${bk}.`,
    pasCote: (c, bk) => ` Não disponível nas tuas casas de apostas. Nas licenciadas: ${c} na ${bk}.`,
    sous: (c) => `Abaixo da odd que definiste (${c}), à parte:`, pasCoteCourt: "não disponível nas tuas casas de apostas",
    nonSuivis: (l) => `Ainda não registamos as odds de: ${l}.`, perso: "Segues as tuas escolhas. O programa completo continua na mensagem do programa do dia.",
    gardeFou: (lim, notes) => `O teu limite diário: ${pl1(lim, "aposta", "apostas")} por dia. Já anotaste ${notes}.`, tabac: "",
    heures: "Hora de Paris.", ajout: "<b>Acrescentado ao teu programa</b> (envio atrasado)\n",
  },
  alerte: {
    baisse: (sel, match, avant, maint, bk) => `<b>Odd a descer</b>: ${sel} (${match}) ${maint ? `passou de ${avant} para ${maint} na ${bk}` : "já não está disponível nas tuas casas de apostas"}.`,
    ailleurs: (c, bk) => ` Noutra casa: ${c} na ${bk}, se lá tiveres conta.`,
    hausse: (sel, match, avant, maint, bk) => `A odd de ${sel} (${match}) subiu de ${avant} para ${maint} na ${bk}.`,
  },
  voyants: { "CONFIRMÉ": "CONFIRMADO", "À SURVEILLER": "A VIGIAR", "RETIRÉ": "RETIRADO", "PUBLIÉE": "PUBLICADO" },
  compo: {
    retire: "O jogo foi adiado ou cancelado: a aposta já não é válida.", decider: " A aposta mantém-se, tu decides.",
    changements: (nom, n) => `${nom} muda ${n} titulares em relação ao último jogo`, systeme: (nom, a, b) => `${nom} passa de ${a} para ${b}`,
    publiee: "Onze oficial publicado. Comparação impossível com o jogo anterior.", publieeCourt: "Onze oficial publicado.",
    confirme: "Nada de relevante nos onzes.", sans: (l) => ` (Comparação impossível para ${l}.)`,
    titulaire: (j) => `${j} é titular.`, banc: (j) => `${j} começa no banco.`, absent: (j) => `${j} não está na ficha de jogo.`,
    canal: (etiq, v, raison) => `${etiq} · Onze <b>${v}</b>. ${raison}`, coteMaint: (c, bk) => `\nOdd atual: ${c} na ${bk}.`,
    perso: (match, h, v, raison) => `${match} (${h}): onze <b>${v}</b>. ${raison}`, chezToi: (c, bk) => `\nNas tuas casas: ${c} na ${bk}.`,
  },
  meteo: { orages: "trovoadas", neige: "neve", pluie: "chuva forte", vent: (v) => `vento a ${v} km/h`, chaleur: (t) => `muito calor (${t} °C)`, et: " e ",
    message: (ville, match, h, phrase) => `Tempo previsto em ${ville} (${match}, ${h}): ${phrase}. É só uma informação: a tua aposta mantém-se.` },
  reglages: {
    aucunBk: "nenhuma enquanto o teu país não estiver aberto ou indicado", tousBk: (l) => `todas as que seguimos (${l})`,
    message: (pays, bks, strat, gf, mention) => `<b>As tuas definições</b>\nPaís: ${pays}\nAs tuas casas de apostas: ${bks}\nAs tuas competições (só informação): ${strat}\nLimite diário: ${gf}\n\n${mention}\n\nToca num botão para mudar.`,
    paysInconnu: "ainda não indicado (formulário do teu espaço Pro)", tesChoix: (l) => l, complet: "todas (sem lista à parte)",
    gf0: "0 (nada mais hoje)", gf: (n) => `${pl1(n, "aposta", "apostas")} por dia`,
    alertes: { seuil: "Odd a descer", hausse: "Odd a subir", compositions: "Onzes iniciais", meteo: "Tempo extremo", nuit: "Alertas à noite (23:00 - 8:00)" },
    oui: "Sim", non: "Não", gfMoins: "Limite −1", gfPlus: "Limite +1", parJour: (n) => `${n} / dia`, mesBk: "As minhas casas de apostas",
    revenir: "Voltar ao programa completo", suivre: "Seguir as minhas escolhas", termine: "Concluído", langue: "Idioma: Português",
  },
  gardeFou: {
    zero: "Limite diário a 0: hoje já não te envio nada (nem programa, nem alertas). Podes mudar o teu limite em /definicoes.",
    atteint: (n) => `Limite diário: hoje anotaste ${pl1(n, "aposta", "apostas")}, o teu limite. Hoje já não te envio nada (nem programa, nem alertas). Podes mudar o teu limite em /definicoes.`,
    unDeplus: (n, lim) => `Limite diário: ${n} de ${lim} apostas hoje. Mais uma e paro por hoje.`,
    simple: (n, lim) => `${n} de ${lim} apostas hoje.`,
  },
  aide: "Sou o teu robot IASHARK. Eis o que sei fazer:\n"
    + "• /programa: o teu programa do dia, com as tuas casas de apostas\n"
    + "• /definicoes: as tuas casas de apostas, os teus alertas, o teu limite diário\n"
    + "• /idioma: mudar de idioma\n"
    + "• Tudo o que é reservado aos subscritores Pro chega-te aqui, em privado e em português (os mesmos dados que em francês).",
  ticket: {
    lu: "Bilhete lido: ", sur: (m) => `${m} € em `, combineProg: (nom, sel, c, bk) => `a ${nom} do programa (${sel}) a ${c}${bk}.`,
    match: (sel, match, c, bk) => `${sel} (${match}) a ${c}${bk}.`, autre: (combine, c, bk, sel) => `${combine ? "uma múltipla" : "uma aposta"} a ${c}${bk} («${sel}»).`,
    relie: (nom, etiq) => `\n(É a ${nom} do programa, ${etiq}: ligo-a.)`, pasCeCombine: "\n(Esta múltipla não é a do programa: anoto-a como a escreveste.)",
    pasCePari: "\n(Não é a aposta do programa: anoto-a como a escreveste.)",
    question: "\nAnoto-o no teu diário?\n(Não é um bilhete? Toca em «Cancelar»: a tua mensagem vai para a equipa, que te responde aqui.)",
    noter: "Anotar", annuler: "Cancelar", illisible: "Não consegui ler este bilhete. Tenta de novo em texto: «10 € em Torino vence a 1,65 na Betclic».",
  },
  tabac: (sel, match, cote, best, chance) => `Para ${sel} (${match}): vês ${cote} no balcão.${best} ${chance} A odd do balcão pode ser diferente da da internet e mudar até ao jogo.`,
  tabacBest: (c, bk, h) => ` Melhor odd registada nas casas licenciadas: ${c} na ${bk}${h ? ` (às ${h})` : ""}.`,
  robot: {
    expire: "Este link expirou. Volta à página Conta do site e clica de novo em «Abrir o meu robot no Telegram».",
    bonjour: (prenom) => `Olá${prenom ? " " + prenom : ""}, o teu robot IASHARK está pronto.\n\n`,
    plusDeCanal: "Já não há canal para entrar: tudo o que é reservado aos subscritores Pro chega-te aqui, em privado (programa do dia, resumos, balanço, alertas).",
    programmeVide: "Por agora não há nenhuma aposta por vir. Nos dias em que há programa, chega-te aqui por volta das 9:30 (hora de Paris), depois da validação.",
    programmeFerme: "Os envios Pro ainda não estão abertos: por agora não há programa.",
    lotoVide: "O Loto Foot é um jogo da FDJ (França): a grelha só é enviada em francês, aos subscritores em França.",
    journal: "<b>O teu diário de hoje</b>", journalVide: "Nenhuma aposta anotada hoje. Escreve-me o teu bilhete para o anotar.",
    tabacAucun: "Hoje já não há nenhuma aposta simples do programa por jogar.", quelPari: "Para que aposta?",
    nonRelie: "Conta não ligada ou subscrição inativa.", dejaTraite: "Já está feito.",
    pasNote: "Não anotado. Se era uma mensagem para a equipa, foi-lhe enviada: respondemos-te aqui.", pasNoteCourt: "Não anotado.",
    tropTard: "Tarde demais: o jogo já começou, este bilhete não é anotado.", note: "Anotado no teu diário. ", noteCourt: "Anotado.",
    reserve: "Reservado aos subscritores Pro.", reglagesIndispo: "Definições indisponíveis de momento: muda-as no teu espaço Pro (página Conta do site).",
    paysDabord: "Indica primeiro o teu país no formulário do teu espaço Pro (página Conta do site).", pasEnregistre: "Não guardado: tenta daqui a pouco, ou muda-o no teu espaço Pro.",
    cestNote: "Feito.", photoNon: "Não leio fotos. Escreve-me o teu bilhete em texto: «10 € em Torino vence a 1,65 na Betclic».",
    photoIllisible: "Não consigo ler este bilhete. Escreve-mo em texto: «10 € em Torino vence a 1,65 na Betclic».", photoCote: "Não consigo ler a odd deste bilhete. Escreve-mo em texto.",
    recu: "Mensagem recebida, respondemos aqui em breve.",
    choisirLangue: "Escolhe o teu idioma:", langueOk: (nom) => `Feito: a partir de agora falo contigo em ${nom}. (É também o idioma da tua conta no site.)`,
    langueErreur: "Não consegui guardar o teu idioma. Tenta daqui a pouco, ou muda-o na página Conta do site.",
  },
};

const DICOS = { fr: FR, es: ES, en: EN, de: DE, it: IT, pt: PT };
/** Textes d'une langue (le francais si la langue est inconnue). */
export function textes(lang) {
  return DICOS[normaliserLangue(lang) || "fr"];
}
/** Vrai si la langue est le francais (ou inconnue) : on garde alors les textes d'origine de canal-pro.mjs. */
export const estFrancais = (lang) => (normaliserLangue(lang) || "fr") === "fr";

/** Commandes du robot, dans toutes les langues -> nom interne. */
export const COMMANDES = {
  programme: ["programme", "programa", "program", "programm", "programma"],
  reglages: ["reglages", "ajustes", "settings", "einstellungen", "impostazioni", "definicoes"],
  journal: ["journal", "diario", "tagebuch", "diary"],
  langue: ["langue", "idioma", "language", "sprache", "lingua", "lang"],
  aide: ["start", "aide", "help", "ayuda", "hilfe", "aiuto", "ajuda"],
};
/** « /programa@robot texte » -> 'programme' ; null si ce n'est pas une commande connue. */
export function commande(texte) {
  const m = String(texte || "").trim().match(/^\/([a-z]+)(?:@\w+)?\b/i);
  if (!m) return null;
  const c = m[1].toLowerCase();
  for (const [nom, alias] of Object.entries(COMMANDES)) if (alias.includes(c)) return nom;
  return null;
}
/** Clavier /langue : une langue par bouton. */
export function clavierLangues(actuelle) {
  const b = LANGUES.map((l) => ({ text: `${l === actuelle ? "✓ " : ""}${NOMS_LANGUES[l]}`, callback_data: `lg:${l}` }));
  return { inline_keyboard: [b.slice(0, 3), b.slice(3)] };
}
/** Coupe un long message HTML (limite Telegram 4096) en morceaux, aux sauts de paragraphe. */
export function decouper(texte, max = 4000) {
  const out = [];
  let cur = "";
  for (const bloc of String(texte).split("\n\n")) {
    const add = cur ? `${cur}\n\n${bloc}` : bloc;
    if (add.length <= max) { cur = add; continue; }
    if (cur) out.push(cur);
    cur = bloc.length > max ? bloc.slice(0, max) : bloc;
  }
  if (cur) out.push(cur);
  return out;
}

// ------------------------------------------------------------------ programme de chaque abonne (03/10/2026)
// DECISION DE CLEMENT (03/10/2026) : les MEMES paris pour tous (memes chances) ; pour chaque abonne,
// UN message : sa langue, la meilleure cote chez SES bookmakers (de son pays), son heure, et, a la fin,
// pour l'information seulement, les matchs du jour de SES competitions preferees (lien vers l'analyse,
// sans pari ni chance), et le lendemain matin leurs resultats. Aucun regulateur cite.
export const SUR_MESURE = {
  fr: {
    tete: (prenom, jour, compte, calme, weekend, bks, tes) => `<b>${prenom ? `${prenom}, ton` : "Ton"} programme du ${jour}</b> · ${compte}${calme ? "\nJournée calme : un seul pari passe nos critères aujourd'hui. On ne force pas." : ""}\n`
      + `Matchs de 12 h à demain 11 h 59${weekend ? " ; tickets du week-end : matchs de vendredi à dimanche" : ""}. Pour chaque pari : la chance calculée par IASHARK et la meilleure cote ${tes ? `chez tes bookmakers (${bks})` : `chez les bookmakers autorisés dans ton pays que nous suivons (${bks})`}.`,
    teteSansPays: (prenom, jour, compte) => `<b>${prenom ? `${prenom}, ton` : "Ton"} programme du ${jour}</b> · ${compte}\nPour chaque pari : la chance calculée par IASHARK. Indique ton pays dans ton espace Pro (page Compte du site) pour voir les cotes des bookmakers autorisés chez toi.`,
    teteVide: (prenom, jour, motif) => `<b>${prenom ? `${prenom}, ton` : "Ton"} programme du ${jour}</b> · aucun pari\n${motif}`,
    ailleurs: (c, bk) => `pas proposée chez tes bookmakers (ailleurs : ${c} chez ${bk})`,
    infosJour: "Aujourd'hui dans tes compétitions", infosHier: "Hier dans tes compétitions", infosNote: "Pour info, sans pari.",
    analyse: "analyse", autres: (n) => `et ${n} autre${n > 1 ? "s" : ""} match${n > 1 ? "s" : ""} sur le site`,
    debriefMatin: "Débrief du matin",
  },
  es: {
    tete: (prenom, jour, compte, calme, weekend, bks, tes) => `<b>${prenom ? `${prenom}, tu` : "Tu"} programa del ${jour}</b> · ${compte}${calme ? "\nJornada tranquila: hoy solo una apuesta cumple nuestros criterios. No forzamos." : ""}\n`
      + `Partidos de las 12:00 a mañana a las 11:59 (hora de París)${weekend ? "; tickets del fin de semana: partidos de viernes a domingo" : ""}. Para cada apuesta: la probabilidad calculada por IASHARK y la mejor cuota ${tes ? `en tus casas de apuestas (${bks})` : `en las casas de apuestas autorizadas en tu país que seguimos (${bks})`}.`,
    teteSansPays: (prenom, jour, compte) => `<b>${prenom ? `${prenom}, tu` : "Tu"} programa del ${jour}</b> · ${compte}\nPara cada apuesta: la probabilidad calculada por IASHARK. Indica tu país en tu espacio Pro (página Cuenta del sitio) para ver las cuotas de las casas autorizadas en tu país.`,
    teteVide: (prenom, jour, motif) => `<b>${prenom ? `${prenom}, tu` : "Tu"} programa del ${jour}</b> · ninguna apuesta\n${motif}`,
    ailleurs: (c, bk) => `no disponible en tus casas de apuestas (en otra: ${c} en ${bk})`,
    infosJour: "Hoy en tus competiciones", infosHier: "Ayer en tus competiciones", infosNote: "Solo para información, sin apuesta.",
    analyse: "análisis", autres: (n) => `y ${n} partido${n > 1 ? "s" : ""} más en el sitio`,
    debriefMatin: "Resumen de la mañana",
  },
  en: {
    tete: (prenom, jour, compte, calme, weekend, bks, tes) => `<b>${prenom ? `${prenom}, your` : "Your"} programme for ${jour}</b> · ${compte}${calme ? "\nQuiet day: only one bet meets our criteria today. We don't force it." : ""}\n`
      + `Matches from 12:00 to 11:59 tomorrow (Paris time)${weekend ? "; weekend tickets: matches from Friday to Sunday" : ""}. For each bet: the probability calculated by IASHARK and the best odds ${tes ? `at your bookmakers (${bks})` : `at the bookmakers licensed in your country that we follow (${bks})`}.`,
    teteSansPays: (prenom, jour, compte) => `<b>${prenom ? `${prenom}, your` : "Your"} programme for ${jour}</b> · ${compte}\nFor each bet: the probability calculated by IASHARK. Add your country in your Pro area (Account page on the site) to see the odds of the bookmakers licensed where you live.`,
    teteVide: (prenom, jour, motif) => `<b>${prenom ? `${prenom}, your` : "Your"} programme for ${jour}</b> · no bet\n${motif}`,
    ailleurs: (c, bk) => `not offered at your bookmakers (elsewhere: ${c} at ${bk})`,
    infosJour: "Today in your competitions", infosHier: "Yesterday in your competitions", infosNote: "For information only, no bet.",
    analyse: "analysis", autres: (n) => `and ${n} more match${n > 1 ? "es" : ""} on the site`,
    debriefMatin: "Morning debrief",
  },
  de: {
    tete: (prenom, jour, compte, calme, weekend, bks, tes) => `<b>${prenom ? `${prenom}, dein` : "Dein"} Programm für ${jour}</b> · ${compte}${calme ? "\nRuhiger Tag: heute erfüllt nur eine Wette unsere Kriterien. Wir erzwingen nichts." : ""}\n`
      + `Spiele von 12:00 bis morgen 11:59 (Pariser Zeit)${weekend ? "; Wochenend-Tickets: Spiele von Freitag bis Sonntag" : ""}. Für jede Wette: die von IASHARK berechnete Wahrscheinlichkeit und die beste Quote ${tes ? `bei deinen Buchmachern (${bks})` : `bei den in deinem Land zugelassenen Buchmachern, die wir verfolgen (${bks})`}.`,
    teteSansPays: (prenom, jour, compte) => `<b>${prenom ? `${prenom}, dein` : "Dein"} Programm für ${jour}</b> · ${compte}\nFür jede Wette: die von IASHARK berechnete Wahrscheinlichkeit. Gib dein Land in deinem Pro-Bereich an (Seite Konto), um die Quoten der dort zugelassenen Buchmacher zu sehen.`,
    teteVide: (prenom, jour, motif) => `<b>${prenom ? `${prenom}, dein` : "Dein"} Programm für ${jour}</b> · keine Wette\n${motif}`,
    ailleurs: (c, bk) => `bei deinen Buchmachern nicht im Angebot (anderswo: ${c} bei ${bk})`,
    infosJour: "Heute in deinen Wettbewerben", infosHier: "Gestern in deinen Wettbewerben", infosNote: "Nur zur Info, ohne Wette.",
    analyse: "Analyse", autres: (n) => `und ${n} weitere${n > 1 ? "" : "s"} Spiel${n > 1 ? "e" : ""} auf der Website`,
    debriefMatin: "Auswertung am Morgen",
  },
  it: {
    tete: (prenom, jour, compte, calme, weekend, bks, tes) => `<b>${prenom ? `${prenom}, il tuo` : "Il tuo"} programma di ${jour}</b> · ${compte}${calme ? "\nGiornata tranquilla: oggi solo una scommessa rispetta i nostri criteri. Non forziamo." : ""}\n`
      + `Partite dalle 12:00 a domani alle 11:59 (ora di Parigi)${weekend ? "; ticket del weekend: partite da venerdì a domenica" : ""}. Per ogni scommessa: la probabilità calcolata da IASHARK e la quota migliore ${tes ? `presso i tuoi bookmaker (${bks})` : `presso i bookmaker autorizzati nel tuo paese che seguiamo (${bks})`}.`,
    teteSansPays: (prenom, jour, compte) => `<b>${prenom ? `${prenom}, il tuo` : "Il tuo"} programma di ${jour}</b> · ${compte}\nPer ogni scommessa: la probabilità calcolata da IASHARK. Indica il tuo paese nel tuo spazio Pro (pagina Account del sito) per vedere le quote dei bookmaker autorizzati da te.`,
    teteVide: (prenom, jour, motif) => `<b>${prenom ? `${prenom}, il tuo` : "Il tuo"} programma di ${jour}</b> · nessuna scommessa\n${motif}`,
    ailleurs: (c, bk) => `non offerta dai tuoi bookmaker (altrove: ${c} da ${bk})`,
    infosJour: "Oggi nelle tue competizioni", infosHier: "Ieri nelle tue competizioni", infosNote: "Solo per informazione, senza scommessa.",
    analyse: "analisi", autres: (n) => `e ${n} altr${n > 1 ? "e partite" : "a partita"} sul sito`,
    debriefMatin: "Resoconto del mattino",
  },
  pt: {
    tete: (prenom, jour, compte, calme, weekend, bks, tes) => `<b>${prenom ? `${prenom}, o teu` : "O teu"} programa de ${jour}</b> · ${compte}${calme ? "\nDia calmo: hoje só uma aposta cumpre os nossos critérios. Não forçamos." : ""}\n`
      + `Jogos das 12:00 até amanhã às 11:59 (hora de Paris)${weekend ? "; tickets do fim de semana: jogos de sexta a domingo" : ""}. Para cada aposta: a probabilidade calculada pela IASHARK e a melhor odd ${tes ? `nas tuas casas de apostas (${bks})` : `nas casas de apostas autorizadas no teu país que seguimos (${bks})`}.`,
    teteSansPays: (prenom, jour, compte) => `<b>${prenom ? `${prenom}, o teu` : "O teu"} programa de ${jour}</b> · ${compte}\nPara cada aposta: a probabilidade calculada pela IASHARK. Indica o teu país no teu espaço Pro (página Conta do site) para veres as odds das casas autorizadas no teu país.`,
    teteVide: (prenom, jour, motif) => `<b>${prenom ? `${prenom}, o teu` : "O teu"} programa de ${jour}</b> · nenhuma aposta\n${motif}`,
    ailleurs: (c, bk) => `não disponível nas tuas casas de apostas (noutra: ${c} na ${bk})`,
    infosJour: "Hoje nas tuas competições", infosHier: "Ontem nas tuas competições", infosNote: "Só para informação, sem aposta.",
    analyse: "análise", autres: (n) => `e mais ${n} jogo${n > 1 ? "s" : ""} no site`,
    debriefMatin: "Resumo da manhã",
  },
};
/** Textes du programme de chaque abonne dans sa langue (repli : francais). */
export const surMesure = (lang) => SUR_MESURE[normaliserLangue(lang) || "fr"] || SUR_MESURE.fr;
