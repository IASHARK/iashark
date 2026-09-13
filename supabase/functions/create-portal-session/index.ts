import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@22.3.0";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PAYMENT_PROVIDER = Deno.env.get("PAYMENT_PROVIDER") || "disabled";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://iashark.com";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-iashark-locale",
  "Content-Type": "application/json",
};

// Langue des messages renvoyes a l'utilisateur. Priorite : champ `locale`
// (ou `dir` de la page : fr/en/es/de/it/pt/gb/mx/za) du corps, en-tete
// x-iashark-locale, puis Accept-Language du navigateur ; francais par defaut.
// Les codes `error`/`code` restent stables pour les clients qui traduisent
// eux-memes.
const MSG_LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DIR_LOCALE: Record<string, string> = { gb: "en", za: "en", mx: "es-mx" };
function normLocale(value: unknown): string {
  const s = String(value || "").trim().toLowerCase().replace("_", "-");
  if (!s) return "";
  if (DIR_LOCALE[s]) return DIR_LOCALE[s];
  if (s.startsWith("es-mx")) return "es-mx";
  if (MSG_LOCALES.includes(s)) return s;
  const base = s.split("-")[0];
  return MSG_LOCALES.includes(base) ? base : "";
}
function pickLocale(req: Request, hint?: unknown): string {
  const direct = normLocale(hint) || normLocale(req.headers.get("x-iashark-locale"));
  if (direct) return direct;
  for (const part of (req.headers.get("accept-language") || "").split(",")) {
    const l = normLocale(part.split(";")[0]);
    if (l) return l;
  }
  return "fr";
}
function msg(table: Record<string, Record<string, string>>, key: string, locale: string): string {
  const row = table[key];
  return (row && (row[locale] || row[locale.split("-")[0]] || row.fr)) || key;
}
const MESSAGES: Record<string, Record<string, string>> = {
  payment_disabled: { fr: "Le paiement en ligne n’est pas encore activé.", en: "Online payment is not enabled yet.", es: "El pago en línea aún no está activado.", de: "Die Online-Zahlung ist noch nicht aktiviert.", it: "Il pagamento online non è ancora attivo.", pt: "O pagamento online ainda não está ativado." },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (PAYMENT_PROVIDER !== "stripe") {
    return new Response(JSON.stringify({ ok: true, processed: false, code: "payment_disabled", message: msg(MESSAGES, "payment_disabled", pickLocale(req)) }), { headers });
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
