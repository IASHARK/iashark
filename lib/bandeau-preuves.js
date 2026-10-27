/* BANDEAU DE PREUVES (demande de Clement du 26/10/2026) : en haut de l'accueil et des pages match, un bandeau
   qui defile avec les VRAIS resultats regles, gagnes en vert, perdus en rouge, dans l'ordre.

   Regles (controles historique-public et avocat du diable du 26/10/2026) :
   - source unique : predictions_archive (resultat win / loss), et seulement les paris PUBLIES AVANT LE COUP
     D'ENVOI (published_at < kickoff_at : l'archive est verrouillee apres le coup d'envoi, migration 0035) ;
   - AFFICHAGE : la bande qui defile, seule, sans ligne de texte au-dessus (decision de Clement du 26/10/2026, qui
     remplace le compte et le titre du defile du meme jour). Le compte depuis le 04/10/2026 (DEBUT_COMPTE, coups
     d'envoi a partir de minuit, heure de Paris) reste calcule dans preuves/bandeau.json, il n'est plus affiche ;
   - LE DEFILE montre les 40 derniers paris simples regles, par coup d'envoi du plus recent au plus ancien, gagnes et
     perdus melanges comme ils sont venus, chacun avec sa cote. Jamais de filtre par resultat, par cote ou par ligue ;
   - combines (Petit / Grand combine, table tickets_du_jour) et Selection en or des 7 derniers jours, une fois leurs
     matchs termines (dernier coup d'envoi + 3 h) : chaque pari est regle par l'archive avec le MEME marche que le
     pari publie, sinon par le score final du match (une regle par marche, controle historique-public du 27/10/2026).
     Un pari perdu = combine perdu, comme chez un bookmaker ; tous gagnes = gagne ; un pari que ni l'archive ni le
     score final ne reglent (buteur, mi-temps, pas encore regle) = « resultat en verification », JAMAIS retire en silence ;
   - aucune phrase de gain ni de promesse : des comptes, des cotes, des dates (Code de la consommation L121-2 a 4) ;
   - logos : identifiants d'equipes lus dans les matchs du run (et gardes d'un passage a l'autre, registre
     « equipes ») ; sans identifiant, pas de logo, jamais un logo devine.

   Module double : construireBandeau() (pipeline, tests node) ecrit preuves/bandeau.json ; monter() (navigateur)
   le lit apres le chargement de la page, sans rien bloquer. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (root) root.IasharkBandeauPreuves = api;
})(typeof window !== "undefined" ? window : null, function (G) {
  "use strict";

  var N_SIMPLES = 40;          // paris simples du defile
  var DEBUT_COMPTE = "2026-10-04"; // debut du compte affiche (archive verrouillee), minuit heure de Paris
  var DEBUT_COMPTE_MS = Date.parse("2026-10-04T00:00:00+02:00");
  var JOURS_TICKETS = 7;       // combines et Selection en or des 7 derniers jours
  var DUREE_MATCH_MS = 3 * 3600000; // un ticket est « termine » 3 h apres son dernier coup d'envoi
  var JOURS_EQUIPES = 12;      // registre des logos : matchs des 12 derniers jours

  function texte(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }
  function cote(v) {
    var x = Number(String(v == null ? "" : v).replace(",", "."));
    return isFinite(x) && x > 1 ? Math.round(x * 100) / 100 : null;
  }
  function ms(v) { var t = Date.parse(v); return isFinite(t) ? t : null; }
  function idEquipe(v) { var n = Number(v); return isFinite(n) && n > 0 && n === Math.floor(n) ? n : null; }
  function publieAvant(r) {
    var p = ms(r && r.published_at), k = ms(r && r.kickoff_at);
    return p != null && k != null && p < k;
  }
  // Coup d'envoi « AAAA-MM-JJ HH:MM » (heure UTC des tickets) -> ISO.
  function isoTicket(v) {
    var s = texte(v);
    if (!s) return null;
    var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(s);
    return m ? m[1] + "T" + m[2] + ":00Z" : null;
  }

  // ---------------------------------------------------------------- reglement d'une jambe par le score final
  // Controle historique-public du 27/10/2026 : les tickets du 19 et du 20/10 (regle du 06/10, « tous les marches »)
  // avaient des jambes sur un AUTRE marche que le pari simple publie du match ; l'archive ne les reglait jamais et la
  // bande les montrait « Resultat en verification » pour toujours. Une jambe se regle donc aussi par le SCORE FINAL
  // (score reglementaire, 90 minutes, enregistre par le calcul quotidien dans predictions_archive.score), une regle
  // par marche. Un marche que le score final ne suffit pas a regler (1re ou 2e mi-temps, buteur, tirs, codes « F… »)
  // reste « resultat en verification ». Rien n'est ecrit dans la base.
  function lireScore(v) {
    var m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(v == null ? "" : v));
    return m ? [Number(m[1]), Number(m[2])] : null;
  }
  // Seuil d'un identifiant : « 25 » = 2,5 ; « 05 » = 0,5 ; « 2_5 » = 2,5. Seulement les demi-lignes (jamais de « pousse »).
  function seuilDe(s) {
    var m = /^(\d+)_(\d)$/.exec(String(s));
    var v = m ? Number(m[1] + "." + m[2]) : (/^\d{2,3}$/.test(String(s)) ? Number(s) / 10 : null);
    return v != null && isFinite(v) && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9 && Math.round(v * 2) % 2 === 1 ? v : null;
  }
  // marche (identifiant du site) + score [domicile, exterieur] -> "win" | "loss" | "void" | null (non reglable).
  function reglerParScore(marche, score) {
    var id = String(marche || ""), m, l;
    if (!Array.isArray(score) || score.length !== 2 || !score.every(function (x) { return typeof x === "number" && x >= 0 && Math.floor(x) === x; })) return null;
    var h = score[0], a = score[1], tot = h + a;
    var r = function (x) { return x ? "win" : "loss"; };
    var cote = function (c, f) { return c === "home" ? f(h, a) : f(a, h); }; // f(buts de l'equipe, buts de l'autre)
    var ligne = function (sens, n, seuil) { return sens === "over" ? n > seuil : n < seuil; };
    // Resultat et double chance.
    if (id === "home-win") return r(h > a);
    if (id === "draw") return r(h === a);
    if (id === "away-win") return r(a > h);
    if (id === "dc-1x") return r(h >= a);
    if (id === "dc-x2") return r(a >= h);
    if (id === "dc-12") return r(h !== a);
    // Rembourse si nul (« draw no bet »).
    if ((m = /^(?:(home|away)-dnb|dnb-(home|away))$/.exec(id))) { var c = m[1] || m[2]; return h === a ? "void" : r(cote(c, function (x, y) { return x > y; })); }
    // Buts du match : plus / moins.
    if ((m = /^(over|under)-(\d+(?:_\d)?)$/.exec(id))) { l = seuilDe(m[2]); return l == null ? null : r(ligne(m[1], tot, l)); }
    // Buts d'une equipe : plus / moins.
    if ((m = /^(home|away)-team-(over|under)-(\d+(?:_\d)?)$/.exec(id))) { l = seuilDe(m[3]); return l == null ? null : r(ligne(m[2], m[1] === "home" ? h : a, l)); }
    // Les deux equipes marquent.
    if (id === "btts-yes") return r(h > 0 && a > 0);
    if (id === "btts-no") return r(!(h > 0 && a > 0));
    // Victoire et buts du match (« le PSG gagne et plus de 2,5 buts »).
    if ((m = /^(home|away)-win-(over|under)-(\d+(?:_\d)?)$/.exec(id))) { l = seuilDe(m[3]); return l == null ? null : r(cote(m[1], function (x, y) { return x > y; }) && ligne(m[2], tot, l)); }
    // Nul et buts du match.
    if ((m = /^draw-(over|under)-(\d+(?:_\d)?)$/.exec(id))) { l = seuilDe(m[2]); return l == null ? null : r(h === a && ligne(m[1], tot, l)); }
    // Clean sheet et victoire sans encaisser.
    if ((m = /^(home|away)-clean-sheet$/.exec(id))) return r(m[1] === "home" ? a === 0 : h === 0);
    if ((m = /^(home|away)-win-to-nil$/.exec(id))) return r(m[1] === "home" ? h > a && a === 0 : a > h && h === 0);
    return null; // mi-temps, buteur, tirs, corners, cartons, codes « F… » : le score final ne suffit pas
  }

  // ---------------------------------------------------------------- construction (pipeline)
  // opts : { simples: lignes predictions_archive (type single), tickets: lignes tickets_du_jour (x5, x10, or),
  //          jambes: lignes predictions_archive des matchs des tickets, matchs: matchs du run (home.id, away.id),
  //          precedent: preuves/bandeau.json precedent, genereLe: ISO, maintenant: ms }
  function construireBandeau(opts) {
    var o = opts || {};
    var maintenant = typeof o.maintenant === "number" ? o.maintenant : Date.now();

    // Registre des identifiants d'equipes (logos) : precedent + matchs du run, purge apres JOURS_EQUIPES.
    var equipes = {};
    var prec = o.precedent && typeof o.precedent === "object" && o.precedent.equipes && typeof o.precedent.equipes === "object" ? o.precedent.equipes : {};
    Object.keys(prec).forEach(function (f) {
      var e = prec[f];
      if (Array.isArray(e) && e.length >= 3 && ms(e[2]) != null && maintenant - ms(e[2]) < JOURS_EQUIPES * 86400000) equipes[f] = [idEquipe(e[0]), idEquipe(e[1]), e[2]];
    });
    (Array.isArray(o.matchs) ? o.matchs : []).forEach(function (m) {
      if (!m || m.id == null) return;
      var hi = idEquipe(m.home && m.home.id), ai = idEquipe(m.away && m.away.id);
      var d = texte(m.date);
      var k = d ? d.replace(" ", "T") + (d.length <= 16 ? ":00Z" : "") : null;
      if ((hi || ai) && k && ms(k) != null) equipes[String(m.id)] = [hi, ai, k];
    });
    function logos(f) { var e = equipes[String(f)]; return e ? [e[0] || null, e[1] || null] : [null, null]; }

    // Index de l'archive (resultats et scores des matchs des tickets).
    var archive = {};
    (Array.isArray(o.jambes) ? o.jambes : []).concat(Array.isArray(o.simples) ? o.simples : []).forEach(function (r) {
      if (r && r.fixture_id != null) archive[String(r.fixture_id)] = r;
    });
    // 1. Meme marche que le pari simple publie avant le coup d'envoi : son resultat. 2. Sinon, match regle dans
    // l'archive (gagne, perdu ou annule) : la jambe est reglee par le score final, une regle par marche
    // (reglerParScore) ; annule sans score = match non joue = jambe annulee. 3. Sinon : en verification (null).
    function reglement(fixture, marche) {
      var r = archive[String(fixture)];
      if (!r || !marche) return null;
      var fini = r.result === "win" || r.result === "loss" || r.result === "void";
      if (String(r.market) === String(marche) && publieAvant(r)) return fini ? r.result : null;
      if (!fini) return null;
      var sc = lireScore(r.score);
      if (!sc) return r.result === "void" ? "void" : null;
      return reglerParScore(marche, sc);
    }

    // 1. Paris simples regles et publies avant le coup d'envoi.
    var regles = (Array.isArray(o.simples) ? o.simples : []).filter(function (r) {
      return r && r.fixture_id != null && (r.type == null || r.type === "single") && (r.result === "win" || r.result === "loss") && publieAvant(r);
    });
    // Compte de la periode longue (depuis DEBUT_COMPTE), sur TOUS ces paris, sans autre filtre.
    var periode = regles.filter(function (r) { return ms(r.kickoff_at) >= DEBUT_COMPTE_MS; });
    var compte = { depuis: DEBUT_COMPTE, gagnes: periode.filter(function (r) { return r.result === "win"; }).length, perdus: periode.filter(function (r) { return r.result === "loss"; }).length };
    // Defile : les N derniers, sans tri par resultat (affichables : equipes, pari et cote connus).
    var simples = regles.filter(function (r) {
      return texte(r.home) && texte(r.away) && (texte(r.prediction) || texte(r.market)) && cote(r.cote);
    }).sort(function (a, b) {
      var d = ms(b.kickoff_at) - ms(a.kickoff_at);
      return d !== 0 ? d : Number(b.fixture_id) - Number(a.fixture_id);
    }).slice(0, N_SIMPLES).map(function (r) {
      var lg = logos(r.fixture_id);
      return { f: Number(r.fixture_id), k: new Date(ms(r.kickoff_at)).toISOString(), h: texte(r.home), a: texte(r.away), hi: lg[0], ai: lg[1],
        m: texte(r.market), p: texte(r.prediction), c: cote(r.cote), s: texte(r.score), r: r.result };
    });

    // 2. Combines et Selection en or des JOURS_TICKETS derniers jours, une fois leurs matchs termines.
    var depuis = maintenant - JOURS_TICKETS * 86400000;
    var combines = [], or = [];
    (Array.isArray(o.tickets) ? o.tickets : []).forEach(function (t) {
      if (!t || !texte(t.jour) || !t.contenu || typeof t.contenu !== "object") return;
      if (t.type !== "x5" && t.type !== "x10" && t.type !== "or") return;
      var liste = t.type === "or" ? t.contenu.paris : t.contenu.jambes;
      if (!Array.isArray(liste) || !liste.length) return;
      var fin = null;
      // Coup d'envoi : coup_envoi_ms (exact) ; a defaut « AAAA-MM-JJ HH:MM » (heure de Paris, lu comme UTC : ordre seulement).
      liste.forEach(function (l) { var k = l && typeof l.coup_envoi_ms === "number" && isFinite(l.coup_envoi_ms) ? l.coup_envoi_ms : ms(isoTicket(l && l.coup_envoi)); if (k != null && (fin == null || k > fin)) fin = k; });
      if (fin == null || fin < depuis || fin + DUREE_MATCH_MS > maintenant) return; // trop ancien, ou matchs pas encore termines
      var res = liste.map(function (l) { return l ? reglement(l.fixture_id, l.market_id) : null; });
      var gagnes = res.filter(function (x) { return x === "win"; }).length, perdus = res.filter(function (x) { return x === "loss"; }).length;
      var annules = res.filter(function (x) { return x === "void"; }).length, verif = res.filter(function (x) { return x == null; }).length;
      if (t.type === "or") {
        or.push({ j: texte(t.jour), k: new Date(fin).toISOString(), n: liste.length, g: gagnes, p: perdus, a: annules, v: verif });
        return;
      }
      // Combine : un perdu suffit (perdu) ; gagne seulement si tout est regle ; sinon « resultat en verification ».
      var r = perdus ? "loss" : verif ? "verif" : gagnes ? "win" : "void";
      var c = cote((t.meta && t.meta.cote_totale) || t.contenu.cote_totale);
      combines.push({ t: t.type, j: texte(t.jour), k: new Date(fin).toISOString(), n: liste.length, c: c, r: r });
    });
    combines.sort(function (a, b) { return a.k < b.k ? 1 : a.k > b.k ? -1 : 0; });
    or.sort(function (a, b) { return a.k < b.k ? 1 : a.k > b.k ? -1 : 0; });

    // Registre : seulement les matchs encore utiles (paris montres + matchs a venir du run).
    return {
      version: 1,
      genere_le: o.genereLe || new Date(maintenant).toISOString(),
      regle: "Compte : tous les paris simples de predictions_archive regles (gagne / perdu), publies avant le coup d'envoi, coups d'envoi depuis le " + DEBUT_COMPTE + " (heure de Paris). Defile : les " + N_SIMPLES + " derniers de ces paris, dans l'ordre des coups d'envoi. Combines et Selection en or des " + JOURS_TICKETS + " derniers jours, matchs termines, regles par l'archive (meme marche) ; un pari non regle = resultat en verification.",
      compte: compte,
      simples: { n: simples.length, du: simples.length ? simples[simples.length - 1].k : null, au: simples.length ? simples[0].k : null, items: simples },
      combines: combines,
      or: or,
      equipes: equipes,
    };
  }

  // ---------------------------------------------------------------- affichage (navigateur)
  // Bande seule (decision de Clement du 26/10/2026) : plus de lignes de texte au-dessus, juste les resultats qui
  // defilent. Hauteur fixe de 44 px reservee par la page elle-meme (balise <style> avant #bandeauPreuves) : aucun
  // saut a l'affichage, et le premier ecran de l'accueil sur telephone garde le match visible.
  var CSS = ".bp{box-sizing:border-box;height:44px;background:#0a1420;border-bottom:1px solid rgba(141,179,211,.14);color:#f4f7fb;font-family:Inter,'DM Sans',system-ui,sans-serif}"
    + ".bp[hidden]{display:none}"
    + ".bp-piste{box-sizing:border-box;height:100%;padding-left:16px;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 18px,#000 calc(100% - 18px),transparent);mask-image:linear-gradient(90deg,transparent,#000 18px,#000 calc(100% - 18px),transparent)}"
    + ".bp-piste:focus-visible{outline:2px solid #20d5ef;outline-offset:-2px}"
    + ".bp-rail{display:flex;align-items:center;height:100%;width:max-content;animation:bp-defile var(--bp-duree,240s) linear infinite}"
    + ".bp-piste:hover .bp-rail,.bp-piste:focus-within .bp-rail,.bp-piste.bp-pause .bp-rail{animation-play-state:paused}"
    + "@keyframes bp-defile{to{transform:translateX(-50%)}}"
    + "@media (prefers-reduced-motion:reduce){.bp-rail{animation:none}.bp-piste{overflow-x:auto;scrollbar-width:none}.bp-piste::-webkit-scrollbar{display:none}.bp-double{display:none!important}}"
    + ".bp-it{box-sizing:border-box;display:flex;align-items:center;gap:7px;height:30px;margin-right:8px;background:#0d1926;border:1px solid rgba(141,179,211,.14);border-radius:9px;padding:0 6px 0 7px;white-space:nowrap;font-size:13px;line-height:1}"
    + ".bp-lg{display:flex;flex:none}.bp-lg img,.bp-lg i{width:18px;height:18px;border-radius:50%;background:#132233;display:block;object-fit:contain}"
    + ".bp-lg>*+*{margin-left:-5px}"
    + ".bp-m{color:#91a0b3}.bp-p{font-weight:600}.bp-c{font-variant-numeric:tabular-nums;color:#dbe4ee}"
    + ".bp-r{font-size:11.5px;font-weight:700;line-height:18px;border-radius:6px;padding:0 7px}"
    + ".bp-win .bp-r{color:#04150d;background:#34d399}.bp-loss .bp-r{color:#1d0606;background:#f87171}"
    + ".bp-t{color:#20d5ef;font-weight:700}"
    + ".bp-verif .bp-r,.bp-void .bp-r{color:#e2e8f0;background:#334155}"
    + ".bp-or .bp-g{color:#34d399;font-weight:700}.bp-or .bp-x{color:#f87171;font-weight:700}.bp-or .bp-v{color:#cbd5e1;font-weight:600}";
  var VITESSE = 45; // pixels par seconde : une ligne se lit en entier avant de sortir de l'ecran d'un telephone

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function t(cle, defaut) {
    try { var I = G && G.I18N; var v = I && typeof I.t === "function" ? I.t("bandeau_preuves." + cle, defaut) : null; return typeof v === "string" && v ? v : defaut; } catch (e) { return defaut; }
  }
  function tf(cle, defaut, vars) { return t(cle, defaut).replace(/\{(\w+)\}/g, function (_m, n) { return vars[n] == null ? "" : String(vars[n]); }); }
  function localeTag() { try { var I = G && G.I18N; return (I && typeof I.localeTag === "function" && I.localeTag()) || "fr-FR"; } catch (e) { return "fr-FR"; } }
  function nombre(c) {
    try { return Number(c).toLocaleString(localeTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { return String(c); }
  }
  // « 26/10 à 11 h 33 » (heure du visiteur, format de la langue de la page) ; date illisible : rien.
  function miseAJour(iso) {
    var t0 = ms(iso);
    if (t0 == null) return null;
    var d = new Date(t0);
    try {
      var jour = d.toLocaleDateString(localeTag(), { day: "2-digit", month: "2-digit" });
      var heure = d.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" });
      return tf("updated_at", "{jour} à {heure}", { jour: jour, heure: heure });
    } catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
  }
  function dateCourte(j) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j || ""); return m ? m[3] + "/" + m[2] : ""; }
  function logo(id) { return id ? '<img src="https://media.api-sports.io/football/teams/' + Number(id) + '.png" alt="" width="18" height="18" loading="lazy" decoding="async">' : "<i></i>"; }
  function libellePari(s) {
    var L = G && G.IasharkMarketLabels, eq = { home: s.h, away: s.a };
    try {
      if (L && s.m && typeof L.marketIdLabel === "function") { var a = L.marketIdLabel(s.m, eq); if (a && a !== s.m) return a; }
      if (L && s.p && typeof L.marketLabel === "function") { var b = L.marketLabel(s.p, eq); if (b) return b; }
    } catch (e) {}
    return s.p || s.m || "";
  }
  function resultat(r) {
    if (r === "win") return t("won", "Gagné");
    if (r === "loss") return t("lost", "Perdu");
    if (r === "void") return t("void", "Annulé");
    return t("pending_check", "Résultat en vérification");
  }
  function classe(r) { return r === "win" || r === "loss" || r === "void" ? r : "verif"; }
  function html(d) {
    var S = d && d.simples && Array.isArray(d.simples.items) ? d.simples : null;
    if (!S || !S.items.length) return null;
    var items = [];
    S.items.forEach(function (s) {
      items.push({ k: s.k, h: '<span class="bp-it bp-' + (s.r === "win" ? "win" : "loss") + '"><span class="bp-lg">' + logo(s.hi) + logo(s.ai) + '</span><span class="bp-m">' + esc(s.h) + " – " + esc(s.a) + '</span><span class="bp-p">' + esc(libellePari(s)) + '</span><span class="bp-c">' + esc(nombre(s.c)) + '</span><span class="bp-r">' + esc(resultat(s.r)) + "</span></span>" });
    });
    (Array.isArray(d.combines) ? d.combines : []).forEach(function (c) {
      var nom = c.t === "x10" ? t("big_combo", "Grand combiné") : t("small_combo", "Petit combiné");
      items.push({ k: c.k, h: '<span class="bp-it bp-' + classe(c.r) + '"><span class="bp-t">' + esc(nom) + '</span><span class="bp-m">' + esc(tf("of_day", "du {date}", { date: dateCourte(c.j) })) + " · " + esc(tf("matches", "{n} matchs", { n: c.n })) + '</span>' + (c.c ? '<span class="bp-c">' + esc(tf("odds", "cote {c}", { c: nombre(c.c) })) + "</span>" : "") + '<span class="bp-r">' + esc(resultat(c.r)) + "</span></span>" });
    });
    (Array.isArray(d.or) ? d.or : []).forEach(function (s) {
      items.push({ k: s.k, h: '<span class="bp-it bp-or"><span class="bp-t">' + esc(t("gold", "Sélection en or")) + '</span><span class="bp-m">' + esc(tf("of_day", "du {date}", { date: dateCourte(s.j) })) + '</span><span class="bp-g">' + esc(tf("won_n", "{n} gagnés", { n: s.g })) + '</span>'
        + (s.p ? '<span class="bp-x">' + esc(tf("lost_n", "{n} perdus", { n: s.p })) + "</span>" : "")
        + (s.a ? '<span class="bp-v">' + esc(tf("void_n", "{n} annulés", { n: s.a })) + "</span>" : "")
        + (s.v ? '<span class="bp-v">' + esc(tf("pending_n", "{n} en vérification", { n: s.v })) + "</span>" : "") + "</span>" });
    });
    items.sort(function (a, b) { return a.k < b.k ? 1 : a.k > b.k ? -1 : 0; });
    var rail = items.map(function (i) { return i.h; }).join("");
    // Aucune ligne de texte visible (decision de Clement du 26/10/2026). La date de mise a jour, tiree de genere_le
    // (controle historique-public du 26/10/2026 : un fichier reste ancien se voit), reste lue par les lecteurs d'ecran.
    var maj = miseAJour(d.genere_le);
    var aria = t("aria", "Derniers résultats, gagnés et perdus") + (maj ? " · " + tf("updated", "mis à jour le {date}", { date: maj }) : "");
    return { rail: rail, n: items.length, maj: maj, aria: aria };
  }

  // el : conteneur (#bandeauPreuves). Lecture differee (jamais bloquante) ; sans fichier, le bandeau se replie.
  function monter(el, opts) {
    if (!el || !G || typeof G.fetch !== "function") return;
    var o = opts || {};
    var lancer = function () {
      G.fetch(o.url || "/preuves/bandeau.json", { cache: "no-cache" }).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (d) {
        var h = d ? html(d) : null;
        if (!h) { el.hidden = true; return; }
        if (!G.document.getElementById("bp-style")) { var st = G.document.createElement("style"); st.id = "bp-style"; st.textContent = CSS; G.document.head.appendChild(st); }
        el.innerHTML = '<div class="bp-piste" tabindex="0" aria-label="' + esc(h.aria) + '"><div class="bp-rail">' + h.rail + '<span class="bp-double" aria-hidden="true" style="display:contents">' + h.rail + "</span></div></div>";
        var piste = el.querySelector(".bp-piste"), rail = el.querySelector(".bp-rail");
        // Rythme regulier quelle que soit la longueur : duree d'un tour = largeur d'une copie / VITESSE. La marge de
        // gauche est sur la piste (pas sur le rail) : -50 % = exactement une copie, la boucle ne saute pas.
        if (rail) { var w = rail.scrollWidth / 2; rail.style.setProperty("--bp-duree", Math.max(40, Math.round(w / VITESSE)) + "s"); }
        if (piste) piste.addEventListener("touchstart", function () { piste.classList.toggle("bp-pause"); }, { passive: true });
        el.hidden = false;
      }).catch(function () { el.hidden = true; });
    };
    var I = G.I18N;
    var pret = I && typeof I.init === "function" && !I.dict ? Promise.resolve().then(function () { return I.init(); }).catch(function () {}) : Promise.resolve();
    pret.then(function () {
      if (typeof G.requestIdleCallback === "function") G.requestIdleCallback(lancer, { timeout: 1500 });
      else G.setTimeout(lancer, 300);
    });
  }

  return { construireBandeau: construireBandeau, reglerParScore: reglerParScore, lireScore: lireScore, html: html, monter: monter, N_SIMPLES: N_SIMPLES, JOURS_TICKETS: JOURS_TICKETS, DEBUT_COMPTE: DEBUT_COMPTE };
});
