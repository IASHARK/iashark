// IASHARK — compte de versement Stripe Connect Express d'un partenaire
// (03/10/2026). Appelee depuis l'espace partenaire (partenaires-page.js) avec
// le jeton du compte connecte.
//
// Corps : {"mode": "start" | "status", "dir": "fr"}.
// - start : affilie VALIDE seulement. Cree son compte Express s'il n'existe
//   pas (Stripe verifie ensuite son identite et gere ses declarations), puis
//   renvoie un lien d'onboarding Stripe (url) valable quelques minutes.
// - status : relit le compte chez Stripe ; payouts_enabled -> payout_ready,
//   payout_mode 'connect'.
// AFFILIATE_CONNECT absent ou != on (Connect pas encore active sur le compte
// Stripe de Clement) : {processed:false, reason:"connect_not_enabled"} ; le
// versement se fait a la main (export CSV + « Marquer paye » dans admin.html).
// Jamais de donnee d'identite ici : tout est saisi chez Stripe.
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://iashark.com";
const CONNECT_ON = (Deno.env.get("AFFILIATE_CONNECT") || "").toLowerCase() === "on";
const STRIPE_API_VERSION = "2026-06-24.dahlia";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const ALLOWED_DIRS = ["fr", "en", "es", "gb", "za", "mx"];
// Pays de l'Espace economique europeen + Royaume-Uni + Suisse : accord de
// service complet ; ailleurs : accord « recipient » (compte qui recoit des
// virements seulement, versements transfrontaliers Stripe).
const EEA = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "CH"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { ok: false, error: "unauthorized" });
  const asUser = createClient(SUPA_URL, SUPA_ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth?.user) return json(401, { ok: false, error: "unauthorized" });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { body = {}; }
  const mode = body.mode === "status" ? "status" : "start";
  const dir = typeof body.dir === "string" && ALLOWED_DIRS.includes(body.dir.toLowerCase()) ? body.dir.toLowerCase() : "fr";

  const admin = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: aff } = await admin.from("affiliates").select("id,status,code,country,legal_status,stripe_account_id,payout_ready,payout_mode").eq("user_id", auth.user.id).maybeSingle();
  if (!aff) return json(200, { ok: true, processed: false, reason: "not_affiliate" });
  if (aff.status !== "approved") return json(200, { ok: true, processed: false, reason: "affiliate_not_active", status: aff.status });
  if (!CONNECT_ON || !STRIPE_SECRET_KEY) return json(200, { ok: true, processed: false, reason: "connect_not_enabled", payout_mode: "manual" });

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });
  try {
    let accountId: string | null = aff.stripe_account_id;
    if (mode === "start" && !accountId) {
      const country = /^[A-Z]{2}$/.test(String(aff.country || "")) ? String(aff.country) : "FR";
      const account = await stripe.accounts.create({
        type: "express",
        country,
        email: auth.user.email || undefined,
        business_type: aff.legal_status === "professional" ? "company" : "individual",
        capabilities: { transfers: { requested: true } },
        ...(EEA.has(country) ? {} : { tos_acceptance: { service_agreement: "recipient" } }),
        metadata: { iashark_affiliate_id: aff.id, iashark_code: aff.code },
      });
      accountId = account.id;
      const { error } = await admin.from("affiliates").update({ stripe_account_id: accountId, payout_mode: "connect" }).eq("id", aff.id);
      if (error) throw new Error("affiliates.stripe_account_id : " + error.message);
      await admin.from("affiliate_ledger").insert({ affiliate_id: aff.id, event: "connect_account_created", details: { account: accountId, country } });
    }
    if (!accountId) return json(200, { ok: true, processed: false, reason: "no_account" });
    if (mode === "start") {
      const base = SITE_URL.replace(/\/$/, "") + "/" + dir + "/partenaires.html";
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: base + "?connect=refresh",
        return_url: base + "?connect=return",
        type: "account_onboarding",
      });
      return json(200, { ok: true, processed: true, url: link.url });
    }
    const account = await stripe.accounts.retrieve(accountId);
    const ready = !!account.payouts_enabled && !!account.details_submitted;
    if (ready !== !!aff.payout_ready) {
      await admin.from("affiliates").update({ payout_ready: ready, payout_mode: "connect" }).eq("id", aff.id);
      await admin.from("affiliate_ledger").insert({ affiliate_id: aff.id, event: ready ? "connect_ready" : "connect_not_ready", details: { account: accountId } });
    }
    return json(200, { ok: true, processed: true, payout_ready: ready, details_submitted: !!account.details_submitted, requirements_due: (account.requirements?.currently_due || []).length });
  } catch (err) {
    const msg = (err as Error).message || "";
    console.error("[affiliate-connect] " + msg);
    // Connect pas active cote Stripe : message honnete, mode manuel.
    if (/connect/i.test(msg) && /(not|n't) (enabled|activated|set up|signed up)/i.test(msg)) {
      return json(200, { ok: true, processed: false, reason: "connect_not_enabled", payout_mode: "manual" });
    }
    return json(500, { ok: false, error: "connect_failed" });
  }
});
