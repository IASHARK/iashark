// Fonction Edge relance-emails : relance par e-mail des inscrits (decision de Clement).
// 20/10/2026 : premiere relance. 28/10/2026 : relance envoyee automatiquement a 11 h (Paris) par le
// workflow relance-emails.yml (declencheur schedule), cle de campagne 2026-10-28.
// Un e-mail par type de personne (partenaire, accord, sans accord, ancien abonne) et par langue (fr/en/es),
// textes et gabarits dans paquet.ts (fabrique par emails/relance-2026-10-28/fabriquer.py).
//
// Qui recoit quoi (regles appliquees ici, rien en dur : le depot est public) :
//   - partenaire : a clique « Deposer ma candidature » (funnel_events, label account_partner_apply)
//     dans les 7 derniers jours et n'a pas de ligne dans affiliates ; recoit l'e-mail meme s'il est abonne ;
//   - abonnes en cours (active, trialing, past_due) et comptes a plan « famille » ou « pro » pose a la
//     main : rien ;
//   - ancien : a deja eu un abonnement (pas d'essai : trial.ts) ;
//   - accord / sans_accord : comptes gratuits jamais abonnes, selon la case e-mails de l'inscription.
// Jamais : desinscrits, adresses en rebond ou plainte, comptes administrateurs (ils recoivent le mode
// test), et personne ayant recu un e-mail marketing il y a moins de 3 jours (promesse de la case
// d'inscription « au plus un email tous les 3 jours » ; l'e-mail d'accueil ne compte pas, meme regle
// que lifecycle_email_candidates).
//
// APPEL SERVEUR UNIQUEMENT : en-tete x-relance-secret = RELANCE_SECRET (workflow relance-emails.yml).
//
// Corps JSON :
//   { mode: "etat" }   -> qui recevrait quoi (comptes par type et langue), fournisseur configure. N'envoie RIEN.
//   { mode: "test" }   -> tous les e-mails aux seuls comptes administrateurs (users.role = 'admin'), objet [TEST].
//   { mode: "envoi", confirmation: "ENVOYER LA RELANCE" } -> l'envoi reel, une fois par personne.
//   planifie: true (envoi automatique) -> refuse si la date UTC n'est pas celle de la campagne.
//
// Envoi par Brevo (BREVO_API_KEY ; le domaine iashark.com y est authentifie). Desinscription en
// 1 clic : meme jeton signe que email-unsubscribe (EMAIL_UNSUBSCRIBE_SECRET) + en-tetes
// List-Unsubscribe. Une seule fois par personne : email_reserve_send (campagne « relance »).
// Aucune adresse entiere dans les journaux ni dans la reponse.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PAQUET } from "./paquet.ts";

const CAMPAGNE = "relance";
const CLE = "2026-10-28";
const CONFIRMATION = "ENVOYER LA RELANCE";
const MAX_DESTINATAIRES = 120;
const SITE = "https://iashark.com";
const LANGUES = ["fr", "en", "es"];
// Dossier du site -> langue de l'e-mail (gb et za : anglais avec les prix du pays ; mx : espagnol).
const DOSSIERS: Record<string, string> = { fr: "fr", en: "en", es: "es", gb: "en", za: "en", mx: "es" };
const ABONNE_EN_COURS = ["active", "trialing", "past_due"];
const PLANS_MANUELS = ["famille", "pro"];
const FREQUENCE_JOURS = 3;
const PARTENAIRE_JOURS = 7;
// Banniere : sur le site ; si la mise en ligne Netlify n'a pas eu lieu, copie du depot public.
const BANNIERE_SITE = `${SITE}/assets/emails/${CLE}/`;
const BANNIERE_SECOURS = `https://raw.githubusercontent.com/IASHARK/iashark/main/assets/emails/${CLE}/`;
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

type Personne = { id: string; email: string; segment: string; langue: string; dossier: string };

// Dossier du site de la personne : le premier candidat dont la langue est celle de l'e-mail, sinon la langue.
function dossier(lg: string, ...candidats: unknown[]): string {
  for (const c of candidats) {
    const d = String(c ?? "").trim().toLowerCase();
    if (DOSSIERS[d] === lg) return d;
  }
  return lg;
}

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
  const depuisPart = new Date(maintenant.getTime() - PARTENAIRE_JOURS * 86400e3).toISOString();
  const clics = await lire("funnel_events", sb.from("funnel_events").select("user_id,locale,created_at").eq("event_type", "click")
    .eq("metadata->>label", "account_partner_apply").gte("created_at", depuisPart).not("user_id", "is", null)
    .order("created_at", { ascending: false }).limit(1000));
  const affilies = await lire("affiliates", sb.from("affiliates").select("user_id"));

  const prefDe = new Map(prefs.map((p) => [p.user_id, p]));
  const compteDe = new Map(comptes.map((c) => [c.id, c]));
  const aEuAbo = new Set(abos.map((a) => a.user_id));
  const enCours = new Set(abos.filter((a) => ABONNE_EN_COURS.includes(String(a.status))).map((a) => a.user_id));
  const recent = new Set(recents.map((r) => r.user_id));
  const rebond = new Set(rebonds.map((r) => r.user_id));
  const affilie = new Set(affilies.map((a) => a.user_id));
  const clicDe = new Map<string, any>();
  for (const c of clics) if (!clicDe.has(c.user_id)) clicDe.set(c.user_id, c); // le plus recent

  const ecartes: Record<string, number> = { adresse_invalide: 0, desinscrit: 0, rebond_ou_plainte: 0, admin: 0, abonne_en_cours: 0, plan_manuel: 0, email_moins_de_3_jours: 0 };
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
    const meta = u.user_metadata || {};
    const lg = langue(meta, pref);
    const compte: any = compteDe.get(u.id) ?? null;
    if (compte?.role === "admin") { admins.push({ id: u.id, email, segment: "admin", langue: lg, dossier: lg }); ecartes.admin++; continue; }
    const clic = clicDe.get(u.id);
    const partenaire = !!clic && !affilie.has(u.id);
    if (!partenaire && enCours.has(u.id)) { ecartes.abonne_en_cours++; continue; }
    if (!partenaire && PLANS_MANUELS.includes(String(compte?.plan || "").toLowerCase())) { ecartes.plan_manuel++; continue; }
    if (recent.has(u.id)) { ecartes.email_moins_de_3_jours++; continue; }
    const segment = partenaire ? "partenaire" : aEuAbo.has(u.id) ? "ancien" : pref?.marketing_opt_in ? "accord" : "sans_accord";
    liste.push({ id: u.id, email, segment, langue: lg, dossier: dossier(lg, partenaire ? clic.locale : null, pref?.market, meta.iashark_market) });
  }
  return { liste, admins, tous, ecartes };
}

function compter(liste: Personne[], cle: (p: Personne) => string = (p) => `${p.segment}-${p.langue}`) {
  const c: Record<string, number> = {};
  for (const p of liste) c[cle(p)] = (c[cle(p)] || 0) + 1;
  return c;
}

// La banniere est-elle en ligne sur le site (mise en ligne Netlify faite) ? Sinon : copie du depot public.
async function baseBanniere(): Promise<{ base: string; site: boolean }> {
  for (const l of LANGUES) {
    try {
      const r = await fetch(`${BANNIERE_SITE}banniere-${l}.jpg`, { method: "HEAD" });
      if (!r.ok || !String(r.headers.get("content-type") || "").startsWith("image/")) return { base: BANNIERE_SECOURS, site: false };
    } catch { return { base: BANNIERE_SECOURS, site: false }; }
  }
  return { base: BANNIERE_SITE, site: true };
}

async function envoyer(p: Personne, variante: string, cfg: { brevo: string; secret: string; base: string; nom: string; de: string; repondre: string; banniere: string }, prefixe = "") {
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
      htmlContent: v.html.replaceAll("%%DESINSCRIPTION%%", page).replaceAll("%%DIR%%", p.dossier).replaceAll(BANNIERE_SITE, cfg.banniere),
      textContent: v.texte.replaceAll("%%DESINSCRIPTION%%", page).replaceAll("%%DIR%%", p.dossier),
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
    banniere: BANNIERE_SITE,
  };
  const pret = { brevo: !!brevo, desinscription: !!secret && secret.length >= 32, resend_present: !!env("RESEND_API_KEY") };

  // Suivi : ce que Brevo a fait des e-mails de la campagne (remis, en attente, bloques...), sans adresse entiere.
  if (mode === "suivi") {
    if (!brevo) return json(503, { ok: false, raison: "BREVO_API_KEY manquant" });
    const r = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?limit=500&days=1&tags=${encodeURIComponent(CAMPAGNE + "-" + CLE)}`,
      { headers: { "api-key": brevo, accept: "application/json" } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json(200, { ok: false, mode, brevo_http: r.status, brevo: JSON.stringify(d).slice(0, 300) });
    const evts = ((d as any).events ?? []) as Array<Record<string, string>>;
    const parType: Record<string, number> = {};
    for (const e of evts) parType[e.event] = (parType[e.event] || 0) + 1;
    // Le journal du workflow est PUBLIC (depot public) : aucune adresse, aucun identifiant dans la reponse.
    // Les ouvertures et clics vont dans la base privee (email_sends.opened_at / clicked_at).
    // Tous les comptes (une personne relancee est ensuite ecartee pendant 3 jours : on la retrouve quand meme).
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
  // Envoi automatique : seulement le jour de la campagne (le declencheur planifie se repete chaque annee).
  if (corps.planifie === true && new Date().toISOString().slice(0, 10) !== CLE) {
    return json(400, { ok: false, mode, raison: `envoi planifie prevu le ${CLE} seulement : rien n'est parti` });
  }
  const tout = await classer(sb);
  // Personnes a ne pas relancer (choix de Clement), par identifiant de compte.
  const exclure = new Set((Array.isArray(corps.exclure) ? corps.exclure : String(corps.exclure || "").split(","))
    .map((x: unknown) => String(x).trim().toLowerCase()).filter(Boolean));
  const liste = tout.liste.filter((p) => !exclure.has(p.id.toLowerCase()));
  const ecartes = { ...tout.ecartes, exclus: tout.liste.length - liste.length };
  const banniere = await baseBanniere();
  cfg.banniere = banniere.base;
  if (mode === "etat") {
    return json(200, { ok: true, mode, cle: CLE, pret, banniere_sur_le_site: banniere.site, destinataires: liste.length,
      par_type_et_langue: compter(liste), par_dossier: compter(liste, (p) => p.dossier), ecartes, comptes_admin: tout.admins.length });
  }
  if (!pret.brevo || !pret.desinscription) return json(503, { ok: false, mode, pret, raison: "BREVO_API_KEY ou EMAIL_UNSUBSCRIBE_SECRET manquant : rien n'est parti" });

  if (mode === "test") {
    const cibles = tout.admins;
    const faits: string[] = [];
    for (const c of cibles) {
      for (const variante of Object.keys(PAQUET)) {
        const l = variante.split("-").pop() as string;
        // Partenaire anglais : page du Royaume-Uni (dossier gb), comme pour la personne concernee aujourd'hui.
        const d = variante === "partenaire-en" ? "gb" : l;
        await envoyer({ ...c, langue: l, dossier: d }, variante, cfg, "[TEST] ");
        faits.push(variante);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    return json(200, { ok: true, mode, envoyes: faits.length, comptes: cibles.length, banniere_sur_le_site: banniere.site });
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
    return json(200, { ok: bilan.echec === 0, mode, cle: CLE, bilan, par_type_et_langue: compter(liste), banniere_sur_le_site: banniere.site, erreurs: erreurs.slice(0, 20) });
  }
  return json(400, { ok: false, raison: "mode inconnu (etat, test, envoi)" });
});
