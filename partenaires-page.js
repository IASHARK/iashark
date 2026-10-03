/* IASHARK — espace partenaire (/partenaires.html), 03/10/2026.
   Telephone d'abord, charte du site (Tailwind + assets/pro-space.css), 7 langues
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
     affiliate-connect ; sans Connect : versement manuel), liens vers la
     formation et le kit (pages partenaires-formation.html et
     partenaires-kit.html, faites par ailleurs).
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

  /* ---------- Morceaux d'interface ---------- */
  function carte(html, cls) { return '<div class="rounded-2xl border border-hairline bg-surface p-5 ' + (cls || '') + '">' + html + '</div>'; }
  function titre(t, aide) {
    return '<h2 class="text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">' + esc(t) + '</h2>'
      + (aide ? '<p class="mt-2 text-[14.5px] leading-relaxed text-soft">' + esc(aide) + '</p>' : '');
  }
  function bouton(id, label, primaire, href) {
    var cls = primaire ? 'bg-cyan text-[#04141b] hover:bg-cyan/90' : 'border border-hairline text-ink hover:border-cyan/40';
    var attrs = ' class="inline-flex h-11 items-center justify-center rounded-xl px-5 text-[14px] font-bold transition ' + cls + '"';
    return href ? '<a href="' + esc(href) + '"' + attrs + '>' + esc(label) + '</a>' : '<button type="button" id="' + id + '"' + attrs + '>' + esc(label) + '</button>';
  }
  function champ(id, label, o) {
    o = o || {};
    return '<div><label for="' + id + '" class="block text-[13.5px] font-semibold text-ink">' + esc(label) + '</label>'
      + '<input id="' + id + '" type="' + (o.type || 'text') + '"' + (o.attrs || '') + ' value="' + esc(o.value || '') + '" class="mt-2 h-12 w-full rounded-xl border border-hairline bg-panel px-4 text-[16px] text-ink outline-none transition focus:border-cyan/60">'
      + (o.aide ? '<p class="mt-1.5 text-[12.5px] leading-relaxed text-soft">' + esc(o.aide) + '</p>' : '') + '</div>';
  }
  function choix(nom, valeur, label, texte, coche) {
    return '<label class="flex cursor-pointer items-start gap-3 rounded-2xl border border-hairline bg-panel p-3.5 transition hover:border-cyan/40 has-[:checked]:border-cyan/60 has-[:checked]:bg-cyan/[.06]">'
      + '<input type="radio" name="' + nom + '" value="' + esc(valeur) + '"' + (coche ? ' checked' : '') + ' class="mt-1 h-[18px] w-[18px] shrink-0 accent-[#20d5ef]">'
      + '<span><span class="block text-[14.5px] font-semibold">' + esc(label) + '</span>' + (texte ? '<span class="mt-0.5 block text-[13px] leading-relaxed text-soft">' + esc(texte) + '</span>' : '') + '</span></label>';
  }
  function caseAcoche(id, html) {
    return '<label class="flex cursor-pointer items-start gap-3 text-[13.5px] leading-relaxed text-soft"><input id="' + id + '" type="checkbox" class="mt-1 h-[18px] w-[18px] shrink-0 accent-[#20d5ef]"><span>' + html + '</span></label>';
  }
  function kpi(label, valeur, sous) {
    return '<div class="rounded-2xl border border-hairline bg-surface p-4"><p class="text-[12px] font-semibold uppercase tracking-wider text-soft">' + esc(label) + '</p>'
      + '<p class="pa-kpi mt-1 text-[24px] font-extrabold">' + esc(valeur) + '</p>' + (sous ? '<p class="mt-0.5 text-[12.5px] text-soft">' + esc(sous) + '</p>' : '') + '</div>';
  }
  function message(id, texte, type) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = texte || '';
    el.hidden = !texte;
    el.className = 'mt-4 rounded-lg border px-3.5 py-3 text-[13.5px] leading-relaxed ' + (type === 'error' ? 'border-red-500/30 bg-red-500/[.07] text-red-300' : type === 'success' ? 'border-emerald-500/30 bg-emerald-500/[.07] text-emerald-300' : 'border-hairline bg-white/[.03] text-soft');
  }

  /* ---------- Etats ---------- */
  function rendreCtaVisiteur() {
    var ici = location.pathname;
    cta.innerHTML = '<div class="flex flex-wrap gap-3">'
      + bouton('', tr('affiliation.cta_signup'), true, lien('inscription.html?next=' + encodeURIComponent(ici)))
      + bouton('', tr('affiliation.cta_login'), false, lien('connexion.html?next=' + encodeURIComponent(ici)))
      + '</div><p class="mt-3 text-[13px] text-soft">' + esc(tr('affiliation.cta_note')) + '</p>';
  }
  function rendreCtaConnecte(label, ancre) {
    cta.innerHTML = '<div class="flex flex-wrap gap-3">' + bouton('', label, true, '#' + ancre) + '</div>';
  }

  var PAYS = ['FR', 'BE', 'CH', 'LU', 'MC', 'CA', 'GB', 'IE', 'ZA', 'MX', 'ES', 'PT', 'IT', 'DE', 'AT', 'NL', 'US', 'MA', 'DZ', 'TN', 'SN', 'CI', 'CM', 'BR', 'AR', 'CO', 'CL', 'PE', 'AU', 'NZ', 'IN', 'NG', 'KE', 'GH'];
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
      + '<form id="paForm" class="mt-6 space-y-5" novalidate>'
      + champ('paCode', tr('affiliation.f_code'), { attrs: ' maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="MONCODE"', aide: tr('affiliation.f_code_help') })
      + '<div><label for="paNetworks" class="block text-[13.5px] font-semibold text-ink">' + esc(tr('affiliation.f_networks')) + '</label>'
      + '<textarea id="paNetworks" rows="3" class="mt-2 w-full rounded-xl border border-hairline bg-panel px-4 py-3 text-[16px] text-ink outline-none transition focus:border-cyan/60" placeholder="https://www.tiktok.com/@…"></textarea>'
      + '<p class="mt-1.5 text-[12.5px] leading-relaxed text-soft">' + esc(tr('affiliation.f_networks_help')) + '</p></div>'
      + champ('paAudience', tr('affiliation.f_audience'), { type: 'number', attrs: ' min="0" step="1" inputmode="numeric"', aide: tr('affiliation.f_audience_help') })
      + '<fieldset><legend class="text-[13.5px] font-semibold text-ink">' + esc(tr('affiliation.f_style')) + '</legend><div class="mt-2 grid gap-2 sm:grid-cols-2">'
      + styles.map(function (s, i) { return choix('style', s, tr('affiliation.style_' + s), '', i === 0); }).join('') + '</div></fieldset>'
      + '<div><label for="paCountry" class="block text-[13.5px] font-semibold text-ink">' + esc(tr('affiliation.f_country')) + '</label>'
      + '<select id="paCountry" class="mt-2 h-12 w-full rounded-xl border border-hairline bg-panel px-4 text-[16px] text-ink outline-none transition focus:border-cyan/60">'
      + options.map(function (o) { return '<option value="' + o.c + '"' + (o.c === defaut ? ' selected' : '') + '>' + esc(o.n) + '</option>'; }).join('') + '</select></div>'
      + '<fieldset><legend class="text-[13.5px] font-semibold text-ink">' + esc(tr('affiliation.f_status')) + '</legend><div class="mt-2 grid gap-2 sm:grid-cols-2">'
      + choix('statut', 'individual', tr('affiliation.status_individual'), tr('affiliation.status_individual_help'), true)
      + choix('statut', 'professional', tr('affiliation.status_professional'), tr('affiliation.status_professional_help'), false) + '</div></fieldset>'
      + '<div><label for="paAbout" class="block text-[13.5px] font-semibold text-ink">' + esc(tr('affiliation.f_about')) + '</label>'
      + '<textarea id="paAbout" rows="3" maxlength="1000" class="mt-2 w-full rounded-xl border border-hairline bg-panel px-4 py-3 text-[16px] text-ink outline-none transition focus:border-cyan/60"></textarea></div>'
      + '<div class="space-y-3 rounded-2xl border border-hairline bg-surface p-4">'
      + caseAcoche('paTerms', esc(tr('affiliation.f_accept_terms')) + ' <a href="' + esc(lien('partenaires-conditions.html')) + '" class="font-semibold text-cyan hover:underline" target="_blank" rel="noopener">' + esc(tr('affiliation.f_terms_link')) + '</a>')
      + caseAcoche('paRules', esc(tr('affiliation.f_accept_rules')))
      + '</div>'
      + '<p id="paFormMsg" hidden></p>'
      + '<div class="flex flex-wrap gap-3">' + bouton('paSubmit', tr('affiliation.f_submit'), true) + '</div>'
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
    app.innerHTML = '<div id="attente">' + carte('<p class="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan">' + esc(tr('affiliation.pending_kicker')) + '</p>'
      + '<h2 class="mt-2 text-[22px] font-extrabold tracking-tight">' + esc(tr('affiliation.pending_title')) + '</h2>'
      + '<p class="mt-2 text-[14.5px] leading-relaxed text-soft">' + esc(tr('affiliation.pending_text', { code: me.code })) + '</p>'
      + '<p class="mt-3 text-[13px] text-soft">' + esc(tr('affiliation.pending_since', { date: dateCourte(me.created_at) })) + '</p>') + '</div>';
    rendreCtaConnecte(tr('affiliation.cta_pending'), 'attente');
  }
  function rendreRefus() {
    app.hidden = false;
    var suspendu = me.status === 'suspended';
    app.innerHTML = '<div id="refus">' + carte('<h2 class="text-[22px] font-extrabold tracking-tight">' + esc(tr(suspendu ? 'affiliation.suspended_title' : 'affiliation.refused_title')) + '</h2>'
      + '<p class="mt-2 text-[14.5px] leading-relaxed text-soft">' + esc(tr(suspendu ? 'affiliation.suspended_text' : 'affiliation.refused_text')) + '</p>'
      + (me.reviewed_note ? '<p class="mt-3 rounded-xl border border-hairline bg-panel p-3 text-[13.5px] text-soft">' + esc(me.reviewed_note) + '</p>' : '')
      + '<p class="mt-3 text-[13px] text-soft">' + esc(tr('affiliation.contact_us')) + ' <a href="mailto:contact@iashark.com" class="text-cyan hover:underline">contact@iashark.com</a></p>') + '</div>';
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
    return '<div class="grid grid-cols-3 gap-2 text-center">'
      + '<div class="rounded-xl border border-hairline bg-panel p-3"><p class="text-[11.5px] uppercase tracking-wider text-soft">' + esc(tr('affiliation.bal_pending')) + '</p><p class="pa-kpi mt-1 text-[18px] font-extrabold">' + esc(money(b.pending, cur)) + '</p></div>'
      + '<div class="rounded-xl border border-hairline bg-panel p-3"><p class="text-[11.5px] uppercase tracking-wider text-soft">' + esc(tr('affiliation.bal_payable')) + '</p><p class="pa-kpi mt-1 text-[18px] font-extrabold text-cyan">' + esc(money(b.payable, cur)) + '</p></div>'
      + '<div class="rounded-xl border border-hairline bg-panel p-3"><p class="text-[11.5px] uppercase tracking-wider text-soft">' + esc(tr('affiliation.bal_paid')) + '</p><p class="pa-kpi mt-1 text-[18px] font-extrabold">' + esc(money(b.paid, cur)) + '</p></div>'
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
      connectBloc = '<p class="text-[14px] text-soft">' + esc(tr('affiliation.payout_ready_text')) + '</p>';
    } else if (me.has_stripe_account) {
      connectBloc = '<p class="text-[14px] text-soft">' + esc(tr('affiliation.payout_pending_text')) + '</p><div class="mt-4 flex flex-wrap gap-3">' + bouton('paConnect', tr('affiliation.payout_continue'), true) + bouton('paConnectStatus', tr('affiliation.payout_check'), false) + '</div>';
    } else {
      connectBloc = '<p class="text-[14px] text-soft">' + esc(tr('affiliation.payout_setup_text')) + '</p><div class="mt-4 flex flex-wrap gap-3">' + bouton('paConnect', tr('affiliation.payout_setup'), true) + '</div>';
    }
    app.hidden = false;
    app.innerHTML = '<div id="espace">' + titre(tr('affiliation.space_title'), tr('affiliation.space_help'))
      + '<div class="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">'
      + carte('<p class="text-[12px] font-semibold uppercase tracking-wider text-soft">' + esc(tr('affiliation.your_link')) + '</p>'
        + '<p class="mt-1 break-all text-[15px] font-semibold">' + esc(url) + '</p>'
        + '<div class="mt-3 flex flex-wrap gap-2">' + bouton('paCopyLink', tr('affiliation.copy'), true) + '</div>'
        + '<p class="mt-5 text-[12px] font-semibold uppercase tracking-wider text-soft">' + esc(tr('affiliation.your_code')) + '</p>'
        + '<p class="pa-code mt-1 text-[22px] font-extrabold">' + esc(me.code) + '</p>'
        + '<p class="mt-1 text-[12.5px] text-soft">' + esc(tr('affiliation.code_help')) + '</p>'
        + '<div class="mt-3 flex flex-wrap gap-2">' + bouton('paCopyCode', tr('affiliation.copy'), false) + '</div>')
      + carte('<p class="text-[12px] font-semibold uppercase tracking-wider text-soft">' + esc(tr('affiliation.qr')) + '</p><div id="paQr" class="mt-3"></div><p class="mt-2 text-[12.5px] text-soft">' + esc(tr('affiliation.qr_help')) + '</p>', 'text-center')
      + '</div>'
      + '<div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">'
      + kpi(tr('affiliation.k_clicks'), nombre(d.clicks && d.clicks.total), tr('affiliation.k_clicks_30', { n: nombre(d.clicks && d.clicks.days_30) }))
      + kpi(tr('affiliation.k_signups'), nombre(d.signups))
      + kpi(tr('affiliation.k_trials'), nombre(d.trials))
      + kpi(tr('affiliation.k_paying'), nombre(d.active_paying))
      + '</div>'
      + '<div class="mt-6">' + carte('<h3 class="text-[16px] font-bold">' + esc(tr('affiliation.balances_title')) + '</h3><p class="mt-1 text-[13px] text-soft">' + esc(tr('affiliation.balances_help')) + '</p>'
        + devises.map(function (c) { return '<div class="mt-4">' + (devises.length > 1 ? '<p class="mb-2 text-[12px] font-semibold uppercase text-soft">' + esc(String(c).toUpperCase()) + '</p>' : '') + ligneSolde(c, bal[c]) + '</div>'; }).join('')) + '</div>'
      + '<div class="mt-6">' + carte('<h3 class="text-[16px] font-bold">' + esc(tr('affiliation.payout_title')) + '</h3><div class="mt-2">' + connectBloc + '</div><p id="paConnectMsg" hidden></p>') + '</div>'
      + '<div class="mt-6">' + carte('<h3 class="text-[16px] font-bold">' + esc(tr('affiliation.history_title')) + '</h3>'
        + (hist.length ? '<div class="mt-3 overflow-x-auto"><table class="pa-table w-full text-left text-[13.5px]"><thead><tr class="text-[11.5px] uppercase tracking-wider text-soft"><th>' + esc(tr('affiliation.h_date')) + '</th><th>' + esc(tr('affiliation.h_customer')) + '</th><th>' + esc(tr('affiliation.h_amount')) + '</th><th>' + esc(tr('affiliation.h_status')) + '</th></tr></thead><tbody>'
          + hist.map(function (h) {
            var neg = h.kind === 'reversal';
            return '<tr><td class="whitespace-nowrap text-soft">' + esc(dateCourte(h.at)) + '</td><td>' + esc(h.customer || '—') + '</td><td class="pa-kpi whitespace-nowrap font-semibold' + (neg ? ' text-red-300' : '') + '">' + (neg ? '− ' : '') + esc(money(h.amount_cents, h.currency)) + '</td><td class="text-soft">' + esc(libelleStatut(h)) + (h.status === 'pending' && h.payable_at ? '<br><span class="text-[12px]">' + esc(tr('affiliation.payable_on', { date: dateCourte(h.payable_at) })) + '</span>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
          : '<p class="mt-2 text-[14px] text-soft">' + esc(tr('affiliation.history_empty')) + '</p>')) + '</div>'
      + '<div class="mt-6">' + carte('<h3 class="text-[16px] font-bold">' + esc(tr('affiliation.payouts_title')) + '</h3>'
        + (pays.length ? '<ul class="mt-3 space-y-2 text-[14px]">' + pays.map(function (p) { return '<li class="flex justify-between gap-3"><span class="text-soft">' + esc(dateCourte(p.at)) + (p.reference ? ' · ' + esc(p.reference) : '') + '</span><b class="pa-kpi">' + esc(money(p.amount_cents, p.currency)) + '</b></li>'; }).join('') + '</ul>'
          : '<p class="mt-2 text-[14px] text-soft">' + esc(tr('affiliation.payouts_empty')) + '</p>')) + '</div>'
      + '<div class="mt-6 grid gap-3 sm:grid-cols-2">'
      + carte('<h3 class="text-[16px] font-bold">' + esc(tr('affiliation.training_title')) + '</h3><p class="mt-1 text-[13.5px] text-soft">' + esc(tr('affiliation.training_text')) + '</p><div class="mt-3">' + bouton('', tr('affiliation.training_cta'), false, lien('partenaires-formation.html')) + '</div>')
      + carte('<h3 class="text-[16px] font-bold">' + esc(tr('affiliation.kit_title')) + '</h3><p class="mt-1 text-[13.5px] text-soft">' + esc(tr('affiliation.kit_text')) + '</p><div class="mt-3">' + bouton('', tr('affiliation.kit_cta'), false, lien('partenaires-kit.html')) + '</div>')
      + '</div>'
      + '<p class="mt-6 text-[12.5px] text-soft">' + esc(tr('affiliation.space_terms_note')) + ' <a href="' + esc(lien('partenaires-conditions.html')) + '" class="text-cyan hover:underline">' + esc(tr('affiliation.f_terms_link')) + '</a></p>'
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
  async function charger() {
    var r = await sb.rpc('affiliate_me');
    if (r.error) {
      var m = String(r.error.message || '');
      app.hidden = false;
      app.innerHTML = carte('<p class="text-[14px] text-soft">' + esc(/does not exist|PGRST202|42883/.test(m) ? tr('affiliation.err_not_open') : tr('affiliation.err_generic')) + '</p>');
      cta.innerHTML = '';
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
    if (!window.IasharkApp) { rendreCtaVisiteur(); return; }
    sb = window.IasharkApp.supabase;
    try { ctx = await window.IasharkApp.context(); } catch (e) { ctx = null; }
    if (!ctx || !ctx.user) { rendreCtaVisiteur(); return; }
    await charger();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
