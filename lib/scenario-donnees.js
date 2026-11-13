"use strict";
// MOTEUR « SCENARIO » (plan valide par Clement le 13/11/2026) : DONNEES.
// Ce fichier ne contient AUCUNE formule du moteur (elles vivent dans le depot prive IASHARK/iashark-moteur, dossier
// scenario/). Il ne fait que ranger les matchs d'API-Sports sous une forme courte et les lire / ecrire :
//   - chaque match joue est recupere UNE fois (/fixtures?ids=, 20 par appel) puis garde en base (table privee
//     scenario_matchs, migration 0075) ; en local (rejeu), dans un fichier JSONL hors du depot ;
//   - on s'arrete des que le quota API-Sports restant passe sous QUOTA_PLANCHER (regle du 07/11 : le site passe avant) ;
//   - la cle n'est jamais affichee.
// Zero fuite du futur : une ligne ne contient que des faits du match lui-meme ; c'est le moteur qui ne lit que les
// matchs joues AVANT le coup d'envoi du match a predire (DATA_LEAKAGE_POLICY.md).

const QUOTA_PLANCHER = 3000;
const FINIS = { FT: 1, AET: 1, PEN: 1 };
const API = "https://v3.football.api-sports.io";

const ent = (x) => (Number.isInteger(x) ? x : null);
function nombre(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

// Statistiques d'equipe gardees, dans l'ORDRE des colonnes de la ligne courte (s[0] = domicile, s[1] = exterieur).
const COLONNES = ["tirs", "tirs_cadres", "corners", "fautes", "hors_jeu", "jaunes", "rouges", "possession", "xg", "tirs_surface"];
const TYPE_API = { tirs: "Total Shots", tirs_cadres: "Shots on Goal", corners: "Corner Kicks", fautes: "Fouls", hors_jeu: "Offsides",
  jaunes: "Yellow Cards", rouges: "Red Cards", possession: "Ball Possession", xg: "expected_goals", tirs_surface: "Shots insidebox" };

// Match API-Sports complet (/fixtures?ids=) -> ligne courte, ou null si le match n'est pas fini.
// Une statistique absente reste null (jamais 0 invente), SAUF dans un bloc de statistiques present ou API-Sports ecrit
// null pour zero (cartons, hors-jeu, corners) : la meme regle que lib/flux-paris.js#faitsDuMatch.
function compacter(fx) {
  const f = fx && fx.fixture, t = fx && fx.teams, lg = fx && fx.league;
  if (!f || !t || !t.home || !t.away || !f.status || !FINIS[f.status.short]) return null;
  const sc = fx.score || {};
  const paire = (o) => (o && ent(o.home) !== null && ent(o.away) !== null ? [o.home, o.away] : null);
  const idH = t.home.id, idA = t.away.id;
  const L = {
    id: f.id, d: new Date(f.date).toISOString(), lg: lg ? lg.id : null, sa: lg ? lg.season : null, rd: lg ? String(lg.round || "") : "",
    h: idH, a: idA, hn: t.home.name, an: t.away.name, ref: nomArbitre(f.referee), st: f.status.short,
    ft: paire(sc.fulltime) || paire(fx.goals), ht: paire(sc.halftime), s: null, ev: null, xi: null,
  };
  if (Array.isArray(fx.statistics) && fx.statistics.length === 2) {
    const bloc = (id) => fx.statistics.find((x) => x && x.team && x.team.id === id);
    const lire = (b) => COLONNES.map((c) => {
      const r = b && Array.isArray(b.statistics) ? b.statistics.find((y) => y && y.type === TYPE_API[c]) : null;
      if (!r) return null;
      const n = nombre(r.value);
      // null pour zero : seulement les comptes qu'API-Sports laisse vides quand il n'y en a pas.
      return n === null ? (["jaunes", "rouges", "hors_jeu", "corners"].indexOf(c) !== -1 ? 0 : null) : n;
    });
    const bh = bloc(idH), ba = bloc(idA);
    if (bh && ba) {
      L.s = [lire(bh), lire(ba)];
      // Bloc present mais vide (aucun tir ET aucune faute des deux cotes) : statistiques non saisies, pas un match a zero.
      const vide = (v) => v[0] == null && v[3] == null;
      if (vide(L.s[0]) && vide(L.s[1])) L.s = null;
    }
  }
  if (Array.isArray(fx.events) && fx.events.length) {
    const cote = (e) => (e.team && e.team.id === idH ? 0 : e.team && e.team.id === idA ? 1 : -1);
    const regl = (e) => e && e.time && Number(e.time.elapsed) <= 90 && !/shootout/i.test(String(e.comments || ""));
    const pen = [0, 0], par = {};
    fx.events.forEach((e) => {
      if (!regl(e)) return;
      const c = cote(e);
      if (c < 0) return;
      if (e.type === "Goal" && (/penalty/i.test(String(e.detail || "")))) pen[c]++; // marque ou manque : penalty siffle
      if (e.type === "Card" && e.player && e.player.id != null && !/coach|bench|manager|staff/i.test(String(e.comments || ""))) {
        const k = c + ":" + e.player.id, j = par[k] || (par[k] = { c: c, jaune: 0, rouge: 0, deux: 0 });
        const d = String(e.detail || "").toLowerCase();
        if (d === "yellow card") j.jaune = 1;
        else if (d === "second yellow card") { j.jaune = 1; j.deux = 1; j.rouge = 1; }
        else if (d === "red card") j.rouge = 1;
      }
    });
    // Comptage « a la Bet365 » (b365) : jaune = 1, rouge = 2, le 2e jaune qui donne le rouge n'est pas compte en plus
    // (au plus 3 par joueur), entraineurs et banc non comptes, 90 minutes seulement. Meme regle que le reglement
    // (lib/flux-paris.js#faitsDuMatch). yc = joueurs avertis (jaunes seuls), utilises par la formule.
    const yc = [0, 0], rc = [0, 0], b365 = [0, 0];
    Object.keys(par).forEach((k) => { const j = par[k]; yc[j.c] += j.jaune; rc[j.c] += j.rouge; b365[j.c] += j.jaune + (j.rouge ? 2 : 0); });
    L.ev = { pen: pen, yc: yc, rc: rc, b365: b365 };
  }
  if (Array.isArray(fx.lineups) && fx.lineups.length === 2) {
    const xi = (id) => { const l = fx.lineups.find((x) => x && x.team && x.team.id === id); return l && Array.isArray(l.startXI) ? l.startXI.map((p) => p && p.player && p.player.id).filter((x) => x != null) : null; };
    const a = xi(idH), b = xi(idA);
    if (a && b && a.length >= 10 && b.length >= 10) L.xi = [a, b];
  }
  return L;
}

// « M. Oliver, England » -> « m oliver » (cle stable d'un arbitre ; API-Sports n'a pas d'identifiant d'arbitre).
function nomArbitre(r) {
  if (typeof r !== "string") return null;
  const s = r.split(",")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  return s || null;
}

// ---------------------------------------------------------------------------- API-Sports (quota surveille)
// client({ cle, fetch, plancher }) -> { get(chemin), restant(), appels }. Leve « QUOTA » sous le plancher.
function client(opts) {
  const f = opts.fetch || fetch;
  const plancher = opts.plancher != null ? opts.plancher : QUOTA_PLANCHER;
  const etat = { restant: null, appels: 0 };
  async function get(chemin) {
    if (etat.restant !== null && etat.restant < plancher) { const e = new Error("QUOTA"); e.quota = true; throw e; }
    for (let essai = 0; essai < 4; essai++) {
      etat.appels++;
      const r = await f(API + chemin, { headers: { "x-apisports-key": opts.cle } });
      // En-tete absent (reponse « trop d'appels par minute ») : quota inconnu, jamais lu comme 0.
      const brut = r.headers && r.headers.get ? r.headers.get("x-ratelimit-requests-remaining") : null;
      const h = brut == null || brut === "" ? NaN : Number(brut);
      if (Number.isFinite(h)) etat.restant = h;
      const j = await r.json().catch(() => null);
      const err = j && j.errors && !Array.isArray(j.errors) ? Object.keys(j.errors).map((k) => k + ": " + j.errors[k]).join(" ; ") : "";
      if (/request limit|Free plans/i.test(err)) { const e = new Error("QUOTA"); e.quota = true; throw e; }
      if (/rateLimit|Too many requests/i.test(err) || r.status === 429) { await new Promise((ok) => setTimeout(ok, 2500 * (essai + 1))); continue; }
      if (!j || !Array.isArray(j.response)) { await new Promise((ok) => setTimeout(ok, 1000)); continue; }
      return j.response;
    }
    return null;
  }
  return { get: get, restant: () => etat.restant, appels: () => etat.appels };
}

// ---------------------------------------------------------------------------- base (Supabase, cle de service du robot)
function base(url, cleService, f) {
  f = f || fetch;
  const racine = String(url).replace(/\/$/, "") + "/rest/v1/";
  const H = { apikey: cleService, Authorization: "Bearer " + cleService, "Content-Type": "application/json" };
  async function lire(table, filtres, colonnes) {
    const out = [];
    for (let de = 0; ; de += 1000) {
      const r = await f(racine + table + "?select=" + (colonnes || "*") + (filtres ? "&" + filtres : ""), { headers: Object.assign({ Range: de + "-" + (de + 999), "Range-Unit": "items" }, H) });
      if (!r.ok) throw new Error(table + " " + r.status);
      const j = await r.json();
      out.push.apply(out, j);
      if (j.length < 1000) return out;
    }
  }
  async function ecrire(table, lignes, cle) {
    for (let i = 0; i < lignes.length; i += 200) {
      const r = await f(racine + table + "?on_conflict=" + cle, { method: "POST", headers: Object.assign({ Prefer: "resolution=merge-duplicates,return=minimal" }, H), body: JSON.stringify(lignes.slice(i, i + 200)) });
      if (!r.ok) throw new Error(table + " ecriture " + r.status);
    }
  }
  return { lire: lire, ecrire: ecrire };
}
// Magasin sur la base : scenario_matchs (un match = une ligne, ecrit une fois) et scenario_equipes (date du dernier releve).
function magasinBase(db) {
  const vues = new Map();
  return {
    async chargerEquipes(equipes) {
      for (let i = 0; i < equipes.length; i += 150) (await db.lire("scenario_equipes", "equipe=in.(" + equipes.slice(i, i + 150).join(",") + ")", "equipe,vu_le")).forEach((x) => vues.set(x.equipe, Date.parse(x.vu_le)));
    },
    async manquants(ids) {
      const la = new Set();
      for (let i = 0; i < ids.length; i += 150) (await db.lire("scenario_matchs", "id=in.(" + ids.slice(i, i + 150).join(",") + ")", "id")).forEach((x) => la.add(Number(x.id)));
      return ids.filter((id) => !la.has(Number(id)));
    },
    async ajouter(lignes) { if (lignes.length) await db.ecrire("scenario_matchs", lignes.map(versTable), "id"); },
    equipeVue: (t) => vues.get(t) || null,
    _aNoter: [],
    noterEquipe(t, ms) { vues.set(t, ms); this._aNoter.push({ equipe: t, vu_le: new Date(ms).toISOString() }); },
    async enregistrerEquipes() { const l = this._aNoter.splice(0); if (l.length) await db.ecrire("scenario_equipes", l, "equipe"); },
    // Matchs (lignes courtes) des equipes donnees, depuis « depuisIso ».
    async matchsDesEquipes(equipes, depuisIso) {
      const par = new Map();
      for (let i = 0; i < equipes.length; i += 60) {
        const l = equipes.slice(i, i + 60).join(",");
        (await db.lire("scenario_matchs", "or=(dom.in.(" + l + "),ext.in.(" + l + "))&joue_le=gte." + encodeURIComponent(depuisIso) + "&order=id", "donnees")).forEach((x) => { if (x.donnees && x.donnees.id != null) par.set(x.donnees.id, x.donnees); });
      }
      return [...par.values()];
    },
    async matchsDesArbitres(arbitres, depuisIso) {
      const out = [];
      for (let i = 0; i < arbitres.length; i += 30) {
        const l = arbitres.slice(i, i + 30).map((a) => '"' + String(a).replace(/"/g, "") + '"').join(",");
        (await db.lire("scenario_matchs", "arbitre=in.(" + encodeURIComponent(l) + ")&joue_le=gte." + encodeURIComponent(depuisIso) + "&order=id", "donnees")).forEach((x) => { if (x.donnees) out.push(x.donnees); });
      }
      return out;
    },
  };
}
// Ligne courte <-> ligne de la table scenario_matchs.
function versTable(L) { return { id: L.id, joue_le: L.d, ligue: L.lg, saison: L.sa, dom: L.h, ext: L.a, arbitre: L.ref, statut: L.st, donnees: L }; }

// ---------------------------------------------------------------------------- collecte
// Complete le magasin pour une liste d'equipes : leurs N derniers matchs finis, toutes competitions.
// magasin : { a(id) -> bool OU manquants([ids]) -> ids absents, ajouter([lignes]), equipeVue(id) -> ms ou null,
// noterEquipe(id, ms) } ; api : client().
// -> { equipes, matchs_nouveaux, appels, arrete_quota }. Jamais deux fois le meme match : un id deja en magasin n'est pas redemande.
async function collecterEquipes(api, magasin, equipes, opts) {
  opts = opts || {};
  const N = opts.derniers || 22, fraicheurMs = (opts.fraicheurH != null ? opts.fraicheurH : 20) * 3600e3, maintenant = opts.maintenant || Date.now();
  const rapport = { equipes: 0, matchs_nouveaux: 0, arrete_quota: false, arrete_budget: false, adversaires: new Set() };
  const fin = opts.finMs || Infinity; // budget de temps du calcul du matin : au-dela, on fait avec ce qu'on a
  const aChercher = new Set();
  const lots = async (liste, n, fn) => { for (let i = 0; i < liste.length; i += n) await Promise.all(liste.slice(i, i + n).map(fn)); };
  try {
    await lots([...new Set(equipes)].filter((t) => { const v = magasin.equipeVue(t); return !(v && maintenant - v < fraicheurMs); }), 6, async (t) => {
      if (Date.now() > fin) { rapport.arrete_budget = true; return; }
      const r = await api.get("/fixtures?team=" + t + "&last=" + N);
      if (!r) return;
      r.forEach((fx) => {
        if (!fx || !fx.fixture || !fx.fixture.status || !FINIS[fx.fixture.status.short]) return;
        aChercher.add(fx.fixture.id);
        const adv = fx.teams.home.id === t ? fx.teams.away.id : fx.teams.home.id;
        rapport.adversaires.add(adv);
      });
      magasin.noterEquipe(t, maintenant);
      rapport.equipes++;
    });
  } catch (e) { if (!e.quota) throw e; rapport.arrete_quota = true; }
  const r2 = await collecterMatchs(api, magasin, [...aChercher], opts);
  rapport.matchs_nouveaux = r2.matchs_nouveaux;
  rapport.arrete_quota = rapport.arrete_quota || r2.arrete_quota;
  return rapport;
}
async function collecterMatchs(api, magasin, ids, opts) {
  const rapport = { matchs_nouveaux: 0, arrete_quota: false, arrete_budget: false };
  const fin = (opts && opts.finMs) || Infinity;
  // manquants (base) : une requete par paquet d'identifiants ; a (fichier local) : en memoire.
  const uniques = [...new Set(ids)];
  const manque = magasin.manquants ? await magasin.manquants(uniques) : uniques.filter((id) => !magasin.a(id));
  const paquets = [];
  for (let i = 0; i < manque.length; i += 20) paquets.push(manque.slice(i, i + 20));
  try {
    for (let i = 0; i < paquets.length; i += 4) {
      if (Date.now() > fin) { rapport.arrete_budget = true; break; }
      await Promise.all(paquets.slice(i, i + 4).map(async (p) => {
        const r = await api.get("/fixtures?ids=" + p.join("-"));
        if (!r) return;
        const lignes = r.map(compacter).filter(Boolean);
        await magasin.ajouter(lignes);
        rapport.matchs_nouveaux += lignes.length;
      }));
    }
  } catch (e) { if (!e.quota) throw e; rapport.arrete_quota = true; }
  return rapport;
}

module.exports = { QUOTA_PLANCHER, FINIS, COLONNES, compacter, nomArbitre, client, base, magasinBase, versTable, collecterEquipes, collecterMatchs };
