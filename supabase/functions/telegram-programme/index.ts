// Messages Telegram programmes (table telegram_programme), appeles chaque minute par pg_cron quand un message est du.
// Meme circuit que scripts/telegram/send-posts.mjs : conversation privee de Clement, boutons Publier / Ne pas publier,
// clic traite par telegram-bot. Rien ne part sur le canal sans son clic. Fenetre de 15 min, puis le message est abandonne.
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ADMIN = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const IMAGE_OK = /^https:\/\/(github\.com|raw\.githubusercontent\.com)\/IASHARK\//;
// Le gras <b> des textes est garde, tout le reste est echappe.
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&lt;(\/?)b&gt;/g, "<$1b>");
const clavier = { inline_keyboard: [
  [{ text: "Voir les matchs du jour", url: "https://iashark.com/?utm_source=telegram&utm_campaign=canal" }],
  [{ text: "Publier sur le canal", callback_data: "pub" }, { text: "Ne pas publier", callback_data: "non" }],
] };

async function lire(url: string) {
  if (!IMAGE_OK.test(url)) throw new Error("adresse refusee");
  const r = await fetch(url);
  if (!r.ok) throw new Error(`lecture ${r.status}`);
  return r;
}

async function envoyer(texteUrl: string, imageUrl: string) {
  const texte = esc((await (await lire(texteUrl)).text()).trim());
  let res: Response;
  // Legende limitee a 1024 signes : au-dela, l'image passe en apercu au-dessus du texte, dans le meme message.
  if (imageUrl && texte.length <= 1024) {
    const form = new FormData();
    form.append("chat_id", ADMIN);
    form.append("caption", texte);
    form.append("parse_mode", "HTML");
    form.append("reply_markup", JSON.stringify(clavier));
    form.append("photo", new Blob([await (await lire(imageUrl)).arrayBuffer()], { type: "image/jpeg" }), "image.jpg");
    res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: "POST", body: form });
  } else {
    res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: ADMIN, text: texte, parse_mode: "HTML", link_preview_options: imageUrl ? { url: imageUrl, prefer_large_media: true, show_above_text: true } : { is_disabled: true }, reply_markup: clavier }),
    });
  }
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`telegram ${res.status} ${json.description || ""}`);
}

Deno.serve(async () => {
  const maintenant = new Date();
  const limite = new Date(maintenant.getTime() - 15 * 60e3);
  const { data: dus, error } = await db.from("telegram_programme").select("id,nom,texte_url,image_url")
    .is("envoye_le", null).lte("heure", maintenant.toISOString()).gt("heure", limite.toISOString()).order("heure");
  if (error) return new Response(JSON.stringify({ ok: false, erreur: error.message }), { status: 500 });
  const faits: string[] = [];
  for (const m of dus || []) {
    // Un seul envoi meme si deux appels se croisent : la ligne est prise avant l'envoi.
    const { data: pris } = await db.from("telegram_programme").update({ envoye_le: new Date().toISOString(), erreur: null })
      .eq("id", m.id).is("envoye_le", null).select("id");
    if (!pris?.length) continue;
    try {
      await envoyer(m.texte_url, m.image_url);
      faits.push(m.nom);
    } catch (e) {
      await db.from("telegram_programme").update({ envoye_le: null, erreur: String((e as Error).message).slice(0, 300) }).eq("id", m.id);
    }
  }
  return new Response(JSON.stringify({ ok: true, faits }), { headers: { "content-type": "application/json" } });
});
