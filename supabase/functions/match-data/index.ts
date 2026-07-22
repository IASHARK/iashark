import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DATA_URL = "https://iashark.com/data.json";

// Champs exclusifs Outils : jamais envoyes au client si le plan n'est pas verifie 'pro' cote serveur.
const PREMIUM_FIELDS = ["kelly", "edge", "verdict_shark", "facteur_x", "dropping_odds"];

// TEMPORAIRE (phase de test) : Outils ouvert a tous, meme plan gratuit / non connecte.
// Repasser a false pour retablir le paywall normal une fois les paliers d'abonnement decides.
const OPEN_FOR_ALL = true;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  let isPro = false;
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  if (jwt) {
    try {
      const supabase = createClient(SUPA_URL, SERVICE_KEY);
      const { data: userData } = await supabase.auth.getUser(jwt);
      if (userData?.user) {
        const { data: row } = await supabase
          .from("users")
          .select("plan,role")
          .eq("id", userData.user.id)
          .maybeSingle();
        isPro = row?.plan === "pro" || row?.role === "admin";
      }
    } catch (_e) {
      isPro = false;
    }
  }

  isPro = isPro || OPEN_FOR_ALL;

  const resp = await fetch(DATA_URL + "?t=" + Date.now());
  const data = await resp.json();

  if (!isPro && Array.isArray(data.matchs)) {
    data.matchs = data.matchs.map((m: Record<string, unknown>) => {
      const copy = { ...m };
      for (const f of PREMIUM_FIELDS) delete copy[f];
      return copy;
    });
  }

  return new Response(JSON.stringify({ ...data, isPro }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
