"use strict";
// Suivi interne anonyme (visites + tunnel de conversion). AUCUN vendor tiers,
// AUCUN cookie, AUCUN pixel externe. Ecrit dans la table Supabase
// funnel_events (supabase/migrations/0008_funnel_events.sql + 0010 + 0011),
// lue uniquement par les fonctions admin (admin.html).
//
// Mesure d'audience exemptable de consentement (lignes directrices CNIL) :
// - identifiant de visite aleatoire en sessionStorage (efface a la fermeture
//   de l'onglet, jamais persistant, jamais un identifiant publicitaire) ;
// - page_view / page_leave / click ne portent JAMAIS de user_id ;
// - aucune adresse IP, aucun email, aucune empreinte : seulement des champs
//   grossiers (type d'appareil, navigateur, OS, largeur d'ecran, langue,
//   fuseau horaire et un pays ESTIME depuis ce fuseau, `country_guess`) ;
// - uniquement sur le domaine de production (les tests locaux ne polluent
//   pas les statistiques), jamais sur admin.html, jamais pour les robots.
// Exception documentee : signup_completed peut porter le user_id du compte
// qui vient d'etre cree, UNIQUEMENT avec le jeton de ce compte (la politique
// RLS funnel_events_insert_own refuse tout autre user_id). Sans jeton,
// l'evenement part sans user_id plutot que d'etre rejete par la base.
// Google Analytics, lui, reste charge uniquement apres acceptation
// explicite (site-prefs.js).
(function () {
  if (window.__iasharkTrackLoaded) return;
  window.__iasharkTrackLoaded = true;

  var SUPA_URL = "https://ksvjraqitxouwiabecai.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";
  var PROD_HOSTS = { "iashark.com": true, "www.iashark.com": true };
  var loc = window.location;
  var nav = window.navigator || {};
  var UA = String(nav.userAgent || "");

  // Robots et navigateurs pilotes : jamais comptes comme visiteurs.
  var isBot = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit/i.test(UA) || nav.webdriver === true;
  var enabled = !!PROD_HOSTS[loc.hostname] && !isBot;
  // Pages internes jamais mesurees (on ne compte pas le proprietaire).
  var autoTrack = enabled && !/^\/admin\.html$/.test(loc.pathname);

  // Nettoyage de l'ancien identifiant persistant (localStorage), remplace par
  // un identifiant de visite non persistant.
  try { localStorage.removeItem("iashark_funnel_sid"); } catch (e) {}

  function randomId(prefix) {
    return prefix + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function getSessionId() {
    try {
      var id = sessionStorage.getItem("iashark_visit_id");
      if (!id) {
        id = randomId("v_");
        sessionStorage.setItem("iashark_visit_id", id);
      }
      return id;
    } catch (e) {
      return null;
    }
  }

  function currentSite() {
    var m = loc.pathname.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)(\/|$)/);
    return m ? m[1] : "fr";
  }

  function send(body, authToken) {
    if (!enabled) return;
    try {
      var headers = { "Content-Type": "application/json", apikey: SUPA_KEY, Prefer: "return=minimal" };
      if (authToken) headers.Authorization = "Bearer " + authToken;
      fetch(SUPA_URL + "/rest/v1/funnel_events", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      // Le suivi ne doit jamais casser une page : echec toujours silencieux.
    }
  }

  // Evenements de navigation : toujours anonymes, quel que soit l'appelant.
  var ANONYMOUS_EVENTS = { page_view: true, page_leave: true, click: true };

  // eventType : liste fermee (check constraint funnel_events_event_type_check).
  // userId n'est transmis qu'accompagne du jeton de CE compte (authToken).
  window.iasharkTrack = function (eventType, metadata, userId, authToken) {
    var uid = !ANONYMOUS_EVENTS[eventType] && authToken && userId ? userId : null;
    send({
      event_type: eventType,
      page: loc.pathname.slice(0, 300),
      locale: currentSite(),
      session_id: getSessionId(),
      user_id: uid,
      metadata: metadata || {},
    }, uid ? authToken : null);
  };

  if (!autoTrack) return;

  function clip(value, max) {
    if (value === null || value === undefined) return null;
    var s = String(value).trim();
    return s ? s.slice(0, max) : null;
  }

  // ---------- Contexte grossier du visiteur ----------
  function deviceType() {
    var touchMac = /Macintosh/.test(UA) && nav.maxTouchPoints > 1; // iPadOS se presente comme un Mac
    if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(UA) || touchMac || (/Android/i.test(UA) && !/Mobile/i.test(UA))) return "tablet";
    if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(UA)) return "mobile";
    return "desktop";
  }

  function browserName() {
    if (/FBAN|FBAV/.test(UA)) return "Facebook (app)";
    if (/Instagram/.test(UA)) return "Instagram (app)";
    if (/musical_ly|BytedanceWebview|TikTok/i.test(UA)) return "TikTok (app)";
    if (/Snapchat/i.test(UA)) return "Snapchat (app)";
    if (/EdgA?\/|EdgiOS\/|Edg\//.test(UA)) return "Edge";
    if (/OPR\/|Opera/.test(UA)) return "Opera";
    if (/SamsungBrowser/.test(UA)) return "Samsung Internet";
    if (/FxiOS|Firefox\//.test(UA)) return "Firefox";
    if (/CriOS|Chrome\//.test(UA)) return "Chrome";
    if (/Safari\//.test(UA)) return "Safari";
    return "Other";
  }

  function osName() {
    if (/iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && nav.maxTouchPoints > 1)) return "iOS";
    if (/Android/.test(UA)) return "Android";
    if (/CrOS/.test(UA)) return "ChromeOS";
    if (/Windows/.test(UA)) return "Windows";
    if (/Mac OS X|Macintosh/.test(UA)) return "macOS";
    if (/Linux/.test(UA)) return "Linux";
    return "Other";
  }

  // Pays ESTIME depuis le fuseau horaire du navigateur (jamais l'IP). Une
  // estimation : un fuseau couvre parfois plusieurs pays, un VPN ou un
  // voyageur fausse la valeur. Fuseau absent de la table => null (inconnu).
  var TZ_COUNTRY = {
    "Europe/Paris": "FR", "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Brussels": "BE",
    "Europe/Luxembourg": "LU", "Europe/Zurich": "CH", "Europe/Berlin": "DE", "Europe/Vienna": "AT",
    "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "Africa/Ceuta": "ES", "Europe/Lisbon": "PT",
    "Atlantic/Madeira": "PT", "Atlantic/Azores": "PT", "Europe/Rome": "IT", "Europe/Amsterdam": "NL",
    "Europe/Monaco": "MC", "Europe/Andorra": "AD", "Europe/Malta": "MT", "Europe/Warsaw": "PL",
    "Europe/Prague": "CZ", "Europe/Bratislava": "SK", "Europe/Budapest": "HU", "Europe/Bucharest": "RO",
    "Europe/Sofia": "BG", "Europe/Athens": "GR", "Europe/Stockholm": "SE", "Europe/Oslo": "NO",
    "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Istanbul": "TR", "Europe/Kyiv": "UA",
    "Europe/Kiev": "UA", "Europe/Moscow": "RU", "Europe/Belgrade": "RS", "Europe/Zagreb": "HR",
    "Europe/Ljubljana": "SI", "Africa/Johannesburg": "ZA", "Africa/Casablanca": "MA", "Africa/Algiers": "DZ",
    "Africa/Tunis": "TN", "Africa/Dakar": "SN", "Africa/Abidjan": "CI", "Africa/Lagos": "NG",
    "Africa/Douala": "CM", "Africa/Kinshasa": "CD", "Africa/Cairo": "EG", "Africa/Nairobi": "KE",
    "Indian/Reunion": "RE", "Indian/Mayotte": "YT", "America/Martinique": "MQ", "America/Guadeloupe": "GP",
    "America/Cayenne": "GF", "Pacific/Noumea": "NC", "Pacific/Tahiti": "PF",
    "America/Mexico_City": "MX", "America/Cancun": "MX", "America/Merida": "MX", "America/Monterrey": "MX",
    "America/Matamoros": "MX", "America/Chihuahua": "MX", "America/Hermosillo": "MX", "America/Mazatlan": "MX",
    "America/Bahia_Banderas": "MX", "America/Tijuana": "MX",
    "America/New_York": "US", "America/Detroit": "US", "America/Indiana/Indianapolis": "US", "America/Chicago": "US",
    "America/Denver": "US", "America/Phoenix": "US", "America/Los_Angeles": "US", "America/Anchorage": "US",
    "Pacific/Honolulu": "US", "America/Toronto": "CA", "America/Montreal": "CA", "America/Winnipeg": "CA",
    "America/Edmonton": "CA", "America/Vancouver": "CA", "America/Halifax": "CA",
    "America/Sao_Paulo": "BR", "America/Argentina/Buenos_Aires": "AR", "America/Bogota": "CO", "America/Lima": "PE",
    "America/Santiago": "CL", "America/Caracas": "VE",
    "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU", "Australia/Perth": "AU",
    "Australia/Adelaide": "AU", "Pacific/Auckland": "NZ",
    "Asia/Dubai": "AE", "Asia/Qatar": "QA", "Asia/Riyadh": "SA", "Asia/Jerusalem": "IL", "Asia/Beirut": "LB",
    "Asia/Kolkata": "IN", "Asia/Bangkok": "TH", "Asia/Singapore": "SG", "Asia/Jakarta": "ID", "Asia/Manila": "PH",
    "Asia/Hong_Kong": "HK", "Asia/Shanghai": "CN", "Asia/Seoul": "KR", "Asia/Tokyo": "JP"
  };

  function timeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
  }

  var params;
  try { params = new URLSearchParams(loc.search); } catch (e) { params = { get: function () { return null; } }; }

  function matchIdFromPath(pathname, search) {
    var m = pathname.match(/\/match\/(\d{1,12})\.html$/);
    if (m) return m[1];
    if (/\/match\.html$/.test(pathname)) {
      var id = search && search.get("id");
      if (id && /^\d{1,12}$/.test(id)) return id;
    }
    return null;
  }

  var PAGE_VIEW_ID = randomId("p_");

  // ---------- page_view ----------
  try {
    var refHost = "";
    try { refHost = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
    var externalRef = refHost && !PROD_HOSTS[refHost] ? refHost : null;

    var seq = null;
    try {
      seq = (parseInt(sessionStorage.getItem("iashark_visit_pages"), 10) || 0) + 1;
      sessionStorage.setItem("iashark_visit_pages", String(seq));
    } catch (e) { seq = null; }
    var landing = seq !== null ? seq === 1 : !refHost || !!externalRef;

    var tz = timeZone();
    var screenW = window.screen && window.screen.width ? Math.round(window.screen.width) : null;

    window.iasharkTrack("page_view", {
      pv: PAGE_VIEW_ID,
      seq: seq,
      landing: landing,
      ref: clip(externalRef, 80),
      utm_source: clip(params.get("utm_source"), 80),
      utm_medium: clip(params.get("utm_medium"), 80),
      utm_campaign: clip(params.get("utm_campaign"), 80),
      device: deviceType(),
      browser: browserName(),
      os: osName(),
      screen_w: screenW,
      lang: clip(nav.language, 16),
      tz: clip(tz, 48),
      country_guess: (tz && TZ_COUNTRY[tz]) || null,
      match_id: matchIdFromPath(loc.pathname, params),
    });

    // La page d'inscription vue = inscription commencee (toutes versions).
    if (/\/inscription\.html$/.test(loc.pathname)) window.iasharkTrack("signup_started", {});
  } catch (e) {}

  // ---------- page_leave : temps actif sur la page + profondeur de scroll ----------
  try {
    var visibleSince = document.visibilityState === "hidden" ? null : Date.now();
    var engagedMs = 0;
    var lastSentMs = -1;
    var leaveCount = 0;
    var maxScroll = 0;

    var measureScroll = function () {
      try {
        var de = document.documentElement;
        var height = Math.max(de.scrollHeight || 0, document.body ? document.body.scrollHeight || 0 : 0);
        var viewport = window.innerHeight || de.clientHeight || 0;
        var y = window.pageYOffset || de.scrollTop || 0;
        var pct = !height || height <= viewport ? 100 : Math.round(Math.min(1, (y + viewport) / height) * 100);
        if (pct > maxScroll) maxScroll = pct;
      } catch (e) {}
    };

    var scrollQueued = false;
    window.addEventListener("scroll", function () {
      if (scrollQueued) return;
      scrollQueued = true;
      setTimeout(function () { scrollQueued = false; measureScroll(); }, 250);
    }, { passive: true });
    window.addEventListener("load", function () { setTimeout(measureScroll, 1500); });

    var flushLeave = function () {
      if (visibleSince !== null) { engagedMs += Date.now() - visibleSince; visibleSince = null; }
      // pagehide suit souvent visibilitychange : pas de doublon si rien n'a change.
      if (engagedMs === lastSentMs || leaveCount >= 20) return;
      leaveCount++;
      lastSentMs = engagedMs;
      measureScroll();
      window.iasharkTrack("page_leave", {
        pv: PAGE_VIEW_ID,
        sec: Math.min(14400, Math.round(engagedMs / 1000)),
        scroll: maxScroll,
      });
    };

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushLeave();
      else if (visibleSince === null) visibleSince = Date.now();
    });
    window.addEventListener("pagehide", flushLeave);
  } catch (e) {}

  // ---------- click : actions significatives uniquement ----------
  try {
    var TARGET_PAGES = /\/(inscription|connexion|abonnement|pro|compte|landing)\.html$/;
    var clickCount = 0;
    var lastClickKey = "";
    var lastClickAt = 0;

    // Libelle court : data-track d'abord, sinon texte visible nettoye. Jamais
    // d'adresse email (l'en-tete affiche une partie de l'email du compte).
    var labelOf = function (el, fallback) {
      var raw = el.getAttribute("data-track") || el.getAttribute("aria-label") || el.textContent || "";
      var text = String(raw).replace(/\S+@\S*/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
      return text || fallback || null;
    };

    var classify = function (target) {
      if (!target || typeof target.closest !== "function") return null;
      var tracked = target.closest("[data-track]");
      if (tracked) return { kind: "cta", label: labelOf(tracked) };

      var lang = target.closest(".lang-switch-item");
      if (lang) return { kind: "lang_switch", label: clip(lang.getAttribute("data-dir"), 8) };

      var button = target.closest("button");
      if (button) {
        var id = button.id || "";
        var cls = typeof button.className === "string" ? button.className : "";
        if (/^subscribe|checkout/i.test(id) || /\b(pricing-cta|plan-btn)\b/.test(cls)) {
          return { kind: "checkout", label: labelOf(button), target: clip(id, 40) };
        }
        return null;
      }

      var link = target.closest("a[href]");
      if (!link) return null;
      var href = link.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || /^(mailto|tel|javascript):/i.test(href)) return null;
      var url;
      try { url = new URL(link.href, loc.href); } catch (e) { return null; }
      if (url.origin !== loc.origin) return null;
      var matchId = matchIdFromPath(url.pathname, url.searchParams);
      if (matchId || /\/match\.html$/.test(url.pathname)) {
        return { kind: "match", label: labelOf(link), target: url.pathname.slice(0, 120), match_id: matchId };
      }
      var page = url.pathname.match(TARGET_PAGES);
      if (!page) return null;
      // Le lien "compte" de l'en-tete porte l'identite : libelle fixe.
      var label = page[1] === "compte" ? "compte" : labelOf(link, page[1]);
      return { kind: page[1], label: label, target: url.pathname.slice(0, 120) };
    };

    document.addEventListener("click", function (event) {
      try {
        var info = classify(event.target);
        if (!info) return;
        var now = Date.now();
        var key = info.kind + "|" + info.label;
        if (clickCount >= 40 || (key === lastClickKey && now - lastClickAt < 1000)) return;
        clickCount++;
        lastClickKey = key;
        lastClickAt = now;
        info.pv = PAGE_VIEW_ID;
        window.iasharkTrack("click", info);
      } catch (e) {}
    }, true);
  } catch (e) {}
})();
