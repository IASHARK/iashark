/* Assistant IASHARK (19/11/2026, demande de Clement : « un chatbot entre Combines et Blog, avec un truc
   bleu qui clignote », utile au visiteur gratuit, sans compte).
   Fenetre de discussion plein ecran ouverte par l'onglet « Chat » de la barre du bas
   (bottom-navigation.js) ou par l'adresse #assistant de n'importe quelle page (lien a partager sur X et
   Telegram). Modele retenu par Clement parmi les composants 21st.dev : fenetre de chat avec en-tete,
   bulles qui arrivent une a une et « en train d'ecrire » (Chat Messages, id 20129) + boutons de reponse
   dans les bulles (id 28561).
   AUCUNE IA, aucun service payant : reponses preparees (dictionnaire d'intentions ci-dessous) et
   recherche des equipes dans /data-home.json (liste publique des matchs, deja servie a l'accueil).
   Jamais un pari payant : le serveur ne met aucun pari dans data-home.json ; l'assistant renvoie vers la
   page du match, ou le serveur decide de ce que voit le visiteur. Match offert : lib/free-match.js
   (source unique, comme l'accueil et les articles).
   Suivi : clics des boutons via data-track (funnel-track.js, kind cta, libelles assistant_*). Le texte
   ecrit par le visiteur n'est jamais envoye nulle part. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.IasharkAssistant = api;
})(typeof window !== "undefined" ? window : this, function (G) {
  "use strict";

  var TG_CANAL = "https://t.me/+qCEr2JFPDDBlZTFk";
  var TG_CONTACT = "https://t.me/iashark_contact";
  var MAIL = "contact@iashark.com";
  var DIRS = ["fr", "en", "gb", "za", "es", "mx", "de", "it", "pt"];
  var EUR = { fr: 1, es: 1, de: 1, it: 1, pt: 1 };

  // ---------------------------------------------------------------- textes
  // fr pour /fr/, en pour toutes les autres versions (es, de, it, pt, mx suivront).
  var T = {
    fr: {
      titre: "Assistant IASHARK", sous: "Répond tout de suite", fermer: "Fermer", envoyer: "Envoyer",
      champ: "Une équipe ou ta question…", ecrit: "en train d'écrire",
      bonjour: ["Salut ! Je t'aide à trouver ton match.", "De quel match tu veux parler ?"],
      bonjourPro: ["Salut ! Tu es Pro : tous les paris sont ouverts pour toi.", "Écris une équipe et je te donne la page du match."],
      offertTitre: "Offert aujourd'hui", offertLigne: "Pari et analyse gratuits avec un compte",
      c_gratuit: "Le match gratuit", c_chercher: "Chercher un match", c_resultats: "Nos résultats", c_pro: "Le Pro, c'est quoi ?",
      c_combines: "Les combinés", c_telegram: "Telegram gratuit", c_parier: "Où parier ?", c_humain: "Parler à l'équipe",
      b_voirMatch: "Voir la page du match", b_compte: "Créer mon compte gratuit", b_pro: "Débloquer avec le Pro",
      b_offert: "Voir le match offert", b_telegram: "Rejoindre Telegram", b_contact: "Écrire à l'équipe",
      b_lolly: "Lolly Bet, notre partenaire", b_combines: "Voir les combinés", b_compteMoi: "Mon compte",
      b_prix: "Voir les prix", b_methode: "Comment on calcule",
      gratuit: function (m) { return m ? ["Le match offert aujourd'hui : " + m + ".", "Le pari, sa cote et l'analyse complète sont gratuits. Il te faut juste un compte gratuit, ça prend 30 secondes."] : ["Le match offert du jour arrive chaque matin, dès que le calcul est fini.", "En attendant, rejoins la chaîne Telegram : on y poste le match du jour."]; },
      chercher: ["Écris le nom d'une équipe, je te trouve son match.", "Ou choisis dans les prochains :"],
      trouve1: "Je l'ai trouvé :", trouvePlus: "J'en ai trouvé plusieurs :",
      estOffert: "Bonne nouvelle : c'est le match offert aujourd'hui. Le pari et l'analyse sont gratuits avec un compte.",
      estPro: "Le pari de ce match est dans l'accès Pro. Sur la page du match, tu vois déjà les infos de base.",
      estProAbonne: "Ton pari et l'analyse complète sont sur la page du match.",
      estFini: "Ce match est terminé. Le score et notre pari sont sur sa page.",
      pasTrouve: ["Ce match n'est pas dans nos analyses pour l'instant.", "Voici les prochains matchs qu'on a :"],
      resultats: ["Tous nos paris sont publiés avant le coup d'envoi et ne sont jamais changés après.", "Les gagnés ET les perdus restent affichés : sur la page des combinés et sur chaque page de match."],
      pro: function (p) { return ["Le Pro ouvre tous les paris du jour, sur tous les matchs : le pari, sa cote, l'analyse complète, les combinés et la Sélection en or.", p ? "C'est " + p + ". Tu arrêtes quand tu veux, en un clic dans ton compte." : "Tu arrêtes quand tu veux, en un clic dans ton compte."]; },
      prix: "4,99 € la semaine, 14,99 € le mois ou 99 € l'année",
      resilier: ["Pour arrêter le Pro : va dans Mon compte, rubrique Abonnement, puis « Résilier ».", "Tu gardes l'accès jusqu'à la fin de la période déjà payée."],
      paiement: ["Le paiement se fait par carte bancaire (Visa, Mastercard), Apple Pay ou Google Pay, sur une page sécurisée Stripe.", "Si ta carte est refusée, essaie une autre carte depuis Mon compte. Toujours bloqué ? Écris-nous, on règle ça vite."],
      compte: ["Pour te connecter ou créer ton compte, c'est sur la page Compte.", "Mot de passe oublié ? Le lien est juste sous le formulaire de connexion."],
      sur: ["Un pari sûr à 100 %, ça n'existe pas, et personne d'honnête ne te le promettra.", "Nos paris les plus solides du jour sont dans le Pro. Le match offert, lui, est gratuit avec un compte."],
      combines: ["Les combinés du jour (Petit combiné, Grand combiné, Sélection en or) et les buteurs sont sur la page Combinés.", "Ils sont publiés avant les matchs, gagnés et perdus montrés."],
      buteur: ["Les buteurs du jour sont sur la page Combinés, avec la cote quand on l'a.", "Le buteur du match offert est gratuit avec un compte."],
      methode: ["Pour chaque match, on part de la forme des équipes, des compositions probables, des absents et des cotes.", "Le match est ensuite simulé 10 000 fois, puis on garde le pari où la cote nous paraît bonne. La méthode complète est sur sa page."],
      telegram: ["La chaîne Telegram est gratuite : match du jour, résultats et actus.", "Tu peux nous écrire aussi en privé sur Telegram si tu as une question."],
      whatsapp: "On n'a pas de WhatsApp, tout se passe sur Telegram (gratuit).",
      parier: ["Notre partenaire, c'est Lolly Bet : un bonus t'attend si tu t'inscris avec notre lien.", "Les paris IASHARK se jouent chez n'importe quel bookmaker, mais avec notre lien tu nous aides aussi."],
      humain: ["Tu peux écrire directement à l'équipe sur Telegram, on répond nous-mêmes.", "Ou par e-mail : " + MAIL + "."],
      live: ["Les scores en direct s'affichent sur la page de chaque match.", "Écris le nom d'une équipe et je te donne sa page."],
      merci: ["Avec plaisir ! Autre chose ?"],
      insulte: ["Je reste là si tu as une vraie question sur un match."],
      mineur: ["Les paris sont interdits aux moins de 18 ans, IASHARK aussi.", "Si tu veux juste parler foot, les infos des matchs restent ouvertes à tous."],
      aide: ["Si tu as perdu beaucoup ou si tu veux te refaire, fais une pause : courir après ses pertes, c'est le piège.", "Tu peux en parler gratuitement à Joueurs Info Service, 09 74 75 13 13 (appel non surtaxé), ou sur joueurs-info-service.fr."],
      b_aide: "Joueurs Info Service", aideUrl: "https://www.joueurs-info-service.fr",
      termes: {
        btts: "« Les deux équipes marquent » : gagné si chaque équipe met au moins un but, quel que soit le vainqueur.",
        over: "« Plus de 2,5 buts » : gagné s'il y a 3 buts ou plus dans le match. « Moins de 2,5 » : 2 buts ou moins.",
        dc: "« Double chance » : tu joues deux issues sur trois. 1X = victoire de l'équipe à domicile ou nul.",
        un: "1N2 : 1 = victoire à domicile, N = match nul, 2 = victoire à l'extérieur.",
        handicap: "Handicap : on retire (ou ajoute) des buts à une équipe avant de compter le résultat.",
        cote: "La cote, c'est ce que rapporte le pari : à 1,80, tu récupères 1,80 fois ta mise si c'est gagné."
      },
      incompris1: ["Je n'ai pas bien compris. Tu peux écrire le nom d'une équipe, ou choisir :"],
      incompris2: ["Là, je préfère te passer à l'équipe : écris-nous sur Telegram, on te répond nous-mêmes.", "Ou par e-mail : " + MAIL + "."],
      bientot: "Les matchs du jour arrivent chaque matin.", heure: "Paris"
    },
    en: {
      titre: "IASHARK Assistant", sous: "Answers right away", fermer: "Close", envoyer: "Send",
      champ: "A team or your question…", ecrit: "typing",
      bonjour: ["Hi! I'll help you find your match.", "Which match do you want to talk about?"],
      bonjourPro: ["Hi! You're Pro: every pick is open for you.", "Type a team and I'll give you the match page."],
      offertTitre: "Free today", offertLigne: "Pick and analysis free with an account",
      c_gratuit: "The free match", c_chercher: "Find a match", c_resultats: "Our results", c_pro: "What's Pro?",
      c_combines: "Accumulators", c_telegram: "Free Telegram", c_parier: "Where to bet?", c_humain: "Talk to the team",
      b_voirMatch: "See the match page", b_compte: "Create my free account", b_pro: "Unlock with Pro",
      b_offert: "See the free match", b_telegram: "Join Telegram", b_contact: "Message the team",
      b_lolly: "Lolly Bet, our partner", b_combines: "See accumulators", b_compteMoi: "My account",
      b_prix: "See prices", b_methode: "How we calculate",
      gratuit: function (m) { return m ? ["Today's free match: " + m + ".", "The pick, its odds and the full analysis are free. You just need a free account, it takes 30 seconds."] : ["The free match of the day lands every morning, once the daily run is done.", "Meanwhile, join our Telegram channel: we post the match of the day there."]; },
      chercher: ["Type a team name and I'll find its match.", "Or pick one of the next ones:"],
      trouve1: "Found it:", trouvePlus: "I found a few:",
      estOffert: "Good news: it's today's free match. The pick and analysis are free with an account.",
      estPro: "The pick for this match is in Pro. The match page already shows the basics.",
      estProAbonne: "Your pick and the full analysis are on the match page.",
      estFini: "This match is over. The score and our pick are on its page.",
      pasTrouve: ["This match isn't in our analyses for now.", "Here are the next matches we cover:"],
      resultats: ["Every pick is published before kick-off and never changed afterwards.", "Wins AND losses stay visible: on the accumulators page and on every match page."],
      pro: function (p) { return ["Pro opens every pick of the day, on every match: the pick, its odds, the full analysis, the accumulators and the Gold Selection.", p ? "It's " + p + ". Cancel anytime in one click from your account." : "Cancel anytime in one click from your account."]; },
      prix: "$4.99 a week or $19.99 a month",
      resilier: ["To stop Pro: go to My account, Subscription, then \"Cancel\".", "You keep access until the end of the period already paid."],
      paiement: ["Payment is by card (Visa, Mastercard), Apple Pay or Google Pay, on a secure Stripe page.", "If your card is declined, try another one from My account. Still stuck? Message us and we'll sort it out."],
      compte: ["Log in or create your account on the Account page.", "Forgot your password? The link is right under the login form."],
      sur: ["A 100% sure bet doesn't exist, and nobody honest will promise you one.", "Our strongest picks of the day are in Pro. The free match is free with an account."],
      combines: ["Today's accumulators and goalscorers are on the Accumulators page.", "They're published before kick-off, wins and losses shown."],
      buteur: ["Today's goalscorers are on the Accumulators page, with the odds when we have them.", "The free match's goalscorer is free with an account."],
      methode: ["For each match we start from team form, likely line-ups, absences and the odds.", "The match is then simulated 10,000 times and we keep the pick where the odds look good. The full method is on its page."],
      telegram: ["Our Telegram channel is free: match of the day, results and news.", "You can also message us privately on Telegram."],
      whatsapp: "We don't have WhatsApp, everything happens on Telegram (free).",
      parier: ["Our partner is Lolly Bet: there's a bonus waiting if you sign up with our link.", "IASHARK picks work with any bookmaker, but our link also helps us."],
      humain: ["You can message the team directly on Telegram, we answer ourselves.", "Or by email: " + MAIL + "."],
      live: ["Live scores show on each match page.", "Type a team name and I'll give you its page."],
      merci: ["You're welcome! Anything else?"],
      insulte: ["I'm here if you have a real question about a match."],
      mineur: ["Betting is for over-18s only, and so is IASHARK.", "If you just want to talk football, match info stays open to everyone."],
      aide: ["If you've lost a lot or want to win it back, take a break: chasing losses is the trap.", "You can talk to someone for free at gamblingtherapy.org."],
      b_aide: "Gambling Therapy", aideUrl: "https://www.gamblingtherapy.org",
      termes: {
        btts: "\"Both teams to score\": wins if each team scores at least once, whoever wins.",
        over: "\"Over 2.5 goals\": wins with 3 goals or more in the match. \"Under 2.5\": 2 goals or fewer.",
        dc: "\"Double chance\": you cover two of the three outcomes. 1X = home win or draw.",
        un: "1X2: 1 = home win, X = draw, 2 = away win.",
        handicap: "Handicap: goals are taken from (or given to) a team before the result is counted.",
        cote: "The odds tell you the payout: at 1.80, you get back 1.80 times your stake if it wins."
      },
      incompris1: ["I didn't quite get that. Type a team name, or pick:"],
      incompris2: ["I'd rather hand you to the team: message us on Telegram, we answer ourselves.", "Or by email: " + MAIL + "."],
      bientot: "Today's matches land every morning.", heure: ""
    }
  };

  // ---------------------------------------------------------------- outils
  function version(chemin) {
    var m = /^\/([a-z]{2})(?:\/|$)/.exec(String(chemin || ""));
    return m && DIRS.indexOf(m[1]) !== -1 ? m[1] : "fr";
  }
  function langue(dir) { return dir === "fr" ? "fr" : "en"; }
  function marche(dir) { return dir === "en" ? "us" : dir === "gb" || dir === "za" || dir === "mx" ? dir : "fr"; }
  function prixDe(dir) { return EUR[dir] ? T.fr.prix : dir === "en" ? T.en.prix : ""; }
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function nom(e) { return e && typeof e === "object" ? e.n : e; }
  function a(texte, re) { return re.test(" " + texte + " "); }

  // ---------------------------------------------------------------- intentions
  // Ordre = priorite : sujets sensibles d'abord, puis argent/compte, puis le reste.
  // Chaque motif s'applique au texte normalise (minuscules, sans accents), entoure d'espaces.
  var INTENTIONS = [
    ["mineur", /\s(j ai|jai|g|i m|im|i am)\s?(1[0-7]|[0-9])\s?(ans|years|yo)\s|\smineur|\sunder 18|\spas majeur/],
    ["aide", /recuperer mes pertes|me refaire|tout perdu|perdu tout|addict|accro|dette|endette|je n arrive plus a arreter|chase (my )?loss|lost everything|gambling problem|win it back/],
    ["resilier", /\s(resilier|resiliation|desabonn|desinscri|annuler (mon |l )?abonnement|arreter (le |mon )?(pro|abonnement)|rembours|cancel|refund|unsubscribe)/],
    ["paiement", /\s(paiement|payer|paye|carte|cb|refuse|bloque|prelev|debit|mobile money|orange money|wave|paypal|apple pay|google pay|payment|card|declined|charge)/],
    ["compte", /\s(connexion|connecter|connecte|mot de passe|mdp|identifiant|login|log in|password|sign in|m inscrire|inscription|creer (un |mon )?compte|sign up|account|mon compte)/],
    ["prix", /\s(prix|combien|tarif|cher|abonnement|abonne|abonner|vip|premium|price|cost|how much|subscribe|subscription)\s|\spro\s|\sle pro|\scest quoi le pro/],
    ["humain", /\s(humain|un vrai|une vraie|parler a|conseiller|quelqu un|clement|contact|joindre|real person|human|agent|support)/],
    ["whatsapp", /\swhats ?app/],
    ["telegram", /\s(telegram|canal|chaine|groupe|channel|group)\s/],
    ["parier", /\s(ou parier|ou jouer|bookmaker|bookmakers|book|lolly|site de paris|1win|winamax|betclic|unibet|bet365|pmu|parions|where to bet|which bookmaker|bonus)\s/],
    ["sur", /\s(sur a 100|100 ?%|sure|surs|ultra sur|safe|banker|certain|garanti|meilleur prono|meilleur pari|prono du jour|pari du jour|quoi jouer|que jouer|je joue quoi|best bet|tip of the day|sure bet|lock|prono|pronos|pronostic|pronostics|paris du jour|tips|tip|prediction|predictions|bet of the day)\s/],
    ["combines", /\s(combine|combines|combo|combos|accumulat|acca|parlay|ticket|tickets|multiple|selection en or)/],
    ["buteur", /\s(buteur|buteurs|scorer|scorers|goalscorer|qui marque|anytime)/],
    ["resultats", /\s(resultat|resultats|historique|bilan|fiable|fiables|arnaque|scam|legit|truque|fake|gagnes|perdus|win rate|taux|reussite|track record|results|winning|valide)\s/],
    ["methode", /\s(comment (ca marche|vous faites|vous calculez|tu calcules)|methode|algorithme|algo|intelligence artificielle|simulation|simule|modele|calcul|how does it work|method|model|algorithm)\s|\sia\s|\sai\s/],
    ["gratuit", /\s(gratuit|gratuits|gratos|free|offert|offerts|cadeau)\s/],
    ["live", /\s(direct|live|en cours|score en direct|livescore)\s/],
    ["t_btts", /\s(btts|les deux equipes marquent|deux equipes marquent|both teams)/],
    ["t_over", /\s(over|under|plus de \d|moins de \d|\+ ?\d[,.]5|- ?\d[,.]5)/],
    ["t_dc", /\s(double chance|1x|x2)\s/],
    ["t_un", /\s(1n2|1x2|1 n 2|match nul|draw)\s/],
    ["t_handicap", /\shandicap/],
    ["t_cote", /\s(c est quoi une cote|une cote|la cote|les cotes|odds)\s/],
    ["merci", /\s(merci|thanks|thank you|top|parfait|super|nickel|cool|ok merci)\s/],
    ["insulte", /\s(connard|fdp|ntm|pute|encule|merde|arnaqueur|fuck|shit|idiot)\s/],
    ["bonjour", /^\s*(bonjour|bonsoir|salut|slt|yo|hello|hi|hey|cc|coucou|wesh|salam|hola)\s*$/]
  ];
  function intention(texte) {
    var t = norm(texte);
    for (var i = 0; i < INTENTIONS.length; i++) if (a(t, INTENTIONS[i][1])) return INTENTIONS[i][0];
    return null;
  }

  // ---------------------------------------------------------------- equipes
  var ALIAS = {
    psg: "paris saint germain", om: "marseille", ol: "lyon", losc: "lille", asse: "saint etienne", ogcn: "nice",
    barca: "barcelona", real: "real madrid", atleti: "atletico madrid", juve: "juventus", inter: "inter",
    milan: "ac milan", bayern: "bayern", bvb: "dortmund", dortmund: "dortmund", city: "manchester city",
    "man city": "manchester city", united: "manchester united", "man utd": "manchester united", "man united": "manchester united",
    spurs: "tottenham", gunners: "arsenal", reds: "liverpool", benfica: "benfica", porto: "porto", ajax: "ajax"
  };
  // Mots trop communs pour designer une equipe a eux seuls.
  var VIDES = { fc: 1, cf: 1, sc: 1, ac: 1, as: 1, afc: 1, us: 1, cd: 1, ca: 1, sv: 1, fk: 1, sk: 1, if: 1, ik: 1, bk: 1, club: 1, de: 1, la: 1, le: 1, les: 1, el: 1, los: 1, del: 1, real: 1, united: 1, city: 1, sporting: 1, athletic: 1, atletico: 1, deportivo: 1, union: 1, san: 1, santa: 1, saint: 1, st: 1, sport: 1, sports: 1, racing: 1, olympique: 1, stade: 1, inter: 1, internacional: 1, nacional: 1, national: 1, central: 1, university: 1, universidad: 1, town: 1, rovers: 1, wanderers: 1, county: 1, women: 1, ce: 1, soir: 1, match: 1, ligue: 1, league: 1, cup: 1, coupe: 1, contre: 1, versus: 1, vs: 1, prono: 1, pronostic: 1, pari: 1, demain: 1, aujourd: 1, hui: 1, today: 1, tonight: 1, tomorrow: 1, quel: 1, quelle: 1, pour: 1, avec: 1, the: 1, and: 1, des: 1, dans: 1, sur: 1, que: 1, qui: 1, est: 1, tu: 1, vous: 1, mon: 1, ton: 1, gagne: 1, gagner: 1, perd: 1, nul: 1, but: 1, buts: 1, paris: 1, parier: 1, score: 1, cote: 1, cotes: 1, live: 1, direct: 1, bonus: 1, gratuit: 1, offert: 1, combine: 1, buteur: 1, resultat: 1, resultats: 1, comment: 1, combien: 1 };
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

  // ---------------------------------------------------------------- etat
  var S = { dir: "fr", L: T.fr, matchs: null, offert: null, pro: false, rates: 0, ouvert: false, pret: false };
  function lien(page) { return "/" + S.dir + "/" + page; }
  function lienMatch(m) { return lien("match.html?id=" + encodeURIComponent(m.id) + "&utm_source=assistant"); }
  function heure(m) {
    var MT = G.IasharkMatchTime, loc = S.dir === "fr" ? "fr-FR" : "en-GB";
    try { if (MT && MT.formatTime) return MT.formatTime(m, loc); } catch (e) {}
    var h = String(m.date || "").slice(11, 16);
    return h ? h + (S.L.heure ? " (" + S.L.heure + ")" : "") : "";
  }
  function jour(m) {
    var MT = G.IasharkMatchTime, loc = S.dir === "fr" ? "fr-FR" : "en-GB";
    try { if (MT && MT.formatDate) return MT.formatDate(m, loc, { weekday: "short", day: "numeric", month: "short" }); } catch (e) {}
    return String(m.date || "").slice(0, 10);
  }

  // ---------------------------------------------------------------- affichage
  var CSS = ""
    + "#ias-as{position:fixed;inset:0;z-index:1001;display:flex;flex-direction:column;background:#060b12;color:#f4f7fb;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}"
    + "#ias-as[hidden]{display:none}"
    + "#ias-as .as-top{flex:none;display:flex;align-items:center;gap:12px;padding:12px 14px;padding-top:calc(12px + env(safe-area-inset-top));border-bottom:1px solid rgba(96,125,151,.18);background:#0a131c}"
    + "#ias-as .as-av{flex:none;width:40px;height:40px;border-radius:50%;background:#20d5ef;display:flex;align-items:center;justify-content:center}"
    + "#ias-as .as-n{margin:0;font-size:15.5px;font-weight:700;line-height:1.2}"
    + "#ias-as .as-s{margin:2px 0 0;font-size:12.5px;color:#91a0b3;display:flex;align-items:center;gap:6px}"
    + "#ias-as .as-s i{width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block}"
    + "#ias-as .as-x{margin-left:auto;width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:#91a0b3;display:flex;align-items:center;justify-content:center;cursor:pointer}"
    + "#ias-as .as-x:hover{background:rgba(148,173,186,.08);color:#f4f7fb}"
    + "#ias-as .as-fil{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:16px 14px 8px;display:flex;flex-direction:column;gap:10px}"
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
    + "@media (prefers-reduced-motion:reduce){#ias-as .as-b,#ias-as .as-carte,#ias-as .as-btns{animation:none}#ias-as .as-tape i{animation:none;opacity:.7}}"
    + "html.ias-as-ouvert,html.ias-as-ouvert body{overflow:hidden}";

  var ICONE_BOT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#060b12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
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
    el.innerHTML = '<div class="as-top"><span class="as-av" aria-hidden="true">' + ICONE_BOT + '</span><div><p class="as-n">' + esc(L.titre) + '</p><p class="as-s"><i aria-hidden="true"></i>' + esc(L.sous) + '</p></div>'
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
      if (b.as) return '<button type="button" class="' + cls + '" data-as="' + esc(b.as) + '">' + esc(b.l) + "</button>";
      var ext = /^https?:/.test(b.href);
      return '<a class="' + cls + '" href="' + esc(b.href) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ' data-track="' + esc(b.track) + '">' + esc(b.l) + "</a>";
    }).join("") + "</div>" };
  }
  function carte(m, k, pro) {
    var ligne = [jour(m), passe(m) ? "" : heure(m), k === m.league ? "" : m.league].filter(Boolean).join(" · ");
    return { t: "html", html: '<a class="as-carte" href="' + esc(lienMatch(m)) + '" data-track="assistant_match"><p class="as-k' + (pro ? " as-k--pro" : "") + '">' + esc(k) + '</p><p class="as-m">' + esc(nom(m.home) + " - " + nom(m.away)) + '</p><p class="as-l">' + esc(ligne) + "</p></a>" };
  }

  // ---------------------------------------------------------------- reponses
  var B = {
    menu: function () { var L = S.L; return [{ as: "gratuit", l: L.c_gratuit }, { as: "chercher", l: L.c_chercher }, { as: "resultats", l: L.c_resultats }, { as: S.pro ? "combines" : "prix", l: S.pro ? L.c_combines : L.c_pro }]; },
    compte: function () { return { href: lien("inscription.html"), l: S.L.b_compte, track: "assistant_inscription", plein: true }; },
    pro: function () { return { href: lien("abonnement.html"), l: S.L.b_pro, track: "assistant_pro", plein: true }; },
    tg: function () { return { href: TG_CANAL, l: S.L.b_telegram, track: "assistant_telegram" }; },
    contact: function () { return { href: TG_CONTACT, l: S.L.b_contact, track: "assistant_contact" }; },
    lolly: function () { return { href: "/go/lolly/site", l: S.L.b_lolly, track: "assistant_lolly", plein: true }; },
    combines: function () { return { href: lien("combines.html"), l: S.L.b_combines, track: "assistant_combines" }; },
    offert: function () { return { as: "gratuit", l: S.L.b_offert }; }
  };
  function repGratuit() {
    var L = S.L, m = S.offert, out = bulles(L.gratuit(m ? nom(m.home) + " - " + nom(m.away) : ""));
    if (m) { out.push(carte(m, L.offertTitre)); out.push(boutons(S.pro ? [{ href: lienMatch(m), l: L.b_voirMatch, track: "assistant_match", plein: true }] : [B.compte(), { href: lienMatch(m), l: L.b_voirMatch, track: "assistant_match" }])); }
    else out.push(boutons([B.tg()]));
    return out;
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
      out.push(carte(m, off ? L.offertTitre : (m.league || ""), !off && !S.pro));
    });
    if (trouves.length === 1) {
      var m = trouves[0], off = S.offert && String(S.offert.id) === String(m.id), fini = passe(m);
      var voir = { href: lienMatch(m), l: L.b_voirMatch, track: "assistant_match" };
      if (fini) { out = out.concat(bulles([L.estFini])); out.push(boutons([voir, B.offert()])); }
      else if (S.pro) { out = out.concat(bulles([L.estProAbonne])); voir.plein = true; out.push(boutons([voir])); }
      else if (off) { out = out.concat(bulles([L.estOffert])); out.push(boutons([B.compte(), voir])); }
      else { out = out.concat(bulles([L.estPro])); out.push(boutons([voir, B.pro(), B.offert()])); }
    } else if (!S.pro) {
      out = out.concat(bulles([L.estPro])); out.push(boutons([B.pro(), B.offert()]));
    }
    return out;
  }
  function reponse(cle) {
    var L = S.L, p = prixDe(S.dir);
    switch (cle) {
      case "bonjour": return bulles(S.pro ? L.bonjourPro : L.bonjour).concat([boutons(B.menu())]);
      case "gratuit": return repGratuit();
      case "chercher": return bulles(L.chercher).concat(prochains(5));
      case "resultats": return bulles(L.resultats).concat([boutons([B.combines(), B.tg()])]);
      case "prix": return S.pro ? bulles(L.estProAbonne).concat([boutons([{ href: lien("compte.html"), l: L.b_compteMoi, track: "assistant_compte" }])]) : bulles(L.pro(p)).concat([boutons([B.pro(), B.offert()])]);
      case "resilier": return bulles(L.resilier).concat([boutons([{ href: lien("compte.html#abonnement"), l: L.b_compteMoi, track: "assistant_compte", plein: true }, B.contact()])]);
      case "paiement": return bulles(L.paiement).concat([boutons([{ href: lien("compte.html#abonnement"), l: L.b_compteMoi, track: "assistant_compte" }, B.contact()])]);
      case "compte": return bulles(L.compte).concat([boutons([{ href: lien("compte.html"), l: L.b_compteMoi, track: "assistant_compte", plein: true }, B.compte()])]);
      case "sur": return bulles(L.sur).concat([boutons(S.pro ? [B.combines()] : [B.pro(), B.offert()])]);
      case "combines": return bulles(L.combines).concat([boutons([Object.assign(B.combines(), { plein: true }), B.offert()])]);
      case "buteur": return bulles(L.buteur).concat([boutons([B.combines(), B.offert()])]);
      case "methode": return bulles(L.methode).concat([boutons([{ href: lien("methodologie.html"), l: L.b_methode, track: "assistant_methode" }, B.offert()])]);
      case "telegram": return bulles(L.telegram).concat([boutons([Object.assign(B.tg(), { plein: true }), B.contact()])]);
      case "whatsapp": return bulles([L.whatsapp]).concat([boutons([Object.assign(B.tg(), { plein: true })])]);
      case "parier": return bulles(L.parier).concat([boutons([B.lolly(), B.offert()])]);
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
  function question(texte) {
    ajouter('<div class="as-b as-b--moi">' + esc(texte) + "</div>");
    var cle = intention(texte), trouves = [];
    // Une equipe nommee passe avant les mots generaux (« PSG gagne ce soir ? ») ;
    // les sujets sensibles et l'argent restent prioritaires.
    if (!/^(mineur|aide|resilier|paiement|compte)$/.test(cle || "")) trouves = cherche(texte, S.matchs);
    if (trouves.length) { S.rates = 0; return dire(repMatchs(trouves)); }
    var r = cle ? reponse(cle) : null;
    if (r) { S.rates = 0; return dire(r); }
    S.rates++;
    if (S.rates >= 2) { S.rates = 0; return dire(bulles(S.L.incompris2).concat([boutons([Object.assign(B.contact(), { plein: true }), B.tg()])])); }
    dire(bulles(S.L.incompris1).concat([boutons(B.menu())]));
  }
  function choix(cle, libelle) {
    ajouter('<div class="as-b as-b--moi">' + esc(libelle) + "</div>");
    dire(reponse(cle) || []);
  }

  // ---------------------------------------------------------------- chargement
  function charger(src) {
    return new Promise(function (ok) {
      var D = G.document;
      if (D.querySelector('script[src="' + src + '"]')) return ok();
      var s = D.createElement("script"); s.src = src; s.onload = ok; s.onerror = ok; D.head.appendChild(s);
    });
  }
  function donnees() {
    var p1 = (G.IasharkMatchTime ? Promise.resolve() : charger("/lib/match-time.js"))
      .then(function () { return G.IasharkFreeMatch ? null : charger("/lib/free-match.js"); });
    var p2 = G.fetch("/data-home.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    var p3 = G.IasharkApp && typeof G.IasharkApp.context === "function"
      ? G.IasharkApp.context().then(function (c) { return !!(c && c.isPro); }).catch(function () { return false; }) : Promise.resolve(false);
    return Promise.all([p1, p2, p3]).then(function (r) {
      var j = r[1];
      S.matchs = j && Array.isArray(j.matchs) ? j.matchs.filter(function (m) { return m && m.id && m.home && m.away; }) : [];
      S.pro = r[2];
      try { S.offert = G.IasharkFreeMatch && G.IasharkFreeMatch.offertDuJour ? G.IasharkFreeMatch.offertDuJour(S.matchs, null, marche(S.dir)) : null; } catch (e) { S.offert = null; }
    });
  }
  function accueil() {
    var L = S.L, out = bulles(S.pro ? L.bonjourPro : L.bonjour);
    if (S.offert && !S.pro) out.push(carte(S.offert, L.offertTitre + " · " + L.offertLigne));
    out.push(boutons(B.menu()));
    dire(out);
  }

  function ouvrir() {
    construire();
    if (S.ouvert) return;
    S.ouvert = true;
    el.hidden = false;
    G.document.documentElement.classList.add("ias-as-ouvert");
    try { G.localStorage.setItem("ias-assistant-vu", "1"); } catch (e) {}
    var pt = G.document.querySelector(".site-bottom-nav__point"); if (pt) pt.remove();
    if (G.location.hash !== "#assistant") { try { G.history.pushState({ ias: "assistant" }, "", "#assistant"); } catch (e) {} }
    if (!S.pret) { S.pret = true; donnees().then(accueil, accueil); }
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
  return { ouvrir: ouvrir, fermer: fermer, intention: intention, cherche: cherche, version: version, norm: norm, T: T };
});
