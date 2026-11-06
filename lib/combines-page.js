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
   Jamais de mise, de gain, d'unite, de capital ni d'esperance : des paliers et des cotes.

   REFONTE VISUELLE DU 06/11/2026 (Clement : une page « de fou », pas une liste de cartes). Contenu et droits
   inchanges ; la page dessine elle-meme le bloc (lib/aujourdhui.js, opts.rendu) avec les memes briques :
   1. LE TICKET DU SOIR : chaque combine en vrai ticket, cote totale en tres grand (Anton, Magic UI Number Ticker),
      onglets Petit / Grand au telephone (HyperUI Tabs), cote a cote a l'ordinateur ; deblocage et essai Pro
      (lib/offre-pro.js, via le bloc de deblocage d'origine) juste dessous ;
   2. la Selection en or (inchangee), 3. les montantes en serie de paliers, 4. les buteurs, puis les regles.
   06/11/2026 (Clement) : plus de tickets de la veille ni de liste des derniers combines sur cette page, qui vit au
   fil de la journee ; la veille (gagnes ET perdus) reste resumee par le bandeau des resultats en haut du site. */
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
  // Libelle d'un pari : code « F… » ou langue autre que le francais (le libelle publie est en francais) : traduit depuis
  // le code (lib/market-labels.js) ; sinon le libelle publie.
  function pariTexte(p) {
    var ML = G && G.IasharkMarketLabels, A = G && G.IasharkAujourdhui;
    if (p && ML && ML.marketIdLabel && p.m && (/^F\d+:/.test(String(p.m)) || (A && A.estFr && !A.estFr()))) { try { var s = ML.marketIdLabel(p.m, { home: p.h, away: p.a }); if (s && s !== p.m) return s; } catch (e) {} }
    return p ? p.p : "";
  }

  // Donnees chargees par la page : fichier des montantes, matchs publics de l'accueil par numero (equipes, logos,
  // competition), bande des resultats (preuves/bandeau.json : combines des 7 derniers jours, regles) et l'onglet ouvert.
  var ETAT = { montantes: null, matchs: {}, bandeau: null, onglet: null };
  function A0() { return G.IasharkAujourdhui; }
  function I0() { var A = A0(); return A && A.interne; }
  function K0() { return G.IasharkComposants; }

  // ============================================================ LE TICKET DU SOIR (refonte du 06/11/2026)
  // Un vrai ticket par combine (Petit, Grand), en grand : cote totale enorme (Magic UI Number Ticker), nombre de
  // matchs, perforation, et le tampon du resultat quand il existe. Au telephone, un onglet par ticket (HyperUI Tabs) ;
  // a l'ordinateur, les deux tickets cote a cote.
  // DROITS (inchanges, controle de l'avocat du diable du 04/10/2026) : un ticket verrouille n'a dans la reponse QUE son
  // nombre de matchs et sa cote totale ; ses lignes sont des barres vides (aucun texte, aucun faux nom) en meme nombre
  // que nb_matchs. Heures, competitions, logos, chance et paris : seulement sur un ticket ouvert (Pro).
  // RESULTAT : seulement celui de la bande des resultats (preuves/bandeau.json, regle par l'archive ou le score final,
  // gagnes ET perdus). Le matin, tant que les tickets du jour sont en preparation, la scene montre ceux du dernier jour
  // regle avec leur tampon : jamais un chiffre invente.
  // LE DIRECT : le site n'a aucune source de score en direct (data-home.json est recalcule la nuit, sans score) ; chaque
  // ligne d'un ticket ouvert porte un emplacement vide (data-cb-direct = numero du match) pret a recevoir le score et
  // l'etat « passe » le jour ou une source existera. Aucun appel API-Sports depuis le navigateur (cle jamais exposee).
  var TYPES_TK = ["x5", "x10"];
  var RESULTATS = { win: ["combines_v3.stamp_won", "Validé"], loss: ["combines_v3.stamp_lost", "Perdu"], void: ["combines_v3.stamp_void", "Annulé"], verif: ["combines_v3.stamp_check", "En vérification"] };
  function classeRes(r) { return r === "win" || r === "loss" || r === "void" ? r : "verif"; }
  function libRes(r) { var c = classeRes(r); return t(RESULTATS[c][0], RESULTATS[c][1]); }
  function tampon(r) {
    return '<span class="tq-tampon tq-tampon--' + classeRes(r) + '" role="img" aria-label="' + esc(t("combines_v3.result_aria", "Résultat") + " : " + libRes(r)) + '"><span aria-hidden="true">' + esc(libRes(r)) + "</span></span>";
  }
  // Combines regles de la bande des resultats (7 derniers jours), du plus recent au plus ancien.
  function combinesRegles() {
    var b = ETAT.bandeau;
    var l = b && Array.isArray(b.combines) ? b.combines : [];
    return l.filter(function (c) { return c && (c.t === "x5" || c.t === "x10") && /^\d{4}-\d{2}-\d{2}$/.test(String(c.j || "")) && cote(c.c) !== null && Number(c.n) > 0; })
      .slice().sort(function (a, b) { return a.j < b.j ? 1 : a.j > b.j ? -1 : (a.t === "x10" ? -1 : 1); });
  }
  function resultatDe(type, jour) { return combinesRegles().filter(function (c) { return c.t === type && c.j === jour; })[0] || null; }
  // Logo d'equipe ou de competition (media.api-sports.io), seulement si l'identifiant est connu par les matchs publics.
  function logoImg(genre, id, alt, cls) {
    var x = idValide(id);
    return x ? '<img class="' + cls + '" src="https://media.api-sports.io/football/' + genre + "/" + x + '.png" alt="' + esc(alt || "") + '" width="20" height="20" loading="lazy" decoding="async" data-cb-logo>' : "";
  }
  // Le nombre part de 1,00 et monte jusqu'a la cote (Magic UI Number Ticker, une fois a l'entree a l'ecran) ; le texte
  // de depart est deja la vraie cote (sans script ou avec le mouvement reduit, rien ne bouge).
  function grandeCote(v) {
    return '<b class="tq-v" data-mu-ticker="' + esc(String(cote(v))) + '" data-mu-dec="2" data-mu-from="1">' + esc(fmt(v)) + "</b>";
  }
  function teteTicket(type, sousTitre, action) {
    return '<header class="tq-h"><span class="tq-nom">' + ico("ticket", "cb-ico") + "<span>" + esc(I0().nomTicket(type)) + "</span></span>"
      + (sousTitre ? '<span class="tq-jour">' + esc(sousTitre) + "</span>" : "") + (action || "") + "</header>";
  }
  // fixe : un ticket deja regle ne s'anime pas (un chiffre qui defile ferait lire une fausse cote sur une capture).
  function figure(libelle, v, fixe) { return '<div class="tq-fig"><span class="tq-k">' + esc(libelle) + "</span>" + (fixe ? '<b class="tq-v">' + esc(fmt(v)) + "</b>" : grandeCote(v)) + "</div>"; }
  function perforation() { return '<div class="tq-perfo" role="none"></div>'; }
  function meta(parts) { return '<p class="tq-meta">' + parts.filter(Boolean).join("") + "</p>"; }
  function nbMatchs(x) { return "<span>" + esc(tf("aujourdhui.matches", "{n} matchs", { n: x })) + "</span>"; }

  // Ticket verrouille : nombre de matchs et cote totale (les seuls champs envoyes), lignes vides sans aucun texte.
  function ticketVerrou(b, type, rep) {
    var I = I0(), nb = n(b.nb_matchs), res = resultatDe(type, rep.jour);
    var lignes = "";
    for (var i = 1; i <= Math.min(Math.max(nb || 0, 0), 8); i++) {
      lignes += '<li class="tq-leg tq-leg--cache"><span class="tq-n">' + i + '</span><span class="tq-barres"><i></i><i></i></span>' + ico("lock", "cb-ico") + "</li>";
    }
    // Au telephone, seules les 3 premieres lignes se voient (CSS) : le reste se dit par un nombre.
    if (nb > 3) lignes += '<li class="tq-plus">+' + (nb - 3) + "</li>";
    return '<article data-tg-evite class="tq tq-' + type + ' tq--verrou">' + teteTicket(type, I.jourLong(rep.jour), I.badgeVerrou(b.verrou, type))
      + '<div class="tq-corps">' + (n(b.cote_totale) !== null ? figure(t("aujourdhui.total_k", "Cote totale"), b.cote_totale) : "") + (res ? tampon(res.r) : "") + "</div>"
      + (nb !== null ? meta([nbMatchs(nb)]) : "")
      + perforation()
      + (nb ? '<p class="tq-cache">' + ico("lock", "cb-ico") + "<span>" + esc(t("combines_v3.hidden_legs", "Équipes, heures et paris : dans Pro.")) + "</span></p>"
        + '<ol class="tq-l tq-l--cache" aria-hidden="true">' + lignes + "</ol>" : "")
      + "</article>";
  }

  // « AAAA-MM-JJ HH:MM » a l'heure de Paris (format des tickets) -> millisecondes ; NaN si illisible.
  function msParis(txt) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(txt || ""));
    if (!m) return NaN;
    var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    try {
      var p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utc));
      var g = function (k) { return Number(p.filter(function (x) { return x.type === k; })[0].value); };
      return utc - (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - utc);
    } catch (e) { return NaN; }
  }
  // Score en direct d'une jambe (lib/scores-direct.js) : numero du match, coup d'envoi (heure de Paris -> ms) et code du
  // marche pour l'etat provisoire (passe / perdu / en cours). Vide et cache tant qu'aucun vrai score n'est arrive.
  function directJambe(j) {
    var id = idValide(j.fixture_id), ts = msParis(j.coup_envoi);
    if (!id || !isFinite(ts)) return "";
    return '<span class="tq-direct" data-cb-direct="' + id + '" data-sd-fid="' + id + '" data-sd-ts="' + ts + '" data-sd-jambe data-sd-m="' + esc(j.market_id || "") + '" hidden></span>';
  }
  // Ticket ouvert (Pro) : tout, avec les logos des competitions et des equipes quand ils sont connus.
  function ticketOuvert(b, type, rep, opts) {
    var I = I0(), A = A0(), K = K0();
    var l = I.jambesValides(b, opts);
    if (!l.length || n(b.cote_totale) === null) return "";
    var op = I.avecOperateur(), hj = I.horsJeu(b, l), res = resultatDe(type, rep.jour);
    var premier = l.map(function (j) { return j.coup_envoi; }).filter(Boolean).sort()[0];
    var vues = {}, logosLigues = [];
    l.forEach(function (j) {
      var m = ETAT.matchs[String(j.fixture_id)];
      var id = m && idValide(m.league_id);
      if (id && !vues[id]) { vues[id] = 1; logosLigues.push(logoImg("leagues", id, m.league || j.ligue || "", "tq-ligue")); }
    });
    // Decision de Clement du 04/10/2026 (16 h 50) : aucun pourcentage de chance sur les combines,
    // ni total ni par match. Jauge gardee dans le code mais coupee (CHANCE_TICKET = false).
    var CHANCE_TICKET = false;
    var ch = CHANCE_TICKET ? n(b.chance) : null;
    var jauge = ch !== null && ch >= 1 && ch <= 99 && K
      ? '<div class="tq-chance">' + K.jauge(ch, pc(ch), { grand: true, aria: tf("combines_v3.chance_aria", "Chance calculée que tout passe : {v}", { v: pc(ch) }) })
        + '<span class="tq-chance-k">' + esc(t("combines_v3.chance_k", "Chance calculée que tout passe")) + "<small>" + esc(t("combines_v3.chance_note", "Une estimation, pas une garantie.")) + "</small></span></div>"
      : "";
    var lignes = l.map(function (j) {
      var off = j.etat === "reporte" || j.etat === "annule";
      var m = ETAT.matchs[String(j.fixture_id)];
      var lh = m && m.home && m.home.n === j.domicile ? logoImg("teams", m.home.id, "", "tq-eq-logo") : "";
      var la = m && m.away && m.away.n === j.exterieur ? logoImg("teams", m.away.id, "", "tq-eq-logo") : "";
      return '<li class="tq-leg' + (off ? " is-off" : "") + '"><span class="tq-heure">' + esc(heure(j.coup_envoi)) + "</span>"
        + '<span class="tq-m"><span class="tq-eq">' + lh + "<b>" + esc(j.domicile) + '</b><span class="tq-vs">–</span>' + la + "<b>" + esc(j.exterieur) + "</b></span>"
        + "<small>" + esc(I.pariTexte(j)) + (off ? " · " + esc(I.etatCourt(j)) : "") + "</small></span>"
        + '<span class="tq-o"><b>' + esc(I.cote(j.cote)) + "</b>" + (op && j.operateur ? "<small>" + esc(j.operateur) + "</small>" : "") + "</span>"
        + directJambe(j) + "</li>";
    }).join("");
    var phrases = I.phrasesHorsJeu(hj), sans = I.ligneSans(hj);
    var copie = K ? K.boutonBascule({ avant: t("aujourdhui.copy", "Copier le ticket"), apres: t("aujourdhui.copied", "Copié"), icone: "copy", attrs: 'data-tk-copy="' + type + '"' }) : "";
    var unique = op && b.operateur_unique;
    return '<article data-tg-evite class="tq tq-' + type + ' tq--ouvert">' + teteTicket(type, I.jourLong(rep.jour), "")
      + '<div class="tq-corps">' + figure(unique ? tf("aujourdhui.total_at_k", "Cote totale chez {op}", { op: b.operateur_unique }) : t("aujourdhui.total_k", "Cote totale"), b.cote_totale)
      + (res ? tampon(res.r) : jauge) + "</div>"
      + meta([nbMatchs(l.length), premier && heure(premier) ? "<span>" + esc(tf("aujourdhui.first_at", "premier match à {h}", { h: heure(premier) })) + "</span>" : "",
        logosLigues.length ? '<span class="tq-ligues" role="group" aria-label="' + esc(t("combines_v3.leagues_aria", "Compétitions du ticket")) + '">' + logosLigues.join("") + "</span>" : ""])
      + perforation()
      + '<ol class="tq-l">' + lignes + "</ol>"
      + phrases.map(function (p, i) { return '<p class="tk-rep">' + esc(p) + (i === phrases.length - 1 && sans ? " " + esc(sans) : "") + "</p>"; }).join("")
      + '<div class="tq-pied" data-aj-det>' + copie + '<span class="aj-sr" aria-live="polite" data-tk-live></span>'
      + '<textarea class="tk-copytext" data-tk-text="' + type + '" readonly hidden>' + esc(A.texteCopie(b, rep.jour, opts)) + "</textarea></div>"
      + "</article>";
  }

  function ticketMessage(b, type, rep) {
    return '<article data-tg-evite class="tq tq-' + type + ' tq--vide">' + teteTicket(type, I0().jourLong(rep.jour), "") + '<p class="tq-msg">' + esc(I0().etatTexte(b, type)) + "</p></article>";
  }

  // Onglets (HyperUI Tabs n° 2, assets/composants.css) + panneaux. items : [{ type, html, etiquette, publie }].
  function scene(items, titre, sous) {
    if (!items.length) return "";
    var choix = items.some(function (x) { return x.type === ETAT.onglet; }) ? ETAT.onglet
      : (items.filter(function (x) { return x.type === "x10" && x.publie; })[0] || items.filter(function (x) { return x.publie; })[0] || items[0]).type;
    var plusieurs = items.length > 1;
    var onglets = plusieurs ? '<div class="hu-tabs tdj-tabs"><div class="hu-tablist" role="tablist" aria-label="' + esc(t("combines_v3.tabs_aria", "Choisir le combiné")) + '">'
      + items.map(function (x) {
        var on = x.type === choix;
        return '<button type="button" class="hu-tab" role="tab" id="tdjTab-' + x.type + '" aria-controls="tdjPan-' + x.type + '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-cb-onglet="' + x.type + '">'
          + "<span>" + esc(I0().nomTicket(x.type)) + "</span>" + (x.etiquette ? '<small class="tdj-tab-c">' + esc(x.etiquette) + "</small>" : "") + "</button>";
      }).join("") + "</div></div>" : "";
    var panneaux = items.map(function (x) {
      return '<div class="tdj-pan' + (x.type === choix ? " is-actif" : "") + '" id="tdjPan-' + x.type + '"' + (plusieurs ? ' role="tabpanel" aria-labelledby="tdjTab-' + x.type + '"' : "") + ">" + x.html + "</div>";
    }).join("");
    return '<div class="tdj-tete"><h2 class="cb-h2" id="tdjTitre">' + esc(titre) + "</h2>" + (sous ? '<p class="cb-texte">' + esc(sous) + "</p>" : "") + "</div>"
      + onglets + '<div class="tdj-scene tdj-n' + items.length + '">' + panneaux + "</div>";
  }

  function ticketsHtml(rep, opts) {
    var I = I0();
    var blocs = TYPES_TK.map(function (type) { return { type: type, b: I.bloc(rep, type) }; }).filter(function (x) { return !I.absent(x.b); });
    var publies = blocs.filter(function (x) { return x.b && x.b.statut === "publie"; });
    var corps;
    if (!publies.length) {
      // Pas encore de ticket aujourd'hui : on annonce ceux du jour, rien de la veille (decision de Clement du 06/11/2026 :
      // la page combines vit au fil de la journee ; la veille est resumee par le bandeau des resultats en haut du site).
      var attente = t("combines_page.empty", "Les combinés du jour arrivent chaque matin, dès que le calcul du jour est terminé.");
      corps = blocs.length
        ? scene(blocs.map(function (x) { return { type: x.type, html: ticketMessage(x.b, x.type, rep) }; }), t("combines_v3.stage_title", "Le ticket du soir"), attente)
        : '<div class="tdj-tete"><h2 class="cb-h2" id="tdjTitre">' + esc(t("combines_v3.stage_title", "Le ticket du soir")) + '</h2><p class="cb-texte">' + esc(attente) + "</p></div>";
    } else {
      corps = scene(blocs.map(function (x) {
        var b = x.b, h;
        if (!b || b.statut !== "publie") h = ticketMessage(b, x.type, rep);
        else if (b.verrou !== null) h = ticketVerrou(b, x.type, rep);
        else h = ticketOuvert(b, x.type, rep, opts) || ticketMessage({ statut: "indisponible" }, x.type, rep);
        var et = b && b.statut === "publie" && n(b.cote_totale) !== null ? tf("combines_v3.tab_odds", "cote {v}", { v: fmt(b.cote_totale) }) : "";
        return { type: x.type, publie: !!(b && b.statut === "publie"), html: h, etiquette: et };
      }), t("combines_v3.stage_title", "Le ticket du soir"), t("combines_v3.stage_sub", "Publié avant les matchs, jamais modifié ensuite."));
    }
    if (!corps) return "";
    return '<section class="tdj" id="cbTickets" aria-labelledby="tdjTitre">' + corps + I.deverrouillage(rep, opts) + "</section>";
  }

  // Rendu complet du bloc (lib/aujourdhui.js, opts.rendu) : ticket du soir et son deblocage, la preuve, la Selection
  // en or, les montantes, les buteurs, puis les mentions du bloc (une seule fois).
  function rendu(rep, opts) {
    var I = I0();
    if (!I) return "";
    var or = I.selectionOr(I.bloc(rep, "or"));
    // Ordre du 06/11/2026 (Clement) : le ticket du soir, puis les buteurs du jour (ouverts avec un compte gratuit),
    // puis la Selection en or et les montantes.
    var corps = ticketsHtml(rep, opts) + buteursHtml(rep) + (or ? '<div class="cb-or">' + or + "</div>" : "") + montantesHtml(rep);
    if (!corps) return "";
    return corps + '<div class="cb-mentions">'
      + (I.coteIndicative(rep) ? '<p class="aj-legal">' + esc(t("aujourdhui.indicative_note", "Cote indicative : vérifie-la chez ton opérateur agréé.")) + "</p>"
        : I.noteMeilleuresCotes(rep) ? '<p class="aj-legal">' + esc(t("aujourdhui.best_odds_note", "Meilleures cotes relevées chez les opérateurs agréés ; chez ton opérateur, la cote totale peut être un peu différente.")) + "</p>" : "")
      + '<p class="aj-legal">' + esc(I.mentions()) + "</p></div>";
  }

  // ============================================================ LA COURSE DES MONTANTES
  // Largeur nominale du pari du soir quand sa cote est reservee a Pro : jamais la vraie (elle se deduirait).
  var COTE_NOMINALE = 1.4;

  // Ce soir pour une montante -> { txt, cote, verrou, palier }.
  function ceSoir(s, or, pSoir) {
    var MT = G.IasharkMontantes;
    if (s.attente) return { txt: tf("combines_v2.climb_waiting", "En attente du résultat du {date}.", { date: jourCourt(s.attente.j) }), etat: "attente" };
    if (!s.pret) return { txt: t("combines_v2.climb_stale", "Mise à jour chaque matin, après les résultats de la veille."), etat: "attente" };
    if (!or || !or.statut || or.statut === "en_preparation") return { txt: t("combines_v2.climb_tonight_preparing", "Pari du soir en préparation."), etat: "prep" };
    if (or.statut === "aucun") return { txt: t("combines_v2.climb_tonight_none", "Pas de Sélection en or aujourd’hui : la montante ne bouge pas."), etat: "repos" };
    if (or.statut !== "publie") return { txt: t("aujourdhui.unavailable", "Momentanément indisponible."), etat: "prep" };
    // Moins de paris que de montantes ce jour-la (nb_paris est envoye a tous, meme sans compte) : rien a verrouiller,
    // ni pari du soir ni « si ca passe » (controle de l'avocat du diable du 28/10/2026).
    var nbOr = Number(or.nb_paris);
    if (Number.isInteger(nbOr) && nbOr >= 0 && s.rang > nbOr) return { txt: tf("combines_v2.climb_tonight_no_rank", "Pas de pari {n} ce soir : la montante ne bouge pas.", { n: s.rang }), etat: "repos" };
    if (or.verrou !== null) return { txt: t("combines_v2.climb_tonight_pro", "Pari du soir : dans la Sélection en or, avec Pro."), etat: "verrou", verrou: true };
    if (!pSoir || cote(pSoir.cote) === null) return { txt: tf("combines_v2.climb_tonight_no_rank", "Pas de pari {n} ce soir : la montante ne bouge pas.", { n: s.rang }), etat: "repos" };
    var k = cote(pSoir.cote), h = heure(pSoir.coup_envoi);
    var match = [pSoir.domicile, pSoir.exterieur].filter(Boolean).join(" – ");
    return { etat: "ouvert", cote: k, si: MT ? MT.siCaPasse(s, k) : null,
      pari: pariTexte({ m: pSoir.market_id, h: pSoir.domicile, a: pSoir.exterieur, p: pSoir.pari }), match: match, heure: h };
  }

  // La serie (refonte du 06/11/2026) : une ligne de paliers du depart a la cote 10, echelle logarithmique (memes
  // longueurs que l'ancienne piste, lib/montantes.js#avancement). Un rond cyan allume par pari gagne d'affilee, place a
  // la cote cumulee apres ce pari, avec son numero ; le palier du soir en anneau qui respire. Pari du soir reserve a
  // Pro : anneau a une distance FIXE (COTE_NOMINALE), jamais la vraie cote (elle se deduirait de la position).
  function piste(s, soir) {
    var MT = G.IasharkMontantes;
    var cumul = [], noeuds = [];
    s.cotes.forEach(function (c, i) {
      cumul.push(c);
      var x = MT.avancement(MT.produitCotes(cumul));
      noeuds.push('<span class="mt-pal is-gagne" style="--x:' + x.toFixed(4) + ";--i:" + i + '">' + (i + 1) + "</span>");
    });
    var fait = s.cotes.length ? MT.avancement(MT.produitCotes(s.cotes)) : 0;
    var vise = fait;
    if (soir.etat === "ouvert" || soir.etat === "verrou") {
      var ks = soir.etat === "ouvert" ? (soir.si || null) : null;
      vise = ks ? MT.avancement(ks) : Math.min(1, fait + MT.avancement(COTE_NOMINALE));
      noeuds.push('<span class="mt-pal is-soir" style="--x:' + vise.toFixed(4) + ";--i:" + s.cotes.length + '">' + s.palier + "</span>");
    }
    var aria = s.gagnes
      ? tf("combines_v2.climb_aria", "Montante {n} : {w} paris gagnés d’affilée, cote cumulée {odds}, objectif 10.", { n: s.rang, w: s.gagnes, odds: fmt(s.cote) })
      : tf("combines_v2.climb_aria_start", "Montante {n} : au départ, objectif cote 10.", { n: s.rang });
    return '<div class="mt-piste" role="img" aria-label="' + esc(aria) + '"><div class="mt-rail" aria-hidden="true">'
      + '<span class="mt-plein" style="--x:' + fait.toFixed(4) + '"></span>'
      + (vise > fait ? '<span class="mt-vise" style="--a:' + fait.toFixed(4) + ";--b:" + vise.toFixed(4) + '"></span>' : "")
      + '<span class="mt-depart"></span>' + noeuds.join("") + '<span class="mt-arrivee">' + ico("flag", "cb-ico") + "<b>10</b></span></div></div>";
  }

  // Decision de Clement du 06/11/2026 : sur cette page, seulement les objectifs atteints ; plus de retour au palier 1,
  // de bilan ni d'historique (la veille, gagnes ET perdus, est dans le bandeau des resultats en haut du site).
  function evenement(s) {
    var out = "";
    if (s.objectifs.length) {
      var o = s.objectifs[s.objectifs.length - 1];
      out += '<p class="mt-evt mt-evt--but">' + ico("flag") + "<span>" + esc(tf("combines_v2.climb_goal_event", "Objectif atteint le {date} : cote {odds} en {n} paris gagnés d’affilée.", { date: jourCourt(o.j), odds: fmt(o.c), n: o.n }))
        + (s.objectifs.length > 1 ? " " + esc(tf("combines_v2.climb_goals_count", "{n} fois depuis le départ.", { n: s.objectifs.length })) : "") + "</span></p>";
    }
    return out;
  }
  function couloir(s, or, pSoir, debut) {
    var soir = ceSoir(s, or, pSoir);
    var gagnes = s.gagnes
      ? tf(s.gagnes > 1 ? "combines_v2.climb_won_n" : "combines_v2.climb_won_1", s.gagnes > 1 ? "{n} paris gagnés d’affilée" : "{n} pari gagné", { n: s.gagnes })
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
      + ligneSoir + evenement(s)
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
      + '<div class="mt-course">'
      + '<ol class="mt-couloirs">' + etats.map(function (s) { return couloir(s, or, parisSoir[s.rang], f.debut); }).join("") + "</ol></div>"
      + '<p class="cb-petit">' + esc(tf("combines_v2.climb_note", "Objectifs atteints depuis le {date} : {n}. Cotes indicatives relevées à la publication. Calcul chaque matin à partir des résultats, gagnés et perdus compris : aucun pari n’est retiré.", { date: debut, n: nbObj })) + "</p>"
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
  // Onglets du ticket du soir (HyperUI Tabs) : clic, fleches gauche / droite, Debut / Fin ; l'onglet choisi est garde
  // pour les rendus suivants (statut d'un match qui change).
  function onglets(el) {
    var tabs = [].slice.call(el.querySelectorAll("[data-cb-onglet]"));
    var choisir = function (b, focus) {
      ETAT.onglet = b.getAttribute("data-cb-onglet");
      tabs.forEach(function (x) {
        var on = x === b;
        x.setAttribute("aria-selected", String(on));
        x.tabIndex = on ? 0 : -1;
        var p = el.querySelector("#" + x.getAttribute("aria-controls"));
        if (p) p.classList.toggle("is-actif", on);
      });
      if (focus) b.focus();
      var K = K0(), pan = el.querySelector("#" + b.getAttribute("aria-controls"));
      if (K && pan) K.activer(pan);
    };
    tabs.forEach(function (b, i) {
      b.addEventListener("click", function () { choisir(b, false); });
      b.addEventListener("keydown", function (e) {
        var j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
        if (j === null) return;
        e.preventDefault();
        choisir(tabs[(j + tabs.length) % tabs.length], true);
      });
    });
  }
  function brancher(el) {
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
    [].slice.call(el.querySelectorAll("[data-bt-logo], [data-cb-logo]")).forEach(function (img) { img.addEventListener("error", function () { img.hidden = true; }, { once: true }); });
    onglets(el);
    animer(el);
  }

  function lireJson(url) {
    return G.fetch(url, { cache: "no-cache" }).then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // Montage de la page : dictionnaire, session (le serveur decide du niveau), puis, en parallele des tickets, le fichier
  // des montantes, la bande des resultats (derniers combines regles) et les matchs publics (logos des equipes et des
  // competitions, statut d'un match reporte ou annule) : tout est la au premier dessin.
  function monter() {
    var D = G.document, I = G.I18N;
    if (G.IasharkAuthHeader) G.IasharkAuthHeader.mount("#authHeaderSlot");
    var el = D.getElementById("aujourdhui"), vide = D.getElementById("cbVide");
    var pMontantes = lireJson("/preuves/montantes.json").then(function (f) { ETAT.montantes = f && f.version === 1 ? f : null; });
    var pBandeau = lireJson("/preuves/bandeau.json").then(function (f) { ETAT.bandeau = f && f.version === 1 ? f : null; });
    var parId = {};
    var pMatchs = lireJson("/data-home.json").then(function (j) {
      (j && Array.isArray(j.matchs) ? j.matchs : []).forEach(function (m) {
        if (m && m.id != null) { parId[String(m.id)] = m.status; ETAT.matchs[String(m.id)] = { home: m.home, away: m.away, league_id: m.league_id, league: m.league }; }
      });
    });
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
          return Promise.all([tickets, pMontantes, pBandeau, pMatchs]).then(function (x) { return x[0]; });
        };
        // rendu : la page dessine le bloc (lib/aujourdhui.js le branche : copie, essai Pro, composants) ; statutDe : le
        // statut public des matchs (reporte, annule) des le premier dessin.
        return A.mount(el, { lire: lire, sansButeur: true, apresOr: apresOr, rendu: rendu, retour: lien("combines.html"),
          nomButeur: t("combines_v2.unlock_scorers", "les buteurs du jour"), statutDe: function (fid) { return parId[String(fid)]; } });
      })
      .catch(function () { return null; })
      .then(function (rep) {
        if (!rep || el.hidden) { vide.hidden = false; return null; }
        brancher(el);
        return rep;
      });
  }

  G.IasharkCombinesPage = { montantesHtml: montantesHtml, buteursHtml: buteursHtml, apresOr: apresOr, rendu: rendu, ticketsHtml: ticketsHtml,
    brancher: brancher, monter: monter, ETAT: ETAT };
  if (typeof document !== "undefined" && document.getElementById("aujourdhui") && !G.IASHARK_COMBINES_ESSAI) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", monter);
    else monter();
  }
})(typeof window !== "undefined" ? window : this);
