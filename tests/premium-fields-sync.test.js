"use strict";
// Liste UNIQUE des champs premium (lib/premium-fields.js) et ses copies :
// fonction Edge match-data (Deno, copie litterale), pipeline, decoupage des
// fichiers publics, pages SEO, page Outils. Audit fuite du 14/09/2026.
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
  const publics = ["id", "home", "away", "date", "league", "league_key", "is_free", "conf", "has_signal", "no_signal", "no_signal_label",
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
  assert.equal(pub.conf, 6.9);
  assert.deepEqual(pub.fatigue, complet.fatigue, "fatigue.val est un fait, pas la cle premium val");
  const offert = Object.assign({}, complet, { is_free: true });
  assert.equal(PREMIUM.stripPremium(offert), offert, "le match offert reste complet");
  const payload = PREMIUM.premiumPayload(complet);
  assert.deepEqual(Object.keys(payload).sort(), ["btts", "p1", "paris_safe", "top_scorers"]);
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

test("pipeline : liste unique, premium_fields persistes, pages et historique assainis", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /var PREMIUM_FIELDS_LIB=require\('\.\/lib\/premium-fields\.js'\);/);
  assert.match(wf, /var CHAMPS_PREMIUM=PREMIUM_FIELDS_LIB\.PREMIUM_FIELDS\.slice\(\);/);
  assert.doesNotMatch(wf, /var CHAMPS_PREMIUM=\[/, "plus de liste litterale divergente");
  assert.match(wf, /r\.premium_fields=PREMIUM_FIELDS_LIB\.premiumPayload\(m\)/);
  const iPayload = wf.indexOf("r.premium_fields=PREMIUM_FIELDS_LIB.premiumPayload(m)");
  assert.ok(iPayload > wf.indexOf("(function designerMatchGratuit(){") && iPayload < wf.indexOf("await writePremiumData(premiumRows);"), "premium_fields calcule apres la designation et avant l'ecriture");
  assert.match(wf, /c\.raw_response=Object\.assign\(\{\},c\.raw_response\|\|\{\},\{premium_fields:c\.premium_fields\}\)/, "repli si la migration 0020 n'est pas appliquee");
  assert.match(wf, /PRELOADED_MATCH='\+JSON\.stringify\(PUBLIC_SPLIT\.toListMatch\(PREMIUM_FIELDS_LIB\.stripPremium\(m\)\)\)/);
  assert.match(wf, /fs\.writeFileSync\(histoPath,JSON\.stringify\(historiquePublic\(histo,matchsData\),null,2\)\);/);
  assert.match(wf, /fs\.writeFileSync\(histoPathEarly,JSON\.stringify\(historiquePublic\(histoEarly,\[\]\),null,2\)\);/);
  assert.equal((wf.match(/await rehydraterPredictionsMasquees\(/g) || []).length, 2, "rehydratation avant chaque reglement");
  assert.match(wf, /p\.fixture_id!=null&&p\.type==='single'&&!p\.redacted;/, "une prediction masquee n'ecrase jamais l'archive");
});

test("decoupage, script local et pages SEO utilisent la liste unique", () => {
  assert.equal(require("../lib/public-data-split.js").PREMIUM_FIELDS, PREMIUM.PREMIUM_FIELDS);
  assert.match(read("scripts/split-public-data.js"), /\.map\(PREMIUM\.stripPremium\)/);
  assert.match(read("scripts/seo-pages.js"), /PUBLIC_SPLIT\.toListMatch\(PREMIUM\.stripPremium\(m\)\)/);
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

test("page Outils : donnees de match seulement si le serveur confirme l'abonnement", () => {
  const js = read("tools-page.js");
  assert.match(js, /if \(!ctx\.isPro\) return Promise\.resolve\(null\)/);
  assert.match(js, /r\.data\.isPro !== true\) return null;/);
  assert.doesNotMatch(js, /fetch\(['"]\/?(data|data-home)\.json/, "la page Outils ne lit jamais un fichier public de matchs");
});

test("migrations : colonne premium_fields et archive sans pari en attente pour anon", () => {
  assert.match(read("supabase/migrations/0020_premium_fields_payload.sql"), /add column if not exists premium_fields jsonb/);
  const m = read("supabase/migrations/0021_predictions_archive_hide_pending.sql");
  assert.match(m, /drop policy if exists predictions_archive_select_public/);
  assert.match(m, /using \(result not in \('scheduled', 'pending'\)\)/);
});
