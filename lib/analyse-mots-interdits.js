"use strict";
// RELECTURE DU TEXTE ECRIT PAR L'IA (2e contre-controle de l'avocat du diable,
// 30/09/2026). La consigne de genAnalyse interdit « sûr », « garanti », « certain »...
// mais une consigne n'est pas une preuve : ce module relit le texte PRODUIT avant
// publication, comme lib/lifecycle-email.js le fait pour les e-mails.
//
// Regle : une phrase qui contient un mot interdit est RETIREE (jamais reecrite :
// on ne met pas de mots dans la bouche du texte). Si un champ n'a plus aucune
// phrase, il reste vide et le site masque le bloc, comme pour un texte absent.
// Les chiffres, le pari et les probabilites ne passent jamais par ici.

// Lettre (toutes langues) : sert de frontiere de mot, \b ne connait pas « û ».
const L = "\\p{L}";
const mot = (corps) => new RegExp("(^|[^" + L + "])(" + corps + ")(?![" + L + "])", "iu");

// Mots interdits dans tous les cas (promesse de resultat). Liste FRANCAISE ; les
// traductions (en, es, es-mx, de, it, pt) ont chacune leur liste :
// lib/narrative-i18n.js#MOTS_PROMESSE_PAR_LANGUE (contre-controle ronde 4).
const TOUJOURS = [
  mot("sûr|sûre|sûrs|sûres|sûrement"),
  // Ronde 4 : variantes SANS accents (« sur » seul reste permis : c'est la preposition).
  mot("sure|sures|surs|surement"),
  mot("sécurisé|sécurisée|sécurisés|sécurisées|securise|securisee|securises|securisees"),
  mot("garanti|garantie|garantis|garanties|garantir|garantit|garantissent"),
  mot("certitude|certitudes"),
  mot("infaillible|infaillibles"),
  mot("safe"),
  /(^|[^\p{L}])(sans\s+(?:aucun\s+)?risques?)(?![\p{L}])/iu,
  // 3e contre-controle de l'avocat du diable (30/09/2026) : « Nantes va certainement
  // gagner. Victoire assurée. » passait. Liste elargie (avec ou sans accents).
  mot("certainement"),
  // « assuré » : interdit (« victoire assurée »), sauf apres un auxiliaire au passe
  // (« Lens a assuré son maintien », « s'est assuré la 3e place ») : un fait, pas une promesse.
  // Sans accent, « assure » / « assures » restent permis : ce sont aussi le verbe
  // (« le gardien assure ses sorties »), impossible a distinguer.
  /(^|[^\p{L}])((?<!(?:^|[^\p{L}])(?:a|ont|avait|avaient|eut|eurent)\s+)(?<!s['’](?:est|était|etait)\s+)(?<!se\s+sont\s+)assur(?:é|ée|és|ées|ee|ees)|assurément|assurement)(?![\p{L}])/iu,
  // Ronde 4 : « à coup sur » (accent sur le à, pas sur le u) passait.
  mot("[aà]\\s+coup\\s+s[uû]r|[aà]\\s+tous\\s+les\\s+coups"),
  mot("imparable|imparables|immanquable|immanquables|immanquablement|inratable|inratables|inévitable|inévitables|inévitablement|inevitable|inevitables|inevitablement"),
  // Ronde 4 : expressions de promesse (rejouees par l'avocat dans le vrai genAnalyse).
  mot("couru(?:e|s|es)?\\s+d['’]\\s*avance"),
  /(^|[^\p{L}])(ne\s+fait\s+(?:pas|guère|guere|plus)\s+(?:de\s+|l['’]ombre\s+d['’]un\s+)doute|ne\s+fait\s+(?:aucun|nul)\s+doute|ne\s+laisse\s+(?:aucun|pas\s+de|guère\s+de|guere\s+de|plus\s+de|place\s+à\s+aucun)\s+doute|hors\s+de\s+(?:tout\s+)?doute|pas\s+(?:de|l['’]ombre\s+d['’]un)\s+doute|sans\s+l['’]ombre\s+d['’]un\s+doute)(?![\p{L}])/iu,
  mot("les\\s+yeux\\s+ferm(?:é|e)s"),
  /(^|[^\p{L}])(ne\s+(?:peut|peuvent|pourra|pourront|saurait|sauraient)\s+(?:pas|plus|jamais)\s+perdre|ne\s+(?:peut|peuvent|pourra|pourront)\s+que\s+(?:gagner|s['’]imposer|l['’]emporter)|impossible\s+(?:de|à|a)\s+perdre)(?![\p{L}])/iu,
  mot("dans\\s+la\\s+poche"),
  /(^|[^\p{L}])((?:c['’]est|c['’]était|c['’]etait|match|affaire|rencontre)\s+(?:déjà\s+|deja\s+)?pli(?:é|e)e?)(?![\p{L}])/iu,
  mot("(?:gagné|gagne|joué|joue)\\s+d['’]?\\s*avance"),
  /(^|[^\p{L}])((?:sans\s+le\s+moindre|aucun|zéro|zero|nul)\s+risques?|risques?\s+(?:zéro|zero|nul))(?![\p{L}])/iu,
  /(^|[^\p{L}])((?:sans\s+aucun|sans\s+le\s+moindre|aucun|nul|zéro|zero)\s+doute)(?![\p{L}])/iu,
  // « forcément » : interdit, sauf « pas forcément » / « non forcément » (une nuance).
  /(^|[^\p{L}])((?<!pas\s)(?<!non\s)forc(?:é|e)ment)(?![\p{L}])/iu,
  // Condition du mathematicien et de l'avocat du diable (30/09/2026) : aucun avantage
  // face au marche n'est prouve (ecart a la cote de cloture : -5,15 %). Jamais les mots
  // « valeur » ni « avantage » (ni « value », « edge ») dans un texte public.
  mot("valeur|valeurs|value|values|value\\s*bets?|edge|avantage|avantages|avantag(?:é|e)(?:e|s|es)?|avantageu(?:x|se|ses)|avantager|avantagent"),
];

// « certain » : interdit au sens de « sûr » (« une victoire certaine », « c'est
// certain »), permis comme determinant (« un certain temps », « certains joueurs »).
const CERTAIN_SINGULIER = /(^|[^\p{L}])(certaine?)(?![\p{L}])/giu;
const DETERMINANT_AVANT = /(?:^|[^\p{L}])(?:un|une|d['’]un|d['’]une)\s+$/iu;
const CERTAINS_ATTRIBUT = /(^|[^\p{L}])((?:sont|semblent|paraissent|seraient|restent)\s+(?:(?:quasi|quasiment|presque|pratiquement)[\s-]+)?certaine?s)(?![\p{L}])/iu;

// -> le mot interdit trouve dans la phrase, ou null.
function motInterdit(phrase) {
  const s = String(phrase == null ? "" : phrase);
  for (const re of TOUJOURS) {
    const m = s.match(re);
    if (m) return m[2];
  }
  CERTAIN_SINGULIER.lastIndex = 0;
  let m;
  while ((m = CERTAIN_SINGULIER.exec(s)) !== null) {
    const avant = s.slice(0, m.index + m[1].length);
    if (!DETERMINANT_AVANT.test(avant)) return m[2];
  }
  const p = s.match(CERTAINS_ATTRIBUT);
  return p ? p[2] : null;
}

// MATCH « MODÈLE SEUL » (avocat du diable et mathematicien, 30/09/2026, point 3) : hors
// d'Europe (et ancien moteur, origine inconnue), le chiffre est calcule sans la cote et
// la page masque tout ecart en sa faveur (549 paris jamais vus : 77,0 % annonces, 69,6 %
// passes). Le texte ne doit donc jamais dire que le modele voit plus de chances que la
// cote, le bookmaker ou le marche. Regle : une phrase qui parle du prix (cote,
// bookmaker, marche, probabilite implicite) ET d'un ecart en faveur du modele est
// retiree (option modeleSeul de nettoyerAnalyse ; les matchs « modèle + cotes » ne sont
// pas concernes).
const PRIX = /(^|[^\p{L}])(cotes?|bookmak(?:er|eur)s?|books?|op[ée]rateurs?|march[ée]s?|probabilit[ée]s?\s+implicites?)(?![\p{L}])/iu;
const EN_FAVEUR = /(^|[^\p{L}])(plus\s+de\s+chances?|plus\s+(?:probables?|optimistes?|confiante?s?|haute?s?|[ée]lev[ée]e?s?)|sup[ée]rieure?s?|au[\s-]dessus|d[ée]pass\p{L}*|surpass\p{L}*|exc[èe]d\p{L}*|sous[\s-]?(?:estim|[ée]valu|cot)\p{L}*|g[ée]n[ée]reu(?:x|se|ses)|trop\s+(?:haute?s?|[ée]lev[ée]e?s?)|[ée]carts?\s+(?:favorables?|positifs?)|en\s+(?:notre\s+|sa\s+|leur\s+)?faveur|\+\s*\d+(?:[.,]\d+)?\s*(?:points?|pts?|%)|ne\s+(?:lui\s+|leur\s+)?(?:donnen?t?|accorden?t?|attribuen?t?|voient|voit|estimen?t?|pr[êe]ten?t?)\s+que|\d+(?:[.,]\d+)?\s*%\s*contre\s*\d+(?:[.,]\d+)?\s*%)(?![\p{L}])/iu;
// -> le terme en faveur du modele trouve dans une phrase qui parle du prix, ou null.
function ecartFavorable(phrase) {
  const s = String(phrase == null ? "" : phrase);
  if (!PRIX.test(s)) return null;
  const m = s.match(EN_FAVEUR);
  return m ? m[2] : null;
}

// Decoupe en phrases sur . ! ? … suivis d'un espace : « 1.5 but » reste entier.
function phrases(texte) {
  return String(texte).split(/(?<=[.!?…])\s+/u).filter((x) => x.trim());
}

// -> { texte, retraits: [{ terme, phrase }] }. options.modeleSeul : retire aussi tout
// ecart en faveur du modele (ecartFavorable).
function nettoyerTexte(texte, options) {
  if (typeof texte !== "string" || !texte.trim()) return { texte: texte, retraits: [] };
  const retraits = [];
  const modeleSeul = !!(options && options.modeleSeul);
  const gardees = phrases(texte).filter((ph) => {
    const t = motInterdit(ph) || (modeleSeul ? ecartFavorable(ph) : null);
    if (t) retraits.push({ terme: t, phrase: ph });
    return !t;
  });
  return { texte: retraits.length ? gardees.join(" ").trim() : texte, retraits: retraits };
}

const CHAMPS = ["verdict_shark", "analyse_card", "conseil", "contexte", "facteur_x"];

// « NOTRE LECTURE DU MATCH » (decision de Clement, 30/09/2026) : 3 a 4 phrases SANS AUCUN
// chiffre, sans promesse, sans « valeur », « avantage », mise, cote ni pari. En plus des mots
// interdits ci-dessus, une phrase qui contient un chiffre, un pourcentage, une cote, une mise,
// un pari, un bookmaker ou une probabilite est retiree ; 4 phrases au plus.
const CHAMPS_SANS_CHIFFRE = ["lecture_match"];
const SANS_CHIFFRE = /(\d|%|(?:^|[^\p{L}])(?:cotes?|mises?|miser|misez|parier|pariez|bookmak(?:er|eur)s?|probabilit[ée]s?|pourcentages?|pronostics?)(?![\p{L}]))/iu;
// « pari » / « paris » en minuscules seulement : « Paris » (la ville, le club) reste permis.
const PARI = /(?:^|[^\p{L}])(paris?)(?![\p{L}])/u;
function lectureSansChiffre(texte, options) {
  const r = nettoyerTexte(texte, options);
  if (typeof r.texte !== "string" || !r.texte.trim()) return r;
  const retraits = r.retraits.slice();
  const gardees = phrases(r.texte).filter((ph) => {
    const m = ph.match(SANS_CHIFFRE) || ph.match(PARI);
    if (m) retraits.push({ terme: m[0].trim(), phrase: ph });
    return !m;
  }).slice(0, 4);
  return { texte: gardees.join(" ").trim(), retraits: retraits };
}

// Relit tous les textes de la reponse de genAnalyse. Ne modifie jamais l'objet
// recu. options.modeleSeul : match dont le chiffre n'est pas « modèle + cotes ».
// -> { an, retraits: [{ champ, terme, phrase }] }
function nettoyerAnalyse(an, options) {
  if (!an || typeof an !== "object" || Array.isArray(an)) return { an: an, retraits: [] };
  const out = Object.assign({}, an);
  const retraits = [];
  const passe = (champ, valeur) => {
    const r = nettoyerTexte(valeur, options);
    r.retraits.forEach((x) => retraits.push({ champ: champ, terme: x.terme, phrase: x.phrase }));
    return r.texte;
  };
  CHAMPS.forEach((c) => { if (typeof out[c] === "string") out[c] = passe(c, out[c]); });
  CHAMPS_SANS_CHIFFRE.forEach((c) => {
    if (typeof out[c] !== "string") return;
    const r = lectureSansChiffre(out[c], options);
    r.retraits.forEach((x) => retraits.push({ champ: c, terme: x.terme, phrase: x.phrase }));
    out[c] = r.texte;
  });
  if (out.scenario && typeof out.scenario === "object" && !Array.isArray(out.scenario)) {
    const sc = Object.assign({}, out.scenario);
    Object.keys(sc).forEach((k) => { if (typeof sc[k] === "string") sc[k] = passe("scenario." + k, sc[k]); });
    out.scenario = sc;
  }
  if (Array.isArray(out.scenario_15min)) {
    out.scenario_15min = out.scenario_15min.map((s, i) => (s && typeof s.txt === "string") ? Object.assign({}, s, { txt: passe("scenario_15min[" + i + "]", s.txt) }) : s);
  }
  if (Array.isArray(out.buteurs_probables)) {
    out.buteurs_probables = out.buteurs_probables.map((b) => (b && typeof b.raison === "string") ? Object.assign({}, b, { raison: passe("buteurs_probables[" + (b.joueur || "?") + "]", b.raison) }) : b);
  }
  return { an: out, retraits: retraits };
}

module.exports = { motInterdit: motInterdit, ecartFavorable: ecartFavorable, nettoyerTexte: nettoyerTexte, nettoyerAnalyse: nettoyerAnalyse, lectureSansChiffre: lectureSansChiffre, CHAMPS: CHAMPS, CHAMPS_SANS_CHIFFRE: CHAMPS_SANS_CHIFFRE };
