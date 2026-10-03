/* IASHARK — preferences Pro (formulaire d'accueil + reglages du compte).
   Module PUR (aucun acces reseau, aucun DOM) : lu par pro-onboarding.js,
   pro-dashboard.js et account-page.js dans le navigateur, et par node --test
   (tests/pro-accueil.test.js).

   CONTRAT (30/09/2026) : une seule table pour les reglages de l'abonne,
   public.pro_preferences, creee par la branche canal-pro
   (supabase/migrations/0040_canal_pro.sql, qui fait foi). Le site l'ecrit
   (l'abonne Pro, sur SA ligne), le robot Telegram la lit
   (supabase/functions/_shared/canal-pro.mjs#preferencesEffectives). Memes
   noms de colonnes, memes valeurs, sinon le robot ne voit pas les reglages :
     pays text ('fr' | 'be' | 'ch' | 'es' | 'gb' | 'mx' | 'za' | 'autre') ;
       seul 'fr' est ouvert (be, ch, es : migration 0044) ;
     bookmakers text[] (cles des bookmakers agrees suivis du pays) ;
     strategie text ('iashark' | 'perso') ;
     familles text[] parmi ('sure', 'valeur', 'nuls') ;
     cote_min_perso numeric (> 1, <= 50) ou null ;
     limite_paris_jour int 0..50 (0 = plus rien de la journee) ;
     programme_prive boolean (programme personnel en message prive Telegram) ;
     alertes text[] parmi ('seuil', 'hausse', 'compositions', 'meteo', 'nuit') ;
     marches text[] parmi MARCHES (0044 : types de paris mis en avant a
       l'ecran, aucun effet sur le choix du pari) ;
     heure_envoi smallint 8..22 ou null (0044 : heure de Paris a partir de
       laquelle le robot envoie le programme du matin ; null = des sa
       publication).
   Avant l'application de 0044, marches et heure_envoi n'existent pas en
   base : COLONNES_BASE sert alors a relire et a enregistrer (repli
   automatique dans pro-onboarding.js, account-page.js et tools-page.js).
   Pas de ligne = valeurs par defaut (celles du robot), SAUF le pays : celui
   de la page (paysDuMarche), 'autre' hors des pages francaises, donc aucun
   bookmaker (option prudente ; le robot, lui, suit son reglage
   pays_sans_formulaire, decision de Clement). Rien d'autre n'est
   enregistre : pas de perte maximale, pas de plage horaire, pas de profil,
   pas de marches en plus (le robot ne les connait pas).

   Ce module decide :
   - quels bookmakers un abonne PEUT cocher : seulement ceux autorises dans
     SON pays (config/bookmakers-agrees.json, recopie ci-dessous par
     scripts/sync-bookmakers.js). En France : uniquement les agrees ANJ dont
     les cotes sont relevees. Jamais d'operateur non agree, et aucun
     bookmaker d'un autre pays ;
   - les valeurs par defaut (strategie IASHARK recommandee, nuit coupee) ;
   - la normalisation d'une saisie en ligne de pro_preferences : toute valeur
     hors liste est ecartee, jamais envoyee.

   La base refait les memes controles (contraintes CHECK de 0040) : ce module
   n'est qu'un confort, pas la securite. */
(function (root) {
  'use strict';

  /* @bookmakers-debut : genere par scripts/sync-bookmakers.js depuis config/bookmakers-agrees.json, ne pas modifier a la main */
  var AGREES = {"verifie_le":"2026-09-29","pays":{"fr":{"regulateur":"ANJ","paiementOuvert":true,"pointDeVente":{"id":"point_de_vente","nom":"Point de vente (bureau de tabac, FDJ Parions Sport)"},"bookmakers":[{"id":"betclic","nom":"Betclic"},{"id":"netbet","nom":"NetBet"},{"id":"pmu","nom":"PMU"},{"id":"unibet","nom":"Unibet"},{"id":"winamax","nom":"Winamax"}]},"be":{"regulateur":"Commission des jeux de hasard","paiementOuvert":true,"pointDeVente":null,"bookmakers":[]},"ch":{"regulateur":"Gespa","paiementOuvert":true,"pointDeVente":null,"bookmakers":[]},"es":{"regulateur":"DGOJ","paiementOuvert":true,"pointDeVente":null,"bookmakers":[{"id":"williamhill","nom":"William Hill"},{"id":"888sport","nom":"888sport"},{"id":"betsson","nom":"Betsson"},{"id":"marathonbet","nom":"Marathonbet"}]},"gb":{"regulateur":"UKGC","paiementOuvert":false,"pointDeVente":null,"bookmakers":[]},"mx":{"regulateur":"SEGOB","paiementOuvert":false,"pointDeVente":null,"bookmakers":[]},"za":{"regulateur":"NGB","paiementOuvert":false,"pointDeVente":null,"bookmakers":[]},"autre":{"regulateur":null,"paiementOuvert":false,"pointDeVente":null,"bookmakers":[]}}};
  /* @bookmakers-fin */
  /* @competitions-debut : genere par scripts/sync-competitions-pro.js depuis config/leagues.json, ne pas modifier a la main */
  var COMPETITIONS_PRO = {"groupes":{"grands":{"fr":"Grands championnats","es":"Grandes ligas","en":"Top leagues","de":"Top-Ligen","it":"Grandi campionati","pt":"Grandes campeonatos"},"selections":{"fr":"Sélections européennes","es":"Selecciones europeas","en":"European national teams","de":"Europäische Nationalteams","it":"Nazionali europee","pt":"Seleções europeias"},"coupes":{"fr":"Coupes d'Europe","es":"Copas de Europa","en":"European cups","de":"Europapokale","it":"Coppe europee","pt":"Taças europeias"},"europe":{"fr":"Autres championnats d'Europe","es":"Otras ligas de Europa","en":"Other European leagues","de":"Weitere Ligen in Europa","it":"Altri campionati europei","pt":"Outros campeonatos europeus"},"monde":{"fr":"Amériques et reste du monde","es":"América y resto del mundo","en":"Americas and rest of the world","de":"Amerika und restliche Welt","it":"Americhe e resto del mondo","pt":"Américas e resto do mundo"}},"liste":[{"cle":"premier","nom":"Premier League","nom_en":"Premier League","groupe":"grands","api":39},{"cle":"laliga","nom":"La Liga","nom_en":"La Liga","groupe":"grands","api":140,"alias":"Liga"},{"cle":"seriea","nom":"Serie A","nom_en":"Serie A","groupe":"grands","api":135,"alias":"Serie A"},{"cle":"bundesliga","nom":"Bundesliga","nom_en":"Bundesliga","groupe":"grands","api":78,"alias":"Bundesliga"},{"cle":"ligue1","nom":"Ligue 1","nom_en":"Ligue 1","groupe":"grands","api":61,"alias":"Ligue 1"},{"cle":"nations_league","nom":"Ligue des nations","nom_en":"UEFA Nations League","groupe":"selections","api":5},{"cle":"wcq_europe","nom":"Éliminatoires Mondial (Europe)","nom_en":"World Cup Qualifiers Europe","groupe":"selections","api":32},{"cle":"ldc","nom":"Champions League","nom_en":"Champions League","groupe":"coupes","api":2},{"cle":"el","nom":"Europa League","nom_en":"Europa League","groupe":"coupes","api":3},{"cle":"ecl","nom":"Conference League","nom_en":"Conference League","groupe":"coupes","api":848},{"cle":"eredivisie","nom":"Eredivisie","nom_en":"Eredivisie","groupe":"europe","api":88,"alias":"Eredivisie"},{"cle":"primeira","nom":"Liga Portugal","nom_en":"Liga Portugal","groupe":"europe","api":94,"alias":"Liga Portugal"},{"cle":"suede","nom":"Allsvenskan","nom_en":"Allsvenskan","groupe":"europe","api":113},{"cle":"championship","nom":"Championship","nom_en":"Championship","groupe":"europe","api":40},{"cle":"league_one","nom":"League One","nom_en":"League One","groupe":"europe","api":41},{"cle":"league_two","nom":"League Two","nom_en":"League Two","groupe":"europe","api":42},{"cle":"bundesliga2","nom":"2. Bundesliga","nom_en":"2. Bundesliga","groupe":"europe","api":79},{"cle":"spain_segunda","nom":"Segunda División","nom_en":"Segunda Division","groupe":"europe","api":141},{"cle":"italy_serieb","nom":"Serie B","nom_en":"Serie B","groupe":"europe","api":136},{"cle":"belgium_pro","nom":"Jupiler Pro League","nom_en":"Jupiler Pro League","groupe":"europe","api":144},{"cle":"turkey_superlig","nom":"Süper Lig","nom_en":"Super Lig","groupe":"europe","api":203},{"cle":"scotland_premiership","nom":"Premiership écossaise","nom_en":"Scottish Premiership","groupe":"europe","api":179},{"cle":"austria_bundesliga","nom":"Bundesliga autrichienne","nom_en":"Austrian Bundesliga","groupe":"europe","api":218},{"cle":"switzerland_superleague","nom":"Super League suisse","nom_en":"Swiss Super League","groupe":"europe","api":207},{"cle":"denmark_superliga","nom":"Superliga danoise","nom_en":"Danish Superliga","groupe":"europe","api":119},{"cle":"ekstraklasa","nom":"Ekstraklasa","nom_en":"Ekstraklasa","groupe":"europe","api":106},{"cle":"scotland_championship","nom":"Championship écossais","nom_en":"Scottish Championship","groupe":"europe","api":180},{"cle":"mls","nom":"MLS","nom_en":"MLS","groupe":"monde","api":253},{"cle":"jleague","nom":"J1 League","nom_en":"J1 League","groupe":"monde","api":98},{"cle":"liga_mx","nom":"Liga MX","nom_en":"Liga MX","groupe":"monde","api":262},{"cle":"argentina_liga_profesional","nom":"Liga Profesional Argentina","nom_en":"Liga Profesional Argentina","groupe":"monde","api":128},{"cle":"brazil_seriea","nom":"Brasileirão Série A","nom_en":"Brasileirao Serie A","groupe":"monde","api":71}],"anciens":{"SP1":"laliga","I1":"seriea","D1":"bundesliga","F1":"ligue1","N1":"eredivisie","P1":"primeira"}};
  /* @competitions-fin */

  var TABLE = 'pro_preferences';
  // Colonnes lues et ecrites, nommees une a une (jamais « select * »).
  var COLONNES_BASE = ['pays', 'bookmakers', 'strategie', 'familles', 'cote_min_perso', 'limite_paris_jour', 'programme_prive', 'alertes'];
  // Colonnes ajoutees par 0044_pro_langue.sql (marches, heure_envoi) et 0045 / 0049 (competitions :
  // competitions preferees, cles de la liste COMPETITIONS_PRO). Base sans elles : repli sur COLONNES_BASE.
  var COLONNES_0044 = ['marches', 'heure_envoi', 'competitions'];
  var COLONNES = COLONNES_BASE.concat(COLONNES_0044);
  var PAYS = ['fr', 'be', 'ch', 'es', 'gb', 'mx', 'za', 'autre'];
  // Types de paris preferes (pro_preferences.marches, 0044). Ordre = ordre a l'ecran.
  var MARCHES = ['resultat', 'buts', 'btts', 'mi_temps', 'corners_cartons', 'tirs', 'buteur'];
  // Heures proposees pour le programme du matin (heure de Paris) ; null = des sa publication.
  var HEURES_ENVOI = [null, 9, 10, 11, 12, 14, 17];
  var HEURE_MIN = 8, HEURE_MAX = 22;
  // Familles du Canal Pro (pro_paris.famille). 'nuls' = Chasseur de nuls.
  var FAMILLES = ['sure', 'valeur', 'nuls'];
  // Alertes du robot. 'nuit' n'est pas une alerte : c'est l'accord pour
  // recevoir les autres la nuit (23 h - 8 h). Coupee par defaut.
  var ALERTES = ['seuil', 'hausse', 'compositions', 'meteo'];
  var LIMITE_MAX = 50;

  var DEFAUTS = {
    pays: 'fr',
    bookmakers: [],
    strategie: 'iashark',
    familles: FAMILLES.slice(),
    cote_min_perso: null,
    limite_paris_jour: 5,
    programme_prive: true,
    alertes: ALERTES.slice(),
    marches: [],
    heure_envoi: null,
    competitions: []
  };
  /* COMPETITIONS PREFEREES (03/10/2026, decision de Clement) : la MEME liste et les MEMES cles que le robot
     Telegram (supabase/functions/_shared/competitions-pro.mjs), generees depuis config/leagues.json
     (bloc @competitions ci-dessus). Pour l'information seulement : le programme du jour liste les matchs de
     ces competitions (et le lendemain leurs resultats) ; les paris restent les memes pour tous.
     Anciens codes du robot (« F1 »...) relus. */
  function cleCompetition(k) {
    var liste = (COMPETITIONS_PRO.liste || []).map(function (c) { return c.cle; });
    if (dans(liste, k)) return k;
    var a = (COMPETITIONS_PRO.anciens || {})[k];
    return a && dans(liste, a) ? a : null;
  }
  /* Liste regroupee pour l'ecran : [{ groupe, titre, competitions: [{ cle, nom }] }] dans la langue. */
  function competitionsPro(lang) {
    var lg = String(lang || 'fr').slice(0, 2);
    var groupes = COMPETITIONS_PRO.groupes || {};
    return Object.keys(groupes).map(function (g) {
      return { groupe: g, titre: groupes[g][lg] || groupes[g].fr, competitions: (COMPETITIONS_PRO.liste || []).filter(function (c) { return c.groupe === g; })
        .map(function (c) { return { cle: c.cle, nom: lg === 'fr' ? c.nom : c.nom_en }; }) };
    }).filter(function (g) { return g.competitions.length; });
  }

  function copie(o) { return JSON.parse(JSON.stringify(o)); }
  function dans(liste, v) { return liste.indexOf(v) !== -1; }
  function tableau(v) { return Array.isArray(v) ? v : []; }
  function uniques(liste) {
    var vus = {};
    return liste.filter(function (x) { if (vus[x]) return false; vus[x] = true; return true; });
  }
  function nombre(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  /* Cote minimum perso : arrondie au centieme AVANT le controle (1,004 ->
     1,00 serait refusee par la base, contrainte cote_min_perso > 1). null =
     vide ou hors de ]1 ; 50]. */
  function coteValide(v) {
    var c = nombre(v);
    if (c === null) return null;
    var r = Math.round(c * 100) / 100;
    return r > 1 && r <= 50 ? r : null;
  }
  /* Heure d'envoi du programme du matin : entier 8..22, sinon null (des sa publication). */
  function heureValide(v) {
    var n = nombre(v);
    return n !== null && Math.round(n) === n && n >= HEURE_MIN && n <= HEURE_MAX ? n : null;
  }
  function limiteValide(n) { return n !== null && n >= 0 && n <= LIMITE_MAX && Math.round(n) === n; }

  /* Pays inconnu ou absent ('us', 'es', '') : 'autre', donc AUCUN bookmaker.
     Jamais 'fr' par defaut (contre-controle, ronde 3 : sur /en/, marche
     'us', un compte sans reglages voyait les 5 bookmakers francais). Le 'fr'
     par defaut de la base (DEFAUTS.pays) ne vaut que pour une ligne ecrite. */
  function paysConnu(p) { return dans(PAYS, p) ? p : 'autre'; }
  /* Pays d'une PAGE, pour un compte qui n'a pas encore rempli le formulaire.
     'fr' seulement sur les pages francaises du marche euro (meme regle que
     assets/pricing-grid.js#comparatorOpen) ; gb, mx, za : leur code ; tout
     le reste (/en/ = 'us', /es/, marche absent ou inconnu) : 'autre'. */
  function paysDuMarche(market) {
    var m = market || {};
    // /es/ (marche euro, langue espagnole) : l'Espagne (ouverte le 02/10/2026 :
    // operateurs DGOJ suivis, config/bookmakers-agrees.json).
    if (m.code === 'fr') return m.locale === 'fr' ? 'fr' : (m.locale === 'es' ? 'es' : 'autre');
    return m.code === 'gb' || m.code === 'mx' || m.code === 'za' ? m.code : 'autre';
  }
  function infosPays(p) { return AGREES.pays[paysConnu(p)]; }
  /* Bookmakers autorises dans le pays (jamais un autre). */
  function bookmakersDuPays(p) { return copie(infosPays(p).bookmakers); }
  /* Le pays a-t-il une liste de bookmakers ouverte ? (France ; Espagne depuis le 02/10/2026) */
  function paysOuvert(p) { return infosPays(p).bookmakers.length > 0; }
  function bookmakersValides(p, ids) {
    var permis = infosPays(p).bookmakers.map(function (b) { return b.id; });
    return uniques(tableau(ids).filter(function (id) { return dans(permis, id); }));
  }
  /* Nom d'un bookmaker, cherche SEULEMENT dans la liste du pays donne. */
  function nomBookmaker(id, pays) {
    var liste = pays ? infosPays(pays).bookmakers : [];
    if (!pays) PAYS.forEach(function (c) { liste = liste.concat(AGREES.pays[c].bookmakers); });
    var b = liste.filter(function (x) { return x.id === id; })[0];
    return b ? b.nom : null;
  }

  /* Saisie (formulaire, ligne de la base, objet partiel) -> ligne propre de
     pro_preferences (sans user_id). */
  function normaliser(saisie) {
    var s = saisie || {};
    var p = copie(DEFAUTS);
    p.pays = paysConnu(String(s.pays || '').toLowerCase());
    p.bookmakers = bookmakersValides(p.pays, s.bookmakers);
    // Plus de choix de strategie ni de types de paris (03/10/2026) : les memes paris pour tous.
    p.strategie = 'iashark';
    p.familles = FAMILLES.slice();
    p.cote_min_perso = null;
    var n = nombre(s.limite_paris_jour);
    p.limite_paris_jour = limiteValide(n) ? n : DEFAUTS.limite_paris_jour;
    p.programme_prive = s.programme_prive === false ? false : true;
    var al = s.alertes === undefined || s.alertes === null ? DEFAUTS.alertes.concat([]) : tableau(s.alertes);
    p.alertes = uniques(al.filter(function (a) { return dans(ALERTES, a) || a === 'nuit'; }));
    p.marches = uniques(tableau(s.marches).filter(function (x) { return dans(MARCHES, x); }));
    p.heure_envoi = heureValide(s.heure_envoi);
    var ordre = (COMPETITIONS_PRO.liste || []).map(function (c) { return c.cle; });
    var co = uniques(tableau(s.competitions).map(cleCompetition).filter(Boolean));
    p.competitions = ordre.filter(function (k) { return dans(co, k); });
    // Strategie IASHARK : les reglages perso sont gardes en memoire (s'il y
    // revient) mais ne s'appliquent pas ; le tableau de bord le dit.
    return p;
  }
  /* Ligne a envoyer a pro_preferences : user_id + les colonnes du contrat,
     et rien d'autre (jamais une colonne que le robot ne connait pas).
     Pays pas ouvert (hors de France) : programme_prive = non et AUCUNE
     alerte. Le formulaire n'y pose pas ces questions, et le robot envoie son
     message personnel a tout abonne relie qui a « oui », quel que soit son
     pays (contre-controle, ronde 4.2). Option prudente et reversible : elle
     ne joue plus des qu'un pays ouvre (paysOuvert) ; les etapes reviennent
     alors dans le formulaire et l'abonne regle lui-meme alertes et programme. */
  function versLigne(saisie, userId, opts) {
    var p = normaliser(saisie), ligne = { user_id: userId };
    // opts.sans0044 : base sans les colonnes de 0044 (pas encore appliquee).
    (opts && opts.sans0044 ? COLONNES_BASE : COLONNES).forEach(function (c) { ligne[c] = p[c]; });
    if (!paysOuvert(p.pays)) { ligne.programme_prive = false; ligne.alertes = []; if ('heure_envoi' in ligne) ligne.heure_envoi = null; }
    return ligne;
  }
  /* Erreur de la base « colonne inconnue » (0044 pas encore appliquee) :
     PostgREST PGRST204 / PGRST100 ou Postgres 42703. */
  function erreurColonneAbsente(e) {
    var code = String((e && e.code) || ''), msg = String((e && (e.message || e.details)) || '');
    return code === '42703' || code === 'PGRST204' || /column|colonne/i.test(msg) && /marches|heure_envoi|competitions/.test(msg);
  }
  /* Groupe d'un pari a partir de son identifiant moteur (market_id) :
     'home-win' -> 'resultat', 'over-25' -> 'buts', 'fh-under-15' -> 'mi_temps'... */
  function groupeDuMarche(marketId) {
    var id = String(marketId == null ? '' : marketId).toLowerCase().trim();
    if (!id) return null;
    if (/^(fh|sh|ht|1h|2h)-|first-half|second-half|half-time|-both-halves$/.test(id)) return 'mi_temps';
    if (/^btts/.test(id)) return 'btts';
    if (/corners|cards/.test(id)) return 'corners_cartons';
    if (/shots/.test(id)) return 'tirs';
    if (/scorer|buteur/.test(id)) return 'buteur';
    if (/^(home-win|draw|away-win|dc-|dnb|draw-no-bet|home-clean|away-clean|home-win-to-nil|away-win-to-nil|ah-|handicap)/.test(id)) return 'resultat';
    if (/(^|-)(over|under)-|goals/.test(id)) return 'buts';
    return null;
  }
  /* Alertes la nuit acceptees ? */
  function nuitAutorisee(prefs) { return dans(normaliser(prefs).alertes, 'nuit'); }

  /* Erreurs bloquantes du formulaire. Les cles sont les NOMS DE COLONNES du
     contrat (pro-onboarding.js#ERREURS_ETAPE les attend telles quelles) et
     les textes sont pro_onboarding.err_<cle>. Controle d'avocat du diable
     (30/09) : avec les anciennes cles ('cote_min', 'paris_max_jour'), une
     limite de 60 ou une cote de 0,5 passaient leur etape. */
  function erreurs(saisie) {
    var s = saisie || {}, out = [];
    if (!dans(PAYS, s.pays)) out.push('pays');
    var rempli = s.cote_min_perso !== null && s.cote_min_perso !== undefined && String(s.cote_min_perso).trim() !== '';
    if (s.strategie === 'perso' && rempli && coteValide(s.cote_min_perso) === null) out.push('cote_min_perso');
    if (!limiteValide(nombre(s.limite_paris_jour))) out.push('limite_paris_jour');
    return out;
  }

  /* Cagnotte saisie dans le formulaire (users.capital, pas pro_preferences) :
     vide = pas de cagnotte (null) ; sinon un montant > 0 et <= 10 000 000.
     Une saisie comme « abc » n'est JAMAIS enregistree comme une cagnotte
     vide (contre-controle, ronde 3 : « Retour » puis « Enregistrer »
     l'effacait sans message). */
  function lireCapital(v) {
    if (v === null || v === undefined || String(v).trim() === '') return { ok: true, valeur: null };
    var c = Number(String(v).trim().replace(',', '.'));
    return c > 0 && c <= 10000000 ? { ok: true, valeur: c } : { ok: false, valeur: null };
  }

  /* Choix de l'abonne qui s'ecartent de ce qui est teste : affiches avec
     « pas encore verifie » et notre strategie a cote. */
  function choixNonTestes(prefs) {
    var p = normaliser(prefs);
    if (p.strategie !== 'perso') return [];
    var out = [];
    if (p.cote_min_perso !== null) out.push('cote_min_perso');
    if (p.familles.length !== FAMILLES.length) out.push('familles');
    return out;
  }

  var api = {
    TABLE: TABLE, COLONNES: COLONNES, COLONNES_BASE: COLONNES_BASE, COLONNES_0044: COLONNES_0044,
    PAYS: PAYS, FAMILLES: FAMILLES, ALERTES: ALERTES, LIMITE_MAX: LIMITE_MAX,
    MARCHES: MARCHES, HEURES_ENVOI: HEURES_ENVOI,
    COMPETITIONS_PRO: COMPETITIONS_PRO, competitionsPro: competitionsPro, cleCompetition: cleCompetition,
    DEFAUTS: DEFAUTS,
    VERIFIE_LE: AGREES.verifie_le,
    donneesAgrees: function () { return copie(AGREES); },
    infosPays: function (p) { return copie(infosPays(p)); },
    bookmakersDuPays: bookmakersDuPays,
    paysOuvert: paysOuvert,
    paysDuMarche: paysDuMarche,
    bookmakersValides: bookmakersValides,
    nomBookmaker: nomBookmaker,
    normaliser: normaliser,
    versLigne: versLigne,
    erreurColonneAbsente: erreurColonneAbsente,
    groupeDuMarche: groupeDuMarche,
    heureValide: heureValide,
    nuitAutorisee: nuitAutorisee,
    coteValide: coteValide,
    erreurs: erreurs,
    lireCapital: lireCapital,
    choixNonTestes: choixNonTestes
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IasharkProPreferences = api;
})(typeof window !== 'undefined' ? window : this);
