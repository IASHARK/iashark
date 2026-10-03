/* IASHARK — langue du compte (02/10/2026).

   UNE SEULE SOURCE pour la langue d'un abonne : public.user_preferences.language
   ('fr' | 'en' | 'es' | 'de' | 'it' | 'pt', migration 0010). La lisent et
   l'ecrivent : la page Compte (Preferences), le questionnaire Pro
   (accueil-pro.html), le robot Telegram (/langue, /idioma) ; la lisent : les
   e-mails (send-lifecycle-emails, trial-reminder, cancel-subscription) et ce
   module, qui ramene le site dans la langue du compte.

   Module PUR (aucun reseau, aucun DOM) : charge par app-client.js et
   auth-pages.js dans le navigateur, et par node --test
   (tests/langue-compte.test.js).

   Repertoires du site (config/markets.json#_dirs) : fr, en, es, gb, za, mx.
   de, it et pt ont ete retires le 25/09/2026 (_retiredDirs : /en/). Une
   langue se lit donc dans PLUSIEURS repertoires : 'en' dans /en/, /gb/ et
   /za/ ; 'es' dans /es/ et /mx/. On ne deplace jamais un abonne qui lit deja
   sa langue (un Britannique reste sur /gb/, un Mexicain sur /mx/).

   Jamais de boucle : la redirection n'a lieu qu'une fois par session du
   navigateur (cle de session posee AVANT de partir) ; ensuite le selecteur de
   langue est libre jusqu'a la prochaine connexion. */
(function (root) {
  'use strict';

  var LANGUES = ['fr', 'en', 'es', 'de', 'it', 'pt'];
  var DEFAUT = 'fr';
  // Langue lue dans chaque repertoire de site.
  var LANGUE_DU_REPERTOIRE = { fr: 'fr', en: 'en', gb: 'en', za: 'en', es: 'es', mx: 'es', de: 'de', it: 'it', pt: 'pt' };
  // Repertoire ouvert pour une langue, quand celui de la page ne la parle pas.
  // de / it / pt : versions retirees du site, repli sur /en/ (comme _redirects).
  var REPERTOIRE_DE_LA_LANGUE = { fr: 'fr', en: 'en', es: 'es', de: 'en', it: 'en', pt: 'en' };
  var REPERTOIRES_OUVERTS = ['fr', 'en', 'es', 'gb', 'za', 'mx'];
  // Pages d'authentification et d'action ponctuelle : jamais redirigees (un
  // formulaire en cours ne disparait pas ; la connexion fait son propre choix).
  var PAGES_EXCLUES = ['connexion.html', 'inscription.html', 'mot-de-passe-oublie.html',
    'reinitialiser-mot-de-passe.html', 'desinscription-email.html', 'checkout-succes.html', 'checkout-annule.html'];
  // Cle de session : la langue du compte a deja ete appliquee dans ce navigateur.
  var CLE_SESSION = 'iashark_langue_compte_appliquee';

  function langueValide(l) {
    var v = String(l == null ? '' : l).toLowerCase().split(/[-_]/)[0];
    return LANGUES.indexOf(v) !== -1 ? v : null;
  }
  /* Langue d'un repertoire (« es-mx » du dictionnaire mexicain = 'es'). */
  function langueDuRepertoire(dir) {
    return LANGUE_DU_REPERTOIRE[String(dir || '').toLowerCase()] || null;
  }
  /* Repertoire d'une page (« /es/pro.html » -> 'es'), '' sans prefixe. */
  function repertoireDuChemin(chemin) {
    var m = String(chemin || '').match(/^\/([a-z]{2})(?:\/|$)/);
    return m && REPERTOIRES_OUVERTS.indexOf(m[1]) !== -1 ? m[1] : '';
  }
  /* Langue a enregistrer a l'inscription : celle de la page ou il s'inscrit. */
  function langueDeLaPage(chemin) {
    return langueDuRepertoire(repertoireDuChemin(chemin)) || DEFAUT;
  }
  /* Repertoire ou lire la langue du compte, en restant dans celui de la page
     s'il la parle deja. */
  function repertoirePour(langue, dirCourant) {
    var l = langueValide(langue);
    if (!l) return dirCourant || DEFAUT;
    if (dirCourant && langueDuRepertoire(dirCourant) === l) return dirCourant;
    var cible = REPERTOIRE_DE_LA_LANGUE[l];
    // Version retiree (de, it, pt) : une page anglaise (/gb/, /za/, /en/) convient deja.
    if (cible === 'en' && dirCourant && langueDuRepertoire(dirCourant) === 'en') return dirCourant;
    return cible;
  }
  /* Meme page dans le repertoire de la langue du compte, ou null s'il n'y a
     rien a faire (deja dans la bonne langue, page sans prefixe, page exclue).
     loc = { pathname, search, hash }. */
  function cible(langue, loc) {
    loc = loc || {};
    var chemin = String(loc.pathname || '/');
    var dir = repertoireDuChemin(chemin);
    if (!dir || !langueValide(langue)) return null;
    var reste = chemin.slice(dir.length + 1) || '/';
    var page = reste.replace(/^\/+/, '');
    if (PAGES_EXCLUES.indexOf(page) !== -1) return null;
    var nouveau = repertoirePour(langue, dir);
    if (!nouveau || nouveau === dir) return null;
    return '/' + nouveau + (reste.charAt(0) === '/' ? reste : '/' + reste) + (loc.search || '') + (loc.hash || '');
  }
  /* Une destination interne (« /fr/pro.html#tableau ») reecrite dans la
     langue du compte. Destination sans prefixe ou externe : inchangee. */
  function destinationPour(langue, destination) {
    var s = String(destination || '');
    var i = s.search(/[?#]/);
    var chemin = i === -1 ? s : s.slice(0, i), suite = i === -1 ? '' : s.slice(i);
    var c = cible(langue, { pathname: chemin, search: '', hash: '' });
    return c ? c + suite : s;
  }

  var api = {
    LANGUES: LANGUES, DEFAUT: DEFAUT, CLE_SESSION: CLE_SESSION, PAGES_EXCLUES: PAGES_EXCLUES,
    langueValide: langueValide,
    langueDuRepertoire: langueDuRepertoire,
    repertoireDuChemin: repertoireDuChemin,
    langueDeLaPage: langueDeLaPage,
    repertoirePour: repertoirePour,
    cible: cible,
    destinationPour: destinationPour
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IasharkLangueCompte = api;
})(typeof window !== 'undefined' ? window : this);
