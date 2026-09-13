import { createClient } from "jsr:@supabase/supabase-js@2";

// Proxy devant l'authentification Supabase, avec un vrai rate limit par IP
// (backe par Postgres via check_rate_limit() - pas un compteur en memoire
// d'instance serverless, qui ne tient pas la charge en production
// multi-instance). Le frontend (compte.html, auth-header.js) doit appeler
// cette fonction au lieu de sb.auth.signInWithPassword() directement.
//
// N'importe qui peut toujours appeler l'API Auth Supabase directement avec
// la cle anon (elle est publique par design) - cette fonction ne remplace
// pas les protections natives de Supabase Auth, elle ajoute une couche
// supplementaire pour le chemin normal du site.

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-iashark-locale",
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
  rate_limited: { fr: "Trop de tentatives. Réessaie dans quelques minutes.", en: "Too many attempts. Try again in a few minutes.", es: "Demasiados intentos. Vuelve a intentarlo en unos minutos.", "es-mx": "Demasiados intentos. Vuelve a intentarlo en unos minutos.", de: "Zu viele Versuche. Versuche es in ein paar Minuten erneut.", it: "Troppi tentativi. Riprova tra qualche minuto.", pt: "Demasiadas tentativas. Tenta novamente dentro de alguns minutos." },
};

const LIMIT = 10; // tentatives
const WINDOW_SECONDS = 300; // par 5 minutes

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: { email?: string; password?: string; locale?: string; dir?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) {
    return new Response(JSON.stringify({ error: "missing_credentials" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  // Cle par IP ET par email : bloque le bruteforce sur un compte precis
  // depuis n'importe ou, ET le credential-stuffing depuis une seule IP sur
  // plein de comptes differents.
  const supabase = createClient(SUPA_URL, SERVICE_KEY);
  const [ipOk, emailOk] = await Promise.all([
    supabase.rpc("check_rate_limit", { p_key: "login_ip_" + ip, p_limit: LIMIT, p_window_seconds: WINDOW_SECONDS }),
    supabase.rpc("check_rate_limit", { p_key: "login_email_" + email, p_limit: LIMIT, p_window_seconds: WINDOW_SECONDS }),
  ]);
  if (ipOk.error || emailOk.error) {
    console.error("rate limit check failed", ipOk.error, emailOk.error);
    // Panne du rate limiter != panne de la connexion - on laisse passer
    // plutot que de bloquer tout le monde si la table a un probleme.
  } else if (ipOk.data === false || emailOk.data === false) {
    return new Response(
      JSON.stringify({ error: "rate_limited", message: msg(MESSAGES, "rate_limited", pickLocale(req, body.locale || body.dir)) }),
      { status: 429, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // Proxy vers l'endpoint natif Supabase Auth avec la cle anon (publique) -
  // cette fonction n'a pas besoin d'appeler le service role pour la
  // connexion elle-meme, seulement pour le rate limit ci-dessus.
  const authResp = await fetch(SUPA_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPA_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const authBody = await authResp.text();
  return new Response(authBody, {
    status: authResp.status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
