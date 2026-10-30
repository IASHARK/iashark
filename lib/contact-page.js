/* IASHARK — formulaire de la page Contact (30/10/2026).
   Ecrit une ligne dans public.contact_messages (migration 0060, INSERT seulement
   sous RLS) avec la cle publique ; scripts/telegram/alerte-contact.mjs la transmet
   ensuite a Clement sur Telegram. Anti-abus : champ piege (rempli = on affiche
   « envoye » sans rien envoyer), limites de longueur ici ET en base, plafond par
   adresse et global en base. En cas d'echec : renvoi vers Telegram, jamais de
   message perdu en silence. */
(function () {
  "use strict";
  var SUPA_URL = "https://ksvjraqitxouwiabecai.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";
  var EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function t(key, fb) { return (window.I18N && window.I18N.t) ? window.I18N.t(key, fb) : fb; }
  function dir() { var m = location.pathname.match(/^\/([a-z]{2})\//); return m ? m[1] : "fr"; }

  function init() {
    var form = document.getElementById("ctForm");
    if (!form) return;
    var email = document.getElementById("ctEmail");
    var message = document.getElementById("ctMessage");
    var piege = document.getElementById("ctSite");
    var bouton = document.getElementById("ctEnvoyer");
    var statut = document.getElementById("ctStatut");
    var libelle = bouton.querySelector("span");

    function dire(txt, etat) {
      statut.textContent = txt || "";
      statut.className = "ct-statut" + (etat ? " is-" + etat : "");
    }
    function erreurChamp(el, oui) { el.setAttribute("aria-invalid", oui ? "true" : "false"); }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var adr = String(email.value || "").trim();
      var txt = String(message.value || "").trim();
      erreurChamp(email, false); erreurChamp(message, false);
      if (!EMAIL_OK.test(adr) || adr.length > 254) {
        erreurChamp(email, true); email.focus();
        dire(t("contact_page.err_email", "Vérifie ton adresse e-mail : on en a besoin pour te répondre."), "erreur");
        return;
      }
      if (txt.length < 10 || txt.length > 2000) {
        erreurChamp(message, true); message.focus();
        dire(t("contact_page.err_message", "Écris ton message en quelques mots (10 caractères minimum)."), "erreur");
        return;
      }
      var fini = function () {
        form.reset();
        dire(t("contact_page.sent", "Message envoyé. On te répond par e-mail dès que possible."), "ok");
        bouton.disabled = false;
        if (libelle) libelle.textContent = t("contact_page.send", "Envoyer le message");
      };
      bouton.disabled = true;
      if (libelle) libelle.textContent = t("contact_page.sending", "Envoi…");
      dire("", "");
      // Robot : on fait comme si, rien ne part.
      if (piege && piege.value) { setTimeout(fini, 600); return; }
      var corps = { email: adr, message: txt, page_dir: dir(), locale: (window.I18N && window.I18N.locale) || null };
      fetch(SUPA_URL + "/rest/v1/contact_messages", {
        method: "POST",
        headers: { apikey: SUPA_KEY, Authorization: "Bearer " + SUPA_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(corps)
      }).then(function (r) {
        if (r.ok) { fini(); return; }
        return r.text().then(function (b) {
          var limite = /contact_rate_limited/.test(b || "");
          bouton.disabled = false;
          if (libelle) libelle.textContent = t("contact_page.send", "Envoyer le message");
          dire(limite
            ? t("contact_page.err_limit", "Tu as déjà envoyé plusieurs messages. Réessaie dans une heure, ou écris-nous sur Telegram.")
            : t("contact_page.err_send", "L’envoi n’a pas marché. Réessaie, ou écris-nous sur Telegram (bouton ci-dessus)."), "erreur");
        });
      }).catch(function () {
        bouton.disabled = false;
        if (libelle) libelle.textContent = t("contact_page.send", "Envoyer le message");
        dire(t("contact_page.err_send", "L’envoi n’a pas marché. Réessaie, ou écris-nous sur Telegram (bouton ci-dessus)."), "erreur");
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
