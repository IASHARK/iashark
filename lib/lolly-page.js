/* IASHARK — page « Parier avec IASHARK chez Lolly Bet » (11/11/2026).
   Page en 2 etapes (12/11 : « trop de trucs inutiles ») : 1. bouton Lolly ; 2. ce bloc.
   « Pro offert 1 mois » (decision de Clement du 11/11/2026) : la personne, connectee a son compte
      IASHARK, s'inscrit chez Lolly Bet par notre lien (/go/lolly/site) puis declare ici l'e-mail ou le
      login utilise chez Lolly. Ligne ecrite dans public.pro_offert_demandes (migration 0074, RLS : elle ne
      voit et n'ajoute que SA ligne). Jamais d'auto-validation : Clement verifie dans l'espace partenaire
      Lolly (« User management ») puis valide dans admin.html ; le Pro s'ouvre alors pour un mois.
   MEME E-MAIL SUR LES DEUX COMPTES (12/11/2026, Clement : « qu'on le retrouve ») : la page demande d'utiliser
      chez Lolly Bet le meme e-mail que le compte IASHARK. Connecte : l'etape 1 affiche cet e-mail (bouton
      « Copier »), et le champ de l'etape 2 est deja rempli avec lui : un seul appui si c'est bien le meme,
      sinon la personne le corrige. Sans compte : l'etape 2 demande de creer le compte IASHARK avec le meme
      e-mail. Dans admin.html, chaque demande dit si l'identifiant declare est l'e-mail du compte.
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
  // E-mail du compte IASHARK connecte (minuscules, sans espaces) ; "" si inconnu ou mal forme.
  function emailCompte(ctx) {
    var u = ctx && ((ctx.session && ctx.session.user) || ctx.user);
    var e = String((u && u.email) || "").trim().toLowerCase();
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e) && e.length <= 120 ? e : "";
  }
  // L'identifiant declare est-il l'e-mail du compte ? (meme regle dans admin-dashboard.js#proOffertMemeEmail)
  function memeEmail(identifiant, email) {
    var a = String(identifiant == null ? "" : identifiant).trim().toLowerCase();
    var b = String(email == null ? "" : email).trim().toLowerCase();
    return !!a && a === b;
  }
  // Code d'erreur Postgres (declencheur 0074) -> cle du message.
  function erreurCle(err) {
    var m = String((err && (err.message || err.details || err.hint)) || "");
    if (/pro_offert_deja_demande/.test(m)) return "deja";
    if (/pro_offert_trop_de_demandes/.test(m)) return "trop";
    return "envoi";
  }

  var API = { identifiantValide: identifiantValide, etatPro: etatPro, erreurCle: erreurCle, emailCompte: emailCompte, memeEmail: memeEmail, TABLE: TABLE };
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

  // Etape 1 : « Utilise le meme e-mail que ton compte IASHARK » + l'e-mail et un bouton Copier.
  // Seulement tant que la demande n'est pas partie ; sans compte ou e-mail inconnu : rien.
  function memeEmailEtape1(ctx, etat) {
    var p = document.getElementById("lbMeme");
    if (!p) return;
    var email = emailCompte(ctx);
    p.textContent = "";
    p.hidden = !(email && (etat === "a_declarer" || etat === "refuse"));
    if (p.hidden) return;
    p.appendChild(el("span", "", t("lolly_page.same_email", "Utilise le même e-mail que ton compte IASHARK :")));
    p.appendChild(el("b", "lb-meme-email", email));
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      var c = suivi(el("button", "lb-copier", t("lolly_page.copy", "Copier")), "lolly_pro_copier");
      c.type = "button";
      c.addEventListener("click", function () {
        root.navigator.clipboard.writeText(email).then(function () {
          c.textContent = t("lolly_page.copied", "Copié");
          setTimeout(function () { c.textContent = t("lolly_page.copy", "Copier"); }, 2000);
        }, function () {});
      });
      p.appendChild(c);
    }
  }

  function rendre(ctx, demande) {
    var etat = etatPro(ctx, demande);
    box.textContent = "";
    memeEmailEtape1(ctx, etat);
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
      box.appendChild(el("p", "lb-pas-s", t("lolly_page.pro_need_account", "Crée ton compte IASHARK gratuit avec le même e-mail que chez Lolly Bet : c’est lui qui reçoit le Pro.")));
      // Bouton a contour : l'inscription chez le partenaire (etape 1) reste le seul bouton plein de la page.
      var ins = suivi(el("a", "lb-btn lb-btn--ligne", t("lolly_page.pro_signup", "Créer mon compte gratuit")), "lolly_pro_compte");
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
    // Deja rempli avec l'e-mail du compte IASHARK : un seul appui si c'est le meme chez Lolly Bet.
    inp.value = emailCompte(ctx);
    var btn = suivi(el("button", "lb-btn lb-btn--ligne", t("lolly_page.pro_send", "Demander mon mois Pro")), "lolly_pro_declarer");
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
        btn.textContent = t("lolly_page.pro_send", "Demander mon mois Pro");
        statut.className = "lb-statut is-erreur";
        statut.textContent = cle === "trop"
          ? t("lolly_page.pro_err_many", "Tu as déjà envoyé plusieurs demandes. Écris-nous depuis la page Contact.")
          : t("lolly_page.pro_err_send", "L’envoi n’a pas marché. Réessaie dans un instant.");
      }, function () {
        btn.disabled = false;
        btn.textContent = t("lolly_page.pro_send", "Demander mon mois Pro");
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
      // Banniere officielle de l'offre de bienvenue : son texte est en francais, donc en francais seulement ;
      // elle remplace alors la ligne de texte de l'offre (une seule fois l'offre a l'ecran).
      var ban = document.getElementById("lbBanniere"), ligne = document.getElementById("lbOffreTexte");
      var fr = !(I && I.locale) || I.locale === "fr";
      if (ban && fr) { ban.hidden = false; if (ligne) ligne.hidden = true; }
      if (!app || !app.supabase) { rendre(null, null); return; }
      charger();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : this);
