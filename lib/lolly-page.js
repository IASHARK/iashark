/* IASHARK — page « Parier avec IASHARK chez Lolly Bet » (11/11/2026).
   Page en 2 etapes (12/11 : « trop de trucs inutiles ») : 1. bouton Lolly ; 2. ce bloc.
   « Pro offert 1 mois » (decision de Clement du 11/11/2026) : la personne, connectee a son compte
      IASHARK, s'inscrit chez Lolly Bet par notre lien (/go/lolly/site) puis declare ici l'e-mail ou le
      login utilise chez Lolly. Ligne ecrite dans public.pro_offert_demandes (migration 0074, RLS : elle ne
      voit et n'ajoute que SA ligne). Jamais d'auto-validation : Clement verifie dans l'espace partenaire
      Lolly (« User management ») puis valide dans admin.html ; le Pro s'ouvre alors pour un mois.
   Tout texte venant de la personne passe par textContent (jamais innerHTML). Clics mesures par
   data-track / data-track-kind (funnel-track.js -> funnel_events). */
(function (root) {
  "use strict";
  var TABLE = "pro_offert_demandes";
  var LOLLY = "/go/lolly/site";

  // ---------- Fonctions pures (testees par node --test) ----------
  // Identifiant declare : e-mail ou login, 3 a 120 caracteres, sans espace ni caractere de controle.
  function identifiantValide(v) {
    var s = String(v == null ? "" : v).trim();
    return s.length >= 3 && s.length <= 120 && !/[\s\u0000-\u001f\u007f<>]/.test(s);
  }
  // Etat du bloc selon la session, le compte et la derniere demande.
  //  sans_compte | deja_pro | en_attente | valide | refuse | a_declarer
  function etatPro(ctx, demande) {
    if (!ctx || !ctx.session) return "sans_compte";
    var st = demande && demande.statut;
    if (st === "en_attente") return "en_attente";
    if (st === "valide" && demande.pro_jusqu_au && Date.parse(demande.pro_jusqu_au) > Date.now()) return "valide";
    if (ctx.isPro) return "deja_pro";
    if (st === "refuse") return "refuse";
    return "a_declarer";
  }
  // Code d'erreur Postgres (declencheur 0074) -> cle du message.
  function erreurCle(err) {
    var m = String((err && (err.message || err.details || err.hint)) || "");
    if (/pro_offert_deja_demande/.test(m)) return "deja";
    if (/pro_offert_trop_de_demandes/.test(m)) return "trop";
    return "envoi";
  }

  var API = { identifiantValide: identifiantValide, etatPro: etatPro, erreurCle: erreurCle, TABLE: TABLE };
  if (typeof module === "object" && module.exports) { module.exports = API; return; }
  root.IasharkLollyPage = API;

  // ---------- Navigateur ----------
  function t(key, fb) { return (root.I18N && root.I18N.t) ? root.I18N.t(key, fb) : fb; }
  function tf(key, fb, vars) {
    return String(t(key, fb)).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }
  function lien(p) { return (root.I18N && root.I18N.href) ? root.I18N.href(p) : "/fr/" + p; }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function suivi(e, kind) { e.setAttribute("data-track", kind); e.setAttribute("data-track-kind", kind); return e; }
  function dateCourte(iso) {
    try {
      var tag = (root.I18N && root.I18N.localeTag) ? root.I18N.localeTag() : "fr-FR";
      return new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "long" });
    } catch (e) { return String(iso || "").slice(0, 10); }
  }
  var box, app, retour;

  function rendre(ctx, demande) {
    var etat = etatPro(ctx, demande);
    box.textContent = "";
    if (etat === "en_attente") {
      box.appendChild(el("p", "lb-etat", t("lolly_page.pro_pending", "On vérifie ton inscription, ton Pro s’ouvre dès que c’est confirmé.")));
      box.appendChild(el("p", "lb-etat-detail", tf("lolly_page.pro_declared", "Identifiant déclaré : {id}", { id: demande.identifiant || "" })));
      return;
    }
    if (etat === "valide") {
      box.appendChild(el("p", "lb-etat is-ok", tf("lolly_page.pro_ok", "C’est confirmé : ton Pro est ouvert jusqu’au {date}.", { date: dateCourte(demande.pro_jusqu_au) })));
      var a = suivi(el("a", "lb-btn lb-btn--ligne", t("lolly_page.pro_open_tools", "Ouvrir mes outils Pro")), "lolly_pro_outils");
      a.href = lien("pro.html");
      box.appendChild(a);
      return;
    }
    if (etat === "deja_pro") {
      box.appendChild(el("p", "lb-etat is-ok", t("lolly_page.pro_already", "Ton compte est déjà Pro.")));
      return;
    }
    // Etape 2 de la page : sans compte, on le cree d'abord ; avec compte, le formulaire.
    if (!ctx || !ctx.session) {
      box.appendChild(el("p", "lb-pas-s", t("lolly_page.pro_need_account", "D’abord ton compte IASHARK gratuit : c’est lui qui reçoit le Pro.")));
      var ins = suivi(el("a", "lb-btn", t("lolly_page.pro_signup", "Créer mon compte gratuit")), "lolly_pro_compte");
      ins.href = lien("inscription.html?next=" + encodeURIComponent(retour));
      var cx = el("a", "lb-lien", t("lolly_page.pro_login", "J’ai déjà un compte"));
      cx.href = lien("connexion.html?next=" + encodeURIComponent(retour));
      box.appendChild(ins);
      box.appendChild(cx);
      return;
    }
    box.appendChild(formulaire(ctx, etat === "refuse"));
  }

  function formulaire(ctx, refuse) {
    var f = el("form", "lb-form");
    f.noValidate = true;
    if (refuse) f.appendChild(el("p", "lb-statut is-erreur", t("lolly_page.pro_refused", "On n’a pas retrouvé ta dernière inscription chez Lolly Bet. Vérifie l’e-mail ou le login et renvoie-le.")));
    var lab = el("label", "", t("lolly_page.pro_field", "E-mail ou login utilisé chez Lolly Bet"));
    lab.htmlFor = "lbIdent";
    var inp = el("input");
    inp.id = "lbIdent"; inp.name = "identifiant"; inp.type = "text"; inp.maxLength = 120;
    inp.autocomplete = "off"; inp.autocapitalize = "none"; inp.spellcheck = false; inp.required = true;
    var btn = suivi(el("button", "lb-btn", t("lolly_page.pro_send", "Envoyer")), "lolly_pro_declarer");
    btn.type = "submit";
    var statut = el("p", "lb-statut");
    statut.setAttribute("role", "status");
    f.appendChild(lab); f.appendChild(inp); f.appendChild(btn); f.appendChild(statut);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = String(inp.value || "").trim();
      inp.setAttribute("aria-invalid", "false");
      if (!identifiantValide(v)) {
        inp.setAttribute("aria-invalid", "true"); inp.focus();
        statut.className = "lb-statut is-erreur";
        statut.textContent = t("lolly_page.pro_err_field", "Écris l’e-mail ou le login exact de ton compte Lolly Bet.");
        return;
      }
      btn.disabled = true;
      btn.textContent = t("lolly_page.pro_sending", "Envoi…");
      statut.className = "lb-statut"; statut.textContent = "";
      app.supabase.from(TABLE).insert({ identifiant: v, partenaire: "lolly" }).then(function (r) {
        if (!r.error) return charger();
        var cle = erreurCle(r.error);
        if (cle === "deja") return charger();
        btn.disabled = false;
        btn.textContent = t("lolly_page.pro_send", "Envoyer");
        statut.className = "lb-statut is-erreur";
        statut.textContent = cle === "trop"
          ? t("lolly_page.pro_err_many", "Tu as déjà envoyé plusieurs demandes. Écris-nous depuis la page Contact.")
          : t("lolly_page.pro_err_send", "L’envoi n’a pas marché. Réessaie dans un instant.");
      }, function () {
        btn.disabled = false;
        btn.textContent = t("lolly_page.pro_send", "Envoyer");
        statut.className = "lb-statut is-erreur";
        statut.textContent = t("lolly_page.pro_err_send", "L’envoi n’a pas marché. Réessaie dans un instant.");
      });
    });
    return f;
  }

  function charger() {
    return app.context().then(function (ctx) {
      if (!ctx || !ctx.session) { rendre(ctx, null); return; }
      return app.supabase.from(TABLE).select("statut,identifiant,created_at,pro_jusqu_au")
        .order("created_at", { ascending: false }).limit(1)
        .then(function (r) { rendre(ctx, r && !r.error && r.data && r.data[0] ? r.data[0] : null); },
          function () { rendre(ctx, null); });
    }).catch(function () { rendre(null, null); });
  }

  function init() {
    box = document.getElementById("lbPro");
    if (!box) return;
    retour = location.pathname + "#pro-offert";
    app = root.IasharkApp;
    // Dictionnaire de la langue charge AVANT le rendu (sinon les textes du bloc restent en francais).
    var I = root.I18N;
    var pret = I && I.init && !I.dict ? Promise.resolve(I.init()).catch(function () {}) : Promise.resolve();
    pret.then(function () {
      if (!app || !app.supabase) { rendre(null, null); return; }
      charger();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : this);
