/* IASHARK — bloc « Aujourd'hui » de l'accueil et du compte (04/10/2026) :
   ticket x5, ticket x10, buteur du jour, Selection en or.

   DEMANDE DE CLEMENT (04/10, 16 h) : « le ticket x5, le ticket x10 et le buteur cote a
   cote, comme une petite carte, et en bas la Selection en or ; il ne faut pas que les gens
   scrollent enormement ». Donc :
     - trois PETITES CARTES cote a cote, sur ordinateur ET sur telephone : titre, cote
       totale (ou nom du joueur), anneau de chance, cadenas si verrouille ;
     - sur un bloc large (ordinateur, compte), chaque carte montre aussi son detail
       (matchs du ticket, « Copier le ticket ») ; sur un bloc etroit (telephone), le detail
       s'ouvre au toucher dans le tiroir du bas (Flowbite Drawer, le meme que le panneau
       Marches de la page match) ;
     - la Selection en or dessous, en lignes compactes ;
     - un seul bloc de deverrouillage (une ligne, un bouton), puis les mentions en petit
       et en gris, dont « Ce site ne fournit aucun conseil financier. ».

   Donnees : fonction Edge tickets-du-jour (contrat v1, regles-tickets.md §5). Le
   SERVEUR choisit le jour (Paris) et le niveau du visiteur (anonyme, gratuit, pro)
   et n'envoie jamais le contenu d'un bloc verrouille : seulement son type, son
   statut, son nombre de matchs et sa cote totale. Ici, defense en plus : un bloc
   dont verrou n'est pas null n'est JAMAIS rendu avec ses details, meme si la
   reponse en contenait.

   Etat des matchs d'un ticket (controle du trader de cotes et de l'ingenieur donnees du
   04/10) : le serveur ne recalcule les etats qu'une fois par jour ; la page lit donc AUSSI
   le statut PUBLIC de chaque match (opts.statutDe, liste des matchs de l'accueil : PST =
   reporte ; CANC, ABD, AWD, WO = annule). Plusieurs matchs reportes ou annules : toutes les
   phrases, et « Sans ces matchs » au pluriel, recalcule ici avec EXACTEMENT la regle du
   calcul (lib/run-output/combo-math.js : produit des cotes au centime, moitie vers le haut ;
   produit des chances affichees, vers le bas, au moins 1 %), en entiers.

   Sous le flou : de FAUX chiffres CONSTANTS (FAUX_LIGNES), jamais tires de la
   reponse ; aria-hidden et inert. Aucune fausse urgence (pas de compte a rebours) ;
   jamais « sur », « garanti », « ticket gagnant », ni mise, gain, unite, capital ou
   esperance.

   COMPOSANTS (exigence de Clement : de vrais composants de bibliotheques a licence libre,
   jamais de dessin fait main ; licences dans assets/vendor/LICENCES.txt) :
     - petites cartes : shadcn/ui « Card » (MIT) — Card, CardHeader, CardTitle,
       CardDescription, CardAction, CardContent ; la ligne de perforation du ticket est le
       shadcn/ui « Separator » (MIT) en pointilles (className border-dashed) ;
     - chance : Magic UI « Animated Circular Progress Bar » (MIT) ;
     - Selection en or : Magic UI « Shine Border » (MIT), seul usage de l'or du site ;
     - « Copier le ticket » : Magic UI « Animated Subscribe Button » (MIT) ;
     - deblocage : Magic UI « Shimmer Button » (MIT) ; pastilles : HyperUI « Badges » (MIT) ;
     - detail au telephone : Flowbite « Drawer », placement bottom (MIT) ;
     - icones : Lucide (ISC).
   La carte « Ticket Confirmation Card » de 21st.dev (aucune licence publiee) est retiree.
   Fonction absente ou reponse illisible : le bloc entier disparait (aucun trou). */
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
    // Espaces insecables : « 15 h » ne se coupe jamais en « 15 / h » (controle UX du 04/10).
    if (/^fr/.test(L())) { var p = hm.split(":"); return Number(p[0]) + " h" + (p[1] !== "00" ? " " + p[1] : ""); }
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

  // Etat d'un match : celui du serveur s'il n'est plus « a venir », sinon le statut PUBLIC du
  // match (opts.statutDe(fixture_id) -> fixture.status.short), memes listes que le calcul
  // (lib/tickets-du-jour.js : PST = reporte ; CANC, ABD, AWD, WO = annule).
  var STATUTS_REPORTE = ["PST"], STATUTS_ANNULE = ["CANC", "ABD", "AWD", "WO"];
  function etatDe(j, opts) {
    if (j && (j.etat === "reporte" || j.etat === "annule")) return j.etat;
    var f = opts && typeof opts.statutDe === "function" ? opts.statutDe : null;
    var s = "";
    if (f && j && j.fixture_id != null) { try { s = String(f(j.fixture_id) || "").toUpperCase(); } catch (e) { s = ""; } }
    if (STATUTS_REPORTE.indexOf(s) !== -1) return "reporte";
    if (STATUTS_ANNULE.indexOf(s) !== -1) return "annule";
    return "a_venir";
  }
  function jambesValides(b, opts) {
    var l = Array.isArray(b && b.jambes) ? b.jambes : [];
    // Dans l'ordre des coups d'envoi (page et texte copie).
    return l.filter(function (j) { return j && j.domicile && j.exterieur && j.pari && n(j.cote) !== null && n(j.chance) !== null; })
      .map(function (j, i) { return { j: j, i: i }; })
      .sort(function (a, b) { return String(a.j.coup_envoi || "").localeCompare(String(b.j.coup_envoi || "")) || a.i - b.i; })
      .map(function (x) { var e = etatDe(x.j, opts); return e === x.j.etat ? x.j : Object.assign({}, x.j, { etat: e }); });
  }

  // ---------------------------------------------------------- « sans ces matchs »
  // MEME regle que le calcul (lib/run-output/combo-math.js), en entiers exacts (BigInt) :
  // cote = produit des cotes en centimes, arrondi au centime moitie vers le haut ; chance =
  // produit des chances AFFICHEES (entiers 1-99), vers le bas, au moins 1 %.
  function centimes(c) {
    var x = Number(String(c == null ? "" : c).replace(",", "."));
    if (!Number.isFinite(x) || x <= 1) return null;
    return Math.round(Number((x * 100).toPrecision(12)));
  }
  function chanceEntiere(c) { var x = Number(c); return Number.isInteger(x) && x >= 1 && x <= 99 ? x : null; }
  function sansCalcule(restantes) {
    if (typeof BigInt !== "function" || !restantes.length) return null;
    var p = BigInt(1), q = BigInt(1), cent = BigInt(100), deux = BigInt(2);
    for (var i = 0; i < restantes.length; i++) {
      var c = centimes(restantes[i].cote), h = chanceEntiere(restantes[i].chance);
      if (c === null || h === null) return null;
      p *= BigInt(c); q *= BigInt(h);
    }
    var div = BigInt(1);
    for (var k = 1; k < restantes.length; k++) div *= cent;
    var coteC = Number((p * deux + div) / (div * deux));
    return { nb_matchs: restantes.length, cote_totale: coteC / 100, chance: Math.max(1, Number(q / div)) };
  }
  // -> { off: [jambes reportees / annulees], sans: {cote_totale, chance} | null }.
  function horsJeu(b, l) {
    var off = l.filter(function (j) { return j.etat === "reporte" || j.etat === "annule"; });
    if (!off.length) return { off: off, sans: null };
    // Le serveur a deja calcule « sans » pour EXACTEMENT les memes matchs : on le reprend.
    var srv = b && b.sans_matchs_reportes;
    var memes = (Array.isArray(b && b.jambes) ? b.jambes : []).filter(function (j) { return j && (j.etat === "reporte" || j.etat === "annule"); }).length === off.length;
    if (memes && srv && n(srv.cote_totale) !== null && n(srv.chance) !== null) return { off: off, sans: srv };
    return { off: off, sans: sansCalcule(l.filter(function (j) { return j.etat === "a_venir"; })) };
  }
  function ligneSans(h) {
    if (!h.sans) return "";
    // 04/10, Clement : aucun pourcentage de chance sur les combines.
    var v = { c: cote(h.sans.cote_totale) };
    return h.off.length > 1 ? tf("aujourdhui.without_plural", "Sans ces matchs : cote {c}.", v) : tf("aujourdhui.without", "Sans ce match : cote {c}.", v);
  }
  // Toutes les phrases utiles (match reporte ET match annule : les deux).
  function phrasesHorsJeu(h) {
    var out = [];
    if (h.off.some(function (j) { return j.etat === "reporte"; })) out.push(t("aujourdhui.postponed", "Match reporté : la plupart des opérateurs comptent alors cette sélection à 1,00. Vérifie la règle de ton opérateur."));
    if (h.off.some(function (j) { return j.etat === "annule"; })) out.push(t("aujourdhui.cancelled", "Match annulé : la plupart des opérateurs comptent alors cette sélection à 1,00. Vérifie la règle de ton opérateur."));
    return out;
  }

  // ---------------------------------------------------------- textes
  // 04/10, Clement : « x5 / x10 » se lit comme une promesse de gain -> « Petit / Grand combiné ».
  var NOMS = { x5: ["aujourdhui.ticket_x5", "Petit combiné"], x10: ["aujourdhui.ticket_x10", "Grand combiné"] };
  function nomTicket(type) { return t(NOMS[type][0], NOMS[type][1]); }
  // Etat d'une jambe (match reporte / annule apres la publication) : libelle court.
  function etatCourt(j) {
    if (j && j.etat === "annule") return t("aujourdhui.leg_cancelled_short", "match annulé");
    if (j && j.etat === "reporte") return t("aujourdhui.leg_postponed_short", "match reporté");
    return "";
  }
  // Texte de « Copier le ticket » (format valide, regles et plan §4.3). Un match reporte ou
  // annule garde sa ligne (avec son etat) et la ligne « Sans ce match » (ou « Sans ces
  // matchs ») suit la cote totale : le texte copie dit la meme chose que la carte.
  function texteCopie(b, jour, opts) {
    var l = jambesValides(b, opts);
    var op = avecOperateur();
    var lignes = [nomTicket(b.type) + " IASHARK" + (jourLong(jour) ? " · " + jourLong(jour) : "")];
    l.forEach(function (j, i) {
      var h = heure(j.coup_envoi);
      lignes.push((i + 1) + ". " + j.domicile + " – " + j.exterieur + (h ? " (" + h + ")" : "") + " · " + pariTexte(j) + " · "
        + tf("aujourdhui.copy_odds", "cote {v}", { v: cote(j.cote) }) + (op && j.operateur ? " (" + j.operateur + ")" : "")
        + (etatCourt(j) ? " · " + etatCourt(j) : ""));
    });
    var unique = op && b.operateur_unique;
    lignes.push((unique || !op ? t("aujourdhui.copy_total", "Cote totale") : t("aujourdhui.copy_total_best", "Cote totale (meilleures cotes relevées)")) + " : " + cote(b.cote_totale) + (unique ? " · " + b.operateur_unique : ""));
    var sans = ligneSans(horsJeu(b, l));
    if (sans) lignes.push(sans);
    lignes.push(t("aujourdhui.copy_legal", "Estimation statistique, pas une garantie. 18+"));
    lignes.push("iashark.com");
    return lignes.join("\n");
  }

  // ---------------------------------------------------------- rendu
  // FAUX contenus CONSTANTS sous le flou (jamais lus dans la reponse).
  var FAUX_LIGNES = [["?? h", "Xxxxxxx – Xxxxxx", "Xxxxxxxx xxxxx", "?,??"], ["?? h", "Xxxxx – Xxxxxxxxx", "Xxx xxxx xxxxxx", "?,??"]];
  var FAUX_JOUEUR = ["Xx. Xxxxxxxx", "Xxxxxxx – Xxxxxx"];
  function ligneFausse() {
    var x = FAUX_LIGNES[0];
    return '<li class="tk-leg"><span class="tk-t">' + x[0] + '</span><span class="tk-m"><b>' + x[1] + "</b><small>" + x[2] + '</small></span><span class="tk-o"><b>' + x[3] + "</b></span></li>";
  }
  // Une seule fausse ligne : on montre qu'il y a quelque chose sans allonger la page.
  function flou() { return '<ol class="tk-l aj-blur" aria-hidden="true" inert>' + ligneFausse() + "</ol>"; }
  // Anneau de chance FAUX (constante), floute : jamais la vraie chance d'un bloc verrouille.
  function anneauFlou() {
    var K0 = K();
    return '<span class="aj-blur sc-g" aria-hidden="true" inert>' + (K0 ? K0.jauge(40, "?? %", { aria: "" }) : '<b class="bt-fake-v">?? %</b>') + "</span>";
  }
  function anneau(ch, aria) {
    var K0 = K();
    return '<span class="sc-g">' + (K0 ? K0.jauge(ch, pc(ch), { aria: aria }) : '<b class="bt-fake-v">' + esc(pc(ch)) + "</b>") + "</span>";
  }
  function message(texte, cls) { return '<p class="aj-msg' + (cls ? " " + cls : "") + '">' + esc(texte) + "</p>"; }
  function etatTexte(b, type) {
    if (!b || b.statut === "en_preparation") return t("aujourdhui.preparing", "En préparation pour aujourd’hui.");
    if (b.statut === "indisponible") return t("aujourdhui.unavailable", "Momentanément indisponible.");
    if (b.statut === "aucun") {
      if (type === "x5") return t("aujourdhui.none_x5", "Pas de petit combiné aujourd’hui : aucune combinaison ne respecte nos règles (4 ou 5 matchs, cote totale entre 4 et 6). On ne force jamais un combiné.");
      if (type === "x10") return t("aujourdhui.none_x10", "Pas de grand combiné aujourd’hui : aucune combinaison ne respecte nos règles (7 ou 8 matchs, cote totale entre 8,50 et 12). On ne force jamais un combiné.");
      if (type === "or") return t("aujourdhui.none_gold", "Pas de Sélection en or aujourd’hui : moins de 3 paris respectent nos règles.");
      return t("aujourdhui.none_scorer", "Pas de buteur du jour : aucun joueur n’atteint 10 % de chance.");
    }
    return "";
  }
  // Message court d'une petite carte (le detail complet est dans le tiroir ou sur la carte large).
  function etatCourtCarte(b) {
    if (!b || b.statut === "en_preparation") return t("aujourdhui.short_preparing", "En préparation");
    if (b.statut === "aucun") return t("aujourdhui.short_none", "Pas aujourd’hui");
    return "";
  }
  function niveau(ch) { ch = Number(ch); return ch >= 70 ? 5 : ch >= 60 ? 4 : ch >= 50 ? 3 : ch >= 40 ? 2 : 1; }
  // Pari d'une jambe : pour un autre marche des bookmakers (code « F… », 06/10/2026), le libelle construit depuis le CODE
  // dans la langue de la page (lib/market-labels.js#fluxLibelle) ; sinon le libelle publie.
  function pariTexte(j) {
    var ML = G && G.IasharkMarketLabels;
    if (j && /^F\d+:/.test(String(j.market_id || "")) && ML && ML.marketIdLabel) { var s = ML.marketIdLabel(j.market_id, { home: j.domicile, away: j.exterieur }); if (s && s !== j.market_id) return s; }
    return j ? j.pari : "";
  }
  function ligneJambe(j, op) {
    var off = j.etat === "reporte" || j.etat === "annule";
    var h = heure(j.coup_envoi);
    return '<li class="tk-leg' + (off ? " is-off" : "") + '"><span class="tk-t">' + esc(h) + '</span><span class="tk-m"><b>' + esc(j.domicile + " – " + j.exterieur) + "</b><small>" + (h ? '<span class="tk-th">' + esc(h) + " · </span>" : "") + esc(pariTexte(j)) + (off ? " · " + esc(etatCourt(j)) : "") + "</small></span>"
      + '<span class="tk-o"><b>' + esc(cote(j.cote)) + "</b>" + (op && j.operateur ? "<small>" + esc(j.operateur) + "</small>" : "") + "</span></li>";
  }
  // Pastille « verrouille » (HyperUI Badges + icone Lucide) : a qui le bloc s'ouvre AU BOUT DU
  // COMPTE. Le ticket x10 et la Selection en or sont Pro, meme sans compte (le serveur y met
  // alors « compte », premiere etape) : jamais « Gratuit » sur eux (captures du 04/10, finitions).
  function badgeVerrou(v, type) {
    var pro = v === "pro" || type === "x10" || type === "or";
    return '<span class="sc-a hu-badge sc-lock">' + ico("lock", "aj-ico") + "<span>" + esc(pro ? t("aujourdhui.lock_pro", "Pro") : t("aujourdhui.lock_account", "Gratuit")) + "</span></span>";
  }

  // PETITE CARTE (shadcn/ui Card) :
  //   <article data-slot="card">  header (titre, description, action) / separator / content /
  //   detail (carte large) / bouton qui ouvre le tiroir (carte etroite).
  // o : { type, cls, icone, titre, desc, descLarge, action, contenu, detail, ouvrable, etiquette }
  function petiteCarte(o) {
    return '<article class="sc ' + o.cls + '" data-slot="card" data-aj-card="' + o.type + '">'
      + '<div class="sc-h" data-slot="card-header"><span class="sc-ico">' + ico(o.icone, "aj-ico") + "</span>"
      + '<div class="sc-ht"><h3 class="sc-t" data-slot="card-title">' + esc(o.titre) + "</h3>"
      + (o.desc || o.descLarge ? '<p class="sc-d" data-slot="card-description">' + esc(o.desc || "") + (o.descLarge ? '<span class="sc-wide">' + esc(o.descLarge) + "</span>" : "") + "</p>" : "") + "</div>"
      + (o.action || "") + "</div>"
      // Ligne de perforation du ticket : shadcn/ui Separator, en pointilles.
      + '<div class="sc-sep" data-slot="separator" data-orientation="horizontal" role="none"></div>'
      + '<div class="sc-c" data-slot="card-content">' + o.contenu + "</div>"
      + (o.detail ? '<div class="sc-det" data-aj-det>' + o.detail + "</div>" : "")
      + (o.ouvrable ? '<button type="button" class="sc-hit" data-aj-open="' + o.type + '" aria-haspopup="dialog"><span class="aj-sr">' + esc(o.etiquette || o.titre) + "</span>"
        + '<span class="sc-more" aria-hidden="true">' + esc(t("aujourdhui.see", "Voir")) + ico("chevron-right", "aj-ico") + "</span></button>" : "")
      + "</article>";
  }
  // « indisponible » (calcul sans feu vert du mathematicien, ou table illisible) : la
  // carte n'apparait pas (jamais un « momentanement indisponible » qui dure).
  function absent(b) { return !!b && b.statut === "indisponible"; }
  function nbMatchsTexte(x) { return tf("aujourdhui.matches", "{n} matchs", { n: x }); }
  function ticket(b, type, jour, opts) {
    if (absent(b)) return "";
    var base = { type: type, cls: "sc--tk tk-" + type, icone: "ticket", titre: nomTicket(type) };
    if (!b || b.statut !== "publie") {
      return petiteCarte(Object.assign(base, { cls: base.cls + " is-empty", contenu: message(etatCourtCarte(b), "sc-short"), detail: message(etatTexte(b, type)), ouvrable: true,
        etiquette: tf("aujourdhui.open_ticket", "Voir le {name}", { name: nomTicket(type).toLowerCase() }) }));
    }
    if (b.verrou !== null) {
      // En-tete VRAI (nombre de matchs, cote totale : seuls champs envoyes), contenu FAUX.
      var fig = n(b.cote_totale) !== null ? '<div class="sc-fig"><p class="sc-k">' + esc(t("aujourdhui.total_k", "Cote totale")) + '</p><p class="sc-v">' + esc(cote(b.cote_totale)) + "</p></div>" : "";
      var entete = [n(b.nb_matchs) !== null ? nbMatchsTexte(b.nb_matchs) : "", n(b.cote_totale) !== null ? tf("aujourdhui.total_odds", "cote totale {v}", { v: cote(b.cote_totale) }) : ""].filter(Boolean).join(" · ");
      return petiteCarte(Object.assign(base, { cls: base.cls + " is-locked", desc: n(b.nb_matchs) !== null ? nbMatchsTexte(b.nb_matchs) : "", action: badgeVerrou(b.verrou, type),
        contenu: fig + '<span class="aj-sr">' + esc(entete) + "</span>", detail: flou() }));
    }
    var l = jambesValides(b, opts);
    if (!l.length || n(b.chance) === null || n(b.cote_totale) === null) return "";
    var op = avecOperateur();
    var hj = horsJeu(b, l);
    var unique = op && b.operateur_unique;
    var premier = l.map(function (j) { return j.coup_envoi; }).filter(Boolean).sort()[0];
    var K0 = K();
    var copie = K0 ? K0.boutonBascule({ avant: t("aujourdhui.copy", "Copier le ticket"), apres: t("aujourdhui.copied", "Copié"), icone: "copy", attrs: 'data-tk-copy="' + type + '"' })
      : '<button type="button" class="mu-sub" data-tk-copy="' + type + '"><span class="mu-sub-s mu-sub-a"><span>' + esc(t("aujourdhui.copy", "Copier le ticket")) + "</span></span></button>";
    var phrases = phrasesHorsJeu(hj), sans = ligneSans(hj);
    var detail = (unique ? '<p class="aj-note">' + esc(tf("aujourdhui.total_at_k", "Cote totale chez {op}", { op: b.operateur_unique })) + "</p>" : "")
      + '<ol class="tk-l">' + l.map(function (j) { return ligneJambe(j, op); }).join("") + "</ol>"
      + (phrases.length ? phrases.map(function (p, i) { return '<p class="tk-rep">' + esc(p) + (i === phrases.length - 1 && sans ? " " + esc(sans) : "") + "</p>"; }).join("") : "")
      + '<div class="tk-f">' + copie + '<span class="aj-sr" aria-live="polite" data-tk-live></span></div>'
      + '<textarea class="tk-copytext" data-tk-text="' + type + '" readonly hidden>' + esc(texteCopie(b, jour, opts)) + "</textarea>";
    // 04/10, Clement : pas de pourcentage de chance sur les combines (cote totale seulement).
    var contenu = '<div class="sc-fig"><p class="sc-k">' + esc(t("aujourdhui.total_k", "Cote totale")) + '</p><p class="sc-v">' + esc(cote(b.cote_totale)) + "</p></div>";
    return petiteCarte(Object.assign(base, { cls: base.cls + (hj.off.length ? " has-off" : ""), desc: nbMatchsTexte(l.length),
      descLarge: premier && heure(premier) ? " · " + tf("aujourdhui.first_at", "premier match à {h}", { h: heure(premier) }) : "",
      contenu: contenu, detail: detail, ouvrable: true, etiquette: tf("aujourdhui.open_ticket", "Voir le {name}", { name: nomTicket(type).toLowerCase() }) }));
  }
  // Buteur du jour : petite carte, Magic UI Animated Circular Progress Bar pour sa chance.
  function buteur(b) {
    var base = { type: "buteur", cls: "sc--bt", icone: "target", titre: t("aujourdhui.scorer_title", "Buteur du jour") };
    if (absent(b)) return "";
    if (!b || b.statut !== "publie") return petiteCarte(Object.assign(base, { cls: base.cls + " is-empty", contenu: message(etatCourtCarte(b), "sc-short"), detail: message(etatTexte(b, "buteur")), ouvrable: true }));
    if (b.verrou !== null) {
      return petiteCarte(Object.assign(base, { cls: base.cls + " is-locked", action: badgeVerrou(b.verrou, "buteur"), desc: t("aujourdhui.scorer_ready", "prêt"),
        contenu: '<div class="sc-fig aj-blur" aria-hidden="true" inert><p class="sc-v sc-name">' + FAUX_JOUEUR[0] + '</p><p class="sc-k">' + FAUX_JOUEUR[1] + "</p></div>" + anneauFlou() }));
    }
    var ch = n(b.chance);
    if (!b.joueur || ch === null || ch < 10 || ch > 45) return "";
    var retire = b.etat === "retire";
    // Petite carte : l'equipe ; carte large et tiroir : l'adversaire et l'heure en plus.
    var suite = [b.adversaire ? tf("aujourdhui.scorer_vs", "contre {team}", { team: b.adversaire }) : "", heure(b.coup_envoi)].filter(Boolean).join(" · ");
    var sous = esc(b.equipe || "") + (suite ? '<span class="sc-wide">' + esc((b.equipe ? " · " : "") + suite) + "</span>" : "");
    return petiteCarte(Object.assign(base, { cls: base.cls + (retire ? " is-off" : ""), descLarge: t("aujourdhui.scorer_sub", "le plus probable du jour"),
      contenu: '<div class="sc-fig"><p class="sc-v sc-name">' + esc(b.joueur) + '</p><p class="sc-k">' + sous + "</p></div>"
        + anneau(ch, tf("aujourdhui.scorer_aria", "Chance de marquer : {v}", { v: pc(ch) })),
      detail: '<p class="aj-note">' + esc(retire ? t("aujourdhui.scorer_out", "Annoncé absent depuis la publication.") : t("aujourdhui.scorer_note", "Chance de marquer pendant le match, titulaire probable. Arrondie vers le bas, 45 % au plus.")) + "</p>",
      ouvrable: true, etiquette: t("aujourdhui.open_scorer", "Voir le buteur du jour") }));
  }
  // Selection en or (Magic UI Shine Border, or) : lignes compactes numerotees 1-2-3.
  function selectionOr(b) {
    var K0 = K();
    var cadre = function (classe, sous, corps, action) {
      return '<article class="or ' + classe + '">' + (classe === "is-on" && K0 ? K0.reflet() : "")
        + '<header class="or-h"><span class="or-ico">' + ico("award") + '</span><span class="or-t"><b>' + esc(t("aujourdhui.gold_title", "Sélection en or")) + "</b>" + (sous ? "<span>" + esc(sous) + "</span>" : "") + "</span>"
        + (action || "") + "</header>" + corps + "</article>";
    };
    if (absent(b)) return "";
    if (!b || b.statut !== "publie") return cadre("is-empty", "", message(etatTexte(b, "or")));
    if (b.verrou !== null) return cadre("is-locked", n(b.nb_paris) !== null ? tf("aujourdhui.gold_count", "{n} paris", { n: b.nb_paris }) : "", flou(), badgeVerrou(b.verrou, "or"));
    var l = (Array.isArray(b.paris) ? b.paris : []).filter(function (p) { return p && p.domicile && p.exterieur && p.pari && n(p.chance) !== null && n(p.cote) !== null; }).slice(0, 3);
    if (l.length !== 3) return "";
    var op = avecOperateur();
    return cadre("is-on", t("aujourdhui.gold_sub", "3 paris à cote plus haute, choisis par IASHARK"), '<ol class="or-l">' + l.map(function (p, i) {
      return '<li><span class="or-r">' + (i + 1) + '</span><span class="tk-m"><b>' + esc(pariTexte(p)) + "</b><small>" + esc(p.domicile + " – " + p.exterieur) + (heure(p.coup_envoi) ? " · " + esc(heure(p.coup_envoi)) : "") + "</small></span>"
        + '<span class="tk-o"><b>' + esc(cote(p.cote)) + "</b>" + (op && p.operateur ? "<small>" + esc(p.operateur) + "</small>" : "") + '</span><span class="or-c">' + esc(pc(p.chance)) + "</span></li>";
    }).join("") + "</ol>");
  }
  // UN bloc de deverrouillage pour les quatre blocs : une ligne, un bouton.
  function deverrouillage(rep) {
    var b = { x5: bloc(rep, "x5"), x10: bloc(rep, "x10"), or: bloc(rep, "or"), buteur: bloc(rep, "buteur") };
    var publie = function (x) { return x && x.statut === "publie"; };
    var NOM = { x5: t("aujourdhui.unlock_x5", "le petit combiné"), x10: t("aujourdhui.unlock_x10", "le grand combiné"), or: t("aujourdhui.unlock_gold", "la Sélection en or"), buteur: t("aujourdhui.unlock_scorer", "le buteur du jour") };
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
      return '<div class="aj-unlock hs-gate-card"><p class="aj-unlock-t"><span>' + esc(texte) + "</span></p>" + cta + (petit ? '<p class="aj-small">' + esc(petit) + "</p>" : "") + "</div>";
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
    return "";
  }
  // Un ticket ouvert affiche les meilleures cotes de plusieurs operateurs (pas d'operateur unique).
  function noteMeilleuresCotes(rep) {
    if (!avecOperateur()) return false;
    return TYPES.some(function (k) { var b = bloc(rep, k); return ouvert(b) && Array.isArray(b.jambes) && b.jambes.length && !b.operateur_unique; });
  }
  // Mentions en petit et en gris (demande de Clement du 04/10, 16 h) : une seule ligne, sans
  // repeter celles qui existent deja ; « Ce site ne fournit aucun conseil financier. » a cote.
  function mentions() {
    return t("aujourdhui.legal", "Estimation statistique, pas une garantie. Les paris sportifs sont interdits aux moins de 18 ans.")
      + " " + t("aujourdhui.no_financial_advice", "Ce site ne fournit aucun conseil financier.");
  }
  function html(rep, opts) {
    if (!lisible(rep)) return "";
    opts = opts || {};
    var j = jourLong(rep.jour);
    var cartes = [ticket(bloc(rep, "x5"), "x5", rep.jour, opts), ticket(bloc(rep, "x10"), "x10", rep.jour, opts), buteur(bloc(rep, "buteur"))].filter(Boolean);
    var or = selectionOr(bloc(rep, "or"));
    if (!cartes.length && !or) return "";
    return '<div class="aj-head"><h2 class="aj-title" id="ajTitre">' + esc(t("aujourdhui.title", "Aujourd’hui")) + "</h2>" + (j ? '<p class="aj-date">' + esc(j) + "</p>" : "") + "</div>"
      + (cartes.length ? '<div class="aj-row aj-n' + cartes.length + '">' + cartes.join("") + "</div>" : "")
      + or
      + deverrouillage(rep)
      // « Meilleures cotes relevees... » : UNE fois pour le bloc (aucune repetition).
      + (noteMeilleuresCotes(rep) ? '<p class="aj-legal">' + esc(t("aujourdhui.best_odds_note", "Meilleures cotes relevées chez les opérateurs agréés ; chez ton opérateur, la cote totale peut être un peu différente.")) + "</p>" : "")
      + '<p class="aj-legal">' + esc(mentions()) + "</p>";
  }
  // Signature des etats des matchs (pour ne re-rendre que si un statut public change).
  function signature(rep, opts) {
    if (!lisible(rep)) return "";
    return TYPES.map(function (k) { var b = bloc(rep, k); return ouvert(b) ? jambesValides(b, opts).map(function (x) { return x.etat; }).join(",") : ""; }).join("|");
  }

  // ---------------------------------------------------------- navigateur
  function copier(btn) {
    var type = btn.getAttribute("data-tk-copy");
    var portee = btn.closest("[data-aj-det], .aj-drw") || btn.parentNode;
    var zone = portee.querySelector('[data-tk-text="' + type + '"]');
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
  function brancherCopie(racine) {
    racine.querySelectorAll("[data-tk-copy]").forEach(function (b) { b.addEventListener("click", function () { copier(b); }); });
  }
  // Tiroir du bas (Flowbite « Drawer », placement bottom ; lib/composants.js#Tiroir, le meme
  // que le panneau Marches) : au telephone, le detail d'une petite carte s'ouvre ici.
  var compteur = 0;
  function tiroir(el) {
    if (el._ajTir) return el._ajTir;
    var C = K(), D = G.document;
    if (!C || !C.Tiroir || !D) return null;
    var id = "ajDrwT" + (++compteur);
    var boite = D.createElement("div");
    boite.className = "aj-drw";
    boite.setAttribute("aria-labelledby", id);
    boite.tabIndex = -1;
    boite.innerHTML = '<div class="aj-drw-h"><span class="sc-ico" data-aj-drw-ico></span><div class="sc-ht"><h2 class="aj-drw-t" id="' + id + '"></h2><p class="sc-d" data-aj-drw-d></p></div>'
      + '<button type="button" class="fb-close" data-aj-close aria-label="' + esc(t("aujourdhui.close", "Fermer")) + '">' + ico("x", "aj-ico") + "</button></div>"
      + '<div class="aj-drw-b" data-aj-drw-b></div>';
    D.body.appendChild(boite);
    var tir = new C.Tiroir(boite, { poignee: true, libelleFermer: t("aujourdhui.close", "Fermer") });
    boite.querySelector("[data-aj-close]").addEventListener("click", function () { tir.hide(); });
    el._ajTir = { tir: tir, boite: boite, id: id };
    return el._ajTir;
  }
  function ouvrir(el, type, declencheur) {
    var carte = el.querySelector('[data-aj-card="' + type + '"]');
    var T = tiroir(el);
    if (!carte || !T) return;
    var b = T.boite;
    b.querySelector("#" + T.id).textContent = (carte.querySelector(".sc-t") || {}).textContent || "";
    var d = carte.querySelector(".sc-d");
    b.querySelector("[data-aj-drw-d]").textContent = d ? d.textContent : "";
    var icone = carte.querySelector(".sc-ico");
    b.querySelector("[data-aj-drw-ico]").innerHTML = icone ? icone.innerHTML : "";
    // Le resume (cote, anneau ou joueur) puis le detail (matchs, notes, « Copier le ticket »).
    var c = carte.querySelector(".sc-c"), det = carte.querySelector("[data-aj-det]");
    var corps = b.querySelector("[data-aj-drw-b]");
    corps.innerHTML = (c && !carte.classList.contains("is-empty") ? '<div class="sc-c aj-drw-sum">' + c.innerHTML + "</div>" : "")
      + (det ? '<div class="aj-drw-det" data-aj-det>' + det.innerHTML + "</div>" : "");
    corps.querySelectorAll("[data-mu-gauge]").forEach(function (g) { if (K() && K().poserJauge) K().poserJauge(g); });
    brancherCopie(corps);
    T.tir.show(declencheur || null);
    try { b.focus({ preventScroll: true }); } catch (e) {}
  }
  // Interrupteur de mise en ligne (lib/offre-pro.js#OUVERT.tickets, ferme tant que la
  // fonction tickets-du-jour et la migration 0050 ne sont pas deployees ; controle de l'avocat
  // du diable du 04/10, point 1) ET marche francais seulement (les cotes viennent
  // d'operateurs agrees en France ; point 4). opts.ouvert force la valeur (tests).
  function enLigne(opts) {
    if (opts && typeof opts.ouvert === "boolean") return opts.ouvert;
    var OP = G && G.IasharkOffrePro, M = G && G.IASHARK_MARKET;
    return !!(OP && OP.OUVERT && OP.OUVERT.tickets) && (!M || !M.code || M.code === "fr");
  }
  function peindre(el) {
    var st = el._aj;
    var contenu = html(st.rep, st.opts);
    if (!contenu) { el.hidden = true; el.innerHTML = ""; return false; }
    el.innerHTML = contenu;
    el.hidden = false;
    st.sig = signature(st.rep, st.opts);
    brancherCopie(el);
    el.querySelectorAll("[data-aj-open]").forEach(function (b) { b.addEventListener("click", function () { ouvrir(el, b.getAttribute("data-aj-open"), b); }); });
    if (K()) K().activer(el);
    return true;
  }
  // el : <section id="aujourdhui"> (cachee tant qu'aucune reponse lisible).
  function mount(el, opts) {
    if (!el) return null;
    opts = opts || {};
    if (!enLigne(opts)) { el.hidden = true; el.innerHTML = ""; return Promise.resolve(null); }
    var App = G.IasharkApp;
    var lire = opts.lire || function () {
      if (!App || !App.supabase || !App.supabase.functions) return Promise.resolve(null);
      return App.supabase.functions.invoke("tickets-du-jour", { body: {} }).then(function (r) { return r && !r.error ? r.data : null; }, function () { return null; });
    };
    return Promise.resolve().then(lire).then(function (rep) {
      el._aj = { rep: rep, opts: Object.assign({}, el._aj && el._aj.opts, opts), sig: "" };
      return peindre(el) ? rep : null;
    }).catch(function () { el.hidden = true; return null; });
  }
  // Statut PUBLIC des matchs (liste de l'accueil) : statutDe(fixture_id) -> « PST », « CANC »...
  // Le bloc n'est redessine que si l'etat d'un match d'un ticket change.
  function statuts(el, statutDe) {
    if (!el || typeof statutDe !== "function") return false;
    var st = el._aj || (el._aj = { rep: null, opts: {}, sig: "" });
    st.opts = Object.assign({}, st.opts, { statutDe: statutDe });
    if (!st.rep || signature(st.rep, st.opts) === st.sig) return false;
    return peindre(el);
  }

  return { html: html, texteCopie: texteCopie, mount: mount, statuts: statuts, enLigne: enLigne, FAUX_LIGNES: FAUX_LIGNES, FAUX_JOUEUR: FAUX_JOUEUR,
    lisible: lisible, heure: heure, estFr: estFr, sansCalcule: sansCalcule, etatDe: etatDe };
});
