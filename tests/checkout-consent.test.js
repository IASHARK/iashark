"use strict";
// Consentement obligatoire avant paiement : CGV + demande d'execution
// immediate (selon le marche) sur CHAQUE point d'entree du checkout, et refus
// serveur (create-checkout-session) sans ce consentement.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];

function loadLib() {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("lib/checkout-consent.js"), ctx);
  return ctx.IasharkCheckoutConsent;
}
const lib = loadLib();
const serverConsent = () => import(pathToFileURL(path.join(ROOT, "supabase/functions/create-checkout-session/consent.ts")).href);

test("regime par marche : EU/UK/ZA exigent la 2e case, MX non", () => {
  assert.equal(lib.regimeFor("fr").id, "eu");
  assert.equal(lib.regimeFor("").id, "eu", "page racine = marche EUR");
  assert.equal(lib.regimeFor("xx").id, "eu", "marche inconnu = regime le plus protecteur");
  assert.equal(lib.regimeFor("gb").id, "uk");
  assert.equal(lib.regimeFor("za").id, "za");
  assert.equal(lib.regimeFor("mx").id, "mx");
  for (const m of ["fr", "gb", "za"]) assert.equal(lib.regimeFor(m).waiverRequired, true, m);
  assert.equal(lib.regimeFor("mx").waiverRequired, false);
});

test("le navigateur et le serveur appliquent les memes regimes", async () => {
  const srv = await serverConsent();
  for (const m of ["fr", "gb", "za", "mx", "", "xx"]) {
    assert.equal(lib.regimeFor(m).id, srv.regimeForMarket(m).id, "regime " + m);
    assert.equal(lib.regimeFor(m).waiverRequired, srv.regimeForMarket(m).waiverRequired, "waiver " + m);
  }
});

test("le bloc rend les cases obligatoires, jamais pre-cochees, avec liens CGV et confidentialite", () => {
  const dict = JSON.parse(read("i18n/dict/en.json")).checkout_consent;
  const t = (k) => dict[k];
  const hrefs = { terms: "/gb/cgv.html", privacy: "/gb/confidentialite.html" };
  // Une seule case partout depuis le 19/09/2026 : CGV + demande de debut
  // immediat en toutes lettres dans la meme case (eu/uk/za).
  for (const [market, boxes] of [["fr", 1], ["gb", 1], ["za", 1], ["mx", 1]]) {
    const html = lib.buildHtml(lib.regimeFor(market), t, hrefs, "T");
    assert.equal((html.match(/type="checkbox"/g) || []).length, boxes, market + " : nombre de cases");
    assert.equal((html.match(/ required /g) || []).length, boxes, market + " : cases requises");
    assert.ok(!/\bchecked\b/.test(html), market + " : case pre-cochee");
    assert.ok(html.includes('href="/gb/cgv.html"'), market + " : lien CGV");
    assert.ok(html.includes('href="/gb/confidentialite.html"'), market + " : lien confidentialite");
    assert.ok(!html.includes("{terms}") && !html.includes("{privacy}"), market + " : placeholder non remplace");
  }
  assert.ok(lib.buildHtml(lib.regimeFor("mx"), t, hrefs).includes('class="iash-consent-info"'), "mx : ligne d'information");
  assert.ok(lib.buildHtml(lib.regimeFor("gb"), t, hrefs).includes(dict.waiver_uk));
  assert.ok(lib.buildHtml(lib.regimeFor("za"), t, hrefs).includes(dict.waiver_za));
  assert.ok(lib.buildHtml(lib.regimeFor("fr"), t, hrefs).includes(dict.waiver_eu));
  // La case unique porte les deux accords (eu/uk/za), jamais pour mx.
  for (const market of ["fr", "gb", "za"]) assert.match(lib.buildHtml(lib.regimeFor(market), t, hrefs), /data-consent="terms" data-consent-with="waiver"/, market);
  assert.doesNotMatch(lib.buildHtml(lib.regimeFor("mx"), t, hrefs), /data-consent-with/);
});

test("les textes du dictionnaire sont echappes (aucune injection HTML)", () => {
  const html = lib.buildHtml(lib.regimeFor("fr"), (k) => (k === "title" ? "<img src=x onerror=alert(1)>" : "x {terms} {privacy}"), { terms: "/cgv.html", privacy: "/confidentialite.html" });
  assert.ok(!html.includes("<img"), "HTML non echappe");
});

test("sans les cases, le paiement est bloque ; le payload suit le regime", () => {
  const eu = lib.regimeFor("fr"), mx = lib.regimeFor("mx");
  assert.deepEqual([...lib.missing({ terms: false, waiver: false }, eu)], ["terms", "waiver"]);
  assert.deepEqual([...lib.missing({ terms: true, waiver: false }, eu)], ["waiver"]);
  assert.deepEqual([...lib.missing({ terms: true, waiver: true }, eu)], []);
  assert.deepEqual([...lib.missing({ terms: false }, mx)], ["terms"]);
  assert.deepEqual([...lib.missing({ terms: true }, mx)], []);
  const p = lib.buildPayload({ terms: true, waiver: true }, eu, { locale: "en", dir: "", ts: "2026-09-13T00:00:00.000Z" });
  assert.deepEqual({ ...p }, { terms: true, waiver: true, terms_version: lib.termsVersionFor(""), locale: "en", dir: "", ts: "2026-09-13T00:00:00.000Z" });
  // 19/09/2026 : les CGV des 9 versions (et des pages racine, francaises) changent
  // ensemble -> une seule version, sans surcharge par repertoire.
  // 21/09/2026 : /en/ change seul (ouverture de l'hebdomadaire a 4,99 USD) ->
  // surcharge par repertoire, les 8 autres versions gardent celle du 19/09.
  assert.equal(lib.TERMS_VERSION, "2026-09-19");
  assert.deepEqual({ ...lib.TERMS_VERSIONS }, { en: "2026-09-21" });
  for (const d of ["", "fr", "es", "de", "it", "pt", "gb", "za", "mx"]) assert.equal(lib.termsVersionFor(d), "2026-09-19", d || "racine");
  assert.equal(lib.termsVersionFor("en"), "2026-09-21", "/en/ : version propre");
  assert.equal(lib.buildPayload({ terms: true, waiver: true }, eu, { dir: "fr" }).terms_version, "2026-09-19");
  assert.equal(lib.buildPayload({ terms: true, waiver: true }, lib.regimeFor("us"), { dir: "en" }).terms_version, "2026-09-21", "/en/ (marche us) : version du 21/09");
  assert.equal(lib.buildPayload({ terms: true, waiver: true }, mx, {}).waiver, null, "mx : aucune renonciation envoyee");
  assert.match(lib.TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test("les 7 dictionnaires portent tous les textes du consentement", () => {
  const keys = new Set(["title", "terms_link", "privacy_link", "error_required", "error_load", "required"]);
  for (const r of Object.values(lib.REGIMES)) for (const k of [r.termsKey, r.waiverKey, r.infoKey]) if (k) keys.add(k);
  for (const loc of LOCALES) {
    const part = JSON.parse(read("i18n/parts/checkout." + loc + ".json")).checkout_consent;
    const dict = JSON.parse(read("i18n/dict/" + loc + ".json")).checkout_consent;
    assert.ok(dict, loc + " : merge-i18n-parts.js non lance");
    for (const k of keys) {
      assert.ok(typeof part[k] === "string" && part[k].trim(), loc + " : " + k + " manquant");
      assert.equal(dict[k], part[k], loc + " : dictionnaire pas a jour pour " + k);
    }
    for (const k of ["terms_label", "terms_label_recurring"]) {
      assert.ok(part[k].includes("{terms}") && part[k].includes("{privacy}"), loc + " : " + k + " sans liens");
    }
  }
});

// Ordre dans le code source : verification du consentement AVANT l'appel a
// create-checkout-session, et consentement envoye dans le corps.
const ENTRY_POINTS = {
  "abonnement-page.js": { html: "abonnement.html" },
  "account-page.js": { html: "compte.html" },
  "gb/gb-page.js": { html: "gb/landing.html", market: "gb" },
  "za/za-page.js": { html: "za/landing.html", market: "za" },
  "mx/mx-page.js": { html: "mx/landing.html", market: "mx" },
};

test("chaque point d'entree du checkout verifie le consentement avant d'appeler Stripe", () => {
  for (const [file, conf] of Object.entries(ENTRY_POINTS)) {
    const js = read(file);
    // account-page.js appelle la fonction par nom : '/functions/v1/' + fonction.
    const fetchAt = file === "account-page.js"
      ? js.indexOf("'/functions/v1/' + fonction")
      : js.indexOf("/functions/v1/create-checkout-session");
    assert.ok(fetchAt > 0, file + " : appel checkout introuvable");
    const checkAt = js.indexOf(".check()");
    assert.ok(checkAt > 0 && checkAt < fetchAt, file + " : .check() doit preceder l'appel au checkout");
    assert.match(js, /\.mount\(/, file + " : bloc de consentement non monte");
    assert.match(js, /\/lib\/checkout-consent\.js/, file + " : pas de chargement du module");
    assert.match(js, /consent(ement)?(Paiement)?\.payload\(\)/, file + " : consentement non envoye");
    assert.match(js, /consent_required|consentement\.check\(\)/, file + " : refus serveur non gere");
    // Echec de chargement du module = aucun paiement (fail closed).
    assert.match(js, conf.market ? /if \(!consent\) \{\s*show\(/ : /error_load/, file + " : echec de chargement non bloque");
    if (conf.market) {
      assert.ok(js.includes('consent: consent.payload()'), file + " : corps sans consent");
      assert.ok(js.indexOf("checkout_started") > checkAt, file + " : checkout_started avant le consentement");
    }
    const html = read(conf.html);
    assert.match(html, /<script src="\/lib\/checkout-consent\.js"><\/script>/, conf.html + " : module non charge");
    assert.ok(html.indexOf("/lib/checkout-consent.js") < html.indexOf("/" + file.replace(/^.*\//, "")), conf.html + " : module charge apres le script de page");
  }
  // Conteneurs explicites (le compte le rend en JS, abonnement le cree au besoin).
  for (const d of ["gb", "za", "mx"]) assert.match(read(d + "/landing.html"), /id="checkoutConsent"/, d);
  assert.match(read("account-page.js"), /id="checkoutConsent"/);
  assert.match(read("abonnement-page.js"), /checkoutConsent/);
});

test("abonnement : bouton verrouille des le rendu, chargements paralleles, dictionnaire partage avec l'en-tete", () => {
  const html = read("abonnement.html");
  const btn = (html.match(/<button[^>]*id="subscribeButton"[^>]*>/) || [""])[0];
  assert.match(btn, /aria-disabled="true"/, "bouton actif avant le chargement du consentement");
  assert.match(btn, /class="[^"]*\biash-consent-locked\b/);
  assert.match(btn, /data-i18n-attr="title:common\.loading"/, "infobulle de chargement localisee");
  assert.ok(html.indexOf('id="checkoutConsent"') !== -1 && html.indexOf('id="checkoutConsent"') < html.indexOf('id="subscribeButton"'), "emplacement du consentement reserve avant le bouton");
  assert.match(html, /#checkoutConsent:not\(\.iash-consent\)\{[^}]*min-height:/, "hauteur du bloc de consentement non reservee");
  // 25/09/2026 : repertoires publics seulement (de/it/pt retires, 301 vers /en/).
  for (const d of require("./helpers/public-dirs.js").PUBLIC_DIRS) {
    const page = read(d + "/abonnement.html");
    assert.match((page.match(/<button[^>]*id="subscribeButton"[^>]*>/) || [""])[0], /aria-disabled="true"/, d + "/abonnement.html non regenere");
  }
  const js = read("abonnement-page.js");
  assert.match(js, /Promise\.all\(\[i18n,IasharkApp\.context\(\)\]\)/, "dictionnaire et session charges l'un apres l'autre");
  // Pro : bouton deverrouille (aucun consentement monte).
  const pro = js.slice(js.indexOf("if(ctx.isPro)"), js.indexOf("return;}", js.indexOf("if(ctx.isPro)")));
  assert.match(pro, /unlock\(\)/, "Pro : bouton laisse verrouille");
  const i18n = read("i18n/i18n.js");
  assert.match(i18n, /loadDict: loadDict/, "cache du dictionnaire non expose");
  assert.match(read("auth-header.js"), /I\.loadDict\(locale\)/, "auth-header.js retelecharge le dictionnaire");
});

test("serveur : refuse sans CGV, refuse sans 2e case hors MX, accepte MX sans renonciation", async () => {
  const srv = await serverConsent();
  const ts = "2026-09-13T12:00:00.000Z";
  for (const m of ["fr", "gb", "za", "mx", undefined]) {
    assert.equal(srv.validateConsent(undefined, m, ts).ok, false, "absent " + m);
    assert.equal(srv.validateConsent({ terms: "true", waiver: true }, m, ts).ok, false, "terms non booleen " + m);
    assert.equal(srv.validateConsent({ terms: false, waiver: true }, m, ts).code, "consent_required");
  }
  for (const m of ["fr", "gb", "za", undefined]) {
    const r = srv.validateConsent({ terms: true, waiver: false }, m, ts);
    assert.equal(r.ok, false, m);
    assert.deepEqual(r.missing, ["waiver"]);
    assert.equal(srv.validateConsent({ terms: true, waiver: null }, m, ts).ok, false, m);
  }
  const mx = srv.validateConsent({ terms: true, waiver: null, terms_version: "2026-09-13", locale: "es-mx", dir: "mx", ts }, "mx", ts);
  assert.equal(mx.ok, true);
  assert.equal(mx.metadata.consent_waiver, "null");
  const gb = srv.validateConsent({ terms: true, waiver: true, terms_version: "<script>2026-09-13", locale: "en", dir: "gb", ts }, "gb", ts);
  assert.equal(gb.ok, true);
  assert.equal(gb.metadata.consent_terms, "true");
  assert.equal(gb.metadata.consent_waiver, "true");
  assert.equal(gb.metadata.consent_regime, "uk");
  assert.equal(gb.metadata.consent_terms_version, "script2026-09-13", "valeur nettoyee");
  assert.equal(gb.metadata.consent_server_ts, ts);
  for (const v of Object.values(gb.metadata)) assert.ok(typeof v === "string" && v.length <= 500, "metadata Stripe invalide");
  assert.ok(Object.keys(gb.metadata).every((k) => k.length <= 40), "cle metadata Stripe > 40 caracteres");
  // CGV du 19/09/2026 : le consentement construit par le navigateur (version
  // courante, case unique) est accepte tel quel pour chaque marche payable, la
  // version est tracee sans modification (consent.ts ne filtre aucune version).
  for (const [market, dir] of [[undefined, ""], [undefined, "fr"], ["us", "en"], ["gb", "gb"], ["za", "za"], ["mx", "mx"]]) {
    const payload = lib.buildPayload({ terms: true, waiver: true }, lib.regimeFor(market || "fr"), { dir, locale: "fr", ts });
    const r = srv.validateConsent(JSON.parse(JSON.stringify(payload)), market, ts);
    const attendue = dir === "en" ? "2026-09-21" : "2026-09-19";
    assert.equal(r.ok, true, (market || "defaut") + " : consentement de la version " + attendue + " refuse");
    assert.equal(r.metadata.consent_terms_version, attendue, market || "defaut");
  }
});

test("create-checkout-session : 400 consent_required traduit, consentement stocke dans Stripe", () => {
  const src = read("supabase/functions/create-checkout-session/index.ts");
  assert.match(src, /import \{ validateConsent \} from "\.\/consent\.ts";/);
  const disabledAt = src.indexOf('PAYMENT_PROVIDER !== "stripe"');
  const validateAt = src.indexOf("validateConsent(requestedConsent");
  const sessionAt = src.indexOf("stripe.checkout.sessions.create");
  assert.ok(disabledAt > 0 && disabledAt < validateAt, "le chemin paiement desactive doit rester inchange (avant le consentement)");
  assert.ok(validateAt < sessionAt, "consentement verifie avant la creation de session");
  assert.ok(validateAt < src.indexOf("auth.getUser()"), "consentement verifie avant tout appel reseau");
  const refus = src.slice(validateAt, validateAt + 900);
  assert.match(refus, /status: 400/);
  assert.match(refus, /code: consent\.code/);
  assert.match(refus, /msg\(MESSAGES, "consent_required", pickLocale\(req, requestedLocale\)\)/);
  const bloc = src.slice(sessionAt, sessionAt + 900);
  assert.match(bloc, /metadata: \{ market: usedMarket, plan: "pro", interval: usedInterval, \.\.\.consent\.metadata \}/);
  assert.match(bloc, /subscription_data: \{ metadata: \{ market: usedMarket, plan: "pro", interval: usedInterval, \.\.\.consent\.metadata \} \}/);
  const table = src.slice(src.indexOf("consent_required: {"), src.indexOf("consent_required: {") + 1500);
  for (const loc of LOCALES) assert.match(table, new RegExp('(^|\\s|")' + loc.replace("-", "\\-") + '"?: "'), "message consent_required manquant en " + loc);
});
