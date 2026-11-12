"use strict";
// PETITES LIGUES BET365, CHEMIN LEGER (demande de Clement des 11 et 12/11/2026). Module pur, teste par
// tests/petites-ligues.test.js ; appels API et fichiers : scripts/petites-ligues.js ; reglages :
// config/petites-ligues.json.
//
// Ce que fait le chemin leger, et rien d'autre :
//   1. garde les matchs cotes par Bet365 HORS des competitions du site (et hors des competitions retirees le 03/10,
//      des competitions feminines, de jeunes, de reserves et des amicaux) ;
//   2. controle chaque match (programme, statut, coup d'envoi, fuseau, heure de la cote, cotes aberrantes) ;
//   3. choisit le pari avec LA MEME fonction que le site (lib/pronostic.js#choisirPariFourchette, regle du 11/11 :
//      marches Bet365, cote 1,70-3,50, controle Pinnacle), avec une couverture VIDE : seulement les marches regles par
//      le score et le statut du match, puisque le reglement ne lit que /fixtures ;
//   4. horodate chaque cote (heure de mise a jour donnee par API-Sports + heure de notre lecture), fige le pari a sa
//      premiere ecriture (jamais change ensuite), suit la cote de la meme issue jusqu'au coup d'envoi (cloture), puis
//      regle le pari sur le score.
// Aucune donnee du futur : un match deja commence, imminent (15 min, lib/kickoff-guard.js) ou une cote dont l'heure
// est apres maintenant ou apres le coup d'envoi n'est jamais utilise pour un pari ; la cloture n'est jamais lue apres
// le coup d'envoi ; le score n'est lu que pour regler un pari deja fige.
// Tous les paris de ce chemin sont « en test » : jamais Selection, match offert, combine, VIP, ni « verifie ».

const PRONOSTIC = require("./pronostic.js");
const FP = require("./flux-paris.js");
const MP = require("./marches-paris.js");
const { kickoffGate } = require("./kickoff-guard.js");

const FIABILITE = "en_test";
const CHEMIN = "leger";
const BET365 = "bet365";
const STATUTS_FINIS = ["FT", "AET", "PEN"];
const STATUTS_ANNULES = ["PST", "CANC", "ABD", "AWD", "WO"];

function nombre(v) { const x = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v); return Number.isFinite(x) ? x : null; }
function iso(ms) { return new Date(ms).toISOString(); }
function msDe(v) { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : null; }

// --------------------------------------------------------------------------- perimetre
function lireConfig(cfg) {
  const c = cfg || {};
  return {
    actif: c.actif === true,
    regle_version: String(c.regle_version || "petites-ligues-leger"),
    bookmaker_reference_id: Number(c.bookmaker_reference_id || 8),
    bookmaker_controle_id: Number(c.bookmaker_controle_id || 4),
    jours: Math.max(1, Math.min(3, Number(c.jours || 3))),
    max_appels_par_lancement: Number(c.max_appels_par_lancement || 150),
    arret_si_restant_sous: Number(c.arret_si_restant_sous || 3000),
    marge_1n2_max: nombre(c.marge_1n2_max) != null ? nombre(c.marge_1n2_max) : 0.25,
    ecart_horaire_max_secondes: Number(c.ecart_horaire_max_secondes || 60),
    reglement_apres_minutes: Number(c.reglement_apres_minutes || 150),
    exclure_ligues_ids: new Set((c.exclure_ligues_ids || []).map(Number)),
    selections_motif: c.selections_nationales_motif ? new RegExp(c.selections_nationales_motif, "i") : null,
    selections_bets: (c.selections_nationales_bets || [1, 12]).map(Number),
    motifs: (c.exclure_motifs_nom || []).map((s) => new RegExp(s, "i")),
  };
}

// Competitions du site (51) et competitions retirees le 03/10 : jamais dans le chemin leger.
function competitionsExclues(configLigues) {
  const site = new Set([1]); // Coupe du monde : traitee par le calcul quotidien
  ((configLigues && configLigues.leagues) || []).forEach((l) => site.add(Number(l.apiFootballId)));
  const retirees = new Set(((configLigues && configLigues.competitions_retirees) || []).map((l) => Number(l.apiFootballId)));
  return { site, retirees };
}

// -> null (gardee) ou la raison de l'exclusion.
function motifExclusion(league, c, exclues) {
  const id = Number(league && league.id);
  if (!Number.isInteger(id)) return "competition_illisible";
  if (exclues.site.has(id)) return "competition_du_site";
  if (exclues.retirees.has(id)) return "competition_retiree";
  if (c.exclure_ligues_ids.has(id)) return "competition_exclue";
  const nom = String((league && league.name) || "");
  if (c.motifs.some((r) => r.test(nom))) return "competition_douteuse";
  return null;
}

// --------------------------------------------------------------------------- cotes
// Reponses /odds (toutes les pages, un ou deux bookmakers) -> Map(fixture -> { league, fixture, bookmakers, maj }).
// maj : { "<id bookmaker>": heure de mise a jour donnee par API-Sports }. Doublon (meme match, meme bookmaker) : la
// mise a jour la plus recente seulement.
function indexerCotes(items) {
  const out = new Map();
  let doublons = 0;
  (items || []).forEach(function (it) {
    const id = Number(it && it.fixture && it.fixture.id);
    if (!Number.isInteger(id)) return;
    const e = out.get(id) || { league: it.league || {}, fixture: it.fixture || {}, bookmakers: [], maj: {} };
    (it.bookmakers || []).forEach(function (b) {
      const bid = String(b && b.id);
      const deja = e.bookmakers.findIndex((x) => String(x.id) === bid);
      if (deja !== -1) {
        doublons++;
        if ((msDe(it.update) || 0) <= (msDe(e.maj[bid]) || 0)) return;
        e.bookmakers.splice(deja, 1);
      }
      e.bookmakers.push(b);
      e.maj[bid] = it.update || null;
    });
    out.set(id, e);
  });
  return { cotes: out, doublons };
}

function cotesBet(e, bookmakerId, betId) {
  const b = (e.bookmakers || []).find((x) => Number(x.id) === bookmakerId);
  const bet = b && (b.bets || []).find((x) => Number(x.id) === betId);
  return bet ? bet.values || [] : null;
}

// Marge du 1N2 Bet365 (bet 1) : null si absent ou illisible.
function marge1n2(e, bookmakerId) {
  const v = cotesBet(e, bookmakerId, 1);
  if (!v) return null;
  const k = ["Home", "Draw", "Away"].map((n) => { const x = v.find((y) => String(y.value) === n); return x ? nombre(x.odd) : null; });
  if (k.some((x) => x == null || !(x > 1))) return null;
  return { marge: k.reduce((s, x) => s + 1 / x, 0) - 1, min: Math.min.apply(null, k) };
}

// CONTROLE QUALITE D'UN MATCH (une raison par cause, jamais un pari si une raison sort).
// fx : element /fixtures du meme jour ; e : cotes indexees ; nowMs : heure du calcul.
function controler(e, fx, nowMs, c) {
  if (!fx) return "absent_du_programme";
  const g = kickoffGate(fx, nowMs);
  if (!g.open) return g.reason; // FIXTURE_NOT_UPCOMING (reporte, commence, fini), KICKOFF_PASSED, KICKOFF_IMMINENT, KICKOFF_UNKNOWN
  const tsO = Number(e.fixture && e.fixture.timestamp), tsF = Number(fx.fixture && fx.fixture.timestamp);
  if (!Number.isFinite(tsO) || !Number.isFinite(tsF) || Math.abs(tsO - tsF) > c.ecart_horaire_max_secondes) return "horaire_incoherent";
  const maj = msDe(e.maj[String(c.bookmaker_reference_id)]);
  if (maj == null) return "cote_sans_heure";
  if (maj > nowMs + 60000) return "cote_du_futur";
  if (maj >= tsF * 1000) return "cote_apres_coup_envoi";
  const m = marge1n2(e, c.bookmaker_reference_id);
  if (!m) return "sans_1n2_bet365";
  if (m.marge < 0 || m.marge > c.marge_1n2_max || m.min <= 1.01) return "cotes_aberrantes";
  return null;
}

// Pinnacle seulement si sa cote est lue avant maintenant ET avant le coup d'envoi ; sinon retire (jamais un controle
// fait avec une donnee du futur).
function bookmakersUtilisables(e, fx, nowMs, c) {
  const ko = Number(fx.fixture.timestamp) * 1000;
  return (e.bookmakers || []).filter(function (b) {
    const id = Number(b.id);
    if (id === c.bookmaker_reference_id) return true;
    if (id !== c.bookmaker_controle_id) return false;
    const maj = msDe(e.maj[String(id)]);
    return maj != null && maj <= nowMs + 60000 && maj < ko;
  });
}

// --------------------------------------------------------------------------- pari
// Match de selections nationales (competition « World » de selections) : le site n'y publie que 1N2 et double chance.
function estSelectionNationale(league, c) {
  return !!(c.selections_motif && league && String(league.country || "") === "World" && c.selections_motif.test(String(league.name || "")));
}
function matchDuSite(fx) {
  const t = fx.teams || {};
  const h = t.home || {}, a = t.away || {};
  return {
    id: Number(fx.fixture.id),
    league_key: "pl-" + Number(fx.league && fx.league.id),
    home_team: h.name || "", away_team: a.name || "",
    home: { n: h.name || "", id: h.id }, away: { n: a.name || "", id: a.id },
  };
}

// Contexte de choix commun a tous les matchs du lancement (regle du jour du site). Couverture VIDE : seulement les
// marches regles par le score et le statut (lib/flux-paris.js : « statistiques non fournies pour la competition »).
function contexteChoix(configLigues, marchesPari) {
  const base = PRONOSTIC.contexteParis({ configLigues: configLigues, marchesPari: marchesPari });
  if (!base.regleFlux) throw new Error("config/marches-pari.json#choix_du_pari.regle n'est pas « tous_marches_bet365 » : chemin leger refuse.");
  return base;
}

// Code « F<bet>:<valeur> » de l'issue choisie (pour la regler et suivre sa cote, meme quand le site lui donne un nom).
function codeDuChoix(raw, m, regle, marketId) {
  const sels = FP.selectionsDuMatch(raw, { match: m, couverture: new Set(), regle: regle }).selections;
  const s = sels.find((x) => (MP.idDuFlux({ 50: 5, 72: 6 }[x.bet_id] || x.bet_id, x.value) || x.code) === marketId);
  return s || null;
}

// -> { pari, sans_pari } (l'un des deux est null).
function choisirPari(e, fx, nowMs, c, base) {
  let bks = bookmakersUtilisables(e, fx, nowMs, c);
  const selection = estSelectionNationale(fx.league, c);
  if (selection) bks = bks.map((b) => Object.assign({}, b, { bets: (b.bets || []).filter((x) => c.selections_bets.indexOf(Number(x.id)) !== -1) }));
  const raw = { bookmakers: bks };
  const m = matchDuSite(fx);
  const ctx = Object.assign({}, base, { fluxPar: { [String(m.id)]: { raw: raw } }, couverture: () => new Set() });
  const info = {};
  const p = PRONOSTIC.choisirPariFourchette(m, ctx, info);
  if (!p) return { pari: null, sans_pari: info.candidats ? "AUCUN_PARI_SIMPLE_DANS_LA_FOURCHETTE" : "AUCUN_MARCHE_CANDIDAT" };
  const s = codeDuChoix(raw, m, base.regleFlux, p.market_id);
  if (!s) return { pari: null, sans_pari: "CODE_INTROUVABLE" };
  const pin = raw.bookmakers.some((b) => Number(b.id) === c.bookmaker_controle_id);
  return {
    sans_pari: null,
    pari: {
      market_id: p.market_id, code: s.code, bet_id: s.bet_id, valeur: s.value,
      libelle: p.libelle || PRONOSTIC.libelleFr(p.market_id, m) || s.libelle || null,
      famille: p.famille || null,
      cote: p.cote, bookmaker: "Bet365",
      chance: p.chance_affichee, chance_sans_marge: Math.round(p.q * 10) / 10,
      fiabilite: FIABILITE,
      candidats: info.candidats || 0,
      controle_pinnacle: pin,
      selection_nationale: selection,
      cote_maj_bookmaker: e.maj[String(c.bookmaker_reference_id)] || null,
      pinnacle_maj_bookmaker: pin ? e.maj[String(c.bookmaker_controle_id)] || null : null,
    },
  };
}

// Cote Bet365 actuelle de l'issue d'un code (suivi jusqu'a la cloture). null si l'issue n'est plus cotee.
function coteDuCode(e, code, c) {
  const s = FP.lireCode(code);
  if (!s) return null;
  const v = cotesBet(e, c.bookmaker_reference_id, s.bet_id);
  const x = v && v.find((y) => String(y.value).trim() === String(s.value).trim());
  const k = x ? nombre(x.odd) : null;
  return k && k > 1 ? Math.round(k * 100) / 100 : null;
}

// --------------------------------------------------------------------------- archive (gel, cloture, reglement)
function jourDe(fx) { return String((fx && fx.fixture && fx.fixture.date) || "").slice(0, 10); }

function nouvelleEntree(fx, nowIso) {
  const t = fx.teams || {};
  return {
    id: Number(fx.fixture.id),
    coup_envoi: fx.fixture.date, coup_envoi_ts: Number(fx.fixture.timestamp),
    ligue: { id: Number(fx.league.id), nom: fx.league.name || "", pays: fx.league.country || "", saison: fx.league.season || null },
    domicile: { id: t.home && t.home.id, nom: (t.home && t.home.name) || "" },
    exterieur: { id: t.away && t.away.id, nom: (t.away && t.away.name) || "" },
    fiabilite: FIABILITE, chemin: CHEMIN,
    vu_le: nowIso,
    pari: null, sans_pari: null, cloture: null, resultat: null,
  };
}

// UN LANCEMENT. archives : { "<jour>": { matchs: { "<id>": entree } } } (modifie en place).
// fixtures : elements /fixtures des jours lus ; items : elements /odds (Bet365 et Pinnacle) ; nowMs : heure du lancement.
// -> compteurs (ce que le resume affiche).
function lancer(archives, fixtures, items, nowMs, opts) {
  const c = lireConfig(opts.config);
  const exclues = competitionsExclues(opts.configLigues);
  const base = opts.contexte || contexteChoix(opts.configLigues, opts.marchesPari);
  const nowIso = iso(nowMs);
  const fxPar = new Map();
  let doublonsProgramme = 0;
  (fixtures || []).forEach((f) => { const id = Number(f && f.fixture && f.fixture.id); if (!Number.isInteger(id)) return; if (fxPar.has(id)) doublonsProgramme++; fxPar.set(id, f); });
  const { cotes, doublons } = indexerCotes(items);
  const n = { cotes_bet365: 0, exclus: {}, controles: {}, nouveaux_paris: 0, paris_figes_gardes: 0, sans_pari: {}, clotures_suivies: 0, doublons_cotes: doublons, doublons_programme: doublonsProgramme };
  const plus = (o, k) => { o[k] = (o[k] || 0) + 1; };
  cotes.forEach(function (e, id) {
    if (!e.bookmakers.some((b) => Number(b.id) === c.bookmaker_reference_id)) return;
    n.cotes_bet365++;
    const fx = fxPar.get(id);
    const ex = motifExclusion((fx && fx.league) || e.league, c, exclues);
    if (ex) { plus(n.exclus, ex); return; }
    const jour = fx ? jourDe(fx) : null;
    const arch = jour ? (archives[jour] = archives[jour] || { matchs: {} }) : null;
    const deja = arch ? arch.matchs[String(id)] : null;
    // Suivi de cloture d'un pari fige : seulement avant le coup d'envoi, cote lue avant le coup d'envoi.
    if (deja && deja.pari) {
      n.paris_figes_gardes++;
      const ko = deja.coup_envoi_ts * 1000;
      const maj = msDe(e.maj[String(c.bookmaker_reference_id)]);
      if (nowMs < ko && maj != null && maj < ko && maj <= nowMs + 60000) {
        const k = coteDuCode(e, deja.pari.code, c);
        if (k) { deja.cloture = { cote: k, cote_maj_bookmaker: e.maj[String(c.bookmaker_reference_id)], cote_lue_a: nowIso, minutes_avant_coup_envoi: Math.round((ko - nowMs) / 60000) }; n.clotures_suivies++; }
      }
      return;
    }
    const q = controler(e, fx, nowMs, c);
    if (q) { plus(n.controles, q); return; }
    const r = choisirPari(e, fx, nowMs, c, base);
    const ent = deja || nouvelleEntree(fx, nowIso);
    arch.matchs[String(id)] = ent;
    if (r.pari) {
      ent.pari = Object.assign(r.pari, { cote_lue_a: nowIso, fige_a: nowIso, regle_version: c.regle_version, regle_site: base.marchesPari && base.marchesPari.regle_version || null });
      ent.sans_pari = null;
      ent.cloture = { cote: r.pari.cote, cote_maj_bookmaker: r.pari.cote_maj_bookmaker, cote_lue_a: nowIso, minutes_avant_coup_envoi: Math.round((ent.coup_envoi_ts * 1000 - nowMs) / 60000) };
      n.nouveaux_paris++;
    } else {
      ent.sans_pari = r.sans_pari; ent.sans_pari_a = nowIso;
      plus(n.sans_pari, r.sans_pari);
    }
  });
  return n;
}

// REGLEMENT (score lu seulement pour un pari deja fige, apres le coup d'envoi + reglement_apres_minutes).
function regler(archives, fixtures, nowMs, cfg) {
  const c = lireConfig(cfg);
  const fxPar = new Map();
  (fixtures || []).forEach((f) => { const id = Number(f && f.fixture && f.fixture.id); if (Number.isInteger(id)) fxPar.set(id, f); });
  const n = { regles: 0, en_attente: 0 };
  Object.keys(archives).forEach(function (jour) {
    Object.values(archives[jour].matchs || {}).forEach(function (ent) {
      if (!ent.pari || (ent.resultat && ent.resultat.issue !== "inconnu")) return;
      if (nowMs < ent.coup_envoi_ts * 1000 + c.reglement_apres_minutes * 60000) return;
      const fx = fxPar.get(Number(ent.id));
      if (!fx) { n.en_attente++; return; }
      const st = fx.fixture && fx.fixture.status ? fx.fixture.status.short : null;
      let issue = null;
      if (STATUTS_ANNULES.indexOf(st) !== -1) issue = "annule";
      else if (STATUTS_FINIS.indexOf(st) !== -1) {
        const r = FP.regler(ent.pari.code, FP.faitsDuMatch({ fixture: fx }));
        issue = r === true ? "gagne" : r === false ? "perdu" : r === "rembourse" ? "rembourse" : "inconnu";
      } else { n.en_attente++; return; }
      const s = fx.score || {};
      ent.resultat = { issue: issue, statut: st, score_90: s.fulltime || null, score_mt: s.halftime || null, regle_a: iso(nowMs) };
      n.regles++;
    });
  });
  return n;
}

// Jours dont un pari attend encore son reglement (pour ne lire que ces programmes-la).
function joursEnAttente(archives, nowMs, cfg) {
  const c = lireConfig(cfg);
  return Object.keys(archives).filter((j) => Object.values(archives[j].matchs || {}).some((e) => e.pari && (!e.resultat || e.resultat.issue === "inconnu") && nowMs >= e.coup_envoi_ts * 1000 + c.reglement_apres_minutes * 60000)).sort();
}

// RESUME (pour le mathematicien) : volumes, reussite, chance annoncee contre taux reel, ecart a la cloture.
function resumer(archives) {
  const r = { matchs: 0, avec_pari: 0, sans_pari: {}, regles: 0, gagnes: 0, perdus: 0, rembourses: 0, annules: 0, inconnus: 0, chance_annoncee_moyenne: null, taux_reel: null, cote_moyenne: null, ecart_cloture_moyen_pct: null, par_pays: {} };
  let sc = 0, sk = 0, nk = 0, se = 0, ne = 0;
  Object.values(archives).forEach((a) => Object.values(a.matchs || {}).forEach(function (e) {
    r.matchs++;
    if (!e.pari) { if (e.sans_pari) r.sans_pari[e.sans_pari] = (r.sans_pari[e.sans_pari] || 0) + 1; return; }
    r.avec_pari++;
    const p = (r.par_pays[e.ligue.pays] = r.par_pays[e.ligue.pays] || { paris: 0, gagnes: 0, perdus: 0 });
    p.paris++;
    if (e.cloture && e.cloture.cote > 1) { se += e.pari.cote / e.cloture.cote - 1; ne++; }
    const i = e.resultat && e.resultat.issue;
    if (i === "gagne" || i === "perdu") {
      r.regles++; sc += e.pari.chance; sk += e.pari.cote; nk++;
      if (i === "gagne") { r.gagnes++; p.gagnes++; } else { r.perdus++; p.perdus++; }
    } else if (i === "rembourse") r.rembourses++;
    else if (i === "annule") r.annules++;
    else if (i === "inconnu") r.inconnus++;
  }));
  if (nk) { r.chance_annoncee_moyenne = Math.round(sc / nk * 10) / 10; r.taux_reel = Math.round(r.gagnes / nk * 1000) / 10; r.cote_moyenne = Math.round(sk / nk * 100) / 100; }
  if (ne) r.ecart_cloture_moyen_pct = Math.round(se / ne * 1000) / 10;
  return r;
}

module.exports = { FIABILITE, CHEMIN, lireConfig, competitionsExclues, estSelectionNationale, motifExclusion, indexerCotes, marge1n2, controler, bookmakersUtilisables, matchDuSite, contexteChoix, choisirPari, coteDuCode, lancer, regler, joursEnAttente, resumer, jourDe };
