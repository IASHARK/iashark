"use strict";
// Stats IASHARK pour la page match (profils equipe / arbitre / ligue calcules
// par scripts/stats-book/export_stats_book.py a partir du Book).
//
// CIRCUIT (30/09/2026) :
//  1. export_stats_book.py ecrit les profils bruts dans stats-book/ (manifeste.json,
//     ligue-<id>.json). Ces fichiers NE SONT PAS suivis par git (.gitignore) : le depot
//     GitHub est PUBLIC et ces profils contiennent le detail Pro. Source : registre_site du
//     Book (30/09/2026 : tous les matchs jusqu'a la veille, empreinte SHA-256), fenetre de
//     2 ans (equipes, ligues) et 3 ans (arbitres) jusqu'a hier.
//  2. scripts/stats-book/sceller.js les verifie (seuils, dates, archive seulement) et les
//     range dans UN fichier chiffre DATE, stats-book/scelles/<date du calcul>.json
//     (AES-256-GCM, cle STATS_BOOK_CLE). Un scelle n'est jamais reecrit : chaque nouveau
//     calcul ajoute un fichier, commite avec sa date. EN CLAIR dans chaque scelle (preuve
//     publique de non-modification, controle historique-public du 30/09/2026) :
//     l'empreinte des sources du Book, le SHA-256 du contenu en clair et le SHA-256 des
//     chiffres gratuits (chiffresGratuits, forme canonique). Ces champs font partie des
//     donnees authentifiees : les modifier rend le fichier illisible.
//  3. Le pipeline (update-data.yml) ouvre le scelle le plus recent avec le secret GitHub
//     STATS_BOOK_CLE, verifie le SHA-256 du contenu, et pose sur chaque match :
//       - stats_iashark_gratuit (public, match/<id>.json) : 2 chiffres seulement ;
//       - stats_iashark (champ premium « Pro seulement », comme la simulation) :
//         persiste dans match_premium_data.premium_fields, rendu par match-data
//         aux seuls abonnes Pro, jamais dans un fichier public.
//     Sans cle ou sans fichier : aucun champ, la page n'affiche rien.
//
// CHAMPIONNAT (controle avocat du diable du 30/09/2026) : un profil d'equipe ne compte
// que les matchs d'UN championnat. Match de championnat : profil de l'equipe dans CE
// championnat, sinon rien (un promu ne recoit jamais ses matchs de Ligue 2). Coupe
// d'Europe ou selections : son dernier championnat (ou ses matchs officiels de
// selection), et la page ecrit lequel.
//
// ANTI-FUITE : un profil n'est rendu que pour un match joue APRES la date de
// son dernier match (profil.fin, jour UTC). Un match deja joue avant le calcul
// (onglet « Hier ») ne recoit donc jamais un profil qui contient son propre
// resultat. Date du match sans fuseau (« 2026-10-01 01:30 », heure de Paris) :
// lue 2 heures plus tot (decalage maximal de Paris), jamais plus tard.
//
// GRATUIT / PRO (decision du 30/09/2026, a valider par Clement) :
//  - gratuit : « marque en premier » de chaque equipe et « au moins un but apres
//    la 75e » de la ligue, chacun avec son nombre de matchs, sa marge et sa periode ;
//  - Pro : tout le reste (buts par tranche de 15 minutes, a la pause, domicile /
//    exterieur, corners, cartons, arbitre, contexte de la ligue).

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const zlib = require("zlib");

const DOSSIER = path.join(__dirname, "..", "stats-book");
const DOSSIER_SCELLES = path.join(DOSSIER, "scelles");
const FORMAT = "iashark-stats-book-scelle";

// Cle stable d'un arbitre (MEME regle que export_stats_book.py#cle_arbitre) : initiale du
// prenom + nom, sans accent ni pays. « F. Letexier », « Francois Letexier, France » et
// « François Letexier » -> « f letexier » (l'API ecrit le meme arbitre de plusieurs facons).
// Comme Python (encode("ascii", "ignore")), tout caractere non ASCII restant apres la
// decomposition est SUPPRIME (ø, ł, ı, ß...) avant le decoupage en mots :
// « Jørgen Daugbjerg Burchardt » -> « j daugbjerg burchardt » des deux cotes.
function cleArbitre(nom) {
  if (typeof nom !== "string" || !nom.trim()) return null;
  const mots = nom.split(",")[0].normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase()
    .replace(/[^a-z]+/g, " ").trim().split(" ").filter(Boolean);
  if (!mots.length) return null;
  return mots.length === 1 ? mots[0] : mots[0][0] + " " + mots.slice(1).join(" ");
}

// Date du match -> jour UTC « AAAA-MM-JJ ».
//  - Date, ou texte ISO avec fuseau (« 2026-10-02T00:30:00+02:00 », « ...Z ») : jour UTC exact ;
//  - texte sans fuseau (« 2026-10-02 00:30 », heure de Paris du pipeline) : lu 2 h plus tot
//    (jamais un jour trop tard) ; jour seul (« 2026-10-02 ») : la veille.
function jourUtc(d) {
  if (d instanceof Date) return isNaN(d) ? null : d.toISOString().slice(0, 10);
  if (typeof d !== "string") return null;
  const s = d.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const x = new Date(s);
    return isNaN(x) ? null : x.toISOString().slice(0, 10);
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const heure = m[4] != null ? Number(m[4]) : 0, minute = m[5] != null ? Number(m[5]) : 0;
  const x = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), heure - 2, minute));
  return isNaN(x) ? null : x.toISOString().slice(0, 10);
}

function profilUtilisable(profil, dateMatch) {
  const j = jourUtc(dateMatch);
  return !!(profil && typeof profil.fin === "string" && j && j > profil.fin);
}

function chargerManifeste(dossier) {
  try { return JSON.parse(fs.readFileSync(path.join(dossier || DOSSIER, "manifeste.json"), "utf8")); }
  catch (e) { return null; }
}

function chargerLigue(leagueId, dossier) {
  try { return JSON.parse(fs.readFileSync(path.join(dossier || DOSSIER, "ligue-" + Number(leagueId) + ".json"), "utf8")); }
  catch (e) { return null; }
}

// Profil d'equipe reduit a ce qui sert CE match : tout + domicile (equipe qui recoit)
// ou tout + exterieur (equipe qui se deplace), avec son championnat.
function reduireEquipe(p, lieu) {
  if (!p) return null;
  const r = { nom: p.nom || null, championnat: p.championnat, championnat_nom: p.championnat_nom || null, tout: p.tout };
  if (p[lieu]) r[lieu] = p[lieu];
  return r;
}

const periodeDe = p => (p && p.debut && p.fin ? { debut: p.debut, fin: p.fin } : {});

// Rubriques du detail Pro presentes pour un match (pro : sortie Pro de statsPourMatch).
//  premier : premier but ENCAISSE et 0-0 (la vue gratuite ne montre que « a ouvert le
//  score », relecture du 30/09) ; quarts : buts par quart d'heure (tranches d'une equipe) ; pause : apres la pause ;
//  lieu : bascule domicile / exterieur (un profil du lieu avec quarts ou pause, en plus
//  du profil complet) ; arbitre ; ligue : profil de la ligue.
function rubriquesPro(pro) {
  const eq = [pro.dom, pro.ext].filter(Boolean);
  const utile = p => !!(p && (p.tranches || (p.pause && Object.keys(p.pause).length)));
  const out = [];
  const pb = p => p && p.tout && p.tout.premier_but;
  if (eq.some(p => pb(p) && (Array.isArray(pb(p).encaisse) || Array.isArray(pb(p).zero_zero)))) out.push("premier");
  if (eq.some(p => p.tout && p.tout.tranches)) out.push("quarts");
  if (eq.some(p => ["tout", "dom", "ext"].some(k => p[k] && p[k].pause && Object.keys(p[k].pause).length))) out.push("pause");
  if (eq.some(p => utile(p.tout)) && ((pro.dom && utile(pro.dom.dom)) || (pro.ext && utile(pro.ext.ext)))) out.push("lieu");
  if (pro.arbitre) out.push("arbitre");
  if (pro.ligue) out.push("ligue");
  return out;
}

// match : { date, league_id, home:{id}, away:{id}, arbitre }
// lire(leagueId) -> contenu d'un fichier ligue-<id>.json (ou null)
function statsPourMatch(match, manifeste, lire) {
  if (!match || !manifeste || typeof lire !== "function") return null;
  const cache = {};
  const fichier = id => (id in cache ? cache[id] : (cache[id] = lire(id)));
  const championnats = new Set((Array.isArray(manifeste.championnats) ? manifeste.championnats : []).map(String));
  const deChampionnat = match.league_id != null && championnats.has(String(match.league_id));
  const deSelections = match.league_id != null && Array.isArray(manifeste.selections) && manifeste.selections.map(String).includes(String(match.league_id));
  const equipe = team => {
    const id = team && team.id != null ? String(team.id) : null;
    if (!id) return null;
    // Match de championnat : le fichier de CE championnat, jamais un autre.
    const lg = deChampionnat ? match.league_id : (manifeste.index_equipes ? manifeste.index_equipes[id] : null);
    const f = lg != null ? fichier(lg) : null;
    const p = f && f.equipes ? f.equipes[id] : null;
    if (!p || !profilUtilisable(p.tout, match.date)) return null;
    // Profil sans championnat (ancien format) ou d'un autre championnat : rien.
    const comp = p.championnat;
    if (comp !== "selections" && !(Number.isInteger(comp) && comp > 0)) return null;
    if (deChampionnat && String(comp) !== String(match.league_id)) return null;
    // Match de selections : profil de selection seulement ; coupe de clubs : profil de club seulement.
    if (!deChampionnat && (comp === "selections") !== deSelections) return null;
    // Chaque sous-profil est controle a part (domicile / exterieur).
    const propre = { nom: p.nom, championnat: comp, championnat_nom: p.championnat_nom || null, tout: p.tout };
    for (const k of ["dom", "ext"]) if (p[k] && profilUtilisable(p[k], match.date)) propre[k] = p[k];
    return propre;
  };
  const ligueF = match.league_id != null ? fichier(match.league_id) : null;
  const ligue = ligueF && profilUtilisable(ligueF.ligue, match.date) ? ligueF.ligue : null;
  const cle = cleArbitre(match.arbitre);
  const lgArb = cle && manifeste.index_arbitres ? manifeste.index_arbitres[cle] : null;
  const fa = lgArb != null ? fichier(lgArb) : null;
  const arb = fa && fa.arbitres && profilUtilisable(fa.arbitres[cle], match.date) ? fa.arbitres[cle] : null;
  const dom = equipe(match.home), ext = equipe(match.away);
  if (!dom && !ext && !ligue && !arb) return null;
  const meta = { version: manifeste.version, calcule_le: manifeste.calcule_le,
    periode_fin: manifeste.periode && manifeste.periode.fin, seuils: manifeste.seuils || null };
  const pro = Object.assign({}, meta, { tranches: manifeste.tranches,
    dom: reduireEquipe(dom, "dom"), ext: reduireEquipe(ext, "ext"), ligue, arbitre: arb });
  const pb = p => (p && p.tout && p.tout.premier_but && Array.isArray(p.tout.premier_but.marque)
    ? Object.assign({ n: p.tout.premier_but.n, marque: p.tout.premier_but.marque }, periodeDe(p.tout),
      { championnat: p.championnat, championnat_nom: p.championnat_nom || null }) : null);
  const gratuit = Object.assign({}, meta, {
    premier_but_dom: pb(dom), premier_but_ext: pb(ext),
    ligue_apres_75: ligue && Array.isArray(ligue.apres_75) && ligue.tranches
      ? Object.assign({ n: ligue.tranches.n, taux: ligue.apres_75 }, periodeDe(ligue)) : null,
    // Noms des rubriques du detail Pro de CE match (aucun chiffre) : la vue gratuite
    // n'annonce que ce qu'un Pro verra vraiment (relecture du 30/09 : pas d'« arbitre »
    // promis quand il n'y en a pas). Memes conditions que match-page.js#sbkDetail.
    detail_pro: rubriquesPro(pro),
  });
  if (!gratuit.premier_but_dom && !gratuit.premier_but_ext && !gratuit.ligue_apres_75 && !pro.dom && !pro.ext && !ligue && !arb) return null;
  return { gratuit, pro };
}

// ------------------------------------------------------------------ fichier scelle
// Cle : 32 octets en base64 (secret GitHub STATS_BOOK_CLE ; en local, variable
// d'environnement ou fichier ~/.iashark/stats-book.cle cree par sceller.js).
function lireCle(texte) {
  if (typeof texte !== "string" || !texte.trim()) return null;
  try {
    const k = Buffer.from(texte.trim(), "base64");
    return k.length === 32 ? k : null;
  } catch (e) { return null; }
}

const sha256 = x => crypto.createHash("sha256").update(x).digest("hex");
// JSON canonique : cles triees a tous les niveaux (meme texte, meme empreinte, partout).
function jsonCanonique(v) {
  if (Array.isArray(v)) return "[" + v.map(jsonCanonique).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + jsonCanonique(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
const triNum = (a, b) => Number(a) - Number(b) || (a < b ? -1 : a > b ? 1 : 0);
// Les chiffres GRATUITS du contenu (ceux que tout visiteur voit sur les pages match) :
// « a ouvert le score » de chaque profil d'equipe et « au moins un but apres la 75e » de
// chaque ligue, avec leur nombre de matchs et leur periode. Forme canonique documentee :
// { equipes: { "<ligue>:<equipe>": {n, marque, debut, fin, championnat} }, ligues: { "<ligue>": {n, taux, debut, fin} } }.
function chiffresGratuits(contenu) {
  const out = { equipes: {}, ligues: {} };
  const ligues = (contenu && contenu.ligues) || {};
  for (const id of Object.keys(ligues).sort(triNum)) {
    const c = ligues[id] || {};
    for (const tid of Object.keys(c.equipes || {}).sort(triNum)) {
      const p = c.equipes[tid], t = p && p.tout, pb = t && t.premier_but;
      if (pb && Array.isArray(pb.marque)) out.equipes[id + ":" + tid] = { n: pb.n, marque: pb.marque, debut: t.debut, fin: t.fin, championnat: p.championnat };
    }
    const l = c.ligue;
    if (l && Array.isArray(l.apres_75) && l.tranches) out.ligues[id] = { n: l.tranches.n, taux: l.apres_75, debut: l.debut, fin: l.fin };
  }
  return out;
}
// Partie EN CLAIR d'un scelle (tout sauf iv, tag, donnees). Authentifiee avec les donnees.
const CHAMPS_CLAIRS = ["format", "v", "alg", "calcule_le", "periode_fin", "recent_inclus", "empreinte_sources",
  "sha256_clair", "sha256_gratuit", "gratuit_compte"];
const aadDe = entete => Buffer.from("iashark-stats-book-v2|" + jsonCanonique(entete), "utf8");
function enteteDe(scelle) {
  const e = {};
  for (const k of CHAMPS_CLAIRS) e[k] = scelle[k] === undefined ? null : scelle[k];
  return e;
}

// contenu : { manifeste, ligues: { "<id>": ligue-<id>.json } }
function sceller(contenu, cleTexte) {
  const cle = lireCle(cleTexte);
  if (!cle) throw new Error("cle STATS_BOOK_CLE absente ou invalide (32 octets en base64)");
  const m = contenu.manifeste || {};
  const clair = Buffer.from(JSON.stringify(contenu), "utf8");
  const gratuit = chiffresGratuits(contenu);
  // En clair : de quoi dater le fichier et prouver qu'il n'a pas change (aucun chiffre de stats).
  const entete = enteteDe({ format: FORMAT, v: 2, alg: "aes-256-gcm+gzip", calcule_le: m.calcule_le || null,
    periode_fin: (m.periode && m.periode.fin) || null, recent_inclus: !!(m.periode && m.periode.recent_inclus),
    empreinte_sources: m.empreinte_sources || null, sha256_clair: sha256(clair), sha256_gratuit: sha256(jsonCanonique(gratuit)),
    gratuit_compte: { equipes: Object.keys(gratuit.equipes).length, ligues: Object.keys(gratuit.ligues).length } });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", cle, iv);
  c.setAAD(aadDe(entete));
  const chiffre = Buffer.concat([c.update(zlib.gzipSync(clair, { level: 9 })), c.final()]);
  return Object.assign(entete, { iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), donnees: chiffre.toString("base64") });
}

// Contenu du scelle, ou null : mauvaise cle, partie chiffree OU partie en clair modifiee,
// SHA-256 du contenu different de celui annonce en clair.
function ouvrirScelle(scelle, cleTexte) {
  const cle = lireCle(cleTexte);
  if (!cle || !scelle || scelle.format !== FORMAT || scelle.v !== 2) return null;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", cle, Buffer.from(scelle.iv, "base64"));
    d.setAAD(aadDe(enteteDe(scelle)));
    d.setAuthTag(Buffer.from(scelle.tag, "base64"));
    const clair = zlib.gunzipSync(Buffer.concat([d.update(Buffer.from(scelle.donnees, "base64")), d.final()]));
    if (sha256(clair) !== scelle.sha256_clair) return null;
    const c = JSON.parse(clair.toString("utf8"));
    if (!c || !c.manifeste || !c.ligues) return null;
    if (sha256(jsonCanonique(chiffresGratuits(c))) !== scelle.sha256_gratuit) return null;
    return c;
  } catch (e) { return null; }
}

// Nom du scelle d'un calcul : « 2026-09-30T02-00-00Z.json » (tri par nom = tri par date).
function nomScelle(calculeLe) {
  const s = String(calculeLe || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s)) return null;
  return s.replace(/:/g, "-") + ".json";
}
function dernierScelle(dossier) {
  try {
    const f = fs.readdirSync(dossier || DOSSIER_SCELLES).filter(x => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/.test(x)).sort();
    return f.length ? path.join(dossier || DOSSIER_SCELLES, f[f.length - 1]) : null;
  } catch (e) { return null; }
}

// Pipeline : { manifeste, lire } ou null (aucun scelle, cle absente ou fausse, fichier modifie).
// Par defaut, le scelle le plus recent. Ne journalise jamais un chiffre (journaux publics).
function chargerPourPipeline(cleTexte, chemin) {
  const f = chemin || dernierScelle();
  if (!f) return null;
  let scelle = null;
  try { scelle = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; }
  const c = ouvrirScelle(scelle, cleTexte);
  if (!c) return null;
  return { manifeste: c.manifeste, lire: id => c.ligues[String(Number(id))] || null };
}

module.exports = { cleArbitre, jourUtc, profilUtilisable, chargerManifeste, chargerLigue, statsPourMatch,
  lireCle, sceller, ouvrirScelle, chargerPourPipeline, chiffresGratuits, jsonCanonique, nomScelle, dernierScelle,
  CHAMPS_CLAIRS, DOSSIER, DOSSIER_SCELLES };
