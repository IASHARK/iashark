/* IASHARK — panneau Lolly Bet (15/11/2026, demande de Clement : « faut vraiment
   bien vendre le truc, fais un bon panneau pour vraiment attirer les gens a cliquer »).

   15/11 soir, version 2 (retour de Clement sur la version 1 : « tu n'as pas utilise
   21dev, tu as dessine, les polices ne sont pas adequates, je ne vois rien, il faut
   que ce soit plus comprehensible, plus axe pour attirer les gens ») :
   - design repris du composant 21st.dev « Newsletter Dialog » (ravikatiyar162,
     id 8420, recupere par get_component) : grande image en haut (h-48, object-cover),
     corps p-6 md:p-8, titre, description, texte promo, bouton pleine largeur taille
     lg, croix en haut a droite, entree zoom 95 -> 100 % en .3 s puis apparition
     decalee des blocs (+10 px, delais .1/.2/.3/.4 s). Traduit en CSS simple (pas de
     React sur le site). Champ e-mail du composant retire (rien a saisir ici).
   - polices de la charte : titre en Anton (chargee si la page ne l'a pas), texte en
     Inter. Image : le stade de nuit du site (assets/hero) avec les deux logos.
   - message lisible en une seconde : « 1 mois d'IASHARK Pro offert », a qui (meme
     e-mail chez Lolly Bet), 3 avantages maximum, un gros bouton.
   - BUG corrige : la v1 posait la cle du jour DES L'AFFICHAGE ; Clement a ouvert
     l'accueil puis change de page 0,16 s apres (journal funnel_events du 15/11,
     16:34 UTC) : panneau consomme sans etre vu. Desormais la cle n'est posee qu'a la
     fermeture (croix, Echap, clic a cote) ou au clic sur un lien : tant qu'il n'est
     pas ferme, il revient a la page suivante, quelle qu'elle soit.
   - ?lolly=1 dans l'adresse : force l'ouverture (verification), meme deja ferme.

   Charge par site-prefs.js sur les pages non exclues (jamais connexion, inscription,
   compte, paiement, Pro, page Lolly, admin). A tous (inscrits ou non), jusqu'a
   fermeture, une fois par jour et par navigateur (cle localStorage
   iashark_lolly_panneau = date du jour). Sans localStorage : jamais (sauf ?lolly=1).
   Jamais pour un robot, jamais par-dessus une autre fenetre (dialog deja ouvert).

   Avantages : verifies le 15/11/2026 sur le site officiel Lolly Bet (menu Sports >
   Live, petits marches, offre « Sports : 1er pari rembourse jusqu'a 100€ en CASH »).
   Retires faute de preuve : streaming des matchs, « securite » (PARTENAIRES.md).

   VOLET (inscrits connectes) : petite carte discrete en bas de l'ecran, non
   bloquante, avec l'e-mail du compte masque (c•••@gmail.com) et le bouton vers la
   demande. Seulement une fois le panneau ferme ce jour-la (jamais les deux sur la
   meme page), une fois par jour (cle iashark_lolly_volet), jamais pour un compte
   Pro / famille / admin, ni pour un compte qui a deja une demande Pro offert
   (pro_offert_demandes, tous statuts). Au moindre doute (reseau, erreur) : rien.

   Mesure (funnel_events, migration 0076) : lolly_panneau_vu (une fois par jour et
   par onglet), lolly_panneau_clic, lolly_panneau_ferme { forme: panneau|volet,
   inscrit, how } ; inscrit = une session est ouverte dans ce navigateur. */
(function () {
  "use strict";
  if (window.__iasharkLollyPanneau) return;
  window.__iasharkLollyPanneau = true;

  var CLE = "iashark_lolly_panneau";
  var CLE_VOLET = "iashark_lolly_volet";
  var LIEN = "/go/lolly/site";
  var FORCE = /[?&]lolly=1(&|$)/.test(location.search);

  var TEXTES = {
    fr: {
      titre: "1 mois d’IASHARK Pro",
      titre_fort: "offert",
      desc: "Si tu joues chez Lolly Bet, notre partenaire, avec le même e-mail que ton compte IASHARK.",
      points: ["Paris en direct", "Corners, cartons, tirs cadrés", "1er pari remboursé jusqu’à 100\u00a0€ avec notre lien"],
      cta: "Obtenir mon mois Pro offert",
      lolly: "Voir Lolly Bet",
      volet_titre: "1 mois d’IASHARK Pro offert",
      volet: "Inscris-toi chez Lolly Bet avec ton e-mail {email}, puis demande ton mois Pro. On vérifie et on l’ouvre.",
      volet_cta: "Obtenir mon mois Pro",
      fermer: "Fermer"
    },
    en: {
      titre: "1 month of IASHARK Pro",
      titre_fort: "free",
      desc: "If you bet at Lolly Bet, our partner, with the same email as your IASHARK account.",
      points: ["Live betting", "Corners, cards, shots on target", "First bet refunded up to €100 with our link"],
      cta: "Get my free Pro month",
      lolly: "See Lolly Bet",
      volet_titre: "1 month of IASHARK Pro, free",
      volet: "Sign up at Lolly Bet with your email {email}, then claim your Pro month. We check it and open it.",
      volet_cta: "Get my Pro month",
      fermer: "Close"
    },
    es: {
      titre: "1 mes de IASHARK Pro",
      titre_fort: "gratis",
      desc: "Si apuestas en Lolly Bet, nuestro socio, con el mismo e-mail que tu cuenta IASHARK.",
      points: ["Apuestas en directo", "Córners, tarjetas, tiros a puerta", "1.ª apuesta reembolsada hasta 100\u00a0€ con nuestro enlace"],
      cta: "Conseguir mi mes Pro gratis",
      lolly: "Ver Lolly Bet",
      volet_titre: "1 mes de IASHARK Pro gratis",
      volet: "Regístrate en Lolly Bet con tu e-mail {email} y pide tu mes Pro. Lo verificamos y lo abrimos.",
      volet_cta: "Conseguir mi mes Pro",
      fermer: "Cerrar"
    },
    pt: {
      titre: "1 mês de IASHARK Pro",
      titre_fort: "grátis",
      desc: "Se apostas na Lolly Bet, a nossa parceira, com o mesmo e-mail da tua conta IASHARK.",
      points: ["Apostas ao vivo", "Cantos, cartões, remates à baliza", "1.ª aposta reembolsada até 100\u00a0€ com o nosso link"],
      cta: "Obter o meu mês Pro grátis",
      lolly: "Ver a Lolly Bet",
      volet_titre: "1 mês de IASHARK Pro grátis",
      volet: "Regista-te na Lolly Bet com o teu e-mail {email} e pede o teu mês Pro. Verificamos e abrimos.",
      volet_cta: "Obter o meu mês Pro",
      fermer: "Fechar"
    }
  };

  // Page de la demande « Pro offert » dans la version du site de la page.
  function lienPro() {
    var p = "lolly.html";
    try { if (window.I18N && typeof window.I18N.href === "function") { var h = window.I18N.href(p); if (h) return String(h) + "#pro-offert"; } } catch (e) {}
    var m = location.pathname.match(/^\/([a-z]{2})\//);
    return "/" + (m ? m[1] : "fr") + "/" + p + "#pro-offert";
  }

  // c•••@gmail.com (jamais l'adresse complete a l'ecran).
  function emailMasque(e) {
    var s = String(e || "").trim(), i = s.indexOf("@");
    if (i < 1) return "";
    return s.charAt(0) + "\u2022\u2022\u2022" + s.slice(i);
  }

  function langue() {
    var m = location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    var dir = m ? m[1] : "";
    var par = { fr: "fr", ca: "fr", en: "en", gb: "en", za: "en", de: "en", it: "en", es: "es", mx: "es", pt: "pt", br: "pt" };
    if (Object.prototype.hasOwnProperty.call(par, dir)) return par[dir];
    var l = String(document.documentElement.lang || "fr").slice(0, 2).toLowerCase();
    return TEXTES[l] ? l : "fr";
  }

  function jour() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function inscrit() {
    try {
      var raw = localStorage.getItem("sb-ksvjraqitxouwiabecai-auth-token");
      if (!raw) return false;
      var s = JSON.parse(raw);
      if (s && s.currentSession) s = s.currentSession;
      return !!(s && s.user && s.user.id);
    } catch (e) { return false; }
  }

  // funnel-track.js est charge en parallele (defer) : on attend qu'il soit pret.
  function mesurer(type, meta) {
    var essais = 0;
    (function go() {
      if (typeof window.iasharkTrack === "function") {
        try { window.iasharkTrack(type, meta); } catch (e) {}
        return;
      }
      if (++essais < 20) setTimeout(go, 250);
    })();
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Icones lucide (memes traces que lucide-react, utilise par le composant).
  function ico(d) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  var I_X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
  var I_EXT = '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>';
  var I_OK = '<path d="M20 6 9 17l-5-5"/>';
  var I_FLECHE = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';

  // Anton (titre, charte IASHARK) : deja chargee sur une partie des pages.
  function police() {
    try {
      if (document.querySelector('link[href*="family=Anton"]') || document.getElementById("lp-anton")) return;
      var l = document.createElement("link");
      l.id = "lp-anton";
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Anton&display=swap";
      document.head.appendChild(l);
    } catch (e) {}
  }

  var CSS = ""
    // Dialog (Radix -> <dialog> natif : piege du focus, Echap, fond inerte).
    // DialogOverlay bg-black/80 ; DialogContent sm:max-w-md p-0 gap-0 overflow-hidden.
    + ".lp{border:0;padding:0;margin:auto;background:transparent;color:#f4f7fb;width:min(448px,calc(100% - 32px));max-width:none;max-height:calc(100dvh - 24px);overflow:visible;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}"
    + ".lp::backdrop{background:rgba(0,0,0,.8)}"
    + ".lp[open]::backdrop{animation:lpFond .3s ease-in-out}"
    + ".lp-c{position:relative;max-height:calc(100dvh - 24px);overflow-x:hidden;overflow-y:auto;background:#0a1420;border:1px solid rgba(141,179,211,.16);border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,.7),0 0 0 1px rgba(32,213,239,.06);outline:none}"
    // motion.div : opacity 0 / scale .95 -> 1, .3 s easeInOut
    + ".lp[open] .lp-c{animation:lpIn .3s ease-in-out}"
    + "@keyframes lpIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}"
    + "@keyframes lpFond{from{opacity:0}to{opacity:1}}"
    // FADE_IN_ANIMATION_VARIANTS : y 10 -> 0, delais .1 / .2 / .3 / .4 s
    + ".lp-a{animation:lpMonte .5s cubic-bezier(.22,1.2,.36,1) both}"
    + ".lp-a1{animation-delay:.1s}.lp-a2{animation-delay:.2s}.lp-a3{animation-delay:.3s}.lp-a4{animation-delay:.4s}"
    + "@keyframes lpMonte{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}"
    // relative h-48 w-full + img h-full w-full object-cover
    + ".lp-img{position:relative;height:176px;width:100%;overflow:hidden;background:#060b12}"
    + ".lp-img>img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 40%}"
    + ".lp-img::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,11,18,.15) 0%,rgba(6,11,18,.25) 55%,#0a1420 100%)}"
    + ".lp-duo{position:absolute;z-index:1;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;gap:12px;margin:0;color:#f4f7fb;font-size:18px;font-weight:600}"
    + ".lp-duo>img{display:block;height:30px;width:auto;filter:drop-shadow(0 2px 10px rgba(0,0,0,.6))}"
    + ".lp-logo{display:inline-flex;align-items:center;padding:8px 12px;border-radius:10px;background:#060b12;box-shadow:inset 0 0 0 1px rgba(141,179,211,.25),0 6px 18px rgba(0,0,0,.5)}"
    + ".lp-logo img{display:block;height:20px;width:auto}"
    // DialogClose absolute right-4 top-4 (pastille sombre : elle est posee sur l'image)
    + ".lp-x{position:absolute;z-index:2;top:12px;right:12px;width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:999px;background:rgba(6,11,18,.6);color:#f4f7fb;cursor:pointer;opacity:.85;transition:opacity .15s,background-color .15s;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}"
    + ".lp-x:hover{opacity:1;background:rgba(6,11,18,.85)}"
    + ".lp-x svg{width:18px;height:18px}"
    // p-6 md:p-8
    + ".lp-corps{padding:4px 24px 22px}"
    + ".lp ::selection{background:rgba(32,213,239,.3);color:#f4f7fb}"
    // DialogTitle text-2xl font-bold tracking-tight -> Anton (charte)
    + ".lp-titre{margin:0;font-family:Anton,Impact,'Arial Narrow Bold',sans-serif;font-weight:400;font-size:38px;line-height:1.02;letter-spacing:.005em;text-transform:uppercase;color:#f4f7fb;text-wrap:balance}"
    + ".lp-titre em{font-style:normal;color:#20d5ef}"
    // DialogDescription text-muted-foreground mt-2
    + ".lp-desc{margin:10px 0 0;font-size:16px;line-height:1.45;color:#c6d1de;text-wrap:pretty}"
    + ".lp-desc b{color:#f4f7fb;font-weight:700}"
    // promoText text-sm mt-4 : les 3 avantages
    + ".lp-points{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:9px}"
    + ".lp-points li{display:flex;align-items:flex-start;gap:10px;font-size:15px;line-height:1.35;font-weight:600;color:#f4f7fb}"
    + ".lp-points svg{flex:none;width:20px;height:20px;padding:3px;margin-top:-1px;border-radius:999px;color:#04141b;background:#20d5ef;stroke-width:3}"
    // form mt-6 space-y-4 ; Button w-full font-semibold size lg
    + ".lp-actions{margin-top:20px;display:flex;flex-direction:column;gap:6px}"
    + ".lp-cta{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:12px;background:#20d5ef;color:#04141b;font-size:17px;font-weight:800;text-decoration:none;letter-spacing:-.01em;box-shadow:0 12px 28px -10px rgba(32,213,239,.6);transition:background-color .15s ease,transform .15s ease}"
    + ".lp-cta:hover{background:#5fe2f4}"
    + ".lp-cta:active{transform:translateY(1px)}"
    + ".lp-cta svg{width:20px;height:20px;transition:transform .15s ease}"
    + ".lp-cta:hover svg{transform:translateX(3px)}"
    + ".lp-pied{display:flex;align-items:center;justify-content:space-between;gap:12px}"
    + ".lp-lien{display:inline-flex;align-items:center;gap:6px;min-height:44px;color:#c6d1de;font-size:14px;font-weight:600;text-decoration:underline;text-decoration-color:rgba(198,209,222,.35);text-underline-offset:4px;border-radius:8px}"
    + ".lp-lien:hover{color:#f4f7fb;text-decoration-color:#f4f7fb}"
    + ".lp-lien svg{width:14px;height:14px}"
    + ".lp-age{margin:0;font-size:12px;font-weight:600;color:#91a0b3}"
    + ".lp-age span{display:inline-block;padding:2px 6px;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(141,179,211,.3)}"
    + ".lp-x:focus-visible,.lp-cta:focus-visible,.lp-lien:focus-visible{outline:2px solid #20d5ef;outline-offset:3px}"
    + "@media (min-width:768px){.lp-img{height:192px}.lp-corps{padding:6px 32px 28px}.lp-titre{font-size:44px}}"
    + "@media (max-width:359px){.lp-titre{font-size:32px}.lp-img{height:150px}}"
    + "@media (max-height:640px){.lp-img{height:130px}.lp-titre{font-size:32px}}"
    // Volet des inscrits connectes : carte discrete, non bloquante.
    + ".lv{position:fixed;z-index:2147482000;left:16px;right:16px;bottom:calc(84px + env(safe-area-inset-bottom));max-width:380px;margin:0 auto;padding:16px 44px 16px 16px;background:#0d1926;border:1px solid rgba(141,179,211,.18);border-radius:14px;box-shadow:0 18px 40px -12px rgba(0,0,0,.7);color:#f4f7fb;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;animation:lvIn .32s cubic-bezier(.16,1,.3,1)}"
    + "@keyframes lvIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}"
    + "@media (min-width:768px){.lv{left:24px;right:auto;bottom:100px;margin:0;width:360px}}"
    + ".lv-t{margin:0;font-family:Anton,Impact,'Arial Narrow Bold',sans-serif;font-weight:400;font-size:20px;line-height:1.1;letter-spacing:.005em;text-transform:uppercase;color:#20d5ef}"
    + ".lv-p{margin:6px 0 12px;font-size:13.5px;line-height:1.5;color:#c6d1de}"
    + ".lv-p b{color:#f4f7fb;font-weight:700;white-space:nowrap}"
    + ".lv-cta{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;border-radius:10px;background:#20d5ef;color:#04141b;font-size:14px;font-weight:800;text-decoration:none;transition:background-color .15s}"
    + ".lv-cta:hover{background:#5fe2f4}"
    + ".lv-x{position:absolute;top:6px;right:6px;width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:#91a0b3;cursor:pointer}"
    + ".lv-x:hover{color:#f4f7fb;background:rgba(255,255,255,.05)}"
    + ".lv-x svg{width:16px;height:16px}"
    + ".lv-cta:focus-visible,.lv-x:focus-visible{outline:2px solid #20d5ef;outline-offset:3px}"
    + "@media (prefers-reduced-motion:reduce){.lp[open] .lp-c,.lp[open]::backdrop,.lv,.lp-a{animation:none}.lp-cta,.lp-cta svg{transition:none}}";

  function style() {
    police();
    if (document.getElementById("lp-style")) return;
    var st = document.createElement("style");
    st.id = "lp-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // Ferme ou clique : il ne revient que le lendemain (sauf ?lolly=1).
  function marquer() { try { localStorage.setItem(CLE, jour()); } catch (e) {} }

  // 1) Panneau : true s'il s'est ouvert.
  function ouvrir() {
    if (typeof HTMLDialogElement === "undefined") return false;
    if (document.querySelector("dialog[open]")) return false; // jamais par-dessus une autre fenetre
    if (!FORCE) {
      try { if (localStorage.getItem(CLE) === jour()) return false; } catch (e) { return false; }
    }

    var T = TEXTES[langue()];
    var qui = inscrit();
    style();
    var points = T.points.map(function (p) { return "<li>" + ico(I_OK) + "<span>" + esc(p) + "</span></li>"; }).join("");
    var d = document.createElement("dialog");
    d.className = "lp";
    d.setAttribute("aria-labelledby", "lpTitre");
    d.setAttribute("aria-describedby", "lpDesc");
    d.innerHTML = '<div class="lp-c" tabindex="-1">'
      + '<div class="lp-img"><img src="/assets/hero/stade-nuit.webp" alt="" width="1920" height="1080" decoding="async">'
      + '<p class="lp-duo"><img src="/assets/iashark-logo.png" alt="IASHARK" width="113" height="30"><span aria-hidden="true">×</span>'
      + '<span class="lp-logo"><img src="/assets/bk/lolly.svg" alt="Lolly Bet" width="89" height="20"></span></p></div>'
      + '<div class="lp-corps">'
      + '<h2 class="lp-titre lp-a lp-a1" id="lpTitre">' + esc(T.titre) + " <em>" + esc(T.titre_fort) + "</em></h2>"
      + '<p class="lp-desc lp-a lp-a2" id="lpDesc">' + esc(T.desc) + "</p>"
      + '<ul class="lp-points lp-a lp-a3">' + points + "</ul>"
      + '<div class="lp-actions lp-a lp-a4">'
      + '<a class="lp-cta" href="' + esc(lienPro()) + '" data-lp-clic="pro">' + esc(T.cta) + ico(I_FLECHE) + "</a>"
      + '<div class="lp-pied"><a class="lp-lien" href="' + LIEN + '" target="_blank" rel="sponsored noopener" data-lp-clic="lolly">' + esc(T.lolly) + ico(I_EXT) + "</a>"
      + '<p class="lp-age"><span>18+</span></p></div>'
      + "</div></div>"
      + '<button type="button" class="lp-x" aria-label="' + esc(T.fermer) + '">' + ico(I_X) + "</button>"
      + "</div>";
    document.body.appendChild(d);

    var fini = false;
    var fermer = function (how) {
      marquer();
      if (!fini) { fini = true; mesurer("lolly_panneau_ferme", { forme: "panneau", inscrit: qui, how: how }); }
      if (d.open) d.close();
    };
    d.querySelector(".lp-x").addEventListener("click", function () { fermer("croix"); });
    d.addEventListener("click", function (e) { if (e.target === d) fermer("fond"); });
    d.addEventListener("cancel", function (e) { e.preventDefault(); fermer("echap"); });
    d.addEventListener("close", function () { if (d.parentNode) d.parentNode.removeChild(d); });
    Array.prototype.forEach.call(d.querySelectorAll("[data-lp-clic]"), function (a) {
      a.addEventListener("click", function () {
        marquer();
        if (!fini) { fini = true; mesurer("lolly_panneau_clic", { forme: "panneau", inscrit: qui, how: a.getAttribute("data-lp-clic") }); }
        // Lolly s'ouvre dans un nouvel onglet ; la page Pro offert remplace celle-ci.
        setTimeout(function () { if (d.open) d.close(); }, 0);
      });
    });

    try { d.showModal(); } catch (e) { if (d.parentNode) d.parentNode.removeChild(d); return false; }
    // Focus sur le panneau lui-meme (pas d'anneau de focus a l'ouverture sur telephone) ;
    // au clavier, Tab mene au bouton principal, au lien Lolly puis a la croix ; Echap ferme.
    try { d.querySelector(".lp-c").focus({ preventScroll: true }); } catch (e) {}
    // « vu » une fois par jour et par onglet (il peut revenir de page en page tant qu'il n'est pas ferme).
    var dejaVu = false;
    try { dejaVu = sessionStorage.getItem("iashark_lolly_vu") === jour(); sessionStorage.setItem("iashark_lolly_vu", jour()); } catch (e) {}
    if (!dejaVu || FORCE) mesurer("lolly_panneau_vu", { forme: "panneau", inscrit: qui });
    return true;
  }

  // 2) Volet des inscrits connectes (pas Pro, aucune demande Pro offert).
  function volet() {
    var app = window.IasharkApp;
    if (!app || !app.supabase || typeof app.context !== "function" || !inscrit()) return;
    try {
      if (localStorage.getItem(CLE_VOLET) === jour()) return;
      if (localStorage.getItem(CLE) !== jour()) return; // le panneau d'abord, ferme ce jour-la
    } catch (e) { return; }
    Promise.resolve(app.context()).then(function (ctx) {
      if (!ctx || !ctx.session || ctx.isPro || ctx.isAdmin) return null;
      var email = emailMasque((ctx.user && ctx.user.email) || (ctx.profile && ctx.profile.email));
      if (!email) return null;
      return Promise.resolve(app.supabase.from("pro_offert_demandes").select("statut").limit(1)).then(function (r) {
        if (!r || r.error || !r.data || r.data.length) return null;
        return email;
      });
    }).then(function (email) {
      if (!email || document.querySelector("dialog[open]") || document.querySelector(".lv")) return;
      try {
        if (localStorage.getItem(CLE_VOLET) === jour()) return;
        localStorage.setItem(CLE_VOLET, jour());
      } catch (e) { return; }
      var T = TEXTES[langue()];
      style();
      var v = document.createElement("aside");
      v.className = "lv";
      v.setAttribute("aria-labelledby", "lvTitre");
      var texte = esc(T.volet).replace("{email}", "<b>" + esc(email) + "</b>");
      v.innerHTML = '<button type="button" class="lv-x" aria-label="' + esc(T.fermer) + '">' + ico(I_X) + "</button>"
        + '<p class="lv-t" id="lvTitre">' + esc(T.volet_titre) + "</p>"
        + '<p class="lv-p">' + texte + "</p>"
        + '<a class="lv-cta" href="' + esc(lienPro()) + '">' + esc(T.volet_cta) + "</a>";
      document.body.appendChild(v);
      var fini = false;
      var retirer = function () { if (v.parentNode) v.parentNode.removeChild(v); document.removeEventListener("keydown", echap); };
      var echap = function (e) {
        if (e.key === "Escape" && v.contains(document.activeElement)) {
          if (!fini) { fini = true; mesurer("lolly_panneau_ferme", { forme: "volet", inscrit: true, how: "echap" }); }
          retirer();
        }
      };
      document.addEventListener("keydown", echap);
      v.querySelector(".lv-x").addEventListener("click", function () {
        if (!fini) { fini = true; mesurer("lolly_panneau_ferme", { forme: "volet", inscrit: true, how: "croix" }); }
        retirer();
      });
      v.querySelector(".lv-cta").addEventListener("click", function () {
        if (!fini) { fini = true; mesurer("lolly_panneau_clic", { forme: "volet", inscrit: true, how: "pro" }); }
      });
      mesurer("lolly_panneau_vu", { forme: "volet", inscrit: true });
    }).catch(function () {});
  }

  function lancer() {
    setTimeout(function () {
      var ouvert = ouvrir();
      // Jamais les deux sur la meme page : le volet attend que le panneau soit ferme.
      if (!ouvert && !FORCE) setTimeout(volet, 600);
    }, 1200);
  }
  if (document.readyState === "complete") lancer();
  else window.addEventListener("load", lancer, { once: true });
})();
