"use strict";
// Liste UNIQUE des champs premium (lib/premium-fields.js) et ses copies :
// fonction Edge match-data (Deno, copie litterale), pipeline, historique.json,
// decoupage des fichiers publics, pages SEO, page Outils, affichage Pro.
// Audit fuite du 14/09/2026 (hotfix main + branche geo-expansion).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PREMIUM = require("../lib/premium-fields.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function edgeList() {
  const fn = read("supabase/functions/match-data/index.ts");
  const debut = fn.indexOf("const PREMIUM_FIELDS = [");
  assert.ok(debut !== -1, "PREMIUM_FIELDS introuvable dans la fonction Edge");
  const bloc = fn.slice(debut, fn.indexOf("];", debut));
  return [...bloc.matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
}

test("la fonction Edge porte exactement la meme liste que lib/premium-fields.js", () => {
  const edge = edgeList();
  assert.equal(new Set(edge).size, edge.length, "doublon dans la liste de la fonction Edge");
  assert.deepEqual([...edge].sort(), [...PREMIUM.PREMIUM_FIELDS].sort());
});

test("la liste unique : colonnes + traductions + premium_fields, sans doublon", () => {
  const all = PREMIUM.PREMIUM_FIELDS;
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(all, PREMIUM.PREMIUM_COLUMN_FIELDS.concat(PREMIUM.PREMIUM_NARRATIVE_I18N_FIELDS, PREMIUM.PREMIUM_PAYLOAD_FIELDS));
  // Les colonnes lues par la fonction Edge sont bien les colonnes dediees.
  const fn = read("supabase/functions/match-data/index.ts");
  const cols = fn.match(/const PREMIUM_COLUMNS = "([^"]+)"/)[1].split(",").filter((c) => c !== "fixture_id" && c !== "raw_response");
  assert.deepEqual(cols.sort(), [...PREMIUM.PREMIUM_COLUMN_FIELDS].sort());
  // Traductions : premium ET "publiques" de lib/narrative-i18n.js (textes d'analyse).
  const N = require("../lib/narrative-i18n.js");
  for (const f of N.PREMIUM_I18N_FIELDS.concat(N.PUBLIC_I18N_FIELDS)) assert.ok(all.includes(f), f);
});

test("amorces et faits publics : jamais classes premium", () => {
  const publics = ["id", "home", "away", "date", "league", "league_key", "is_free", "has_signal", "no_signal", "no_signal_label",
    "data_quality_score", "data_quality_label", "model_output_available", "analysis_tier", "stade", "classement", "injuries",
    "form_home", "form_away", "h2h", "lineups", "player_history", "current_squads", "c1", "cn", "c2", "co25", "pinnacle_snapshot",
    "match_stats_home", "events_home", "tendances", "fatigue", "elo_home", "elo_away", "key_absences"];
  for (const k of publics) assert.ok(!PREMIUM.PREMIUM_FIELDS.includes(k), k + " ne doit pas etre premium");
});

test("stripPremium : tout retire hors match offert, has_signal conserve l'amorce", () => {
  const complet = { id: 1, home: { n: "A" }, away: { n: "B" }, conf: 6.9, p1: 60, btts: 61, pari_rec: "Under 3.5", paris_safe: { bet: "Under 3.5" }, top_scorers: [{ goal_threat_score: 80 }], fatigue: { home: { val: 100 } } };
  const pub = PREMIUM.stripPremium(complet);
  assert.deepEqual(PREMIUM.premiumLeaks(pub), []);
  assert.deepEqual(PREMIUM.deepPremiumLeaks(pub), []);
  assert.equal(pub.has_signal, true);
  assert.equal(pub.conf, undefined, "conf (note sur 10) est premium depuis le 15/09/2026");
  assert.deepEqual(pub.fatigue, complet.fatigue, "fatigue.val est un fait, pas la cle premium val");
  const offert = Object.assign({}, complet, { is_free: true });
  assert.equal(PREMIUM.stripPremium(offert), offert, "le match offert reste complet");
  assert.deepEqual(Object.keys(PREMIUM.premiumPayload(complet)).sort(), ["btts", "conf", "p1", "paris_safe", "top_scorers"]);
});

test("deepPremiumLeaks detecte un champ premium imbrique ou de premier niveau", () => {
  const fichier = { matchs: [
    { id: 1, home: {}, away: {}, p1: 50 },
    { id: 2, home: {}, away: {}, extra: { nested: [{ goal_threat_score: 3 }] } },
    { id: 3, home: {}, away: {}, is_free: true, p1: 50, pari_rec: "x" },
  ] };
  const leaks = PREMIUM.deepPremiumLeaks(fichier);
  assert.equal(leaks.length, 2, leaks.join(" | "));
  assert.ok(leaks.some((l) => /#1\.p1$/.test(l)));
  assert.ok(leaks.some((l) => /#2\.extra\.nested\[0\]\.goal_threat_score$/.test(l)));
});

test("historique : pari en attente masque hors match offert, relu depuis l'archive sans rien inventer", () => {
  const preds = [
    { fixture_id: 10, result: "scheduled", prediction: "Under 3.5", cote: 1.4, model_probability: 72, conf: 7.2, market: "under-35", home: "A", away: "B", date: "2026-09-14" },
    { fixture_id: 11, result: "scheduled", prediction: "BTTS Oui", cote: 1.6, model_probability: 61 },
    { fixture_id: 12, result: "win", prediction: "Over 2.5", cote: 1.9 },
    { fixture_id: 13, result: "pending", prediction: "DC 1X", cote: 1.3 },
  ];
  const pub = PREMIUM.redactPendingPredictions(preds, [11]);
  assert.equal(pub[0].prediction, undefined);
  assert.equal(pub[0].redacted, true);
  assert.equal(pub[0].home, "A", "identite et date conservees pour le reglement");
  assert.equal(pub[1].prediction, "BTTS Oui", "match offert conserve");
  assert.equal(pub[2].prediction, "Over 2.5", "prediction reglee conservee");
  assert.equal(pub[3].prediction, undefined);
  assert.equal(preds[0].prediction, "Under 3.5", "l'entree d'origine n'est jamais modifiee");
  const n = PREMIUM.rehydratePredictions(pub, [{ fixture_id: 10, prediction: "Under 3.5", cote: "1.4", model_probability: 72, conf: 7.2, market: "under-35" }]);
  assert.equal(n, 1);
  assert.equal(pub[0].prediction, "Under 3.5");
  assert.equal(pub[0].redacted, undefined);
  assert.equal(pub[3].redacted, true, "sans ligne d'archive, reste masquee");
});

test("pipeline : liste unique, premium_fields persistes, data.json, pages et historique assainis", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /var PREMIUM_FIELDS_LIB=require\('\.\/lib\/premium-fields\.js'\);/);
  assert.equal((wf.match(/var PREMIUM_FIELDS_LIB=require\(/g) || []).length, 1, "une seule declaration");
  assert.match(wf, /var CHAMPS_PREMIUM=PREMIUM_FIELDS_LIB\.PREMIUM_FIELDS\.slice\(\);/);
  assert.doesNotMatch(wf, /var CHAMPS_PREMIUM=\[/, "plus de liste litterale divergente");
  const iPayload = wf.indexOf("r.premium_fields=Object.keys(charge).length?charge:null;");
  assert.ok(iPayload !== -1, "premium_fields pose sur chaque ligne premium");
  assert.match(wf, /var charge=PREMIUM_FIELDS_LIB\.premiumPayload\(matchParId\[String\(r\.fixture_id\)\]\);/);
  assert.ok(iPayload > wf.indexOf("(function designerMatchGratuit(){") && iPayload < wf.indexOf("await writePremiumData(premiumRows);"), "premium_fields calcule apres la designation et avant l'ecriture");
  assert.match(wf, /generateMatchPages\(matchsPublics\)/, "pages match depuis la copie assainie");
  // PUBLIC_SPLIT.preloadedMatch (16/09/2026) = toListMatch(stripPremium(...)) + niveau prob_band.
  assert.match(wf, /PRELOADED_MATCH='\+JSON\.stringify\(PUBLIC_SPLIT\.preloadedMatch\(m\)\)/);
  assert.match(read("lib/public-data-split.js"), /return toListMatch\(PREMIUM\.stripPremium\(m\.is_free === true \? m : withProbBand\(m\)\)\);/);
  assert.match(wf, /fs\.writeFileSync\(histoPath,JSON\.stringify\(historiquePublic\(histo,matchsData\),null,2\)\);/);
  assert.match(wf, /fs\.writeFileSync\(histoPathEarly,JSON\.stringify\(historiquePublic\(histoEarly,\[\]\),null,2\)\);/);
  assert.equal((wf.match(/await rehydraterPredictionsMasquees\(/g) || []).length, 2, "rehydratation avant chaque reglement");
  assert.equal((wf.match(/if\(!found\|\|found\.redacted\)(continue|return);/g) || []).length, 2, "un pari masque n'est jamais regle a l'aveugle");
  assert.match(wf, /p\.fixture_id!=null&&p\.type==='single'&&!p\.redacted;/, "une prediction masquee n'ecrase jamais l'archive");
});

// Cause de l'arret silencieux des ecritures (constatee le 14/09/2026) :
// explanation_status n'est pas une colonne de match_premium_data (lot entier
// rejete depuis le 06/09) et des fixture_id en double faisaient echouer le lot
// recent de predictions_archive (depuis le 09/09). Le job restait vert.
test("pipeline : ecritures Supabase jamais en echec silencieux", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.doesNotMatch(wf, /^\s*explanation_status:an\?'OK':'FAILED',$/m, "explanation_status n'est pas une colonne de match_premium_data");
  assert.match(wf, /raw_response:Object\.assign\(\{\},an\|\|\{\},\{explanation_status:an\?'OK':'FAILED'\}\),/);
  assert.match(wf, /Could not find the '\(\[A-Za-z0-9_\]\+\)' column/, "colonne inconnue rangee dans raw_response puis lot renvoye");
  assert.match(wf, /c\.raw_response=Object\.assign\(\{\},c\.raw_response\|\|\{\},extra\);/);
  assert.match(wf, /rows=dedoublonnerParFixture\(rows,'dernier'\);/);
  assert.match(wf, /var rows=dedoublonnerParFixture\(candidates,'premier'\)/);
  for (const zone of ["premium", "archive", "snapshots"]) {
    assert.match(wf, new RegExp("signalerEchecPersistance\\('" + zone + "','echec upsert"), zone + " : echec signale");
  }
  assert.doesNotMatch(wf, /if\(!r\.ok\) console\.log\('  \[(premium|archive|snapshots)\] echec upsert/, "plus d'echec en simple ligne de log");
  assert.doesNotMatch(wf, /console\.log\('  \[premium\] '\+rows\.length\+' lignes premium ecrites/, "plus de faux message de succes");
  assert.match(wf, /console\.log\('::error title=Ecriture Supabase '\+zone\+'::'\+ligne\);/);
  assert.match(wf, /- name: Verifier les ecritures Supabase \(premium, archive, snapshots\)\n(\s*#.*\n)*\s*if: always\(\)\n\s*run: \|\n\s*F="\$RUNNER_TEMP\/iashark-persist-errors\.txt"/);
  assert.ok(wf.indexOf("- name: Verifier les ecritures Supabase") > wf.indexOf("- name: Commit and push"), "verification apres publication");
});

test("decoupage, script local et pages SEO utilisent la liste unique", () => {
  assert.equal(require("../lib/public-data-split.js").PREMIUM_FIELDS, PREMIUM.PREMIUM_FIELDS);
  assert.match(read("scripts/split-public-data.js"), /\.map\(PREMIUM\.stripPremium\)/);
  assert.match(read("scripts/seo-pages.js"), /PUBLIC_SPLIT\.preloadedMatch\(m\)/);
});

test("fonction Edge : non-abonne sans champ premium ni run_output detaille, abonne servi depuis la table", () => {
  const fn = read("supabase/functions/match-data/index.ts");
  assert.match(fn, /if \(estGratuit\(m\)\) return m;/);
  assert.match(fn, /return retirerPremium\(m\);/);
  assert.match(fn, /data\.run_output = runOutputPublic\(data\.run_output, matchs\)/);
  assert.match(fn, /select\(PREMIUM_COLUMNS \+ ",premium_fields"\)/);
  assert.match(fn, /premium\.premium_fields \?\? raw\?\.premium_fields/);
  assert.match(fn, /m\.detail_omitted === true && detailFields\.has\(f\)/);
  assert.doesNotMatch(fn, /isPro\s*=\s*true/, "aucun bypass");
});

test("page Outils : donnees de match seulement via match-data, si le serveur confirme l'abonnement", () => {
  const js = read("tools-page.js");
  assert.match(js, /if \(!ctx\.isPro\) return Promise\.resolve\(null\)/);
  assert.match(js, /functions\.invoke\('match-data'/);
  assert.match(js, /r\.data\.isPro !== true\) return null;/);
  assert.doesNotMatch(js, /fetch\(['"`]\/?(data|data-home)\.json/, "la page Outils ne lit jamais un fichier public de matchs");
});

// Abonne Pro dont match-data ne sert pas encore le detail premium (table pas
// encore remplie) : etat neutre, jamais "aucun marche" ni erreur.
test("affichage Pro sans detail premium : etat neutre sur l'accueil et la page match", () => {
  // Accueil (home-list.js, 16/09/2026) : analyse ouverte sans marche servi -> etat
  // neutre « Analyse en cours », jamais « aucun marche prioritaire ».
  const list = read("home-list.js");
  assert.match(list, /if\(!market\)return \{state:'pending'/);
  assert.match(list, /state==='pending'\)\{\s*zone='<span class="hl-zone hl-zone-none"><span class="hl-none-t">'\+esc\(t\('home_app\.analysis_in_progress'/);
  const js = read("match-page.js");
  // Page match V8 (16/09/2026) : « L'avis IASHARK », meme etat neutre en tete des cas sans pari.
  assert.match(js, /if\(!r\)\{[\s\S]{0,400}const msg=raw\.has_signal===true&&raw\.no_signal!==true\s*\?t\('match_page\.sig_premium_updating'/);
  assert.ok(js.indexOf("match_page.sig_premium_updating") < js.indexOf("match_page.signal_unavailable_fallback"), "l'etat neutre passe avant \"aucun marche\"");
  for (const loc of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(read("i18n/dict/" + loc + ".json"));
    assert.ok(d.home_app.premium_detail_updating, loc + " home_app.premium_detail_updating");
    assert.ok(d.match_page.sig_premium_updating, loc + " match_page.sig_premium_updating");
  }
});

// historique.json n'est pas publie par scripts/build-public.js : l'accueil le
// demandait quand meme (404 + erreur console en production, 14/09/2026).
test("accueils : ne demandent plus historique.json", () => {
  for (const f of ["index.html", "fr/index.html", "gb/index.html", "mx/index.html", "za/index.html", "en/index.html", "es/index.html", "de/index.html", "it/index.html", "pt/index.html"]) {
    assert.doesNotMatch(read(f), /fetch\(['"]\/historique\.json/, f);
  }
  assert.doesNotMatch(read("scripts/build-public.js"), /"historique\.json"/, "historique.json reste hors de dist/");
});

test("migrations : colonne premium_fields et archive sans pari en attente pour anon", () => {
  assert.match(read("supabase/migrations/0020_premium_fields_payload.sql"), /add column if not exists premium_fields jsonb/);
  const m = read("supabase/migrations/0021_predictions_archive_hide_pending.sql");
  assert.match(m, /drop policy if exists predictions_archive_select_public/);
  assert.match(m, /using \(result not in \('scheduled', 'pending'\)\)/);
});
