"use strict";
// « Où les visiteurs décrochent » (admin.html, 19/09/2026) : helpers purs,
// rendu dans un faux navigateur AVEC et SANS la migration 0031, filtres de la
// section, garde-fous statiques de 0031_admin_conversion_funnel.sql (admin
// seulement, lecture seule, anon revoque, trafic interne exclu, rattrapage
// des pays limite a la meme visite) et parite avec funnel-track.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const H = require("../admin-dashboard.js");
const FILE = "supabase/migrations/0031_admin_conversion_funnel.sql";
const sql = read(FILE);
const sql19 = read("supabase/migrations/0019_admin_dashboard_v2.sql");
const html = read("admin.html");
const js = read("admin-dashboard.js");
const tracker = read("funnel-track.js");
const nb = (s) => String(s).replace(/[  ]/g, " ");

function fnBlock(source, name) {
  const start = source.indexOf("create or replace function public." + name + "(");
  assert.ok(start !== -1, name + " definie");
  const end = source.indexOf("$$;", source.indexOf("as $$", start));
  return source.slice(start, end);
}

// Reponse type de admin_conversion_funnel (chiffres reels du 19/09/2026,
// 7 jours, avant 0031).
const DATA = {
  from: "2026-09-13", to: "2026-09-19",
  steps: [
    { key: "arrived", visitors: 122, reached: 122 }, { key: "match_page", visitors: 77, reached: 77 },
    { key: "gate_view", visitors: 13, reached: 14 }, { key: "unlock_click", visitors: 13, reached: 14 },
    { key: "pricing_page", visitors: 10, reached: 33 }, { key: "consent", visitors: 3, reached: 9 },
    { key: "checkout", visitors: 3, reached: 9 }, { key: "subscribed", visitors: 2, reached: 3 },
  ],
  exit_pages: [
    { page: "/en/", match_id: null, visitors: 16 }, { page: "/fr/match", match_id: "42", visitors: 7 },
    { page: "/fr/<img src=x onerror=alert(1)>", match_id: null, visitors: 1 },
  ],
  exit_total: 92,
  signup_timing: { signups: 9, median_sec: 57, median_pages: 5 },
  countries: [{ country: "FR", visitors: 74 }, { country: "ZW", visitors: 1 }, { country: null, visitors: 1 }, { country: "<b>", visitors: 1 }],
  country_basis: { geo: 74, tz: 37, lang: 10, unknown: 1 },
  excluded: { internal: 58, already_pro: 2 },
  tracking: { gate_view_since: null, consent_since: "2026-09-19T20:00:00Z" },
};

// ---------------------------------------------------------------------------
// Helpers purs
// ---------------------------------------------------------------------------
test("dropSteps : 8 etapes dans l'ordre du SQL, % de l'etape precedente et des arrivees, autre chemin", () => {
  const steps = H.dropSteps(DATA);
  assert.deepEqual(steps.map((s) => s.key), ["arrived", "match_page", "gate_view", "unlock_click", "pricing_page", "consent", "checkout", "subscribed"]);
  assert.deepEqual(steps.map((s) => s.value), [122, 77, 13, 13, 10, 3, 3, 2]);
  assert.deepEqual(steps.map((s) => (s.pctOfPrev === null ? null : Math.round(s.pctOfPrev))), [null, 63, 17, 100, 77, 30, 100, 67]);
  assert.deepEqual(steps.map((s) => Math.round(s.pctOfFirst * 10) / 10), [100, 63.1, 10.7, 10.7, 8.2, 2.5, 2.5, 1.6]);
  assert.deepEqual(steps.map((s) => s.other), [0, 0, 1, 1, 23, 6, 6, 1]);
  assert.equal(steps[4].label, "Offre Pro vue");
  // Etape absente de la reponse : inconnue, jamais un faux zero.
  const partial = H.dropSteps({ steps: [{ key: "arrived", visitors: 5, reached: 5 }] });
  assert.equal(partial[1].value, null);
  assert.equal(partial[2].pctOfPrev, null);
  assert.equal(H.dropSteps(null)[0].value, null);
  assert.equal(H.dropSteps({ steps: [{ key: "arrived", visitors: 0, reached: 0 }, { key: "match_page", visitors: 0, reached: 0 }] })[1].pctOfFirst, 0);
});

test("dropLeak : plus gros decrochage en clair (nombre de visiteurs perdus)", () => {
  const leak = H.dropLeak(H.dropSteps(DATA));
  assert.deepEqual([leak.from, leak.to, leak.lost, leak.index], ["Page match ouverte", "Panneau Pro vu", 64, 2]);
  assert.equal(nb(leak.sentence), "Le plus gros décrochage : entre « Page match ouverte » et « Panneau Pro vu », 64 visiteurs sur 77 s'arrêtent (83 %).");
  const one = H.dropLeak(H.dropSteps({ steps: [{ key: "arrived", visitors: 1, reached: 1 }, { key: "match_page", visitors: 0, reached: 0 }] }));
  assert.equal(nb(one.sentence), "Le plus gros décrochage : entre « Arrivée sur le site » et « Page match ouverte », 1 visiteur sur 1 s'arrête (100 %).");
  assert.equal(H.dropLeak(H.dropSteps({ steps: [] })), null);
});

test("notes : etapes pas encore mesurees ou mesurees depuis une date, base du pays, visites exclues, temps avant inscription", () => {
  const range = H.periodRange("7", "2026-09-19");
  const notes = H.dropNotes(DATA, range);
  assert.equal(notes.length, 2);
  assert.equal(notes[0], "« Panneau Pro vu » n'est pas encore mesuré : en attendant, cette étape est déduite du clic « Débloquer ».");
  assert.match(nb(notes[1]), /^« Case CGV cochée » est mesuré depuis le 19 sept\. 2026 ; avant, cette étape est déduite du paiement lancé\.$/);
  // Periode entierement mesuree : aucune note.
  assert.deepEqual(H.dropNotes({ tracking: { gate_view_since: "2026-09-10T08:00:00Z", consent_since: "2026-09-10T08:00:00Z" } }, H.periodRange("today", "2026-09-19")), []);
  assert.equal(H.countryBasisText(DATA.country_basis), "Pays connu par le réseau pour 74 visiteurs, estimé par le fuseau horaire pour 37, par la langue du navigateur pour 10 ; inconnu pour 1.");
  assert.equal(H.countryBasisText({ geo: 1, tz: 0, lang: 0, unknown: 0 }), "Pays connu par le réseau pour 1 visiteur.");
  assert.equal(H.countryBasisText(null), "");
  assert.equal(H.excludedText(DATA.excluded), "Non comptées : 58 visites de robots, de tests ou de ton appareil et 2 visites d'abonnés déjà Pro.");
  assert.equal(H.excludedText({ internal: 0, already_pro: 1 }), "Non comptées : 1 visite d'abonnés déjà Pro.");
  assert.equal(H.excludedText({ internal: 0, already_pro: 0 }), "");
  const t = H.signupTimingText(DATA.signup_timing);
  assert.equal(t.value, "57 s");
  assert.equal(nb(t.text), "Temps médian entre l'arrivée sur le site et l'inscription, sur 9 inscriptions. Pages vues avant de s'inscrire (médiane) : 5.");
  assert.equal(H.signupTimingText({ signups: 0, median_sec: null }).text, "Aucune inscription sur cette période avec ces filtres.");
  assert.equal(H.signupTimingText({ signups: 1, median_sec: 400, median_pages: 2.5 }).value, "6 min 40");
});

test("exitRows : noms de pages lisibles, part des visiteurs sans compte", () => {
  const rows = H.exitRows(DATA, { "42": { home: "PSG", away: "OM" } });
  assert.deepEqual(rows.map((r) => r.name), ["Accueil", "Match PSG – OM", "<img src=x onerror=alert(1)>"]);
  assert.equal(Math.round(rows[0].pct * 10) / 10, 17.4);
  assert.equal(rows[1].matchId, "42");
  assert.deepEqual(H.exitRows({ exit_pages: [{ page: "/fr/", visitors: 0 }] }), []);
});

// ---------------------------------------------------------------------------
// Rendu dans un faux navigateur
// ---------------------------------------------------------------------------
function makeEl(id) {
  const listeners = {};
  return {
    id, innerHTML: "", textContent: "", hidden: false, value: "", max: "", className: "", disabled: false, open: false, listeners,
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, getAttribute() { return null; }, focus() {},
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
}

async function renderDashboard(withDrop, dropData) {
  const els = {};
  const calls = [];
  const analytics = {
    range: { previous_complete: true }, kpis: { visitors: 3, signups: 1 }, previous: { visitors: 2 }, internal_sessions: 0,
    series: [], top_pages: [], top_matches: [], sources: [], countries: [],
    funnel: { visitors: 3, match_page: 1, pricing_page: 0, checkout_started: 0, checkout_success: 0 },
  };
  const handler = (name) => {
    switch (name) {
      case "admin_analytics": return { data: JSON.parse(JSON.stringify(analytics)) };
      case "admin_business": return { data: { accounts_created: 1, accounts_created_prev: 0, subscriptions: { active: 1, new_in_period: 0, past_due: 0 }, first_payments: [], renewals: [] } };
      case "admin_recent_sessions": return { data: [] };
      case "admin_recent_signups": return { data: [] };
      case "admin_health": return { data: { last_page_view_at: new Date().toISOString(), last_billing_event_at: null } };
      case "admin_live_view": return { data: { visitors: [] } };
      case "admin_conversion_funnel": return withDrop ? { data: JSON.parse(JSON.stringify(dropData || DATA)) } : { error: { code: "PGRST202", message: "Could not find the function public.admin_conversion_funnel" } };
      default: return { error: { code: "PGRST202", message: "Could not find the function" } };
    }
  };
  const document = { hidden: false, getElementById: (id) => (els[id] = els[id] || makeEl(id)), querySelectorAll: () => [], addEventListener() {} };
  const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { role: "admin" } }) }) }) }),
    rpc: (name, args) => { calls.push([name, args]); return Promise.resolve(handler(name, args)); },
  };
  const ctx = {
    document, localStorage: storage(), setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    supabase: { createClient: () => client },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5)); };
  await settle();
  return { els, calls, settle, text: (id) => (els[id] ? els[id].innerHTML + els[id].textContent : "") };
}

test("rendu AVEC 0031 : 8 etapes, % precedente et % des arrivees, plus gros decrochage, sorties, temps avant inscription", async () => {
  const d = await renderDashboard(true);
  assert.equal(d.els.dash.hidden, false);
  const call = d.calls.find((c) => c[0] === "admin_conversion_funnel");
  assert.ok(call, "RPC appelee");
  assert.equal(call[1].p_include_internal, false, "trafic interne exclu");
  assert.equal(call[1].p_since, H.LAUNCH_AT);
  assert.match(call[1].p_from, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual([call[1].p_country, call[1].p_device, call[1].p_source], [null, null, null]);

  const f = nb(d.text("dropFunnel"));
  assert.equal((f.match(/<li class="step( step-leak)?">/g) || []).length, 8, "8 etapes");
  for (const label of ["1. Arrivée sur le site", "2. Page match ouverte", "3. Panneau Pro vu", "4. Clic « Débloquer »", "5. Offre Pro vue", "6. Case CGV cochée", "7. Paiement lancé", "8. Abonné"]) {
    assert.ok(f.includes(label), label);
  }
  assert.match(f, /<b class="tnum">122<\/b><span class="tnum">100 % des arrivées<\/span>/);
  assert.match(f, /<b class="tnum">77<\/b><span class="tnum">63 % des arrivées<\/span>/);
  assert.match(f, /↓ 17 % de l&#39;étape précédente · plus gros décrochage/);
  assert.match(f, /class="step step-leak"><span class="step-name">3\. Panneau Pro vu/);
  assert.match(f, /\+ 23 par un autre chemin \(33 au total\)/);
  assert.match(f, /<p class="leak-box">Le plus gros décrochage : entre « Page match ouverte » et « Panneau Pro vu », 64 visiteurs sur 77 s&#39;arrêtent \(83 %\)\.<\/p>/);
  assert.match(f, /Non comptées : 58 visites de robots/);
  assert.match(f, /« Panneau Pro vu » n&#39;est pas encore mesuré/);
  assert.equal(d.els.dropFilters.hidden, false);
  assert.equal(d.els.dropExtra.hidden, false);

  const exits = nb(d.text("dropExits"));
  assert.match(exits, /Accueil/);
  assert.match(exits, /Sur 92 visiteurs sans compte ni inscription\./);
  assert.ok(!exits.includes("<img"), "chemin echappe");
  assert.match(nb(d.text("dropSignup")), /<b class="tnum">57 s<\/b><span>médiane<\/span>/);

  const countries = d.els.dropCountry.innerHTML;
  assert.match(countries, /<option value="">Tous les pays<\/option>/);
  assert.match(countries, /<option value="FR">🇫🇷 France \(74\)<\/option>/);
  assert.match(countries, /<option value="unknown">Pays inconnu \(1\)<\/option>/);
  assert.ok(!countries.includes("<b>"), "code pays invalide jamais affiche tel quel");
});

test("filtres de la section : pays, appareil, provenance envoyes a la RPC, rappel du filtre, etat vide", async () => {
  const d = await renderDashboard(true);
  const fire = (id, value) => d.els[id].listeners.change.forEach((fn) => fn({ target: { value } }));
  fire("dropCountry", "ZW");
  fire("dropDevice", "mobile");
  fire("dropSource", "social");
  await d.settle();
  const last = d.calls.filter((c) => c[0] === "admin_conversion_funnel").at(-1)[1];
  assert.deepEqual([last.p_country, last.p_device, last.p_source], ["ZW", "mobile", "social"]);
  assert.match(nb(d.text("dropFunnel")), /Filtre : Zimbabwe · Mobile \(téléphone, tablette\) · provenance Réseaux sociaux/);
  assert.match(d.els.dropCountry.innerHTML, /<option value="ZW" selected>/);
  // Liste d'options de admin.html = valeurs acceptees par le SQL.
  const opts = (id) => [...html.slice(html.indexOf('id="' + id + '"'), html.indexOf("</select>", html.indexOf('id="' + id + '"'))).matchAll(/<option value="(\w*)"/g)].map((m) => m[1]);
  assert.deepEqual(opts("dropDevice"), ["", "mobile", "desktop"]);
  assert.deepEqual(opts("dropSource"), ["", "google", "direct", "social", "other"]);
  const block = fnBlock(sql, "admin_conversion_funnel");
  assert.match(block, /case when p_device in \('mobile', 'desktop'\) then p_device end as f_device/);
  assert.match(block, /case when p_source in \('google', 'direct', 'social', 'other'\) then p_source end as f_source/);
  assert.match(block, /case when p_country ~ '\^\[A-Z\]\{2\}\$' or p_country = 'unknown' then p_country end as f_country/);

  const empty = await renderDashboard(true, { ...DATA, steps: DATA.steps.map((s) => ({ ...s, visitors: 0, reached: 0 })) });
  assert.match(empty.text("dropFunnel"), /Aucun visiteur sur cette période/);
  assert.equal(empty.els.dropExtra.hidden, true);
});

test("rendu SANS 0031 : « Migration 0031 à appliquer dans Supabase », le reste du tableau de bord fonctionne", async () => {
  const d = await renderDashboard(false);
  assert.equal(d.els.dash.hidden, false);
  assert.equal(d.els.stateDenied.hidden, true);
  const f = d.text("dropFunnel");
  assert.match(f, /Migration 0031 à appliquer dans Supabase/);
  assert.match(f, /0031_admin_conversion_funnel\.sql/);
  assert.equal(d.els.dropFilters.hidden, true);
  assert.equal(d.els.dropExtra.hidden, true);
  assert.match(d.text("cards"), /class="kcard /, "les cartes principales s'affichent toujours");
  assert.match(d.text("funnel"), /class="steps"/, "l'ancien parcours reste affiche");
  assert.equal(H.DROP_FILE, "0031_admin_conversion_funnel.sql");
  assert.ok(fs.existsSync(path.join(root, FILE)));
});

test("admin.html : section apres « Du visiteur au client », avant les sources ; aide repliee ; lisible sur mobile", () => {
  const at = (id) => html.indexOf('id="' + id + '"');
  assert.ok(at("funnel") < at("decrochage") && at("decrochage") < at("sources"));
  for (const id of ["dropTitle", "helpDrop", "dropFilters", "dropCountry", "dropDevice", "dropSource", "dropFunnel", "dropExtra", "dropExits", "dropSignup"]) {
    assert.ok(at(id) !== -1, id);
  }
  assert.match(html, /aria-controls="helpDrop"/);
  assert.match(html, /id="helpDrop" hidden/);
  assert.match(html, /<h2 class="card-title" id="dropTitle">Où les visiteurs décrochent<\/h2>/);
  const css = read("assets/admin.css");
  assert.match(css, /\.drop-extra\{/);
  // Filtres pleine largeur et deux colonnes empilees sous 640 / 900 px (regles existantes).
  assert.match(html, /class="filters drop-filters"/);
  assert.match(html, /class="grid g2 drop-extra"/);
  assert.match(css, /\.filters>\.field\{flex:1 1 100%\}/);
  assert.match(css, /\.g2,\.g-health,\.g-members\{grid-template-columns:minmax\(0,1fr\)\}/);
});

// ---------------------------------------------------------------------------
// Migration 0031
// ---------------------------------------------------------------------------
test("0031 : gate_view ajoute au type d'evenement sans retirer les types existants", () => {
  const m = sql.match(/add constraint funnel_events_event_type_check check \(event_type in \(([\s\S]*?)\)\);/);
  assert.ok(m);
  const types = [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
  assert.deepEqual(types, ["landing_view", "signup_started", "signup_completed", "login_completed", "onboarding_dismissed",
    "tool_page_view", "paywall_view", "checkout_started", "checkout_unavailable", "checkout_success_view",
    "checkout_cancel_view", "page_view", "page_leave", "click", "gate_view"]);
  assert.match(tracker, /window\.iasharkTrack\("gate_view", md\)/, "type emis par funnel-track.js");
});

test("0031 : admin_internal_reason = corps de 0019 + raison 'headless', droits inchanges", () => {
  const b30 = fnBlock(sql, "admin_internal_reason");
  const b19 = fnBlock(sql19, "admin_internal_reason");
  const headless = b30.match(/\n    when coalesce\(md->>'tz', ''\)[\s\S]*?then 'headless'/);
  assert.ok(headless, "clause headless");
  assert.equal(b30.replace(headless[0], ""), b19, "toutes les autres raisons identiques a 0019");
  assert.match(headless[0], /md->>'os' in \('Android', 'iOS'\)/);
  assert.match(headless[0], /md->>'os' in \('Windows', 'macOS', 'Linux', 'ChromeOS'\) and md->>'screen_w' = '800'/);
  assert.match(b30, /language sql\s+immutable\s+set search_path = public/);
  assert.ok(sql.includes("revoke all on function public.admin_internal_reason(jsonb) from public, anon, authenticated;"));
  assert.ok(!/grant [^;]*admin_internal_reason/i.test(sql), "jamais accordee");
  assert.ok(Array.isArray(H.REASONS.headless) && /Robot/.test(H.reasonLabel("headless")), "raison expliquee dans le tableau de bord");
});

test("0031 : rattrapage des pays limite a la premiere page vue et a la meme visite, idempotent, borne", () => {
  const start = sql.lastIndexOf("-- 3) Rattrapage");
  const end = sql.lastIndexOf("-- 4) admin_conversion_funnel");
  assert.ok(start > 0 && end > start);
  const block = sql.slice(start, end).replace(/--.*$/gm, "");
  assert.equal((block.match(/\bupdate\b/gi) || []).length, 1, "une seule ecriture");
  assert.ok(!/\b(delete|insert|truncate|drop)\b/i.test(block));
  assert.match(block, /update public\.funnel_events t\s+set metadata = t\.metadata \|\| l\.patch/);
  assert.match(block, /where e\.event_type = 'page_view'[\s\S]*order by e\.session_id, e\.created_at, e\.id/, "premiere page vue de chaque visite");
  assert.match(block, /coalesce\(e0\.metadata->>'geo_country', ''\) !~ '\^\[A-Z\]\{2\}\$'/, "seulement sans pays (idempotent)");
  assert.match(block, /join missing m on m\.session_id = e\.session_id/, "meme visite uniquement");
  assert.match(block, /e\.created_at >= '2026-09-13 19:00:00\+00'/);
  assert.match(block, /pg_column_size\(t\.metadata \|\| l\.patch\) <= 2000/, "taille bornee (contrainte 2048)");
  const patch = block.slice(block.indexOf("jsonb_build_object("), block.indexOf(")) as patch"));
  const keys = [...patch.matchAll(/'(geo_\w+)', /g)].map((m) => m[1]);
  assert.deepEqual(keys, ["geo_country", "geo_region", "geo_city", "geo_from_session"], "seulement le pays, la region, la ville et la marque");
  assert.match(block, /left\(nullif\(btrim\(e\.metadata->>'geo_region'\), ''\), 60\)/);
});

test("0031 : admin_conversion_funnel admin seulement, lecture seule, authenticated seulement, aucune donnee personnelle", () => {
  const block = fnBlock(sql, "admin_conversion_funnel");
  const code = block.replace(/--.*$/gm, "");
  assert.match(block, /returns json\s+language plpgsql\s+stable\s+security definer\s+set search_path = public/);
  assert.match(block, /if not public\.admin_is_admin\(\) then\s+raise exception 'access_denied' using errcode = '42501';/);
  assert.match(block, /p_include_internal boolean default false/);
  assert.ok(!/\b(insert|update|delete|truncate|alter|drop|grant)\b/i.test(code), "lecture seule");
  const sig = "date, date, boolean, timestamptz, text, text, text";
  assert.ok(sql.includes("revoke all on function public.admin_conversion_funnel(" + sig + ") from public, anon;"));
  assert.ok(sql.includes("grant execute on function public.admin_conversion_funnel(" + sig + ") to authenticated;"));
  assert.equal((sql.match(/grant execute on function public\.admin_conversion_funnel/g) || []).length, 1, "une seule attribution");
  assert.ok(!/to (anon|public)\b/i.test(sql.replace(/--.*$/gm, "")), "jamais pour anon ou public");
  // Trafic interne / tests / comptes internes exclus comme dans 0019-0029.
  assert.match(block, /public\.admin_internal_reason\(e\.metadata\) is not null or e\.session_id ilike 'qa%'/);
  assert.match(block, /public\.admin_internal_account\(u\.email, u\.role\)/);
  assert.match(block, /\(p\.with_internal or not d\.is_internal\)/);
  assert.match(block, /and not d\.is_pro/, "abonnes deja Pro exclus");
  // Sortie : agregats seulement, jamais d'email, d'identifiant de compte ou de visite.
  const out = code.slice(code.indexOf("select json_build_object("));
  assert.ok(!/'(email|user_id|session_id)'/.test(out), "aucune cle personnelle");
  assert.ok(!/\b(u\.email|su\.user_id|session_id)\b/.test(out.replace(/count\(\*\)/g, "")), "aucune valeur personnelle renvoyee");
  assert.match(sql, /notify pgrst, 'reload schema';/);
});

test("0031 : etapes du SQL = etapes du tableau de bord ; evenements attendus = evenements emis par le site", () => {
  const block = fnBlock(sql, "admin_conversion_funnel");
  const keys = [...block.matchAll(/json_build_object\('key', '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, H.DROP_STEPS.map((s) => s[0]));
  // Etape 4 : tous les boutons « Debloquer » acceptes par funnel-track.js.
  const unlock = block.match(/r\.md->>'kind' in \(([^)]*)\)/)[1];
  for (const k of ["match_gate_unlock", "match_avis_unlock", "match_recall_unlock", "match_analysis_unlock", "match_faq_unlock", "match_bar_unlock", "home_scorers_unlock"]) {
    assert.ok(unlock.includes("'" + k + "'"), k + " compte en SQL");
    assert.match(tracker, new RegExp("\\b" + k + ": true"), k + " accepte par funnel-track.js");
  }
  assert.match(block, /r\.md->>'kind' = 'cta' and r\.md->>'label' = 'home_scorers_unlock'/, "anciennes lignes des buteurs du jour");
  // Etape 3 : panneaux observes par funnel-track.js.
  for (const k of ["match_gate_unlock", "match_avis_unlock", "home_scorers_unlock"]) assert.ok(tracker.includes(k + ": \""), k + " => gate_view");
  // Etapes 6 et 7 : case CGV, bouton de paiement actif et connecte.
  assert.match(block, /r\.md->>'kind' = 'checkout_consent'/);
  assert.match(tracker, /kind: "checkout_consent"/);
  assert.match(block, /coalesce\(r\.md->>'ready', 'true'\) <> 'false'/);
  assert.match(block, /coalesce\(r\.md->>'signed_in', 'true'\) <> 'false'/);
  assert.match(tracker, /ready: !\(button\.disabled === true \|\| button\.getAttribute\("aria-disabled"\) === "true"\)/);
  assert.match(tracker, /signed_in: !!sessionUser\(readStoredSession\(\)\)/);
  // Etape 8 : abonnement Stripe du compte pendant la visite, ou page « paiement reussi ».
  assert.match(block, /s\.status not in \('incomplete', 'incomplete_expired'\)/);
  assert.match(block, /s\.created_at <= x\.last_at \+ interval '1 hour'/);
  assert.match(block, /r\.event_type = 'checkout_success_view'/);
  // Pays : reseau, puis fuseau, puis langue.
  assert.match(block, /coalesce\(d\.geo_country, d\.tz_country, d\.lang_country\) as country/);
  // Provenance : memes groupes que admin_source_group (0019), regroupes.
  assert.match(block, /public\.admin_source_group\(fp\.md->>'utm_source', fp\.md->>'ref', fp\.md->>'browser'\)/);
  assert.deepEqual(Object.keys(H.DROP_SOURCES), ["google", "direct", "social", "other"]);
});
