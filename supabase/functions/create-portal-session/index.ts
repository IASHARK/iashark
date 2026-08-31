import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@22.3.0";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAYMENT_PROVIDER = Deno.env.get("PAYMENT_PROVIDER") || "disabled";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://iashark.com";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (PAYMENT_PROVIDER !== "stripe") {
    return new Response(JSON.stringify({ ok: true, processed: false, message: "Le paiement en ligne n’est pas encore activé." }), { headers });
  }
  if (!STRIPE_SECRET_KEY) return new Response(JSON.stringify({ error: "billing_misconfigured" }), { status: 500, headers });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
  const supabase = createClient(SUPA_URL, SUPA_ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
  const { data: mapping, error: mappingError } = await supabase.from("billing_customers").select("stripe_customer_id").eq("user_id", auth.user.id).maybeSingle();
  if (mappingError || !mapping) return new Response(JSON.stringify({ error: "billing_customer_not_found" }), { status: 404, headers });
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" });
    const session = await stripe.billingPortal.sessions.create({ customer: mapping.stripe_customer_id, return_url: SITE_URL + "/compte.html" });
    return new Response(JSON.stringify({ ok: true, processed: true, url: session.url }), { headers });
  } catch (error) {
    console.error("[create-portal-session]", (error as Error).message);
    return new Response(JSON.stringify({ error: "portal_creation_failed" }), { status: 500, headers });
  }
});
