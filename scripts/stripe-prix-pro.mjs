// Prix de l'abonnement Pro chez Stripe et dans les secrets de la fonction
// create-checkout-session (baisse des prix decidee par Clement le 25/10/2026).
// Lance par .github/workflows/stripe-prix-pro.yml (declenchement manuel).
//
// Etapes (argument 1) :
//   verifier        LECTURE SEULE. Pour chaque marche : le Price de la
//                   configuration (montant, duree, actif, produit), le nombre
//                   d'abonnements par Price (comptes seulement), les autres Price
//                   actifs du produit, le portail client, et a quel Price pointe
//                   chaque secret STRIPE_PRICE_ID_* (comparaison d'empreintes,
//                   aucune valeur affichee).
//   creer           Cree les nouveaux Price (CIBLES, en centimes) sur le MEME
//                   produit que le Price actuel de la meme duree, memes
//                   devise / periodicite / regime de taxe. N'archive et ne modifie
//                   JAMAIS un ancien Price : l'abonne actuel garde son prix.
//                   Idempotent : un Price actif identique deja cree est reutilise.
//   mettre-en-ligne Depuis main : chaque id de config/markets.json#<marche>.
//                   stripePriceIds doit correspondre exactement (devise, duree x1,
//                   montant TTC, actif) au prix affiche ET a prices.generated.ts
//                   (ce que la fonction attendra). Sinon arret, rien n'est touche.
//                   Puis pose les secrets STRIPE_PRICE_ID_<MARCHE>_<DUREE>.
//                   (La mise en ligne de la fonction est l'etape suivante du workflow.)
//   controle-final  Apres la mise en ligne : empreintes des secrets = ids de la
//                   configuration, reponse « availability » de la fonction en
//                   ligne (durees ouvertes, essai), et montant + duree de chaque
//                   Price resolu.
//
// Jamais affiche : la cle Stripe, la valeur ou l'empreinte d'un secret.
// Un id de Price n'est pas un secret (il est deja ecrit dans config/markets.json).
import { appendFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const PROJECT_REF = "ksvjraqitxouwiabecai";
const FUNCTION_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/create-checkout-session`;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const SUPA_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const INTERVALS = ["week", "month", "year"];
const NOMS = { week: "semaine", month: "mois", year: "annee" };
const DATE_DECISION = "2026-10-25";

const lignes = [];
function dire(s = "") { console.log(s); lignes.push(s); }
function resumeGithub() {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) appendFileSync(f, "```\n" + lignes.join("\n") + "\n```\n");
}
function stop(msg) { dire("ARRET : " + msg); resumeGithub(); process.exit(1); }

function montant(cents, devise) {
  if (cents == null) return "?";
  return (cents / 100).toFixed(2).replace(".", ",") + " " + String(devise || "").toUpperCase();
}
function sha256(s) { return createHash("sha256").update(String(s)).digest("hex"); }

// ---- Stripe (API REST, sans dependance) -----------------------------------
function encoder(obj, prefixe = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const cle = prefixe ? `${prefixe}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x) => out.push(`${encodeURIComponent(cle + "[]")}=${encodeURIComponent(x)}`));
    else if (typeof v === "object") encoder(v, cle, out);
    else out.push(`${encodeURIComponent(cle)}=${encodeURIComponent(v)}`);
  }
  return out;
}
async function stripe(methode, chemin, params, idem) {
  if (!STRIPE_KEY) stop("secret STRIPE_SECRET_KEY absent cote GitHub");
  const corps = params ? encoder(params).join("&") : "";
  const url = "https://api.stripe.com/v1/" + chemin + (methode === "GET" && corps ? "?" + corps : "");
  const headers = { Authorization: "Bearer " + STRIPE_KEY, "Stripe-Version": "2024-06-20" };
  if (methode !== "GET") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idem) headers["Idempotency-Key"] = idem;
  const res = await fetch(url, { method: methode, headers, body: methode === "GET" ? undefined : corps });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error || {};
    throw new Error(`Stripe ${methode} ${chemin.split("?")[0]} : HTTP ${res.status} ${e.type || ""} ${e.code || ""} ${e.message || ""}`.trim());
  }
  return json;
}
async function toutLister(chemin, params) {
  const out = [];
  let apres;
  for (let i = 0; i < 20; i++) {
    const page = await stripe("GET", chemin, { ...params, limit: 100, ...(apres ? { starting_after: apres } : {}) });
    out.push(...page.data);
    if (!page.has_more || !page.data.length) break;
    apres = page.data[page.data.length - 1].id;
  }
  return out;
}

// ---- Supabase (API de gestion : secrets) ---------------------------------
async function supabase(methode, chemin, corps) {
  if (!SUPA_TOKEN) stop("secret SUPABASE_ACCESS_TOKEN absent cote GitHub");
  const res = await fetch("https://api.supabase.com/v1/projects/" + PROJECT_REF + chemin, {
    method: methode,
    headers: { Authorization: "Bearer " + SUPA_TOKEN, "Content-Type": "application/json" },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const texte = await res.text();
  if (!res.ok) throw new Error(`Supabase ${methode} ${chemin} : HTTP ${res.status}`);
  try { return JSON.parse(texte); } catch (_) { return texte; }
}
// Empreintes des secrets : { NOM: empreinte } (jamais affichees).
async function empreintesSecrets() {
  const liste = await supabase("GET", "/secrets");
  const out = {};
  for (const s of Array.isArray(liste) ? liste : []) if (s && s.name) out[s.name] = String(s.value || "");
  return out;
}

// ---- Configuration du depot -----------------------------------------------
function lireMarches() {
  const conf = JSON.parse(readFileSync("config/markets.json", "utf8"));
  const voulus = String(process.env.MARCHES || "fr").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const m of voulus) if (!conf[m] || m.startsWith("_")) stop(`marche inconnu dans config/markets.json : ${m}`);
  return { conf, voulus };
}
function envKey(marche, iv) { return `STRIPE_PRICE_ID_${marche.toUpperCase()}_${iv.toUpperCase()}`; }
function prixConfig(conf, marche, iv) {
  const p = conf[marche]?.prices?.pro?.[iv];
  return p && typeof p.amount === "number" ? Math.round(p.amount * 100) : null;
}
// Table attendue par la fonction deployee (prices.generated.ts du depot).
function tableGeneree() {
  const src = readFileSync("supabase/functions/create-checkout-session/prices.generated.ts", "utf8");
  const debut = src.indexOf("= {", src.indexOf("PRO_PRICES"));
  return JSON.parse(src.slice(debut + 2).trim().replace(/;\s*$/, ""));
}
function correspond(price, devise, cents, iv) {
  return price.active === true && price.type === "recurring" &&
    String(price.currency || "").toUpperCase() === String(devise).toUpperCase() &&
    price.recurring?.interval === iv && (price.recurring?.interval_count ?? 1) === 1 &&
    price.unit_amount === cents && price.tax_behavior !== "exclusive";
}
function decrire(p) {
  const essai = p.recurring?.trial_period_days ? `, essai sur le Price ${p.recurring.trial_period_days} j` : "";
  return `${montant(p.unit_amount, p.currency)} / ${p.recurring?.interval}${(p.recurring?.interval_count ?? 1) !== 1 ? " x" + p.recurring.interval_count : ""}, ${p.active ? "actif" : "ARCHIVE"}, taxe ${p.tax_behavior}${essai}, ${p.livemode ? "mode reel" : "mode TEST"}`;
}
async function compterAbonnements(priceId) {
  const subs = await toutLister("subscriptions", { price: priceId, status: "all" });
  const parStatut = {};
  for (const s of subs) parStatut[s.status] = (parStatut[s.status] || 0) + 1;
  const txt = Object.entries(parStatut).map(([k, v]) => `${k} ${v}`).join(", ");
  return txt || "aucun";
}

// ---- Etapes ---------------------------------------------------------------
async function verifier() {
  const { conf, voulus } = lireMarches();
  let empreintes = {};
  try { empreintes = await empreintesSecrets(); } catch (e) { dire("Secrets Supabase illisibles : " + e.message); }
  const noms = Object.keys(empreintes);
  dire(`Secrets presents (noms seulement) : ${noms.filter((n) => /^(STRIPE_|PAYMENT_PROVIDER|TRIAL_DAYS|SITE_URL)/.test(n)).sort().join(", ") || "aucun"}`);
  const produits = new Set();
  for (const m of voulus) {
    const devise = conf[m].currency;
    dire("");
    dire(`== Marche ${m} (${devise})`);
    const ids = conf[m].stripePriceIds || {};
    const candidats = new Map();
    for (const iv of INTERVALS) {
      const cents = prixConfig(conf, m, iv);
      if (cents == null) { dire(`${NOMS[iv]} : non vendu dans ce marche`); continue; }
      let ligne = `${NOMS[iv]} : affiche ${montant(cents, devise)}`;
      if (ids[iv]) {
        try {
          const p = await stripe("GET", "prices/" + ids[iv]);
          produits.add(p.product);
          candidats.set(p.id, p);
          ligne += ` ; Price de la config ${p.id} = ${decrire(p)} ; produit ${p.product} ; abonnements : ${await compterAbonnements(p.id)}`;
          if (!correspond(p, devise, cents, iv)) ligne += " ; DIFFERENT du prix affiche";
        } catch (e) { ligne += ` ; Price de la config illisible (${e.message})`; }
      } else ligne += " ; aucun id dans la config";
      dire(ligne);
    }
    for (const prod of produits) {
      const actifs = await toutLister("prices", { product: prod, active: "true", currency: devise.toLowerCase() });
      for (const p of actifs) if (p.type === "recurring") candidats.set(p.id, p);
      dire(`Price actifs en ${devise} du produit ${prod} :`);
      for (const p of actifs.filter((x) => x.type === "recurring").sort((a, b) => a.unit_amount - b.unit_amount)) {
        dire(`  ${p.id} : ${decrire(p)} ; abonnements : ${await compterAbonnements(p.id)}`);
      }
    }
    for (const iv of INTERVALS) {
      const nom = envKey(m, iv);
      if (!(nom in empreintes)) { dire(`${nom} : absent (repli : ${iv === "month" && m === "fr" ? "STRIPE_PRICE_ID puis " : ""}id de la config)`); continue; }
      const e = empreintes[nom].toLowerCase();
      const trouve = [...candidats.values()].find((p) => sha256(p.id) === e);
      dire(`${nom} : present, pointe vers ${trouve ? trouve.id + " (" + decrire(trouve) + ")" : "un Price inconnu de cette liste (empreinte non reconnue)"}`);
    }
    if (m === "fr" && "STRIPE_PRICE_ID" in empreintes) {
      const e = empreintes.STRIPE_PRICE_ID.toLowerCase();
      const trouve = [...candidats.values()].find((p) => sha256(p.id) === e);
      dire(`STRIPE_PRICE_ID (ancien, mensuel FR) : present, pointe vers ${trouve ? trouve.id + " (" + decrire(trouve) + ")" : "un Price inconnu de cette liste"}`);
    }
  }
  dire("");
  dire("== Portail client Stripe");
  const confs = await toutLister("billing_portal/configurations", {});
  for (const c of confs) {
    const su = c.features?.subscription_update || {};
    const prods = (su.products || []).map((x) => `${x.product} [${(x.prices || []).join(" ")}]`).join(" ; ");
    dire(`${c.id} : ${c.is_default ? "par defaut" : "autre"}, ${c.active ? "active" : "inactive"}, changement d'abonnement ${su.enabled ? "OUVERT" : "ferme"}${prods ? " -> " + prods : ""}`);
  }
  if (!confs.length) dire("aucune configuration");
}

function lireCibles() {
  const brut = String(process.env.CIBLES || "").trim();
  if (!brut) stop("CIBLES vide (ex. fr.week=499,fr.month=1499,fr.year=9900)");
  return brut.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^([a-z]{2})\.(week|month|year)=(\d{2,7})$/);
    if (!m) stop(`cible illisible : ${s}`);
    return { marche: m[1], iv: m[2], cents: Number(m[3]) };
  });
}

async function creer() {
  const conf = JSON.parse(readFileSync("config/markets.json", "utf8"));
  const cibles = lireCibles();
  for (const c of cibles) {
    const devise = conf[c.marche]?.currency;
    if (!devise) stop(`marche inconnu : ${c.marche}`);
    // Produit : celui du Price actuel de la meme duree (config), sinon celui
    // d'une autre duree du meme marche.
    const ids = conf[c.marche].stripePriceIds || {};
    const source = ids[c.iv] || INTERVALS.map((i) => ids[i]).find(Boolean);
    if (!source) stop(`${c.marche} ${c.iv} : aucun Price existant pour trouver le produit`);
    const ancien = await stripe("GET", "prices/" + source);
    if (String(ancien.currency).toUpperCase() !== devise) stop(`${c.marche} : devise du Price existant ${ancien.currency} != ${devise}`);
    const existants = await toutLister("prices", { product: ancien.product, active: "true", currency: devise.toLowerCase(), type: "recurring" });
    const deja = existants.find((p) => correspond(p, devise, c.cents, c.iv) && p.tax_behavior === ancien.tax_behavior);
    if (deja) {
      dire(`${c.marche} ${NOMS[c.iv]} : deja present ${deja.id} = ${decrire(deja)} (reutilise)`);
      continue;
    }
    const params = {
      product: ancien.product,
      currency: devise.toLowerCase(),
      unit_amount: c.cents,
      tax_behavior: ancien.tax_behavior || "unspecified",
      recurring: { interval: c.iv, interval_count: 1, ...(ancien.recurring?.trial_period_days ? { trial_period_days: ancien.recurring.trial_period_days } : {}) },
      nickname: `IASHARK Pro ${c.marche.toUpperCase()} ${NOMS[c.iv]} ${montant(c.cents, devise)} (${DATE_DECISION})`,
      metadata: { ...(ancien.metadata || {}), iashark_market: c.marche, iashark_interval: c.iv, iashark_decision: DATE_DECISION, iashark_remplace: ancien.id },
    };
    const nouveau = await stripe("POST", "prices", params, `iashark-pro-${c.marche}-${c.iv}-${c.cents}-${DATE_DECISION}`);
    dire(`${c.marche} ${NOMS[c.iv]} : CREE ${nouveau.id} = ${decrire(nouveau)} (produit ${nouveau.product}, ancien ${ancien.id} garde tel quel : ${decrire(ancien)})`);
  }
}

async function controlerConfig(conf, voulus) {
  const table = tableGeneree();
  const aPoser = [];
  for (const m of voulus) {
    const devise = conf[m].currency;
    const ids = conf[m].stripePriceIds || {};
    for (const iv of INTERVALS) {
      const cents = prixConfig(conf, m, iv);
      if (cents == null) continue;
      const attendu = table[m]?.intervals?.[iv];
      if (!attendu || attendu.unitAmount !== cents) stop(`${m} ${iv} : prices.generated.ts (${attendu ? attendu.unitAmount : "absent"}) != config (${cents}) : relancer node scripts/build-locales.js`);
      if (!ids[iv]) { dire(`${m} ${NOMS[iv]} : aucun id dans la config, secret non pose`); continue; }
      if (attendu.priceId !== ids[iv]) stop(`${m} ${iv} : id de prices.generated.ts different de la config`);
      const p = await stripe("GET", "prices/" + ids[iv]);
      if (!correspond(p, devise, cents, iv)) stop(`${m} ${iv} : le Price de la config (${decrire(p)}) ne correspond pas au prix affiche ${montant(cents, devise)}`);
      if (!p.livemode) stop(`${m} ${iv} : Price en mode TEST`);
      aPoser.push({ name: envKey(m, iv), value: ids[iv], affichage: `${montant(p.unit_amount, p.currency)} / ${p.recurring.interval}` });
    }
  }
  return aPoser;
}

async function mettreEnLigne() {
  const { conf, voulus } = lireMarches();
  const aPoser = await controlerConfig(conf, voulus);
  if (!aPoser.length) stop("aucun secret a poser");
  for (const s of aPoser) dire(`${s.name} -> Price de ${s.affichage} (controle Stripe OK)`);
  await supabase("POST", "/secrets", aPoser.map(({ name, value }) => ({ name, value })));
  dire(`${aPoser.length} secret(s) pose(s) dans Supabase.`);
}

async function controleFinal() {
  const { conf, voulus } = lireMarches();
  const empreintes = await empreintesSecrets();
  let ok = true;
  for (const m of voulus) {
    const devise = conf[m].currency;
    const ids = conf[m].stripePriceIds || {};
    for (const iv of INTERVALS) {
      const cents = prixConfig(conf, m, iv);
      if (cents == null || !ids[iv]) continue;
      const nom = envKey(m, iv);
      const egal = nom in empreintes && empreintes[nom].toLowerCase() === sha256(ids[iv]);
      const p = await stripe("GET", "prices/" + ids[iv]);
      const bon = correspond(p, devise, cents, iv);
      dire(`${m} ${NOMS[iv]} : secret ${egal ? "= id de la config" : "DIFFERENT ou absent"} ; Price resolu : ${montant(p.unit_amount, p.currency)} / ${p.recurring?.interval} ; affiche ${montant(cents, devise)} ; ${bon ? "OK" : "ECART"}`);
      if (!egal || !bon) ok = false;
    }
    const corps = { mode: "availability" };
    if (m !== "fr") corps.market = conf[m].checkoutMarket || m;
    try {
      const res = await fetch(FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const d = await res.json();
      dire(`${m} : fonction en ligne, durees payables ${JSON.stringify(d.intervals)} ; essai ${d.trial_days ?? "?"} j sur ${JSON.stringify(d.trial_intervals ?? null)}`);
      for (const iv of conf[m].checkoutOpen || []) if (!d.intervals || d.intervals[iv] !== true) { ok = false; dire(`  ${iv} ferme cote fonction`); }
    } catch (e) { ok = false; dire(`${m} : appel de la fonction impossible (${e.message})`); }
  }
  if (!ok) stop("controle final en ECART");
  dire("Controle final OK.");
}

const etape = process.argv[2] || "verifier";
const etapes = { verifier, creer, "mettre-en-ligne": mettreEnLigne, "controle-final": controleFinal };
if (!etapes[etape]) stop(`etape inconnue : ${etape}`);
etapes[etape]().then(() => resumeGithub()).catch((e) => stop(e.message));
