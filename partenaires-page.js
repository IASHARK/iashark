/* IASHARK — espace partenaire (/partenaires.html), 03/10/2026.
   Telephone d'abord, feuille assets/partenaires.css (refonte du 28/10/2026), 7 langues
   (cles affiliation.* de i18n/parts/affiliation.<locale>.json).

   Etats, decides par la base (RPC affiliate_me / affiliate_dashboard, migration
   0050 ; jamais par le navigateur) :
   - visiteur sans compte : presentation + « Creer mon compte » (retour ici) ;
   - compte sans candidature : questionnaire (reseaux et liens, abonnes, style
     de contenu, pays, statut particulier / professionnel, code souhaite,
     acceptation des conditions ET des regles de communication) ;
   - 'pending' : « en attente de validation » ;
   - 'refused' / 'suspended' : message et contact ;
   - 'approved' : lien, code, QR code, chiffres (clics, inscrits, essais,
     abonnes payants actifs, commissions en attente / payables / payees),
     historique, versements, compte de versement Stripe Connect (fonction
     affiliate-connect ; sans Connect : versement manuel). Formation et kit
     retires du site le 03/10 (retour a la version du 29/09).
   Aucune mise, aucune promesse de gain : seulement des chiffres de commission. */
(function () {
  'use strict';
  var app = document.getElementById('partnerApp');
  var cta = document.getElementById('paCta');
  var sb = null, ctx = null, me = null, dash = null;
  var SITE = 'https://iashark.com';

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
  function dir() { var m = location.pathname.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)(?:\/|$)/); return m ? m[1] : 'fr'; }
  function localeTag() { return (window.I18N && window.I18N.localeTag) ? window.I18N.localeTag() : 'fr-FR'; }
  function money(cents, cur) {
    var n = (Number(cents) || 0) / 100;
    try { return new Intl.NumberFormat(localeTag(), { style: 'currency', currency: String(cur || 'EUR').toUpperCase() }).format(n); }
    catch (e) { return n.toFixed(2) + ' ' + String(cur || 'EUR').toUpperCase(); }
  }
  function dateCourte(iso) {
    if (!iso) return '—';
    try { return new Intl.DateTimeFormat(localeTag(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)); } catch (e) { return String(iso).slice(0, 10); }
  }
  function nombre(n) { try { return new Intl.NumberFormat(localeTag()).format(Number(n) || 0); } catch (e) { return String(n || 0); } }


  /* ---------- Morceaux d'interface (classes pa-*, assets/partenaires.css, 28/10/2026) ---------- */
  function carte(html, cls) { return '<div class="pa-carte' + (cls ? ' ' + cls : '') + '">' + html + '</div>'; }
  function titre(t, aide) {
    return '<h2 class="pa-h2">' + esc(t) + '</h2>' + (aide ? '<p class="pa-texte">' + esc(aide) + '</p>' : '');
  }
  function bouton(id, label, primaire, href, petit) {
    var cls = 'pa-btn' + (primaire ? '' : ' pa-btn--ligne') + (petit ? ' pa-btn--petit' : '');
    return href ? '<a href="' + esc(href) + '" class="' + cls + '">' + esc(label) + '</a>' : '<button type="button" id="' + id + '" class="' + cls + '">' + esc(label) + '</button>';
  }
  function champ(id, label, o) {
    o = o || {};
    return '<div class="pa-champ"><label for="' + id + '">' + esc(label) + '</label>'
      + '<input id="' + id + '" type="' + (o.type || 'text') + '"' + (o.attrs || '') + ' value="' + esc(o.value || '') + '" class="pa-saisie' + (o.cls ? ' ' + o.cls : '') + '"' + (o.aide ? ' aria-describedby="' + id + 'Aide"' : '') + '>'
      + (o.aide ? '<p class="pa-aide" id="' + id + 'Aide">' + esc(o.aide) + '</p>' : '') + '</div>';
  }
  function choix(nom, valeur, label, texte, coche) {
    return '<label class="pa-choix"><input type="radio" name="' + nom + '" value="' + esc(valeur) + '"' + (coche ? ' checked' : '') + '>'
      + '<span><b>' + esc(label) + '</b>' + (texte ? '<small>' + esc(texte) + '</small>' : '') + '</span></label>';
  }
  function caseAcoche(id, html) {
    return '<label class="pa-case"><input id="' + id + '" type="checkbox"><span>' + html + '</span></label>';
  }
  function kpi(label, valeur, sous) {
    return '<div class="pa-chiffre"><p>' + esc(label) + '</p><b>' + esc(valeur) + '</b>' + (sous ? '<small>' + esc(sous) + '</small>' : '') + '</div>';
  }
  function message(id, texte, type) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = texte || '';
    el.hidden = !texte;
    el.className = 'pa-msg' + (type === 'error' ? ' pa-msg--erreur' : type === 'success' ? ' pa-msg--ok' : '');
    if (type === 'error') el.setAttribute('role', 'alert'); else el.removeAttribute('role');
  }

  /* « 40 % » du titre en cyan, dans chaque langue (40 %, 40%, 40 %…), apres la traduction. */
  function accentuerTitre() {
    var h = document.getElementById('paTitle');
    if (!h || h.querySelector('.pa-accent')) return;
    var t = h.textContent || '';
    var m = t.match(/^(.*?)(\d+\s?%)(.*)$/);
    if (!m) return;
    h.textContent = '';
    if (m[1]) h.appendChild(document.createTextNode(m[1]));
    var s = document.createElement('span');
    s.className = 'pa-accent';
    s.textContent = m[2];
    h.appendChild(s);
    if (m[3]) h.appendChild(document.createTextNode(m[3]));
    // Meme ecriture du taux dans le registre des conditions (40 % en francais, 40% en anglais).
    var dt = document.querySelector('.pa-termes dt');
    if (dt) dt.textContent = m[2];
  }

  /* Seul mouvement de la page : la frise « Comment ça marche » se trace a l'ecran. */
  function animerFrise() {
    var f = document.getElementById('paFrise');
    if (!f || !('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var r = f.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.85) return;
    f.classList.add('pa-frise--attente');
    var io = new IntersectionObserver(function (entrees) {
      if (!entrees.some(function (e) { return e.isIntersecting; })) return;
      f.classList.add('pa-frise--vue');
      f.classList.remove('pa-frise--attente');
      io.disconnect();
    }, { rootMargin: '0px 0px -15% 0px' });
    io.observe(f);
  }

  /* ---------- Etats ---------- */
  // Visiteur sans compte : les boutons sont deja dans la page ; ils ramenent ici apres l'inscription.
  function rendreCtaVisiteur() {
    var ici = location.pathname;
    document.querySelectorAll('[data-pa-lien]').forEach(function (a) {
      a.setAttribute('href', lien(a.getAttribute('data-pa-lien') + '?next=' + encodeURIComponent(ici)));
    });
  }
  // Compte connecte : un seul bouton vers sa candidature ou son espace, plus de rappel en bas.
  function rendreCtaConnecte(label, ancre) {
    cta.innerHTML = bouton('', label, true, '#' + ancre);
    var fin = document.getElementById('paFinal');
    if (fin) fin.hidden = true;
    // Arrivee depuis « Mon compte » (partenaires.html#candidature) : le bloc vient d'etre dessine,
    // le navigateur n'a pas pu y descendre tout seul.
    if (location.hash === '#' + ancre) {
      var cible = document.getElementById(ancre);
      if (cible) setTimeout(function () { cible.scrollIntoView({ block: 'start' }); }, 0);
    }
  }

  var PAYS = ['FR', 'BE', 'CH', 'LU', 'MC', 'CA', 'GB', 'IE', 'ZA', 'MX', 'ES', 'PT', 'IT', 'DE', 'AT', 'NL', 'US', 'MA', 'DZ', 'TN', 'SN', 'CI', 'CM', 'BR', 'AR', 'CO', 'CL', 'PE', 'AU', 'NZ', 'IN', 'NG', 'KE', 'GH',
    'EG', 'SA', 'AE', 'QA', 'KW', 'JO', 'LB', 'TR'];
  function nomPays(code) {
    try { return new Intl.DisplayNames([localeTag()], { type: 'region' }).of(code); } catch (e) { return code; }
  }
  function paysParDefaut() {
    var d = dir();
    return d === 'gb' ? 'GB' : d === 'za' ? 'ZA' : d === 'mx' ? 'MX' : d === 'es' ? 'ES' : d === 'en' ? 'US' : 'FR';
  }

  function rendreFormulaire() {
    var styles = ['analysis', 'tips', 'entertainment', 'education', 'community', 'other'];
    var defaut = paysParDefaut();
    var options = PAYS.map(function (c) { return { c: c, n: nomPays(c) }; }).sort(function (a, b) { return a.n.localeCompare(b.n, localeTag()); });
    app.hidden = false;
    app.innerHTML = '<div id="candidature">' + titre(tr('affiliation.form_title'), tr('affiliation.form_help'))
      + '<form id="paForm" class="pa-form" novalidate>'
      + champ('paCode', tr('affiliation.f_code'), { cls: 'pa-code-saisie', attrs: ' maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="MONCODE"', aide: tr('affiliation.f_code_help') })
      + '<div class="pa-champ"><label for="paNetworks">' + esc(tr('affiliation.f_networks')) + '</label>'
      + '<textarea id="paNetworks" rows="3" class="pa-saisie" placeholder="https://www.tiktok.com/@…" aria-describedby="paNetworksAide"></textarea>'
      + '<p class="pa-aide" id="paNetworksAide">' + esc(tr('affiliation.f_networks_help')) + '</p></div>'
      + champ('paAudience', tr('affiliation.f_audience'), { type: 'number', attrs: ' min="0" step="1" inputmode="numeric"', aide: tr('affiliation.f_audience_help') })
      + '<fieldset class="pa-fieldset"><legend class="pa-legende">' + esc(tr('affiliation.f_style')) + '</legend><div class="pa-choix-grille">'
      + styles.map(function (s, i) { return choix('style', s, tr('affiliation.style_' + s), '', i === 0); }).join('') + '</div></fieldset>'
      + '<div class="pa-champ"><label for="paCountry">' + esc(tr('affiliation.f_country')) + '</label>'
      + '<select id="paCountry" class="pa-saisie">'
      + options.map(function (o) { return '<option value="' + o.c + '"' + (o.c === defaut ? ' selected' : '') + '>' + esc(o.n) + '</option>'; }).join('') + '</select></div>'
      + '<fieldset class="pa-fieldset"><legend class="pa-legende">' + esc(tr('affiliation.f_status')) + '</legend><div class="pa-choix-grille">'
      + choix('statut', 'individual', tr('affiliation.status_individual'), tr('affiliation.status_individual_help'), true)
      + choix('statut', 'professional', tr('affiliation.status_professional'), tr('affiliation.status_professional_help'), false) + '</div></fieldset>'
      + '<div class="pa-champ"><label for="paAbout">' + esc(tr('affiliation.f_about')) + '</label>'
      + '<textarea id="paAbout" rows="3" maxlength="1000" class="pa-saisie"></textarea></div>'
      + '<div class="pa-accords">'
      + caseAcoche('paTerms', esc(tr('affiliation.f_accept_terms')) + ' <a href="' + esc(lien('partenaires-conditions.html')) + '" class="pa-lien" target="_blank" rel="noopener">' + esc(tr('affiliation.f_terms_link')) + '</a>')
      + caseAcoche('paRules', esc(tr('affiliation.f_accept_rules')))
      + '</div>'
      + '<p id="paFormMsg" hidden></p>'
      + '<div class="pa-envoi">' + bouton('paSubmit', tr('affiliation.f_submit'), true) + '</div>'
      + '</form></div>';
    rendreCtaConnecte(tr('affiliation.cta_apply'), 'candidature');
    var form = document.getElementById('paForm');
    form.addEventListener('submit', envoyerCandidature);
    document.getElementById('paSubmit').addEventListener('click', envoyerCandidature);
    document.getElementById('paCode').addEventListener('input', function (e) { e.target.value = String(e.target.value || '').toUpperCase(); });
  }

  async function envoyerCandidature(e) {
    if (e) e.preventDefault();
    var g = function (id) { return document.getElementById(id); };
    var reseaux = String(g('paNetworks').value || '').split(/\r?\n|,/).map(function (s) { return s.trim(); }).filter(Boolean);
    var payload = {
      code: String(g('paCode').value || '').trim().toUpperCase(),
      networks: reseaux,
      audience: String(g('paAudience').value || '').trim(),
      content_style: (document.querySelector('input[name="style"]:checked') || {}).value || '',
      country: g('paCountry').value,
      status: (document.querySelector('input[name="statut"]:checked') || {}).value || '',
      about: String(g('paAbout').value || '').trim(),
      accept_terms: g('paTerms').checked === true,
      accept_rules: g('paRules').checked === true,
      terms_version: '2026-10-03'
    };
    if (!/^[A-Z0-9][A-Z0-9_-]{2,18}[A-Z0-9]$/.test(payload.code)) { message('paFormMsg', tr('affiliation.err_code'), 'error'); g('paCode').focus(); return; }
    if (!reseaux.length) { message('paFormMsg', tr('affiliation.err_networks'), 'error'); g('paNetworks').focus(); return; }
    if (!/^\d{1,9}$/.test(payload.audience)) { message('paFormMsg', tr('affiliation.err_audience'), 'error'); g('paAudience').focus(); return; }
    if (!payload.accept_terms || !payload.accept_rules) { message('paFormMsg', tr('affiliation.err_accept'), 'error'); return; }
    var btn = g('paSubmit');
    btn.disabled = true;
    message('paFormMsg', tr('affiliation.sending'));
    try {
      var r = await sb.rpc('affiliate_apply', { p_payload: payload });
      if (r.error) throw r.error;
      var d = r.data || {};
      if (d.ok) { await charger(); return; }
      if (d.code === 'code_taken') message('paFormMsg', tr('affiliation.err_code_taken'), 'error');
      else if (d.code === 'already_applied') { await charger(); return; }
      else message('paFormMsg', tr('affiliation.err_invalid'), 'error');
    } catch (err) {
      var m = String((err && err.message) || '');
      message('paFormMsg', /does not exist|PGRST202|42883/.test(m) ? tr('affiliation.err_not_open') : tr('affiliation.err_generic'), 'error');
    }
    btn.disabled = false;
  }


  function rendreAttente() {
    app.hidden = false;
    app.innerHTML = '<div id="attente">' + carte('<p class="pa-statut">' + esc(tr('affiliation.pending_kicker')) + '</p>'
      + '<h2 class="pa-h2">' + esc(tr('affiliation.pending_title')) + '</h2>'
      + '<p class="pa-texte">' + esc(tr('affiliation.pending_text', { code: me.code })) + '</p>'
      + '<p class="pa-petit">' + esc(tr('affiliation.pending_since', { date: dateCourte(me.created_at) })) + '</p>', 'pa-carte--accent') + '</div>';
    rendreCtaConnecte(tr('affiliation.cta_pending'), 'attente');
  }
  function rendreRefus() {
    app.hidden = false;
    var suspendu = me.status === 'suspended';
    app.innerHTML = '<div id="refus">' + carte('<h2 class="pa-h2">' + esc(tr(suspendu ? 'affiliation.suspended_title' : 'affiliation.refused_title')) + '</h2>'
      + '<p class="pa-texte">' + esc(tr(suspendu ? 'affiliation.suspended_text' : 'affiliation.refused_text')) + '</p>'
      + (me.reviewed_note ? '<p class="pa-msg">' + esc(me.reviewed_note) + '</p>' : '')
      + '<p class="pa-petit">' + esc(tr('affiliation.contact_us')) + ' <a href="mailto:contact@iashark.com" class="pa-lien">contact@iashark.com</a></p>') + '</div>';
    rendreCtaConnecte(tr(suspendu ? 'affiliation.cta_suspended' : 'affiliation.cta_refused'), 'refus');
  }

  function dessinerQr(url) {
    var slot = document.getElementById('paQr');
    if (!slot) return;
    try {
      if (typeof window.qrcode !== 'function') { slot.innerHTML = ''; return; }
      var q = window.qrcode(0, 'M');
      q.addData(url);
      q.make();
      slot.innerHTML = '<span class="pa-qr">' + q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) + '</span>';
    } catch (e) { slot.innerHTML = ''; }
  }
  async function copier(texte, btnId) {
    var b = document.getElementById(btnId);
    try { await navigator.clipboard.writeText(texte); if (b) { b.textContent = tr('affiliation.copied'); setTimeout(function () { b.textContent = tr('affiliation.copy'); }, 1800); } }
    catch (e) { if (b) b.textContent = tr('affiliation.copy_failed'); }
  }


  function ligneSolde(cur, b) {
    return '<div class="pa-soldes">'
      + '<div class="pa-solde"><p>' + esc(tr('affiliation.bal_pending')) + '</p><b>' + esc(money(b.pending, cur)) + '</b></div>'
      + '<div class="pa-solde pa-solde--accent"><p>' + esc(tr('affiliation.bal_payable')) + '</p><b>' + esc(money(b.payable, cur)) + '</b></div>'
      + '<div class="pa-solde"><p>' + esc(tr('affiliation.bal_paid')) + '</p><b>' + esc(money(b.paid, cur)) + '</b></div>'
      + '</div>';
  }
  function libelleStatut(h) {
    var k = { pending: 'affiliation.st_pending', payable: 'affiliation.st_payable', paid: 'affiliation.st_paid', reversed: 'affiliation.st_reversed', refused: 'affiliation.st_refused' }[h.status] || h.status;
    return tr(k);
  }
  function rendreEspace() {
    var url = SITE + '/?ref=' + encodeURIComponent(me.code);
    var d = dash || {};
    var bal = d.balances || {};
    var devises = Object.keys(bal);
    if (!devises.length) bal = { eur: { pending: 0, payable: 0, paid: 0, reversed: 0 } }, devises = ['eur'];
    var hist = Array.isArray(d.history) ? d.history : [];
    var pays = Array.isArray(d.payouts) ? d.payouts : [];
    var connectBloc;
    if (me.payout_ready) {
      connectBloc = '<p class="pa-texte">' + esc(tr('affiliation.payout_ready_text')) + '</p>';
    } else if (me.has_stripe_account) {
      connectBloc = '<p class="pa-texte">' + esc(tr('affiliation.payout_pending_text')) + '</p><div class="pa-actions">' + bouton('paConnect', tr('affiliation.payout_continue'), true, '', true) + bouton('paConnectStatus', tr('affiliation.payout_check'), false, '', true) + '</div>';
    } else {
      connectBloc = '<p class="pa-texte">' + esc(tr('affiliation.payout_setup_text')) + '</p><div class="pa-actions">' + bouton('paConnect', tr('affiliation.payout_setup'), true, '', true) + '</div>';
    }
    app.hidden = false;
    app.innerHTML = '<div id="espace">' + titre(tr('affiliation.space_title'), tr('affiliation.space_help'))
      + '<div class="pa-lien-grille">'
      + carte('<p class="pa-etiquette">' + esc(tr('affiliation.your_link')) + '</p>'
        + '<p class="pa-url">' + esc(url) + '</p>'
        + '<div class="pa-actions">' + bouton('paCopyLink', tr('affiliation.copy'), true, '', true) + '</div>'
        + '<p class="pa-etiquette pa-etiquette--suite">' + esc(tr('affiliation.your_code')) + '</p>'
        + '<p class="pa-code">' + esc(me.code) + '</p>'
        + '<p class="pa-aide">' + esc(tr('affiliation.code_help')) + '</p>'
        + '<div class="pa-actions">' + bouton('paCopyCode', tr('affiliation.copy'), false, '', true) + '</div>', 'pa-carte--accent')
      + carte('<p class="pa-etiquette">' + esc(tr('affiliation.qr')) + '</p><div id="paQr"></div><p class="pa-aide">' + esc(tr('affiliation.qr_help')) + '</p>', 'pa-qr-carte')
      + '</div>'
      + '<div class="pa-chiffres">'
      + kpi(tr('affiliation.k_clicks'), nombre(d.clicks && d.clicks.total), tr('affiliation.k_clicks_30', { n: nombre(d.clicks && d.clicks.days_30) }))
      + kpi(tr('affiliation.k_signups'), nombre(d.signups))
      + kpi(tr('affiliation.k_trials'), nombre(d.trials))
      + kpi(tr('affiliation.k_paying'), nombre(d.active_paying))
      + '</div>'
      + '<div class="pa-pile">'
      + carte('<h3>' + esc(tr('affiliation.balances_title')) + '</h3><p class="pa-aide">' + esc(tr('affiliation.balances_help')) + '</p>'
        + devises.map(function (c) { return (devises.length > 1 ? '<p class="pa-devise">' + esc(String(c).toUpperCase()) + '</p>' : '') + ligneSolde(c, bal[c]); }).join(''))
      + carte('<h3>' + esc(tr('affiliation.payout_title')) + '</h3>' + connectBloc + '<p id="paConnectMsg" hidden></p>')
      + carte('<h3>' + esc(tr('affiliation.history_title')) + '</h3>'
        + (hist.length ? '<div class="pa-table-zone"><table class="pa-table"><thead><tr><th>' + esc(tr('affiliation.h_date')) + '</th><th>' + esc(tr('affiliation.h_customer')) + '</th><th>' + esc(tr('affiliation.h_amount')) + '</th><th>' + esc(tr('affiliation.h_status')) + '</th></tr></thead><tbody>'
          + hist.map(function (h) {
            var neg = h.kind === 'reversal';
            return '<tr><td class="pa-num pa-date">' + esc(dateCourte(h.at)) + '</td><td>' + esc(h.customer || '—') + '</td><td class="pa-num' + (neg ? ' pa-moins' : '') + '">' + (neg ? '− ' : '') + esc(money(h.amount_cents, h.currency)) + '</td><td>' + esc(libelleStatut(h)) + (h.status === 'pending' && h.payable_at ? '<br><span class="pa-aide">' + esc(tr('affiliation.payable_on', { date: dateCourte(h.payable_at) })) + '</span>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
          : '<p class="pa-texte">' + esc(tr('affiliation.history_empty')) + '</p>'))
      + carte('<h3>' + esc(tr('affiliation.payouts_title')) + '</h3>'
        + (pays.length ? '<ul class="pa-versements">' + pays.map(function (p) { return '<li><span>' + esc(dateCourte(p.at)) + (p.reference ? ' · ' + esc(p.reference) : '') + '</span><b class="pa-num">' + esc(money(p.amount_cents, p.currency)) + '</b></li>'; }).join('') + '</ul>'
          : '<p class="pa-texte">' + esc(tr('affiliation.payouts_empty')) + '</p>'))
      + '</div>'
      + '<p class="pa-petit pa-note">' + esc(tr('affiliation.space_terms_note')) + ' <a href="' + esc(lien('partenaires-conditions.html')) + '" class="pa-lien">' + esc(tr('affiliation.f_terms_link')) + '</a></p>'
      + '</div>';
    rendreCtaConnecte(tr('affiliation.cta_space'), 'espace');
    dessinerQr(url);
    document.getElementById('paCopyLink').addEventListener('click', function () { copier(url, 'paCopyLink'); });
    document.getElementById('paCopyCode').addEventListener('click', function () { copier(me.code, 'paCopyCode'); });
    var c = document.getElementById('paConnect');
    if (c) c.addEventListener('click', function () { connect('start'); });
    var s = document.getElementById('paConnectStatus');
    if (s) s.addEventListener('click', function () { connect('status'); });
  }

  async function connect(mode) {
    message('paConnectMsg', tr('affiliation.payout_opening'));
    try {
      var session = await sb.auth.getSession();
      var token = session.data.session && session.data.session.access_token;
      var res = await fetch(window.IasharkApp.url + '/functions/v1/affiliate-connect', {
        method: 'POST',
        headers: { apikey: window.IasharkApp.key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode, dir: dir() })
      });
      var j = await res.json();
      if (j && j.url) { location.href = j.url; return; }
      if (j && j.processed === false && j.reason === 'connect_not_enabled') { message('paConnectMsg', tr('affiliation.payout_manual_text')); return; }
      if (j && j.processed && mode === 'status') { await charger(); message('paConnectMsg', j.payout_ready ? tr('affiliation.payout_ready_text') : tr('affiliation.payout_pending_text')); return; }
      message('paConnectMsg', tr('affiliation.payout_error'), 'error');
    } catch (e) { message('paConnectMsg', tr('affiliation.payout_error'), 'error'); }
  }

  /* ---------- Chargement ---------- */

  /* ---------- Chargement ---------- */
  async function charger() {
    var r = await sb.rpc('affiliate_me');
    if (r.error) {
      var m = String(r.error.message || '');
      app.hidden = false;
      app.innerHTML = carte('<p class="pa-texte">' + esc(/does not exist|PGRST202|42883/.test(m) ? tr('affiliation.err_not_open') : tr('affiliation.err_generic')) + '</p>');
      return;
    }
    me = r.data || null;
    if (!me) { rendreFormulaire(); return; }
    if (me.status === 'pending') { rendreAttente(); return; }
    if (me.status === 'refused' || me.status === 'suspended') { rendreRefus(); return; }
    var d = await sb.rpc('affiliate_dashboard');
    dash = d && !d.error ? d.data : null;
    rendreEspace();
    if (/[?&]connect=return/.test(location.search)) connect('status');
  }

  async function demarrer() {
    if (window.I18N && window.I18N.init) { try { await window.I18N.init(); } catch (_e) {} }
    accentuerTitre();
    animerFrise();
    if (!window.IasharkApp) { rendreCtaVisiteur(); return; }
    sb = window.IasharkApp.supabase;
    try { ctx = await window.IasharkApp.context(); } catch (e) { ctx = null; }
    if (!ctx || !ctx.user) { rendreCtaVisiteur(); return; }
    await charger();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
