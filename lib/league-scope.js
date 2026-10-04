(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkLeagueScope = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  // PERIMETRE DES COMPETITIONS (30/09/2026, V3 « machine » : beaucoup de
  // championnats analyses, seul le VIP filtre). Logique PURE, lue par le
  // pipeline (.github/workflows/update-data.yml) et les collecteurs de cotes.
  // Tout vient de config/leagues.json : ajouter une competition = ajouter une
  // ligne dans ce fichier, rien d'autre (voir config/leagues.json#_readme).
  //
  // 1. Fiabilite : « validee » seulement si la cle est dans
  //    config/leagues.json#fiabilite.ligues_validees (liste tenue par le
  //    mathematicien). Toute autre competition de la config est « en_test » :
  //    pas de frequence « Sur 100 matchs », aucun ecart face a la cote, jamais
  //    dans le VIP. Une competition absente de la config (Coupe du monde, id 1,
  //    collectee a part) : null, comportement inchange.
  // 2. Groupe : « socle » (les competitions deja suivies avant le 30/09/2026,
  //    toujours analysees, dans leur ordre d'origine) ou « extension » (tout le
  //    reste, y compris une ligne ajoutee sans ce champ). L'extension passe
  //    APRES le socle, du plus proche coup d'envoi au plus lointain, avec un
  //    plafond de matchs par execution et une limite de temps
  //    (config/leagues.json#budgetExtension) : la mise a jour quotidienne ne
  //    peut ni depasser le quota API-Football ni la duree maximale d'un job
  //    GitHub (6 h), et le socle n'est jamais retarde ni coupe.
  // 3. Tours exclus : excludeRounds (expression reguliere sur league.round
  //    d'API-Football) ecarte les tours a clubs amateurs sans donnees
  //    exploitables (tours preliminaires de la FA Cup, etc.).

  var VALIDEE = "validee";
  var EN_TEST = "en_test";
  var SOCLE = "socle";
  var EXTENSION = "extension";
  var BUDGET_DEFAUT = { maxMatchsParRun: 80, minutesMaxDepuisDebut: 210 };

  function leagues(cfg) {
    if (Array.isArray(cfg)) return cfg.filter(function (l) { return l && l.key; });
    return cfg && Array.isArray(cfg.leagues) ? cfg.leagues.filter(function (l) { return l && l.key; }) : [];
  }
  // Competition par identifiant API-Football (nombre ou texte) OU par cle interne.
  function find(cfg, idOrKey) {
    if (idOrKey === null || idOrKey === undefined || idOrKey === "") return null;
    var s = String(idOrKey);
    var list = leagues(cfg);
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === s || String(list[i].apiFootballId) === s) return list[i];
    }
    return null;
  }
  function validatedKeys(cfg) {
    var f = cfg && !Array.isArray(cfg) && cfg.fiabilite;
    return f && Array.isArray(f.ligues_validees) ? f.ligues_validees.map(String) : [];
  }
  // "validee" | "en_test" | null (competition hors config).
  function reliabilityFor(cfg, idOrKey) {
    var l = find(cfg, idOrKey);
    if (!l) return null;
    return validatedKeys(cfg).indexOf(l.key) !== -1 ? VALIDEE : EN_TEST;
  }
  function isInTest(cfg, idOrKey) { return reliabilityFor(cfg, idOrKey) === EN_TEST; }
  // VIP (Canal Pro, selections « eligible VIP ») : competitions validees seulement.
  function isVipEligible(cfg, idOrKey) { return reliabilityFor(cfg, idOrKey) === VALIDEE; }
  function vipLeagues(cfg) {
    var keys = validatedKeys(cfg);
    return leagues(cfg).filter(function (l) { return keys.indexOf(l.key) !== -1; })
      .map(function (l) { return { key: l.key, apiFootballId: l.apiFootballId, displayName: l.displayName }; });
  }
  // "socle" | "extension". Hors config (Coupe du monde, collectee a part) : socle.
  function groupFor(cfg, idOrKey) {
    var l = find(cfg, idOrKey);
    if (!l) return SOCLE;
    return l.groupe === SOCLE ? SOCLE : EXTENSION;
  }
  function budget(cfg) {
    var b = cfg && !Array.isArray(cfg) && cfg.budgetExtension ? cfg.budgetExtension : {};
    var n = Number(b.maxMatchsParRun), m = Number(b.minutesMaxDepuisDebut);
    return {
      maxMatchsParRun: Number.isFinite(n) && n >= 0 ? Math.floor(n) : BUDGET_DEFAUT.maxMatchsParRun,
      minutesMaxDepuisDebut: Number.isFinite(m) && m >= 0 ? m : BUDGET_DEFAUT.minutesMaxDepuisDebut,
    };
  }
  // Fixture API-Football ({fixture, league, teams}) d'un tour exclu ?
  function roundExcluded(cfg, fx) {
    var lid = fx && fx.league ? fx.league.id : null;
    var l = find(cfg, lid);
    if (!l || !l.excludeRounds) return false;
    try { return new RegExp(l.excludeRounds, "i").test(String((fx.league && fx.league.round) || "")); }
    catch (e) { return false; }
  }
  function kickoffMs(fx) {
    var t = fx && fx.fixture ? Number(fx.fixture.timestamp) : NaN;
    if (Number.isFinite(t) && t > 0) return t * 1000;
    var d = fx && fx.fixture ? Date.parse(fx.fixture.date) : NaN;
    return Number.isFinite(d) ? d : Infinity;
  }
  // Ordre et perimetre des fixtures d'une execution. Le socle garde EXACTEMENT
  // son ordre et son contenu ; l'extension suit, sans ses tours exclus, du plus
  // proche coup d'envoi au plus lointain, limitee a maxMatchsParRun. Un match de
  // l'extension deja publie au run precedent (opts.dejaPublies : ids) passe
  // devant : une analyse en ligne ne disparait pas a cause du plafond.
  function planFixtures(cfg, fixtures, opts) {
    var socle = [], ext = [], excluded = 0;
    var deja = {};
    ((opts && opts.dejaPublies) || []).forEach(function (id) { deja[String(id)] = true; });
    (Array.isArray(fixtures) ? fixtures : []).forEach(function (fx, i) {
      var lid = fx && fx.league ? fx.league.id : null;
      if (groupFor(cfg, lid) === SOCLE) { socle.push(fx); return; }
      if (roundExcluded(cfg, fx)) { excluded++; return; }
      var id = fx && fx.fixture ? String(fx.fixture.id) : "";
      ext.push({ fx: fx, i: i, t: kickoffMs(fx), d: deja[id] ? 0 : 1 });
    });
    ext.sort(function (a, b) { return a.d - b.d || a.t - b.t || a.i - b.i; });
    var max = budget(cfg).maxMatchsParRun;
    var kept = ext.slice(0, max).map(function (x) { return x.fx; });
    return {
      fixtures: socle.concat(kept),
      socle: socle.length,
      extension: kept.length,
      extensionOverCap: Math.max(0, ext.length - kept.length),
      roundsExcluded: excluded,
    };
  }
  // Limite de temps : au-dela, plus aucun match de l'extension n'est analyse
  // dans cette execution (le socle, passe avant, n'est jamais concerne).
  function extensionTimeUp(cfg, startMs, nowMs) {
    var s = Number(startMs), n = Number(nowMs);
    if (!Number.isFinite(s) || !Number.isFinite(n)) return false;
    return (n - s) / 60000 > budget(cfg).minutesMaxDepuisDebut;
  }
  // Nom d'une competition dans une langue du site (fr, en, es, es-mx, de, it, pt) :
  // names[locale], puis la langue de base (es-mx -> es), puis displayName.
  function nameFor(cfg, idOrKey, locale) {
    var l = find(cfg, idOrKey);
    if (!l) return null;
    var n = l.names && typeof l.names === "object" ? l.names : null;
    var loc = String(locale || "");
    if (n && n[loc]) return n[loc];
    var base = loc.split("-")[0];
    if (n && n[base]) return n[base];
    return l.displayName;
  }

  return {
    VALIDEE: VALIDEE, EN_TEST: EN_TEST, SOCLE: SOCLE, EXTENSION: EXTENSION, BUDGET_DEFAUT: BUDGET_DEFAUT,
    leagues: leagues, find: find, validatedKeys: validatedKeys, reliabilityFor: reliabilityFor, isInTest: isInTest,
    isVipEligible: isVipEligible, vipLeagues: vipLeagues, groupFor: groupFor, budget: budget,
    roundExcluded: roundExcluded, planFixtures: planFixtures, extensionTimeUp: extensionTimeUp, nameFor: nameFor,
  };
});
