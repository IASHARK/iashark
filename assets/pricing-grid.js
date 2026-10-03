/* IASHARK — grille de prix (30/09/2026 ; remise au propre le meme jour apres
   l'avis de Clement : « des grosses cases en bas, tout est bacle »).

   Composant SANS framework (reprise sans React d'un composant 21st.dev) :
   HTML produit en texte avec des classes Tailwind (assets/tailwind.css, ce
   fichier est dans tailwind.config.js#content), un seul objet global
   window.IasharkPricingGrid. Il prend la police de la page qui l'accueille
   (Inter sur l'accueil, DM Sans sur l'abonnement, les landings et les pages
   match) : jamais une troisieme police sur une page.

   Ce qu'il affiche - UN seul dessin partout (controle des captures du
   30/09/2026 : 3 versions de la liste, trous sous le paiement, bouton pousse
   en bas, « sans engagement » repete) :
   - la carte Pro sur toute la largeur, puis le Gratuit sur une ligne (« 0 € »,
     ses lignes ; « Ton offre actuelle » pour un compte connecte), sur
     l'accueil, les landings, l'abonnement, le compte et les landings pays ;
   - carte Pro : prix en grand, UN seul choix de duree (Semaine / Mois /
     Annee, seulement les durees payables ; economie en pastille DANS la case
     Annee), « Meme acces Pro, quelle que soit la duree », « Tout le Gratuit,
     et en plus » (les lignes Pro ouvertes le 3/10, lancement de la V3, les
     memes sur le mur Pro des pages match : match-page.js#LISTE_PRO),
     « Bientot dans Pro » replie (jamais coche « Inclus ») ;
     . accueil, landings : a gauche le prix, la duree et le bouton JUSTE
       dessous ; a droite la liste ;
     . page de paiement (option checkout) : a gauche le prix puis la liste ;
       a droite la duree puis le paiement de la page (consentement, bouton :
       option slot) et la ligne de confiance (paiement securise, sans
       engagement, resiliable ; en annuel : paiement securise seulement) ;
   - une ligne de conditions sous la grille ; « sans engagement » n'est ecrit
     qu'UNE fois par ecran (ligne de confiance OU pied, jamais sous le prix).
   Plus de pastille « Recommande » (seule offre payante), plus d'onglet
   « Comparer » ni de tableau.

   Regles IASHARK (inchangees) :
   - Plans : ceux qui existent vraiment (config/markets.json#_planKeys) :
     Gratuit et Pro. Le plan interne « famille » n'est pas en vente.
   - Prix : JAMAIS ecrits ici. Tout vient de window.IASHARK_MARKET
     (lib/market-config.js, recopie de config/markets.json) : devise, montant,
     equivalent mensuel (arrondi au centime superieur) et economie (arrondie
     a l'entier inferieur) calcules par market-config.js.
   - Seules les durees PAYABLES sont proposees (checkoutOpen, puis la reponse
     du serveur, comme lib/pro-plan-picker.js) : une duree fermee n'apparait
     nulle part, jamais un autre prix a la place.
   - Annee : option `annual`, ETEINTE par defaut. Meme allumee, elle n'apparait
     que si un prix annuel est vendu ET payable dans le marche (aujourd'hui :
     euro et peso). En annuel, le montant REELLEMENT preleve en grand
     (« 199 € / an », le prix Stripe) et, en petit, « preleve en une fois pour
     12 mois, soit X par mois » (CGV, article 6) ; jamais « sans engagement »
     en annuel (CGV : periode payee pour douze mois) : pied propre a l'annuel,
     et les elements [data-pg-hide-year] de la page masques.
   - Semaine : proposee quand elle est payable (option `weekly`, allumee par
     defaut) : c'est la porte d'entree des marches ou le mois est cher.
   - Essai (02/10/2026, decision de Clement) : ABONNEMENT MENSUEL SEULEMENT
     (create-checkout-session/trial.ts#TRIAL_INTERVALS ; semaine et annee :
     paiement immediat). Il n'est annonce que quand le MOIS est la duree
     affichee : sur Semaine ou Annee, encart, note et bouton « Commencer
     l'essai gratuit » disparaissent (« Devenir Pro »). Formule courte :
     « Essai gratuit 7 jours (abonnement mensuel) » (trial_short), puis ses
     conditions (trial_terms). Mois choisi par defaut (resolveInterval).
     Pages de paiement sans encart propre (compte, landings gb/za/mx) : encart
     de la grille au-dessus du paiement ([data-pg-trial-box]) ; la page
     d'abonnement et le compte gardent le leur (option ownTrial).
     Pages sans app-client.js (landings fr/en/es) : session et disponibilites
     lues par assets/compte-leger.js.
   - Essai (regles du 29/09, inchangees) : annonce SEULEMENT si le serveur le confirme (trial_days > 0,
     create-checkout-session/trial.ts : coupe par defaut, TRIAL_DAYS absent
     = 0) ET a qui y a droit : visiteur non connecte (les conditions ecrites
     disent « reserve a un premier abonnement ») ou compte connecte qui n'a
     JAMAIS eu d'abonnement (meme lecture que abonnement-page.js). Abonne,
     ancien abonne, compte illisible, session inconnue : aucune annonce.
     Conditions exactes, sur chaque mention (y compris la ligne compacte) :
     carte demandee, reserve a un premier abonnement, rien preleve pendant
     l'essai, e-mail 2 jours avant la fin, annulation en 1 clic, premier
     prelevement a la fin de l'essai au prix de la duree choisie.
   - Jamais « Le plus choisi » (aucune donnee ne le prouve) ; plus de
     « Recommande » (30/09/2026). Bande Gratuite sobre, carte Pro bordee de cyan.
   - Fonctions sans promesse de gain. « bientot » = pas encore ouverte : jamais
     cochee « Inclus » (icone horloge, « pas encore disponible » pour les
     lecteurs d'ecran), regroupee sous « Bientot dans Pro ».
   - Comparateur de cotes : seulement la ou IASHARK a une liste de bookmakers
     agrees (config/bookmakers-agrees.json : France seulement ; gb, mx, za,
     us : liste vide), donc seulement sur les pages francaises du marche euro
     (les versions es/de/it/pt visent un public international).

   Variantes (option `variant`) :
     "complet" : 2 cartes (accueil, landings) ou, avec `checkout`, la carte Pro
                 et son paiement puis le Gratuit sur une ligne (abonnement,
                 landings gb/za/mx) ;
     "carte"   : la carte Pro seule ;
     "prix"    : le bloc prix seul (prix, choix de la duree), dans une carte
                 deja dessinee par la page (compte) ;
     "ligne"   : une ligne de prix + bouton (mur Pro des pages match, espace
                 Pro gratuit, retour de paiement annule) ;
     "rappel"  : rappel de l'offre choisie apres le paiement.

   Paiement : les boutons menent au vrai parcours existant
   (abonnement.html?interval=<duree>, consentement CGV puis Stripe Checkout).
   Avec `checkout: true`, la carte Pro ne dessine pas de bouton : la page y
   deplace le sien (option `slot`), avec son consentement, et garde son code
   de paiement (abonnement-page.js, account-page.js, landings gb/za/mx). Un
   element du slot marque data-pg-place="durations" se place sous le choix de
   la duree (« Meme acces Pro, quelle que soit la duree »).

   API : IasharkPricingGrid.mount(el, options) -> {el, interval(), visible(),
     isAvailable(iv), setAvailability(map), loadAvailability(), whenReady(),
     trialDays(), setInterval(iv), refresh()}
     (memes noms que lib/pro-plan-picker.js : les pages passent de l'un a
     l'autre sans changer leur code de paiement).
     IasharkPricingGrid.mountAll(root) : monte chaque [data-pricing-grid].
   Fonctions pures pour les tests : offerModel, resolveInterval, durationsOf,
     buildHtml, textFor, featureText, trialFor, trialEligibility, comparatorOpen,
     FEATURES, FALLBACK, STATS_IASHARK, SIMULATION, SIMULATION_DEPUIS. */
(function (global) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  var INTERVALS = ['week', 'month', 'year'];
  // Durees qui ont droit a l'essai (create-checkout-session/trial.ts#TRIAL_INTERVALS).
  var TRIAL_INTERVALS = ['month'];
  // Essai annonce pour la duree affichee : jours confirmes par le serveur ET mois.
  function trialOn(trial, iv) { return trial > 0 && TRIAL_INTERVALS.indexOf(iv) !== -1; }
  // Texte complet d'une annonce : formule courte puis conditions et prix mensuel.
  function trialText(model, iv, t, trial) {
    var p = priceView(model, iv, t);
    return fill(t('trial_short'), { days: trial }) + '. ' + fill(t('trial_terms'), { price: p.charge, per: p.chargePer });
  }

  // Repli francais (le dictionnaire i18n/dict/<langue>.json, cle
  // pricing_grid.*, a les memes cles dans les 7 langues du site).
  var FALLBACK = {
    title: 'Choisis ton accès',
    subtitle: 'Commence gratuitement. Passe à Pro quand tu veux tout voir.',
    dur_aria: 'Durée de l’abonnement',
    dur_week: 'Semaine',
    dur_month: 'Mois',
    dur_year: 'Année',
    save_short: '−{pct} %',
    same_access: 'Même accès Pro, quelle que soit la durée',
    current: 'Ton offre actuelle',
    free_name: 'Gratuit',
    free_desc: 'Pour découvrir IASHARK à ton rythme.',
    free_note: 'Compte gratuit, aucun paiement.',
    free_cta: 'Créer mon compte gratuit',
    pro_name: 'IASHARK Pro',
    pro_desc: 'Toutes les analyses, pas seulement celle du match offert.',
    pro_plus: 'Tout le Gratuit, et en plus :',
    per_week: '/ semaine',
    per_month: '/ mois',
    per_year: '/ an',
    billed_week: 'Prélevé chaque semaine',
    billed_month: 'Prélevé chaque mois',
    billed_annual: 'Prélevé en une fois pour 12 mois · soit {monthly} par mois, {pct} % de moins qu’au mois',
    billed_annual_nosave: 'Prélevé en une fois pour 12 mois',
    cta_trial: 'Commencer l’essai gratuit',
    trial_short: 'Essai gratuit {days} jours (abonnement mensuel)',
    trial_terms: 'Puis {price} {per}, annulable en 1 clic. Carte demandée, rien n’est prélevé pendant l’essai, rappel par e-mail 2 jours avant la fin. Réservé à un premier abonnement.',
    footer_trial_month: 'Essai gratuit de {days} jours sur l’abonnement mensuel uniquement, réservé à un premier abonnement : ta carte est demandée, mais rien n’est prélevé pendant l’essai. Un e-mail te prévient 2 jours avant la fin, et tu annules en 1 clic depuis ton compte. Sans annulation, le premier prélèvement mensuel a lieu à la fin de l’essai. La semaine et l’année sont payées dès la souscription, sans essai.',
    cta_pro: 'Devenir Pro',
    cta_manage: 'Gérer mon abonnement',
    trial_note: '{days} jours gratuits, puis {price} {per}. Carte demandée, réservé à un premier abonnement. Rappel par e-mail 2 jours avant la fin.',
    included: 'Inclus',
    not_yet: 'pas encore disponible',
    soon_title: 'Bientôt dans Pro',
    tag_test: 'en test',
    tag_soon: 'bientôt',
    footer_trial: 'Essai gratuit de {days} jours, réservé à un premier abonnement. Ta carte est demandée, mais rien n’est prélevé pendant l’essai. Un e-mail te prévient 2 jours avant la fin, et tu annules en 1 clic depuis ton compte. Sans annulation, le premier prélèvement a lieu à la fin de l’essai, au prix de la durée choisie.',
    footer_base: 'Sans engagement · résiliable à tout moment depuis ton compte · paiement sécurisé par Stripe · prix en {currency}.',
    footer_base_annual: 'Formule annuelle : 12 mois payés d’avance, reconduite pour un an sauf résiliation avant l’échéance, depuis ton compte · paiement sécurisé par Stripe · prix en {currency}.',
    footer_annual_terms: 'Formule annuelle : 12 mois payés d’avance, reconduite pour un an sauf résiliation avant l’échéance, depuis ton compte.',
    footer_honest: 'IASHARK calcule des probabilités : aucun résultat n’est garanti.',
    trust_secure: 'Paiement sécurisé',
    trust_free: 'Sans engagement',
    trust_cancel: 'Résiliable à tout moment',
    closed: 'Le paiement n’est pas encore ouvert pour ce pays. Aucun montant ne sera prélevé.',
    line_or_week: 'ou {price} / semaine',
    line_free_note: 'Sans engagement · résiliable à tout moment',
    recap_title: 'Ton offre',
    recap_trial: 'Essai gratuit en cours jusqu’au {date} : rien n’est prélevé avant. Ensuite, {price} {per}. Tu annules en 1 clic depuis ton compte.',
    recap_paid: '{price} {per} · résiliable à tout moment depuis ton compte.',
    f_free_match: 'L’analyse du match offert',
    f_free_stats: 'Sur le match offert : les stats du premier but et des buts après la 75e',
    f_all_matches: 'Toutes les analyses du jour, dans chaque compétition suivie',
    f_pronostic: 'Le pronostic IASHARK de ce match, avec sa chance calculée',
    f_pick: 'Le pari retenu, avec sa probabilité et ses raisons',
    f_scenario: 'La simulation du match par tranches de 15 minutes',
    f_scenario_since: 'La simulation du match par tranches de 15 minutes, sur les matchs publiés depuis le {date}',
    f_stats_iashark: 'Les stats IASHARK : buts par quart d’heure, après la pause',
    f_stats: 'Toutes les stats du match : forme, classement, face-à-face',
    f_scores: 'Les scores les plus probables et les buts attendus',
    f_scorers: 'Les buteurs les plus probables, dont les 3 buteurs du jour',
    f_dashboard: 'Ton tableau de bord : le journal de tes paris et ton garde-fou',
    f_quality: 'La qualité de tes cotes face à la cote de fin',
    f_programme: 'Le programme du jour, en privé sur Telegram',
    f_comparator: 'Le comparateur des bookmakers agréés, avec la cote minimum',
    f_alerts: 'Les alertes : cote sous ton seuil, composition',
    f_channel: 'Vos messages Pro sur Telegram (en privé)',
    f_robot: 'Ton robot personnel sur Telegram'
  };

  // Fonctions de l'offre. free / pro = incluse ; tag = « en test » (ouverte,
  // encore en test) ou « bientot » (pas encore ouverte : jamais cochee
  // « Inclus ») ; bookmakers = seulement la ou IASHARK a une liste de
  // bookmakers agrees (comparatorOpen) ; france = seulement sur les pages
  // francaises (meme regle). Carte Gratuite : les fonctions gratuites ; carte
  // Pro : les fonctions reservees a Pro (une seule liste, sans doublon).
  // Aucune promesse de gain, aucun chiffre public ici.
  //
  // STATS_IASHARK : les stats IASHARK de la page match (branche stats-match).
  // ETEINT par defaut (contre-controle du 30/09/2026 : allume par defaut, un
  // oubli laissait les lignes affichees sans les stats). Mis a true SEULEMENT
  // dans la fusion qui apporte les stats, si leur controle est vert le vendredi
  // 2/10 a 18 h (POUR-CLEMENT/27-LANCEMENT-3-OCTOBRE.html). Eteint : les deux
  // lignes (Gratuit : premier but et buts apres la 75e, sur le match offert ;
  // Pro : buts par quart d'heure, apres la pause) n'apparaissent dans aucune
  // grille. Le mur Pro des pages match, lui, ne montre sa ligne que si le match
  // a ces stats (vm.bookStats).
  var STATS_IASHARK = false;
  //
  // SIMULATION : la ligne « simulation du match par tranches de 15 minutes ».
  // Les matchs publies AVANT le branchement du moteur v3 gardent leur analyse
  // d'origine jusqu'au coup d'envoi (lib/pick-freeze.js de la fusion : un champ
  // absent de la premiere publication reste absent), donc SANS simulation,
  // jusqu'au lundi 5/10 au plus tard. Decision 6 de Clement :
  //   'mention' (B, par defaut) : ligne ouverte, « sur les matchs publies depuis
  //             le 3 octobre » (f_scenario_since ; date : SIMULATION_DEPUIS,
  //             ecrite dans la langue de la page) ;
  //   'bientot' (A) : la ligne passe sous « Bientot dans Pro » ;
  //   'ouverte' : ligne ouverte, sans mention (lundi 5/10, quand plus aucun
  //             match publie avant le 3/10 n'est a venir).
  // Retour arriere (MOTEUR_V3 = 0) : 'bientot' (moteur eteint, plus de
  // simulation). Le mur Pro des pages match ne montre sa ligne que sur un match
  // du moteur v3 (moteur_v3.source = "v3", champ public : match-page.js#proGate).
  var SIMULATION = 'mention';
  var SIMULATION_DEPUIS = '2026-10-03';
  //
  // Contenu du Pro de la V3 (lancement du 3/10/2026, POUR-CLEMENT/27-LANCEMENT-
  // 3-OCTOBRE.html) : SEULEMENT ce qui est ouvert ce jour-la. Partent : le
  // nouveau moteur, la simulation par quart d'heure (Pro seulement, meme sur le
  // match offert : lib/premium-fields.js#PRO_ONLY_FIELDS ; voir SIMULATION), la
  // grille et les stats IASHARK de la page match (si leur controle est vert,
  // voir STATS_IASHARK). Jamais « nouveau moteur » dans la grille : les matchs
  // publies avant le branchement gardent le pari de l'ancien moteur, fige
  // (lib/moteur-v3.js#apresGel), et MOTEUR_V3 peut repasser a 0. Restent en
  // rodage : Canal Pro, comparateur, robot. L'espace Pro (tableau de bord,
  // journal gratuit, garde-fou) n'est pas dans la liste du 3/10 (migrations
  // 0040 a 0042 absentes du samedi) : « bientot ».
  // Gratuit, le 3/10 : pas de « en entier » (la simulation reste Pro), pas de
  // « du jour » (decision 5 : certains jours, aucun match offert), plus de
  // journal ni de garde-fou (insertion du journal reservee au plan pro tant
  // que 0041 n'est pas appliquee ; aucun garde-fou sur le site actuel). Stats
  // du premier but et des buts apres la 75e : sur le match offert SEULEMENT
  // (visiteur, ou compte gratuit sur un match payant : le mur, sans stats).
  // Description de la carte Pro : pas d'« espace Pro » (absent du 3/10).
  // Decision de Clement (30/09/2026, soir) : plus AUCUNE mise ni AUCUNE
  // esperance sur le site (il n'est pas conseiller). Le « calculateur de mise »
  // quitte le Gratuit ; aucune ligne ne parle de mise, de capital, d'unites ou
  // d'esperance. Pas de ligne « historique public » a la place : aucun
  // historique n'est publie sur le site du 3/10 (results/ et historique.json
  // hors du build public depuis le 28/09 : scripts/build-public.js,
  // tests/results-prives.test.js). A ajouter seulement le jour ou il existe.
  var FEATURES = [
    { key: 'f_free_match', free: true, pro: true },
    { key: 'f_free_stats', free: true, pro: true, stats: true },
    // Pro : lignes ouvertes le 3/10, dans l'ordre de ce qui compte pour un
    // abonne. Le mur Pro des pages match reprend cette liste, dans cet ordre
    // (match-page.js#LISTE_PRO). « Nos probabilites face aux cotes » n'y est
    // plus : une seule cote en football (Bet365), rien a comparer. Pari : sans
    // « cote minimum » (jamais ecrite vers le site : lib/moteur-v3.js, C4 du
    // 29/09/2026) ; elle vient avec le comparateur (bientot).
    { key: 'f_all_matches', free: false, pro: true },
    // Un pronostic sur chaque match (03/10/2026, lib/pronostic.js).
    { key: 'f_pronostic', free: false, pro: true },
    { key: 'f_pick', free: false, pro: true },
    { key: 'f_scenario', free: false, pro: true, simulation: true },
    { key: 'f_stats_iashark', free: false, pro: true, stats: true },
    { key: 'f_stats', free: false, pro: true },
    { key: 'f_scores', free: false, pro: true },
    { key: 'f_scorers', free: false, pro: true },
    // Espace Pro (branche pro-accueil) : construit, pas ouvert le 3/10.
    { key: 'f_dashboard', free: false, pro: true, tag: 'soon', france: true },
    // Cote de fin retiree de la migration 0041 (30/09/2026) : pas encore de source.
    { key: 'f_quality', free: false, pro: true, tag: 'soon', france: true },
    // Programme du Canal Pro et comparateur : rejetes au controle du 30/09/2026
    // (iashark-canal-pro-CONTROLE-avocat.md, iashark-comparateur-CONTROLE-avocat.md),
    // « Bientot » dans l'espace Pro (pro_space.locked_today, locked_comparator).
    { key: 'f_programme', free: false, pro: true, tag: 'soon', france: true },
    { key: 'f_comparator', free: false, pro: true, tag: 'soon', bookmakers: true },
    // Alertes : envoyees par le robot Telegram, pas encore ouvertes aux abonnes.
    { key: 'f_alerts', free: false, pro: true, tag: 'soon', france: true },
    { key: 'f_channel', free: false, pro: true, tag: 'soon', france: true },
    { key: 'f_robot', free: false, pro: true, tag: 'soon', france: true }
  ];

  // Comparateur : la liste de bookmakers agrees n'existe que pour la France
  // (config/bookmakers-agrees.json#pays : fr = operateurs ANJ ; gb, mx, za,
  // autre = liste vide ; aucune pour les Etats-Unis). Marche euro « fr » ET
  // pages en francais : les versions es/de/it/pt du marche euro visent un
  // public international (aide jeu internationale, config/markets.json#_dirs).
  // tests/pricing-grid.test.js verifie que la liste des pays n'a pas change.
  function comparatorOpen(market) {
    return !!market && market.code === 'fr' && market.locale === 'fr';
  }
  // france : « bientot » qui n'arrivera qu'en France (programme et Canal Pro,
  // qualite des cotes, alertes, robot Telegram : le robot repond « pays pas
  // encore ouvert » partout ailleurs). Contre-controle, ronde 3 : jamais
  // annonce la ou le paiement est ouvert sans que ce soit tenu (gb, mx, za,
  // /en/ ; /es/ traite comme international, decision de Clement a confirmer).
  function featuresFor(market) {
    var open = comparatorOpen(market);
    return FEATURES.filter(function (f) {
      return ((!f.bookmakers && !f.france) || open) && (!f.stats || STATS_IASHARK);
    }).map(function (f) {
      if (!f.simulation || SIMULATION === 'ouverte') return f;
      var g = {};
      for (var k in f) if (hasOwn.call(f, k)) g[k] = f[k];
      // Toute autre valeur que 'mention' ou 'ouverte' : « bientot » (le plus prudent).
      if (SIMULATION === 'mention') g.text = 'f_scenario_since';
      else g.tag = 'soon';
      return g;
    });
  }
  // Texte d'une ligne de la grille : sa cle (ou son texte de remplacement,
  // f.text) dans la langue de la page ; {date} = date de la simulation
  // (SIMULATION_DEPUIS), ecrite dans cette langue (« 3 octobre », « 3 October »).
  function featureText(f, t) {
    return fill(t(f.text || f.key), { date: dateLongue(SIMULATION_DEPUIS) });
  }
  function dateLongue(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    try { return new Intl.DateTimeFormat(locTag(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d); } catch (e) { return iso; }
  }

  /* ---------- utilitaires ---------- */
  // Typographie francaise : l'espace avant « : ; ! ? » devient insecable (plus
  // de « : aucun resultat n'est garanti » en debut de ligne sur telephone).
  // Sans effet en anglais (pas d'espace avant ces signes).
  function esc(v) {
    return String(v == null ? '' : v).replace(/ ([:;!?»])/g, function (m, p) { return '\u00a0' + p; }).replace(/« /g, '«\u00a0').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fill(s, vars) {
    return String(s == null ? '' : s).replace(/\{(\w+)\}/g, function (m, k) { return vars && hasOwn.call(vars, k) ? vars[k] : m; });
  }
  function dictGet(dict, path) {
    var cur = dict, parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object' || !hasOwn.call(cur, parts[i])) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  // Texte : libelles de la page > dictionnaire (pricing_grid.<cle>) > repli
  // francais. Lecture directe du dictionnaire : I18N.t() renvoie LA CLE quand
  // elle manque (bug du 18/09/2026, lib/pro-plan-picker.js#textFor).
  function textFor(key, labels) {
    if (labels && hasOwn.call(labels, key)) return labels[key];
    var I = global.I18N;
    if (I && I.dict) {
      var v = dictGet(I.dict, 'pricing_grid.' + key);
      if (typeof v === 'string' && v) return v;
    }
    return FALLBACK[key];
  }
  function lien(p) {
    var I = global.I18N;
    if (I && typeof I.href === 'function') {
      try { var out = I.href(p); if (out) return String(out); } catch (e) {}
    }
    return '/' + p;
  }
  function locTag() {
    var I = global.I18N;
    try { if (I && typeof I.localeTag === 'function') return I.localeTag(); } catch (e) {}
    return 'fr-FR';
  }

  /* ---------- donnees : l'offre du marche ---------- */
  // availability = {week|month|year: false} pour une duree fermee par le
  // serveur. Une duree est proposee si elle a un prix, est ouverte dans la
  // configuration (checkoutOpen) et n'est pas fermee par le serveur.
  function offerModel(market, opts, availability) {
    opts = opts || {};
    availability = availability || {};
    var offer = market && typeof market.proOffer === 'function' ? market.proOffer() : { intervals: [], defaultInterval: 'month' };
    var items = {};
    offer.intervals.forEach(function (it) { items[it.interval] = it; });
    function payable(iv) {
      var it = items[iv];
      return !!(it && it.amount != null && it.text && it.open !== false && availability[iv] !== false);
    }
    var visible = INTERVALS.filter(payable);
    var annual = opts.annual === true && payable('year') && payable('month');
    var weekly = opts.weekly !== false && payable('week') && (payable('month') || payable('year'));
    var free = market && typeof market.formatPrice === 'function' ? market.formatPrice('free') : null;
    return {
      currency: (market && market.currency) || 'EUR',
      features: featuresFor(market),
      items: items,
      visible: visible,
      annual: annual,
      weekly: weekly,
      savingsPct: annual && items.year ? items.year.savingsPct : null,
      free: free,
      closed: visible.length === 0,
      defaultInterval: offer.defaultInterval || 'month'
    };
  }
  // Duree affichee dans la carte Pro : state = {cycle: "month"|"year", weekly}.
  function resolveInterval(model, state) {
    if (!model || model.closed) return null;
    state = state || {};
    var v = model.visible;
    if (state.weekly && model.weekly) return 'week';
    if (state.cycle === 'year' && model.annual) return 'year';
    if (v.indexOf('month') !== -1) return 'month';
    // Pas de mois payable : la premiere duree payable (jamais une duree fermee).
    return v[0];
  }
  function stateFor(model, interval) {
    return { cycle: interval === 'year' && model.annual ? 'year' : 'month', weekly: interval === 'week' && model.weekly };
  }
  // Durees proposees dans le choix de la duree (Semaine, Mois, Annee) : les
  // durees payables permises par les options ; aucun choix s'il n'y en a qu'une.
  function durationsOf(model) {
    if (!model || model.closed) return [];
    var out = [];
    if (model.weekly) out.push('week');
    if (model.visible.indexOf('month') !== -1) out.push('month');
    if (model.annual) out.push('year');
    return out.length > 1 ? out : [];
  }
  // Prix affiche pour une duree. En annuel : le montant REELLEMENT preleve en
  // grand (« 199 € / an », le prix Stripe), l'equivalent mensuel seulement
  // en petit, comme information (CGV, article 6).
  function priceView(model, iv, t) {
    var it = model.items[iv];
    if (!it) return null;
    if (iv === 'year') {
      var pct = it.savingsPct;
      return {
        main: it.text,
        per: t('per_year'),
        // Arrondis de market-config.js, les memes que les CGV (article 6 :
        // « 16,59 € par mois, soit 16 % de moins ») : toujours dans le sens le
        // MOINS flatteur pour l'offre (cout mensuel au centime superieur,
        // economie au % inferieur). Ne pas passer a 16,58 € sans changer les CGV.
        sub: pct != null && it.monthlyEquivalentText ? fill(t('billed_annual'), { monthly: it.monthlyEquivalentText, pct: pct }) : t('billed_annual_nosave'),
        charge: it.text, chargePer: t('per_year')
      };
    }
    return { main: it.text, per: t('per_' + iv), sub: t('billed_' + iv), charge: it.text, chargePer: t('per_' + iv) };
  }

  /* ---------- briques visuelles ---------- */
  var ICON_CHECK = '<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" class="mt-[1px] h-[18px] w-[18px] shrink-0"><circle cx="10" cy="10" r="9" class="fill-cyan/15"/><path d="M6 10.3l2.6 2.6L14.2 7.3" fill="none" class="stroke-cyan" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // « Bientot » : horloge (pas une coche), jamais annoncee « Inclus ».
  var ICON_SOON = '<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" class="mt-[1px] h-[18px] w-[18px] shrink-0"><circle cx="10" cy="10" r="8.2" fill="none" class="stroke-soft/60" stroke-width="1.5" stroke-dasharray="2.4 2.2"/><path d="M10 6.3V10l2.5 1.7" fill="none" class="stroke-cyan" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Titre de « Bientot dans Pro » : horloge pleine, lisible (plus un lien gris
  // qui avait l'air desactive).
  var ICON_SOON_HEAD = '<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" class="h-4 w-4 shrink-0"><circle cx="10" cy="10" r="8" fill="none" class="stroke-cyan" stroke-width="1.7"/><path d="M10 6.2V10l2.6 1.8" fill="none" class="stroke-cyan" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_CHEVRON = '<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" class="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180"><path d="M5.5 8l4.5 4.5L14.5 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function tagHtml(tag, t) {
    if (!tag) return '';
    return ' <span class="ml-1 inline-flex translate-y-[-1px] items-center rounded-full border border-hairline px-1.5 py-px align-middle text-[11px] font-semibold leading-4 text-soft">' + esc(t(tag === 'test' ? 'tag_test' : 'tag_soon')) + '</span>';
  }
  function isSoon(f) { return f.tag === 'soon'; }
  // Texte d'une ligne : un mot compose (« garde-fou », « face-à-face ») n'est
  // jamais coupe en fin de ligne.
  function unbroken(text) {
    return esc(text).replace(/[0-9A-Za-zÀ-ÖØ-öø-ÿ]+(?:-[0-9A-Za-zÀ-ÖØ-öø-ÿ]+)+/g, function (w) { return '<span class="whitespace-nowrap">' + w + '</span>'; });
  }
  // Une fonction incluse : coche ; « bientot » : horloge et « pas encore
  // disponible » (jamais « Inclus »). noTag : deja sous « Bientot dans Pro ».
  function featureItem(f, t, noTag) {
    var soon = isSoon(f);
    return '<li class="flex items-start gap-2.5 text-[14px] leading-snug [text-wrap:pretty] ' + (soon ? 'text-soft' : 'text-ink') + '">'
      + (soon ? ICON_SOON : ICON_CHECK)
      + '<span>' + unbroken(featureText(f, t)) + tagHtml(noTag ? null : f.tag, t)
      + '<span class="sr-only"> : ' + esc(t(soon ? 'not_yet' : 'included')) + '</span></span></li>';
  }
  var BTN_PRO = 'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-cyan px-5 py-3 text-center text-[15px] font-bold text-[#04141b] no-underline shadow-[0_14px_32px_-18px_rgba(32,213,239,.85)] transition hover:brightness-110 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan active:scale-[.985]';
  var BTN_FREE = 'inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-white/15 bg-white/[.03] px-5 py-3 text-center text-[15px] font-semibold text-ink no-underline transition hover:border-cyan/50 hover:bg-white/[.06] hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan';
  var PILL = 'shrink-0 whitespace-nowrap rounded-full bg-cyan px-2.5 py-0.5 text-[12px] font-bold leading-5 text-[#04141b]';

  // Choix de la duree : UN seul controle (boutons radio), chaque duree avec
  // son prix ; l'economie de l'annee en pastille DANS la case, a cote du prix
  // (elle ne deborde plus sur le bord du selecteur). Fleches, Debut, Fin.
  function durationsHtml(model, iv, t, margin) {
    var list = durationsOf(model);
    if (!list.length) return '';
    return '<div role="radiogroup" aria-label="' + esc(t('dur_aria')) + '" class="' + (margin == null ? 'mt-4' : margin) + ' grid ' + (list.length === 3 ? 'grid-cols-3' : 'grid-cols-2') + ' gap-1 rounded-xl border border-hairline bg-black/20 p-1" data-pg-durations>'
      + list.map(function (d) {
        var on = d === iv;
        var save = d === 'year' && model.savingsPct != null
          ? '<span class="whitespace-nowrap rounded-full bg-cyan px-1.5 text-[10.5px] font-bold leading-4 text-[#04141b]">' + esc(fill(t('save_short'), { pct: model.savingsPct })) + '</span>'
          : '';
        return '<button type="button" role="radio" aria-checked="' + (on ? 'true' : 'false') + '" tabindex="' + (on ? '0' : '-1') + '" data-pg-dur="' + d + '"'
          + ' class="flex min-h-[52px] min-w-0 cursor-pointer flex-col items-center justify-center rounded-lg px-1 py-1.5 text-center leading-tight text-soft transition-colors hover:text-ink aria-checked:bg-cyan/[.14] aria-checked:text-ink aria-checked:shadow-[inset_0_0_0_1px_rgba(32,213,239,.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan">'
          + '<span class="text-[13.5px] font-semibold">' + esc(t('dur_' + d)) + '</span>'
          + '<span class="mt-0.5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[12px] tabular-nums"><span class="opacity-80">' + esc(model.items[d].text) + '</span>' + save + '</span></button>';
      }).join('') + '</div>';
  }

  // Prix en grand et mention de prelevement (sans « sans engagement » : dit
  // une seule fois par ecran, dans la ligne de confiance ou sous la grille).
  function priceBlock(model, iv, t, size) {
    if (!iv) return '<p class="rounded-xl border border-hairline px-4 py-3 text-[13.5px] leading-relaxed text-soft" role="status">' + esc(t('closed')) + '</p>';
    var p = priceView(model, iv, t);
    var big = size === 'sm' ? 'text-[30px]' : 'text-[40px] sm:text-[44px]';
    return '<div class="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">'
      + '<span class="pg-amount ' + big + ' font-extrabold leading-none tracking-[-0.035em] text-ink tabular-nums" data-pg-amount>' + esc(p.main) + '</span>'
      + '<span class="text-[15px] font-medium text-soft">' + esc(p.per) + '</span></div>'
      + '<p class="mt-2 text-[13px] leading-snug text-soft [text-wrap:pretty]" data-pg-billed>' + esc(p.sub) + '</p>';
  }

  // Bouton de la carte Pro selon la session : abonne = gerer ; essai confirme
  // par le serveur = « Commencer l'essai gratuit » ; sinon « Devenir Pro ».
  function proCta(ctx, iv, t, trial) {
    if (!iv) return '';
    if (ctx.isPro) return '<a class="' + BTN_PRO + '" href="' + esc(lien('compte.html#abonnement')) + '">' + esc(t('cta_manage')) + '</a>';
    var label = ctaText(ctx, iv, t, trial);
    return '<a class="' + BTN_PRO + '" href="' + esc(ctx.href(iv)) + '" data-pg-cta' + (ctx.track ? ' data-track="' + esc(ctx.track) + '" data-track-kind="' + esc(ctx.track) + '"' : '') + '>' + esc(label) + ' <span aria-hidden="true">→</span></a>';
  }
  // Libelle du bouton : celui de la page (ctaLabel), sinon « Commencer l'essai
  // gratuit » sur le mois quand l'essai est annonce, sinon « Devenir Pro ».
  function ctaText(ctx, iv, t, trial) {
    return ctx.ctaLabel || (trialOn(trial, iv) ? t('cta_trial') : t('cta_pro'));
  }
  function trialNote(model, iv, t, trial, ctx) {
    if (!trialOn(trial, iv) || ctx.isPro || ctx.checkout) return '';
    return '<p class="mt-2.5 text-center text-[12.5px] leading-snug text-soft" data-pg-trial-note>' + esc(trialText(model, iv, t, trial)) + '</p>';
  }
  // Encart d'essai au-dessus du paiement (pages de paiement sans le leur).
  function trialBox(model, iv, t, trial, ctx) {
    if (!trialOn(trial, iv) || ctx.isPro || !ctx.checkout || ctx.ownTrial) return '';
    var p = priceView(model, iv, t);
    return '<div class="mb-4 rounded-xl border border-cyan/25 bg-cyan/[.05] px-4 py-3.5 text-left" data-pg-trial-note>'
      + '<p class="m-0 text-[13.5px] font-bold text-cyan">' + esc(fill(t('trial_short'), { days: trial })) + '</p>'
      + '<p class="m-0 mt-1 text-[12.5px] leading-relaxed text-soft">' + esc(fill(t('trial_terms'), { price: p.charge, per: p.chargePer })) + '</p></div>';
  }
  // Ligne de confiance sous le bouton de paiement (pages de paiement qui n'ont
  // pas la leur : compte, landings gb/za/mx). Annuel : seulement « paiement
  // securise » (CGV : 12 mois payes d'avance, ni « sans engagement » ni
  // « resiliable a tout moment »). Meme rendu que .trust-row de abonnement.html :
  // une ligne quand sa colonne est assez large, sinon une colonne (jamais
  // « Resiliable a tout moment » seul sur la deuxieme ligne) : requete de
  // conteneur dans assets/src/tailwind.css (.pg-trust).
  function trustHtml(t, iv) {
    var items = [['▣', 'trust_secure']];
    if (iv !== 'year') items.push(['◇', 'trust_free'], ['↻', 'trust_cancel']);
    return '<ul class="pg-trust m-0 mt-3 list-none p-0 text-[12px] leading-snug text-soft" data-pg-trust>'
      + items.map(function (i) { return '<li class="inline-flex items-center gap-1.5 whitespace-nowrap"><span aria-hidden="true">' + i[0] + '</span>' + esc(t(i[1])) + '</li>'; }).join('') + '</ul>';
  }

  function freeFeatures(model) { return model.features.filter(function (f) { return f.free; }); }
  // Le Gratuit, sur une ligne sous la carte Pro (toutes les pages : un seul
  // dessin, un seul texte). Prix « 0 € » sans « / mois ». Compte connecte :
  // « Ton offre actuelle » en pastille a cote du titre, pas de bouton.
  function freeStrip(model, t, ctx) {
    var items = freeFeatures(model).map(function (f) { return featureItem(f, t); }).join('');
    var current = ctx.loggedIn && !ctx.isPro;
    var cta = ctx.isPro || current ? '' : '<a class="' + BTN_FREE + '" href="' + esc(ctx.freeHref) + '">' + esc(t('free_cta')) + '</a>';
    return '<article class="mt-4 flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-5 sm:px-7 md:flex-row md:items-center md:justify-between md:gap-8" aria-labelledby="' + ctx.uid + '-free">'
      + '<div class="min-w-0 flex-1">'
      + '<div class="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 id="' + ctx.uid + '-free" class="m-0 text-[16px] font-bold text-ink">' + esc(t('free_name')) + '</h3>'
      + '<span class="text-[16px] font-bold text-ink tabular-nums">' + esc(model.free || '0') + '</span>'
      + '<span class="text-[13px] text-soft"><span class="hidden sm:inline" aria-hidden="true">· </span>' + esc(t('free_note')) + '</span>'
      + (current ? '<span class="ml-1 whitespace-nowrap rounded-full border border-hairline bg-white/[.04] px-2.5 py-0.5 text-[12px] font-semibold leading-5 text-soft">' + esc(t('current')) + '</span>' : '') + '</div>'
      + '<ul class="m-0 mt-3 grid list-none grid-cols-1 gap-2 p-0 lg:grid-cols-3 lg:gap-x-6">' + items + '</ul></div>'
      + (cta ? '<div class="shrink-0 md:w-[260px]">' + cta + '</div>' : '')
      + '</article>';
  }

  function proHeader(t, ctx) {
    // Plus de pastille « Recommande » : c'est la seule offre payante. Abonne :
    // « Ton offre actuelle ».
    return '<div class="flex items-center justify-between gap-3"><h3 id="' + ctx.uid + '-pro" class="m-0 text-[17px] font-bold leading-snug text-ink">' + esc(t('pro_name')) + '</h3>'
      + (ctx.isPro ? '<span class="' + PILL + '">' + esc(t('current')) + '</span>' : '') + '</div>'
      + '<p class="mt-1 text-[13.5px] leading-snug text-soft">' + esc(t('pro_desc')) + '</p>';
  }
  // Fonctions reservees a Pro : ouvertes (cochees), puis « Bientot dans Pro »
  // replie (horloge, jamais « Inclus »), en bouton lisible.
  function proFeatures(model, t) {
    var proOnly = model.features.filter(function (f) { return f.pro && !f.free; });
    var open = proOnly.filter(function (f) { return !isSoon(f); }).map(function (f) { return featureItem(f, t); }).join('');
    var soon = proOnly.filter(isSoon).map(function (f) { return featureItem(f, t, true); }).join('');
    return '<p class="m-0 text-[13px] font-semibold text-ink">' + esc(t('pro_plus')) + '</p>'
      + '<ul class="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">' + open + '</ul>'
      + (soon ? '<details class="group mt-4" data-pg-soon><summary class="inline-flex min-h-[36px] cursor-pointer list-none items-center gap-2 rounded-lg border border-cyan/25 bg-cyan/[.06] px-3 text-[13px] font-semibold text-ink transition-colors hover:border-cyan/50 hover:bg-cyan/[.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan [&::-webkit-details-marker]:hidden">'
        + ICON_SOON_HEAD + '<span>' + esc(t('soon_title')) + '</span>' + ICON_CHEVRON + '</summary>'
        + '<ul class="m-0 mt-3 flex list-none flex-col gap-2 p-0">' + soon + '</ul></details>' : '');
  }
  var PRO_BOX = 'relative rounded-2xl border border-cyan/50 bg-gradient-to-b from-[#0c2434] via-[#0a1826] to-surface shadow-[0_24px_70px_-46px_rgba(32,213,239,.7)]';
  // Colonnes de la carte Pro (des 768 px ; une seule colonne sur telephone,
  // dans l'ordre du HTML). Trait vertical porte par la colonne de droite.
  var COL_L = 'min-w-0 md:col-start-1 md:pr-8';
  var COL_R = 'min-w-0 md:col-start-2 md:border-l md:border-cyan/15 md:pl-8';

  // Carte Pro, UN seul dessin partout (controle des captures du 30/09/2026 :
  // trou sous le paiement, bouton pousse en bas, 3 versions de la liste) :
  // - "paiement" (abonnement, compte, landings gb/za/mx) : a gauche le prix
  //   puis ce que Pro ajoute ; a droite le choix de la duree puis le paiement
  //   de la page (slot : consentement, bouton, reassurance), centre en
  //   hauteur. Sans choix de duree (une seule duree payable) : le prix passe
  //   a droite, au-dessus du paiement, et la liste occupe la gauche.
  //   Telephone : prix, duree, liste, paiement.
  // - "carte" (accueil, landings) : a gauche le prix, la duree et le bouton
  //   JUSTE dessous ; a droite ce que Pro ajoute. Telephone : prix, duree,
  //   liste, bouton.
  function proCard(model, iv, t, ctx, trial, layout) {
    var price = '<div data-pg-price aria-live="polite" aria-atomic="true">' + priceBlock(model, iv, t) + '</div>';
    var hasD = durationsOf(model).length > 0;
    var same = hasD && !ctx.ownNote ? '<p class="m-0 mt-2.5 text-[12.5px] leading-snug text-soft [text-wrap:pretty]" data-pg-same>' + esc(t('same_access')) + '</p>' : '';
    var open = '<article class="' + PRO_BOX + ' p-5 sm:p-7" aria-labelledby="' + ctx.uid + '-pro">' + proHeader(t, ctx);
    if (ctx.noFeatures) {
      return open + '<div class="mt-5">' + price + durationsHtml(model, iv, t) + same + '</div>'
        + '<div class="mt-6" data-pg-cta-box>' + (ctx.checkout ? '<div data-pg-slot class="flex flex-col"></div>' : proCta(ctx, iv, t, trial)) + '<div data-pg-note>' + trialNote(model, iv, t, trial, ctx) + '</div></div></article>';
    }
    var list = proFeatures(model, t);
    var grid = '<div class="mt-6 grid grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_1fr]">';
    if (layout === 'paiement') {
      // Pas de trait vertical ici : les textes legaux du paiement changent de
      // longueur selon le pays (Mexique : un paragraphe de plus) et le trait
      // faisait ressortir la moindre difference de hauteur. Colonne de
      // paiement un peu plus large : consentement moins haut.
      var pgrid = '<div class="mt-6 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:grid-rows-[auto_1fr] md:gap-x-12">';
      var L1 = 'min-w-0 md:col-start-1', R1 = 'min-w-0 md:col-start-2';
      var pay = '<div data-pg-trial-box>' + trialBox(model, iv, t, trial, ctx) + '</div><div data-pg-slot class="flex flex-col"></div><div data-pg-trust-box>' + (ctx.showTrust ? trustHtml(t, iv) : '') + '</div><div data-pg-note></div>';
      var listCell = '<div class="' + L1 + ' md:row-start-2 border-t border-cyan/15 pb-6 pt-5 md:pb-0">' + list + '</div>';
      if (hasD) {
        return open + pgrid
          + '<div class="' + L1 + ' md:row-start-1 pb-5">' + price + '</div>'
          + '<div class="' + R1 + ' md:row-start-1 pb-6 md:pb-5">' + durationsHtml(model, iv, t, 'm-0') + same + '<div data-pg-place-durations></div></div>'
          + listCell
          + '<div class="' + R1 + ' md:row-start-2 flex flex-col border-t border-cyan/15 pt-6 md:justify-center md:border-t-0 md:pt-5" data-pg-cta-box>' + pay + '</div>'
          + '</div></article>';
      }
      // Une seule duree payable (gb) : le prix puis la liste a gauche, le
      // paiement a droite sur toute la hauteur, centre.
      return open + pgrid
        + '<div class="' + L1 + ' md:row-start-1 pb-5">' + price + '<div data-pg-place-durations></div></div>'
        + listCell
        + '<div class="' + R1 + ' md:row-span-2 md:row-start-1 flex flex-col border-t border-cyan/15 pt-6 md:justify-center md:border-t-0 md:pt-0" data-pg-cta-box>' + pay + '</div>'
        + '</div></article>';
    }
    var cta = ctx.checkout ? '<div data-pg-slot class="flex flex-col"></div>' : proCta(ctx, iv, t, trial);
    return open + grid
      + '<div class="' + COL_L + ' md:row-start-1">' + price + durationsHtml(model, iv, t, 'mt-5') + same + '</div>'
      + '<div class="' + COL_R + ' md:row-span-2 md:row-start-1 mt-6 border-t border-cyan/15 pt-5 md:mt-0 md:border-t-0 md:pt-0">' + list + '</div>'
      + '<div class="' + COL_L + ' md:row-start-2 pt-6 md:pt-5" data-pg-cta-box>' + cta + '<div data-pg-note>' + trialNote(model, iv, t, trial, ctx) + '</div></div>'
      + '</div></article>';
  }

  // Ligne de conditions sous la grille. Page de paiement (reassurance sous le
  // bouton, celle de la page ou celle de la grille) : pas de doublon, seulement
  // la mention honnete (et, en annuel, les conditions de la formule annuelle).
  // Ailleurs : « sans engagement » dit ICI seulement (la carte ne le repete
  // plus). Annuel : jamais « sans engagement » (CGV : periode payee pour douze
  // mois, reconduite sauf resiliation).
  function footerHtml(model, t, trial, iv, ctx) {
    if (model.closed) return '<p class="m-0">' + esc(t('footer_honest')) + '</p>';
    var trusted = ctx && (ctx.hasTrust || ctx.showTrust);
    var base = iv === 'year' ? (trusted ? t('footer_annual_terms') : t('footer_base_annual')) : (trusted ? '' : t('footer_base'));
    return (trialOn(trial, iv) && !(ctx && ctx.isPro) ? '<p class="m-0 text-ink/90" data-pg-footer-trial>' + esc(fill(t('footer_trial_month'), { days: trial })) + '</p>' : '')
      + (base ? '<p class="m-0" data-pg-footer-base>' + esc(fill(base, { currency: model.currency })) + '</p>' : '')
      + '<p class="m-0">' + esc(t('footer_honest')) + '</p>';
  }

  // Etat lisible sur la racine (tests de bout en bout, outils) : durees
  // proposees et duree affichee.
  function stateAttrs(model, iv) {
    return ' data-pg-intervals="' + model.visible.join(' ') + '" data-pg-interval="' + (iv || '') + '"';
  }
  // HTML complet d'une variante. ctx : {uid, variant, heading, checkout,
  // hasTrust, showTrust, ownNote, isPro, loggedIn, href(iv), freeHref, track,
  // ctaLabel}.
  function buildHtml(model, state, t, ctx) {
    var iv = resolveInterval(model, state);
    var trial = ctx.trialDays;
    var v = ctx.variant || 'complet';
    if (v === 'prix') {
      return '<div class="pg-root mt-3" data-pg-variant="prix"' + stateAttrs(model, iv) + '>'
        + '<div data-pg-price aria-live="polite" aria-atomic="true">' + priceBlock(model, iv, t, 'sm') + '</div>'
        + durationsHtml(model, iv, t) + '<div data-pg-note></div></div>';
    }
    if (v === 'ligne') {
      if (!iv) return '<div class="pg-root" data-pg-variant="ligne"' + stateAttrs(model, iv) + '><p class="m-0 text-center text-[13px] text-soft">' + esc(t('closed')) + '</p></div>';
      var p = priceView(model, iv, t);
      // Ligne courte (telephone : « semaine » n'est plus seul sur sa ligne) :
      // chaque prix et sa duree ne se coupent jamais.
      var wk = model.weekly && iv !== 'week' ? ' <span class="whitespace-nowrap text-soft">· ' + esc(fill(t('line_or_week'), { price: model.items.week.text })) + '</span>' : '';
      // Essai : memes conditions que partout (carte demandee, reserve a un
      // premier abonnement) ; annuel : jamais « sans engagement ».
      var note = trialOn(trial, iv) && !ctx.isPro
        ? trialText(model, iv, t, trial)
        : (iv === 'year' ? p.sub : t('line_free_note'));
      return '<div class="pg-root flex flex-col items-center gap-2.5 text-center" data-pg-variant="ligne"' + stateAttrs(model, iv) + '>'
        + '<p class="m-0 text-[14px] leading-snug text-ink [text-wrap:balance]"><span class="whitespace-nowrap"><b class="text-[19px] font-extrabold tabular-nums" data-pg-amount>' + esc(p.main) + '</b> <span class="text-soft">' + esc(p.per) + '</span></span>' + wk + '</p>'
        // ctaClass : style de bouton de la page hote (mur Pro de la page match).
        + (ctx.isPro || ctx.noCta ? '' : '<a class="' + (ctx.ctaClass ? esc(ctx.ctaClass) : BTN_PRO + ' sm:w-auto sm:min-w-[260px]') + '" href="' + esc(ctx.href(iv)) + '" data-pg-cta' + (ctx.track ? ' data-track="' + esc(ctx.track) + '" data-track-kind="' + esc(ctx.track) + '"' : '') + '>' + esc(ctaText(ctx, iv, t, trial)) + ' <span aria-hidden="true">→</span></a>')
        + '<p class="m-0 max-w-[420px] text-[12.5px] leading-snug text-soft [text-wrap:balance]">' + esc(note) + '</p></div>';
    }
    if (v === 'rappel') {
      // Duree de l'abonnement lue dans le compte : son prix, ou rien (jamais
      // le prix d'une autre duree a la place).
      var ri = ctx.interval ? ctx.interval : iv;
      if (!ri || !model.items[ri] || model.items[ri].amount == null || !model.items[ri].text) return '';
      var rp = priceView(model, ri, t);
      var date = '';
      if (ctx.trialEnd) { try { date = new Intl.DateTimeFormat(locTag(), { day: 'numeric', month: 'long' }).format(new Date(ctx.trialEnd)); } catch (e) { date = ''; } }
      var txt = ctx.trialEnd && date
        ? fill(t('recap_trial'), { date: date, price: rp.charge, per: rp.chargePer })
        : fill(t('recap_paid'), { price: rp.charge, per: rp.chargePer });
      return '<div class="pg-root rounded-2xl border border-cyan/30 bg-cyan/[.05] px-4 py-3.5 text-left" data-pg-variant="rappel"' + stateAttrs(model, ri) + '>'
        + '<p class="m-0 text-[13px] font-semibold text-cyan">' + esc(t('recap_title')) + ' · ' + esc(t('pro_name')) + '</p>'
        + '<p class="m-0 mt-1 text-[13.5px] leading-relaxed text-ink">' + esc(txt) + '</p></div>';
    }
    if (v === 'carte') {
      return '<div class="pg-root" data-pg-variant="carte"' + stateAttrs(model, iv) + '>' + proCard(model, iv, t, ctx, trial, ctx.checkout ? 'paiement' : 'carte')
        + (trialOn(trial, iv) && !ctx.isPro ? '<p class="m-0 mt-3 text-[12px] leading-relaxed text-soft" data-pg-footer-trial>' + esc(fill(t('footer_trial_month'), { days: trial })) + '</p>' : '') + '</div>';
    }
    // Complet : la carte Pro sur toute la largeur, puis le Gratuit sur une
    // ligne, sur TOUTES les pages (accueil, landings, abonnement, compte,
    // landings pays) ; seule la colonne de droite change (bouton ou paiement).
    var head = ctx.heading === false ? '' : '<div class="mx-auto mb-8 max-w-[640px] text-center">'
      + '<h2 class="m-0 text-[clamp(26px,3.2vw,38px)] font-extrabold leading-[1.12] tracking-[-0.035em] text-ink">' + esc(ctx.title || t('title')) + '</h2>'
      + '<p class="mx-auto mt-3 max-w-[560px] text-[15px] leading-relaxed text-soft">' + esc(ctx.subtitle || t('subtitle')) + '</p></div>';
    var layout = ctx.checkout ? 'paiement' : 'cartes';
    var body = proCard(model, iv, t, ctx, trial, ctx.checkout ? 'paiement' : 'carte') + freeStrip(model, t, ctx);
    return '<div class="pg-root w-full" data-pg-variant="complet" data-pg-layout="' + layout + '"' + stateAttrs(model, iv) + '>' + head + body
      + '<div class="mx-auto mt-5 flex max-w-[760px] flex-col gap-1 text-center text-[12.5px] leading-relaxed text-soft [text-wrap:balance]" data-pg-footer>' + footerHtml(model, t, trial, iv, ctx) + '</div></div>';
  }

  /* ---------- disponibilites du serveur ---------- */
  // Meme appel que lib/pro-plan-picker.js#fetchAvailability (mode
  // "availability" de create-checkout-session, sans compte ni Price) : durees
  // payables et jours d'essai. Une seule requete par marche et par page.
  var cache = {};
  // Pages sans app-client.js (landings fr/en/es) : assets/compte-leger.js
  // (meme URL et meme cle publique, session lue sans supabase-js).
  var legerEnCours = null;
  function compteLeger() {
    if (global.IasharkCompteLeger) return Promise.resolve(global.IasharkCompteLeger);
    var doc = global.document;
    if (!doc || !doc.createElement) return Promise.resolve(null);
    if (!legerEnCours) {
      legerEnCours = new Promise(function (resolve) {
        var s = doc.createElement('script');
        s.src = '/assets/compte-leger.js';
        s.onload = function () { resolve(global.IasharkCompteLeger || null); };
        s.onerror = function () { resolve(null); };
        (doc.head || doc.documentElement).appendChild(s);
      });
    }
    return legerEnCours;
  }
  function fetchAvailability(market) {
    var App = global.IasharkApp;
    var key = (market && market.checkoutMarket) || 'default';
    if ((!App || !App.url || !App.key) && typeof global.fetch === 'function' && global.document && !cache[key]) {
      cache[key] = compteLeger().then(function (C) { return C ? demanderDisponibilites(C, market) : { asked: false, intervals: null, trialDays: null }; });
    }
    if (cache[key]) return cache[key];
    if (!App || !App.url || !App.key || typeof global.fetch !== 'function') return Promise.resolve({ asked: false, intervals: null, trialDays: null });
    cache[key] = demanderDisponibilites(App, market);
    return cache[key];
  }
  function demanderDisponibilites(App, market) {
    var body = { mode: 'availability' };
    if (market && market.checkoutMarket) body.market = market.checkoutMarket;
    var request = global.fetch(App.url + '/functions/v1/create-checkout-session', {
      method: 'POST',
      headers: { apikey: App.key, Authorization: 'Bearer ' + App.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      var ok = d && d.mode === 'availability';
      return {
        asked: true,
        intervals: ok && d.intervals && typeof d.intervals === 'object' ? d.intervals : null,
        trialDays: ok && typeof d.trial_days === 'number' && isFinite(d.trial_days) ? d.trial_days : null
      };
    }).catch(function () { return { asked: true, intervals: null, trialDays: null }; });
    var timer = null;
    var timeout = new Promise(function (resolve) {
      timer = setTimeout(function () { resolve({ asked: true, intervals: null, trialDays: null }); }, 8000);
      if (timer && typeof timer.unref === 'function') timer.unref();
    });
    return Promise.race([request, timeout]).then(function (m) { clearTimeout(timer); return m; });
  }
  // Reponse du serveur -> durees fermees. Pages de paiement (checkout) : meme
  // regle que lib/pro-plan-picker.js (reponse sans disponibilites = seul le
  // mensuel du marche par defaut, que toute version de la fonction facture au
  // bon prix). Pages d'information : sans reponse, la configuration decide
  // (null = rien a changer) ; le parcours de paiement reverifie tout.
  function availabilityFrom(r, market, checkout) {
    if (r && r.intervals) return r.intervals;
    if (r && r.asked && checkout) return { week: false, month: !(market && market.checkoutMarket), year: false };
    return null;
  }
  // Charge la feuille Tailwind si la page ne l'a pas (pages de retour de
  // paiement). La police reste celle de la page.
  function ensureStyles(doc) {
    if (!doc || !doc.querySelector || !doc.createElement) return;
    var head = doc.head || doc.documentElement;
    if (!doc.querySelector('link[href*=tailwind]')) {
      var l = doc.createElement('link');
      l.rel = 'stylesheet';
      l.href = '/assets/tailwind.css';
      head.appendChild(l);
    }
  }

  /* ---------- essai : a qui l'annoncer ---------- */
  // Jours d'essai a ANNONCER : ceux du serveur (trial_days > 0), et seulement
  // si la session est connue : visiteur non connecte (les conditions ecrites
  // disent « reserve a un premier abonnement ») ou compte connecte sans aucun
  // abonnement passe (trialOk === true). Abonne, ancien abonne, compte
  // illisible, session inconnue ou option showTrial=false : null (rien).
  function trialFor(days, session, showTrial) {
    if (showTrial === false || !(days > 0) || !session || !session.known || session.isPro) return null;
    if (session.loggedIn && session.trialOk !== true) return null;
    return days;
  }
  // Le compte a-t-il deja eu un abonnement ? Meme lecture que
  // abonnement-page.js#verifierCompteEssai (et que le serveur,
  // create-checkout-session/trial.ts) : aucune ligne = droit a l'essai ;
  // erreur = pas d'essai annonce. Une lecture par compte et par page.
  var eligibility = {};
  function trialEligibility(App, user) {
    if (!user) return Promise.resolve(true);
    var id = user.id;
    if (id && eligibility[id]) return eligibility[id];
    var p;
    if ((!App || !App.supabase) && global.IasharkCompteLeger) {
      p = global.IasharkCompteLeger.jamaisAbonne(user).then(function (ok) { return ok === true; }, function () { return false; });
      if (id) eligibility[id] = p;
      return p;
    }
    try {
      p = Promise.resolve(App.supabase.from('subscriptions').select('stripe_subscription_id', { count: 'exact', head: true }).eq('user_id', id))
        .then(function (r) { return !!r && !r.error && r.count === 0; }, function () { return false; });
    } catch (e) { p = Promise.resolve(false); }
    if (id) eligibility[id] = p;
    return p;
  }

  var counter = 0;

  function mount(el, options) {
    options = options || {};
    var market = options.market || global.IASHARK_MARKET;
    if (!el || !market || typeof market.proOffer !== 'function') return null;
    var doc = el.ownerDocument || global.document;
    ensureStyles(doc);
    var uid = 'pg' + (++counter);
    var availability = {};
    var trialDays = null;
    // known : session lue (App.context) ; trialOk : droit a l'essai du compte
    // connecte (null = pas encore lu : rien d'annonce).
    // loggedIn (option) : la page sait deja que le visiteur est connecte (compte) :
    // le Gratuit y est « Ton offre actuelle », sans bouton d'inscription.
    var session = { known: false, isPro: false, loggedIn: options.loggedIn === true, user: null, trialOk: null, checking: false };
    var closedByConfig = {};
    market.proOffer().intervals.forEach(function (i) { if (i.amount != null && i.open === false) closedByConfig[i.interval] = false; });
    var model = offerModel(market, options, availability);
    var state = stateFor(model, options.interval || model.defaultInterval);
    var slotNodes = options.slot ? [].concat(options.slot).filter(Boolean) : [];
    // La page affiche sa reassurance de paiement sous son bouton : le pied de
    // la grille ne la repete pas.
    var hasTrust = slotNodes.some(function (n) { return !!(n.classList && n.classList.contains('trust-row')); });
    // La page place sa propre phrase sous le choix de la duree (abonnement :
    // #proCommitment) : la grille n'ecrit pas la sienne.
    var ownNote = slotNodes.some(function (n) { return !!(n.getAttribute && n.getAttribute('data-pg-place') === 'durations'); });
    // La page a son propre encart d'essai (abonnement : #proTrialInfo ; compte) :
    // la grille ne dessine pas le sien.
    var ownTrial = options.ownTrial === true || slotNodes.some(function (n) { return !!(n.id === 'proTrialInfo' || (n.querySelector && n.querySelector('#proTrialInfo'))); });
    var ready = false;
    var lastIv = null;
    var t = function (k) { return textFor(k, options.labels); };
    var hrefFor = typeof options.href === 'function' ? options.href : function (iv) {
      var base = typeof options.href === 'string' ? options.href : lien('abonnement.html');
      return base + (base.indexOf('?') === -1 ? '?' : '&') + 'interval=' + encodeURIComponent(iv);
    };

    function ctx() {
      return {
        uid: uid, variant: options.variant || 'complet',
        heading: options.heading, title: options.title, subtitle: options.subtitle,
        checkout: !!options.checkout, hasTrust: hasTrust, isPro: session.isPro, loggedIn: session.loggedIn, ownNote: ownNote, ownTrial: ownTrial,
        // Ligne de confiance de la grille : page de paiement sans la sienne.
        showTrust: !!options.checkout && !hasTrust && !session.isPro && !!current(),
        href: hrefFor, freeHref: options.freeHref || lien('inscription.html'), track: options.track,
        ctaLabel: options.ctaLabel, trialDays: trialFor(trialDays, session, options.showTrial),
        noFeatures: options.noFeatures, noCta: !!options.noCta, ctaClass: options.ctaClass, interval: options.interval, trialEnd: options.trialEnd
      };
    }
    function current() { return resolveInterval(model, state); }

    // Elements de la page places dans la carte Pro : sous le choix de la duree
    // (data-pg-place="durations") ou dans la colonne de paiement.
    function placeSlot() {
      var slot = el.querySelector('[data-pg-slot]');
      var under = el.querySelector('[data-pg-place-durations]');
      slotNodes.forEach(function (n) {
        var target = n.getAttribute && n.getAttribute('data-pg-place') === 'durations' && under ? under : slot;
        if (target) target.appendChild(n);
      });
    }
    // Premier rendu : tout le composant ; ensuite, seules les parties qui
    // changent (le focus clavier reste sur le choix de la duree).
    function render() {
      ready = true;
      model = offerModel(market, options, availability);
      slotNodes.forEach(function (n) { if (n.parentNode && el.contains(n)) n.parentNode.removeChild(n); });
      el.innerHTML = buildHtml(model, state, t, ctx());
      placeSlot();
      syncYear(current());
      bind();
      notify(true);
    }
    // Elements [data-pg-hide-year] (reassurance « Sans engagement » de la page,
    // deplacee dans la carte Pro) : masques en annuel (CGV : 12 mois payes).
    function syncYear(iv) {
      Array.prototype.forEach.call(el.querySelectorAll('[data-pg-hide-year]'), function (n) { n.hidden = iv === 'year'; });
    }
    function update(focusSel) {
      var iv = current();
      var c = ctx();
      Array.prototype.forEach.call(el.querySelectorAll('[data-pg-dur]'), function (b) {
        var on = b.getAttribute('data-pg-dur') === iv;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.setAttribute('tabindex', on ? '0' : '-1');
      });
      var price = el.querySelector('[data-pg-price]');
      if (price) {
        price.innerHTML = priceBlock(model, iv, t, c.variant === 'prix' ? 'sm' : null);
        var amt = price.querySelector('[data-pg-amount]');
        if (amt && !reducedMotion()) { amt.classList.remove('pg-pop'); void amt.offsetWidth; amt.classList.add('pg-pop'); }
      }
      var cta = el.querySelector('[data-pg-cta]');
      if (cta && iv) {
        cta.setAttribute('href', c.href(iv));
        // Semaine ou annee : plus de « Commencer l'essai gratuit » (essai = mois seulement).
        cta.innerHTML = esc(ctaText(c, iv, t, c.trialDays)) + ' <span aria-hidden="true">→</span>';
      }
      var tbox = el.querySelector('[data-pg-trial-box]');
      if (tbox) tbox.innerHTML = trialBox(model, iv, t, c.trialDays, c);
      var note = el.querySelector('[data-pg-note]');
      if (note && c.variant !== 'prix') note.innerHTML = trialNote(model, iv, t, c.trialDays, c);
      var root = el.querySelector('.pg-root');
      if (root) root.setAttribute('data-pg-interval', iv || '');
      var trust = el.querySelector('[data-pg-trust-box]');
      if (trust) trust.innerHTML = c.showTrust ? trustHtml(t, iv) : '';
      var foot = el.querySelector('[data-pg-footer]');
      if (foot) foot.innerHTML = footerHtml(model, t, c.trialDays, iv, c);
      syncYear(iv);
      if (focusSel) { var f = el.querySelector(focusSel); if (f) f.focus(); }
      notify(false);
    }
    function reducedMotion() {
      try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    }
    function notify(full) {
      var iv = current();
      if (iv !== lastIv) { var before = lastIv; lastIv = iv; if (before != null && typeof options.onChange === 'function') options.onChange(iv); }
      if (full && typeof options.onUpdate === 'function') options.onUpdate(model.visible.slice());
    }
    function choose(iv, focus) {
      state = stateFor(model, iv);
      update(focus ? '[data-pg-dur="' + iv + '"]' : null);
    }
    // Choix de la duree : clic, ou clavier (fleches, Debut, Fin) comme un
    // groupe de boutons radio.
    function bind() {
      var radios = Array.prototype.slice.call(el.querySelectorAll('[data-pg-dur]'));
      radios.forEach(function (b, i) {
        b.addEventListener('click', function () { choose(b.getAttribute('data-pg-dur'), false); });
        b.addEventListener('keydown', function (e) {
          var k = e.key, j = null;
          if (k === 'ArrowRight' || k === 'ArrowDown') j = (i + 1) % radios.length;
          else if (k === 'ArrowLeft' || k === 'ArrowUp') j = (i - 1 + radios.length) % radios.length;
          else if (k === 'Home') j = 0;
          else if (k === 'End') j = radios.length - 1;
          if (j == null) return;
          e.preventDefault();
          choose(radios[j].getAttribute('data-pg-dur'), true);
        });
      });
    }

    function setAvailability(map) {
      availability = {};
      if (map && typeof map === 'object') Object.keys(map).forEach(function (k) { if (map[k] === false) availability[k] = false; });
      Object.keys(closedByConfig).forEach(function (k) { availability[k] = false; });
      if (ready) render();
    }
    var pending = null;
    // Disponibilites du serveur (availabilityFrom) et jours d'essai.
    function loadAvailability() {
      var run = function () {
        return fetchAvailability(market).then(function (r) {
          if (r.trialDays != null) trialDays = r.trialDays;
          var map = availabilityFrom(r, market, !!options.checkout);
          if (map) setAvailability(map);
          else if (ready) render();
          checkTrial();
          return r.intervals;
        });
      };
      if (global.IasharkApp || !doc || doc.readyState !== 'loading') pending = run();
      else pending = new Promise(function (resolve) { doc.addEventListener('DOMContentLoaded', function () { run().then(resolve); }); });
      return pending;
    }
    // Droit a l'essai d'un compte connecte : lu seulement si le serveur ouvre
    // l'essai (TRIAL_DAYS > 0) ; essai coupe = aucune requete de plus.
    function checkTrial() {
      if (!(trialDays > 0) || !session.known || !session.loggedIn || session.isPro || session.trialOk !== null || session.checking) return;
      session.checking = true;
      trialEligibility(global.IasharkApp, session.user).then(function (ok) {
        session.checking = false;
        session.trialOk = ok === true;
        if (ready && session.trialOk) render();
      });
    }
    function readSession() {
      var App = global.IasharkApp;
      if (options.session === false) return;
      var lire;
      if (App && typeof App.context === 'function') lire = Promise.resolve().then(function () { return App.context(); });
      else if (global.document && typeof global.fetch === 'function') lire = compteLeger().then(function (C) { if (!C) throw new Error('compte'); return C.context(); });
      else return;
      lire.then(function (c) {
        var pro = !!(c && c.isPro), user = (c && c.user) || null;
        var shown = function () { return [session.isPro, session.loggedIn, trialFor(trialDays, session, options.showTrial)].join(); };
        var before = shown();
        session.known = true;
        session.isPro = pro; session.loggedIn = !!user; session.user = user;
        // Visiteur : les conditions ecrites suffisent ; abonne : jamais ;
        // compte connecte : lecture de ses abonnements passes (checkTrial).
        session.trialOk = pro ? false : (user ? null : true);
        if (ready && shown() !== before) render();
        checkTrial();
      }, function () {});
    }

    // Rendu dans la langue de la page : dictionnaire d'abord (jamais de
    // libelles francais sur une page anglaise) ; le repli HTML reste affiche.
    var I = global.I18N;
    if (!options.labels && I && !I.dict && typeof I.init === 'function') {
      Promise.resolve().then(function () { return I.init(); }).then(render, render);
    } else {
      render();
    }
    setAvailability({});

    // Disponibilites : "now" (pages de paiement : la page appelle aussi
    // loadAvailability), "lazy" (par defaut : quand la grille approche de
    // l'ecran, une requete au plus), "none".
    var mode = options.availability || (options.checkout ? 'manual' : 'lazy');
    if (mode === 'now') loadAvailability();
    else if (mode === 'lazy') {
      if (typeof global.IntersectionObserver === 'function') {
        var io = new global.IntersectionObserver(function (entries) {
          if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); loadAvailability(); }
        }, { rootMargin: '400px 0px' });
        io.observe(el);
      } else loadAvailability();
    }
    // App (app-client.js) est chargee en defer : lecture de la session ensuite.
    if (global.IasharkApp || !doc || doc.readyState !== 'loading') readSession();
    else doc.addEventListener('DOMContentLoaded', readSession);

    return {
      el: el,
      interval: current,
      visible: function () { return model.visible.slice(); },
      isAvailable: function (iv) { var k = iv || current(); return !!k && model.visible.indexOf(k) !== -1; },
      setAvailability: setAvailability,
      loadAvailability: loadAvailability,
      whenReady: function () { return pending ? pending.then(function () {}, function () {}) : Promise.resolve(); },
      trialDays: function () { return trialDays; },
      setInterval: function (iv) { state = stateFor(model, iv); if (ready) update(); },
      refresh: function () { if (ready) render(); }
    };
  }

  // Monte chaque [data-pricing-grid="<variante>"] (options en data-pg-*).
  function mountAll(root) {
    root = root || global.document;
    if (!root || !root.querySelectorAll) return [];
    return Array.prototype.map.call(root.querySelectorAll('[data-pricing-grid]:not([data-pg-mounted])'), function (el) {
      el.setAttribute('data-pg-mounted', '');
      var d = function (k) { return el.getAttribute('data-pg-' + k); };
      var o = {
        variant: el.getAttribute('data-pricing-grid') || 'complet',
        annual: d('annual') === 'true',
        weekly: d('weekly') !== 'false',
        heading: d('heading') === 'false' ? false : undefined,
        track: d('track') || undefined,
        interval: d('interval') || undefined
      };
      if (d('href')) o.href = d('href');
      if (d('cta')) o.ctaLabel = d('cta');
      if (d('free-href')) o.freeHref = d('free-href');
      if (d('availability')) o.availability = d('availability');
      if (d('nocta') === 'true') o.noCta = true;
      if (d('cta-class')) o.ctaClass = d('cta-class');
      if (d('trial') === 'false') o.showTrial = false;
      return mount(el, o);
    });
  }

  global.IasharkPricingGrid = {
    mount: mount, mountAll: mountAll,
    offerModel: offerModel, resolveInterval: resolveInterval, stateFor: stateFor, durationsOf: durationsOf, priceView: priceView,
    buildHtml: buildHtml, textFor: textFor, fetchAvailability: fetchAvailability, availabilityFrom: availabilityFrom,
    trialFor: trialFor, trialEligibility: trialEligibility, comparatorOpen: comparatorOpen,
    featureText: featureText,
    FEATURES: FEATURES, FALLBACK: FALLBACK, STATS_IASHARK: STATS_IASHARK, SIMULATION: SIMULATION, SIMULATION_DEPUIS: SIMULATION_DEPUIS
  };

  // Emplacements declares dans le HTML : montes des que le DOM est pret.
  var d0 = global.document;
  if (d0 && d0.addEventListener) {
    if (d0.readyState === 'loading') d0.addEventListener('DOMContentLoaded', function () { mountAll(d0); });
    else mountAll(d0);
  }
})(typeof window !== 'undefined' ? window : this);
