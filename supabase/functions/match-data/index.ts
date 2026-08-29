import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DATA_URL = "https://iashark.com/data.json";

// data.json (public) ne contient plus jamais ces champs depuis que le pipeline
// les ecrit a la place dans la table match_premium_data (voir
// supabase/migrations/0001_match_premium_data.sql). Cette liste sert
// uniquement de garde-fou si un ancien commit de data.json les contenait
// encore par erreur - on les retire quand meme explicitement pour un
// visiteur non-pro, en plus de ne jamais les rapporter depuis la table.
const PREMIUM_FIELDS = ["kelly", "edge", "verdict_shark", "facteur_x", "dropping_odds"];

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
  const supabase = createClient(SUPA_URL, SERVICE_KEY);

  if (jwt) {
    try {
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
  // Pas de bypass "phase de test" ici : cette fonction decide un vrai acces a
  // des donnees premium, contrairement au mur CSS de pro.html qui, lui,
  // reste ouvert en phase de test tant que le paiement n'existe pas (voir
  // FINAL_REMEDIATION_PLAN.md Phase 5). isPro doit refleter la realite.

  let data: Record<string, unknown>;
  try {
    const resp = await fetch(DATA_URL + "?t=" + Date.now());
    if (!resp.ok) throw new Error("data.json fetch failed: " + resp.status);
    data = await resp.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Impossible de charger les donnees", details: String(e) }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const matchs = Array.isArray(data.matchs) ? (data.matchs as Record<string, unknown>[]) : [];

  // Garde-fou : ne jamais laisser ces champs partir a un non-pro meme s'ils
  // trainent encore dans data.json (ancien commit, transition).
  if (!isPro) {
    data.matchs = matchs.map((m) => {
      const copy = { ...m };
      for (const f of PREMIUM_FIELDS) delete copy[f];
      return copy;
    });
    return new Response(JSON.stringify({ ...data, isPro }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Utilisateur pro confirme : enrichir avec les champs premium reels depuis
  // match_premium_data, plutot que de faire confiance a quoi que ce soit qui
  // viendrait du navigateur.
  const fixtureIds = matchs.map((m) => m.id).filter((id) => id != null);
  let premiumById: Record<string, Record<string, unknown>> = {};
  if (fixtureIds.length) {
    const { data: premiumRows, error } = await supabase
      .from("match_premium_data")
      .select("fixture_id,kelly,edge,verdict_shark,facteur_x,dropping_odds")
      .in("fixture_id", fixtureIds);
    if (error) {
      console.error("match_premium_data query failed:", error.message);
    } else {
      premiumById = Object.fromEntries((premiumRows ?? []).map((r) => [String(r.fixture_id), r]));
    }
  }

  data.matchs = matchs.map((m) => {
    const premium = premiumById[String(m.id)];
    return premium
      ? {
          ...m,
          kelly: premium.kelly ?? null,
          edge: premium.edge ?? null,
          verdict_shark: premium.verdict_shark ?? null,
          facteur_x: premium.facteur_x ?? null,
          dropping_odds: premium.dropping_odds ?? null,
        }
      : m;
  });

  return new Response(JSON.stringify({ ...data, isPro }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
