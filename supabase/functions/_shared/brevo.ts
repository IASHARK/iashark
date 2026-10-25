// Envoi d'e-mails par Brevo, partage par send-lifecycle-emails et trial-reminder.
// Meme methode que la relance du 20/10/2026 (supabase/functions/relance-emails,
// seul envoi qui a marche) : meme API, meme expediteur, meme adresse de reponse,
// memes en-tetes de desinscription.
//
// Module PUR (aucune dependance Deno/npm : fetch et variables injectes), teste
// par node --test (tests/email-lifecycle-edge.test.js, tests/trial-reminder.test.js).
//
// REGION OBLIGATOIRE : Brevo n'accepte que les adresses IP autorisees par
// Clement (plage IPv6 2600:1f16::/32, AWS Ohio). Une fonction qui envoie doit
// donc etre appelee avec l'en-tete « x-region: us-east-2 » (ou le parametre
// ?forceFunctionRegion=us-east-2), comme .github/workflows/relance-emails.yml.
// Supabase donne la region d'execution dans SB_REGION : hors us-east-2, rien
// n'est envoye (sinon Brevo refuse et l'essai est perdu).

export type GetEnv = (name: string) => string | undefined | null;

export const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
export const BREVO_REGION = "us-east-2";
export const DEFAULT_SENDER_NAME = "Clément, IASHARK";
export const DEFAULT_SENDER_EMAIL = "news@iashark.com";
export const DEFAULT_REPLY_TO = "contact@iashark.com";
export const MIN_CALLER_SECRET_LENGTH = 32;

export function envValue(env: GetEnv, name: string): string | null {
  const v = env(name);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export type BrevoConfig = { apiKey: string | null; senderName: string; senderEmail: string; replyTo: string };

// Memes variables et memes valeurs par defaut que relance-emails.
export function brevoConfig(env: GetEnv): BrevoConfig {
  const key = envValue(env, "BREVO_API_KEY");
  return {
    apiKey: key ? key.replace(/[\r\n ]/g, "") : null,
    senderName: envValue(env, "EMAIL_FROM_NAME") || DEFAULT_SENDER_NAME,
    senderEmail: envValue(env, "EMAIL_FROM_ADDRESS") || DEFAULT_SENDER_EMAIL,
    replyTo: envValue(env, "EMAIL_REPLY_TO") || DEFAULT_REPLY_TO,
  };
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Appel serveur uniquement, par secret partage compare en temps constant :
// - x-internal-secret = EMAIL_INTERNAL_SECRET (tache planifiee pg_cron, plus tard) ;
// - x-relance-secret = RELANCE_SECRET (workflows GitHub, comme relance-emails.yml).
// Aucun secret configure cote serveur = "not_configured" (refus 503).
export function authorize(req: Request, env: GetEnv): "ok" | "not_configured" | "unauthorized" {
  const internal = envValue(env, "EMAIL_INTERNAL_SECRET");
  const relance = envValue(env, "RELANCE_SECRET");
  const relanceOk = !!relance && relance.length >= MIN_CALLER_SECRET_LENGTH;
  if (!internal && !relanceOk) return "not_configured";
  if (internal && safeEqual(req.headers.get("x-internal-secret") || "", internal)) return "ok";
  if (relanceOk && safeEqual(req.headers.get("x-relance-secret") || "", relance as string)) return "ok";
  return "unauthorized";
}

// Region d'execution (SB_REGION, fournie par Supabase). Inconnue = pas de refus.
export function regionStatus(env: GetEnv): { region: string | null; ok: boolean } {
  const region = envValue(env, "SB_REGION");
  return { region, ok: !region || region === BREVO_REGION };
}

// Envoi reel aux clients : seulement si LIFECYCLE_SENDING_ENABLED vaut "true"
// (secret Supabase, pose a la mise en route, apres l'accord de Clement).
export function realSendingEnabled(env: GetEnv): boolean {
  return envValue(env, "LIFECYCLE_SENDING_ENABLED") === "true";
}

export type BrevoMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: string[];
};
export type BrevoResult = { ok: true; messageId: string } | { ok: false; status: number; error: string };

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

// POST https://api.brevo.com/v3/smtp/email (reponse 201 { messageId }).
// Jamais d'exception : erreur HTTP ou reseau = { ok: false } (adresse jamais
// recopiee dans l'erreur).
export async function sendBrevo(fetchFn: typeof fetch, cfg: BrevoConfig, mail: BrevoMail): Promise<BrevoResult> {
  if (!cfg.apiKey) return { ok: false, status: 0, error: "brevo_not_configured" };
  try {
    const res = await fetchFn(BREVO_API_URL, {
      method: "POST",
      headers: { "api-key": cfg.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: cfg.senderName, email: cfg.senderEmail },
        to: [{ email: mail.to }],
        replyTo: { email: cfg.replyTo },
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        headers: mail.headers || {},
        tags: mail.tags || [],
      }),
      signal: timeoutSignal(10000),
    });
    const body = await res.json().catch(() => ({})) as { messageId?: unknown; code?: unknown };
    if (!res.ok) return { ok: false, status: res.status, error: "brevo_http_" + res.status + (typeof body.code === "string" ? "_" + body.code.slice(0, 40) : "") };
    return { ok: true, messageId: typeof body.messageId === "string" ? body.messageId : "" };
  } catch (_err) {
    return { ok: false, status: 0, error: "brevo_network_error" };
  }
}
