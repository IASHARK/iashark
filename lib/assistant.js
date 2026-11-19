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
  // Ordre = priorite : sujets sensibles d'abord, puis argent/compte, puis le reste.
  // Chaque motif s'applique au texte normalise (minuscules, sans accents), entoure d'espaces.
  var INTENTIONS = [
    ["mineur", /\s(j ai|jai|g|i m|im|i am|tengo|tenho)\s?(1[0-7]|[0-9])\s?(ans|years|yo|anos)\s(?!(de|d|of|que|en|em|a|que) )|\smineur|\sunder 18|\spas majeur|\smenor de (edad|idade)/],
    ["aide", /recuperer mes pertes|me refaire|tout perdu|perdu tout|addict|accro|dette|endette|je n arrive plus a arreter|chase (my )?loss|lost everything|gambling problem|win it back|recuperar lo perdido|recuperar o que perdi|adiccion|vicio|deudas|dividas|ludopat/],
    ["resilier", /\s(resilier|resiliation|desabonn|desinscri|annuler (mon |l )?abonnement|arreter (le |mon )?(pro|abonnement)|rembours|cancel|refund|unsubscribe|cancelar|darme de baja|reembolso|anular (mi |la )?suscripcion)/],
    ["paiement", /\s(paiement|payer|paye|carte|cb|refuse|bloque|prelev|debit|mobile money|orange money|wave|paypal|apple pay|google pay|payment|card|declined|charge|pago|pagar|tarjeta|cartao|pagamento|rechazad|recusad)/],
    ["compte", /\s(connexion|connecter|connecte|mot de passe|mdp|identifiant|login|log in|password|sign in|m inscrire|inscription|creer (un |mon )?compte|sign up|account|mon compte|contrasena|senha|iniciar sesion|registrarme|registar|mi cuenta|minha conta)/],
    ["proOffert", /\s(pro gratuit|pro offert|mois offert|mois gratuit|essai|free pro|pro free|free trial|trial|free month|pro gratis|mes gratis|prueba gratis|mes gratuito|pro gratuito|teste gratis)\s/],
    ["bonus", /\s(bonus|bono|bonos|bonus lolly|freebet|free bet|apuesta gratis|aposta gratis|rembourse|cashback)\s/],
    ["prix", /\s(prix|combien|tarif|cher|abonnement|abonne|abonner|vip|premium|price|prices|cost|how much|subscribe|subscription|precio|precios|cuanto|cuesta|suscripcion|suscribirme|preco|precos|quanto|assinatura|assinar)\s|\spro\s|\sle pro|\scest quoi le pro/],
    ["humain", /\s(humain|un vrai|une vraie|parler a|conseiller|quelqu un|clement|contact|joindre|real person|human|agent|support|hablar con|una persona|falar com|uma pessoa|atendimento|soporte|suporte)/],
    ["whatsapp", /\swhats ?app/],
    ["telegram", /\s(telegram|canal|chaine|groupe|channel|group|grupo)\s/],
    ["site", /\s(ou parier|ou jouer|bookmaker|bookmakers|book|lolly|site de paris|quel site|1win|winamax|betclic|unibet|bet365|pmu|parions|where to bet|which bookmaker|which site|sportsbook|donde apostar|casa de apuestas|onde apostar|casa de apostas|betano|codere|caliente|draftkings|fanduel|sky bet|betway|hollywoodbets|betfair|william hill|paddy power|placard|sportium|stake)\s/],
    ["sur", /\s(sur a 100|100 ?%|sure|surs|ultra sur|safe|banker|certain|garanti|meilleur prono|meilleur pari|prono du jour|pari du jour|quoi jouer|que jouer|je joue quoi|best bet|tip of the day|sure bet|lock|prono|pronos|pronostic|pronostics|paris du jour|tips|tip|prediction|predictions|bet of the day|apuesta segura|aposta segura|pronostico|pronosticos|palpite|palpites|fija|fijo|seguro|segura)\s/],
    ["combines", /\s(combine|combines|combo|combos|accumulat|acca|parlay|ticket|tickets|multiple|multiples|multipla|multiplas|combinada|combinadas|selection en or)/],
    ["buteur", /\s(buteur|buteurs|scorer|scorers|goalscorer|qui marque|anytime|goleador|goleadores|marcador|marcadores|artilheiro|quien marca|quem marca)/],
    ["resultats", /\s(resultat|resultats|historique|bilan|fiable|fiables|arnaque|scam|legit|truque|fake|gagnes|perdus|win rate|taux|reussite|track record|results|winning|valide|resultados|confiable|estafa|golpe|historial|historico|acertos|aciertos)\s/],
    ["methode", /\s(comment (ca marche|vous faites|vous calculez|tu calcules)|methode|algorithme|algo|intelligence artificielle|simulation|simule|modele|calcul|how does it work|method|model|algorithm|como funciona|metodo|algoritmo|modelo)\s|\sia\s|\sthe ai\s|\syour ai\s/],
    ["gratuit", /\s(gratuit|gratuits|gratos|free|offert|offerts|cadeau|gratis|gratuito|gratuita)\s/],
    ["live", /\s(direct|live|en cours|score en direct|livescore|en vivo|directo|ao vivo)\s/],
    ["t_btts", /\s(btts|les deux equipes marquent|deux equipes marquent|both teams|ambos marcan|ambos equipos marcan|ambas marcam)/],
    ["t_over", /\s(over|under|plus de \d|moins de \d|mas de \d|menos de \d|mais de \d)/],
    ["t_dc", /\s(double chance|doble oportunidad|dupla hipotese|1x|x2)\s/],
    ["t_un", /\s(1n2|1x2|1 n 2|match nul|draw|empate)\s/],
    ["t_handicap", /\s(handicap|handicaps)/],
    ["t_cote", /\s(c est quoi une cote|une cote|la cote|les cotes|odds|cuota|cuotas|momio|momios|odd)\s/],
    ["merci", /\s(merci|thanks|thank you|top|parfait|super|nickel|cool|ok merci|gracias|obrigado|obrigada|valeu)\s/],
    ["insulte", /\s(connard|fdp|ntm|pute|encule|merde|arnaqueur|fuck|shit|idiot|puta|mierda|pendejo|caralho|porra)\s/],
    ["bonjour", /^\s*(bonjour|bonsoir|salut|slt|yo|hello|hi|hey|cc|coucou|wesh|salam|hola|buenas|buenos dias|ola|oi|bom dia|boa tarde)\s*$/]
  ];
  function intention(texte) {
    var t = norm(texte);
    for (var i = 0; i < INTENTIONS.length; i++) if (a(t, INTENTIONS[i][1])) return INTENTIONS[i][0];
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
    + "#ias-as{position:fixed;inset:0;z-index:1001;display:flex;flex-direction:column;background:#060b12;color:#f4f7fb;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}"
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
  }
  function bas() { var f = el.querySelector(".as-fil"); f.scrollTop = f.scrollHeight; }
  function ajouter(html) { var d = G.document.createElement("div"); d.innerHTML = html; while (d.firstChild) fil.appendChild(d.firstChild); bas(); }
  // File d'affichage : chaque bulle du robot arrive apres « en train d'ecrire ».
  function dire(items) { file = file.concat(items); if (!enCours) suite(); }
  function suite() {
    if (!file.length) { enCours = false; return; }
    enCours = true;
    var it = file.shift();
    if (it.t !== "bulle") { ajouter(it.html); return G.setTimeout(suite, 120); }
    var reduit = G.matchMedia && G.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ajouter('<div class="as-tape" aria-label="' + esc(S.L.ecrit) + '"><i></i><i></i><i></i></div>');
    G.setTimeout(function () {
      var t = fil.querySelector(".as-tape"); if (t) t.remove();
      ajouter('<div class="as-b as-b--bot">' + esc(it.texte) + "</div>");
      suite();
    }, reduit ? 150 : Math.min(1100, 380 + it.texte.length * 9));
  }
  function bulles(lignes) { return lignes.map(function (x) { return { t: "bulle", texte: x }; }); }
  function boutons(liste) {
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
      case "bonjour": return accueilItems();
      case "gratuit": return repGratuit();
      case "chercher": return bulles(L.chercher).concat(prochains(5));
      case "resultats": return repResultats();
      case "prix":
        if (S.profil === "pro") return bulles([L.estProAbonne]).concat([boutons([B.combines(true), { href: lien("compte.html"), l: L.b_compteMoi, track: "assistant_compte" }])]);
        return bulles(L.pro(p).concat([L.proOuOffert])).concat([boutons([B.pro(), B.proOffert()].concat(p ? [] : [{ href: lien("abonnement.html"), l: L.b_prix, track: "assistant_prix" }]))]);
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
      case "humain": return bulles(L.humain).concat([boutons([Object.assign(B.contact(), { plein: true }), { href: "mailto:" + MAIL, l: MAIL, track: "assistant_email" }])]);
      case "live": return bulles(L.live).concat([boutons([{ as: "chercher", l: L.c_chercher }])]);
      case "merci": return bulles(L.merci).concat([boutons(B.menu())]);
      case "insulte": return bulles(L.insulte).concat([boutons(B.menu())]);
      case "mineur": return bulles(L.mineur);
      case "aide": return bulles(L.aide).concat([boutons([{ href: L.aideUrl, l: L.b_aide, track: "assistant_aide" }])]);
      case "t_btts": case "t_over": case "t_dc": case "t_un": case "t_handicap": case "t_cote":
        return bulles([L.termes[cle.slice(2)]]).concat([boutons([B.offert(), { as: "chercher", l: L.c_chercher }])]);
    }
    return null;
  }
  // Apres la premiere vraie reponse, une seule fois par navigateur : « tu paries sur quel site ? ».
  // Jamais apres un sujet sensible ni au milieu de la question elle-meme.
  function avecQuestion(items, cle) {
    S.echanges++;
    if (S.questionPosee || memo("ias-as-site") || /^(mineur|aide|insulte|site|plusTard|resilier|paiement)/.test(cle || "")) return items;
    if (S.echanges < 1) return items;
    S.questionPosee = true;
    return items.concat(questionSite());
  }
  // Le message du visiteur s'affiche apres la reponse en cours, jamais au milieu.
  function moi(texte) {
    var h = '<div class="as-b as-b--moi">' + esc(texte) + "</div>";
    if (enCours) file.push({ t: "html", html: h }); else ajouter(h);
  }
  function question(texte) {
    moi(texte);
    var cle = intention(texte), trouves = [];
    // Une equipe nommee passe avant les mots generaux (« PSG gagne ce soir ? ») ;
    // les sujets sensibles et l'argent restent prioritaires.
    if (!/^(mineur|aide|resilier|paiement|compte)$/.test(cle || "")) trouves = cherche(texte, S.matchs);
    if (trouves.length) { S.rates = 0; return dire(avecQuestion(repMatchs(trouves), "match")); }
    var r = cle ? reponse(cle) : null;
    if (r) { S.rates = 0; return dire(avecQuestion(r, cle)); }
    S.rates++;
    if (S.rates >= 2) { S.rates = 0; return dire(bulles(S.L.incompris2).concat([boutons([Object.assign(B.contact(), { plein: true }), B.tg()])])); }
    dire(bulles(S.L.incompris1).concat([boutons(B.menu())]));
  }
  function choix(cle, libelle) {
    moi(libelle);
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

  function ouvrir() {
    construire();
    if (S.ouvert) return;
    S.ouvert = true;
    el.hidden = false;
    G.document.documentElement.classList.add("ias-as-ouvert");
    memo("ias-assistant-vu", "1");
    var pt = G.document.querySelector(".site-bottom-nav__point"); if (pt) pt.remove();
    if (G.location.hash !== "#assistant") { try { G.history.pushState({ ias: "assistant" }, "", "#assistant"); } catch (e) {} }
    var go = function () { dire(accueilItems()); };
    if (!S.pret) { S.pret = true; donnees().then(go, go); }
    G.setTimeout(function () { var i = el.querySelector("input"); if (i && G.matchMedia && G.matchMedia("(min-width:760px)").matches) i.focus(); }, 50);
  }
  function fermer() {
    if (!S.ouvert) return;
    S.ouvert = false;
    el.hidden = true;
    G.document.documentElement.classList.remove("ias-as-ouvert");
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
  return { ouvrir: ouvrir, fermer: fermer, intention: intention, cherche: cherche, version: version, langue: langue, norm: norm, ordreResultats: ordreResultats, T: T };
});
