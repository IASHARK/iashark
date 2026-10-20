// Fonction Edge relance-emails : relance par e-mail des inscrits (mardi 20/10/2026, decision de Clement).
// Un e-mail par type de personne (accord, Pro, ancien abonne, sans accord) et par langue (fr/en/es),
// textes et gabarits dans paquet.ts (fabrique par emails/relance-2026-10-20/fabriquer.py).
//
// APPEL SERVEUR UNIQUEMENT : en-tete x-relance-secret = RELANCE_SECRET (workflow relance-emails.yml).
//
// Corps JSON :
//   { mode: "etat" }   -> qui recevrait quoi (comptes par type et langue), fournisseur configure. N'envoie RIEN.
//   { mode: "test" }   -> les 12 e-mails aux seuls comptes administrateurs (users.role = 'admin').
//   { mode: "envoi", confirmation: "ENVOYER LA RELANCE" } -> l'envoi reel, une fois par personne.
//
// Envoi par Brevo (BREVO_API_KEY ; le domaine iashark.com y est authentifie). Desinscription en
// 1 clic : meme jeton signe que email-unsubscribe (EMAIL_UNSUBSCRIBE_SECRET) + en-tetes
// List-Unsubscribe. Une seule fois par personne : email_reserve_send (campagne « relance »).
// Aucune adresse entiere dans les journaux ni dans la reponse.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PAQUET } from "./paquet.ts";

const CAMPAGNE = "relance";
const CLE = "2026-10-20";
const CONFIRMATION = "ENVOYER LA RELANCE";
const MAX_DESTINATAIRES = 120;
const SITE = "https://iashark.com";
const LANGUES = ["fr", "en", "es"];
const TAG = "[relance-emails]";

const env = (n: string) => { const v = Deno.env.get(n); return v && v.trim() ? v.trim() : null; };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function roleDuJeton(req: Request): string | null {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const p = t.split(".")[1];
  if (!p) return null;
  try { return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4))).role ?? null; } catch { return null; }
}

function timingSafe(a: string, b: string) {
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function b64url(bytes: Uint8Array) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Meme jeton que lib/lifecycle-email.js#createUnsubscribeToken (v1.<charge>.<HMAC-SHA256>), 400 jours.
async function jeton(userId: string, dir: string, secret: string) {
  const charge = JSON.stringify({ u: userId.toLowerCase(), d: dir, e: Math.floor(Date.now() / 1000) + 400 * 86400 });
  const corps = "v1." + b64url(new TextEncoder().encode(charge));
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(corps)));
  return corps + "." + b64url(sig);
}

const masque = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");
const adresseValide = (e: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,10}$/i.test(e) && !/\.(comm|con|cmo)$/i.test(e);

function langue(meta: Record<string, unknown>, pref: Record<string, unknown> | null): string {
  const brut = String(pref?.locale || meta?.iashark_locale || meta?.iashark_market || "fr").toLowerCase().slice(0, 2);
  if (LANGUES.includes(brut)) return brut;
  if (brut === "mx") return "es";
  if (["gb", "za", "de", "it", "pt", "us"].includes(brut)) return "en";
  return "fr";
}

type Personne = { id: string; email: string; segment: string; langue: string };

async function classer(sb: ReturnType<typeof createClient>): Promise<{ liste: Personne[]; ecartes: Record<string, number> }> {
  const users: Array<Record<string, any>> = [];
  for (let page = 1; page < 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("listUsers: " + error.message);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const { data: prefs, error: e1 } = await sb.from("email_preferences").select("user_id,marketing_opt_in,unsubscribed_at,unsubscribe_source,locale");
  if (e1) throw new Error("email_preferences: " + e1.message);
  const { data: abos, error: e2 } = await sb.from("subscriptions").select("user_id,status,updated_at");
  if (e2) throw new Error("subscriptions: " + e2.message);
  const prefDe = new Map((prefs ?? []).map((p: any) => [p.user_id, p]));
  const aboDe = new Map<string, any>();
  for (const a of (abos ?? []) as any[]) {
    const deja = aboDe.get(a.user_id);
    if (!deja || String(a.updated_at) > String(deja.updated_at)) aboDe.set(a.user_id, a);
  }
  const ecartes: Record<string, number> = { desinscrit: 0, adresse_invalide: 0 };
  const liste: Personne[] = [];
  for (const u of users) {
    const email = String(u.email || "").trim();
    if (!adresseValide(email)) { ecartes.adresse_invalide++; continue; }
    const pref: any = prefDe.get(u.id) ?? null;
    if (pref?.unsubscribed_at || pref?.unsubscribe_source) { ecartes.desinscrit++; continue; }
    const abo = aboDe.get(u.id);
    const segment = abo && ["active", "trialing"].includes(abo.status) ? "pro"
      : abo ? "ancien"
      : pref?.marketing_opt_in ? "accord" : "sans_accord";
    liste.push({ id: u.id, email, segment, langue: langue(u.user_metadata || {}, pref) });
  }
  return { liste, ecartes };
}

function compter(liste: Personne[]) {
  const c: Record<string, number> = {};
  for (const p of liste) c[`${p.segment}-${p.langue}`] = (c[`${p.segment}-${p.langue}`] || 0) + 1;
  return c;
}

async function envoyer(p: Personne, variante: string, cfg: { brevo: string; secret: string; base: string; nom: string; de: string; repondre: string }, prefixe = "") {
  const v = (PAQUET as Record<string, { sujet: string; html: string; texte: string }>)[variante];
  if (!v) throw new Error("variante absente : " + variante);
  const t = encodeURIComponent(await jeton(p.id, p.langue, cfg.secret));
  const page = `${SITE}/${p.langue}/desinscription-email.html#t=${t}`;
  const unClic = `${cfg.base.replace(/\/$/, "")}/functions/v1/email-unsubscribe?t=${t}`;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cfg.brevo, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: cfg.nom, email: cfg.de },
      to: [{ email: p.email }],
      replyTo: { email: cfg.repondre },
      subject: prefixe + v.sujet,
      htmlContent: v.html.replaceAll("%%DESINSCRIPTION%%", page),
      textContent: v.texte.replaceAll("%%DESINSCRIPTION%%", page),
      headers: { "List-Unsubscribe": `<${unClic}>, <${page}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      tags: [CAMPAGNE + "-" + CLE, variante],
    }),
  });
  const corps = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status} ${JSON.stringify(corps).slice(0, 200)}`);
  return String((corps as any).messageId || "");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { ok: false });
  // Secret partage avec le workflow relance-emails.yml (GitHub RELANCE_SECRET, pose dans les secrets
  // des fonctions par ce meme workflow). Repli : jeton JWT de role service.
  const attendu = env("RELANCE_SECRET");
  const recu = req.headers.get("x-relance-secret") || "";
  const okSecret = !!attendu && attendu.length >= 32 && recu.length === attendu.length && timingSafe(recu, attendu);
  if (!okSecret && roleDuJeton(req) !== "service_role") return json(403, { ok: false, raison: "acces refuse" });
  const base = env("SUPABASE_URL"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !service) return json(503, { ok: false, raison: "base non configuree" });
  const sb = createClient(base, service, { auth: { persistSession: false, autoRefreshToken: false } });
  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch { /* corps vide */ }
  const mode = String(corps.mode || "etat");

  const brevo = env("BREVO_API_KEY"), secret = env("EMAIL_UNSUBSCRIBE_SECRET");
  const cfg = {
    brevo: brevo || "", secret: secret || "", base,
    nom: env("EMAIL_FROM_NAME") || "Clément, IASHARK",
    de: env("EMAIL_FROM_ADDRESS") || "news@iashark.com",
    repondre: env("EMAIL_REPLY_TO") || "contact@iashark.com",
  };
  const pret = { brevo: !!brevo, desinscription: !!secret && secret.length >= 32, resend_present: !!env("RESEND_API_KEY") };

  const tout = await classer(sb);
  // Personnes a ne pas relancer (choix de Clement), par identifiant de compte.
  const exclure = new Set((Array.isArray(corps.exclure) ? corps.exclure : String(corps.exclure || "").split(","))
    .map((x: unknown) => String(x).trim().toLowerCase()).filter(Boolean));
  const liste = tout.liste.filter((p) => !exclure.has(p.id.toLowerCase()));
  const ecartes = { ...tout.ecartes, exclus: tout.liste.length - liste.length };
  if (mode === "etat") return json(200, { ok: true, mode, pret, destinataires: liste.length, par_type_et_langue: compter(liste), ecartes });
  if (!pret.brevo || !pret.desinscription) return json(503, { ok: false, mode, pret, raison: "BREVO_API_KEY ou EMAIL_UNSUBSCRIBE_SECRET manquant : rien n'est parti" });

  if (mode === "test") {
    const { data: admins, error } = await sb.from("users").select("id").eq("role", "admin");
    if (error) return json(500, { ok: false, raison: error.message });
    const ids = new Set((admins ?? []).map((a: any) => a.id));
    const cibles = liste.filter((p) => ids.has(p.id));
    const faits: string[] = [];
    for (const c of cibles) {
      for (const variante of Object.keys(PAQUET)) {
        const l = variante.split("-").pop() as string;
        await envoyer({ ...c, langue: l }, variante, cfg, "[TEST] ");
        faits.push(`${masque(c.email)} ${variante}`);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    return json(200, { ok: true, mode, envoyes: faits.length, a: [...new Set(cibles.map((c) => masque(c.email)))] });
  }

  if (mode === "envoi") {
    if (corps.confirmation !== CONFIRMATION) return json(400, { ok: false, raison: `phrase de confirmation : ${CONFIRMATION}` });
    if (liste.length > MAX_DESTINATAIRES) return json(400, { ok: false, raison: `plus de ${MAX_DESTINATAIRES} destinataires` });
    const bilan: Record<string, number> = { envoye: 0, deja: 0, echec: 0 };
    const erreurs: string[] = [];
    for (const p of liste) {
      const variante = `${p.segment}-${p.langue}`;
      const { data: id, error } = await sb.rpc("email_reserve_send", { p_user_id: p.id, p_campaign: CAMPAGNE, p_campaign_key: CLE, p_market: p.langue });
      if (error) { bilan.echec++; erreurs.push(`${masque(p.email)} reserve: ${error.message}`); continue; }
      if (id == null) { bilan.deja++; continue; }
      try {
        const msg = await envoyer(p, variante, cfg);
        await sb.rpc("email_complete_send", { p_id: id, p_status: "sent", p_message_id: msg, p_error: null });
        bilan.envoye++;
      } catch (e) {
        const m = (e as Error).message.slice(0, 300);
        await sb.rpc("email_complete_send", { p_id: id, p_status: "failed", p_message_id: null, p_error: m });
        bilan.echec++; erreurs.push(`${masque(p.email)} ${variante}: ${m}`);
        console.error(`${TAG} ${masque(p.email)} ${m}`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return json(200, { ok: bilan.echec === 0, mode, bilan, par_type_et_langue: compter(liste), erreurs: erreurs.slice(0, 20) });
  }
  return json(400, { ok: false, raison: "mode inconnu (etat, test, envoi)" });
});
