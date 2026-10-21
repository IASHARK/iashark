// PREUVE « HIER » (etape 2 du plan de Clement du 21/10/2026 : « on montre ce qu'on vend, gagne ou perdu », et
// « pourquoi parler de X sur le site, il ne faut pas tout melanger ») : une ligne sur l'accueil et la page Pro, tiree
// du seul fichier preuves/bilan-hier.json (lib/bilan-hier.js, ecrit chaque matin par le calcul quotidien) : le pari
// offert et la Selection en or de la veille, gagnes ET perdus. Affichee seulement quand le fichier porte bien sur la
// veille du visiteur ; sinon rien (jamais un vieux bilan). Aucune couleur verte ou rouge : un resultat n'est
// pas un ecart chiffre.
(function (G) {
  "use strict";
  var hasOwn = Object.prototype.hasOwnProperty;
  function t(key, fb) { return (G && G.I18N && G.I18N.t) ? G.I18N.t(key, fb) : fb; }
  function tf(key, fb, vars) {
    var s = String(t(key, fb));
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return hasOwn.call(vars, k) && vars[k] != null ? vars[k] : m; }) : s;
  }
  function L() { return (G && G.I18N && G.I18N.localeTag) ? G.I18N.localeTag() : "fr-FR"; }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function cote(v) { return Number(v).toLocaleString(L(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // Veille DU VISITEUR (jour precedent de son calendrier, controle de l'avocat du diable du 21/10/2026) : au Mexique
  // le soir, le jour de Paris est deja le lendemain ; un « hier » calcule a Paris annoncerait un match du jour meme.
  // Jour calendaire (jamais « maintenant moins 24 h », faux les jours de changement d'heure). AAAA-MM-JJ.
  function hierLocal(nowMs) {
    var n = new Date(typeof nowMs === "number" ? nowMs : Date.now());
    var d = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1, 12);
    var p = function (x) { return (x < 10 ? "0" : "") + x; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  // Texte de la ligne (HTML echappe) ou "" quand il n'y a rien de regle a montrer.
  function texte(b) {
    var parts = [];
    var o = b && b.offert;
    if (o && o.match && o.cote && (o.resultat === "gagne" || o.resultat === "perdu")) {
      parts.push(o.resultat === "gagne"
        ? tf("preuve_hier.offert_gagne", "Hier, le pari offert sur {match} (cote {cote}) est passé.", { match: esc(o.match), cote: cote(o.cote) })
        : tf("preuve_hier.offert_perdu", "Hier, le pari offert sur {match} (cote {cote}) n’est pas passé.", { match: esc(o.match), cote: cote(o.cote) }));
    }
    var s = b && b.selection_or;
    if (s && s.regles > 0) {
      var n = Number(s.annules) || 0;
      var annules = n === 1 ? t("preuve_hier.annule_1", "1 match annulé") : tf("preuve_hier.annule_n", "{n} matchs annulés", { n: n });
      var cle = (parts.length ? "preuve_hier.or" : "preuve_hier.or_seule") + (n ? "_annules" : "");
      var fb = (parts.length ? "Sélection en or : {won} sur {total}" : "Hier, Sélection en or : {won} sur {total}") + (n ? ", {annules}." : ".");
      parts.push(tf(cle, fb, { won: s.gagnes, total: s.regles, annules: annules }));
    }
    return parts.join(" ");
  }

  function monter(els, b, nowMs) {
    if (!b || b.jour !== hierLocal(nowMs)) return 0;
    var s = texte(b);
    if (!s) return 0;
    els.forEach(function (el) {
      el.innerHTML = "<span class=\"ph-point\" aria-hidden=\"true\"></span><span>" + s + "</span>";
      el.hidden = false;
    });
    return els.length;
  }

  function demarrer() {
    var els = [].slice.call(document.querySelectorAll("[data-preuve-hier]"));
    if (!els.length || typeof G.fetch !== "function") return;
    // Traductions chargees AVANT d'ecrire la ligne (jamais une ligne en francais sur /en/, /es/...), comme
    // lib/offre-pro.js : I18N.init() si le dictionnaire n'est pas encore la.
    var dico = G.I18N && G.I18N.init && !G.I18N.dict ? Promise.resolve().then(function () { return G.I18N.init(); }).catch(function () {}) : Promise.resolve();
    var bilan = G.fetch("/preuves/bilan-hier.json", { cache: "no-cache" }).then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; });
    Promise.all([bilan, dico]).then(function (x) { monter(els, x[0]); }).catch(function () { /* pas de bilan : rien a montrer */ });
  }

  G.IasharkPreuveHier = { texte: texte, hierLocal: hierLocal, monter: monter };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
    else demarrer();
  }
})(typeof window !== "undefined" ? window : this);
