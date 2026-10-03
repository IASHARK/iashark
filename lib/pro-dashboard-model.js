/* IASHARK — calculs du tableau de bord personnel (espace Pro).
   Module PUR : aucun reseau, aucun DOM. Lu par pro-dashboard.js et par
   node --test (tests/pro-accueil.test.js).

   REGLE : ce tableau de bord ne montre QUE les paris de l'abonne (son journal,
   public.betting_decisions). Aucun chiffre du bilan public d'IASHARK n'est
   calcule ici (decision du 29/09 : bilan public seulement apres les tests,
   tire de l'archive verifiee).

   ---------------------------------------------------------------------------
   CONTRAT DES TABLES (branche canal-pro, supabase/migrations/0040_canal_pro.sql,
   resume dans CONTRAT-TABLES-PRO.md ; copie : tests/fixtures/contrat-pro-tables.json).
   Le robot du Canal Pro ecrit, le site lit, en nommant les colonnes :
   - public.pro_programmes : COLONNES_PROGRAMME, seulement les lignes
     statut 'publie' et mode 'ouvert' (RLS). Le programme du jour J couvre les
     matchs de J 12 h a J+1 11 h 59 (heure de Paris).
   - public.pro_paris : COLONNES_PARIS, seulement les paris publies ET envoyes
     du Canal Pro ouvert (RLS). Archive figee : on affiche, on ne recalcule rien.
   Rien d'autre : pas d'alertes (elles n'existent que dans Telegram), pas de
   Loto Foot ni de duel (tables lues par le robot seulement).
   --------------------------------------------------------------------------- */
(function (root) {
  'use strict';

  var FUSEAU = 'Europe/Paris';
  var COLONNES_PROGRAMME = 'jour,statut,mode,motif_vide,publie_at';
  // + fixture_id, selections, proba, source_proba, publie_at (03/10/2026) : de quoi montrer chaque selection
  // comme le message Telegram (lib/selection-pro.js). Toutes accordees par 0040.
  var COLONNES_PARIS = 'id,numero,jour,famille,fixture_id,ligue,dom,ext,coup_envoi,marche,ligne,selection,selections,proba,source_proba,cote_min,meilleure_cote,meilleur_bookmaker,cotes,cote_vue_at,explication,compo_voyant,resultat,publie_at';
  // Tickets notes dans Telegram (pro_tickets, 0040 : l'abonne lit SES lignes) : de quoi compter et rapprocher.
  // pari_id : le pari publie du ticket ; mise, cote et bookmaker : pour savoir si c'est le MEME pari
  // qu'une ligne notee sur le site (regle de fusion, voir fusionnerNotes).
  var COLONNES_TICKETS = 'jour,statut,decision_id,pari_id,mise,cote,bookmaker';
  // Motifs d'un jour publie sans pari (0040 : la base refuse toute autre valeur).
  var MOTIFS_VIDE = ['regles', 'regles_partiel', 'aucun_match', 'controle', 'retires'];
  // Double chance : cote CALCULEE a partir du 1N2 du bookmaker (2 paris), pas la cote qu'il affiche.
  var MARCHES_COTE_CALCULEE = ['1X', 'X2', '12'];
  // Voyant de composition ecrit par le robot (canal-pro.mjs#voyantComposition).
  var VOYANTS = { 'CONFIRMÉ': 'confirme', 'À SURVEILLER': 'a_surveiller', 'PUBLIÉE': 'publiee', 'RETIRÉ': 'retire' };
  // Plus de « mise conseillee » (decision de Clement du 30/09/2026 : plus
  // AUCUNE mise sur le site, il n'est pas conseiller). La cagnotte ne sert
  // plus qu'au bilan de l'abonne (ses propres paris).

  function nombre(v) { var n = Number(v); return v !== null && v !== '' && isFinite(n) ? n : null; }
  function arrondi(v, d) { var f = Math.pow(10, d == null ? 2 : d); return Math.round(v * f) / f; }

  /* Jour civil (AAAA-MM-JJ) dans un fuseau, sans bibliotheque. */
  function jour(date, tz) {
    var d = date instanceof Date ? date : new Date(date);
    if (isNaN(d)) return null;
    try {
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: tz || FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      var o = {};
      p.forEach(function (x) { o[x.type] = x.value; });
      return o.year + '-' + o.month + '-' + o.day;
    } catch (e) { return d.toISOString().slice(0, 10); }
  }
  function heureParis(date) {
    try { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: FUSEAU, hour: '2-digit', hourCycle: 'h23' }).format(date)); }
    catch (e) { return date.getUTCHours(); }
  }
  /* Lundi (AAAA-MM-JJ) de la semaine d'une date, dans le fuseau. */
  function lundi(date, tz) {
    var j = jour(date, tz);
    if (!j) return null;
    var d = new Date(j + 'T12:00:00Z');
    var decal = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - decal);
    return d.toISOString().slice(0, 10);
  }
  function ajouterJours(iso, n) {
    var d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /* ------------------------------------------------ programme du Canal Pro */
  /* Jours dont le programme couvre « maintenant » : aujourd'hui, et avant
     midi (Paris) aussi la veille (fenetre J 12 h -> J+1 11 h 59). */
  function joursDuProgramme(maintenant) {
    var m = maintenant || new Date(), auj = jour(m);
    return heureParis(m) < 12 ? [auj, ajouterJours(auj, -1)] : [auj];
  }
  /* Un pari de pro_paris -> forme affichee (aucune cote inventee). */
  function pariDuProgramme(row) {
    var r = row || {}, cotes = {};
    Object.keys(r.cotes || {}).forEach(function (bk) {
      var v = r.cotes[bk], c = nombre(v && typeof v === 'object' ? v.cote : v);
      if (c > 1) cotes[bk] = { cote: c, releve_le: r.cote_vue_at || null };
    });
    return {
      id: r.id || null,
      ref: r.numero ? 'PRO-' + r.numero : null,
      famille: r.famille,
      en_test: true,
      competition: r.ligue || '',
      match: (r.dom || '') + ' – ' + (r.ext || ''),
      coup_envoi: r.coup_envoi || null,
      pari: r.selection || '',
      marche: r.marche || null,
      cote_calculee: MARCHES_COTE_CALCULEE.indexOf(r.marche) !== -1,
      cote_min: nombre(r.cote_min),
      raison: r.explication || '',
      composition: VOYANTS[r.compo_voyant] || null,
      resultat: r.resultat || null,
      cotes: cotes
    };
  }
  /* Etat du bloc « Aujourd'hui » a partir des lignes lues (deja filtrees
     par la base : publie + ouvert). 'aucun' = pas de programme publie ;
     'vide' = programme publie sans pari (motif du robot) ; 'paris'. */
  function programmeDuJour(programmes, paris, maintenant) {
    var jours = joursDuProgramme(maintenant);
    var prog = null;
    jours.forEach(function (j) {
      if (prog) return;
      prog = (programmes || []).filter(function (p) { return p && p.jour === j && p.statut === 'publie' && p.mode === 'ouvert'; })[0] || null;
    });
    if (!prog) return { etat: 'aucun', jour: null, motif: null, paris: [] };
    var liste = (paris || []).filter(function (p) { return p && p.jour === prog.jour; })
      .sort(function (a, b) { return String(a.coup_envoi) < String(b.coup_envoi) ? -1 : 1; })
      .map(pariDuProgramme);
    if (!liste.length) return { etat: 'vide', jour: prog.jour, motif: MOTIFS_VIDE.indexOf(prog.motif_vide) !== -1 ? prog.motif_vide : 'retires', paris: [] };
    return { etat: 'paris', jour: prog.jour, motif: null, paris: liste };
  }

  /* ------------------------------------------------ journal de l'abonne */
  /* Gain ou perte d'un pari regle. null = pas encore regle. */
  function gain(d) {
    if (!d) return null;
    if (d.result_pnl != null && d.result_pnl !== '' && d.status !== 'pending') return nombre(d.result_pnl);
    var mise = nombre(d.stake), cote = nombre(d.odds);
    if (d.status === 'won') return mise != null && cote != null ? arrondi(mise * (cote - 1)) : null;
    if (d.status === 'lost') return mise != null ? -mise : null;
    if (d.status === 'void') return 0;
    return null;
  }
  function regle(d) { return d && (d.status === 'won' || d.status === 'lost' || d.status === 'void'); }
  function dateDuPari(d) { return d.kickoff_at || d.created_at; }

  /* ------------------------------------------------ un pari note deux fois
     REGLE DE FUSION (contre-controle, ronde 4, 30/09/2026). Un abonne peut
     noter un pari sur le site (« Je l'ai joue » : programme_ref « PRO-7 ») ET
     dans Telegram (ticket pro_tickets ; avec une mise, le robot ecrit aussi
     une ligne du journal : pro_tickets.decision_id). Deux notes sont le MEME
     pari seulement si les QUATRE conditions sont vraies :
       1. le ticket est relie a ce pari publie (pro_tickets.pari_id -> PRO-7) ;
       2. meme mise (au centime pres), connue des deux cotes ;
       3. meme cote (au centime pres), connue des deux cotes ;
       4. pas deux bookmakers connus et differents (betting_decisions.bookmaker
          du site, pro_tickets.bookmaker du ticket).
     Ronde 4.2 : un ticket sans mise ou sans cote n'est JAMAIS rapproche (il
     compte a part) ; 10 EUR a 2,10 chez Winamax sur le site + 10 EUR a 2,10
     chez Betclic dans Telegram = 2 paris. Sinon ce sont deux paris, comptes
     deux fois : 10 EUR chez Winamax + 20 EUR chez Betclic sur PRO-7 = 2 paris,
     30 EUR en jeu. Le site evite la 2e note des le depart : un pari deja note
     (ticket ou ligne du journal) affiche « Deja note » (dejaNote).
     Pour un meme pari, on garde UNE ligne (les infos du site : famille,
     bookmaker, PRO-n) avec le resultat le plus prudent des deux copies :
       - celle qui est reglee si une seule l'est ;
       - si les deux le sont : le plus mauvais resultat (la plus grosse perte) ;
       - si aucune ne l'est : en cours.
     Ainsi la perte du jour n'est jamais cachee, et ni le garde-fou, ni Mon
     bilan, ni Ma semaine ne comptent un pari deux fois ou mieux que la plus
     prudente des deux notes. Un ticket sans pari relie (texte libre) ne peut
     pas etre rapproche : il compte a part (mieux vaut un pari de trop).
     decisions : son journal (betting_decisions) ; tickets : SES tickets
     pro_tickets { jour, statut, decision_id, pari_id, mise, cote, bookmaker } ; paris :
     les paris publies lus par la page ({ id, ref }), qui relient pari_id a
     « PRO-7 ». Sans tickets : chaque ligne du journal est un pari. */
  var CENTIME = 0.005;
  function memeValeur(a, b) { var x = nombre(a), y = nombre(b); return x != null && y != null && Math.abs(x - y) < CENTIME; }
  /* Bookmaker lisible : cle du site (« winamax ») ou nom lu sur un ticket
     (« Betclic Sport ») -> lettres et chiffres en minuscules ; vide = inconnu. */
  function cleBookmaker(v) { var s = v == null ? '' : String(v).toLowerCase().replace(/[^a-z0-9]/g, ''); return s.length >= 2 ? s : null; }
  /* Deux bookmakers connus et differents = deux paris (« betclic » et
     « betclicsport » : le meme). Un bookmaker inconnu ne contredit rien. */
  function bookmakersCompatibles(a, b) {
    var x = cleBookmaker(a), y = cleBookmaker(b);
    return x == null || y == null || x.indexOf(y) !== -1 || y.indexOf(x) !== -1;
  }
  function plusPrudente(site, robot) {
    var gs = gain(site), gr = gain(robot);
    var prendRobot = gs == null ? gr != null : (gr != null && gr < gs);
    if (!prendRobot) return site;
    var x = {};
    Object.keys(site).forEach(function (k) { x[k] = site[k]; });
    x.status = robot.status;
    x.result_pnl = robot.result_pnl != null ? robot.result_pnl : null;
    return x;
  }
  function fusionnerNotes(decisions, tickets, paris) {
    var refDe = {};
    (paris || []).forEach(function (x) { if (x && x.id != null && x.ref) refDe[String(x.id)] = x.ref; });
    function refTicket(t) { return t && t.pari_id != null ? refDe[String(t.pari_id)] || null : null; }
    var notes = (tickets || []).filter(function (t) { return t && t.statut === 'note'; });
    var ticketDe = {};
    notes.forEach(function (t) { if (t.decision_id != null) ticketDe[String(t.decision_id)] = t; });
    function duRobot(d) { return Object.prototype.hasOwnProperty.call(ticketDe, String(d.id)); }
    var liste = (decisions || []).filter(Boolean);
    var pris = {}, groupes = [];
    // 1. Ligne ecrite par le robot + ligne du site du MEME pari (meme PRO-n,
    //    meme mise, meme cote, pas deux bookmakers differents). Le robot
    //    n'ecrit pas le bookmaker dans le journal : on prend celui du ticket.
    liste.forEach(function (r) {
      if (!duRobot(r)) return;
      var t = ticketDe[String(r.id)];
      var ref = refTicket(t);
      if (!ref) return;
      var bkRobot = cleBookmaker(r.bookmaker) || cleBookmaker(t.bookmaker);
      var s = liste.filter(function (x) {
        return !pris[String(x.id)] && !duRobot(x) && x.programme_ref === ref && memeValeur(x.stake, r.stake) && memeValeur(x.odds, r.odds)
          && bookmakersCompatibles(x.bookmaker, bkRobot);
      })[0];
      if (!s) return;
      pris[String(s.id)] = pris[String(r.id)] = true;
      groupes.push({ garde: plusPrudente(s, r), copies: [s, r], ticket: ticketDe[String(r.id)] });
    });
    // 2. Toute autre ligne du journal : un pari.
    liste.forEach(function (x) {
      if (!pris[String(x.id)]) groupes.push({ garde: x, copies: [x], ticket: duRobot(x) ? ticketDe[String(x.id)] : null });
    });
    // 3. Ticket sans ligne du journal : rapproche d'UNE ligne du site du meme
    //    pari seulement si sa mise ET sa cote sont connues et egales, et si
    //    les bookmakers ne se contredisent pas. Sans mise ou sans cote : il
    //    compte a part (ronde 4.2 : une valeur absente ne prouve rien).
    var ticketsSeuls = [];
    notes.forEach(function (t) {
      if (t.decision_id != null) return;
      var ref = refTicket(t);
      var g = ref ? groupes.filter(function (x) {
        return !x.ticket && x.copies.length === 1 && x.garde.programme_ref === ref && memeValeur(t.mise, x.garde.stake) && memeValeur(t.cote, x.garde.odds)
          && bookmakersCompatibles(t.bookmaker, x.garde.bookmaker);
      })[0] : null;
      if (g) g.ticket = t; else ticketsSeuls.push(t);
    });
    return { groupes: groupes, ticketsSeuls: ticketsSeuls };
  }
  /* Le journal sans doublon : une ligne par pari (regle de fusion ci-dessus). */
  function journalSansDoublon(decisions, tickets, paris) {
    if (!tickets || !tickets.length) return (decisions || []).filter(Boolean);
    return fusionnerNotes(decisions, tickets, paris).groupes.map(function (g) { return g.garde; });
  }
  /* Pari publie deja note (ronde 4.2) : un ticket Telegram note sur ce pari
     (pro_tickets.pari_id) ou une ligne du journal avec son numero
     (programme_ref « PRO-7 »). La page affiche alors « Deja note » a la place
     de « Je l'ai joue » : la cote pre-remplie (celle du matin) ne cree pas
     une 2e note du meme pari a une autre cote que celle du ticket. Un 2e
     vrai pari se note toujours a la main (« Noter un pari »). */
  function dejaNote(pari, decisions, tickets) {
    if (!pari) return false;
    var id = pari.id != null ? String(pari.id) : null, ref = pari.ref || null;
    var parTicket = id != null && (tickets || []).some(function (t) { return t && t.statut === 'note' && t.pari_id != null && String(t.pari_id) === id; });
    var parJournal = !!ref && (decisions || []).some(function (x) { return x && x.programme_ref === ref; });
    return parTicket || parJournal;
  }
  /* Source affichee dans « Mes paris » : 'robot' pour une ligne ecrite par le
     robot Telegram (reliee a un ticket par pro_tickets.decision_id, ou
     source 'robot' une fois 0041 appliquee), sinon celle de la ligne. */
  function sourceDuPari(decision, tickets) {
    var x = decision || {};
    if (x.source === 'robot') return 'robot';
    var duRobot = x.id != null && (tickets || []).some(function (t) { return t && t.decision_id != null && String(t.decision_id) === String(x.id); });
    if (duRobot) return 'robot';
    return x.source === 'programme' ? 'programme' : 'site';
  }

  /* Garde-fou du jour. La LIMITE est la meme que celle du robot Telegram
     (pro_preferences.limite_paris_jour, 0 = plus rien de la journee), mais
     le COMPTE n'est pas le meme (controle de l'avocat du diable, 30/09) :
     - le robot (canal-pro, scripts/canal-pro/taches.mjs#notesDuJour) compte
       seulement les tickets notes dans Telegram (pro_tickets, statut 'note') ;
     - le site compte les paris de son journal notes aujourd'hui (heure de
       Paris) PLUS les tickets notes dans Telegram qui ne sont pas deja dans
       le journal (pro_tickets.decision_id vide).
     Une limite atteinte sur le site n'arrete donc PAS le robot : le site ne
     le pretend jamais. La perte du jour est une information, pas une limite.
     Un pari note sur le site ET dans Telegram compte UNE fois s'il a la meme
     mise, la meme cote et pas deux bookmakers differents, avec le resultat le
     plus prudent (regle de fusion : fusionnerNotes) ; sinon il compte deux fois.
     Un pari compte aujourd'hui si l'une de ses notes est d'aujourd'hui. */
  function gardeFou(prefs, decisions, maintenant, tz, tickets, paris) {
    var p = prefs || {};
    var auj = jour(maintenant || new Date(), tz);
    function aujourdhui(d) { return jour(d.created_at || dateDuPari(d), tz) === auj; }
    var f = fusionnerNotes(decisions, tickets, paris);
    var duJour = f.groupes.filter(function (g) {
      return g.copies.some(aujourdhui) || !!(g.ticket && g.ticket.decision_id == null && g.ticket.jour === auj);
    });
    var doublons = duJour.filter(function (g) { return g.copies.length > 1; }).length;
    var telegram = f.ticketsSeuls.filter(function (t) { return t.jour === auj; }).length;
    var perte = 0;
    duJour.forEach(function (g) { var x = gain(g.garde); if (x != null) perte -= x; });
    var n = nombre(p.limite_paris_jour);
    var max = n !== null && n >= 0 && n <= 50 && Math.round(n) === n ? n : 5;
    var journal = duJour.length;
    var notes = journal + telegram;
    var atteint = notes >= max;
    return {
      parisNotes: notes,
      duJournal: journal,
      deTelegram: telegram,
      doublons: doublons,
      parisMax: max,
      restants: Math.max(0, max - notes),
      perteDuJour: arrondi(Math.max(0, perte)),
      atteint: atteint,
      // Proche : il reste 1 pari.
      proche: !atteint && max - notes === 1
    };
  }

  /* betting_decisions.estimated_probability a UN SEUL sens (contre-controle,
     ronde 4) : la chance implicite de la cote NOTEE, 100 / cote, en %, marge
     du bookmaker comprise, arrondie au dixieme, entre 1 et 99. Ce n'est pas
     la probabilite du modele ni celle de Pinnacle (celle du pari publie est
     dans pro_paris.proba) : jamais pour la calibration, la valeur de cloture
     ou l'avantage du modele. La base pose la meme valeur elle-meme
     (0041_pro_accueil.sql, betting_decisions_proba_de_la_cote), quel que
     soit celui qui ecrit la ligne (site ou robot Telegram). */
  function probaDeLaCote(cote) {
    var c = nombre(cote);
    return c > 1 ? Math.min(99, Math.max(1, Math.round(1000 / c) / 10)) : null;
  }

  /* Bilan de l'abonne (ses paris seulement). tickets et paris (facultatifs) :
     un pari note sur le site ET dans Telegram compte une fois (fusionnerNotes). */
  function bilan(decisions, capitalDepart, tickets, paris) {
    var liste = journalSansDoublon(decisions, tickets, paris).sort(function (a, b) {
      return String(dateDuPari(a) || '') < String(dateDuPari(b) || '') ? -1 : 1;
    });
    var regles = liste.filter(regle);
    var gagnes = regles.filter(function (d) { return d.status === 'won'; }).length;
    var perdus = regles.filter(function (d) { return d.status === 'lost'; }).length;
    var mises = 0, total = 0;
    regles.forEach(function (d) { var g = gain(d); if (g != null) { total += g; if (d.status !== 'void') mises += nombre(d.stake) || 0; } });
    var depart = nombre(capitalDepart);
    var courbe = [];
    // Points detailles pour le graphique (survol : date, match, gain, cagnotte).
    var points = [];
    var cumul = 0;
    regles.forEach(function (d) {
      var g = gain(d) || 0;
      cumul += g;
      courbe.push(arrondi((depart || 0) + cumul));
      points.push({ date: dateDuPari(d) || null, match: d.match_label || '', gain: arrondi(g), valeur: arrondi((depart || 0) + cumul) });
    });
    // Serie en cours (derniers paris gagnes ou perdus d'affilee, rembourses ignores).
    var serie = { type: null, n: 0 };
    for (var i = regles.length - 1; i >= 0; i--) {
      var s = regles[i].status;
      if (s === 'void') continue;
      if (!serie.type) { serie.type = s; serie.n = 1; }
      else if (s === serie.type) serie.n++;
      else break;
    }
    var parFamille = {};
    regles.forEach(function (d) {
      var f = d.famille || 'perso';
      var x = parFamille[f] || (parFamille[f] = { n: 0, gagnes: 0, gain: 0, mises: 0 });
      x.n++; if (d.status === 'won') x.gagnes++;
      x.gain = arrondi(x.gain + (gain(d) || 0));
      if (d.status !== 'void') x.mises += nombre(d.stake) || 0;
    });
    Object.keys(parFamille).forEach(function (f) {
      var x = parFamille[f];
      x.rendement = x.mises > 0 ? arrondi(100 * x.gain / x.mises, 1) : null;
      delete x.mises;
    });
    var parSemaine = {};
    regles.forEach(function (d) {
      var l = lundi(dateDuPari(d));
      if (!l) return;
      var x = parSemaine[l] || (parSemaine[l] = { lundi: l, n: 0, gain: 0 });
      x.n++; x.gain = arrondi(x.gain + (gain(d) || 0));
    });
    var joues = gagnes + perdus;
    return {
      total: liste.length,
      enCours: liste.length - regles.length,
      regles: regles.length,
      gagnes: gagnes,
      perdus: perdus,
      reussite: joues ? arrondi(100 * gagnes / joues, 1) : null,
      gain: arrondi(total),
      rendement: mises > 0 ? arrondi(100 * total / mises, 1) : null,
      capital: depart != null ? arrondi(depart + total) : null,
      courbe: courbe,
      points: points,
      depart: depart != null ? depart : 0,
      serie: serie,
      parFamille: parFamille,
      parSemaine: Object.keys(parSemaine).sort().map(function (k) { return parSemaine[k]; })
    };
  }

  /* ------------------------------------------------ un pari vu par l'abonne */
  /* Cote minimum de l'abonne (meme calcul que le robot, canal-pro.mjs#pariPourAbonne) :
     en strategie perso, sa cote minimum compte seulement si elle depasse celle du pari. */
  function coteMinPourMoi(pari, prefs) {
    var min = nombre(pari && pari.cote_min), p = prefs || {};
    var perso = p.strategie === 'perso' ? nombre(p.cote_min_perso) : null;
    if (min == null) return perso;
    return perso != null && perso > min ? perso : min;
  }
  /* Meilleure cote chez SES bookmakers (liste vide = tous les suivis de son
     pays) et parmi tous les agrees suivis de son pays. agreesDuPays vide
     (pays pas encore ouvert) = AUCUN bookmaker montre, jamais un operateur
     d'un autre pays. */
  function pariPourMoi(pari, mesBookmakers, agreesDuPays, prefs) {
    var cotes = (pari && pari.cotes) || {};
    var permis = Array.isArray(agreesDuPays) ? agreesDuPays : [];
    var mine = (mesBookmakers || []).filter(function (id) { return permis.indexOf(id) !== -1; });
    function meilleure(ids) {
      var best = null;
      ids.forEach(function (id) {
        var c = cotes[id] && nombre(cotes[id].cote);
        if (c > 1 && (!best || c > best.cote)) best = { id: id, cote: c, releve_le: cotes[id].releve_le || null };
      });
      return best;
    }
    var chezMoi = meilleure(mine.length ? mine : permis);
    var marche = meilleure(permis);
    var min = coteMinPourMoi(pari, prefs);
    return {
      chezMoi: chezMoi,
      marche: marche,
      coteMin: min,
      // jouable : la meilleure cote chez l'abonne atteint sa cote minimum.
      jouable: !!(chezMoi && min != null && chezMoi.cote >= min),
      // Ailleurs mieux : un agree suivi que l'abonne n'a pas coche propose une cote plus haute.
      ailleursMieux: !!(marche && chezMoi && marche.cote > chezMoi.cote && marche.id !== chezMoi.id),
      retire: pari && pari.composition === 'retire'
    };
  }

  /* Dans le choix de l'abonne. Notre strategie : tout le programme. Ses
     choix : seulement ses familles (comme le robot) ; les autres paris restent
     visibles « hors de tes choix ». */
  function selonMesChoix(paris, prefs) {
    var liste = paris || [];
    var p = prefs || {};
    if (p.strategie !== 'perso') return { pourMoi: liste.slice(), horsChoix: [] };
    var familles = p.familles && p.familles.length ? p.familles : null;
    var pourMoi = [], horsChoix = [];
    liste.forEach(function (x) { (!familles || familles.indexOf(x.famille) !== -1 ? pourMoi : horsChoix).push(x); });
    return { pourMoi: pourMoi, horsChoix: horsChoix };
  }

  /* Ma semaine en image : la semaine derniere (lundi a dimanche, Paris).
     Image faite pour etre partagee : un pari note deux fois compte une fois. */
  function semaineEnImage(decisions, maintenant, tickets, paris) {
    var ceLundi = lundi(maintenant || new Date());
    var debut = ajouterJours(ceLundi, -7), fin = ajouterJours(ceLundi, -1);
    var sem = journalSansDoublon(decisions, tickets, paris).filter(function (d) {
      var j = jour(dateDuPari(d));
      return j && j >= debut && j <= fin;
    });
    var b = bilan(sem, null);
    var meilleure = null;
    sem.forEach(function (d) { if (d.status === 'won' && (!meilleure || nombre(d.odds) > nombre(meilleure.odds))) meilleure = d; });
    return {
      debut: debut, fin: fin,
      paris: b.total, gagnes: b.gagnes, perdus: b.perdus, gain: b.gain, rendement: b.rendement,
      meilleureCote: meilleure ? { match: meilleure.match_label, cote: nombre(meilleure.odds) } : null
    };
  }

  /* Courbe lissee MONOTONE (Fritsch-Carlson, la methode « monotoneX » de d3) :
     entre deux points, la courbe reste entre leurs deux valeurs. Elle ne
     dessine jamais une bosse qui n'existe pas dans les vrais chiffres (une
     spline classique, elle, en invente). pts = [{x, y}] tries par x. */
  function courbeMonotone(pts) {
    var n = pts.length;
    if (n < 2) return '';
    var dx = [], m = [], t = [];
    for (var i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; m[i] = (pts[i + 1].y - pts[i].y) / (dx[i] || 1); }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { var tau = 3 / Math.sqrt(s); t[i] = tau * a * m[i]; t[i + 1] = tau * b * m[i]; }
    }
    var d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      d += ' C' + (pts[i].x + h).toFixed(1) + ' ' + (pts[i].y + t[i] * h).toFixed(1) + ' ' + (pts[i + 1].x - h).toFixed(1) + ' ' + (pts[i + 1].y - t[i + 1] * h).toFixed(1) + ' ' + pts[i + 1].x.toFixed(1) + ' ' + pts[i + 1].y.toFixed(1);
    }
    return d;
  }
  var api = {
    COLONNES_PROGRAMME: COLONNES_PROGRAMME, COLONNES_PARIS: COLONNES_PARIS, COLONNES_TICKETS: COLONNES_TICKETS, MOTIFS_VIDE: MOTIFS_VIDE,
    courbeMonotone: courbeMonotone,
    jour: jour, lundi: lundi, gain: gain,
    joursDuProgramme: joursDuProgramme, pariDuProgramme: pariDuProgramme, programmeDuJour: programmeDuJour,
    fusionnerNotes: fusionnerNotes, journalSansDoublon: journalSansDoublon, dejaNote: dejaNote, sourceDuPari: sourceDuPari,
    gardeFou: gardeFou, probaDeLaCote: probaDeLaCote,
    bilan: bilan,
    coteMinPourMoi: coteMinPourMoi, pariPourMoi: pariPourMoi, selonMesChoix: selonMesChoix,
    semaineEnImage: semaineEnImage
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IasharkProDashboardModel = api;
})(typeof window !== 'undefined' ? window : this);
