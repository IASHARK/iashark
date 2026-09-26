#!/usr/bin/env node
// Prepare les donnees des videos quotidiennes : Safe (+ Combine en option) et
// une video par match analyse (moitie Match simule, moitie Match Pulse) a partir de data.json (public) et de match_premium_data
// (Supabase, analyses completes). Ecrit un fichier de props par video et un
// manifest.json que le workflow daily-videos.yml rend puis envoie sur Telegram.
//
//   node scripts/videos/build-daily-videos.mjs --out <dossier> [--date AAAA-MM-JJ]
//        [--premium-file rows.json]   (tests en local, sans cle Supabase)
//
// Aucune cote ni aucun pourcentage n'apparait dans les videos Safe et Combine :
// ils servent uniquement a choisir les selections.

import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.resolve(args.out || path.join(REPO, "remotion-score-template/out/daily"));

// ---------- Dates (heure de Paris) ----------
const parisDate = (d = new Date()) => new Intl.DateTimeFormat("fr-CA", {timeZone: "Europe/Paris"}).format(d);
const TODAY = args.date || parisDate();
const MOIS = ["JANV.", "FÉVR.", "MARS", "AVRIL", "MAI", "JUIN", "JUIL.", "AOÛT", "SEPT.", "OCT.", "NOV.", "DÉC."];
const MOIS_LONG = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];
const [, mm, dd] = TODAY.split("-").map(Number);
const dayLabel = `${String(dd).padStart(2, "0")} ${MOIS_LONG[mm - 1]}`;
// data.json : "AAAA-MM-JJ HH:MM" en heure de Paris
const kickoffParis = (m) => String(m.date || "");
const hourOf = (m) => kickoffParis(m).slice(11, 16).replace(":", "H");

// ---------- Priorite des competitions (le plus gros match du jour) ----------
const LEAGUE_PRIORITY = [
  /champions league/i, /premier league$/i, /^la liga/i, /^serie a/i, /bundesliga/i, /ligue 1/i,
  /world cup|coupe du monde|euro championship|^euro\b/i, /nations league/i, /europa league/i,
  /conference league/i, /eredivisie/i, /liga portugal|primeira liga/i, /friendlies|amicaux/i,
  /liga mx/i, /major league soccer|^mls/i, /liga profesional|argentin/i, /j1 league/i,
];
const leagueRank = (m) => {
  const i = LEAGUE_PRIORITY.findIndex((re) => re.test(m.league || ""));
  return i === -1 ? LEAGUE_PRIORITY.length : i;
};
const COMPET_LABEL = (league) => String(league || "").toUpperCase()
  .replace("UEFA ", "").replace("NATIONS LEAGUE", "LIGUE DES NATIONS").replace("CHAMPIONS LEAGUE", "LIGUE DES CHAMPIONS")
  .replace("EUROPA LEAGUE", "LIGUE EUROPA").replace("CONFERENCE LEAGUE", "LIGUE CONFÉRENCE").replace("MAJOR LEAGUE SOCCER", "MLS");

// ---------- Libelles de paris lisibles ----------
const num = (s) => s.replace("_", ",").replace(".", ",");
function pickLabel(id, market, home, away) {
  const fixed = {
    "home-win": `${home} gagne`, "away-win": `${away} gagne`, "draw": "Match nul",
    "dc-1x": `${home} ou match nul`, "dc-x2": `${away} ou match nul`, "dc-12": "Pas de match nul",
    "btts-yes": "Les deux équipes marquent", "btts-no": "Une équipe ne marque pas",
    "fh-over-05": "Au moins 1 but en 1re mi-temps", "fh-under-15": "Moins de 2 buts en 1re mi-temps",
    "home-team-under-15": `${home} marque moins de 2 buts`, "away-team-under-15": `${away} marque moins de 2 buts`,
    "home-team-over-15": `${home} marque 2 buts ou plus`, "away-team-over-15": `${away} marque 2 buts ou plus`,
    "home-team-over-05": `${home} marque`, "away-team-over-05": `${away} marque`,
  };
  if (fixed[id]) return fixed[id];
  let r;
  if ((r = /^(over|under)-(\d)(\d)$/.exec(id))) return `${r[1] === "over" ? "Plus" : "Moins"} de ${r[2]},${r[3]} buts`;
  if ((r = /^total-shots-on-target-(over|under)-([\d_]+)$/.exec(id))) return `${r[1] === "over" ? "Plus" : "Moins"} de ${num(r[2])} tirs cadrés`;
  if ((r = /^total-shots-(over|under)-([\d_]+)$/.exec(id))) return `${r[1] === "over" ? "Plus" : "Moins"} de ${num(r[2])} tirs`;
  return String(market || id).replace(/\bDomicile\b/g, home).replace(/\bExterieur\b/g, away).replace(/(\d)\.(\d)/g, "$1,$2");
}

// ---------- Chargement ----------
const data = JSON.parse(fs.readFileSync(args.data || path.join(REPO, "data.json"), "utf8"));
const nowParis = `${parisDate()} ${new Intl.DateTimeFormat("fr-FR", {timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit"}).format(new Date())}`;
let matches = (data.matchs || []).filter((m) => m.sport === "football" && kickoffParis(m).startsWith(TODAY));
if (!args.date) matches = matches.filter((m) => kickoffParis(m) > nowParis);

async function loadPremium(ids) {
  if (args["premium-file"]) return JSON.parse(fs.readFileSync(args["premium-file"], "utf8"));
  const {SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY} = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
  if (!ids.length) return [];
  const url = `${SUPABASE_URL}/rest/v1/match_premium_data?select=fixture_id,pari_rec,cote_rec,model_probability,market_id,markets_compared,premium_fields&fixture_id=in.(${ids.join(",")})`;
  const res = await fetch(url, {headers: {apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`}});
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

const premiumRows = await loadPremium(matches.map((m) => m.id));
const premiumById = new Map(premiumRows.map((r) => [String(r.fixture_id), r]));
const pool = matches
  .map((m) => ({m, p: premiumById.get(String(m.id))}))
  .filter(({p}) => p && Array.isArray(p.markets_compared) && p.markets_compared.length);

// data.json donne les noms en anglais : selections nationales traduites
const PAYS = {
  England: "Angleterre", Spain: "Espagne", Germany: "Allemagne", Italy: "Italie", Netherlands: "Pays-Bas", Belgium: "Belgique",
  Switzerland: "Suisse", Austria: "Autriche", Croatia: "Croatie", Czechia: "Tchéquie", "Czech Republic": "Tchéquie", Slovakia: "Slovaquie",
  Slovenia: "Slovénie", Poland: "Pologne", Hungary: "Hongrie", Romania: "Roumanie", Bulgaria: "Bulgarie", Greece: "Grèce",
  Turkey: "Turquie", "Türkiye": "Turquie", Denmark: "Danemark", Sweden: "Suède", Norway: "Norvège", Finland: "Finlande",
  Iceland: "Islande", Estonia: "Estonie", Latvia: "Lettonie", Lithuania: "Lituanie", Ireland: "Irlande", "Northern Ireland": "Irlande du Nord",
  Scotland: "Écosse", Wales: "Pays de Galles", Albania: "Albanie", Serbia: "Serbie", Montenegro: "Monténégro", "North Macedonia": "Macédoine du Nord", "FYR Macedonia": "Macédoine du Nord",
  "Bosnia & Herzegovina": "Bosnie", "Bosnia and Herzegovina": "Bosnie", Kosovo: "Kosovo", Moldova: "Moldavie", Ukraine: "Ukraine",
  Belarus: "Biélorussie", Georgia: "Géorgie", Armenia: "Arménie", Azerbaijan: "Azerbaïdjan", Kazakhstan: "Kazakhstan", Cyprus: "Chypre",
  Malta: "Malte", Luxembourg: "Luxembourg", Andorra: "Andorre", "San Marino": "Saint-Marin", "Faroe Islands": "Îles Féroé",
  Gibraltar: "Gibraltar", Liechtenstein: "Liechtenstein", Israel: "Israël", Portugal: "Portugal", France: "France",
  Brazil: "Brésil", Argentina: "Argentine", Mexico: "Mexique", USA: "États-Unis", "United States": "États-Unis", Morocco: "Maroc",
  Algeria: "Algérie", Tunisia: "Tunisie", Senegal: "Sénégal", Egypt: "Égypte", Japan: "Japon", "South Korea": "Corée du Sud",
};
const shortName = (n) => PAYS[n] || String(n).replace(/^Paris Saint Germain$/, "PSG").replace(/^Manchester United$/, "Man United").replace(/^Manchester City$/, "Man City");
const teamLogo = (t) => `https://media.api-sports.io/football/teams/${t.id}.png`;
const reliabilityOk = (p) => !/faible/i.test(p.premium_fields?.reliability?.label || "");

// ---------- SAFE : les 3 pronos du site les plus surs ----------
// Uniquement le prono affiche sur le site pour chaque match (pari_rec), pour
// que la video dise exactement la meme chose que la page du match. Garde ceux
// ou le modele ET le marche donnent au moins 62 % ; score = la plus basse des
// deux probas ; les 3 meilleurs matchs.
const recEntry = (p) => p.markets_compared.find((x) => x.id === p.market_id);
function buildSafe() {
  const cands = [];
  for (const {m, p} of pool) {
    if (!reliabilityOk(p) || !p.pari_rec) continue;
    const e = recEntry(p);
    const prob = Number(p.model_probability), cons = Number(e?.consensus ?? prob);
    if (!(prob >= 62 && cons >= 62)) continue;
    cands.push({m, id: p.market_id, market: p.pari_rec, score: Math.min(prob, cons)});
  }
  cands.sort((a, b) => b.score - a.score || leagueRank(a.m) - leagueRank(b.m));
  const legs = cands.slice(0, 3).sort((a, b) => kickoffParis(a.m).localeCompare(kickoffParis(b.m)));
  return legs.length === 3 ? legs : null;
}

// ---------- COMBINE COTE 10 : calcul a part ----------
// N'importe quel marche compare du match (1N2, double chance, buts, les deux
// marquent...), a condition d'avoir la vraie cote du bookmaker dans data.json.
// Une seule selection par match (pas de correlation). Proba d'une selection =
// la plus prudente entre modele et marche. On cherche la combinaison qui atteint
// une cote totale >= 10 avec la plus forte proba de passer (sac a dos a choix
// multiples sur log(cote), programmation dynamique). Hors matchs du Safe.
const COMBO_TARGET = 10, COMBO_MAX_LEGS = 6;
const ODDS_FIELD = {"home-win": "c1", "draw": "cn", "away-win": "c2", "dc-1x": "dc1x", "dc-x2": "dc2x", "dc-12": "dc12",
  "over-15": "co15", "over-25": "co25", "under-25": "cu25", "over-35": "co35", "btts-yes": "btts_oui", "btts-no": "btts_non"};
function buildCombo(excluded) {
  const STEP = 0.02, TARGET = Math.ceil(Math.log(COMBO_TARGET) / STEP);
  const options = [];
  for (const {m, p} of pool) {
    if (excluded.has(m.id) || !reliabilityOk(p)) continue;
    const legs = [];
    for (const e of p.markets_compared) {
      const cote = Number(String(m[ODDS_FIELD[e.id]] ?? "").replace(",", "."));
      const prob = Math.min(Number(e.probability), Number(e.consensus)) / 100;
      if (!(cote >= 1.12 && cote <= 3.2 && prob >= 0.4)) continue;
      if (Number(e.probability) < Number(e.consensus) - 3) continue; // le modele ne doit pas etre nettement contre
      legs.push({m, id: e.id, market: e.market, cote, prob, w: Math.round(Math.log(cote) / STEP), v: Math.log(prob)});
    }
    if (legs.length) options.push(legs);
  }
  // dp[k][w] = meilleure somme de log(proba) avec k selections et une cote (en pas) w (plafonnee a TARGET)
  let dp = Array.from({length: COMBO_MAX_LEGS + 1}, () => new Map());
  dp[0].set(0, {v: 0, legs: []});
  for (const legs of options) {
    const next = dp.map((mp) => new Map(mp));
    for (let k = 0; k < COMBO_MAX_LEGS; k++) for (const [w, st] of dp[k]) for (const l of legs) {
      const nw = Math.min(TARGET, w + l.w), nv = st.v + l.v, cur = next[k + 1].get(nw);
      if (!cur || nv > cur.v) next[k + 1].set(nw, {v: nv, legs: [...st.legs, l]});
    }
    dp = next;
  }
  let best = null;
  for (let k = 2; k <= COMBO_MAX_LEGS; k++) {
    const st = dp[k].get(TARGET);
    if (st && (!best || st.v > best.v)) best = st;
  }
  if (!best) return null;
  const cote = best.legs.reduce((x, l) => x * l.cote, 1);
  if (cote < COMBO_TARGET) return null;
  const legs = [...best.legs].sort((a, b) => kickoffParis(a.m).localeCompare(kickoffParis(b.m)));
  return {legs, cote, prob: Math.exp(best.v)};
}

const ticketProps = (title, legs) => ({
  title,
  dateLabel: `SÉLECTION DU ${dayLabel}`,
  legs: legs.map((l) => ({
    home: shortName(l.m.home.n), away: shortName(l.m.away.n),
    pick: pickLabel(l.id, l.market, shortName(l.m.home.n), shortName(l.m.away.n)),
    kickoff: hourOf(l.m),
  })),
});

// ---------- Scenario simule (Match simule + Match Pulse) ----------
const DEFAULT_SHARES = [13, 14, 16, 17, 18, 22]; // repartition moyenne des buts par quart d'heure
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function shares(p) {
  const s = p.premium_fields?.scenario_15min;
  if (Array.isArray(s) && s.length === 6 && s.every((x) => Number(x.prob) > 0)) {
    const tot = s.reduce((a, x) => a + Number(x.prob), 0);
    return s.map((x) => Math.round(Number(x.prob) / tot * 100));
  }
  return DEFAULT_SHARES;
}
function simulateGoals({m, p}) {
  const pf = p.premium_fields || {};
  const top = (pf.mc_scores || [])[0];
  const [h, a] = top ? top.score.split("-").map(Number) : [Math.round(pf.lambda_h || 1), Math.round(pf.lambda_a || 1)];
  const sh = shares(p), rand = rng(Number(m.id));
  const minuteFor = () => {
    let x = rand() * sh.reduce((s, v) => s + v, 0), b = 0;
    while (x > sh[b] && b < 5) x -= sh[b++];
    return Math.min(90, b * 15 + 1 + Math.floor(rand() * 15));
  };
  const scorers = (side) => (pf.top_scorers || []).filter((s) => s.team_id === (side === "home" ? m.home.id : m.away.id));
  const pickScorer = (side) => {
    const list = scorers(side);
    if (!list.length) return "";
    const tot = list.reduce((s, x) => s + (x.goals || 1), 0);
    let r = rand() * tot;
    for (const x of list) if ((r -= x.goals || 1) <= 0) return x.name;
    return list[0].name;
  };
  const goals = [];
  for (let i = 0; i < h; i++) goals.push({minute: minuteFor(), player: pickScorer("home"), side: "home"});
  for (let i = 0; i < a; i++) goals.push({minute: minuteFor(), player: pickScorer("away"), side: "away"});
  // deux buts a la meme minute : on decale
  goals.sort((x, y) => x.minute - y.minute);
  for (let i = 1; i < goals.length; i++) if (goals[i].minute <= goals[i - 1].minute) goals[i].minute = Math.min(90, goals[i - 1].minute + 1);
  return {goals, simulationCount: Number(pf.simulation_count) || 5000};
}

function matchCardProps(entry) {
  const {m} = entry;
  const {goals, simulationCount} = simulateGoals(entry);
  return {homeTeam: shortName(m.home.n), awayTeam: shortName(m.away.n), homeLogo: teamLogo(m.home), awayLogo: teamLogo(m.away), goals, accentColor: "#08d9ff", simulationCount};
}

// Commentaire par quart d'heure, ecrit a partir des parts de buts
// Phrases variees par quart d'heure : choisies selon le danger de la periode
// (rang 0 = la plus chargee en buts), le moment du match et l'equipe qui domine.
// Tirage fixe par match (meme video si on relance), jamais deux fois le meme titre.
const PHRASES = {
  peak: {
    titles: ["LE DANGER EXPLOSE", "ALERTE ROUGE", "LE MOMENT CLÉ", "TOUT PEUT BASCULER", "ÇA VA FAIRE MAL", "LA MINUTE DE VÉRITÉ"],
    notes: ["LA MEILLEURE FENÊTRE POUR UN BUT DANS CE MATCH", "LE QUART D'HEURE LE PLUS CHAUD SELON L'IA", "C'EST ICI QUE LES BUTS TOMBENT LE PLUS"],
  },
  high: {
    titles: ["{S} MET LE FEU", "{S} APPUIE FORT", "LE MATCH S'EMBALLE", "ÇA S'ACCÉLÈRE", "LES FILETS TREMBLENT"],
    notes: ["{W} VA DEVOIR TENIR LE CHOC", "LES OCCASIONS SE MULTIPLIENT", "UN BUT PEUT TOMBER À TOUT MOMENT"],
  },
  mid: {
    titles: ["{S} PREND LA MAIN", "BRAS DE FER", "PARTIE D'ÉCHECS", "LA TENSION MONTE", "ON SE JAUGE ENCORE", "DUEL AU SOMMET"],
    notes: ["{W} RECULE MAIS RESTE DANS LE MATCH", "PERSONNE NE LÂCHE RIEN", "LE PREMIER QUI CRAQUE PERD GROS"],
  },
  low: {
    titles: ["LE MATCH SE REFERME", "TEMPS FAIBLE", "ON RESPIRE UN PEU", "LE CALME AVANT LA TEMPÊTE", "VERROUILLAGE TOTAL"],
    notes: ["LA PÉRIODE LA MOINS CHARGÉE EN BUTS", "LES DÉFENSES REPRENNENT LA MAIN", "PEU D'ESPACES, PEU D'OCCASIONS"],
  },
};
const MOMENT = {
  0: {hot: ["DÉPART SOUS TENSION", "COUP D'ENVOI BRÛLANT"], cold: ["DÉBUT PRUDENT", "ON SE REGARDE"]},
  3: {hot: ["RETOUR DES VESTIAIRES EN FEU", "LA REPRISE PEUT TOUT CHANGER"], cold: ["REPRISE AU RALENTI"]},
  5: {hot: ["FIN DE MATCH FOLLE", "LE FINISH DÉCISIF", "TOUT SE JOUE MAINTENANT"], cold: ["FIN DE MATCH CONTRÔLÉE"]},
};
function makePhaseTexts(sh, balance, home, away, seed) {
  const rand = rng(seed * 7 + 3);
  const strong = balance >= 55 ? home : balance <= 45 ? away : null;
  const weak = balance >= 55 ? away : balance <= 45 ? home : null;
  const fill = (t) => (strong ? t.replace("{S}", strong).replace("{W}", weak) : t).toUpperCase();
  const pick = (arr, used) => {
    const free = arr.filter((x) => !used.has(fill(x)));
    const list = free.length ? free : arr;
    return list[Math.floor(rand() * list.length)];
  };
  const neutral = (arr) => (strong ? arr : arr.filter((t) => !t.includes("{")));
  const order = sh.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).map(([, i]) => i);
  const usedT = new Set(), usedN = new Set();
  return sh.map((share, i) => {
    const rank = order.indexOf(i);
    const tier = rank === 0 ? "peak" : rank === 1 ? "high" : rank >= 4 ? "low" : "mid";
    const level = {peak: "PIC DE DANGER", high: "ZONE À SURVEILLER", mid: "DANGER MODÉRÉ", low: "RYTHME PLUS BAS"}[tier];
    const moment = MOMENT[i] && (rank <= 2 ? MOMENT[i].hot : MOMENT[i].cold);
    const title = fill(moment && rand() < 0.6 ? pick(moment, usedT) : pick(neutral(PHRASES[tier].titles), usedT));
    const note = fill(pick(neutral(PHRASES[tier].notes), usedN));
    usedT.add(title); usedN.add(note);
    return {level, title, note};
  });
}

function matchPulseProps(entry) {
  const {m, p} = entry;
  const pf = p.premium_fields || {};
  const lh = Number(pf.lambda_h) || 1.3, la = Number(pf.lambda_a) || 1.1;
  const sh = shares(p), max = Math.max(...sh);
  const balance = Math.round(lh / (lh + la) * 100);
  const home = shortName(m.home.n), away = shortName(m.away.n);
  const labels = ["0–15", "15–30", "30–45", "45–60", "60–75", "75–90"];
  const texts = makePhaseTexts(sh, balance, home, away, Number(m.id));
  const phases = sh.map((share, i) => {
    const lvl = Math.max(1, Math.min(5, Math.round(share / max * 5)));
    return {label: labels[i], share, ...texts[i], pressure: lvl, shots: Math.max(1, lvl - (i % 2)), rhythm: lvl, balance};
  });
  let ch = 0, ca = 0;
  const homeXg = [], awayXg = [];
  sh.forEach((s) => { ch += lh * s / 100; ca += la * s / 100; homeXg.push(+ch.toFixed(2)); awayXg.push(+ca.toFixed(2)); });
  const {goals} = simulateGoals(entry);
  return {
    homeName: home, awayName: away, homeLogo: teamLogo(m.home), awayLogo: teamLogo(m.away),
    competition: `${COMPET_LABEL(m.league)} • ${dd} ${MOIS[mm - 1]} • ${kickoffParis(m).slice(11, 16)}`,
    showVs: true, showCommentary: true, goals: goals.map((g) => ({minute: g.minute})), homeXg, awayXg, phases,
  };
}

// ---------- Assemblage ----------
fs.mkdirSync(OUT, {recursive: true});
const videos = [];
const write = (slug, composition, props, caption) => {
  const file = path.join(OUT, `props-${slug}.json`);
  fs.writeFileSync(file, JSON.stringify(props, null, 2));
  videos.push({slug, composition, props: file, output: path.join(OUT, `${TODAY}-${slug}.mp4`), caption});
};
const legLine = (l) => `• ${l.home} – ${l.away} (${l.kickoff}) : ${l.pick}`;

const safe = buildSafe();
if (safe) {
  const props = ticketProps("SAFE", safe);
  write("safe", "DailySafe", props, `SAFE du ${dayLabel.toLowerCase()}\n${props.legs.map(legLine).join("\n")}`);
}
// Combine mis de cote pour l'instant : seulement avec --combine
const combo = args.combine ? buildCombo(new Set((safe || []).map((l) => l.m.id))) : null;
if (combo) {
  const props = {...ticketProps("COMBINÉ", combo.legs), badge: `OBJECTIF @${COMBO_TARGET}`};
  const pct = (combo.prob * 100).toFixed(1).replace(".", ",");
  write("combine", "DailyCombo", props, `COMBINÉ @${COMBO_TARGET} du ${dayLabel.toLowerCase()} — cote totale ${combo.cote.toFixed(2).replace(".", ",")}, environ ${pct} % de chances selon le modèle\n${props.legs.map(legLine).join("\n")}`);
}
// ---------- Une video par match analyse ----------
// Tous les matchs du jour ont leur video. La moitie la plus riche en buts
// (score simule le plus frequent) passe en « Match simule », le reste en
// « Match Pulse ». Ex. 15 matchs : 7 Match simule + 8 Match Pulse.
const goalsOf = ({p}) => {
  const top = (p.premium_fields?.mc_scores || [])[0];
  return top ? top.score.split("-").reduce((a, x) => a + Number(x), 0) : 0;
};
const byGoals = [...pool].sort((a, b) => goalsOf(b) - goalsOf(a) || leagueRank(a.m) - leagueRank(b.m));
const simuleSet = new Set(byGoals.slice(0, Math.floor(pool.length / 2)).filter((e) => goalsOf(e) >= 1));
const byKickoff = [...pool].sort((a, b) => kickoffParis(a.m).localeCompare(kickoffParis(b.m)) || leagueRank(a.m) - leagueRank(b.m));
for (const e of byKickoff) {
  if (simuleSet.has(e)) {
    const props = matchCardProps(e);
    const h = props.goals.filter((g) => g.side === "home").length, a = props.goals.length - h;
    write(`simule-${e.m.id}`, "DailyMatchSimule", props, `Match simulé : ${props.homeTeam} ${h}-${a} ${props.awayTeam} (${hourOf(e.m)}, score le plus fréquent sur ${props.simulationCount} simulations)`);
  } else {
    const props = matchPulseProps(e);
    write(`pulse-${e.m.id}`, "DailyMatchPulse", props, `Match Pulse : ${props.homeName} – ${props.awayName} (${props.competition})`);
  }
}

// Raison claire quand il n'y a rien a montrer
const why = !matches.length ? "matchs pas encore chargés (les analyses de ce jour ne sont pas encore publiées)"
  : !pool.length ? `analyses complètes pas encore prêtes (${matches.length} match(s) trouvé(s))` : null;
const manifest = {date: TODAY, matchesToday: matches.length, withAnalysis: pool.length, videos,
  simule: videos.filter((v) => v.composition === "DailyMatchSimule").length,
  pulse: videos.filter((v) => v.composition === "DailyMatchPulse").length,
  skipped: why ? [why] : [!safe && "safe (moins de 3 sélections sûres)", args.combine && !combo && "combiné (impossible d'atteindre la cote 10)"].filter(Boolean)};
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({date: TODAY, matches: matches.length, analysed: pool.length, videos: videos.map((v) => v.slug), skipped: manifest.skipped}, null, 2));
