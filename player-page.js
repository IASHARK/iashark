/* IASHARK — Fiche joueur.
   Repond a une seule question : pourquoi ce joueur compte-t-il dans CE match ?

   AUDIT DES DONNEES (04/09/2026). Deux sources, et elles n'ont pas la meme
   portee :

   1. vm.players.analytics — derive de raw.player_history, disponible pour
      TOUT joueur ayant joue. Fournit les moyennes par 90, les notes, les
      minutes, les titularisations, le drapeau d'absence.

   2. raw.top_scorers — n'existe QUE pour les deux candidats buteurs
      selectionnes pour ce match (lib/markets/top-scorer-picker.js). Fournit
      le score de menace, ses composantes, le multiplicateur adverse, la
      biographie et les stats de saison.

   Un joueur hors de ces deux candidats n'a donc ni score, ni contexte
   adverse, ni stats de saison. La page le dit au lieu de combler les trous.

   CE QUI N'EXISTE PAS DANS LE PROJET, et n'est donc pas affiche : xG et xA
   joueur, coordonnees de tirs (donc aucune carte de tirs), touches ou tirs
   dans la surface, percentiles (aucun pool de comparaison publie), pied
   fort, valeur marchande, historique face a cet adversaire precis.

   PROBABILITE D'ETRE TITULAIRE : retiree du produit le 04/09/2026 a la
   demande de l'utilisateur. C'etait (titularisations+1)/(matchs+2), une
   frequence passee presentee comme une prevision. La page affiche a la
   place le temps de jeu reellement observe, qui est une mesure.

   REGLE ZERO / INCONNU appliquee partout : 0 est une donnee et s'affiche,
   une donnee absente affiche "Donnée indisponible" et jamais 0. */
(function () {
  'use strict';
  var root = document.getElementById('playerRoot');
  var squelette = document.getElementById('squelette');

  /* ---------- Utilitaires ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n(v) { return Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null; }
  function fmt(v, d) {
    var x = n(v);
    return x === null ? null : x.toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 1 : d });
  }
  function pct(v, d) { var s = fmt(v, d); return s === null ? null : s + ' %'; }
  var INCONNU = '<span class="text-[13px] font-normal text-soft">Donnée indisponible</span>';
  // Toute valeur passe par ici : une absence ne devient jamais un zero.
  function ou(valeur, secours) { return valeur == null ? (secours || INCONNU) : valeur; }

  function infobulle(texte, fin) {
    return '<details class="infobulle' + (fin ? ' infobulle-fin' : '') + '">'
      + '<summary aria-label="Que mesure cette valeur ?">i</summary>'
      + '<p class="infobulle-texte">' + esc(texte) + '</p></details>';
  }
  function bloc(contenu, classes) {
    return '<section class="entree rounded-2xl border border-hairline bg-surface p-5 sm:p-6 ' + (classes || '') + '">' + contenu + '</section>';
  }
  function titre(t, apres) {
    return '<h2 class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-soft">' + esc(t) + (apres || '') + '</h2>';
  }

  /* ---------- 1. En-tete ---------- */
  function initiales(nom) {
    var mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
    if (!mots.length) return '?';
    return (mots.length === 1 ? mots[0].slice(0, 2) : mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
  }

  // Disponibilite : uniquement ce que le projet sait reellement.
  // bio.injured vient de l'API ; player.absent vient de la liste d'absents
  // du match. Si aucun des deux n'est renseigne, on ne conclut pas.
  function statutDisponibilite(joueur, ts) {
    var blesse = ts && ts.bio && ts.bio.injured;
    if (joueur.absent) return { texte: 'Absence signalée', classe: 'border-red-500/35 bg-red-500/10 text-red-300', point: 'bg-red-400' };
    if (blesse === true) return { texte: 'Blessure signalée', classe: 'border-amber-500/35 bg-amber-500/10 text-amber-200', point: 'bg-amber-400' };
    if (blesse === false) return { texte: 'Disponible', classe: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300', point: 'bg-emerald-400' };
    return { texte: 'Statut indisponible', classe: 'border-hairline bg-white/[.04] text-soft', point: 'bg-slate-400' };
  }

  function enTete(vm, joueur, matchId, ts) {
    var equipe = vm.identity[joueur.teamId === vm.identity.home.id ? 'home' : 'away'];
    var bio = ts && ts.bio;
    var dispo = statutDisponibilite(joueur, ts);
    var meta = [];
    if (bio) {
      if (bio.nationality) meta.push(esc(bio.nationality));
      if (n(bio.age) !== null) meta.push(esc(bio.age) + ' ans');
      if (n(bio.heightCm) !== null) meta.push((bio.heightCm / 100).toFixed(2).replace('.', ',') + ' m');
      if (n(bio.weightKg) !== null) meta.push(esc(bio.weightKg) + ' kg');
    }
    var photo = joueur.photo
      ? '<img src="' + esc(joueur.photo) + '" alt="" width="112" height="112" fetchpriority="high" decoding="async" class="h-24 w-24 shrink-0 rounded-2xl border border-hairline bg-panel object-cover sm:h-28 sm:w-28">'
      : '<div aria-hidden="true" class="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-hairline bg-panel text-[26px] font-bold text-cyan sm:h-28 sm:w-28">' + esc(initiales(joueur.name)) + '</div>';

    return '<div class="pt-6">'
      + '<a href="/match.html?id=' + esc(matchId) + '" class="inline-flex items-center gap-2 text-[13px] text-soft transition hover:text-ink">'
      + '<span aria-hidden="true">←</span>' + esc(vm.identity.home.name) + ' — ' + esc(vm.identity.away.name) + '</a>'
      + '<div class="mt-5 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">'
      + '<div class="flex items-center gap-4 sm:gap-5">' + photo
      + '<div class="min-w-0">'
      + '<h1 class="text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[40px]">'
      + (joueur.number !== null ? '<span class="mr-2 align-middle text-[20px] font-bold text-soft sm:text-[24px]">#' + esc(joueur.number) + '</span>' : '')
      + esc(joueur.name) + '</h1>'
      + '<p class="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14.5px] text-soft">'
      + (equipe.logo ? '<img src="' + esc(equipe.logo) + '" alt="" width="18" height="18" class="h-[18px] w-[18px] object-contain">' : '')
      + '<span class="font-semibold text-ink">' + esc(joueur.team) + '</span>'
      + (joueur.position ? '<span aria-hidden="true">·</span><span>' + esc(poste(joueur.position)) + '</span>' : '')
      + '</p>'
      + '<p class="mt-3"><span class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] font-semibold ' + dispo.classe + '">'
      + '<span aria-hidden="true" class="h-1.5 w-1.5 rounded-full ' + dispo.point + '"></span>' + esc(dispo.texte) + '</span></p>'
      + (meta.length ? '<p class="mt-3 text-[13px] text-soft">' + meta.join(' · ') + '</p>' : '')
      + '</div></div>'
      + anneauMenace(ts)
      + '</div></div>';
  }

  var POSTES = { G: 'Gardien', D: 'Défenseur', M: 'Milieu', F: 'Attaquant',
    goalkeeper: 'Gardien', defender: 'Défenseur', midfielder: 'Milieu', attacker: 'Attaquant' };
  function poste(v) { var k = String(v || '').trim(); return POSTES[k] || POSTES[k.toLowerCase()] || k; }

  /* ---------- 2. Anneau du score ---------- */
  function anneauMenace(ts) {
    var score = ts ? n(ts.goal_threat_score) : null;
    if (score === null) return '';
    var r = 52, c = 2 * Math.PI * r, borne = Math.max(0, Math.min(100, score));
    return '<div class="shrink-0 lg:pl-8">'
      + '<div class="flex items-center gap-5 rounded-2xl border border-hairline bg-panel px-5 py-4 lg:flex-col lg:gap-3 lg:px-7 lg:py-6">'
      + '<div class="relative h-[104px] w-[104px] shrink-0" role="img" aria-label="Score de menace de but : ' + score + ' sur 100">'
      + '<svg viewBox="0 0 120 120" class="anneau h-full w-full" aria-hidden="true">'
      + '<circle class="piste" cx="60" cy="60" r="' + r + '" fill="none" stroke-width="9"></circle>'
      + '<circle class="trace" cx="60" cy="60" r="' + r + '" fill="none" stroke-width="9"'
      + ' stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + c.toFixed(1) + '"'
      + ' data-cible="' + (c * (1 - borne / 100)).toFixed(1) + '"></circle></svg>'
      + '<div class="absolute inset-0 flex flex-col items-center justify-center">'
      + '<span class="chiffres text-[32px] font-extrabold leading-none">' + score + '</span>'
      + '<span class="text-[11px] text-soft">/ 100</span></div></div>'
      + '<div class="lg:text-center"><p class="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan">Menace de but</p>'
      + '<p class="mt-1 text-[12.5px] leading-relaxed text-soft lg:max-w-[150px]">Volume et précision des tirs, efficacité, échantillon et adversaire.</p></div>'
      + '</div></div>';
  }

  /* ---------- 3. Detail du score ----------
     N'est affiche que si le pipeline a exporte les composantes. Elles ne sont
     pas recalculables ici : deux d'entre elles sont relatives au maximum du
     pool de joueurs de ce match, que le navigateur ne recoit pas. Sans elles,
     on explique la methode en une phrase plutot que d'inventer un detail. */
  function detailScore(ts) {
    if (!ts || n(ts.goal_threat_score) === null) return '';
    var c = ts.score_components;
    var fiab = n(ts.reliability), adv = n(ts.opponent_defense_multiplier);

    if (!c || n(c.shotsOnNorm) === null) {
      return bloc(titre('D’où vient ce score')
        + '<p class="mt-3 max-w-[62ch] text-[14px] leading-[1.7] text-soft">Ce score combine le volume de tirs du joueur, sa précision, son efficacité devant le but, la taille de son échantillon et la solidité de la défense adverse. Le détail chiffré de chaque composante sera disponible à la prochaine mise à jour des données.</p>');
    }

    var lignes = [
      ['Tirs cadrés par 90 minutes', c.shotsOnNorm, c.weights.shotsOn,
       'La composante la plus lourde. Mesurée par rapport au meilleur joueur des deux équipes sur ce match.'],
      ['Volume de tirs par 90 minutes', c.shotsTotalNorm, c.weights.shotsTotal,
       'Le nombre de tentatives, cadrées ou non, rapporté au meilleur volume des deux équipes.'],
      ['Efficacité devant le but', c.conversionNorm, c.weights.conversion,
       'Son taux de conversion comparé à la moyenne des joueurs de ce match, lissé quand l’échantillon est petit.']
    ];
    var base = lignes.reduce(function (s, l) { return s + l[1] * l[2]; }, 0);

    var corps = lignes.map(function (l) {
      var p = Math.round(l[1] * 100);
      return '<div class="border-t border-hairline py-3.5 first:border-0 first:pt-0">'
        + '<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">'
        + '<span class="text-[13.5px]">' + esc(l[0]) + ' ' + infobulle(l[3]) + '</span>'
        + '<span class="chiffres text-[13px] text-soft">poids ' + Math.round(l[2] * 100) + ' %'
        + ' <b class="ml-2 text-[14.5px] font-semibold text-ink">' + p + '</b><span class="text-[11.5px]">/100</span></span></div>'
        + '<div class="barre mt-2"><i data-largeur="' + p + '"></i></div></div>';
    }).join('');

    var multiplicateur = function (libelle, valeur, aide) {
      if (valeur === null) return '';
      return '<div class="flex items-baseline justify-between gap-3 border-t border-hairline py-3">'
        + '<span class="text-[13.5px] text-soft">' + esc(libelle) + ' ' + infobulle(aide, true) + '</span>'
        + '<b class="chiffres text-[14.5px] font-semibold">× ' + fmt(valeur, 2) + '</b></div>';
    };

    return bloc(titre('D’où vient ce score')
      + '<p class="mt-2.5 text-[13px] leading-relaxed text-soft">Trois composantes pondérées, puis deux ajustements. Le résultat est exactement le score affiché en haut de page.</p>'
      + '<div class="mt-4">' + corps + '</div>'
      + '<div class="mt-2 rounded-xl border border-hairline bg-black/15 px-4 py-2">'
      + '<div class="flex items-baseline justify-between gap-3 py-2">'
      + '<span class="text-[13.5px] font-semibold">Base pondérée</span>'
      + '<b class="chiffres text-[14.5px] font-semibold">' + Math.round(base * 100) + '<span class="text-[11.5px] font-normal text-soft">/100</span></b></div>'
      + multiplicateur('Fiabilité de l’échantillon', fiab, 'Réduit le score quand le joueur a peu de matchs ou peu de minutes. Vaut 1 à partir de cinq apparitions complètes.')
      + multiplicateur('Contexte adverse', adv, 'Mesure la perméabilité de la défense d’en face. 1,00 = défense moyenne ; au-dessus, contexte plus favorable au buteur.')
      + '<div class="flex items-baseline justify-between gap-3 border-t border-cyan/25 py-3">'
      + '<span class="text-[13.5px] font-bold text-cyan">Menace de but</span>'
      + '<b class="chiffres text-[18px] font-extrabold text-cyan">' + n(ts.goal_threat_score) + '<span class="text-[11.5px] font-normal">/100</span></b></div>'
      + '</div>');
  }

  /* ---------- 4. Quatre indicateurs ---------- */
  function indicateurs(joueur, ts) {
    var conv = ts && n(ts.conversion_rate) !== null ? ts.conversion_rate * 100 : null;
    // Meme precision sur les trois moyennes par 90 : "1" a cote de "2,57" et
    // "1,93" donne l'impression que la premiere est moins mesuree que les
    // autres. Deux decimales partout, et les colonnes s'alignent.
    var deux = function (v) { var x = n(v); return x === null ? null : x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var items = [
      ['Buts / 90 min', deux(joueur.goals90)],
      ['Tirs / 90 min', deux(ts ? ts.shots_total_90 : joueur.shots90)],
      ['Tirs cadrés / 90 min', deux(ts ? ts.shots_on_90 : joueur.shotsOn90)],
      ['Conversion', pct(conv, 1)]
    ];
    return '<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">' + items.map(function (i) {
      return '<div class="entree rounded-xl border border-hairline bg-surface p-4">'
        + '<p class="chiffres text-[26px] font-extrabold leading-none">' + ou(i[1]) + '</p>'
        + '<p class="mt-2 text-[12.5px] leading-snug text-soft">' + esc(i[0]) + '</p></div>';
    }).join('') + '</div>';
  }

  /* ---------- 5. Pourquoi il est a surveiller ----------
     Des faits calcules a partir des vrais chiffres, jamais un paragraphe
     genere. Le champ `analyse` du pipeline (texte du LLM) n'est renseigne
     que pour 2 candidats sur 86 : on ne construit pas la section dessus,
     mais on l'affiche quand il existe. */
  function pourquoi(joueur, ts, lignes) {
    // Le titre affirme que IASHARK a retenu ce joueur. Ce n'est vrai que
    // pour les candidats buteurs selectionnes par le moteur. Sans cela, la
    // page annoncait "pourquoi il est a surveiller" puis listait "0 tir par
    // 90 minutes" pour un gardien : la section se contredisait elle-meme.
    if (!ts) return '';
    var faits = [];
    var so = ts ? n(ts.shots_on_90) : n(joueur.shotsOn90);
    var st = ts ? n(ts.shots_total_90) : n(joueur.shots90);
    if (st !== null && so !== null) {
      faits.push(['Volume offensif', fmt(st, 2) + ' tir' + (st >= 2 ? 's' : '') + ' par 90 minutes, dont ' + fmt(so, 2) + ' cadré' + (so >= 2 ? 's' : '') + '.']);
    }
    if (ts && n(ts.conversion_rate) !== null && n(ts.baseline_conversion) !== null) {
      var moi = ts.conversion_rate * 100, moyenne = ts.baseline_conversion * 100;
      var ecart = moi - moyenne;
      faits.push(['Efficacité',
        fmt(moi, 1) + ' % de conversion, contre ' + fmt(moyenne, 1) + ' % en moyenne sur ce match — '
        + (ecart >= 2 ? 'au-dessus.' : ecart <= -2 ? 'en dessous.' : 'au niveau de la moyenne.')]);
    }
    if (ts && n(ts.opponent_defense_multiplier) !== null) {
      var m = ts.opponent_defense_multiplier;
      faits.push(['Adversaire',
        m > 1.05 ? 'La défense d’en face concède plus qu’une défense moyenne (facteur ' + fmt(m, 2) + ').'
        : m < 0.95 ? 'La défense d’en face est plus solide que la moyenne (facteur ' + fmt(m, 2) + ').'
        : 'La défense d’en face se situe dans la moyenne (facteur ' + fmt(m, 2) + ').']);
    }
    var recents = lignes.slice(0, 5);
    var butsRecents = recents.reduce(function (s, r) { return s + (n(r.goals) || 0); }, 0);
    if (recents.length) {
      faits.push(['Forme',
        butsRecents > 0
          ? butsRecents + ' but' + (butsRecents > 1 ? 's' : '') + ' sur ses ' + recents.length + ' dernier' + (recents.length > 1 ? 's' : '') + ' match' + (recents.length > 1 ? 's' : '') + '.'
          : 'Aucun but sur ses ' + recents.length + ' dernier' + (recents.length > 1 ? 's' : '') + ' match' + (recents.length > 1 ? 's' : '') + '.']);
    }
    if (!faits.length) return '';
    faits = faits.slice(0, 4);

    return bloc(titre('Pourquoi il est à surveiller')
      + '<ol class="mt-4">' + faits.map(function (f, i) {
        return '<li class="flex gap-4 border-t border-hairline py-3.5 first:border-0 first:pt-0">'
          + '<span aria-hidden="true" class="chiffres w-6 shrink-0 text-[13px] font-bold text-cyan/70">' + ('0' + (i + 1)).slice(-2) + '</span>'
          + '<span class="min-w-0"><b class="block text-[13.5px] font-semibold">' + esc(f[0]) + '</b>'
          + '<span class="mt-0.5 block text-[13.5px] leading-relaxed text-soft">' + esc(f[1]) + '</span></span></li>';
      }).join('') + '</ol>'
      + (ts && ts.analyse ? '<p class="mt-5 border-t border-hairline pt-4 text-[14px] leading-[1.7] text-soft">' + esc(ts.analyse) + '</p>' : ''));
  }

  /* ---------- 6. Forme recente ---------- */
  function courbe(valeurs) {
    // Une seule visualisation, sur la note : c'est la mesure qui existe pour
    // le plus de matchs. Pas de courbe sous trois points, elle ne dirait rien.
    var pts = valeurs.filter(function (v) { return v !== null; });
    if (pts.length < 3) return '';
    var l = 240, h = 44, min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
    var etendue = max - min || 1;
    var xy = valeurs.map(function (v, i) {
      var x = valeurs.length === 1 ? 0 : (i / (valeurs.length - 1)) * l;
      var y = v === null ? null : h - ((v - min) / etendue) * (h - 8) - 4;
      return { x: x, y: y };
    }).filter(function (p) { return p.y !== null; });
    var d = xy.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var zone = d + ' L' + xy[xy.length - 1].x.toFixed(1) + ' ' + h + ' L' + xy[0].x.toFixed(1) + ' ' + h + ' Z';
    return '<svg viewBox="0 0 ' + l + ' ' + h + '" class="mt-3 h-11 w-full" role="img" aria-label="Évolution de la note sur les matchs affichés, de ' + fmt(min) + ' à ' + fmt(max) + '">'
      + '<path class="courbe-zone" d="' + zone + '"></path><path class="courbe" d="' + d + '"></path>'
      + xy.map(function (p) { return '<circle class="courbe-point" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.5"></circle>'; }).join('')
      + '</svg>';
  }

  function formeRecente(toutes) {
    var aSaison = toutes.some(function (r) { return r.is_current_season !== undefined; });
    var lignes = (aSaison ? toutes.filter(function (r) { return r.is_current_season !== false; }) : toutes).slice(0, 5);
    if (!lignes.length) {
      return bloc(titre('Forme récente') + '<p class="mt-3 text-[14px] text-soft">Pas assez de données récentes pour ce joueur.</p>');
    }
    var cellule = function (v, d) { var s = fmt(v, d == null ? 0 : d); return s === null ? '—' : s; };
    var lib = function (r) { return (r.is_home ? 'vs ' : '@ ') + (r.opponent || 'Adversaire'); };

    var tete = ['Date', 'Adversaire', 'Min', 'Buts', 'Tirs', 'Cadrés', 'Note'];
    var tableau = '<div class="mt-4 hidden overflow-x-auto sm:block"><table class="forme chiffres text-[13.5px]">'
      + '<thead><tr class="text-left text-[11.5px] uppercase tracking-wider text-soft">'
      + tete.map(function (t, i) { return '<th scope="col" class="pb-2 ' + (i > 1 ? 'text-right' : '') + '">' + esc(t) + '</th>'; }).join('')
      + '</tr></thead><tbody>' + lignes.map(function (r) {
        return '<tr>'
          + '<td class="py-2.5 pr-3 text-soft">' + esc(r.date || '—') + '</td>'
          + '<td class="py-2.5 pr-3">' + esc(lib(r)) + (r.starter ? '' : '<span class="ml-1.5 text-[11px] text-soft">(remplaçant)</span>') + '</td>'
          + '<td class="py-2.5 text-right">' + cellule(r.minutes) + '</td>'
          + '<td class="py-2.5 text-right' + (n(r.goals) > 0 ? ' font-bold text-cyan' : '') + '">' + cellule(r.goals) + '</td>'
          + '<td class="py-2.5 text-right">' + cellule(r.shots_total) + '</td>'
          + '<td class="py-2.5 text-right">' + cellule(r.shots_on) + '</td>'
          + '<td class="py-2.5 text-right">' + cellule(r.rating, 1) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    // Sur telephone, une table de sept colonnes devient illisible : chaque
    // match passe en petite carte.
    var cartes = '<ul class="mt-4 space-y-2.5 sm:hidden">' + lignes.map(function (r) {
      return '<li class="rounded-xl border border-hairline bg-panel p-3.5">'
        + '<div class="flex items-baseline justify-between gap-3">'
        + '<b class="text-[14px] font-semibold">' + esc(lib(r)) + '</b>'
        + '<span class="text-[12px] text-soft">' + esc(r.date || '') + '</span></div>'
        + '<div class="chiffres mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-soft">'
        + '<span>' + cellule(r.minutes) + ' min</span>'
        + '<span' + (n(r.goals) > 0 ? ' class="font-semibold text-cyan"' : '') + '>' + cellule(r.goals) + ' but' + (n(r.goals) > 1 ? 's' : '') + '</span>'
        + '<span>' + cellule(r.shots_total) + ' tirs</span>'
        + '<span>' + cellule(r.shots_on) + ' cadrés</span>'
        + '<span>Note ' + cellule(r.rating, 1) + '</span></div></li>';
    }).join('') + '</ul>';

    var notes = lignes.slice().reverse().map(function (r) { return n(r.rating); });
    return bloc(titre('Forme récente')
      + '<p class="mt-1.5 text-[13px] text-soft">' + lignes.length + ' dernier' + (lignes.length > 1 ? 's' : '') + ' match' + (lignes.length > 1 ? 's' : '') + ' de la saison en cours.</p>'
      + courbe(notes) + tableau + cartes);
  }

  /* ---------- 7. Profil de production ----------
     Regroupe par nature au lieu d'une grille de quinze petites cases. La
     bascule Total / par 90 n'apparait que si les minutes de saison sont
     connues : sans elles, un "par 90" serait invente. */
  function production(joueur, ts) {
    var s = ts && ts.season;
    if (!s) {
      var per90 = [
        ['Buts', joueur.goals90], ['Tirs', joueur.shots90], ['Tirs cadrés', joueur.shotsOn90],
        ['Passes clés', joueur.keyPasses90], ['Passes décisives', joueur.assists90], ['Dribbles', joueur.dribbles90]
      ].filter(function (i) { return n(i[1]) !== null; });
      if (!per90.length) return '';
      return bloc(titre('Profil de production')
        + '<p class="mt-1.5 text-[13px] text-soft">Moyennes par 90 minutes sur les matchs suivis. Les totaux de saison ne sont pas disponibles pour ce joueur.</p>'
        + '<div class="mt-4 grid gap-x-8 gap-y-0 sm:grid-cols-2">' + per90.map(function (i) {
          return ligneStat(i[0], fmt(i[1], 2));
        }).join('') + '</div>');
    }

    var minutes = n(s.minutes);
    // Deux decimales fixes : "1,60" et non "1,6", pour que la colonne
    // s'aligne avec "0,77" et "2,31".
    var par90 = function (v) {
      var x = n(v);
      if (x === null || !minutes) return null;
      return ((x * 90) / minutes).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    var groupes = [
      ['Finition', [
        ['Buts', s.goals, true], ['Tirs', s.shotsTotal, true], ['Tirs cadrés', s.shotsOn, true],
        ['Conversion', ts && n(ts.conversion_rate) !== null ? pct(ts.conversion_rate * 100, 1) : null, false]
      ]],
      ['Création', [
        ['Passes clés', s.passesKey, true], ['Passes décisives', s.assists, true],
        ['Passes réussies', n(s.passesAccuracy) !== null ? pct(s.passesAccuracy, 0) : null, false]
      ]],
      ['Temps de jeu', [
        ['Apparitions', s.appearances, false], ['Titularisations', s.lineups, false], ['Minutes', s.minutes, false]
      ]],
      ['Discipline', [
        ['Cartons jaunes', s.cardsYellow, false], ['Cartons rouges', s.cardsRed, false]
      ]]
    ];
    // Les penaltys n'apparaissent que s'il s'est reellement passe quelque
    // chose : quatre grosses cases a zero n'apprennent rien.
    var penaltys = [['Pénaltys marqués', s.penaltyScored], ['Pénaltys manqués', s.penaltyMissed], ['Pénaltys obtenus', s.penaltyWon]]
      .filter(function (i) { return n(i[1]) !== null && n(i[1]) > 0; });
    if (penaltys.length) groupes[0][1] = groupes[0][1].concat(penaltys.map(function (i) { return [i[0], i[1], false]; }));

    var contenu = groupes.map(function (g) {
      var items = g[1].filter(function (i) { return i[1] !== null && i[1] !== undefined; });
      if (!items.length) return '';
      return '<div><h3 class="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan">' + esc(g[0]) + '</h3>'
        + '<div class="mt-2.5">' + items.map(function (i) {
          var brut = typeof i[1] === 'string' ? i[1] : fmt(i[1], 0);
          var p90 = i[2] ? par90(i[1]) : null;
          return ligneStat(i[0], brut, p90);
        }).join('') + '</div></div>';
    }).join('');

    var bascule = minutes ? '<div class="ml-auto flex rounded-lg border border-hairline p-0.5" role="group" aria-label="Unité des statistiques">'
      + '<button type="button" class="bascule rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold" data-unite="total" aria-pressed="true">Total</button>'
      + '<button type="button" class="bascule rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold" data-unite="p90" aria-pressed="false">Par 90</button>'
      + '</div>' : '';

    return bloc('<div class="flex flex-wrap items-center gap-3">' + titre('Profil de production') + bascule + '</div>'
      + '<div class="mt-5 grid gap-x-10 gap-y-6 sm:grid-cols-2">' + contenu + '</div>'
      + (minutes ? '<p class="mt-5 border-t border-hairline pt-3 text-[12.5px] text-soft">Saison en cours, ' + fmt(minutes, 0) + ' minutes jouées.</p>' : ''));
  }

  function ligneStat(libelle, brut, p90) {
    return '<div class="flex items-baseline justify-between gap-4 border-t border-hairline py-2.5 first:border-0 first:pt-0">'
      + '<span class="text-[13.5px] text-soft">' + esc(libelle) + '</span>'
      + '<b class="chiffres text-[14.5px] font-semibold">'
      + '<span data-unite-total>' + ou(brut) + '</span>'
      + (p90 !== null && p90 !== undefined ? '<span data-unite-p90 hidden>' + p90 + '<span class="text-[11.5px] font-normal text-soft"> /90</span></span>' : '')
      + '</b></div>';
  }

  /* ---------- 8. Ce que l'adversaire change ---------- */
  function adversaire(vm, joueur, ts) {
    if (!ts || n(ts.opponent_defense_multiplier) === null || n(ts.goal_threat_score) === null) return '';
    var m = ts.opponent_defense_multiplier;
    var adverse = vm.identity[joueur.teamId === vm.identity.home.id ? 'away' : 'home'];
    var score = n(ts.goal_threat_score);
    // Le score affiche inclut deja le multiplicateur : on remonte a la valeur
    // avant ajustement plutot que d'en fabriquer une.
    var avant = m ? Math.round(score / m) : null;
    var pourcent = Math.round((m - 1) * 100);

    return bloc(titre('Ce que l’adversaire change')
      + '<p class="mt-2.5 max-w-[62ch] text-[14px] leading-[1.7] text-soft">Le score de menace n’est pas un profil de saison figé&nbsp;: il est ajusté par la défense qu’il affronte. Face à <b class="text-ink">' + esc(adverse.name) + '</b>, l’ajustement est de <b class="text-ink">' + (pourcent >= 0 ? '+' : '') + pourcent + '&nbsp;%</b>.</p>'
      + '<div class="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">'
      + (avant !== null ? etage('Avant ajustement', avant) : '')
      + '<div class="text-center"><span class="chiffres inline-flex items-center rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1.5 text-[13px] font-bold text-cyan">× ' + fmt(m, 2) + '</span></div>'
      + etage('Menace retenue', score, true)
      + '</div>'
      + '<p class="mt-5 border-t border-hairline pt-3 text-[12.5px] leading-relaxed text-soft">Le facteur vaut 1,00 devant une défense moyenne du championnat. Au-dessus, la défense encaisse plus que la moyenne&nbsp;; en dessous, elle est plus solide. Il est borné entre 0,70 et 1,30.</p>');
  }
  function etage(libelle, valeur, fort) {
    var largeur = Math.max(0, Math.min(100, valeur));
    return '<div><p class="text-[12px] uppercase tracking-wider text-soft">' + esc(libelle) + '</p>'
      + '<p class="chiffres mt-1 text-[24px] font-extrabold leading-none' + (fort ? ' text-cyan' : '') + '">' + valeur + '<span class="text-[12px] font-normal text-soft">/100</span></p>'
      + '<div class="barre mt-2"><i data-largeur="' + largeur + '"' + (fort ? '' : ' style="background:#7d8fa3"') + '></i></div></div>';
  }

  /* ---------- 9. Temps de jeu et disponibilite ---------- */
  function tempsDeJeu(joueur, ts) {
    var dispo = statutDisponibilite(joueur, ts);
    var s = ts && ts.season;
    var moyenne = joueur.appearances && n(joueur.minutesRecent) !== null
      ? Math.round(joueur.minutesRecent / joueur.appearances) : null;
    var lignes = [
      ['Minutes moyennes par match joué', moyenne === null ? null : fmt(moyenne, 0) + ' min'],
      ['Titularisations', s && n(s.lineups) !== null ? fmt(s.lineups, 0) + ' sur ' + fmt(s.appearances, 0) + ' apparitions'
        : (n(joueur.starts) !== null ? fmt(joueur.starts, 0) + ' sur ' + fmt(joueur.appearances, 0) + ' apparitions' : null)]
    ];
    return bloc(titre('Temps de jeu et disponibilité')
      + '<p class="mt-3"><span class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] font-semibold ' + dispo.classe + '">'
      + '<span aria-hidden="true" class="h-1.5 w-1.5 rounded-full ' + dispo.point + '"></span>' + esc(dispo.texte) + '</span></p>'
      + '<p class="mt-2.5 text-[13px] leading-relaxed text-soft">'
      + (dispo.texte === 'Statut indisponible'
        ? 'Aucune information de blessure n’est publiée pour ce joueur. Cela ne signifie pas qu’il est disponible.'
        : dispo.texte === 'Disponible' ? 'Aucun problème signalé avant cette rencontre.'
        : 'À confirmer avant le coup d’envoi.') + '</p>'
      + '<div class="mt-4">' + lignes.map(function (l) { return ligneStat(l[0], l[1]); }).join('') + '</div>'
      // Retire le 04/09/2026 : la "probabilite d'etre titulaire" n'etait
      // qu'une frequence passee presentee comme une prevision. Le temps de
      // jeu reellement observe ci-dessus est une mesure, pas une promesse.
      + '<p class="mt-4 border-t border-hairline pt-3 text-[12.5px] leading-relaxed text-soft">Nous ne publions pas de probabilité de titularisation&nbsp;: la composition n’est pas connue avant l’annonce officielle.</p>');
  }

  /* ---------- 10. Echantillon ---------- */
  function echantillon(joueur, ts) {
    var minutes = ts && n(ts.minutes) !== null ? n(ts.minutes) : n(joueur.minutesRecent);
    var matchs = ts && n(ts.appearances) !== null ? n(ts.appearances) : n(joueur.appearances);
    if (minutes === null && matchs === null) return '';
    var morceaux = [];
    if (minutes !== null) morceaux.push(fmt(minutes, 0) + ' minutes');
    if (matchs !== null) morceaux.push(fmt(matchs, 0) + ' apparition' + (matchs > 1 ? 's' : ''));
    // Seuil repris de lib/markets/top-scorer-picker.js#MIN_APPEARANCES : le
    // moteur considere lui-meme qu'en dessous de 5 matchs, la fiabilite
    // n'est pas pleine (reliability = min(1, apparitions/5)).
    var limite = matchs !== null && matchs < 5;
    return '<section class="entree rounded-2xl border ' + (limite ? 'border-amber-500/25 bg-amber-500/[.04]' : 'border-hairline bg-surface') + ' p-5 sm:p-6">'
      + titre('Échantillon')
      + '<p class="chiffres mt-3 text-[18px] font-bold">' + morceaux.join(' · ') + '</p>'
      + '<p class="mt-2 max-w-[68ch] text-[13.5px] leading-relaxed text-soft">'
      + (limite
        ? 'Échantillon limité. Les moyennes par 90 minutes calculées sur cette base peuvent bouger fortement d’un match à l’autre. Le score de menace en tient déjà compte&nbsp;: il est réduit tant que le joueur n’a pas cinq apparitions.'
        : 'Toutes les moyennes par 90 minutes de cette page sont calculées sur cette base.')
      + '</p></section>';
  }

  /* ---------- 11. Autre joueur a surveiller ---------- */
  function autreJoueur(raw, matchId, idActuel) {
    var autres = (Array.isArray(raw.top_scorers) ? raw.top_scorers : [])
      .filter(function (p) { return Number(p.player_id) !== Number(idActuel); });
    if (!autres.length) return '';
    return bloc(titre('Autre joueur à surveiller')
      + '<div class="mt-3 space-y-2">' + autres.map(function (p) {
        return '<a href="/joueur.html?m=' + esc(matchId) + '&p=' + esc(p.player_id) + '" class="flex items-center gap-3 rounded-xl border border-hairline bg-panel p-3 transition hover:border-cyan/40">'
          + (p.photo ? '<img src="' + esc(p.photo) + '" alt="" width="40" height="40" loading="lazy" class="h-10 w-10 shrink-0 rounded-full border border-hairline object-cover">' : '')
          + '<span class="min-w-0 flex-1"><b class="block truncate text-[14px] font-semibold">' + esc(p.name) + '</b>'
          + '<span class="block text-[12.5px] text-soft">' + esc(poste(p.position)) + '</span></span>'
          + (n(p.goal_threat_score) !== null ? '<span class="chiffres shrink-0 text-[16px] font-bold text-cyan">' + n(p.goal_threat_score) + '<span class="text-[11px] font-normal text-soft">/100</span></span>' : '')
          + '</a>';
      }).join('') + '</div>');
  }

  /* ---------- Assemblage ---------- */
  function rendre(d) {
    var vm = d.vm, joueur = d.player, ts = d.ts;
    document.title = joueur.name + ' — Fiche joueur | IASHARK';

    var colonneGauche = [detailScore(ts), pourquoi(joueur, ts, d.rawRows), formeRecente(d.rawRows), production(joueur, ts)].filter(Boolean);
    var colonneDroite = [adversaire(vm, joueur, ts), tempsDeJeu(joueur, ts), echantillon(joueur, ts), autreJoueur(d.raw, d.matchId, joueur.id)].filter(Boolean);

    root.innerHTML = enTete(vm, joueur, d.matchId, ts)
      + '<div class="mt-6">' + indicateurs(joueur, ts) + '</div>'
      + '<div class="mt-6 grid gap-5 lg:grid-cols-12">'
      + '<div class="space-y-5 lg:col-span-7">' + colonneGauche.join('') + '</div>'
      + '<div class="space-y-5 lg:col-span-5">' + colonneDroite.join('') + '</div>'
      + '</div>'
      + '<div class="mt-8 border-t border-hairline pt-6">'
      + '<a href="/match.html?id=' + esc(d.matchId) + '" class="inline-flex h-11 items-center rounded-xl border border-hairline px-5 text-[14px] font-semibold transition hover:border-cyan/40">'
      + '<span aria-hidden="true" class="mr-2">←</span>Retour à l’analyse du match</a></div>';

    squelette.hidden = true;
    root.hidden = false;
    brancher();
  }

  function brancher() {
    // Bascule Total / par 90.
    root.querySelectorAll('[data-unite]').forEach(function (b) {
      b.addEventListener('click', function () {
        var unite = b.getAttribute('data-unite');
        root.querySelectorAll('[data-unite]').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
        root.querySelectorAll('[data-unite-total]').forEach(function (el) {
          // Une valeur sans equivalent par 90 (les minutes, les cartons)
          // reste affichee telle quelle plutot que de disparaitre.
          var p90 = el.parentElement.querySelector('[data-unite-p90]');
          if (!p90) return;
          el.hidden = unite === 'p90';
          p90.hidden = unite !== 'p90';
        });
      });
    });

    var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var remplir = function () {
      root.querySelectorAll('.anneau .trace').forEach(function (c) { c.style.strokeDashoffset = c.dataset.cible; });
      root.querySelectorAll('.barre > i').forEach(function (i) { i.style.width = i.dataset.largeur + '%'; });
    };
    if (reduit) { remplir(); root.querySelectorAll('.entree').forEach(function (e) { e.classList.add('vu'); }); return; }
    requestAnimationFrame(function () { requestAnimationFrame(remplir); });
    if ('IntersectionObserver' in window) {
      var i = 0;
      var io = new IntersectionObserver(function (entrees) {
        entrees.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.style.transitionDelay = (i % 5) * 50 + 'ms';
          i++;
          e.target.classList.add('vu');
          io.unobserve(e.target);
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
      root.querySelectorAll('.entree').forEach(function (e) { io.observe(e); });
      setTimeout(function () { root.querySelectorAll('.entree').forEach(function (e) { e.classList.add('vu'); }); }, 2500);
    } else {
      root.querySelectorAll('.entree').forEach(function (e) { e.classList.add('vu'); });
    }
  }

  /* ---------- Chargement ----------
     Toujours via la fonction match-data, connecte ou non : c'est elle qui
     decide ce qu'un visiteur a le droit de recevoir, et elle retire les
     champs premium pour un non-abonne. La version precedente allait chercher
     /data.json directement quand aucune session n'existait, ce qui
     contournait ce filtre. Repli sur le fichier public uniquement si la
     fonction est injoignable. */
  async function charger() {
    var params = new URLSearchParams(location.search);
    var matchId = params.get('m'), playerId = Number(params.get('p'));
    if (!matchId || !Number.isFinite(playerId)) throw new Error('Lien incomplet : ce joueur ne peut pas être affiché.');

    var raw = null;
    try {
      var reponse = await window.IasharkApp.supabase.functions.invoke('match-data');
      if (reponse.data && !reponse.error) {
        raw = (reponse.data.matchs || []).find(function (x) { return String(x.id) === String(matchId); });
      }
    } catch (_e) { /* repli ci-dessous */ }
    if (!raw) {
      var data = await fetch('/data.json?t=' + Date.now()).then(function (r) { return r.json(); });
      raw = (data.matchs || []).find(function (x) { return String(x.id) === String(matchId); });
    }
    if (!raw) throw new Error('Match introuvable.');

    var vm = window.IasharkMatchViewModel.buildMatchViewModel(raw);
    var analytics = vm.players.analytics;
    var trouve = function (cote) { return analytics[cote].players.find(function (p) { return p.id === playerId; }); };
    var player = trouve('home') || trouve('away');
    if (!player) throw new Error('Aucune statistique suivie pour ce joueur sur ce match.');
    var cote = trouve('home') ? 'home' : 'away';
    var rawRows = ((raw.player_history && raw.player_history[cote]) || [])
      .filter(function (r) { return Number(r.player_id) === playerId; }).slice(0, 10);
    var ts = Array.isArray(raw.top_scorers)
      ? raw.top_scorers.find(function (p) { return Number(p.player_id) === playerId; }) || null : null;
    return { vm: vm, player: player, rawRows: rawRows, matchId: matchId, ts: ts, raw: raw };
  }

  charger().then(rendre).catch(function (e) {
    squelette.hidden = true;
    root.hidden = false;
    root.innerHTML = '<div class="mx-auto max-w-[520px] py-16 text-center">'
      + '<h1 class="text-[22px] font-bold tracking-tight">' + esc(e && e.message ? e.message : 'Fiche joueur indisponible') + '</h1>'
      + '<p class="mt-3 text-[14px] leading-relaxed text-soft">Vous pouvez revenir aux analyses du jour et rouvrir la fiche depuis un match.</p>'
      + '<a href="/" class="mt-6 inline-flex h-11 items-center rounded-xl bg-cyan px-5 text-[14px] font-bold text-[#04141b] transition hover:bg-cyan/90">Voir les analyses du jour</a></div>';
  });
})();
