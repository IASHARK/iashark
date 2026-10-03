"use strict";
// UN PRONOSTIC SUR CHAQUE MATCH (plan de Clement, 03/10/2026).
//
//   « On affiche un PRONOSTIC sur chaque match ; la selection Pro (programme Telegram,
//     combine, tickets) en est un sous-ensemble. »
//
// Ce module pose, une fois par le pipeline (.github/workflows/update-data.yml, juste apres
// lib/chance-iashark.js#poserChance), le champ PREMIUM `pronostic` de chaque match analyse
// et l'amorce PUBLIQUE `pronostic_dispo` (vrai / absent : « un pronostic existe », sans le
// donner). Rien n'est modifie d'autre : ni pari_rec, ni market_id, ni les probabilites du
// moteur, ni la regle de la selection.
//
// LE PRONOSTIC d'un match =
//   1. si le match a une SELECTION IASHARK (pari retenu : pari_rec non vide et no_signal
//      different de true ; regle inchangee, plus les selections nationales verifiees de
//      poserSelectionsNationales ci-dessous) : c'est elle, avec SA chance_iashark et SA cote
//      (selection : true). La selection est donc toujours un pronostic (sous-ensemble) ;
//   2. sinon, voie « moteur v3 » (ses championnats) : l'issue la plus probable parmi les
//      marches 1N2 et double chance du v3 « vérifié sur le passé » (match « couverture
//      vérifiée », competition validee) ; chance = celle du Canal Pro pour ce marche
//      (lib/moteur-v3.js#chancesPourCanal : le plus bas entre le v3 et la cote sans marge,
//      lib/chance-iashark.js) -> fiabilite « vérifiée » ;
//   3. sinon, voie « cotes du marche » (competitions de
//      config/leagues.json#fiabilite.ligues_validees_cotes_marche, et pour les selections
//      nationales seulement celles de selections_cotes_marche) : l'issue la plus probable
//      parmi les SEULS marches autorises de la competition (1N2, DC, OU2.5), chance = la cote
//      moyenne des bookmakers, marge retiree par la methode puissance (la meme que le Canal
//      Pro, canal-pro-menu.mjs#sansMargePuissance), arrondie par lib/chance-iashark.js
//      -> fiabilite « vérifiée » ;
//   4. sinon : le 1N2 le plus probable du modele (p1 / pn / p2), arrondi par
//      lib/chance-iashark.js -> fiabilite « en test ».
// Classement : la chance affichee (entier), puis la probabilite brute, puis l'ordre fixe
// des marches (jamais au hasard), parmi les issues dont la cote est >= 1,20 (COTE_MIN). Aucun
// chiffre : pas de pronostic.
//
// Regles (Clement) : aucune mise, aucune esperance, jamais « conseil » ; le mot est
// « Sélection » pour les retenus. Contenu Pro : `pronostic` est dans
// lib/premium-fields.js (retire des fichiers publics hors match offert).

const CHANCE = require("./chance-iashark.js");
const SELECTIONS = require("./selections-nationales.js");

const VERIFIE = "vérifié sur le passé";
const FIABILITE = Object.freeze({ VERIFIEE: "vérifiée", EN_TEST: "en test" });
const VOIE = Object.freeze({ SELECTION: "selection", V3: "v3", COTES_MARCHE: "cotes_marche", MODELE: "modele" });

// Marches du pronostic (ids du site) : 1N2, double chance, plus/moins de 2,5 buts.
const MARCHE = {
  "home-win": { famille: "1N2", marche: "Victoire Domicile", cote: ["c1"], cle_v3: "1N2:1" },
  "draw": { famille: "1N2", marche: "Match nul", cote: ["cn"], cle_v3: "1N2:N" },
  "away-win": { famille: "1N2", marche: "Victoire Exterieur", cote: ["c2"], cle_v3: "1N2:2" },
  "dc-1x": { famille: "DC", marche: "DC 1X", cote: ["cdc1x", "dc1x"], cle_v3: "DC:1N" },
  "dc-x2": { famille: "DC", marche: "DC X2", cote: ["cdc2x", "dc2x"], cle_v3: "DC:N2" },
  "dc-12": { famille: "DC", marche: "DC 12", cote: ["cdc12", "dc12"], cle_v3: "DC:12" },
  "over-25": { famille: "OU2.5", marche: "Over 2.5", cote: ["co25"], cle_v3: "TOTAL:plus2.5" },
  "under-25": { famille: "OU2.5", marche: "Under 2.5", cote: ["cu25"], cle_v3: "TOTAL:moins2.5" },
};
const ORDRE = Object.keys(MARCHE);

function nombre(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function cote(v) { const x = nombre(v); return x !== null && x > 1 ? Math.round(x * 100) / 100 : null; }
function nom(t) { return (t && typeof t.n === "string" && t.n.trim()) || ""; }

// Libelle francais (le site traduit a partir de market_id / marche dans les autres langues).
function libelleFr(id, m) {
  const d = nom(m && m.home) || "Domicile", e = nom(m && m.away) || "Extérieur";
  switch (id) {
    case "home-win": return "Victoire " + d;
    case "draw": return "Match nul";
    case "away-win": return "Victoire " + e;
    case "dc-1x": return d + " ou match nul";
    case "dc-x2": return "Match nul ou " + e;
    case "dc-12": return d + " ou " + e + " (pas de match nul)";
    case "over-25": return "Plus de 2,5 buts";
    case "under-25": return "Moins de 2,5 buts";
    default: return null;
  }
}

function coteDuMarche(m, id) {
  const def = MARCHE[id];
  if (!def || !m) return null;
  for (const k of def.cote) { const c = cote(m[k]); if (c !== null) return c; }
  return null;
}

// Methode puissance : copie de supabase/functions/_shared/canal-pro-menu.mjs#sansMargePuissance
// (tests/pronostic.test.mjs verifie que les deux donnent le meme resultat).
function sansMargePuissance(cotes) {
  if (!Array.isArray(cotes) || !cotes.every(function (o) { return typeof o === "number" && isFinite(o) && o > 1; })) return null;
  const inv = cotes.map(function (o) { return 1 / o; });
  const f = function (k) { return inv.reduce(function (s, x) { return s + Math.pow(x, k); }, 0) - 1; };
  let lo = 0.2, hi = 5;
  if (f(lo) < 0 || f(hi) > 0) return null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  const k = (lo + hi) / 2;
  return inv.map(function (x) { return Math.pow(x, k); });
}

// Competitions de la voie « cotes du marche » : { cle: [familles autorisees] }.
// Une selection nationale n'y entre que si sa cle est dans selections_cotes_marche
// (meme regle que canal-pro-menu.mjs#liguesCotesMarche).
function liguesCotesMarche(configLigues) {
  const fia = (configLigues && configLigues.fiabilite) || {};
  const liste = estObjet(fia.ligues_validees_cotes_marche) ? fia.ligues_validees_cotes_marche : {};
  const selOk = new Set((fia.selections_cotes_marche || []).map(String));
  const out = {};
  ((configLigues && configLigues.leagues) || []).forEach(function (l) {
    const familles = Array.isArray(liste[l.key]) ? liste[l.key] : null;
    if (!familles) return;
    const selection = l.national === true || l.selections === true || l.kind === "nations" || l.kind === "wcq";
    if (selection && !selOk.has(String(l.key))) return;
    out[l.key] = familles.slice();
  });
  return out;
}

// Chances de la voie « cotes du marche » a partir des cotes moyennes publiees sur le match.
// -> { id du site: probabilite sans marge en % } (marches dont les cotes existent).
function sansMargeDesCotes(m) {
  const out = {};
  const a = ["c1", "cn", "c2"].map(function (k) { return cote(m[k]); });
  const qa = a.every(function (x) { return x !== null; }) ? sansMargePuissance(a) : null;
  if (qa) {
    out["home-win"] = qa[0] * 100; out["draw"] = qa[1] * 100; out["away-win"] = qa[2] * 100;
    out["dc-1x"] = (qa[0] + qa[1]) * 100; out["dc-x2"] = (qa[1] + qa[2]) * 100; out["dc-12"] = (qa[0] + qa[2]) * 100;
  }
  const o = [cote(m.co25), cote(m.cu25)];
  const qo = o[0] !== null && o[1] !== null ? sansMargePuissance(o) : null;
  if (qo) { out["over-25"] = qo[0] * 100; out["under-25"] = qo[1] * 100; }
  return out;
}

function classer(cands) {
  return cands.filter(function (c) { return c && c.chance !== null; }).sort(function (a, b) {
    return (b.chance - a.chance) || ((b.brute || 0) - (a.brute || 0)) || (ORDRE.indexOf(a.market_id) - ORDRE.indexOf(b.market_id));
  });
}
// COTE MINIMALE (decision de Clement, 03/10/2026 : « rien sous 1,20 ») : l'issue la plus
// probable DONT la cote connue est >= 1,20 ; sinon la suivante ; si aucune, le 1N2 le plus
// probable de la meme voie (sinon, faute de 1N2 autorise, la plus probable).
// Garde-fou : une issue sous 50 % n'est pas « la plus probable » (ex. Pays-Bas - Serbie, ou la
// premiere issue a 1,20 ou plus etait « nul ou Serbie », 16 %) : on prend alors le 1N2 le plus
// probable, comme quand aucune issue n'atteint 1,20.
const COTE_MIN = 1.20;
const CHANCE_MIN = 50;
function meilleur(cands, m) {
  const tries = classer(cands);
  const avecCote = tries.filter(function (c) { const k = coteDuMarche(m, c.market_id); return k !== null && k >= COTE_MIN; });
  if (avecCote.length && avecCote[0].chance >= CHANCE_MIN) return avecCote[0];
  const n1n2 = tries.filter(function (c) { return MARCHE[c.market_id] && MARCHE[c.market_id].famille === "1N2"; });
  return n1n2[0] || tries[0] || null;
}

// SELECTIONS NATIONALES SUR LE SITE (decision de Clement, 03/10/2026, apres la verification
// VERIF-SELECTIONS.md du 02/10 : 1 684 matchs BetExplorer 2018-2026, cotes de cloture, 1N2 et
// double chance PASSENT ; le robot Pro les utilise deja). Seules les competitions de
// config/leagues.json#fiabilite.selections_cotes_marche (Ligue des nations, eliminatoires du
// Mondial zone Europe) ; amicaux et autres zones : jamais. Remplace, pour ces competitions
// seulement, la decision du 30/09 (« aucun pari publie sur les selections »).
// REGLE (la meme que les selections simples du robot, canal-pro-menu.mjs#choisirSimples et
// MENU.simple) : marches 1N2 et double chance seulement ; chance = cotes moyennes du marche,
// marge retiree par la methode puissance ; parmi les marches dont la cote est dans la
// fourchette 1,40-2,00, le plus probable ; un seul par match. Aucun dans la fourchette : pas
// de selection (le match garde son pronostic).
// PLAFOND PAR JOUR (03/10/2026 : « la Sélection IASHARK est le petit groupe le plus fiable ») :
// le robot garde au plus MENU.simple.max = 3 simples par jour, les plus probables (aucun seuil de
// chance ni d'ecart de marge en plus de la fourchette). Meme plafond ici, par jour de Paris, pour
// ces competitions : les 3 plus hautes chances (a egalite le plus tot, puis le plus petit numero).
// Les selections deja posees ce jour (gel d'un run precedent) comptent dans les 3.
const FOURCHETTE_SELECTION = Object.freeze({ cote_min: 1.40, cote_max: 2.00, max_par_jour: 3 });
const SOURCE_COTES_MARCHE = "cotes du marché, marge retirée";
function clesSelectionsCotes(configLigues) {
  const fia = (configLigues && configLigues.fiabilite) || {};
  const liste = estObjet(fia.ligues_validees_cotes_marche) ? fia.ligues_validees_cotes_marche : {};
  return (fia.selections_cotes_marche || []).map(String).filter(function (k) { return Array.isArray(liste[k]); });
}
function selectionCotesMarche(m, cles) {
  return !!m && Array.isArray(cles) && cles.indexOf(String(m.league_key || "")) !== -1 && SELECTIONS.estSelectionNationale(m);
}
// -> { market_id, marche, chance, probabilite, cote } ou null.
function choixSelectionNationale(m, familles) {
  const q = sansMargeDesCotes(m);
  const cands = ORDRE.filter(function (id) {
    const f = MARCHE[id].famille;
    if ((f !== "1N2" && f !== "DC") || familles.indexOf(f) === -1 || q[id] == null) return false;
    const k = coteDuMarche(m, id);
    return k !== null && k >= FOURCHETTE_SELECTION.cote_min && k <= FOURCHETTE_SELECTION.cote_max;
  }).map(function (id) { const c = CHANCE.chanceIashark(q[id], null); return { market_id: id, chance: c ? c.chance : null, brute: q[id] }; });
  const b = classer(cands)[0];
  return b ? { market_id: b.market_id, marche: MARCHE[b.market_id].marche, chance: b.chance, probabilite: Math.round(b.brute * 10) / 10, cote: coteDuMarche(m, b.market_id) } : null;
}
// Pipeline : pose la selection (pari_rec, market_id, cote_rec, model_probability, chance) des
// matchs de selections verifiees qui n'en ont pas encore, sur le match ET sa ligne premium
// (colonnes lues par la fonction match-data). Un match ferme ou deja pourvu (gel) : intouche.
// -> nombre de selections posees.
function poserSelectionsNationales(matchs, premiumRows, opts) {
  opts = opts || {};
  const cles = clesSelectionsCotes(opts.configLigues);
  const ligues = opts.ligues || liguesCotesMarche(opts.configLigues);
  const jourDe = function (m) { return String((m && m.date) || "").slice(0, 10); };
  const pris = {};
  (matchs || []).forEach(function (m) {
    if (m && typeof m === "object" && aUneSelection(m) && selectionCotesMarche(m, cles)) pris[jourDe(m)] = (pris[jourDe(m)] || 0) + 1;
  });
  const cands = [];
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object" || estFerme(m) || aUneSelection(m) || !selectionCotesMarche(m, cles)) return;
    const familles = Array.isArray(ligues[String(m.league_key)]) ? ligues[String(m.league_key)] : [];
    const c = choixSelectionNationale(m, familles);
    if (c) cands.push({ m: m, c: c });
  });
  cands.sort(function (a, b) {
    return (b.c.chance - a.c.chance) || (b.c.probabilite - a.c.probabilite) || String(a.m.date || "").localeCompare(String(b.m.date || "")) || (Number(a.m.id) - Number(b.m.id));
  });
  let n = 0;
  cands.forEach(function (x) {
    const m = x.m, c = x.c, j = jourDe(m);
    if ((pris[j] || 0) >= FOURCHETTE_SELECTION.max_par_jour) return;
    pris[j] = (pris[j] || 0) + 1;
    m.pari_rec = c.marche;
    m.market_id = c.market_id;
    m.marche = c.marche;
    m.cote_rec = c.cote.toFixed(2);
    m.cote_source = "indicative";
    m.model_probability = c.probabilite;
    m.conf = Math.round(c.probabilite) / 10;
    m.chance_iashark = c.chance;
    m.chance_iashark_source = SOURCE_COTES_MARCHE;
    m.model_output_available = true;
    m.no_signal = false;
    m.no_signal_label = "";
    delete m.no_signal_reason;
    m.selection_voie = "cotes_marche";
    const row = (premiumRows || []).find(function (r) { return r && String(r.fixture_id) === String(m.id); });
    if (row) { row.pari_rec = m.pari_rec; row.market_id = m.market_id; row.marche = m.marche; row.cote_rec = m.cote_rec; row.model_probability = m.model_probability; }
    n++;
  });
  return n;
}

function aUneSelection(m) {
  return !!(m && String(m.pari_rec || "").trim() && m.no_signal !== true);
}
// Match ferme (coup d'envoi passe, reporte, plus a venir) : aucun pronostic.
function estFerme(m) {
  return /^(KICKOFF_|FIXTURE_NOT_UPCOMING)/.test(String((m && m.no_signal_reason) || ""));
}

// m : match COMPLET (avant retrait des champs premium), apres poserChance.
// ctx : { chancesV3: { "<cle v3>": chance % } du match (lib/moteur-v3.js#chancesPourCanal) ou null,
//         ligues: liguesCotesMarche(config) }.
// -> le pronostic, ou null.
function choisirPronostic(m, ctx) {
  ctx = ctx || {};
  if (!m || typeof m !== "object" || estFerme(m)) return null;
  const leagueKey = String(m.league_key || "");
  const ligueVerifiee = m.league_reliability !== "en_test";

  // 1. La selection (regle inchangee). Cote connue sous 1,20 (« rien sous 1,20 », Clement) :
  // le pari reste affiche comme pronostic, mais ce n'est JAMAIS une « Sélection IASHARK »
  // (ni pastille, ni match offert).
  if (aUneSelection(m)) {
    const chance = CHANCE.chanceDuPari(m);
    if (chance === null) return null;
    const coteSel = cote(m.cote_rec);
    const selectionnable = coteSel === null || coteSel >= COTE_MIN;
    const v3 = !!(m.v3_pari && m.moteur_v3 && m.moteur_v3.source === "v3");
    const id = m.market_id != null && m.market_id !== "" ? String(m.market_id) : null;
    return {
      market_id: id, marche: String(m.pari_rec), libelle_fr: (id && libelleFr(id, m)) || String(m.pari_rec),
      chance: chance, cote: cote(m.cote_rec), voie: VOIE.SELECTION, moteur: v3 ? "v3" : (selectionCotesMarche(m, ctx.selectionsCotes) ? "cotes_marche" : "ancien"),
      fiabilite: ligueVerifiee || selectionCotesMarche(m, ctx.selectionsCotes) ? FIABILITE.VERIFIEE : FIABILITE.EN_TEST, selection: selectionnable,
      source: m.chance_iashark_source || null,
    };
  }

  // 2. Voie moteur v3 : 1N2 / double chance verifies.
  const f3 = estObjet(m.v3_fiabilite) ? m.v3_fiabilite : null;
  if (ctx.chancesV3 && f3 && f3.couverture === "vérifiée" && ligueVerifiee && Array.isArray(m.v3_marches) && !SELECTIONS.estSelectionNationale(m)) {
    const verifies = {};
    m.v3_marches.forEach(function (mk) { if (mk && mk.fiabilite_marche === VERIFIE && mk.etiquette === VERIFIE && mk.market_id) verifies[mk.market_id] = nombre(mk.probabilite); });
    const cands = ORDRE.filter(function (id) { return MARCHE[id].famille !== "OU2.5" && verifies[id] != null; }).map(function (id) {
      const ch = nombre(ctx.chancesV3[MARCHE[id].cle_v3]);
      return { market_id: id, chance: ch !== null && ch > 0 && ch < 100 ? Math.round(ch) : null, brute: verifies[id] };
    });
    const b = meilleur(cands, m);
    if (b) return sortie(m, b, VOIE.V3, FIABILITE.VERIFIEE, CHANCE.SOURCE_AVEC_COTE);
  }

  // 3. Voie cotes du marche : competitions verifiees, marches autorises seulement.
  const familles = ctx.ligues && Array.isArray(ctx.ligues[leagueKey]) ? ctx.ligues[leagueKey] : null;
  if (familles) {
    const q = sansMargeDesCotes(m);
    const cands = ORDRE.filter(function (id) { return familles.indexOf(MARCHE[id].famille) !== -1 && q[id] != null; }).map(function (id) {
      const c = CHANCE.chanceIashark(q[id], null);
      return { market_id: id, chance: c ? c.chance : null, brute: q[id] };
    });
    const b = meilleur(cands, m);
    if (b) return sortie(m, b, VOIE.COTES_MARCHE, FIABILITE.VERIFIEE, "cotes du marché, marge retirée");
  }

  // 4. Le 1N2 le plus probable du modele : « en test ».
  const p = { "home-win": nombre(m.p1), "draw": nombre(m.pn), "away-win": nombre(m.p2) };
  const cands = Object.keys(p).filter(function (id) { return p[id] !== null; }).map(function (id) {
    const c = CHANCE.chanceIashark(p[id], null);
    return { market_id: id, chance: c ? c.chance : null, brute: p[id] };
  });
  const b = meilleur(cands, m);
  return b ? sortie(m, b, VOIE.MODELE, FIABILITE.EN_TEST, CHANCE.SOURCE_MODELE) : null;
}

function sortie(m, b, voie, fiabilite, source) {
  return {
    market_id: b.market_id, marche: MARCHE[b.market_id].marche, libelle_fr: libelleFr(b.market_id, m),
    chance: b.chance, cote: coteDuMarche(m, b.market_id), voie: voie,
    fiabilite: fiabilite, selection: false, source: source,
  };
}

// Pipeline : pose `pronostic` (premium) et `pronostic_dispo` (public) sur chaque match.
// chancesV3Par : sortie de lib/moteur-v3.js#chancesPourCanal ({ "<fixture>": { marches } }) ou null.
// -> { avec, sans, selections, voies: { v3, cotes_marche, modele, selection } } (compteurs, jamais un pari).
function poserPronostics(matchs, opts) {
  opts = opts || {};
  const ligues = opts.ligues || liguesCotesMarche(opts.configLigues);
  const cles = opts.selectionsCotes || clesSelectionsCotes(opts.configLigues);
  const parFixture = opts.chancesV3Par || {};
  const rapport = { avec: 0, sans: 0, selections: 0, voies: { selection: 0, v3: 0, cotes_marche: 0, modele: 0 } };
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object") return;
    const c3 = parFixture[String(m.id)];
    const p = choisirPronostic(m, { ligues: ligues, selectionsCotes: cles, chancesV3: c3 && estObjet(c3.marches) ? c3.marches : null });
    // Amorces PUBLIQUES (aucun chiffre, aucun marche) : selection_iashark (pastille
    // « ✓ Sélection IASHARK ») et fiabilite_cotes_marche (competition verifiee par la route des
    // cotes du marche, sans pari d'un autre calcul : la page ne dit plus « Fiabilité : en test »).
    delete m.selection_iashark; delete m.fiabilite_cotes_marche;
    if (Array.isArray(ligues[String(m.league_key || "")]) && (!aUneSelection(m) || m.selection_voie === "cotes_marche" || selectionCotesMarche(m, cles)) && (!p || p.voie === VOIE.COTES_MARCHE || p.moteur === "cotes_marche")) m.fiabilite_cotes_marche = true;
    if (!p) { delete m.pronostic; delete m.pronostic_dispo; rapport.sans++; return; }
    m.pronostic = p;
    m.pronostic_dispo = true;
    if (p.selection === true) m.selection_iashark = true;
    rapport.avec++;
    rapport.voies[p.voie]++;
    if (p.selection) rapport.selections++;
  });
  return rapport;
}

module.exports = {
  FIABILITE: FIABILITE,
  VOIE: VOIE,
  MARCHE: MARCHE,
  libelleFr: libelleFr,
  sansMargePuissance: sansMargePuissance,
  sansMargeDesCotes: sansMargeDesCotes,
  liguesCotesMarche: liguesCotesMarche,
  choisirPronostic: choisirPronostic,
  poserPronostics: poserPronostics,
  aUneSelection: aUneSelection,
  COTE_MIN: COTE_MIN,
  FOURCHETTE_SELECTION: FOURCHETTE_SELECTION,
  clesSelectionsCotes: clesSelectionsCotes,
  selectionCotesMarche: selectionCotesMarche,
  poserSelectionsNationales: poserSelectionsNationales,
};
