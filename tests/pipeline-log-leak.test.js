"use strict";
// Journaux GitHub Actions du pipeline : le depot est PUBLIC, les journaux des
// executions aussi. Le 16/09/2026, chaque match imprimait conf,
// model_probability, edge et le pari recommande ("OK conf=... pari=..."), la
// selection SAFE_PICK et le top 3 des marches avec probabilite et cote : toute
// la donnee premium etait lisible sans abonnement.
//
// Ce test lit le TEXTE SOURCE reel du script (heredoc pipeline.js de
// .github/workflows/update-data.yml), isole chaque appel console.* et echoue si
// l'un d'eux reference une donnee de pari d'un match : pari, cote recommandee,
// probabilite, conf, ecart, Kelly/mise, selection, lambdas du modele.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const WF = path.join(__dirname, "..", ".github", "workflows", "update-data.yml");

function pipelineScript() {
  const lines = fs.readFileSync(WF, "utf8").split("\n");
  const start = lines.findIndex((l) => /cat > pipeline\.js << 'JSEOF'/.test(l));
  assert.ok(start !== -1, "heredoc pipeline.js introuvable");
  const out = [];
  for (let i = start + 1; i < lines.length && !/^ {10}JSEOF\s*$/.test(lines[i]); i++) out.push({ n: i + 1, text: lines[i] });
  return out;
}

// Appels console.* complets (parentheses equilibrees, chaines sautees).
function consoleCalls(src) {
  const calls = [];
  const re = /console\.(log|warn|error|info|debug)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, depth = 1, quote = null;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (quote) {
        if (c === "\\") { i++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") quote = c;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    calls.push({ at: m.index, text: src.slice(m.index, i) });
    re.lastIndex = i;
  }
  return calls;
}
// Code hors litteraux de chaine : un mot dans un message fixe n'est pas une fuite.
function codeOnly(call) {
  return call.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''");
}

const FORBIDDEN_PROPS = /\.(conf|conf_bucket|model_probability|model_probability_pct|edge|kelly|mise|pari_rec|cote_rec|cote|decimal_odds|prob|probability|selection|lambdaH|lambdaA|lambda_h|lambda_a|markets_compared\s*\[|value_edge|vbet)\b(?!\s*\()/;
const FORBIDDEN_IDS = /\b(edgeVal|kellyVal|pickedMarket|valeurDe|safePick|lignePremiumSafePick)\b/;

function offenders(src) {
  return consoleCalls(src).filter((c) => {
    const code = codeOnly(c.text);
    return FORBIDDEN_PROPS.test(code) || FORBIDDEN_IDS.test(code);
  });
}

test("pipeline : aucun console.* ne journalise le pari, la cote, la probabilite, conf, edge ou Kelly d'un match", () => {
  const lines = pipelineScript();
  const src = lines.map((l) => l.text).join("\n");
  const bad = offenders(src).map((c) => {
    const lineNo = lines[src.slice(0, c.at).split("\n").length - 1].n;
    return "update-data.yml:" + lineNo + "  " + c.text.slice(0, 160);
  });
  assert.deepEqual(bad, [], "journaux publics avec une donnee de pari");
  // Garde-fou : le test lit bien le vrai script (plusieurs dizaines d'appels).
  assert.ok(consoleCalls(src).length > 50);
});

test("detecteur : reconnait les fuites historiques et ignore les messages fixes", () => {
  const leaks = [
    "console.log('  OK conf(legacy,=model_probability/10)='+matchObj.conf+' model_probability='+matchObj.model_probability+' edge='+edgeVal+' pari='+matchObj.pari_rec);",
    "console.log('  [SELECTION] top='+eligibleMarkets.slice(0,3).map(function(m){return m.id+':'+m.prob.toFixed(1)+'%@'+m.cote;}).join(', '));",
    "console.log('SAFE_PICK_OF_THE_DAY='+(x.status==='SELECTED'?(x.league+'/'+x.selection):x.status));",
    "console.log(' : '+matchCibleSafePick.pari_rec+' @ '+matchCibleSafePick.cote_rec);",
    "console.log('  [WC] '+lambdas.lambdaH);",
  ];
  leaks.forEach((l) => assert.equal(offenders(l).length, 1, l));
  const safe = [
    "console.log('  OK fixture '+f.id+' analyse='+(matchObj.no_signal?'sans_signal':'signal'));",
    "console.log('  model_probability et conf ne sont jamais journalises');",
    "console.log('SAFE_PICK_OF_THE_DAY='+runOutput.SAFE_PICK_OF_THE_DAY.status);",
    "console.log('  [API_STATS] API_CALLS='+API_FETCHER.stats.calls);",
  ];
  safe.forEach((l) => assert.equal(offenders(l).length, 0, l));
});
