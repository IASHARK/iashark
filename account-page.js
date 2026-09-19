/* IASHARK — Account Center.
   Rend /compte.html : en-tete de profil, navigation de sections, et une seule
   section visible a la fois. Remplace l'ancienne page qui empilait six
   grandes cartes sur une colonne unique.

   AUDIT (03/09/2026) — ce fichier n'affiche QUE des donnees reelles :
   - public.users            : email, plan, role, capital, created_at
   - public.user_preferences : display_name, language, timezone,
                               notify_match_analysis, notify_weekly_recap
                               (la colonne favorite_leagues existe encore en
                               base mais n'est plus ni ecrite ni lue : voir
                               la section « Mes compétitions préférées »)
   - public.subscriptions    : status, current_period_end,
                               cancel_at_period_end, billing_interval
                               (ecrite uniquement par le webhook Stripe et
                               sync-subscription, jamais par le client)
   - public.betting_decisions: nombre de décisions enregistrées
   Tout le reste est absent du projet et n'est donc pas invente ici :
   - pas de liste des sessions actives (le SDK Supabase ne l'expose pas),
   - pas d'appareil ni de localisation,
   - pas de statut de verification d'email (la verification est desactivee
     sur ce projet, tous les comptes sont confirmes d'office),
   - pas de factures listees dans la page (le portail Stripe les porte deja).

   SECURITE — le plan et le role ne sont JAMAIS decides ici. public.users
   n'accorde a `authenticated` que `update (email, capital, updated_at)` :
   modifier plan ou role depuis le navigateur est refuse par Postgres, pas
   par cette page. Ce fichier ne fait que refleter ce que le serveur repond. */
(function () {
  'use strict';
  var sb = window.IasharkApp.supabase;
  var racine = document.getElementById('compte');
  var chargement = document.getElementById('chargement');

  var ctx = null, prefs = {}, abo = null, nbDecisions = 0;
  // « Mes compétitions préférées » : user_metadata.fav_leagues (Supabase Auth),
  // meme store que la liste des matchs de l'accueil (lib/fav-leagues.js).
  var favStore = null;
  var sectionActive = 'apercu';

  /* ---------- Utilitaires ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function date(v) {
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d) ? null : d.toLocaleDateString(localeTag(), { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function euros(v) {
    // null et chaine vide ne valent pas zero : une bankroll non renseignee
    // doit s'afficher "Non renseigné", pas "0 €". Number(null) vaut 0, d'ou
    // le test explicite avant la conversion.
    if (v == null || v === '') return null;
    var n = Number(v);
    // Le tag de locale devient dynamique (separateur decimal, ordre) ; la devise
    // reste EUR volontairement - la conversion multi-devise est un chantier
    // separe en cours en parallele, hors perimetre ici.
    return isFinite(n) ? n.toLocaleString(localeTag(), { style: 'currency', currency: devise(), maximumFractionDigits: 0 }) : null;
  }
  // Marche courant (lib/market-config.js -> window.IASHARK_MARKET : code,
  // devise, prix). Repli : marche FR historique, EUR.
  function marche() { return window.IASHARK_MARKET || null; }
  function devise() { return (marche() && marche().currency) || 'EUR'; }
  function prixGratuit() {
    var m = marche();
    if (m && typeof m.formatPrice === 'function') { var f = m.formatPrice('free'); if (f) return f; }
    try { return (0).toLocaleString(localeTag(), { style: 'currency', currency: devise(), maximumFractionDigits: 0 }); }
    catch (_e) { return '0 €'; }
  }
  // Prix Pro mensuel du marche courant. La forme exacte de
  // IASHARK_MARKET.prices appartient a lib/market-config.js : on accepte un
  // nombre ou un libelle deja formate, sinon le prix EUR historique.
  function prixPro() {
    var mk = marche();
    if (mk && typeof mk.formatPrice === 'function') { var f = mk.formatPrice('pro'); if (f) return f; }
    var p = mk && mk.prices;
    var v = p && (p.pro_monthly != null ? p.pro_monthly : p.pro != null ? p.pro : p.monthly);
    if (v && typeof v === 'object') v = v.display != null ? v.display : (v.amount != null ? v.amount : v.value);
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && isFinite(v)) {
      try { return v.toLocaleString(localeTag(), { style: 'currency', currency: devise() }); } catch (_e) {}
    }
    return '19,95 €';
  }
  // Lien interne dans le repertoire de langue/marche courant (/gb/, /mx/...).
  function lien(p) { return (window.I18N && window.I18N.href) ? window.I18N.href(p) : '/' + p; }
  // Repertoire de site de la page (premier segment d'URL), transmis au
  // paiement pour revenir sur /<dir>/checkout-succes.html.
  var REPERTOIRES = ['fr', 'en', 'es', 'de', 'it', 'pt', 'gb', 'za', 'mx'];
  function repertoire() {
    var seg = String(location.pathname.split('/')[1] || '').toLowerCase();
    return REPERTOIRES.indexOf(seg) !== -1 ? seg : null;
  }
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- i18n ----------
     Nomme "tr" (et non "t") : plusieurs fonctions de ce fichier utilisent deja
     une variable locale "var t = typeDeCompte()" (badgePlan, apercu,
     abonnement) - un helper global nomme "t" serait silencieusement masque
     par cette variable locale et casserait ces sections. Degrade toujours
     vers le libelle francais d'origine si I18N n'est pas charge. */
  function tr(key, fallback) {
    return (window.I18N && window.I18N.t) ? window.I18N.t(key, fallback) : fallback;
  }
  function localeTag() {
    return (window.I18N && window.I18N.localeTag) ? window.I18N.localeTag() : 'fr-FR';
  }

  /* Feedback de section : une ligne sous le bouton d'enregistrement, jamais
     un toast pour chaque interaction. */
  function retour(id, texte, type) {
    var el = $(id);
    if (!el) return;
    el.textContent = texte || '';
    el.hidden = !texte;
    el.className = 'mt-3 text-[13px] ' + (type === 'error' ? 'text-red-300' : type === 'success' ? 'text-emerald-300' : 'text-soft');
  }

  /* ---------- Identite ---------- */
  function nomAffiche() {
    var meta = (ctx.user && ctx.user.user_metadata) || {};
    return prefs.display_name || meta.display_name || meta.full_name || meta.username
      || String(ctx.user.email || '').split('@')[0] || tr('compte_page.default_display_name', 'Mon compte');
  }
  function initiales(nom) {
    var mots = String(nom).trim().split(/[\s._-]+/).filter(Boolean);
    if (!mots.length) return 'IA';
    if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
    return (mots[0][0] + mots[1][0]).toUpperCase();
  }

  /* ---------- Plan et abonnement ----------
     Trois etats distincts, jamais melanges : administrateur, abonne, gratuit.
     Un administrateur n'est PAS un abonne : il a un acces de service, il ne
     paie rien, et on ne lui propose donc jamais de decouvrir Pro. */
  function typeDeCompte() {
    if (ctx.isAdmin) return 'admin';
    if (ctx.isPro) return 'pro';
    return 'free';
  }
  function badgePlan() {
    var t = typeDeCompte();
    if (t === 'admin') return { texte: tr('compte_page.role_admin', 'ADMIN'), classe: 'border-violet-400/35 bg-violet-400/10 text-violet-300' };
    if (t === 'pro') return { texte: tr('compte_page.badge_pro', 'PRO'), classe: 'border-cyan/40 bg-cyan/10 text-cyan' };
    return { texte: tr('compte_page.badge_free', 'GRATUIT'), classe: 'border-hairline bg-white/[.04] text-soft' };
  }

  /* Etat lisible de l'abonnement, a partir du statut Stripe reel. Chaque cas
     ci-dessous existe dans la contrainte CHECK de public.subscriptions. */
  function etatAbonnement() {
    if (!abo) return null;
    var fin = date(abo.current_period_end);
    if (abo.status === 'active' && abo.cancel_at_period_end) {
      return { ton: 'attention', titre: tr('compte_page.sub_status_cancel_scheduled_title', 'Annulation programmée'),
        detail: fin ? tr('compte_page.sub_status_cancel_scheduled_detail_prefix', 'Votre abonnement reste actif jusqu’au ') + fin + '.' : tr('compte_page.sub_status_cancel_scheduled_detail_generic', 'Votre abonnement reste actif jusqu’à la fin de la période en cours.') };
    }
    if (abo.status === 'active') {
      return { ton: 'ok', titre: tr('compte_page.sub_status_active_title', 'Actif'), detail: fin ? tr('compte_page.sub_status_active_detail_prefix', 'Prochain renouvellement le ') + fin + '.' : null };
    }
    if (abo.status === 'trialing') {
      return { ton: 'ok', titre: tr('compte_page.sub_status_trialing_title', 'Période d’essai'), detail: fin ? tr('compte_page.sub_status_trialing_detail_prefix', 'L’essai se termine le ') + fin + '.' : null };
    }
    if (abo.status === 'past_due' || abo.status === 'unpaid') {
      return { ton: 'alerte', titre: tr('compte_page.sub_status_past_due_title', 'Paiement en attente'),
        detail: tr('compte_page.sub_status_past_due_detail', 'Votre dernier paiement n’a pas abouti. Mettez votre moyen de paiement à jour pour ne pas perdre l’accès.') };
    }
    if (abo.status === 'canceled') {
      return { ton: 'neutre', titre: tr('compte_page.sub_status_canceled_title', 'Abonnement terminé'), detail: fin ? tr('compte_page.sub_status_canceled_detail_prefix', 'Il a pris fin le ') + fin + '.' : null };
    }
    if (abo.status === 'incomplete' || abo.status === 'incomplete_expired') {
      return { ton: 'alerte', titre: tr('compte_page.sub_status_incomplete_title', 'Paiement non finalisé'),
        detail: tr('compte_page.sub_status_incomplete_detail', 'Le paiement n’a jamais été confirmé. Reprenez la souscription pour activer Pro.') };
    }
    return null;
  }
  /* Duree de l'abonnement (offre Pro unique, 3 durees). Lue sur la ligne
     subscriptions ecrite par le serveur a partir du Price Stripe ; jamais
     deduite d'un prix. Valeur absente (abonnement anterieur a la migration
     0026, pas encore resynchronise) : "En cours de synchronisation". */
  // Audit du 18/09/2026 : tant que la migration 0026 n'est pas appliquee,
  // billing_interval n'existe pas et TOUS les abonnes voyaient « En cours de
  // synchronisation » en permanence. Duree inconnue = ligne masquee (null),
  // jamais un etat « en cours » qui ne se termine pas.
  function libelleDuree() {
    if (!abo) return null;
    var cles = { week: ['compte_page.interval_week', 'Hebdomadaire'], month: ['compte_page.interval_month', 'Mensuelle'], year: ['compte_page.interval_year', 'Annuelle'] };
    var c = cles[abo.billing_interval];
    return c ? tr(c[0], c[1]) : null;
  }
  // « Changer de duree » n'a de sens que si plusieurs durees sont payables en
  // ligne (config/markets.json#checkoutOpen, lib/market-config.js).
  function plusieursDureesOuvertes() {
    var M = window.IASHARK_MARKET;
    if (!M || typeof M.proOffer !== 'function') return false;
    try { return M.proOffer().intervals.filter(function (i) { return i.amount != null && i.open !== false; }).length > 1; } catch (e) { return false; }
  }
  var TON = {
    ok: 'border-emerald-500/30 bg-emerald-500/[.07] text-emerald-300',
    attention: 'border-amber-500/30 bg-amber-500/[.07] text-amber-200',
    alerte: 'border-red-500/30 bg-red-500/[.07] text-red-300',
    neutre: 'border-hairline bg-white/[.03] text-soft'
  };

  /* ---------- Blocs reutilises ---------- */
  function carte(contenu, classes) {
    return '<section class="rounded-2xl border border-hairline bg-surface p-5 sm:p-6 ' + (classes || '') + '">' + contenu + '</section>';
  }
  function titreSection(titre, sous) {
    return '<div class="mb-6"><h1 class="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">' + esc(titre) + '</h1>'
      + (sous ? '<p class="mt-1.5 text-[14px] text-soft">' + esc(sous) + '</p>' : '') + '</div>';
  }
  function boutonPrimaire(id, texte, extra) {
    return '<button type="button" id="' + id + '" class="h-11 rounded-xl bg-cyan px-5 text-[14px] font-bold text-[#04141b] transition hover:bg-cyan/90 disabled:cursor-wait disabled:opacity-60 ' + (extra || '') + '">' + esc(texte) + '</button>';
  }
  function boutonSecondaire(id, texte, extra) {
    return '<button type="button" id="' + id + '" class="h-11 rounded-xl border border-hairline px-5 text-[14px] font-semibold text-ink transition hover:border-cyan/40 disabled:opacity-60 ' + (extra || '') + '">' + esc(texte) + '</button>';
  }
  function ligneResume(libelle, valeur, lien, texteLien) {
    return '<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-hairline py-3.5 first:border-t-0 first:pt-0">'
      + '<span class="text-[13.5px] text-soft">' + esc(libelle) + '</span>'
      + '<span class="flex min-w-0 items-baseline gap-3"><b class="acc-val min-w-0 text-[14.5px] font-semibold">' + (valeur || '<span class="font-normal text-soft">' + tr('compte_page.not_provided', 'Non renseigné') + '</span>') + '</b>'
      + (lien ? '<button type="button" data-aller="' + lien + '" class="text-[13px] text-cyan transition hover:underline">' + esc(texteLien || tr('compte_page.edit_link', 'Modifier')) + '</button>' : '')
      + '</span></div>';
  }
  function interrupteur(id, titre, texte, actif) {
    return '<div class="flex items-start justify-between gap-5 border-t border-hairline py-4 first:border-t-0 first:pt-0">'
      + '<div class="min-w-0"><label for="' + id + '" class="block text-[14.5px] font-semibold">' + esc(titre) + '</label>'
      + '<p class="mt-1 text-[13px] leading-relaxed text-soft">' + esc(texte) + '</p></div>'
      + '<button type="button" role="switch" id="' + id + '" aria-checked="' + (actif ? 'true' : 'false') + '" class="sw mt-1"></button></div>';
  }
  function champ(id, libelle, valeur, options) {
    var o = options || {};
    return '<div class="' + (o.classe || '') + '">'
      + '<label for="' + id + '" class="block text-[13px] font-semibold text-soft">' + esc(libelle) + '</label>'
      + '<input id="' + id + '" class="fld mt-2" type="' + (o.type || 'text') + '"'
      + (o.attrs || '') + ' value="' + esc(valeur == null ? '' : valeur) + '"'
      + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + '>'
      + (o.aide ? '<p class="mt-1.5 text-[12.5px] text-soft">' + esc(o.aide) + '</p>' : '')
      + '</div>';
  }

  /* ---------- Sections ---------- */

  /* Vue d'ensemble : un resume court, avec un lien vers la section qui porte
     le formulaire complet. Aucun formulaire ici - c'est ce qui rendait
     l'ancienne page interminable. */
  function apercu() {
    var t = typeDeCompte();
    var langues = {
      fr: tr('compte_page.lang_name_fr', 'Français'), en: tr('compte_page.lang_name_en', 'English'),
      es: tr('compte_page.lang_name_es', 'Espanol'), de: tr('compte_page.lang_name_de', 'Deutsch'),
      it: tr('compte_page.lang_name_it', 'Italiano'), pt: tr('compte_page.lang_name_pt', 'Portugues')
    };
    var etat = etatAbonnement();

    var planResume;
    if (t === 'admin') {
      planResume = '<p class="text-[15px] font-semibold">' + tr('compte_page.plan_admin_title', 'Accès administrateur') + '</p>'
        + '<p class="mt-1.5 text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.plan_admin_detail', 'Votre compte dispose d’un accès de service à l’ensemble du produit. Aucun abonnement n’est requis.') + '</p>';
    } else if (t === 'pro') {
      planResume = '<p class="text-[15px] font-semibold">' + tr('compte_page.plan_pro_name', 'IASHARK Pro') + '</p>'
        + (etat ? '<p class="mt-1.5 text-[13.5px] leading-relaxed text-soft">' + esc(etat.titre) + (etat.detail ? ' — ' + esc(etat.detail) : '') + '</p>' : '');
    } else {
      planResume = '<p class="text-[15px] font-semibold">' + tr('compte_page.plan_free_name', 'IASHARK Gratuit') + '</p>'
        + '<p class="mt-1.5 text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.plan_free_detail', 'L’analyse offerte du jour, le blog et les outils en découverte.') + '</p>';
    }

    var activite = '';
    // Une carte "0 décision" occupant un demi-ecran n'apprend rien. On
    // n'affiche l'activite que lorsqu'il y a quelque chose a montrer, et un
    // etat vide court sinon.
    if (nbDecisions > 0) {
      activite = carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.activity_heading', 'Activité') + '</h2>'
        + '<p class="mt-3 text-[30px] font-extrabold leading-none">' + nbDecisions + '</p>'
        + '<p class="mt-1.5 text-[13.5px] text-soft">' + (nbDecisions > 1
            ? tr('compte_page.activity_count_plural', 'décisions enregistrées dans votre journal.')
            : tr('compte_page.activity_count_singular', 'décision enregistrée dans votre journal.')) + '</p>');
    } else {
      activite = carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.activity_heading', 'Activité') + '</h2>'
        + '<p class="mt-3 text-[14px] leading-relaxed text-soft">' + tr('compte_page.activity_empty_detail', 'Aucune décision enregistrée. Celles que vous ajoutez depuis les outils apparaîtront ici.') + '</p>'
        + '<a href="' + esc(lien('pro.html')) + '" class="mt-4 inline-flex h-10 items-center rounded-lg border border-hairline px-4 text-[13.5px] font-semibold transition hover:border-cyan/40">' + tr('compte_page.activity_empty_cta', 'Voir les outils') + '</a>');
    }

    return titreSection(tr('compte_page.section_overview_title', 'Vue d’ensemble'), tr('compte_page.section_overview_subtitle', 'Un résumé de votre compte. Chaque section porte le détail.'))
      + '<div class="space-y-4">'
      + carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.plan_current_heading', 'Plan actuel') + '</h2><div class="mt-3">' + planResume + '</div>'
          + '<div class="mt-4"><button type="button" data-aller="abonnement" class="text-[13.5px] font-semibold text-cyan transition hover:underline">' + tr('compte_page.view_subscription_cta', 'Voir l’abonnement') + '</button></div>')
      + carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.profile_prefs_heading', 'Profil et préférences') + '</h2><div class="mt-4">'
          + ligneResume(tr('compte_page.display_name_label', 'Nom affiché'), esc(nomAffiche()), 'preferences')
          + ligneResume(tr('compte_page.email_label', 'Email'), esc(ctx.user.email))
          + ligneResume(tr('compte_page.language_label', 'Langue'), esc(langues[prefs.language] || langues.fr), 'preferences')
          + ligneResume(tr('compte_page.timezone_label', 'Fuseau horaire'), esc(prefs.timezone || 'Europe/Paris'), 'preferences')
          + ligneResume(tr('compte_page.fav_leagues_label', 'Compétitions préférées'), favoris().length ? esc(favoris().map(nomCompetition).join(', ')) : '', 'competitions')
          + ligneResume(tr('compte_page.bankroll_label', 'Bankroll'), euros(ctx.profile.capital) ? esc(euros(ctx.profile.capital)) : '', 'preferences')
          + '</div>')
      + activite
      + carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.security_heading', 'Sécurité') + '</h2>'
          + '<p class="mt-3 text-[14px] leading-relaxed text-soft">' + tr('compte_page.security_summary', 'Votre compte est protégé par un mot de passe.') + '</p>'
          + '<div class="mt-4"><button type="button" data-aller="securite" class="text-[13.5px] font-semibold text-cyan transition hover:underline">' + tr('compte_page.manage_security_cta', 'Gérer la sécurité') + '</button></div>')
      + '</div>';
  }

  /* Abonnement. Le contenu change reellement selon le type de compte : un
     abonne ne voit aucun argumentaire de vente, un administrateur non plus. */
  function abonnement() {
    var t = typeDeCompte();
    var etat = etatAbonnement();

    if (t === 'admin') {
      return titreSection(tr('compte_page.subscription_heading', 'Abonnement'), tr('compte_page.subscription_admin_subtitle', 'L’état de votre accès à IASHARK.'))
        + carte('<span class="inline-flex items-center rounded-full border border-violet-400/35 bg-violet-400/10 px-2.5 py-1 text-[11px] font-bold tracking-wider text-violet-300">' + tr('compte_page.role_admin', 'ADMIN') + '</span>'
          + '<h2 class="mt-4 text-[22px] font-extrabold tracking-tight">' + tr('compte_page.plan_admin_title', 'Accès administrateur') + '</h2>'
          + '<p class="mt-2 max-w-xl text-[14px] leading-relaxed text-soft">' + tr('compte_page.admin_access_full_detail', 'Votre compte donne accès à l’ensemble du produit pour l’exploitation du service. Ce n’est pas un abonnement : rien n’est facturé et il n’y a rien à renouveler.') + '</p>'
          + '<div class="mt-6 flex flex-wrap gap-3"><a href="/admin.html" class="inline-flex h-11 items-center rounded-xl border border-hairline px-5 text-[14px] font-semibold transition hover:border-cyan/40">' + tr('compte_page.open_admin_space_cta', 'Ouvrir l’espace admin') + '</a></div>');
    }

    if (t === 'pro') {
      var bandeau = etat ? '<div class="mt-5 rounded-xl border px-4 py-3.5 text-[13.5px] leading-relaxed ' + TON[etat.ton] + '">'
        + '<b class="font-semibold">' + esc(etat.titre) + '</b>' + (etat.detail ? '<span class="mt-0.5 block opacity-90">' + esc(etat.detail) + '</span>' : '') + '</div>' : '';
      // Le portail Stripe porte deja le montant exact, le moyen de paiement,
      // les factures et la resiliation. On ne reconstruit pas cette interface
      // et on n'affiche pas un prix qu'on ne peut pas verifier pour CE client.
      return titreSection(tr('compte_page.subscription_heading', 'Abonnement'), tr('compte_page.subscription_pro_subtitle', 'L’état réel de votre abonnement et sa gestion.'))
        + carte('<div class="flex flex-wrap items-start justify-between gap-4">'
          + '<div><h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.plan_current_heading', 'Plan actuel') + '</h2>'
          + '<p class="mt-2.5 text-[26px] font-extrabold leading-none tracking-tight">' + tr('compte_page.plan_pro_name', 'IASHARK Pro') + '</p></div>'
          + '<span class="inline-flex items-center rounded-full border border-cyan/40 bg-cyan/10 px-2.5 py-1 text-[11px] font-bold tracking-wider text-cyan">' + tr('compte_page.badge_pro', 'PRO') + '</span></div>'
          + bandeau
          + (abo ? '<div class="mt-5">'
            + (libelleDuree() ? ligneResume(tr('compte_page.sub_interval_label', 'Durée'), esc(libelleDuree())) : '')
            + (abo.current_period_end && !abo.cancel_at_period_end && abo.status !== 'canceled' && date(abo.current_period_end) ? ligneResume(tr('compte_page.next_renewal_label', 'Prochaine échéance'), esc(date(abo.current_period_end))) : '')
            + '</div>' : '')
          + (abo ? '' : '<p class="mt-5 text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.pro_manual_grant_detail', 'Aucun abonnement payant n’est enregistré sur ce compte : l’accès Pro y a été accordé manuellement.') + '</p>')
          + '<div class="mt-6 flex flex-wrap gap-3">'
          + (abo ? boutonPrimaire('portail', tr('compte_page.manage_subscription_cta', 'Gérer mon abonnement')) : '')
          // Changer de duree : portail Stripe, ecran de changement d'offre de
          // l'abonnement (jamais un second paiement). Duree plus longue : effet
          // immediat au prorata ; plus courte : a la fin de la periode payee
          // (reglages du portail client Stripe).
          + (abo && ['active', 'trialing'].indexOf(abo.status) !== -1 && !abo.cancel_at_period_end && plusieursDureesOuvertes() ? boutonSecondaire('changerDuree', tr('compte_page.change_interval_cta', 'Changer de durée')) : '')
          // Resiliation en ligne visible et nommee comme telle (Code de la
          // consommation L215-1-1, decret 2023-417 : fonctionnalite « resilier
          // votre contrat » directement accessible). Elle ouvre le meme espace
          // securise Stripe, ou l'annulation se confirme.
          + (abo && ['active', 'trialing', 'past_due', 'unpaid'].indexOf(abo.status) !== -1 && !abo.cancel_at_period_end ? boutonSecondaire('resilier', tr('compte_page.cancel_subscription_cta', 'Résilier mon abonnement')) : '')
          + '</div>'
          + (abo ? '<p class="mt-3 text-[12.5px] leading-relaxed text-soft">' + tr('compte_page.billing_portal_note', 'Moyen de paiement, factures et résiliation se gèrent dans l’espace sécurisé de notre prestataire de paiement.') + ' ' + tr('compte_page.change_interval_note', 'Passer à une durée plus longue prend effet tout de suite, au prorata ; passer à une durée plus courte prend effet à la fin de la période déjà payée. Le montant et la date d’effet sont affichés avant confirmation.') + '</p>' : '')
          + '<p id="msgFacturation" hidden aria-live="polite"></p>');
    }

    // Gratuit : un seul appel a l'action. Ce que Pro donne : la MEME liste que
    // la page d'abonnement (3 groupes, 19/09/2026), jamais une liste propre au
    // compte ; acces gratuit decrit avec les textes partages pro_offer.free_*.
    return titreSection(tr('compte_page.subscription_heading', 'Abonnement'), tr('compte_page.subscription_free_subtitle', 'Votre plan actuel et ce que Pro ajoute.'))
      + '<div class="space-y-4">'
      + carte('<div class="flex flex-wrap items-start justify-between gap-4">'
        + '<div><h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.plan_current_heading', 'Plan actuel') + '</h2>'
        + '<p class="mt-2.5 text-[26px] font-extrabold leading-none tracking-tight">' + tr('compte_page.plan_free_name', 'IASHARK Gratuit') + '</p>'
        // Prix affiche en EUR uniquement : la conversion multi-devise est un
        // chantier separe en cours en parallele, hors perimetre ici.
        + '<p class="mt-2 text-[14px] text-soft">' + esc(prixGratuit()) + '</p></div>'
        + '<span class="inline-flex items-center rounded-full border border-hairline bg-white/[.04] px-2.5 py-1 text-[11px] font-bold tracking-wider text-soft">' + tr('compte_page.badge_free', 'GRATUIT') + '</span></div>'
        + '<ul class="mt-5 space-y-2.5">'
        + '<li class="flex gap-2.5 text-[14px] text-soft"><span aria-hidden="true" class="text-soft">✓</span>' + esc(tr('pro_offer.free_matches', '1 match offert par jour, avec un compte gratuit')) + '</li>'
        + '<li class="flex gap-2.5 text-[14px] text-soft"><span aria-hidden="true" class="text-soft">✓</span>' + esc(tr('pro_offer.free_tools', 'Calculateur de mise, cote juste, simulateur de capital')) + '</li>'
        + '<li class="flex gap-2.5 text-[14px] text-soft"><span aria-hidden="true" class="text-soft">✓</span>' + tr('compte_page.benefit_free_blog', 'Le blog et les guides') + '</li>'
        + '</ul>'
        + (etat && etat.ton === 'alerte' ? '<div class="mt-5 rounded-xl border px-4 py-3.5 text-[13.5px] leading-relaxed ' + TON[etat.ton] + '"><b class="font-semibold">' + esc(etat.titre) + '</b><span class="mt-0.5 block opacity-90">' + esc(etat.detail) + '</span></div>' : ''))
      + carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan">' + tr('compte_page.with_pro_heading', 'Avec Pro') + '</h2>'
        // Prix affiche en EUR uniquement : voir note ci-dessus, hors perimetre ici.
        // Selecteur Semaine / Mois / Annee (lib/pro-plan-picker.js), monte par
        // brancher() ; repli sans module : prix mensuel.
        + '<div id="proPlanPicker"><p class="mt-2.5 text-[22px] font-extrabold leading-none tracking-tight"><span data-market-price="pro.month">' + esc(prixPro()) + '</span> ' + esc(tr('compte_page.per_month', '/ mois')) + '</p></div>'
        + '<p id="proDureesNote" class="mt-2 text-[13.5px] text-soft">' + tr('compte_page.pro_durations_note', 'Même accès Pro quelle que soit la durée · résiliable à tout moment.') + '</p>'
        + listePro()
        // Cases CGV + execution immediate (lib/checkout-consent.js), montees
        // par monterConsentement() depuis brancher().
        + '<div id="checkoutConsent"></div>'
        + '<div class="mt-6">' + boutonPrimaire('souscrire', tr('compte_page.discover_pro_cta', 'Découvrir Pro'), 'w-full sm:w-auto') + '</div>'
        + '<p id="msgFacturation" hidden aria-live="polite"></p>')
      + '</div>';
  }

  // Tout ce que Pro debloque (19/09/2026) : la liste de la page d'abonnement,
  // en compact. « Sur chaque match » = les cles du mur Pro de la page match
  // (match_page.pro_gate_item_*), le reste = pro_offer.* : une seule source.
  // L'ancienne liste du compte (« six outils branches sur le modele », « suivi
  // de bankroll lie au compte ») n'est plus affichee : le simulateur de capital
  // et le calculateur de mise sont gratuits, seul le journal synchronise est Pro.
  function listePro() {
    function groupe(titre, items) {
      return '<p class="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-soft">' + esc(titre) + '</p>'
        + '<ul class="mt-2 space-y-2">' + items.map(function (it) {
          return '<li class="flex gap-2.5 text-[13.5px] leading-snug"><span aria-hidden="true" class="text-cyan">✓</span><span>' + it + '</span></li>';
        }).join('') + '</ul>';
    }
    var match = [
      ['pro_gate_item_bet', 'Le marché retenu par le modèle et sa probabilité en %'],
      ['pro_gate_item_scorer', 'Le buteur le plus probable et les marchés joueurs'],
      ['pro_gate_item_scenario', 'Le scénario du match par tranche de 15 minutes : quand les buts tombent'],
      ['pro_gate_item_scores', 'Les scores les plus probables et les buts attendus'],
      ['pro_gate_item_odds', 'Nos probabilités face aux cotes, marché par marché'],
      ['pro_gate_item_stats', 'Toutes les stats du match : forme, classement, face-à-face, comparatif'],
      ['pro_gate_item_faq', 'Les réponses aux questions fréquentes sur ce match']
    ].map(function (k) { return esc(tr('match_page.' + k[0], k[1])); });
    return '<div id="proListe">'
      + groupe(tr('pro_offer.group_match', 'Sur chaque match'), match)
      + groupe(tr('pro_offer.group_daily', 'Chaque jour'), [
        esc(tr('pro_offer.daily_all_matches', 'Tous les matchs analysés de nos 19 compétitions, au lieu d’un seul match offert par jour')),
        esc(tr('pro_offer.daily_scorers', 'Les 3 buteurs du jour')) + ' <span class="ml-1 inline-block rounded-full border border-amber-500/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">' + esc(tr('pro_offer.badge_new', 'Nouveau')) + '</span>'
      ])
      + groupe(tr('pro_offer.group_tools', 'Les outils'), [
        esc(tr('pro_offer.tool_scanner', 'Détecteur d’écarts du jour, sur les matchs réels')),
        esc(tr('pro_offer.tool_journal', 'Journal des décisions synchronisé sur ton compte, avec le suivi de tes résultats')),
        esc(tr('pro_offer.tool_combo', 'Combiné construit sur les analyses réelles'))
      ])
      + '</div>';
  }

  /* Préférences : profil, affichage, bankroll. Les competitions preferees ne
     sont PAS ici — elles ont leur propre section (« Mes compétitions
     préférées »), qui ecrit dans le store lu par l'accueil. */
  function fuseaux() {
    // Vraie liste du navigateur quand il l'expose (tous les navigateurs
    // recents), sinon repli sur les fuseaux les plus courants pour l'audience
    // francophone. Aucun fuseau invente dans les deux cas.
    try {
      if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
    } catch (_e) {}
    return ['Europe/Paris', 'Europe/Brussels', 'Europe/Zurich', 'Europe/London', 'Europe/Lisbon',
      'Europe/Madrid', 'America/Montreal', 'Africa/Casablanca', 'Africa/Dakar', 'UTC'];
  }
  function preferences() {
    var langues = [
      ['fr', tr('compte_page.lang_name_fr', 'Français')], ['en', tr('compte_page.lang_name_en', 'English')],
      ['es', tr('compte_page.lang_name_es', 'Espanol')], ['de', tr('compte_page.lang_name_de', 'Deutsch')],
      ['it', tr('compte_page.lang_name_it', 'Italiano')], ['pt', tr('compte_page.lang_name_pt', 'Portugues')]
    ];
    var tz = prefs.timezone || 'Europe/Paris';

    return titreSection(tr('compte_page.preferences_heading', 'Préférences'), tr('compte_page.preferences_subtitle', 'Comment IASHARK s’affiche et ce qu’il met en avant.'))
      + '<div class="space-y-4">'
      + carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.profile_heading', 'Profil') + '</h2>'
        + '<div class="mt-4 space-y-4">'
        + champ('nomAffiche', tr('compte_page.display_name_label', 'Nom affiché'), nomAffiche(), { attrs: ' maxlength="40" autocomplete="nickname"', aide: tr('compte_page.display_name_hint', '40 caractères maximum.') })
        + '<div><label for="emailLecture" class="block text-[13px] font-semibold text-soft">' + tr('compte_page.email_label', 'Email') + '</label>'
        + '<input id="emailLecture" class="fld mt-2 cursor-not-allowed opacity-70" type="email" value="' + esc(ctx.user.email) + '" readonly aria-readonly="true">'
        // Le changement d'adresse passe par un mail de confirmation cote
        // fournisseur. Tant que ce parcours n'existe pas dans le produit, on
        // ne met pas un champ libre qui laisserait croire le contraire.
        // "contact@iashark.com" n'est pas traduit : c'est une adresse email.
        + '<p class="mt-1.5 text-[12.5px] text-soft">' + tr('compte_page.change_email_note_prefix', 'Pour changer d’adresse, écrivez à ') + '<a href="mailto:contact@iashark.com" class="text-cyan transition hover:underline">contact@iashark.com</a>.</p></div>'
        + '</div>')
      // Les championnats suivis etaient regles ici par une liste de cases a
      // cocher ecrivant public.user_preferences.favorite_leagues — colonne
      // qu'aucun autre fichier du depot ne lisait : le choix etait confirme
      // ("Préférences enregistrées.") et n'avait aucun effet, ni sur
      // l'accueil ni ailleurs (constat du 16/09/2026). La liste etait en plus
      // codee en dur avec des competitions non couvertes (Ligue 2,
      // Championship, Jupiler Pro League, Süper Lig). Un seul reglage
      // subsiste, celui qui agit : les etoiles de la section Compétitions,
      // qui ecrivent le store lu par home-list.js.
      + carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.leagues_label', 'Championnats suivis') + '</h2>'
        + '<p class="mt-2 text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.leagues_moved_hint', 'Vos compétitions se choisissent dans la section Compétitions : elles remontent alors en premier dans la liste des matchs de l’accueil.') + '</p>'
        + '<div class="mt-4"><button type="button" data-aller="competitions" class="text-[13.5px] font-semibold text-cyan transition hover:underline">' + tr('compte_page.fav_leagues_cta', 'Choisir mes compétitions') + '</button></div>')
      + carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.display_heading', 'Affichage') + '</h2>'
        + '<div class="mt-4 grid gap-4 sm:grid-cols-2">'
        + '<div><label for="langue" class="block text-[13px] font-semibold text-soft">' + tr('compte_page.language_label', 'Langue') + '</label>'
        + '<select id="langue" class="fld mt-2">' + langues.map(function (l) {
            return '<option value="' + l[0] + '"' + ((prefs.language || 'fr') === l[0] ? ' selected' : '') + '>' + l[1] + '</option>';
          }).join('') + '</select></div>'
        + '<div><label for="fuseau" class="block text-[13px] font-semibold text-soft">' + tr('compte_page.timezone_label', 'Fuseau horaire') + '</label>'
        + '<input id="fuseau" class="fld mt-2" list="listeFuseaux" value="' + esc(tz) + '" autocomplete="off" spellcheck="false">'
        + '<datalist id="listeFuseaux">' + fuseaux().map(function (z) { return '<option value="' + esc(z) + '">'; }).join('') + '</datalist>'
        + '<p class="mt-1.5 text-[12.5px] text-soft">' + tr('compte_page.timezone_hint', 'Tapez pour rechercher.') + '</p></div>'
        + '</div>')
      + carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.bankroll_label', 'Bankroll') + '</h2>'
        + '<p class="mt-2 text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.bankroll_detail', 'Le capital de référence des calculs de mise. Il est privé et n’est utilisé que par vos outils.') + '</p>'
        + '<div class="mt-4 max-w-xs">' + champ('bankroll', tr('compte_page.bankroll_label', 'Bankroll'), ctx.profile.capital == null ? '' : ctx.profile.capital, { type: 'number', attrs: ' min="1" step="1" inputmode="decimal"', placeholder: tr('compte_page.bankroll_placeholder', 'Ex. 500') }) + '</div>')
      + '<div class="flex flex-wrap items-center gap-3">' + boutonPrimaire('enregistrerPrefs', tr('compte_page.save_btn', 'Enregistrer')) + '</div>'
      + '<p id="msgPrefs" hidden aria-live="polite"></p>'
      + '</div>';
  }

  /* Mes compétitions préférées : les competitions couvertes (config/leagues.json,
     noms via lib/league-names.js), une etoile chacune, enregistrement immediat. */
  var ICONE_ETOILE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" class="acc-fav-star"><path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3L2.8 9.5l6.4-.9z"/></svg>';
  function favoris() { return favStore ? favStore.list() : []; }
  function competitionsCouvertes() {
    var LN = window.IasharkLeagueNames;
    var ligues = LN && LN.LEAGUES ? LN.LEAGUES : {};
    return Object.keys(ligues).map(function (k) { return { key: k, name: ligues[k].name }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, localeTag(), { sensitivity: 'base' }); });
  }
  function nomCompetition(key) {
    var LN = window.IasharkLeagueNames;
    return (LN && LN.displayName(key)) || key;
  }
  function boutonFavori(c) {
    var actif = favoris().indexOf(c.key) !== -1;
    var libelle = (actif ? tr('compte_page.fav_remove_aria', 'Retirer {league} de vos compétitions préférées') : tr('compte_page.fav_add_aria', 'Ajouter {league} à vos compétitions préférées')).replace('{league}', c.name);
    return '<button type="button" data-fav-ligue="' + esc(c.key) + '" aria-pressed="' + actif + '" aria-label="' + esc(libelle) + '"'
      + ' class="acc-fav' + (actif ? ' is-on' : '') + '">'
      + '<span class="acc-fav-ico">' + ICONE_ETOILE + '</span>'
      + '<span class="min-w-0 flex-1 truncate">' + esc(c.name) + '</span></button>';
  }
  function competitions() {
    var liste = competitionsCouvertes();
    return titreSection(tr('compte_page.fav_leagues_heading', 'Mes compétitions préférées'), tr('compte_page.fav_leagues_subtitle', 'Elles s’affichent en premier dans la liste des matchs de l’accueil, sur tous vos appareils.'))
      + carte('<p class="text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.fav_leagues_hint', 'Touchez l’étoile d’une compétition : le choix est enregistré tout de suite.') + '</p>'
        + '<div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" id="listeFavoris">' + liste.map(boutonFavori).join('') + '</div>'
        + '<p id="msgFavoris" hidden aria-live="polite"></p>');
  }
  async function basculerFavori(bouton) {
    var key = bouton.getAttribute('data-fav-ligue');
    if (!favStore || !key) return;
    var nom = nomCompetition(key);
    var ajoute = favStore.toggle(key);
    var c = { key: key, name: nom };
    var tmp = document.createElement('div');
    tmp.innerHTML = boutonFavori(c);
    var neuf = tmp.firstChild;
    bouton.replaceWith(neuf);
    neuf.addEventListener('click', function () { basculerFavori(neuf); });
    neuf.focus({ preventScroll: true });
    try {
      await favStore.lastSave;
      retour('msgFavoris', (ajoute ? tr('compte_page.fav_added', '{league} ajoutée à vos compétitions préférées.') : tr('compte_page.fav_removed', '{league} retirée de vos compétitions préférées.')).replace('{league}', nom), 'success');
    } catch (e) {
      retour('msgFavoris', tr('compte_page.fav_error', 'Enregistrement impossible. Vérifiez votre connexion puis réessayez.'), 'error');
    }
  }

  function notifications() {
    return titreSection(tr('compte_page.notifications_heading', 'Notifications'), tr('compte_page.notifications_subtitle', 'Ce que IASHARK vous envoie par email.'))
      + carte(interrupteur('notifMatch', tr('compte_page.notif_new_analysis_title', 'Nouvelle analyse'), tr('compte_page.notif_new_analysis_detail', 'Recevoir un email quand une nouvelle analyse est publiée.'), prefs.notify_match_analysis !== false)
        + interrupteur('notifHebdo', tr('compte_page.notif_weekly_title', 'Récapitulatif hebdomadaire'), tr('compte_page.notif_weekly_detail', 'Recevoir un résumé chaque semaine.'), prefs.notify_weekly_recap !== false))
      + '<div class="mt-4 flex flex-wrap items-center gap-3">' + boutonPrimaire('enregistrerNotifs', tr('compte_page.save_btn', 'Enregistrer')) + '</div>'
      + '<p id="msgNotifs" hidden aria-live="polite"></p>'
      + emailsRelance();
  }

  /* Emails de relance (analyses offertes, conseils) : consentement explicite
     stocke dans public.email_preferences (migration 0024), enregistre au clic,
     distinct des deux interrupteurs ci-dessus (qui valent "oui" par defaut et
     ne sont donc pas un consentement). Table absente (migration pas encore
     appliquee) : reglage annonce indisponible, jamais un faux interrupteur. */
  var EMAIL_CONSENT_TEXT_VERSION = '2026-09-15';
  var emailPrefs = { etat: 'inconnu', optIn: false };
  function emailsRelance() {
    var titre = tr('email_prefs.account_title', 'Analyses offertes et conseils par email');
    return '<div class="mt-6">' + carte(emailPrefs.etat === 'ok'
        ? interrupteur('emailMarketing', titre, tr('email_prefs.account_detail', 'Le match offert, les matchs du week-end et des conseils d’utilisation, au plus un email tous les 3 jours, désinscription en 1 clic dans chaque email. Les emails liés à votre compte (abonnement, sécurité) ne dépendent pas de ce réglage.'), emailPrefs.optIn)
        : '<p class="text-[14.5px] font-semibold">' + esc(titre) + '</p><p class="mt-1 text-[13px] leading-relaxed text-soft">' + esc(tr('email_prefs.account_unavailable', 'Ce réglage n’est pas encore disponible.')) + '</p>')
      + '<p id="msgEmailMarketing" hidden aria-live="polite"></p></div>';
  }
  async function enregistrerEmailMarketing() {
    var bouton = $('emailMarketing');
    var voulu = bouton.getAttribute('aria-checked') === 'true';
    var dir = repertoire() || 'fr';
    var ligne = { user_id: ctx.user.id, marketing_opt_in: voulu, opt_in_source: 'account', market: dir,
      locale: { gb: 'en', za: 'en', mx: 'es-mx' }[dir] || dir };
    if (voulu) ligne.opt_in_text_version = EMAIL_CONSENT_TEXT_VERSION;
    bouton.disabled = true;
    retour('msgEmailMarketing', '');
    try {
      var r = await sb.from('email_preferences').upsert(ligne, { onConflict: 'user_id' });
      if (r.error) throw r.error;
      emailPrefs.optIn = voulu;
      retour('msgEmailMarketing', tr('compte_page.msg_preferences_saved', 'Préférences enregistrées.'), 'success');
    } catch (e) {
      bouton.setAttribute('aria-checked', voulu ? 'false' : 'true');
      retour('msgEmailMarketing', lisible(e), 'error');
    }
    bouton.disabled = false;
  }

  function securite() {
    return titreSection(tr('compte_page.security_heading', 'Sécurité'), tr('compte_page.security_subtitle', 'L’accès à votre compte.'))
      + '<div class="space-y-4">'
      + carte('<div class="flex flex-wrap items-start justify-between gap-4">'
        + '<div><h2 class="text-[14.5px] font-semibold">' + tr('compte_page.password_heading', 'Mot de passe') + '</h2>'
        + '<p class="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.password_change_detail', 'Pour le changer, vous devrez saisir le mot de passe actuel. Si vous l’avez oublié, passez par le lien de réinitialisation.') + '</p></div>'
        + boutonSecondaire('ouvrirMdp', tr('compte_page.change_password_cta', 'Modifier le mot de passe')) + '</div>'
        + '<p class="mt-3 text-[13px]"><a href="' + esc(lien('mot-de-passe-oublie.html')) + '" class="text-cyan transition hover:underline">' + tr('compte_page.forgot_password_link', 'J\'ai oublie mon mot de passe') + '</a></p>')
      + carte('<div class="flex flex-wrap items-start justify-between gap-4">'
        + '<div><h2 class="text-[14.5px] font-semibold">' + tr('compte_page.logout_label', 'Déconnexion') + '</h2>'
        + '<p class="mt-1.5 text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.logout_detail', 'Ferme la session sur cet appareil.') + '</p></div>'
        + boutonSecondaire('deconnexion2', tr('compte_page.logout_cta', 'Se déconnecter')) + '</div>')
      + '</div>'
      + dialogueMotDePasse();
  }

  function donnees() {
    return titreSection(tr('compte_page.data_heading', 'Données et confidentialité'), tr('compte_page.data_subtitle', 'Ce que nous conservons, et comment le récupérer ou l’effacer.'))
      + '<div class="space-y-4">'
      + carte('<div class="flex flex-wrap items-start justify-between gap-4">'
        + '<div><h2 class="text-[14.5px] font-semibold">' + tr('compte_page.export_data_heading', 'Exporter mes données') + '</h2>'
        + '<p class="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.export_data_detail', 'Téléchargez un fichier JSON contenant votre compte, vos préférences, votre journal de décisions et l’état de votre abonnement.') + '</p></div>'
        + boutonSecondaire('exporter', tr('compte_page.export_cta', 'Exporter')) + '</div>'
        + '<p id="msgExport" hidden aria-live="polite"></p>')
      // Confidentialite : refus du lien entre les visites et le compte
      // (basculerSuivi, lu par funnel-track.js).
      + carte('<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-soft">' + tr('compte_page.privacy_heading', 'Confidentialité') + '</h2>'
        + '<div class="mt-4">' + interrupteur('refusSuivi', tr('compte_page.privacy_opt_out_title', 'Ne pas lier mes visites à mon compte'),
            tr('compte_page.privacy_opt_out_detail', 'Quand vous êtes connecté, les pages que vous consultez sont associées à votre compte pour nous aider à améliorer le service. Activez cette option pour qu’elles restent anonymes. Rien d’autre ne change.'), refusSuivi()) + '</div>'
        + '<p class="text-[12.5px] text-soft"><a href="' + esc(lien('confidentialite.html')) + '" class="text-cyan transition hover:underline">' + tr('compte_page.privacy_policy_link', 'Politique de confidentialité') + '</a></p>'
        + '<p id="msgSuivi" hidden aria-live="polite"></p>')
      // Zone dangereuse en bas de la derniere section, jamais sur la vue
      // d'ensemble : on ne met pas un bouton de suppression sous les yeux de
      // quelqu'un venu changer sa langue.
      + '<section class="rounded-2xl border border-red-500/25 bg-red-500/[.04] p-5 sm:p-6">'
        + '<h2 class="text-[12px] font-bold uppercase tracking-[0.16em] text-red-300">' + tr('compte_page.danger_zone_heading', 'Zone dangereuse') + '</h2>'
        + '<div class="mt-4 flex flex-wrap items-start justify-between gap-4">'
        + '<div><h3 class="text-[14.5px] font-semibold">' + tr('compte_page.delete_account_heading', 'Supprimer mon compte') + '</h3>'
        + '<p class="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.delete_account_detail_prefix', 'Efface définitivement votre compte, vos préférences et votre journal.')
        + (ctx.isPro && abo && ['active', 'trialing', 'past_due'].indexOf(abo.status) !== -1 ? tr('compte_page.delete_account_stripe_clause', ' Votre abonnement en cours sera résilié avant la suppression.') : '')
        + tr('compte_page.delete_account_irreversible', ' Cette action est irréversible.') + '</p></div>'
        + '<button type="button" id="ouvrirSuppression" class="h-11 rounded-xl border border-red-500/40 px-5 text-[14px] font-semibold text-red-300 transition hover:bg-red-500/10">' + tr('compte_page.delete_cta', 'Supprimer') + '</button>'
        + '</div></section>'
      + '</div>'
      + dialogueSuppression();
  }

  /* ---------- Dialogues ---------- */
  function dialogueMotDePasse() {
    return '<dialog id="dlgMdp" class="w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-hairline bg-surface p-6 text-ink backdrop:bg-black/70">'
      + '<h2 class="text-[18px] font-bold tracking-tight">' + tr('compte_page.change_password_cta', 'Modifier le mot de passe') + '</h2>'
      + '<form id="formMdp" novalidate class="mt-5">'
      + '<div><label for="mdpActuel" class="block text-[13px] font-semibold text-soft">' + tr('compte_page.current_password_label', 'Mot de passe actuel') + '</label>'
      + '<input id="mdpActuel" class="fld mt-2" type="password" autocomplete="current-password" required></div>'
      + '<div class="mt-4"><label for="mdpNouveau" class="block text-[13px] font-semibold text-soft">' + tr('compte_page.new_password_field_label', 'Nouveau mot de passe') + '</label>'
      + '<input id="mdpNouveau" class="fld mt-2" type="password" autocomplete="new-password" minlength="8" required>'
      + '<p class="mt-1.5 text-[12.5px] text-soft">' + tr('compte_page.password_min_hint', '8 caracteres minimum.') + '</p></div>'
      + '<div class="mt-4"><label for="mdpConfirme" class="block text-[13px] font-semibold text-soft">' + tr('compte_page.confirm_password_label', 'Confirmer') + '</label>'
      + '<input id="mdpConfirme" class="fld mt-2" type="password" autocomplete="new-password" required></div>'
      + '<p id="msgMdp" hidden aria-live="polite"></p>'
      + '<div class="mt-6 flex justify-end gap-3">'
      + boutonSecondaire('annulerMdp', tr('compte_page.cancel_btn', 'Annuler'))
      + '<button type="submit" id="validerMdp" class="h-11 rounded-xl bg-cyan px-5 text-[14px] font-bold text-[#04141b] transition hover:bg-cyan/90 disabled:cursor-wait disabled:opacity-60">' + tr('compte_page.update_password_cta', 'Mettre a jour') + '</button>'
      + '</div></form></dialog>';
  }
  function dialogueSuppression() {
    return '<dialog id="dlgSuppr" class="w-[min(460px,calc(100vw-2rem))] rounded-2xl border border-red-500/25 bg-surface p-6 text-ink backdrop:bg-black/70">'
      + '<h2 class="text-[18px] font-bold tracking-tight">' + tr('compte_page.delete_confirm_heading', 'Supprimer votre compte ?') + '</h2>'
      + '<p class="mt-3 text-[13.5px] leading-relaxed text-soft">' + tr('compte_page.delete_confirm_detail', 'Votre compte, vos préférences et votre journal seront définitivement effacés. Cette action ne peut pas être annulée.') + '</p>'
      + '<form id="formSuppr" novalidate class="mt-5">'
      // Le mot en gras doit rester identique a celui verifie par
      // supprimerCompte() (meme cle compte_page.delete_confirm_word) : sinon
      // la confirmation ne matcherait jamais dans une langue traduite.
      + '<label for="confirmationSuppr" class="block text-[13px] font-semibold text-soft">' + tr('compte_page.delete_confirm_instruction_prefix', 'Pour confirmer, saisissez ') + '<b class="text-ink">' + esc(tr('compte_page.delete_confirm_word', 'SUPPRIMER')) + '</b></label>'
      + '<input id="confirmationSuppr" class="fld mt-2" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" required>'
      + '<p id="msgSuppr" hidden aria-live="polite"></p>'
      + '<div class="mt-6 flex justify-end gap-3">'
      + boutonSecondaire('annulerSuppr', tr('compte_page.cancel_btn', 'Annuler'))
      + '<button type="submit" id="validerSuppr" class="h-11 rounded-xl bg-red-500/90 px-5 text-[14px] font-bold text-white transition hover:bg-red-500 disabled:cursor-wait disabled:opacity-60">' + tr('compte_page.delete_confirm_cta', 'Supprimer définitivement') + '</button>'
      + '</div></form></dialog>';
  }

  /* ---------- Charpente ---------- */
  var SECTIONS = [
    { id: 'apercu', titre: 'Vue d’ensemble', rendu: apercu },
    { id: 'abonnement', titre: 'Abonnement', rendu: abonnement },
    { id: 'preferences', titre: 'Préférences', rendu: preferences },
    { id: 'competitions', titre: 'Mes compétitions préférées', rendu: competitions },
    { id: 'notifications', titre: 'Notifications', rendu: notifications },
    { id: 'securite', titre: 'Sécurité', rendu: securite },
    { id: 'donnees', titre: 'Données', rendu: donnees }
  ];
  // Cles i18n des libelles de nav, reutilisant les cles des titres de section
  // deja definis plus haut (meme texte FR) quand elles existent - seul
  // "Données" (libelle court de nav) differe du titre complet de la section
  // ("Données et confidentialité"), d'ou une cle dediee pour lui seul. Calcule
  // a chaque rendu de navigation() (jamais fige au chargement du script) car
  // SECTIONS est evalue avant que le dictionnaire i18n ne soit charge.
  var NAV_LABELS = {
    apercu: ['compte_page.section_overview_title', 'Vue d’ensemble'],
    abonnement: ['compte_page.subscription_heading', 'Abonnement'],
    preferences: ['compte_page.preferences_heading', 'Préférences'],
    competitions: ['compte_page.fav_leagues_nav', 'Compétitions'],
    notifications: ['compte_page.notifications_heading', 'Notifications'],
    securite: ['compte_page.security_heading', 'Sécurité'],
    donnees: ['compte_page.nav_data', 'Données']
  };

  function navigation() {
    var liens = SECTIONS.map(function (s) {
      var actif = s.id === sectionActive;
      var cle = NAV_LABELS[s.id] || [null, s.titre];
      var libelle = tr(cle[0], cle[1]);
      return '<button type="button" class="acc-tab shrink-0 rounded-lg px-3.5 py-2.5 text-left text-[14px] font-medium text-soft transition hover:text-ink lg:w-full"'
        + (actif ? ' aria-current="page"' : '') + ' data-aller="' + s.id + '">' + esc(libelle) + '</button>';
    }).join('');
    return '<nav aria-label="' + esc(tr('compte_page.nav_aria_label', 'Sections du compte')) + '">'
      + '<div class="-mx-4 flex gap-1 overflow-x-auto border-b border-hairline px-4 pb-2 lg:mx-0 lg:flex-col lg:gap-0.5 lg:border-0 lg:px-0 lg:pb-0">' + liens + '</div>'
      + '<button type="button" id="deconnexion" class="mt-4 hidden w-full rounded-lg px-3.5 py-2.5 text-left text-[14px] font-medium text-soft transition hover:text-ink lg:block">' + tr('compte_page.logout_label', 'Déconnexion') + '</button>'
      + '</nav>';
  }

  function enTete() {
    var nom = nomAffiche(), b = badgePlan();
    var depuis = date(ctx.profile.created_at || ctx.user.created_at);
    return '<div class="flex flex-wrap items-center gap-4 border-b border-hairline py-7">'
      + '<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-hairline bg-panel text-[17px] font-bold tracking-wide text-cyan" aria-hidden="true">' + esc(initiales(nom)) + '</div>'
      + '<div class="min-w-0 flex-1">'
      + '<div class="flex flex-wrap items-center gap-2.5"><p class="truncate text-[18px] font-bold tracking-tight">' + esc(nom) + '</p>'
      + '<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold tracking-wider ' + b.classe + '">' + b.texte + '</span></div>'
      + '<p class="mt-0.5 truncate text-[13.5px] text-soft">' + esc(ctx.user.email) + '</p>'
      + (depuis ? '<p class="mt-0.5 text-[12.5px] text-soft">' + tr('compte_page.member_since_prefix', 'Membre depuis le ') + esc(depuis) + '</p>' : '')
      + '</div></div>';
  }

  function afficher() {
    var section = SECTIONS.filter(function (s) { return s.id === sectionActive; })[0] || SECTIONS[0];
    racine.innerHTML = enTete()
      // grid-cols-1 = minmax(0,1fr) : sans colonne explicite, la piste unique
      // mobile prenait la largeur min-content des onglets (nowrap) et d'un
      // email long, et la page debordait a 664 px sur un ecran de 390 px.
      + '<div class="acc-layout grid grid-cols-1 gap-7 pt-7 lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-10">'
      + '<div class="min-w-0 lg:sticky lg:top-6 lg:self-start">' + navigation() + '</div>'
      + '<div class="acc-panel min-w-0" id="panneau">' + section.rendu() + '</div>'
      + '</div>';
    brancher();
  }

  function aller(id) {
    if (!SECTIONS.some(function (s) { return s.id === id; })) return;
    sectionActive = id;
    if (String(location.hash || '').replace('#', '') !== id) location.hash = id;
    afficher();
    var p = $('panneau');
    if (p) { p.setAttribute('tabindex', '-1'); p.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // Page vers laquelle revenir apres connexion/inscription. Un chemin interne
  // uniquement (meme regle que auth-pages.js#destination) : jamais une URL
  // absolue ni un //hote, sinon la page devient une redirection ouverte.
  function retourApresConnexion() {
    var brut = new URLSearchParams(location.search).get('next') || '';
    var interne = function (p) { return p && p.charAt(0) === '/' && p.charAt(1) !== '/' && p.indexOf('\\') === -1; };
    if (interne(brut)) return brut;
    try {
      var ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin && /\/(match|abonnement|pro)\.html$/.test(ref.pathname)) return ref.pathname + ref.search;
    } catch (_e) {}
    return location.pathname + location.hash;
  }

  /* ---------- Branchements ---------- */
  function brancher() {
    racine.querySelectorAll('[data-aller]').forEach(function (el) {
      el.addEventListener('click', function () { aller(el.getAttribute('data-aller')); });
    });
    racine.querySelectorAll('[role="switch"]').forEach(function (el) {
      el.addEventListener('click', function () {
        el.setAttribute('aria-checked', el.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
      });
    });
    ['deconnexion', 'deconnexion2'].forEach(function (id) {
      var b = $(id);
      if (b) b.addEventListener('click', deconnecter);
    });
    if ($('enregistrerPrefs')) $('enregistrerPrefs').addEventListener('click', enregistrerPreferences);
    if ($('enregistrerNotifs')) $('enregistrerNotifs').addEventListener('click', enregistrerNotifications);
    if ($('emailMarketing')) $('emailMarketing').addEventListener('click', enregistrerEmailMarketing);
    if ($('souscrire')) {
      // Seules les durees payables sont affichees (19/09/2026) : « meme acces
      // quelle que soit la duree » seulement s'il y a plusieurs durees a choisir.
      // Aucune duree payable (config/markets.json#checkoutOpen = [] : gb, mx, za
      // le 19/09/2026) : le selecteur affiche « paiement pas encore ouvert » ;
      // ni consentement ni bouton « Decouvrir Pro » qui echouerait a chaque fois.
      selecteur = ($('proPlanPicker') && window.IasharkProPlanPicker) ? window.IasharkProPlanPicker.mount($('proPlanPicker'), {
        onUpdate: function (visibles) {
          var n = visibles ? visibles.length : 0;
          var note = $('proDureesNote'); if (note) note.hidden = n < 2;
          ['souscrire', 'checkoutConsent', 'msgFacturation'].forEach(function (id) {
            var el = $(id);
            if (!el) return;
            if (n === 0) { el.hidden = true; el.style.display = 'none'; }
            else { el.style.display = ''; if (id !== 'msgFacturation') el.hidden = false; }
          });
        }
      }) : null;
      if (selecteur) selecteur.loadAvailability();
      monterConsentement();
      $('souscrire').addEventListener('click', function () { facturation('create-checkout-session', $('souscrire')); });
    }
    if ($('portail')) $('portail').addEventListener('click', function () { facturation('create-portal-session', $('portail')); });
    if ($('changerDuree')) $('changerDuree').addEventListener('click', function () { facturation('create-portal-session', $('changerDuree'), { flow: 'change_interval' }); });
    if ($('resilier')) $('resilier').addEventListener('click', function () { facturation('create-portal-session', $('resilier')); });
    if ($('exporter')) $('exporter').addEventListener('click', exporter);
    if ($('refusSuivi')) $('refusSuivi').addEventListener('click', basculerSuivi);
    racine.querySelectorAll('[data-fav-ligue]').forEach(function (b) {
      b.addEventListener('click', function () { basculerFavori(b); });
    });
    brancherDialogues();
  }

  async function deconnecter() {
    await sb.auth.signOut();
    location.href = lien('connexion.html');
  }

  async function enregistrerPreferences() {
    var relacher = occuper($('enregistrerPrefs'), tr('compte_page.saving_label', 'Enregistrement…'));
    retour('msgPrefs', '');
    var capitalBrut = $('bankroll').value.trim();
    var capital = capitalBrut === '' ? null : Number(capitalBrut);
    if (capital !== null && !(capital > 0)) {
      relacher(); retour('msgPrefs', tr('compte_page.msg_bankroll_must_be_positive', 'La bankroll doit être un montant supérieur à zéro.'), 'error'); $('bankroll').focus(); return;
    }
    var ligne = {
      user_id: ctx.user.id,
      display_name: $('nomAffiche').value.trim().slice(0, 40) || null,
      language: $('langue').value,
      timezone: $('fuseau').value.trim() || 'Europe/Paris',
      notify_match_analysis: prefs.notify_match_analysis !== false,
      notify_weekly_recap: prefs.notify_weekly_recap !== false
    };
    try {
      var r1 = await sb.from('user_preferences').upsert(ligne, { onConflict: 'user_id' });
      if (r1.error) throw r1.error;
      // La bankroll vit dans public.users.capital, seule source de verite -
      // les outils lisent la meme colonne. On n'en garde pas une copie ici.
      if (capital !== ctx.profile.capital) {
        var r2 = await sb.from('users').update({ capital: capital }).eq('id', ctx.user.id);
        if (r2.error) throw r2.error;
        ctx.profile.capital = capital;
      }
      Object.assign(prefs, ligne);
      relacher();
      retour('msgPrefs', tr('compte_page.msg_preferences_saved', 'Préférences enregistrées.'), 'success');
    } catch (e) {
      relacher();
      retour('msgPrefs', lisible(e), 'error');
    }
  }

  async function enregistrerNotifications() {
    var relacher = occuper($('enregistrerNotifs'), tr('compte_page.saving_label', 'Enregistrement…'));
    retour('msgNotifs', '');
    var ligne = {
      user_id: ctx.user.id,
      notify_match_analysis: $('notifMatch').getAttribute('aria-checked') === 'true',
      notify_weekly_recap: $('notifHebdo').getAttribute('aria-checked') === 'true'
    };
    try {
      var r = await sb.from('user_preferences').upsert(ligne, { onConflict: 'user_id' });
      if (r.error) throw r.error;
      Object.assign(prefs, ligne);
      relacher();
      retour('msgNotifs', tr('compte_page.msg_preferences_saved', 'Préférences enregistrées.'), 'success');
    } catch (e) {
      relacher();
      retour('msgNotifs', lisible(e), 'error');
    }
  }

  /* Consentement obligatoire avant paiement (lib/checkout-consent.js) : CGV +
     demande d'execution immediate selon le marche, cases jamais pre-cochees.
     create-checkout-session refait la meme verification cote serveur. Le
     module est charge a la demande si la page generee ne l'inclut pas encore ;
     s'il ne se charge pas, aucun paiement n'est lance. */
  var consentement = null;
  function chargerConsentement() {
    return new Promise(function (resolve) {
      if (window.IasharkCheckoutConsent) return resolve(window.IasharkCheckoutConsent);
      var s = document.createElement('script');
      s.src = '/lib/checkout-consent.js';
      s.onload = function () { resolve(window.IasharkCheckoutConsent || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }
  // Selecteur de duree de la carte « Avec Pro » (compte gratuit).
  var selecteur = null;
  function monterConsentement() {
    consentement = null;
    var bloc = $('checkoutConsent'), bouton = $('souscrire');
    if (!bloc || !bouton) return;
    chargerConsentement().then(function (lib) {
      // La section a pu etre re-rendue entre-temps : on ne monte que sur le bloc courant.
      if (lib && $('checkoutConsent') === bloc) consentement = lib.mount(bloc, { buttons: [bouton] });
    });
  }

  async function facturation(fonction, bouton, options) {
    var consentementPaiement = null;
    if (fonction === 'create-checkout-session') {
      if (!consentement) {
        retour('msgFacturation', tr('checkout_consent.error_load', 'Les conditions de paiement n’ont pas pu être chargées. Rechargez la page.'), 'error');
        return;
      }
      if (!consentement.check()) {
        // Le bloc de consentement affiche deja son message : un seul message a l'ecran.
        retour('msgFacturation', '');
        return;
      }
      consentementPaiement = consentement.payload();
      // Disponibilites du serveur connues avant de payer (lib/pro-plan-picker.js#whenReady).
      if (selecteur && selecteur.whenReady) await selecteur.whenReady();
      if (selecteur && !selecteur.isAvailable()) {
        retour('msgFacturation', tr('pricing_page.checkout_interval_not_configured', 'Cette durée n’est pas encore ouverte au paiement. Choisis une autre durée ou reviens bientôt. Aucun montant n’a été prélevé.'), 'error');
        return;
      }
    }
    var relacher = occuper(bouton, tr('compte_page.opening_label', 'Ouverture…'));
    retour('msgFacturation', '');
    try {
      var s = await sb.auth.getSession();
      var token = s.data.session && s.data.session.access_token;
      // Paiement : marche (IASHARK_MARKET.checkoutMarket : gb/mx/za, us pour
      // /en/ apres config/markets.json#_usdSwitch ; null = marche FR historique,
      // champ absent) et repertoire de site (retour sur
      // /<dir>/checkout-succes.html). Jamais une liste de marches ecrite ici :
      // un marche oublie serait facture au tarif EUR par defaut. Le portail
      // de facturation recoit le repertoire (retour sur /<dir>/compte.html) et,
      // pour « Changer de duree », le flux de changement d'offre.
      var corps = {};
      var dir = repertoire();
      if (fonction === 'create-portal-session') {
        if (dir) corps.dir = dir;
        if (options && options.flow === 'change_interval') corps.flow = 'change_interval';
      }
      if (fonction === 'create-checkout-session') {
        corps.interval = selecteur ? selecteur.interval() : 'month';
        var mk = marche();
        // Sans lib/market-config.js (repli) : le repertoire pays seul.
        var code = mk ? (mk.checkoutMarket || '') : (dir === 'gb' || dir === 'mx' || dir === 'za' ? dir : '');
        if (code) corps.market = String(code).toLowerCase();
        if (dir) corps.dir = dir;
        corps.consent = consentementPaiement;
      }
      var r = await fetch(window.IasharkApp.url + '/functions/v1/' + fonction, {
        method: 'POST',
        headers: { apikey: window.IasharkApp.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(corps)
      });
      var j = await r.json();
      if (j.url) { location.href = j.url; return; }
      relacher();
      if (j.code === 'consent_required') {
        if (consentement && !consentement.check()) retour('msgFacturation', '');
        else retour('msgFacturation', j.message || tr('checkout_consent.error_required', 'Cochez les cases obligatoires ci-dessus pour continuer vers le paiement.'), 'error');
        return;
      }
      if (j.processed === false && j.reason === 'interval_not_configured') {
        retour('msgFacturation', tr('pricing_page.checkout_interval_not_configured', 'Cette durée n’est pas encore ouverte au paiement. Choisis une autre durée ou reviens bientôt. Aucun montant n’a été prélevé.'), 'error');
        return;
      }
      if (j.processed === false && j.reason === 'already_subscribed') {
        retour('msgFacturation', tr('pricing_page.checkout_already_subscribed', 'Tu as déjà un abonnement Pro. Pour changer de durée, passe par ton compte.'), 'error');
        return;
      }
      if (j.processed === false && j.reason === 'price_mismatch') {
        retour('msgFacturation', tr('pricing_page.checkout_price_mismatch', 'Le paiement de cette durée est momentanément indisponible. Aucun montant n’a été prélevé.'), 'error');
        return;
      }
      if (j.processed === false && j.reason === 'market_not_configured') {
        retour('msgFacturation', tr('compte_page.err_market_not_configured', 'Le paiement en ligne n’est pas encore ouvert dans votre pays. Vous pouvez continuer à utiliser IASHARK gratuitement.'), 'error');
        return;
      }
      retour('msgFacturation', j.message || tr('compte_page.err_billing_unavailable', 'Le paiement en ligne n’est pas disponible pour le moment.'), 'error');
    } catch (e) {
      relacher();
      retour('msgFacturation', tr('compte_page.err_billing_open_failed', 'Impossible d’ouvrir la page de paiement. Réessayez dans quelques instants.'), 'error');
    }
  }

  /* Confidentialite : « Ne pas lier mes visites a mon compte ». Choix garde
     sur le compte (user_metadata.tracking_opt_out, lu par funnel-track.js sur
     tous les appareils) et sur cet appareil (localStorage
     iashark_tracking_opt_out, applique tout de suite, meme si l'enregistrement
     en ligne echoue). Aucune autre donnee n'est ecrite. */
  var CLE_REFUS_SUIVI = 'iashark_tracking_opt_out';
  function refusSuivi() {
    var meta = (ctx.user && ctx.user.user_metadata) || {};
    if (meta.tracking_opt_out === true) return true;
    try { return localStorage.getItem(CLE_REFUS_SUIVI) === '1'; } catch (_e) { return false; }
  }
  async function basculerSuivi() {
    var bouton = $('refusSuivi');
    if (!bouton) return;
    // aria-checked vient d'etre bascule par le gestionnaire commun des interrupteurs.
    var refus = bouton.getAttribute('aria-checked') === 'true';
    bouton.disabled = true;
    retour('msgSuivi', '');
    if (refus) { try { localStorage.setItem(CLE_REFUS_SUIVI, '1'); } catch (_e) {} }
    try {
      var r = await sb.auth.updateUser({ data: { tracking_opt_out: refus } });
      if (r.error) throw r.error;
      if (r.data && r.data.user) ctx.user = r.data.user;
      if (!refus) { try { localStorage.removeItem(CLE_REFUS_SUIVI); } catch (_e) {} }
      retour('msgSuivi', refus
        ? tr('compte_page.privacy_opt_out_saved', 'C’est noté : vos visites ne sont plus liées à votre compte.')
        : tr('compte_page.privacy_opt_in_saved', 'Vos visites sont de nouveau liées à votre compte.'), 'success');
    } catch (e) {
      if (refus) {
        retour('msgSuivi', tr('compte_page.privacy_opt_out_device_only', 'Enregistré sur cet appareil. L’enregistrement sur votre compte a échoué : réessayez plus tard pour l’appliquer à vos autres appareils.'), 'error');
      } else {
        bouton.setAttribute('aria-checked', 'true');
        retour('msgSuivi', lisible(e), 'error');
      }
    }
    bouton.disabled = false;
  }

  async function exporter() {
    var relacher = occuper($('exporter'), tr('compte_page.preparing_label', 'Préparation…'));
    retour('msgExport', '');
    try {
      var res = await Promise.all([
        sb.from('users').select('email,plan,role,capital,created_at,updated_at').eq('id', ctx.user.id).maybeSingle(),
        sb.from('user_preferences').select('*').eq('user_id', ctx.user.id).maybeSingle(),
        sb.from('betting_decisions').select('*').eq('user_id', ctx.user.id),
        sb.from('subscriptions').select('status,billing_interval,current_period_end,cancel_at_period_end,created_at').eq('user_id', ctx.user.id),
        // Droit d'acces : visites liees au compte (funnel_events, politique
        // RLS funnel_events_select_own de 0025). Lecture seule de SES lignes.
        sb.from('funnel_events').select('created_at,event_type,page,locale,session_id,metadata')
          .eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(5000),
        // Preferences d'emails (migration 0024, lecture de SA ligne via RLS).
        sb.from('email_preferences').select('marketing_opt_in,opt_in_at,opt_in_source,opt_in_text_version,unsubscribed_at,unsubscribe_source,locale,market,created_at,updated_at')
          .eq('user_id', ctx.user.id).maybeSingle()
      ]);
      var contenu = {
        exporte_le: new Date().toISOString(),
        compte: res[0].data, preferences: res[1].data,
        décisions: res[2].data || [], abonnements: res[3].data || [],
        // Si la lecture est refusee (mise a jour de la base pas encore
        // appliquee), on le dit au lieu d'exporter une liste vide trompeuse.
        visites_liees_au_compte: res[4].error ? 'indisponible pour le moment' : (res[4].data || []),
        // Table absente (0024 pas encore appliquee) ou lecture refusee : cle
        // simplement omise (undefined n'est pas ecrit par JSON.stringify).
        preferences_emails: res[5].error ? undefined : (res[5].data || null)
      };
      var blob = new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = tr('compte_page.export_filename_prefix', 'iashark-mes-donnees-') + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      relacher();
      retour('msgExport', tr('compte_page.msg_file_downloaded', 'Fichier téléchargé.'), 'success');
    } catch (e) {
      relacher();
      retour('msgExport', lisible(e), 'error');
    }
  }

  function brancherDialogues() {
    var dlgMdp = $('dlgMdp');
    if (dlgMdp) {
      $('ouvrirMdp').addEventListener('click', function () { retour('msgMdp', ''); $('formMdp').reset(); dlgMdp.showModal(); });
      $('annulerMdp').addEventListener('click', function () { dlgMdp.close(); });
      $('formMdp').addEventListener('submit', changerMotDePasse);
    }
    var dlgSuppr = $('dlgSuppr');
    if (dlgSuppr) {
      $('ouvrirSuppression').addEventListener('click', function () { retour('msgSuppr', ''); $('formSuppr').reset(); dlgSuppr.showModal(); });
      $('annulerSuppr').addEventListener('click', function () { dlgSuppr.close(); });
      $('formSuppr').addEventListener('submit', supprimerCompte);
    }
  }

  /* Le mot de passe actuel est reellement verifie aupres du fournisseur avant
     le changement : sans cela, quelqu'un qui trouve une session ouverte
     pourrait changer le mot de passe et prendre le compte. */
  async function changerMotDePasse(e) {
    e.preventDefault();
    var actuel = $('mdpActuel').value, nouveau = $('mdpNouveau').value, confirme = $('mdpConfirme').value;
    if (!actuel) { retour('msgMdp', tr('compte_page.msg_enter_current_password', 'Saisissez votre mot de passe actuel.'), 'error'); $('mdpActuel').focus(); return; }
    if (nouveau.length < 8) { retour('msgMdp', tr('compte_page.msg_new_password_too_short', '8 caractères minimum pour le nouveau mot de passe.'), 'error'); $('mdpNouveau').focus(); return; }
    if (nouveau !== confirme) { retour('msgMdp', tr('compte_page.msg_new_passwords_mismatch', 'Les deux mots de passe ne correspondent pas.'), 'error'); $('mdpConfirme').focus(); return; }

    var relacher = occuper($('validerMdp'), tr('compte_page.updating_label', 'Mise à jour…'));
    retour('msgMdp', '');
    try {
      var verif = await sb.auth.signInWithPassword({ email: ctx.user.email, password: actuel });
      if (verif.error) throw new Error('mot_de_passe_actuel');
      var maj = await sb.auth.updateUser({ password: nouveau });
      if (maj.error) throw maj.error;
      relacher();
      $('dlgMdp').close();
      retour('msgExport', '');
      alerteSection(tr('compte_page.msg_password_changed', 'Mot de passe modifié.'));
    } catch (err) {
      relacher();
      retour('msgMdp', err && err.message === 'mot_de_passe_actuel'
        ? tr('compte_page.err_current_password_incorrect', 'Mot de passe actuel incorrect.') : lisible(err), 'error');
    }
  }

  /* La suppression est faite par la fonction Edge delete-account, qui resilie
     d'abord l'abonnement Stripe puis efface le compte avec le role de service.
     Rien de tout cela ne peut etre fait depuis le navigateur : le client n'a
     ni le droit d'effacer auth.users, ni les cles Stripe. */
  async function supprimerCompte(e) {
    e.preventDefault();
    // Compare au meme mot que celui affiche en gras dans le dialogue (meme
    // cle compte_page.delete_confirm_word) : indispensable pour que la
    // confirmation reste possible une fois la page traduite. Le payload
    // envoye au serveur (plus bas) reste 'SUPPRIMER' en dur : c'est un
    // contrat d'API interne, pas du texte affiche, il ne se traduit pas.
    var motAttendu = tr('compte_page.delete_confirm_word', 'SUPPRIMER').trim().toUpperCase();
    if ($('confirmationSuppr').value.trim().toUpperCase() !== motAttendu) {
      retour('msgSuppr', tr('compte_page.msg_type_supprimer_to_confirm', 'Saisissez SUPPRIMER pour confirmer.'), 'error');
      $('confirmationSuppr').focus();
      return;
    }
    var relacher = occuper($('validerSuppr'), tr('compte_page.deleting_label', 'Suppression…'));
    retour('msgSuppr', '');
    try {
      var s = await sb.auth.getSession();
      var token = s.data.session && s.data.session.access_token;
      var r = await fetch(window.IasharkApp.url + '/functions/v1/delete-account', {
        method: 'POST',
        headers: { apikey: window.IasharkApp.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'SUPPRIMER' })
      });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok || !j.ok) throw new Error(j.message || 'suppression_impossible');
      await sb.auth.signOut();
      location.href = lien('?compte-supprime=1');
    } catch (err) {
      relacher();
      retour('msgSuppr', (err && err.message && err.message !== 'suppression_impossible')
        ? err.message
        : tr('compte_page.err_deletion_failed_contact', 'La suppression n’a pas pu aboutir. Écrivez à contact@iashark.com et nous la traiterons.'), 'error');
    }
  }

  /* Message court en haut du panneau, pour les actions faites dans un
     dialogue qui vient de se fermer. */
  function alerteSection(texte) {
    var p = $('panneau');
    if (!p) return;
    var el = document.createElement('p');
    el.setAttribute('role', 'status');
    el.className = 'mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/[.07] px-3.5 py-3 text-[13.5px] text-emerald-300';
    el.textContent = texte;
    p.insertBefore(el, p.firstChild);
    setTimeout(function () { el.remove(); }, 6000);
  }

  function occuper(btn, texte) {
    if (!btn) return function () {};
    var initial = btn.textContent, largeur = btn.offsetWidth;
    btn.disabled = true; btn.style.minWidth = largeur + 'px'; btn.textContent = texte;
    return function () { btn.disabled = false; btn.textContent = initial; btn.style.minWidth = ''; };
  }

  /* Jamais le message brut de Postgres ou du fournisseur. */
  function lisible(e) {
    var m = String((e && e.message) || '');
    if (/JWT|not authenticated|invalid claim/i.test(m)) return tr('compte_page.err_session_expired', 'Votre session a expiré. Reconnectez-vous.');
    if (/row-level security|permission denied/i.test(m)) return tr('compte_page.err_not_authorized', 'Cette modification n’est pas autorisée.');
    if (/Failed to fetch|NetworkError/i.test(m)) return tr('compte_page.err_network', 'Connexion au serveur impossible. Vérifiez votre réseau.');
    if (/violates check constraint/i.test(m)) return tr('compte_page.err_invalid_value', 'Une valeur saisie n’est pas acceptée. Vérifiez le formulaire.');
    if (/same as the old password/i.test(m)) return tr('compte_page.err_password_same_as_old', 'Ce mot de passe est identique à l’ancien.');
    return tr('compte_page.err_generic', 'Une erreur est survenue. Réessayez dans quelques instants.');
  }

  /* ---------- Demarrage ---------- */
  // Filet de securite du passage en Pro : avant d'afficher quoi que ce soit,
  // on demande au serveur de re-verifier l'abonnement reel chez Stripe. Si un
  // webhook s'est perdu (bug reel du 02/09/2026 : paiement encaisse, compte
  // reste gratuit), le compte se repare tout seul a l'ouverture de cette page.
  async function synchroniserFacturation() {
    try {
      var s = await sb.auth.getSession();
      var t = s.data.session && s.data.session.access_token;
      if (!t) return;
      await fetch(window.IasharkApp.url + '/functions/v1/sync-subscription', {
        method: 'POST',
        headers: { apikey: window.IasharkApp.key, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: '{}'
      });
    } catch (_e) {}
  }

  async function demarrer() {
    // Le dictionnaire i18n doit etre charge avant le premier rendu : sinon
    // les libelles de navigation (calcules une seule fois par SECTIONS, voir
    // plus haut) resteraient figes sur leur repli francais pour toute la
    // session. window.I18N.init() est idempotent (le dictionnaire est mis en
    // cache) : l'attendre ici est sans risque meme s'il a deja ete lance par
    // ailleurs.
    if (window.I18N && window.I18N.init) { try { await window.I18N.init(); } catch (_e) {} }
    await synchroniserFacturation();
    ctx = await window.IasharkApp.context();
    if (!ctx.user) {
      // Page reservee aux comptes connectes. Les donnees elles-memes sont
      // protegees par RLS cote base : sans session, aucune requete ne
      // renvoie quoi que ce soit, cette redirection n'est que le confort.
      // Constat du 18/09/2026 sur les parcours reels : un visiteur clique
      // « Débloquer » sur un match, arrive ici, est envoye a la connexion avec
      // next=compte.html - lui-meme - et, une fois inscrit, se retrouve sur
      // « Mon compte » sans son match. Les trois inscrits du jour ont tous du
      // repartir de l'accueil pour le retrouver. La page match (hors
      // perimetre ici) ne transmet pas de ?next : on prend le sien s'il
      // existe, sinon le referent quand c'est une page du site qui vaut le
      // retour (match, abonnement, outils), sinon cette page.
      location.replace(lien('connexion.html?next=' + encodeURIComponent(retourApresConnexion())));
      return;
    }
    var resultats = await Promise.all([
      sb.from('user_preferences').select('*').eq('user_id', ctx.user.id).maybeSingle(),
      sb.from('subscriptions').select('status,billing_interval,current_period_end,cancel_at_period_end,created_at')
        .eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('betting_decisions').select('id', { count: 'exact', head: true }).eq('user_id', ctx.user.id),
      sb.from('email_preferences').select('marketing_opt_in').eq('user_id', ctx.user.id).maybeSingle()
    ]);
    prefs = resultats[0].data || {};
    emailPrefs = resultats[3].error
      ? { etat: 'indisponible', optIn: false }
      : { etat: 'ok', optIn: !!(resultats[3].data && resultats[3].data.marketing_opt_in === true) };
    // Favoris : liste locale (visiteur) fusionnee avec celle du compte.
    if (window.IasharkFavLeagues) {
      favStore = window.IasharkFavLeagues.createStore();
      try { await favStore.connectRemote(window.IasharkFavLeagues.supabaseAdapter(sb)); } catch (_e) {}
    }
    // Colonne billing_interval absente (migration 0026 pas encore appliquee) :
    // relecture sans elle, pour ne jamais afficher un abonne comme sans abonnement.
    if (resultats[1].error) {
      resultats[1] = await sb.from('subscriptions').select('status,current_period_end,cancel_at_period_end,created_at')
        .eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    }
    abo = resultats[1].data || null;
    nbDecisions = resultats[2].count || 0;

    var ancre = String(location.hash || '').replace('#', '');
    if (SECTIONS.some(function (s) { return s.id === ancre; })) sectionActive = ancre;

    chargement.hidden = true;
    racine.hidden = false;
    afficher();

    if (new URLSearchParams(location.search).get('bienvenue') === '1') {
      alerteSection(tr('compte_page.msg_welcome_account_created', 'Bienvenue. Votre compte est créé.'));
    }

    window.addEventListener('hashchange', function () {
      var cible = String(location.hash || '').replace('#', '');
      if (cible && cible !== sectionActive && SECTIONS.some(function (s) { return s.id === cible; })) {
        sectionActive = cible;
        afficher();
      }
    });
  }

  demarrer();
})();
