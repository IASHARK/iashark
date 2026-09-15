"use strict";
// Consommation Netlify (16/09/2026) : le compte a ete coupe le 15/09 pour
// « usage_exceeded » (bande passante, invocations, builds). Gardes :
//   - data.json (~13 Mo) n'est plus publie ni lu en ligne (front, fonction Edge
//     match-data, surveillance, E2E) ;
//   - surveillance allegee (site-health toutes les 6 h, echantillon reduit) ;
//   - E2E production hors push (manuel + hebdomadaire) ;
//   - deploiement saute quand un commit ne touche aucun fichier publie
//     (scripts/netlify-ignore.sh), et ce filtre couvre bien tout dist/ ;
//   - cache court sur les donnees regenerees (_headers).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\'"])\/\/.*$/gm, "$1").replace(/^\s*#.*$/gm, "");

function walk(dir, out) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = path.posix.join(dir, name);
    const st = fs.statSync(path.join(root, rel));
    if (st.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}

test("data.json : plus aucune lecture en ligne (front, fonction Edge, surveillance, workflows, E2E)", () => {
  const files = ["index.html", "match.html", "marches.html", "exemple-analyse.html", "blog.html", "admin.html",
    "match-page.js", "player-page.js", "tools-page.js", "admin-dashboard.js", "app-client.js", "home-list.js",
    "supabase/functions/match-data/index.ts", "scripts/site-health-check.js", "scripts/health-check.js",
    "tests/e2e/helpers/site-data.js", "tests/e2e/production.spec.js"]
    .concat(walk(".github/workflows", []), walk("lib/health", []));
  const online = /(iashark\.com|BASE|base|baseURL[^)]*\)|request\.get\(|fetch\(\s*)['"`+\s]*\/data\.json/;
  for (const f of files) {
    const code = noComments(read(f));
    assert.doesNotMatch(code, online, f + " lit data.json en ligne");
    assert.doesNotMatch(code, /["'`]\/data\.json["'`]/, f + " reference /data.json");
  }
  const fn = noComments(read("supabase/functions/match-data/index.ts"));
  assert.doesNotMatch(fn, /DATA_URL/);
  const bp = read("scripts/build-public.js");
  assert.doesNotMatch(bp.slice(bp.indexOf("const PUBLIC_ROOT_FILES"), bp.indexOf("];", bp.indexOf("const PUBLIC_ROOT_FILES"))), /"data\.json"/);
  assert.match(bp, /const NEVER_PUBLISH = \/\^\(historique\|data\)\\\.json\$\/;/);
  // actus.json / transferts.json restent publies : lus par le fil du blog.
  assert.match(read("blog/index.html"), /fetch\('\/transferts\.json'\)/);
  assert.match(read("blog/index.html"), /fetch\('\/actus\.json'\)/);
});

test("surveillance allegee : site-health toutes les 6 h, echantillon reduit, health-check sans data.json", () => {
  const wf = read(".github/workflows/site-health.yml");
  assert.match(wf, /- cron: '15 \*\/6 \* \* \*'/);
  assert.doesNotMatch(wf, /\*\/2 \* \* \*|data_json|--data-json/);
  const shc = read("scripts/site-health-check.js");
  assert.match(shc, /const DETAIL_SAMPLE_SIZE = 3;/);
  const pages = shc.slice(shc.indexOf("const PAGES = ["), shc.indexOf("];", shc.indexOf("const PAGES = [")));
  assert.ok((pages.match(/\["\//g) || []).length <= 5, "5 pages au plus");
  const hc = require("../scripts/health-check.js");
  assert.equal(hc.parseArgs([]).details, 3);
});

test("E2E production : plus au push (manuel + hebdomadaire) ; E2E local toujours au push", () => {
  const wf = read(".github/workflows/e2e.yml");
  const prod = wf.slice(wf.indexOf("\n  production:"));
  const local = wf.slice(wf.indexOf("\n  local:"), wf.indexOf("\n  production:"));
  assert.match(prod, /if: github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.target != 'local'\)/);
  assert.doesNotMatch(prod.split("\n").find((l) => /^\s+if:/.test(l)), /push/);
  assert.match(wf, /schedule:\n\s+# [^\n]*\n\s+- cron: '40 6 \* \* 0'/);
  assert.match(local, /if: github\.event_name == 'push' \|\| github\.event_name == 'pull_request'/);
});

test("_headers : cache court sur les donnees regenerees, jamais immutable", () => {
  const h = read("_headers");
  assert.match(h, /\n\/data-home\.json\n  X-Robots-Tag: noindex\n  Cache-Control: public, max-age=120, stale-while-revalidate=600\n/);
  assert.match(h, /\n\/match\/\*\n  Cache-Control: public, max-age=120, stale-while-revalidate=600\n/);
  assert.match(h, /\n\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable\n/);
  assert.doesNotMatch(h, /\n\/data\.json\n/);
});

// --- Filtre de deploiement Netlify -------------------------------------------------
function sh(cwd, cmd, env) {
  return spawnSync("bash", ["-c", cmd], { cwd, encoding: "utf8", env: Object.assign({}, process.env, env || {}) });
}

test("netlify.toml : ignore = scripts/netlify-ignore.sh ; saute docs/tests, construit site, construit sans reference", () => {
  assert.match(read("netlify.toml"), /\n  ignore = "bash scripts\/netlify-ignore\.sh"\n/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-netlify-ignore-"));
  try {
    const git = (c) => { const r = sh(dir, "git -c user.email=t@t -c user.name=t " + c); assert.equal(r.status, 0, c + " : " + r.stderr); return r.stdout.trim(); };
    git("init -q");
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.copyFileSync(path.join(root, "scripts/netlify-ignore.sh"), path.join(dir, "scripts/netlify-ignore.sh"));
    const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
    put("index.html", "a"); put("docs/x.md", "a"); put("tests/a.test.js", "a"); put("fr/index.html", "a"); put("raw_api/x.json", "a");
    git("add -A"); git("commit -qm c0");
    const c0 = git("rev-parse HEAD");
    const decide = (base, head) => sh(dir, "bash scripts/netlify-ignore.sh", { CACHED_COMMIT_REF: base, COMMIT_REF: head }).status;
    put("docs/x.md", "b"); put("tests/a.test.js", "b"); put("raw_api/x.json", "b"); put(".github/workflows/w.yml", "b"); put("README.md", "b");
    git("add -A"); git("commit -qm docs");
    const c1 = git("rev-parse HEAD");
    assert.equal(decide(c0, c1), 0, "docs/tests/workflows/raw_api seulement : deploiement saute");
    put("fr/index.html", "b"); git("add -A"); git("commit -qm site");
    const c2 = git("rev-parse HEAD");
    assert.equal(decide(c1, c2), 1, "page publiee modifiee : build");
    put("home-list.js", "b"); git("add -A"); git("commit -qm js");
    assert.equal(decide(c2, git("rev-parse HEAD")), 1, "JS racine publie : build");
    put("lib/x.js", "b"); git("add -A"); git("commit -qm lib");
    const c4 = git("rev-parse HEAD");
    put("netlify.toml", "b"); git("add -A"); git("commit -qm toml");
    assert.equal(decide(c4, git("rev-parse HEAD")), 1, "configuration du build : build");
    assert.equal(decide("", c2), 1, "premier build (pas de reference) : build");
    assert.equal(decide(c2, c2), 1, "relance du meme commit : build");
    assert.equal(decide("0123456789abcdef0123456789abcdef01234567", c2), 1, "reference introuvable : build");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("netlify-ignore.sh couvre chaque fichier de dist/ (liste construite depuis scripts/build-public.js)", () => {
  const { buildSite } = require("./helpers/built-site.js");
  const site = buildSite();
  try {
    const specs = sh(root, "bash scripts/netlify-ignore.sh --list").stdout.trim().split("\n");
    const covered = (rel) => specs.some((s) => {
      const g = s.match(/^:\(glob\)\*(\.[a-z0-9]+)$/);
      if (g) return !rel.includes("/") && rel.endsWith(g[1]);
      return rel === s || rel.startsWith(s + "/");
    });
    const files = [];
    (function w(d) {
      for (const n of fs.readdirSync(path.join(site.dir, d))) {
        const rel = d ? d + "/" + n : n;
        if (fs.statSync(path.join(site.dir, rel)).isDirectory()) w(rel); else files.push(rel);
      }
    })("");
    assert.ok(files.length > 500 && files.includes("index.html") && files.includes("data-home.json"), "site construit incomplet (" + files.length + " fichiers)");
    const missing = files.filter((f) => !covered(f));
    assert.deepEqual(missing.slice(0, 20), [], "fichiers publies hors du filtre de deploiement");
    assert.ok(!files.includes("data.json"), "data.json publie");
  } finally {
    site.cleanup();
  }
});
