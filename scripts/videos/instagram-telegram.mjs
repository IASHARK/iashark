// Mode « Instagram du jour » de daily-videos.yml, lancé à la main avec la date « instagram:AAAA-MM-JJ ».
// Rien n'est calculé ici : on télécharge les Reels déjà préparés (vidéo, couverture, description, heure)
// dans la release <jour> du dépôt public IASHARK/iashark-medias, puis on écrit le manifest.json
// que send-telegram.mjs envoie à Clément, qui publie ces Reels à la main sur Instagram.
import fs from "node:fs";
import path from "node:path";

export async function preparerInstagram(out, jour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) throw new Error(`jour invalide : ${jour}`);
  const base = `https://github.com/IASHARK/iashark-medias/releases/download/${jour}/`;
  const get = async (nom) => {
    const res = await fetch(base + encodeURIComponent(nom));
    if (!res.ok) throw new Error(`${nom} : ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };
  fs.mkdirSync(out, {recursive: true});
  const plan = JSON.parse((await get("instagram.json")).toString("utf8"));
  for (const r of plan.reels) {
    for (const f of [r.video, r.couverture].filter(Boolean)) fs.writeFileSync(path.join(out, path.basename(f)), await get(f));
  }
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(
    {date: jour, videos: [], skipped: [], intro: plan.intro, instagram: plan.reels}, null, 2));
  console.log(`Instagram du ${jour} : ${plan.reels.length} Reels prêts`);
}
