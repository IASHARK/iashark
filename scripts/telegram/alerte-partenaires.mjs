// IASHARK — alerte Telegram a chaque candidature partenaire (28/10/2026).
// Lit les candidatures en attente pas encore signalees (affiliates.status = 'pending',
// owner_notified_at vide), envoie un message a Clement (TELEGRAM_CHAT_ID, sa conversation
// privee avec le robot) puis marque la ligne comme signalee. Rien n'est publie ailleurs.
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
const ADMIN = "https://iashark.com/admin.html#ecran-partenaires";
const STYLES = { analysis: "Analyses de matchs", tips: "Pronostics et sélections", entertainment: "Divertissement, humour",
  education: "Pédagogie, statistiques", community: "Communauté, groupes, forums", other: "Autre" };

export function texteAlerte(a) {
  const reseaux = Array.isArray(a.networks) ? a.networks.slice(0, 6) : [];
  const lignes = [
    "Nouvelle candidature partenaire",
    "",
    "Code : " + a.code,
    "Pays : " + (a.country || "?"),
    "Abonnés déclarés : " + (a.audience == null ? "?" : Number(a.audience).toLocaleString("fr-FR")),
    "Style : " + (STYLES[a.content_style] || a.content_style || "?"),
    "Statut : " + (a.legal_status === "professional" ? "professionnel" : "particulier"),
  ];
  if (reseaux.length) lignes.push("", "Réseaux :", ...reseaux.map((r) => "- " + String(r).slice(0, 200)));
  if (a.about) lignes.push("", "Son mot : " + String(a.about).slice(0, 500));
  lignes.push("", "À valider ou refuser dans l'admin : " + ADMIN);
  return lignes.join("\n");
}

async function supa(chemin, options = {}) {
  const res = await fetch(SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + chemin, {
    ...options,
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error("Supabase " + res.status + " " + (await res.text()).slice(0, 300));
  return res.status === 204 ? null : res.json();
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Secrets absents : aucune alerte envoyee.");
    return;
  }
  const lignes = await supa("affiliates?select=id,code,country,audience,networks,content_style,legal_status,about,created_at"
    + "&status=eq.pending&owner_notified_at=is.null&order=created_at.asc&limit=20");
  console.log(lignes.length + " candidature(s) a signaler.");
  for (const a of lignes) {
    const res = await fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texteAlerte(a), disable_web_page_preview: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) { console.error("Telegram refuse l'envoi pour " + a.code + " : " + (j.description || res.status)); process.exitCode = 1; continue; }
    await supa("affiliates?id=eq." + encodeURIComponent(a.id), { method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ owner_notified_at: new Date().toISOString() }) });
    console.log("Signalee : " + a.code);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
