// PREUVE « HIER » (etape 2 du plan de Clement du 21/10/2026 : « on montre ce qu'on vend, gagne ou perdu », et
// « pourquoi parler de X sur le site, il ne faut pas tout melanger ») : une ligne sur l'accueil et la page Pro, tiree
// du seul fichier preuves/bilan-hier.json (lib/bilan-hier.js, ecrit chaque matin par le calcul quotidien) : le pari
// offert et la Selection en or de la veille, gagnes ET perdus. Affichee seulement quand le fichier porte bien sur la
// veille (heure de Paris) ; sinon rien (jamais un vieux bilan). Aucune couleur verte ou rouge : un resultat n'est
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

  // Veille a Paris, AAAA-MM-JJ (le format en-CA de Intl).
  function hierParis(nowMs) {
    var d = new Date((typeof nowMs === "number" ? nowMs : Date.now()) - 864e5);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
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
      parts.push(tf(parts.length ? "preuve_hier.or" : "preuve_hier.or_seule",
        parts.length ? "Sélection en or : {won} sur {total}." : "Hier, Sélection en or : {won} sur {total}.", { won: s.gagnes, total: s.regles }));
    }
    return parts.join(" ");
  }

  function monter(els, b, nowMs) {
    if (!b || b.jour !== hierParis(nowMs)) return 0;
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
    G.fetch("/preuves/bilan-hier.json", { cache: "no-cache" })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (b) { monter(els, b); })
      .catch(function () { /* pas de bilan : rien a montrer */ });
  }

  G.IasharkPreuveHier = { texte: texte, hierParis: hierParis, monter: monter };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
    else demarrer();
  }
})(typeof window !== "undefined" ? window : this);
