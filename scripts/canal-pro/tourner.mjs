#!/usr/bin/env node
// Robot planifie des messages Pro (envoyes en prive, un a un, a chaque abonne) : lance toutes les 15 min par
// .github/workflows/canal-pro.yml. Fait ce qui est du a cette heure-ci
// (heure de Paris) : programme (le MENU, calcule sur la sortie du moteur v3),
// rappel, publication, renvoi des paris pas partis, cotes, compositions, meteo, reglement, debriefs, ancre, bilan,
// Loto Foot, duel, messages obligatoires pas encore envoyes (reproposes), rattrapage des envois prives.
//   node scripts/canal-pro/tourner.mjs            (tour normal)
//   node scripts/canal-pro/tourner.mjs --tache cotes   (une seule tache, forcee)
import { BaseRest } from "./lib/base.mjs";
import { robotTelegram } from "./lib/telegram.mjs";
import { creerSources } from "./lib/sources.mjs";
import * as T from "./taches.mjs";

const env = process.env;
const db = new BaseRest(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const deps = {
  db,
  tg: robotTelegram(env.TELEGRAM_BOT_TOKEN),
  // Sortie du moteur v3 : MOTEUR_V3_SORTIE (fichier ou dossier) si donne, sinon la table privee moteur_v3_sorties.
  src: creerSources(env, { db }),
  // Plus de canal Pro (02/10/2026) : ADMIN = conversation de Clement (registre et rodage) ; seul le canal gratuit reste.
  env: { ADMIN: env.TELEGRAM_CHAT_ID, CANAL_GRATUIT: env.TELEGRAM_PUBLIC_CHANNEL || "@iasharkdata", ANCRE_FICHIER: env.ANCRE_FICHIER },
};
if (!deps.env.ADMIN) throw new Error("TELEGRAM_CHAT_ID manquant");
const i = process.argv.indexOf("--tache");
if (i > -1) {
  const ctx = T.creerContexte(deps);
  const nom = process.argv[i + 1];
  const f = { programme: T.tacheProgramme, cotes: (c) => T.tacheCotes(c, { force: true }), compositions: T.tacheCompositions, meteo: T.tacheMeteo,
    regler: T.tacheRegler, debrief_matin: (c) => T.tacheDebrief(c, "matin"), debrief_soir: (c) => T.tacheDebrief(c, "soir"),
    bilan_semaine: T.tacheBilanSemaine, loto_foot: T.tacheLotoFoot, duel: T.tacheDuel, renvoi: T.tacheRenvoi, ancre: T.tacheAncre,
    a_publier: T.tacheAPublier, diffusions: T.tacheDiffusions }[nom];
  if (!f) throw new Error(`tache inconnue : ${nom}`);
  console.log(await f(ctx));
} else {
  const r = await T.tourner(deps);
  if (Object.values(r).some((x) => String(x).startsWith("ERREUR"))) process.exitCode = 1;
}
