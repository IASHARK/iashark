/* IASHARK — bloc « Aujourd'hui » de l'accueil et du compte (04/10/2026) :
   ticket x5, ticket x10, Selection en or, buteur du jour.

   Donnees : fonction Edge tickets-du-jour (contrat v1, regles-tickets.md §5). Le
   SERVEUR choisit le jour (Paris) et le niveau du visiteur (anonyme, gratuit, pro)
   et n'envoie jamais le contenu d'un bloc verrouille : seulement son type, son
   statut, son nombre de matchs et sa cote totale. Ici, defense en plus : un bloc
   dont verrou n'est pas null n'est JAMAIS rendu avec ses details, meme si la
   reponse en contenait.

   Sous le flou : de FAUX chiffres CONSTANTS (FAUX_LIGNES), jamais tires de la
   reponse ; aria-hidden et inert. Un cadenas, une ligne « Ce que tu debloques »,
   UN seul bouton pour les quatre cartes. Aucune fausse urgence (pas de compte a
   rebours) ; jamais « sur », « garanti », « ticket gagnant », ni mise, gain,
   unite, capital ou esperance.

   Quatre cartes differentes, faites de VRAIS composants (voir « rendu ») : ticket
   (21st.dev Ticket Confirmation Card), Selection en or (Magic UI Shine Border, seul
   usage de l'or du site), buteur (Magic UI Animated Circular Progress Bar). Fonction
   absente ou reponse illisible : le bloc entier disparait (aucun trou). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkAujourdhui = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (G) {
  "use strict";
  var hasOwn = Object.prototype.hasOwnProperty;
  function t(key, fb) { return (G && G.I18N && G.I18N.t) ? G.I18N.t(key, fb) : fb; }
  function tf(key, fb, vars) {
    var s = String(t(key, fb));
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return hasOwn.call(vars, k) && vars[k] != null ? vars[k] : m; }) : s;
  }
  function L() { return (G && G.I18N && G.I18N.localeTag) ? G.I18N.localeTag() : "fr-FR"; }
  function estFr() { return !(G && G.I18N && G.I18N.locale) || G.I18N.locale === "fr"; }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function n(v) { if (v === null || v === undefined || v === "") return null; var x = Number(v); return Number.isFinite(x) ? x : null; }
  function cote(v) { return Number(v).toLocaleString(L(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pc(v) { return (Number(v) / 100).toLocaleString(L(), { style: "percent", maximumFractionDigits: 0 }); }
  function lien(p) { return (G && G.I18N && G.I18N.href) ? G.I18N.href(p) : "/" + p; }
  // Operateur affiche seulement sur le marche francais (liste agreee ANJ verifiee) ;
  // ailleurs, la cote sans nom tant que la liste agreee du pays n'est pas verifiee.
  function avecOperateur() { var M = G && G.IASHARK_MARKET; return !M || !M.code || M.code === "fr"; }
  // Heure (heure de Paris « AAAA-MM-JJ HH:MM ») dans le fuseau du visiteur.
  function heure(coupEnvoi) {
    var MT = G && G.IasharkMatchTime, hm = null;
    if (MT && MT.matchClock) { var c = MT.matchClock({ date: coupEnvoi }); hm = c ? c.slice(11, 16) : null; }
    if (!hm) { var m = /\d{2}:\d{2}$/.exec(String(coupEnvoi || "")); hm = m ? m[0] : null; }
    if (!hm) return "";
    if (/^fr/.test(L())) { var p = hm.split(":"); return Number(p[0]) + " h" + (p[1] !== "00" ? " " + p[1] : ""); }
    return hm;
  }
  function jourLong(jour) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour || ""))) return "";
    var d = new Date(jour + "T12:00:00Z");
    return isNaN(d) ? "" : d.toLocaleDateString(L(), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  }
  // Icones : Lucide (lib/icones.js, ISC), jamais dessinees a la main.
  function ico(k, cls) { var I = G && G.IasharkIcones; return I ? I.svg(k, cls || "aj-ico") : ""; }
  function K() { return G && G.IasharkComposants; }

  // ---------------------------------------------------------- lecture
  var TYPES = ["x5", "x10"];
  function bloc(rep, type) {
    if (type === "or") return rep && rep.selection_or || null;
    if (type === "buteur") return rep && rep.buteur_du_jour || null;
    return (rep && Array.isArray(rep.tickets) ? rep.tickets : []).filter(function (x) { return x && x.type === type; })[0] || null;
  }
  function ouvert(b) { return !!b && b.statut === "publie" && b.verrou === null; }
  function lisible(rep) { return !!rep && rep.version === 1 && Array.isArray(rep.tickets) && typeof rep.jour === "string"; }
  function jambesValides(b) {
    var l = Array.isArray(b && b.jambes) ? b.jambes : [];
    // Dans l'ordre des coups d'envoi (page et texte copie).
    return l.filter(function (j) { return j && j.domicile && j.exterieur && j.pari && n(j.cote) !== null && n(j.chance) !== null; })
      .map(function (j, i) { return { j: j, i: i }; })
      .sort(function (a, b) { return String(a.j.coup_envoi || "").localeCompare(String(b.j.coup_envoi || "")) || a.i - b.i; })
      .map(function (x) { return x.j; });
  }

  // ---------------------------------------------------------- textes
  var NOMS = { x5: ["aujourdhui.ticket_x5", "Ticket x5"], x10: ["aujourdhui.ticket_x10", "Ticket x10"] };
  function nomTicket(type) { return t(NOMS[type][0], NOMS[type][1]); }
  function enTete(b) {
    var bits = [];
    if (n(b.nb_matchs) !== null) bits.push(tf("aujourdhui.matches", "{n} matchs", { n: b.nb_matchs }));
    if (n(b.cote_totale) !== null) bits.push(tf("aujourdhui.total_odds", "cote totale {v}", { v: cote(b.cote_totale) }));
    return bits.join(" · ");
  }
  // Texte de « Copier le ticket » (format valide, regles et plan §4.3).
  function texteCopie(b, jour) {
    var l = jambesValides(b);
    var op = avecOperateur();
    var lignes = [nomTicket(b.type) + " IASHARK" + (jourLong(jour) ? " · " + jourLong(jour) : "")];
    l.forEach(function (j, i) {
      var h = heure(j.coup_envoi);
      lignes.push((i + 1) + ". " + j.domicile + " – " + j.exterieur + (h ? " (" + h + ")" : "") + " · " + j.pari + " · "
        + tf("aujourdhui.copy_odds", "cote {v}", { v: cote(j.cote) }) + (op && j.operateur ? " (" + j.operateur + ")" : "")
        + (j.etat === "reporte" || j.etat === "annule" ? " · " + t("aujourdhui.leg_postponed_short", "match reporté") : ""));
    });
    var unique = op && b.operateur_unique;
    lignes.push((unique || !op ? t("aujourdhui.copy_total", "Cote totale") : t("aujourdhui.copy_total_best", "Cote totale (meilleures cotes relevées)")) + " : " + cote(b.cote_totale) + (unique ? " · " + b.operateur_unique : ""));
    lignes.push(tf("aujourdhui.copy_chance", "Chance calculée du ticket : {v}", { v: pc(b.chance) }));
    lignes.push(t("aujourdhui.copy_legal", "Estimation statistique, pas une garantie. 18+"));
    lignes.push("iashark.com");
    return lignes.join("\n");
  }

  // ---------------------------------------------------------- rendu
  // COMPOSANTS (exigence de Clement du 04/10, 5 h 20 : de vrais composants) :
  //  - tickets x5 / x10 : 21st.dev « Ticket Confirmation Card » (auteur
  //    ravikatiyar162) : carte, encoches, lignes en pointilles, grille 2 colonnes,
  //    encadres ; bouton « Copier le ticket » : Magic UI « Animated Subscribe Button » ;
  //  - Selection en or : Magic UI « Shine Border » (or : seul usage du site) ;
  //  - buteur du jour : Magic UI « Animated Circular Progress Bar » ;
  //  - deblocage : icone Lucide + Magic UI « Shimmer Button ».
  // FAUX contenus CONSTANTS sous le flou (jamais lus dans la reponse).
  var FAUX_LIGNES = [["?? h", "Xxxxxxx – Xxxxxx", "Xxxxxxxx xxxxx", "?,??"], ["?? h", "Xxxxx – Xxxxxxxxx", "Xxx xxxx xxxxxx", "?,??"]];
  function lignesFausses() {
    return FAUX_LIGNES.map(function (x) {
      return '<li class="tc-box tk-leg"><span class="tk-t">' + x[0] + '</span><span class="tk-m"><b>' + x[1] + "</b><small>" + x[2] + '</small></span><span class="tk-o"><b>' + x[3] + "</b></span></li>";
    }).join("");
  }
  function flou(type) {
    if (type === "buteur") return '<div class="aj-blur bt-row" aria-hidden="true" inert><span class="bt-av">Xx</span><span class="tk-m"><b>Xx. Xxxxxxxx</b><small>Xxxxxxx – Xxxxxx</small></span><b class="bt-fake-v">?? %</b></div>';
    return '<ol class="tk-l aj-blur" aria-hidden="true" inert>' + lignesFausses() + "</ol>";
  }
  function message(texte) { return '<p class="aj-msg">' + esc(texte) + "</p>"; }
  function etatTexte(b, type) {
    if (!b || b.statut === "en_preparation") return t("aujourdhui.preparing", "En préparation pour aujourd’hui.");
    if (b.statut === "indisponible") return t("aujourdhui.unavailable", "Momentanément indisponible.");
    if (b.statut === "aucun") {
      if (type === "x5") return t("aujourdhui.none_x5", "Pas de ticket x5 aujourd’hui : aucune combinaison ne respecte nos règles (3 ou 4 matchs, cote totale entre 4,50 et 5,50). On ne force jamais un ticket.");
      if (type === "x10") return t("aujourdhui.none_x10", "Pas de ticket x10 aujourd’hui : aucune combinaison ne respecte nos règles (5 ou 6 matchs, cote totale entre 9 et 11). On ne force jamais un ticket.");
      if (type === "or") return t("aujourdhui.none_gold", "Pas de Sélection en or aujourd’hui : moins de 3 paris respectent nos règles.");
      return t("aujourdhui.none_scorer", "Pas de buteur du jour : aucun joueur n’atteint 10 % de chance.");
    }
    return "";
  }
  function ligneJambe(j, op) {
    var off = j.etat === "reporte" || j.etat === "annule";
    return '<li class="tc-box tk-leg' + (off ? " is-off" : "") + '"><span class="tk-t">' + esc(heure(j.coup_envoi)) + '</span><span class="tk-m"><b>' + esc(j.domicile + " – " + j.exterieur) + "</b><small>" + esc(j.pari) + "</small></span>"
      + '<span class="tk-o"><b>' + esc(cote(j.cote)) + "</b>" + (op && j.operateur ? "<small>" + esc(j.operateur) + "</small>" : "") + "</span>"
      + '<span class="hu-badge lv' + niveau(j.chance) + ' tk-c">' + esc(pc(j.chance)) + "</span></li>";
  }
  function niveau(ch) { ch = Number(ch); return ch >= 70 ? 5 : ch >= 60 ? 4 : ch >= 50 ? 3 : ch >= 40 ? 2 : 1; }
  // Carte « ticket » (21st.dev Ticket Confirmation Card) : en-tete centre avec sa
  // pastille d'icone, ligne en pointilles a encoches, grille de deux valeurs,
  // une ligne encadree par match, ligne en pointilles, pied.
  function carteTicket(type, sousTitre, corps, etat) {
    return '<article class="tc tk tk-' + type + (etat ? " is-" + etat : "") + '"' + (etat ? "" : ' data-tk="' + type + '"') + ">"
      + '<div class="tc-head"><div class="tc-ico">' + ico("ticket", "lucide-ticket") + "</div>"
      + '<h3 class="tc-title">' + esc(nomTicket(type)) + (etat === "locked" ? ' <span class="aj-lock-s">' + ico("lock") + "</span>" : "") + "</h3>"
      + (sousTitre ? '<p class="tc-sub">' + esc(sousTitre) + "</p>" : "") + "</div>"
      + '<div class="tc-body"><div class="tc-cut"><hr class="tc-dash"></div>' + corps + "</div></article>";
  }
  function ticket(b, type, jour) {
    if (!b || b.statut !== "publie") return carteTicket(type, "", message(etatTexte(b, type)), "empty");
    if (b.verrou !== null) return carteTicket(type, enTete(b), flou(type), "locked");
    var l = jambesValides(b);
    if (!l.length || n(b.chance) === null || n(b.cote_totale) === null) return "";
    var op = avecOperateur();
    var reportes = l.some(function (j) { return j.etat === "reporte" || j.etat === "annule"; });
    var sans = b.sans_matchs_reportes && n(b.sans_matchs_reportes.cote_totale) !== null && n(b.sans_matchs_reportes.chance) !== null ? b.sans_matchs_reportes : null;
    var unique = op && b.operateur_unique;
    var grille = '<div class="tc-grid"><div><p class="tc-k">' + esc(unique ? tf("aujourdhui.total_at_k", "Cote totale chez {op}", { op: b.operateur_unique }) : t("aujourdhui.total_k", "Cote totale")) + '</p><p class="tc-v">' + esc(cote(b.cote_totale)) + "</p></div>"
      + '<div class="tc-r"><p class="tc-k">' + esc(t("aujourdhui.ticket_chance", "Chance calculée du ticket")) + '</p><p class="tc-v">' + esc(pc(b.chance)) + "</p></div></div>";
    var premier = l.map(function (j) { return j.coup_envoi; }).filter(Boolean).sort()[0];
    var sous = tf("aujourdhui.matches", "{n} matchs", { n: l.length }) + (premier && heure(premier) ? " · " + tf("aujourdhui.first_at", "premier match à {h}", { h: heure(premier) }) : "");
    var K0 = K();
    var copie = K0 ? K0.boutonBascule({ avant: t("aujourdhui.copy", "Copier le ticket"), apres: t("aujourdhui.copied", "Copié"), icone: "copy", attrs: 'data-tk-copy="' + type + '"' })
      : '<button type="button" class="mu-sub" data-tk-copy="' + type + '"><span class="mu-sub-s mu-sub-a"><span>' + esc(t("aujourdhui.copy", "Copier le ticket")) + "</span></span></button>";
    var corps = grille
      + '<ol class="tk-l">' + l.map(function (j) { return ligneJambe(j, op); }).join("") + "</ol>"
      + (reportes ? '<p class="tk-rep">' + esc(t("aujourdhui.postponed", "Match reporté : la plupart des opérateurs comptent alors cette sélection à 1,00. Vérifie la règle de ton opérateur.")) + (sans ? " " + esc(tf("aujourdhui.without", "Sans ce match : cote {c} · chance {p}.", { c: cote(sans.cote_totale), p: pc(sans.chance) })) : "") + "</p>" : "")
      + '<hr class="tc-dash">'
      + '<div class="tk-f">' + copie + '<span class="aj-sr" aria-live="polite" data-tk-live></span></div>'
      + (unique ? "" : (op ? '<p class="tk-note">' + esc(t("aujourdhui.best_odds_note", "Meilleures cotes relevées chez les opérateurs agréés ; chez ton opérateur, la cote totale peut être un peu différente.")) + "</p>" : ""))
      + '<textarea class="tk-copytext" data-tk-text="' + type + '" readonly hidden>' + esc(texteCopie(b, jour)) + "</textarea>";
    return carteTicket(type, sous, corps, "");
  }
  // Selection en or (Magic UI Shine Border, or) : liste numerotee 1-2-3.
  function selectionOr(b) {
    var K0 = K();
    var cadre = function (classe, sous, corps, lock) {
      return '<article class="or ' + classe + '">' + (classe === "is-on" && K0 ? K0.reflet() : "")
        + '<header class="or-h"><span class="or-ico">' + ico("award") + '</span><span class="or-t"><b>' + esc(t("aujourdhui.gold_title", "Sélection en or")) + "</b>" + (sous ? "<span>" + esc(sous) + "</span>" : "") + "</span>"
        + (lock ? '<span class="aj-lock-s">' + ico("lock") + "</span>" : "") + "</header>" + corps + "</article>";
    };
    if (!b || b.statut !== "publie") return cadre("is-empty", "", message(etatTexte(b, "or")), false);
    if (b.verrou !== null) return cadre("is-locked", n(b.nb_paris) !== null ? tf("aujourdhui.gold_count", "{n} paris", { n: b.nb_paris }) : "", flou("or"), true);
    var l = (Array.isArray(b.paris) ? b.paris : []).filter(function (p) { return p && p.domicile && p.exterieur && p.pari && n(p.chance) !== null && n(p.cote) !== null; }).slice(0, 3);
    if (l.length !== 3) return "";
    var op = avecOperateur();
    return cadre("is-on", t("aujourdhui.gold_sub", "les 3 paris les plus probables du jour"), '<ol class="or-l">' + l.map(function (p, i) {
      return '<li><span class="or-r">' + (i + 1) + '</span><span class="tk-m"><b>' + esc(p.pari) + "</b><small>" + esc(p.domicile + " – " + p.exterieur) + (heure(p.coup_envoi) ? " · " + esc(heure(p.coup_envoi)) : "") + "</small></span>"
        + '<span class="tk-o"><b>' + esc(cote(p.cote)) + "</b>" + (op && p.operateur ? "<small>" + esc(p.operateur) + "</small>" : "") + '</span><span class="or-c">' + esc(pc(p.chance)) + "</span></li>";
    }).join("") + "</ol>", false);
  }
  // Buteur du jour : Magic UI Animated Circular Progress Bar pour sa chance.
  function buteur(b) {
    var tete = function (sous, lock) { return '<header class="bt-h"><span class="bt-ico">' + ico("target") + '</span><span class="or-t"><b>' + esc(t("aujourdhui.scorer_title", "Buteur du jour")) + "</b>" + (sous ? "<span>" + esc(sous) + "</span>" : "") + "</span>" + (lock ? '<span class="aj-lock-s">' + ico("lock") + "</span>" : "") + "</header>"; };
    if (!b || b.statut !== "publie") return '<article class="bt is-empty">' + tete("") + message(etatTexte(b, "buteur")) + "</article>";
    if (b.verrou !== null) return '<article class="bt is-locked">' + tete(t("aujourdhui.scorer_ready", "prêt"), true) + flou("buteur") + "</article>";
    var ch = n(b.chance);
    if (!b.joueur || ch === null || ch < 10 || ch > 45) return "";
    var ini = String(b.joueur).split(/\s+/).filter(Boolean).slice(0, 2).map(function (m) { return m.charAt(0).toUpperCase(); }).join("");
    var retire = b.etat === "retire";
    var K0 = K();
    var g = K0 ? K0.jauge(ch, pc(ch), { aria: tf("aujourdhui.scorer_aria", "Chance de marquer : {v}", { v: pc(ch) }) }) : '<b class="bt-fake-v">' + esc(pc(ch)) + "</b>";
    return '<article class="bt' + (retire ? " is-off" : "") + '">' + tete(t("aujourdhui.scorer_sub", "le plus probable du jour")) + '<div class="bt-row"><span class="bt-av" aria-hidden="true">' + esc(ini) + '</span><span class="tk-m"><b>' + esc(b.joueur) + "</b><small>"
      + esc([b.equipe, b.adversaire ? tf("aujourdhui.scorer_vs", "contre {team}", { team: b.adversaire }) : "", heure(b.coup_envoi)].filter(Boolean).join(" · ")) + "</small></span>" + g + "</div>"
      + '<p class="aj-note">' + esc(retire ? t("aujourdhui.scorer_out", "Annoncé absent depuis la publication.") : t("aujourdhui.scorer_note", "Chance de marquer pendant le match, titulaire probable. Arrondie vers le bas, 45 % au plus.")) + "</p></article>";
  }
  // UN bloc de deverrouillage pour les quatre cartes : cadenas, une ligne, un bouton.
  function deverrouillage(rep, opts) {
    var b = { x5: bloc(rep, "x5"), x10: bloc(rep, "x10"), or: bloc(rep, "or"), buteur: bloc(rep, "buteur") };
    var publie = function (x) { return x && x.statut === "publie"; };
    var NOM = { x5: t("aujourdhui.unlock_x5", "le ticket x5"), x10: t("aujourdhui.unlock_x10", "le ticket x10"), or: t("aujourdhui.unlock_gold", "la Sélection en or"), buteur: t("aujourdhui.unlock_scorer", "le buteur du jour") };
    var liste = function (cles) {
      var l = cles.map(function (k) { return NOM[k]; });
      return l.length > 1 ? l.slice(0, -1).join(", ") + " " + t("aujourdhui.and", "et") + " " + l[l.length - 1] : l[0];
    };
    var parCompte = ["x5", "buteur"].filter(function (k) { return publie(b[k]) && b[k].verrou === "compte"; });
    var parPro = ["x10", "or"].filter(function (k) { return publie(b[k]) && b[k].verrou; });
    var accueil = lien("") + "#aujourdhui";
    var K0 = K();
    var bouton = function (href, label) {
      return K0 ? K0.boutonShimmer({ href: href, label: label, icone: "arrow-right", cls: "aj-cta", attrs: 'data-track="home_scorers_unlock" data-track-kind="home_scorers_unlock"' })
        : '<a class="mu-shimmer aj-cta" href="' + esc(href) + '">' + esc(label) + "</a>";
    };
    var cadre = function (texte, cta, petit) {
      // hs-gate-card : le panneau observe par funnel-track.js (gate_view), comme avant.
      return '<div class="aj-unlock hs-gate-card"><p class="aj-unlock-t"><span class="aj-unlock-i">' + ico("lock") + "</span><span>" + esc(texte) + "</span></p>" + cta + (petit ? '<p class="aj-small">' + esc(petit) + "</p>" : "") + "</div>";
    };
    if (rep.niveau === "anonyme" && parCompte.length) {
      return cadre(tf("aujourdhui.unlock_free", "Ce que tu débloques : {list}, gratuitement.", { list: liste(parCompte) }),
        bouton(lien("inscription.html?next=" + encodeURIComponent(accueil)), t("aujourdhui.cta_account", "Crée ton compte gratuit")),
        parPro.length ? tf("aujourdhui.pro_hint", "{list} : dans Pro.", { list: liste(parPro).replace(/^./, function (c) { return c.toUpperCase(); }) }) : "");
    }
    if (rep.niveau !== "pro" && parPro.length) {
      var OP = G && G.IasharkOffrePro;
      var hrefPro = OP ? OP.lienAbonnement("month", accueil) : lien("abonnement.html?duree=month&next=" + encodeURIComponent(accueil));
      if (rep.niveau === "anonyme") hrefPro = OP ? OP.lienInscription("month", accueil) : hrefPro;
      return cadre(tf("aujourdhui.unlock_pro", "Ce que tu débloques : {list}.", { list: liste(parPro) }), bouton(hrefPro, t("aujourdhui.cta_pro", "Passe Pro")), "");
    }
    void opts;
    return "";
  }
  function html(rep, opts) {
    if (!lisible(rep)) return "";
    var j = jourLong(rep.jour);
    var cartes = [ticket(bloc(rep, "x5"), "x5", rep.jour), ticket(bloc(rep, "x10"), "x10", rep.jour), selectionOr(bloc(rep, "or")), buteur(bloc(rep, "buteur"))];
    if (!cartes.some(Boolean)) return "";
    return '<div class="aj-head"><h2 class="aj-title" id="ajTitre">' + esc(t("aujourdhui.title", "Aujourd’hui")) + "</h2>" + (j ? '<p class="aj-date">' + esc(j) + "</p>" : "") + "</div>"
      + '<div class="aj-grid"><div class="aj-col aj-col-t">' + cartes[0] + cartes[1] + '</div><div class="aj-col">' + cartes[2] + cartes[3] + "</div></div>"
      + deverrouillage(rep, opts)
      + '<p class="aj-legal">' + esc(t("aujourdhui.legal", "Estimation statistique, pas une garantie. Les paris sportifs sont interdits aux moins de 18 ans.")) + "</p>";
  }

  // ---------------------------------------------------------- navigateur
  function copier(btn, racine) {
    var type = btn.getAttribute("data-tk-copy");
    var zone = racine.querySelector('[data-tk-text="' + type + '"]');
    var live = btn.parentNode.querySelector("[data-tk-live]");
    if (!zone) return;
    var fini = function () {
      var K0 = K();
      if (K0) K0.basculer(btn, 2000); else btn.classList.add("is-on");
      if (live) { live.textContent = t("aujourdhui.copied_sr", "Ticket copié"); setTimeout(function () { live.textContent = ""; }, 2000); }
    };
    var repli = function () { zone.hidden = false; zone.focus(); zone.select(); };
    try {
      if (G.navigator && G.navigator.clipboard && G.navigator.clipboard.writeText) G.navigator.clipboard.writeText(zone.value).then(fini, repli);
      else repli();
    } catch (e) { repli(); }
  }
  // el : <section id="aujourdhui"> (cachee tant qu'aucune reponse lisible).
  function mount(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var App = G.IasharkApp;
    var lire = opts.lire || function () {
      if (!App || !App.supabase || !App.supabase.functions) return Promise.resolve(null);
      return App.supabase.functions.invoke("tickets-du-jour", { body: {} }).then(function (r) { return r && !r.error ? r.data : null; }, function () { return null; });
    };
    return Promise.resolve().then(lire).then(function (rep) {
      var contenu = html(rep, opts);
      if (!contenu) { el.hidden = true; el.innerHTML = ""; return null; }
      el.innerHTML = contenu;
      el.hidden = false;
      el.querySelectorAll("[data-tk-copy]").forEach(function (b) { b.addEventListener("click", function () { copier(b, el); }); });
      if (K()) K().activer(el);
      return rep;
    }).catch(function () { el.hidden = true; return null; });
  }

  return { html: html, texteCopie: texteCopie, mount: mount, FAUX_LIGNES: FAUX_LIGNES, lisible: lisible, heure: heure, estFr: estFr };
});
