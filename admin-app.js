/* IASHARK — l'admin en appli (07/11/2026, demande de Clement : « une appli admin de monstre », « ultra clair quand
   quelqu'un se desabonne », notifications, reseaux, carte de qui est la, « je veux tout savoir »).
   S'appuie sur admin-dashboard.js (window.IasharkAdmin : connexion, donnees deja chargees) et ajoute :
   - l'installation sur le telephone (admin.webmanifest + admin-sw.js) et la barre d'onglets du bas ;
   - Aujourd'hui : la carte des personnes sur le site (ville approximative, jamais d'adresse) ;
   - Les gens : recherche, listes pretes, fiche complete d'une personne (admin_personne + parcours) ;
   - Argent : abonnes du moment et tout ce qui s'est passe (admin_abonnements) ;
   - Reseaux : abonnes Telegram / X / TikTok jour par jour (admin_reseaux) ;
   - Paris : les memes fichiers que le site (preuves/bandeau.json, preuves/bilan-hier.json) ;
   - Alertes : notifications sur le telephone (fonction admin-alertes).
   Seulement de vrais humains : robots, tests et comptes internes sont toujours retires. */
(function () {
  "use strict";
  if (typeof window === "undefined" || !document.getElementById("dash")) return;

  var VAPID_PUBLIC = "BE4t4SALSYvPdx7Yn7InoB2B8Ex5oAI3vMvQbyUarNr0mrC-jUetSi7if67xkSfzivjwhwINqOAoo8hy0BxVZr8";
  var TYPES = [
    ["pro", "Nouvel essai ou nouveau Pro"],
    ["paiement", "Paiement reçu"],
    ["arret", "Désabonnement demandé, abonné parti"],
    ["paiement_rate", "Paiement raté"],
    ["inscrit", "Nouvel inscrit"],
    ["telegram", "Telegram laissé"],
    ["panne", "Site en panne (et quand il remarche)"],
    ["foule", "Beaucoup de monde sur le site d'un coup"]
  ];
  var QUOI = {
    essai: { t: "A commencé un essai Pro", c: "bleu" },
    nouveau: { t: "Est passé Pro", c: "vert" },
    premier_paiement: { t: "Premier paiement", c: "vert" },
    paiement: { t: "A renouvelé", c: "vert" },
    paiement_rate: { t: "Paiement raté", c: "orange" },
    arret_demande: { t: "A demandé à arrêter", c: "rouge" },
    reprise: { t: "A annulé sa demande d'arrêt", c: "vert" },
    parti: { t: "Parti", c: "rouge" }
  };
  var E = { abo: null, aboErr: null, filtre: "tout", reseaux: null, reseauxErr: null, paris: null, parisErr: null, alertes: null,
    carte: null, couche: null, geo: null, geoFile: [], geoEnCours: false, liste: null, endpoint: null };

  function A() { return window.IasharkAdmin; }
  function esc(v) { return A().esc(v); }
  function $(id) { return document.getElementById(id); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function euros(c, devise) {
    if (c === null || c === undefined) return "—";
    var s = (num(c) / 100).toFixed(2).replace(".", ",").replace(",00", "");
    var d = String(devise || "EUR").toUpperCase();
    return s + " " + (d === "EUR" ? "€" : d === "GBP" ? "£" : d === "USD" ? "$" : d);
  }
  function jours(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }
  function depuisTxt(iso) {
    var j = jours(iso);
    return j === null ? "" : j === 0 ? "aujourd'hui" : j === 1 ? "hier" : "il y a " + j + " jours";
  }
  function quand(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return A().fmtDay(iso) + " à " + A().fmtTime(iso);
  }
  function mail(full, masked) { return A().S.showEmails ? (full || masked || "Adresse inconnue") : (masked || A().H.maskEmail(full) || "Adresse inconnue"); }
  function seul() { return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true; }
  function iphone() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }

  // ---------- Installation : service de l'appli ----------
  var swPret = null;
  if ("serviceWorker" in navigator) {
    // On attend que le service soit actif (sans dependre de navigator.serviceWorker.ready, qui ne repond jamais hors de /admin).
    swPret = navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin" }).then(function (reg) {
      if (reg.active) return reg;
      return new Promise(function (ok) {
        var sw = reg.installing || reg.waiting;
        if (!sw) { ok(reg); return; }
        sw.addEventListener("statechange", function () { if (sw.state === "activated") ok(reg); });
        setTimeout(function () { ok(reg); }, 6000);
      });
    }).catch(function () { return null; });
  }

  // ---------- Barre d'onglets ----------
  var ONGLET_DE = { aujourdhui: "aujourdhui", inscrits: "inscrits", argent: "argent", provenance: "provenance", paris: "paris" };
  function onglet(key) {
    var actif = ONGLET_DE[key] || "plus";
    Array.prototype.forEach.call(document.querySelectorAll("#tabbar a"), function (a) {
      if (a.getAttribute("data-screen-link") === actif) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  // =====================================================================================================
  // Carte : qui est la maintenant
  // =====================================================================================================
  var GEO_CLE = "iashark_admin_geo_v1";
  function geoCache() {
    if (E.geo) return E.geo;
    try { E.geo = JSON.parse(localStorage.getItem(GEO_CLE) || "{}") || {}; } catch (e) { E.geo = {}; }
    return E.geo;
  }
  function geoSauver() { try { localStorage.setItem(GEO_CLE, JSON.stringify(E.geo || {})); } catch (e) {} }
  function cleLieu(v) { return (v.city ? String(v.city).toLowerCase() + "|" : "") + String(v.country || "").toUpperCase(); }
  // Ville -> position, une demande par seconde au plus (regle d'OpenStreetMap), gardee sur cet appareil.
  function geocoder(apres) {
    if (E.geoEnCours || !E.geoFile.length) return;
    E.geoEnCours = true;
    var v = E.geoFile.shift(), cle = cleLieu(v), cache = geoCache();
    if (cache[cle]) { E.geoEnCours = false; geocoder(apres); return; }
    var q = "https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=fr"
      + (v.city ? "&city=" + encodeURIComponent(v.city) : "") + (v.country ? "&countrycodes=" + encodeURIComponent(String(v.country).toLowerCase()) : "")
      + (!v.city && v.country ? "&country=" + encodeURIComponent(v.country) : "");
    fetch(q, { headers: { Accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : []; }).then(function (d) {
      cache[cle] = d && d[0] ? [Number(d[0].lat), Number(d[0].lon)] : [0, 0, "x"];
      geoSauver();
    }).catch(function () {}).then(function () {
      setTimeout(function () { E.geoEnCours = false; apres(); geocoder(apres); }, 1100);
    });
  }
  var leafletPromesse = null;
  function leaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromesse) return leafletPromesse;
    leafletPromesse = new Promise(function (ok, ko) {
      var l = document.createElement("link");
      l.rel = "stylesheet"; l.href = "/assets/vendor/leaflet/leaflet.css";
      document.head.appendChild(l);
      var s = document.createElement("script");
      s.src = "/assets/vendor/leaflet/leaflet.js";
      s.onload = function () { ok(window.L); };
      s.onerror = ko;
      document.head.appendChild(s);
    });
    return leafletPromesse;
  }
  function carte(live) {
    var box = $("liveMap");
    if (!box || !live) return;
    var H = A().H;
    var humains = (live.visitors || []).filter(function (v) { return H.visitorKind(v).human; });
    leaflet().then(function (L) {
      if (!E.carte) {
        E.carte = L.map(box, { zoomControl: false, attributionControl: true, worldCopyJump: true, minZoom: 1 }).setView([30, 5], 2);
        // Fond OpenStreetMap (gratuit, sans cle), assombri en CSS (.live-map .leaflet-tile-pane).
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 12, attribution: "© OpenStreetMap"
        }).addTo(E.carte);
        E.carte.attributionControl.setPrefix(false);
        L.control.zoom({ position: "bottomright" }).addTo(E.carte);
        E.couche = L.layerGroup().addTo(E.carte);
      }
      var cache = geoCache(), groupes = {}, aChercher = [];
      humains.forEach(function (v) {
        var cle = cleLieu(v);
        if (!v.city && !v.country) return;
        (groupes[cle] = groupes[cle] || { v: v, gens: [] }).gens.push(v);
        if (!cache[cle]) aChercher.push(v);
      });
      E.couche.clearLayers();
      var points = [];
      Object.keys(groupes).forEach(function (cle) {
        var pos = cache[cle];
        if (!pos || pos[2] === "x") return;
        var g = groupes[cle], n = g.gens.length;
        var lignes = g.gens.slice(0, 8).map(function (v) {
          var info = H.pageInfo(v.page, v.match_id, A().S.names);
          return "<li>" + esc(info.name) + " · " + esc(H.deviceLabel(v.device)) + (v.source_group ? " · " + esc(v.source_group === "direct" ? "direct" : H.sourceLabel(v.source_group)) : "") + "</li>";
        }).join("");
        var m = L.circleMarker(pos, { radius: Math.min(22, 7 + n * 3), color: "#22d3ee", weight: 2, fillColor: "#22d3ee", fillOpacity: 0.35 });
        m.bindPopup("<b>" + esc(H.placeLabel(g.v)) + "</b><br>" + n + " personne" + (n > 1 ? "s" : "") + "<ul class='map-pop'>" + lignes + "</ul>");
        m.bindTooltip(esc((g.v.city || H.countryName(g.v.country)) + " · " + n), { direction: "top", offset: [0, -6] });
        E.couche.addLayer(m);
        points.push(pos);
      });
      if (points.length === 1) E.carte.setView(points[0], 5);
      else if (points.length > 1) E.carte.fitBounds(points, { padding: [30, 30], maxZoom: 6 });
      setTimeout(function () { E.carte.invalidateSize(); }, 50);
      if (aChercher.length) {
        aChercher.forEach(function (v) { if (!E.geoFile.some(function (x) { return cleLieu(x) === cleLieu(v); })) E.geoFile.push(v); });
        geocoder(function () { carte(A().S.live); });
      }
    }).catch(function () { box.hidden = true; });
  }

  // =====================================================================================================
  // Les gens : recherche, listes, fiche
  // =====================================================================================================
  function membres() { var S = A().S; return (S.members && S.members.data && S.members.data.members) || []; }
  function telegrams() { var S = A().S; return (S.telegram && S.telegram.data && S.telegram.data.lignes) || []; }
  function telegramDe(email) {
    var t = telegrams().filter(function (x) { return x.email && email && x.email.toLowerCase() === String(email).toLowerCase(); })[0];
    return t ? (t.sans_telegram ? "pas de Telegram" : t.pseudo) : null;
  }
  function vu(u) { return A().H.memberLastActivity(u) || u.last_activity_at || u.created_at; }
  function parisAujourdhui() { return A().H.parisToday(new Date()); }
  function ligneGens(u, extra) {
    var tg = telegramDe(u.email);
    var plan = u.plan === "pro" ? A().statusBadge(A().H.MEMBER_STATUS.pro) : A().statusBadge({ label: "Gratuit", cls: "new", help: "Compte gratuit" });
    return '<li class="g-row"><button type="button" class="g-open" data-fiche="' + esc(u.user_id) + '">'
      + '<span class="g-mail">' + esc(mail(u.email, u.email_masked)) + "</span>"
      + '<span class="g-meta">' + plan + "<span>" + esc(extra || ("vu " + depuisTxt(vu(u)))) + "</span>"
      + (tg ? "<span>" + esc(tg) + "</span>" : "") + "</span></button>"
      + (u.email ? '<button type="button" class="btn btn-ghost btn-sm g-copy" data-copie="' + esc(u.email) + '">Copier l\'adresse</button>' : "")
      + "</li>";
  }
  function listes() {
    var el = $("listes");
    if (!el) return;
    var list = membres();
    if (!list.length) { el.innerHTML = '<p class="soft-msg">Les listes apparaissent dès que la liste des inscrits est chargée.</p>'; return; }
    var today = parisAujourdhui(), H = A().H;
    var vieux = function (u) { return (jours(vu(u)) || 0) >= 7; };
    var en = (E.abo && E.abo.en_cours) || [];
    var parUid = {};
    list.forEach(function (u) { parUid[u.user_id] = u; });
    var depuisAbo = function (filtre, texte) {
      return en.filter(filtre).map(function (s) {
        var u = parUid[s.uid] || { user_id: s.uid, email: s.email, email_masked: s.email_masked, plan: "pro", created_at: s.debut };
        return { u: u, extra: texte(s) };
      });
    };
    var L = [
      { id: "relance", titre: "À relancer", sous: "Gratuits qui ont vu le prix ou cliqué pour payer, sans payer", c: "orange",
        gens: list.filter(function (u) { return u.plan !== "pro" && (u.saw_pricing || u.clicked_pay); })
          .map(function (u) { return { u: u, extra: (u.clicked_pay ? "a cliqué pour payer" : "a vu le prix") + " · vu " + depuisTxt(vu(u)) }; }) },
      { id: "arretent", titre: "Vont s'arrêter", sous: "Ont demandé à arrêter : encore Pro jusqu'à la fin de la période", c: "rouge",
        gens: depuisAbo(function (s) { return s.arret_prevu; }, function (s) { return (s.statut === "trialing" ? "essai" : "abonné") + " · fin " + depuisFin(s.fin_periode); }) },
      { id: "retard", titre: "Paiement raté", sous: "La banque a refusé le dernier paiement", c: "rouge",
        gens: depuisAbo(function (s) { return s.statut === "past_due" || s.statut === "unpaid"; }, function (s) { return "en retard " + depuisTxt(s.retard_depuis); }) },
      { id: "risque", titre: "Pro qui ne viennent plus", sous: "Pro pas revenus depuis 7 jours ou plus", c: "orange",
        gens: list.filter(function (u) { return u.plan === "pro" && vieux(u); }).map(function (u) { return { u: u, extra: "vu " + depuisTxt(vu(u)) }; }) },
      { id: "nouveaux", titre: "Nouveaux du jour", sous: "Comptes créés aujourd'hui", c: "vert",
        gens: list.filter(function (u) { return H.parisToday(new Date(u.created_at)) === today; }).map(function (u) { return { u: u, extra: "inscrit à " + A().fmtTime(u.created_at) }; }) },
      { id: "chauds", titre: "Très actifs", sous: "Venus au moins 4 jours sur les 7 derniers", c: "vert",
        gens: list.filter(function (u) { return num(u.active_days_7) >= 4; }).map(function (u) { return { u: u, extra: num(u.active_days_7) + " jours sur 7" }; }) }
    ];
    el.innerHTML = '<div class="l-grid">' + L.map(function (l) {
      var ouvert = E.liste === l.id;
      return '<section class="l-card ' + l.c + (ouvert ? " open" : "") + '">'
        + '<button type="button" class="l-head" data-liste="' + l.id + '" aria-expanded="' + ouvert + '"><b class="tnum">' + l.gens.length + "</b><span><strong>" + esc(l.titre) + "</strong><small>" + esc(l.sous) + "</small></span></button>"
        + (ouvert ? (l.gens.length ? '<ul class="g-list">' + l.gens.slice(0, 60).map(function (x) { return ligneGens(x.u, x.extra); }).join("") + "</ul>" : '<p class="soft-msg">Personne pour le moment.</p>') : "")
        + "</section>";
    }).join("") + "</div>";
  }
  function depuisFin(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return "date inconnue";
    var j = Math.ceil((t - Date.now()) / 86400000);
    return j <= 0 ? "aujourd'hui" : j === 1 ? "demain" : "dans " + j + " jours";
  }
  function chercher() {
    var q = String(($("chercheInput") || {}).value || "").trim().toLowerCase().replace(/^@/, "");
    var el = $("chercheRes");
    if (!el) return;
    if (q.length < 2) { el.innerHTML = ""; return; }
    var trouves = membres().filter(function (u) {
      var tg = String(telegramDe(u.email) || "").toLowerCase().replace(/^@/, "");
      return String(u.email || "").toLowerCase().indexOf(q) !== -1 || (tg && tg.indexOf(q) !== -1);
    });
    el.innerHTML = trouves.length ? '<ul class="g-list">' + trouves.slice(0, 30).map(function (u) { return ligneGens(u); }).join("") + "</ul>"
      : '<p class="soft-msg">Personne ne correspond. Seuls les comptes inscrits ont une fiche ; les visiteurs sans compte sont dans « Tous les visiteurs, un par un ».</p>';
  }

  // Fiche d'une personne
  function fait(label, valeur) { return '<div class="f-fact"><span>' + esc(label) + "</span><b>" + esc(valeur) + "</b></div>"; }
  function ouvrirFiche(uid) {
    var d = $("ficheDialog");
    if (!d || !uid) return;
    var u = membres().filter(function (x) { return x.user_id === uid; })[0] || { user_id: uid };
    $("ficheTitre").textContent = mail(u.email, u.email_masked);
    $("ficheBody").innerHTML = '<div class="skel skel-block"></div>';
    if (typeof d.showModal === "function") { if (!d.open) d.showModal(); } else d.setAttribute("open", "");
    Promise.all([A().rpc("admin_personne", { p_user: uid }), A().rpc("admin_member_journey", { p_user_id: uid, p_limit: 300 })]).then(function (res) {
      var p = res[0], j = res[1];
      if (!p.data) { A().blockError($("ficheBody"), p, "Fiche"); return; }
      A().S.journeys[uid] = j;
      var x = p.data, us = x.user || {}, sv = x.suivi || {};
      $("ficheTitre").textContent = mail(us.email, us.email_masked);
      var abo = (x.abonnements || [])[0];
      var etatAbo = !abo ? "Jamais essayé Pro" : abo.statut === "active" ? (abo.arret_prevu ? "Pro, s'arrête " + depuisFin(abo.fin_periode) : "Pro (paie)")
        : abo.statut === "trialing" ? (abo.arret_prevu ? "Essai, s'arrête " + depuisFin(abo.fin_periode) : "En essai, fin " + depuisFin(abo.fin_periode))
        : abo.statut === "past_due" ? "Paiement en retard" : abo.statut === "canceled" ? "Ancien Pro / essai arrêté" : abo.statut;
      var src = sv.premiere_source || {};
      var venu = src.utm_source ? src.utm_source + (src.utm_campaign ? " (" + src.utm_campaign + ")" : "") : src.ref ? src.ref : src.page ? "direct" : "inconnu";
      var tg = x.telegram ? (x.telegram.sans ? "N'a pas Telegram" : x.telegram.pseudo) : "Pas encore demandé";
      var html = '<div class="f-badges">' + (us.plan === "pro" ? A().statusBadge(A().H.MEMBER_STATUS.pro) : A().statusBadge({ label: "Gratuit", cls: "new", help: "Compte gratuit" }))
        + (us.refuse_suivi ? '<span class="badge">A refusé le suivi</span>' : "") + "</div>"
        + '<div class="f-facts">'
        + fait("Inscrit", us.inscrit_le ? quand(us.inscrit_le) : "—")
        + fait("Dernière visite", sv.derniere_visite ? quand(sv.derniere_visite) : "—")
        + fait("Abonnement", etatAbo)
        + fait("Venu la 1re fois par", venu)
        + fait("Visites", A().H.fmtInt(sv.visites))
        + fait("Pages vues", A().H.fmtInt(sv.pages))
        + fait("Temps passé (actif)", A().H.fmtDur(sv.temps_actif_sec))
        + fait("Matchs regardés", A().H.fmtInt(sv.matchs))
        + fait("Copies / partages", A().H.fmtInt(sv.copies) + " / " + A().H.fmtInt(sv.partages))
        + fait("Appareil", (sv.appareils || []).map(function (a) { return A().H.deviceLabel(a); }).join(", ") || "—")
        + fait("Villes", (sv.villes || []).join(" · ") || "—")
        + fait("Telegram", tg)
        + (us.parrain ? fait("Parrainé par", us.parrain) : "")
        + "</div>";
      var st = x.stripe || [];
      html += '<h3 class="f-h">Abonnement et paiements</h3>' + (st.length ? '<ol class="ev-list">' + st.map(function (e) {
        var q = QUOI[e.quoi] || { t: e.quoi, c: "" };
        return '<li class="ev-row ' + q.c + '"><span class="ev-dot" aria-hidden="true"></span><div><b>' + esc(q.t) + "</b>"
          + (e.montant_cents && e.quoi !== "essai" ? " · " + esc(euros(e.montant_cents, e.devise)) : "")
          + ((e.quoi === "arret_demande" || e.quoi === "parti") && e.raison ? '<span class="ev-raison">Raison : ' + esc(e.raison) + "</span>" : "")
          + (e.commentaire ? '<span class="ev-raison">« ' + esc(e.commentaire) + " »</span>" : "")
          + '<small>' + esc(quand(e.at)) + "</small></div></li>";
      }).join("") + "</ol>" : '<p class="soft-msg">Aucun essai ni paiement.</p>');
      var em = x.emails || [];
      html += '<h3 class="f-h">E-mails reçus</h3>' + (em.length ? '<ul class="f-mails">' + em.map(function (m) {
        return "<li><b>" + esc(m.campagne) + "</b><span>" + esc(m.envoye ? quand(m.envoye) : m.statut) + "</span><span>" + esc(m.clique ? "a cliqué" : m.ouvert ? "ouvert" : "pas ouvert") + "</span></li>";
      }).join("") + "</ul>" : '<p class="soft-msg">Aucun e-mail envoyé.</p>');
      html += '<h3 class="f-h">Son parcours, jour par jour</h3><div class="m-journey">' + A().journeyHtml({ user_id: uid, email: us.email, created_at: us.inscrit_le, plan: us.plan }) + "</div>";
      $("ficheBody").innerHTML = html;
    });
  }

  // =====================================================================================================
  // Argent (refait le 07/11/2026) : une seule source, admin_abonnements (comptes admin et de test retires).
  // Haut : composant 21st.dev « LED Dot Matrix Chart Card » (kedhareswer) transpose en HTML/SVG/CSS sans React :
  // un point par jour, allume de bas en haut, chiffre qui defile comme un compteur.
  // Prochains paiements : composant 21st.dev « Payments Table » (bundui) : avatar, prix, pastille de couleur, date.
  // =====================================================================================================
  var PAR_MOIS = { week: 52 / 12, month: 1, year: 1 / 12, day: 365 / 12 };
  var RYTHME = { week: "semaine", month: "mois", year: "an", day: "jour" };
  var MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var MOIS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function chargerAbonnements() {
    return A().rpc("admin_abonnements", { p_jours: 120 }).then(function (r) {
      E.abo = r.data || null;
      E.aboErr = r.data ? null : r;
      E.aboA = new Date();
      rendreAbonnes();
      listes();
      try { A().renderCards(); } catch (e) {}
    });
  }
  // « 41,57 € » ; les centimes ronds disparaissent (« 15 € »).
  function argent(c, devise) {
    var n = num(c) / 100, d = String(devise || "EUR").toUpperCase();
    var s = n.toLocaleString("fr-FR", { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 }).replace(/ | /g, " ");
    return s + " " + ({ EUR: "€", GBP: "£", USD: "$", ZAR: "R", MXN: "MX$" }[d] || d);
  }
  // Plusieurs devises : la principale d'abord, les autres a cote (« 41,57 € + 199 R »).
  function sommes(map) {
    var k = Object.keys(map).filter(function (d) { return map[d] > 0; }).sort(function (a, b) { return a === "EUR" ? -1 : b === "EUR" ? 1 : map[b] - map[a]; });
    return k.length ? k.map(function (d) { return argent(map[d], d); }) : [argent(0, "EUR")];
  }
  function ajoute(map, d, c) { d = String(d || "EUR").toUpperCase(); map[d] = (map[d] || 0) + num(c); }
  function parisJour(iso) { return A().H.parisToday(new Date(iso)); }
  function initiales(email) {
    var l = String(email || "?").replace(/@.*/, "").replace(/[^a-zA-Z]/g, "");
    return (l.slice(0, 2) || "?").toUpperCase();
  }
  var TEINTES = ["#20d5ef", "#a79ff0", "#34d399", "#fcc54d", "#fb8a8a", "#60a5fa", "#f0abfc"];
  function teinte(s) { var h = 0; String(s || "").split("").forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return TEINTES[h % TEINTES.length]; }
  // Chiffres qui roulent (meme principe que le composant : une bande 0-9 par chiffre, deplacee de -n em).
  function roule(texte) {
    return '<span class="ag-roule" aria-hidden="true">' + String(texte).split("").map(function (ch) {
      var d = ch.charCodeAt(0) - 48;
      if (d < 0 || d > 9) return "<span>" + (ch === " " ? "&nbsp;" : esc(ch)) + "</span>";
      return '<span class="ag-r"><span class="ag-bande" data-d="' + d + '">' + "0123456789".split("").map(function (n) { return "<span>" + n + "</span>"; }).join("") + "</span></span>";
    }).join("") + "</span>";
  }
  function lancerRoule(el) {
    if (!el) return;
    var fait = false, go = function () {
      if (fait) return; fait = true;
      Array.prototype.forEach.call(el.querySelectorAll(".ag-bande"), function (b) { b.style.transform = "translateY(-" + b.getAttribute("data-d") + "em)"; });
      el.classList.add("on");
    };
    requestAnimationFrame(function () { requestAnimationFrame(go); });
    setTimeout(go, 120); // page en arriere-plan : pas d'image dessinee, on pose quand meme les chiffres
    setTimeout(function () { go(); el.classList.add("fini"); }, 1000); // et si l'animation est en pause, les chiffres se posent net
  }
  // Le calcul, fait une seule fois, sert a l'ecran Argent ET a la carte « Chaque mois » d'Aujourd'hui.
  function calculArgent() {
    var en = (E.abo && E.abo.en_cours) || [], mensuel = {}, potentiel = {}, c = { paient: 0, essai: 0, partent: 0, rate: 0 };
    en.forEach(function (s) {
      var m = num(s.montant_cents) * (PAR_MOIS[s.rythme] || 1);
      if (s.statut === "past_due" || s.statut === "unpaid") { c.rate++; return; }
      if (s.arret_prevu) { c.partent++; return; }
      if (s.statut === "active") { c.paient++; ajoute(mensuel, s.devise, m); ajoute(potentiel, s.devise, m); }
      else if (s.statut === "trialing") { c.essai++; ajoute(potentiel, s.devise, m); }
    });
    return { mensuel: mensuel, potentiel: potentiel, compte: c, en: en };
  }
  function rendreAbonnes() {
    var led = $("argentLed"), tu = $("argentTuiles"), pr = $("argentProchains"), mv = $("mouvements");
    if (!led || !mv) return;
    if (!E.abo) { A().blockError(led, E.aboErr, "L'argent"); if (tu) tu.innerHTML = ""; if (pr) pr.innerHTML = ""; mv.innerHTML = ""; return; }
    var evs = E.abo.evenements || [], enc = E.abo.encaisse || [], K = calculArgent();
    var H = A().H, today = H.parisToday(new Date());

    // ---------- 1. Argent recu, jour par jour (LED) ----------
    var NJ = 42, jours42 = [];
    for (var i = NJ - 1; i >= 0; i--) jours42.push(H.addDays(today, -i));
    var parJour = {};
    evs.forEach(function (x) {
      if ((x.quoi === "premier_paiement" || x.quoi === "paiement") && String(x.devise || "EUR").toUpperCase() === "EUR") {
        var j = parisJour(x.at); parJour[j] = (parJour[j] || 0) + num(x.montant_cents);
      }
    });
    var vals = jours42.map(function (j) { return parJour[j] || 0; });
    var total42 = vals.reduce(function (a, b) { return a + b; }, 0);
    var tot = {}, mois = {}, auj = {};
    enc.forEach(function (r) { ajoute(tot, r.devise, r.total_cents); ajoute(mois, r.devise, r.mois_cents); ajoute(auj, r.devise, r.aujourdhui_cents); });
    var ROWS = 8, max = Math.max.apply(null, vals.concat([0]));
    var niveaux = vals.map(function (v) { return max <= 0 || v <= 0 ? 0 : Math.max(1, Math.round(v / max * ROWS)); });
    var W = NJ * 10, Hh = ROWS * 10, svg = "";
    niveaux.forEach(function (lv, c) {
      svg += '<g class="ag-col" data-c="' + c + '">';
      for (var r = 0; r < ROWS; r++) {
        var bas = ROWS - 1 - r, allume = bas < lv, haut = allume && bas === lv - 1;
        svg += '<circle cx="' + (c * 10 + 5) + '" cy="' + (r * 10 + 5) + '" r="2.7" class="ag-dot' + (allume ? " ag-lit" : "") + (haut ? " ag-top" : "") + '" style="--c:' + c + ";--r:" + bas + '"/>';
      }
      svg += '<rect class="ag-hit" x="' + c * 10 + '" y="0" width="10" height="' + Hh + '"/></g>';
    });
    var jourTxt = function (j) { var p = j.split("-"); return Number(p[2]) + " " + MOIS_COURT[Number(p[1]) - 1]; };
    var moisNom = MOIS_LONG[Number(today.slice(5, 7)) - 1];
    var aMaj = E.aboA ? A().fmtTime(E.aboA.toISOString()) : "";
    led.innerHTML = '<article class="ag-led">'
      + '<div class="ag-led-tete"><div class="ag-id"><span class="ag-puce" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 20V12M12 20V5M19 20v-9"/></svg></span>'
      + '<div><h2 class="ag-titre">Argent reçu</h2><p class="ag-cap">Jour par jour, 6 dernières semaines</p></div></div>'
      + '<div class="ag-somme"><div class="ag-gros"><span class="sr">' + esc(argent(total42, "EUR")) + "</span>" + roule(argent(total42, "EUR")) + "</div>"
      + '<div class="ag-delta"><span class="ag-pill ' + (num(mois.EUR) > 0 ? "up" : "") + '">' + esc("+" + sommes(mois).join(" + ")) + "</span>en " + esc(moisNom) + "</div></div></div>"
      + '<div class="ag-plot" tabindex="0" role="img" aria-label="' + esc("Argent reçu par jour : " + jours42.filter(function (j, k) { return vals[k] > 0; }).map(function (j) { return jourTxt(j) + " " + argent(parJour[j], "EUR"); }).join(", ") || "aucun paiement sur 6 semaines") + '">'
      + '<svg class="ag-svg" viewBox="0 0 ' + W + " " + Hh + '" preserveAspectRatio="none" aria-hidden="true">' + svg + "</svg>"
      + '<div class="ag-guide"></div><div class="ag-tip"><div class="ag-tip-d"></div><div class="ag-tip-v"></div></div></div>'
      + '<div class="ag-axe" aria-hidden="true"><span>' + esc(jourTxt(jours42[0])) + "</span><span>" + esc(jourTxt(jours42[NJ >> 1])) + "</span><span>aujourd'hui</span></div>"
      + '<div class="ag-pied"><span>Depuis le début : <b>' + esc(sommes(tot).join(" + ")) + "</b></span>"
      + '<button type="button" class="ag-maj" id="agMaj">À jour à ' + esc(aMaj) + " · Actualiser</button></div></article>";
    var plot = led.querySelector(".ag-plot"), ledCarte = led.querySelector(".ag-led");
    var montrer = function (c) {
      if (c < 0) { ledCarte.classList.remove("hot"); return; }
      ledCarte.classList.add("hot");
      Array.prototype.forEach.call(plot.querySelectorAll(".ag-col"), function (g) {
        var k = Number(g.getAttribute("data-c"));
        g.classList.toggle("act", k === c); g.classList.toggle("near", Math.abs(k - c) === 1);
      });
      var gauche = (c + 0.5) / NJ * 100, haut = Math.min(Math.max((1 - niveaux[c] / ROWS) * 100 + 50 / ROWS, 18), 82);
      plot.querySelector(".ag-guide").style.left = gauche + "%";
      var tip = plot.querySelector(".ag-tip");
      tip.style.left = gauche + "%"; tip.style.top = haut + "%";
      tip.classList.toggle("flip", c > NJ * 0.6);
      tip.querySelector(".ag-tip-d").textContent = c === NJ - 1 ? "Aujourd'hui" : jourTxt(jours42[c]);
      tip.querySelector(".ag-tip-v").textContent = vals[c] ? "+" + argent(vals[c], "EUR") : "Aucun paiement";
    };
    var colDe = function (e) { var r = plot.getBoundingClientRect(); return Math.min(NJ - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * NJ))); };
    var actif = -1;
    plot.addEventListener("pointermove", function (e) { actif = colDe(e); montrer(actif); });
    plot.addEventListener("pointerdown", function (e) { actif = colDe(e); montrer(actif); });
    plot.addEventListener("pointerleave", function () { actif = -1; montrer(-1); });
    plot.addEventListener("blur", function () { actif = -1; montrer(-1); });
    plot.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); actif = Math.min(NJ - 1, Math.max(0, (actif < 0 ? (e.key === "ArrowRight" ? -1 : NJ) : actif) + (e.key === "ArrowRight" ? 1 : -1))); montrer(actif); }
      else if (e.key === "Escape") { actif = -1; montrer(-1); }
    });
    requestAnimationFrame(function () { requestAnimationFrame(function () { ledCarte.classList.add("on"); }); });
    setTimeout(function () { ledCarte.classList.add("on"); }, 120);
    setTimeout(function () { ledCarte.classList.add("fini"); }, 1600);
    lancerRoule(led.querySelector(".ag-gros"));

    // ---------- 2. Trois tuiles ----------
    var c = K.compte, pm = sommes(K.mensuel), pot = sommes(K.potentiel);
    var eurM = num(K.mensuel.EUR), eurP = Math.max(num(K.potentiel.EUR), 1);
    var tot4 = Math.max(1, c.paient + c.essai + c.partent + c.rate);
    var seg = function (n, cls) { return n ? '<i class="' + cls + '" style="flex:' + n + '"></i>' : ""; };
    var parMoisL = (E.abo.par_mois || []).filter(function (m) { return String(m.devise).toUpperCase() === "EUR"; });
    var moisListe = [];
    for (var m = 2; m >= 0; m--) {
      var d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - m, 1);
      moisListe.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
    }
    var moisVal = moisListe.map(function (k) { var x = parMoisL.filter(function (p) { return p.mois === k; })[0]; return x ? num(x.cents) : 0; });
    var moisMax = Math.max.apply(null, moisVal.concat([1]));
    tu.innerHTML = '<article class="ag-tuile t-mois"><h3>Chaque mois</h3><b class="ag-num">' + esc(pm[0]) + "</b>"
      + (pm.length > 1 ? '<small class="ag-autre">' + esc("+ " + pm.slice(1).join(" + ")) + "</small>" : "")
      + '<p>Ce que paient en ce moment tes ' + c.paient + " abonné" + (c.paient > 1 ? "s" : "") + ", ramené au mois.</p>"
      + '<div class="ag-jauge" aria-hidden="true"><i style="width:' + Math.round(eurM / eurP * 100) + '%"></i></div>'
      + '<p class="ag-si">' + (c.essai ? "Si les " + c.essai + " essai" + (c.essai > 1 ? "s" : "") + " paient : <b>" + esc(pot[0]) + "</b> par mois" : "Aucun essai en cours") + "</p></article>"
      + '<article class="ag-tuile t-gens"><h3>Tes abonnés</h3><b class="ag-num">' + (c.paient + c.essai + c.partent + c.rate) + "</b>"
      + '<div class="ag-pile" aria-hidden="true">' + seg(c.paient, "v") + seg(c.essai, "b") + seg(c.partent, "r") + seg(c.rate, "o") + "</div>"
      + '<ul class="ag-leg"><li><i class="v"></i><b>' + c.paient + "</b> paient</li><li><i class=\"b\"></i><b>" + c.essai + "</b> en essai gratuit</li>"
      + '<li><i class="r"></i><b>' + c.partent + "</b> vont partir</li><li><i class=\"o\"></i><b>" + c.rate + "</b> paiement raté</li></ul></article>"
      + '<article class="ag-tuile t-recu"><h3>Reçu en ' + esc(moisNom) + '</h3><b class="ag-num">' + esc(sommes(mois)[0]) + "</b>"
      + '<p>' + (num(auj.EUR) ? esc(argent(auj.EUR, "EUR")) + " aujourd'hui" : "Rien encore aujourd'hui") + "</p>"
      + '<div class="ag-barres" aria-hidden="true">' + moisListe.map(function (k, idx) {
        return '<div class="ag-barre' + (idx === 2 ? " cur" : "") + '"><span class="ag-bv">' + esc(argent(moisVal[idx], "EUR")) + '</span><i style="height:' + Math.max(4, Math.round(moisVal[idx] / moisMax * 56)) + 'px"></i><span class="ag-bm">' + esc(MOIS_COURT[Number(k.slice(5, 7)) - 1]) + "</span></div>";
      }).join("") + "</div></article>";

    // ---------- 3. Prochains paiements ----------
    var lignes = K.en.slice().sort(function (a, b) { return Date.parse(a.fin_periode || 0) - Date.parse(b.fin_periode || 0); });
    var attendu = {};
    var statut = function (s) {
      if (s.statut === "past_due" || s.statut === "unpaid") return ["o", "Paiement raté"];
      if (s.arret_prevu) return ["r", s.statut === "trialing" ? "A dit stop pendant l'essai" : "A dit stop"];
      if (s.statut === "trialing") return ["b", "Fin d'essai : 1er paiement"];
      return ["v", "Renouvellement"];
    };
    var quandTxt = function (iso) {
      if (!iso) return ["—", ""];
      var j = parisJour(iso), diff = Math.round((Date.parse(j + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000);
      var p = j.split("-"), date = Number(p[2]) + " " + MOIS_COURT[Number(p[1]) - 1];
      var heure = A().fmtTime(iso);
      if (diff < 0) return ["passé", date];
      if (diff === 0) return ["aujourd'hui", heure];
      if (diff === 1) return ["demain", heure];
      return ["dans " + diff + " j", date];
    };
    if (!lignes.length) pr.innerHTML = A().emptyHtml("Aucun abonnement en cours", "Les prochains paiements apparaîtront ici.");
    else {
      pr.innerHTML = '<table class="ag-table"><thead><tr><th>Personne</th><th>Quand</th><th class="ag-r-num">Montant</th><th>Statut</th></tr></thead><tbody>'
        + lignes.map(function (s) {
          var st = statut(s), q = quandTxt(s.fin_periode), paiera = st[0] === "v" || st[0] === "b";
          if (paiera) ajoute(attendu, s.devise, s.montant_cents);
          var em = mail(s.email, s.email_masked);
          return '<tr data-fiche="' + esc(s.uid || "") + '" tabindex="0"><td><div class="ag-qui"><span class="ag-av" style="--t:' + teinte(s.email || s.uid) + '">' + esc(initiales(s.email || s.email_masked)) + "</span>"
            + '<span><b>' + esc(em) + "</b><small>" + esc(argent(s.montant_cents, s.devise) + " par " + (RYTHME[s.rythme] || "mois")) + "</small></span></div></td>"
            + '<td><b class="ag-q">' + esc(q[0]) + "</b><small>" + esc(q[1]) + "</small></td>"
            + '<td class="ag-r-num"><span class="ag-mt' + (paiera ? "" : " barre") + '">' + esc(argent(s.montant_cents, s.devise)) + "</span></td>"
            + '<td><span class="ag-badge ' + st[0] + '">' + esc(st[1]) + "</span></td></tr>";
        }).join("") + "</tbody></table>"
        + '<p class="ag-total">Si tout passe : <b>' + esc(sommes(attendu).join(" + ")) + "</b> à recevoir d'ici le " + esc(quandTxt(lignes[lignes.length - 1].fin_periode)[1] || "") + ".</p>";
    }

    // ---------- 4. Ce qui s'est passe ----------
    var f = E.filtre;
    var garde = { tout: null, departs: ["arret_demande", "parti", "reprise"], paiements: ["premier_paiement", "paiement", "paiement_rate"], essais: ["essai", "nouveau"] }[f];
    var list = evs.filter(function (x) { return !garde || garde.indexOf(x.quoi) !== -1; });
    Array.prototype.forEach.call(document.querySelectorAll("#mouvFiltre button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-f") === f)); });
    if (!list.length) { mv.innerHTML = A().emptyHtml("Rien sur cette période", "Chaque essai, paiement et départ apparaîtra ici."); return; }
    var ICO = { vert: "M5 12l5 5L20 7", bleu: "M12 5v14M5 12h14", rouge: "M6 6l12 12M18 6L6 18", orange: "M12 7v6M12 17h.01" };
    mv.innerHTML = '<ol class="ag-ev">' + list.slice(0, 120).map(function (x) {
      var q = QUOI[x.quoi] || { t: x.quoi, c: "" };
      var j = x.debut ? jours(x.debut) : null;
      var details = [];
      if (x.quoi === "arret_demande" || x.quoi === "parti") {
        if (j !== null) details.push("après " + j + " j " + (x.essai ? "d'essai" : "d'abonnement"));
        details.push(x.paye_cents ? "a payé " + argent(x.paye_cents, x.devise) + " au total" : "n'a jamais payé");
      }
      if (x.quoi === "essai" && x.montant_cents) details.push("puis " + argent(x.montant_cents, x.devise) + " si il garde");
      var montant = (x.quoi === "premier_paiement" || x.quoi === "paiement") && x.montant_cents ? "+" + argent(x.montant_cents, x.devise) : "";
      return '<li class="ag-ev-l ' + q.c + '"><span class="ag-ev-i" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="' + (ICO[q.c] || ICO.bleu) + '"/></svg></span>'
        + '<div class="ag-ev-c"><div class="ag-ev-h"><b>' + esc(q.t) + "</b>" + (montant ? '<span class="ag-ev-m">' + esc(montant) + "</span>" : "") + "</div>"
        + '<button type="button" class="ev-qui" data-fiche="' + esc(x.uid || "") + '">' + esc(mail(x.email, x.email_masked)) + "</button>"
        + (details.length ? '<span class="ev-det">' + esc(details.join(" · ")) + "</span>" : "")
        + ((x.quoi === "arret_demande" || x.quoi === "parti") ? '<span class="ev-raison">' + esc(x.raison ? "Raison : " + x.raison : "Pas de raison donnée") + "</span>" : "")
        + (x.commentaire ? '<span class="ev-raison">« ' + esc(x.commentaire) + " »</span>" : "")
        + "<small>" + esc(quand(x.at)) + "</small></div></li>";
    }).join("") + "</ol>";
  }

  // =====================================================================================================
  // Reseaux : abonnes jour par jour
  // =====================================================================================================
  var RESEAUX = [["telegram", "Telegram", "Chaîne gratuite"], ["x", "X", "Compte X"], ["tiktok", "TikTok", "@iashark_data"]];
  function chargerReseaux() {
    return A().rpc("admin_reseaux", { p_jours: 120 }).then(function (r) { E.reseaux = r.data || null; E.reseauxErr = r.data ? null : r; rendreReseaux(); });
  }
  function courbe(points) {
    if (points.length < 2) return "";
    var w = 260, h = 56, min = Math.min.apply(null, points), max = Math.max.apply(null, points), span = Math.max(1, max - min);
    var d = points.map(function (v, i) { return (i ? "L" : "M") + (i * w / (points.length - 1)).toFixed(1) + "," + (h - 4 - (v - min) / span * (h - 8)).toFixed(1); }).join("");
    return '<svg class="r-courbe" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  function rendreReseaux() {
    var el = $("reseauxAbos");
    if (!el) return;
    if (!E.reseaux) { A().blockError(el, E.reseauxErr, "Tes abonnés"); return; }
    var series = E.reseaux.series || [];
    el.innerHTML = '<div class="r-grid">' + RESEAUX.map(function (r) {
      var pts = series.filter(function (s) { return s.reseau === r[0]; });
      if (!pts.length) return '<article class="r-card"><h3>' + esc(r[1]) + "</h3><p class=\"soft-msg\">Premier relevé en cours.</p></article>";
      var der = pts[pts.length - 1], val = num(der.abonnes);
      var ecart = function (j) {
        var lim = new Date(Date.parse(der.jour) - j * 86400000).toISOString().slice(0, 10);
        var avant = pts.filter(function (p) { return p.jour <= lim; }).pop();
        if (!avant) return null;
        return val - num(avant.abonnes);
      };
      var e1 = ecart(1), e7 = ecart(7);
      var signe = function (n) { return n === null ? "—" : (n > 0 ? "+" : "") + n; };
      return '<article class="r-card"><div class="r-top"><h3>' + esc(r[1]) + "</h3><span>" + esc(r[2]) + '</span></div><b class="r-val tnum">' + A().H.fmtInt(val)
        + '</b><p class="r-delta"><span class="' + (e1 > 0 ? "up" : e1 < 0 ? "down" : "") + '">' + esc(signe(e1)) + " en 1 jour</span><span class=\"" + (e7 > 0 ? "up" : e7 < 0 ? "down" : "") + '">' + esc(signe(e7)) + " en 7 jours</span></p>"
        + courbe(pts.map(function (p) { return num(p.abonnes); })) + '<small>Relevé du ' + esc(A().H.shortDay(der.jour)) + " · depuis le " + esc(A().H.shortDay(pts[0].jour)) + "</small></article>";
    }).join("") + "</div>";
  }

  // =====================================================================================================
  // Paris : les memes fichiers que le site
  // =====================================================================================================
  var RES = { win: ["Gagné", "vert"], loss: ["Perdu", "rouge"], void: ["Annulé", ""] };
  function chargerParis() {
    var get = function (u) { return fetch(u, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    return Promise.all([get("/preuves/bandeau.json"), get("/preuves/bilan-hier.json")]).then(function (r) { E.paris = { bandeau: r[0], hier: r[1] }; rendreParis(); });
  }
  function rendreParis() {
    var el = $("paris");
    if (!el || !E.paris) return;
    var b = E.paris.bandeau, h = E.paris.hier;
    if (!b) { el.innerHTML = A().emptyHtml("Résultats indisponibles", "Le fichier des résultats du site n'a pas pu être lu. Réessaie dans un instant."); return; }
    var c = b.compte || {}, g = num(c.gagnes), p = num(c.perdus);
    var hs = h && h.paris_simples;
    var html = '<div class="cards">'
      + kcard("green", "Depuis le " + A().H.shortDay(c.depuis || ""), g + " gagnés", esc(p + " perdus · " + (g + p ? Math.round(g / (g + p) * 100) : 0) + " % gagnés"))
      + (hs ? kcard("", "Hier (" + A().H.shortDay(hs.jour) + ")", num(hs.gagnes) + " gagnés", esc(num(hs.perdus) + " perdus · " + num(hs.annules) + " annulés" + (num(hs.en_attente) ? " · " + num(hs.en_attente) + " en attente" : ""))) : "")
      + "</div>";
    var cmb = (b.combines || []).slice(0, 10), or = (b.or || []).slice(0, 7);
    html += '<section class="card section"><div class="card-head"><div><h3 class="card-title">Combinés des 7 derniers jours</h3><p class="card-sub">Ticket ×5 gratuit et ×10 Pro</p></div></div>'
      + (cmb.length ? '<ul class="p-list">' + cmb.map(function (x) {
        var r = RES[x.r] || ["En cours", ""];
        return '<li class="p-row ' + r[1] + '"><span>' + esc(A().H.shortDay(x.j)) + " · " + esc(x.t === "x10" ? "Ticket ×10" : "Ticket ×5") + " · " + esc(x.n + " matchs") + '</span><span class="tnum">cote ' + esc(String(x.c).replace(".", ",")) + '</span><b>' + esc(r[0]) + "</b></li>";
      }).join("") + "</ul>" : A().emptyHtml("Aucun combiné", "")) + "</section>";
    html += '<section class="card section"><div class="card-head"><div><h3 class="card-title">Sélection en or</h3><p class="card-sub">Paris gagnés sur le nombre de paris, par jour</p></div></div>'
      + (or.length ? '<ul class="p-list">' + or.map(function (x) {
        return '<li class="p-row ' + (x.p ? (x.g ? "" : "rouge") : "vert") + '"><span>' + esc(A().H.shortDay(x.j)) + '</span><span class="tnum">' + esc(x.g + " sur " + x.n) + "</span><b>" + esc(x.p ? x.p + " perdu" + (x.p > 1 ? "s" : "") : "tout gagné") + "</b></li>";
      }).join("") + "</ul>" : A().emptyHtml("Aucune sélection", "")) + "</section>";
    var simples = ((b.simples && b.simples.items) || []).slice(0, 40);
    html += '<section class="card section"><div class="card-head"><div><h3 class="card-title">Les 40 derniers paris simples</h3><p class="card-sub">Publiés avant le match, du plus récent au plus ancien</p></div></div>'
      + (simples.length ? '<ul class="p-list">' + simples.map(function (x) {
        var r = RES[x.r] || ["En cours", ""];
        return '<li class="p-row ' + r[1] + '"><span>' + esc(x.h + " – " + x.a) + "<small>" + esc(x.p + " · " + A().fmtDay(x.k)) + '</small></span><span class="tnum">' + esc((x.s || "") + " · " + String(x.c).replace(".", ",")) + "</span><b>" + esc(r[0]) + "</b></li>";
      }).join("") + "</ul>" : A().emptyHtml("Aucun pari réglé", "")) + "</section>";
    html += '<p class="note">Mêmes chiffres que la bande des résultats du site, calculés chaque matin (dernier calcul : ' + esc(b.genere_le ? quand(b.genere_le) : "—") + ").</p>";
    el.innerHTML = html;
  }

  // =====================================================================================================
  // Alertes : notifications sur le telephone
  // =====================================================================================================
  function b64(s) {
    var p = "=".repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function abonnementPush() {
    if (!swPret || !("PushManager" in window)) return Promise.resolve(null);
    return swPret.then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; }).catch(function () { return null; });
  }
  function chargerAlertes() {
    return abonnementPush().then(function (sub) {
      E.endpoint = sub ? sub.endpoint : null;
      return A().rpc("admin_alertes_liste", { p_endpoint: E.endpoint, p_limit: 40 });
    }).then(function (r) { E.alertes = r; rendreAlertes(); });
  }
  function rendreAlertes() {
    var el = $("alertes");
    if (!el) return;
    var r = E.alertes;
    if (r && !r.data) { A().blockError(el, r, "Alertes"); return; }
    var d = (r && r.data) || {}, moi = d.ce_telephone, types = (moi && moi.types) || TYPES.map(function (t) { return t[0]; });
    var html = "";
    var push = "PushManager" in window && "serviceWorker" in navigator;
    if (iphone() && !seul()) {
      html += '<section class="card section al-install"><h3 class="card-title">D\'abord : installe l\'appli sur ton iPhone</h3>'
        + '<p class="card-sub">Sur iPhone, les notifications ne marchent que depuis l\'icône sur l\'écran d\'accueil.</p>'
        + '<ol class="al-steps"><li>Ouvre cette page dans <b>Safari</b>.</li><li>Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut, en bas de l\'écran).</li><li>Choisis <b>Sur l\'écran d\'accueil</b>, puis <b>Ajouter</b>.</li><li>Ouvre l\'icône <b>IASHARK</b> qui vient d\'apparaître, connecte-toi, et reviens sur Alertes.</li></ol></section>';
    } else if (!push) {
      html += '<section class="card section"><p class="soft-msg">Ce navigateur ne sait pas recevoir de notifications. Sur Android, utilise Chrome ; sur iPhone, installe l\'appli (Safari, Partager, Sur l\'écran d\'accueil).</p></section>';
    }
    if (push && !(iphone() && !seul())) {
      var actif = !!moi && typeof Notification !== "undefined" && Notification.permission === "granted";
      html += '<section class="card section"><div class="card-head"><div><h3 class="card-title">' + (actif ? "Les notifications sont activées sur ce téléphone" : "Activer les notifications sur ce téléphone") + '</h3>'
        + '<p class="card-sub">' + esc(actif ? "Coche ce que tu veux recevoir. " + (d.telephones > 1 ? d.telephones + " appareils reçoivent les alertes." : "") : "Ton téléphone va te demander l'autorisation : réponds Autoriser.") + "</p></div></div>"
        + (actif ? '<ul class="al-types">' + TYPES.map(function (t) {
          return '<li><label class="al-check"><input type="checkbox" data-type="' + t[0] + '"' + (types.indexOf(t[0]) !== -1 ? " checked" : "") + "><span>" + esc(t[1]) + "</span></label></li>";
        }).join("") + '</ul><div class="card-actions"><button type="button" class="btn" id="alTest">M\'envoyer une notification d\'essai</button><button type="button" class="btn btn-ghost" id="alOff">Arrêter sur ce téléphone</button></div>'
          : '<div class="card-actions"><button type="button" class="btn" id="alOn">Activer les notifications</button></div>')
        + (moi && moi.erreur ? '<p class="soft-msg">Dernier envoi en erreur : ' + esc(moi.erreur) + "</p>" : "")
        + "</section>";
    }
    var list = d.alertes || [];
    html += '<section class="card section"><div class="card-head"><div><h3 class="card-title">Dernières alertes</h3><p class="card-sub">Envoyées ou pas, les plus récentes d\'abord</p></div></div>'
      + (list.length ? '<ol class="ev-list">' + list.map(function (a) {
        var c = a.type === "arret" || a.type === "paiement_rate" || a.type === "panne" ? "rouge" : a.type === "pro" || a.type === "paiement" ? "vert" : "bleu";
        return '<li class="ev-row ' + c + '"><span class="ev-dot" aria-hidden="true"></span><div><b>' + esc(a.titre) + '</b><span class="ev-det">' + esc(a.texte) + "</span><small>" + esc(quand(a.at) + (a.envoye_at ? " · envoyée à " + (a.envois || 0) + " appareil" + ((a.envois || 0) > 1 ? "s" : "") : " · pas encore envoyée")) + "</small></div></li>";
      }).join("") + "</ol>" : A().emptyHtml("Aucune alerte pour le moment", "La prochaine inscription, le prochain essai ou désabonnement apparaîtra ici.")) + "</section>";
    el.innerHTML = html;
  }
  function typesCoches() {
    var t = [];
    Array.prototype.forEach.call(document.querySelectorAll("#alertes input[data-type]"), function (c) { if (c.checked) t.push(c.getAttribute("data-type")); });
    return t;
  }
  function enregistrer(sub, types) {
    var j = sub.toJSON();
    return A().rpc("admin_push_enregistrer", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_types: types, p_appareil: (iphone() ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Ordinateur") + (seul() ? " (appli)" : "") });
  }
  function activer() {
    if (!swPret) { A().toast("Ce navigateur ne gère pas les notifications."); return; }
    Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") { A().toast("Notifications refusées. Autorise-les dans les réglages du téléphone pour IASHARK."); return null; }
      return swPret.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_PUBLIC) }); });
      }).then(function (sub) { return enregistrer(sub, TYPES.map(function (t) { return t[0]; })); }).then(function (r) {
        if (r && r.error) { A().toast("L'enregistrement n'a pas marché, réessaie."); return; }
        A().toast("Notifications activées.");
        return chargerAlertes();
      });
    }).catch(function () { A().toast("Activation impossible sur ce navigateur."); });
  }
  function test() {
    var sb = A().sb();
    if (!sb) return;
    var b = $("alTest");
    if (b) b.disabled = true;
    sb.functions.invoke("admin-alertes", { body: { mode: "test" } }).then(function (r) {
      if (b) b.disabled = false;
      A().toast(r && r.data && r.data.ok ? "Notification envoyée : regarde ton écran." : "L'envoi n'a pas marché.");
      setTimeout(chargerAlertes, 1500);
    });
  }
  function couper() {
    abonnementPush().then(function (sub) {
      if (!sub) return chargerAlertes();
      var ep = sub.endpoint;
      return sub.unsubscribe().catch(function () {}).then(function () { return A().rpc("admin_push_retirer", { p_endpoint: ep }); }).then(function () { A().toast("Plus de notifications sur ce téléphone."); return chargerAlertes(); });
    });
  }

  // ---------- Clics ----------
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var f = t.closest("[data-fiche]");
    if (f && f.getAttribute("data-fiche")) { ouvrirFiche(f.getAttribute("data-fiche")); return; }
    var c = t.closest("[data-copie]");
    if (c) {
      var v = c.getAttribute("data-copie");
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { A().toast("Adresse copiée."); }, function () { A().toast(v); });
      return;
    }
    var l = t.closest("[data-liste]");
    if (l) { var id = l.getAttribute("data-liste"); E.liste = E.liste === id ? null : id; listes(); return; }
    var fb = t.closest("#mouvFiltre button");
    if (fb) { E.filtre = fb.getAttribute("data-f"); rendreAbonnes(); return; }
    if (t.closest("#agMaj")) { var bm = $("agMaj"); if (bm) bm.textContent = "Mise à jour…"; chargerAbonnements(); return; }
    if (t.closest("#alOn")) { activer(); return; }
    if (t.closest("#alTest")) { test(); return; }
    if (t.closest("#alOff")) { couper(); return; }
    if (t.closest("#ficheFermer")) { var d = $("ficheDialog"); if (d && d.close) d.close(); else if (d) d.removeAttribute("open"); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches("#alertes input[data-type]")) return;
    abonnementPush().then(function (sub) {
      if (!sub) return;
      enregistrer(sub, typesCoches()).then(function (r) { A().toast(r && r.error ? "Pas enregistré, réessaie." : "C'est noté."); });
    });
  });
  var chercheTimer = null;
  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "chercheInput") { clearTimeout(chercheTimer); chercheTimer = setTimeout(chercher, 150); }
  });

  // ---------- Branchement sur le tableau de bord ----------
  var charge = false;
  window.IasharkAdminApp = {
    charger: function () {
      chargerAbonnements();
      chargerReseaux();
      if (!charge || A().S.screen === "paris") chargerParis();
      if (A().S.screen === "alertes") chargerAlertes();
      charge = true;
    },
    membres: function () { listes(); chercher(); },
    // Carte « Chaque mois » de l'ecran Aujourd'hui : meme calcul que l'ecran Argent.
    parMois: function () { return E.abo ? sommes(calculArgent().mensuel).join(" + ") : null; },
    live: function (live) { carte(live); },
    ecran: function (key) {
      onglet(key);
      if (key === "alertes") chargerAlertes();
      if (key === "paris" && !E.paris) chargerParis();
      if (key === "aujourdhui" && E.carte) setTimeout(function () { E.carte.invalidateSize(); }, 60);
    }
  };
  try { onglet((window.location.hash.match(/^#ecran-([a-z]+)$/) || [])[1] || "aujourdhui"); } catch (e) {}
  // Donnees deja arrivees avant ce fichier (reponses tres rapides) : on rattrape une fois.
  setTimeout(function () {
    try {
      var S = A().S, dash = $("dash");
      if (!dash || dash.hidden) return;
      if (!charge && S.members) window.IasharkAdminApp.charger();
      if (S.members) window.IasharkAdminApp.membres();
      if (S.live) carte(S.live);
      window.IasharkAdminApp.ecran(S.screen || "aujourdhui");
    } catch (e) {}
  }, 0);
})();
