/* IASHARK — panneau Lolly Bet a l'arrivee (15/11/2026, demande de Clement :
   « faut vraiment bien vendre le truc, fais un bon panneau pour vraiment attirer
   les gens a cliquer »).

   Charge par site-prefs.js (comme funnel-track.js), qui ne telecharge ce script
   que pour la PREMIERE page d'une visite (onglet), hors pages exclues.

   Quand : a tous (inscrits ou non), une fois par jour et par navigateur (cle
   localStorage iashark_lolly_panneau = date du jour, posee des l'affichage :
   ferme ou clique, il ne revient que le lendemain). Sans localStorage : jamais
   (impossible de ne pas le remontrer a chaque page). Jamais pour un robot, jamais
   par-dessus une autre fenetre (dialog deja ouvert), jamais sur connexion,
   inscription, compte, paiement, Pro, page Lolly.

   Design : composant « Welcome Modal » de 21st.dev (ravikatiyar162, id 4931),
   structure et classes reprises en CSS simple (pas de React sur le site) : fond
   noir 80 %, carte centree arrondie 16 px, entree fondu + zoom 95 -> 100 %, croix
   en haut a droite, titre + description, contenu, encadre gris (ici l'offre),
   barre d'action (18+ a gauche, bouton principal a droite avec l'icone « lien
   externe »). Couleurs et polices : charte IASHARK.

   Avantages affiches : verifies le 15/11/2026 sur le site officiel Lolly Bet
   (accueil, menu Sports > Live, pied de page des moyens de paiement, offre
   « Sports : 1er pari remboursé jusqu'a 100€ en CASH ») ou valides par Clement
   (« meilleures cotes », 12/11). Retires faute de preuve : streaming des matchs,
   « securite » (licence d'Anjouan, plaintes : PARTENAIRES.md).

   Mesure (funnel_events, migration 0076) : lolly_panneau_vu, lolly_panneau_clic,
   lolly_panneau_ferme { inscrit, how } ; inscrit = une session est ouverte dans
   ce navigateur (jamais laquelle). */
(function () {
  "use strict";
  if (window.__iasharkLollyPanneau) return;
  window.__iasharkLollyPanneau = true;

  var CLE = "iashark_lolly_panneau";
  var LIEN = "/go/lolly/site";

  var TEXTES = {
    fr: {
      titre: "Les marchés que les autres n’ont pas",
      desc: "Corners, cartons, joueurs personnalisés, tirs cadrés. Ils sont chez Lolly Bet, notre partenaire.",
      points: ["Meilleures cotes", "Paris en direct", "Même les petits championnats", "Carte, virement ou crypto"],
      bonus: "Bonus avec notre lien",
      offre: "1er pari remboursé en cash jusqu’à 100\u00a0€",
      cta: "Découvrir Lolly Bet",
      fermer: "Fermer"
    },
    en: {
      titre: "The markets the others don’t have",
      desc: "Corners, cards, player bets, shots on target. They’re at Lolly Bet, our partner.",
      points: ["Best odds", "Live betting", "Even the small leagues", "Card, bank transfer or crypto"],
      bonus: "Bonus with our link",
      offre: "First bet refunded in cash up to €100",
      cta: "Discover Lolly Bet",
      fermer: "Close"
    },
    es: {
      titre: "Los mercados que los demás no tienen",
      desc: "Córners, tarjetas, apuestas de jugador, tiros a puerta. Están en Lolly Bet, nuestro socio.",
      points: ["Mejores cuotas", "Apuestas en directo", "Hasta las ligas pequeñas", "Tarjeta, transferencia o cripto"],
      bonus: "Bono con nuestro enlace",
      offre: "1.ª apuesta reembolsada en efectivo hasta 100\u00a0€",
      cta: "Descubrir Lolly Bet",
      fermer: "Cerrar"
    },
    pt: {
      titre: "Os mercados que os outros não têm",
      desc: "Cantos, cartões, apostas em jogadores, remates à baliza. Estão na Lolly Bet, a nossa parceira.",
      points: ["Melhores odds", "Apostas ao vivo", "Até as ligas pequenas", "Cartão, transferência ou cripto"],
      bonus: "Bónus com o nosso link",
      offre: "1.ª aposta reembolsada em dinheiro até 100\u00a0€",
      cta: "Descobrir a Lolly Bet",
      fermer: "Fechar"
    }
  };

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

  // Icones lucide (memes traces que lucide-react, utilisees par le composant).
  function ico(d) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  var I_X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
  var I_EXT = '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>';
  var I_POINTS = [
    '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>', // trending-up
    '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>', // radio
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>', // globe
    '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>' // credit-card
  ];
  var I_GIFT = '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>';

  var CSS = ""
    // Dialog (Radix -> <dialog> natif : piege du focus, Echap, fond inerte).
    + ".lp{border:0;padding:0;margin:auto;background:transparent;color:#f4f7fb;width:min(576px,calc(100% - 32px));max-width:none;max-height:calc(100dvh - 32px);overflow:visible;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}"
    + ".lp::backdrop{background:rgba(0,0,0,.8)}"
    + ".lp[open]::backdrop{animation:lpFond .2s ease-out}"
    + ".lp-c{position:relative;max-height:calc(100dvh - 32px);overflow:auto;background:#0a1420;background-image:radial-gradient(110% 60% at 100% 0%,rgba(32,213,239,.12),transparent 62%);border:1px solid rgba(141,179,211,.16);border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,.6);outline:none}"
    + ".lp[open] .lp-c{animation:lpIn .2s cubic-bezier(.16,1,.3,1)}"
    + "@keyframes lpIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}"
    + "@keyframes lpFond{from{opacity:0}to{opacity:1}}"
    + ".lp-x{position:absolute;top:10px;right:10px;width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:#91a0b3;cursor:pointer;opacity:.85;transition:opacity .15s,color .15s,background-color .15s}"
    + ".lp-x:hover{opacity:1;color:#f4f7fb;background:rgba(255,255,255,.05)}"
    + ".lp-x svg{width:18px;height:18px}"
    // p-6 sm:p-8 pb-0
    + ".lp-haut{padding:24px 24px 0}"
    + ".lp-duo{display:flex;align-items:center;gap:10px;margin:0 44px 18px 0;color:#91a0b3;font-size:13px}"
    + ".lp-duo>img{display:block;height:20px;width:auto}"
    + ".lp-logo{display:inline-flex;align-items:center;padding:6px 10px;border-radius:8px;background:#060b12;box-shadow:inset 0 0 0 1px rgba(141,179,211,.22)}"
    + ".lp-logo img{display:block;height:15px;width:auto}"
    + ".lp ::selection{background:rgba(32,213,239,.3);color:#f4f7fb}"
    // DialogTitle text-xl sm:text-2xl font-bold / DialogDescription text-base text-muted-foreground pt-1
    + ".lp-titre{margin:0;font-size:22px;line-height:1.2;font-weight:800;letter-spacing:-.02em;text-wrap:balance}"
    + ".lp-desc{margin:0;padding-top:6px;font-size:15.5px;line-height:1.5;color:#c6d1de;text-wrap:pretty}"
    + ".lp-desc b{color:#f4f7fb;font-weight:700}"
    // py-6 : les points forts
    + ".lp-points{list-style:none;margin:0;padding:20px 0 22px;display:grid;grid-template-columns:1fr 1fr;gap:14px 16px}"
    + ".lp-points li{display:flex;align-items:center;gap:10px;font-size:14.5px;line-height:1.3;font-weight:600;color:#f4f7fb}"
    + ".lp-points svg{flex:none;width:34px;height:34px;padding:7px;border-radius:10px;color:#20d5ef;background:rgba(32,213,239,.1)}"
    // px-6 sm:px-8 pb-6 sm:pb-8 space-y-6
    + ".lp-bas{padding:0 24px 22px;display:flex;flex-direction:column;gap:18px}"
    // bg-muted/50 rounded-lg p-4 flex items-start space-x-3
    + ".lp-offre{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:10px;background:rgba(141,179,211,.07);color:inherit;text-decoration:none;transition:background-color .15s}"
    + ".lp-offre:hover{background:rgba(141,179,211,.11)}"
    + ".lp-offre svg{flex:none;width:20px;height:20px;margin-top:1px;color:#91a0b3}"
    + ".lp-offre b{display:block;font-size:14.5px;font-weight:700;color:#f4f7fb}"
    + ".lp-offre span{display:block;margin-top:2px;font-size:13.5px;line-height:1.45;color:#91a0b3}"
    // flex flex-col-reverse sm:flex-row sm:items-center gap-4 sm:gap-2
    + ".lp-actions{display:flex;flex-direction:column-reverse;gap:12px}"
    + ".lp-age{margin:0;text-align:center;font-size:12px;font-weight:600;color:#91a0b3}"
    + ".lp-age span{display:inline-block;padding:2px 6px;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(141,179,211,.3)}"
    + ".lp-grow{display:none}"
    + ".lp-cta{display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:0 28px;border-radius:12px;background:#20d5ef;color:#04141b;font-size:15.5px;font-weight:800;text-decoration:none;letter-spacing:-.005em;box-shadow:0 10px 24px -10px rgba(32,213,239,.55);transition:background-color .15s ease,transform .15s ease}"
    + ".lp-cta:hover{background:#5fe2f4}"
    + ".lp-cta:active{transform:translateY(1px)}"
    + ".lp-cta svg{width:16px;height:16px}"
    + ".lp-x:focus-visible,.lp-cta:focus-visible,.lp-offre:focus-visible{outline:2px solid #20d5ef;outline-offset:3px}"
    + "@media (min-width:640px){"
    + ".lp-haut{padding:32px 32px 0}"
    + ".lp-titre{font-size:26px}"
    + ".lp-bas{padding:0 32px 32px;gap:22px}"
    + ".lp-actions{flex-direction:row;align-items:center;gap:8px}"
    + ".lp-grow{display:block;flex:1}"
    + ".lp-age{text-align:left}"
    + "}"
    + "@media (max-width:359px){.lp-points{grid-template-columns:1fr}}"
    + "@media (prefers-reduced-motion:reduce){.lp[open] .lp-c,.lp[open]::backdrop{animation:none}.lp-cta{transition:none}}";

  function ouvrir() {
    if (typeof HTMLDialogElement === "undefined") return;
    if (document.querySelector("dialog[open]")) return; // jamais par-dessus une autre fenetre
    try {
      if (localStorage.getItem(CLE) === jour()) return;
      localStorage.setItem(CLE, jour());
    } catch (e) { return; }

    var T = TEXTES[langue()];
    var qui = inscrit();
    if (!document.getElementById("lp-style")) {
      var st = document.createElement("style");
      st.id = "lp-style";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var points = T.points.map(function (p, i) { return "<li>" + ico(I_POINTS[i]) + esc(p) + "</li>"; }).join("");
    var d = document.createElement("dialog");
    d.className = "lp";
    d.setAttribute("aria-labelledby", "lpTitre");
    d.setAttribute("aria-describedby", "lpDesc");
    d.innerHTML = '<div class="lp-c" tabindex="-1">'
      + '<button type="button" class="lp-x" aria-label="' + esc(T.fermer) + '">' + ico(I_X) + "</button>"
      + '<div class="lp-haut">'
      + '<p class="lp-duo"><img src="/assets/iashark-logo.png" alt="IASHARK" width="90" height="24"><span aria-hidden="true">×</span>'
      + '<span class="lp-logo"><img src="/assets/bk/lolly.svg" alt="Lolly Bet" width="80" height="18"></span></p>'
      + '<h2 class="lp-titre" id="lpTitre">' + esc(T.titre) + "</h2>"
      + '<p class="lp-desc" id="lpDesc">' + esc(T.desc) + "</p>"
      + '<ul class="lp-points">' + points + "</ul>"
      + "</div>"
      + '<div class="lp-bas">'
      + '<a class="lp-offre" href="' + LIEN + '" target="_blank" rel="sponsored noopener" data-lp-clic="offre">' + ico(I_GIFT) + "<div><b>" + esc(T.bonus) + "</b><span>" + esc(T.offre) + "</span></div></a>"
      + '<div class="lp-actions">'
      + '<p class="lp-age"><span>18+</span></p>'
      + '<div class="lp-grow"></div>'
      + '<a class="lp-cta" href="' + LIEN + '" target="_blank" rel="sponsored noopener" data-lp-clic="bouton">' + esc(T.cta) + ico(I_EXT) + "</a>"
      + "</div></div></div>";
    document.body.appendChild(d);

    var fini = false;
    var fermer = function (how) {
      if (!fini) { fini = true; mesurer("lolly_panneau_ferme", { inscrit: qui, how: how }); }
      if (d.open) d.close();
    };
    d.querySelector(".lp-x").addEventListener("click", function () { fermer("croix"); });
    d.addEventListener("click", function (e) { if (e.target === d) fermer("fond"); });
    d.addEventListener("cancel", function (e) { e.preventDefault(); fermer("echap"); });
    d.addEventListener("close", function () { if (d.parentNode) d.parentNode.removeChild(d); });
    Array.prototype.forEach.call(d.querySelectorAll("[data-lp-clic]"), function (a) {
      a.addEventListener("click", function () {
        if (!fini) { fini = true; mesurer("lolly_panneau_clic", { inscrit: qui, how: a.getAttribute("data-lp-clic") }); }
        // Le site de Lolly s'ouvre dans un nouvel onglet : on referme le panneau ici.
        setTimeout(function () { if (d.open) d.close(); }, 0);
      });
    });

    try { d.showModal(); } catch (e) { if (d.parentNode) d.parentNode.removeChild(d); return; }
    // Focus sur le panneau lui-meme (pas d'anneau de focus a l'ouverture sur telephone) ;
    // au clavier, Tab mene a la croix, a l'offre puis au bouton principal, Echap ferme.
    try { d.querySelector(".lp-c").focus({ preventScroll: true }); } catch (e) {}
    mesurer("lolly_panneau_vu", { inscrit: qui });
  }

  function lancer() { setTimeout(ouvrir, 1200); }
  if (document.readyState === "complete") lancer();
  else window.addEventListener("load", lancer, { once: true });
})();
