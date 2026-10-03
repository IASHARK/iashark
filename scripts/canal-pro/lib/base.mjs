// Acces a la base Supabase (PostgREST) pour le robot planifie du Canal Pro,
// plus une base EN MEMOIRE de meme interface pour les tests.
//
// Filtres : { col: valeur } (egal), { col: ["gte"|"gt"|"lte"|"lt"|"neq", v] },
// { col: ["in", [..]] }, { col: ["is", null] }, { col: ["not_is", null] },
// { col: ["like", "debut*"] } (* = n'importe quelle suite de caracteres).

function versQuery(filtres = {}) {
  const q = [];
  for (const [col, f] of Object.entries(filtres)) {
    if (Array.isArray(f)) {
      const [op, v] = f;
      if (op === "in") q.push(`${col}=in.(${v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",")})`);
      else if (op === "is") q.push(`${col}=is.null`);
      else if (op === "not_is") q.push(`${col}=not.is.null`);
      else if (op === "like") q.push(`${col}=like.${encodeURIComponent(v).replace(/%2A/gi, "*")}`);
      else q.push(`${col}=${op}.${encodeURIComponent(v)}`);
    } else q.push(`${col}=eq.${encodeURIComponent(f)}`);
  }
  return q;
}

export class BaseRest {
  constructor(url, cle) {
    if (!url || !cle) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
    this.url = url.replace(/\/$/, "") + "/rest/v1/";
    this.h = { apikey: cle, Authorization: `Bearer ${cle}`, "content-type": "application/json" };
  }
  async appel(chemin, init = {}) {
    const r = await fetch(this.url + chemin, { ...init, headers: { ...this.h, ...(init.headers || {}) } });
    const t = await r.text();
    if (!r.ok) { const e = new Error(`${init.method || "GET"} ${chemin.split("?")[0]} : ${r.status} ${t.slice(0, 300)}`); e.status = r.status; e.corps = t; throw e; }
    return t ? JSON.parse(t) : [];
  }
  select(table, filtres = {}, { ordre, limite, colonnes = "*" } = {}) {
    const q = [`select=${colonnes}`, ...versQuery(filtres)];
    if (ordre) q.push(`order=${ordre}`);
    if (limite) q.push(`limit=${limite}`);
    return this.appel(`${table}?${q.join("&")}`);
  }
  /** conflit : "erreur" (defaut), "ignorer" (renvoie [] si la ligne existe), "fusionner". */
  insert(table, lignes, { conflit = "erreur", cle } = {}) {
    const pref = ["return=representation"];
    if (conflit === "ignorer") pref.push("resolution=ignore-duplicates");
    if (conflit === "fusionner") pref.push("resolution=merge-duplicates");
    return this.appel(`${table}${cle && conflit !== "erreur" ? `?on_conflict=${cle}` : ""}`, { method: "POST", headers: { Prefer: pref.join(",") }, body: JSON.stringify(lignes) });
  }
  update(table, filtres, patch) {
    return this.appel(`${table}?${versQuery(filtres).join("&")}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
  }
  /** Suppression (jamais sans filtre). */
  delete(table, filtres) {
    const q = versQuery(filtres);
    if (!q.length) throw new Error("suppression sans filtre refusee");
    return this.appel(`${table}?${q.join("&")}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
  }
}

const CLES = { moteur_v3_sorties: ["genere_le"], pro_programmes: ["jour"], pro_envois: ["cle"], telegram_abonnes: ["user_id"], duel_manches: ["jour"], duel_votes: ["jour", "telegram_user_id"],
  loto_foot_grilles: ["id"], telegram_settings: ["key"], pro_paris: ["id"], pro_tickets: ["id"], users: ["id"], pro_preferences: ["user_id"], telegram_vip_members: ["user_id"], user_preferences: ["user_id"] };

// Champs verrouilles apres publication (memes listes que le trigger de 0040_canal_pro.sql).
const FIGES = ["numero", "jour", "famille", "regles", "event_id", "sport_key", "fixture_id", "ligue", "dom", "ext", "coup_envoi", "fin_coup_envoi", "marche", "ligne", "selection",
  "selections", "proba", "source_proba", "cote_min", "meilleure_cote", "meilleur_bookmaker", "cotes", "composantes", "cote_vue_at", "explication", "retire", "mode", "destination", "publie_at"];
const UNE_FOIS = ["empreinte", "empreinte_precedente", "canal_message_id", "envoye_at", "envoi_echec_at", "compo_voyant", "compo_at", "meteo", "meteo_at", "score_dom",
  "score_ext", "resultat", "cote_fin", "pinnacle_cote_fin", "pinnacle_proba_fin", "pinnacle_fin_at", "faits", "regle_at", "debrief"];

export class BaseMemoire {
  constructor(tables = {}) { this.t = structuredClone(tables); this.n = 0; }
  /**
   * Comme le trigger pro_paris_heure_publication de 0040 : apres l'heure limite (70 min avant le coup
   * d'envoi), ni archivage (publie_at) ni preuve d'envoi (canal_message_id), a l'insertion (avant = null)
   * comme a la mise a jour, pari deja archive ou non. Heure de reference : la plus tot (ancienne,
   * nouvelle). horloge = heure simulee des tests (sans horloge, pas de controle).
   */
  _heureLimite(avant, apres) {
    if (!this.horloge) return;
    const ko = Math.min(Date.parse(apres.coup_envoi), avant ? Date.parse(avant.coup_envoi) : Infinity);
    if (!(this.horloge().getTime() >= ko - 70 * 60000)) return;
    if (apres.publie_at != null && avant?.publie_at == null)
      throw new Error(`pro_paris : archivage refuse apres l'heure limite, 70 min avant le coup d'envoi (numero ${apres.numero ?? null})`);
    if (apres.canal_message_id != null && avant?.canal_message_id == null)
      throw new Error(`pro_paris : preuve d'envoi refusee apres l'heure limite, 70 min avant le coup d'envoi (numero ${(avant || apres).numero ?? null})`);
  }
  _tab(nom) { if (!this.t[nom]) { if (nom === "pro_preferences" && this.sansPreferences) { const e = new Error("relation absente"); e.status = 404; throw e; } this.t[nom] = []; } return this.t[nom]; }
  _ok(l, filtres) {
    return Object.entries(filtres).every(([c, f]) => {
      const v = l[c];
      if (!Array.isArray(f)) return String(v) === String(f);
      const [op, x] = f;
      if (op === "in") return x.map(String).includes(String(v));
      if (op === "is") return v == null;
      if (op === "not_is") return v != null;
      if (op === "neq") return String(v) !== String(x);
      if (op === "like") return new RegExp(`^${String(x).split("*").map((m) => m.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(String(v ?? ""));
      const iso = (z) => typeof z === "string" && /^\d{4}-\d\d-\d\dT/.test(z);
      const a = typeof v === "number" ? v : iso(v) && iso(x) ? Date.parse(v) : String(v);
      const b = typeof v === "number" ? Number(x) : iso(v) && iso(x) ? Date.parse(x) : String(x);
      return op === "gte" ? a >= b : op === "gt" ? a > b : op === "lte" ? a <= b : op === "lt" ? a < b : false;
    });
  }
  async select(table, filtres = {}, { ordre, limite } = {}) {
    let r = this._tab(table).filter((l) => this._ok(l, filtres)).map((l) => structuredClone(l));
    if (ordre) { const [c, sens] = ordre.split("."); r.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (sens === "desc" ? -1 : 1)); }
    return limite ? r.slice(0, limite) : r;
  }
  async insert(table, lignes, { conflit = "erreur" } = {}) {
    const tab = this._tab(table), cles = CLES[table] || ["id"], out = [];
    for (const l0 of lignes) {
      const l = { ...l0 };
      if (cles[0] === "id" && !l.id) l.id = `id-${++this.n}`;
      if (table === "pro_cotes_releves") l.id = ++this.n;
      const ex = tab.find((x) => cles.every((c) => String(x[c]) === String(l[c])));
      if (ex) {
        if (conflit === "ignorer") continue;
        if (conflit === "fusionner") { Object.assign(ex, l); out.push(structuredClone(ex)); continue; }
        const e = new Error(`duplicate key ${table}`); e.status = 409; throw e;
      }
      if (table === "pro_paris" && l.numero != null && tab.some((x) => x.numero === l.numero)) { const e = new Error("duplicate numero"); e.status = 409; throw e; }
      if (table === "pro_paris") this._heureLimite(null, l);
      tab.push(l); out.push(structuredClone(l));
    }
    return out;
  }
  async delete(table, filtres) {
    if (!Object.keys(filtres || {}).length) throw new Error("suppression sans filtre refusee");
    if (table === "pro_cotes_releves") throw new Error("pro_cotes_releves : ajout seulement");
    const tab = this._tab(table), out = [];
    for (let i = tab.length - 1; i >= 0; i--) if (this._ok(tab[i], filtres)) out.push(...tab.splice(i, 1));
    return out;
  }
  async update(table, filtres, patch) {
    const out = [];
    if (table === "pro_cotes_releves") throw new Error("pro_cotes_releves : ajout seulement");
    for (const l of this._tab(table).filter((x) => this._ok(x, filtres))) {
      const p = { ...patch };
      if (table === "pro_paris") {
        // Comme le trigger : publie_at pose par la base, au format de Postgres ('+00:00').
        if (!l.publie_at && p.publie_at) p.publie_at = new Date(p.publie_at).toISOString().replace("Z", "+00:00");
        if (l.publie_at) {
          for (const k of FIGES) if (k in p && JSON.stringify(p[k]) !== JSON.stringify(l[k])) throw new Error(`pro_paris : pari publie, archive figee (numero ${l.numero}, champ ${k})`);
          for (const k of UNE_FOIS) if (k in p && l[k] != null && JSON.stringify(p[k]) !== JSON.stringify(l[k])) throw new Error(`pro_paris : champ ${k} deja renseigne (numero ${l.numero})`);
        }
        this._heureLimite(l, { ...l, ...p });
      }
      if (table === "duel_manches") {
        for (const k of ["choix_ia", "sel", "empreinte", "dom", "ext", "coup_envoi", "fixture_id"]) if (k in p && p[k] !== l[k]) throw new Error("duel_manches : choix scelle");
        if ("resultat" in p && l.resultat != null && p.resultat !== l.resultat) throw new Error("duel_manches : choix scelle");
      }
      Object.assign(l, p); out.push(structuredClone(l));
    }
    return out;
  }
}
