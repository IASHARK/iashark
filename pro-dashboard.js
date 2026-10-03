/* IASHARK — tableau de bord personnel (onglet « Tableau de bord » de
   l'espace Pro, /pro.html#tableau).

   CONTRAT DES TABLES (30/09/2026) : branche canal-pro,
   supabase/migrations/0040_canal_pro.sql (fait foi), resume dans
   CONTRAT-TABLES-PRO.md. Ce que lit cette page, en NOMMANT les colonnes
   (jamais « select * » sur une table Pro) :
   - public.pro_preferences : SA ligne (lib/pro-preferences.js#COLONNES) ;
   - public.pro_programmes  : M.COLONNES_PROGRAMME, lignes publiees du Canal
     Pro ouvert (RLS) ;
   - public.pro_paris       : M.COLONNES_PARIS, paris publies ET envoyes ;
   - public.pro_tickets     : M.COLONNES_TICKETS, SES tickets notes dans
     Telegram (garde-fou, et un pari note ici ET dans Telegram ne compte
     qu'une fois : lib/pro-dashboard-model.js#fusionnerNotes) ;
   - public.betting_decisions : son journal (ses lignes seulement).
   Plus de preferences_pro, contenus_pro ni alertes_pro (abandonnees). Les
   alertes n'existent que dans Telegram ; Loto Foot et duel sont lus par le
   robot seulement : rien de tout cela n'est affiche ici.

   DEUX VERSIONS, meme page :
   - GRATUIT : son garde-fou, son journal, l'analyse du match offert ;
     « Aujourd'hui » en apercu d'un exemple FICTIF ; une carte « Avec Pro ».
     Aucune donnee Pro n'est demandee pour un compte gratuit (la base le
     refuse de toute facon, RLS de 0040).
   - PRO : Aujourd'hui (programme publie, voyant composition, meilleure cote
     chez SES bookmakers, cote minimum), Mes paris, Le comparateur, Mon
     garde-fou, Ma strategie, « Bientot » (qualite des cotes, alertes).

   CONTROLE DES CHIFFRES PUBLICS (30/09/2026) : aucun taux, aucun argent.
   Plus de case « Mise », plus de « Mon bilan » (cagnotte, gains, reussite,
   rendement, courbe, par strategie, par semaine), plus de « Ma semaine en
   image » (gains, meilleure cote gagnee), plus de « Perte du jour » ni
   d'annonce d'un bilan IASHARK sur le site (decision : aucun bilan public). Le
   journal garde le match, le pari, la cote et le resultat (gagne, perdu).

   Pays pas encore ouvert (tout sauf la France) : AUCUN bookmaker ni aucune
   cote, jamais un operateur d'un autre pays (lib/pro-preferences.js), et
   aucun « bientot » (programme, alertes, robot Telegram) qui n'y sera pas
   tenu. Compte sans reglages : le pays de la page (P.paysDuMarche), jamais
   'fr' par defaut hors des pages francaises (/en/, /es/ : aucun bookmaker).

   Tous les calculs : lib/pro-dashboard-model.js (teste). Aucun chiffre
   public d'IASHARK ici : seulement les paris de l'abonne. */
(function () {
  'use strict';
  var M = window.IasharkProDashboardModel;
  var P = window.IasharkProPreferences;
  var sb = null, ctx = null, panneau = null;
  var d = { prefs: null, prefsRemplies: false, decisions: [], tickets: [], refsParis: [], programme: null, abo: null, aboInconnu: false, offert: null, tousLesParis: false };

  /* ---------- utilitaires ---------- */
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
  function loc() { return (window.I18N && window.I18N.localeTag) ? window.I18N.localeTag() : 'fr-FR'; }
  function cote(v) { return v == null ? '—' : new Intl.NumberFormat(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v); }
  function pct(v, signe) { if (v == null) return '—'; var s = new Intl.NumberFormat(loc(), { maximumFractionDigits: 1 }).format(Math.abs(v)); return (signe ? (v > 0 ? '+' : v < 0 ? '−' : '') : '') + s + ' %'; }
  function heure(iso) { try { return new Intl.DateTimeFormat(loc(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; } }
  function dateLongue(iso) { try { return new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'long' }).format(new Date(iso)); } catch (e) { return iso; } }
  // Vert / rouge : SEULEMENT pour un chiffre en hausse ou en baisse.
  function ton(v) { return v > 0 ? 'text-emerald-300' : v < 0 ? 'text-red-300' : 'text-ink'; }
  function estPro() { return !!(ctx && ctx.isPro); }
  function prefs() { return d.prefs || P.normaliser({}); }
  // Pays de l'abonne ouvert ? (aujourd'hui : la France seulement)
  function paysOuvert() { return P.paysOuvert(prefs().pays); }
  // Cles des bookmakers suivis de SON pays (vide hors de France).
  function agreesDuPays() { return P.bookmakersDuPays(prefs().pays).map(function (b) { return b.id; }); }
  // Nom d'un bookmaker, cherche SEULEMENT dans la liste de son pays : hors de
  // France, rien (jamais le nom d'un operateur francais).
  function nomBk(id) { return (id && P.nomBookmaker(id, prefs().pays)) || ''; }
  // Bookmakers proposes dans « Noter un pari » : les siens, sinon tous les
  // suivis de son pays ; aucun hors de France.
  function bookmakersProposes() { var p = prefs(); return p.bookmakers.length ? p.bookmakers : agreesDuPays(); }
  // Bouton vers l'offre : jamais une promesse d'essai (l'essai est coupe
  // par defaut, TRIAL_DAYS absent = 0). La grille de prix (variante
  // « ligne ») annonce l'essai seulement si le serveur le confirme ET si le
  // compte n'a jamais ete abonne.
  function essaiPossibleCompte() { return !d.abo && !d.aboInconnu; }
  function texteBoutonPro() { return tr('pro_space.locked_cta'); }

  /* ---------- briques visuelles ---------- */
  // Titres de bloc : phrase simple, jamais de capitales a chasse fixe.
  function titre(t, sous, action) {
    return '<div class="flex items-start justify-between gap-3"><div class="min-w-0"><h2 class="text-[16px] font-bold leading-snug text-ink">' + esc(t) + '</h2>'
      + (sous ? '<p class="mt-0.5 text-[13px] leading-relaxed text-soft">' + esc(sous) + '</p>' : '') + '</div>' + (action || '') + '</div>';
  }
  function lienAction(href, texte) {
    return '<a href="' + esc(href) + '" class="shrink-0 text-[13px] font-semibold text-cyan hover:underline">' + esc(texte) + '</a>';
  }
  // Trois surfaces differentes pour eviter des cartes toutes identiques.
  var SURFACE = {
    forte: 'rounded-3xl border border-cyan/20 bg-gradient-to-b from-[#0c1e2d] to-surface p-4 sm:p-6',
    carte: 'rounded-2xl border border-hairline bg-surface p-4 sm:p-5',
    nue: 'border-t border-hairline pt-5'
  };
  function bloc(id, ordre, surface, contenu) {
    return '<section id="' + id + '" class="ps-enter ' + ordre + ' lg:order-none ' + SURFACE[surface] + '">' + contenu + '</section>';
  }
  function verrou(id, ordre, t, texte, apercu) {
    return '<section id="' + id + '" class="ps-enter ' + ordre + ' lg:order-none ' + SURFACE.carte + ' ps-locked min-h-[220px]" aria-label="' + esc(t) + '">'
      + '<div class="ps-locked-preview" aria-hidden="true">' + apercu + '</div>'
      + '<div class="ps-locked-veil p-4 sm:p-5">'
      + '<p class="flex items-center gap-2 text-[15px] font-bold text-ink"><svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-cyan stroke-2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' + esc(t) + ' <span class="rounded-full border border-cyan/40 px-2 py-0.5 text-[11px] font-bold text-cyan">' + esc(tr('pro_space.locked_badge')) + '</span></p>'
      + '<p class="mt-1.5 text-[13.5px] leading-relaxed text-soft">' + esc(texte) + '</p>'
      + '<a href="' + esc(lien('abonnement.html')) + '" class="mt-3 inline-flex h-10 w-fit items-center rounded-xl bg-cyan px-4 text-[13.5px] font-bold text-[#04141b] transition hover:bg-cyan/90">' + esc(texteBoutonPro()) + '</a>'
      + '</div></section>';
  }
  function etiquetteFamille(f) {
    return '<span class="rounded-full bg-white/[.06] px-2.5 py-1 text-[12px] font-semibold text-ink">' + esc(tr('pro_space.family_' + (f || 'perso'))) + '</span>';
  }
  function voyant(c) {
    var t = { confirme: ['bg-cyan', 'lineup_confirme'], a_surveiller: ['bg-amber-300', 'lineup_a_surveiller'], publiee: ['bg-cyan', 'lineup_publiee'], retire: ['bg-soft', 'lineup_retire'] }[c] || ['border border-soft/60', 'lineup_pending'];
    return '<span class="inline-flex items-center gap-1.5 text-[12.5px] text-soft"><span class="ps-dot ' + t[0] + '" aria-hidden="true"></span>' + esc(tr('pro_space.' + t[1])) + '</span>';
  }
  function vide(texte) { return '<p class="mt-4 rounded-xl bg-white/[.03] px-4 py-3.5 text-[13.5px] leading-relaxed text-soft">' + esc(texte) + '</p>'; }

  /* ---------- 1. Aujourd'hui (programme publie du Canal Pro) ---------- */
  // Temps restant avant le coup d'envoi, en mots simples (« dans 2 h 10 »).
  function dans(iso) {
    var ms = new Date(iso).getTime() - Date.now();
    if (!(ms > 0)) return '';
    var min = Math.round(ms / 60000), h = Math.floor(min / 60), m = min % 60;
    return tr('pro_space.in_time', { time: h ? h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : '') : m + ' min' });
  }
  // Barre « ma cote face a la cote minimum » : ou se situe la cote de
  // l'abonne entre la cote minimum et la meilleure cote des agrees.
  function barreMarge(r) {
    if (!r.chezMoi || r.coteMin == null) return '';
    var haut = Math.max(r.chezMoi.cote, r.marche ? r.marche.cote : 0, r.coteMin) * 1.02;
    var bas = r.coteMin * 0.94;
    function x(v) { return Math.max(0, Math.min(100, 100 * (v - bas) / (haut - bas))); }
    var marge = 100 * (r.chezMoi.cote / r.coteMin - 1);
    return '<div class="mt-4">'
      + '<div class="relative h-2 rounded-full bg-white/[.07]">'
      + '<div class="absolute inset-y-0 left-0 rounded-full ' + (r.jouable ? 'bg-gradient-to-r from-cyan/30 to-cyan' : 'bg-soft/40') + '" style="width:' + x(r.chezMoi.cote).toFixed(1) + '%"></div>'
      + '<div class="absolute -top-1 h-4 w-[2px] rounded bg-ink/80" style="left:' + x(r.coteMin).toFixed(1) + '%" aria-hidden="true"></div>'
      + '</div>'
      + '<div class="mt-1.5 flex justify-between text-[11.5px] text-soft"><span>' + esc(tr('pro_space.min_odds')) + ' ' + cote(r.coteMin) + '</span>'
      + '<span class="ps-num ' + ton(marge) + '">' + pct(marge, true) + '</span></div></div>';
  }
  function commence(pari) { return !!(pari.coup_envoi && new Date(pari.coup_envoi).getTime() <= Date.now()); }
  function lignePari(pari, horsChoix) {
    var r = M.pariPourMoi(pari, prefs().bookmakers, agreesDuPays(), prefs());
    var principal = r.chezMoi || r.marche;
    var parti = commence(pari);
    var etat = r.retire ? '' : (r.chezMoi ? (r.jouable
      ? '<span class="inline-flex items-center gap-1.5 rounded-full bg-cyan/[.12] px-2.5 py-1 text-[12px] font-semibold text-cyan"><svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-none stroke-current stroke-[2.4]" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>' + esc(tr('pro_space.playable')) + '</span>'
      : '<span class="rounded-full bg-white/[.06] px-2.5 py-1 text-[12px] font-semibold text-soft">' + esc(tr('pro_space.not_playable')) + '</span>') : '');
    var restant = pari.coup_envoi && !parti ? dans(pari.coup_envoi) : '';
    // Deja note (ticket Telegram ou ligne du journal de ce pari) : plus de
    // « Je l'ai joue », pour ne pas noter le meme pari une 2e fois a la cote
    // du matin (contre-controle, ronde 4.2 ; M.dejaNote).
    var bouton = r.retire ? '' : M.dejaNote(pari, d.decisions, d.tickets)
      ? '<span class="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-soft" data-deja-note="' + esc(pari.id) + '"><svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-none stroke-current stroke-[2.4]" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>' + esc(tr('pro_space.played_already')) + '</span>'
      : parti
      ? '<span class="ml-auto text-[12.5px] text-soft">' + esc(tr('pro_space.started')) + '</span>'
      : '<button type="button" data-jouer="' + esc(pari.id) + '" class="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-cyan px-4 text-[13.5px] font-bold text-[#04141b] transition hover:bg-cyan/90"><svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-current stroke-[2.2]" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' + esc(tr('pro_space.played_btn')) + '</button>';
    return '<li class="group relative overflow-hidden rounded-2xl border border-hairline bg-page/50 p-4 transition hover:border-cyan/30 sm:p-5' + (r.retire ? ' opacity-60' : '') + '">'
      + (r.jouable && !parti ? '<span class="absolute inset-y-0 left-0 w-[3px] bg-cyan" aria-hidden="true"></span>' : '')
      + '<div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">' + etiquetteFamille(pari.famille)
      + '<span class="text-[12px] text-soft">' + esc(tr('pro_space.in_test')) + '</span>'
      + (horsChoix ? '<span class="text-[12px] text-soft">· ' + esc(tr('pro_space.outside_choices')) + '</span>' : '')
      + '<span class="ml-auto">' + voyant(pari.composition) + '</span></div>'
      + '<div class="mt-3 flex items-start justify-between gap-4">'
      + '<div class="min-w-0"><p class="text-[12.5px] text-soft">' + esc(pari.competition || '') + (pari.coup_envoi ? ' · ' + esc(heure(pari.coup_envoi)) : '') + (restant ? ' · <span class="text-ink/80">' + esc(restant) + '</span>' : '') + '</p>'
      + '<p class="mt-0.5 text-[17px] font-bold leading-snug text-ink">' + esc(pari.match) + '</p>'
      + '<p class="mt-0.5 text-[14.5px] text-cyan">' + esc(pari.pari) + '</p></div>'
      + (principal ? '<div class="shrink-0 text-right"><p class="text-[11.5px] text-soft">' + esc(r.chezMoi ? tr('pro_space.best_mine') : tr('pro_space.best_market')) + '</p>'
        + '<p class="ps-num text-[30px] font-extrabold leading-none tracking-tight text-ink">' + cote(principal.cote) + '</p>'
        + '<p class="mt-1 text-[11.5px] text-soft">' + esc(nomBk(principal.id)) + (principal.releve_le ? ' · ' + esc(tr('pro_space.seen_at', { time: heure(principal.releve_le) })) : '') + '</p>'
        + (pari.cote_calculee ? '<p class="mt-0.5 max-w-[160px] text-[11px] leading-snug text-soft">' + esc(tr('pro_space.odds_computed')) + '</p>' : '') + '</div>'
        : '<p class="max-w-[140px] text-right text-[12.5px] text-soft">' + esc(tr('pro_space.no_odds_mine')) + '</p>')
      + '</div>'
      + barreMarge(r)
      + '<div class="mt-4 flex flex-wrap items-center gap-2">' + etat
      + (r.ailleursMieux ? '<span class="text-[12px] text-soft">' + esc(tr('pro_space.elsewhere_better', { bookmaker: nomBk(r.marche.id), odds: cote(r.marche.cote) })) + '</span>' : '')
      + bouton
      + '</div>'
      + (pari.raison ? '<p class="mt-4 border-t border-hairline pt-3 text-[13px] leading-relaxed text-soft">' + esc(pari.raison) + '</p>' : '')
      + (pari.ref ? '<p class="mt-2 text-[11.5px] text-soft/80">' + esc(tr('pro_space.ref', { ref: pari.ref })) + '</p>' : '')
      + '</li>';
  }
  function blocAujourdhui() {
    var prog = d.programme || { etat: 'aucun', paris: [] };
    var paris = prog.paris || [];
    var compte = paysOuvert() && paris.length ? '<span class="shrink-0 rounded-full border border-cyan/30 px-3 py-1 text-[12.5px] font-semibold text-cyan">' + esc(tr('pro_space.bets_count', { n: paris.length })) + '</span>' : '';
    var contenu = titre(tr('pro_space.today_title'), tr('pro_space.today_sub'), compte);
    // Pays pas encore ouvert : ni pari, ni cote, ni bookmaker (comme le robot).
    if (!paysOuvert()) contenu += vide(tr('pro_space.country_closed'));
    else if (prog.etat === 'aucun') contenu += vide(tr('pro_space.today_empty'));
    // Jour publie sans pari : le texte du motif, rien d'autre (MOTIFS_VIDE du robot).
    else if (prog.etat === 'vide') contenu += vide(tr('pro_space.motif_' + prog.motif));
    else {
      var s = M.selonMesChoix(paris, prefs());
      var g = M.gardeFou(prefs(), d.decisions, new Date(), null, d.tickets, d.refsParis);
      if (g.atteint) contenu += '<p class="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/[.06] px-4 py-3 text-[13.5px] text-amber-100">' + esc(tr('pro_space.guard_stop_today')) + '</p>';
      contenu += '<ul class="mt-4 space-y-3">' + s.pourMoi.map(function (p) { return lignePari(p, false); }).join('') + '</ul>';
      if (s.horsChoix.length) {
        contenu += '<p class="mt-5 text-[13px] font-semibold text-ink">' + esc(tr('pro_space.outside_choices')) + '</p><p class="text-[12.5px] text-soft">' + esc(tr('pro_space.outside_choices_text')) + '</p>'
          + '<ul class="mt-3 space-y-3">' + s.horsChoix.map(function (p) { return lignePari(p, true); }).join('') + '</ul>';
      }
    }
    return bloc('bAujourdhui', 'order-1', 'forte', contenu);
  }
  function apercuAujourdhui() {
    return titre(tr('pro_space.today_title'), tr('pro_space.locked_example'))
      + '<div class="mt-4 rounded-2xl border border-hairline p-4"><div class="flex justify-between gap-3"><div><p class="text-[12px] text-soft">[Compétition] · 21:00</p><p class="mt-1 text-[16px] font-bold">[Équipe A] – [Équipe B]</p><p class="text-[14px] text-cyan">[Pari]</p></div>'
      + '<div class="text-right"><p class="text-[11.5px] text-soft">' + esc(tr('pro_space.best_mine')) + '</p><p class="text-[30px] font-extrabold">3,45</p></div></div>'
      + '<div class="mt-4 h-2 rounded-full bg-white/[.07]"><div class="h-2 w-3/4 rounded-full bg-cyan"></div></div></div>';
  }

  /* ---------- 2. Garde-fou ----------
     Jauge semi-circulaire animee, adaptee du composant 21st.dev « Animated
     Radial Chart » (isaiahbjork) : arc de fond gris, arc de progression en
     degrade cyan (ambre quand la limite est atteinte), chiffre au centre.
     Le compte (lib/pro-dashboard-model.js#gardeFou) : son journal du jour +
     ses tickets notes dans Telegram pas encore dans le journal. Le robot
     Telegram, lui, ne compte que les tickets notes dans Telegram : on le dit,
     sans pretendre que la limite atteinte ici l'arrete. */
  function jauge(valeur, max, atteint) {
    var W = 220, H = 128, R = 88, cx = W / 2, cy = 112, ep = 14;
    var longueur = Math.PI * R;
    var part = Math.max(0, Math.min(1, max ? valeur / max : 0));
    var arc = 'M ' + (cx - R) + ' ' + cy + ' A ' + R + ' ' + R + ' 0 0 1 ' + (cx + R) + ' ' + cy;
    var coul = atteint ? ['#fcd34d', '#f59e0b'] : ['#0ea5b7', '#20d5ef'];
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="mx-auto block h-[128px] w-[220px] overflow-visible" aria-hidden="true">'
      + '<defs><linearGradient id="gfGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + coul[0] + '"/><stop offset="1" stop-color="' + coul[1] + '"/></linearGradient></defs>'
      + '<path d="' + arc + '" fill="none" stroke="rgba(145,160,179,.16)" stroke-width="' + ep + '" stroke-linecap="round"/>'
      + '<path d="M ' + (cx - R + ep + 6) + ' ' + cy + ' A ' + (R - ep - 6) + ' ' + (R - ep - 6) + ' 0 0 1 ' + (cx + R - ep - 6) + ' ' + cy + '" fill="none" stroke="rgba(145,160,179,.18)" stroke-width="1" stroke-dasharray="2 4"/>'
      + '<path class="ps-gauge" d="' + arc + '" fill="none" stroke="url(#gfGrad)" stroke-width="' + ep + '" stroke-linecap="round" stroke-dasharray="' + longueur.toFixed(1) + '" stroke-dashoffset="' + longueur.toFixed(1) + '" data-cible="' + (longueur * (1 - part)).toFixed(1) + '"/>'
      + '</svg>';
  }
  function blocGardeFou() {
    var p = prefs(), g = M.gardeFou(p, d.decisions, new Date(), null, d.tickets, d.refsParis);
    var message = g.parisMax === 0 ? tr('pro_space.guard_zero') : g.atteint ? tr('pro_space.guard_reached_bets') : (g.proche ? tr('pro_space.guard_close') : tr('pro_space.guard_ok'));
    // Changer sa limite : formulaire Pro (pro_preferences, abonne Pro seulement).
    var action = estPro() ? lienAction(lien('accueil-pro.html?modifier=1&etape=garde_fou'), tr('pro_space.guard_edit')) : '';
    var detail = estPro() ? tr('pro_space.guard_count_both', { journal: g.duJournal, telegram: g.deTelegram }) : tr('pro_space.guard_count_site');
    var contenu = titre(tr('pro_space.guard_title'), null, action)
      + '<div class="relative mt-2" role="img" aria-label="' + esc(tr('pro_space.guard_bets_label') + ' : ' + g.parisNotes + ' ' + tr('pro_space.guard_of', { max: g.parisMax })) + '">' + jauge(g.parisNotes, g.parisMax, g.atteint)
      + '<div class="pointer-events-none absolute inset-x-0 bottom-2 text-center"><p class="ps-num text-[34px] font-extrabold leading-none text-ink">' + g.parisNotes + '<span class="text-[16px] font-semibold text-soft"> / ' + g.parisMax + '</span></p></div></div>'
      + '<p class="mt-1 text-center text-[12px] text-soft">' + esc(tr('pro_space.guard_bets_label')) + '</p>'
      + '<p class="mt-3 text-center text-[13.5px] ' + (g.atteint ? 'font-semibold text-amber-100' : g.proche ? 'text-amber-100' : 'text-soft') + '">' + esc(message) + '</p>'
      + '<p class="mt-2 text-center text-[12px] leading-relaxed text-soft">' + esc(detail) + '</p>'
      + (estPro() && paysOuvert() ? '<p class="mt-1 text-center text-[12px] leading-relaxed text-soft">' + esc(tr('pro_space.guard_robot_note')) + '</p>' : '');
    // Plus de « Perte du jour » (controle du 30/09/2026 : aucun argent, plus de
    // mise notee) : le garde-fou compte les paris, rien d'autre.
    return bloc('bGardeFou', estPro() ? 'order-2' : 'order-1', 'carte', contenu);
  }
  function animerJauges() {
    var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panneau.querySelectorAll('.ps-gauge').forEach(function (el) {
      var cible = el.getAttribute('data-cible');
      if (reduit) { el.setAttribute('stroke-dashoffset', cible); return; }
      el.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)';
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.strokeDashoffset = cible; }); });
    });
  }

  /* ---------- 3. Mes paris (journal) ---------- */
  function blocParis() {
    var liste = d.tousLesParis ? d.decisions : d.decisions.slice(0, 5);
    var contenu = titre(tr('pro_space.bets_title'), tr('pro_space.bets_sub'),
      '<button type="button" id="noterPari" class="shrink-0 rounded-xl bg-cyan px-3.5 py-2 text-[13px] font-bold text-[#04141b] transition hover:bg-cyan/90">' + esc(tr('pro_space.bets_add')) + '</button>');
    if (!d.decisions.length) contenu += vide(tr('pro_space.bets_empty'));
    else {
      contenu += '<ul class="mt-4 divide-y divide-[rgba(141,179,211,.14)]">' + liste.map(function (x) {
        // Resultat seulement (gagne, perdu, rembourse, en cours) : ni mise ni gain.
        var regle = x.status === 'won' || x.status === 'lost' || x.status === 'void';
        var statut = '<span class="text-[13.5px] ' + (regle ? 'font-semibold text-ink' : 'text-soft') + '">' + esc(tr('pro_space.status_' + (x.status || 'pending'))) + '</span>';
        // Tout pari en cours se regle ici, qu'il soit note a la main ou avec
        // « Je l'ai joue » (source 'programme') : aucune tache ne regle le
        // journal a sa place (contre-controle, ronde 3 : ces paris restaient
        // « En cours » pour toujours, hors bilan et hors perte du jour).
        var reglage = x.status === 'pending'
          ? '<span class="flex gap-1.5"><button type="button" data-regler="won" data-id="' + esc(x.id) + '" class="rounded-lg border border-hairline px-2.5 py-1 text-[12px] text-ink hover:border-cyan/40">' + esc(tr('pro_space.settle_won')) + '</button><button type="button" data-regler="lost" data-id="' + esc(x.id) + '" class="rounded-lg border border-hairline px-2.5 py-1 text-[12px] text-ink hover:border-cyan/40">' + esc(tr('pro_space.settle_lost')) + '</button></span>'
          : '';
        return '<li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3">'
          + '<div class="min-w-0"><p class="truncate text-[14.5px] font-semibold text-ink">' + esc(x.match_label) + '</p>'
          + '<p class="truncate text-[12.5px] text-soft">' + esc(x.market) + ' · <span class="ps-num">' + cote(Number(x.odds)) + '</span>' + (nomBk(x.bookmaker) ? ' · ' + esc(nomBk(x.bookmaker)) : '') + ' · ' + esc(tr('pro_space.source_' + M.sourceDuPari(x, d.tickets))) + '</p></div>'
          + '<div class="text-right">' + statut + '</div>'
          + (reglage ? '<div class="col-span-2">' + reglage + '</div>' : '')
          + '</li>';
      }).join('') + '</ul>';
      if (d.decisions.length > 5) contenu += '<button type="button" id="basculerParis" class="mt-2 text-[13px] font-semibold text-cyan hover:underline">' + esc(d.tousLesParis ? tr('pro_space.show_less') : tr('pro_space.see_all')) + '</button>';
    }
    contenu += dialoguePari();
    return bloc('bParis', estPro() ? 'order-4' : 'order-3', 'carte', contenu);
  }
  function dialoguePari() {
    var mes = bookmakersProposes();
    var options = '<option value="">' + esc(tr('pro_space.bookmaker_none')) + '</option>' + mes.map(function (id) { return '<option value="' + esc(id) + '">' + esc(nomBk(id)) + '</option>'; }).join('');
    function f(id, l, o) { return '<label class="block"><span class="text-[13px] font-semibold text-ink">' + esc(l) + '</span><input id="' + id + '" ' + (o || '') + ' class="mt-1.5 h-11 w-full rounded-xl border border-hairline bg-panel px-3.5 text-[16px] text-ink outline-none focus:border-cyan/60"></label>'; }
    return '<dialog id="dlgPari" class="w-[min(460px,94vw)] rounded-2xl border border-hairline bg-surface p-0 text-ink backdrop:bg-black/60">'
      + '<form method="dialog" class="space-y-3.5 p-5 sm:p-6"><h3 class="text-[17px] font-bold">' + esc(tr('pro_space.form_title')) + '</h3>'
      + '<input type="hidden" id="fpRef"><input type="hidden" id="fpFamille"><input type="hidden" id="fpKickoff">'
      + f('fpMatch', tr('pro_space.label_match'), 'type="text" maxlength="160" placeholder="' + esc(tr('pro_space.placeholder_match')) + '"')
      + f('fpPari', tr('pro_space.label_market'), 'type="text" maxlength="120" placeholder="' + esc(tr('pro_space.placeholder_market')) + '"')
      + f('fpCote', tr('pro_space.label_odds'), 'type="text" inputmode="decimal"')
      + '<label class="block"><span class="text-[13px] font-semibold text-ink">' + esc(tr('pro_space.label_bookmaker')) + '</span><select id="fpBk" class="mt-1.5 h-11 w-full rounded-xl border border-hairline bg-panel px-3.5 text-[16px] text-ink outline-none focus:border-cyan/60">' + options + '</select></label>'
      + '<p id="fpMsg" class="text-[13px] text-red-300" hidden></p>'
      + '<div class="flex gap-3 pt-1"><button value="cancel" class="h-11 flex-1 rounded-xl border border-hairline text-[14px] font-semibold">' + esc(tr('pro_space.form_cancel')) + '</button>'
      + '<button type="button" id="fpSave" class="h-11 flex-1 rounded-xl bg-cyan text-[14px] font-bold text-[#04141b]">' + esc(tr('pro_space.form_save')) + '</button></div></form></dialog>';
  }

  /* ---------- 4. Le comparateur (France seulement : hors de France, le bloc
     n'est pas affiche du tout, comme la carte gratuite) ----------
     Barres horizontales : une par bookmaker agree SUIVI de son pays, la
     meilleure en premier et en cyan, un trait pour la cote minimum ; « chez
     toi » sur les siens. Cotes = celles du pari publie (pro_paris.cotes,
     relevees a cote_vue_at) : on affiche, on ne recalcule rien. */
  function blocComparateur() {
    var p = prefs(), agrees = agreesDuPays();
    var contenu = titre(tr('pro_space.comparator_title'), tr('pro_space.comparator_sub'));
    if (!agrees.length) return bloc('bComparateur', 'order-7', 'carte', contenu + vide(tr('pro_space.comparator_country_soon')));
    var paris = (d.programme && d.programme.paris) || [];
    var blocs = paris.map(function (pari) {
      var min = Number(pari.cote_min);
      var lignes = Object.keys(pari.cotes || {}).filter(function (id) { return agrees.indexOf(id) !== -1; })
        .map(function (id) { return { id: id, cote: Number(pari.cotes[id].cote) }; })
        .filter(function (x) { return x.cote > 1; })
        .sort(function (a, b) { return b.cote - a.cote; });
      if (!lignes.length) return '';
      var haut = Math.max(lignes[0].cote, min || 0), bas = Math.min(lignes[lignes.length - 1].cote, min || 99) * 0.92;
      function w(v) { return Math.max(4, Math.min(100, 100 * (v - bas) / (haut - bas))); }
      return '<div><p class="text-[14px] font-semibold text-ink">' + esc(pari.match) + ' <span class="font-normal text-soft">· ' + esc(pari.pari) + '</span></p>'
        + (pari.cote_calculee ? '<p class="text-[11.5px] text-soft">' + esc(tr('pro_space.odds_computed')) + '</p>' : '')
        + '<ul class="mt-2.5 space-y-1.5">' + lignes.map(function (x, i) {
          var mien = p.bookmakers.indexOf(x.id) !== -1, ok = !min || x.cote >= min;
          return '<li class="grid grid-cols-[minmax(0,7.5rem)_1fr_3.2rem] items-center gap-2.5 text-[12.5px]">'
            + '<span class="truncate ' + (mien ? 'font-semibold text-ink' : 'text-soft') + '">' + esc(nomBk(x.id)) + (mien ? ' <span class="text-cyan">· ' + esc(tr('pro_space.comparator_mine')) + '</span>' : '') + '</span>'
            + '<span class="relative h-[18px] rounded-md bg-white/[.04]">'
            + '<span class="absolute inset-y-0 left-0 rounded-md ' + (i === 0 ? 'bg-gradient-to-r from-cyan/40 to-cyan' : ok ? 'bg-cyan/25' : 'bg-soft/20') + '" style="width:' + w(x.cote).toFixed(1) + '%"></span>'
            + (min ? '<span class="absolute -inset-y-0.5 w-[2px] rounded bg-ink/70" style="left:' + w(min).toFixed(1) + '%" title="' + esc(tr('pro_space.min_odds')) + '"></span>' : '')
            + '</span>'
            + '<span class="ps-num text-right text-[14px] font-bold ' + (i === 0 ? 'text-cyan' : ok ? 'text-ink' : 'text-soft') + '">' + cote(x.cote) + '</span></li>';
        }).join('') + '</ul>'
        + (min ? '<p class="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-soft"><span class="inline-block h-3 w-[2px] rounded bg-ink/70" aria-hidden="true"></span>' + esc(tr('pro_space.min_odds')) + ' ' + cote(min) + '</p>' : '')
        + '</div>';
    }).filter(Boolean);
    contenu += blocs.length ? '<div class="mt-4 space-y-6">' + blocs.join('') + '</div>' : vide(tr('pro_space.comparator_empty'));
    return bloc('bComparateur', 'order-7', 'carte', contenu);
  }

  /* ---------- 5. Ma strategie (reglages de pro_preferences) ---------- */
  function puce(t) { return '<li class="rounded-full bg-white/[.06] px-2.5 py-1 text-[12.5px]">' + esc(t) + '</li>'; }
  function blocStrategie() {
    // 03/10/2026 (decision de Clement) : plus de choix de strategie ni de types de paris (les memes paris
    // pour tous) : ce bloc montre seulement les reglages de l'abonne (bookmakers, alertes, Telegram).
    var p = prefs();
    var contenu = titre(tr('pro_onboarding.edit_title'), null, lienAction(lien('accueil-pro.html?modifier=1'), tr('pro_space.strategy_edit')));
    if (!d.prefsRemplies) contenu += '<p class="mt-3 text-[13.5px] text-soft">' + esc(tr('pro_onboarding.account_not_set')) + '</p>';
    // Bookmakers : seulement ceux de son pays ; hors de France, aucun nom.
    var bks = paysOuvert() ? (p.bookmakers.length ? p.bookmakers.map(nomBk).filter(Boolean).join(', ') : tr('pro_space.strategy_all_bookmakers')) : tr('pro_space.country_closed');
    var alertes = p.alertes.map(function (a) { return tr('pro_space.alert_' + a); });
    contenu += '<p class="mt-4 text-[12.5px] text-soft">' + esc(tr('pro_space.strategy_bookmakers')) + ' : <span class="text-ink">' + esc(bks) + '</span></p>';
    // Alertes et programme dans Telegram (« bientot ») : seulement la ou ils arriveront.
    if (paysOuvert()) contenu += '<p class="mt-1 text-[12.5px] text-soft">' + esc(tr('pro_space.strategy_alerts')) + ' : <span class="text-ink">' + esc(alertes.length ? alertes.join(', ') : tr('pro_space.strategy_alerts_none')) + '</span></p>'
      + '<p class="mt-1 text-[12.5px] text-soft">' + esc(tr('pro_space.strategy_telegram')) + ' : <span class="text-ink">' + esc(p.programme_prive ? tr('pro_space.telegram_on') : tr('pro_space.telegram_off')) + '</span></p>';
    return bloc('bStrategie', 'order-8', 'nue', contenu);
  }


  /* ---------- 7. Bientot (annonce, jamais un chiffre sans donnee) ----------
     La qualite des cotes n'a pas encore de source (cote de fin pas relevee
     pour le journal) ; les alertes n'existent que dans Telegram. */
  function blocBientot() {
    var items = [[tr('pro_space.quality_title'), tr('pro_space.quality_soon')], [tr('pro_space.alerts_title'), tr('pro_space.locked_alerts')]];
    var contenu = '<h2 class="flex items-center gap-2 text-[16px] font-bold text-ink"><svg viewBox="0 0 24 24" class="h-4 w-4 fill-none stroke-current stroke-[1.9] text-soft" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.8V12l2.9 1.9"/></svg>' + esc(tr('pro_space.soon')) + '</h2>'
      + '<ul class="mt-3 space-y-3">' + items.map(function (it) {
        return '<li><p class="text-[14px] font-semibold text-ink">' + esc(it[0]) + '</p><p class="mt-0.5 text-[12.5px] leading-relaxed text-soft">' + esc(it[1]) + '</p></li>';
      }).join('') + '</ul>';
    return bloc('bBientot', 'order-10', 'nue', contenu);
  }

  /* ---------- Gratuit : ce que Pro ajoute, en une seule carte ----------
     Tout ce qui n'existe pas encore dit « Bientot » (textes locked_*). Le
     comparateur, les alertes Telegram et « Ma strategie » (reglages pour le
     programme du Canal Pro) ne sont cites que pour la France : aucun
     programme vendu la ou il n'est pas propose (gb, mx, za, /en/, /es/ ;
     contre-controle, ronde 4.2). */
  function blocProEnPlus() {
    // Toutes les analyses (ligne de la grille de prix, memes textes) : dans
    // tous les pays, depuis le retrait de « Ma semaine en image » (30/09/2026).
    var items = [['M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5', tr('pricing_grid.f_all_matches'), tr('pricing_grid.f_pick')]];
    if (paysOuvert()) items.push(['M4 12h3l3-8 4 16 3-8h3', tr('pro_space.comparator_title'), tr('pro_space.locked_comparator')]);
    if (paysOuvert()) items.push(['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0', tr('pro_space.alerts_title'), tr('pro_space.locked_alerts')]);
    if (paysOuvert()) items.push(['M12 3v18M3 12h18', tr('pro_space.strategy_title'), tr('pro_space.locked_strategy')]);
    var contenu = '<p class="text-[12.5px] font-semibold text-cyan">' + esc(tr('pro_space.locked_badge')) + '</p>'
      + '<h2 class="mt-0.5 text-[16px] font-bold text-ink">' + esc(tr('pro_space.locked_more_title')) + '</h2>'
      + '<ul class="mt-3 space-y-3">' + items.map(function (it) {
        return '<li class="flex gap-3"><svg viewBox="0 0 24 24" class="mt-0.5 h-[18px] w-[18px] shrink-0 fill-none stroke-cyan stroke-[1.7]" aria-hidden="true"><path d="' + it[0] + '"/></svg>'
          + '<span><span class="block text-[14px] font-semibold text-ink">' + esc(it[1]) + '</span><span class="block text-[12.5px] leading-relaxed text-soft">' + esc(it[2]) + '</span></span></li>';
      }).join('') + '</ul>'
      // Prix du marche + bouton : grille de prix, variante « ligne »
      // (assets/pricing-grid.js, montee par rendre()). Essai annonce seulement
      // si le serveur le confirme ET si le compte n'a jamais ete abonne ; sinon
      // « Devenir Pro ». Repli sans le script : « Voir l'offre Pro ».
      + '<div class="mt-5 border-t border-cyan/15 pt-5" data-pricing-grid="ligne" data-pg-track="pro_space_offer"' + (essaiPossibleCompte() ? '' : ' data-pg-trial="false" data-pg-cta="' + esc(tr('pricing_page.cta_subscribe')) + '"') + '>'
      + '<a href="' + esc(lien('abonnement.html')) + '" class="inline-flex h-11 w-full items-center justify-center rounded-xl bg-cyan px-4 text-[14px] font-bold text-[#04141b] transition hover:bg-cyan/90">' + esc(texteBoutonPro()) + '</a>'
      + '</div>';
    return bloc('bProEnPlus', 'order-7', 'forte', contenu);
  }

  /* ---------- Gratuit : l'analyse du match offert ---------- */
  function blocOffert() {
    var m = d.offert;
    var contenu = titre(tr('pro_space.free_match_title'), tr('pro_space.free_match_text'));
    if (m) contenu += '<p class="mt-4 text-[12.5px] text-soft">' + esc(m.league || '') + ' · ' + esc(String(m.date || '').slice(11, 16)) + '</p><p class="mt-0.5 text-[17px] font-bold text-ink">' + esc((m.home && m.home.n) || '') + ' – ' + esc((m.away && m.away.n) || '') + '</p>';
    contenu += '<a href="' + esc(m ? lien('match.html?id=' + encodeURIComponent(m.id)) : lien('')) + '" class="mt-4 inline-flex h-11 items-center rounded-xl bg-cyan px-5 text-[14px] font-bold text-[#04141b] transition hover:bg-cyan/90">' + esc(tr('pro_space.free_match_cta')) + '</a>';
    return bloc('bOffert', 'order-2', 'forte', contenu);
  }

  /* ---------- Bandeaux du haut ---------- */
  function enTete() {
    var h = '<div class="mb-5"><h1 class="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">' + esc(estPro() ? tr('pro_space.greeting_pro') : tr('pro_space.greeting_free')) + '</h1>'
      + '<p class="mt-1 text-[14.5px] text-soft">' + esc(estPro() ? (paysOuvert() ? tr('pro_space.sub_pro') : tr('pro_space.sub_pro_closed')) : tr('pro_space.sub_free')) + '</p></div>';
    if (d.abo && d.abo.status === 'trialing' && d.abo.current_period_end && !d.abo.cancel_at_period_end) {
      h += '<div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-white/[.03] px-4 py-3"><p class="text-[13.5px] text-ink">' + esc(tr('pro_space.trial_banner', { date: dateLongue(d.abo.current_period_end) })) + '</p>'
        + '<a href="' + esc(lien('compte.html#abonnement')) + '" class="text-[13px] font-semibold text-cyan hover:underline">' + esc(tr('pro_space.trial_cancel_link')) + '</a></div>';
    }
    // Reglages pas encore faits : seulement pour un abonne Pro (un compte
    // gratuit ne peut pas ecrire pro_preferences).
    if (estPro() && !d.prefsRemplies) {
      h += '<div class="mb-4 flex flex-col gap-3 rounded-2xl border border-cyan/30 bg-cyan/[.06] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p class="text-[15px] font-bold text-ink">' + esc(tr('pro_space.setup_title')) + '</p><p class="mt-0.5 text-[13.5px] text-soft">' + esc(tr('pro_space.setup_text')) + '</p></div>'
        + '<a href="' + esc(lien('accueil-pro.html')) + '" class="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-cyan px-5 text-[14px] font-bold text-[#04141b]">' + esc(tr('pro_space.setup_cta')) + '</a></div>';
    }
    return h;
  }

  /* ---------- Assemblage ---------- */
  function rendre() {
    var gauche, droite;
    if (estPro()) {
      // Hors de France : ni comparateur, ni « Bientot » (aucune promesse qui
      // n'y serait pas tenue ; contre-controle, ronde 4).
      gauche = blocAujourdhui() + blocParis() + (paysOuvert() ? blocComparateur() : '');
      droite = blocGardeFou() + blocStrategie() + (paysOuvert() ? blocBientot() : '');
    } else {
      // Gratuit : un apercu floute (le programme du jour, exemple FICTIF) et
      // UNE carte « avec Pro » pour le reste. Le programme (et ses
      // bookmakers) n'est annonce que la ou il arrivera : la France.
      gauche = blocOffert()
        + (paysOuvert() ? verrou('bAujourdhui', 'order-4', tr('pro_space.today_title'), tr('pro_space.locked_today'), apercuAujourdhui()) : '')
        + blocParis();
      droite = blocGardeFou() + blocProEnPlus();
    }
    panneau.innerHTML = enTete()
      + '<div class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start lg:gap-5">'
      + '<div class="contents lg:flex lg:flex-col lg:gap-5">' + gauche + '</div>'
      + '<div class="contents lg:flex lg:flex-col lg:gap-5">' + droite + '</div>'
      + '</div>';
    brancher();
    if (window.IasharkPricingGrid) window.IasharkPricingGrid.mountAll(panneau);
    animerJauges();
  }

  /* ---------- Actions ---------- */
  function ouvrirDialogue(pre) {
    var dlg = document.getElementById('dlgPari');
    if (!dlg) return;
    pre = pre || {};
    ['fpRef', 'fpFamille', 'fpKickoff', 'fpMatch', 'fpPari', 'fpCote'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('fpRef').value = pre.ref || '';
    document.getElementById('fpFamille').value = pre.famille || '';
    document.getElementById('fpKickoff').value = pre.coup_envoi || '';
    document.getElementById('fpMatch').value = pre.match || '';
    document.getElementById('fpPari').value = pre.pari || '';
    document.getElementById('fpCote').value = pre.cote ? String(pre.cote).replace('.', ',') : '';
    document.getElementById('fpBk').value = pre.bookmaker || '';
    document.getElementById('fpMsg').hidden = true;
    dlg.showModal();
  }
  async function enregistrerPari() {
    function n(id) { return Number(String(document.getElementById(id).value || '').replace(',', '.')); }
    var ligne = {
      user_id: ctx.user.id,
      match_label: document.getElementById('fpMatch').value.trim(),
      market: document.getElementById('fpPari').value.trim(),
      odds: n('fpCote'),
      // Plus de case « Mise » (controle du 30/09/2026) : la colonne stake reste
      // obligatoire en base (0010 : not null, > 0). Valeur fixe 1, jamais
      // affichee ni additionnee sur le site (aucun gain, aucun rendement).
      stake: 1,
      source: document.getElementById('fpRef').value ? 'programme' : 'site',
      // Seulement un bookmaker suivi de SON pays (jamais celui d'un autre pays).
      bookmaker: P.bookmakersValides(prefs().pays, [document.getElementById('fpBk').value])[0] || null,
      famille: document.getElementById('fpFamille').value || null,
      programme_ref: document.getElementById('fpRef').value || null,
      kickoff_at: document.getElementById('fpKickoff').value || null
    };
    // estimated_probability (0010, obligatoire) a UN SEUL sens : la chance
    // implicite de la cote notee, 100 / cote, en %, marge du bookmaker
    // comprise (contrat : CONTRAT-TABLES-PRO.md, betting_decisions). Ce n'est
    // PAS une probabilite du modele : jamais pour la calibration, la valeur de
    // cloture ni l'avantage du modele (la chance du pari publie est dans
    // pro_paris.proba). La base la recalcule elle-meme (0041, declencheur
    // betting_decisions_proba_de_la_cote), quel que soit celui qui ecrit.
    ligne.estimated_probability = M.probaDeLaCote(ligne.odds);
    var msg = document.getElementById('fpMsg');
    if (ligne.match_label.length < 3 || ligne.market.length < 2 || !(ligne.odds > 1 && ligne.odds <= 100)) {
      msg.hidden = false; msg.textContent = tr('pro_space.form_error'); return;
    }
    var r = await sb.from('betting_decisions').insert(ligne).select().single();
    if (r.error) { msg.hidden = false; msg.textContent = tr('pro_space.save_error'); return; }
    d.decisions.unshift(r.data);
    document.getElementById('dlgPari').close();
    rendre();
  }
  async function regler(id, statut) {
    var x = d.decisions.filter(function (y) { return String(y.id) === String(id); })[0];
    if (!x) return;
    var r = await sb.from('betting_decisions').update({ status: statut }).eq('id', id).select().single();
    if (!r.error && r.data) { Object.assign(x, r.data); rendre(); }
  }
  function brancher() {
    var b;
    if ((b = document.getElementById('noterPari'))) b.addEventListener('click', function () { ouvrirDialogue(); });
    if ((b = document.getElementById('fpSave'))) b.addEventListener('click', enregistrerPari);
    if ((b = document.getElementById('basculerParis'))) b.addEventListener('click', function () { d.tousLesParis = !d.tousLesParis; rendre(); });
    panneau.querySelectorAll('[data-regler]').forEach(function (el) { el.addEventListener('click', function () { regler(el.getAttribute('data-id'), el.getAttribute('data-regler')); }); });
    // « Je l'ai joue » : pre-remplit le journal avec le pari publie. Cote et
    // bookmaker : la meilleure chez SES bookmakers de SON pays, jamais un
    // operateur d'un autre pays (liste du pays passee au modele).
    panneau.querySelectorAll('[data-jouer]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-jouer');
        var pari = ((d.programme && d.programme.paris) || []).filter(function (p) { return String(p.id) === id; })[0];
        if (!pari) return;
        var r = M.pariPourMoi(pari, prefs().bookmakers, agreesDuPays(), prefs());
        ouvrirDialogue({ ref: pari.ref, famille: pari.famille, coup_envoi: pari.coup_envoi, match: pari.match, pari: pari.pari, cote: r.chezMoi ? r.chezMoi.cote : '', bookmaker: r.chezMoi ? r.chezMoi.id : '' });
      });
    });
  }

  /* ---------- Chargement ---------- */
  async function charger() {
    var uid = ctx.user.id;
    var base = [
      // Ses reglages (pro_preferences, colonnes nommees). Pas de ligne =
      // valeurs par defaut ; table absente (0040 pas encore appliquee) : idem.
      sb.from(P.TABLE).select(P.COLONNES.join(',')).eq('user_id', uid).maybeSingle(),
      sb.from('betting_decisions').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(500),
      sb.from('subscriptions').select('status,current_period_end,cancel_at_period_end,created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle()
    ];
    // Donnees Pro : jamais demandees pour un compte gratuit.
    if (estPro()) {
      var jours = M.joursDuProgramme(new Date());
      base.push(
        sb.from('pro_programmes').select(M.COLONNES_PROGRAMME).in('jour', jours),
        sb.from('pro_paris').select(M.COLONNES_PARIS).in('jour', jours).order('coup_envoi', { ascending: true }),
        // SES tickets notes (pas seulement du jour) : garde-fou du jour (un
        // pari note ici ET dans Telegram compte une fois : M.fusionnerNotes).
        sb.from('pro_tickets').select(M.COLONNES_TICKETS).eq('user_id', uid).eq('statut', 'note').order('created_at', { ascending: false }).limit(1000)
      );
    }
    var r = await Promise.all(base.map(function (q) { return q.then(function (x) { return x; }, function () { return { error: true }; }); }));
    var ligne = (r[0] && !r[0].error && r[0].data) || null;
    // Formulaire rempli = la ligne existe (contrat : pas de « termine le »).
    d.prefsRemplies = !!ligne;
    // Sans ligne : le pays de la PAGE, 'fr' seulement sur les pages
    // francaises ; /en/ ('us'), /es/, marche inconnu : 'autre', aucun
    // bookmaker (contre-controle, ronde 3). Jamais 'fr' par defaut.
    d.prefs = P.normaliser(ligne || { pays: P.paysDuMarche(window.IASHARK_MARKET) });
    d.decisions = (r[1] && !r[1].error && r[1].data) || [];
    d.abo = (r[2] && r[2].data) || null;
    d.aboInconnu = !r[2] || !!r[2].error;
    if (estPro()) {
      var progs = (r[3] && !r[3].error && r[3].data) || [];
      var paris = (r[4] && !r[4].error && r[4].data) || [];
      d.programme = M.programmeDuJour(progs, paris, new Date());
      d.tickets = (r[5] && !r[5].error && r[5].data) || [];
      // pari_id d'un ticket -> « PRO-7 » : un pari note ici ET dans Telegram compte une fois.
      d.refsParis = paris.map(function (x) { return { id: x.id, ref: x.numero ? 'PRO-' + x.numero : null }; });
      await refsDesTickets();
    } else {
      try {
        var home = await fetch('/data-home.json', { cache: 'no-cache' }).then(function (x) { return x.ok ? x.json() : null; });
        if (home && window.IasharkFreeMatch) d.offert = window.IasharkFreeMatch.pickFreeMatch(home.matchs || [], null, (window.IASHARK_MARKET && window.IASHARK_MARKET.code) || null);
      } catch (_e) { d.offert = null; }
    }
  }

  /* Numero « PRO-n » des paris des anciens tickets (pas ceux du jour, deja
     lus) : colonnes id et numero de pro_paris, lisibles par l'abonne Pro. */
  async function refsDesTickets() {
    var connus = {}, manquants = [];
    d.refsParis.forEach(function (x) { connus[String(x.id)] = true; });
    d.tickets.forEach(function (t) {
      if (t && t.pari_id != null && !connus[String(t.pari_id)]) { connus[String(t.pari_id)] = true; manquants.push(t.pari_id); }
    });
    for (var i = 0; i < manquants.length; i += 100) {
      try {
        var r = await sb.from('pro_paris').select('id,numero').in('id', manquants.slice(i, i + 100));
        ((r && !r.error && r.data) || []).forEach(function (x) { if (x && x.numero) d.refsParis.push({ id: x.id, ref: 'PRO-' + x.numero }); });
      } catch (_e) { /* sans numero : le ticket compte a part (jamais de pari cache) */ }
    }
  }

  function connexion(p) {
    p.innerHTML = '<div class="rounded-3xl border border-hairline bg-surface p-6 sm:p-8"><h1 class="text-[24px] font-extrabold tracking-tight">' + esc(tr('pro_space.login_title')) + '</h1>'
      + '<p class="mt-2 max-w-xl text-[14.5px] leading-relaxed text-soft">' + esc(tr('pro_space.login_text')) + '</p>'
      + '<a href="' + esc(lien('inscription.html?next=' + encodeURIComponent(location.pathname + '#tableau'))) + '" class="mt-5 inline-flex h-11 items-center rounded-xl bg-cyan px-5 text-[14px] font-bold text-[#04141b]">' + esc(tr('pro_space.login_cta')) + '</a></div>';
  }

  var enCours = null;
  window.IasharkProDashboard = {
    render: function (p, contexte) {
      panneau = p;
      sb = window.IasharkApp.supabase;
      ctx = contexte;
      if (!ctx || !ctx.user) { connexion(p); return; }
      if (enCours) { enCours.then(rendre); return; }
      p.innerHTML = '<div class="h-48 animate-pulse rounded-3xl bg-white/[.04]"></div>';
      enCours = charger().then(rendre, rendre);
    }
  };
})();
