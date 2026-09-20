// Sante du site : memes regles que admin.html (admin-dashboard.js#healthLights).
// admin_health renvoie des horodatages bruts ; les feux sont calcules ici.
// `home` = /data-home.json (generated_at des pronostics publies).

function hoursSince(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now - t) / 3600000 : null;
}

export function ageText(hours) {
  if (hours === null) return "jamais";
  if (hours < 1) return "il y a " + Math.max(1, Math.round(hours * 60)) + " min";
  if (hours < 48) return "il y a " + Math.round(hours) + " h";
  return "il y a " + Math.round(hours / 24) + " jours";
}

export function buildHealth({ home, health, activePro }) {
  const checks = [];

  // 1. Pronostics du jour (data-home.json regenere par le pipeline quotidien).
  if (!home) checks.push({ key: "pronos", title: "Pronostics du jour", level: "unknown", text: "Vérification en cours…" });
  else if (!home.ok) checks.push({ key: "pronos", title: "Pronostics du jour", level: "bad", text: "Le fichier des pronostics est illisible sur le site : vérifie le dernier déploiement." });
  else {
    const h = hoursSince(home.generated_at);
    if (h === null) checks.push({ key: "pronos", title: "Pronostics du jour", level: "warn", text: "Date de génération illisible." });
    else if (h <= 26) checks.push({ key: "pronos", title: "Pronostics du jour", level: "ok", text: "Pronostics à jour (mis à jour " + ageText(h) + ")." });
    else checks.push({ key: "pronos", title: "Pronostics du jour", level: "bad", text: "Les pronostics n'ont pas été régénérés depuis " + ageText(h).replace("il y a ", "") + " : le pipeline quotidien a probablement échoué." });
  }

  // 2. Visites recues (le suivi fonctionne).
  if (!health) {
    checks.push({ key: "visits", title: "Visites reçues", level: "unknown", text: "Vérification en cours…" });
    checks.push({ key: "payments", title: "Paiements", level: "unknown", text: "Vérification en cours…" });
  } else {
    const vh = hoursSince(health.last_page_view_at || health.last_event_at);
    if (vh === null) checks.push({ key: "visits", title: "Visites reçues", level: "warn", text: "Aucune visite enregistrée pour l'instant." });
    else if (vh <= 6) checks.push({ key: "visits", title: "Visites reçues", level: "ok", text: "Les visites arrivent normalement (dernière " + ageText(vh) + ")." });
    else if (vh <= 24) checks.push({ key: "visits", title: "Visites reçues", level: "warn", text: "Aucune visite depuis " + ageText(vh).replace("il y a ", "") + ". Peut-être calme ; sinon vérifie que le site s'ouvre." });
    else checks.push({ key: "visits", title: "Visites reçues", level: "bad", text: "Aucune visite depuis " + ageText(vh).replace("il y a ", "") + " : le suivi est peut-être cassé." });

    // 3. Paiements (webhook Stripe vivant quand il y a des abonnes).
    const bh = hoursSince(health.last_billing_event_at);
    const active = Number(activePro) || 0;
    if (bh === null) {
      if (active > 0) checks.push({ key: "payments", title: "Paiements", level: "warn", text: "Des abonnés mais aucun message Stripe jamais reçu : fais vérifier le webhook." });
      else checks.push({ key: "payments", title: "Paiements", level: "ok", text: "Aucun paiement pour l'instant : normal sans abonné." });
    } else if (bh <= 35 * 24 || active === 0) {
      checks.push({ key: "payments", title: "Paiements", level: "ok", text: "Dernier message de Stripe reçu " + ageText(bh) + "." });
    } else {
      checks.push({ key: "payments", title: "Paiements", level: "warn", text: "Aucun message Stripe depuis " + ageText(bh).replace("il y a ", "") + " malgré des abonnés actifs : fais vérifier le webhook." });
    }
  }

  const levels = checks.map((c) => c.level);
  const level = levels.includes("bad") ? "red" : levels.includes("warn") ? "amber" : levels.includes("unknown") ? "unknown" : "green";
  const TITLE = {
    green: ["Tout va bien", "Le site fonctionne normalement."],
    amber: ["À surveiller", "Un point mérite une vérification."],
    red: ["Problème", "Quelque chose ne tourne pas : regarde les points en rouge."],
    unknown: ["Vérification…", "Les contrôles sont en cours."],
  };
  return { level, title: TITLE[level][0], sentence: TITLE[level][1], checks };
}
