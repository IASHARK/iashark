/* IASHARK — page « Parier avec IASHARK chez Lolly Bet » (11/11/2026).
   Page en 2 etapes (12/11 : « trop de trucs inutiles ») : 1. bouton Lolly ; 2. ce bloc.
   « Pro offert 1 mois » (decision de Clement du 11/11/2026) : la personne, connectee a son compte
      IASHARK, s'inscrit chez Lolly Bet par notre lien (/go/lolly/site) puis declare ici l'e-mail ou le
      login utilise chez Lolly. Ligne ecrite dans public.pro_offert_demandes (migration 0074, RLS : elle ne
      voit et n'ajoute que SA ligne). Jamais d'auto-validation : Clement verifie dans l'espace partenaire
      Lolly (« User management ») puis valide dans admin.html ; le Pro s'ouvre alors pour un mois.
   REFONTE DU 17/11/2026 (Clement : « mal construite », fausses demandes) : 3 etapes qui s'ouvrent l'une apres
      l'autre (composant Steps de 21st.dev) : 1. compte IASHARK ; 2. clic sur notre lien, note COTE SERVEUR
      (/go/lolly/site?c=<jeton>, migration 0077) ; 3. le formulaire, ferme tant que la base n'a pas vu le clic.
      « J'ai deja clique depuis l'e-mail » ouvre aussi l'etape 3 ; la demande est alors marquee « clic non vu »
      dans l'admin. La base refuse toute demande sans clic (pro_offert_sans_clic).
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
  // Code d'erreur Postgres (declencheurs 0074 et 0077) -> cle du message.
  function erreurCle(err) {
    var m = String((err && (err.message || err.details || err.hint)) || "");
    if (/pro_offert_sans_clic/.test(m)) return "clic";
    if (/pro_offert_deja_demande/.test(m)) return "deja";
    if (/pro_offert_trop_de_demandes/.test(m)) return "trop";
    return "envoi";
  }
  // CLIC OBLIGATOIRE (17/11/2026, migration 0077). clic = "vu" (passage note par /go/lolly/site?c=<jeton>),
  // "declare" (« J'ai deja clique depuis l'e-mail ») ou rien.
  function clicFait(clic) { return clic === "vu" || clic === "declare"; }
  // Etat des 3 etapes (composant Steps) : complete | current | upcoming. null = pas de parcours (deja Pro).
  function etapes(etat, clic) {
    if (etat === "deja_pro") return null;
    if (etat === "sans_compte") return ["current", "upcoming", "upcoming"];
    if (etat === "en_attente" || etat === "valide") return ["complete", "complete", "complete"];
    return clicFait(clic) ? ["complete", "complete", "current"] : ["complete", "current", "upcoming"];
  }
  // Lien Lolly du compte connecte : le jeton permet a la redirection de noter le clic cote serveur.
  function lienLolly(jeton) {
    var j = String(jeton == null ? "" : jeton).trim().toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(j) ? LOLLY + "?c=" + j : LOLLY;
  }

  var API = { identifiantValide: identifiantValide, etatPro: etatPro, erreurCle: erreurCle, emailCompte: emailCompte, memeEmail: memeEmail,
    clicFait: clicFait, etapes: etapes, lienLolly: lienLolly, TABLE: TABLE };
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
  var box, app, retour, clic = null, jeton = null, minuteurs = [];
  var COCHE = "M416 128 192 384l-96-96";
  function svgCoche() {
    var NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg"), p = document.createElementNS(NS, "path");
    s.setAttribute("viewBox", "0 0 512 512"); s.setAttribute("class", "may-steps__check"); s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false");
    p.setAttribute("d", COCHE); p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "44"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
    s.appendChild(p); return s;
  }
  function vider(e) { if (e) e.textContent = ""; }
  function dire(id, txt) { var e = document.getElementById(id); if (!e) return; e.textContent = txt || ""; e.hidden = !txt; }

  // Composant Steps : statut de chaque etape, pastille (numero ou coche), libelle pour lecteur d'ecran.
  var LIB = { complete: ["st_done", "Fait"], current: ["st_current", "En cours"], upcoming: ["st_todo", "À faire"] };
  function poserEtapes(statuts) {
    var ol = document.getElementById("lbSteps"), pro = document.getElementById("lbDejaPro");
    if (!ol) return;
    ol.hidden = !statuts; if (pro) pro.hidden = !!statuts;
    if (!statuts) return;
    var lis = ol.querySelectorAll(".may-steps__step");
    for (var i = 0; i < lis.length; i++) {
      var st = statuts[i] || "upcoming", li = lis[i], m = li.querySelector(".may-steps__marker"), sr = li.querySelector(".may-sr-only");
      if (li.getAttribute("data-status") !== st || !m.firstChild) {
        li.setAttribute("data-status", st);
        vider(m);
        if (st === "complete") m.appendChild(svgCoche()); else m.textContent = String(i + 1);
      }
      if (st === "current") li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      if (sr) sr.textContent = t("lolly_page." + LIB[st][0], LIB[st][1]);
    }
  }

  // Etape 2 : « Avec le meme e-mail : x@y » + Copier, le bouton Lolly (avec le jeton du compte), et
  // « J'ai deja clique depuis l'e-mail ». Une fois le clic note : bouton a contour, « Clic enregistre ».
  function etape2(ctx, etat, statuts) {
    var p = document.getElementById("lbMeme"), cta = document.getElementById("lbCta"), deja = document.getElementById("lbDeja");
    var zone = document.getElementById("lbZ2"), st = statuts ? statuts[1] : "upcoming";
    var email = emailCompte(ctx), ouvert = st === "current" || (st === "complete" && (etat === "a_declarer" || etat === "refuse"));
    if (zone) zone.hidden = st === "complete" && !ouvert;
    if (cta) {
      cta.href = lienLolly(jeton);
      cta.classList.toggle("is-fait", st === "complete");
      cta.classList.toggle("is-ferme", st === "upcoming");
      if (st === "upcoming") { cta.setAttribute("aria-disabled", "true"); cta.tabIndex = -1; } else { cta.removeAttribute("aria-disabled"); cta.removeAttribute("tabindex"); }
    }
    var ban = document.getElementById("lbBanniere"), off = document.getElementById("lbOffreTexte");
    if (ban) ban.href = lienLolly(jeton);
    if (off) off.href = lienLolly(jeton);
    if (deja) deja.hidden = st !== "current";
    dire("lbD2", st === "complete" && clicFait(clic) ? t("lolly_page.click_seen", "Clic enregistré") : "");
    if (!p) return;
    p.textContent = "";
    p.hidden = !(email && st === "current");
    if (p.hidden) return;
    p.appendChild(el("span", "", t("lolly_page.same_email", "Avec le même e-mail :")));
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

  // Le clic part dans un nouvel onglet : au retour sur la page (et quelques secondes apres l'appui),
  // on relit l'etat du clic dans la base. Rien n'est ouvert sur la seule foi du navigateur.
  function relireClic() {
    if (!app || !app.supabase || clicFait(clic)) return Promise.resolve();
    return app.supabase.rpc("pro_offert_clic_preparer").then(function (r) {
      var d = r && !r.error && r.data;
      if (!d) return;
      jeton = d.jeton || jeton;
      if (clicFait(d.clic)) { clic = d.clic; return charger(); }
    }, function () {});
  }
  function brancherClic() {
    var cta = document.getElementById("lbCta"), deja = document.getElementById("lbDeja");
    if (cta) cta.addEventListener("click", function (e) {
      if (cta.getAttribute("aria-disabled") === "true") { e.preventDefault(); return; }
      minuteurs.forEach(clearTimeout);
      minuteurs = [1500, 4000, 9000, 20000].map(function (ms) { return setTimeout(relireClic, ms); });
    });
    if (deja) deja.addEventListener("click", function () {
      if (!app || !app.supabase) return;
      deja.disabled = true;
      app.supabase.rpc("pro_offert_clic_declarer").then(function (r) {
        deja.disabled = false;
        var d = r && !r.error && r.data;
        if (d && clicFait(d.clic)) { clic = d.clic; jeton = d.jeton || jeton; charger(); }
      }, function () { deja.disabled = false; });
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) relireClic(); });
    root.addEventListener("pageshow", function () { relireClic(); });
    root.addEventListener("focus", function () { relireClic(); });
  }

  // Autre preuve acceptee (17/11/2026, Clement) : repondre a notre e-mail ou envoyer une capture sur Telegram.
  // C'est comme ca que le premier affilie valide est arrive. Une phrase, le mot Telegram mene au compte du site.
  var TELEGRAM = "https://t.me/iashark_contact";
  function preuve() {
    var p = el("p", "lb-preuve"), bouts = String(t("lolly_page.proof", "Tu peux aussi répondre à notre e-mail ou envoyer une capture de ton inscription sur {tg}.")).split("{tg}");
    p.appendChild(document.createTextNode(bouts[0]));
    if (bouts.length > 1) {
      var a = suivi(el("a", "", "Telegram"), "lolly_pro_telegram");
      a.href = TELEGRAM; a.target = "_blank"; a.rel = "noopener";
      p.appendChild(a);
      p.appendChild(document.createTextNode(bouts.slice(1).join("")));
    }
    return p;
  }

  function rendre(ctx, demande) {
    var etat = etatPro(ctx, demande), statuts = etapes(etat, clic);
    box.textContent = "";
    poserEtapes(statuts);
    if (!statuts) return;
    var z1 = document.getElementById("lbZ1");
    vider(z1);
    etape2(ctx, etat, statuts);
    // Etape 1 : sans compte, on le cree d'abord (retour sur cette page).
    if (etat === "sans_compte") {
      var ins = suivi(el("a", "lb-btn", t("lolly_page.pro_signup", "Créer mon compte gratuit")), "lolly_pro_compte");
      ins.href = lien("inscription.html?next=" + encodeURIComponent(retour));
      var cx = el("a", "lb-lien", t("lolly_page.pro_login", "J’ai déjà un compte"));
      cx.href = lien("connexion.html?next=" + encodeURIComponent(retour));
      z1.appendChild(ins);
      z1.appendChild(cx);
      return;
    }
    if (etat === "en_attente") {
      box.appendChild(el("p", "lb-etat", t("lolly_page.pro_pending", "Demande reçue. On vérifie ton inscription chez Lolly Bet et on te répond sous 24 h, ici, sur cette page.")));
      box.appendChild(el("p", "lb-etat-detail", tf("lolly_page.pro_declared", "Identifiant déclaré : {id}", { id: demande.identifiant || "" })));
      box.appendChild(preuve());
      return;
    }
    if (etat === "valide") {
      box.appendChild(el("p", "lb-etat is-ok", tf("lolly_page.pro_ok", "C’est confirmé : ton Pro est ouvert jusqu’au {date}.", { date: dateCourte(demande.pro_jusqu_au) })));
      var a = suivi(el("a", "lb-btn", t("lolly_page.pro_open_tools", "Ouvrir mes outils Pro")), "lolly_pro_outils");
      a.href = lien("pro.html");
      box.appendChild(a);
      return;
    }
    // Etape 3 : le formulaire reste ferme tant que le clic n'est pas note dans la base.
    if (statuts[2] === "current") { box.appendChild(formulaire(ctx, etat === "refuse")); box.appendChild(preuve()); }
  }

  function formulaire(ctx, refuse) {
    var f = el("form", "lb-form");
    f.noValidate = true;
    if (refuse) f.appendChild(el("p", "lb-statut is-erreur", t("lolly_page.pro_refused", "On n’a pas retrouvé ta dernière inscription chez Lolly Bet. Vérifie l’e-mail ou le login et renvoie-le.")));
    var lab = el("label", "", t("lolly_page.pro_field", "Ton e-mail ou login chez Lolly Bet"));
    lab.htmlFor = "lbIdent";
    var inp = el("input");
    inp.id = "lbIdent"; inp.name = "identifiant"; inp.type = "text"; inp.maxLength = 120;
    inp.autocomplete = "off"; inp.autocapitalize = "none"; inp.spellcheck = false; inp.required = true;
    // Deja rempli avec l'e-mail du compte IASHARK : un seul appui si c'est le meme chez Lolly Bet.
    inp.value = emailCompte(ctx);
    var btn = suivi(el("button", "lb-btn", t("lolly_page.pro_send", "Demander mon mois Pro")), "lolly_pro_declarer");
    btn.type = "submit";
    var statut = el("p", "lb-statut");
    statut.setAttribute("role", "status");
    f.appendChild(lab); f.appendChild(inp); f.appendChild(btn); f.appendChild(statut);
    function echec(cle) {
      btn.disabled = false;
      btn.textContent = t("lolly_page.pro_send", "Demander mon mois Pro");
      statut.className = "lb-statut is-erreur";
      statut.textContent = cle === "trop" ? t("lolly_page.pro_err_many", "Tu as déjà envoyé plusieurs demandes. Écris-nous depuis la page Contact.")
        : cle === "clic" ? t("lolly_page.pro_err_click", "Passe d’abord par notre bouton Lolly Bet.")
        : t("lolly_page.pro_err_send", "L’envoi n’a pas marché. Réessaie dans un instant.");
    }
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
        // La base n'a pas vu de clic : on referme l'etape 3 et on rouvre l'etape 2.
        if (cle === "clic") { clic = null; return charger(); }
        echec(cle);
      }, function () { echec("envoi"); });
    });
    return f;
  }

  // Compte connecte : jeton et etat du clic (base), puis la derniere demande.
  function charger() {
    return app.context().then(function (ctx) {
      if (!ctx || !ctx.session) { rendre(ctx, null); return; }
      var pClic = clicFait(clic) && jeton ? Promise.resolve() : app.supabase.rpc("pro_offert_clic_preparer").then(function (r) {
        var d = r && !r.error && r.data;
        if (d) { jeton = d.jeton || jeton; clic = clicFait(d.clic) ? d.clic : null; }
      }, function () {});
      return pClic.then(function () {
        return app.supabase.from(TABLE).select("statut,identifiant,created_at,pro_jusqu_au")
          .order("created_at", { ascending: false }).limit(1)
          .then(function (r) { rendre(ctx, r && !r.error && r.data && r.data[0] ? r.data[0] : null); },
            function () { rendre(ctx, null); });
      });
    }).catch(function () { rendre(null, null); });
  }

  function init() {
    box = document.getElementById("lbPro");
    if (!box) return;
    brancherClic();
    retour = location.pathname + "#pro-offert";
    app = root.IasharkApp;
    // Dictionnaire de la langue charge AVANT le rendu (sinon les textes du bloc restent en francais).
    var I = root.I18N;
    var pret = I && I.init && !I.dict ? Promise.resolve(I.init()).catch(function () {}) : Promise.resolve();
    pret.then(function () {
      // Banniere officielle de l'offre de bienvenue, dans la langue de la page (6 langues fournies par le
      // partenaire le 12/11/2026) ; elle remplace alors la ligne de texte de l'offre (une seule fois a l'ecran).
      var ban = document.getElementById("lbBanniere"), ligne = document.getElementById("lbOffreTexte");
      var loc = String((I && I.locale) || "fr").toLowerCase();
      var lg = { gb: "en", za: "en", mx: "es", "es-mx": "es" }[loc] || loc.slice(0, 2);
      var fichier = { fr: "fr.webp", en: "en.jpg", es: "es.jpg", de: "de.jpg", it: "it.jpg", pt: "pt.jpg" }[lg];
      if (ban && fichier) {
        var im = ban.querySelector("img");
        if (im && lg !== "fr") im.src = "/assets/bk/lolly-bienvenue-" + fichier;
        ban.hidden = false; if (ligne) ligne.hidden = true;
      }
      if (!app || !app.supabase) { rendre(null, null); return; }
      charger();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : this);
