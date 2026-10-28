"use strict";
// RELANCE E-MAIL DU 28/10/2026 (envoi automatique a 11 h, heure de Paris) : qui recoit quoi.
// Test d'EXECUTION : la vraie fonction (supabase/functions/relance-emails/index.ts, types retires par
// node:module#stripTypeScriptTypes), avec une fausse base et un faux Brevo. Aucun appel reseau.
// Regles verifiees : partenaire (clic « Deposer ma candidature » 7 jours, sans ligne affiliates),
// aucun abonne en cours ni plan famille/pro pose a la main, ancien abonne sans essai, promesse
// « au plus un e-mail tous les 3 jours » (accueil exclu), desinscrits et rebonds ecartes, admin = test.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const NODE_MODULE = require("node:module");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "supabase/functions/relance-emails");
const SECRET = "s".repeat(40);
const JETON = "j".repeat(64);
const JOUR = 86400e3;
const il_y_a = (ms) => new Date(Date.now() - ms).toISOString();

function paquet() {
  const src = fs.readFileSync(path.join(DIR, "paquet.ts"), "utf8");
  const debut = src.indexOf("export const PAQUET = ") + "export const PAQUET = ".length;
  return JSON.parse(src.slice(debut, src.lastIndexOf(";")));
}

// Fausse base : comptes, preferences, abonnements, envois, clics, affiliés.
function base() {
  const U = (id, email, meta = {}) => ({ id, email, user_metadata: meta });
  const auth = [
    U("admin", "admin@exemple.fr"),
    U("part", "part@exemple.com", { iashark_locale: "en", iashark_market: "en" }),
    U("part-affilie", "pa@exemple.com", { iashark_locale: "en" }),
    U("part-vieux", "pv@exemple.fr", { iashark_locale: "fr", iashark_market: "fr" }),
    U("actif", "actif@exemple.fr"),
    U("impaye", "impaye@exemple.fr"),
    U("famille", "famille@exemple.fr"),
    U("pro-main", "promain@exemple.fr"),
    U("ancien", "ancien@exemple.es", { iashark_locale: "es", iashark_market: "es" }),
    U("accord-fr", "accord@exemple.fr", { iashark_locale: "fr" }),
    U("accord-recent", "recent@exemple.com", { iashark_locale: "en" }),
    U("accord-4j", "quatre@exemple.com", { iashark_locale: "en", iashark_market: "za" }),
    U("accueil-hier", "accueil@exemple.fr", { iashark_locale: "fr" }),
    U("desinscrit", "des@exemple.fr"),
    U("rebond", "rebond@exemple.fr"),
    U("invalide", "x@exemple.con"),
    U("gb", "gb@exemple.co.uk", { iashark_locale: "en", iashark_market: "gb" }),
    U("mx", "mx@exemple.mx", { iashark_locale: "es", iashark_market: "mx" }),
  ];
  return {
    auth,
    tables: {
      users: auth.map((u) => ({ id: u.id, role: u.id === "admin" ? "admin" : "customer",
        plan: { famille: "famille", "pro-main": "pro", part: "pro", actif: "pro", impaye: "pro" }[u.id] || "free" })),
      email_preferences: [
        { user_id: "part", marketing_opt_in: true, locale: "en", market: "en" },
        { user_id: "accord-fr", marketing_opt_in: true, locale: "fr", market: "fr" },
        { user_id: "accord-recent", marketing_opt_in: true, locale: "en", market: "en" },
        { user_id: "accord-4j", marketing_opt_in: true, locale: "en", market: "za" },
        { user_id: "accueil-hier", marketing_opt_in: false, locale: "fr", market: "fr" },
        { user_id: "desinscrit", marketing_opt_in: false, unsubscribed_at: il_y_a(JOUR), unsubscribe_source: "lien" },
      ],
      subscriptions: [
        { user_id: "part", status: "trialing" }, { user_id: "part-affilie", status: "trialing" },
        { user_id: "actif", status: "active" }, { user_id: "impaye", status: "past_due" }, { user_id: "ancien", status: "canceled" },
      ],
      email_sends: [
        { user_id: "accord-recent", campaign: "free_match", status: "sent", sent_at: il_y_a(2 * JOUR) },
        { user_id: "accord-4j", campaign: "pro_features", status: "sent", sent_at: il_y_a(4 * JOUR) },
        { user_id: "accueil-hier", campaign: "welcome", status: "sent", sent_at: il_y_a(JOUR) },
        { user_id: "rebond", campaign: "relance", status: "bounced", sent_at: il_y_a(8 * JOUR) },
      ],
      funnel_events: [
        { user_id: "part", event_type: "click", locale: "gb", metadata: { label: "account_partner_apply" }, created_at: il_y_a(3600e3) },
        { user_id: "part-affilie", event_type: "click", locale: "gb", metadata: { label: "account_partner_apply" }, created_at: il_y_a(2 * JOUR) },
        { user_id: "part-vieux", event_type: "click", locale: "fr", metadata: { label: "account_partner_apply" }, created_at: il_y_a(8 * JOUR) },
        { user_id: "admin", event_type: "click", locale: "fr", metadata: { label: "account_partner_apply" }, created_at: il_y_a(6 * JOUR) },
        { user_id: "gb", event_type: "click", locale: "gb", metadata: { label: "account_cta_other" }, created_at: il_y_a(3600e3) },
      ],
      affiliates: [{ user_id: "part-affilie" }],
      relance_planifiee: [{ cle: "2026-10-28", jeton: JETON }],
    },
  };
}

function client(db, journal) {
  const valeur = (ligne, col) => col.includes("->>") ? (ligne[col.split("->>")[0]] || {})[col.split("->>")[1]] : ligne[col];
  return {
    auth: { admin: { listUsers: async ({ page }) => ({ data: { users: page === 1 ? db.auth : [] }, error: null }) } },
    from: (table) => {
      const filtres = [];
      let limite = Infinity;
      const q = {
        select: () => q,
        eq: (c, v) => { filtres.push((l) => valeur(l, c) === v); return q; },
        neq: (c, v) => { filtres.push((l) => valeur(l, c) !== v); return q; },
        in: (c, vs) => { filtres.push((l) => vs.includes(valeur(l, c))); return q; },
        gte: (c, v) => { filtres.push((l) => valeur(l, c) != null && String(valeur(l, c)) >= v); return q; },
        not: (c, op, v) => { assert.equal(op, "is"); assert.equal(v, null); filtres.push((l) => valeur(l, c) != null); return q; },
        order: () => q,
        limit: (n) => { limite = n; return q; },
        maybeSingle: async () => ({ data: (db.tables[table] || []).filter((l) => filtres.every((f) => f(l)))[0] ?? null, error: null }),
        then: (ok, ko) => Promise.resolve({ data: (db.tables[table] || []).filter((l) => filtres.every((f) => f(l))).slice(0, limite), error: null }).then(ok, ko),
      };
      return q;
    },
    rpc: async (nom, args) => {
      journal.rpc.push({ nom, args });
      if (nom === "email_reserve_send") {
        const cle = `${args.p_user_id}|${args.p_campaign}|${args.p_campaign_key}`;
        if (journal.reserves.has(cle)) return { data: null, error: null };
        journal.reserves.add(cle);
        return { data: journal.reserves.size, error: null };
      }
      return { data: null, error: null };
    },
  };
}

let charge = null;
async function fonction() {
  if (charge) return charge;
  if (typeof NODE_MODULE.stripTypeScriptTypes !== "function") return null;
  let code = fs.readFileSync(path.join(DIR, "index.ts"), "utf8");
  code = NODE_MODULE.stripTypeScriptTypes(code, { mode: "strip" });
  code = code.replace(/^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";$/m, "const createClient = (...a) => globalThis.__reClient(...a);");
  code = code.replace(/^import \{ PAQUET \} from "\.\/paquet\.ts";$/m, "const PAQUET = globalThis.__rePaquet;");
  assert.ok(code.includes("globalThis.__reClient") && code.includes("globalThis.__rePaquet"), "imports remplaces");
  globalThis.__rePaquet = paquet();
  let handler = null;
  const ENV = { RELANCE_SECRET: SECRET, SUPABASE_URL: "https://projet.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service",
    BREVO_API_KEY: "xkeysib-test", EMAIL_UNSUBSCRIBE_SECRET: "u".repeat(40) };
  globalThis.Deno = { env: { get: (n) => ENV[n] ?? null }, serve: (h) => { handler = h; } };
  await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  charge = { handler };
  return charge;
}

// Lance la fonction avec une base neuve ; renvoie la reponse, les e-mails partis et le journal.
async function appeler(corps, options = {}, entetes = { "x-relance-secret": SECRET }) {
  const f = await fonction();
  const db = base();
  const journal = { rpc: [], reserves: new Set(), brevo: [], head: [] };
  globalThis.__reClient = () => client(db, journal);
  const fetchAvant = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if ((init.method || "GET") === "HEAD") {
      journal.head.push(String(url));
      const absente = options.banniereAbsente && (String(url).startsWith("https://iashark.com/") || String(url).includes("/main/"));
      return absente ? { ok: false, status: 404, headers: new Headers({ "content-type": "text/html" }) }
        : { ok: true, status: 200, headers: new Headers({ "content-type": "image/jpeg" }) };
    }
    if (String(url) === "https://api.brevo.com/v3/smtp/email") {
      journal.brevo.push(JSON.parse(init.body));
      return { ok: true, status: 201, json: async () => ({ messageId: "<m" + journal.brevo.length + "@brevo>" }) };
    }
    throw new Error("appel reseau inattendu : " + url);
  };
  const timeoutAvant = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => timeoutAvant(fn, 0);
  try {
    const req = new Request("https://projet.supabase.co/functions/v1/relance-emails", {
      method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, entetes), body: JSON.stringify(corps),
    });
    const r = await f.handler(req);
    return { status: r.status, body: JSON.parse(await r.text()), journal };
  } finally {
    globalThis.fetch = fetchAvant;
    globalThis.setTimeout = timeoutAvant;
  }
}

const SANS_TS = "node:module#stripTypeScriptTypes indisponible (Node < 22.13)";

test("etat : qui recevrait quoi, sans rien envoyer ni montrer d'adresse", async (t) => {
  if (!(await fonction())) { t.skip(SANS_TS); return; }
  const { status, body, journal } = await appeler({ mode: "etat" });
  assert.equal(status, 200);
  assert.equal(body.cle, "2026-10-28");
  assert.deepEqual(body.par_type_et_langue, {
    "partenaire-en": 1, "ancien-es": 1, "accord-fr": 1, "accord-en": 1,
    "sans_accord-fr": 2, "sans_accord-en": 1, "sans_accord-es": 1,
  });
  assert.equal(body.destinataires, 8);
  assert.deepEqual(body.ecartes, { adresse_invalide: 1, desinscrit: 1, rebond_ou_plainte: 1, admin: 1, abonne_en_cours: 3,
    plan_manuel: 2, email_moins_de_3_jours: 1, exclus: 0 });
  // Dossier du site : gb (clic du partenaire depuis /gb/, et marche gb), za, mx.
  assert.deepEqual(body.par_dossier, { gb: 2, es: 1, fr: 3, za: 1, mx: 1 });
  assert.equal(body.banniere_sur_le_site, true);
  assert.equal(journal.brevo.length, 0, "rien n'est envoye");
  assert.ok(!/@/.test(JSON.stringify(body)), "aucune adresse dans la reponse (journal public)");
});

test("envoi : phrase de confirmation obligatoire ; puis un e-mail par personne, jamais deux fois", async (t) => {
  if (!(await fonction())) { t.skip(SANS_TS); return; }
  const refus = await appeler({ mode: "envoi" });
  assert.equal(refus.status, 400);
  assert.equal(refus.journal.brevo.length, 0);

  const { status, body, journal } = await appeler({ mode: "envoi", confirmation: "ENVOYER LA RELANCE" });
  assert.equal(status, 200);
  assert.deepEqual(body.bilan, { envoye: 8, deja: 0, echec: 0 });
  const de = (adr) => journal.brevo.find((m) => m.to[0].email === adr);
  for (const m of journal.brevo) {
    assert.equal(m.sender.name, "Clément, IASHARK");
    assert.ok(!m.htmlContent.includes("%%") && !m.textContent.includes("%%"), "tous les reperes remplaces");
    assert.ok(m.headers["List-Unsubscribe"].includes("email-unsubscribe?t="));
    assert.ok(m.tags.includes("relance-2026-10-28"));
  }
  // Abonnes en cours, plans poses a la main, admin, desinscrit, rebond, e-mail recent : rien.
  for (const adr of ["actif@exemple.fr", "impaye@exemple.fr", "pa@exemple.com", "famille@exemple.fr", "promain@exemple.fr",
    "admin@exemple.fr", "des@exemple.fr", "rebond@exemple.fr", "recent@exemple.com", "x@exemple.con"]) {
    assert.equal(de(adr), undefined, adr + " ne recoit rien");
  }
  // Partenaire (abonne en essai) : son e-mail, page Partenaires du Royaume-Uni, ancre du formulaire.
  const p = de("part@exemple.com");
  assert.equal(p.tags[1], "partenaire-en");
  assert.ok(p.htmlContent.includes("https://iashark.com/gb/partenaires.html?utm_source=email&utm_medium=email&utm_campaign=relance-28-10-partenaire#candidature"));
  assert.ok(!p.htmlContent.includes("banniere-"), "pas de banniere dans l'e-mail partenaire");
  // Comptes gratuits jamais abonnes : essai de 7 jours, dans le dossier de leur pays.
  assert.equal(de("accord@exemple.fr").tags[1], "accord-fr");
  assert.ok(de("accord@exemple.fr").htmlContent.includes("https://iashark.com/fr/abonnement.html?duree=month&utm_source=email"));
  assert.ok(de("quatre@exemple.com").htmlContent.includes("https://iashark.com/za/match.html?id="));
  assert.ok(de("gb@exemple.co.uk").htmlContent.includes("https://iashark.com/gb/abonnement.html?duree=month"));
  assert.ok(de("mx@exemple.mx").htmlContent.includes("https://iashark.com/mx/match.html?id="));
  assert.equal(de("accueil@exemple.fr").tags[1], "sans_accord-fr", "l'e-mail d'accueil ne compte pas dans les 3 jours");
  assert.equal(de("pv@exemple.fr").tags[1], "sans_accord-fr", "clic partenaire de plus de 7 jours : compte gratuit normal");
  // Ancien abonne : prix reel, pas d'essai.
  const a = de("ancien@exemple.es");
  assert.equal(a.tags[1], "ancien-es");
  assert.ok(a.htmlContent.includes("14,99 €") && a.htmlContent.includes("19,95 €"));
  assert.ok(!/prueba|7 días/i.test(a.textContent), "pas d'essai pour un ancien abonne");
  assert.ok(a.htmlContent.includes("https://iashark.com/assets/emails/2026-10-28/banniere-es.jpg"));
});

test("envoi automatique (planifie) : seulement le 28/10/2026 avant 15:00 UTC, et PR fusionnee", async (t) => {
  if (!(await fonction())) { t.skip(SANS_TS); return; }
  const corps = { mode: "envoi", confirmation: "ENVOYER LA RELANCE", planifie: true };
  const maintenant = new Date();
  const dansLaFenetre = maintenant.toISOString().slice(0, 10) === "2026-10-28" && maintenant.getUTCHours() < 15;
  const { status, journal } = await appeler(corps);
  if (dansLaFenetre) assert.equal(status, 200);
  else { assert.equal(status, 400); assert.equal(journal.brevo.length, 0); assert.equal(journal.rpc.length, 0); }
  // PR non fusionnee : banniere ni sur le site ni sur main -> rien ne part, quel que soit le jour.
  const nonFusionnee = await appeler(corps, { banniereAbsente: true });
  assert.equal(nonFusionnee.status, 400);
  assert.equal(nonFusionnee.journal.brevo.length, 0);
});

test("jeton de la tache pg_cron : accepte seulement pour l'envoi automatique, jamais pour lire ou tester", async (t) => {
  if (!(await fonction())) { t.skip(SANS_TS); return; }
  const anon = { Authorization: "Bearer x." + Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url") + ".y" };
  const faux = await appeler({ mode: "envoi", confirmation: "ENVOYER LA RELANCE", planifie: true }, {}, Object.assign({ "x-relance-jeton": "k".repeat(64) }, anon));
  assert.equal(faux.status, 403);
  for (const corps of [{ mode: "etat" }, { mode: "test" }, { mode: "suivi" }, { mode: "envoi", confirmation: "ENVOYER LA RELANCE" }]) {
    const r = await appeler(corps, {}, Object.assign({ "x-relance-jeton": JETON }, anon));
    assert.equal(r.status, 403, JSON.stringify(corps));
    assert.equal(r.journal.brevo.length, 0);
  }
  const sansRien = await appeler({ mode: "etat" }, {}, anon);
  assert.equal(sansRien.status, 403);
  const bon = await appeler({ mode: "envoi", confirmation: "ENVOYER LA RELANCE", planifie: true }, {}, Object.assign({ "x-relance-jeton": JETON }, anon));
  assert.notEqual(bon.status, 403, "le bon jeton passe (puis gardes de date et de fusion)");
});

test("test : tous les e-mails aux seuls comptes admin, objet [TEST] ; banniere de secours si le site ne l'a pas encore", async (t) => {
  if (!(await fonction())) { t.skip(SANS_TS); return; }
  const { status, body, journal } = await appeler({ mode: "test", branche: "relance-28-10" }, { banniereAbsente: true });
  assert.equal(status, 200);
  assert.equal(body.envoyes, 12);
  assert.equal(body.banniere_sur_le_site, false);
  assert.ok(journal.brevo.every((m) => m.to[0].email === "admin@exemple.fr" && m.subject.startsWith("[TEST] ")));
  assert.equal(journal.rpc.length, 0, "le test ne reserve aucun envoi");
  const fr = journal.brevo.find((m) => m.tags[1] === "accord-fr");
  // Ni le site ni main n'ont encore la banniere (test avant la fusion) : copie de la branche testee.
  assert.ok(fr.htmlContent.includes("https://raw.githubusercontent.com/IASHARK/iashark/relance-28-10/assets/emails/2026-10-28/banniere-fr.jpg"));
  assert.ok(journal.brevo.find((m) => m.tags[1] === "partenaire-en").htmlContent.includes("/gb/partenaires.html"));
});

test("textes : 4 types x 3 langues, objets de 6 a 10 mots, aucune emoticone, aucune promesse, essai seulement aux jamais abonnes", () => {
  const P = paquet();
  const attendus = [];
  for (const s of ["partenaire", "accord", "sans_accord", "ancien"]) for (const l of ["fr", "en", "es"]) attendus.push(`${s}-${l}`);
  assert.deepEqual(Object.keys(P).sort(), attendus.sort());
  for (const [k, v] of Object.entries(P)) {
    const mots = v.sujet.split(/[\s:–]+/).filter((m) => m && m !== "vs" && m !== "€");
    assert.ok(mots.length >= 6 && mots.length <= 10, `${k} : objet de ${mots.length} mots`);
    const tout = v.sujet + " " + v.pre + " " + v.texte;
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(tout + v.html), k + " : emoticone");
    assert.ok(!/garanti|guarant|risque|risk|riesgo|derni[eè]re chance|last chance|\b\d+ (gagn|won|ganad)/i.test(tout), k + " : mot interdit");
    assert.ok(v.html.includes("%%DESINSCRIPTION%%") && v.texte.includes("%%DESINSCRIPTION%%"), k + " : desinscription");
    const seg = k.slice(0, k.lastIndexOf("-"));
    for (const lien of v.html.match(/https:\/\/iashark\.com\/%%DIR%%\/[^"]*/g) || []) {
      assert.ok(lien.includes(`utm_campaign=relance-28-10-${seg}`), `${k} : lien sans suivi ${lien}`);
    }
    const essai = /7 jours de Pro|7 days|7 días de Pro/.test(v.html);
    assert.equal(essai, seg === "accord" || seg === "sans_accord", `${k} : essai de 7 jours`);
  }
  for (const l of ["fr", "es"]) assert.ok(P[`ancien-${l}`].html.includes("14,99 €"), "prix reel du mois");
  assert.ok(!/€|EUR|£|\$/.test(P["ancien-en"].html.replace(/<style[\s\S]*?<\/style>/, "")), "anglais : pas de prix ecrit (devise du pays)");
  for (const l of ["fr", "en", "es"]) {
    assert.ok(!P[`partenaire-${l}`].html.includes("banniere-"), "e-mail partenaire court : pas de banniere");
    assert.ok(P[`partenaire-${l}`].html.includes("40"), "40 %");
    assert.ok(P[`accord-${l}`].html.includes("match.html?id=1550172"), "match offert du jour");
  }
});

test("workflow : envoi automatique le 28/10 a 10:00 UTC, garde de date, saisie a la main conservee", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/relance-emails.yml"), "utf8");
  assert.match(wf, /- cron: "0 10 28 10 \*"/);
  assert.match(wf, /\[ "\$\(date -u \+%F\)" != "2026-10-28" \]/);
  assert.match(wf, /if \[ "\$EVENEMENT" = "schedule" \]; then\s+# [^\n]*\n\s+MODE=envoi; CONFIRMATION="ENVOYER LA RELANCE"; EXCLURE=""; PLANIFIE=true/);
  assert.match(wf, /workflow_dispatch:\s+inputs:\s+mode:/);
  assert.match(wf, /x-region: us-east-2/);
  assert.match(wf, /concurrency:\s+group: relance-emails/);
  // Installation en 3 essais ; en envoi automatique, la version en ligne est verifiee avant d'envoyer.
  assert.match(wf, /for essai in 1 2 3; do/);
  assert.match(wf, /push:\s+branches: \[main\]/);
  const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/0057_relance_planifiee.sql"), "utf8");
  assert.match(sql, /cron\.schedule\(\s+'relance-2026-10-28',\s+'0 10 28 10 \*'/);
  assert.match(sql, /encode\(extensions\.gen_random_bytes\(32\), 'hex'\)/, "jeton tire au hasard dans la base");
  assert.ok(!/service_role|x-relance-secret/.test(sql), "aucune cle secrete dans la migration");
  assert.match(sql, /'planifie', true/);
  assert.match(wf, /if \[ "\$code" != "200" \] \|\| \[ "\$cle" != "2026-10-28" \]; then/);
  for (const l of ["fr", "en", "es"]) assert.ok(fs.existsSync(path.join(ROOT, `assets/emails/2026-10-28/banniere-${l}.jpg`)), "banniere " + l);
  assert.match(fs.readFileSync(path.join(DIR, "paquet.ts"), "utf8").split("\n")[0], /emails\/relance-2026-10-28\/fabriquer\.py/);
});
