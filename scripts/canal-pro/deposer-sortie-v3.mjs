#!/usr/bin/env node
// Depose la sortie du jour du moteur v3 dans la table PRIVEE moteur_v3_sorties
// (cle de service ; aucune lecture possible depuis le navigateur). Lance par le
// workflow « Update IASHARK Daily » juste apres le calcul du moteur v3 : le robot
// du Canal Pro (scripts/canal-pro/tourner.mjs) y lit le menu du jour, sans rien
// publier dans le depot public.
//   MOTEUR_V3_SORTIE=<fichier ou dossier sortie/> SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/canal-pro/deposer-sortie-v3.mjs
// Seuls les matchs des 6 championnats du menu sont gardes, avec les champs utiles
// au menu (1N2, double chance, buts attendus, buteurs) : quelques dizaines de Ko.
// UNE SEULE SOURCE DE CHIFFRES (01/10/2026) : chaque marche 1N2 / double chance recoit ici
// sa chance_iashark (en % entier), la chance que le Canal Pro affiche. Elle vient du calcul
// du site (CHANCES_IASHARK, fichier ecrit par update-data.yml : la meme chance que la page
// match pour le pari retenu) ; pour un match que le site n'a pas encore calcule (tickets du
// week-end), meme regle (lib/chance-iashark.js) avec la cote sans marge du moteur v3.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaseRest } from "./lib/base.mjs";
import { createRequire } from "node:module";
import * as M from "../../supabase/functions/_shared/canal-pro-menu.mjs";

const CHANCE = createRequire(import.meta.url)("../../lib/chance-iashark.js");

const CLES = new Set(["1N2:1", "1N2:N", "1N2:2", "DC:1N", "DC:N2", "DC:12"]);
/** Chance IASHARK d'un marche : celle du site si elle existe, sinon la meme regle sur la cote sans marge du v3. */
function chanceDuMarche(m, mk, chances) {
  const fixture = m.ids_api_football?.fixture != null ? String(m.ids_api_football.fixture) : null;
  const site = fixture && chances && chances[fixture] && chances[fixture].marches ? chances[fixture].marches[mk.cle] : null;
  if (Number.isFinite(Number(site)) && Number(site) > 0 && Number(site) < 100) return { chance: Number(site), source: "site" };
  const q = M.sansMargeV3(m);
  const c = CHANCE.chanceIashark(Number(mk.probabilite) * 100, q && Number.isFinite(q[mk.cle]) ? q[mk.cle] * 100 : null);
  return c ? { chance: c.chance, source: "moteur" } : null;
}
/** Sortie complete -> sortie reduite au menu (memes champs, meme contrat), chaque marche avec sa chance_iashark. */
export function reduire(sortie, chances = null) {
  // Ligues VALIDEES de la fusion seulement (canal-pro-menu.mjs#liguesValidees) ; jamais une selection.
  const matchs = (sortie.matchs || []).filter((m) => M.MENU.ligues[m.ligue_code] && m.competition_type !== "selections").map((m) => {
    const buteurs = [];
    for (const eq of [m.domicile, m.exterieur]) {
      buteurs.push(...(m.buteurs || []).filter((b) => b.equipe === eq).sort((a, b) => (b.p_marque || 0) - (a.p_marque || 0)).slice(0, 8));
    }
    return { match_id: m.match_id, ligue_code: m.ligue_code, ligue: m.ligue, competition_type: m.competition_type, date: m.date, domicile: m.domicile, exterieur: m.exterieur,
      ids_api_football: m.ids_api_football ?? null, coup_envoi_utc: m.coup_envoi_utc ?? null, couverture: m.couverture, eligible_vip: m.eligible_vip === true,
      probabilite_source: m.probabilite_source, buts_attendus: m.buts_attendus,
      marches: (m.marches || []).filter((x) => CLES.has(x.cle)).map((x) => { const c = chanceDuMarche(m, x, chances); return c ? { ...x, chance_iashark: c.chance, chance_iashark_de: c.source } : { ...x }; }), buteurs };
  });
  return { contrat_version: sortie.contrat_version, moteur_version: sortie.moteur_version, genere_le: sortie.genere_le, interrupteur_urgence: sortie.interrupteur_urgence, matchs };
}
export function lireSortie(chemin) {
  let fichier = chemin;
  if (fs.statSync(chemin).isDirectory()) {
    const f = fs.readdirSync(chemin).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().at(-1);
    if (!f) throw new Error(`aucun fichier de sortie dans ${chemin}`);
    fichier = path.join(chemin, f);
  }
  return JSON.parse(fs.readFileSync(fichier, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.env;
  if (!env.MOTEUR_V3_SORTIE || !fs.existsSync(env.MOTEUR_V3_SORTIE)) { console.log("Pas de sortie du moteur v3 ce matin : rien a deposer (le Canal Pro affichera « programme reporte »)."); process.exit(0); }
  let chances = null;
  try { if (env.CHANCES_IASHARK && fs.existsSync(env.CHANCES_IASHARK)) chances = JSON.parse(fs.readFileSync(env.CHANCES_IASHARK, "utf8")); }
  catch (e) { console.log(`::warning title=Canal Pro::chances IASHARK du site illisibles (${e.message.slice(0, 80)}) : cote sans marge du moteur v3.`); }
  const sortie = reduire(lireSortie(env.MOTEUR_V3_SORTIE), chances);
  const v = M.verifierSortie(sortie, new Date());
  if (!v.ok) { console.log(`::warning title=Canal Pro::sortie du moteur v3 non deposee : ${v.raison}`); process.exit(0); }
  const db = new BaseRest(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  await db.insert("moteur_v3_sorties", [{ genere_le: sortie.genere_le, moteur_version: sortie.moteur_version, contrat_version: sortie.contrat_version, sortie }], { conflit: "fusionner", cle: "genere_le" });
  console.log(`Sortie du moteur v3 deposee (${sortie.moteur_version}, generee le ${sortie.genere_le}) : ${sortie.matchs.length} matchs des 6 championnats du menu.`);
}
