/* BANDEAU DE PREUVES (demande de Clement du 26/10/2026) : en haut de l'accueil et des pages match, un bandeau
   qui defile avec les VRAIS resultats regles, gagnes en vert, perdus en rouge, dans l'ordre.

   Regles (non negociables, controle de l'avocat du diable du 21/10 repris de lib/bilan-hier.js) :
   - source unique : predictions_archive (resultat win / loss), et seulement les paris PUBLIES AVANT LE COUP
     D'ENVOI (published_at < kickoff_at : l'archive est verrouillee apres le coup d'envoi, migration 0035) ;
   - AUCUN TRI : les N derniers paris regles, par coup d'envoi du plus recent au plus ancien, gagnes et perdus
     melanges comme ils sont venus. Le compte affiche (« 24 gagnes, 16 perdus ») porte exactement sur ces N
     paris. Jamais de filtre par resultat, par cote ou par ligue ;
   - combines (Petit / Grand combine, table tickets_du_jour) : montres seulement quand TOUS leurs matchs sont
     regles par l'archive avec le MEME marche que le pari publie (sinon rien n'est devine). Un match perdu = combine
     perdu, comme chez un bookmaker ; un match annule sort du combine ;
   - Selection en or : meme regle, par jour, avec le nombre de paris gagnes et perdus ;
   - logos : identifiants d'equipes lus dans les matchs du run (et gardes d'un passage a l'autre, registre
     « equipes ») ; sans identifiant, pas de logo, jamais un logo devine.

   Module double : construireBandeau() (pipeline, tests node) ecrit preuves/bandeau.json ; monter() (navigateur)
   le lit apres le chargement de la page, sans rien bloquer. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (root) root.IasharkBandeauPreuves = api;
})(typeof window !== "undefined" ? window : null, function (G) {
  "use strict";

  var N_SIMPLES = 40;          // paris simples montres (et comptes)
  var JOURS_TICKETS = 7;       // combines et Selection en or regles des 7 derniers jours
  var JOURS_EQUIPES = 12;      // registre des logos : matchs des 12 derniers jours

  function texte(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }
  function cote(v) {
    var x = Number(String(v == null ? "" : v).replace(",", "."));
    return isFinite(x) && x > 1 ? Math.round(x * 100) / 100 : null;
  }
  function ms(v) { var t = Date.parse(v); return isFinite(t) ? t : null; }
  function idEquipe(v) { var n = Number(v); return isFinite(n) && n > 0 && n === Math.floor(n) ? n : null; }
  function publieAvant(r) {
    var p = ms(r && r.published_at), k = ms(r && r.kickoff_at);
    return p != null && k != null && p < k;
  }
  // Coup d'envoi « AAAA-MM-JJ HH:MM » (heure UTC des tickets) -> ISO.
  function isoTicket(v) {
    var s = texte(v);
    if (!s) return null;
    var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(s);
    return m ? m[1] + "T" + m[2] + ":00Z" : null;
  }

  // ---------------------------------------------------------------- construction (pipeline)
  // opts : { simples: lignes predictions_archive (type single), tickets: lignes tickets_du_jour (x5, x10, or),
  //          jambes: lignes predictions_archive des matchs des tickets, matchs: matchs du run (home.id, away.id),
  //          precedent: preuves/bandeau.json precedent, genereLe: ISO, maintenant: ms }
  function construireBandeau(opts) {
    var o = opts || {};
    var maintenant = typeof o.maintenant === "number" ? o.maintenant : Date.now();

    // Registre des identifiants d'equipes (logos) : precedent + matchs du run, purge apres JOURS_EQUIPES.
    var equipes = {};
    var prec = o.precedent && typeof o.precedent === "object" && o.precedent.equipes && typeof o.precedent.equipes === "object" ? o.precedent.equipes : {};
    Object.keys(prec).forEach(function (f) {
      var e = prec[f];
      if (Array.isArray(e) && e.length >= 3 && ms(e[2]) != null && maintenant - ms(e[2]) < JOURS_EQUIPES * 86400000) equipes[f] = [idEquipe(e[0]), idEquipe(e[1]), e[2]];
    });
    (Array.isArray(o.matchs) ? o.matchs : []).forEach(function (m) {
      if (!m || m.id == null) return;
      var hi = idEquipe(m.home && m.home.id), ai = idEquipe(m.away && m.away.id);
      var d = texte(m.date);
      var k = d ? d.replace(" ", "T") + (d.length <= 16 ? ":00Z" : "") : null;
      if ((hi || ai) && k && ms(k) != null) equipes[String(m.id)] = [hi, ai, k];
    });
    function logos(f) { var e = equipes[String(f)]; return e ? [e[0] || null, e[1] || null] : [null, null]; }

    // Index de l'archive (resultats des matchs des tickets) : meme marche, publie avant, regle.
    var archive = {};
    (Array.isArray(o.jambes) ? o.jambes : []).concat(Array.isArray(o.simples) ? o.simples : []).forEach(function (r) {
      if (r && r.fixture_id != null) archive[String(r.fixture_id)] = r;
    });
    function reglement(fixture, marche) {
      var r = archive[String(fixture)];
      if (!r || !publieAvant(r) || !marche || String(r.market) !== String(marche)) return null;
      return r.result === "win" || r.result === "loss" || r.result === "void" ? r.result : null;
    }

    // 1. Paris simples : les N derniers regles, sans tri par resultat.
    var simples = (Array.isArray(o.simples) ? o.simples : []).filter(function (r) {
      return r && r.fixture_id != null && (r.result === "win" || r.result === "loss") && publieAvant(r)
        && texte(r.home) && texte(r.away) && (texte(r.prediction) || texte(r.market)) && cote(r.cote);
    }).sort(function (a, b) {
      var d = ms(b.kickoff_at) - ms(a.kickoff_at);
      return d !== 0 ? d : Number(b.fixture_id) - Number(a.fixture_id);
    }).slice(0, N_SIMPLES).map(function (r) {
      var lg = logos(r.fixture_id);
      return { f: Number(r.fixture_id), k: new Date(ms(r.kickoff_at)).toISOString(), h: texte(r.home), a: texte(r.away), hi: lg[0], ai: lg[1],
        m: texte(r.market), p: texte(r.prediction), c: cote(r.cote), s: texte(r.score), r: r.result };
    });

    // 2. Combines et Selection en or regles des JOURS_TICKETS derniers jours.
    var depuis = maintenant - JOURS_TICKETS * 86400000;
    var combines = [], or = [];
    (Array.isArray(o.tickets) ? o.tickets : []).forEach(function (t) {
      if (!t || !texte(t.jour) || !t.contenu || typeof t.contenu !== "object") return;
      var liste = t.type === "or" ? t.contenu.paris : t.contenu.jambes;
      if (!Array.isArray(liste) || !liste.length) return;
      var res = liste.map(function (l) { return l ? reglement(l.fixture_id, l.market_id) : null; });
      if (res.some(function (x) { return x == null; })) return; // un match non regle (ou autre marche) : rien n'est montre
      var fin = null;
      // Coup d'envoi : coup_envoi_ms (exact) ; a defaut « AAAA-MM-JJ HH:MM » (heure de Paris, lu comme UTC : ordre seulement).
      liste.forEach(function (l) { var k = typeof l.coup_envoi_ms === "number" && isFinite(l.coup_envoi_ms) ? l.coup_envoi_ms : ms(isoTicket(l.coup_envoi)); if (k != null && (fin == null || k > fin)) fin = k; });
      if (fin == null || fin < depuis) return;
      var gagnes = res.filter(function (x) { return x === "win"; }).length, perdus = res.filter(function (x) { return x === "loss"; }).length;
      if (!gagnes && !perdus) return; // tout annule
      if (t.type === "x5" || t.type === "x10") {
        var c = cote((t.meta && t.meta.cote_totale) || t.contenu.cote_totale);
        combines.push({ t: t.type, j: texte(t.jour), k: new Date(fin).toISOString(), n: liste.length, c: c, r: perdus ? "loss" : "win" });
      } else if (t.type === "or") {
        or.push({ j: texte(t.jour), k: new Date(fin).toISOString(), n: liste.length, g: gagnes, p: perdus });
      }
    });
    combines.sort(function (a, b) { return a.k < b.k ? 1 : a.k > b.k ? -1 : 0; });
    or.sort(function (a, b) { return a.k < b.k ? 1 : a.k > b.k ? -1 : 0; });

    // Registre : seulement les matchs encore utiles (paris montres + matchs a venir du run).
    return {
      version: 1,
      genere_le: o.genereLe || new Date(maintenant).toISOString(),
      regle: "Les " + N_SIMPLES + " derniers paris regles de l'archive, publies avant le coup d'envoi, dans l'ordre des coups d'envoi, gagnes et perdus ; combines et Selection en or regles des " + JOURS_TICKETS + " derniers jours, quand tous leurs matchs sont regles.",
      simples: { n: simples.length, gagnes: simples.filter(function (s) { return s.r === "win"; }).length, perdus: simples.filter(function (s) { return s.r === "loss"; }).length, items: simples },
      combines: combines,
      or: or,
      equipes: equipes,
    };
  }

  // ---------------------------------------------------------------- affichage (navigateur)
  var CSS = ".bp{background:#0a1420;border-bottom:1px solid rgba(141,179,211,.14);min-height:90px;color:#f4f7fb;font-family:Inter,'DM Sans',system-ui,sans-serif}"
    + ".bp[hidden]{display:none}"
    + ".bp-tete{max-width:1120px;margin:0 auto;padding:8px 16px 0;font-size:12.5px;line-height:1.35;color:#91a0b3}"
    + ".bp-maj{display:block;font-size:11.5px;margin-top:1px}"
    + ".bp-tete b{color:#f4f7fb;font-weight:600}.bp-tete .bp-w{color:#34d399}.bp-tete .bp-l{color:#f87171}"
    + ".bp-piste{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 18px,#000 calc(100% - 18px),transparent);mask-image:linear-gradient(90deg,transparent,#000 18px,#000 calc(100% - 18px),transparent)}"
    + ".bp-rail{display:flex;width:max-content;padding:7px 16px 9px;animation:bp-defile var(--bp-duree,160s) linear infinite}"
    + ".bp-piste:hover .bp-rail,.bp-piste:focus-within .bp-rail,.bp-piste.bp-pause .bp-rail{animation-play-state:paused}"
    + "@keyframes bp-defile{to{transform:translateX(-50%)}}"
    + "@media (prefers-reduced-motion:reduce){.bp-rail{animation:none}.bp-piste{overflow-x:auto}.bp-double{display:none}}"
    + ".bp-it{display:flex;align-items:center;gap:7px;margin-right:8px;background:#0d1926;border:1px solid rgba(141,179,211,.14);border-radius:10px;padding:5px 9px 5px 7px;white-space:nowrap;font-size:13px;line-height:1.2}"
    + ".bp-lg{display:flex}.bp-lg img,.bp-lg i{width:18px;height:18px;border-radius:50%;background:#132233;display:block;object-fit:contain}"
    + ".bp-lg>*+*{margin-left:-5px}"
    + ".bp-m{color:#91a0b3}.bp-p{font-weight:600}.bp-c{font-variant-numeric:tabular-nums}"
    + ".bp-r{font-size:11.5px;font-weight:700;border-radius:6px;padding:2px 7px}"
    + ".bp-win .bp-r{color:#04150d;background:#34d399}.bp-loss .bp-r{color:#1d0606;background:#f87171}"
    + ".bp-t{color:#20d5ef;font-weight:700}"
    + ".bp-or .bp-g{color:#34d399;font-weight:700}.bp-or .bp-x{color:#f87171;font-weight:700}";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function t(cle, defaut) {
    try { var I = G && G.I18N; var v = I && typeof I.t === "function" ? I.t("bandeau_preuves." + cle, defaut) : null; return typeof v === "string" && v ? v : defaut; } catch (e) { return defaut; }
  }
  function tf(cle, defaut, vars) { return t(cle, defaut).replace(/\{(\w+)\}/g, function (_m, n) { return vars[n] == null ? "" : String(vars[n]); }); }
  function localeTag() { try { var I = G && G.I18N; return (I && typeof I.localeTag === "function" && I.localeTag()) || "fr-FR"; } catch (e) { return "fr-FR"; } }
  function nombre(c) {
    try { return Number(c).toLocaleString(localeTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { return String(c); }
  }
  // « 26/10 à 11 h 33 » (heure du visiteur, format de la langue de la page) ; date illisible : rien.
  function miseAJour(iso) {
    var t0 = ms(iso);
    if (t0 == null) return null;
    var d = new Date(t0);
    try {
      var jour = d.toLocaleDateString(localeTag(), { day: "2-digit", month: "2-digit" });
      var heure = d.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
      return tf("updated_at", "{jour} à {heure}", { jour: jour, heure: heure });
    } catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
  }
  function dateCourte(j) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j || ""); return m ? m[3] + "/" + m[2] : ""; }
  function logo(id) { return id ? '<img src="https://media.api-sports.io/football/teams/' + Number(id) + '.png" alt="" width="18" height="18" loading="lazy" decoding="async">' : "<i></i>"; }
  function libellePari(s) {
    var L = G && G.IasharkMarketLabels, eq = { home: s.h, away: s.a };
    try {
      if (L && s.m && typeof L.marketIdLabel === "function") { var a = L.marketIdLabel(s.m, eq); if (a && a !== s.m) return a; }
      if (L && s.p && typeof L.marketLabel === "function") { var b = L.marketLabel(s.p, eq); if (b) return b; }
    } catch (e) {}
    return s.p || s.m || "";
  }
  function resultat(r) { return r === "win" ? t("won", "Gagné") : t("lost", "Perdu"); }

  function html(d) {
    var S = d && d.simples && Array.isArray(d.simples.items) ? d.simples : null;
    if (!S || !S.items.length) return null;
    var items = [];
    S.items.forEach(function (s) {
      items.push({ k: s.k, h: '<span class="bp-it bp-' + (s.r === "win" ? "win" : "loss") + '"><span class="bp-lg">' + logo(s.hi) + logo(s.ai) + '</span><span class="bp-m">' + esc(s.h) + " – " + esc(s.a) + '</span><span class="bp-p">' + esc(libellePari(s)) + '</span><span class="bp-c">' + esc(nombre(s.c)) + '</span><span class="bp-r">' + esc(resultat(s.r)) + "</span></span>" });
    });
    (Array.isArray(d.combines) ? d.combines : []).forEach(function (c) {
      var nom = c.t === "x10" ? t("big_combo", "Grand combiné") : t("small_combo", "Petit combiné");
      items.push({ k: c.k, h: '<span class="bp-it bp-' + (c.r === "win" ? "win" : "loss") + '"><span class="bp-t">' + esc(nom) + '</span><span class="bp-m">' + esc(tf("of_day", "du {date}", { date: dateCourte(c.j) })) + " · " + esc(tf("matches", "{n} matchs", { n: c.n })) + '</span>' + (c.c ? '<span class="bp-c">' + esc(tf("odds", "cote {c}", { c: nombre(c.c) })) + "</span>" : "") + '<span class="bp-r">' + esc(resultat(c.r)) + "</span></span>" });
    });
    (Array.isArray(d.or) ? d.or : []).forEach(function (s) {
      items.push({ k: s.k, h: '<span class="bp-it bp-or"><span class="bp-t">' + esc(t("gold", "Sélection en or")) + '</span><span class="bp-m">' + esc(tf("of_day", "du {date}", { date: dateCourte(s.j) })) + '</span><span class="bp-g">' + esc(tf("won_n", "{n} gagnés", { n: s.g })) + '</span>' + (s.p ? '<span class="bp-x">' + esc(tf("lost_n", "{n} perdus", { n: s.p })) + "</span>" : "") + "</span>" });
    });
    items.sort(function (a, b) { return a.k < b.k ? 1 : a.k > b.k ? -1 : 0; });
    var rail = items.map(function (i) { return i.h; }).join("");
    var tete = '<b>' + esc(tf("summary", "Nos {n} derniers paris", { n: S.n })) + "</b> : "
      + '<b class="bp-w">' + esc(tf("won_n", "{n} gagnés", { n: S.gagnes })) + "</b>, "
      + '<b class="bp-l">' + esc(tf("lost_n", "{n} perdus", { n: S.perdus })) + "</b>";
    // Date de mise a jour (controle historique-public du 26/10/2026) : tiree de genere_le, jamais de l'horloge du
    // visiteur. Si la lecture de l'archive echoue, le calcul quotidien garde l'ancien fichier, donc l'ancienne date :
    // un bandeau en retard se voit.
    var maj = miseAJour(d.genere_le);
    if (maj) tete += '<span class="bp-maj">' + esc(tf("updated", "mis à jour le {date}", { date: maj })) + "</span>";
    return { tete: tete, rail: rail, n: items.length, maj: maj };
  }

  // el : conteneur (#bandeauPreuves). Lecture differee (jamais bloquante) ; sans fichier, le bandeau se replie.
  function monter(el, opts) {
    if (!el || !G || typeof G.fetch !== "function") return;
    var o = opts || {};
    var lancer = function () {
      G.fetch(o.url || "/preuves/bandeau.json", { cache: "no-cache" }).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (d) {
        var h = d ? html(d) : null;
        if (!h) { el.hidden = true; return; }
        if (!G.document.getElementById("bp-style")) { var st = G.document.createElement("style"); st.id = "bp-style"; st.textContent = CSS; G.document.head.appendChild(st); }
        el.innerHTML = '<p class="bp-tete">' + h.tete + '</p><div class="bp-piste" tabindex="0" aria-label="' + esc(t("aria", "Derniers résultats, gagnés et perdus")) + '"><div class="bp-rail" style="--bp-duree:' + Math.max(40, h.n * 4) + 's">' + h.rail + '<span class="bp-double" aria-hidden="true" style="display:contents">' + h.rail + "</span></div></div>";
        var piste = el.querySelector(".bp-piste");
        if (piste) piste.addEventListener("touchstart", function () { piste.classList.toggle("bp-pause"); }, { passive: true });
        el.hidden = false;
      }).catch(function () { el.hidden = true; });
    };
    var I = G.I18N;
    var pret = I && typeof I.init === "function" && !I.dict ? Promise.resolve().then(function () { return I.init(); }).catch(function () {}) : Promise.resolve();
    pret.then(function () {
      if (typeof G.requestIdleCallback === "function") G.requestIdleCallback(lancer, { timeout: 1500 });
      else G.setTimeout(lancer, 300);
    });
  }

  return { construireBandeau: construireBandeau, html: html, monter: monter, N_SIMPLES: N_SIMPLES, JOURS_TICKETS: JOURS_TICKETS };
});
