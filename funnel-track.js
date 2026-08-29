"use strict";
// Tracking interne minimal du tunnel de conversion (MASTER V2.1 SS21) -
// AUCUN vendor tiers, AUCUN cookie tiers, AUCUN pixel externe. Ecrit
// directement dans la table Supabase funnel_events (voir
// supabase/migrations/0008_funnel_events.sql) via la meme cle anon publique
// deja utilisee par toutes les pages du site pour la lecture/l'auth. Script
// partage (racine, non duplique par locale - meme patron que
// auth-header.js/site-prefs.js), utilise sur les pages du tunnel
// (landing/pro/compte/checkout-succes/checkout-annule).
//
// Vie privee : aucun email/mot de passe/donnee personnelle envoye ici -
// seulement un identifiant de session anonyme genere cote client (jamais
// un identifiant publicitaire tiers), l'URL de la page, la locale, et le
// type d'evenement. user_id n'est rempli QUE pour un utilisateur deja
// connecte (son propre id Supabase Auth, jamais celui d'un tiers).
(function () {
  var SUPA_URL = "https://ksvjraqitxouwiabecai.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";

  function getSessionId() {
    try {
      var id = localStorage.getItem("iashark_funnel_sid");
      if (!id) {
        id = "sid_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("iashark_funnel_sid", id);
      }
      return id;
    } catch (e) {
      return null;
    }
  }

  function currentLocale() {
    var m = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    return m ? m[1] : "fr";
  }

  // eventType : voir la liste fermee documentee dans la migration
  // (check constraint funnel_events_event_type_check) - un type hors liste
  // est refuse silencieusement cote serveur (echec insert non bloquant pour
  // l'utilisateur, jamais une erreur visible).
  window.iasharkTrack = function (eventType, metadata, userId) {
    try {
      var body = {
        event_type: eventType,
        page: window.location.pathname,
        locale: currentLocale(),
        session_id: getSessionId(),
        user_id: userId || null,
        metadata: metadata || {},
      };
      fetch(SUPA_URL + "/rest/v1/funnel_events", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPA_KEY, Prefer: "return=minimal" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      // Le tracking ne doit jamais casser une page ou bloquer un parcours -
      // echec toujours silencieux.
    }
  };
})();
