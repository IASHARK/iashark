// IASHARK — fonction Edge scores-direct (06/11/2026).
// Scores en direct des matchs du site (accueil, page combines). Public : un score n'est pas un pari.
//  - UN appel API-Sports « fixtures?date=<jour de Paris> » au plus toutes les 60 s pour TOUT le site, quel que soit
//    le nombre de visiteurs (cache public.scores_direct, migration 0064, verrou de 60 s contre les appels en double, pause sous 1 500 appels restants) ;
//    avant 4 h a Paris, la veille aussi (matchs commences avant minuit).
//  - La cle API-Sports reste ici (secret APISPORTS_KEY) : jamais envoyee au navigateur.
//  - Le navigateur envoie les numeros de match qu'il affiche (120 au plus, chiffres seulement) et ne recoit QUE ceux-la.
//  - Si API-Sports refuse ou ne repond pas : on renvoie le dernier etat connu, jamais un score invente.
// Reponse : { version: 1, maj, scores: { "<id>": { h, a, st, min, mt: [h, a] | null } } }
//   h / a : buts domicile / exterieur (null avant le coup d'envoi) ; st : statut court API-Sports (NS, 1H, HT, 2H, ET,
//   P, FT, AET, PEN, PST, CANC...) ; min : minute jouee ; mt : score a la mi-temps.
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CLE = Deno.env.get("APISPORTS_KEY") || Deno.env.get("API_FOOTBALL_KEY") || "";
const FRAIS_MS = 60_000;
const VERROU_MS = 60_000;
// Reserve du quota API-Sports (partage avec le robot du site) : sous ce nombre d'appels restants, plus aucun appel.
const RESERVE = 1500;
let bloqueJusqua = 0;
let pauseDemandee = false;
const MAX_IDS = 120;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(corps: unknown, statut = 200, cache = "public, max-age=30") {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": cache } });
}

function partiesParis(ms: number) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms));
  const v = (t: string) => p.find((x) => x.type === t)?.value || "";
  return { jour: v("year") + "-" + v("month") + "-" + v("day"), heure: Number(v("hour")) };
}
function veille(jour: string) {
  const d = new Date(jour + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function lireIds(req: Request): Promise<string[]> {
  const url = new URL(req.url);
  let brut: unknown = url.searchParams.get("ids");
  if (req.method === "POST") {
    try { const b = await req.json(); if (b && typeof b === "object" && "ids" in b) brut = (b as Record<string, unknown>).ids; } catch (_e) { /* corps vide */ }
  }
  const liste = Array.isArray(brut) ? brut : String(brut || "").split(",");
  const vus = new Set<string>();
  for (const x of liste) {
    const s = String(x).trim();
    if (/^\d{1,12}$/.test(s)) vus.add(s);
    if (vus.size >= MAX_IDS) break;
  }
  return [...vus];
}

type Score = { h: number | null; a: number | null; st: string; min: number | null; mt: [number, number] | null };
function nb(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }

// Un jour de matchs chez API-Sports -> { id: Score }. null si refus ou panne (on garde alors l'ancien etat).
async function lireApi(jour: string): Promise<Record<string, Score> | null> {
  if (!CLE) return null;
  try {
    if (Date.now() < bloqueJusqua) return null;
    const r = await fetch("https://v3.football.api-sports.io/fixtures?date=" + jour + "&timezone=Europe/Paris", { headers: { "x-apisports-key": CLE } });
    if (!r.ok) { console.error("API-Sports HTTP", r.status); return null; }
    const reste = Number(r.headers.get("x-ratelimit-requests-remaining"));
    if (Number.isFinite(reste) && reste < RESERVE) {
      console.error("API-Sports : reserve du quota atteinte (" + reste + " appels restants), scores en pause 30 min");
      bloqueJusqua = Date.now() + 30 * 60_000;
      pauseDemandee = true;
    }
    const corps = await r.json();
    const err = corps && corps.errors;
    if (err && (Array.isArray(err) ? err.length : Object.keys(err).length)) { console.error("API-Sports refus:", JSON.stringify(err).slice(0, 200)); return null; }
    const out: Record<string, Score> = {};
    for (const f of Array.isArray(corps.response) ? corps.response : []) {
      const id = f && f.fixture && f.fixture.id;
      if (!/^\d{1,12}$/.test(String(id))) continue;
      const st = String(f.fixture.status && f.fixture.status.short || "");
      const ht = f.score && f.score.halftime;
      const mtH = nb(ht && ht.home), mtA = nb(ht && ht.away);
      out[String(id)] = {
        h: nb(f.goals && f.goals.home), a: nb(f.goals && f.goals.away), st,
        min: nb(f.fixture.status && f.fixture.status.elapsed),
        mt: mtH !== null && mtA !== null ? [mtH, mtA] : null,
      };
    }
    return out;
  } catch (e) {
    console.error("API-Sports injoignable:", String(e));
    return null;
  }
}

// Scores d'un jour : le cache s'il a moins de 60 s ; sinon UN SEUL appelant (verrou) relit API-Sports.
async function scoresDu(jour: string): Promise<{ scores: Record<string, Score>; maj: string | null }> {
  const lu = await supabase.from("scores_direct").select("donnees,maj,essai").eq("jour", jour).maybeSingle();
  const ligne = lu.data as { donnees: Record<string, Score>; maj: string | null; essai: string | null } | null;
  const maintenant = Date.now();
  if (ligne && ligne.maj && maintenant - Date.parse(ligne.maj) < FRAIS_MS) return { scores: ligne.donnees || {}, maj: ligne.maj };
  if (!ligne) await supabase.from("scores_direct").upsert({ jour, donnees: {}, maj: null, essai: null }, { onConflict: "jour", ignoreDuplicates: true });
  const limite = new Date(maintenant - VERROU_MS).toISOString();
  const pris = await supabase.from("scores_direct").update({ essai: new Date(maintenant).toISOString() })
    .eq("jour", jour).or("essai.is.null,essai.lt." + limite).select("jour");
  if (!pris.data || !pris.data.length) return { scores: (ligne && ligne.donnees) || {}, maj: ligne ? ligne.maj : null };
  const frais = await lireApi(jour);
  // Reserve atteinte : la pause est ecrite en base (verrou date dans 30 min), valable pour toutes les instances.
  if (pauseDemandee) { pauseDemandee = false; await supabase.from("scores_direct").update({ essai: new Date(Date.now() + 30 * 60_000).toISOString() }).eq("jour", jour); }
  if (!frais) return { scores: (ligne && ligne.donnees) || {}, maj: ligne ? ligne.maj : null };
  const maj = new Date().toISOString();
  await supabase.from("scores_direct").update({ donnees: frais, maj }).eq("jour", jour);
  return { scores: frais, maj };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "methode" }, 405, "no-store");
  const ids = await lireIds(req);
  if (!CLE) { console.error("APISPORTS_KEY absente"); return json({ version: 1, maj: null, scores: {}, indisponible: true }, 200, "no-store"); }
  const { jour, heure } = partiesParis(Date.now());
  const jours = heure < 4 ? [veille(jour), jour] : [jour];
  const scores: Record<string, Score> = {};
  let maj: string | null = null;
  for (const j of jours) {
    const r = await scoresDu(j);
    if (r.maj && (!maj || r.maj > maj)) maj = r.maj;
    for (const id of ids) if (r.scores[id]) scores[id] = r.scores[id];
  }
  return json({ version: 1, maj, scores });
});
