// IASHARK — versement mensuel des commissions partenaires (03/10/2026).
//
// Appelee le 5 de chaque mois par la tache planifiee (migration 0051, en-tete
// x-internal-secret = EMAIL_INTERNAL_SECRET, le meme secret interne que les
// e-mails), ou a la main par l'admin (jeton d'un compte role = 'admin', corps
// {"dryRun": true} pour voir sans rien virer).
//
// Etapes :
//   1. affiliate_mature_commissions() : les commissions de plus de 30 jours
//      des affilies valides passent 'payable' ;
//   2. lignes payables (commissions et reprises) des affilies 'approved',
//      regroupees par affilie et devise, seuil 50 (5000 centimes) ;
//   3. AFFILIATE_CONNECT=on ET affilie avec compte Stripe Connect pret
//      (payout_ready) : stripe.transfers.create vers son compte (cle
//      d'idempotence = affilie + devise + mois), ligne affiliate_payouts
//      'connect', commissions -> 'paid' ;
//      sinon : rien n'est vire, le lot est renvoye dans "manual" (export CSV +
//      bouton « Marquer paye » dans admin.html).
//
// Sans STRIPE_SECRET_KEY ou avec AFFILIATE_CONNECT absent : seule l'etape 1
// a lieu et tout est "manual". Aucun appel Stripe.
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { payoutBatches, PAYOUT_THRESHOLD_CENTS } from "../_shared/affiliation.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const INTERNAL_SECRET = Deno.env.get("EMAIL_INTERNAL_SECRET");
const CONNECT_ON = (Deno.env.get("AFFILIATE_CONNECT") || "").toLowerCase() === "on";
const STRIPE_API_VERSION = "2026-06-24.dahlia";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Content-Type": "application/json",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  // Appelant : secret interne (tache planifiee) OU compte admin.
  let caller = "cron";
  const secret = req.headers.get("x-internal-secret") || "";
  if (!(INTERNAL_SECRET && secret && safeEqual(secret, INTERNAL_SECRET))) {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json(401, { ok: false, error: "unauthorized" });
    const asUser = createClient(SUPA_URL, SUPA_ANON_KEY, { global: { headers: { Authorization: authorization } } });
    const { data: auth } = await asUser.auth.getUser();
    if (!auth?.user) return json(401, { ok: false, error: "unauthorized" });
    const { data: me } = await asUser.from("users").select("role").eq("id", auth.user.id).maybeSingle();
    if (!me || me.role !== "admin") return json(403, { ok: false, error: "forbidden" });
    caller = "admin:" + auth.user.id;
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { body = {}; }
  const dryRun = body.dryRun === true;

  const supabase = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: matured, error: matErr } = await supabase.rpc("affiliate_mature_commissions");
  if (matErr) return json(500, { ok: false, error: "mature_failed", message: matErr.message });

  const { data: lines, error: linesErr } = await supabase
    .from("affiliate_commissions")
    .select("id,affiliate_id,currency,amount_cents,kind,affiliates!inner(status,stripe_account_id,payout_ready,code)")
    .eq("status", "payable")
    .eq("affiliates.status", "approved");
  if (linesErr) return json(500, { ok: false, error: "read_failed", message: linesErr.message });

  const batches = payoutBatches((lines || []).map((l: Record<string, unknown>) => ({
    id: l.id as string, affiliate_id: l.affiliate_id as string, currency: l.currency as string, amount_cents: l.amount_cents as number, kind: l.kind as "commission" | "reversal",
  })), PAYOUT_THRESHOLD_CENTS);
  const affiliateInfo = new Map<string, { stripe_account_id: string | null; payout_ready: boolean; code: string }>();
  for (const l of lines || []) {
    const a = (l as Record<string, unknown>).affiliates as { stripe_account_id: string | null; payout_ready: boolean; code: string };
    affiliateInfo.set((l as Record<string, unknown>).affiliate_id as string, a);
  }

  const period = new Date().toISOString().slice(0, 7);
  const paid: unknown[] = [];
  const manual: unknown[] = [];
  const errors: unknown[] = [];
  const stripe = CONNECT_ON && STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion }) : null;

  for (const b of batches) {
    const a = affiliateInfo.get(b.affiliate_id);
    const canTransfer = !!(stripe && a && a.stripe_account_id && a.payout_ready);
    if (!canTransfer) {
      manual.push({ affiliate_id: b.affiliate_id, code: a?.code, currency: b.currency, amount_cents: b.amount_cents, lines: b.line_ids.length, reason: !CONNECT_ON ? "connect_off" : !a?.stripe_account_id ? "no_stripe_account" : "account_not_ready" });
      continue;
    }
    if (dryRun) { paid.push({ affiliate_id: b.affiliate_id, code: a!.code, currency: b.currency, amount_cents: b.amount_cents, dry_run: true }); continue; }
    try {
      const transfer = await stripe!.transfers.create({
        amount: b.amount_cents,
        currency: b.currency,
        destination: a!.stripe_account_id!,
        description: "IASHARK partenaires " + period,
        metadata: { affiliate_id: b.affiliate_id, period, lines: String(b.line_ids.length) },
      }, { idempotencyKey: "aff-payout-" + b.affiliate_id + "-" + b.currency + "-" + period });
      const { data: payout, error: pErr } = await supabase.from("affiliate_payouts").insert({
        affiliate_id: b.affiliate_id, currency: b.currency, amount_cents: b.amount_cents, mode: "connect", stripe_transfer_id: transfer.id, period_label: period,
      }).select("id").single();
      if (pErr) throw new Error("affiliate_payouts : " + pErr.message);
      const { error: uErr } = await supabase.from("affiliate_commissions")
        .update({ status: "paid", paid_at: new Date().toISOString(), payout_id: payout.id })
        .in("id", b.line_ids).eq("status", "payable");
      if (uErr) throw new Error("commissions -> paid : " + uErr.message);
      await supabase.from("affiliate_ledger").insert({ affiliate_id: b.affiliate_id, event: "payout_connect", details: { transfer: transfer.id, amount_cents: b.amount_cents, currency: b.currency, period, caller } });
      paid.push({ affiliate_id: b.affiliate_id, code: a!.code, currency: b.currency, amount_cents: b.amount_cents, transfer: transfer.id });
    } catch (err) {
      errors.push({ affiliate_id: b.affiliate_id, currency: b.currency, amount_cents: b.amount_cents, message: (err as Error).message });
      console.error("[affiliate-payouts] virement impossible pour " + b.affiliate_id + " : " + (err as Error).message);
    }
  }
  console.log("[affiliate-payouts] " + period + " : " + (matured || 0) + " commission(s) devenue(s) payable(s), " + paid.length + " virement(s), " + manual.length + " lot(s) en manuel, " + errors.length + " erreur(s).");
  return json(200, { ok: true, period, connect: CONNECT_ON, dry_run: dryRun, matured: matured || 0, paid, manual, errors, threshold_cents: PAYOUT_THRESHOLD_CENTS });
});
