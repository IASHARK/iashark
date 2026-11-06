// IASHARK - Alertes sur le telephone de l'admin (07/11/2026, demande de Clement : « est-ce que je peux avoir des notif »).
// Trois appels possibles :
//   { id }            : envoie l'alerte numero id (creee par la base : admin_alerte_creer, declencheurs Stripe,
//                       inscriptions, Telegram). La fonction relit la ligne elle-meme : l'appelant ne choisit
//                       jamais le texte envoye. Une alerte deja envoyee ne repart pas.
//   { mode: "test" }  : notification d'essai, seulement pour un compte admin connecte (jeton verifie).
//   { mode: "veille"} : toutes les 10 minutes (pg_cron) : site en panne ou revenu, visiteurs inhabituels,
//                       releve du jour des abonnes Telegram et TikTok (pages publiques).
// Cles de notification (VAPID) : table admin_alertes_etat (RLS sans politique : lue seulement ici, en service).
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const db = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function etat(cle: string): Promise<Record<string, unknown>> {
  const { data } = await db.from("admin_alertes_etat").select("valeur").eq("cle", cle).maybeSingle();
  return (data?.valeur as Record<string, unknown>) || {};
}
async function ecrireEtat(cle: string, valeur: Record<string, unknown>) {
  await db.from("admin_alertes_etat").upsert({ cle, valeur, maj: new Date().toISOString() }, { onConflict: "cle" });
}

let vapidPret = false;
async function preparerVapid() {
  if (vapidPret) return;
  const v = await etat("vapid");
  if (!v.public || !v.private) throw new Error("cles de notification absentes");
  webpush.setVapidDetails(String(v.subject || "mailto:contact@iashark.com"), String(v.public), String(v.private));
  vapidPret = true;
}

// Envoie une alerte a chaque telephone qui l'a demandee. Telephone disparu (404/410) : retire.
async function envoyer(alerte: { id?: number; type: string; titre: string; texte: string; url?: string | null }) {
  await preparerVapid();
  const { data: tels } = await db.from("admin_push").select("endpoint, p256dh, auth, types");
  let ok = 0;
  const erreurs: string[] = [];
  for (const t of tels || []) {
    const types: string[] = Array.isArray(t.types) ? t.types : [];
    if (alerte.type !== "test" && !types.includes(alerte.type)) continue;
    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        JSON.stringify({ titre: alerte.titre, texte: alerte.texte, url: alerte.url || "/admin.html", tag: alerte.type + "-" + (alerte.id || Date.now()) }),
        { TTL: 6 * 3600, urgency: "high" },
      );
      ok++;
      await db.from("admin_push").update({ dernier_envoi_at: new Date().toISOString(), derniere_erreur: null }).eq("endpoint", t.endpoint);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("admin_push").delete().eq("endpoint", t.endpoint);
      else {
        const msg = String((e as Error).message || e).slice(0, 200);
        erreurs.push(msg);
        await db.from("admin_push").update({ derniere_erreur: msg }).eq("endpoint", t.endpoint);
      }
    }
  }
  return { ok, erreurs };
}

async function envoyerAlerte(id: number) {
  const { data: a } = await db.from("admin_alertes").select("*").eq("id", id).maybeSingle();
  if (!a || a.envoye_at) return { deja: true };
  // Demande d'arret : Stripe envoie la raison dans un second evenement, quelques instants plus tard.
  if (a.type === "arret" && a.meta?.sub && a.titre === "Désabonnement demandé") {
    await sleep(4000);
    const { data: raison } = await db.rpc("admin_alerte_raison", { p_sub: a.meta.sub });
    if (raison) a.texte = String(a.texte).replace(/\.$/, "") + ". Raison : " + raison + ".";
  }
  const r = await envoyer(a);
  await db.from("admin_alertes").update({ envoye_at: new Date().toISOString(), envois: r.ok, erreur: r.erreurs[0] || null, texte: a.texte }).eq("id", id);
  return r;
}

async function creer(type: string, titre: string, texte: string, url = "/admin.html") {
  const { data } = await db.from("admin_alertes").insert({ type, titre, texte, url }).select("id").single();
  if (data?.id) await envoyerAlerte(data.id);
}

function nombre(s: string): number | null {
  const t = s.replace(/[\s ,.]/g, "");
  const m = t.match(/^(\d+)(K|M)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] ? null : n;
}

async function releverAbonnes() {
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date()); // jour de Paris (AAAA-MM-JJ)
  const { data: deja } = await db.from("reseaux_abonnes").select("reseau").eq("jour", jour);
  const faits = new Set((deja || []).map((x) => x.reseau));
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
  if (!faits.has("telegram")) {
    try {
      const html = await (await fetch("https://t.me/+qCEr2JFPDDBlZTFk", { headers: { "User-Agent": ua }, signal: AbortSignal.timeout(8000) })).text();
      const m = html.match(/tgme_page_extra">([\d\s ,.]+)\s*(subscribers|members|abonn)/i);
      const n = m ? nombre(m[1]) : null;
      if (n !== null) await db.from("reseaux_abonnes").upsert({ jour, reseau: "telegram", abonnes: n, source: "t.me" }, { onConflict: "jour,reseau" });
    } catch (_) { /* rien : nouvel essai a la prochaine veille */ }
  }
  if (!faits.has("tiktok")) {
    try {
      const html = await (await fetch("https://www.tiktok.com/@iashark_data", { headers: { "User-Agent": ua, "Accept-Language": "fr-FR,fr;q=0.9" }, signal: AbortSignal.timeout(8000) })).text();
      const m = html.match(/"followerCount":(\d+)/);
      if (m) await db.from("reseaux_abonnes").upsert({ jour, reseau: "tiktok", abonnes: Number(m[1]), source: "tiktok.com" }, { onConflict: "jour,reseau" });
    } catch (_) { /* idem */ }
  }
}

async function veille() {
  // 1. Le site repond-il ? Deux echecs de suite avant d'alerter ; une alerte quand il revient.
  const site = await etat("site");
  let marche = false;
  try {
    const r = await fetch("https://iashark.com/", { method: "GET", redirect: "follow", signal: AbortSignal.timeout(12000) });
    marche = r.status < 500;
  } catch (_) { marche = false; }
  const echecs = marche ? 0 : Number(site.echecs || 0) + 1;
  if (!marche && echecs === 2 && !site.en_panne) {
    await creer("panne", "Site en panne", "iashark.com ne répond plus depuis 10 minutes.", "/admin.html#ecran-site");
    await ecrireEtat("site", { echecs, en_panne: true, depuis: new Date().toISOString() });
  } else if (marche && site.en_panne) {
    await creer("panne", "Le site remarche", "iashark.com répond de nouveau.", "/admin.html#ecran-site");
    await ecrireEtat("site", { echecs: 0, en_panne: false });
  } else {
    await ecrireEtat("site", { ...site, echecs });
  }

  // 2. Beaucoup de vrais visiteurs d'un coup : au moins 10 et 3 fois plus qu'un moment charge habituel. Une fois toutes les 3 h.
  try {
    const { data: f } = await db.rpc("admin_veille_foule");
    const n = Number(f?.maintenant || 0), habituel = Number(f?.habituel || 0);
    const foule = await etat("foule");
    const dernier = Date.parse(String(foule.dernier || "")) || 0;
    if (n >= 10 && n >= 3 * Math.max(1, habituel) && Date.now() - dernier > 3 * 3600000) {
      await creer("foule", "Beaucoup de monde sur le site", n + " personnes sur les 10 dernières minutes (d'habitude " + Math.round(habituel) + " au plus).", "/admin.html#maintenant");
      await ecrireEtat("foule", { dernier: new Date().toISOString(), n });
    }
  } catch (_) { /* rien */ }

  // 3. Abonnes du jour (une fois par jour et par reseau).
  await releverAbonnes();

  // 4. Alertes restees en file (fonction injoignable au moment de leur creation) : au plus 10, de moins d'une heure.
  const { data: file } = await db.from("admin_alertes").select("id").is("envoye_at", null)
    .gt("created_at", new Date(Date.now() - 3600000).toISOString()).lt("created_at", new Date(Date.now() - 60000).toISOString())
    .order("id").limit(10);
  for (const a of file || []) await envoyerAlerte(a.id);
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* vide */ }
  try {
    if (typeof body.id === "number") return json(await envoyerAlerte(body.id));
    if (body.mode === "veille") return json(await veille());
    if (body.mode === "test") {
      const authorization = req.headers.get("Authorization") || "";
      const user = createClient(SUPA_URL, SUPA_ANON_KEY, { global: { headers: { Authorization: authorization } } });
      const { data: auth } = await user.auth.getUser();
      if (!auth?.user) return json({ error: "unauthorized" }, 401);
      const { data: me } = await user.from("users").select("role").eq("id", auth.user.id).maybeSingle();
      if (!me || me.role !== "admin") return json({ error: "forbidden" }, 403);
      const { data } = await db.from("admin_alertes").insert({ type: "test", titre: "Notification d'essai", texte: "Les alertes IASHARK arrivent bien sur ce téléphone.", url: "/admin.html#ecran-alertes" }).select("id").single();
      return json(data?.id ? await envoyerAlerte(data.id) : { error: "insert" });
    }
    return json({ error: "bad_request" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 200) }, 500);
  }
});
