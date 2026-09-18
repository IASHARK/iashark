"use strict";
// Page Methodologie (legal/<dir>/methodologie.html -> /<dir>/methodologie.html).
//
// REGLE CENTRALE (decision du proprietaire du 16/09/2026) : la page explique le
// PRINCIPE, jamais LA RECETTE. Elle ne doit nommer aucun fournisseur de donnees,
// aucun bookmaker source, aucun modele statistique, aucune formule, aucun poids,
// aucun seuil chiffre, aucune taille de fenetre, ni la version du modele. Ce
// fichier est le garde-fou automatique de cette decision : le test "aucun terme
// de la recette" ci-dessous echoue si l'un de ces elements revient dans la page,
// dans n'importe laquelle des 9 versions.
//
// Il verifie aussi : exactitude (aucun chiffre de performance ou de track record,
// les faits cites existent vraiment dans le code), decisions bloquees en
// commentaire seulement, JSON-LD AboutPage + Organization sans Person, mention
// 18+, hreflang complet, et les liens depuis a-propos / les pieds de page.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const MARKETS = JSON.parse(read("config/markets.json"));
// 9 versions = tous les repertoires de config/markets.json#_dirs. de/it/pt ont
// ete ajoutes le 16/09/2026 : la page existe desormais dans les 7 locales.
const DIRS = ["fr", "en", "gb", "za", "es", "mx", "de", "it", "pt"];
const FAMILY = { fr: "fr", en: "en", gb: "en", za: "en", es: "es", mx: "es" };
const TITLES = {
  fr: "Méthodologie IAShark : données, modèle, limites",
  en: "IAShark methodology: data, model and limits",
  es: "Metodología de IAShark: datos, modelo y límites",
};

// Meme expression que scripts/build-public.js (notes internes retirees du HTML servi).
const BUILD_PUBLIC = read("scripts/build-public.js");
const STRIP_RE = /<!--\s*(LEGAL REVIEW|DRAFT|BLOCKED_DECISION|TODO|NOTE INTERNE)[\s\S]*?-->\s*/g;

function visibleText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
}
// HTML reellement servi : notes internes retirees. C'est sur CE texte que porte
// l'interdiction, commentaires compris (un terme interdit ne doit pas non plus
// trainer dans un attribut ou dans le JSON-LD).
function served(html) { return html.replace(STRIP_RE, ""); }

test("config : methodologie.html declaree dans _legalFiles, localisee par i18n.js", () => {
  assert.equal(MARKETS._legalFiles.methodology, "methodologie.html");
  assert.match(read("i18n/i18n.js"), /"methodologie\.html"/);
});

test("sources et pages generees : les 9 repertoires de _dirs", () => {
  assert.deepEqual(Object.keys(MARKETS._dirs).sort(), DIRS.slice().sort(), "_dirs a change : mettre a jour DIRS");
  DIRS.forEach(function (d) {
    assert.ok(exists("legal/" + d + "/methodologie.html"), "source " + d);
    assert.ok(exists(d + "/methodologie.html"), "page generee " + d);
  });
});

// ---------------------------------------------------------------------------
// LE GARDE-FOU : aucun element de la recette, dans aucune version.
// Troisieme element VITRINE : la regle vaut AUSSI pour les quatre pages les
// plus vues du site (a-propos, accueil, landing, exemple d'analyse), verifiees
// par le test "pages vitrine" plus bas. Assainir la seule page Methodologie ne
// sert a rien tant que ces pages-la nomment les modeles (constat du 16/09/2026).
const VITRINE = true;
// Quatrieme element PARTOUT : regle appliquee aussi a l'interieur des <script>
// de ces pages (exemple-analyse.html embarque la charge utile d'un match, dont
// le texte redige nommait la methode de simulation). Reservee aux noms de
// modeles et de methodes : les noms de fournisseurs apparaissent legitimement
// dans un commentaire de code et dans l'URL du CDN qui sert les logos de
// championnat (media.api-sports.io), qui relevent de l'infrastructure.
const PARTOUT = true;
const INTERDITS = [
  // Fournisseurs de donnees / API / prestataires techniques.
  [/API-?Football/i, "fournisseur de donnees", VITRINE],
  [/API-?SPORTS/i, "fournisseur de donnees", VITRINE],
  [/The Odds API/i, "fournisseur de cotes", VITRINE],
  [/ClubElo/i, "fournisseur de donnees", VITRINE],
  [/OpenWeatherMap/i, "fournisseur de donnees", VITRINE],
  [/NewsAPI/i, "fournisseur de donnees", VITRINE],
  [/Anthropic/i, "prestataire IA nomme", VITRINE],
  [/\bClaude\b/, "modele IA nomme", VITRINE],
  [/\bGPT\b|OpenAI/i, "modele IA nomme", VITRINE],
  [/Supabase|Netlify|GitHub Actions/i, "brique d'infrastructure", VITRINE],
  // Bookmakers cites comme source.
  // « Betway Premiership » est le nom commercial du championnat sud-africain
  // (i18n/seo/za.json), pas un bookmaker cite comme source : seule exception.
  [/Pinnacle|Bet ?365|Betclic|Winamax|Unibet|Betway(?! Premiership)|Bwin|William Hill/i, "bookmaker source", VITRINE],
  // Modeles et methodes statistiques.
  [/Dixon-?Coles/i, "modele statistique nomme", VITRINE, PARTOUT],
  [/\bPoisson\b/i, "modele statistique nomme", VITRINE, PARTOUT],
  [/Monte[- ]?Carlo/i, "methode nommee", VITRINE, PARTOUT],
  [/\bShin\b/, "methode nommee", VITRINE, PARTOUT],
  [/\bKelly\b/, "methode nommee", VITRINE, PARTOUT],
  [/\bElo\b/, "composant du moteur", VITRINE, PARTOUT],
  // Pas VITRINE : le xG est un chiffre affiche sur toutes les pages match
  // (match_page.unit_xg_*) ; l'interdiction vise la page qui decrit le moteur.
  [/\bxG\b/, "feature nommee"],
  [/isoton|isotonic|isotónic|isotonisch/i, "methode de calibration nommee", VITRINE, PARTOUT],
  [/r[ée]gression logistique|logistic regression/i, "methode nommee", VITRINE, PARTOUT],
  // Version du modele / identifiants techniques.
  // Pas VITRINE : exemple-analyse.html embarque la charge utile publique reelle
  // d'un match, dont les noms de champs (model_probability...) sont ceux de
  // data.json. Ce sont des donnees publiees, pas la recette.
  [/score-matrix|early-season-v\d|model_probability|pickMarketDeterministic/i, "identifiant technique"],
  // Parametres operationnels exacts.
  [/06:00 UTC|0 6 \* \* \*/i, "heure exacte du calcul", VITRINE],
  [/5[  .,]?000 (simulations|fois|veces|times|volte|mal|vezes)/i, "nombre de simulations", VITRINE],
];

test("aucun terme de la recette : fournisseurs, bookmakers, modeles, formules, parametres", () => {
  DIRS.forEach(function (d) {
    const html = served(read(d + "/methodologie.html"));
    INTERDITS.forEach(function (pair) {
      assert.doesNotMatch(html, pair[0], d + "/methodologie.html : " + pair[1] + " publie (" + pair[0] + ")");
    });
  });
});

test("aucune formule et aucune valeur de seuil publiees", () => {
  DIRS.forEach(function (d) {
    const txt = visibleText(read(d + "/methodologie.html"));
    // Seuils reels du code (lib/decision.js, update-data.yml, safe-pick, match offert).
    assert.doesNotMatch(txt, /1[.,]50|\b97\s?%|\b55\s?%|\b45\s?%|1[.,]75|2[.,]20|\b15 min|0[.,]0845|1[.,]35|≥|≤/, d + " : valeur de seuil publiee");
    // Formules ecrites en clair (valeur estimee, probabilite implicite du marche).
    assert.doesNotMatch(txt, /[×x]\s*(cote|cuota|momio|odds|quota|Quote)\s*[−-]\s*1/i, d + " : formule de valeur publiee");
    assert.doesNotMatch(txt, /1\s*[÷/]\s*(cote|cuota|momio|odds|quota|Quote)/i, d + " : formule de probabilite implicite publiee");
  });
});

test("exactitude : aucun chiffre de performance, aucun track record, aucune promesse", () => {
  DIRS.forEach(function (d) {
    const txt = visibleText(read(d + "/methodologie.html"));
    // Aucune section de bilan public : CALIBRATION_REPORT.md dit qu'aucune mesure
    // du moteur actuel n'existe encore. Publier un chiffre serait l'inventer.
    assert.doesNotMatch(txt, /publierons|publication des résultats|will measure and publish|mediremos y publicaremos|bilan|track record|balance de resultados/i, d);
    // \b obligatoire : sans lui, « Brier » est trouve dans l'allemand
    // « kalibriertes » et « ECE » dans d'autres mots.
    assert.doesNotMatch(txt, /\bBrier\b|\blog ?loss\b|\bECE\b|\bROI\b|\bwinrate\b|taux de r[ée]ussite|success rate|tasa de acierto/i, d + " : metrique de performance publiee");
    assert.doesNotMatch(txt, /\b\d{1,3}\s?% (de r[ée]ussite|of winners|win rate|de acierto)/i, d);
    // Promesse de gain. Vise les tournures affirmatives seulement : la page DOIT
    // pouvoir dire « sans aucune garantie de resultat », qui est l'inverse.
    assert.doesNotMatch(txt, /gains? garantis?|profits? garantis?|r[ée]sultats? garantis?|gain assur|profit assur|guaranteed (win|profit|return|outcome)|ganancias? garantizadas?|garantierter? (Gewinn|Profit)|vincita garantita|lucro garantido/i, d + " : promesse de gain");
    // ... et l'avertissement inverse doit bien etre present. Chaque version le
    // formule a sa maniere (« sans aucune garantie de resultat », « no outcome
    // or winnings are guaranteed », « sin ninguna garantia »...) : on exige donc
    // la racine du mot, pas une tournure figee.
    // Racine courte : « garantie », « garanzia » (it), « garantía » (es),
    // « garantia » (pt), « Garantie » (de), « guarantee » (en).
    assert.match(txt, /garan|guaran/i, d + " : avertissement « aucune garantie » absent");
  });
});

test("mention 18+ et ressource d'aide presentes dans chaque version", () => {
  DIRS.forEach(function (d) {
    const txt = visibleText(read(d + "/methodologie.html"));
    assert.match(txt, /18\s?\+|18 ans|18 years|18 años|18 anos|18 anni|18 Jahren|majeurs/i, d + " : mention 18+ absente");
    assert.match(txt, /gamblingtherapy\.org|joueurs-info-service\.fr|begambleaware|gambleaware|responsiblegambling\.org\.za|911 2000/i, d + " : aucune ressource d'aide");
  });
});

test("title/meta, canonical du repertoire, JSON-LD AboutPage + Organization sans Person", () => {
  DIRS.forEach(function (d) {
    const html = read(d + "/methodologie.html");
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
    assert.ok(title, d + " : title absent");
    if (FAMILY[d]) assert.equal(title, TITLES[FAMILY[d]], d);
    assert.ok(title.length <= 60, d + " title <= 60 (" + title.length + ")");
    assert.match(title, /IAShark/i, d + " : marque absente du title");
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    assert.ok(desc && desc.replace(/&#x27;|&#39;/g, "'").length <= 155, d + " description <= 155");
    assert.match(html, new RegExp('<link rel="canonical" href="https://iashark\\.com/' + d + '/methodologie\\.html">'));
    const blocks = Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)).map((m) => JSON.parse(m[1]));
    const nodes = [].concat.apply([], blocks.map((b) => b["@graph"] || [b]));
    const types = nodes.map((n) => n["@type"]);
    assert.ok(types.includes("AboutPage"), d + " AboutPage");
    assert.ok(types.includes("Organization"), d + " Organization");
    assert.ok(!types.includes("Person"), d + " : aucun noeud Person");
    const org = nodes.find((n) => n["@type"] === "Organization");
    assert.equal(org.name, "IAShark");
    assert.ok(!("legalName" in org), "legalName bloque");
    assert.doesNotMatch(JSON.stringify(blocks), /BLOCKED_DECISION/);
    assert.doesNotMatch(title + " " + desc, /prono s[uû]r|gagnant|bonus|garanti|\bsure\b|winner|guarantee|seguro|ganador|garantizado/i);
  });
});

test("hreflang complet : les 9 versions + x-default dans chaque page generee", () => {
  const HREFLANGS = { fr: "fr", en: "en", gb: "en-GB", za: "en-ZA", es: "es", mx: "es-MX", de: "de", it: "it", pt: "pt" };
  DIRS.forEach(function (d) {
    const html = read(d + "/methodologie.html");
    DIRS.forEach(function (alt) {
      const tag = '<link rel="alternate" hreflang="' + HREFLANGS[alt] + '" href="https://iashark.com/' + alt + '/methodologie.html">';
      assert.ok(html.includes(tag), d + " : hreflang manquant vers " + alt);
    });
    assert.match(html, /<link rel="alternate" hreflang="x-default" href="https:\/\/iashark\.com\/[a-z]{2}\/methodologie\.html">/, d + " : x-default manquant");
  });
});

test("decisions bloquees et notes internes : en commentaire seulement, retirees par build-public", () => {
  assert.ok(BUILD_PUBLIC.includes("(LEGAL REVIEW|DRAFT|BLOCKED_DECISION|TODO|NOTE INTERNE)"), "regex de build-public.js modifiee : mettre a jour ce test");
  DIRS.forEach(function (d) {
    const html = read(d + "/methodologie.html");
    ["IDENTITE_LEGALE", "NOM_RESPONSABLE_EDITORIAL"].forEach(function (k) {
      assert.match(html, new RegExp("<!-- BLOCKED_DECISION: " + k), d + " " + k);
    });
    // Le niveau de divulgation n'est plus une decision bloquee : il est tranche.
    // La note interne reste, elle documente la regle pour la prochaine edition.
    assert.match(html, /<!-- NOTE INTERNE: NIVEAU_DE_DIVULGATION/, d + " : note de divulgation absente");
    assert.doesNotMatch(visibleText(html), /BLOCKED_DECISION|NOTE INTERNE|\[À VALIDER|\[SUBJECT TO|\[PENDIENTE/, d);
    assert.doesNotMatch(served(html), /BLOCKED_DECISION|LEGAL REVIEW|NOTE INTERNE/, d + " : note interne restante apres build-public");
    // Editeur affiche + lien de contact existant.
    assert.match(visibleText(html), /IAShark/);
    assert.match(html, /href="mailto:contact@iashark\.com"/);
    assert.match(html, /href="mentions-legales\.html"/);
  });
});

test("ce que la page affirme est vrai dans le code (sans en publier les valeurs)", () => {
  const pipeline = read(".github/workflows/update-data.yml");
  // « Le calcul est lance automatiquement une fois par jour. »
  assert.match(pipeline, /cron: '0 6 \* \* \*'/, "le calcul quotidien annonce n'existe plus");
  // « une cote minimale » et « un plafond de probabilite » (valeurs non publiees).
  // « une cote minimale et une cote maximale », « les cotes, marge retiree, et le
  // modele » (19/09/2026, lib/decision.js#pickMarketFair).
  assert.match(pipeline, /var fairSelection=pickMarketFair\(allMarkets,\{shin:shinProbs\}\)/, "le choix annonce (cotes sans marge + modele) n'existe plus");
  assert.match(read("lib/decision.js"), /const SELECTION = Object\.freeze\(\{ minOdds: \d\.\d+, maxOdds: \d\.\d+, modelWeight: 0\.\d+ \}\);/, "la cote minimale/maximale annoncee n'existe plus");
  assert.match(read("lib/decision.js"), /const PROBABILITE_MAX_RECOMMANDABLE = 97;/, "le plafond de probabilite annonce n'existe plus");
  // « le classement de reference est affiche mais n'entre pas dans les probabilites ».
  assert.match(read("lib/engine.js"), /elo_used:false/);
  // « la probabilite estimee = probabilite du modele / 10 », fixee par le code.
  assert.match(pipeline, /conf:pickedMarket\?Math\.round\(\(pickedMarket\.prob\/10\)\*10\)\/10/);
  // « une correction apprise sur l'historique est appliquee a une partie des marches ».
  // « une correction apprise sur cet historique est appliquee a une partie des
  // marches » : les trois marches d'origine (1X2, Over 2.5, BTTS) restent
  // branches, et depuis le 18/09/2026 les familles derivees de la meme matrice
  // (totaux par equipe, clean sheet, resultat + total...) le sont aussi quand
  // le holdout le justifie - le nombre exact est une decision du fit, pas du
  // test. « Une partie » reste vrai : premiere mi-temps et tirs ne sont pas
  // calibres (voir ENGINE_RECALIBRATION_REPORT.md).
  const calib = JSON.parse(read("lib/data/calibration-params.json"));
  ["1X2", "OVER_2_5", "BTTS_YES"].forEach(function (k) { assert.equal(calib.markets[k] && calib.markets[k].wired, true, k + " : courbe de calibration debranchee"); });
  assert.ok(JSON.stringify(calib).split('"wired":true').length - 1 >= 3, "moins de trois courbes de calibration branchees");
  assert.match(read("home-list.js"), /tf\('home_list\.aria_prob','Probabilité estimée \{p\} sur 10\.'/);
});

test("liens Methodologie : a-propos et pieds de page, dans les 9 versions", () => {
  DIRS.forEach(function (d) {
    assert.match(read(d + "/a-propos.html"), new RegExp('href="/' + d + '/methodologie\\.html"'), d + "/a-propos");
    assert.match(read(d + "/index.html"), new RegExp('href="/' + d + '/methodologie\\.html"'), d + "/index (pied de page)");
  });
  const js = read("match-page.js");
  const signal = js.slice(js.indexOf("function signalCard(vm)"), js.indexOf("function marketsCard"));
  const gate = js.slice(js.indexOf("function gateCard(vm,opts)"), js.indexOf("function renderAuthWall"));
  assert.ok(signal.includes("methodLink()") && gate.includes("methodLink()"));
  // NOTE : match-page.js porte encore la liste des 6 repertoires d'origine. Les
  // pages match de /de/ /it/ /pt/ n'affichent donc pas encore le lien, alors que
  // la page existe desormais. A completer par le proprietaire de match-page.js.
  assert.match(js, /METHODOLOGY_DIRS=\['fr','gb','za','en','mx','es'\]/);
  assert.match(read("scripts/seo-pages.js"), /"methodologie\.html": "footer\.methodology"/);
});

test("a-propos : plus de convergence de modeles, de methode proprietaire ni de 4 modeles croises", () => {
  const src = read("a-propos.html");
  const txt = visibleText(src);
  assert.doesNotMatch(txt, /convergent|propriétaire|plusieurs saisons|compositions probables|MODÈLES CROISÉS|value bet/i);
  ["fr", "en", "es", "es-mx", "de", "it", "pt"].forEach(function (loc) {
    const a = JSON.parse(read("i18n/dict/" + loc + ".json")).about_page;
    const all = JSON.stringify(a);
    assert.doesNotMatch(all, /convergent|converge|propriétaire|proprietary|propietari|proprietär|proprietari|value bet/i, loc);
    assert.ok(a.method_link, loc + " method_link");
  });
  assert.doesNotMatch(read("tools-page.js"), /Modèles croisés/);
  assert.doesNotMatch(read("index.html"), /Modèles croisés/);
});

test("libelle probabilite estimee dans les 7 dictionnaires, et jamais de chiffre conf pour un match non offert", () => {
  const expected = { fr: /Probabilité estimée/, en: /Estimated probability/, es: /Probabilidad estimada/, "es-mx": /Probabilidad estimada/, de: /Geschätzte Wahrscheinlichkeit/, it: /Probabilità stimata/, pt: /Probabilidade estimada/ };
  Object.keys(expected).forEach(function (loc) {
    const dict = JSON.parse(read("i18n/dict/" + loc + ".json"));
    assert.match(dict.match_page.sig_conf_label, expected[loc], loc);
    assert.equal(dict.clubs.conf_label, undefined, loc + " : libelle de probabilite sur les pages club");
    assert.doesNotMatch(JSON.stringify(dict.match_page) + JSON.stringify(dict.clubs), /indice de confiance|confidence index|índice de confianza|indice di fiducia|Vertrauensindex|índice de confiança/i, loc);
  });
  const pipeline = read(".github/workflows/update-data.yml");
  assert.doesNotMatch(pipeline, /\(m\.conf!=null&&!m\.no_signal\)\?\(' — '\+confiance/, "resume SEO accueil : conf d'un match non offert");
  const home = read("index.html");
  const list = read("home-list.js");
  assert.match(list, /if\(!ctx\.isPro&&!free\)return \{state:'locked',band:probBandOf\(m\)\};/);
  assert.doesNotMatch(home, /home_app\.seo_confidence">[^<]*<\/span> [0-9.,]+\/10<\/li>/, "resume SEO statique : conf d'un match non offert");
});

test("prompts IA du pipeline : description conforme au code (pas d'ensemble avec Elo, le LLM ne choisit rien)", () => {
  const pipeline = read(".github/workflows/update-data.yml");
  assert.doesNotMatch(pipeline, /ensemble Poisson\+Dixon-Coles\+Monte-Carlo\+Elo/);
  assert.doesNotMatch(pipeline, /coherence du marche que tu choisis|choisis autre marche/);
  assert.doesNotMatch(pipeline, /pas de cote fiable >= 1\.50 disponible pour ce match/);
  assert.match(pipeline, /matrice de scores Dixon-Coles, calibree sur 1X2 \/ plus de 2\.5 buts \/ BTTS/);
});

// ---------------------------------------------------------------------------
// LE MEME GARDE-FOU SUR LES PAGES VITRINE.
// Decision du proprietaire du 16/09/2026 : le site ne publie jamais la recette
// du moteur. La page Methodologie a ete assainie la premiere, mais la recette
// restait nommee sur les quatre pages les plus vues : a-propos, accueil,
// landing et l'exemple d'analyse. Ces pages decrivent desormais ce que fait le
// systeme et ce qui entre ou non dans le calcul, jamais avec quels outils ni
// selon quelle methode nommee. Le test ci-dessous verrouille cet etat.
//
// Sont verifiees la source FR de la racine ET les neuf versions generees, plus
// les dictionnaires qui les alimentent : une regression peut venir du HTML
// comme d'une cle i18n.
const VITRINE_FILES = ["a-propos.html", "index.html", "landing.html", "exemple-analyse.html"];
const VITRINE_PATHS = [].concat.apply([], VITRINE_FILES.map(function (f) {
  return [f].concat(DIRS.map(function (d) { return d + "/" + f; }));
}));
const INTERDITS_VITRINE = INTERDITS.filter(function (p) { return p[2]; });
const INTERDITS_PARTOUT = INTERDITS.filter(function (p) { return p[3]; });

// Les valeurs de href/src sont exclues : ce sont des adresses, pas de la prose,
// et deux d'entre elles contiennent legitimement un terme interdit —
// /blog/guides/plus-de-2-5-buts-probabilite-methode-poisson.html (nom de
// fichier d'un guide pedagogique publie sur la loi de Poisson ; le renommer
// casserait une URL en ligne) et le CDN qui sert les logos de championnat.
// Les attributs content= (description, og:*) restent verifies.
function sansUrls(html) { return html.replace(/\s(?:href|src|srcset)="[^"]*"/g, " "); }
// Prose publiee : <script> et <style> retires. Le code de ces pages cite des
// fournisseurs (commentaire JS, CDN des logos de championnat) sans que le
// lecteur ne le lise ; c'est un sujet d'infrastructure, pas d'editorial.
function prose(html) { return sansUrls(served(html)).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " "); }

test("pages vitrine : la prose ne nomme ni fournisseur, ni bookmaker source, ni modele", () => {
  VITRINE_PATHS.forEach(function (rel) {
    if (!exists(rel)) return;
    const html = prose(read(rel));
    INTERDITS_VITRINE.forEach(function (pair) {
      assert.doesNotMatch(html, pair[0], rel + " : " + pair[1] + " publie (" + pair[0] + ")");
    });
  });
});

test("pages vitrine : aucun nom de modele ni de methode, y compris dans les donnees embarquees", () => {
  VITRINE_PATHS.forEach(function (rel) {
    if (!exists(rel)) return;
    const html = sansUrls(served(read(rel)));
    INTERDITS_PARTOUT.forEach(function (pair) {
      assert.doesNotMatch(html, pair[0], rel + " : " + pair[1] + " publie (" + pair[0] + ")");
    });
  });
});

test("pages vitrine : les 9 versions generees existent bien (sinon les tests ci-dessus ne verifient rien)", () => {
  VITRINE_PATHS.forEach(function (rel) { assert.ok(exists(rel), "page absente : " + rel); });
  assert.equal(VITRINE_PATHS.length, VITRINE_FILES.length * (DIRS.length + 1));
});

test("dictionnaires des pages vitrine : aucun nom de modele, dans les 7 locales", () => {
  ["fr", "en", "es", "es-mx", "de", "it", "pt"].forEach(function (loc) {
    const dict = JSON.parse(read("i18n/dict/" + loc + ".json"));
    // Cles ET valeurs : landing_v2.strip_poisson nommait la recette jusque dans
    // son nom de cle (renommee strip_1..strip_6 le 16/09/2026).
    const blob = JSON.stringify({
      about_page: dict.about_page, landing_page: dict.landing_page, landing_v2: dict.landing_v2,
      demo_page: dict.demo_page, demo_data: dict.demo_data,
      geo_meta: dict.geo && dict.geo.meta,
    });
    INTERDITS_VITRINE.forEach(function (pair) {
      assert.doesNotMatch(blob, pair[0], loc + " : " + pair[1] + " dans le dictionnaire (" + pair[0] + ")");
    });
    // Le paragraphe « ce que nous ne detaillons pas » de a-propos existe partout.
    assert.ok(dict.about_page.method_undisclosed, loc + " : about_page.method_undisclosed absent");
  });
});

test("textes SEO par repertoire : aucun nom de modele dans les 9 fichiers i18n/seo", () => {
  DIRS.forEach(function (d) {
    const seo = JSON.parse(read("i18n/seo/" + d + ".json"));
    // _readme est une note d'edition interne, jamais publiee.
    const blob = JSON.stringify({ meta: seo.meta, home: seo.home });
    INTERDITS_VITRINE.forEach(function (pair) {
      assert.doesNotMatch(blob, pair[0], "i18n/seo/" + d + ".json : " + pair[1] + " (" + pair[0] + ")");
    });
  });
});

test("manifeste i18n : la section « methode » de l'accueil est traduite en entier", () => {
  const PAGES_MANIFEST = require("../scripts/i18n-manifest.js");
  const home = PAGES_MANIFEST.find(function (p) { return p.file === "index.html"; });
  const src = read("index.html");
  // Une regle dont la chaine a disparu de la source est ignoree en silence par
  // build-locales.js : le titre d'une carte non couvert par une regle resterait
  // en francais dans /de/ /it/ /pt/. On verifie ici que les quatre titres et
  // les quatre descriptions de la section « methode » ont bien leur regle.
  ["Forces en présence", "Prudence en début de saison", "Probabilité de chaque marché", "Simulation du match"].forEach(function (t) {
    assert.ok(src.includes(t), "index.html : carte « " + t + " » absente");
    assert.ok(home.replacements.some(function (r) { return r.find.includes(t); }), "aucune regle de traduction pour « " + t + " »");
  });
  home.replacements.forEach(function (r) {
    assert.ok(src.includes(r.find), "regle obsolete sur index.html : " + JSON.stringify(r.find.slice(0, 60)));
  });
});
