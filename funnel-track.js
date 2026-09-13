"use strict";
// Suivi interne anonyme (visites + tunnel de conversion). AUCUN vendor tiers,
// AUCUN cookie, AUCUN pixel externe. Ecrit dans la table Supabase
// funnel_events (supabase/migrations/0008_funnel_events.sql + 0010).
//
// Mesure d'audience exemptable de consentement (lignes directrices CNIL) :
// - identifiant de visite aleatoire en sessionStorage (efface a la fermeture
//   de l'onglet, jamais persistant, jamais un identifiant publicitaire) ;
// - les vues de page (page_view) ne sont JAMAIS reliees a un compte ;
// - aucune adresse IP, aucun email, aucune donnee personnelle envoyee ;
// - uniquement sur le domaine de production (les tests locaux ne polluent
//   plus les statistiques).
// Google Analytics, lui, reste charge uniquement apres acceptation
// explicite (site-prefs.js).
(function () {
  if (window.__iasharkTrackLoaded) return;
  window.__iasharkTrackLoaded = true;

  var SUPA_URL = "https://ksvjraqitxouwiabecai.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";
  var PROD_HOSTS = { "iashark.com": true, "www.iashark.com": true };
  var enabled = !!PROD_HOSTS[window.location.hostname];

  // Nettoyage de l'ancien identifiant persistant (localStorage), remplace par
  // un identifiant de visite non persistant.
  try { localStorage.removeItem("iashark_funnel_sid"); } catch (e) {}

  function getSessionId() {
    try {
      var id = sessionStorage.getItem("iashark_visit_id");
      if (!id) {
        id = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem("iashark_visit_id", id);
      }
      return id;
    } catch (e) {
      return null;
    }
  }

  function currentSite() {
    var m = window.location.pathname.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)(\/|$)/);
    return m ? m[1] : "fr";
  }

  function send(body) {
    if (!enabled) return;
    try {
      fetch(SUPA_URL + "/rest/v1/funnel_events", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Prefer: "return=minimal" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      // Le suivi ne doit jamais casser une page : echec toujours silencieux.
    }
  }

  // eventType : liste fermee (check constraint funnel_events_event_type_check).
  window.iasharkTrack = function (eventType, metadata, userId) {
    send({
      event_type: eventType,
      page: window.location.pathname,
      locale: currentSite(),
      session_id: getSessionId(),
      user_id: eventType === "page_view" ? null : (userId || null),
      metadata: metadata || {},
    });
  };

  // Vue de page automatique, une fois par chargement.
  var params = new URLSearchParams(window.location.search);
  var refHost = "";
  try { refHost = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
  window.iasharkTrack("page_view", {
    ref: refHost && !PROD_HOSTS[refHost] ? refHost : null,
    utm_source: params.get("utm_source"),
    utm_campaign: params.get("utm_campaign"),
  });
})();
