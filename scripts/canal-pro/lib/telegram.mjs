// Envoi Telegram (Bot API) avec un rythme sur (Telegram limite a ~30 messages
// par seconde au total et 1 par seconde par conversation).
// Erreur : e.status = code HTTP recu (absent si coupure reseau). Seuls 400, 403 et
// 429 prouvent que le message n'est PAS parti (C.envoiRefuse) ; un 502, un 504 ou
// une reponse 200 illisible laissent l'envoi INCERTAIN (jamais renvoye tout seul).
export function robotTelegram(token, { pause = 60 } = {}) {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN manquant");
  let dernier = 0;
  return async function tg(methode, corps) {
    const attente = dernier + pause - Date.now();
    if (attente > 0) await new Promise((r) => setTimeout(r, attente));
    dernier = Date.now();
    for (let essai = 0; essai < 3; essai++) {
      const r = await fetch(`https://api.telegram.org/bot${token}/${methode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
      const j = await r.json().catch(() => ({}));
      if (j.ok) return j.result;
      if (r.status === 429 && j.parameters?.retry_after) { await new Promise((ok) => setTimeout(ok, (j.parameters.retry_after + 1) * 1000)); continue; }
      const e = new Error(`${methode}: ${r.status} ${j.description || ""}`); e.status = r.status; throw e;
    }
    const e = new Error(`${methode}: 429 trop de tentatives`); e.status = 429; throw e; // 3 refus « trop de messages » : pas parti
  };
}
