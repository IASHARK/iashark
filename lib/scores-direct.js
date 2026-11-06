/* IASHARK — scores en direct (06/11/2026, demande de Clement).
   Source unique : la fonction serveur scores-direct (supabase/functions/scores-direct), qui relit API-Sports au plus
   une fois par minute pour tout le site ; la cle API-Sports n'est jamais dans le navigateur.
   La page marque ce qu'elle veut voir vivre :
     [data-sd-fid="<numero du match>"][data-sd-ts="<coup d'envoi en ms>"]
   - LIGNE DE MATCH (accueil, home-list.js) : [data-sd-g="h"] / [data-sd-g="a"] recoivent les buts, [data-sd-t] la minute
     (« 67' », « MT », « Fin ») ; la ligne prend la classe sd-live ou sd-fini.
   - JAMBE DE TICKET (page combines, ticket Pro ouvert) : [data-sd-jambe] recoit « 2-1 · 67' » ; avec data-sd-m (code du
     marche, ex. over-25), la ligne de la jambe (li) prend sd-passe / sd-perdu / sd-cours. C'est un etat PROVISOIRE,
     calcule sur le score du direct : le resultat officiel reste celui de l'archive (calcul du matin).
   Aucun appel s'il n'y a aucun match commence dans les 3 dernieres heures (ou termine aujourd'hui sans score connu) ;
   aucun appel quand l'onglet est cache. Un score absent n'affiche rien : jamais un chiffre invente. */
(function (G) {
  "use strict";
  if (!G || !G.document) return;
  var D = G.document;
  var URL_F = "https://ksvjraqitxouwiabecai.supabase.co/functions/v1/scores-direct";
  var PERIODE = 60000, AVANT = 2 * 60000, FENETRE = 3 * 3600000, JOURNEE = 14 * 3600000;
  var FINIS = /^(FT|AET|PEN)$/, ARRETES = /^(PST|CANC|ABD|SUSP|AWD|WO)$/, EN_COURS = /^(1H|HT|2H|ET|BT|P|LIVE|INT)$/;
  var scores = {}, stables = {}, enVol = false, minuteur = null;

  function t(k, fb) { return (G.I18N && G.I18N.t) ? G.I18N.t(k, fb) : fb; }

  // Etat provisoire d'un pari a partir du score du direct (null : on ne sait pas dire, on n'affiche que le score).
  // Prolongations / tirs au but : les buts envoyes comptent la prolongation, le pari se regle sur 90 min -> null.
  function etatPari(m, s) {
    if (!s || ARRETES.test(s.st)) return null;
    if (s.st === "AET" || s.st === "PEN" || s.st === "ET" || s.st === "BT" || s.st === "P") return null;
    var h = s.h, a = s.a;
    if (typeof h !== "number" || typeof a !== "number") return null;
    var fin = FINIS.test(s.st), tot = h + a;
    function seuil(ok) { return ok ? "passe" : fin ? "perdu" : "cours"; }
    function auFinal(ok) { return fin ? (ok ? "passe" : "perdu") : "cours"; }
    switch (String(m || "")) {
      case "over-05": return seuil(tot >= 1);
      case "over-15": return seuil(tot >= 2);
      case "over-25": return seuil(tot >= 3);
      case "over-35": return seuil(tot >= 4);
      case "btts-yes": return seuil(h > 0 && a > 0);
      case "home-team-over-05": return seuil(h > 0);
      case "away-team-over-05": return seuil(a > 0);
      case "fh-over-05":
        // Pendant la 1re mi-temps, API-Sports remplit parfois deja le score de mi-temps a 0-0 : on ne le lit qu'apres.
        if (s.mt && s.st !== "1H") return s.mt[0] + s.mt[1] > 0 ? "passe" : "perdu";
        return s.st === "1H" ? (tot > 0 ? "passe" : "cours") : null;
      case "home-win": return auFinal(h > a);
      case "away-win": return auFinal(a > h);
      case "draw": return auFinal(h === a);
      case "dc-1x": return auFinal(h >= a);
      case "dc-x2": return auFinal(a >= h);
      case "dc-12": return auFinal(h !== a);
      default: return null;
    }
  }

  function texteTemps(s) {
    if (FINIS.test(s.st)) return t("direct.ft", "Fin");
    if (s.st === "HT") return t("direct.ht", "MT");
    if (ARRETES.test(s.st)) return "";
    if (EN_COURS.test(s.st) && typeof s.min === "number") return s.min + "'";
    return "";
  }

  // N'ecrit que si le texte change (sinon l'observateur des changements tournerait en boucle).
  function ecrire(el, txt) { if (el.textContent !== txt) el.textContent = txt; }
  function marques() { return [].slice.call(D.querySelectorAll("[data-sd-fid]")); }

  // A appeler ? Un match dans sa fenetre de jeu, ou termine aujourd'hui dont on n'a pas encore le score final.
  function idsUtiles() {
    var now = Date.now(), ids = {}, utile = false;
    marques().forEach(function (el) {
      var id = el.getAttribute("data-sd-fid"), ts = Number(el.getAttribute("data-sd-ts"));
      if (!/^\d{1,12}$/.test(id || "") || !isFinite(ts)) return;
      var s = scores[id];
      if (s && (FINIS.test(s.st) || ARRETES.test(s.st))) return;
      if (ts - AVANT <= now && now - ts <= JOURNEE) {
        ids[id] = 1;
        if (now - ts <= FENETRE || !s) utile = true;
      }
    });
    return utile ? Object.keys(ids).slice(0, 120) : [];
  }

  function appliquer() {
    marques().forEach(function (el) {
      var s = scores[el.getAttribute("data-sd-fid")];
      if (!s || typeof s.h !== "number" || typeof s.a !== "number") return;
      var fini = FINIS.test(s.st), live = EN_COURS.test(s.st), temps = texteTemps(s);
      el.classList.toggle("sd-live", live);
      el.classList.toggle("sd-fini", fini);
      [].forEach.call(el.querySelectorAll("[data-sd-g]"), function (g) {
        ecrire(g, String(g.getAttribute("data-sd-g") === "a" ? s.a : s.h));
        g.hidden = false;
      });
      [].forEach.call(el.querySelectorAll("[data-sd-t]"), function (x) { ecrire(x, temps); x.hidden = !temps; });
      var j = el.matches("[data-sd-jambe]") ? el : el.querySelector("[data-sd-jambe]");
      if (j) {
        ecrire(j, s.h + "-" + s.a + (temps ? " · " + temps : ""));
        j.hidden = false;
        var li = j.closest("li, [data-sd-cible]");
        var e = etatPari(j.getAttribute("data-sd-m"), s);
        if (e === "passe" && live && (stables[el.getAttribute("data-sd-fid")] || 1) < 2) e = "cours";
        if (li) ["sd-passe", "sd-perdu", "sd-cours"].forEach(function (c) { li.classList.toggle(c, e === c.slice(3)); });
        j.setAttribute("aria-label", t("direct.score_aria", "Score en direct") + " : " + j.textContent);
      }
    });
  }

  function lire(ids) {
    var App = G.IasharkApp;
    if (App && App.supabase && App.supabase.functions) {
      return App.supabase.functions.invoke("scores-direct", { body: { ids: ids } }).then(function (r) { return r && !r.error ? r.data : null; }, function () { return null; });
    }
    if (typeof G.fetch !== "function") return Promise.resolve(null);
    return G.fetch(URL_F + "?ids=" + ids.join(","), { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function tour() {
    if (enVol || D.hidden) return;
    var ids = idsUtiles();
    if (!ids.length) return;
    enVol = true;
    lire(ids).then(function (rep) {
      enVol = false;
      if (!rep || rep.version !== 1 || !rep.scores || typeof rep.scores !== "object") return;
      Object.keys(rep.scores).forEach(function (id) {
        var n = rep.scores[id], v = scores[id];
        // Nombre de lectures de suite avec le meme score (controle de l'ingenieur donnees du 06/11/2026 : un but
        // annule par la VAR reste affiche quelques minutes chez API-Sports).
        stables[id] = v && n && v.h === n.h && v.a === n.a ? (stables[id] || 1) + 1 : 1;
        scores[id] = n;
      });
      appliquer();
    }, function () { enVol = false; });
  }

  // Les listes se redessinent (changement de jour, de filtre, connexion) : on remet les scores connus aussitot.
  var attente = null;
  function surChangement() {
    if (attente) return;
    attente = setTimeout(function () { attente = null; appliquer(); }, 80);
  }

  function demarrer() {
    if (minuteur) return;
    tour();
    minuteur = setInterval(tour, PERIODE);
    D.addEventListener("visibilitychange", function () { if (!D.hidden) tour(); });
    if (G.MutationObserver) new G.MutationObserver(surChangement).observe(D.body, { childList: true, subtree: true });
  }

  G.IasharkScoresDirect = { etatPari: etatPari, appliquer: appliquer, relancer: tour, _scores: scores };
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", function () { setTimeout(demarrer, 1500); });
  else setTimeout(demarrer, 1500);
})(typeof window !== "undefined" ? window : null);
