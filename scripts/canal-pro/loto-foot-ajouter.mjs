#!/usr/bin/env node
// Ajoute (ou met a jour) une grille Loto Foot relevee sur le site de la FDJ.
// La FDJ n'a pas d'API : la liste des matchs (avec leur numero n), l'heure de
// cloture, la repartition des joueurs (%) et l'heure de ce releve sont RELEVEES (a la main ou par
// un releve autorise), puis ajoutees ici. Le robot du Canal Pro envoie
// ensuite « Notre grille a tenter » la veille du 1er match a 18 h.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/canal-pro/loto-foot-ajouter.mjs grille.json
// Format : voir scripts/canal-pro/exemple-grille-loto-foot.json (exemple fictif).
import fs from "node:fs";
import { BaseRest } from "./lib/base.mjs";
import * as C from "../../supabase/functions/_shared/canal-pro.mjs";

// Une grille incomplete est refusee ici ET n'est jamais envoyee (meme controle dans le robot).
export const verifierGrille = (g) => C.problemesGrille(g);

if (process.argv[2]) {
  const g = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  delete g._note;
  const err = verifierGrille(g);
  if (err.length) { console.error("Grille refusee :\n- " + err.join("\n- ")); process.exit(1); }
  const db = new BaseRest(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await db.insert("loto_foot_grilles", [g], { conflit: "fusionner", cle: "id" });
  console.log(`Grille ${g.id} enregistree (${g.matchs.length} matchs).`);
}
