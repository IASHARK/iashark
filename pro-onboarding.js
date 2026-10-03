/* IASHARK — questionnaire Pro (/accueil-pro.html).
   03/10/2026 (decision de Clement) : 5 etapes : langue, pays, bookmakers, competitions preferees,
   alertes (avec l'heure du programme). Plus de choix de strategie ni de types de paris : les paris sont
   les MEMES pour tous. Les competitions preferees (meme liste et memes cles que le robot Telegram :
   lib/pro-preferences.js#competitionsPro, generee depuis config/leagues.json) servent seulement a
   l'information (matchs du jour et resultats dans les messages Pro) ; elles sont enregistrees dans
   pro_preferences.competitions (0045, 0049), lues par le robot.
   (Ci-dessous : description d'avant le 03/10, gardee pour l'historique.)
   7 etapes, une question par ecran (telephone d'abord) : langue, pays,
   bookmakers, competitions, types de paris, alertes (programme du matin et
   son heure d'envoi, compositions, cotes, meteo, nuit), strategie. Hors de
   France (pays pas encore ouvert : Belgique, Suisse, Espagne, Royaume-Uni...),
   5 etapes : langue, pays, bookmakers (« pas encore disponible dans ton
   pays », jamais un operateur non agree), competitions, types de paris.
   Alertes et strategie sont sautees (elles ne servent qu'au programme du
   Canal Pro, qui n'y est pas propose), et la ligne enregistree dit
   programme_prive = non et aucune alerte (lib/pro-preferences.js#versLigne ;
   contre-controle, rondes 4 et 4.2). Garde-fou : plus demande ici (il reste
   « Bientôt » dans l'espace Pro, decision du 02/10/2026) ; la valeur deja
   enregistree n'est jamais modifiee par ce questionnaire.

   UNE SEULE SOURCE par reglage (02/10/2026) :
   - langue : public.user_preferences.language (lib/langue-compte.js), la
     meme que la page Compte, les e-mails et le robot Telegram ;
   - competitions : user_metadata.fav_leagues (lib/fav-leagues.js), les memes
     etoiles que l'accueil et la page Compte ;
   - le reste : public.pro_preferences (0040 + 0044).
   Propose juste apres
   l'abonnement ou le debut de l'essai (checkout-succes.html), modifiable
   ensuite depuis le compte et le tableau de bord (?modifier=1 : toutes les
   etapes accessibles d'un clic).

   Donnees : public.pro_preferences (contrat du Canal Pro, migration 0040 de la
   branche canal-pro ; RLS : l'abonne Pro lit et ecrit SA ligne, un compte
   gratuit ne peut rien y ecrire). Plus aucune cagnotte (public.users.capital
   n'est plus ni lu ni ecrit ici : IASHARK ne conseille aucune mise). Toute
   saisie passe par
   lib/pro-preferences.js#versLigne : seules les colonnes du contrat partent,
   un bookmaker non autorise dans le pays choisi n'est jamais enregistre.
   Formulaire rempli = la ligne existe (pas de colonne « termine le »).

   Rien n'est propose que le robot ne sait pas appliquer : pas de perte
   maximale, pas de plage horaire (la nuit est fixe : 23 h - 8 h, heure de
   Paris), pas de profil de mise, pas de choix de canal. L'heure d'envoi du
   programme du matin (0044) est appliquee par le robot
   (scripts/canal-pro/taches.mjs#messagesPersonnels). Les types de paris
   preferes ne changent que l'ordre et le reperage a l'ecran, jamais le pari
   choisi.

   Regles d'affichage : notre strategie est cochee par defaut, mise en avant
   et rappelee meme quand l'abonne choisit la sienne. Nuit coupee par defaut. */
(function () {
  'use strict';
  var P = window.IasharkProPreferences;
  var racine = document.getElementById('accueilPro');
  var sb = null, ctx = null;
  var L = window.IasharkLangueCompte;
  var etat = { etape: 0, prefs: null, modifier: false, dejaRempli: false, langue: 'fr', langueDepart: 'fr', sans0044: false };
  var favStore = null;
  var TOUTES = ['langue', 'pays', 'bookmakers', 'competitions', 'alertes'];
  // Etapes du pays choisi : hors des pays ouverts, pas d'alertes (reglages du programme, pas propose).
  var PROGRAMME_SEULEMENT = ['alertes'];
  // Nom de chaque langue dans SA langue (jamais traduit : on reconnait la sienne).
  var NOMS_LANGUES = { fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', it: 'Italiano', pt: 'Português' };
  function etapes() {
    return etat.prefs && !P.paysOuvert(etat.prefs.pays) ? TOUTES.filter(function (e) { return PROGRAMME_SEULEMENT.indexOf(e) === -1; }) : TOUTES;
  }

  function tr(k, vars) {
    var s = (window.I18N && window.I18N.t) ? window.I18N.t(k, k) : k;
    if (vars) Object.keys(vars).forEach(function (v) { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lien(p) { return (window.I18N && window.I18N.href) ? window.I18N.href(p) : '/' + p; }
  function dateLocale(iso) {
    try { return new Intl.DateTimeFormat((window.I18N && window.I18N.localeTag) ? window.I18N.localeTag() : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00Z')); }
    catch (e) { return iso; }
  }
  // Pays coche d'office : celui de la page ('fr' seulement sur les pages
  // francaises ; /en/, /es/ : 'autre'). Jamais « France » par defaut
  // (contre-controle, ronde 3 : /en/ cochait la France).
  function paysParDefaut() { return P.paysDuMarche(window.IASHARK_MARKET); }
  // Pays pas encore ouvert : aucun « bientot » qui n'y sera pas tenu.
  function aide(cle, p) { return tr(P.paysOuvert(p.pays) ? cle : cle + '_closed'); }

  /* ---------- Morceaux d'interface (Tailwind, charte IASHARK) ---------- */
  function choix(nom, valeur, titre, texte, coche, badge, type) {
    return '<label class="ps-choice group flex cursor-pointer items-start gap-3.5 rounded-2xl border border-hairline bg-surface p-4 transition hover:border-cyan/40 has-[:checked]:border-cyan/60 has-[:checked]:bg-cyan/[.06]">'
      + '<input type="' + (type || 'radio') + '" name="' + nom + '" value="' + esc(valeur) + '"' + (coche ? ' checked' : '') + ' class="ps-input mt-1 h-[18px] w-[18px] shrink-0 accent-[#20d5ef]">'
      + '<span class="min-w-0"><span class="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">' + esc(titre)
      + (badge ? '<span class="rounded-full bg-cyan px-2 py-0.5 text-[11px] font-bold text-[#04141b]">' + esc(badge) + '</span>' : '') + '</span>'
      + (texte ? '<span class="mt-1 block text-[13.5px] leading-relaxed text-soft">' + esc(texte) + '</span>' : '') + '</span></label>';
  }
  function pastille(nom, valeur, titre, coche) {
    return '<label class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-hairline px-3.5 py-2 text-[14px] text-ink transition hover:border-cyan/40 has-[:checked]:border-cyan/60 has-[:checked]:bg-cyan/[.08]">'
      + '<input type="checkbox" name="' + nom + '" value="' + esc(valeur) + '"' + (coche ? ' checked' : '') + ' class="h-4 w-4 accent-[#20d5ef]">' + esc(titre) + '</label>';
  }
  function champ(id, libelle, valeur, o) {
    o = o || {};
    return '<div><label for="' + id + '" class="block text-[13.5px] font-semibold text-ink">' + esc(libelle) + '</label>'
      + '<input id="' + id + '" type="' + (o.type || 'text') + '"' + (o.attrs || '') + ' value="' + esc(valeur == null ? '' : valeur) + '" class="ps-field mt-2 h-12 w-full rounded-xl border border-hairline bg-panel px-4 text-[16px] text-ink outline-none transition focus:border-cyan/60">'
      + (o.aide ? '<p class="mt-1.5 text-[12.5px] leading-relaxed text-soft">' + esc(o.aide) + '</p>' : '') + '</div>';
  }
  function question(titre, aide) {
    return '<h2 class="text-[22px] font-extrabold leading-tight tracking-tight outline-none sm:text-[26px]">' + esc(titre) + '</h2>'
      + (aide ? '<p class="mt-2 text-[14.5px] leading-relaxed text-soft">' + esc(aide) + '</p>' : '');
  }

  /* ---------- Etapes ---------- */
  function etapeLangue() {
    var liste = (L && L.LANGUES) || Object.keys(NOMS_LANGUES);
    return question(tr('pro_onboarding.q_language'), tr('pro_onboarding.language_help'))
      + '<div class="mt-5 grid gap-2.5 sm:grid-cols-2">'
      + liste.map(function (l) { return choix('langue', l, NOMS_LANGUES[l] || l, '', etat.langue === l); }).join('')
      + '</div>';
  }
  /* Competitions preferees : la liste du robot, regroupee (Grands championnats, Coupes d'Europe...). */
  function etapeCompetitions(p) {
    var langue = (window.I18N && window.I18N.lang) ? String(window.I18N.lang()).slice(0, 2) : etat.langue;
    return question(tr('pro_onboarding.q_competitions'), tr('pro_onboarding.competitions_help'))
      + P.competitionsPro(langue).map(function (g) {
        return '<fieldset class="mt-5"><legend class="text-[13.5px] font-semibold text-soft">' + esc(g.titre) + '</legend><div class="mt-2 flex flex-wrap gap-2">'
          + g.competitions.map(function (c) { return pastille('competitions', c.cle, c.nom, p.competitions.indexOf(c.cle) !== -1); }).join('') + '</div></fieldset>';
      }).join('')
      + '<p class="mt-3 text-[12.5px] text-soft">' + esc(tr('pro_onboarding.competitions_none')) + '</p>';
  }
  function etapePays(p) {
    return question(tr('pro_onboarding.q_country'), tr('pro_onboarding.country_help'))
      + '<div class="mt-5 grid gap-2.5 sm:grid-cols-2">'
      + P.PAYS.map(function (c) { return choix('pays', c, tr('pro_onboarding.country_' + c), '', p.pays === c); }).join('')
      + '</div>';
  }
  function etapeBookmakers(p) {
    var liste = P.bookmakersDuPays(p.pays);
    // Pays pas encore ouvert : aucun bookmaker propose, jamais celui d'un autre pays.
    // Message honnete : rien de ce qui depend des bookmakers n'est promis ici.
    if (!liste.length) return question(tr('pro_onboarding.q_bookmakers'))
      + '<div class="mt-5 rounded-2xl border border-hairline bg-surface p-4 sm:p-5">'
      + '<p class="text-[15px] font-semibold text-ink">' + esc(tr('pro_onboarding.not_available_title')) + '</p>'
      + '<p class="mt-1.5 text-[13.5px] leading-relaxed text-soft">' + esc(tr('pro_onboarding.not_available_text')) + '</p></div>';
    return question(tr('pro_onboarding.q_bookmakers'), tr('pro_onboarding.bookmakers_help_fr'))
      + '<div class="mt-5 flex flex-wrap gap-2">' + liste.map(function (b) { return pastille('bookmakers', b.id, b.nom, p.bookmakers.indexOf(b.id) !== -1); }).join('') + '</div>'
      + '<p class="mt-3 text-[12.5px] text-soft">' + esc(tr('pro_onboarding.bookmakers_none_ticked')) + '</p>'
      + '<p class="mt-1 text-[12.5px] text-soft">' + esc(tr('pro_onboarding.bookmakers_verified', { date: dateLocale(P.VERIFIE_LE) })) + '</p>';
  }
  /* Alertes : le programme du matin (programme_prive) et son heure d'envoi,
     les compositions, les cotes (sous la cote minimum : 'seuil' ; en hausse :
     'hausse', une seule case), la meteo, puis l'accord pour la nuit. */
  function etapeAlertes(p) {
    var cotes = p.alertes.indexOf('seuil') !== -1 || p.alertes.indexOf('hausse') !== -1;
    var heures = P.HEURES_ENVOI.map(function (h) {
      return '<option value="' + (h == null ? '' : h) + '"' + (p.heure_envoi === h ? ' selected' : '') + '>'
        + esc(h == null ? tr('pro_onboarding.send_time_asap') : tr('pro_onboarding.send_time_at', { h: h })) + '</option>';
    }).join('');
    return question(tr('pro_onboarding.q_alerts'), aide('pro_onboarding.alerts_help', p))
      + '<div class="mt-5 grid gap-2.5">'
      + choix('programme_prive', 'oui', tr('pro_onboarding.alert_programme'), tr('pro_onboarding.alert_programme_help'), p.programme_prive, null, 'checkbox')
      + '<div class="rounded-2xl border border-hairline bg-panel/60 p-4"><label for="heureEnvoi" class="block text-[13.5px] font-semibold text-ink">' + esc(tr('pro_onboarding.send_time')) + '</label>'
      + '<select id="heureEnvoi" class="ps-field mt-2 h-12 w-full rounded-xl border border-hairline bg-panel px-4 text-[16px] text-ink outline-none transition focus:border-cyan/60">' + heures + '</select>'
      + '<p class="mt-1.5 text-[12.5px] leading-relaxed text-soft">' + esc(tr('pro_onboarding.send_time_help')) + '</p></div>'
      + '</div>'
      + '<div class="mt-2.5 grid gap-2.5 sm:grid-cols-2">'
      + choix('alertes', 'compositions', tr('pro_onboarding.alert_compositions'), '', p.alertes.indexOf('compositions') !== -1, null, 'checkbox')
      + choix('alertes', 'cotes', tr('pro_onboarding.alert_cotes'), '', cotes, null, 'checkbox')
      + choix('alertes', 'meteo', tr('pro_onboarding.alert_meteo'), '', p.alertes.indexOf('meteo') !== -1, null, 'checkbox')
      + '</div>'
      + '<div class="mt-5">' + choix('alertes', 'nuit', tr('pro_onboarding.alert_nuit'), tr('pro_onboarding.alert_nuit_help'), p.alertes.indexOf('nuit') !== -1, null, 'checkbox') + '</div>';
  }
  var RENDU = { langue: etapeLangue, pays: etapePays, bookmakers: etapeBookmakers, competitions: etapeCompetitions, alertes: etapeAlertes };
  var TITRES = { langue: 'q_language', pays: 'q_country', bookmakers: 'q_bookmakers', competitions: 'q_competitions', alertes: 'q_alerts' };

  /* ---------- Lecture de l'etape affichee ---------- */
  function coches(nom) {
    return Array.prototype.slice.call(racine.querySelectorAll('input[name="' + nom + '"]:checked')).map(function (i) { return i.value; });
  }
  function valeur(id) { var el = document.getElementById(id); return el ? el.value.trim() : undefined; }
  function lireEtape() {
    var p = etat.prefs, nom = etapes()[etat.etape];
    if (nom === 'langue') { var l = coches('langue')[0]; if (l) etat.langue = l; }
    if (nom === 'competitions') p.competitions = P.normaliser({ competitions: coches('competitions') }).competitions;
    if (nom === 'pays') { var c = coches('pays')[0]; if (c && c !== p.pays) { p.pays = c; p.bookmakers = []; } }
    if (nom === 'bookmakers') p.bookmakers = coches('bookmakers');
    if (nom === 'alertes') {
      var a = coches('alertes'), out = [];
      // « Les cotes » = les deux alertes de cote du robot.
      a.forEach(function (x) { if (x === 'cotes') out.push('seuil', 'hausse'); else out.push(x); });
      // Ordre du contrat (seuil, hausse, compositions, meteo, nuit), quel que soit l'ordre des cases.
      p.alertes = P.ALERTES.concat(['nuit']).filter(function (x) { return out.indexOf(x) !== -1; });
      p.programme_prive = coches('programme_prive')[0] === 'oui';
      var h = valeur('heureEnvoi');
      if (h !== undefined) p.heure_envoi = P.heureValide(h);
    }
  }
  var ERREURS_ETAPE = { pays: ['pays'] };
  function verifierEtape() {
    var nom = etapes()[etat.etape];
    return P.erreurs(etat.prefs).filter(function (e) { return (ERREURS_ETAPE[nom] || []).indexOf(e) !== -1; });
  }

  /* ---------- Rendu ---------- */
  function afficher(message) {
    var liste = etapes();
    // Pays change en cours de route (6 -> 4 etapes) : jamais une etape qui n'existe plus.
    if (etat.etape > liste.length - 1) etat.etape = liste.length - 1;
    var total = liste.length, n = etat.etape + 1, nom = liste[etat.etape];
    var derniere = etat.etape === total - 1;
    var rail = '<ol class="mt-5 grid gap-1.5" style="grid-template-columns:repeat(' + total + ',minmax(0,1fr))" aria-label="' + esc(tr('pro_onboarding.step', { n: n, total: total })) + '">'
      + liste.map(function (e, i) {
        var cls = i <= etat.etape ? 'bg-cyan' : 'bg-white/[.08]';
        var cible = etat.modifier ? ' role="button" tabindex="0" data-aller="' + i + '" title="' + esc(tr('pro_onboarding.' + TITRES[e])) + '"' : '';
        return '<li class="h-1.5 rounded-full ' + cls + (etat.modifier ? ' cursor-pointer' : '') + '"' + cible + '></li>';
      }).join('') + '</ol>';
    racine.innerHTML =
      (etat.modifier ? '' : '<p class="text-[12.5px] font-semibold text-cyan">' + esc(tr('pro_onboarding.kicker')) + '</p>')
      + '<h1 class="mt-1 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">' + esc(etat.modifier ? tr('pro_onboarding.edit_title') : tr('pro_onboarding.title')) + '</h1>'
      + '<p class="mt-1.5 text-[14.5px] text-soft">' + esc(etat.modifier ? tr('pro_onboarding.edit_sub') : tr('pro_onboarding.sub', { n: total })) + '</p>'
      + rail
      + '<p class="mt-2 text-[12.5px] text-soft">' + esc(tr('pro_onboarding.step', { n: n, total: total })) + '</p>'
      + '<form id="formEtape" class="mt-6" novalidate>' + RENDU[nom](etat.prefs)
      + '<p id="msgEtape" class="mt-4 text-[13.5px]" role="status"' + (message ? '' : ' hidden') + '>' + (message || '') + '</p>'
      // Barre d'actions : collee en bas sur telephone (au-dessus de la barre de navigation).
      + '<div class="ps-actions mt-8 flex items-center gap-3">'
      + (etat.etape > 0 ? '<button type="button" id="retour" class="h-12 rounded-xl border border-hairline px-5 text-[15px] font-semibold text-ink transition hover:border-cyan/40">' + esc(tr('pro_onboarding.back')) + '</button>' : '')
      + '<button type="submit" id="suivant" class="h-12 flex-1 rounded-xl bg-cyan px-5 text-[15px] font-bold text-[#04141b] transition hover:bg-cyan/90 disabled:opacity-60 sm:flex-none sm:px-8">' + esc(derniere ? tr('pro_onboarding.save') : tr('pro_onboarding.next')) + '</button>'
      + (etat.modifier && !derniere ? '<button type="button" id="enregistrerTout" class="h-12 rounded-xl border border-cyan/40 px-5 text-[15px] font-semibold text-cyan transition hover:bg-cyan/[.06]">' + esc(tr('pro_onboarding.save')) + '</button>' : '')
      + '</div></form>';
    brancher();
    var h = racine.querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function montrerErreurs(errs) {
    var el = document.getElementById('msgEtape');
    if (!el) return;
    el.hidden = !errs.length;
    el.className = 'mt-4 text-[13.5px] text-red-300';
    el.textContent = errs.map(function (e) { return tr('pro_onboarding.err_' + e); }).join(' ');
  }

  function brancher() {
    var form = document.getElementById('formEtape');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      lireEtape();
      var errs = verifierEtape();
      if (errs.length) return montrerErreurs(errs);
      if (etat.etape < etapes().length - 1) { etat.etape++; afficher(); window.scrollTo({ top: 0 }); }
      else enregistrer();
    });
    var r = document.getElementById('retour');
    // « Retour » controle aussi la saisie (contre-controle, ronde 3 : « abc »
    // dans la cagnotte, puis Retour et Enregistrer, effacait la cagnotte).
    if (r) r.addEventListener('click', function () {
      lireEtape();
      var errs = verifierEtape();
      if (errs.length) return montrerErreurs(errs);
      etat.etape--; afficher(); window.scrollTo({ top: 0 });
    });
    var tout = document.getElementById('enregistrerTout');
    if (tout) tout.addEventListener('click', function () {
      lireEtape();
      var errs = verifierEtape();
      if (errs.length) return montrerErreurs(errs);
      enregistrer();
    });
    racine.querySelectorAll('[data-aller]').forEach(function (el) {
      function go() {
        lireEtape();
        var errs = verifierEtape();
        if (errs.length) return montrerErreurs(errs);
        etat.etape = Number(el.getAttribute('data-aller'));
        afficher();
      }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  async function enregistrer() {
    var bouton = document.getElementById('suivant') || document.getElementById('enregistrerTout');
    var texteBouton = bouton ? bouton.textContent : '';
    if (bouton) { bouton.disabled = true; bouton.textContent = tr('pro_onboarding.saving'); }
    var errs = P.erreurs(etat.prefs);
    if (errs.length) { if (bouton) { bouton.disabled = false; bouton.textContent = texteBouton; } return montrerErreurs(errs); }
    try {
      // 1. Reglages Pro (pro_preferences). Base sans 0044 : on renvoie sans les deux nouvelles colonnes.
      var r = await sb.from(P.TABLE).upsert(P.versLigne(etat.prefs, ctx.user.id, { sans0044: etat.sans0044 }), { onConflict: 'user_id' });
      if (r.error && !etat.sans0044 && P.erreurColonneAbsente(r.error)) {
        etat.sans0044 = true;
        r = await sb.from(P.TABLE).upsert(P.versLigne(etat.prefs, ctx.user.id, { sans0044: true }), { onConflict: 'user_id' });
      }
      if (r.error) throw r.error;
      // 2. Langue du compte : user_preferences.language, la seule source (site, e-mails, robot).
      if (L && L.langueValide(etat.langue)) {
        var r2 = await sb.from('user_preferences').upsert({ user_id: ctx.user.id, language: etat.langue }, { onConflict: 'user_id' });
        if (r2.error) throw r2.error;
      }
      // 3. Competitions preferees : pro_preferences.competitions (deja dans la ligne, meme liste que le robot).
      // Langue changee : la suite s'affiche dans la nouvelle langue (meme page, autre repertoire).
      var ailleurs = L && L.cible(etat.langue, location);
      if (ailleurs) {
        try { sessionStorage.setItem(L.CLE_SESSION, '1'); } catch (_e) {}
        location.replace(ailleurs.split('?')[0] + '?enregistre=1');
        return;
      }
      fini();
    } catch (e) {
      if (bouton) { bouton.disabled = false; bouton.textContent = tr('pro_onboarding.save'); }
      var el = document.getElementById('msgEtape');
      if (el) { el.hidden = false; el.className = 'mt-4 text-[13.5px] text-red-300'; el.textContent = tr('pro_onboarding.err_save'); }
    }
  }

  function fini() {
    racine.innerHTML = '<div class="rounded-2xl border border-hairline bg-surface p-6 sm:p-8">'
      + '<p class="text-[13px] font-semibold text-cyan">' + esc(tr('pro_onboarding.saved')) + '</p>'
      + '<h1 class="mt-2 text-[26px] font-extrabold leading-tight tracking-tight">' + esc(tr('pro_onboarding.edit_title')) + '</h1>'
      + '<p class="mt-2 text-[14.5px] leading-relaxed text-soft">' + esc(tr('pro_onboarding.edit_sub')) + '</p>'
      + '<a href="' + esc(lien('pro.html')) + '" class="mt-6 inline-flex h-12 items-center rounded-xl bg-cyan px-6 text-[15px] font-bold text-[#04141b] transition hover:bg-cyan/90">' + esc(tr('pro_onboarding.go_pro_space')) + '</a>'
      + '</div>';
  }

  /* Compte gratuit : la base refuse ses reglages (contrat 0040). On le dit
     au lieu de lui faire remplir 7 ecrans pour rien. Hors de France : texte
     neutre, sans le programme du Canal Pro (pas propose dans ce pays). */
  function reserveAuxPro() {
    racine.innerHTML = '<div class="rounded-2xl border border-hairline bg-surface p-6 sm:p-8">'
      + '<h1 class="text-[24px] font-extrabold leading-tight tracking-tight">' + esc(tr('pro_onboarding.pro_only_title')) + '</h1>'
      + '<p class="mt-2 text-[14.5px] leading-relaxed text-soft">' + esc(tr(P.paysOuvert(paysParDefaut()) ? 'pro_onboarding.pro_only_text' : 'pro_onboarding.pro_only_text_closed')) + '</p>'
      + '<a href="' + esc(lien('pro.html')) + '" class="mt-6 inline-flex h-12 items-center rounded-xl bg-cyan px-6 text-[15px] font-bold text-[#04141b] transition hover:bg-cyan/90">' + esc(tr('pro_onboarding.go_pro_space')) + '</a>'
      + '</div>';
  }

  // LANCEMENT DU 3/10 (avocat du diable, 01/10/2026) : les reglages Pro s'enregistrent dans
  // public.pro_preferences (migration 0040), pas encore appliquee : la page ne propose aucun
  // formulaire, seulement « Bientôt » et le chemin vers l'espace Pro. Passer a true le jour
  // ou 0040/0041 sont appliquees.
  // Interrupteur d'ouverture (window.IASHARK_OUVERTURE.reglagesPro, jamais pose par le site
  // avant l'application de 0040/0041) : la base refuse de toute facon l'ecriture sans 0040.
  var REGLAGES_OUVERTS = !!(window.IASHARK_OUVERTURE && window.IASHARK_OUVERTURE.reglagesPro === true);
  function bientot() {
    racine.innerHTML = '<div class="rounded-2xl border border-hairline bg-surface p-6 sm:p-8">'
      + '<h1 class="text-[24px] font-extrabold leading-tight tracking-tight">' + esc(tr('lancement.settings_soon_title')) + '</h1>'
      + '<p class="mt-2 text-[14.5px] leading-relaxed text-soft">' + esc(tr('lancement.settings_soon_text')) + '</p>'
      + '<a href="' + esc(lien('pro.html')) + '" class="mt-6 inline-flex h-12 items-center rounded-xl bg-cyan px-6 text-[15px] font-bold text-[#04141b] transition hover:bg-cyan/90">' + esc(tr('lancement.open_pro_space')) + '</a>'
      + '</div>';
  }

  async function demarrer() {
    if (window.I18N && window.I18N.init) { try { await window.I18N.init(); } catch (_e) {} }
    if (!REGLAGES_OUVERTS) { bientot(); return; }
    sb = window.IasharkApp.supabase;
    ctx = await window.IasharkApp.context();
    if (!ctx.user) {
      location.replace(lien('connexion.html?next=' + encodeURIComponent(location.pathname + location.search)));
      return;
    }
    if (!ctx.isPro) { reserveAuxPro(); return; }
    var q = new URLSearchParams(location.search);
    // Questionnaire vu dans cette session : l'espace Pro n'y renvoie plus (tools-page.js).
    try { sessionStorage.setItem('iashark_accueil_pro_vu', '1'); } catch (_e) {}
    if (q.get('enregistre') === '1') { fini(); return; }
    var lus = await Promise.all([
      sb.from(P.TABLE).select(P.COLONNES.join(',')).eq('user_id', ctx.user.id).maybeSingle(),
      sb.from('user_preferences').select('language').eq('user_id', ctx.user.id).maybeSingle()
    ]);
    var r = lus[0];
    // Base sans 0044 (colonnes marches / heure_envoi absentes) : relecture sans elles.
    if (r && r.error && P.erreurColonneAbsente(r.error)) {
      etat.sans0044 = true;
      r = await sb.from(P.TABLE).select(P.COLONNES_BASE.join(',')).eq('user_id', ctx.user.id).maybeSingle();
    }
    var ligne = (r && !r.error && r.data) || null;
    etat.dejaRempli = !!ligne;
    etat.modifier = q.get('modifier') === '1' || etat.dejaRempli;
    etat.prefs = P.normaliser(ligne || { pays: paysParDefaut() });
    // Langue : celle du compte, sinon celle de la page.
    var langueCompte = lus[1] && !lus[1].error && lus[1].data && lus[1].data.language;
    etat.langue = (L && (L.langueValide(langueCompte) || L.langueDeLaPage(location.pathname))) || 'fr';
    etat.langueDepart = etat.langue;
    // Pas encore de competitions preferees : on part des etoiles du compte (user_metadata.fav_leagues,
    // memes cles), seulement pour pre-cocher ; rien n'est ecrit dans les etoiles.
    if (!etat.prefs.competitions.length && window.IasharkFavLeagues) {
      favStore = window.IasharkFavLeagues.createStore();
      try { await favStore.connectRemote(window.IasharkFavLeagues.supabaseAdapter(sb)); } catch (_e) {}
      etat.prefs.competitions = P.normaliser({ competitions: favStore.list() }).competitions;
    }
    var cible = etapes().indexOf(q.get('etape') || '');
    etat.etape = cible >= 0 ? cible : 0;
    afficher();
    var plusTard = document.querySelector('a[data-href="pro.html"]');
    if (plusTard) plusTard.href = lien('pro.html');
  }

  demarrer();
})();
