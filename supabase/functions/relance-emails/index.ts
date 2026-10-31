// Fonction Edge relance-emails : relance par e-mail des inscrits (decision de Clement).
// 20/10/2026 : premiere relance. 28/10/2026 : relance de 11 h (cle 2026-10-28).
// 31/10/2026 : e-mail « semaine Pro offerte », samedi 9 h (Paris) = 08:00 UTC, cle de campagne
// « semaine-offerte-31-10 ». Textes et gabarits dans paquet.ts (fabrique par
// emails/semaine-offerte-2026-10-31/fabriquer.py), un message par langue (fr/en/es) et deux pieds de
// page (accord / sans_accord : la raison de l'envoi).
//
// Qui recoit (regles appliquees ici, rien en dur : le depot est public) :
//   - comptes gratuits jamais abonnes : accord / sans_accord selon la case e-mails de l'inscription.
// Jamais :
//   - abonnes en cours (active, trialing, past_due) et comptes a plan « famille » ou « pro » pose a la
//     main (dont les comptes famille offerts par Clement) ;
//   - anciens abonnes : l'essai de 7 jours ne leur est pas ouvert (trial.ts), l'e-mail leur promettrait
//     une semaine qu'ils n'auraient pas ;
//   - desinscrits, adresses en rebond ou plainte, comptes administrateurs (ils recoivent le mode test) ;
//   - personne ayant recu un e-mail marketing il y a moins de 3 jours (promesse de la case d'inscription
//     « au plus un email tous les 3 jours » ; l'e-mail d'accueil ne compte pas, meme regle que
//     lifecycle_email_candidates).
//
// APPEL SERVEUR UNIQUEMENT : en-tete x-relance-secret = RELANCE_SECRET (workflow relance-emails.yml),
// ou, pour l'envoi automatique seulement, en-tete x-relance-jeton = jeton tire au hasard dans la base
// (table relance_planifiee, ligne JOUR, migration 0061, lue ici avec la cle service ; tache pg_cron).
//
// Corps JSON :
//   { mode: "etat" }   -> qui recevrait quoi (comptes par type et langue), fournisseur configure. N'envoie RIEN.
//   { mode: "test" }   -> tous les e-mails aux seuls comptes administrateurs (users.role = 'admin'), objet [TEST].
//   { mode: "envoi", confirmation: "ENVOYER LA RELANCE" } -> l'envoi reel, une fois par personne.
//   { mode: "suivi" }  -> ce que Brevo a fait des e-mails de la campagne (sans adresse).
//   planifie: true (envoi automatique) -> refuse si la date UTC n'est pas JOUR, apres 15:00 UTC, ou si
//   la PR n'est pas fusionnee (la fonction de la branche main n'est pas celle de cette campagne) : la
//   fusion reste le feu vert.
//
// Envoi par Brevo (BREVO_API_KEY ; le domaine iashark.com y est authentifie). Desinscription en
// 1 clic : meme jeton signe que email-unsubscribe (EMAIL_UNSUBSCRIBE_SECRET) + en-tetes
// List-Unsubscribe. Une seule fois par personne : email_reserve_send (campagne « relance », cle CLE).
// Aucune adresse entiere dans les journaux ni dans la reponse.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PAQUET } from "./paquet.ts";

const CAMPAGNE = "relance";
const CLE = "semaine-offerte-31-10";
const JOUR = "2026-10-31";
const CONFIRMATION = "ENVOYER LA RELANCE";
const MAX_DESTINATAIRES = 120;
const LANGUES = ["fr", "en", "es"];
const ABONNE_EN_COURS = ["active", "trialing", "past_due"];
const PLANS_MANUELS = ["famille", "pro"];
const FREQUENCE_JOURS = 3;
const HEURE_LIMITE_UTC = 15;
// Feu vert de l'envoi automatique : la fonction de la branche main est celle de cette campagne.
const FONCTION_MAIN = "https://raw.githubusercontent.com/IASHARK/iashark/main/supabase/functions/relance-emails/index.ts";
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

// Langue de chacun : meme regle que le 20/10 (preference e-mail, sinon langue ou pays de l'inscription).
function langue(meta: Record<string, unknown>, pref: Record<string, unknown> | null): string {
  const brut = String(pref?.locale || meta?.iashark_locale || meta?.iashark_market || "fr").toLowerCase().slice(0, 2);
  if (LANGUES.includes(brut)) return brut;
  if (brut === "mx") return "es";
  if (["gb", "za", "de", "it", "pt", "us"].includes(brut)) return "en";
  return "fr";
}

type Personne = { id: string; email: string; segment: string; langue: string };

async function classer(sb: ReturnType<typeof createClient>, maintenant = new Date()): Promise<{ liste: Personne[]; admins: Personne[]; tous: Array<{ id: string; email: string }>; ecartes: Record<string, number> }> {
  const users: Array<Record<string, any>> = [];
  for (let page = 1; page < 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("listUsers: " + error.message);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const lire = async (nom: string, q: PromiseLike<{ data: any; error: any }>) => {
    const { data, error } = await q;
    if (error) throw new Error(nom + ": " + error.message);
    return (data ?? []) as any[];
  };
  const prefs = await lire("email_preferences", sb.from("email_preferences").select("user_id,marketing_opt_in,unsubscribed_at,unsubscribe_source,locale,market"));
  const abos = await lire("subscriptions", sb.from("subscriptions").select("user_id,status"));
  const comptes = await lire("users", sb.from("users").select("id,plan,role"));
  const depuisFreq = new Date(maintenant.getTime() - FREQUENCE_JOURS * 86400e3).toISOString();
  const recents = await lire("email_sends recents", sb.from("email_sends").select("user_id").neq("campaign", "welcome")
    .in("status", ["pending", "sent"]).gte("sent_at", depuisFreq));
  const rebonds = await lire("email_sends rebonds", sb.from("email_sends").select("user_id").in("status", ["bounced", "complained"]));

  const prefDe = new Map(prefs.map((p) => [p.user_id, p]));
  const compteDe = new Map(comptes.map((c) => [c.id, c]));
  const aEuAbo = new Set(abos.map((a) => a.user_id));
  const enCours = new Set(abos.filter((a) => ABONNE_EN_COURS.includes(String(a.status))).map((a) => a.user_id));
  const recent = new Set(recents.map((r) => r.user_id));
  const rebond = new Set(rebonds.map((r) => r.user_id));

  const ecartes: Record<string, number> = { adresse_invalide: 0, desinscrit: 0, rebond_ou_plainte: 0, admin: 0, abonne_en_cours: 0, plan_manuel: 0, ancien_abonne: 0, email_moins_de_3_jours: 0 };
  const liste: Personne[] = [];
  const admins: Personne[] = [];
  const tous: Array<{ id: string; email: string }> = [];
  for (const u of users) {
    const email = String(u.email || "").trim();
    if (!adresseValide(email)) { ecartes.adresse_invalide++; continue; }
    tous.push({ id: u.id, email });
    const pref: any = prefDe.get(u.id) ?? null;
    if (pref?.unsubscribed_at || pref?.unsubscribe_source) { ecartes.desinscrit++; continue; }
    if (rebond.has(u.id)) { ecartes.rebond_ou_plainte++; continue; }
    const lg = langue(u.user_metadata || {}, pref);
    const compte: any = compteDe.get(u.id) ?? null;
    if (compte?.role === "admin") { admins.push({ id: u.id, email, segment: "admin", langue: lg }); ecartes.admin++; continue; }
    if (enCours.has(u.id)) { ecartes.abonne_en_cours++; continue; }
    if (PLANS_MANUELS.includes(String(compte?.plan || "").toLowerCase())) { ecartes.plan_manuel++; continue; }
    if (aEuAbo.has(u.id)) { ecartes.ancien_abonne++; continue; }
    // Regle des 3 jours levee pour cette campagne seulement : decision explicite de Clement (31/10).
    void recent;
    liste.push({ id: u.id, email, segment: pref?.marketing_opt_in ? "accord" : "sans_accord", langue: lg });
  }
  return { liste, admins, tous, ecartes };
}

function compter(liste: Personne[], cle: (p: Personne) => string = (p) => `${p.segment}-${p.langue}`) {
  const c: Record<string, number> = {};
  for (const p of liste) c[cle(p)] = (c[cle(p)] || 0) + 1;
  return c;
}

// La PR est-elle fusionnee ? (la fonction de la branche main porte la cle de cette campagne)
async function fusionnee(): Promise<boolean> {
  try {
    const r = await fetch(FONCTION_MAIN, { headers: { "Cache-Control": "no-cache" } });
    return r.ok && (await r.text()).includes(`const CLE = "${CLE}";`);
  } catch { return false; }
}

async function envoyer(p: Personne, variante: string, cfg: { brevo: string; secret: string; base: string; nom: string; de: string; repondre: string }, prefixe = "") {
  const v = (PAQUET as Record<string, { sujet: string; html: string; texte: string }>)[variante];
  if (!v) throw new Error("variante absente : " + variante);
  const t = encodeURIComponent(await jeton(p.id, p.langue, cfg.secret));
  const page = `https://iashark.com/${p.langue}/desinscription-email.html#t=${t}`;
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
  const jetonRecu = req.headers.get("x-relance-jeton") || "";
  if (!okSecret && roleDuJeton(req) !== "service_role" && !jetonRecu) return json(403, { ok: false, raison: "acces refuse" });
  const base = env("SUPABASE_URL"), service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !service) return json(503, { ok: false, raison: "base non configuree" });
  const sb = createClient(base, service, { auth: { persistSession: false, autoRefreshToken: false } });
  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch { /* corps vide */ }
  const mode = String(corps.mode || "etat");
  if (!okSecret && roleDuJeton(req) !== "service_role") {
    // Jeton de la tache pg_cron : seulement l'envoi automatique de cette campagne.
    const { data: ligne } = await sb.from("relance_planifiee").select("jeton").eq("cle", JOUR).maybeSingle();
    const vrai = String((ligne as any)?.jeton || "");
    const okJeton = vrai.length >= 32 && jetonRecu.length === vrai.length && timingSafe(jetonRecu, vrai);
    if (!okJeton || mode !== "envoi" || corps.planifie !== true) return json(403, { ok: false, raison: "acces refuse" });
  }

  const brevo = env("BREVO_API_KEY"), secret = env("EMAIL_UNSUBSCRIBE_SECRET");
  const cfg = {
    brevo: brevo || "", secret: secret || "", base,
    nom: env("EMAIL_FROM_NAME") || "Clément, IASHARK",
    de: env("EMAIL_FROM_ADDRESS") || "news@iashark.com",
    repondre: env("EMAIL_REPLY_TO") || "contact@iashark.com",
  };
  const pret = { brevo: !!brevo, desinscription: !!secret && secret.length >= 32, resend_present: !!env("RESEND_API_KEY") };

  // Suivi : ce que Brevo a fait des e-mails de la campagne (remis, en attente, bloques...), sans adresse entiere.
  if (mode === "suivi") {
    if (!brevo) return json(503, { ok: false, raison: "BREVO_API_KEY manquant" });
    const r = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?limit=500&days=2&tags=${encodeURIComponent(CAMPAGNE + "-" + CLE)}`,
      { headers: { "api-key": brevo, accept: "application/json" } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json(200, { ok: false, mode, brevo_http: r.status, brevo: JSON.stringify(d).slice(0, 300) });
    const evts = ((d as any).events ?? []) as Array<Record<string, string>>;
    const parType: Record<string, number> = {};
    for (const e of evts) parType[e.event] = (parType[e.event] || 0) + 1;
    // Le journal du workflow est PUBLIC (depot public) : aucune adresse, aucun identifiant dans la reponse.
    // Les ouvertures et clics vont dans la base privee (email_sends.opened_at / clicked_at).
    const { tous } = await classer(sb);
    const idDe = new Map(tous.map((p) => [p.email.toLowerCase(), p.id]));
    let ouverts = 0, cliques = 0;
    for (const e of evts) {
      const id = idDe.get(String(e.email || "").toLowerCase());
      if (!id) continue;
      const quand = e.date ? new Date(e.date).toISOString() : new Date().toISOString();
      if (e.event === "opened" || e.event === "uniqueOpened") {
        const { data } = await sb.from("email_sends").update({ opened_at: quand }).eq("user_id", id).eq("campaign", CAMPAGNE).eq("campaign_key", CLE).is("opened_at", null).select("id");
        ouverts += (data ?? []).length;
      } else if (e.event === "clicks") {
        const { data } = await sb.from("email_sends").update({ clicked_at: quand }).eq("user_id", id).eq("campaign", CAMPAGNE).eq("campaign_key", CLE).is("clicked_at", null).select("id");
        cliques += (data ?? []).length;
      }
    }
    return json(200, { ok: true, mode, evenements: evts.length, par_type: parType, nouvelles_ouvertures_notees: ouverts, nouveaux_clics_notes: cliques });
  }
  // Envoi automatique : seulement le jour de la campagne, avant 15:00 UTC, et seulement si la PR est fusionnee.
  if (corps.planifie === true) {
    const maintenant = new Date();
    if (maintenant.toISOString().slice(0, 10) !== JOUR) {
      return json(400, { ok: false, mode, raison: `envoi planifie prevu le ${JOUR} seulement : rien n'est parti` });
    }
    if (maintenant.getUTCHours() >= HEURE_LIMITE_UTC) {
      return json(400, { ok: false, mode, raison: `envoi planifie trop tard (apres ${HEURE_LIMITE_UTC}:00 UTC) : rien n'est parti` });
    }
    if (!(await fusionnee())) {
      return json(400, { ok: false, mode, raison: "PR non fusionnee (fonction de main d'une autre campagne) : rien n'est parti" });
    }
  }
  const tout = await classer(sb);
  // Personnes a ne pas relancer (choix de Clement), par identifiant de compte.
  const exclure = new Set((Array.isArray(corps.exclure) ? corps.exclure : String(corps.exclure || "").split(","))
    .map((x: unknown) => String(x).trim().toLowerCase()).filter(Boolean));
  const liste = tout.liste.filter((p) => !exclure.has(p.id.toLowerCase()));
  const ecartes = { ...tout.ecartes, exclus: tout.liste.length - liste.length };
  if (mode === "etat") {
    return json(200, { ok: true, mode, cle: CLE, jour: JOUR, pret, pr_fusionnee: await fusionnee(), destinataires: liste.length,
      par_type_et_langue: compter(liste), par_langue: compter(liste, (p) => p.langue), ecartes, comptes_admin: tout.admins.length });
  }
  if (!pret.brevo || !pret.desinscription) return json(503, { ok: false, mode, pret, raison: "BREVO_API_KEY ou EMAIL_UNSUBSCRIBE_SECRET manquant : rien n'est parti" });

  if (mode === "test") {
    const cibles = tout.admins;
    const faits: string[] = [];
    for (const c of cibles) {
      for (const variante of Object.keys(PAQUET)) {
        const l = variante.split("-").pop() as string;
        await envoyer({ ...c, langue: l }, variante, cfg, "[TEST] ");
        faits.push(variante);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    return json(200, { ok: true, mode, envoyes: faits.length, comptes: cibles.length });
  }

  if (mode === "envoi") {
    if (corps.confirmation !== CONFIRMATION) return json(400, { ok: false, raison: `phrase de confirmation : ${CONFIRMATION}` });
    if (liste.length > MAX_DESTINATAIRES) return json(400, { ok: false, raison: `plus de ${MAX_DESTINATAIRES} destinataires` });
    const bilan: Record<string, number> = { envoye: 0, deja: 0, echec: 0 };
    const erreurs: string[] = [];
    for (const p of liste) {
      const variante = `${p.segment}-${p.langue}`;
      const { data: id, error } = await sb.rpc("email_reserve_send", { p_user_id: p.id, p_campaign: CAMPAGNE, p_campaign_key: CLE, p_market: p.langue });
      if (error) { bilan.echec++; erreurs.push(`reserve: ${error.message}`); continue; }
      if (id == null) { bilan.deja++; continue; }
      try {
        const msg = await envoyer(p, variante, cfg);
        await sb.rpc("email_complete_send", { p_id: id, p_status: "sent", p_message_id: msg, p_error: null });
        bilan.envoye++;
      } catch (e) {
        const m = (e as Error).message.slice(0, 300);
        await sb.rpc("email_complete_send", { p_id: id, p_status: "failed", p_message_id: null, p_error: m });
        bilan.echec++; erreurs.push(`${variante}: ${m}`);
        console.error(`${TAG} ${masque(p.email)} ${m}`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return json(200, { ok: bilan.echec === 0, mode, cle: CLE, bilan, par_type_et_langue: compter(liste), erreurs: erreurs.slice(0, 20) });
  }
  return json(400, { ok: false, raison: "mode inconnu (etat, suivi, test, envoi)" });
});
