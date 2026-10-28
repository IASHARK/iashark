/* IASHARK — PAGE COMBINES (28/10/2026, demandes de Clement : « cree une belle page Combines, rends-la stylee »,
   « les tickets or, parfait on garde, mais on va placer une montante », « une sorte de carte pour les deux buteurs
   du jour »).

   La page garde LE bloc « Aujourd'hui » (lib/aujourdhui.js : Petit et Grand combine, Selection en or, deblocage,
   fonction tickets-du-jour) et ses droits, sans rien changer : le SERVEUR decide ce que voit le visiteur (sans
   compte, compte gratuit, Pro) et n'envoie jamais le contenu d'un bloc verrouille. Ce fichier ajoute, apres la
   Selection en or (opts.apresOr) :
   - LA COURSE DES 3 MONTANTES : l'avancement passe vient du fichier public preuves/montantes.json (lib/montantes.js,
     calcul du matin, matchs termines), visible par tous comme le bilan de la veille ; le pari du soir de chaque
     montante et « si ca passe ce soir » suivent les droits de la Selection en or (Pro) : sans le contenu de la
     Selection en or, ni pari, ni cote du soir, ni chiffre qui permettrait de la deduire (largeur fixe sur la piste) ;
   - LA CARTE DES BUTEURS : memes droits que le buteur du jour (compte gratuit). Lit buteur_du_jour.buteurs (1 ou 2
     joueurs, contrat de la PR #230) s'il existe, sinon le joueur unique ; sans compte, nb_buteurs cartes floutees.
     Photo et logo : media.api-sports.io ; logo du club seulement si son identifiant est connu (matchs publics de
     l'accueil, data-home.json), jamais devine. AUCUNE cote sur la carte (pas de cote d'operateur pour les buteurs).
   Aucun chiffre invente : un fichier absent, d'hier ou une montante en attente n'affichent aucun chiffre du soir.
   Jamais de mise, de gain, d'unite, de capital ni d'esperance : des paliers et des cotes. */
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
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function n(v) { if (v === null || v === undefined || v === "") return null; var x = Number(v); return Number.isFinite(x) ? x : null; }
  function cote(v) { var x = Number(String(v == null ? "" : v).replace(",", ".")); return Number.isFinite(x) && x > 1 ? Math.round(x * 100) / 100 : null; }
  function fmt(v) { return Number(v).toLocaleString(L(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pc(v) { return (Number(v) / 100).toLocaleString(L(), { style: "percent", maximumFractionDigits: 0 }); }
  function lien(p) { return (G && G.I18N && G.I18N.href) ? G.I18N.href(p) : "/" + p; }
  function ico(k, cls) { var I = G && G.IasharkIcones; return I ? I.svg(k, cls || "cb-ico") : ""; }
  function heure(coupEnvoi) { var A = G && G.IasharkAujourdhui; return A && A.heure ? A.heure(coupEnvoi) : ""; }
  function jourCourt(j) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(j || ""))) return "";
    var d = new Date(j + "T12:00:00Z");
    return isNaN(d) ? "" : d.toLocaleDateString(L(), { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  }
  function jourLong(j) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(j || ""))) return "";
    var d = new Date(j + "T12:00:00Z");
    return isNaN(d) ? "" : d.toLocaleDateString(L(), { day: "numeric", month: "long", timeZone: "UTC" });
  }
  function badgePro() { return '<span class="cb-verrou">' + ico("lock") + "<span>" + esc(t("aujourdhui.lock_pro", "Pro")) + "</span></span>"; }
  function badgeCompte() { return '<span class="cb-verrou">' + ico("lock") + "<span>" + esc(t("aujourdhui.lock_account", "Gratuit")) + "</span></span>"; }
  // Libelle d'un pari : code « F… » traduit (lib/market-labels.js), sinon le libelle publie.
  function pariTexte(p) {
    var ML = G && G.IasharkMarketLabels;
    if (p && ML && ML.marketIdLabel && p.m) { try { var s = ML.marketIdLabel(p.m, { home: p.h, away: p.a }); if (s && s !== p.m && /^F\d+:/.test(String(p.m))) return s; } catch (e) {} }
    return p ? p.p : "";
  }

  // Donnees chargees par la page (fichier des montantes, matchs publics de l'accueil par numero).
  var ETAT = { montantes: null, matchs: {} };

  // ============================================================ LA COURSE DES MONTANTES
  // Largeur nominale du pari du soir quand sa cote est reservee a Pro : jamais la vraie (elle se deduirait).
  var COTE_NOMINALE = 1.4;
  function pct(x) { return (Math.round(Math.max(0, Math.min(1, x)) * 10000) / 100) + "%"; }

  // Ce soir pour une montante -> { txt, cote, verrou, palier }.
  function ceSoir(s, or, pSoir) {
    var MT = G.IasharkMontantes;
    if (s.attente) return { txt: tf("combines_v2.climb_waiting", "En attente du résultat du {date}.", { date: jourCourt(s.attente.j) }), etat: "attente" };
    if (!s.pret) return { txt: t("combines_v2.climb_stale", "Mise à jour chaque matin, après les résultats de la veille."), etat: "attente" };
    if (!or || !or.statut || or.statut === "en_preparation") return { txt: t("combines_v2.climb_tonight_preparing", "Pari du soir en préparation."), etat: "prep" };
    if (or.statut === "aucun") return { txt: t("combines_v2.climb_tonight_none", "Pas de Sélection en or aujourd’hui : la montante ne bouge pas."), etat: "repos" };
    if (or.statut !== "publie") return { txt: t("aujourdhui.unavailable", "Momentanément indisponible."), etat: "prep" };
    if (or.verrou !== null) return { txt: t("combines_v2.climb_tonight_pro", "Pari du soir : dans la Sélection en or, avec Pro."), etat: "verrou", verrou: true };
    if (!pSoir || cote(pSoir.cote) === null) return { txt: tf("combines_v2.climb_tonight_no_rank", "Pas de pari {n} dans la Sélection en or aujourd’hui : la montante ne bouge pas.", { n: s.rang }), etat: "repos" };
    var k = cote(pSoir.cote), h = heure(pSoir.coup_envoi);
    var match = [pSoir.domicile, pSoir.exterieur].filter(Boolean).join(" – ");
    return { etat: "ouvert", cote: k, si: MT ? MT.siCaPasse(s, k) : null,
      pari: pariTexte({ m: pSoir.market_id, h: pSoir.domicile, a: pSoir.exterieur, p: pSoir.pari }), match: match, heure: h };
  }

  function piste(s, soir) {
    var MT = G.IasharkMontantes;
    var segs = [], total = 0;
    s.cotes.forEach(function (c) { var w = MT.avancement(c); total += w; segs.push('<span class="mt-seg is-gagne" style="--w:' + pct(w) + '"></span>'); });
    var parcouru = Math.min(1, total);
    if (soir.etat === "ouvert" || soir.etat === "verrou") {
      var ws = MT.avancement(soir.etat === "ouvert" ? soir.cote : COTE_NOMINALE);
      ws = Math.max(0, Math.min(ws, 1 - parcouru));
      if (ws > 0) segs.push('<span class="mt-seg is-soir" style="--w:' + pct(ws) + '"></span>');
    }
    var aria = s.gagnes
      ? tf("combines_v2.climb_aria", "Montante {n} : {w} paliers gagnés d’affilée, cote cumulée {odds}, objectif 10.", { n: s.rang, w: s.gagnes, odds: fmt(s.cote) })
      : tf("combines_v2.climb_aria_start", "Montante {n} : au départ, objectif cote 10.", { n: s.rang });
    return '<div class="mt-piste" role="img" aria-label="' + esc(aria) + '"><div class="mt-rail">' + segs.join("")
      + '</div><span class="mt-coureur" style="--x:' + (Math.round(parcouru * 10000) / 10000) + '" aria-hidden="true"></span><span class="mt-arrivee" aria-hidden="true"></span></div>';
  }

  function evenement(s) {
    var d = s.dernier;
    var out = "";
    if (s.objectifs.length) {
      var o = s.objectifs[s.objectifs.length - 1];
      out += '<p class="mt-evt mt-evt--but">' + ico("flag") + "<span>" + esc(tf("combines_v2.climb_goal_event", "Objectif atteint le {date} : cote {odds} en {n} paliers.", { date: jourCourt(o.j), odds: fmt(o.c), n: o.n }))
        + (s.objectifs.length > 1 ? " " + esc(tf("combines_v2.climb_goals_count", "{n} fois depuis le départ.", { n: s.objectifs.length })) : "") + "</span></p>";
    }
    // La raison d'un retour au palier 1, tant qu'aucun palier n'a ete regagne depuis.
    if (d && !s.gagnes && d.t !== "objectif") {
      var match = [d.h, d.a].filter(Boolean).join(" – ");
      var txt = d.t === "perdu"
        ? tf("combines_v2.climb_lost_event", "Repartie au palier 1 après le pari perdu du {date} : {bet}, {match}.", { date: jourCourt(d.j), bet: d.p || "", match: match })
        : tf("combines_v2.climb_unsettled_event", "Repartie au palier 1 : le pari du {date} ({bet}) n’a pas pu être réglé, il ne compte jamais comme gagné.", { date: jourCourt(d.j), bet: d.p || "" });
      out += '<p class="mt-evt">' + ico("rotate-ccw") + "<span>" + esc(txt) + "</span></p>";
    }
    return out;
  }

  function detailPaliers(s) {
    if (!s.paliers.length) return "";
    var RES = { gagne: ["check", t("combines_v2.climb_won", "gagné")], annule: ["minus", t("combines_v2.climb_void", "annulé")] };
    var lignes = s.paliers.map(function (p) {
      var r = RES[p.r] || RES.annule;
      return '<li class="mt-l mt-l--' + esc(p.r) + '"><span class="mt-l-j">' + esc(jourCourt(p.j)) + '</span><span class="mt-l-m"><b>' + esc(pariTexte(p)) + "</b><small>"
        + esc([p.h, p.a].filter(Boolean).join(" – ")) + '</small></span><span class="mt-l-d"><b>' + esc(fmt(p.c)) + '</b><small>' + ico(r[0]) + esc(r[1]) + "</small></span></li>";
    }).join("");
    return '<details class="mt-det"><summary>' + esc(tf("combines_v2.climb_steps_open", "Voir les paliers de la série ({n})", { n: s.paliers.length })) + ico("chevron-down", "cb-ico mt-chev") + "</summary><ol class=\"mt-ls\">" + lignes + "</ol></details>";
  }

  function couloir(s, or, pSoir) {
    var soir = ceSoir(s, or, pSoir);
    var gagnes = s.gagnes
      ? tf(s.gagnes > 1 ? "combines_v2.climb_won_n" : "combines_v2.climb_won_1", s.gagnes > 1 ? "{n} paliers gagnés" : "{n} palier gagné", { n: s.gagnes })
      : t("combines_v2.climb_at_start", "Au départ");
    var figCumul = '<div class="mt-fig"><span class="mt-k">' + esc(t("combines_v2.climb_total_k", "Cote cumulée")) + "</span>"
      + (s.cote ? '<b class="mt-v">' + esc(fmt(s.cote)) + "</b>" : '<b class="mt-v mt-v--depart">' + esc(t("combines_v2.climb_at_start", "Au départ")) + "</b>") + "</div>";
    var figSoir = "";
    if (soir.etat === "ouvert" && soir.si) {
      figSoir = '<div class="mt-fig mt-fig--soir"><span class="mt-k">' + esc(t("combines_v2.climb_if_k", "Si ça passe ce soir")) + '</span><b class="mt-v">' + esc(fmt(soir.si)) + "</b>"
        + (soir.si >= ((G.IasharkMontantes && G.IasharkMontantes.OBJECTIF) || 10) ? '<span class="mt-arr">' + ico("flag") + esc(t("combines_v2.climb_finish_tonight", "Arrivée")) + "</span>" : "") + "</div>";
    } else if (soir.etat === "verrou") {
      figSoir = '<div class="mt-fig mt-fig--soir"><span class="mt-k">' + esc(t("combines_v2.climb_if_k", "Si ça passe ce soir")) + '</span><b class="mt-v aj-blur" aria-hidden="true" inert>?,??</b>' + badgePro() + "</div>";
    }
    var ligneSoir;
    if (soir.etat === "ouvert") {
      ligneSoir = '<p class="mt-soir"><span class="mt-soir-k">' + esc(tf("combines_v2.climb_tonight_step", "Ce soir, palier {n}", { n: s.palier })) + "</span>"
        + '<span class="mt-soir-p"><b>' + esc(soir.pari) + "</b><small>" + esc(soir.match + (soir.heure ? " · " + soir.heure : "")) + '</small></span><span class="mt-soir-c">' + esc(fmt(soir.cote)) + "</span></p>";
    } else if (soir.etat === "verrou") {
      ligneSoir = '<p class="mt-soir mt-soir--verrou"><span class="mt-soir-k">' + esc(tf("combines_v2.climb_tonight_step", "Ce soir, palier {n}", { n: s.palier })) + "</span>"
        + '<span class="mt-soir-p"><b>' + esc(soir.txt) + "</b></span></p>";
    } else {
      ligneSoir = '<p class="mt-soir mt-soir--info"><span class="mt-soir-p"><small>' + esc(soir.txt) + "</small></span></p>";
    }
    return '<li class="mt-c" data-etat="' + esc(soir.etat) + '">'
      + '<div class="mt-c-h"><h3 class="mt-nom"><span class="mt-num">' + s.rang + "</span>" + esc(tf("combines_v2.climb_name", "Montante {n}", { n: s.rang })) + '</h3><span class="mt-g">' + esc(gagnes) + "</span></div>"
      + piste(s, soir)
      + '<div class="mt-figs">' + figCumul + figSoir + "</div>"
      + ligneSoir + evenement(s) + detailPaliers(s)
      + "</li>";
  }

  function montantesHtml(rep) {
    var MT = G.IasharkMontantes, f = ETAT.montantes;
    if (!MT || !f || !rep) return "";
    var etats = MT.soir(f, rep.jour);
    if (etats.length !== MT.NB) return "";
    var or = rep.selection_or || null;
    var ouvert = !!or && or.statut === "publie" && or.verrou === null;
    var parisSoir = ouvert ? MT.parRang(or.paris) : {};
    var nbObj = etats.reduce(function (a, s) { return a + s.objectifs.length; }, 0);
    var debut = jourLong(f.debut);
    return '<section class="mt" id="montantes" aria-labelledby="mtTitre">'
      + '<div class="cb-tete-s"><h2 class="cb-h2" id="mtTitre">' + esc(t("combines_v2.climb_title", "La course des montantes")) + "</h2>"
      + '<p class="cb-texte">' + esc(t("combines_v2.climb_sub", "Chaque pari de la Sélection en or fait avancer sa montante. Gagné : un palier de plus. Perdu : retour au départ. Objectif : cote 10.")) + "</p></div>"
      + '<div class="mt-course"><div class="mt-repere" aria-hidden="true"><span>' + esc(t("combines_v2.climb_start", "Départ")) + "</span><span>" + ico("flag") + esc(t("combines_v2.climb_finish", "Cote 10")) + "</span></div>"
      + '<ol class="mt-couloirs">' + etats.map(function (s) { return couloir(s, or, parisSoir[s.rang]); }).join("") + "</ol></div>"
      + '<p class="cb-petit">' + esc(tf("combines_v2.climb_note", "Objectifs atteints depuis le {date} : {n}. Calcul chaque matin à partir des résultats, gagnés et perdus compris : aucun pari n’est retiré.", { date: debut, n: nbObj })) + "</p>"
      + "</section>";
  }

  // ============================================================ LES BUTEURS DU JOUR
  var POSTES = { G: ["match_page.position_goalkeeper", "Gardien"], D: ["match_page.position_defender", "Défenseur"], M: ["match_page.position_midfielder", "Milieu"], F: ["match_page.position_forward", "Attaquant"] };
  var FAUX = [["Xxxxxx Xxxxxxx", "Xxxxxx – Xxxxx", "?? %"], ["Xxxxx Xxxxxxxxx", "Xxxxxxx – Xxxxxx", "?? %"]];
  function initiales(nom) { return String(nom || "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join(""); }
  function idValide(v) { var x = Number(v); return Number.isInteger(x) && x > 0 ? x : null; }

  // Photo : le champ photo de la reponse s'il vient de media.api-sports.io, sinon celle du numero du joueur.
  function photoDe(j) {
    if (typeof j.photo === "string" && /^https:\/\/media\.api-sports\.io\/football\/players\/\d+\.png$/.test(j.photo)) return j.photo;
    var id = idValide(j.joueur_id);
    return id ? "https://media.api-sports.io/football/players/" + id + ".png" : null;
  }
  // Une carte par joueur. AUCUNE cote : il n'existe pas de cote d'operateur pour les buteurs (le champ « cote » de la
  // base dit seulement le cote du terrain, domicile ou exterieur) ; la carte montre la chance calculee et « pari simple ».
  function carteJoueur(j, rang) {
    var ch = n(j.chance);
    var dom = j.domicile || null, ext = j.exterieur || null;
    var m = j.fixture_id != null ? ETAT.matchs[String(j.fixture_id)] : null;
    if ((!dom || !ext) && m) { dom = m.home && m.home.n; ext = m.away && m.away.n; }
    var cote_equipe = j.equipe && j.equipe === dom ? "home" : j.equipe && j.equipe === ext ? "away" : null;
    // Logo du club : identifiant lu dans les matchs publics de l'accueil, et seulement si le nom correspond.
    var idClub = null;
    if (m && cote_equipe && m[cote_equipe] && m[cote_equipe].n === j.equipe) idClub = idValide(m[cote_equipe].id);
    var matchTxt = dom && ext ? dom + " – " + ext : [j.equipe, j.adversaire ? tf("aujourdhui.scorer_vs", "contre {team}", { team: j.adversaire }) : ""].filter(Boolean).join(" ");
    var h = heure(j.coup_envoi);
    var poste = POSTES[String(j.poste || "").toUpperCase()];
    var club = [poste ? t(poste[0], poste[1]) : "", j.equipe || ""].filter(Boolean).join(" · ");
    var photo = photoDe(j);
    var hors = j.etat === "retire" ? t("aujourdhui.scorer_out", "Annoncé absent depuis la publication.")
      : j.etat === "reporte" ? t("aujourdhui.leg_postponed_short", "match reporté") : j.etat === "annule" ? t("aujourdhui.leg_cancelled_short", "match annulé") : "";
    if (hors) hors = hors.charAt(0).toUpperCase() + hors.slice(1) + (/[.!]$/.test(hors) ? "" : ".");
    return '<article class="bt-c' + (hors ? " is-off" : "") + '"><div class="bt-c-in">'
      + '<div class="bt-c-haut"><span class="bt-c-rang" aria-hidden="true">' + rang + "</span>"
      + '<span class="bt-c-photo">' + (photo ? '<img src="' + esc(photo) + '" alt="' + esc(tf("combines_v2.scorer_photo_alt", "Photo de {name}", { name: j.joueur })) + '" width="96" height="96" loading="lazy" decoding="async" data-bt-photo>' : "")
      + '<span class="bt-c-init"' + (photo ? " hidden" : "") + ' aria-hidden="true">' + esc(initiales(j.joueur)) + "</span>"
      + (idClub ? '<img class="bt-c-logo" src="https://media.api-sports.io/football/teams/' + idClub + '.png" alt="" width="30" height="30" loading="lazy" decoding="async" data-bt-logo>' : "") + "</span></div>"
      + '<div class="bt-c-corps"><h3 class="bt-c-nom">' + esc(j.joueur) + "</h3>"
      + (club ? '<p class="bt-c-club">' + esc(club) + "</p>" : "")
      + '<p class="bt-c-match">' + esc(matchTxt + (h ? " · " + h : "")) + "</p>"
      + '<dl class="bt-c-chiffres"><div><dt>' + esc(t("combines_v2.scorer_chance_k", "Chance de marquer")) + "</dt><dd>" + esc(pc(ch)) + "</dd></div></dl>"
      + '<p class="bt-c-type"><b>' + esc(t("combines_v2.scorer_single", "Pari simple")) + "</b> · " + esc(t("combines_v2.scorer_single_sub", "le joueur marque pendant le match")) + "</p>"
      + (hors ? '<p class="bt-c-out">' + esc(hors) + "</p>" : "")
      + "</div></div></article>";
  }
  function carteFausse(x, rang) {
    return '<article class="bt-c bt-c--faux" aria-hidden="true" inert><div class="bt-c-in"><div class="bt-c-haut"><span class="bt-c-rang">' + rang + '</span><span class="bt-c-photo"><span class="bt-c-init">' + ico("user-round") + "</span></span></div>"
      + '<div class="bt-c-corps aj-blur"><h3 class="bt-c-nom">' + x[0] + '</h3><p class="bt-c-match">' + x[1] + '</p><dl class="bt-c-chiffres"><div><dt>&nbsp;</dt><dd>' + x[2] + "</dd></div></dl></div></div></article>";
  }

  function buteursHtml(rep) {
    var b = rep && rep.buteur_du_jour;
    if (!b || b.statut === "indisponible") return "";
    var titre = function (deux) { return deux ? t("combines_v2.scorers_title", "Les buteurs du jour") : t("aujourdhui.scorer_title", "Buteur du jour"); };
    var tete = function (deux, extra) {
      return '<div class="cb-tete-s"><h2 class="cb-h2" id="btTitre">' + esc(titre(deux)) + "</h2>" + (extra || "")
        + '<p class="cb-texte">' + esc(deux ? t("combines_v2.scorers_sub", "Les joueurs les plus probables de marquer aujourd’hui, parmi les titulaires attendus.")
          : t("combines_v2.scorers_sub_one", "Le joueur le plus probable de marquer aujourd’hui, parmi les titulaires attendus.")) + "</p></div>";
    };
    var cadre = function (corps, deux, extra) { return '<section class="bt" id="buteurs" aria-labelledby="btTitre">' + tete(deux, extra) + corps + "</section>"; };
    if (b.statut !== "publie") {
      var msg = b.statut === "aucun" ? t("aujourdhui.none_scorer", "Pas de buteur du jour : aucun joueur n’atteint 10 % de chance.") : t("aujourdhui.preparing", "En préparation pour aujourd’hui.");
      return cadre('<p class="cb-msg">' + esc(msg) + "</p>", true);
    }
    if (b.verrou !== null) {
      // Sans compte : de FAUX contenus constants, floutes (jamais tires de la reponse), autant de cartes que nb_buteurs
      // (donne a tous les niveaux ; absent : une seule). Le bouton est dans le bloc de deblocage.
      var nb = Number(b.nb_buteurs) === 2 ? 2 : 1;
      var fausses = nb === 2 ? carteFausse(FAUX[0], 1) + carteFausse(FAUX[1], 2) : carteFausse(FAUX[0], 1);
      return cadre('<div class="bt-grille bt-n' + nb + ' bt-verrou">' + fausses + "</div>", nb === 2, (b.verrou === "pro" ? badgePro() : badgeCompte()));
    }
    var brut = Array.isArray(b.buteurs) && b.buteurs.length ? b.buteurs : [b];
    var liste = brut.filter(function (j) { var ch = j && n(j.chance); return j && j.joueur && ch !== null && ch >= 10 && ch <= 45; }).slice(0, 2);
    if (!liste.length) return "";
    return cadre('<div class="bt-grille bt-n' + liste.length + '">' + liste.map(function (j, i) { return carteJoueur(j, i + 1); }).join("") + "</div>"
      + '<p class="cb-petit">' + esc(t("aujourdhui.scorer_note", "Chance de marquer pendant le match, titulaire probable. Arrondie vers le bas, 45 % au plus.")) + "</p>", liste.length > 1);
  }

  function apresOr(rep) { return montantesHtml(rep) + buteursHtml(rep); }

  // ============================================================ branchements apres chaque rendu
  // Le seul mouvement de la page : les pistes se remplissent a leur entree a l'ecran, une fois (etat final par defaut ;
  // un rendu suivant montre directement l'etat final).
  var joue = false, io = null;
  function animer(el) {
    var course = el.querySelector(".mt-course");
    var reduit = G.matchMedia && G.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!course || joue || reduit || typeof G.IntersectionObserver !== "function") return;
    if (io) io.disconnect();
    course.classList.add("mt-attente");
    io = new G.IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (!e.isIntersecting || joue) return;
        joue = true;
        io.disconnect();
        G.requestAnimationFrame(function () { G.requestAnimationFrame(function () { course.classList.remove("mt-attente"); course.classList.add("mt-vue"); }); });
      });
    }, { threshold: 0.2 });
    io.observe(course);
  }
  function brancher(el) {
    var row = el.querySelector(".aj-row"); if (row) row.id = "cbTickets";
    var or = el.querySelector(".or"); if (or) or.id = "cbOr";
    // Sommaire : un lien dont la section n'existe pas (ou plus) est cache.
    var D = G.document;
    [].slice.call(D.querySelectorAll("[data-cb-ancre]")).forEach(function (a) { a.hidden = !D.getElementById(a.getAttribute("data-cb-ancre")); });
    var som = D.getElementById("cbSommaire");
    if (som) som.hidden = !som.querySelector("[data-cb-ancre]:not([hidden])");
    // Photo absente : les initiales ; logo absent : rien.
    [].slice.call(el.querySelectorAll("[data-bt-photo]")).forEach(function (img) {
      img.addEventListener("error", function () { img.hidden = true; var i = img.parentNode.querySelector(".bt-c-init"); if (i) i.hidden = false; }, { once: true });
    });
    [].slice.call(el.querySelectorAll("[data-bt-logo]")).forEach(function (img) { img.addEventListener("error", function () { img.hidden = true; }, { once: true }); });
    animer(el);
  }

  function lireJson(url) {
    return G.fetch(url, { cache: "no-cache" }).then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // Montage de la page : dictionnaire, session (le serveur decide du niveau), fichier des montantes en parallele des
  // tickets, puis les matchs publics (statut d'un match reporte ou annule, logos des clubs des buteurs).
  function monter() {
    var D = G.document, I = G.I18N;
    if (G.IasharkAuthHeader) G.IasharkAuthHeader.mount("#authHeaderSlot");
    var el = D.getElementById("aujourdhui"), vide = D.getElementById("cbVide");
    var pMontantes = lireJson("/preuves/montantes.json").then(function (f) { ETAT.montantes = f && f.version === 1 ? f : null; });
    var pMatchs = lireJson("/data-home.json");
    return Promise.resolve().then(function () { return I && I.init ? I.init() : null; }).catch(function () {})
      .then(function () {
        var d = D.getElementById("cbDate");
        try { d.textContent = new Date().toLocaleDateString(L(), { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }); } catch (e) {}
        var App = G.IasharkApp;
        return Promise.resolve().then(function () { return App && App.context ? App.context() : null; }).catch(function () {});
      })
      .then(function () {
        var App = G.IasharkApp, A = G.IasharkAujourdhui;
        if (!A) return null;
        var lire = function () {
          var tickets = !App || !App.supabase || !App.supabase.functions ? Promise.resolve(null)
            : App.supabase.functions.invoke("tickets-du-jour", { body: {} }).then(function (r) { return r && !r.error ? r.data : null; }, function () { return null; });
          return Promise.all([tickets, pMontantes]).then(function (x) { return x[0]; });
        };
        return A.mount(el, { lire: lire, sansButeur: true, apresOr: apresOr, retour: lien("combines.html"),
          nomButeur: t("combines_v2.unlock_scorers", "les buteurs du jour") });
      })
      .catch(function () { return null; })
      .then(function (rep) {
        if (!rep || el.hidden) { vide.hidden = false; return null; }
        brancher(el);
        return pMatchs.then(function (j) {
          var A = G.IasharkAujourdhui, parId = {};
          (j && Array.isArray(j.matchs) ? j.matchs : []).forEach(function (m) { if (m && m.id != null) { parId[String(m.id)] = m.status; ETAT.matchs[String(m.id)] = { home: m.home, away: m.away }; } });
          var redessine = A.statuts(el, function (fid) { return parId[String(fid)]; });
          // Logos des clubs des buteurs : connus seulement maintenant.
          if (!redessine && el.querySelector(".bt-c:not(.bt-c--faux)")) redessine = A.repeindre(el);
          if (redessine) brancher(el);
          return rep;
        });
      });
  }

  G.IasharkCombinesPage = { montantesHtml: montantesHtml, buteursHtml: buteursHtml, apresOr: apresOr, brancher: brancher, monter: monter, ETAT: ETAT };
  if (typeof document !== "undefined" && document.getElementById("aujourdhui") && !G.IASHARK_COMBINES_ESSAI) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", monter);
    else monter();
  }
})(typeof window !== "undefined" ? window : this);
