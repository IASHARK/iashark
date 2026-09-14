"use strict";
// /api/geo (netlify/edge-functions/geo.ts) : logique pure extraite dans
// netlify/edge-functions/lib/geo-payload.mjs. Jamais d'IP, de coordonnees ni
// de code postal ; reponse jamais mise en cache ; declaration Netlify et CSP.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const load = () => import(pathToFileURL(path.join(root, "netlify/edge-functions/lib/geo-payload.mjs")).href);

// Forme de context.geo documentee par Netlify (valeurs inventees).
const NETLIFY_GEO = {
  city: "Lyon",
  country: { code: "FR", name: "France" },
  subdivision: { code: "ARA", name: "Auvergne-Rhône-Alpes" },
  timezone: "Europe/Paris",
  latitude: 45.75,
  longitude: 4.85,
  postalCode: "69001",
  ip: "203.0.113.7",
};

test("geoPayload : seulement pays, nom du pays, region, ville, fuseau", async () => {
  const { geoPayload } = await load();
  const out = geoPayload(NETLIFY_GEO);
  assert.deepEqual(out, { country: "FR", countryName: "France", subdivision: "Auvergne-Rhône-Alpes", city: "Lyon", timezone: "Europe/Paris" });
  const json = JSON.stringify(out);
  for (const forbidden of ["203.0.113.7", "69001", "45.75", "4.85", "latitude", "longitude", "postal", "ip"]) {
    assert.ok(!json.includes('"' + forbidden) && !json.includes(forbidden + '"') && !json.includes(forbidden), "jamais " + forbidden);
  }
});

test("geoPayload : valeurs absentes, invalides ou hostiles => null ou nettoyees", async () => {
  const { geoPayload } = await load();
  const empty = { country: null, countryName: null, subdivision: null, city: null, timezone: null };
  assert.deepEqual(geoPayload(undefined), empty);
  assert.deepEqual(geoPayload("pas un objet"), empty);
  assert.deepEqual(geoPayload({ country: "FR", city: 42, timezone: "Europe/Paris; drop" }), empty);
  const dirty = geoPayload({ city: '  <script>alert("x")</script>  Paris\n', country: { code: "fra", name: "X".repeat(200) }, subdivision: { name: "" }, timezone: "America/Argentina/Buenos_Aires" });
  assert.equal(dirty.city, "scriptalert(x)/script Paris");
  assert.equal(dirty.country, null, "code pays sur 2 lettres uniquement");
  assert.equal(dirty.countryName.length, 60);
  assert.equal(dirty.subdivision, null);
  assert.equal(dirty.timezone, "America/Argentina/Buenos_Aires");
  assert.equal(geoPayload({ country: { code: "mx" } }).country, "MX");
});

test("geoResponse : GET/HEAD 200 sans cache, autres methodes 405", async () => {
  const { geoResponse, GEO_HEADERS } = await load();
  const ok = geoResponse("GET", NETLIFY_GEO);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers["Cache-Control"], "private, no-store");
  assert.match(ok.headers["Content-Type"], /^application\/json/);
  assert.equal(JSON.parse(ok.body).city, "Lyon");
  assert.equal(geoResponse("HEAD", NETLIFY_GEO).body, null);
  const post = geoResponse("POST", NETLIFY_GEO);
  assert.equal(post.status, 405);
  assert.equal(post.headers["Cache-Control"], "private, no-store");
  assert.ok(!post.body.includes("Lyon"));
  assert.ok(Object.isFrozen(GEO_HEADERS));
});

test("geo.ts : utilise la logique pure, aucun journal, aucune IP lue", () => {
  const ts = read("netlify/edge-functions/geo.ts");
  assert.match(ts, /import \{ geoResponse \} from "\.\/lib\/geo-payload\.mjs";/);
  assert.match(ts, /export default/);
  assert.ok(!/console\.|context\.ip|x-forwarded-for|x-nf-client-connection-ip|Deno\.env|fetch\(/i.test(ts.replace(/\/\/.*$/gm, "")), "ni log, ni IP, ni appel externe");
  const lib = read("netlify/edge-functions/lib/geo-payload.mjs").replace(/\/\/.*$/gm, "");
  assert.ok(!/\.ip\b|latitude|longitude|postalCode|console\./.test(lib), "la logique ne lit jamais ip / coordonnees / code postal");
});

test("sources lisibles : aucun caractere de controle brut (NUL...) dans les fichiers du suivi et du tableau de bord", () => {
  const c = (n) => String.fromCharCode(n);
  const raw = new RegExp("[" + c(0) + "-" + c(8) + c(11) + c(12) + c(14) + "-" + c(31) + c(127) + "]");
  for (const rel of ["funnel-track.js", "netlify/edge-functions/lib/geo-payload.mjs", "netlify/edge-functions/geo.ts", "admin-dashboard.js", "admin.html", "assets/admin.css", "supabase/migrations/0022_admin_geo_city.sql"]) {
    assert.ok(!raw.test(read(rel)), rel + " : ecrire \\u0000 en toutes lettres, jamais le caractere brut");
  }
});

test("netlify.toml declare /api/geo ; connect-src 'self' couvre l'appel ; hors dist/", () => {
  const toml = read("netlify.toml");
  assert.match(toml, /\[\[edge_functions\]\]\s+path = "\/api\/geo"\s+function = "geo"/);
  assert.match(toml, /publish = "dist"/);
  assert.match(read("_headers"), /connect-src 'self'/);
  assert.ok(!/netlify\//.test(read("scripts/build-public.js").match(/const PUBLIC_DIRS = \[[^\]]*\]/)[0]), "le code de la fonction n'est jamais publie comme fichier statique");
  assert.match(read("funnel-track.js"), /fetch\("\/api\/geo"/);
});
