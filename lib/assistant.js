/* Assistant IASHARK (19/11/2026, demandes de Clement : « un chatbot entre Combines et Blog, avec un truc bleu
   qui clignote », icone = l'aileron du logo, « vraiment convertir : soit l'abonnement soit l'affiliation »,
   « demande sur quelle plateforme il joue », toutes les langues selon la langue choisie par la personne).
   Fenetre de discussion plein ecran, ouverte par l'onglet « Chat » de la barre du bas (bottom-navigation.js)
   ou par toute adresse terminee par #assistant (lien a partager sur X et Telegram).
   Modele retenu par Clement parmi les composants 21st.dev : fenetre de chat avec en-tete, bulles une par une
   et « en train d'ecrire » (Chat Messages, id 20129) + boutons de reponse dans les bulles (id 28561).

   AUCUNE IA, aucun service payant : reponses preparees (intentions ci-dessous), recherche des equipes dans
   /data-home.json, derniers paris regles dans /preuves/bandeau.json (meme source et meme ordre que le bandeau
   des pages match : au moins 4 gagnes d'abord, puis un perdu, un gagne). Jamais un pari payant : le serveur ne
   met aucun pari dans ces fichiers ; l'assistant renvoie vers la page du match, ou le serveur decide.

   Trois profils (IasharkApp.context) : visiteur sans compte -> compte gratuit (match offert) ; inscrit gratuit
   -> Pro (4,99 la semaine) ou 1 mois de Pro offert par l'inscription Lolly Bet ; Pro -> rien a vendre sur
   l'abonnement, l'affiliation Lolly (1er pari rembourse jusqu'a 100 EUR). Une fois par navigateur, apres la
   premiere reponse : « Tu paries sur quel site ? » ; la reponse oriente vers Lolly avec notre lien.
   Langue = version du site choisie par la personne : fr ; en (en, gb, za) ; es (es, mx) ; pt.
   Suivi : clics des boutons via data-track (funnel-track.js, kind cta, libelles assistant_*), y compris le site
   de paris choisi. Le texte ecrit par le visiteur n'est jamais envoye nulle part. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.IasharkAssistant = api;
})(typeof window !== "undefined" ? window : this, function (G) {
  "use strict";

  var TG_CANAL = "https://t.me/+qCEr2JFPDDBlZTFk";
  var TG_CONTACT = "https://t.me/iashark_contact";
  var MAIL = "contact@iashark.com";
  var DIRS = ["fr", "en", "gb", "za", "es", "mx", "pt"];
  var LANGUE = { fr: "fr", en: "en", gb: "en", za: "en", es: "es", mx: "es", pt: "pt" };
  var NUM = { fr: "fr-FR", en: "en-GB", es: "es-ES", pt: "pt-PT" };
  // Sites de paris proposes a la question « tu paries ou ? » (les plus joues de chaque version).
  var SITES = {
    fr: ["Winamax", "Betclic", "Unibet", "Parions Sport"], en: ["DraftKings", "FanDuel", "bet365"],
    gb: ["bet365", "Sky Bet", "Paddy Power"], za: ["Hollywoodbets", "Betway", "bet365"],
    es: ["bet365", "Codere", "Sportium"], mx: ["Caliente", "Codere", "bet365"], pt: ["Betano", "Betclic", "Placard"]
  };
  // Prix ecrits seulement la ou ils sont surs (config/markets.json) ; ailleurs : bouton « Voir les prix ».
  var PRIX = {
    fr: "4,99 € la semaine, 14,99 € le mois ou 99 € l'année",
    es: "4,99 € a la semana, 14,99 € al mes o 99 € al año",
    pt: "4,99 € por semana, 14,99 € por mês ou 99 € por ano",
    en: "$4.99 a week or $19.99 a month"
  };

  // ---------------------------------------------------------------- textes (fr, en, es, pt)
  var T = {
    fr: {
      titre: "Assistant IASHARK", sous: "Répond tout de suite", fermer: "Fermer", envoyer: "Envoyer",
      champ: "Une équipe ou ta question…", ecrit: "en train d'écrire",
      bjVisiteur: ["Salut ! Je t'aide à trouver ton match.", "Le pari de ce match est offert aujourd'hui, il te faut juste un compte gratuit :"],
      bjMembre: ["Salut ! Ton pari offert du jour t'attend :"],
      bjPro: ["Salut ! Tu es Pro : tous les paris du jour sont ouverts pour toi.", "Tu cherches quoi ?"],
      offertTitre: "Offert aujourd'hui",
      c_gratuit: "Le match gratuit", c_chercher: "Chercher un match", c_resultats: "Derniers résultats", c_pro: "Le Pro, c'est quoi ?",
      c_proOffert: "Le Pro offert ?", c_combines: "Les combinés du jour", c_bonus: "Bonus Lolly Bet", c_site: "Où je parie ?",
      b_voirMatch: "Voir la page du match", b_monPari: "Voir mon pari offert", b_compte: "Créer mon compte gratuit",
      b_pro: "Prendre le Pro", b_proOffert: "Mon mois de Pro offert", b_offert: "Le match offert", b_telegram: "Rejoindre Telegram",
      b_contact: "Écrire à l'équipe", b_lolly: "Ouvrir mon compte Lolly Bet", b_combines: "Voir les combinés",
      b_compteMoi: "Mon compte", b_prix: "Voir les prix", b_methode: "Comment on calcule", b_autre: "Un autre site",
      b_aucun: "Je ne parie pas encore", b_plusTard: "Plus tard",
      gratuit: function (m) { return m ? ["Le match offert aujourd'hui : " + m + ".", "Le pari, sa cote et l'analyse complète sont gratuits. Il te faut juste un compte, ça prend 30 secondes."] : ["Le match offert du jour arrive chaque matin, dès que le calcul est fini.", "En attendant, rejoins la chaîne Telegram : on y poste le match du jour."]; },
      gratuitMembre: "Ton pari offert est sur la page du match, ouvert pour toi.",
      chercher: ["Écris le nom d'une équipe, je te trouve son match.", "Ou choisis dans les prochains :"],
      trouve1: "Je l'ai trouvé :", trouvePlus: "J'en ai trouvé plusieurs :",
      estOffert: "Bonne nouvelle : c'est le match offert aujourd'hui. Le pari et l'analyse sont gratuits avec un compte.",
      estOffertMembre: "C'est ton match offert du jour : le pari est ouvert pour toi.",
      estPro: function (x) { return ["Le pari de ce match est dans le Pro.", "Deux façons de l'avoir : le Pro" + (x ? " à partir de " + x : "") + ", ou 1 mois de Pro offert en t'inscrivant chez Lolly Bet, notre partenaire."]; },
      estProAbonne: "Ton pari et l'analyse complète sont sur la page du match.",
      estFini: "Ce match est passé. Le score et notre pari sont sur sa page.",
      pasTrouve: ["Ce match n'est pas dans nos analyses pour l'instant.", "Voici les prochains matchs qu'on a :"],
      resultats: ["Nos derniers paris réglés, gagnés et perdus :"],
      resultatsFin: "Tous nos paris sont publiés avant le coup d'envoi et jamais changés après.",
      resultatsVide: "Les résultats se mettent à jour chaque matin.",
      gagne: "Gagné", perdu: "Perdu", annule: "Remboursé", cote: "cote",
      pro: function (p) { return ["Le Pro ouvre tous les paris du jour, sur tous les matchs : le pari, sa cote, l'analyse complète, les combinés et la Sélection en or.", p ? "C'est " + p + ". Tu arrêtes quand tu veux, en un clic." : "Tu arrêtes quand tu veux, en un clic."]; },
      proOuOffert: "Ou tu l'as gratuitement pendant 1 mois en t'inscrivant chez Lolly Bet, notre partenaire, avec notre lien.",
      proOffert: ["1 mois de Pro offert : inscris-toi chez Lolly Bet, notre partenaire, avec notre lien, puis donne-nous ton identifiant Lolly.", "Chez eux, ton 1er pari est en plus remboursé en cash jusqu'à 100 €."],
      proOffertDejaPro: "Tu es déjà Pro. Par contre le bonus Lolly Bet marche pour toi aussi : 1er pari remboursé en cash jusqu'à 100 € avec notre lien.",
      bonus: ["Lolly Bet, notre partenaire : avec notre lien, ton 1er pari est remboursé en cash jusqu'à 100 €.", "Ensuite tes 2e et 3e dépôts te donnent un pari gratuit, sans condition de mise (jusqu'à 50 €)."],
      bonusPlus: "Et si tu n'es pas encore Pro, cette inscription t'offre aussi 1 mois de Pro IASHARK.",
      question: "Au fait, tu paries sur quel site d'habitude ?",
      siteLolly: "Top. Si tu t'es inscrit avec notre lien, demande ton mois de Pro offert.",
      siteLollyPro: "Top, nos paris se jouent très bien chez Lolly Bet.",
      siteAutre: function (s) { return ["Garde " + (s || "ton site") + ". Ouvre aussi un compte chez Lolly Bet, notre partenaire, avec notre lien : ton 1er pari est remboursé en cash jusqu'à 100 €.", "Avec deux sites, tu prends la meilleure cote à chaque pari."]; },
      siteAucun: ["Pour bien commencer : Lolly Bet, notre partenaire. Avec notre lien, ton 1er pari est remboursé en cash jusqu'à 100 €.", "Et ici, le match offert est gratuit chaque jour."],
      plusTard: "Pas de souci. Je reste là si tu as une question.",
      resilier: ["Pour arrêter le Pro : Mon compte, rubrique Abonnement, puis « Résilier ».", "Tu gardes l'accès jusqu'à la fin de la période déjà payée."],
      paiement: ["Le paiement se fait par carte (Visa, Mastercard), Apple Pay ou Google Pay, sur une page sécurisée Stripe.", "Carte refusée ? Essaie une autre carte depuis Mon compte. Toujours bloqué ? Écris-nous, on règle ça vite."],
      compte: ["Pour te connecter ou créer ton compte, c'est sur la page Compte.", "Mot de passe oublié ? Le lien est juste sous le formulaire de connexion."],
      sur: ["Un pari sûr à 100 %, ça n'existe pas, et personne d'honnête ne te le promettra.", "Nos paris les plus solides du jour sont dans le Pro. Le match offert, lui, est gratuit avec un compte."],
      surPro: ["Un pari sûr à 100 %, ça n'existe pas.", "Tes paris du jour sont sur les pages des matchs et dans les combinés."],
      combines: ["Les combinés du jour (Petit combiné, Grand combiné, Sélection en or) et les buteurs sont sur la page Combinés.", "Ils sont publiés avant les matchs, gagnés et perdus montrés."],
      buteur: ["Les buteurs du jour sont sur la page Combinés, avec la cote quand on l'a.", "Le buteur du match offert est gratuit avec un compte."],
      methode: ["Pour chaque match, on part de la forme des équipes, des compositions probables, des absents et des cotes.", "Le match est simulé 10 000 fois, puis on garde le pari où la cote nous paraît bonne."],
      telegram: ["La chaîne Telegram est gratuite : match du jour, résultats et actus.", "Tu peux aussi nous écrire en privé sur Telegram."],
      whatsapp: "On n'a pas de WhatsApp, tout se passe sur Telegram (gratuit).",
      humain: ["Tu peux écrire directement à l'équipe sur Telegram, on répond nous-mêmes.", "Ou par e-mail : " + MAIL + "."],
      live: ["Les scores en direct s'affichent sur la page de chaque match.", "Écris le nom d'une équipe et je te donne sa page."],
      merci: ["Avec plaisir ! Autre chose ?"],
      insulte: ["Je reste là si tu as une vraie question sur un match."],
      mineur: ["Les paris sont interdits aux moins de 18 ans, IASHARK aussi.", "Les infos des matchs restent ouvertes à tous si tu veux juste parler foot."],
      aide: ["Si tu as beaucoup perdu ou si tu veux te refaire, fais une pause : courir après ses pertes, c'est le piège.", "Tu peux en parler gratuitement à Joueurs Info Service, 09 74 75 13 13, ou sur joueurs-info-service.fr."],
      b_aide: "Joueurs Info Service", aideUrl: "https://www.joueurs-info-service.fr",
      termes: {
        btts: "« Les deux équipes marquent » : gagné si chaque équipe met au moins un but, quel que soit le vainqueur.",
        over: "« Plus de 2,5 buts » : gagné s'il y a 3 buts ou plus. « Moins de 2,5 » : 2 buts ou moins.",
        dc: "« Double chance » : tu joues deux issues sur trois. 1X = victoire de l'équipe à domicile ou nul.",
        un: "1N2 : 1 = victoire à domicile, N = match nul, 2 = victoire à l'extérieur.",
        handicap: "Handicap : on retire (ou ajoute) des buts à une équipe avant de compter le résultat.",
        cote: "La cote, c'est ce que rapporte le pari : à 1,80, tu récupères 1,80 fois ta mise si c'est gagné."
      },
      incompris1: ["Je n'ai pas bien compris. Écris le nom d'une équipe, ou choisis :"],
      incompris2: ["Là, je préfère te passer à l'équipe : écris-nous sur Telegram, on te répond nous-mêmes.", "Ou par e-mail : " + MAIL + "."],
      bientot: "Les matchs du jour arrivent chaque matin."
    },
    en: {
      titre: "IASHARK Assistant", sous: "Answers right away", fermer: "Close", envoyer: "Send",
      champ: "A team or your question…", ecrit: "typing",
      bjVisiteur: ["Hi! I'll help you find your match.", "The pick for this match is free today, you just need a free account:"],
      bjMembre: ["Hi! Your free pick of the day is waiting:"],
      bjPro: ["Hi! You're Pro: every pick of the day is open for you.", "What are you looking for?"],
      offertTitre: "Free today",
      c_gratuit: "The free match", c_chercher: "Find a match", c_resultats: "Latest results", c_pro: "What's Pro?",
      c_proOffert: "Free Pro?", c_combines: "Today's accumulators", c_bonus: "Lolly Bet bonus", c_site: "Where should I bet?",
      b_voirMatch: "See the match page", b_monPari: "See my free pick", b_compte: "Create my free account",
      b_pro: "Get Pro", b_proOffert: "My free Pro month", b_offert: "The free match", b_telegram: "Join Telegram",
      b_contact: "Message the team", b_lolly: "Open my Lolly Bet account", b_combines: "See accumulators",
      b_compteMoi: "My account", b_prix: "See prices", b_methode: "How we calculate", b_autre: "Another site",
      b_aucun: "I don't bet yet", b_plusTard: "Later",
      gratuit: function (m) { return m ? ["Today's free match: " + m + ".", "The pick, its odds and the full analysis are free. You just need an account, it takes 30 seconds."] : ["The free match of the day lands every morning, once the daily run is done.", "Meanwhile, join our Telegram channel: we post the match of the day there."]; },
      gratuitMembre: "Your free pick is on the match page, open for you.",
      chercher: ["Type a team name and I'll find its match.", "Or pick one of the next ones:"],
      trouve1: "Found it:", trouvePlus: "I found a few:",
      estOffert: "Good news: it's today's free match. The pick and analysis are free with an account.",
      estOffertMembre: "It's your free match of the day: the pick is open for you.",
      estPro: function (x) { return ["The pick for this match is in Pro.", "Two ways to get it: Pro" + (x ? " from " + x : "") + ", or one month of Pro free when you sign up with Lolly Bet, our partner."]; },
      estProAbonne: "Your pick and the full analysis are on the match page.",
      estFini: "This match is over. The score and our pick are on its page.",
      pasTrouve: ["This match isn't in our analyses for now.", "Here are the next matches we cover:"],
      resultats: ["Our latest settled picks, wins and losses:"],
      resultatsFin: "Every pick is published before kick-off and never changed afterwards.",
      resultatsVide: "Results update every morning.",
      gagne: "Won", perdu: "Lost", annule: "Void", cote: "odds",
      pro: function (p) { return ["Pro opens every pick of the day, on every match: the pick, its odds, the full analysis, the accumulators and the Gold Selection.", p ? "It's " + p + ". Cancel anytime in one click." : "Cancel anytime in one click."]; },
      proOuOffert: "Or get it free for one month by signing up with Lolly Bet, our partner, through our link.",
      proOffert: ["One month of Pro, free: sign up with Lolly Bet, our partner, through our link, then send us your Lolly username.", "On top of that, your first bet there is refunded in cash up to €100."],
      proOffertDejaPro: "You're already Pro. The Lolly Bet bonus works for you too: first bet refunded in cash up to €100 through our link.",
      bonus: ["Lolly Bet, our partner: through our link, your first bet is refunded in cash up to €100.", "Then your 2nd and 3rd deposits give you a free bet, no wagering (up to €50)."],
      bonusPlus: "And if you're not Pro yet, this sign-up also gets you one month of IASHARK Pro free.",
      question: "By the way, which site do you usually bet on?",
      siteLolly: "Nice. If you signed up through our link, claim your free Pro month.",
      siteLollyPro: "Nice, our picks play well on Lolly Bet.",
      siteAutre: function (s) { return ["Keep " + (s || "your site") + ". Also open a Lolly Bet account through our link: your first bet is refunded in cash up to €100.", "With two sites, you always take the best odds."]; },
      siteAucun: ["A good start: Lolly Bet, our partner. Through our link, your first bet is refunded in cash up to €100.", "And here, the free match is free every day."],
      plusTard: "No problem. I'm here if you have a question.",
      resilier: ["To stop Pro: My account, Subscription, then \"Cancel\".", "You keep access until the end of the period already paid."],
      paiement: ["Payment is by card (Visa, Mastercard), Apple Pay or Google Pay, on a secure Stripe page.", "Card declined? Try another one from My account. Still stuck? Message us and we'll sort it out."],
      compte: ["Log in or create your account on the Account page.", "Forgot your password? The link is right under the login form."],
      sur: ["A 100% sure bet doesn't exist, and nobody honest will promise you one.", "Our strongest picks of the day are in Pro. The free match is free with an account."],
      surPro: ["A 100% sure bet doesn't exist.", "Your picks of the day are on the match pages and in the accumulators."],
      combines: ["Today's accumulators and goalscorers are on the Accumulators page.", "They're published before kick-off, wins and losses shown."],
      buteur: ["Today's goalscorers are on the Accumulators page, with the odds when we have them.", "The free match's goalscorer is free with an account."],
      methode: ["For each match we start from team form, likely line-ups, absences and the odds.", "The match is simulated 10,000 times and we keep the pick where the odds look good."],
      telegram: ["Our Telegram channel is free: match of the day, results and news.", "You can also message us privately on Telegram."],
      whatsapp: "We don't have WhatsApp, everything happens on Telegram (free).",
      humain: ["You can message the team directly on Telegram, we answer ourselves.", "Or by email: " + MAIL + "."],
      live: ["Live scores show on each match page.", "Type a team name and I'll give you its page."],
      merci: ["You're welcome! Anything else?"],
      insulte: ["I'm here if you have a real question about a match."],
      mineur: ["Betting is for over-18s only, and so is IASHARK.", "Match info stays open to everyone if you just want to talk football."],
      aide: ["If you've lost a lot or want to win it back, take a break: chasing losses is the trap.", "You can talk to someone for free at gamblingtherapy.org."],
      b_aide: "Gambling Therapy", aideUrl: "https://www.gamblingtherapy.org",
      termes: {
        btts: "\"Both teams to score\": wins if each team scores at least once, whoever wins.",
        over: "\"Over 2.5 goals\": wins with 3 goals or more. \"Under 2.5\": 2 goals or fewer.",
        dc: "\"Double chance\": you cover two of the three outcomes. 1X = home win or draw.",
        un: "1X2: 1 = home win, X = draw, 2 = away win.",
        handicap: "Handicap: goals are taken from (or given to) a team before the result is counted.",
        cote: "The odds tell you the payout: at 1.80, you get back 1.80 times your stake if it wins."
      },
      incompris1: ["I didn't quite get that. Type a team name, or pick:"],
      incompris2: ["I'd rather hand you to the team: message us on Telegram, we answer ourselves.", "Or by email: " + MAIL + "."],
      bientot: "Today's matches land every morning."
    },
    es: {
      titre: "Asistente IASHARK", sous: "Responde al instante", fermer: "Cerrar", envoyer: "Enviar",
      champ: "Un equipo o tu pregunta…", ecrit: "escribiendo",
      bjVisiteur: ["¡Hola! Te ayudo a encontrar tu partido.", "La apuesta de este partido es gratis hoy, solo necesitas una cuenta gratis:"],
      bjMembre: ["¡Hola! Tu apuesta gratis del día te espera:"],
      bjPro: ["¡Hola! Eres Pro: todas las apuestas del día están abiertas para ti.", "¿Qué buscas?"],
      offertTitre: "Gratis hoy",
      c_gratuit: "El partido gratis", c_chercher: "Buscar un partido", c_resultats: "Últimos resultados", c_pro: "¿Qué es Pro?",
      c_proOffert: "¿Pro gratis?", c_combines: "Combinadas del día", c_bonus: "Bono Lolly Bet", c_site: "¿Dónde apuesto?",
      b_voirMatch: "Ver la página del partido", b_monPari: "Ver mi apuesta gratis", b_compte: "Crear mi cuenta gratis",
      b_pro: "Hazte Pro", b_proOffert: "Mi mes de Pro gratis", b_offert: "El partido gratis", b_telegram: "Unirme a Telegram",
      b_contact: "Escribir al equipo", b_lolly: "Abrir mi cuenta en Lolly Bet", b_combines: "Ver las combinadas",
      b_compteMoi: "Mi cuenta", b_prix: "Ver precios", b_methode: "Cómo calculamos", b_autre: "Otra casa",
      b_aucun: "Aún no apuesto", b_plusTard: "Más tarde",
      gratuit: function (m) { return m ? ["El partido gratis de hoy: " + m + ".", "La apuesta, su cuota y el análisis completo son gratis. Solo necesitas una cuenta, son 30 segundos."] : ["El partido gratis del día llega cada mañana, cuando termina el cálculo.", "Mientras tanto, únete a nuestro canal de Telegram: ahí publicamos el partido del día."]; },
      gratuitMembre: "Tu apuesta gratis está en la página del partido, abierta para ti.",
      chercher: ["Escribe el nombre de un equipo y te encuentro su partido.", "O elige entre los próximos:"],
      trouve1: "Lo encontré:", trouvePlus: "Encontré varios:",
      estOffert: "Buenas noticias: es el partido gratis de hoy. La apuesta y el análisis son gratis con una cuenta.",
      estOffertMembre: "Es tu partido gratis del día: la apuesta está abierta para ti.",
      estPro: function (x) { return ["La apuesta de este partido está en Pro.", "Dos formas de tenerla: Pro" + (x ? " desde " + x : "") + ", o 1 mes de Pro gratis al registrarte en Lolly Bet, nuestro socio."]; },
      estProAbonne: "Tu apuesta y el análisis completo están en la página del partido.",
      estFini: "Este partido ya terminó. El marcador y nuestra apuesta están en su página.",
      pasTrouve: ["Este partido no está en nuestros análisis por ahora.", "Estos son los próximos partidos que tenemos:"],
      resultats: ["Nuestras últimas apuestas resueltas, ganadas y perdidas:"],
      resultatsFin: "Todas nuestras apuestas se publican antes del inicio y nunca se cambian después.",
      resultatsVide: "Los resultados se actualizan cada mañana.",
      gagne: "Ganada", perdu: "Perdida", annule: "Anulada", cote: "cuota",
      pro: function (p) { return ["Pro abre todas las apuestas del día, en todos los partidos: la apuesta, su cuota, el análisis completo, las combinadas y la Selección de oro.", p ? "Son " + p + ". Cancelas cuando quieras, con un clic." : "Cancelas cuando quieras, con un clic."]; },
      proOuOffert: "O tenlo gratis 1 mes registrándote en Lolly Bet, nuestro socio, con nuestro enlace.",
      proOffert: ["1 mes de Pro gratis: regístrate en Lolly Bet, nuestro socio, con nuestro enlace, y luego envíanos tu usuario de Lolly.", "Además, allí tu 1.ª apuesta se reembolsa en efectivo hasta 100 €."],
      proOffertDejaPro: "Ya eres Pro. El bono de Lolly Bet también es para ti: 1.ª apuesta reembolsada en efectivo hasta 100 € con nuestro enlace.",
      bonus: ["Lolly Bet, nuestro socio: con nuestro enlace, tu 1.ª apuesta se reembolsa en efectivo hasta 100 €.", "Luego tus 2.º y 3.er depósitos te dan una apuesta gratis, sin requisito de apuesta (hasta 50 €)."],
      bonusPlus: "Y si aún no eres Pro, este registro también te regala 1 mes de IASHARK Pro.",
      question: "Por cierto, ¿en qué casa apuestas normalmente?",
      siteLolly: "Genial. Si te registraste con nuestro enlace, pide tu mes de Pro gratis.",
      siteLollyPro: "Genial, nuestras apuestas se juegan muy bien en Lolly Bet.",
      siteAutre: function (s) { return ["Quédate con " + (s || "tu casa") + ". Abre también una cuenta en Lolly Bet, nuestro socio, con nuestro enlace: tu 1.ª apuesta se reembolsa en efectivo hasta 100 €.", "Con dos casas, siempre tomas la mejor cuota."]; },
      siteAucun: ["Para empezar bien: Lolly Bet, nuestro socio. Con nuestro enlace, tu 1.ª apuesta se reembolsa en efectivo hasta 100 €.", "Y aquí, el partido gratis es gratis cada día."],
      plusTard: "Sin problema. Aquí estoy si tienes una pregunta.",
      resilier: ["Para dejar Pro: Mi cuenta, Suscripción y luego «Cancelar».", "Mantienes el acceso hasta el final del periodo ya pagado."],
      paiement: ["El pago es con tarjeta (Visa, Mastercard), Apple Pay o Google Pay, en una página segura de Stripe.", "¿Tarjeta rechazada? Prueba otra desde Mi cuenta. ¿Sigues bloqueado? Escríbenos y lo arreglamos."],
      compte: ["Para entrar o crear tu cuenta, ve a la página Cuenta.", "¿Olvidaste tu contraseña? El enlace está justo debajo del formulario."],
      sur: ["Una apuesta 100 % segura no existe, y nadie honesto te la prometerá.", "Nuestras apuestas más sólidas del día están en Pro. El partido gratis es gratis con una cuenta."],
      surPro: ["Una apuesta 100 % segura no existe.", "Tus apuestas del día están en las páginas de los partidos y en las combinadas."],
      combines: ["Las combinadas del día y los goleadores están en la página Combinadas.", "Se publican antes de los partidos, ganadas y perdidas a la vista."],
      buteur: ["Los goleadores del día están en la página Combinadas, con la cuota cuando la tenemos.", "El goleador del partido gratis es gratis con una cuenta."],
      methode: ["Para cada partido partimos de la forma de los equipos, las alineaciones probables, las bajas y las cuotas.", "El partido se simula 10 000 veces y nos quedamos con la apuesta donde la cuota nos parece buena."],
      telegram: ["Nuestro canal de Telegram es gratis: partido del día, resultados y noticias.", "También puedes escribirnos en privado por Telegram."],
      whatsapp: "No tenemos WhatsApp, todo pasa por Telegram (gratis).",
      humain: ["Puedes escribir directamente al equipo por Telegram, respondemos nosotros mismos.", "O por correo: " + MAIL + "."],
      live: ["Los marcadores en directo aparecen en la página de cada partido.", "Escribe un equipo y te doy su página."],
      merci: ["¡Con gusto! ¿Algo más?"],
      insulte: ["Aquí estoy si tienes una pregunta de verdad sobre un partido."],
      mineur: ["Las apuestas están prohibidas a menores de 18 años, IASHARK también.", "La info de los partidos sigue abierta para todos si solo quieres hablar de fútbol."],
      aide: ["Si has perdido mucho o quieres recuperarlo, haz una pausa: perseguir las pérdidas es la trampa.", "Puedes hablar con alguien gratis en gamblingtherapy.org."],
      b_aide: "Gambling Therapy", aideUrl: "https://www.gamblingtherapy.org",
      termes: {
        btts: "«Ambos equipos marcan»: se gana si cada equipo marca al menos un gol, gane quien gane.",
        over: "«Más de 2,5 goles»: se gana con 3 goles o más. «Menos de 2,5»: 2 goles o menos.",
        dc: "«Doble oportunidad»: juegas dos de los tres resultados. 1X = gana el local o empate.",
        un: "1X2: 1 = gana el local, X = empate, 2 = gana el visitante.",
        handicap: "Hándicap: se quitan (o se suman) goles a un equipo antes de contar el resultado.",
        cote: "La cuota es lo que paga la apuesta: a 1,80, recuperas 1,80 veces lo apostado si ganas."
      },
      incompris1: ["No te entendí bien. Escribe el nombre de un equipo, o elige:"],
      incompris2: ["Mejor te paso con el equipo: escríbenos por Telegram, respondemos nosotros mismos.", "O por correo: " + MAIL + "."],
      bientot: "Los partidos del día llegan cada mañana."
    },
    pt: {
      titre: "Assistente IASHARK", sous: "Responde na hora", fermer: "Fechar", envoyer: "Enviar",
      champ: "Uma equipa ou a tua pergunta…", ecrit: "a escrever",
      bjVisiteur: ["Olá! Ajudo-te a encontrar o teu jogo.", "A aposta deste jogo é grátis hoje, só precisas de uma conta grátis:"],
      bjMembre: ["Olá! A tua aposta grátis do dia está à tua espera:"],
      bjPro: ["Olá! És Pro: todas as apostas do dia estão abertas para ti.", "O que procuras?"],
      offertTitre: "Grátis hoje",
      c_gratuit: "O jogo grátis", c_chercher: "Procurar um jogo", c_resultats: "Últimos resultados", c_pro: "O que é o Pro?",
      c_proOffert: "Pro grátis?", c_combines: "Múltiplas do dia", c_bonus: "Bónus Lolly Bet", c_site: "Onde aposto?",
      b_voirMatch: "Ver a página do jogo", b_monPari: "Ver a minha aposta grátis", b_compte: "Criar a minha conta grátis",
      b_pro: "Ficar Pro", b_proOffert: "O meu mês de Pro grátis", b_offert: "O jogo grátis", b_telegram: "Entrar no Telegram",
      b_contact: "Escrever à equipa", b_lolly: "Abrir a minha conta Lolly Bet", b_combines: "Ver as múltiplas",
      b_compteMoi: "A minha conta", b_prix: "Ver preços", b_methode: "Como calculamos", b_autre: "Outro site",
      b_aucun: "Ainda não aposto", b_plusTard: "Mais tarde",
      gratuit: function (m) { return m ? ["O jogo grátis de hoje: " + m + ".", "A aposta, a odd e a análise completa são grátis. Só precisas de uma conta, demora 30 segundos."] : ["O jogo grátis do dia chega todas as manhãs, quando o cálculo termina.", "Entretanto, entra no nosso canal de Telegram: publicamos lá o jogo do dia."]; },
      gratuitMembre: "A tua aposta grátis está na página do jogo, aberta para ti.",
      chercher: ["Escreve o nome de uma equipa e eu encontro o jogo.", "Ou escolhe entre os próximos:"],
      trouve1: "Encontrei:", trouvePlus: "Encontrei vários:",
      estOffert: "Boa notícia: é o jogo grátis de hoje. A aposta e a análise são grátis com uma conta.",
      estOffertMembre: "É o teu jogo grátis do dia: a aposta está aberta para ti.",
      estPro: function (x) { return ["A aposta deste jogo está no Pro.", "Duas formas de a ter: o Pro" + (x ? " a partir de " + x : "") + ", ou 1 mês de Pro grátis ao registares-te na Lolly Bet, o nosso parceiro."]; },
      estProAbonne: "A tua aposta e a análise completa estão na página do jogo.",
      estFini: "Este jogo já acabou. O resultado e a nossa aposta estão na página dele.",
      pasTrouve: ["Este jogo ainda não está nas nossas análises.", "Estes são os próximos jogos que temos:"],
      resultats: ["As nossas últimas apostas resolvidas, ganhas e perdidas:"],
      resultatsFin: "Todas as apostas são publicadas antes do início e nunca alteradas depois.",
      resultatsVide: "Os resultados são atualizados todas as manhãs.",
      gagne: "Ganha", perdu: "Perdida", annule: "Anulada", cote: "odd",
      pro: function (p) { return ["O Pro abre todas as apostas do dia, em todos os jogos: a aposta, a odd, a análise completa, as múltiplas e a Seleção de ouro.", p ? "São " + p + ". Cancelas quando quiseres, num clique." : "Cancelas quando quiseres, num clique."]; },
      proOuOffert: "Ou tens 1 mês grátis ao registares-te na Lolly Bet, o nosso parceiro, com o nosso link.",
      proOffert: ["1 mês de Pro grátis: regista-te na Lolly Bet, o nosso parceiro, com o nosso link, e depois envia-nos o teu utilizador Lolly.", "Além disso, lá a tua 1.ª aposta é reembolsada em dinheiro até 100 €."],
      proOffertDejaPro: "Já és Pro. O bónus da Lolly Bet também é para ti: 1.ª aposta reembolsada em dinheiro até 100 € com o nosso link.",
      bonus: ["Lolly Bet, o nosso parceiro: com o nosso link, a tua 1.ª aposta é reembolsada em dinheiro até 100 €.", "Depois, o 2.º e o 3.º depósitos dão-te uma aposta grátis, sem requisitos de aposta (até 50 €)."],
      bonusPlus: "E se ainda não és Pro, este registo dá-te também 1 mês de IASHARK Pro.",
      question: "Já agora, em que site costumas apostar?",
      siteLolly: "Ótimo. Se te registaste com o nosso link, pede o teu mês de Pro grátis.",
      siteLollyPro: "Ótimo, as nossas apostas jogam-se muito bem na Lolly Bet.",
      siteAutre: function (s) { return ["Fica com " + (s || "o teu site") + ". Abre também uma conta na Lolly Bet, o nosso parceiro, com o nosso link: a tua 1.ª aposta é reembolsada em dinheiro até 100 €.", "Com dois sites, apanhas sempre a melhor odd."]; },
      siteAucun: ["Para começar bem: Lolly Bet, o nosso parceiro. Com o nosso link, a tua 1.ª aposta é reembolsada em dinheiro até 100 €.", "E aqui, o jogo grátis é grátis todos os dias."],
      plusTard: "Sem problema. Estou aqui se tiveres uma pergunta.",
      resilier: ["Para parar o Pro: A minha conta, Assinatura e depois «Cancelar».", "Manténs o acesso até ao fim do período já pago."],
      paiement: ["O pagamento é por cartão (Visa, Mastercard), Apple Pay ou Google Pay, numa página segura da Stripe.", "Cartão recusado? Tenta outro em A minha conta. Continuas bloqueado? Escreve-nos e resolvemos."],
      compte: ["Para entrar ou criar a tua conta, vai à página Conta.", "Esqueceste a palavra-passe? O link está logo abaixo do formulário."],
      sur: ["Uma aposta 100 % segura não existe, e ninguém honesto ta vai prometer.", "As nossas apostas mais sólidas do dia estão no Pro. O jogo grátis é grátis com uma conta."],
      surPro: ["Uma aposta 100 % segura não existe.", "As tuas apostas do dia estão nas páginas dos jogos e nas múltiplas."],
      combines: ["As múltiplas do dia e os marcadores estão na página Múltiplas.", "São publicadas antes dos jogos, ganhas e perdidas à vista."],
      buteur: ["Os marcadores do dia estão na página Múltiplas, com a odd quando a temos.", "O marcador do jogo grátis é grátis com uma conta."],
      methode: ["Para cada jogo partimos da forma das equipas, dos onzes prováveis, das ausências e das odds.", "O jogo é simulado 10 000 vezes e ficamos com a aposta onde a odd nos parece boa."],
      telegram: ["O nosso canal de Telegram é grátis: jogo do dia, resultados e notícias.", "Também nos podes escrever em privado no Telegram."],
      whatsapp: "Não temos WhatsApp, tudo passa pelo Telegram (grátis).",
      humain: ["Podes escrever diretamente à equipa no Telegram, respondemos nós mesmos.", "Ou por e-mail: " + MAIL + "."],
      live: ["Os resultados ao vivo aparecem na página de cada jogo.", "Escreve uma equipa e dou-te a página."],
      merci: ["De nada! Mais alguma coisa?"],
      insulte: ["Estou aqui se tiveres uma pergunta a sério sobre um jogo."],
      mineur: ["As apostas são proibidas a menores de 18 anos, a IASHARK também.", "A informação dos jogos continua aberta a todos se só quiseres falar de futebol."],
      aide: ["Se perdeste muito ou queres recuperar, faz uma pausa: correr atrás das perdas é a armadilha.", "Podes falar com alguém gratuitamente em gamblingtherapy.org."],
      b_aide: "Gambling Therapy", aideUrl: "https://www.gamblingtherapy.org",
      termes: {
        btts: "«Ambas marcam»: ganha se cada equipa marcar pelo menos um golo, ganhe quem ganhar.",
        over: "«Mais de 2,5 golos»: ganha com 3 golos ou mais. «Menos de 2,5»: 2 golos ou menos.",
        dc: "«Dupla hipótese»: jogas dois dos três resultados. 1X = vitória da casa ou empate.",
        un: "1X2: 1 = vitória da casa, X = empate, 2 = vitória fora.",
        handicap: "Handicap: tiram-se (ou somam-se) golos a uma equipa antes de contar o resultado.",
        cote: "A odd é o que a aposta paga: a 1,80, recebes 1,80 vezes o que apostaste se ganhares."
      },
      incompris1: ["Não percebi bem. Escreve o nome de uma equipa, ou escolhe:"],
      incompris2: ["Prefiro passar-te à equipa: escreve-nos no Telegram, respondemos nós mesmos.", "Ou por e-mail: " + MAIL + "."],
      bientot: "Os jogos do dia chegam todas as manhãs."
    }
  };

  // ---------------------------------------------------------------- outils
  function version(chemin) {
    var m = /^\/([a-z]{2})(?:\/|$)/.exec(String(chemin || ""));
    return m && DIRS.indexOf(m[1]) !== -1 ? m[1] : "fr";
  }
  function langue(dir) { return LANGUE[dir] || "fr"; }
  function marche(dir) { return dir === "en" ? "us" : dir === "gb" || dir === "za" || dir === "mx" ? dir : "fr"; }
  var MINI = { fr: "4,99 €", es: "4,99 €", pt: "4,99 €", en: "$4.99" };
  function prixDe(dir) { return PRIX[dir] || ""; }
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[’']/g, " ").replace(/[^a-z0-9%]+/g, " ").trim();
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function nom(e) { return e && typeof e === "object" ? e.n : e; }
  function a(texte, re) { return re.test(" " + texte + " "); }
  function slug(s) { return norm(s).replace(/\s+/g, "_"); }

  // ---------------------------------------------------------------- intentions (fr, en, es, pt)
  // Ordre = priorite (liste revue avec ChatGPT le 19/11) : detresse et mineurs, humain, argent et compte, offres,
  // puis le reste. Chaque motif s'applique au texte normalise (minuscules, sans accents) entoure d'espaces ;
  // le 3e element, s'il existe, annule la correspondance (« carte refusee » n'est pas « carte pour le gratuit »).
  var INTENTIONS = [
    ["mineur", /\s(j ai|jai|g|i m|im|i am|tengo|tenho)\s?(1[0-7]|[0-9])\s?(ans|years|yo|anos)\s(?!(de|d|of|que|en|em|a) )|\smineur|\sunder 18|\spas majeur|\smenor de (edad|idade)|\ssoy menor|\ssou menor/],
    ["aide", /arreter de (jouer|parier)|arreter les paris|stop gambling|quit gambling|dejar de apostar|parar de apostar|recuperer mes pertes|rattraper mes pertes|me refaire|tout perdu|perdu tout|(j ai|jai|g) (encore )?perdu (\d+|mon argent|ma paie|mon salaire|mes economies|beaucoup|gros|tout)|i lost (\d+|everything|all my|my money|a lot)|perdi (\d+|todo|tudo|mi dinero|meu dinheiro|mucho|muito)|addict|accro|dette|dettes|endette|loyer|emprunte pour|je n arrive plus a arreter|arrive pas a arreter|chase (my )?loss|lost everything|gambling problem|win it back|cant stop|recuperar lo perdido|recuperar o que perdi|recuperar (mis|as) perdidas|adiccion|vicio|deudas|dividas|ludopat/],
    ["perdu", /\s((j ai|jai|on a|vous avez|t as|tu as|ca a|il a) (encore )?perdu|pari perdu|paris perdus|prono perdu|perdant|i lost|you lost|lost (the|my|your) (bet|pick)|perdi|perdio|perdeu|perdimos|aposta perdida|apuesta perdida)(?! (\d|tout|mon argent|ma paie|everything|mon mot de passe|mon mdp|mon code|mon compte|mon identifiant|my password|my account|mi contrasena|mi cuenta|a minha senha|minha senha|a senha|o acesso))/],
    ["pasBook", /\s(pas de bookmaker|veux pas de bookmaker|sans bookmaker|pas de site de paris|veux pas (de )?lolly|pas lolly|no bookmaker|without (a )?bookmaker|don t want (a )?bookmaker|sin casa de apuestas|no quiero (casa|lolly)|sem casa de apostas|nao quero (casa|lolly))/],
    ["hesite", /\s(j hesite|hesite|hesiter|pas sur de prendre|i m not sure|not sure|hesitant|tengo dudas|dudo|estou na duvida|hesito)\s/],
    ["reflechis", /\s(je reflechis|je vais reflechir|reflechir|je vais voir|on verra|je verrai|plus tard|let me think|i ll think|maybe later|lo pienso|lo voy a pensar|voy a pensar|vou pensar|depois vejo|mais tarde)\s/],
    ["justeGratuit", /\s(juste le gratuit|que le gratuit|seulement le gratuit|le gratuit me suffit|gratuit suffit|just the free|free is enough|solo lo gratis|me basta lo gratis|so o gratis|o gratis chega)\s/],
    ["dejaGagne", /\s(je gagne deja|je gagne seul|je gagne tout seul|pas besoin de vous|j ai pas besoin de vous|i win already|i already win|don t need you|ya gano|gano solo|no os necesito|ja ganho|ganho sozinho|nao preciso de voces)/],
    ["confiance", /\s(pas confiance|fais pas confiance|aucune confiance|confiance en (l ia|une ia|vous|un robot)|trust (ai|you|a bot)|don t trust|no confio|nao confio|desconfio)/],
    ["hack", /\s(ignore (tes|les|vos|your|all)|tes regles|tes instructions|system prompt|prompt|je suis (le )?(patron|admin|createur|developpeur)|i am (the )?(admin|owner|developer)|soy (el )?(admin|dueno)|sou (o )?(admin|dono))/],
    ["club", /\s(tu supportes|tu es pour qui|t es pour qui|ton club|ton equipe (prefere|favorite)|favorite (team|club)|who do you support|de que equipo eres|equipo favorito|para que time torces|clube favorito|time favorito)/],
    ["robot", /\s(t es|tes|tu es|es tu|t est|are you|r u|eres|voce e|vc e|es)\s(un |una |a |um |uma )?(robot|bot|chatbot|humain|human|humano|humana|real|vrai|vraie|ia|ai|chatgpt|robo|persona)\s|\s(chatgpt|chatbot)\s|^\s*(robot|bot)\s*$/],
    ["humain", /\s((parler|ecrire|discuter|causer) (a|avec) (un|une|quelqu|l equipe|vous|clement)|un (vrai )?humain|une vraie personne|vraie personne|conseiller|service client|support|real person|talk to (a|someone|human|the team)|human|agent|hablar con|una persona|falar com|uma pessoa|atendimento|soporte|suporte|contact|contacter|joindre|responsable|manager|personne ne repond|nobody answers|nadie responde|ninguem responde)/],
    ["double", /\s(deux fois|2 fois|double prelev|double paiement|preleve deux|charged twice|double charge|duplicate payment|dos veces|cobrado dos|duas vezes|cobrado duas|pago duplicado|pagamento duplicado)/],
    ["payeSansAcces", /\s(j ai|jai|i|ya|eu|ja)\s(deja\s)?(paye|payer|paid|pague|paguei)\s|\s(debite|preleve|charged|cobrado|cobraron)\s.*(pas|no|not|nao|sin|sem)\s|\s(paye|paid|pague|paguei) (mais|but|pero|mas)\s/],
    ["bonus", /(1er|premier|first|primera|primeira|1a|1 a) (pari|bet|apuesta|aposta)|lolly .*rembours|rembours.* lolly|\s(freebet|free bet|bonus|bono|bonos|bonus lolly|apuesta gratis|aposta gratis|cashback)\s/],
    ["rembours", /\s(rembourse|remboursez|remboursement|rembourser|refund|reembolso|reembolsar|reembolsem|devolucion|devolver mi dinero)/, /si nul|draw no bet|empate/],
    ["resilier", /\s(veux arreter|veut arreter|je veux stopper|plus le pro|ne plus payer|resilier|resiliation|resilie|desabonn|desinscri|annuler (mon |l |mon )?abo|arreter (le |mon )?(pro|abo)|stop (le |my )?(pro|subscription)|cancel|unsubscribe|cancelar|darme de baja|anular (mi |la )?suscripcion|cancelar (a )?assinatura)/],
    ["facture", /\s(facture|factures|invoice|receipt|recu de paiement|factura|recibo|fatura|comprovante)\s/],
    ["codeRecu", /\s(pas|jamais|rien) recu|\snot (received|got)|\sno (he )?recibido|\snao recebi|\s(code|mail|e mail|email|lien|link|correo|codigo|enlace|mensagem)\s.*(recu|pas arrive|arrive pas|jamais arrive|not received|didn t|didnt|never got|no llega|no me llega|no recibo|nao chegou|nao recebi|expire|invalide|invalid|expired|caducado|expirado)|\sspam\s/],
    ["supprimer", /\s(supprimer|supprime|effacer|efface|delete|eliminar|borrar|excluir|apagar)\s(mon |my |mi |minha |a |mes |o |la )?(compte|account|cuenta|conta|donnees|data|datos|dados)/],
    ["bug", /\s(bug|bugs|beug|page blanche|ecran blanc|ecran noir|charge pas|ne charge|ca charge|marche pas|marche plus|fonctionne pas|plante|crash|not working|doesn t work|doesnt work|won t load|blank page|no funciona|no carga|nao funciona|nao carrega|nao abre|error 404|erreur|bloque sur)/],
    ["lollyDeja", /\s(deja (un compte |inscrit |inscrite )?(chez |sur |a )?lolly|j ai (deja )?(un compte )?lolly|already (have |on )?lolly|ya tengo (cuenta en )?lolly|ja tenho (conta na )?lolly|inscrit (avant|sans (le |votre )?lien)|sans votre lien|oublie (le |votre )?lien|forgot (the |your )?link|sin (el |vuestro )?enlace|sem o link)/],
    ["lollyValid", /\s(identifiant|pseudo|username|usuario|utilizador|id lolly|mon id)\s.*(lolly|pro|envoy|sent|valid)|\s(validation|valide|valider|validate|validar|validacao)\s.*(lolly|pro|mois|month|mes)|\s24 ?h/],
    ["lollyRetrait", /\s(retrait|retirer|withdraw|withdrawal|retirada|retirar|saque|sacar|levantamento|levantar)/],
    ["lollyCond", /\s(depot minimum|depot mini|minimum deposit|min deposit|deposito minimo|cote minimum|cote mini|minimum odds|cuota minima|odd minima|conditions|condiciones|condicoes|terms)/],
    ["affiliation", /\s(commission|commissions|affili|vous touchez|vous etes payes|you get paid|paid by|cobrais|comision|comissao|sponsorise)/],
    ["obligeLolly", /\s(oblige|obligatoire|forcement|must|have to use|obligatorio|tengo que usar|obrigatorio|tenho de usar)\s.*(lolly|bookmaker|site)|lolly .*(oblige|obligatoire|obligatorio|obrigatorio)/],
    ["sansCompte", /\s(sans (compte|inscription|m inscrire|s inscrire|mail|email|donner mon)|pas envie de (m inscrire|creer)|flemme|oblige de (m|s) inscrire|obligatoire de (m|s) inscrire|without (an )?(account|signing|email)|dont want to sign|no quiero registrarme|sin (cuenta|registro|registrarme)|sem (conta|cadastro|registo)|nao quero (me )?(cadastrar|registar))/],
    ["gratuitCarte", /\s(carte|card|tarjeta|cartao|cb|carte bancaire)\s.*(gratuit|free|gratis|inscri|compte|account|cuenta|conta|sign up)|\s(gratuit|free|gratis|inscri|compte|account|cuenta|conta|sign up)\s.*\s(carte|card|tarjeta|cartao|cb)\s/, /refus|declin|rechaz|recus|bloque|echou|failed|fallid/],
    ["paiement", /\s(paiement|payer|paye|carte|cb|refuse|refusee|bloque|prelev|debit|mobile money|orange money|wave|paypal|apple pay|google pay|payment|pay |card|declined|pago|pagar|tarjeta|cartao|pagamento|rechazad|recusad|mbway|mb way|stripe)/],
    ["compte", /\s(connexion|connecter|connecte|mot de passe|mdp|identifiant|login|log in|password|sign in|m inscrire|inscription|inscrire|creer (un |mon )?compte|sign up|register|account|mon compte|contrasena|senha|palavra passe|iniciar sesion|registrarme|registar|cadastrar|mi cuenta|minha conta|changer (mon |d )?(e )?mail|change (my )?email)/],
    ["proOffert", /\s(pro gratuit|pro offert|mois offert|mois gratuit|essai|essayer gratuit|free pro|pro free|free trial|trial|free month|pro gratis|mes gratis|prueba gratis|probar gratis|mes gratuito|pro gratuito|teste gratis|vip gratuit|vip gratos|vip gratis|pro gratos|debloque moi|unlock|desbloquea|desbloqueia)\s/],
    ["reduction", /\s(reduc|reduction|code promo|promo|coupon|cupom|discount|descuento|desconto|codigo promocional|fais moi un prix|moins cher|cheaper|mas barato|mais barato)/],
    ["mise", /\s(je mise combien|mise combien|combien (je )?(mise|miser|mettre|parier|jouer)|je mets combien|quelle mise|mise conseill|bankroll|stake|staking|all in|cuanto (apuesto|apostar|meto)|quanto (aposto|apostar|meto)|valor da aposta)/],
    ["cher", /\s(trop cher|c est cher|cest cher|cher|chere|too expensive|expensive|muy caro|caro|cara|pas les moyens|can t afford|cant afford|no tengo dinero|nao tenho dinheiro|pas d argent)\s/],
    ["payerApres", /\s(si (ca|c|tu|vous) (gagne|passe|rentre)|payer apres|paie apres|pourcentage|after (i )?win|if (it )?wins|percentage|si gano|si gana|porcentaje|se ganhar|percentagem)/],
    ["unSeulPari", /\s(juste ce match|un seul (pari|match|prono)|a l unite|acheter (un|ce|le) (pari|prono|match)|single pick|one pick|buy (one|a) pick|solo un pronostico|comprar (un|este) pronostico|so um palpite|comprar (um|este) palpite)/],
    ["duree", /\s(semaine ou (le )?mois|mois ou (la )?semaine|quelle formule|quel abonnement|lequel prendre|weekly or monthly|which plan|semanal o mensual|que plan|semanal ou mensal|qual plano)/],
    ["pourquoiVendre", /\s(pourquoi (vous )?(vendez|vendre|faites payer|c est payant|payant)|si (ca|vous) (marche|gagnez).*(pourquoi|vendre)|vous seriez riches|why (do you )?(sell|charge)|por que (vendeis|venden|cobrais|cobran)|porque (vendem|cobram))/],
    ["prix", /\s(prix|combien|tarif|tarifs|abonnement|abonne|abonner|vip|premium|price|prices|cost|how much|subscribe|subscription|precio|precios|cuanto|cuesta|suscripcion|suscribirme|preco|precos|quanto|custa|assinatura|assinar)\s|\spro\s|\sle pro\s|\scest quoi le pro/],
    ["telegramPro", /\stelegram\s.*\s(pro|vip|tous les|all|todos|tout)\s|\s(pro|vip|tous les pronos|all picks|todos)\s.*\stelegram/],
    ["pasTelegram", /\s(pas (de )?telegram|pas telegram|j ai pas telegram|no telegram|don t have telegram|dont have telegram|no tengo telegram|nao tenho telegram|sem telegram|sin telegram)/],
    ["whatsapp", /\swhats ?app/],
    ["telegram", /\s(telegram|canal|chaine|groupe|channel|group|grupo)\s/],
    ["appli", /\s(application|appli|app|apk|app store|play store|google play|aplicacion|aplicativo|aplicacao)\s/],
    ["site", /\s(ou parier|ou jouer|bookmaker|bookmakers|book|lolly|site de paris|quel site|1win|winamax|betclic|unibet|bet365|pmu|parions|where to bet|which bookmaker|which site|sportsbook|donde apostar|casa de apuestas|onde apostar|casa de apostas|betano|codere|caliente|draftkings|fanduel|sky bet|betway|hollywoodbets|betfair|william hill|paddy power|placard|sportium|stake)\s/],
    ["business", /\s(partenariat|devenir partenaire|sponsor|sponsoring|influenceur|influenceuse|influencer|createur|creator|abonnes|followers|journaliste|presse|interview|recrut|emploi|stage|job|jobs|hiring|candidature|cv|travailler (avec|chez|pour) vous|api|widget|faille|vulnerab|erreur sur|mauvais (nom|score|resultat)|wrong (score|result|name)|partnership|colaboracion|patrocinio|periodista|prensa|empleo|trabajo|parceria|jornalista|imprensa|emprego|vagas)\s/],
    ["langue", /\s(english|anglais|in english|en anglais|espanol|espagnol|spanish|en espanol|portugues|portugais|portuguese|em portugues|francais|french|en frances|ingles|en ingles|frances|idioma|language|langue|lingua)\s/],
    ["pays", /\s(mon pays|my country|mi pais|meu pais|maroc|algerie|tunisie|senegal|cote d ivoire|cameroun|mali|congo|belgique|suisse|canada|quebec|brasil|bresil|angola|mozambique|nigeria|ghana|kenya|afrique|africa|argentina|colombia|chile|peru|disponible (en|au|dans)|available in|disponivel (em|no))\s/],
    ["vivre", /\s(vivre des paris|vivre du pari|quitter mon (travail|taf|boulot|job)|devenir riche|salaire|get rich|make a living|quit my job|vivir de (las )?apuestas|hacerme rico|viver de apostas|ficar rico)/],
    ["truque", /\s(truque|truques|arrange|arranges|vestiaire|info sure|info secrete|fixed match|fixed matches|insider|amanado|amanados|manipulado|combinado de antemano|jogo comprado)/],
    ["combinesPerso", /\s(envoie (le |ton |moi le )?(ticket|combine)|donne (moi )?(le |ton )?(ticket|combine)|fais moi un (combine|ticket)|cote (de )?\d{2}|send (me )?(the )?(slip|ticket|acca)|build (me )?(a|an) (acca|parlay|accumulator)|dame (la )?combinada|hazme una combinada|manda (o |a )?(bilhete|multipla))/],
    ["publication", /\s(demain|tomorrow|manana|amanha|a quelle heure (sortent|sort|tombent|publiez|vous publiez)|quand (sortent|tombent|publiez|sort|vous postez)|heure de publication|when (do|are) (you )?(post|publish)|what time (are|do) (the )?(picks|you)|a que hora (salen|publicais)|que horas saem)/],
    ["sport", /\s(tennis|tenis|nba|basket|basketball|baloncesto|basquete|rugby|ufc|mma|boxe|boxing|boxeo|nfl|nhl|hockey|f1|formule 1|formula 1|baseball|mlb|handball|cricket|volley|golf|cyclisme|courses|turf|hippique|esport|esports)\s/],
    ["sur", /\s(un sur|des surs|du sur|sur a 100|100 ?%|sure|surs|ultra sur|safe|banker|certain|garanti|meilleur prono|meilleur pari|prono du jour|pari du jour|quoi jouer|que jouer|je joue quoi|best bet|tip of the day|sure bet|lock|prono|pronos|pronostic|pronostics|paris du jour|tips|tip|prediction|predictions|bet of the day|apuesta segura|aposta segura|pronostico|pronosticos|palpite|palpites|fija|fijo|seguro|segura|match du jour|partido del dia|jogo do dia)\s/],
    ["combines", /\s(combine|combines|combo|combos|combi|accumulat|acca|parlay|ticket|tickets|multiple|multiples|multipla|multiplas|combinada|combinadas|selection en or|petit combine|grand combine)/],
    ["buteur", /\s(buteur|buteurs|scorer|scorers|goalscorer|qui marque|va marquer|marque ce soir|will score|anytime|goleador|goleadores|marcador|marcadores|artilheiro|quien marca|va a marcar|quem marca|vai marcar)/],
    ["stats", /\s(stat|stats|statistique|statistiques|forme|derniers matchs|confrontation|confrontations|h2h|classement|compo|compos|composition|blesse|blesses|absents|statistics|form|standings|lineup|lineups|injuries|estadisticas|clasificacion|alineacion|lesionados|estatisticas|classificacao|escalacao|lesionados)\s/],
    ["championnats", /\s(quels championnats|quelles ligues|quel championnat|vous faites (la|le|les)|ligue 1|ligue 2|premier league|liga|serie a|bundesliga|which leagues|what leagues|que ligas|cuales ligas|quais ligas|quais campeonatos|campeonatos)\s/],
    ["resultats", /\s(resultat|resultats|historique|bilan|fiable|fiables|arnaque|arnaqueurs|escroc|escrocs|scam|legit|fake|gagnes|perdus|win rate|winrate|roi|taux|reussite|track record|results|winning|valide|resultados|confiable|estafa|golpe|burla|historial|historico|acertos|aciertos|cachez|supprimez|only winners|hide losses)\s/],
    ["pourquoiVendre2", /\s(pourquoi payer|why pay|por que pagar|porque pagar)\s/],
    ["methode", /\s(comment (ca marche|vous faites|vous calculez|tu calcules|ca fonctionne)|methode|algorithme|algo|intelligence artificielle|simulation|simulations|simule|modele|calcul|calcule|how does it work|how do you|method|model|algorithm|como funciona|metodo|algoritmo|modelo|10000|10 000)\s|\sia\s|\sthe ai\s|\syour ai\s/],
    ["quoi", /\s(c est quoi (iashark|ce site|votre site|ton site|ca)|vous faites quoi|qui etes vous|what is (iashark|this site|this)|who are you|que es (iashark|esto)|quienes sois|o que e (a )?(iashark|isto)|quem sao voces)\s/],
    ["gratuit", /\s(gratuit|gratuits|gratos|free|offert|offerts|cadeau|gratis|gratuito|gratuita|sans payer|without paying|sin pagar|sem pagar)\s/],
    ["live", /\s(direct|live|en cours|score en direct|livescore|en vivo|directo|ao vivo|mi temps|half time|descanso|intervalo|quelle heure|kick off|a que hora|que horas)\s/],
    ["t_btts", /\s(btts|les deux equipes marquent|deux equipes marquent|les deux marquent|both teams|ambos marcan|ambos equipos marcan|ambas marcam)/],
    ["t_dnb", /\s(rembourse si nul|draw no bet|dnb|empate no valido|empate anula)/],
    ["t_corners", /\s(corner|corners|tirs cadres|tir cadre|shots on target|tiros a puerta|escanteio|escanteios|cantos|remates)/],
    ["t_regles", /\s(prolongation|prolongations|extra time|prorroga|prorrogacao|prolongamento|joueur absent|n a pas joue|didn t play|pari annule|void|apuesta anulada|aposta anulada)/],
    ["t_over", /\s(over|under|plus de \d|moins de \d|mas de \d|menos de \d|mais de \d)/],
    ["t_dc", /\s(double chance|doble oportunidad|dupla hipotese|dupla chance|1x|x2)\s/],
    ["t_un", /\s(1n2|1x2|1 n 2|match nul|draw|empate)\s/],
    ["t_handicap", /\s(handicap|handicaps)/],
    ["t_cote", /\s(c est quoi une cote|une cote|la cote|les cotes|cote basse|odds|cuota|cuotas|momio|momios|odd|probabilite|probability|probabilidad|probabilidade)\s/],
    ["casino", /\s(casino|cassino|roulette|ruleta|roleta|poker|blackjack|slots|machine a sous|tragaperras|caca niquel|aviator|crash game|crypto|bitcoin|btc|bourse|trading|dissertation|devoirs|homework|essay|tarea|redacao)\s/],
    ["rire", /\s(lol|mdr|ptdr|xd|haha|hahaha|jaja|jajaja|kkk|kkkk|rsrs|je t aime|love you|te quiero|te amo|epouse moi|marry me|casate conmigo|casa comigo)\s/],
    ["cava", /\s(ca va|ca va bien|comment ca va|comment vas tu|comment tu vas|tu vas bien|la forme|how are you|how r u|how s it going|hows it going|que tal|como estas|como vas|tudo bem|tudo bom|como vai)\s/],
    ["fin", /^\s*(ok|okay|oki|d accord|dac|c est bon|cest bon|ca marche|au revoir|bye|ciao|a plus|a\+|bonne (soiree|journee|nuit)|non merci|no thanks|no gracias|nao obrigado|adios|hasta luego|tchau|ate logo|good night|buenas noches|boa noite|vale|beleza|fechou)\s*$/],
    ["merci", /\s(merci|thanks|thank you|thx|top|parfait|super|nickel|cool|genial|gracias|obrigado|obrigada|valeu|perfecto|perfeito)\s/],
    ["insulte", /\s(connard|connards|fdp|ntm|pute|encule|merde|nul|nuls|idiot|idiots|bouffon|fuck|shit|stupid|idiota|puta|mierda|pendejo|cabron|caralho|porra|merda|otario)\s/],
    ["vite", /\s(vite|depeche|rapide|grouille|hurry|quick|fast|asap|rapido|date prisa|depressa)\s/],
    ["bonjour", /^\s*(bonjour|bonsoir|salut|slt|yo|hello|hi|hey|cc|coucou|wesh|salam|hola|buenas|buenos dias|ola|oi|bom dia|boa tarde|quelqu un|y a quelqu un|anybody|alguien|alguem)\s*$/]
  ];
  function intention(texte) {
    var t = norm(texte);
    for (var i = 0; i < INTENTIONS.length; i++) {
      var it = INTENTIONS[i];
      if (a(t, it[1]) && !(it[2] && it[2].test(t))) return it[0];
    }
    return null;
  }

  // ---------------------------------------------------------------- equipes
  var ALIAS = {
    psg: "paris saint germain", om: "marseille", ol: "lyon", losc: "lille", asse: "saint etienne", ogcn: "nice",
    barca: "barcelona", real: "real madrid", atleti: "atletico madrid", juve: "juventus",
    milan: "ac milan", bayern: "bayern", bvb: "dortmund", city: "manchester city",
    "man city": "manchester city", united: "manchester united", "man utd": "manchester united", "man united": "manchester united",
    spurs: "tottenham", gunners: "arsenal", reds: "liverpool", benfica: "benfica", porto: "porto", ajax: "ajax",
    sporting: "sporting cp", america: "club america", chivas: "guadalajara", pumas: "pumas unam", tigres: "tigres uanl"
  };
  // Mots trop communs pour designer une equipe a eux seuls (fr, en, es, pt).
  var VIDES = {};
  ("fc cf sc ac as afc us cd ca sv fk sk if ik bk club de la le les el los del real united city sporting athletic atletico "
    + "deportivo union san santa saint st sport sports racing olympique stade inter internacional nacional national central "
    + "university universidad town rovers wanderers county women ce soir match ligue league cup coupe contre versus vs prono "
    + "pronostic pari demain aujourd hui today tonight tomorrow quel quelle pour avec the and des dans sur que qui est tu vous "
    + "mon ton gagne gagner perd nul but buts paris parier score cote cotes live direct bonus gratuit offert combine buteur "
    + "resultat resultats comment combien partido partida jogo juego hoy hoje manana amanha para con com por los las una uno "
    + "quien quem como cuanto quanto apuesta aposta gratis esta este hola gana ganar vence equipo equipa time "
    + "what who when where will win game tonight play team").split(" ").forEach(function (w) { VIDES[w] = 1; });
  function cherche(texte, matchs) {
    var t = " " + norm(texte) + " ";
    Object.keys(ALIAS).forEach(function (k) { if (t.indexOf(" " + k + " ") !== -1) t += ALIAS[k] + " "; });
    var mots = t.split(" ").filter(function (w) { return w.length >= 3 && !VIDES[w]; });
    var res = [];
    (matchs || []).forEach(function (m) {
      var pts = 0;
      [nom(m.home), nom(m.away)].forEach(function (eq) {
        var n = norm(eq);
        if (!n) return;
        if (n.length >= 4 && t.indexOf(" " + n + " ") !== -1) { pts += 10; return; }
        n.split(" ").forEach(function (w) {
          if (w.length < 4 || VIDES[w]) return;
          if (mots.indexOf(w) !== -1) pts += 3;
          else if (w.length >= 6 && mots.some(function (u) { return u.length >= 5 && w.indexOf(u) === 0; })) pts += 2;
        });
      });
      if (pts) res.push({ m: m, pts: pts });
    });
    res.sort(function (x, y) { return y.pts - x.pts || (passe(x.m) - passe(y.m)) || String(x.m.date).localeCompare(String(y.m.date)); });
    if (!res.length) return [];
    var max = res[0].pts;
    return res.filter(function (r) { return r.pts >= max - 1 && r.pts >= 3; }).slice(0, 3).map(function (r) { return r.m; });
  }
  function quand(m) {
    var MT = G && G.IasharkMatchTime;
    try { if (MT && MT.matchTimestamp) return MT.matchTimestamp(m); } catch (e) {}
    var d = Date.parse(String(m.date || "").replace(" ", "T") + ":00+01:00");
    return isNaN(d) ? Number.POSITIVE_INFINITY : d;
  }
  // Termine, ou commence il y a plus de 2 h 30 (donnees du matin pas encore remplacees).
  function passe(m) { return !!{ FT: 1, AET: 1, PEN: 1 }[m.status] || quand(m) < Date.now() - 9e6; }
  function aVenir(matchs) {
    return (matchs || []).filter(function (m) { return (m.status === "NS" || !m.status) && !passe(m); })
      .sort(function (x, y) { return String(x.date).localeCompare(String(y.date)); });
  }
  // Meme ordre que le bandeau des pages match (lib/bandeau-preuves.js#ordreDefile, decision de Clement du
  // 19/11/2026) : au moins 4 gagnes d'abord, puis un perdu, un gagne. Rien n'est retire.
  function ordreResultats(items) {
    var Gg = items.filter(function (i) { return i.r === "win"; }), P = items.filter(function (i) { return i.r !== "win"; });
    var out = Gg.splice(0, 4);
    while (Gg.length || P.length) { if (P.length) out.push(P.shift()); if (Gg.length) out.push(Gg.shift()); }
    return out;
  }

  // ---------------------------------------------------------------- etat
  var S = { dir: "fr", L: T.fr, matchs: null, offert: null, profil: "visiteur", preuves: null, rates: 0, ouvert: false, pret: false, questionPosee: false, echanges: 0 };
  // ---------------------------------------------------------------- reponses en plus (19/11, liste etablie avec ChatGPT :
  // 110 cas possibles, des questions serieuses aux messages idiots). Une entree = [fr, en, es, pt] ; chaque texte est
  // une bulle (chaine) ou plusieurs (tableau).
  var X = {
    quoi: [
      ["IASHARK, ce sont des pronos foot calculés : chaque match est simulé 10 000 fois, et on garde le pari où la cote est bonne.", "Tu commences gratuitement : un match offert chaque jour avec un compte."],
      ["IASHARK gives calculated football picks: each match is simulated 10,000 times and we keep the bet where the odds are good.", "You start for free: one free match every day with an account."],
      ["IASHARK son pronósticos de fútbol calculados: cada partido se simula 10 000 veces y nos quedamos con la apuesta donde la cuota es buena.", "Empiezas gratis: un partido gratis cada día con una cuenta."],
      ["A IASHARK dá palpites de futebol calculados: cada jogo é simulado 10 000 vezes e ficamos com a aposta onde a odd é boa.", "Começas grátis: um jogo grátis todos os dias com uma conta."]
    ],
    sansCompte: [
      ["Sans compte, tu vois déjà les pages des matchs, les stats, les scores en direct et tous nos résultats.", "Et sans donner d'e-mail : la chaîne Telegram gratuite poste le match du jour."],
      ["Without an account you already get match pages, stats, live scores and all our results.", "And with no email at all: our free Telegram channel posts the match of the day."],
      ["Sin cuenta ya ves las páginas de los partidos, las estadísticas, los marcadores en directo y todos nuestros resultados.", "Y sin dar tu correo: el canal de Telegram gratis publica el partido del día."],
      ["Sem conta já vês as páginas dos jogos, as estatísticas, os resultados ao vivo e todo o nosso histórico.", "E sem dar e-mail: o canal de Telegram grátis publica o jogo do dia."]
    ],
    gratuitCarte: [
      "Aucune carte pour le compte gratuit : juste ton e-mail, 30 secondes, et tu as le match offert chaque jour.",
      "No card for the free account: just your email, 30 seconds, and you get the free match every day.",
      "Ninguna tarjeta para la cuenta gratis: solo tu correo, 30 segundos, y tienes el partido gratis cada día.",
      "Nenhum cartão para a conta grátis: só o teu e-mail, 30 segundos, e tens o jogo grátis todos os dias."
    ],
    robot: [
      ["Oui, je suis le robot d'IASHARK : je réponds tout de suite, jour et nuit.", "Derrière, il y a une vraie équipe si tu veux lui parler."],
      ["Yes, I'm the IASHARK bot: I answer right away, day and night.", "There's a real team behind me if you want to talk to them."],
      ["Sí, soy el robot de IASHARK: respondo al instante, día y noche.", "Detrás hay un equipo de verdad si quieres hablar con ellos."],
      ["Sim, sou o robô da IASHARK: respondo na hora, dia e noite.", "Por trás há uma equipa real se quiseres falar com ela."]
    ],
    hack: [
      "Je ne peux rien débloquer ici, même en insistant. Pour ton compte, l'équipe te répond directement.",
      "I can't unlock anything here, even if you insist. For your account, the team answers you directly.",
      "No puedo desbloquear nada aquí, aunque insistas. Para tu cuenta, el equipo te responde directamente.",
      "Não consigo desbloquear nada aqui, mesmo que insistas. Para a tua conta, a equipa responde-te diretamente."
    ],
    double: [
      "On règle ça : écris à l'équipe avec la date et le montant des deux paiements, sans ton numéro de carte.",
      "We'll sort it out: message the team with the date and amount of both payments, without your card number.",
      "Lo arreglamos: escribe al equipo con la fecha y el importe de los dos pagos, sin tu número de tarjeta.",
      "Resolvemos isso: escreve à equipa com a data e o valor dos dois pagamentos, sem o número do cartão."
    ],
    payeSansAcces: [
      ["Vérifie d'abord que tu es connecté avec l'e-mail utilisé pour payer.", "Toujours bloqué ? Écris à l'équipe avec cet e-mail, on t'ouvre l'accès vite."],
      ["First check you're logged in with the email you paid with.", "Still locked? Message the team with that email and we'll open your access fast."],
      ["Primero comprueba que has entrado con el correo con el que pagaste.", "¿Sigues bloqueado? Escribe al equipo con ese correo y te abrimos el acceso rápido."],
      ["Primeiro confirma que entraste com o e-mail usado para pagar.", "Continuas bloqueado? Escreve à equipa com esse e-mail e abrimos o acesso depressa."]
    ],
    rembours: [
      "Pour un remboursement de l'abonnement, écris à l'équipe avec ton e-mail et la date du paiement, on regarde ça nous-mêmes.",
      "For a subscription refund, message the team with your email and the payment date, we handle it ourselves.",
      "Para un reembolso de la suscripción, escribe al equipo con tu correo y la fecha del pago, lo revisamos nosotros mismos.",
      "Para um reembolso da assinatura, escreve à equipa com o teu e-mail e a data do pagamento, tratamos disso nós mesmos."
    ],
    facture: [
      "Écris à l'équipe avec l'e-mail de ton compte, on t'envoie ta facture.",
      "Message the team with your account email and we'll send your invoice.",
      "Escribe al equipo con el correo de tu cuenta y te enviamos la factura.",
      "Escreve à equipa com o e-mail da tua conta e enviamos a fatura."
    ],
    codeRecu: [
      ["Regarde dans tes spams et vérifie l'adresse tapée.", "Toujours rien ? Redemande depuis Mon compte, ou écris à l'équipe."],
      ["Check your spam folder and the address you typed.", "Still nothing? Ask again from My account, or message the team."],
      ["Mira en tu carpeta de spam y revisa la dirección escrita.", "¿Nada todavía? Vuelve a pedirlo desde Mi cuenta o escribe al equipo."],
      ["Vê na pasta de spam e confirma o endereço escrito.", "Continua sem nada? Pede outra vez em A minha conta, ou escreve à equipa."]
    ],
    supprimer: [
      "Écris à l'équipe depuis l'e-mail de ton compte, on supprime ton compte et tes données. Si tu as le Pro, résilie d'abord dans Mon compte.",
      "Message the team from your account email and we'll delete your account and data. If you're Pro, cancel first in My account.",
      "Escribe al equipo desde el correo de tu cuenta y borramos tu cuenta y tus datos. Si eres Pro, cancela primero en Mi cuenta.",
      "Escreve à equipa a partir do e-mail da conta e apagamos a conta e os dados. Se és Pro, cancela primeiro em A minha conta."
    ],
    bug: [
      ["Recharge la page ou ouvre-la dans un autre navigateur, ça règle presque tout.", "Ça bloque encore ? Dis à l'équipe quelle page et quel téléphone, on corrige."],
      ["Reload the page or open it in another browser, that fixes almost everything.", "Still stuck? Tell the team which page and which phone, we'll fix it."],
      ["Recarga la página o ábrela en otro navegador, eso lo arregla casi todo.", "¿Sigue fallando? Dile al equipo qué página y qué móvil, lo corregimos."],
      ["Recarrega a página ou abre-a noutro navegador, isso resolve quase tudo.", "Continua a falhar? Diz à equipa qual página e qual telemóvel, nós corrigimos."]
    ],
    appli: [
      ["Pas besoin d'appli : ouvre iashark.com et ajoute-le à ton écran d'accueil, il s'ouvre comme une appli.", "Et pour les alertes, la chaîne Telegram gratuite."],
      ["No app needed: open iashark.com and add it to your home screen, it opens like an app.", "And for alerts, our free Telegram channel."],
      ["No hace falta app: abre iashark.com y añádelo a tu pantalla de inicio, se abre como una app.", "Y para las alertas, el canal de Telegram gratis."],
      ["Não precisas de app: abre iashark.com e adiciona ao ecrã inicial, abre como uma app.", "E para os alertas, o canal de Telegram grátis."]
    ],
    reduction: [
      ["Pas de code promo, mais mieux : 1 mois de Pro offert en t'inscrivant chez Lolly Bet, notre partenaire, avec notre lien.", "Sinon, la semaine de Pro est le plus petit prix pour tester."],
      ["No promo code, but better: one month of Pro free when you sign up with Lolly Bet, our partner, through our link.", "Otherwise, the weekly Pro is the cheapest way to try."],
      ["No hay código promocional, pero algo mejor: 1 mes de Pro gratis al registrarte en Lolly Bet, nuestro socio, con nuestro enlace.", "Si no, la semana de Pro es el precio más bajo para probar."],
      ["Não há código promocional, mas há melhor: 1 mês de Pro grátis ao registares-te na Lolly Bet, o nosso parceiro, com o nosso link.", "Senão, a semana de Pro é o preço mais baixo para experimentar."]
    ],
    cher: [
      ["Tu peux avoir le Pro sans rien payer : 1 mois offert en t'inscrivant chez Lolly Bet avec notre lien.", "Et le match offert reste gratuit, tous les jours."],
      ["You can get Pro without paying: one month free when you sign up with Lolly Bet through our link.", "And the free match stays free, every day."],
      ["Puedes tener Pro sin pagar nada: 1 mes gratis al registrarte en Lolly Bet con nuestro enlace.", "Y el partido gratis sigue siendo gratis, cada día."],
      ["Podes ter o Pro sem pagar nada: 1 mês grátis ao registares-te na Lolly Bet com o nosso link.", "E o jogo grátis continua grátis, todos os dias."]
    ],
    payerApres: [
      "On ne prend pas de pourcentage : le Pro est un prix fixe, sans engagement. Juge d'abord sur le match offert, gratuit.",
      "We don't take a percentage: Pro is a fixed price, no commitment. Judge us first on the free match.",
      "No cobramos porcentaje: Pro es un precio fijo, sin permanencia. Júzganos primero con el partido gratis.",
      "Não cobramos percentagem: o Pro é um preço fixo, sem fidelização. Avalia-nos primeiro com o jogo grátis."
    ],
    unSeulPari: [
      "On ne vend pas un match à l'unité : la semaine de Pro ouvre tous les matchs pendant 7 jours.",
      "We don't sell single matches: a week of Pro opens every match for 7 days.",
      "No vendemos partidos sueltos: la semana de Pro abre todos los partidos durante 7 días.",
      "Não vendemos jogos avulsos: a semana de Pro abre todos os jogos durante 7 dias."
    ],
    duree: [
      "Même contenu dans toutes les formules. La semaine pour tester, le mois si tu suis tous les jours, l'année pour payer le moins.",
      "Same content in every plan. Weekly to try, monthly if you follow every day.",
      "El mismo contenido en todos los planes. La semana para probar, el mes si sigues cada día, el año para pagar menos.",
      "O mesmo conteúdo em todos os planos. A semana para experimentar, o mês se acompanhas todos os dias, o ano para pagar menos."
    ],
    pourquoiVendre: [
      ["Le Pro paie le calcul de centaines de matchs chaque jour et l'équipe derrière.", "Juge par toi-même : tous nos paris, gagnés et perdus, sont publics, et un match est offert chaque jour."],
      ["Pro pays for running hundreds of matches every day and the team behind it.", "Judge for yourself: all our picks, won and lost, are public, and one match is free every day."],
      ["Pro paga el cálculo de cientos de partidos cada día y el equipo que hay detrás.", "Júzgalo tú: todas nuestras apuestas, ganadas y perdidas, son públicas, y hay un partido gratis cada día."],
      ["O Pro paga o cálculo de centenas de jogos por dia e a equipa por trás.", "Julga tu mesmo: todas as apostas, ganhas e perdidas, são públicas, e há um jogo grátis por dia."]
    ],
    telegramPro: [
      "La chaîne gratuite donne le match du jour et les résultats. Tous les paris du jour, eux, sont dans le Pro.",
      "The free channel gives the match of the day and results. Every pick of the day is in Pro.",
      "El canal gratis da el partido del día y los resultados. Todas las apuestas del día están en Pro.",
      "O canal grátis dá o jogo do dia e os resultados. Todas as apostas do dia estão no Pro."
    ],
    pasTelegram: [
      "Pas de souci : écris-nous par e-mail à " + MAIL + ", et ton match offert t'attend sur le site.",
      "No problem: email us at " + MAIL + ", and your free match is waiting on the site.",
      "Sin problema: escríbenos a " + MAIL + ", y tu partido gratis te espera en la web.",
      "Sem problema: escreve-nos para " + MAIL + ", e o teu jogo grátis está à tua espera no site."
    ],
    lollyDeja: [
      "Le mois de Pro offert marche avec une inscription par notre lien. Déjà inscrit avant ? Écris à l'équipe, on regarde ton cas.",
      "The free Pro month works with a sign-up through our link. Signed up before? Message the team and we'll check.",
      "El mes de Pro gratis funciona con un registro por nuestro enlace. ¿Ya estabas registrado? Escribe al equipo y lo miramos.",
      "O mês de Pro grátis funciona com um registo pelo nosso link. Já estavas registado? Escreve à equipa e vemos o teu caso."
    ],
    lollyValid: [
      "Envoie ton identifiant Lolly à l'équipe sur Telegram privé : on valide ton mois de Pro à la main sous 24 h.",
      "Send your Lolly username to the team on private Telegram: we validate your Pro month by hand within 24 h.",
      "Envía tu usuario de Lolly al equipo por Telegram privado: validamos tu mes de Pro a mano en 24 h.",
      "Envia o teu utilizador Lolly à equipa no Telegram privado: validamos o mês de Pro à mão em 24 h."
    ],
    lollyRetrait: [
      "Pour un dépôt, un retrait ou un bonus chez Lolly Bet, c'est leur service client, depuis leur site. Pour ton mois de Pro offert, c'est nous.",
      "For a deposit, withdrawal or bonus at Lolly Bet, it's their support, from their site. For your free Pro month, it's us.",
      "Para un depósito, una retirada o un bono en Lolly Bet, es su atención al cliente, desde su web. Para tu mes de Pro gratis, somos nosotros.",
      "Para um depósito, levantamento ou bónus na Lolly Bet, é o apoio ao cliente deles, no site. Para o teu mês de Pro grátis, somos nós."
    ],
    lollyCond: [
      "Les conditions exactes (dépôt minimum, cote minimum) sont affichées chez Lolly Bet à l'inscription. Une question ? L'équipe te répond.",
      "The exact terms (minimum deposit, minimum odds) are shown at Lolly Bet when you sign up. A question? The team answers you.",
      "Las condiciones exactas (depósito mínimo, cuota mínima) aparecen en Lolly Bet al registrarte. ¿Una duda? El equipo te responde.",
      "As condições exatas (depósito mínimo, odd mínima) aparecem na Lolly Bet no registo. Uma dúvida? A equipa responde-te."
    ],
    affiliation: [
      "Oui, Lolly Bet est notre partenaire : on est rémunérés si tu t'inscris avec notre lien. Ça ne te coûte rien, et c'est ce qui te donne le bonus et le mois de Pro.",
      "Yes, Lolly Bet is our partner: we get paid if you sign up through our link. It costs you nothing, and it's what gets you the bonus and the Pro month.",
      "Sí, Lolly Bet es nuestro socio: cobramos si te registras con nuestro enlace. No te cuesta nada, y es lo que te da el bono y el mes de Pro.",
      "Sim, a Lolly Bet é o nosso parceiro: somos pagos se te registares pelo nosso link. Não te custa nada, e é isso que te dá o bónus e o mês de Pro."
    ],
    obligeLolly: [
      "Non, nos paris se jouent chez n'importe quel bookmaker. Lolly Bet, c'est le bonus en plus avec notre lien.",
      "No, our picks work at any bookmaker. Lolly Bet is just the extra bonus through our link.",
      "No, nuestras apuestas se juegan en cualquier casa. Lolly Bet es el bono extra con nuestro enlace.",
      "Não, as nossas apostas jogam-se em qualquer casa. A Lolly Bet é o bónus extra com o nosso link."
    ],
    business: [
      "Partenariat, presse, influence, travail ou erreur à signaler : écris directement à l'équipe, on lit tout.",
      "Partnership, press, influencers, jobs or an error to report: message the team directly, we read everything.",
      "Colaboraciones, prensa, influencers, empleo o un error que señalar: escribe directamente al equipo, lo leemos todo.",
      "Parcerias, imprensa, influenciadores, emprego ou um erro a assinalar: escreve diretamente à equipa, lemos tudo."
    ],
    langue: ["Choisis ta langue, le chat te répond dedans :", "Pick your language, the chat answers in it:", "Elige tu idioma, el chat te responde en él:", "Escolhe a tua língua, o chat responde nela:"],
    pays: [
      ["IASHARK marche dans le monde entier, et le prix du Pro s'affiche dans ta monnaie sur la page des prix.", "Le match offert est gratuit partout."],
      ["IASHARK works worldwide, and the Pro price shows in your currency on the prices page.", "The free match is free everywhere."],
      ["IASHARK funciona en todo el mundo, y el precio de Pro aparece en tu moneda en la página de precios.", "El partido gratis es gratis en todas partes."],
      ["A IASHARK funciona no mundo inteiro, e o preço do Pro aparece na tua moeda na página de preços.", "O jogo grátis é grátis em todo o lado."]
    ],
    mise: [
      "La mise, c'est ton choix, on n'en donne jamais. Nous, on te donne le match, le pari et la cote.",
      "The stake is your call, we never give one. We give you the match, the pick and the odds.",
      "La cantidad es cosa tuya, nunca la damos. Nosotros te damos el partido, la apuesta y la cuota.",
      "O valor é escolha tua, nunca damos. Nós damos o jogo, a aposta e a odd."
    ],
    vivre: [
      "On ne promet aucun gain, à personne. On publie tout, gagné comme perdu : regarde nos résultats et fais-toi ton avis.",
      "We promise no winnings to anyone. We publish everything, won and lost: check our results and judge for yourself.",
      "No prometemos ganancias a nadie. Publicamos todo, ganado y perdido: mira nuestros resultados y júzgalo tú.",
      "Não prometemos ganhos a ninguém. Publicamos tudo, ganho e perdido: vê os resultados e tira as tuas conclusões."
    ],
    truque: [
      "Pas de match truqué ni d'info secrète chez nous : que du calcul, publié avant le match et jamais modifié.",
      "No fixed matches or insider tips here: only calculation, published before kick-off and never changed.",
      "Aquí no hay partidos amañados ni información secreta: solo cálculo, publicado antes del partido y nunca cambiado.",
      "Aqui não há jogos combinados nem informação secreta: só cálculo, publicado antes do jogo e nunca alterado."
    ],
    combinesPerso: [
      "Je ne fabrique pas de combiné ici et je ne recopie pas les tickets du Pro. Les trois combinés du jour sont sur la page Combinés.",
      "I don't build accumulators here or copy Pro slips. Today's three accumulators are on the Accumulators page.",
      "No fabrico combinadas aquí ni copio los boletos de Pro. Las tres combinadas del día están en la página Combinadas.",
      "Não faço múltiplas aqui nem copio os boletins do Pro. As três múltiplas do dia estão na página Múltiplas."
    ],
    stats: [
      "Forme, stats, confrontations et compos probables : tout est sur la page de chaque match, gratuit. Écris une équipe, je te la donne.",
      "Form, stats, head-to-head and likely line-ups: it's all on each match page, free. Type a team and I'll give it to you.",
      "Forma, estadísticas, enfrentamientos y alineaciones probables: todo está en la página de cada partido, gratis. Escribe un equipo y te la doy.",
      "Forma, estatísticas, confrontos e onzes prováveis: está tudo na página de cada jogo, grátis. Escreve uma equipa e dou-ta."
    ],
    championnats: [
      "On couvre une trentaine de championnats : les grands d'Europe, l'Amérique du Sud, le Mexique, les coupes et bien d'autres. Écris une équipe pour voir son match.",
      "We cover around thirty leagues: Europe's big ones, South America, Mexico, cups and many more. Type a team to see its match.",
      "Cubrimos una treintena de ligas: las grandes de Europa, Sudamérica, México, copas y muchas más. Escribe un equipo para ver su partido.",
      "Cobrimos cerca de trinta campeonatos: os grandes da Europa, a América do Sul, o México, taças e muitos mais. Escreve uma equipa para ver o jogo."
    ],
    publication: [
      ["Les paris du jour sont publiés chaque matin, toujours avant les matchs.", "Pour ne rien rater, rejoins la chaîne Telegram : on y poste le match du jour."],
      ["Today's picks are published every morning, always before kick-off.", "To never miss one, join our Telegram channel: we post the match of the day there."],
      ["Las apuestas del día se publican cada mañana, siempre antes de los partidos.", "Para no perderte nada, únete al canal de Telegram: ahí publicamos el partido del día."],
      ["As apostas do dia são publicadas todas as manhãs, sempre antes dos jogos.", "Para não perderes nada, entra no canal de Telegram: publicamos lá o jogo do dia."]
    ],
    sport: [
      "IASHARK, c'est que du foot, mais tous les jours et sur une trentaine de championnats. Le match offert du jour t'attend.",
      "IASHARK is football only, but every day across around thirty leagues. Today's free match is waiting.",
      "IASHARK es solo fútbol, pero cada día y en una treintena de ligas. El partido gratis de hoy te espera.",
      "A IASHARK é só futebol, mas todos os dias e em cerca de trinta campeonatos. O jogo grátis de hoje está à tua espera."
    ],
    casino: [
      "Ici, c'est que du foot. Pour le reste, je ne peux pas t'aider.",
      "It's football only here. For anything else, I can't help.",
      "Aquí solo hay fútbol. Para lo demás no te puedo ayudar.",
      "Aqui é só futebol. Para o resto não te posso ajudar."
    ],
    club: [
      "Moi, je supporte les bonnes cotes. Dis-moi ton club, je te trouve son prochain match.",
      "I support good odds. Tell me your club and I'll find its next match.",
      "Yo soy de las buenas cuotas. Dime tu equipo y te busco su próximo partido.",
      "Eu torço pelas boas odds. Diz-me o teu clube e encontro o próximo jogo."
    ],
    rire: ["Ça me fait plaisir ! On revient au foot ?", "Glad to hear it! Back to football?", "¡Me alegra! ¿Volvemos al fútbol?", "Fico contente! Voltamos ao futebol?"],
    vite: ["Le plus rapide : le match offert, pari et cote en un clic.", "Fastest way: the free match, pick and odds in one click.", "Lo más rápido: el partido gratis, apuesta y cuota en un clic.", "O mais rápido: o jogo grátis, aposta e odd num clique."],
    qHumain: ["Avant de partir : tu veux parler à quelqu'un de l'équipe ?", "Before you go: do you want to talk to someone from the team?", "Antes de irte: ¿quieres hablar con alguien del equipo?", "Antes de ires: queres falar com alguém da equipa?"],
    bOui: ["Oui, l'équipe", "Yes, the team", "Sí, el equipo", "Sim, a equipa"],
    bNon: ["Non merci", "No thanks", "No, gracias", "Não, obrigado"],
    nonMerci: ["Avec plaisir. Je reste là si besoin.", "Anytime. I'm here if you need me.", "Con gusto. Aquí estoy si me necesitas.", "De nada. Estou aqui se precisares."],
    t_corners: [
      "Corners et tirs cadrés : on compte ceux de l'équipe ou du match, selon ce qui est écrit dans le pari.",
      "Corners and shots on target: we count the team's or the match's, as written in the pick.",
      "Córners y tiros a puerta: se cuentan los del equipo o los del partido, según lo que diga la apuesta.",
      "Cantos e remates à baliza: contam-se os da equipa ou do jogo, conforme está escrito na aposta."
    ],
    t_dnb: [
      "« Remboursé si nul » : tu joues une équipe, et si le match finit nul, ta mise est rendue.",
      "\"Draw no bet\": you back a team, and if it ends in a draw, your stake comes back.",
      "«Empate no válido»: apuestas por un equipo y, si acaba en empate, te devuelven lo apostado.",
      "«Empate anula»: apostas numa equipa e, se acabar empatado, recebes o valor de volta."
    ],
    t_regles: [
      "Joueur absent, prolongations, pari annulé : c'est la règle du bookmaker qui compte. En général, seul le temps réglementaire compte et un buteur qui ne joue pas est remboursé.",
      "Absent player, extra time, void bet: the bookmaker's rule decides. Usually only regular time counts and a scorer who doesn't play is refunded.",
      "Jugador ausente, prórroga, apuesta anulada: manda la regla de la casa. En general solo cuenta el tiempo reglamentario y un goleador que no juega se reembolsa.",
      "Jogador ausente, prolongamento, aposta anulada: manda a regra da casa. Em geral só conta o tempo regulamentar e um marcador que não joga é reembolsado."
    ]
  };
  var LI = { fr: 0, en: 1, es: 2, pt: 3 };
  function x(cle) { var v = X[cle] && X[cle][LI[langue(S.dir)] || 0]; return v == null ? [] : Array.isArray(v) ? v : [v]; }
  function lien(page) { return "/" + S.dir + "/" + page; }
  function lienMatch(m) { return lien("match.html?id=" + encodeURIComponent(m.id) + "&utm_source=assistant"); }
  function locale() { return NUM[langue(S.dir)] || "fr-FR"; }
  function heure(m) {
    var MT = G.IasharkMatchTime;
    try { if (MT && MT.formatTime) return MT.formatTime(m, locale()); } catch (e) {}
    return String(m.date || "").slice(11, 16);
  }
  function jour(m) {
    var MT = G.IasharkMatchTime;
    try { if (MT && MT.formatDate) return MT.formatDate(m, locale(), { weekday: "short", day: "numeric", month: "short" }); } catch (e) {}
    return String(m.date || "").slice(0, 10);
  }
  function memo(cle, val) {
    try { if (val === undefined) return G.localStorage.getItem(cle); G.localStorage.setItem(cle, val); } catch (e) {}
    return null;
  }

  // ---------------------------------------------------------------- affichage
  var AILERON = "url(/assets/aileron.png)";
  var CSS = ""
    // Telephone : la fenetre suit la zone visible au-dessus du clavier (caler(), visualViewport) ; la page
    // derriere ne bouge plus (retour de Clement du 19/11 : « ca s'agrandit tout le temps des que je tape »).
    + "html.ias-as-ouvert,html.ias-as-ouvert body{overflow:hidden!important;overscroll-behavior:none}"
    + "#ias-as{position:fixed;top:0;left:0;right:0;height:100%;height:100dvh;z-index:1001;display:flex;-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation;flex-direction:column;background:#060b12;color:#f4f7fb;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}"
    + "#ias-as[hidden]{display:none}"
    + "#ias-as .as-top{flex:none;display:flex;align-items:center;gap:12px;padding:12px 14px;padding-top:calc(12px + env(safe-area-inset-top));border-bottom:1px solid rgba(96,125,151,.18);background:#0a131c}"
    + "#ias-as .as-av{flex:none;width:42px;height:42px;border-radius:50%;background:#20d5ef;position:relative}"
    + "#ias-as .as-av::before{content:'';position:absolute;inset:7px;background:#060b12;-webkit-mask:" + AILERON + " center/contain no-repeat;mask:" + AILERON + " center/contain no-repeat}"
    + "#ias-as .as-n{margin:0;font-size:15.5px;font-weight:700;line-height:1.2}"
    + "#ias-as .as-s{margin:2px 0 0;font-size:12.5px;color:#91a0b3;display:flex;align-items:center;gap:6px}"
    + "#ias-as .as-s i{width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block}"
    + "#ias-as .as-x{margin-left:auto;width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:#91a0b3;display:flex;align-items:center;justify-content:center;cursor:pointer}"
    + "#ias-as .as-x:hover{background:rgba(148,173,186,.08);color:#f4f7fb}"
    + "#ias-as .as-fil{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:16px 14px 8px}"
    + "#ias-as .as-in{width:100%;max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:10px}"
    + "#ias-as .as-b{max-width:86%;padding:10px 14px;border-radius:18px;font-size:15px;line-height:1.45;word-wrap:break-word;animation:asIn .22s ease-out both}"
    + "#ias-as .as-b--bot{align-self:flex-start;background:#13202c;border-bottom-left-radius:6px;color:#e8eef4}"
    + "#ias-as .as-b--moi{align-self:flex-end;background:#20d5ef;color:#060b12;font-weight:600;border-bottom-right-radius:6px}"
    + "#ias-as .as-b--equipe{align-self:flex-start;background:#0f2a33;border:1px solid rgba(32,213,239,.45);border-bottom-left-radius:6px;color:#f4f7fb}"
    + "#ias-as .as-b--equipe span{display:block;margin-bottom:3px;font-size:12px;font-weight:700;color:#20d5ef}"
    + "#ias-as .as-sys{align-self:center;padding:5px 12px;border-radius:999px;background:rgba(32,213,239,.1);color:#20d5ef;font-size:12.5px;font-weight:600;text-align:center}"
    + "#ias-as .as-carte{align-self:flex-start;display:block;width:86%;max-width:360px;box-sizing:border-box;padding:12px 14px;border-radius:14px;border:1px solid rgba(32,213,239,.4);background:#0d1b26;color:#f4f7fb;text-decoration:none;animation:asIn .22s ease-out both}"
    + "#ias-as .as-carte:hover{border-color:#20d5ef}"
    + "#ias-as .as-k{margin:0;font-size:12px;font-weight:700;color:#20d5ef}"
    + "#ias-as .as-k--pro{color:#e8b64c}"
    + "#ias-as .as-m{margin:3px 0 0;font-size:16px;font-weight:800;line-height:1.25}"
    + "#ias-as .as-l{margin:3px 0 0;font-size:12.5px;color:#91a0b3}"
    + "#ias-as .as-res{align-self:flex-start;width:86%;max-width:360px;box-sizing:border-box;border-radius:14px;background:#0d1b26;border:1px solid rgba(96,125,151,.25);overflow:hidden;animation:asIn .22s ease-out both}"
    + "#ias-as .as-r{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid rgba(96,125,151,.15);font-size:13px;line-height:1.3}"
    + "#ias-as .as-r:first-child{border-top:0}"
    + "#ias-as .as-r b{display:block;font-weight:700;color:#f4f7fb}#ias-as .as-r span{color:#91a0b3}"
    + "#ias-as .as-r em{margin-left:auto;flex:none;font-style:normal;font-weight:700;font-size:12px;padding:3px 8px;border-radius:999px}"
    + "#ias-as .as-r em.w{background:rgba(34,197,94,.14);color:#4ade80}#ias-as .as-r em.l{background:rgba(239,68,68,.12);color:#f87171}#ias-as .as-r em.v{background:rgba(148,163,184,.14);color:#cbd5e1}"
    + "#ias-as .as-btns{align-self:flex-start;display:flex;flex-wrap:wrap;gap:8px;max-width:100%;animation:asIn .22s ease-out both}"
    + "#ias-as .as-btn{display:inline-flex;align-items:center;min-height:40px;box-sizing:border-box;padding:8px 15px;border-radius:999px;border:1px solid rgba(32,213,239,.55);background:transparent;color:#20d5ef;font:600 14px/1.2 Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent}"
    + "#ias-as .as-btn:hover{background:rgba(32,213,239,.08)}"
    + "#ias-as .as-btn--plein{background:#20d5ef;color:#060b12;border-color:#20d5ef}"
    + "#ias-as .as-btn--plein:hover{background:#4fe0f3}"
    + "#ias-as .as-btn:focus-visible,#ias-as .as-x:focus-visible,#ias-as .as-carte:focus-visible{outline:2px solid #20d5ef;outline-offset:2px}"
    + "#ias-as .as-tape{align-self:flex-start;display:flex;gap:4px;padding:13px 16px;border-radius:18px;border-bottom-left-radius:6px;background:#13202c}"
    + "#ias-as .as-tape i{width:7px;height:7px;border-radius:50%;background:#91a0b3;animation:asDot 1s infinite ease-in-out}"
    + "#ias-as .as-tape i:nth-child(2){animation-delay:.15s}#ias-as .as-tape i:nth-child(3){animation-delay:.3s}"
    + "#ias-as .as-bas{flex:none;border-top:1px solid rgba(96,125,151,.18);background:#0a131c;padding:10px 14px calc(10px + env(safe-area-inset-bottom))}"
    + "#ias-as form{max-width:640px;margin:0 auto;display:flex;gap:8px;align-items:center}"
    + "#ias-as input{flex:1;min-width:0;height:46px;box-sizing:border-box;padding:0 18px;border-radius:999px;border:1px solid rgba(96,125,151,.35);background:#0d1b26;color:#f4f7fb;font:16px Inter,system-ui,sans-serif;outline:none}"
    + "#ias-as input::placeholder{color:#6f8396}"
    + "#ias-as input:focus{border-color:#20d5ef}"
    + "#ias-as .as-go{flex:none;width:46px;height:46px;border:0;border-radius:50%;background:#20d5ef;color:#060b12;display:flex;align-items:center;justify-content:center;cursor:pointer}"
    + "@keyframes asIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}"
    + "@keyframes asDot{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}"
    + "@media (prefers-reduced-motion:reduce){#ias-as .as-b,#ias-as .as-carte,#ias-as .as-btns,#ias-as .as-res{animation:none}#ias-as .as-tape i{animation:none;opacity:.7}}"
    + "html.ias-as-ouvert,html.ias-as-ouvert body{overflow:hidden}";

  var ICONE_X = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICONE_GO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';

  var el = null, fil = null, file = [], enCours = false;
  function construire() {
    if (el) return;
    var D = G.document, L = S.L;
    var st = D.createElement("style"); st.textContent = CSS; D.head.appendChild(st);
    el = D.createElement("div");
    el.id = "ias-as"; el.hidden = true;
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", L.titre);
    el.innerHTML = '<div class="as-top"><span class="as-av" aria-hidden="true"></span><div><p class="as-n">' + esc(L.titre) + '</p><p class="as-s"><i aria-hidden="true"></i>' + esc(L.sous) + '</p></div>'
      + '<button type="button" class="as-x" aria-label="' + esc(L.fermer) + '">' + ICONE_X + '</button></div>'
      + '<div class="as-fil" aria-live="polite"><div class="as-in"></div></div>'
      + '<div class="as-bas"><form autocomplete="off"><input type="text" enterkeyhint="send" maxlength="200" aria-label="' + esc(L.champ) + '" placeholder="' + esc(L.champ) + '"><button type="submit" class="as-go" aria-label="' + esc(L.envoyer) + '">' + ICONE_GO + '</button></form></div>';
    D.body.appendChild(el);
    fil = el.querySelector(".as-in");
    el.querySelector(".as-x").addEventListener("click", fermer);
    el.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = el.querySelector("input"), v = inp.value.trim();
      if (!v) return;
      inp.value = "";
      question(v);
    });
    el.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-as]");
      if (!b) return;
      e.preventDefault();
      choix(b.getAttribute("data-as"), b.textContent);
    });
    D.addEventListener("keydown", function (e) { if (S.ouvert && e.key === "Escape") fermer(); });
    if (G.visualViewport) { G.visualViewport.addEventListener("resize", caler); G.visualViewport.addEventListener("scroll", caler); }
    var champ = el.querySelector("input");
    champ.addEventListener("focus", function () { G.setTimeout(caler, 60); G.setTimeout(caler, 350); });
    champ.addEventListener("blur", function () { G.setTimeout(caler, 120); });
  }
  function bas() { var f = el.querySelector(".as-fil"); f.scrollTop = f.scrollHeight; }
  function ajouter(html) { var d = G.document.createElement("div"); d.innerHTML = html; while (d.firstChild) fil.appendChild(d.firstChild); bas(); }
  // File d'affichage : chaque bulle du robot arrive apres « en train d'ecrire ».
  function dire(items) { file = file.concat(items); if (!enCours) suite(); }
  function suite() {
    if (!file.length) { enCours = false; return; }
    enCours = true;
    var it = file.shift();
    if (it.t === "attente") {
      ajouter('<div class="as-tape" aria-label="' + esc(S.L.ecrit) + '"><i></i><i></i><i></i></div>');
      return it.p.then(function (items) {
        var t = fil.querySelector(".as-tape"); if (t) t.remove();
        file = (items || []).concat(file); suite();
      }, function () { var t = fil.querySelector(".as-tape"); if (t) t.remove(); suite(); });
    }
    if (it.t !== "bulle") { ajouter(it.html); return G.setTimeout(suite, 120); }
    var reduit = G.matchMedia && G.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ajouter('<div class="as-tape" aria-label="' + esc(S.L.ecrit) + '"><i></i><i></i><i></i></div>');
    G.setTimeout(function () {
      var t = fil.querySelector(".as-tape"); if (t) t.remove();
      ajouter('<div class="as-b as-b--bot">' + esc(it.texte) + "</div>");
      noter("robot", it.texte);
      suite();
    }, reduit ? 150 : Math.min(1100, 380 + it.texte.length * 9));
  }
  function bulles(lignes) { return lignes.map(function (x) { return { t: "bulle", texte: x }; }); }
  function boutons(liste) {
    if (S.sensible) liste = liste.filter(function (b) { return /assistant_(aide|contact|email|methode)/.test(b.track || "") || b.as === "humain" || b.as === "nonMerci"; });
    liste = liste.filter(Boolean);
    return { t: "html", html: '<div class="as-btns">' + liste.map(function (b) {
      var cls = "as-btn" + (b.plein ? " as-btn--plein" : "");
      if (b.as) return '<button type="button" class="' + cls + '" data-as="' + esc(b.as) + '"' + (b.track ? ' data-track="' + esc(b.track) + '"' : "") + ">" + esc(b.l) + "</button>";
      var ext = /^https?:/.test(b.href);
      return '<a class="' + cls + '" href="' + esc(b.href) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ' data-track="' + esc(b.track) + '">' + esc(b.l) + "</a>";
    }).join("") + "</div>" };
  }
  function carte(m, k, pro) {
    var ligne = [jour(m), passe(m) ? "" : heure(m), k === m.league ? "" : m.league].filter(Boolean).join(" · ");
    return { t: "html", html: '<a class="as-carte" href="' + esc(lienMatch(m)) + '" data-track="assistant_match"><p class="as-k' + (pro ? " as-k--pro" : "") + '">' + esc(k) + '</p><p class="as-m">' + esc(nom(m.home) + " - " + nom(m.away)) + '</p><p class="as-l">' + esc(ligne) + "</p></a>" };
  }
  function libellePari(s) {
    var Lb = G.IasharkMarketLabels, eq = { home: s.h, away: s.a };
    try {
      if (Lb && s.m && typeof Lb.marketIdLabel === "function") { var x = Lb.marketIdLabel(s.m, eq); if (x && x !== s.m) return x; }
      if (Lb && s.p && typeof Lb.marketLabel === "function") { var y = Lb.marketLabel(s.p, eq); if (y) return y; }
    } catch (e) {}
    return s.p || s.m || "";
  }
  function tableauResultats(items) {
    var L = S.L;
    return { t: "html", html: '<div class="as-res">' + items.map(function (s) {
      var c = Number(s.c), cote = isNaN(c) ? "" : " · " + L.cote + " " + c.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      var r = s.r === "win" ? ["w", L.gagne] : s.r === "loss" ? ["l", L.perdu] : ["v", L.annule];
      return '<div class="as-r"><div><b>' + esc(s.h + " - " + s.a) + "</b><span>" + esc(libellePari(s) + cote + (s.s ? " · " + s.s : "")) + '</span></div><em class="' + r[0] + '">' + esc(r[1]) + "</em></div>";
    }).join("") + "</div>" };
  }

  // ---------------------------------------------------------------- boutons communs
  var B = {
    compte: function () { return { href: lien("inscription.html"), l: S.L.b_compte, track: "assistant_inscription", plein: true }; },
    pro: function (plein) { return { href: lien("abonnement.html"), l: S.L.b_pro, track: "assistant_pro", plein: plein !== false }; },
    proOffert: function (plein) { return { href: lien("lolly.html"), l: S.L.b_proOffert, track: "assistant_pro_offert", plein: !!plein }; },
    tg: function () { return { href: TG_CANAL, l: S.L.b_telegram, track: "assistant_telegram" }; },
    contact: function () { return { href: TG_CONTACT, l: S.L.b_contact, track: "assistant_contact" }; },
    lolly: function () { return { href: "/go/lolly/site", l: S.L.b_lolly, track: "assistant_lolly", plein: true }; },
    combines: function (plein) { return { href: lien("combines.html"), l: S.L.b_combines, track: "assistant_combines", plein: !!plein }; },
    offert: function () { return { as: "gratuit", l: S.L.b_offert }; },
    menu: function () {
      var L = S.L;
      if (S.profil === "pro") return [{ as: "combines", l: L.c_combines }, { as: "chercher", l: L.c_chercher }, { as: "bonus", l: L.c_bonus }, { as: "resultats", l: L.c_resultats }];
      if (S.profil === "membre") return [{ as: "proOffert", l: L.c_proOffert }, { as: "chercher", l: L.c_chercher }, { as: "resultats", l: L.c_resultats }, { as: "site", l: L.c_site }];
      return [{ as: "gratuit", l: L.c_gratuit }, { as: "chercher", l: L.c_chercher }, { as: "resultats", l: L.c_resultats }, { as: "prix", l: L.c_pro }];
    },
    // Ce qui pousse a l'achat selon le profil : compte (visiteur), Pro ou Pro offert (inscrit), rien (Pro).
    vente: function () {
      if (S.profil === "pro") return [];
      if (S.profil === "membre") return [B.pro(), B.proOffert()];
      return [B.compte(), B.pro(false)];
    }
  };

  // ---------------------------------------------------------------- fiche d'un match (20/11/2026)
  // Retour de Clement : « j'ai demande un renseignement sur un match, ca m'a rien dit ». L'assistant donne
  // maintenant les infos PUBLIQUES du match, les memes que la page match montre a tout le monde : heure,
  // forme, classement, confrontations, absents, cotes des bookmakers, buteurs en forme, buts, meteo, arbitre.
  // Source : la fonction match-data (cle publique du site, comme match.html). Elle retire elle-meme tout
  // champ payant pour un non-abonne : le pari n'est jamais lu ni montre ici.
  var SUPA = "https://ksvjraqitxouwiabecai.supabase.co";
  var SUPA_CLE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";
  var FM = {
    fr: {
      intro: ["Voilà ce que j'ai sur ce match.", "Je te résume ce match.", "OK, voilà l'essentiel."],
      quand: function (h, a, j, hr, lg) { return h + " - " + a + ", " + j + (hr ? " à " + hr : "") + (lg ? " (" + lg + ")" : "") + "."; },
      forme: function (h, fh, a, fa) { var c = function (r) { return [[r.v, "victoire", "victoires"], [r.n, "nul", "nuls"], [r.d, "défaite", "défaites"]].filter(function (x) { return x[0]; }).map(function (x) { return x[0] + " " + x[x[0] > 1 ? 2 : 1]; }).join(", "); }; return "Sur leurs 5 derniers matchs : " + h + ", " + c(fh) + " ; " + a + ", " + c(fa) + "."; },
      formeAvantage: function (e) { return "Avantage forme pour " + e + " en ce moment."; },
      formeEgal: "Les deux arrivent dans une forme assez proche.",
      classement: function (h, rh, a, ra) { return "Au classement, " + h + " est " + rh.rank + (rh.rank === 1 ? "er" : "e") + " (" + rh.pts + " pts) et " + a + " " + ra.rank + (ra.rank === 1 ? "er" : "e") + " (" + ra.pts + " pts)."; },
      h2h: function (h, vh, a, va, nul, t) { return "Entre eux, sur les " + t + " derniers duels : " + vh + " victoire" + (vh > 1 ? "s" : "") + " pour " + h + ", " + va + " pour " + a + " et " + nul + " nul" + (nul > 1 ? "s" : "") + "."; },
      h2hDernier: function (s, d) { return "Le dernier : " + s + " (" + d + ")."; },
      h2hRien: "Ils ne se sont pas affrontés ces dernières années.",
      absents: function (parts) { return "Absents signalés : " + parts.join(" ; ") + "."; },
      absentsEq: function (e, n, noms) { return n + " côté " + e + (noms ? " (" + noms + ")" : ""); },
      absentsRien: "Aucun absent signalé pour l'instant.",
      cotes: function (fav, cf, nul, autre, ca) { return "Pour les bookmakers, " + fav + " est favori (cote " + cf + "). Le nul est à " + nul + " et " + autre + " à " + ca + "."; },
      cotesSerre: function (h, c1, a, c2, nul) { return "Match très serré pour les bookmakers : " + c1 + " pour " + h + ", " + c2 + " pour " + a + ", nul à " + nul + "."; },
      buts: function (h, oh, nh, a, oa, na) { return "Plus de 2,5 buts : dans " + oh + " des " + nh + " derniers matchs de " + h + ", " + oa + " sur " + na + " pour " + a + "."; },
      butsCote: function (c) { return "Cote « plus de 2,5 buts » : " + c + "."; },
      btts: function (h, bh, nh, a, ba, na) { return "Les deux équipes ont marqué dans " + bh + " sur " + nh + " pour " + h + ", " + ba + " sur " + na + " pour " + a + "."; },
      buteur: function (liste) { return "En forme devant : " + liste.join(", ") + "."; },
      buteurEq: function (n, c, e) { return n + " (" + c + " but" + (c > 1 ? "s" : "") + ") pour " + e; },
      buteurRien: "Aucun buteur ne sort vraiment du lot pour l'instant.",
      meteo: function (t, d) { return "Météo prévue : " + t + (d ? ", " + d : "") + "."; },
      arbitre: function (n) { return "Arbitre : " + n + "."; },
      compo: "Les compos officielles sortent environ une heure avant le coup d'envoi, elles s'affichent sur la page du match.",
      compoSortie: "Les compos officielles sont sorties : elles sont sur la page du match.",
      qui: "Qui va gagner ? Les chiffres au-dessus donnent la tendance.",
      quiPari2: "Notre pari précis sur ce match, avec sa cote, est dans le Pro (ou 1 mois de Pro offert avec Lolly Bet, notre partenaire).",
      quelMatch: ["Quel match ? Écris le nom d'une des deux équipes.", "Ou choisis dans les prochains :"],
      pasVu: function (mot) { return ["Je ne trouve pas " + (mot ? "« " + mot + " »" : "ce match") + " dans les matchs qu'on analyse en ce moment.", "Essaie avec le nom d'une seule équipe, ou choisis :"]; },
      lent: "Je n'arrive pas à charger le détail, voilà déjà ce que j'ai :",
      pasAuj: function (j) { return "Pas aujourd'hui : ce match se joue " + j + "."; },
      humainAttente: ["Je préviens l'équipe tout de suite. Quelqu'un va te répondre ici, reste sur cette page.", "Si on est tous pris, je te donne le mail dans 5 minutes."],
      humainArrive: "Un membre de l'équipe a rejoint la conversation.",
      occupe: ["On est tous occupés là, désolé.", "Écris-nous à " + MAIL + " ou sur Telegram : on te répond vite."],
      equipe: "Équipe IASHARK",
      relance: "Tu veux que je te montre le match offert du jour, ou nos derniers résultats ?",
      pg: ["Tu as vu ton pari offert du jour.", "Petite question : qu'est-ce qui te retient de passer Pro ?"],
      b_lePrix: "Le prix", b_pasConvaincu: "Pas convaincu", b_pasMaintenant: "Pas maintenant", b_suffit: "Le gratuit me suffit", b_hesite: "J'hésite",
      hPrix: ["Je comprends. Alors prends-le sans payer : ouvre ton compte chez Lolly Bet, notre partenaire, avec notre lien.", "Tu as 1 mois de Pro offert, ton 1er pari remboursé en cash jusqu'à 100 €, et on t'envoie en privé nos 3 paris les plus justes du jour pour bien démarrer."],
      hConv: ["Normal, tu ne nous connais pas encore. Ne nous crois pas sur parole : voilà nos derniers paris, gagnés et perdus, tous publiés avant le match."],
      hConvFin: "Et ton match offert de chaque jour te permet de juger par toi-même.",
      hTard: ["Pas de souci. Ton match offert revient chaque jour.", "Et si tu veux essayer le Pro sans payer, le mois offert avec Lolly Bet reste ouvert."],
      hSuffit: ["Ça marche. Ton match offert et le buteur restent là chaque jour.", "Rejoins Telegram pour ne jamais le rater."],
      perdu: ["Ça arrive, et on ne le cache pas : chaque pari perdu reste visible dans nos résultats.", "Si tu veux qu'on regarde ce match ensemble, l'équipe est là."],
      dejaGagne: ["Tant mieux ! Alors compare : prends notre match offert du jour et mets-le face à ton analyse.", "Si on voit des choses que tu ne vois pas, le Pro te les donne sur tous les matchs."],
      confiance: ["Normal d'être méfiant. Chaque pari est publié avant le match, gagné ou perdu, et rien n'est changé après.", "Juge sur pièce avec le match offert : il est gratuit."],
      pasBook: ["Aucun souci, Lolly Bet n'est pas obligatoire.", "Le Pro se prend directement ici et tu l'arrêtes en un clic."],
      cava: ["Ça va bien, merci ! Je suis là pour te parler des matchs du jour.", "Tu veux voir lequel ?"],
      ouiQuoi: ["Oui à quoi ? Dis-moi une équipe ou choisis :"],
      fin: ["Et sinon, une autre équipe ?", "Tu veux un autre match ?", "Une autre question ?"]
    },
    en: {
      intro: ["Here's what I have on this match.", "Quick rundown of this one.", "OK, here's the gist."],
      quand: function (h, a, j, hr, lg) { return h + " vs " + a + ", " + j + (hr ? " at " + hr : "") + (lg ? " (" + lg + ")" : "") + "."; },
      forme: function (h, fh, a, fa) { var c = function (r) { return [[r.v, "win", "wins"], [r.n, "draw", "draws"], [r.d, "loss", "losses"]].filter(function (x) { return x[0]; }).map(function (x) { return x[0] + " " + x[x[0] > 1 ? 2 : 1]; }).join(", "); }; return "Last 5 games: " + h + ", " + c(fh) + "; " + a + ", " + c(fa) + "."; },
      formeAvantage: function (e) { return e + " are in better form right now."; },
      formeEgal: "Both sides come in with similar form.",
      classement: function (h, rh, a, ra) { return "In the table, " + h + " are " + ord(rh.rank) + " (" + rh.pts + " pts) and " + a + " " + ord(ra.rank) + " (" + ra.pts + " pts)."; },
      h2h: function (h, vh, a, va, nul, t) { return "Head to head, last " + t + " meetings: " + vh + " win" + (vh === 1 ? "" : "s") + " for " + h + ", " + va + " for " + a + ", " + nul + " draw" + (nul === 1 ? "" : "s") + "."; },
      h2hDernier: function (s, d) { return "Last one: " + s + " (" + d + ")."; },
      h2hRien: "They haven't met in recent years.",
      absents: function (parts) { return "Reported absences: " + parts.join("; ") + "."; },
      absentsEq: function (e, n, noms) { return n + " for " + e + (noms ? " (" + noms + ")" : ""); },
      absentsRien: "No absences reported so far.",
      cotes: function (fav, cf, nul, autre, ca) { return "Bookmakers make " + fav + " the favourite (odds " + cf + "). The draw is " + nul + " and " + autre + " " + ca + "."; },
      cotesSerre: function (h, c1, a, c2, nul) { return "Very tight for the bookmakers: " + c1 + " for " + h + ", " + c2 + " for " + a + ", draw " + nul + "."; },
      buts: function (h, oh, nh, a, oa, na) { return "Over 2.5 goals: " + oh + " of " + h + "'s last " + nh + " games, " + oa + " of " + na + " for " + a + "."; },
      butsCote: function (c) { return "Over 2.5 goals odds: " + c + "."; },
      btts: function (h, bh, nh, a, ba, na) { return "Both teams scored in " + bh + " of " + nh + " for " + h + ", " + ba + " of " + na + " for " + a + "."; },
      buteur: function (liste) { return "In form up front: " + liste.join(", ") + "."; },
      buteurEq: function (n, c, e) { return n + " (" + c + " goal" + (c === 1 ? "" : "s") + ") for " + e; },
      buteurRien: "No scorer really stands out right now.",
      meteo: function (t) { return "Forecast: " + t + "."; },
      arbitre: function (n) { return "Referee: " + n + "."; },
      compo: "Official lineups come out about an hour before kick-off, on the match page.",
      compoSortie: "Official lineups are out: they're on the match page.",
      qui: "Who wins? The numbers above show the trend.",
      quiPari2: "Our exact pick on this match, with its odds, is in Pro (or get 1 month of Pro free with Lolly Bet, our partner).",
      quelMatch: ["Which match? Type one of the two teams.", "Or pick one of the next ones:"],
      pasVu: function (mot) { return ["I can't find " + (mot ? "\"" + mot + "\"" : "this match") + " among the matches we're covering right now.", "Try just one team name, or pick:"]; },
      lent: "I can't load the details right now, here's what I have:",
      pasAuj: function (j) { return "Not today: this one is on " + j + "."; },
      humainAttente: ["I'm letting the team know right now. Someone will answer you here, stay on this page.", "If we're all busy, I'll give you our email in 5 minutes."],
      humainArrive: "A team member joined the conversation.",
      occupe: ["We're all busy right now, sorry.", "Email us at " + MAIL + " or message us on Telegram: we'll get back to you fast."],
      equipe: "IASHARK team",
      relance: "Want me to show you today's free match, or our latest results?",
      pg: ["You've seen today's free pick.", "Quick question: what's holding you back from going Pro?"],
      b_lePrix: "The price", b_pasConvaincu: "Not convinced", b_pasMaintenant: "Not now", b_suffit: "Free is enough", b_hesite: "I'm not sure",
      hPrix: ["Got it. Then get it without paying: open your Lolly Bet account, our partner, with our link.", "You get 1 month of Pro free, your 1st bet refunded in cash up to 100 €, and we send you our 3 sharpest picks of the day in private to get started."],
      hConv: ["Fair enough, you don't know us yet. Don't take our word for it: here are our latest picks, won and lost, all posted before kick-off."],
      hConvFin: "And your daily free match lets you judge for yourself.",
      hTard: ["No problem. Your free match is back every day.", "And if you want to try Pro without paying, the free month with Lolly Bet is still open."],
      hSuffit: ["Sure. Your free match and the scorer are here every day.", "Join Telegram so you never miss it."],
      perdu: ["It happens, and we don't hide it: every lost pick stays visible in our results.", "If you want us to go over that match with you, the team is here."],
      dejaGagne: ["Good for you! Then compare: take today's free match and put it next to your own read.", "If we see things you don't, Pro gives you that on every match."],
      confiance: ["Fair to be careful. Every pick is posted before kick-off, won or lost, and nothing is changed after.", "Judge for yourself with the free match: it costs nothing."],
      pasBook: ["No problem, Lolly Bet isn't required.", "You can get Pro right here and cancel in one click."],
      cava: ["All good, thanks! I'm here to talk about today's matches.", "Which one do you want?"],
      ouiQuoi: ["Yes to what? Give me a team or pick:"],
      fin: ["Another team?", "Want another match?", "Anything else?"]
    },
    es: {
      intro: ["Esto es lo que tengo de este partido.", "Te resumo el partido.", "Vale, lo esencial."],
      quand: function (h, a, j, hr, lg) { return h + " - " + a + ", " + j + (hr ? " a las " + hr : "") + (lg ? " (" + lg + ")" : "") + "."; },
      forme: function (h, fh, a, fa) { var c = function (r) { return [[r.v, "victoria", "victorias"], [r.n, "empate", "empates"], [r.d, "derrota", "derrotas"]].filter(function (x) { return x[0]; }).map(function (x) { return x[0] + " " + x[x[0] > 1 ? 2 : 1]; }).join(", "); }; return "Últimos 5 partidos: " + h + ", " + c(fh) + "; " + a + ", " + c(fa) + "."; },
      formeAvantage: function (e) { return e + " llega en mejor forma."; },
      formeEgal: "Los dos llegan con una forma parecida.",
      classement: function (h, rh, a, ra) { return "En la tabla, " + h + " es " + rh.rank + ".º (" + rh.pts + " pts) y " + a + " " + ra.rank + ".º (" + ra.pts + " pts)."; },
      h2h: function (h, vh, a, va, nul, t) { return "Entre ellos, en los últimos " + t + " duelos: " + vh + " victoria" + (vh === 1 ? "" : "s") + " de " + h + ", " + va + " de " + a + " y " + nul + " empate" + (nul === 1 ? "" : "s") + "."; },
      h2hDernier: function (s, d) { return "El último: " + s + " (" + d + ")."; },
      h2hRien: "No se han enfrentado en los últimos años.",
      absents: function (parts) { return "Bajas: " + parts.join("; ") + "."; },
      absentsEq: function (e, n, noms) { return n + " en " + e + (noms ? " (" + noms + ")" : ""); },
      absentsRien: "Ninguna baja confirmada por ahora.",
      cotes: function (fav, cf, nul, autre, ca) { return "Para las casas, " + fav + " es favorito (cuota " + cf + "). El empate paga " + nul + " y " + autre + " " + ca + "."; },
      cotesSerre: function (h, c1, a, c2, nul) { return "Partido muy parejo para las casas: " + c1 + " para " + h + ", " + c2 + " para " + a + ", empate " + nul + "."; },
      buts: function (h, oh, nh, a, oa, na) { return "Más de 2,5 goles: en " + oh + " de los últimos " + nh + " partidos de " + h + ", " + oa + " de " + na + " de " + a + "."; },
      butsCote: function (c) { return "Cuota «más de 2,5 goles»: " + c + "."; },
      btts: function (h, bh, nh, a, ba, na) { return "Ambos marcaron en " + bh + " de " + nh + " de " + h + ", " + ba + " de " + na + " de " + a + "."; },
      buteur: function (liste) { return "En racha arriba: " + liste.join(", ") + "."; },
      buteurEq: function (n, c, e) { return n + " (" + c + " gol" + (c === 1 ? "" : "es") + ") en " + e; },
      buteurRien: "Ningún goleador destaca de verdad por ahora.",
      meteo: function (t) { return "Previsión: " + t + "."; },
      arbitre: function (n) { return "Árbitro: " + n + "."; },
      compo: "Las alineaciones oficiales salen una hora antes del partido, en la página del partido.",
      compoSortie: "Las alineaciones oficiales ya salieron: están en la página del partido.",
      qui: "¿Quién gana? Los números de arriba marcan la tendencia.",
      quiPari2: "Nuestra apuesta exacta en este partido, con su cuota, está en el Pro (o 1 mes de Pro gratis con Lolly Bet, nuestro socio).",
      quelMatch: ["¿Qué partido? Escribe uno de los dos equipos.", "O elige entre los próximos:"],
      pasVu: function (mot) { return ["No encuentro " + (mot ? "«" + mot + "»" : "este partido") + " entre los partidos que analizamos ahora.", "Prueba con un solo equipo, o elige:"]; },
      lent: "No consigo cargar el detalle, esto es lo que tengo:",
      pasAuj: function (j) { return "Hoy no: este partido se juega el " + j + "."; },
      humainAttente: ["Aviso al equipo ahora mismo. Alguien te va a responder aquí, quédate en esta página.", "Si estamos todos ocupados, te doy el correo en 5 minutos."],
      humainArrive: "Un miembro del equipo se unió a la conversación.",
      occupe: ["Estamos todos ocupados ahora, lo siento.", "Escríbenos a " + MAIL + " o por Telegram: te respondemos rápido."],
      equipe: "Equipo IASHARK",
      relance: "¿Quieres que te enseñe el partido gratis de hoy o nuestros últimos resultados?",
      pg: ["Ya viste tu apuesta gratis de hoy.", "Una pregunta: ¿qué te frena para pasarte a Pro?"],
      b_lePrix: "El precio", b_pasConvaincu: "No me convence", b_pasMaintenant: "Ahora no", b_suffit: "Me basta lo gratis", b_hesite: "Tengo dudas",
      hPrix: ["Lo entiendo. Entonces tenlo sin pagar: abre tu cuenta en Lolly Bet, nuestro socio, con nuestro enlace.", "Tienes 1 mes de Pro gratis, tu 1.ª apuesta reembolsada en efectivo hasta 100 €, y te mandamos en privado nuestras 3 apuestas más afinadas del día para empezar."],
      hConv: ["Normal, todavía no nos conoces. No nos creas a ciegas: estas son nuestras últimas apuestas, ganadas y perdidas, todas publicadas antes del partido."],
      hConvFin: "Y tu partido gratis de cada día te deja juzgar por ti mismo.",
      hTard: ["Sin problema. Tu partido gratis vuelve cada día.", "Y si quieres probar el Pro sin pagar, el mes gratis con Lolly Bet sigue abierto."],
      hSuffit: ["Vale. Tu partido gratis y el goleador siguen aquí cada día.", "Únete a Telegram para no perdértelo."],
      perdu: ["Pasa, y no lo escondemos: cada apuesta perdida sigue visible en nuestros resultados.", "Si quieres que revisemos ese partido contigo, el equipo está aquí."],
      dejaGagne: ["¡Mejor! Entonces compara: toma nuestro partido gratis de hoy y ponlo frente a tu análisis.", "Si vemos cosas que tú no ves, el Pro te las da en todos los partidos."],
      confiance: ["Normal desconfiar. Cada apuesta se publica antes del partido, ganada o perdida, y nada se cambia después.", "Juzga con el partido gratis: no cuesta nada."],
      pasBook: ["Sin problema, Lolly Bet no es obligatorio.", "El Pro se contrata aquí mismo y lo cancelas en un clic."],
      cava: ["¡Todo bien, gracias! Estoy aquí para hablarte de los partidos de hoy.", "¿Cuál quieres ver?"],
      ouiQuoi: ["¿Sí a qué? Dime un equipo o elige:"],
      fin: ["¿Otro equipo?", "¿Quieres otro partido?", "¿Algo más?"]
    },
    pt: {
      intro: ["Isto é o que tenho sobre este jogo.", "Resumo-te o jogo.", "Ok, o essencial."],
      quand: function (h, a, j, hr, lg) { return h + " - " + a + ", " + j + (hr ? " às " + hr : "") + (lg ? " (" + lg + ")" : "") + "."; },
      forme: function (h, fh, a, fa) { var c = function (r) { return [[r.v, "vitória", "vitórias"], [r.n, "empate", "empates"], [r.d, "derrota", "derrotas"]].filter(function (x) { return x[0]; }).map(function (x) { return x[0] + " " + x[x[0] > 1 ? 2 : 1]; }).join(", "); }; return "Últimos 5 jogos: " + h + ", " + c(fh) + "; " + a + ", " + c(fa) + "."; },
      formeAvantage: function (e) { return e + " chega em melhor forma."; },
      formeEgal: "As duas equipas chegam com uma forma parecida.",
      classement: function (h, rh, a, ra) { return "Na classificação, " + h + " está em " + rh.rank + ".º (" + rh.pts + " pts) e " + a + " em " + ra.rank + ".º (" + ra.pts + " pts)."; },
      h2h: function (h, vh, a, va, nul, t) { return "Entre eles, nos últimos " + t + " duelos: " + vh + " vitória" + (vh === 1 ? "" : "s") + " de " + h + ", " + va + " de " + a + " e " + nul + " empate" + (nul === 1 ? "" : "s") + "."; },
      h2hDernier: function (s, d) { return "O último: " + s + " (" + d + ")."; },
      h2hRien: "Não se defrontaram nos últimos anos.",
      absents: function (parts) { return "Ausências: " + parts.join("; ") + "."; },
      absentsEq: function (e, n, noms) { return n + " no " + e + (noms ? " (" + noms + ")" : ""); },
      absentsRien: "Nenhuma ausência confirmada por agora.",
      cotes: function (fav, cf, nul, autre, ca) { return "Para as casas, " + fav + " é favorito (odd " + cf + "). O empate paga " + nul + " e " + autre + " " + ca + "."; },
      cotesSerre: function (h, c1, a, c2, nul) { return "Jogo muito equilibrado para as casas: " + c1 + " para " + h + ", " + c2 + " para " + a + ", empate " + nul + "."; },
      buts: function (h, oh, nh, a, oa, na) { return "Mais de 2,5 golos: em " + oh + " dos últimos " + nh + " jogos de " + h + ", " + oa + " de " + na + " de " + a + "."; },
      butsCote: function (c) { return "Odd «mais de 2,5 golos»: " + c + "."; },
      btts: function (h, bh, nh, a, ba, na) { return "Ambas marcaram em " + bh + " de " + nh + " de " + h + ", " + ba + " de " + na + " de " + a + "."; },
      buteur: function (liste) { return "Em forma na frente: " + liste.join(", ") + "."; },
      buteurEq: function (n, c, e) { return n + " (" + c + " golo" + (c === 1 ? "" : "s") + ") no " + e; },
      buteurRien: "Nenhum marcador se destaca de verdade por agora.",
      meteo: function (t) { return "Previsão: " + t + "."; },
      arbitre: function (n) { return "Árbitro: " + n + "."; },
      compo: "Os onzes oficiais saem cerca de uma hora antes do jogo, na página do jogo.",
      compoSortie: "Os onzes oficiais já saíram: estão na página do jogo.",
      qui: "Quem ganha? Os números acima mostram a tendência.",
      quiPari2: "A nossa aposta exata neste jogo, com a odd, está no Pro (ou 1 mês de Pro grátis com a Lolly Bet, o nosso parceiro).",
      quelMatch: ["Que jogo? Escreve uma das duas equipas.", "Ou escolhe entre os próximos:"],
      pasVu: function (mot) { return ["Não encontro " + (mot ? "«" + mot + "»" : "este jogo") + " nos jogos que analisamos agora.", "Tenta só com o nome de uma equipa, ou escolhe:"]; },
      lent: "Não consigo carregar o detalhe, isto é o que tenho:",
      pasAuj: function (j) { return "Hoje não: este jogo é " + j + "."; },
      humainAttente: ["Vou avisar a equipa já. Alguém te vai responder aqui, fica nesta página.", "Se estivermos todos ocupados, dou-te o e-mail daqui a 5 minutos."],
      humainArrive: "Um membro da equipa entrou na conversa.",
      occupe: ["Estamos todos ocupados agora, desculpa.", "Escreve-nos para " + MAIL + " ou no Telegram: respondemos rápido."],
      equipe: "Equipa IASHARK",
      relance: "Queres que te mostre o jogo grátis de hoje, ou os nossos últimos resultados?",
      pg: ["Já viste a tua aposta grátis de hoje.", "Uma pergunta: o que te impede de passar a Pro?"],
      b_lePrix: "O preço", b_pasConvaincu: "Não estou convencido", b_pasMaintenant: "Agora não", b_suffit: "O grátis chega", b_hesite: "Estou na dúvida",
      hPrix: ["Percebo. Então tem-no sem pagar: abre a tua conta na Lolly Bet, o nosso parceiro, com o nosso link.", "Tens 1 mês de Pro grátis, a tua 1.ª aposta reembolsada em dinheiro até 100 €, e enviamos-te em privado as nossas 3 apostas mais certeiras do dia para começar."],
      hConv: ["Normal, ainda não nos conheces. Não acredites só na nossa palavra: aqui estão as nossas últimas apostas, ganhas e perdidas, todas publicadas antes do jogo."],
      hConvFin: "E o teu jogo grátis de cada dia deixa-te julgar por ti.",
      hTard: ["Sem problema. O teu jogo grátis volta todos os dias.", "E se quiseres experimentar o Pro sem pagar, o mês grátis com a Lolly Bet continua aberto."],
      hSuffit: ["Combinado. O teu jogo grátis e o marcador ficam aqui todos os dias.", "Entra no Telegram para nunca o perderes."],
      perdu: ["Acontece, e não o escondemos: cada aposta perdida fica visível nos nossos resultados.", "Se quiseres rever esse jogo connosco, a equipa está aqui."],
      dejaGagne: ["Ainda bem! Então compara: pega no nosso jogo grátis de hoje e põe-no ao lado da tua análise.", "Se virmos coisas que tu não vês, o Pro dá-te isso em todos os jogos."],
      confiance: ["Normal desconfiar. Cada aposta é publicada antes do jogo, ganha ou perdida, e nada é mudado depois.", "Julga com o jogo grátis: não custa nada."],
      pasBook: ["Sem problema, a Lolly Bet não é obrigatória.", "O Pro compra-se aqui mesmo e cancelas num clique."],
      cava: ["Tudo bem, obrigado! Estou aqui para falar dos jogos de hoje.", "Qual queres ver?"],
      ouiQuoi: ["Sim a quê? Diz-me uma equipa ou escolhe:"],
      fin: ["Outra equipa?", "Queres outro jogo?", "Mais alguma coisa?"]
    }
  };
  function ord(n) { var s = n % 100, u = n % 10; return n + (s > 10 && s < 14 ? "th" : u === 1 ? "st" : u === 2 ? "nd" : u === 3 ? "rd" : "th"); }
  function F() { return FM[langue(S.dir)] || FM.fr; }
  function auHasard(liste) { return liste[Math.floor(Math.random() * liste.length)]; }
  function cote(v) { var n = Number(v); return n > 1 ? n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""; }

  // Sujet precis demande sur un match (« il y a des blesses ? », « qui va gagner ? »).
  var FOCUS = [
    ["absents", /\s(blesse|blesses|blessure|blessures|absent|absents|absence|absences|suspendu|suspendus|forfait|forfaits|infirmerie|injur\w*|injured|missing|lesion\w*|lesionado|lesionados|baja|bajas|desfalque|desfalques|lesao|lesoes|suspenso|suspensos)\s/],
    ["compo", /\s(compo|compos|composition|compositions|onze|titulaires|lineup|lineups|line up|starting|alineacion|alineaciones|once|escalacao|onzes)\s/],
    ["qui", /\s(qui (va )?gagne\w*|qui l emporte|vainqueur|favori|favoris|who (will )?win\w*|winner|favourite|favorite|quien gana\w*|quien va a ganar|ganador|favorito|quem (vai )?ganha\w*|vencedor|ton prono|votre prono|ton avis|your pick|your prediction|tu pronostico|tu apuesta|o teu palpite|a tua aposta|ce match|this match|this game|este partido|este jogo)\s/],
    ["cotes", /\s(cote|cotes|odds|odd|cuota|cuotas|momio|momios)\s/],
    ["classement", /\s(classement|classe|classes|rang|position|standings|table|tabla|clasificacion|posicion|classificacao|posicao)\s/],
    ["h2h", /\s(h2h|confrontation|confrontations|face a face|deja joue|historique entre|head to head|met before|enfrentamiento\w*|cara a cara|confronto|confrontos)\s/],
    ["buteur", /\s(buteur|buteurs|qui marque|va marquer|scorer|scorers|goalscorer|goleador|goleadores|quien marca|artilheiro|marcador|quem marca)\s/],
    ["buts", /\s(buts|over|under|plus de \d|moins de \d|goals|goles|gols|golos|btts|les deux marquent|both teams)\s/],
    ["forme", /\s(forme|en forme|derniers matchs|serie|form|last games|racha|ultimos partidos|ultimos jogos|momento)\s/],
    ["meteo", /\s(meteo|pluie|temps qu il|weather|rain|clima|lluvia|chuva|tempo)\s/],
    ["arbitre", /\s(arbitre|referee|ref|arbitro)\s/],
    ["heure", /\s(quelle heure|a quelle heure|heure|what time|kick off|kickoff|a que hora|que horas|hora|quand|when|cuando|quando)\s/],
    ["infos", /\s(info|infos|information|informations|renseignement|renseignements|analyse|stats|stat|statistiques|details|detail|apercu|resume|preview|statistics|analysis|estadisticas|analisis|datos|estatisticas|analise|dados)\s/]
  ];
  function focusDe(texte) {
    var t = " " + norm(texte) + " ";
    for (var i = 0; i < FOCUS.length; i++) if (FOCUS[i][1].test(t)) return FOCUS[i][0];
    return null;
  }

  // Detail public d'un match (meme appel que match.html). Garde en memoire pour la conversation.
  function jeton() {
    try {
      var s = JSON.parse(G.localStorage.getItem("sb-ksvjraqitxouwiabecai-auth-token") || "null");
      if (s && s.access_token && s.expires_at && s.expires_at * 1000 > Date.now() + 60000) return s.access_token;
    } catch (e) {}
    return null;
  }
  function detail(m) {
    S.details = S.details || {};
    var id = String(m.id);
    if (S.details[id]) return S.details[id];
    var p = new Promise(function (ok) {
      var fini = false, stop = G.setTimeout(function () { fini = true; ok(null); }, 8000);
      G.fetch(SUPA + "/functions/v1/match-data", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_CLE, Authorization: "Bearer " + (jeton() || SUPA_CLE) },
        body: JSON.stringify({ id: id })
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (fini) return; G.clearTimeout(stop);
        var x = d && Array.isArray(d.matchs) ? d.matchs.filter(function (y) { return y && String(y.id) === id; })[0] : null;
        ok(x || null);
      }).catch(function () { if (!fini) { G.clearTimeout(stop); ok(null); } });
    });
    S.details[id] = p;
    p.then(function (x) { if (!x) delete S.details[id]; });
    return p;
  }

  function bilan5(liste) {
    var r = { v: 0, n: 0, d: 0, t: 0 };
    (liste || []).slice(0, 5).forEach(function (x) { var c = x && x.result; if (c === "W") r.v++; else if (c === "D") r.n++; else if (c === "L") r.d++; else return; r.t++; });
    return r;
  }
  function moisAn(d) {
    var x = new Date(String(d || "") + "T12:00:00");
    return isNaN(x) ? "" : x.toLocaleDateString(locale(), { month: "long", year: "numeric" });
  }
  // Les phrases de la fiche, dans l'ordre ; « focus » met le sujet demande en premier et coupe le reste.
  function phrases(m, d, focus) {
    var f = F(), h = nom(m.home), a = nom(m.away), x = d || m, out = {};
    var hid = m.home && m.home.id, aid = m.away && m.away.id;
    out.heure = [f.quand(h, a, jour(m), passe(m) ? "" : heure(m), m.league || "")];
    var fh = bilan5(x.form_home), fa = bilan5(x.form_away);
    if (fh.t >= 3 && fa.t >= 3) {
      out.forme = [f.forme(h, fh, a, fa), (3 * fh.v + fh.n) - (3 * fa.v + fa.n) >= 4 ? f.formeAvantage(h) : (3 * fa.v + fa.n) - (3 * fh.v + fh.n) >= 4 ? f.formeAvantage(a) : f.formeEgal];
    }
    var st = x.classement && Array.isArray(x.classement.standings) ? x.classement.standings : [];
    var rh = st.filter(function (s) { return hid != null && s.team_id === hid; })[0], ra = st.filter(function (s) { return aid != null && s.team_id === aid; })[0];
    if (rh && ra && rh.rank && ra.rank) out.classement = [f.classement(h, rh, a, ra)];
    if (Array.isArray(x.h2h)) {
      var vh = 0, va = 0, nul = 0, t = 0, nh = norm(h);
      x.h2h.slice(0, 5).forEach(function (r) {
        var sc = String(r.s || "").split("-").map(Number);
        if (sc.length !== 2 || isNaN(sc[0]) || isNaN(sc[1])) return;
        t++;
        if (sc[0] === sc[1]) return nul++;
        var gagnant = sc[0] > sc[1] ? r.home : r.away;
        if (norm(gagnant) === nh) vh++; else va++;
      });
      if (t) {
        var dr = x.h2h[0];
        out.h2h = [f.h2h(h, vh, a, va, nul, t)].concat(dr && dr.s ? [f.h2hDernier(dr.home + " " + dr.s + " " + dr.away, moisAn(dr.d))] : []);
      } else if (d) out.h2h = [f.h2hRien];
    }
    if (d && Array.isArray(d.injuries)) {
      var par = function (tid, e) {
        var l = d.injuries.filter(function (i) { return i && i.team === tid; });
        return l.length ? f.absentsEq(e, l.length, l.slice(0, 3).map(function (i) { return i.name; }).join(", ") + (l.length > 3 ? "…" : "")) : null;
      };
      var parts = [par(hid, h), par(aid, a)].filter(Boolean);
      out.absents = [parts.length ? f.absents(parts) : f.absentsRien];
    } else if (m.injuries_count === 0) out.absents = [f.absentsRien];
    var c1 = Number(x.c1), cn = Number(x.cn), c2 = Number(x.c2);
    if (c1 > 1 && c2 > 1 && cn > 1) {
      out.cotes = [Math.abs(c1 - c2) < 0.3 ? f.cotesSerre(h, cote(c1), a, cote(c2), cote(cn))
        : c1 < c2 ? f.cotes(h, cote(c1), cote(cn), a, cote(c2)) : f.cotes(a, cote(c2), cote(cn), h, cote(c1))];
    }
    var td = x.tendances;
    if (td && td.over25_home_n && td.over25_away_n) {
      out.buts = [f.buts(h, td.over25_home, td.over25_home_n, a, td.over25_away, td.over25_away_n)];
      if (td.btts_home_n && td.btts_away_n) out.buts.push(f.btts(h, td.btts_home, td.btts_home_n, a, td.btts_away, td.btts_away_n));
      if (Number(x.co25) > 1) out.buts.push(f.butsCote(cote(x.co25)));
    }
    if (d) {
      var bs = [[d.hot_scorer_home, h], [d.hot_scorer_away, a]].filter(function (b) { return b[0] && b[0].name && b[0].count >= 2; })
        .map(function (b) { return f.buteurEq(b[0].name, b[0].count, b[1]); });
      out.buteur = [bs.length ? f.buteur(bs) : f.buteurRien];
      out.compo = [d.lineups ? f.compoSortie : f.compo];
      if (d.arbitre && d.arbitre.nom) out.arbitre = [f.arbitre(d.arbitre.nom)];
    }
    var sd = x.stade;
    if (sd && sd.temp && !passe(m)) out.meteo = [f.meteo(String(sd.temp).replace(/C$/, " °C"), langue(S.dir) === "fr" ? sd.desc : "")];
    var ordre = ["heure", "forme", "classement", "h2h", "absents", "cotes"];
    if (focus === "qui") ordre = ["heure", "cotes", "forme", "classement", "h2h"];
    else if (focus && focus !== "infos" && out[focus]) ordre = focus === "heure" ? ["heure"] : ["heure", focus];
    else if (focus && focus !== "infos" && !out[focus]) ordre = ["heure", "forme", "cotes"];
    var lignes = [];
    ordre.forEach(function (k) { if (out[k]) lignes.push(out[k].join(" ")); });
    return lignes;
  }
  // La fiche complete : intro, phrases, carte du match, puis le pari (offert ou Pro) et les boutons.
  function fiche(m, d, focus) {
    var L = S.L, f = F(), off = S.offert && String(S.offert.id) === String(m.id);
    // Question de suite sur le meme match (« et les blesses ? ») : la reponse seule, sans tout repeter.
    var deSuite = d && focus && focus !== "infos" && S.dernier && String(S.dernier.id) === String(m.id);
    S.dernier = m;
    if (deSuite) {
      var lignes = phrases(m, d, focus);
      if (focus !== "heure" && lignes.length > 1) lignes = lignes.slice(1);
      var vo = { href: lienMatch(m), l: L.b_voirMatch, track: "assistant_match", plein: S.profil === "pro" || (off && S.profil === "membre") };
      if (off && S.profil === "membre") vo.l = L.b_monPari;
      var bt = [vo];
      if (S.profil !== "pro" && !passe(m)) bt = off ? (S.profil === "visiteur" ? [B.compte(), vo] : bt) : bt.concat([B.pro(), B.proOffert()]);
      var plus = focus === "qui" && S.profil !== "pro" && !off && !passe(m) ? [f.quiPari2] : [];
      return bulles(lignes.concat(plus, [auHasard(f.fin)])).concat([boutons(bt)]);
    }
    var ajd = /\s(ce soir|aujourd hui|ajd|auj|tonight|today|esta noche|hoy|hoje|esta noite|hj)\s/.test(" " + norm(S.texte || "") + " ");
    var memeJour = new Date(quand(m)).toDateString() === new Date().toDateString();
    var out = bulles((ajd && !memeJour && !passe(m) ? [f.pasAuj(jour(m))] : d ? [auHasard(f.intro)] : [f.lent]).concat(phrases(m, d, focus)));
    out.push(carte(m, off ? L.offertTitre : (m.league || ""), !off && S.profil !== "pro"));
    var voir = { href: lienMatch(m), l: L.b_voirMatch, track: "assistant_match" };
    if (passe(m)) return out.concat(bulles([L.estFini]), [boutons([voir, B.offert()])]);
    if (S.profil === "pro") { voir.plein = true; return out.concat(bulles([L.estProAbonne]), [boutons([voir])]); }
    if (off) {
      if (S.profil === "membre") { voir.plein = true; voir.l = L.b_monPari; return out.concat(bulles([L.estOffertMembre]), [boutons([voir])]); }
      return out.concat(bulles([L.estOffert]), [boutons([B.compte(), voir])]);
    }
    var btns = [voir, B.pro(), B.proOffert()];
    if (S.profil === "visiteur") btns.push(B.offert());
    return out.concat(bulles(focus === "qui" ? [f.quiPari2] : L.estPro(MINI[S.dir] || "")), [boutons(btns)]);
  }
  // Attente du detail : « en train d'ecrire » pendant le chargement, puis la fiche.
  function repFiche(m, focus) {
    return [{ t: "attente", p: detail(m).then(function (d) { return avecQuestion(fiche(m, d, focus), "match"); }) }];
  }
  // Plusieurs matchs : un bouton par match pour choisir, sans tout afficher.
  function choisirMatch(liste) {
    return boutons(liste.map(function (m) { return { as: "m:" + m.id, l: nom(m.home) + " - " + nom(m.away) }; }));
  }
  function quelMatch(entete) {
    var liste = aVenir(S.matchs);
    if (S.offert) liste = [S.offert].concat(liste.filter(function (m) { return String(m.id) !== String(S.offert.id); }));
    liste = liste.slice(0, 6);
    if (!liste.length) return bulles([S.L.bientot]).concat([boutons([B.tg()])]);
    return bulles(entete || F().quelMatch).concat([choisirMatch(liste)]);
  }
  function parId(id) { return (S.matchs || []).filter(function (m) { return String(m.id) === String(id); })[0] || null; }

  // ---------------------------------------------------------------- reponses
  function repGratuit() {
    var L = S.L, m = S.offert;
    if (!m) return bulles(L.gratuit("")).concat([boutons([B.tg()])]);
    if (S.profil !== "visiteur") return bulles([L.gratuitMembre]).concat([carte(m, L.offertTitre), boutons([{ href: lienMatch(m), l: L.b_monPari, track: "assistant_match", plein: true }])]);
    return bulles(L.gratuit(nom(m.home) + " - " + nom(m.away))).concat([carte(m, L.offertTitre), boutons([B.compte(), { href: lienMatch(m), l: L.b_voirMatch, track: "assistant_match" }])]);
  }
  function prochains(n) {
    var L = S.L, liste = aVenir(S.matchs).slice(0, n), out = [];
    if (!liste.length) return bulles([L.bientot]).concat([boutons([B.tg()])]);
    liste.forEach(function (m) {
      var off = S.offert && String(S.offert.id) === String(m.id);
      out.push(carte(m, off ? L.offertTitre : m.league || "", false));
    });
    return out;
  }
  function repMatchs(trouves) {
    var L = S.L, out = bulles([trouves.length > 1 ? L.trouvePlus : L.trouve1]);
    trouves.forEach(function (m) {
      var off = S.offert && String(S.offert.id) === String(m.id);
      out.push(carte(m, off ? L.offertTitre : (m.league || ""), !off && S.profil !== "pro"));
    });
    var m = trouves[0], off = S.offert && String(S.offert.id) === String(m.id);
    var voir = { href: lienMatch(m), l: L.b_voirMatch, track: "assistant_match" };
    if (trouves.length === 1 && passe(m)) return out.concat(bulles([L.estFini]), [boutons([voir, B.offert()])]);
    if (S.profil === "pro") { voir.plein = trouves.length === 1; return out.concat(bulles([L.estProAbonne]), trouves.length === 1 ? [boutons([voir])] : []); }
    if (trouves.length === 1 && off) {
      if (S.profil === "membre") { voir.plein = true; voir.l = L.b_monPari; return out.concat(bulles([L.estOffertMembre]), [boutons([voir])]); }
      return out.concat(bulles([L.estOffert]), [boutons([B.compte(), voir])]);
    }
    // Match payant : jamais le pari ; la page du match, puis les deux facons d'avoir le Pro.
    var btns = trouves.length === 1 ? [voir] : [];
    btns.push(B.pro(), B.proOffert());
    if (S.profil === "visiteur") btns.push(B.offert());
    return out.concat(bulles(L.estPro(MINI[S.dir] || "")), [boutons(btns)]);
  }
  function repResultats() {
    var L = S.L, p = S.preuves;
    if (!p || !p.length) return bulles([L.resultatsVide]).concat([boutons([B.combines(), B.tg()])]);
    return bulles(L.resultats).concat([tableauResultats(ordreResultats(p).slice(0, 6))], bulles([L.resultatsFin]), [boutons(S.profil === "pro" ? [B.combines(true)] : B.vente().concat([B.combines()]))]);
  }
  function repSite(nomSite) {
    var L = S.L;
    memo("ias-as-site", nomSite || "aucun");
    if (nomSite === "Lolly Bet") return S.profil === "pro" ? bulles([L.siteLollyPro]) : bulles([L.siteLolly]).concat([boutons([B.proOffert(true)])]);
    var txt = nomSite === "aucun" ? L.siteAucun : L.siteAutre(nomSite === "autre" ? "" : nomSite);
    var out = bulles(txt);
    if (S.profil !== "pro") out = out.concat(bulles([L.bonusPlus]));
    return out.concat([boutons([B.lolly()].concat(S.profil === "pro" ? [] : [B.proOffert()], [{ as: "plusTard", l: L.b_plusTard }]))]);
  }
  function questionSite() {
    var L = S.L, sites = (SITES[S.dir] || SITES.en).concat(["Lolly Bet"]);
    var btns = sites.map(function (s) { return { as: "site:" + s, l: s, track: "assistant_site_" + slug(s) }; });
    btns.push({ as: "site:autre", l: L.b_autre, track: "assistant_site_autre" }, { as: "site:aucun", l: L.b_aucun, track: "assistant_site_aucun" });
    return bulles([L.question]).concat([boutons(btns)]);
  }
  function reponse(cle) {
    var L = S.L, p = prixDe(S.dir);
    if (cle.indexOf("site:") === 0) return repSite(cle.slice(5));
    switch (cle) {
      case "pg": return repPg();
      case "hesite": return repPg(true);
      case "hPrix": return bulles(F().hPrix).concat([boutons(S.profil === "pro" ? [B.lolly()] : [B.proOffert(true), B.lolly(), { href: lien("abonnement.html"), l: L.b_prix, track: "assistant_prix" }])]);
      case "hConv": return bulles(F().hConv).concat(S.preuves && S.preuves.length ? [tableauResultats(ordreResultats(S.preuves).slice(0, 6))] : [], bulles([F().hConvFin]), [boutons(B.vente().concat([B.offert()]))]);
      case "reflechis": case "hTard": return bulles(F().hTard).concat([boutons(S.profil === "pro" ? [B.combines(true)] : [B.proOffert(), B.tg()])]);
      case "justeGratuit": case "hSuffit": S.refus = true; return bulles(F().hSuffit).concat([boutons([B.offert(), Object.assign(B.tg(), { plein: true })])]);
      case "perdu": S.sensible = false; S.pasDeVente = true; return bulles(F().perdu).concat([boutons([{ as: "resultats", l: L.c_resultats }, { as: "humain", l: x("bOui")[0], track: "assistant_humain_oui" }])]);
      case "dejaGagne": return bulles(F().dejaGagne).concat([boutons(S.profil === "visiteur" ? [B.compte(), B.offert()] : [B.offert(), B.pro(false)])]);
      case "confiance": return bulles(F().confiance).concat([boutons([{ as: "resultats", l: L.c_resultats }, B.offert()])]);
      case "pasBook": S.pasLolly = true; return bulles(F().pasBook).concat([boutons(S.profil === "pro" ? [B.combines(true)] : [B.pro(), B.offert()])]);
      case "humain": return demanderHumain();
      case "bonjour": return S.salue ? quelMatch(F().cava.slice(1)) : (S.salue = true, accueilItems());
      case "cava": return quelMatch(F().cava);
      case "gratuit": return repGratuit();
      case "chercher": return bulles(L.chercher).concat(prochains(5));
      case "resultats": return repResultats();
      case "prix":
        if (S.profil === "pro") return bulles([L.estProAbonne]).concat([boutons([B.combines(true), { href: lien("compte.html"), l: L.b_compteMoi, track: "assistant_compte" }])]);
        return bulles(L.pro(p).concat([L.proOuOffert])).concat([boutons([B.pro(), B.proOffert()].concat(p ? [] : [{ href: lien("abonnement.html"), l: L.b_prix, track: "assistant_prix" }], [{ as: "hesite", l: F().b_hesite, track: "assistant_hesite" }]))]);
      case "proOffert":
        if (S.profil === "pro") return bulles([L.proOffertDejaPro]).concat([boutons([B.lolly()])]);
        return bulles(L.proOffert).concat([boutons([B.proOffert(true), B.lolly()])]);
      case "bonus": return bulles(L.bonus.concat(S.profil === "pro" ? [] : [L.bonusPlus])).concat([boutons([B.lolly()].concat(S.profil === "pro" ? [] : [B.proOffert()]))]);
      case "site": return questionSite();
      case "plusTard": return bulles([L.plusTard]).concat([boutons(B.menu())]);
      case "resilier": return bulles(L.resilier).concat([boutons([{ href: lien("compte.html#abonnement"), l: L.b_compteMoi, track: "assistant_compte", plein: true }, B.contact()])]);
      case "paiement": return bulles(L.paiement).concat([boutons([{ href: lien("compte.html#abonnement"), l: L.b_compteMoi, track: "assistant_compte" }, B.contact()])]);
      case "compte": return bulles(L.compte).concat([boutons(S.profil === "visiteur" ? [B.compte(), { href: lien("compte.html"), l: L.b_compteMoi, track: "assistant_compte" }] : [{ href: lien("compte.html"), l: L.b_compteMoi, track: "assistant_compte", plein: true }])]);
      case "sur": return S.profil === "pro" ? bulles(L.surPro).concat([boutons([B.combines(true)])]) : bulles(L.sur).concat([boutons(B.vente().concat(S.profil === "visiteur" ? [] : [B.offert()]))]);
      case "combines": return bulles(L.combines).concat([boutons([B.combines(true)].concat(B.vente().slice(0, 1)))]);
      case "buteur": return bulles(L.buteur).concat([boutons([B.combines(true), B.offert()])]);
      case "methode": return bulles(L.methode).concat([boutons([{ href: lien("methodologie.html"), l: L.b_methode, track: "assistant_methode" }, B.offert()])]);
      case "telegram": return bulles(L.telegram).concat([boutons([Object.assign(B.tg(), { plein: true }), B.contact()])]);
      case "whatsapp": return bulles([L.whatsapp]).concat([boutons([Object.assign(B.tg(), { plein: true })])]);
      case "live": return bulles(L.live).concat([boutons([{ as: "chercher", l: L.c_chercher }])]);
      case "insulte": return bulles(L.insulte).concat([boutons(B.menu())]);
      case "mineur": return bulles(L.mineur);
      case "aide": return bulles(L.aide).concat([boutons([{ href: L.aideUrl, l: L.b_aide, track: "assistant_aide" }])]);
      case "t_btts": case "t_over": case "t_dc": case "t_un": case "t_handicap": case "t_cote":
        return bulles([L.termes[cle.slice(2)]]).concat([boutons([B.offert(), { as: "chercher", l: L.c_chercher }])]);
    }
    return repPlus(cle);
  }
  // Reponses ajoutees le 19/11 (textes dans X, 4 langues). Les boutons de vente s'adaptent au profil :
  // pas de compte propose a un inscrit, pas de Pro propose a un Pro.
  function repPlus(cle) {
    var L = S.L, vis = S.profil === "visiteur", pro = S.profil === "pro";
    var equipe = function () { return [Object.assign(B.contact(), { plein: true }), { href: "mailto:" + MAIL, l: MAIL, track: "assistant_email" }]; };
    var moiCompte = function (plein) { return { href: lien("compte.html"), l: L.b_compteMoi, track: "assistant_compte", plein: !!plein }; };
    var meth = { href: lien("methodologie.html"), l: L.b_methode, track: "assistant_methode" };
    var res = { as: "resultats", l: L.c_resultats }, cherch = { as: "chercher", l: L.c_chercher };
    var entree = vis ? B.compte() : pro ? B.combines(true) : B.offert();
    var T2 = {
      quoi: [entree, meth],
      sansCompte: [Object.assign(B.tg(), { plein: true }), res, B.compte()],
      gratuitCarte: vis ? [B.compte()] : [B.offert()],
      robot: [B.offert(), B.contact()],
      hack: [moiCompte(), B.contact()],
      double: equipe(), rembours: equipe(), facture: equipe(), supprimer: equipe(), business: equipe(),
      lollyDeja: equipe(), lollyValid: equipe(),
      payeSansAcces: [moiCompte(true), B.contact()],
      codeRecu: [moiCompte(true), B.contact()],
      bug: [B.contact()],
      appli: [Object.assign(B.tg(), { plein: true }), B.offert()],
      reduction: pro ? [B.lolly()] : [B.proOffert(true), B.pro(false)],
      cher: pro ? [B.lolly()] : [B.proOffert(true), B.offert(), B.tg()],
      payerApres: [B.offert(), B.pro(false)],
      unSeulPari: [B.pro(), B.offert()],
      duree: [B.pro()],
      pourquoiVendre: [res, B.offert()],
      telegramPro: [Object.assign(B.tg(), { plein: true }), B.pro(false)],
      pasTelegram: [{ href: "mailto:" + MAIL, l: MAIL, track: "assistant_email" }, entree],
      lollyRetrait: [B.contact()],
      lollyCond: [B.lolly(), B.contact()],
      affiliation: [B.lolly()],
      obligeLolly: [B.lolly()].concat(pro ? [] : [B.proOffert()]),
      langue: [["fr", "Français"], ["en", "English"], ["es", "Español"], ["pt", "Português"]].map(function (v) { return { href: "/" + v[0] + "/#assistant", l: v[1], track: "assistant_langue_" + v[0] }; }),
      pays: [{ href: lien("abonnement.html"), l: L.b_prix, track: "assistant_prix" }, entree],
      mise: [B.offert()],
      vivre: [res, B.offert()],
      truque: [meth, res],
      combinesPerso: [B.combines(true), B.pro(false)],
      stats: [cherch],
      championnats: [cherch, B.pro(false)],
      publication: [Object.assign(B.tg(), { plein: true }), B.offert()],
      sport: [B.offert(), B.tg()],
      casino: [B.offert()],
      club: [cherch],
      rire: [B.offert(), res],
      vite: [Object.assign(B.offert(), { plein: true }), B.pro(false)],
      t_corners: [B.offert(), cherch], t_dnb: [B.offert(), cherch], t_regles: [B.offert(), cherch]
    };
    if (cle === "pourquoiVendre2") cle = "pourquoiVendre";
    if (cle === "fin" || cle === "merci") {
      if (S.humainPropose) return bulles(cle === "merci" ? L.merci : x("nonMerci")).concat([boutons(B.menu())]);
      return proposerHumain([]);
    }
    if (cle === "nonMerci") return bulles(x("nonMerci")).concat([boutons(B.menu())]);
    if (!X[cle] || !T2[cle]) return null;
    if (pro && /^(reduction|cher|payerApres|unSeulPari|duree|pourquoiVendre)$/.test(cle)) return bulles([L.estProAbonne]).concat([boutons([B.combines(true), moiCompte()])]);
    return bulles(x(cle)).concat([boutons(T2[cle])]);
  }
  // En fin de conversation, une seule fois : « tu veux parler a quelqu'un de l'equipe ? ».
  function proposerHumain(avant) {
    S.humainPropose = true;
    S.attente = { oui: "humain", non: "nonMerci" };
    return bulles((avant || []).concat(x("qHumain"))).concat([boutons([{ as: "humain", l: x("bOui")[0], track: "assistant_humain_oui", plein: true }, { as: "nonMerci", l: x("bNon")[0], track: "assistant_humain_non" }])]);
  }
  // Apres la premiere vraie reponse, une seule fois par navigateur : « tu paries sur quel site ? ».
  // Jamais apres un sujet sensible ni au milieu de la question elle-meme.
  function avecQuestion(items, cle) {
    S.echanges++;
    if (/^(mineur|aide)$/.test(cle || "")) S.sensible = true;
    if (S.sensible || S.refus || S.pasDeVente || /^(perdu|pg|hesite|hPrix|hConv|hTard|hSuffit|reflechis|justeGratuit|pasBook|insulte|site|plusTard|resilier|paiement|humain|fin|merci|nonMerci|hack|double|payeSansAcces|rembours|facture|codeRecu|supprimer|bug|business|langue)/.test(cle || "")) return items;
    if (!S.questionPosee && !S.pasLolly && !memo("ias-as-site")) { S.questionPosee = true; return items.concat(questionSite()); }
    // Apres quelques echanges, une seule fois : proposer l'equipe.
    if (S.echanges >= 6 && !S.humainPropose && !S.direct && cle !== "match") return items.concat(proposerHumain());
    return items;
  }
  // Le message du visiteur s'affiche apres la reponse en cours, jamais au milieu.
  // Des que la personne repond, les anciens boutons disparaissent (ceux affiches et ceux en attente).
  function moi(texte) {
    Array.prototype.forEach.call(fil.querySelectorAll(".as-btns"), function (b) { b.remove(); });
    file = file.filter(function (it) { return !(it.t === "html" && it.html.indexOf('class="as-btns"') !== -1); });
    noter("visiteur", texte);
    var h = '<div class="as-b as-b--moi">' + esc(texte) + "</div>";
    if (enCours) file.push({ t: "html", html: h }); else ajouter(h);
  }
  // « Qu'est-ce qui te retient de passer Pro ? » (idee de Clement du 20/11 « pourquoi tu restes en gratuit ? »,
  // forme revue avec ChatGPT). Inscrit gratuit : depuis la bulle bleue de la page match ou le bouton « J'hesite ».
  function repPg(direct) {
    var f = F();
    if (S.profil === "pro") return bulles([S.L.estProAbonne]).concat([boutons([B.combines(true)])]);
    return bulles(direct ? f.pg.slice(1) : f.pg).concat([boutons([
      { as: "hPrix", l: f.b_lePrix, track: "assistant_retient_prix" },
      { as: "hConv", l: f.b_pasConvaincu, track: "assistant_retient_convaincu" },
      { as: "hTard", l: f.b_pasMaintenant, track: "assistant_retient_tard" },
      { as: "hSuffit", l: f.b_suffit, track: "assistant_retient_gratuit" }])]);
  }

  // ---------------------------------------------------------------- conversations gardees + reprise en direct (20/11)
  // Tout ce qui est dit est envoye a la base (chat_ecrire) pour que Clement lise les conversations dans l'admin.
  // « Parler a quelqu'un » : alerte sur son telephone (chat_humain) ; ses reponses arrivent ici (chat_lire).
  // Sans reponse en 5 minutes, la base passe la conversation en « occupe » : mail et Telegram proposes.
  function hasard() {
    var c = G.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    var b = new Uint8Array(16); if (c && c.getRandomValues) c.getRandomValues(b); else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (v) { return (v + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function conv() {
    if (!S.conv) {
      try { var v = JSON.parse(G.localStorage.getItem("ias-as-conv") || "null"); if (v && v.id && v.cle && Date.now() - v.at < 864e5) S.conv = v; } catch (e) {}
      if (!S.conv) S.conv = { id: hasard(), cle: hasard() + hasard(), at: Date.now(), vu: 0 };
    }
    S.conv.at = Date.now();
    try { G.localStorage.setItem("ias-as-conv", JSON.stringify(S.conv)); } catch (e) {}
    return S.conv;
  }
  function appel(fn, corps) {
    return G.fetch(SUPA + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPA_CLE, Authorization: "Bearer " + (jeton() || SUPA_CLE) },
      body: JSON.stringify(corps)
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function base() { var c = conv(); return { p_conv: c.id, p_cle: c.cle, p_profil: S.profil || "visiteur", p_langue: S.dir, p_page: G.location.pathname.slice(0, 200) }; }
  var journal = [], journalT = null;
  function noter(auteur, texte) {
    if (!texte) return;
    journal.push({ a: auteur, t: String(texte).slice(0, 1000) });
    G.clearTimeout(journalT);
    journalT = G.setTimeout(envoyerJournal, auteur === "visiteur" && S.direct === "humain" ? 50 : 1500);
  }
  function envoyerJournal() {
    G.clearTimeout(journalT);
    if (!journal.length) return Promise.resolve();
    var lot = journal.splice(0, 30), b = base(); b.p_messages = lot;
    return appel("chat_ecrire", b).then(function () { if (journal.length) return envoyerJournal(); });
  }
  function demanderHumain() {
    S.humainPropose = true;
    if (S.direct === "humain") return [];
    S.direct = "attente";
    envoyerJournal().then(function () { return appel("chat_humain", base()); }).then(function (r) {
      if (r && r.ok) return ecouter(4000);
      // La base ne repond pas : l'ancien chemin (Telegram et mail).
      S.direct = null;
      dire(bulles(S.L.humain).concat([boutons([Object.assign(B.contact(), { plein: true }), { href: "mailto:" + MAIL, l: MAIL, track: "assistant_email" }])]));
    });
    return bulles(F().humainAttente);
  }
  // Ecoute les reponses de l'equipe : toutes les 4 s en attente ou en direct, puis toutes les 20 s une
  // demi-heure apres « occupe » (Clement peut encore repondre).
  function ecouter(ms) {
    G.clearTimeout(S.ecoute);
    S.ecouteMs = ms;
    var tour = function () {
      if (G.document.hidden) { S.ecoute = G.setTimeout(tour, S.ecouteMs); return; }
      var c = conv();
      appel("chat_lire", { p_conv: c.id, p_cle: c.cle, p_apres: c.vu || 0 }).then(function (r) {
        if (!r || !r.ok) { S.ecoute = G.setTimeout(tour, 15000); return; }
        var msgs = r.messages || [];
        if (msgs.length) {
          if (S.direct !== "humain") { S.direct = "humain"; enDirect(true); dire([{ t: "html", html: '<div class="as-sys">' + esc(F().humainArrive) + "</div>" }]); }
          msgs.forEach(function (m) { c.vu = Math.max(c.vu || 0, m.id); });
          conv();
          dire(msgs.map(function (m) { return { t: "html", html: '<div class="as-b as-b--equipe"><span>' + esc(F().equipe) + "</span>" + esc(m.t) + "</div>" }; }));
          if (!S.ouvert) pointChat();
        }
        if (r.etat === "occupe" && S.direct === "attente") {
          S.direct = "occupe";
          dire(bulles(F().occupe).concat([boutons([{ href: "mailto:" + MAIL, l: MAIL, track: "assistant_email", plein: true }, B.contact()])]));
          S.finEcoute = Date.now() + 18e5;
          S.ecouteMs = 20000;
        }
        if (r.etat === "robot" && (S.direct === "humain" || S.direct === "attente")) { S.direct = null; enDirect(false); return; }
        if (S.direct === "occupe" && Date.now() > (S.finEcoute || 0)) return;
        if (!S.direct) return;
        S.ecoute = G.setTimeout(tour, S.ecouteMs);
      });
    };
    S.ecoute = G.setTimeout(tour, ms);
  }
  function enDirect(oui) {
    if (!el) return;
    var s = el.querySelector(".as-s");
    if (s) s.innerHTML = '<i aria-hidden="true"></i>' + esc(oui ? F().equipe : S.L.sous);
  }
  function pointChat() {
    var a = G.document.querySelector('.site-bottom-nav a[href="#assistant"]');
    if (a && !a.querySelector(".site-bottom-nav__point")) { var p = G.document.createElement("span"); p.className = "site-bottom-nav__point"; p.setAttribute("aria-hidden", "true"); a.insertBefore(p, a.firstChild); }
  }
  // Une seule relance par visite : rien touche 45 s apres l'ouverture.
  function relancer() {
    try { if (G.sessionStorage.getItem("ias-as-relance")) return; } catch (e) {}
    G.setTimeout(function () {
      if (!S.ouvert || S.echanges || S.clics || S.direct || S.profil === "pro") return;
      try { G.sessionStorage.setItem("ias-as-relance", "1"); } catch (e) {}
      dire(bulles([F().relance]).concat([boutons([{ as: "gratuit", l: S.L.c_gratuit }, { as: "resultats", l: S.L.c_resultats }])]));
    }, 45000);
  }

  // « oui » / « non » tout seuls : reponse a la derniere question posee par l'assistant.
  var OUI = /^\s*(oui|ouais|ouai|ui|yes|yeah|yep|yup|si|sim|vas y|go|volontiers|carrement|grave|bien sur|avec plaisir|of course|sure|claro|dale|venga|bora|pode ser|por favor|please|stp|svp)\s*$/;
  var NON = /^\s*(non|nan|no|nope|nah|nao|pas maintenant|plus tard|later|luego|depois|pas besoin|no need)\s*$/;
  // Mots qui ressemblent a une equipe, pour dire « je ne trouve pas X » plutot que « je n'ai pas compris ».
  function motEquipe(texte) {
    var mots = norm(texte).split(" ").filter(function (w) { return w.length >= 4 && !VIDES[w]; });
    if (!mots.length || mots.length > 3) return "";
    return mots.length === 1 || /\s(match|matchs|contre|vs|versus|ce soir|demain|aujourd hui|tonight|today|tomorrow|game|partido|jogo|hoy|hoje|manana|amanha)\s/.test(" " + norm(texte) + " ") ? mots.join(" ") : "";
  }
  function question(texte) {
    moi(texte);
    if (S.direct === "humain") return;
    var t = norm(texte), attente = S.attente; S.attente = null; S.texte = texte;
    if (attente && OUI.test(t)) { S.rates = 0; return dire(avecQuestion(reponse(attente.oui) || [], attente.oui)); }
    if (attente && NON.test(t)) { S.rates = 0; return dire(reponse(attente.non || "nonMerci") || []); }
    if (OUI.test(t)) return dire(quelMatch(F().ouiQuoi));
    var cle = intention(texte), focus = focusDe(texte), trouves = [];
    // Une equipe nommee passe avant les mots generaux (« PSG gagne ce soir ? ») ;
    // les sujets sensibles et l'argent restent prioritaires.
    if (!/^(mineur|aide|hack|club|robot|humain|double|payeSansAcces|rembours|resilier|facture|codeRecu|supprimer|bug|lolly\w*|affiliation|obligeLolly|paiement|compte|langue|pays|business|casino|sport)$/.test(cle || "")) trouves = cherche(texte, S.matchs);
    if (trouves.length === 1) { S.rates = 0; return dire(repFiche(trouves[0], focus)); }
    if (trouves.length > 1) { S.rates = 0; S.focus = focus; return dire(bulles([S.L.trouvePlus]).concat([choisirMatch(trouves)])); }
    // Question sur un match sans equipe nommee : le dernier match dont on a parle, sinon « lequel ? ».
    var surMatch = focus && (!cle || /^(stats|buteur|live|sur|t_\w+|cher|combines|methode|publication)$/.test(cle));
    if (surMatch && !(cle === "sur" && !S.dernier) && !(cle === "combines" && !S.dernier)) {
      S.rates = 0;
      if (S.dernier) return dire(repFiche(S.dernier, focus));
      S.focus = focus;
      return dire(quelMatch());
    }
    var r = cle ? reponse(cle) : null;
    if (r) { S.rates = 0; return dire(avecQuestion(r, cle)); }
    S.rates++;
    if (S.rates >= 3) { S.rates = 0; return dire(bulles(S.L.incompris2).concat([boutons([Object.assign(B.contact(), { plein: true }), B.tg()])])); }
    var mot = motEquipe(texte);
    if (mot) return dire(quelMatch(F().pasVu(texte.trim().slice(0, 40))));
    dire(bulles(S.L.incompris1).concat([boutons(B.menu())]));
  }
  function choix(cle, libelle) {
    moi(libelle);
    S.clics = (S.clics || 0) + 1;
    S.attente = null; S.texte = "";
    if (cle.indexOf("m:") === 0) {
      var m = parId(cle.slice(2)), f = S.focus; S.focus = null;
      if (m) return dire(repFiche(m, f));
    }
    dire(avecQuestion(reponse(cle) || [], cle));
  }

  // ---------------------------------------------------------------- chargement
  function charger(src) {
    return new Promise(function (ok) {
      var D = G.document;
      if (D.querySelector('script[src="' + src + '"]')) return ok();
      var s = D.createElement("script"); s.src = src; s.onload = ok; s.onerror = ok; D.head.appendChild(s);
    });
  }
  function json(url) { return G.fetch(url, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function donnees() {
    var p1 = (G.IasharkMatchTime ? Promise.resolve() : charger("/lib/match-time.js"))
      .then(function () { return G.IasharkFreeMatch ? null : charger("/lib/free-match.js"); });
    var p2 = json("/data-home.json");
    var p3 = G.IasharkApp && typeof G.IasharkApp.context === "function"
      ? G.IasharkApp.context().then(function (c) { return c && c.isPro ? "pro" : c && c.session ? "membre" : "visiteur"; }).catch(function () { return "visiteur"; }) : Promise.resolve("visiteur");
    var p4 = json("/preuves/bandeau.json");
    var p5 = G.IasharkMarketLabels ? Promise.resolve() : charger("/lib/market-labels.js");
    return Promise.all([p1, p2, p3, p4, p5]).then(function (r) {
      var j = r[1], b = r[3];
      S.matchs = j && Array.isArray(j.matchs) ? j.matchs.filter(function (m) { return m && m.id && m.home && m.away; }) : [];
      S.profil = r[2];
      S.preuves = b && b.simples && Array.isArray(b.simples.items) ? b.simples.items.filter(function (s) { return s && s.h && s.a && s.r; }) : [];
      try { S.offert = G.IasharkFreeMatch && G.IasharkFreeMatch.offertDuJour ? G.IasharkFreeMatch.offertDuJour(S.matchs, null, marche(S.dir)) : null; } catch (e) { S.offert = null; }
    });
  }
  function accueilItems() {
    var L = S.L, m = S.offert, out;
    if (S.profil === "pro") return bulles(L.bjPro).concat([boutons(B.menu())]);
    if (S.profil === "membre") {
      out = m ? bulles(L.bjMembre).concat([carte(m, L.offertTitre), boutons([{ href: lienMatch(m), l: L.b_monPari, track: "assistant_match", plein: true }])]) : bulles([L.bjPro[1]]);
      return out.concat([boutons(B.menu())]);
    }
    out = m ? bulles(L.bjVisiteur).concat([carte(m, L.offertTitre), boutons([B.compte()])]) : bulles([L.bjVisiteur[0]]);
    return out.concat([boutons(B.menu())]);
  }

  // Clavier du telephone : la fenetre prend exactement la zone visible (au-dessus du clavier) et la page
  // derriere reste a sa place. Sans cela, iPhone fait glisser toute la page et la fenetre « grandit ».
  var metaAvant = null;
  function caler() {
    if (!el || el.hidden) return;
    var vv = G.visualViewport;
    if (vv) { el.style.height = Math.round(vv.height) + "px"; el.style.top = Math.round(vv.offsetTop) + "px"; }
    if (G.scrollY && !vv) G.scrollTo(0, 0);
    bas();
  }
  function viewport(ouvert) {
    var m = G.document.querySelector('meta[name="viewport"]');
    if (!m) return;
    if (ouvert) { if (metaAvant == null) metaAvant = m.getAttribute("content") || ""; m.setAttribute("content", "width=device-width,initial-scale=1,maximum-scale=1,interactive-widget=resizes-content"); }
    else if (metaAvant != null) { m.setAttribute("content", metaAvant); metaAvant = null; }
  }
  function ouvrir() {
    construire();
    if (S.ouvert) return;
    S.ouvert = true;
    el.hidden = false;
    G.document.documentElement.classList.add("ias-as-ouvert");
    viewport(true); caler();
    memo("ias-assistant-vu", "1");
    var pt = G.document.querySelector(".site-bottom-nav__point"); if (pt) pt.remove();
    if (G.location.hash !== "#assistant") { try { G.history.pushState({ ias: "assistant" }, "", "#assistant"); } catch (e) {} }
    var go = function () {
      S.salue = true;
      var entree = G.__iasAsEntree; G.__iasAsEntree = null;
      dire(entree === "gratuit" && S.profil === "membre" ? repPg() : accueilItems());
      relancer();
      // Conversation en direct deja commencee (page rechargee) : on reecoute.
      try {
        var v = JSON.parse(G.localStorage.getItem("ias-as-conv") || "null");
        if (v && v.id && v.cle && Date.now() - v.at < 36e5) appel("chat_lire", { p_conv: v.id, p_cle: v.cle, p_apres: v.vu || 0 }).then(function (r) {
          if (!r || !r.ok || (r.etat !== "attente" && r.etat !== "humain")) return;
          S.conv = v; S.direct = r.etat; if (r.etat === "humain") enDirect(true);
          ecouter(300);
        });
      } catch (e) {}
    };
    if (!S.pret) { S.pret = true; donnees().then(go, go); }
    G.setTimeout(function () { var i = el.querySelector("input"); if (i && G.matchMedia && G.matchMedia("(min-width:760px)").matches) i.focus(); }, 50);
  }
  function fermer() {
    if (!S.ouvert) return;
    S.ouvert = false;
    el.hidden = true;
    el.style.height = ""; el.style.top = "";
    G.document.documentElement.classList.remove("ias-as-ouvert");
    viewport(false);
    if (G.location.hash === "#assistant") {
      if (G.history.state && G.history.state.ias === "assistant") G.history.back();
      else { try { G.history.replaceState(null, "", G.location.pathname + G.location.search); } catch (e) {} }
    }
  }

  if (G && G.document && G.location) {
    S.dir = version(G.location.pathname);
    S.L = T[langue(S.dir)];
    G.addEventListener("hashchange", function () { if (G.location.hash === "#assistant") ouvrir(); else fermer(); });
    G.addEventListener("popstate", function () { if (G.location.hash !== "#assistant") fermer(); });
    var go = function () { if (G.location.hash === "#assistant") ouvrir(); };
    if (G.document.readyState === "loading") G.document.addEventListener("DOMContentLoaded", go); else go();
  }
  return { ouvrir: ouvrir, fermer: fermer, intention: intention, cherche: cherche, version: version, langue: langue, norm: norm, ordreResultats: ordreResultats, T: T, _test: { S: S, reponse: function (c) { return reponse(c); }, intentions: INTENTIONS } };
});
