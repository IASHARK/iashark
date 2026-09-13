// IASHARK — traduction des textes editoriaux du pipeline (fr -> en, es,
// es-mx, de, it, pt).
//
// Le pipeline (.github/workflows/update-data.yml#genAnalyse) redige en
// francais les textes qui EXPLIQUENT une decision deja prise par du code
// deterministe (verdict_shark, analyse_card, conseil, contexte, facteur_x,
// scenario, buteurs_probables[].raison). Ce module prepare UN appel de
// traduction par match qui renvoie toutes les langues d'un coup, puis
// VALIDE strictement la reponse : une traduction absente, illisible, trop
// longue, recopiee du francais, qui ajoute un chiffre absent de la source
// ou qui pousse a parier est REJETEE et reste absente. Jamais de repli sur
// le francais, jamais de texte fabrique.
//
// Protection premium : facteur_x et verdict_shark sont des champs premium
// (jamais dans data.json, uniquement dans match_premium_data). Leurs
// traductions suivent le meme chemin (premium.*), jamais les champs publics.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IasharkNarrativeI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SOURCE_LOCALE = 'fr';
  const TARGET_LOCALES = ['en', 'es', 'es-mx', 'de', 'it', 'pt'];
  const ALL_LOCALES = [SOURCE_LOCALE].concat(TARGET_LOCALES);
  const STRING_FIELDS = ['verdict_shark', 'analyse_card', 'conseil', 'contexte', 'facteur_x'];
  const SCENARIO_PHASES = ['phase1', 'phase2', 'phase3'];
  // Noms des jumeaux _i18n, par niveau de protection. Les deux listes ne
  // doivent JAMAIS se recouper (verifie par les tests).
  const PUBLIC_I18N_FIELDS = ['analyse_card_i18n', 'conseil_public_i18n', 'contexte_i18n', 'scenario_i18n'];
  const PREMIUM_I18N_FIELDS = ['facteur_x_i18n', 'verdict_shark_i18n'];
  // Modele de traduction par defaut : le moins cher qui tient la qualite
  // pour une traduction fidele de textes courts (voir rapport de cout).
  const DEFAULT_TRANSLATION_MODEL = 'claude-haiku-4-5';
  const DEFAULT_MAX_TOKENS = 12000;

  const txt = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

  // ---------------------------------------------------------------------
  // Source : uniquement les textes francais reellement produits.
  // ---------------------------------------------------------------------
  function extractTranslationSource(an) {
    if (!isPlainObject(an)) return null;
    const src = {};
    STRING_FIELDS.forEach(f => { const v = txt(an[f]); if (v) src[f] = v; });
    if (isPlainObject(an.scenario)) {
      const sc = {};
      SCENARIO_PHASES.forEach(p => { const v = txt(an.scenario[p]); if (v) sc[p] = v; });
      if (Object.keys(sc).length) src.scenario = sc;
    }
    if (Array.isArray(an.buteurs_probables)) {
      // joueur conserve TEL QUEL : le pipeline associe la raison au candidat
      // par egalite stricte (b.joueur === p.name).
      const b = an.buteurs_probables
        .filter(x => x && txt(x.joueur) && txt(x.raison))
        .map(x => ({ joueur: x.joueur, raison: x.raison.trim() }));
      if (b.length) src.buteurs_probables = b;
    }
    return Object.keys(src).length ? src : null;
  }

  // ---------------------------------------------------------------------
  // Requete : un seul appel, toutes les langues cibles.
  // ---------------------------------------------------------------------
  const TRANSLATION_SYSTEM_PROMPT = [
    'You translate short football-analysis texts for IASHARK, a football statistics website, from French into several locales.',
    'The French texts only explain a decision already computed by deterministic code. Your translation must carry exactly the same factual content.',
    'Rules:',
    '- Translate faithfully. Do not add, remove or reinterpret any information, opinion, stake or claim.',
    '- Keep every number, percentage, ranking, score, minute range, team name and player name exactly as in the source. Do not convert numbers to words or words to numbers.',
    '- Keep abbreviations unchanged: xG, xGA, ELO, BTTS, 1X2, H2H, DC.',
    '- Keep the neutral, cautious tone. Never promise a win or a guaranteed outcome. Never urge the reader to bet (no "bet now" style call to action), even if a literal translation would sound more persuasive.',
    '- Locale specifics: "en" = British English football vocabulary; "es" = Spanish from Spain ("cuota"); "es-mx" = Mexican Spanish as used by Mexican sports media ("momios" for odds, "partido", "goleador"); "de" = German ("Quote"); "it" = Italian ("quota"); "pt" = European Portuguese (Portugal).',
    'Output format: return ONLY one valid JSON object, no markdown, no backticks, no text before or after.',
    'Its keys are exactly: ' + TARGET_LOCALES.map(l => '"' + l + '"').join(', ') + '.',
    'Each value has exactly the same keys and structure as the source object. In "buteurs_probables", copy "joueur" unchanged and translate only "raison".'
  ].join('\n');

  function buildTranslationRequest(source, opts) {
    opts = opts || {};
    return {
      model: opts.model || DEFAULT_TRANSLATION_MODEL,
      max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
      system: TRANSLATION_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: 'Source (French) JSON:\n' + JSON.stringify(source) + '\n\nReturn the JSON object keyed by ' + TARGET_LOCALES.join(', ') + '.'
      }]
    };
  }

  // ---------------------------------------------------------------------
  // Validation de la reponse.
  // ---------------------------------------------------------------------
  function parseJsonObject(text) {
    if (typeof text !== 'string') return null;
    let cleaned = text.replace(/```json|```/g, '').trim();
    const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    cleaned = cleaned.slice(a, b + 1);
    try {
      const o = JSON.parse(cleaned);
      return isPlainObject(o) ? o : null;
    } catch (e) {
      return null;
    }
  }

  // Nombres : "0,85" / "0.85" / "1,850" / "1 850" (espace insecable, ou
  // espace simple suivi d'exactement 3 chiffres = separateur de milliers).
  // Un jeton est compare sans ses separateurs ("085", "1850") ; un jeton a
  // separateurs est aussi accepte si chacune de ses parties existe dans la
  // source (separateur de milliers anglais vs decimal francais).
  const NUM_RE = /\d+(?:[.,  ]\d+| \d{3}(?!\d))*/g;
  const SEP_RE = /[.,   ]/;
  function numberSets(s) {
    const joined = new Set(), parts = new Set();
    (String(s).match(NUM_RE) || []).forEach(tok => {
      joined.add(tok.replace(/[^\d]/g, ''));
      tok.split(SEP_RE).forEach(p => parts.add(p));
    });
    return { joined, parts };
  }
  function addsNumbers(translation, source) {
    const src = numberSets(source);
    return (String(translation).match(NUM_RE) || []).some(tok => {
      if (src.joined.has(tok.replace(/[^\d]/g, ''))) return false;
      if (SEP_RE.test(tok) && tok.split(SEP_RE).every(p => src.parts.has(p))) return false;
      return true;
    });
  }

  // Appels a parier / promesses de gain. Les termes de "garantie" ne sont
  // verifies que si la source francaise n'en parle pas elle-meme (ex. "rien
  // n'est garanti" doit pouvoir etre traduit).
  const CALL_TO_BET_RE = /\b(?:bet now|place (?:a|your) bets?|sure win|apuest[ae]n? (?:ya|ahora)|jetzt wetten|scommetti (?:ora|subito)|aposte (?:j[aá]|agora))/i;
  const GUARANTEE_RE = /guarante|garanti[zs]?|garantiert|garantid/i;

  function validateString(value, source, locale, field, errors) {
    const v = txt(value);
    const where = locale + '.' + field;
    if (!v) { errors.push(where + ': absent'); return null; }
    if (v.length > source.length * 3 + 60) { errors.push(where + ': trop long'); return null; }
    if (v === source && source.length > 25) { errors.push(where + ': non traduit'); return null; }
    if (addsNumbers(v, source)) { errors.push(where + ': chiffre absent de la source'); return null; }
    if (CALL_TO_BET_RE.test(v)) { errors.push(where + ': incitation a parier'); return null; }
    if (!GUARANTEE_RE.test(source) && GUARANTEE_RE.test(v)) { errors.push(where + ': promesse de resultat'); return null; }
    return v;
  }

  // Cles tolerees : "es-MX", "es_mx" -> "es-mx" (pure normalisation).
  function localeEntry(parsed, locale) {
    const want = locale.toLowerCase();
    const key = Object.keys(parsed).find(k => k.toLowerCase().replace('_', '-') === want);
    return key !== undefined ? parsed[key] : undefined;
  }

  // Renvoie { translations: {locale: {...}}, errors: [...] }. Une locale
  // n'apparait que si au moins un champ est valide ; un champ invalide reste
  // absent. scenario est tout-ou-rien par locale (une phase manquante
  // changerait le recit).
  function parseTranslationResponse(text, source) {
    const errors = [], translations = {};
    if (!isPlainObject(source)) return { translations, errors: ['source absente'] };
    const parsed = parseJsonObject(text);
    if (!parsed) return { translations, errors: ['JSON illisible'] };
    TARGET_LOCALES.forEach(locale => {
      const entry = localeEntry(parsed, locale);
      if (!isPlainObject(entry)) { errors.push(locale + ': locale absente'); return; }
      const out = {};
      STRING_FIELDS.forEach(f => {
        if (!source[f]) return;
        const v = validateString(entry[f], source[f], locale, f, errors);
        if (v) out[f] = v;
      });
      if (source.scenario) {
        const sc = isPlainObject(entry.scenario) ? entry.scenario : {};
        const phases = {};
        let complet = true;
        Object.keys(source.scenario).forEach(p => {
          const v = validateString(sc[p], source.scenario[p], locale, 'scenario.' + p, errors);
          if (v) phases[p] = v; else complet = false;
        });
        if (complet) out.scenario = phases;
      }
      if (source.buteurs_probables) {
        const list = Array.isArray(entry.buteurs_probables) ? entry.buteurs_probables : [];
        const buteurs = {};
        source.buteurs_probables.forEach(sb => {
          const tb = list.find(x => x && x.joueur === sb.joueur);
          const v = tb ? validateString(tb.raison, sb.raison, locale, 'buteurs_probables[' + sb.joueur + ']', errors) : null;
          if (!tb) errors.push(locale + '.buteurs_probables[' + sb.joueur + ']: absent');
          if (v) buteurs[sb.joueur] = v;
        });
        if (Object.keys(buteurs).length) out.buteurs = buteurs;
      }
      if (Object.keys(out).length) translations[locale] = out;
    });
    return { translations, errors };
  }

  // ---------------------------------------------------------------------
  // Construction des jumeaux _i18n, dans le meme ordre de repli que le
  // pipeline pour le francais (analyse_card = an.analyse_card || an.conseil,
  // conseil_public = an.conseil || an.analyse_card) : la traduction affichee
  // est TOUJOURS celle du texte francais reellement publie dans ce champ.
  // ---------------------------------------------------------------------
  function mapFor(translations, pick) {
    const out = {};
    Object.keys(translations || {}).forEach(locale => {
      if (TARGET_LOCALES.indexOf(locale) === -1) return;
      const v = pick(translations[locale] || {});
      if (v) out[locale] = v;
    });
    return Object.keys(out).length ? out : null;
  }

  function buildNarrativeI18n(an, translations) {
    const result = { public: {}, premium: {}, topScorers: {} };
    if (!isPlainObject(an) || !isPlainObject(translations)) return result;
    const setIf = (bucket, key, value) => { if (value) bucket[key] = value; };
    const analyseSrc = an.analyse_card ? 'analyse_card' : (an.conseil ? 'conseil' : null);
    const conseilSrc = an.conseil ? 'conseil' : (an.analyse_card ? 'analyse_card' : null);
    if (analyseSrc) setIf(result.public, 'analyse_card_i18n', mapFor(translations, t => t[analyseSrc]));
    if (conseilSrc) setIf(result.public, 'conseil_public_i18n', mapFor(translations, t => t[conseilSrc]));
    if (an.contexte) setIf(result.public, 'contexte_i18n', mapFor(translations, t => t.contexte));
    if (isPlainObject(an.scenario)) setIf(result.public, 'scenario_i18n', mapFor(translations, t => t.scenario));
    if (an.facteur_x) setIf(result.premium, 'facteur_x_i18n', mapFor(translations, t => t.facteur_x));
    if (an.verdict_shark) setIf(result.premium, 'verdict_shark_i18n', mapFor(translations, t => t.verdict_shark));
    if (Array.isArray(an.buteurs_probables)) {
      an.buteurs_probables.forEach(b => {
        if (!b || !txt(b.joueur) || !txt(b.raison)) return;
        setIf(result.topScorers, b.joueur, mapFor(translations, t => t.buteurs && t.buteurs[b.joueur]));
      });
    }
    return result;
  }

  // Applique les jumeaux au match public et a la ligne premium.
  //  - matchObj (-> data.json public) : uniquement PUBLIC_I18N_FIELDS et
  //    top_scorers[].analyse_i18n ;
  //  - premiumRow (-> table match_premium_data, service role) : les
  //    traductions premium dans raw_response.narrative_i18n (colonne jsonb
  //    existante, aucune migration requise). L'objet `an` n'est jamais
  //    modifie.
  function applyNarrativeI18n(target, an, translations) {
    const built = buildNarrativeI18n(an, translations);
    const counts = { public: 0, premium: 0, topScorers: 0 };
    if (target && isPlainObject(target.matchObj)) {
      PUBLIC_I18N_FIELDS.forEach(k => {
        if (built.public[k]) { target.matchObj[k] = built.public[k]; counts.public++; }
      });
      if (Array.isArray(target.matchObj.top_scorers)) {
        target.matchObj.top_scorers.forEach(p => {
          if (p && p.analyse && built.topScorers[p.name]) { p.analyse_i18n = built.topScorers[p.name]; counts.topScorers++; }
        });
      }
    }
    if (target && isPlainObject(target.premiumRow) && Object.keys(built.premium).length) {
      const base = isPlainObject(target.premiumRow.raw_response) ? target.premiumRow.raw_response : (isPlainObject(an) ? an : {});
      const premium = {};
      PREMIUM_I18N_FIELDS.forEach(k => { if (built.premium[k]) { premium[k] = built.premium[k]; counts.premium++; } });
      target.premiumRow.raw_response = Object.assign({}, base, { narrative_i18n: premium });
    }
    return counts;
  }

  return {
    SOURCE_LOCALE,
    TARGET_LOCALES,
    ALL_LOCALES,
    PUBLIC_I18N_FIELDS,
    PREMIUM_I18N_FIELDS,
    DEFAULT_TRANSLATION_MODEL,
    TRANSLATION_SYSTEM_PROMPT,
    extractTranslationSource,
    buildTranslationRequest,
    parseJsonObject,
    parseTranslationResponse,
    buildNarrativeI18n,
    applyNarrativeI18n
  };
});
