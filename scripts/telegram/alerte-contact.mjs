// IASHARK — alerte Telegram a chaque message de la page Contact (30/10/2026).
// Meme mecanisme que alerte-partenaires.mjs : lit les messages pas encore signales
// (contact_messages.owner_notified_at vide, migration 0060), envoie chacun a Clement
// (TELEGRAM_CHAT_ID, sa conversation privee avec le robot), puis marque la ligne.
// Texte du visiteur envoye en texte brut (aucun parse_mode : aucun balisage interprete).
// Secrets : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

export function texteAlerte(m) {
  const lignes = [
    "Nouveau message (page Contact)",
    "",
    "De : " + String(m.email || "?").slice(0, 254),
    "Version du site : " + (m.page_dir || "?") + (m.locale ? " (" + m.locale + ")" : ""),
    "Compte : " + (m.user_id ? "connecte" : "visiteur sans compte"),
    "",
    String(m.message || "").slice(0, 2000),
    "",
    "Répondre par e-mail à l'adresse ci-dessus.",
  ];
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
  let lignes;
  try {
    lignes = await supa("contact_messages?select=id,email,message,locale,page_dir,user_id,created_at"
      + "&owner_notified_at=is.null&order=created_at.asc&limit=30");
  } catch (e) {
    // Table absente tant que la migration 0060 n'est pas appliquee : pas une panne.
    if (/42P01|does not exist|PGRST205/.test(e.message)) { console.log("Table contact_messages absente (migration 0060 non appliquee)."); return; }
    throw e;
  }
  console.log(lignes.length + " message(s) a signaler.");
  for (const m of lignes) {
    const res = await fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texteAlerte(m), disable_web_page_preview: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) { console.error("Telegram refuse l'envoi du message " + m.id + " : " + (j.description || res.status)); process.exitCode = 1; continue; }
    await supa("contact_messages?id=eq." + encodeURIComponent(m.id), { method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ owner_notified_at: new Date().toISOString() }) });
    console.log("Signale : " + m.id);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
