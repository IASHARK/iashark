"use strict";
// Écran « Partenaires » de l'admin (20/10/2026) : helpers purs, rendu dans
// un faux navigateur (vm) avec admin_affiliates simulée, échappement de tout
// texte venant d'un candidat, liens sûrs, pastille, boutons d'action.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const H = require("../admin-dashboard.js");
const html = read("admin.html");
const js = read("admin-dashboard.js");
const nb = (s) => s.replace(/[  ]/g, " ");

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";

test("libellés : style, statut juridique, statut du dossier, boutons", () => {
  assert.deepEqual(["analysis", "tips", "entertainment", "education", "community", "other"].map(H.partnerStyle),
    ["Analyse", "Pronostics", "Divertissement", "Éducation", "Communauté", "Autre"]);
  assert.equal(H.partnerStyle(undefined), "Style non précisé");
  assert.equal(H.partnerLegal("individual"), "Particulier");
  assert.equal(H.partnerLegal("professional"), "Professionnel");
  assert.equal(H.partnerStatus("pending").label, "À valider");
  assert.equal(H.partnerStatus("bizarre").label, "Statut inconnu");
  const to = (s) => H.partnerActions(s).map((a) => a.to);
  assert.deepEqual(to("pending"), ["approved", "refused"]);
  assert.deepEqual(to("approved"), ["suspended"]);
  assert.deepEqual(to("suspended"), ["approved", "pending"]);
  assert.deepEqual(to("refused"), ["approved", "pending"]);
  assert.deepEqual(H.partnerActions("pending").map((a) => a.label), ["Accepter", "Refuser"]);
  assert.equal(H.partnerActions("pending")[1].confirm, true, "refus confirmé");
  assert.equal(H.partnerActions("approved")[0].confirm, true, "suspension confirmée");
  assert.equal(H.partnerActions("pending")[0].confirm, false);
});

test("liens : http(s) seulement, jamais javascript: ni data:, texte simple sinon", () => {
  assert.equal(H.partnerUrl("https://www.tiktok.com/@moi"), "https://www.tiktok.com/@moi");
  assert.equal(H.partnerUrl("tiktok.com/@moi"), "https://tiktok.com/@moi");
  assert.equal(H.partnerUrl("javascript:alert(1)"), null);
  assert.equal(H.partnerUrl("JaVaScRiPt:alert(1)"), null);
  assert.equal(H.partnerUrl("data:text/html,<b>x</b>"), null);
  assert.equal(H.partnerUrl("@moncompte"), null);
  assert.equal(H.partnerUrl("https://user:pass@exemple.com"), null);
  assert.equal(H.partnerUrl("https://a.com/x y"), null);
  const l = H.partnerLinks(["https://www.instagram.com/moi/", "@moi_x", "", null, "javascript:alert(1)"]);
  assert.deepEqual(l, [{ text: "instagram.com/moi", href: "https://www.instagram.com/moi/" }, { text: "@moi_x", href: null }, { text: "javascript:alert(1)", href: null }]);
  assert.deepEqual(H.partnerLinks({ tiktok: "https://tiktok.com/@a" }), [{ text: "tiktok : tiktok.com/@a", href: "https://tiktok.com/@a" }]);
  assert.deepEqual(H.partnerLinks('["youtube.com/@b"]'), [{ text: "youtube.com/@b", href: "https://youtube.com/@b" }]);
  assert.deepEqual(H.partnerLinks(null), []);
});

test("tri, comptes et commissions", () => {
  const list = H.partnerSort([
    { id: "a", status: "approved", created_at: "2026-10-19T10:00:00Z" },
    { id: "b", status: "pending", created_at: "2026-10-10T10:00:00Z" },
    { id: "c", status: "refused", created_at: "2026-10-20T10:00:00Z" },
    { id: "d", status: "pending", created_at: "2026-10-18T10:00:00Z" },
    null,
    { id: "e", status: "suspended", created_at: "2026-10-01T10:00:00Z" }
  ]);
  assert.deepEqual(list.map((a) => a.id), ["d", "b", "a", "e", "c"], "À valider d'abord, du plus récent au plus ancien");
  assert.deepEqual(H.partnerCounts(list), { pending: 2, approved: 1, closed: 2, total: 5 });
  assert.deepEqual(H.partnerSort(undefined), []);
  const m = H.partnerMoney({ eur: { pending: 1250, payable: 4000, paid: 8000 } });
  assert.equal(nb(m.pending), "12,50 €");
  assert.equal(nb(m.payable), "40,00 €");
  assert.equal(nb(m.paid), "80,00 €");
  assert.equal(nb(m.open), "52,50 €");
  assert.equal(m.hasOpen, true);
  const z = H.partnerMoney({});
  assert.equal(nb(z.paid), "0,00 €");
  assert.equal(z.hasOpen, false);
  assert.equal(H.partnerMoney(null).hasOpen, false);
});

// ---------------------------------------------------------------------------
// Rendu dans un faux navigateur
// ---------------------------------------------------------------------------
function makeEl(id) {
  const on = {};
  return {
    id, innerHTML: "", textContent: "", hidden: false, value: "", max: "", className: "", disabled: false, open: false, on,
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, getAttribute() { return null; }, focus() {},
    addEventListener(type, fn) { (on[type] = on[type] || []).push(fn); },
  };
}

function affiliates() {
  return [
    { id: ID2, code: "OLDPRO", status: "approved", email: "pro@exemple.test", created_at: "2026-10-01T08:00:00Z", reviewed_at: "2026-10-02T08:00:00Z", reviewed_note: "",
      networks: ["https://youtube.com/@oldpro"], audience: 52000, content_style: "education", country: "be", legal_status: "professional", about: "Chaîne foot.",
      payout_ready: false, has_stripe_account: true, clicks: 340, signups: 21, active_paying: 4, balances: { eur: { pending: 1250, payable: 4000, paid: 8000 } } },
    { id: ID1, code: "<img src=x onerror=alert(1)>", status: "pending", email: "a\"b@exemple.test", created_at: new Date().toISOString(),
      networks: ["javascript:alert(1)", "https://tiktok.com/@ok\"><script>x</script>", "@juste_un_pseudo"], audience: 1200, content_style: "tips", country: "FR",
      legal_status: "individual", about: "<b>gras</b> & « guillemets »" },
    { id: ID3, code: "NONMERCI", status: "refused", email: "x@exemple.test", created_at: "2026-09-20T08:00:00Z", reviewed_at: "2026-09-21T08:00:00Z", reviewed_note: "Audience trop faible",
      networks: [], audience: null, content_style: "other", country: null, legal_status: null, about: "" }
  ];
}

async function boot(handlers) {
  const els = {};
  const calls = [];
  const docOn = {};
  const typed = { note: null };
  const document = {
    hidden: false,
    getElementById: (id) => (els[id] = els[id] || makeEl(id)),
    querySelectorAll: () => [],
    addEventListener(type, fn) { (docOn[type] = docOn[type] || []).push(fn); },
  };
  const ls = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })();
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { role: "admin" } }) }) }) }),
    rpc: (name, args) => {
      calls.push([name, args]);
      if (handlers[name]) return Promise.resolve(handlers[name](args));
      if (name === "admin_recent_signups") return Promise.resolve({ data: [] });
      return Promise.resolve({ error: { code: "PGRST202", message: "Could not find the function" } });
    },
  };
  const ctx = {
    document, localStorage: ls, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, URL,
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    supabase: { createClient: () => client },
    // Repli sans <dialog> : window.confirm ; la personne tape son message avant de valider.
    confirm: () => { if (typed.note !== null) els.partnerNote.value = typed.note; return true; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 5)); };
  await settle();
  // Clic sur un bouton d'action (délégation sur document, comme dans la page).
  const click = async (id, to) => {
    const btn = { disabled: false, getAttribute: (k) => (k === "data-pa-id" ? id : k === "data-pa-to" ? to : null) };
    const target = { closest: (sel) => (sel === "button[data-pa-to]" ? btn : null) };
    (docOn.click || []).forEach((fn) => fn({ target }));
    await settle();
  };
  return { els, calls, click, settle, typed };
}

test("rendu : résumé, « À valider » en premier, tout texte du candidat échappé, liens sûrs", async () => {
  const d = await boot({ admin_affiliates: () => ({ data: { generated_at: new Date().toISOString(), affiliates: affiliates() } }) });
  const out = d.els.partners.innerHTML;
  assert.match(out, /class="pa-sum"/);
  assert.match(out, /<div class="is-todo"><b class="tnum">1<\/b><span>À valider<\/span><\/div>/);
  assert.match(out, /<b class="tnum">1<\/b><span>Acceptés<\/span>/);
  assert.match(out, /<b class="tnum">1<\/b><span>Refusés ou suspendus<\/span>/);
  assert.ok(out.indexOf("À valider <span") < out.indexOf("Acceptés <span"), "groupe À valider avant Acceptés");
  // XSS : aucun balisage du candidat ne passe.
  assert.ok(!out.includes("<img src=x"), "code échappé");
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(!out.includes("<b>gras</b>"), "à propos échappé");
  assert.match(out, /&lt;b&gt;gras&lt;\/b&gt; &amp; « guillemets »/);
  assert.match(out, /a&quot;b@exemple\.test/, "e-mail échappé");
  assert.ok(!out.includes("<script>"), "réseau échappé");
  assert.ok(!/href="javascript:/i.test(out), "jamais de lien javascript:");
  assert.match(out, /<span title="javascript:alert\(1\)">javascript:alert\(1\)<\/span>/, "affiché en simple texte");
  assert.match(out, /<span title="@juste_un_pseudo">@juste_un_pseudo<\/span>/);
  for (const m of out.matchAll(/<a href="[^"]*"[^>]*>/g)) {
    assert.match(m[0], /target="_blank"/, "nouvel onglet");
    assert.match(m[0], /rel="noopener noreferrer"/, "rel=noopener");
  }
  assert.match(out, /href="https:\/\/youtube\.com\/@oldpro"/);
  // Libellés en français.
  assert.match(out, /France · Particulier · Pronostics · 1(\s|&nbsp;| )200 abonnés/);
  assert.match(nb(out), /Belgique · Professionnel · Éducation · 52 000 abonnés/);
  assert.match(out, /Pays non précisé · Statut non précisé · Autre · audience non précisée/);
  // Accepté : clics, inscrits, payants, commissions en euros.
  assert.match(out, /<dt>Clics<\/dt><dd class="tnum">340<\/dd>/);
  assert.match(out, /<dt>Abonnés payants<\/dt><dd class="tnum">4<\/dd>/);
  assert.match(nb(out), /<dt>En attente<\/dt><dd class="tnum">12,50 €<\/dd>/);
  assert.match(nb(out), /<dt>À verser<\/dt><dd class="tnum">40,00 €<\/dd>/);
  assert.match(nb(out), /<dt>Déjà versées<\/dt><dd class="tnum">80,00 €<\/dd>/);
  assert.match(out, /Compte de versement commencé, pas encore prêt\./);
  assert.match(out, /Refusé le \d{1,2} sept\. · message envoyé : « Audience trop faible »<\/p>/);
  assert.ok(!out.includes(".."), "jamais de double point après une date abrégée");
  // Boutons selon le statut.
  assert.match(out, new RegExp('data-pa-id="' + ID1 + '" data-pa-to="approved">Accepter<'));
  assert.match(out, new RegExp('data-pa-id="' + ID1 + '" data-pa-to="refused">Refuser<'));
  assert.match(out, new RegExp('data-pa-id="' + ID2 + '" data-pa-to="suspended">Suspendre<'));
  assert.match(out, new RegExp('data-pa-id="' + ID3 + '" data-pa-to="pending">Remettre à valider<'));
  // Pastille et ligne « À faire en premier ».
  assert.equal(d.els.partnersTabCount.hidden, false);
  assert.match(d.els.partnersTabCount.innerHTML, /^1<span class="sr-only"> dossier à valider<\/span>$/);
  assert.equal(d.els.partnersTodo.hidden, false);
  assert.match(d.els.partnersTodo.innerHTML, /1 candidature partenaire à valider/);
  assert.match(d.els.partnersTodo.innerHTML, /href="#ecran-partenaires"/);
});

test("rendu : liste vide, fonction absente", async () => {
  const e = await boot({ admin_affiliates: () => ({ data: { affiliates: [] } }) });
  assert.match(e.els.partners.innerHTML, /Aucune candidature pour l&#39;instant\./);
  assert.match(e.els.partners.innerHTML, /Les dossiers déposés sur la page Partenaires apparaîtront ici\./);
  assert.equal(e.els.partnersTabCount.hidden, true);
  assert.equal(e.els.partnersTodo.hidden, true);
  const m = await boot({});
  assert.match(m.els.partners.innerHTML, /Programme Partenaires pas encore branché/);
  assert.equal(m.els.partnersTabCount.hidden, true);
});

test("actions : accepter tout de suite, suspendre après confirmation, puis liste rechargée et message", async () => {
  let list = affiliates();
  const d = await boot({
    admin_affiliates: () => ({ data: { affiliates: list } }),
    admin_affiliate_set_status: (a) => {
      list = list.map((x) => (x.id === a.p_id ? { ...x, status: a.p_status } : x));
      return { data: { ok: true, status: a.p_status, commissions_refused: a.p_status === "suspended" ? 3 : 0 } };
    },
  });
  const before = d.calls.filter((c) => c[0] === "admin_affiliates").length;
  await d.click(ID1, "approved");
  const set = d.calls.filter((c) => c[0] === "admin_affiliate_set_status");
  assert.deepEqual(JSON.parse(JSON.stringify(set[0][1])), { p_id: ID1, p_status: "approved", p_note: null });
  assert.ok(d.calls.filter((c) => c[0] === "admin_affiliates").length > before, "liste rechargée");
  assert.match(d.els.toast.textContent, /^Dossier <img src=x onerror=alert\(1\)> accepté\.$/, "toast en texte brut (textContent)");
  assert.equal(d.els.partnersTabCount.hidden, true, "plus rien à valider");
  // Suspendre : confirmation (repli window.confirm ici), message facultatif transmis.
  d.typed.note = "  Liens non conformes  ";
  await d.click(ID2, "suspended");
  assert.match(d.els.partnerDialogText.textContent, /commissions pas encore versées \(52,50\s€\) seront annulées/);
  const last = d.calls.filter((c) => c[0] === "admin_affiliate_set_status").pop();
  assert.deepEqual(JSON.parse(JSON.stringify(last[1])), { p_id: ID2, p_status: "suspended", p_note: "Liens non conformes" });
  assert.match(d.els.toast.textContent, /^Dossier OLDPRO suspendu\. 3 commissions pas encore versées ont été annulées\.$/);
  // Identifiant invalide : aucun appel.
  const n = d.calls.length;
  await d.click("pas-un-uuid", "approved");
  assert.equal(d.calls.length, n);
});

test("actions : erreur expliquée en français, rien n'est changé", async () => {
  const d = await boot({
    admin_affiliates: () => ({ data: { affiliates: affiliates() } }),
    admin_affiliate_set_status: () => ({ error: { message: "Failed to fetch" } }),
  });
  await d.click(ID1, "approved");
  assert.match(d.els.toast.textContent, /^Pas de connexion au serveur : la décision n'est pas enregistrée\./);
  assert.match(d.els.partners.innerHTML, /data-pa-to="approved">Accepter</, "boutons de nouveau actifs");
  assert.ok(!/ disabled>/.test(d.els.partners.innerHTML));
});

test("admin.html : onglet Partenaires avec pastille, écran, aide repliée, dialogue de confirmation", () => {
  assert.match(html, /<a href="#ecran-partenaires" data-screen-link="partenaires">Partenaires<span class="tab-count tnum" id="partnersTabCount" hidden><\/span><\/a>/);
  assert.match(html, /<section class="card section" data-screen="partenaires" aria-labelledby="partnersTitle">/);
  assert.match(html, /<div id="partners"><div class="skel skel-block"><\/div><\/div>/);
  assert.match(html, /id="helpPartners" hidden/);
  assert.match(html, /<div class="todo-pa" id="partnersTodo" hidden><\/div>/);
  assert.ok(html.indexOf('id="partnersTodo"') < html.indexOf('id="todo"'), "ligne partenaires en tête de « À faire en premier »");
  assert.match(html, /<dialog class="confirm" id="partnerDialog"/);
  assert.match(html, /<textarea id="partnerNote" rows="3" maxlength="500"><\/textarea>/);
  assert.ok(H.SCREENS.some((s) => s.key === "partenaires" && s.label === "Partenaires"));
  assert.equal(H.screenKey("#ecran-partenaires"), "partenaires");
  assert.ok(js.includes('rpc("admin_affiliates")'));
  assert.ok(js.includes('rpc("admin_affiliate_set_status", { p_id: id, p_status: to, p_note: note })'));
});
